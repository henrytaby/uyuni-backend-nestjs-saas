# Implementation Plan: Authentication

**Branch**: `003-authentication` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-authentication/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement email-based authentication with JWT access tokens (short-lived)
combined with refresh tokens that rotate on each use and detect reuse
(blacklisting the entire session family). Account lockout triggers after 5
failed login attempts. Authenticated users belonging to multiple tenants can
switch their active tenant context without re-logging in. Logout invalidates
the session's tokens. Passwords are hashed with bcrypt. Login responses
include the user's accessible tenants and roles.

## Technical Context

**Language/Version**: TypeScript 5.x strict

**Primary Dependencies**: NestJS 11.x, Prisma 6.x, @nestjs/jwt, passport-jwt,
@nestjs/passport, bcrypt, class-validator, class-transformer, @nestjs/swagger

**Storage**: PostgreSQL 16+ (User table from spec 002; new RefreshToken +
LoginAttempt tables)

**Testing**: Jest + supertest + Testcontainers

**Target Platform**: Linux server (VPS with Nginx reverse proxy)

**Project Type**: web-service

**Performance Goals**: Login response < 2s; token refresh < 500ms; tenant
context switch reflected < 1s

**Constraints**: No usernames (email-only identity); refresh token rotation
mandatory; reuse detection invalidates the session family; lockout after 5
attempts for 15 min; no info leakage (invalid email = invalid password =
same error)

**Scale/Scope**: Thousands of concurrent authenticated users; short-lived
access tokens minimize revocation surface

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Strict Multi-Tenant Isolation | ⚡ PARTIAL | Auth issues JWTs carrying `tenant_id` + `user_id`; the token payload feeds the TenantContext (AsyncLocalStorage) from spec 002. Tenant context switch updates the payload's active tenant. LoginAttempt/RefreshToken are user-scoped (global), not tenant-scoped — no RLS needed on them; they are accessed only by their own user. |
| II. Granular RBAC | ⚡ PARTIAL | Login returns the user's roles per tenant (read from TenantUser). The actual permission enforcement (module+action) is spec 004. Auth provides the identity + role data; RBAC consumes it. |
| III. Subscription-Driven Feature Gating | ⚪ N/A | No plan-gating logic in auth. Tenant payment state could eventually block login, but that's spec 008. Auth does not check features. |
| IV. Immutable Audit Trail | ⚡ PARTIAL | RefreshToken and LoginAttempt records are append-mostly (tokens get `is_revoked` flag — a one-way state change, not an update in the CDC sense). Full access-log capture of login/refresh/logout events arrives in spec 005 via the interceptor; auth events are logged via structured pino logs here. |
| V. API-First Modular Architecture | ✅ PASS | Self-contained AuthModule in modules/auth; controllers auto-documented at /api/docs; decentralized @Controller decorators; DTOs with class-validator. |

**Gate evaluation**: Principle I partially satisfied (JWT provides the
context identity payload that feeds isolation). Principle V fully
addressed. Principles II, IV partial (role payload, structured logging).
Principle III not applicable to auth. No violations — the partials are the
auth layer's natural contribution to those principles; the rest is
implemented by specs 004, 005, 008.

## Project Structure

### Documentation (this feature)

```text
specs/003-authentication/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── auth-login.md
│   ├── auth-tokens.md
│   ├── auth-lockout.md
│   └── auth-tenant-context.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── common/
│   ├── context/
│   │   └── tenant.context.# (from spec 002 — now populated by JwtStrategy)
│   └── guards/
│       └── jwt-auth.guard.ts            # Global JWT guard
├── modules/
│   └── auth/
│       ├── auth.module.ts
│       ├── controllers/
│       │   └── auth.controller.ts      # /auth/login, /auth/refresh, /auth/logout, /auth/tenant-context
│       ├── services/
│       │   ├── auth.service.ts         # Login, logout, tenant switch
│       │   ├── token.service.ts        # Access + refresh token issue/verify
│       │   └── lockout.service.ts      # Failed-attempt tracking + lockout
│       ├── strategies/
│       │   └── jwt.strategy.ts         # Passport strategy; populates TenantContext
│       └── dto/
│           ├── login.dto.ts
│           ├── refresh.dto.ts
│           ├── tenant-context.dto.ts
│           └── ... (response DTOs)
└── prisma/
    ├── schema.prisma                    # Add RefreshToken, LoginAttempt models
    └── migrations/
        └── <ts>_auth/
test/
└── e2e/
    └── auth.e2e-spec.ts                # Login, refresh, reuse, lockout, tenant switch
```

**Structure Decision**: Feature module `auth` in `src/modules/`. The JWT
strategy lives in `auth/strategies/` but is registered globally so every
protected endpoint enforces it via `JwtAuthGuard`. The strategy's
`validate()` payload method populates the `TenantContext` (from spec 002)
so isolation flows automatically. Lockout tracking is a dedicated service
(separation of concerns). LoginAttempt and RefreshToken are user-scoped
global tables (no tenant_id, no RLS) — a user's auth state is independent
of which tenant they're operating in.

## Constitution Check (Post-Design Re-Evaluation)

*Re-checked after Phase 1 design (data-model, contracts, quickstart).*

| Principle | Status | Post-Design Verification |
|-----------|--------|---------------------------|
| I. Strict Multi-Tenant Isolation | ✅ CONFIRMED PARTIAL | data-model defines the JwtPayload carrying `tenant_id`; research documents JwtStrategy populating TenantContext; quickstart Scenario 1 step 2 verifies a protected call uses the token's tenant context. Refresh/LoginAttempt tables correctly scoped as user-global (no RLS) per data-model. |
| II. Granular RBAC | ⚡ CONFIRMED PARTIAL | Login response includes per-tenant roles; tenant switch returns the new role. Enforcement (module+action) is spec 004; auth provides identity + role payload consumed downstream. |
| III. Subscription-Driven Feature Gating | ⚪ N/A | No plan-gating in auth (acknowledged in pre-check); confirmed by design — no endpoint checks Plan. Deferred to spec 008. |
| IV. Immutable Audit Trail | ⚡ CONFIRMED PARTIAL | data-model documents refresh-token `is_revoked` as monotone (one-way state change) + `replaced_by_id` chain; research notes security events logged via pino; quickstart verifies reuse events emit structured logs. Full CDC via the spec 005 extension operates on LoginAttempt/RefreshToken. |
| V. API-First Modular Architecture | ✅ CONFIRMED | self-contained AuthModule in src/modules/auth; 4 contracts (login, tokens, lockout, tenant-context) auto-documented at /api/docs (verified quickstart Setup step 3); JWT strategy populates context for all downstream guards. |

**Post-design conclusion**: No violations. Principle I confirmed-partial
(auth provides the identity payload that feeds isolation; the enforcing
TenantGuard is spec 002 which is a prerequisite). Principles II, IV
confirmed-partial (role payload + monotone token state + structured event
logging; full enforcement/audit in specs 004, 005). Principles III, V — III
N/A, V confirmed. No complexity tracking entries needed.

## Complexity Tracking

> No violations — table intentionally empty.
