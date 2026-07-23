# Contract: Auth Tenant Context

## POST `/auth/tenant-context`

**Description:** Switches the active tenant context for the user, issuing a new access token scoped to the requested tenant.

**Headers:**
`Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "tenantId": "uuid-target-tenant"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbG...new-token-with-tenant-id...",
  "tenantId": "uuid-target-tenant"
}
```

**Response (403 Forbidden):**
*(Returned if the user is not a member of the requested tenant)*
