# Contract: RBAC Roles

## GET `/rbac/roles`

**Description:** Lists all roles available to the current tenant (Global + Custom roles for this tenant).

**Headers:** `Authorization: Bearer <accessToken>`

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| includeSystem | boolean | No | Include global system roles (default: true) |

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "uuid-role",
      "name": "Admin",
      "description": "Full access to all modules",
      "isSystem": true,
      "tenantId": null,
      "permissions": [
        { "module": "crm", "action": "CREATE", "scope": "ANY" },
        { "module": "crm", "action": "READ", "scope": "ANY" },
        { "module": "crm", "action": "UPDATE", "scope": "ANY" },
        { "module": "crm", "action": "DELETE", "scope": "ANY" }
      ]
    }
  ],
  "total": 3
}
```

---

## POST `/rbac/roles`

**Description:** Creates a custom role for the current tenant.

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "name": "Gerente de Ventas",
  "description": "Manages sales team and client relationships",
  "permissions": [
    { "module": "crm", "action": "READ", "scope": "ANY" },
    { "module": "crm", "action": "UPDATE", "scope": "ANY" },
    { "module": "sales", "action": "READ", "scope": "OWN" },
    { "module": "sales", "action": "CREATE", "scope": "OWN" }
  ]
}
```

**Response (201 Created):**
```json
{
  "id": "uuid-new-role",
  "name": "Gerente de Ventas",
  "description": "Manages sales team and client relationships",
  "isSystem": false,
  "tenantId": "uuid-current-tenant",
  "permissions": [...]
}
```

**Response (403 Forbidden):** Insufficient permissions to create roles.

---

## PATCH `/rbac/roles/:id`

**Description:** Updates a custom role. System roles cannot be modified.

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "name": "Gerente Senior de Ventas",
  "permissions": [
    { "module": "crm", "action": "READ", "scope": "ANY" },
    { "module": "crm", "action": "UPDATE", "scope": "ANY" },
    { "module": "crm", "action": "DELETE", "scope": "ANY" },
    { "module": "sales", "action": "READ", "scope": "ANY" },
    { "module": "sales", "action": "CREATE", "scope": "OWN" }
  ]
}
```

**Response (200 OK):** Updated role object.

**Response (403 Forbidden):** Cannot modify system roles.

---

## DELETE `/rbac/roles/:id`

**Description:** Soft-deletes a custom role. Fails if users are still assigned.

**Response (200 OK):** `{ "message": "Role deactivated successfully" }`

**Response (403 Forbidden):** Cannot delete system roles.

**Response (409 Conflict):** `{ "message": "Cannot delete role with active assignments. Reassign users first.", "activeAssignments": 5 }`
