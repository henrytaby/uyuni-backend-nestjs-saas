# Implementation Plan: Generic Repository & DataTables

**Branch**: `006-generic-repository-datatables` | **Date**: 2026-07-23 | **Spec**: [spec.md](file:///opt/uyuni/uyuni-backend-nestjs-saas/specs/006-generic-repository-datatables/spec.md)

**Input**: Feature specification from `/specs/006-generic-repository-datatables/spec.md`

## Summary

Implement a reusable, tenant-scoped generic repository pattern with standardized
DataTable request/response contracts for all list endpoints. The pattern
encapsulates pagination, multi-column sorting, global search (case-insensitive
partial matching via `contains`/`insensitiveMode`), column-specific filters with
operator support (`equals`, `contains`, `gte`, `lte`, `in`), and automatic
tenant/ownership isolation. Domain modules define only a declarative
`RepositoryConfig` (searchable, filterable, sortable fields, default sort,
includes) and get a fully functional paginated list endpoint with zero
boilerplate. Leverages the existing Prisma Client Extensions for tenant
isolation, soft-delete enforcement, and audit column injection.

## Technical Context

**Language/Version**: TypeScript 5.x strict (ESM with `.js` import extensions)

**Framework**: NestJS 11.x — Feature Module architecture with global guards/interceptors

**ORM**: Prisma 7.x — Client Extensions API (`$extends`/`defineExtension`), PrismaPg driver adapter

**Database**: PostgreSQL 16+ — RLS enabled on tenant-scoped tables

**Validation**: `class-validator` + `class-transformer` — DTOs with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `enableImplicitConversion: true`

**Testing**: Jest + supertest + Testcontainers (real PostgreSQL containers)

**Target Platform**: Node.js backend (REST API with OpenAPI/Swagger)

**Project Type**: NestJS infrastructure module consumed by all domain modules

**Performance Goals**: <500ms for paginated queries on 100K-record tables; <1s for global search on 100K records

**Constraints**: Max page size capped at 100; multi-column sort limited to 3 columns; all queries must run within tenant-scoped interactive transactions

**Scale/Scope**: Up to 100K records per table, up to 50 entities per tenant

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Strict Multi-Tenant Isolation | ✅ PASS | Repository delegates to existing `tenant-scoped.extension.ts` which auto-injects `tenantId` via `set_config` + interactive transactions. No manual tenant filtering in repository code. |
| II. Granular RBAC | ✅ PASS | Ownership scoping (`ANY`/`OWN`) leverages existing `OwnershipScopeInterceptor` which mutates `TenantContext.scopeFilter`. The tenant-scoped extension reads this to inject `createdById` filter. Repository does not duplicate this logic. |
| III. Subscription-Driven Feature Gating | ✅ N/A | Infrastructure module — not a gated domain feature. Available to all plan tiers. |
| IV. Immutable Audit Trail | ✅ PASS | Audit columns (`createdById`, `updatedById`) auto-injected by `audit-columns.extension.ts`. Soft-delete (`isActive=false`) enforced by `tenant-scoped.extension.ts`. No manual audit logic needed. |
| V. API-First Modular Architecture | ✅ PASS | **This feature directly implements** the constitution's mandate: "`TenantScopedRepository<T>` MUST encapsulate pagination, sorting, global search, and tenant isolation. All list endpoints MUST accept a standardized `DataTableRequestDto` and return `{ data: T[], total: number }`." DTOs exposed via OpenAPI/Swagger. |

**Gate Result**: ✅ ALL GATES PASS — No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/006-generic-repository-datatables/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── datatable-api.md # DataTable REST contract
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── common/
│   ├── dto/
│   │   ├── datatable-request.dto.ts    # Standardized request DTO
│   │   └── datatable-response.dto.ts   # Standardized response DTO
│   ├── repository/
│   │   ├── tenant-scoped.repository.ts # Abstract generic repository
│   │   ├── repository-config.interface.ts # Per-entity config interface
│   │   └── index.ts                    # Barrel export
│   └── decorators/
│       └── allow-include-deleted.decorator.ts # @AllowIncludeDeleted decorator
│   └── interceptors/
│       └── include-deleted.interceptor.ts # Strips parameter if no permission
├── infrastructure/
│   └── prisma/                         # Existing — no modifications needed
│       └── extensions/
│           └── tenant-scoped.extension.ts # Already handles isActive, scopeFilter
└── modules/
    └── [domain-module]/                # Consumer pattern example
        ├── repositories/
        │   └── [entity].repository.ts  # Concrete repository extending abstract
        ├── services/
        │   └── [entity].service.ts     # Calls repository.findAll(dto)
        └── controllers/
            └── [entity].controller.ts  # @Query() dto: DataTableRequestDto

test/
├── unit/
│   └── common/
│       └── repository/
│           └── tenant-scoped.repository.spec.ts
└── e2e/
    └── datatable.e2e-spec.ts           # Contract test: all endpoints same shape
```

**Structure Decision**: Infrastructure module within existing `src/common/` directory.
No new NestJS module needed — the abstract repository and DTOs are pure utilities
importable by any domain module. The DTOs replace the existing `DataTableRequestDto`
in `src/modules/tenancy/dto/plan.dto.ts` (which will be refactored to import from
the common location).

## Complexity Tracking

> No Constitution violations detected — this table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |
