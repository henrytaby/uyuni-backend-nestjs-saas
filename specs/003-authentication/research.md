# Research: Authentication

**Feature**: 003-authentication
**Date**: 2026-07-08

## Research Tasks

### 1. JWT Access + Refresh Token Architecture

**Decision**: Dual-token model. Access token: JWT, short-lived (15 min),
stateless, signed with `JWT_SECRET`. Carries `sub` (user_id), `email`,
`tenant_id` (active tenant), `is_platform_admin`, `session_id` (family
id), `jti` (token id), `iat`, `exp`. Refresh token: opaque random string
(not a JWT), stored hashed in DB, longer-lived (7 days), passed via httpOnly
cookie + response body. Rotation: each refresh issues a new pair and
invalidates the old refresh token (sets `is_revoked=true`).

**Rationale**: The constitution mandates `@nestjs/jwt` + `passport-jwt` +
"Refresh Tokens" with "Rotación y Blacklist." Stateless access tokens
minimize DB lookups on every request (Passport verifies the signature
offline). Refresh tokens as opaque strings (not JWTs) allow server-side
revocation without a shared secret — you can't revoke a stateless JWT
without a blocklist, which defeats the perf benefit. The `session_id`
groups a login "family" so reuse detection can invalidate the whole family.

**Alternatives considered**:
- *Single long-lived JWT only*: Rejected — no revocation; logout is
  impossible; constitution requires refresh rotation.
- *Refresh token as JWT*: Rejected — can't revoke without a stateful
  blocklist, which largely defeats the purpose; state allows reuse detection
  (RFH attack mitigation).
- *Sessions in Redis*: Rejected for now — adds an infra dependency;
  Postgres token table suffices at this scale. Can migrate later.

### 2. Refresh Token Rotation & Reuse Detection (RFH Attack Mitigation)

