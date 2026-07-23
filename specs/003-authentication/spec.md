# Feature Specification: Authentication

**Feature Branch**: `003-authentication`

**Created**: 2026-07-07
**Updated**: 2026-07-22 (Clean Architecture & Security Standards Alignment)

**Status**: Ready

**Input**: User description: "Implement email-based authentication with cryptographic access tokens, refresh token rotation with blacklisting, account lockout after 5 failed attempts, and tenant context switching without re-login."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email Login with Secure Tokens (Priority: P1)

A user enters their email and password. The system validates the credentials
and issues a short-lived access token and a secure, long-lived refresh token. 
The access token is used for subsequent authenticated requests. The user can see which tenants
they belong to.

**Why this priority**: Authentication is the gateway to every protected
feature. Without it, no tenant-scoped or role-based access can function.

**Independent Test**: Register a user, log in with email/password, use the
access token to call a protected endpoint successfully.

**Acceptance Scenarios**:

1. **Given** a registered user with a verified email and password, **When**
   they submit valid credentials to the login endpoint, **Then** the system
   returns an access token, a secure refresh token (via protected transport), and the list of tenants the
   user belongs to.
2. **Given** a valid access token, **When** the user calls a protected
   endpoint, **Then** the request is authorized and proceeds normally.
3. **Given** an expired access token, **When** the user calls a protected
   endpoint, **Then** the system returns 401 Unauthorized.

---

### User Story 2 - Refresh Token Rotation & Session Management (Priority: P2)

When an access token expires, the user submits their refresh token to obtain
a new token pair. The old refresh token is immediately invalidated
(blacklisted). If a previously used refresh token is submitted, the system
detects token reuse and invalidates the entire token family for that session
as a security measure. The user can explicitly log out, invalidating their current session.
Additionally, the user can terminate all active sessions across all devices.

**Why this priority**: Refresh token rotation prevents token theft and
replay attacks. Global logout allows users to secure compromised accounts.

**Independent Test**: Log in, use the refresh token once (succeeds), attempt
to reuse the same refresh token (fails and triggers security alert), log
out globally and verify no existing tokens work.

**Acceptance Scenarios**:

1. **Given** a valid refresh token, **When** the user submits it to the
   refresh endpoint, **Then** a new access token and new refresh token are
   issued, and the old refresh token is invalidated.
2. **Given** a previously used (blacklisted) refresh token, **When** it is
   submitted to the refresh endpoint, **Then** the system rejects it,
   invalidates all refresh tokens for that user session, and logs a
   security event.
3. **Given** an authenticated user, **When** they call the logout endpoint,
   **Then** their current access token and all refresh tokens for the
   session are invalidated.
4. **Given** an authenticated user, **When** they call the global logout endpoint,
   **Then** all active sessions and tokens across all devices are immediately invalidated.

---

### User Story 3 - Account Lockout & Tenant Context Switch (Priority: P3)

After 5 consecutive failed login attempts, the account is locked for a
configurable duration. A user who belongs to multiple tenants can switch
their active tenant context without logging out and back in. This updates
the request context and all subsequent operations are scoped to the new
tenant.

**Why this priority**: Lockout prevents brute-force attacks. Tenant
switching is critical for users managing multiple business accounts.

**Independent Test**: Attempt 5 wrong passwords (account locks), wait for
unlock, retry with correct password (succeeds). Then log in as a multi-tenant
user, switch tenant context, verify data scope changes.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** 5 consecutive failed login
   attempts occur, **Then** the account is locked and subsequent login
   attempts return a lockout message indicating the remaining duration.
2. **Given** a locked account, **When** the lockout duration expires,
   **Then** the user can attempt login again with correct credentials.
3. **Given** an authenticated user belonging to Tenant A and Tenant B,
   **When** they switch their active context to Tenant B, **Then** all
   subsequent operations return data scoped to Tenant B without requiring
   a new login.

### Edge Cases

- Login with correct password from a new device while account is locked —
  MUST still be blocked until lockout expires.
- Concurrent refresh token use from two devices — only the first succeeds;
  the second triggers the reuse detection (security measure).
- Tenant context switch to a tenant the user does not belong to — MUST
  return 403.
- Password reset flow is NOT in scope for this feature — deferred to a
  future iteration.
