# Contract: Auth Login

## POST `/auth/login`

**Description:** Authenticates a user with email and password, returning an access token and accessible tenants. The refresh token is delivered securely via an `HttpOnly` cookie.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "strongPassword123"
}
```

**Response (200 OK):**
**Headers:**
`Set-Cookie: refresh_token=def456...; HttpOnly; Secure; SameSite=Strict; Path=/auth`

**Body:**
```json
{
  "accessToken": "eyJhbG...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "tenants": [
    {
      "tenantId": "uuid-tenant-1",
      "name": "Acme Corp",
      "role": "ADMIN"
    }
  ]
}
```

**Response (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```
*(Same error for invalid email or invalid password to prevent enumeration)*
