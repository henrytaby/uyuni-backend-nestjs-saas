# Contract: Auth Lockout

## POST `/auth/login` (Lockout Scenario)

**Description:** When a user attempts to log in but their account is locked due to 5 consecutive failed attempts.

**Request Body:**
*(Standard login payload)*

**Response (403 Forbidden):**
```json
{
  "statusCode": 403,
  "message": "Account is locked due to too many failed attempts. Try again later.",
  "lockedUntil": "2026-07-08T15:30:00Z",
  "error": "Forbidden"
}
```
