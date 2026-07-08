# API Contract: Users

**Module**: Tenancy
**Base Path**: `/tenancy/users`
**Auth**: Platform admin for global CRUD; TenantGuard for membership-scoped reads
**Plan Gate**: N/A

Users are global identities (unique email platform-wide). This contract
covers raw user CRUD at platform level. Full self-registration/login lives
in spec 003 (Authentication).

---

## POST /tenancy/users

Create a global user record.

**RBAC**: Platform admin (or created during tenant provisioning in spec 008)

**Request Body**:
```json
{
  "email": "jane@example.com",
  "password": "plain-password-to-be-hashed",
  "firstName": "Jane",
  "lastName": "Doe",
  "isPlatformAdmin": false
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| email | string | yes | valid email, unique |
| password | string | yes | min 8 chars (hashed on store) |
| firstName | string | no | 1-50 chars |
| lastName | string | no | 1-50 chars |
| isPlatformAdmin | boolean | no | default false |

**Response** (201 Created) — note: password hash NEVER returned:
```json
{
  "id": "uuid",
  "email": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "isPlatformAdmin": false,
  "isActive": true,
  "createdAt": "2026-07-07T12:00:00Z"
}
```

**Errors**:
- 400: Validation error, weak password
- 409: Email already registered

---

## GET /tenancy/users

List users (platform-admin view). Tenant-scoped endpoints that list a
tenant's members use the TenantUsers contract instead.

**RBAC**: Platform admin

**Query Parameters**: page, pageSize, searchTerm (email, first/last name),
isActive.

**Response** (200 OK):
```json
{
  "data": [
    { "id": "uuid", "email": "jane@example.com", "firstName": "Jane", "lastName": "Doe", "isActive": true }
  ],
  "total": 1
}
```

---

## GET /tenancy/users/:id

Get a user.

**RBAC**: Platform admin OR the user themselves (own record).

**Response** (200 OK): User object (no password hash).

**Errors**:
- 404: User not found (or not authorized to view)

---

## PATCH /tenancy/users/:id

Update user (name, isPlatformAdmin toggle). Email changes require
verification (out of scope here; deferred).

**RBAC**: Platform admin OR the user themselves (own non-role fields).

**Response** (200 OK): Updated user object.

---

## DELETE /tenancy/users/:id

Soft-delete (is_active=false). Does not remove TenantUser memberships —
those are deactivated separately (spec 008).

**RBAC**: Platform admin

**Response** (200 OK):
```json
{ "id": "uuid", "isActive": false }
```

---

## GET /tenancy/users/me/tenants

List the tenants the authenticated user belongs to (used for tenant
context switching after login — full flow in spec 003, but the read is here).

**RBAC**: Authenticated user (any).

**Response** (200 OK):
```json
{
  "data": [
    { "tenantId": "uuid", "tenantName": "Acme Clinic", "slug": "acme-clinic", "role": "ADMIN", "isActive": true }
  ],
  "total": 1
}
```
