# Quickstart: Authentication

**Feature**: 003-authentication
**Date**: 2026-07-08

## Prerequisites

- Specs 001 (foundation) and 002 (multi-tenancy core) complete:
  - Server runs, Prisma connected, Swagger at `/api/docs`.
  - `User`, `Tenant`, `TenantUser`, `Plan` tables exist (migrated).
  - `TenantContext` (AsyncLocalStorage) + Prisma tenant-scoped extension
    + TenantGuard + RLS are in place.
- A seeded User with a known email + bcrypt password hash.
- A seeded Tenant + active TenantUser membership for that User (role ADMIN).
- Environment configured: `JWT_SECRET`, `JWT_EXPIRES_IN` (15m),
  `JWT_REFRESH_EXPIRES_IN` (7d), `LOCKOUT_MAX_ATTEMPTS` (5),
  `LOCKOUT_DURATION_MIN` (15).

## Setup

1. **Apply the auth migration** (adds RefreshToken, LoginAttempt tables):
   ```bash
   npx prisma migrate dev --name auth_core
   ```

2. **Start the server**: `npm run start:dev`

3. **Confirm the auth endpoints appear in Swagger**:
   `http://localhost:3000/api/docs` — look for `/auth/login`,
   `/auth/refresh`, `/auth/logout`, `/auth/tenant-context`.

## Validation Scenarios

### Scenario 1: Email Login with JWT Tokens (US1)

Validate login returns tokens + the user's accessible tenants.

1. **Log in** with valid credentials:
   ```bash
   curl -i -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{ "email": "jane@example.com", "password": "correct-password" }'
   ```
   **Expected**: `200 OK` with JSON body containing:
   - `accessToken` (a JWT; decode it and verify `sub`, `email`,
     `tenant_id`, `session_id`, `jti`, `exp` ≈ +15m).
   - `refreshToken` (opaque string).
   - `user` object (no password hash).
   - `tenants` array including the seeded tenant with the user's role.
   - `activeTenantId`.
   - A `Set-Cookie: refresh_token=<opaque>; HttpOnly; Secure;
     SameSite=Strict; Path=/auth` header.

2. **Use the access token** on a protected tenancy endpoint:
   ```bash
   curl http://localhost:3000/tenancy/tenant-users \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   ```
   **Expected**: `200 OK` — the token's `tenant_id` populated the
   `TenantContext` and the TenantGuard passed.

3. **Use an expired access token** (wait 15 min or craft one):
   - Expected: `401 Unauthorized` from the JwtStrategy (expiry check).

4. **No info leakage on bad credentials**: Submit wrong password AND a
   non-existent email. Compare: identical `401` responses with the same
   `"Invalid email or password"` message and similar response times
   (dummy bcrypt hash equalizes timing).

### Scenario 2: Refresh Token Rotation & Logout (US2)

Validate rotation, reuse detection, and logout revocation.

1. **Log in** (get `refreshToken1` + `accessToken1`).

2. **Refresh** (rotate):
   ```bash
   curl -i -X POST http://localhost:3000/auth/refresh \
     -H "Cookie: refresh_token=$REFRESH_TOKEN_1"
   ```
   **Expected**: `200 OK` with new `accessToken2` + `refreshToken2`. A
   new `refresh_token` cookie is set. The old `refreshToken1` row in DB
   now has `is_revoked=true` and `replaced_by_id` → new row's id.

3. **Reuse the old refresh token** (RFH simulation):
   ```bash
   curl -i -X POST http://localhost:3000/auth/refresh \
     -H "Cookie: refresh_token=$REFRESH_TOKEN_1"
   ```
   **Expected**: `401 Unauthorized` (reuse detected). In the DB / logs,
   ALL `RefreshToken` rows with the same `session_id` are now
   `is_revoked=true`, and a security event "token reuse detected" is
   logged (in structured JSON via pino). Subsequent refresh attempts
   with `refreshToken2` also fail (whole family revoked).

4. **Re-login** and **logout**:
   ```bash
   curl -X POST http://localhost:3000/auth/logout \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   ```
   **Expected**: `200 OK` with `"message": "Logged out successfully"`.
   - All RefreshToken rows for the `session_id` are `is_revoked=true`.
   - A `RevokedAccessToken` row exists for the current access token's jti.
   - Subsequent requests with that access token return `401` (jti
     blocklist check in the JwtStrategy).
   - The `refresh_token` cookie is cleared (`Set-Cookie: refresh_token=;
     Max-Age=0`).

