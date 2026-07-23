# Contract: RBAC Permissions

## GET `/rbac/permissions/effective`

**Description:** Returns the effective (merged) permissions for the current authenticated user in their active tenant context. This is the resolved union of all assigned roles.

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200 OK):**
```json
{
  "userId": "uuid-user",
  "tenantId": "uuid-tenant",
  "permissions": [
    { "module": "crm", "action": "CREATE", "scope": "ANY" },
    { "module": "crm", "action": "READ", "scope": "ANY" },
    { "module": "crm", "action": "UPDATE", "scope": "OWN" },
    { "module": "crm", "action": "DELETE", "scope": "OWN" },
    { "module": "agenda", "action": "READ", "scope": "OWN" },
    { "module": "agenda", "action": "CREATE", "scope": "OWN" }
  ],
  "roles": [
    { "id": "uuid-role-1", "name": "Gerente de Ventas" },
    { "id": "uuid-role-2", "name": "Empleado" }
  ],
  "isPlatformAdmin": false
}
```

**Response (401 Unauthorized):** No valid token provided.

---

## GET `/rbac/permissions/modules`

**Description:** Returns the list of available modules in the permission registry.

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200 OK):**
```json
{
  "modules": [
    "tenancy",
    "crm",
    "agenda",
    "sales",
    "inventory",
    "catalogs",
    "audit"
  ]
}
```
