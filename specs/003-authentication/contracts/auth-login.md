# API Contract: Auth Login

**Module**: Authentication
**Base Path**: `/auth`
**Auth**: The login endpoint is public; returns tokens for subsequent authenticated calls.
**Plan Gate**: N/A

---

## POST /auth/login

Authenticate a user by email + password. On success, issue an access
token (JWT, 15 min) and a refresh token (opaque, httpOnly cookie + body).
Return the list of tenants the user belongs to with their roles, plus the
default/primary tenant so the frontend can set the active context.

**Authentication**: None (public endpoint).

**Request Body**:
```json
{
  "email": "jane@example.com",
  "password": "pa$$word"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| email | string | yes | valid email format |
| password | string | yes | min 8 chars |

**Response** (200 OK):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "opaque-random-string",
  "user": {
    "id": "uuid",
    "email": "jane@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "isPlatformAdmin": false
  },
  "tenants": [
    {
      "tenantId": "uuid",
      "tenantName": "Acme Clinic",
      "slug": "acme-clinic",
      "role": "ADMIN",
      "planTier": 2
    }
  ],
  "activeTenantId": "uuid"
}
```

The refresh token is also set as an `httpOnly` cookie (`refresh_token`)
with `Secure`, `SameSite=Strict`, and `Path=/auth`.

**Errors**:
- 401: Invalid email or password (SAME message for not-found / wrong
  password / soft-deleted user — no info leakage)
- 423: Account locked after 5 failed attempts — body says "Invalid email
  or password", response includes `Retry-After` header (seconds until
  unlock) so the legitimate user can retry. The status code 423 lets a
  client distinguish a lock from a wrong password only programmatically,
  not via the body message.

**Security** (enforced, not in body):
- On failure, increment `LoginAttempt.attempt_count`; at 5, set
  `locked_until = now + LOCKOUT_DURATION_MIN`.
- On success, reset `attempt_count = 0`.
- bcrypt cost 12; dummy-hash on not-found to equalize timing.
