# API Contract: TenantUsers (Memberships)

**Module**: Tenancy
**Base Path**: `/tenancy/tenant-users`
**Auth**: JWT required + TenantGuard
**Plan Gate**: N/A

Memberships link a User to a Tenant with a role. This is the tenant-scoped
entity (RLS enabled). A tenant admin manages their members; a user sees
their own memberships.

---

## POST /tenancy/tenant-users

Add a user to a tenant (create a membership). The user must already exist.
Full invitation (email-based) flow is spec 008; this is direct membership
creation by a tenant admin.

**RBAC**: Tenant admin (`role = ADMIN` in the caller's TenantUser of the
target tenant) OR platform admin.

**Request Body**:
```json
{
  "tenantId": "uuid",
  "userId": "uuid",
  "role": "EMPLEADO"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| tenantId | UUID | yes | Must match caller's tenant (platform admin may specify any; tenant admin gets 403 if mismatch) |
| userId | UUID | yes | Must reference an existing active User |
| role | string | yes | "ADMIN", "EMPLEADO", or "AUDITOR" |

**Response** (201 Created):
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "userId": "uuid",
  "role": "EMPLEADO",
  "isActive": true,
  "joinedAt": "2026-07-07T12:00:00Z",
  "createdAt": "2026-07-07T12:00:00Z"
}
```

**Errors**:
- 400: Invalid role
- 403: Not a tenant admin (missing ADMIN role) or tenantId does not match caller's tenant context
- 409: Membership already exists (the (tenant_id, user_id) pair is unique)

---

## GET /tenancy/tenant-users

List memberships. A tenant admin lists their tenant's members; a regular
user lists only their own memberships (scope_all=false).

**RBAC**: Authenticated user. Tenant admin sees all tenant members; others
see their own.

**Query Parameters** (DataTableRequestDto):
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | |
| pageSize | number | 25 | max 100 |
| searchTerm | string | null | Search across user email, first/last name |
| tenantId | UUID | caller's | Filter by tenant (defaults to caller's active tenant) |
| role | string | null | Filter by role |
| isActive | boolean | true | |

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "userId": "uuid",
      "userEmail": "jane@example.com",
      "userFirstName": "Jane",
      "userLastName": "Doe",
      "role": "ADMIN",
      "isActive": true,
      "joinedAt": "2026-07-07T12:00:00Z"
    }
  ],
  "total": 1
}
```

---

## GET /tenancy/tenant-users/:id

Get a single membership.

**RBAC**: Tenant admin OR the membership's own user.

**Response** (200 OK): Membership object (same shape as above).

**Errors**:
- 404: Membership not found or in another tenant (for non-admin callers)

---

## PATCH /tenancy/tenant-users/:id

Update a membership's role (e.g., promote EMPLEADO to ADMIN).

**RBAC**: Tenant admin of the membership's tenant OR platform admin.

**Request Body** (partial):
```json
{ "role": "ADMIN" }
```

**Response** (200 OK): Updated membership object.

---

## DELETE /tenancy/tenant-users/:id

Deactivate a membership (is_active=false). The user is unlinked from the
tenant but their User record persists globally.

**RBAC**: Tenant admin of the membership's tenant OR platform admin.

**Response** (200 OK):
```json
{ "id": "uuid", "isActive": false }
```

---

## Anti-Leakage Verification (Cross-cutting)

These endpoints demonstrate the TenantGuard + RLS isolation expected by
the constitution. An e2e suite verifies:
- Tenant A's admin cannot list or access Tenant B's memberships.
- A membership's tenant_id cannot be forged via the request body — the
  Prisma extension overrides it with the caller's context tenant_id.
- A 404 (not 403) is returned for any ID belonging to another tenant.