- Login attempt on a soft-deleted user account — MUST return the same
  error as invalid credentials (no information leakage).

### Implementation Discoveries (Post-Development)

- **Tenant Guard Bypass**: A global `TenantGuard` (from stage 002) blocked endpoints lacking a tenant context. A `@BypassTenant()` decorator was introduced to allow `/auth/tenant-context` and `/auth/logout` to function securely without a pre-existing tenant selection.
- **Swagger Integration Constraints**: Express `@Req()` and `@Res()` objects were typed as `any` in controllers to bypass a severe NestJS/TypeScript Swagger reflection error (`TS1272`). Swagger was explicitly configured in `main.ts` with `addBearerAuth()` for UI testing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate users via email and password,
  returning a short-lived access token and a refresh token on success.
- **FR-002**: System MUST deliver long-lived refresh tokens via secure, script-inaccessible transport (e.g., HttpOnly cookies) to mitigate Cross-Site Scripting (XSS) attacks.
- **FR-003**: System MUST return the list of tenants the user belongs to
  upon successful login, including the user's role in each tenant.
- **FR-004**: System MUST implement refresh token rotation: each use of a
  refresh token invalidates the previous one and issues a new pair.
- **FR-005**: System MUST detect refresh token reuse and, upon detection,
  invalidate all tokens for the affected user session and log a security
  event.
- **FR-006**: System MUST implement account lockout after 5 consecutive
  failed login attempts for a configurable duration.
- **FR-007**: System MUST provide a logout endpoint that invalidates the
  current access token and all refresh tokens for the session.
- **FR-008**: System MUST provide a global logout endpoint to invalidate all active sessions for a user across all devices.
- **FR-009**: System MUST allow an authenticated user to switch their
  active tenant context without re-authentication.
- **FR-010**: System MUST validate that the user is a member of the target
  tenant before allowing a context switch.
- **FR-011**: System MUST hash passwords using a strong one-way algorithm
  before storage.
- **FR-012**: System MUST NOT reveal whether an email exists in the system
  during login — invalid email and invalid password MUST return the same
  generic error message.
- **FR-013**: System MUST include the identity payload (tenant_id, user_id) securely in the access token for downstream context propagation.
- **FR-014**: System MUST apply strict network-level rate limiting (Throttling) on authentication endpoints to mitigate password spraying attacks.
- **FR-015**: The identity and data model MUST be explicitly designed to accommodate future Multi-Factor Authentication (MFA) mechanisms without architectural breaking changes.

### Key Entities

- **RefreshToken**: Stored token record. Attributes: token hash, linked
  User, is_revoked flag, expires_at, created_at, replaced_by_id (for tracking lineage).
- **LoginAttempt**: Tracks consecutive failures. Attributes: linked User,
  attempt_count, locked_until timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can log in and receive valid tokens in under 2
  seconds under normal load.
- **SC-002**: Stolen refresh tokens are unusable after a single rotation —
  reuse detection triggers within 1 second.
- **SC-003**: Brute-force attacks are neutralized — after 5 failed attempts,
  the account is locked for at least 15 minutes.
- **SC-004**: A multi-tenant user can switch between tenants seamlessly
  without re-entering credentials, with context reflected in under 1
  second.
- **SC-005**: All long-lived authentication artifacts are inaccessible to client-side scripts.

## Assumptions

- Access token lifetime defaults to 15 minutes; refresh token lifetime
  defaults to 7 days. Both are configurable.
- Lockout duration defaults to 15 minutes after 5 failed attempts. Both
  values are configurable.
- "Session" for logout purposes is defined by the refresh token family
  (tokens issued from the same login event).
- Email verification is out of scope for this feature — users are
  pre-verified or invited.
- Password requirements: minimum 8 characters. Further complexity rules
  can be added later.
- Data access policies assume a transaction-scoped session variable for isolation, which the authentication layer will reliably feed via the identity token.

## Dependencies

- **001-foundation-bootstrap**: Provides NestJS application scaffold,
  pino structured logging, global exception filters, and `requestId`
  correlation middleware.
- **002-multi-tenancy-core**: Provides `User` model (with lockout columns),
  `TenantUser` model, `TenantContextService` (AsyncLocalStorage),
  `TenantGuard`, and Prisma tenant-scoped extensions.
