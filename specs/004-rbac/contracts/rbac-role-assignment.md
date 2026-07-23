# Contract: RBAC Role Assignment

## GET `/rbac/assignments`

**Description:** Lists all role assignments for users in the current tenant.

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "uuid-assignment",
      "user": {
        "id": "uuid-user",
        "email": "juan@empresa.com",
        "firstName": "Juan",
        "lastName": "Pérez"
      },
      "role": {
        "id": "uuid-role",
        "name": "Empleado",
        "isSystem": true
      },
      "assignedAt": "2026-07-22T10:00:00Z",
      "assignedBy": {
        "id": "uuid-admin",
        "email": "admin@empresa.com"
      },
      "isActive": true
    }
  ],
  "total": 5
}
```

---

## POST `/rbac/assignments`

**Description:** Assigns a role to a user within the current tenant.

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "userId": "uuid-target-user",
  "roleId": "uuid-role"
}
```

**Response (201 Created):**
```json
{
  "id": "uuid-new-assignment",
  "userId": "uuid-target-user",
  "roleId": "uuid-role",
  "assignedAt": "2026-07-22T22:00:00Z"
}
```

**Response (404 Not Found):** User is not a member of this tenant.

**Response (409 Conflict):** User already has this role assigned.

---

## DELETE `/rbac/assignments/:id`

**Description:** Removes a role assignment from a user.

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200 OK):** `{ "message": "Role assignment removed successfully" }`

**Response (403 Forbidden):** Insufficient permissions.
