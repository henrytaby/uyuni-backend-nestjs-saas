# Implementation Plan: Foundation & Bootstrap

**Branch**: `001-foundation-bootstrap` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-foundation-bootstrap/spec.md`

## Summary

Bootstrap the Uyuni SaaS backend from scratch: install NestJS 11, scaffold
the standard repository structure, configure TypeScript strict mode, connect
Prisma to PostgreSQL, set up structured JSON logging with request context,
enable OpenAPI/Swagger auto-documentation, enforce Helmet + strict CORS,
apply a global validation pipeline with class-validator, add per-IP rate
limiting, and expose liveness/readiness health endpoints. This is the
foundational skeleton that all subsequent domain modules depend on. No
authentication, tenant, or business logic is included in this iteration.

## Technical Context

**Language/Version**: TypeScript 5.x strict (no `any`, strict null checks, noImplicitAny)

**Primary Dependencies**: NestJS 11.x, Prisma 7.x (PrismaPg driver adapter), @nestjs/platform-express,
@nestjs/swagger, class-validator, class-transformer, helmet, @nestjs/throttler,
nestjs-pino, pino, zod

**Storage**: PostgreSQL 16+ (via Prisma; minimal schema at this stage)

**Testing**: Jest + supertest (Testcontainers added in e2e tests of later features; foundation uses a minimal health e2e)

**Target Platform**: Linux server (VPS with Nginx reverse proxy; Node 20+ runtime)

**Project Type**: web-service (REST API backend, single project)

**Performance Goals**: Server startup < 5s; health endpoint < 100ms p95

**Constraints**: No `any` type; fail-fast on missing env vars; structured JSON logs only; OIDC/JWT out of scope

**Scale/Scope**: Single service instance initially; designed for horizontal scale behind Nginx

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                               | Status  | Notes                                                                                                                                                                                        |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Strict Multi-Tenant Isolation        | ⚪ N/A  | No tenant logic in this iteration; tenant isolation established in spec 002. Foundation must not block it — repository structure reserves `modules/` for future tenant context.              |
| II. Granular RBAC                       | ⚪ N/A  | No authorization in this iteration. Foundation must not block it — global guard registration point reserved.                                                                                 |
| III. Subscription-Driven Feature Gating | ⚪ N/A  | No plan logic yet. PlanGate guard added in later specs.                                                                                                                                      |
| IV. Immutable Audit Trail               | ✅ PASS | Structured logging with requestId/tenantId/userId fields established now. Full access-log interceptor + CDC fully implemented in spec 005. ALS population implemented in spec 002.           |
| V. API-First Modular Architecture       | ✅ PASS | OpenAPI/Swagger auto-generated from DTOs/Controllers; standard NestJS Feature Module structure reserved (`modules/` directory); decentralized decorator routing; global validation pipeline. |

**Gate evaluation**: No violations to justify. Principles I-III are
intentionally deferred to specs 002-004 and do not apply to the foundation
layer. Principle IV is partially satisfied (structured logging context)
with the full interceptor coming in spec 005. Principle V is fully
addressed by this feature.

## Project Structure

### Documentation (this feature)

```text
specs/001-foundation-bootstrap/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── health.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── main.ts                          # Bootstrap, global pipes/filters/swagger
├── app.module.ts                    # Root module
├── common/
│   ├── filters/
│   │   └── global-exception.filter.ts
│   ├── interceptors/
│   │   └── request-context.interceptor.ts   # Reserve for requestId injection
│   └── config/
│       └── env.validation.ts                  # Zod schema + validate() factory
├── infrastructure/
│   ├── prisma/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── logger/
│   │   └── logger.module.ts                   # nestjs-pino config
│   └── health/
│       ├── health.controller.ts               # /health/live, /health/ready
│       ├── health.module.ts
│       └── indicators/
│           └── prisma-health.indicator.ts
└── modules/                                    # Reserved for future domain modules
prisma/
└── schema.prisma                           # Minimal: datasource + generator
test/
└── e2e/
    └── foundation.e2e-spec.ts
.env.example
```

**Structure Decision**: Single-project NestJS application following the
repository structure mandated by the constitution (src/, prisma/, test/,
plus common/ and infrastructure/). The `modules/` directory is created
(empty, with a .gitkeep) to reserve the location for future domain modules
(auth, tenancy, crm, sales, inventory). This aligns with Principle V —
each future domain will be a self-contained Feature Module placed here.

## Constitution Check (Post-Design Re-Evaluation)

_Re-checked after Phase 1 design (data-model, contracts, quickstart)._

| Principle                               | Status       | Post-Design Verification                                                                                                                                                                                                                    |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Strict Multi-Tenant Isolation        | ⚪ DEFERRED  | No tenant logic in scope. `modules/` dir reserved; data-model confirms minimal Prisma schema with no tenant-scoped models. Anti-leakage tests added in spec 002.                                                                            |
| II. Granular RBAC                       | ⚪ DEFERRED  | No auth in scope. Global guard registration point noted; RBAC guard implemented in spec 004.                                                                                                                                                |
| III. Subscription-Driven Feature Gating | ⚪ DEFERRED  | No plan logic. PlanGate guard implemented in spec 008.                                                                                                                                                                                      |
| IV. Immutable Audit Trail               | ✅ PASS ✓    | Quickstart Scenario 1 verifies structured JSON logs with requestId reserved context. Full access-log interceptor + CDC implemented in spec 005. ALS population in spec 002.                                                                 |
| V. API-First Modular Architecture       | ✅ CONFIRMED | Quickstart Scenario 2 verifies Swagger at /api/docs; data-model documents the error response shape contract; contracts/health.md is the first interface contract; data-model confirms src/modules/ reserved for autonomous Feature Modules. |

**Post-design conclusion**: No violations. Principles I-III are intentionally
deferred to specs 002, 004, 008 and the foundation does not block them.
Principle IV is partially satisfied (structured logging baseline). Principle
V is fully confirmed. No complexity tracking entries needed.

## Complexity Tracking

> No principle violations. One intentional deferral documented below
> per constitution Governance §5 ("Complexity that violates a principle
> MUST be justified in the Implementation Plan's Complexity Tracking
> table").

| Item                                      | Principle                                                                                                             | Status      | Justification                                                                                                                                                                                                                                                           | Mitigation                                                                                                                                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testcontainers deferred to later features | Testing & CI/CD (constitution L218: "E2E tests MUST run against a real PostgreSQL instance in an isolated container") | ⚡ DEFERRED | Foundation ships only a minimal health e2e (plan L28: "Testcontainers added in e2e tests of later features; foundation uses a minimal health e2e"). No domain models exist yet, so full Testcontainers coverage adds setup cost without exercising real business logic. | Re-enabled in spec 002 (multi-tenancy core) when the first domain module + real DB schema introduce meaningful e2e coverage. Foundation e2e uses a configured `DATABASE_URL` against a running PostgreSQL instance in the interim. |
