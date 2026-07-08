# Data Model: Authentication

**Feature**: 003-authentication
**Date**: 2026-07-08

## Overview

Auth introduces two new entities — `RefreshToken` and `LoginAttempt` —
that are **user-scoped and global** (no `tenant_id`, no RLS). A user's
auth state is independent of which tenant they operate in. The existing
`User` entity from spec 002 stores the bcrypt `password_hash`.

This feature also defines the **JWT payload shape** and the **session
lifecycle state machine** that drives refresh rotation and reuse detection.

## Entities

### RefreshToken

Server-side record of an issued refresh token. User-scoped (no tenant_id).
Opaque random string stored hashed (never plaintext). Linked to a
`session_id` (family) so reuse detection can revoke the whole family.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Token record identifier |
| user_id | UUID | FK → User, NOT NULL | Owner user (global) |
| session_id | UUID | NOT NULL | Family id (shared across all rotations of one login) |
| token_hash | String | NOT NULL, unique | Hash of the opaque refresh token |
| is_revoked | Boolean | NOT NULL, default false | One-way: true once rotated or revoked |
| replaced_by_id | UUID | FK → RefreshToken, nullable | The token that replaced this one (forward link; null until rotated) |
| expires_at | DateTime | NOT NULL | Token expiry (default +7 days from issue) |
| created_at | DateTime | NOT NULL, auto | Issue timestamp |
| created_by_id | UUID | FK → User, nullable | Auto-injected audit column (bridge; full extension in spec 005) |

**Indexes**: `@unique([token_hash])`, `(user_id)`, `(session_id)`,
`(expires_at)` (for pruning).

**Validation Rules**:
- `token_hash`: 64+ char hex (sha256 of the 32-byte random token)
- `expires_at`: future timestamp at creation

**State / Invariants**:
- `is_revoked` is monotone: once true, never set back to false.
- At most one `is_revoked=false` row per `session_id` at any time (the
  current valid refresh token for that family). Enforced by the service,
  optionally by a partial unique index
  `CREATE UNIQUE INDEX ... WHERE is_revoked = false` on `(session_id)`.
- `replaced_by_id` is null until rotated; after rotation points to the
  new token's id.

---

### LoginAttempt

Tracks consecutive failed login attempts per user for lockout.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Row identifier |
| user_id | UUID | FK → User, NOT NULL | The user being attempted (email resolved to user; if email not found, no row — locked error returned generically) |
| attempt_count | Int | NOT NULL, default 0 | Consecutive failures since last success |
| locked_until | DateTime | nullable | Timestamp until which login is blocked |
| last_attempt_at | DateTime | NOT NULL, auto, updatedAt | Most recent attempt time |
| created_at | DateTime | NOT NULL, auto | Row creation |
| updated_at | DateTime | NOT NULL, auto | Last update |

**Indexes**: `(user_id)` unique (one row per user), `(locked_until)` (for
finding currently-locked accounts).

**Validation Rules**:
- `attempt_count`: 0-999
- `locked_until`: null or a future timestamp

**State Transitions**:
```text
[Failed attempt] ──incr count──▶ [count < 5: stay active]
                  ── incr ──▶  [count = 5: locked_until = now + 15m]
[Successful login] ───────▶ [count = 0, locked_until = null]
[Locked + now < locked_until] ─▶ reject login (still locked)
[Locked + now > locked_until] ─▶ allow attempt; reset count to 0 on success, incr on fail
```

---

## JWT Access Token Payload Shape

The access token is a JWT signed with `JWT_SECRET`. Its payload is
verified statelessly by the `JwtStrategy`; the strategy's `validate()`
populates the `TenantContext` from spec 002.

```typescript
interface JwtPayload {
  sub: string;            // user_id (UUID)
  email: string;          // user email (for audit/display)
  tenant_id: string;      // active tenant_id (UUID) — feeds isolation
  is_platform_admin: boolean;  // bypass flag — feeds RBAC (spec 004)
  session_id: string;     // refresh-token family id (for logout/reuse)
  jti: string;            // unique token id (for access-token blocklist)
  iat: number;            // issued-at (JWT standard)
  exp: number;            // expiry (JWT standard); default +15m
}
```

**Configuration** (env vars, defined in spec 001's config):
- `JWT_SECRET`: signing secret (already a placeholder env var)
- `JWT_EXPIRES_IN`: access token TTL, default `"15m"`
- `JWT_REFRESH_EXPIRES_IN`: refresh token TTL, default `"7d"`
- `LOCKOUT_MAX_ATTEMPTS`: default 5
- `LOCKOUT_DURATION_MIN`: default 15

---

## Refresh Token Rotation & Session Lifecycle

```text
[Login success]
   │
   ▼
Create RefreshToken: session_id=uuid, is_revoked=false, expires_at=+7d
   │
   ▼
[Refresh request with refresh token T1]
   │
   ├─ T1.is_revoked = false? ──no──▶ REUSE DETECTED:
   │                                 revoke ALL session_id rows,
   │                                 log security event, return 401
   │
   ├─ yes
   │     │
   │     ▼
   │  Create RefreshToken T2 (same session_id, is_revoked=false, +7d)
   │  Mark T1: is_revoked=true, replaced_by_id=T2.id
   │  Issue new access token (new jti, same session_id, new tenant_id if switched)
   │     │
   │     ▼
   │  Return { access: <new>, refresh: T2 }
   │
[Logout]
   │
   ▼
Revoke ALL session_id rows (is_revoked=true)
Add access token jti to blocklist (auto-prune at exp)
   │
   ▼
[Next refresh with any session_id token] ─▶ is_revoked=true ─▶ 401 (must login again)
```

**Reuse detection rationale**: An attacker who stole T1 tries to refresh
AFTER the legitimate user already rotated T1→T2. The attacker presents T1,
which now has `is_revoked=true`. The system detects this as reuse — the
token was supposed to be dead — and revokes the entire family (`session_id`),
forcing the attacker AND the legitimate user to re-login. This is the
canonical RFH defense documented in research.md.

---

## Entity Relationships

```text
User (from spec 002) 1──N RefreshToken    (a user has many refresh tokens)
User 1──1 LoginAttempt                    (one attempt-counter row per user)
RefreshToken 1──? RefreshToken (replaced_by_id)  (rotation chain forward link)
```

`User` carries `password_hash` (bcrypt) + `is_platform_admin` +
`is_active` (soft-delete) from spec 002 — no schema changes to User
required; auth only reads from it.

---

## Anti-Information-Leakage Rules (Not Entities — Cross-Cutting)

These are behavioral guarantees encoded in the AuthModule, documented here
because they constrain the token/attempts logic:

| Scenario | Response | Rationale |
|----------|----------|-----------|
| Email not found | Generic "Invalid email or password" (+bcrypt dummy hash to equalize timing) | User enumeration prevention (FR-010) |
| Wrong password | Same generic message | Indistinguishable from email-not-found |
| Soft-deleted user | Same generic message | No "this account was deleted" leak |
| Account locked | Generic message + `Retry-After` header | Lets the legit user retry, attacker learns nothing new |
| Successful login | 200 + tokens + tenants | On success only |
