# Quickstart: Multi-Tenancy Core

**Feature**: 002-multi-tenancy-core
**Date**: 2026-07-07

## Prerequisites

- Foundation spec (001) complete: server runs, Prisma connected,
  Swagger at /api/docs, global validation + exception filter wired.
- PostgreSQL 16+ running with privileges to create RLS policies.
- A platform admin user seeded (created via the Users contract with
  `isPlatformAdmin: true`).

## Setup

1. **Apply the tenancy migration** (creates Plan, Tenant, User, TenantUser
   tables + RLS policies on TenantUser):
   ```bash
   npx prisma migrate dev --name tenant_core
   ```

2. **Seed a Free plan and a platform admin** (one-time, via a seed script
   or the API):
   - Plan: `name="Free", tierLevel=1, maxUsers=3, moduleAccess=["auth","tenancy","crm","agenda"]`
   - Plan: `name="Pro", tierLevel=2, maxUsers=25, moduleAccess=[...,"sales","inventory"]`
   - Platform admin User: `isPlatformAdmin=true`

3. **Start the server**: `npm run start:dev`

## Validation Scenarios

### Scenario 1: Tenant-Scoped Data Isolation (US1) — CRITICAL

Validate cross-tenant access is impossible by design. This is the
constitution's non-negotiable CI gate.

1. **Provision two tenants** as platform admin:
   ```bash
   curl -X POST http://localhost:3000/tenancy/tenants \
     -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" \
     -d '{ "name": "Tenant A", "slug": "tenant-a", "planId": "$FREE_PLAN" }'
   curl -X POST http://localhost:3000/tenancy/tenants \
     -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" \
     -d '{ "name": "Tenant B", "slug": "tenant-b", "planId": "$FREE_PLAN" }'
   ```

2. **Create a membership in each tenant** for two different users (or reuse
   a user in both to test the multi-tenant case). Use the TenantUsers
   contract.

3. **Authenticate as Tenant A's user** (a way to set the active tenant
   context; minimal token creation for this test — full auth in spec 003).
   Issue a membership-scoped token with `tenant_id = Tenant A` and
   `user_id = User A`.

4. **List TenantUser memberships** as Tenant A user:
   ```bash
   curl http://localhost:3000/tenancy/tenant-users \
     -H "Authorization: Bearer $TENANT_A_TOKEN"
   ```
   **Expected**: Only Tenant A's memberships returned. Tenant B is
   invisible.

5. **Attempt direct access to a Tenant B membership by ID**:
   ```bash
   curl http://localhost:3000/tenancy/tenant-users/$TENANT_B_MEMBERSHIP_ID \
     -H "Authorization: Bearer $TENANT_A_TOKEN"
   ```
   **Expected**: `404 Not Found` (not 403 — no information leakage).

6. **Attempt to forge tenant_id in the request body** (create a membership
   with a `tenantId` set to Tenant B while authenticated as Tenant A):
   ```bash
   curl -X POST http://localhost:3000/tenancy/tenant-users \
     -H "Authorization: Bearer $TENANT_A_TOKEN" \
     -d '{ "tenantId": "'"$TENANT_B_ID"'", "userId": "...", "role": "EMPLEADO" }'
   ```
   **Expected**: The Prisma extension overrides `tenantId` with the
   caller's context (Tenant A). The created membership belongs to Tenant A,
   not Tenant B. Verify via the response `tenantId` field.

7. **Automated anti-leakage test**: The e2e spec
   `tenancy-anti-leakage.e2e-spec.ts` automates 4-6 against a real
   PostgreSQL container with RLS enabled. It MUST pass in CI — a failure
   blocks the build.

### Scenario 2: Tenant & Plan Management (US2)

1. **Create a Plan** (platform admin):
   ```bash
   curl -X POST http://localhost:3000/tenancy/plans \
     -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" \
     -d '{ "name": "Premium", "tierLevel": 3, "maxUsers": 100, "storageLimit": 107374182400, "moduleAccess": ["auth","tenancy","crm","agenda","sales","inventory"], "price": 99.99 }'
   ```
   **Expected**: `201 Created` with the plan object.

2. **Create a Tenant under the Premium plan** (platform admin):
   ```bash
   curl -X POST http://localhost:3000/tenancy/tenants \
     -d '{ "name": "Globex Corp", "slug": "globex", "planId": "$PREMIUM_PLAN" }'
   ```
   **Expected**: `201 Created`, `paymentState: "ACTIVO"`.

3. **Try to delete a Plan in use**:
   ```bash
   curl -X DELETE http://localhost:3000/tenancy/plans/$PREMIUM_PLAN \
     -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN"
   ```
   **Expected**: `409 Conflict` — plan in use by Globex.

### Scenario 3: Request Context Propagation (US3)

Validate the AsyncLocalStorage context carries tenant_id + user_id and
the Prisma extension auto-injects them.

1. **Make an authenticated request** with a token containing `tenant_id`
   and `user_id`.

2. **Inspect the structured log entry** from spec 001's pino logger:
   - `tenantId` field is populated with the token's tenant_id (no longer
     null as in spec 001).
   - `userId` field is populated.
   - `requestId` correlates the log with the response body's requestId.

3. **Create a membership** as a platform admin specifying the acting user
   via context:
   ```bash
   # The created_by_id column is auto-populated by the Prisma extension
   # reading the context — NOT passed in the body.
   curl -X POST http://localhost:3000/tenancy/tenant-users \
     -d '{ "tenantId": "...", "userId": "...", "role": "ADMIN" }'
   ```
   **Expected**: The created membership's `created_by_id` equals the
   platform admin's `user_id` — verify in the DB. No `created_by_id`
   field was sent in the request body.

4. **Platform admin bypass**: Issue a request as a platform admin
   (`isPlatformAdmin=true`) to a tenant they do not belong to. The Prisma
   extension skips the `WHERE tenant_id = ...` filter for platform admins.
   **Expected**: Data from other tenants is readable (support access).
   (Full superadmin-bypass audit logging arrives in spec 005; here it
   simply works.)

## Edge Case Verification

- **Concurrent contexts**: Issue two parallel requests from the same user
  but with different active tenant contexts. Each request's context is
  isolated (AsyncLocalStorage per-request). **Expected**: No cross-
  contamination — each request sees only its own tenant's data.

- **Unauthenticated access to a protected endpoint**: Call
  `/tenancy/tenant-users` with no Authorization header. **Expected**: `401`
  (no tenant context = not authenticated into a tenant).

- **RLS enforcement with extension bypassed**: Directly query the DB as the
  app role WITHOUT setting `app.tenant_id` (simulating a bug in the
  extension). **Expected**: RLS returns no rows (`SET LOCAL` not called →
  `current_setting('app.tenant_id')` is null → policy `tenant_id = null`
  matches nothing). This proves RLS is the secondary defense.

## Constitution Compliance Verification

- **Principle I (Isolation)**: Scenario 1 + the anti-leakage e2e prove
  no cross-tenant access by design.
- **Principle II (RBAC, partial)**: User has `isPlatformAdmin`; TenantUser
  has a `role` string. Full permissions in spec 004.
- **Principle III (Gating, partial)**: Plan stores `moduleAccess` + limits.
  Enforceing guard in spec 008.
- **Principle IV (Audit, partial)**: Audit columns exist; auto-injection
  bridge validated in Scenario 3 step 3. Full extension in spec 005.
- **Principle V (API-First)**: All four entities documented in
  contracts/ and appear at /api/docs automatically.
