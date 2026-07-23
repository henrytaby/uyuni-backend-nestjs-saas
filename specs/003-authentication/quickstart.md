# Quickstart & Validation Guide: Authentication

This guide demonstrates how to validate the authentication feature end-to-end.

## Prerequisites
Ensure the database is running and migrations are applied:
```bash
npm run prisma:migrate
npm run prisma:generate
```
Ensure the server is running:
```bash
npm run start:dev
```

## Scenarios

### Scenario 1: Standard Login and Protected Endpoint Access
1. Make a `POST` request to `/auth/login` with valid seeded credentials.
2. Verify you receive a 200 OK with `accessToken` in the JSON body, and a `refresh_token` in the `Set-Cookie` header (HttpOnly).
3. Make a `GET` request to any protected endpoint (e.g., `/tenancy/plans`) including the header:
   `Authorization: Bearer <accessToken>`
4. Verify you receive a 200 OK.
5. Make the same request with a modified or expired `accessToken` and verify you receive 401 Unauthorized.

### Scenario 2: Refresh Token Rotation
1. Make a `POST` request to `/auth/refresh` including the cookie from Scenario 1.
2. Verify you receive a 200 OK with a new `accessToken` and a new `refresh_token` cookie.
3. Make a second `POST` request to `/auth/refresh` using the **old** (now revoked) refresh token cookie.
4. Verify you receive a 401 Unauthorized.
5. Make a third `POST` request using the **new** refresh token (from step 2). Since the family was invalidated in step 3 due to reuse detection, verify you ALSO receive a 401 Unauthorized.

### Scenario 3: Global Logout
1. Log in on "Device A" (save token A).
2. Log in on "Device B" (save token B).
3. Make a `POST` request to `/auth/logout/global` using `accessToken` from Device A.
4. Attempt to refresh token A. Verify 401 Unauthorized.
5. Attempt to refresh token B. Verify 401 Unauthorized (both sessions invalidated).

### Scenario 4: Account Lockout & Password Spraying Protection
1. Make 5 consecutive `POST` requests to `/auth/login` with an invalid password.
2. Verify the 1st through 4th requests return 401 Unauthorized (Invalid credentials).
3. Verify the 5th request returns 403 Forbidden with a lockout message.
4. Send a burst of 10 requests to `/auth/login` within a few seconds (even with different emails). Verify the server returns a 429 Too Many Requests response (Rate Limiting).

### Scenario 5: Tenant Context Switch
1. Log in as a user who belongs to multiple tenants (check the `tenants` array in the login response).
2. Make a `POST` request to `/auth/tenant-context` passing `{ "tenantId": "<another_tenant_id>" }`.
3. Verify you receive a 200 OK with a new `accessToken`.
4. Use the new `accessToken` to perform a tenant-scoped read (e.g., `GET /tenancy/users`). Verify the returned data is scoped to the new tenant.
