# Quickstart: Role-Based Access Control (RBAC)

**Feature**: 004-rbac | **Date**: 2026-07-22

## Prerequisites

- Stages 001 (Foundation), 002 (Multi-Tenancy), and 003 (Authentication) fully implemented
- PostgreSQL running with existing schema
- A test user with valid credentials (e.g., `test@uyuni.dev` / `Test1234!`)
- Server running via `npm run start:dev`

## Setup

```bash
# 1. Apply the RBAC migration
npx prisma migrate dev --name rbac

# 2. Seed the default Global roles (Admin, Empleado, Auditor)
# This is handled by the migration seed script
npx -y tsx prisma/seed-rbac.ts

# 3. Restart the server
npm run start:dev
```

## Validation Scenarios

### Scenario 1: Verify Permission Enforcement (US1)

**Goal**: Confirm that a user with READ-only permissions cannot CREATE records.

```text
1. POST /auth/login → Get accessToken for a user with "Empleado" role
2. POST /auth/tenant-context → Switch to active tenant, get scoped token
3. Paste token in Swagger Authorize
4. GET /rbac/permissions/effective → Verify permissions show READ only for CRM
5. Attempt a CREATE action on a CRM endpoint → Expect 403 Forbidden
6. Attempt a READ action on a CRM endpoint → Expect 200 OK
```

**Expected**: READ succeeds, CREATE returns 403 with "Insufficient permissions".

*Note: CRM endpoints referenced below will be available after the CRM domain module is implemented. For now, test with `/tenancy/tenant-users` endpoints which have @RequirePermissions decorators.*

### Scenario 2: Verify Ownership Scope (US2)

**Goal**: Confirm that `OWN` scope restricts visibility to creator's records.

```text
1. Login as User A (Empleado role, OWN scope on CRM)
2. Create a CRM record as User A → Note the record ID
3. GET /crm/records → Verify User A sees their record
4. Login as User B (same tenant, Empleado role, OWN scope)
5. GET /crm/records → Verify User B does NOT see User A's record
6. Login as User C (Admin role, ANY scope on CRM)
7. GET /crm/records → Verify User C sees ALL records
```

**Expected**: OWN-scoped users see only their own records. ANY-scoped users see all.

*Note: CRM endpoints referenced below will be available after the CRM domain module is implemented. For now, test with `/tenancy/tenant-users` endpoints which have @RequirePermissions decorators.*

### Scenario 3: Custom Role Management (US4)

**Goal**: Confirm tenant admins can create and assign custom roles.

```text
1. Login as tenant Admin
2. POST /rbac/roles → Create "Gerente de Ventas" with specific permissions
3. GET /rbac/roles → Verify new role appears alongside system roles
4. POST /rbac/assignments → Assign new role to a team member
5. Login as the team member
6. GET /rbac/permissions/effective → Verify merged permissions include new role
```

**Expected**: Custom role created, assigned, and effective permissions reflect it.

### Scenario 4: Superadmin Compliance (US3)

**Goal**: Confirm superadmin can READ but cannot DELETE across tenants.

```text
1. Login as platform superadmin (isPlatformAdmin: true)
2. Switch to any tenant context
3. GET on a tenant's data → Expect 200 OK
4. DELETE on a tenant's transactional data → Expect 403 Forbidden
5. Check server logs → Verify audit entry for the cross-tenant access
```

**Expected**: READ succeeds, DELETE blocked, audit log present.

### Scenario 5: Permission Change Takes Immediate Effect (SC-004)

**Goal**: Confirm no stale permission caching.

```text
1. Login as User A with Empleado role (READ on CRM)
2. GET /crm/records → 200 OK
3. As Admin, update Empleado role: remove CRM READ permission
4. As User A (same token), GET /crm/records → Expect 403 Forbidden immediately
```

**Expected**: Permission change reflected on the very next request.

## Troubleshooting

- **403 on all endpoints**: Check that `PermissionsGuard` is registered after `JwtAuthGuard` and `TenantGuard` in `app.module.ts`
- **Empty permissions**: Verify `RoleAssignment` records exist for the user's `TenantUser`
- **System roles not found**: Run the RBAC seed script (`seed-rbac.ts`)
