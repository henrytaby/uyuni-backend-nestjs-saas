# Contract: Auth Tokens (Refresh & Logout)

## POST `/auth/refresh`

**Description:** Rotates a refresh token. The client must send the cookie.

**Headers:**
`Cookie: refresh_token=def456...`

**Response (200 OK):**
**Headers:**
`Set-Cookie: refresh_token=new789...; HttpOnly; Secure; SameSite=Strict; Path=/auth`

**Body:**
```json
{
  "accessToken": "eyJhbG..."
}
```

**Response (401 Unauthorized):**
*(Returned if token is invalid, expired, or revoked - triggers family invalidation if reused)*

---

## POST `/auth/logout`

**Description:** Invalidates the current session's refresh token family. Clears the cookie.

**Headers:**
`Authorization: Bearer <accessToken>`
`Cookie: refresh_token=def456...`

**Response (200 OK):**
**Headers:**
`Set-Cookie: refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=0`

**Body:**
```json
{
  "message": "Successfully logged out"
}
```

---

## POST `/auth/logout/global`

**Description:** Invalidates ALL active sessions (refresh token families) for the authenticated user.

**Headers:**
`Authorization: Bearer <accessToken>`

**Response (200 OK):**
**Headers:**
`Set-Cookie: refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=0`

**Body:**
```json
{
  "message": "Successfully logged out from all devices"
}
```
