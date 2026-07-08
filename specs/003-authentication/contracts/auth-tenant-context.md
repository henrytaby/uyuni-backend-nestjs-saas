# API Contract: Auth Tenant Context Switch

**Module**: Authentication
**Base Path**: `/auth`
**Auth**: Valid access token (Bearer) required.
**Plan Gate**: N/A

---

## PUT /auth/tenant-context

Switch the authenticated user's active tenant context WITHOUT re-login.
The service verifies a `TenantUser` membership exists and is active for
`(user_id from token, tenantId from body)`. On success, issues a NEW
access token carrying the new `tenant_id` (same `sub`, same `session_id`,
new `jti`). The refresh token is unaffected (it's user-scoped, not
tenant-scoped) and remains valid.

**Rationale**: The constitution requires "cambiar de contexto ... sin
volver a hacer login" (`PUT /auth/tenant-context`). Only the access token
is rotated (minimal change); the refresh token persists so the user
keeps their session across the switch.

---

**Authentication**: Valid access token (Bearer). The `sub` (user_id) comes
from the verified token.

**Request Body**:
```json
{
  "tenantId": "uuid-of-target-tenant"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| tenantId | UUID | yes | Must be a UUID the user has an active membership in |

**Response** (200 OK):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "tenant": {
    "tenantId": "uuid",
    "tenantName": "Globex Corp",
    "slug": "globex",
    "role": "EMPLEADO",
    "planTier": 3
  }
}
```

The new access token replaces the old one; the old one's `jti` is added
to the blocklist (same mechanism as logout, but only for the single old
access token, not the refresh family).

**Side Effects**:
- Verify `(user_id, tenantId)` has an active `TenantUser` membership with
  `is_active = true`. If not → 403.
- Issue new access token: `sub` = same user, `tenant_id` = new tenant,
  `is_platform_admin` = same (platform admins keep bypass), `session_id`
  = same (session continues), `jti` = new, `exp` = +15m.
- Add the old access token's `jti` to `RevokedAccessToken` blocklist
  (auto-prune at old exp) so the previous context token can't be reused.
- The refresh token (cookie) is UNCHANGED — refresh flow will continue
  to work and re-issue access tokens preserving the new `tenant_id` (the
  refresh reads the user's memberships and the last active tenant).

**Errors**:
- 400: Missing/invalid `tenantId` body field.
- 403: User is not an active member of the target tenant (membership
  missing or `is_active=false`). Platform admins (`is_platform_admin=true`)
  bypass this check and can switch to any tenant for support.
- 401: No/invalid access token (can't switch without being logged in).
- 404: Target tenant does not exist (treated as 403 to avoid enumeration
  — actually 403 since we check membership first; a non-existent tenant
  has no membership, so 403 is consistent).

**Note on 403 vs 404**: Unlike domain resource access (spec 002's 404 rule),
tenant switching is an explicit action ("I want to switch to tenant X").
Returning 403 ("you don't have access to this tenant") when the tenant
doesn't exist would not reveal membership info beyond what the user
already declared they're trying to access. However, to be safe, we
return 403 uniformly for both "no membership" and "tenant not found,"
which is fine because the user already stated the tenantId.
