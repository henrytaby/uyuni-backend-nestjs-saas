# API Contract: Tenants

**Module**: Tenancy
**Base Path**: `/tenancy/tenants`
**Auth**: Platform admin for CUD; tenant members for read access (own tenant only)
**Plan Gate**: N/A

Tenants are company accounts. Creation/management is platform-admin;
within a tenant, members can read their own tenant's data (protected by
TenantGuard + app-layer guards) — but the Tenant entity itself is managed
at platform level.

Note: Full tenant provisioning (with admin user + default catalogs) is
spec 008. This contract covers raw tenant CRUD.

---

## POST /tenancy/tenants

Create a new tenant.

**RBAC**: Platform admin

**Request Body**:
```json
{
  "name": "Acme Clinic",
  "slug": "acme-clinic",
  "planId": "uuid-of-plan"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | yes | 1-100 chars |
| slug | string | yes | lowercase, alphanumeric + hyphens, 3-50 chars, unique |
| planId | UUID | yes | Must reference an active Plan |

**Response** (201 Created):
```json
{
  "id": "uuid",
  "name": "Acme Clinic",
  "slug": "acme-clinic",
  "planId": "uuid",
  "paymentState": "ACTIVO",
  "isActive": true,
  "subscriptionStart": "2026-07-07T12:00:00Z",
  "subscriptionEnd": null,
  "createdAt": "2026-07-07T12:00:00Z",
  "updatedAt": "2026-07-07T12:00:00Z"
}
```

**Errors**:
- 400: Validation error (duplicate slug, invalid plan)
- 404: Plan not found
- 404: Plan is inactive (cannot create tenant on an inactive plan)

---

## GET /tenancy/tenants

List tenants (platform-admin view).

**RBAC**: Platform admin

**Query Parameters** (DataTableRequestDto):
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | |
| pageSize | number | 25 | max 100 |
| searchTerm | string | null | Search across name, slug |
| paymentState | enum | null | Filter by ACTIVO/MOROSO/SUSPENDIDO |
| isActive | boolean | true | |

**Response** (200 OK):
```json
{
  "data": [
    { "id": "uuid", "name": "Acme Clinic", "slug": "acme-clinic", "paymentState": "ACTIVO", "planName": "Pro", "isActive": true }
  ],
  "total": 1
}
```

---

## GET /tenancy/tenants/:id

Get a single tenant.

**RBAC**: Platform admin OR a member of that tenant (via TenantUser).

**Response** (200 OK):
```json
{
  "id": "uuid",
  "name": "Acme Clinic",
  "slug": "acme-clinic",
  "plan": { "id": "uuid", "name": "Pro", "tierLevel": 2, "maxUsers": 25, "moduleAccess": ["auth","tenancy","crm","agenda","sales","inventory"] },
  "paymentState": "ACTIVO",
  "isActive": true,
  "subscriptionStart": "2026-07-07T12:00:00Z",
  "subscriptionEnd": null
}
```

**Errors**:
- 404: Tenant not found or caller not a member (info-leak prevention)

---

## PATCH /tenancy/tenants/:id

Update tenant metadata (name, slug, planId). Payment state and
subscription dates are updated by spec 008 / billing.

**RBAC**: Platform admin

**Response** (200 OK): Updated tenant object.

**Errors**:
- 409: Slug conflict

---

## DELETE /tenancy/tenants/:id

Soft-delete (deactivate) a tenant. Members lose access; data preserved.
This is the only way to set `isActive=false`; PATCH does not accept
`isActive` — deactivation must go through this endpoint so that
side-effects (member notification, billing stop) are triggered in spec 008.

**RBAC**: Platform admin

**Response** (200 OK):
```json
{ "id": "uuid", "isActive": false }
```