### Scenario 3: Account Lockout & Tenant Context Switch (US3)

Validate lockout after 5 failures and multi-tenant context switching.

1. **Trigger lockout**: Submit wrong passwords 5 times for a known user:
   ```bash
   for i in $(seq 1 5); do
     curl -i -X POST http://localhost:3000/auth/login \
       -d '{ "email": "jane@example.com", "password": "wrong" }'
   done
   ```
   **Expected**: First 4 → `401` generic. 5th → `423 Locked` with a
   `Retry-After` header (≈ 900 seconds = 15 min). Verify in DB:
   `LoginAttempt.locked_until` is set.

2. **Locked account rejects valid credentials**:
   ```bash
   curl -i -X POST http://localhost:3000/auth/login \
     -d '{ "email": "jane@example.com", "password": "correct-password" }'
   ```
   **Expected**: `423 Locked` (still locked). Lock duration hasn't passed.

3. **Unlock** (set `locked_until` to the past via DB or wait):
   - Login with correct password → `200 OK`. `LoginAttempt.attempt_count`
     reset to 0.

4. **Tenant context switch** (user belongs to multiple tenants): Seed a
   second tenant + membership for the user. Then:
   ```bash
   curl -i -X PUT http://localhost:3000/auth/tenant-context \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -d '{ "tenantId": "'"$SECOND_TENANT_ID"'" }'
   ```
   **Expected**: `200 OK` with a new `accessToken` whose decoded payload
   has the new `tenant_id` (and same `sub`, same `session_id`, new `jti`).
   - Old access token's jti is blocklisted — verify it now returns `401`.
   - The `refresh_token` cookie is UNCHANGED (refresh is user-scoped).
   - Use the new access token to call `/tenancy/tenant-users`: only the
     SECOND tenant's memberships are returned (context switched).

5. **Switch to a tenant without membership** (non-platform-admin user):
   ```bash
   curl -X PUT http://localhost:3000/auth/tenant-context \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -d '{ "tenantId": "'"$UNRELATED_TENANT"'" }'
   ```
   **Expected**: `403` — user is not a member of that tenant.

6. **Platform admin bypass**: As a platform-admin user, switch to any
   tenant (even without membership).
   **Expected**: `200 OK` (the membership check is bypassed). The audit
   trail log records the bypass (structured pino log; full audit-entry
   in spec 005).

## Edge Case Verification

- **Concurrent refresh from two devices with the same refreshToken1**:
  First refresh succeeds (rotates to token2). Second refresh with the
  same token1 → reuse detection → whole `session_id` family revoked →
  both devices must re-login.

- **Refresh token expired**: Set a refresh token whose `expires_at` is in
  the past; attempt refresh → `401` "Invalid refresh token."

- **Logout when no access token** → `401`.

- **Tenant switch with malformed UUID** → `400 Bad Request`.

- **Login with a soft-deleted user** (`User.is_active=false`) → `401`
  generic "Invalid email or password" (no "this account is disabled" leak).
  Verify no `LoginAttempt` increment issues — actually still increments to
  allow lockout of brute-forced deleted accounts? No: for not-found /
  disabled, do NOT increment (to avoid allowing DoS by locking out
  emails that don't exist). The dummy response equalizes timing; only
  real, active users' failed attempts count toward lockout.

## Constitution Compliance Verification

- **Principle I (Isolation)**: The access token's `tenant_id` feeds the
  `TenantContext`; verified in Scenario 1 step 2 (protected call uses
  the token's tenant context).
- **Principle IV (Audit)**: Token reuse, lockout, and bypass events are
  emitted as structured JSON logs (faststart); full CDC entries for
  RefreshToken/LoginAttempt state changes arrive via the spec 005
  extension. The monotone `is_revoked` flag is a one-way state change
  preserved by the audit layer.
- **V (API-First)**: All four auth contracts auto-documented at
  `/api/docs` (verified in Setup step 3).
- **DevSecOps (lockout)**: 5-attempt lockout verified in Scenario 3.
- **No info leakage**: Static generic message verified in Scenario 1
  step 4; lockout status code 423 is the only distinguishing signal
  (header `Retry-After`), acceptable per the contract.
