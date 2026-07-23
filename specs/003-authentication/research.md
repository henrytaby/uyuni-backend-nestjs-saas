# Research & Decisions: Authentication

## 1. Cryptographic Access Tokens & Integration
**Decision:** Use `@nestjs/jwt` and `@nestjs/passport` with the `passport-jwt` strategy.
**Rationale:** Standard, highly tested libraries in the NestJS ecosystem. The `JwtStrategy` will validate the token and populate the `TenantContext` (AsyncLocalStorage) created in Spec 002, ensuring that every authenticated request automatically receives the `tenant_id` and `user_id`.
**Alternatives considered:** Custom middleware. Rejected because Passport provides standard hooks and guards (`AuthGuard('jwt')`).

## 2. Secure Transport & XSS Mitigation
**Decision:** Deliver the Refresh Token via a `Set-Cookie` header (`HttpOnly`, `Secure`, `SameSite=Strict`). The Access Token will be returned in the JSON response body.
**Rationale:** Long-lived tokens (refresh tokens) are prime targets for XSS. Storing them in an `HttpOnly` cookie ensures JavaScript cannot read them. The short-lived access token is safe in memory (or JSON) for ease of use by the SPA client. This directly satisfies FR-002.

## 3. Refresh Token Rotation, Reuse Detection, and Global Logout
**Decision:** Store refresh tokens in a `RefreshToken` persistence table with `is_revoked` (boolean), `replaced_by_id` (self-referencing FK), and `user_id`. 
**Rationale:** 
- **Rotation:** When a refresh token is used, we mark it as `is_revoked = true` and issue a new one. 
- **Reuse Detection:** If an attacker steals a token and uses it, it gets marked revoked. If the legitimate user then uses the same token, the system sees `is_revoked == true`. It then traces the `replaced_by_id` chain and revokes ALL tokens in that session family.
- **Global Logout (FR-008):** To log out from all devices, we simply execute `UPDATE RefreshToken SET is_revoked = true WHERE user_id = ?`.

## 4. Rate Limiting (Password Spraying Mitigation)
**Decision:** Apply `@nestjs/throttler` strictly on the `/auth/login` endpoint (e.g., max 5 requests per minute per IP).
**Rationale:** While the account lockout mechanism (FR-006) protects a *single* user account from brute force, a strict IP rate limit protects the system from distributed password spraying across *many* accounts.

## 5. Account Lockout Mechanism
**Decision:** Re-use the infrastructure columns seeded in the `User` table during Spec 002: `failed_login_attempts` (Int) and `locked_until` (DateTime).
**Rationale:** O(1) read/write performance during login without needing complex table joins.

## 6. MFA Readiness
**Decision:** The JWT payload will include an `amr` (Authentication Methods References) array or an `mfa_verified` boolean. For now, it will always be `false` or `["pwd"]`.
**Rationale:** By defining the token schema to include MFA state now, future phases can enforce MFA on specific endpoints without changing the token issuance architecture.