**Decision**: On refresh, the old refresh token's DB row is checked: if
`is_revoked=false`, mark it `is_revoked=true` + `replaced_by_id` (the new
token), and issue a new pair. If the submitted token has `is_revoked=true`,
this is a reuse — invalidate (`is_revoked=true`) ALL refresh tokens sharing
the same `session_id` (the family), log a security event ("token reuse
detected"), and return 401. The legitimate user on the other device must
re-login (re-issued family).

**Rationale**: This is the canonical RFH (Refresh Token Flooding/Hyjacking)
defense recommended by OAuth2 BCP and IETF drafts. The `replaced_by_id`
chain provides an audit trail. The spec explicitly requires "reuse detection
invalidates the entire token family." By linking tokens via `session_id`,
we can nuke a compromised family surgically rather than all the user's
sessions.

**Alternatives considered**:
- *Invalidate only the reused token*: Rejected — the attacker may hold the
  newer replacement; only family-wide revocation closes the hole.
- *Block by token rotation count*: Fragile; easier to reason about a
  one-way `is_revoked` flag + family id.

### 3. Account Lockout Strategy

**Decision**: Track failed attempts in a `LoginAttempt` table keyed by
`user_id`. On each failed attempt, increment `attempt_count` and set
`locked_until` when count reaches 5 (lockout 15 min, configurable). On
successful login, reset `attempt_count=0` and `locked_until=null`. On a
locked account, login returns 423 (Locked) with a retry-after hint — NOT
the same error as invalid credentials (so the legitimate user knows, but
an attacker probing doesn't get a distinct "user exists" signal vs invalid
password). Actually, to avoid info leakage: return the generic
"Invalid credentials or account locked" message and only the `Retry-After`
header distinguishes a lock from a wrong password, which is acceptable.

**Rationale**: Constitution requires "account lockout after 5 failed"
(Security section) and lockout is in the spec FR. storing attempts per
user (not per IP — that would block shared-NAT legit users) targets the
attacked account. The 15-min window balances brute-force prevention and
user friction (configurable).

**Alternatives considered**:
- *Lock by IP*: Rejected — false-positives behind corporate NAT.
- *CAPTCHA after N attempts*: Out of scope — can add later; lockout first.
- *Exponential backoff vs hard lock*: Rejected — hard lockout + 15 min is
  simpler and matches the spec's explicit threshold.

### 4. Password Hashing & Validation Security (No Info Leakage)

**Decision**: bcrypt with cost factor 12 (configurable). On login, lookup
by email; if user not found OR password invalid OR account soft-deleted,
return the SAME generic message: "Invalid email or password." Do not
distinguish "user not found" from "wrong password" from "account disabled."
This prevents user-enumeration attacks.

**Rationale**: Constitution Principle IV (and general auth hardening)
requires no email-existence leakage. The spec FR-010 mandates "the same
generic error message" for invalid email and invalid password. Using
constant-time-ish behavior (bcrypt always runs even on a fake user via a
dummy hash) closes the timing side-channel.

**Alternatives considered**:
- *Distinct error per failure*: Rejected — enumerates valid emails.
- *Argon2id instead of bcrypt*: Stronger, but the constitution names bcrypt
  explicitly. Argon2 can be a future migration.

### 5. Tenant Context Switch (PUT /auth/tenant-context)

**Decision**: An authenticated user (`Authorization: Bearer <access>`)
sends `PUT /auth/tenant-context { tenantId }`. The service verifies a
TenantUser membership exists for `(user_id, tenantId)` and is active.
On success, it issues a NEW access token with the new `tenant_id` (same
`sub`, new `jti`, same `session_id`) — the user does NOT re-login. The
refresh token is unaffected (it's user-scoped, not tenant-scoped). The
response returns the new access token + the new tenant's role/context.

**Rationale**: Constitution requires "switch between Tenants without
re-login" (`PUT /auth/tenant-context`). Re-issuing only the access token
(minimal change) keeps it simple and revokes the previous short-lived access
token naturally via expiry. Refresh token stays valid (it carries no
tenant_id — only user identity), so the new tenant context persists across
refreshes (the refresh flow re-reads the user's memberships and the
last-active tenant, or defaults).

**Alternatives considered**:
- *Stash active tenant in DB, re-read on every request*: Extra DB hit per
  request — the JWT already carries it.
- *Re-login required*: Explicitly rejected by the spec.
- *Refresh token carries tenant_id*: Rejected — rotating only the access
  token is cleaner; refresh is tenant-agnostic (`session_id` only).

### 6. Logout Strategy

**Decision**: `POST /auth/logout` (no body) revokes the caller's session:
marks all refresh tokens with the caller's `session_id` as `is_revoked`,
and adds the current access token's `jti` to a short-lived blocklist (in
memory or a `RevokedAccessToken` table with rows expiring at the access
token's own `exp`). The access token blocklist is small (only active
tokens ≤15 min) — rows auto-prune.

**Rationale**: Access tokens are stateless, so truly "revoking" one
requires a blocklist. But because they're short-lived (15 min), the
blocklist is bounded and rows expire quickly (auto-prune on read or a
ticker). Refresh tokens are server-side stateful, so revoking the family
is immediate. This balances the statelessness of JWTs with the spec's
"on logout, invalidate all tokens for the session."

**Alternatives considered**:
- *Don't blacklist access tokens (wait for expiry)*: Rejected — spec says
  logout invalidates tokens; 15 min exposure is too long.
- *Redis blocklist with TTL*: Cleaner at scale, acceptable — can migrate;
  Postgres with auto-pruning is fine at this scale.

### 7. JWT Strategy & Context Population

**Decision**: `JwtStrategy.validate(payload)` returns a
`{ id, email, tenantId, isPlatformAdmin, sessionId, jti }` object. A
global guard-interceptor pair uses this to populate the `TenantContext`
(from spec 002's AsyncLocalStorage): tenantId, userId, isPlatformAdmin,
requestId (from spec 001). Downstream guards (TenantGuard from spec 002,
RBAC from spec 004) consume the context — auth is the entry point that
makes the whole pipeline cohesive.

**Rationale**: Constitution Principle I isolation depends on the context
being populated. Auth (this spec) is where verified identity enters; the
JWT payload is the verified source of `tenant_id` + `user_id`. Wiring the
strategy to populate the context integrates auth with isolation.

**Alternatives considered**:
- *Let TenancyModule parse the JWT*: Rejected — separation of concerns;
  auth owns token verification, tenancy owns the context contract.

### 8. Token Rotation State Machine & Session Lifecycle

**Decision**: A session is born at login: create a RefreshToken row with
`session_id=uuid4`, `is_revoked=false`. Every refresh creates a new row
with the same `session_id` and a new `id`, marking the previous
`is_revoked=true` + `replaced_by_id=new.id`. Logout revokes all rows
with that `session_id`. Reuse detection revokes the whole family
(`session_id` match).

**Rationale**: The `session_id` is the family key; the `replaced_by_id`
chain is the audit trail of the rotation chain. This models the OAuth2
refresh-token-rotation state machine cleanly in SQL.

**Alternatives considered**:
- *No session_id, revoke by user*: Rejected — would kill all the user's
  devices on any reuse; too aggressive.
- *Tree of `parent_id`*: Equivalent but `replaced_by_id` (forward link)
  is simpler for "find the chain head."
