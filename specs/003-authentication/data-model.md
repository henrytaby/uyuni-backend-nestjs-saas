# Data Model: Authentication

## Prisma Schema Additions / Modifications

### 1. `User` (Modification)
*Note: The physical columns were already added in the `002-multi-tenancy-core` migration to avoid multiple schema updates, but their semantic usage belongs to this specification.*
- `failed_login_attempts` (Int): Defaults to 0. Tracks consecutive failed logins.
- `locked_until` (DateTime?): Nullable. Indicates the account is locked until this time.

### 2. `RefreshToken` (New Entity)
Stores issued refresh tokens and their revocation status to support rotation, reuse detection, and global logout.
- `id` (String): Primary key (UUID).
- `token_hash` (String): A hashed version of the token (preventing plain-text token leaks).
- `user_id` (String): Foreign key to `User`. This is a global token (not tenant-scoped).
- `is_revoked` (Boolean): Defaults to false. Set to true when the token is successfully used to get a new pair, explicitly revoked (logout), or globally revoked.
- `expires_at` (DateTime): The absolute expiration time.
- `replaced_by_id` (String?): Self-referencing foreign key to `RefreshToken`. When token A is rotated, it points to token B. Used to trace and revoke the entire family if token A is reused (reuse detection).
- `created_at` (DateTime): Default now().
- `updated_at` (DateTime): Auto-updated.
- `created_by_id` (String?): FK to User. Audit: who created the token.
- `updated_by_id` (String?): FK to User. Audit: who last modified.
- `deleted_by_id` (String?): FK to User. Audit: who revoked (soft-delete context).

*Note: Audit columns were added during Phase 7 Convergence (T022) per Constitution Principle IV.*

## State Transitions

### Login (User)
- **Condition**: Successful credential validation.
- **Action**: Reset `failed_login_attempts = 0` and `locked_until = null`. Issue Access Token (JSON) + Refresh Token (Cookie).

### Login Failed (User)
- **Condition**: Invalid credentials.
- **Action**: Increment `failed_login_attempts`. If `failed_login_attempts >= 5`, set `locked_until = NOW() + 15 minutes`.

### Token Rotation (RefreshToken)
- **Condition**: Valid refresh token submitted via Cookie.
- **Action**: Mark current token `is_revoked = true`. Create new token. Set `replaced_by_id` on the old token to the new token's ID.

### Reuse Detection (RefreshToken)
- **Condition**: A refresh token is submitted but its `is_revoked` is already `true`.
- **Action**: Reject request. Traverse the `replaced_by_id` chain and set `is_revoked = true` for all descendant tokens (invalidating the session family).

### Global Logout (RefreshToken)
- **Condition**: Authenticated user requests global sign-out.
- **Action**: `UPDATE RefreshToken SET is_revoked = true WHERE user_id = {current_user_id}`.

## Validation Rules
- `token_hash`: Must not be empty.
- `user_id`: Must reference a valid, non-deleted User.
