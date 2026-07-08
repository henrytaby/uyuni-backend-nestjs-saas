# Implementation Plan: Multi-Tenancy Core

**Branch**: `002-multi-tenancy-core` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-multi-tenancy-core/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement the multi-tenant data isolation foundation: Plan, Tenant, User,
and TenantUser entities; a request-scoped context store (AsyncLocalStorage)
carrying tenant_id and user_id; automatic tenant_id injection into all
Prisma queries/writes via a Prisma extension; PostgreSQL Row-Level Security
as a secondary defense layer; and a TenantGuard protecting every domain
endpoint. Anti-leakage tests prove cross-tenant data access is impossible.

## Technical Context

**Language/Version**: TypeScript 5.x strict

**Primary Dependencies**: NestJS 11.x, Prisma 6.x, @nestjs/swagger,
class-validator, class-transformer, async_hooks (Node built-in)

**Storage**: PostgreSQL 16+ (tenant-scoped tables, RLS policies, composite
unique indexes)

**Testing**: Jest + supertest + Testcontainers (real PostgreSQL with RLS)

**Target Platform**: Linux server (VPS with Nginx reverse proxy)

**Project Type**: web-service

**Performance Goals**: Context propagation overhead < 1ms; tenant-filtered
list queries on 10k+ records < 500ms

**Constraints**: No manual tenant filtering; RLS on all tenant-scoped
tables; TenantGuard on all domain endpoints; 404 (not 403) on cross-tenant
access to prevent info leakage

**Scale/Scope**: Multiple tenants per DB; 100k+ records/tenant; horizontally
scalable via per-request AsyncLocalStorage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Strict Multi-Tenant Isolation | ✅ PASS | This feature implements Principle I directly: AsyncLocalStorage context, Prisma extension auto-injection, RLS, TenantGuard, anti-leakage tests. |
| II. Granular RBAC | ⚡ PARTIAL | User has is_platform_admin flag; TenantUser carries a role field. Full per-module+action permissions + scope_all enforced in spec 004. |
| III. Subscription-Driven Feature Gating | ⚡ PARTIAL | Plan stores module-access gates + quantitative limits. PlanGate guard that enforces them is implemented in spec 008. |
| IV. Immutable Audit Trail | ⚡ PARTIAL | All entities include created_at/updated_at + created_by_id/updated_by_id/deleted_by_id columns. The auto-injection Prisma extension is implemented in spec 005; columns populated via context reads in the interim. |
| V. API-First Modular Architecture | ✅ PASS | Self-contained TenancyModule in modules/; auto-documented via Swagger; decentralized routing; standard repository structure. |

**Gate evaluation**: Principle I fully addressed. Principles II, III, IV are
seeded (entities/columns/flags exist) with enforcing guards/extensions in
specs 004, 008, 005. No violations — partial implementations are
forward-compatible and explicitly staged.

## Project Structure

### Documentation (this feature)

```text
specs/002-multi-tenancy-core/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── plans.md
│   ├── tenants.md
│   ├── users.md
│   └── tenant-users.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── common/
│   ├── context/
│   │   ├── tenant-context.ts               # AsyncLocalStorage wrapper
│   │   ├── tenant-context.module.ts
│   │   └── tenant-context.interceptor.ts   # Populates context from JWT
│   └── guards/
│       └── tenant.guard.ts                 # Rejects requests w/o tenant context
├── infrastructure/
│   └── prisma/
│       ├── prisma.service.ts
│       ├── prisma.module.ts
│       └── extensions/
│           └── tenant-scoped.extension.ts  # Auto-injects tenant_id on CRUD
├── modules/
│   └── tenancy/
│       ├── tenancy.module.ts
│       ├── controllers/
│       │   ├── plans.controller.ts
│       │   ├── tenants.controller.ts
│       │   ├── users.controller.ts
│       │   └── tenant-users.controller.ts
│       ├── services/
│       │   ├── plans.service.ts
│       │   ├── tenants.service.ts
│       │   ├── users.service.ts
│       │   └── tenant-users.service.ts
│       └── dto/
│           └── ... (create + response DTOs)
└── prisma/
    ├── schema.prisma                       # Plan, Tenant, User, TenantUser models
    └── migrations/
        └── <ts>_tenant_core/               # includes RLS policy SQL
test/
└── e2e/
    └── tenancy-anti-leakage.e2e-spec.ts    # Critical CI gate
```

**Structure Decision**: Feature module `tenancy` in `src/modules/`.
Cross-cutting concerns (AsyncLocalStorage context, TenantGuard) in
`src/common/` since every future domain module depends on them. The
Prisma tenant-scoped extension lives in `src/infrastructure/prisma/extensions/`
(infrastructural, not domain logic). This mapping follows the Clean
Architecture layer boundaries from the constitution.

## Constitution Check (Post-Design Re-Evaluation)

*Re-checked after Phase 1 design (data-model, contracts, quickstart).*

| Principle | Status | Post-Design Verification |
|-----------|--------|---------------------------|
| I. Strict Multi-Tenant Isolation | ✅ CONFIRMED | data-model defines the context shape + RLS matrix; research documents the Prisma extension + RLS `SET LOCAL` coordination; quickstart Scenario 1 + the anti-leakage e2e are the CI gate; contracts/tenant-users.md documents the 404-not-403 rule |
| II. Granular RBAC | ⚡ CONFIRMED PARTIAL | User.isPlatformAdmin + TenantUser.role seeded; contracts specify RBAC per endpoint (platform admin vs tenant admin vs self); full permission matrix in spec 004 — data model flagged the role string as the bridge |
| III. Subscription-Driven Feature Gating | ⚡ CONFIRMED PARTIAL | Plan.moduleAccess JSON + maxUsers limit stored; Tenant.paymentState present; enforcing PlanGate guard + limit checks in spec 008 — staged explicitly |
| IV. Immutable Audit Trail | ⚡ CONFIRMED PARTIAL | All entities include the audit column set; research documents the context-bridge population in this spec with the full extension in spec 005; quickstart Scenario 3 validates created_by_id auto-fill |
| V. API-First Modular Architecture | ✅ CONFIRMED | self-contained TenancyModule in src/modules/; 4 contracts auto-documented at /api/docs; DataTableRequestDto on list endpoints; centralized routing avoided (decentralized @Controller decorators) |

**Post-design conclusion**: No violations. Principle I fully confirmed via
design + tests. Principles II, III, IV are confirmed-partial — the entities/
columns/flags are established here (forward-compatible) with the enforcing
guards/extensions in specs 004, 008, 005. The staging is explicit and does
not break the principles; it satisfies their data-layer prerequisites.

## Complexity Tracking

> No violations — table intentionally empty.
