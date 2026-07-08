# API Contract: Auth Lockout

**Module**: Authentication
**Plan Gate**: N/A

Note: There is no dedicated lockout endpoint. Lockout is enforced WITHIN
`POST /auth/login` (see auth-login.md). This contract documents the
lockout behavior and the read endpoint for the user to check their own
lockout state (optional convenience for the frontend).

---

## Lockout Behavior (enforced in POST /auth/login)

- Track `LoginAttempt.attempt_count` per user (resolved by email).
- On each **failed** login: increment `attempt_count`.
  - If `attempt_count` reaches `LOCKOUT_MAX_ATTEMPTS` (default 5):
    set `locked_until = now + LOCKOUT_DURATION_MIN` (default 15 min).
- On a **successful** login: reset `attempt_count = 0`, `locked_until = null`.
- On a login attempt while `locked_until > now`: reject with 423 Locked.
  - The `Retry-After` header = seconds until `locked_until`.
  - The body message is the generic "Invalid email or password" (to avoid
    revealing that the account exists vs is locked — only the status code
    423 and the header distinguish programmatically).
- After `locked_until` passes: the next attempt is allowed. A success
  resets the counter; a failure increments toward re-locking.

**Important**: Lockout does NOT reveal account existence. For an email
that doesn't exist, no `LoginAttempt` row is created, and the login
returns 401 generic (never 423), so an attacker can't distinguish
"unknown email" from "locked account."

---

## GET /auth/lockout-status

Optionally, an authenticated or pre-authenticated user can check their own
lockout status (for the frontend to show "X attempts remaining, locked for
Y more minutes" UI). This is a convenience endpoint and is optional in
this iteration; the auth flow works without it.

**Authentication**: Pre-authenticated (accepts the email and a one-time
short-lived nonce? — NO; in this iteration, this endpoint requires a valid
access token, i.e., it's used only when already logged in to show status).
Given that a locked-out user can't get a token, this endpoint is mostly
useful for "attempts remaining" display BEFORE reaching the lock threshold
within the current session. It can be omitted if scope creep is a concern.

**Decision**: DEFERRED to a future iteration. The lockout is enforced in
`POST /auth/login`. The frontend can read the `Retry-After` header on the
423 response to display the remaining lock duration. No separate endpoint
in this feature; remove `GET /auth/lockout-status` from scope.

---

## Configuration (env vars from spec 001's config)

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCKOUT_MAX_ATTEMPTS` | 5 | Failed attempts before lockout |
| `LOCKOUT_DURATION_MIN` | 15 | Lockout duration in minutes |

These are validated at startup by the Joi schema from spec 001.
