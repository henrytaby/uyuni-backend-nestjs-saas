# Implementation Plan: Authentication

**Branch**: `003-authentication` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-authentication/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement email-based authentication using `@nestjs/jwt` and Passport. Delivery of long-lived Refresh Tokens is strictly via `HttpOnly` cookies to prevent XSS. Refresh tokens rotate on each use and form a lineage chain to detect reuse, which triggers the blacklisting of the entire session family. Account lockout triggers after 5 failed login attempts to prevent brute force, while `@nestjs/throttler` applies rate-limiting to prevent password spraying. Authenticated users belonging to multiple tenants can switch their active tenant context via an endpoint that issues a fresh token. Includes a Global Logout feature to invalidate all sessions across devices. Passwords are hashed with bcrypt.

## Technical Context

**Language/Version**: TypeScript 5.x strict

**Primary Dependencies**: NestJS 11.x, Prisma 7.x, @nestjs/jwt, passport-jwt, @nestjs/passport, @nestjs/throttler, bcrypt, class-validator, class-transformer

**Storage**: PostgreSQL 16+ (User table from spec 002; new RefreshToken entity)

**Testing**: Jest + supertest (no Testcontainers per user constraint \u2014 VPS with Nginx, no Docker)

**Target Platform**: Linux server (VPS with Nginx reverse proxy)

**Project Type**: web-service

**Performance Goals**: Login response < 2s; token refresh < 500ms; tenant context switch reflected < 1s

**Constraints**: No usernames (email-only identity); refresh token rotation mandatory with HttpOnly delivery; reuse detection invalidates the session family; lockout after 5 attempts for 15 min; no info leakage. *Implementation Constraint:* Express `@Req()` and `@Res()` objects must be typed as `any` in controllers to avoid severe `TS1272` Swagger metadata reflection errors in the build environment.

**Scale/Scope**: Thousands of concurrent authenticated users; short-lived access tokens minimize revocation surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Strict Multi-Tenant Isolation | ⚡ PARTIAL | Auth issues JWTs carrying `tenant_id` + `user_id`. The JwtStrategy validates this token and seamlessly populates the `TenantContext` (AsyncLocalStorage) created in spec 002. RefreshToken is user-scoped (global) so no RLS is needed for its own storage. |
| II. Granular RBAC | ⚡ PARTIAL | Login returns the user's roles per tenant. The actual permission enforcement is spec 004. Auth provides the identity data for RBAC to consume. |
| III. Subscription-Driven Feature Gating | ⚪ N/A | No plan-gating logic in auth. |
| IV. Immutable Audit Trail | ⚡ PARTIAL | RefreshToken records are append-mostly (`is_revoked` is a monotone state change). Security events (e.g., token reuse detection, lockouts) emit structured pino logs. |
| V. API-First Modular Architecture | ✅ PASS | Self-contained AuthModule; controllers auto-documented at /api/docs; decentralized @Controller decorators; DTOs with class-validator. |

**Gate evaluation**: No violations. The partial fulfillments appropriately reflect the authentication layer's contribution to the broader architecture.

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
│   ├── guards/
│   │   └── jwt-auth.guard.ts            # Global JWT guard
│   └── decorators/
│       └── bypass-tenant.decorator.ts   # New: Bypasses global TenantGuard for auth endpoints
├── modules/
│   └── auth/
│       ├── auth.module.ts
│       ├── controllers/
│       │   └── auth.controller.ts      
│       ├── services/
│       │   ├── auth.service.ts         
│       │   ├── token.service.ts        
│       │   └── lockout.service.ts      
│       ├── strategies/
│       │   └── jwt.strategy.ts         # Passport strategy; populates TenantContext
│       └── dto/
│           ├── login.dto.ts
│           ├── refresh.dto.ts
│           └── tenant-context.dto.ts
└── prisma/
    ├── schema.prisma                    # Add RefreshToken model
    └── migrations/
        └── <ts>_auth/
test/
└── e2e/
    └── auth.e2e-spec.ts                # End-to-end scenarios
```

**Structure Decision**: Feature module `auth` in `src/modules/`. The JWT strategy is registered globally so every protected endpoint enforces it via `JwtAuthGuard`. A custom `@BypassTenant()` decorator was added to allow specific endpoints (like context-switch and logout) to bypass the global `TenantGuard`. Rate Limiting is localized to the Auth controller using Throttler decorators. Swagger is configured in `main.ts` with `addBearerAuth()` to support in-browser token testing.

## Constitution Check (Post-Design Re-Evaluation)

*Re-checked after Phase 1 design (data-model, contracts, quickstart).*

| Principle | Status | Post-Design Verification |
|-----------|--------|---------------------------|
| I. Strict Multi-Tenant Isolation | ✅ CONFIRMED PARTIAL | data-model defines the JWT payload; research documents JwtStrategy populating TenantContext; quickstart verifies a protected call uses the token's tenant context. |
| II. Granular RBAC | ⚡ CONFIRMED PARTIAL | Login response includes per-tenant roles; enforcement deferred to spec 004. |
| III. Subscription-Driven Feature Gating | ⚪ N/A | Confirmed by design — no endpoint checks Plan. |
| IV. Immutable Audit Trail | ⚡ CONFIRMED PARTIAL | data-model documents `replaced_by_id` lineage chain and `is_revoked` state. |
| V. API-First Modular Architecture | ✅ CONFIRMED | AuthModule is self-contained. 4 contracts auto-documented at /api/docs. |

**Post-design conclusion**: No violations. The architecture is sound and meets all security and isolation standards.

## Complexity Tracking

> No violations — table intentionally empty.
