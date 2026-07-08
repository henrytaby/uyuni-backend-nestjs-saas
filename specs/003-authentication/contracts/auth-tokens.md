# API Contract: Auth Tokens (Refresh, Logout, Reuse Detection)

**Module**: Authentication
**Base Path**: `/auth`
**Auth**: Refresh is public (uses the refresh token cookie/body); logout
requires a valid access token.
**Plan Gate**: N/A

---

## POST /auth/refresh

Exchange a valid refresh token for a new access + refresh token pair
(rotation). The old refresh token is invalidated (`is_revoked=true`).
If the submitted token was already revoked, this is reuse detection —
the entire `session_id` family is revoked and 401 is returned.

**Authentication**: None (validated by the refresh token itself).

**Request**: Refresh token is read from the `refresh_token` httpOnly cookie
if present; otherwise from the request body for non-browser clients.

**Request Body** (fallback to cookie):
```json
{ "refreshToken": "opaque-random-string" }
```

**Response** (200 OK):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "new-opaque-random-string"
}
```
A new `refresh_token` httpOnly cookie is also set (rotating the cookie).

**Errors**:
- 401: Refresh token not provided, not found in DB, or expired. Generic
  "Invalid refresh token" message.
- 401 (reuse detected): The submitted token's `is_revoked` was true. The
  server ALSO revokes all refresh tokens sharing the `session_id`, logs a
  security event ("token reuse detected for session <id>"), and returns
  401. The legitimate user must log in again. The response does NOT reveal
  that reuse was specifically detected (same generic "Invalid refresh
  token" message) — but the security log records it for operators.

**Side Effects**:
- Old `RefreshToken` row: `is_revoked=true`, `replaced_by_id` → new row.
- New `RefreshToken` row created: same `session_id`, new id,
  `expires_at = now + JWT_REFRESH_EXPIRES_IN`.
- New access token issued: same `sub`, same `session_id`, new `jti`,
  same `tenant_id` (refresh preserves the active tenant context).

---

## POST /auth/logout

Invalidate the caller's entire session: revoke all refresh tokens sharing
the `session_id` from the access token, and add the current access token's
`jti` to a short-lived blocklist (rows auto-prune at the access token's
`exp`).

**Authentication**: Valid access token (Bearer).

**Request Body**: None (the `session_id` is read from the verified access
token's payload).

**Response** (200 OK):
```json
{
  "message": "Logged out successfully",
  "sessionId": "uuid"
}
```
The response also clears the `refresh_token` cookie
(`Set-Cookie: refresh_token=; Max-Age=0; HttpOnly; Secure; SameSite=Strict`).

**Side Effects**:
- All `RefreshToken` rows with `session_id` (from the access token) →
  `is_revoked=true`.
- New `RevokedAccessToken` row: `jti` (from access token), `expires_at`
  (= access token's `exp`, for auto-pruning).
- Subsequent requests with the same access token return 401 (jti blocklist
  check in `JwtStrategy.validate` before populating context).
- Subsequent refresh attempts for that `session_id` return 401 (all tokens
  revoked).

**Errors**:
- 401: No/invalid access token.

---

## Internal: Access Token Verification with Blocklist (JwtStrategy)

Every protected request runs through the `JwtAuthGuard` → `JwtStrategy`.
The strategy's `validate()` performs:

1. Verify the JWT signature and expiry (handled by `passport-jwt`).
2. Check the `jti` against the `RevokedAccessToken` blocklist. If a row
   exists for this `jti`, return 401 (the token was logged out).
3. If valid, return `{ id, email, tenantId, isPlatformAdmin, sessionId, jti }`
   — which populates the `TenantContext` (spec 002) and enables isolation,
   RBAC (spec 004), and audit (spec 005).

The blocklist auto-prunes: rows with `expires_at < now()` are deleted on
read (or by a periodic ticker). Since access tokens live ≤15 min, the
blocklist is bounded.
