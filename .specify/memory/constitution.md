<!--
  Sync Impact Report
  ==================
  Version change: 1.1.0 → 1.2.0 (MINOR)
  Rationale: Upgrade standardized list endpoint response from `{ data, total }` to `{ data, meta: DataTableMetaDto }` to support advanced pagination metadata natively.
  Modified sections: Core Principles (V. API-First Modular Architecture)
  Added sections: None
  Removed sections: None
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ compatible (Constitution Check section generic)
    - .specify/templates/spec-template.md ✅ compatible (no constitution-specific refs)
    - .specify/templates/tasks-template.md ✅ compatible (no constitution-specific refs)
    - .specify/templates/commands/*.md ⚠ not found (no command templates exist)
  Follow-up TODOs: None
-->

# Uyuni SaaS Constitution

## Core Principles

### I. Strict Multi-Tenant Isolation

Every data operation MUST be scoped to a single Tenant. The system MUST enforce
tenant isolation at the infrastructure layer, not by convention.

- All database queries and writes MUST automatically inject `tenant_id` via
  `AsyncLocalStorage` and Prisma extensions — no manual tenant filtering in
  Controllers or Services.
- PostgreSQL Row-Level Security (RLS) MUST be enabled as a secondary defense
  layer.
- Every domain endpoint MUST be protected by `TenantGuard`.
- Cross-tenant data access is mathematically impossible by design; automated
  anti-leakage tests MUST prove this invariant.

**Rationale**: In B2B SaaS, a single tenant data leak is a critical breach.
Architectural enforcement eliminates the human-error vector.

### II. Granular Role-Based Access Control (RBAC)

Access control MUST be module-scoped, action-granular, and ownership-aware.

- Roles (`Admin`, `Empleado`, `Auditor`) are global definitions but MUST be
  assigned per-Tenant via the `TenantUser` membership entity.
- Permissions MUST be defined per module and action (`CREATE`, `READ`,
  `UPDATE`, `DELETE`); no blanket access is permitted.
- The `scope_all` flag MUST determine whether a user sees all Tenant records
  or only their own — this MUST be enforced at the repository layer, not in
  Controllers.
- Platform superadmins MAY bypass RBAC for cross-tenant support, but every
  bypass MUST be logged in the audit trail.

**Rationale**: Fine-grained RBAC prevents privilege escalation and supports
diverse organizational structures across different business niches.

### III. Subscription-Driven Feature Gating

Feature availability and operational limits MUST be governed by the Tenant's
active Plan tier.

- `Plan` entities MUST define quantitative limits (`max_usuarios`,
  `almacenamiento`) and qualitative gates (module access restrictions).
- The system MUST reject operations that exceed Plan limits before execution
  (e.g., inviting a user beyond `max_usuarios` MUST return a 403 with a
  clear upgrade prompt).
- Upgrades and downgrades MUST be handled atomically; a downgrade MUST NOT
  delete data but MAY restrict access to gated modules.
- Tenant payment state (activo, moroso, suspendido) MUST affect feature
  availability.

**Rationale**: Subscription enforcement is the revenue engine of SaaS.
Architectural gating ensures no feature is accidentally accessible without
the corresponding plan tier.

### IV. Immutable Audit Trail

Every mutation and access event MUST be captured immutably and automatically.

- **Access Logs**: An interceptor MUST capture method, route, status, IP,
  `user_id`, and `tenant_id` for every request.
- **Change Data Capture (CDC)**: Every data modification MUST record
  `old_value` vs `new_value`, the actor, and the timestamp. CDC records MUST
  be append-only — no updates or deletes.
- **Soft-Delete**: All deletions MUST be logical (`is_active = false`);
  physical deletion is prohibited on domain entities.
- **Audit Columns**: `created_at` and `updated_at` MUST be managed by Prisma
  natively. `created_by_id`, `updated_by_id`, and `deleted_by_id` MUST be
  injected automatically via a Prisma Extension reading from
  `AsyncLocalStorage` — no developer manual passing is required or allowed.

**Rationale**: Regulatory compliance and operational debugging demand a
complete, tamper-proof history. Automating audit column injection removes
the number-one source of audit gaps: developer forgetfulness.

### V. API-First Modular Architecture

The backend MUST expose all functionality via REST with OpenAPI contracts;
modules MUST be autonomous and decoupled.

- **OpenAPI as Contract**: NestJS MUST auto-generate Swagger documentation
  (`/api/docs`) from DTOs and Controllers. The Angular frontend MUST
  auto-generate its TypeScript interfaces and HTTP services from this
  contract — no manual DTO duplication.
- **Feature Module Autonomy**: Each domain module (auth, crm, sales, etc.)
  MUST be a self-contained NestJS Feature Module with its own Controllers,
  Services, and DTOs. No centralized routing file is permitted.
- **Decentralized Routing**: Routes MUST be defined via decorators on
  Controllers (`@Controller('resource')`) and methods (`@Get()`, `@Post()`);
  module registration in `AppModule` is the only coupling point.
- **Generic Repository Pattern**: A `TenantScopedRepository<T>` MUST
  encapsulate pagination, sorting, global search (searchable fields with
  `ilike`/`contains`), and tenant isolation. All list endpoints MUST accept
  a standardized `DataTableRequestDto` and return `{ data: T[], meta:
  DataTableMetaDto }`.

**Rationale**: Multi-repo projects require a single source of truth for
contracts. Decentralized modules eliminate merge conflicts and enable
parallel development across teams.

## Technology Stack & Architecture Constraints

### Stack

| Layer | Technology | Constraint |
|---|---|---|
| Language | TypeScript 5.x strict | No `any`; strict null checks enabled |
| Framework | NestJS 11.x | Feature Module structure enforced |
| ORM | Prisma 7.x | Migrations only; Client Extensions API (`$extends`/`defineExtension`) for auto-injection; PrismaPg driver adapter required; no raw SQL without review |
| Database | PostgreSQL 16+ | RLS enabled on all tenant-scoped tables |
| Validation | `class-validator` + `class-transformer` | All DTOs MUST use decorators |
| Env Validation | `zod` v4.x | Runtime schema validation for env vars |
| Auth | `@nestjs/jwt` + `passport-jwt` + `bcryptjs` | Refresh token rotation mandatory |
| Logging | `pino` + `nestjs-pino` | Structured JSON only |
| Testing | Jest + supertest + Testcontainers | E2E must use real DB containers |

### Clean Architecture Layers

- **Domain**: Abstract entities and business models — no framework or ORM
  dependencies.
- **Application**: Use-case Services and port interfaces — orchestrates Domain
  through abstractions.
- **Infrastructure**: Concrete implementations (Prisma repositories, mailers,
  loggers) — implements Application ports.
- **Presentation**: REST Controllers, Guards, Interceptors, Exception Filters
  — depends on Application layer only.

### Repository Structure

```text
uyuni-backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/           # Decorators, Guards, Interceptors, Filters
│   ├── infrastructure/   # Prisma, Logger, Mailer
│   └── modules/          # Domain modules (auth, tenancy, crm, sales, etc.)
├── prisma/
│   └── schema.prisma     # Database schema and migrations
├── test/                 # E2E tests
└── package.json
```

### Multi-Repo Contract Enforcement

Backend and Frontend live in separate GitHub repositories. The OpenAPI spec
generated by NestJS is the sole contract. The Angular frontend MUST use
`openapi-generator` or `ng-openapi-gen` to auto-generate its services and
interfaces from the backend's Swagger JSON. Manual type mirroring is
prohibited.

## Domain Modules & Quality Gates

### Domain Modules (ERP-Lite Core)

1. **SaaS Administration & Tenancy**: Subscription management, Plan
   upgrades/downgrades, payment state tracking, user invitations, role
   assignments.
2. **CRM Core (Clients & Contacts)**: Lead/Prospect management, Account/Client
   records, contact directory, interaction history.
3. **Agenda & Tasks (Productivity)**: Calendar appointments/meetings, task
   management, team assignments within Tenant.
4. **Sales & Billing**: Quotation creation, invoice/receipt issuance, basic
   income/expense tracking (petty cash).
5. **Basic Inventory (Logistics — Pro/Premium Plans only)**: Product/service
   catalog, simple stock control, fixed-asset management.

### Dynamic Catalogs

- Catalog Registry system for Tenant-parameterized value lists (e.g., client
  categories, task statuses).
- Bulk Loader endpoint (`POST /catalogs/bulk`) MUST populate multiple
  frontend selectors in a single request.

### Observability (SRE)

- **Structured Logging**: Every log entry MUST be JSON with traceable context
  (`requestId`, `tenantId`, `userId`).
- **Health Checks**: Liveness and Readiness endpoints MUST be available.
- **Telemetry**: Architecture MUST be prepared for OpenTelemetry export.

### Security (DevSecOps)

- Input/output validation MUST occur at the API boundary via DTOs.
- Rate Limiting MUST be enforced per IP, User, and Tenant.
- CORS MUST restrict to the Frontend domain in production; Helmet MUST be
  enabled.
- Account lockout MUST trigger after 5 failed login attempts.

### Testing & CI/CD

- **Testing Pyramid**: Unit tests for business logic; E2E tests for
  Controllers.
- **Testcontainers**: E2E tests MUST run against a real PostgreSQL instance
  in an isolated container.
- **Anti-Leakage Gates**: Automated tests MUST verify that a Tenant A user
  cannot access Tenant B data — this is a non-negotiable CI gate.

## Implementation Status & Progress

> This section tracks the actual implementation state of each architectural
> component and domain module against the specifications in `/specs/`.
> Updated via reverse engineering analysis on 2026-07-23.

### Implemented (In Production Code)

| Component | Spec | Prisma Models | Key Files |
|---|---|---|---|
| Foundation & Bootstrap | 001 | — | `main.ts`, `app.module.ts`, `GlobalExceptionFilter`, `RequestContextInterceptor` |
| Multi-Tenancy Core | 002 | `Tenant`, `TenantUser`, `Plan`, `User` | `tenant-scoped.extension.ts`, `TenantContextMiddleware`, `TenantGuard`, `TenantContextService` |
| Authentication | 003 | `RefreshToken` | `AuthModule`, `JwtStrategy`, `TokenService`, `LockoutService` |
| RBAC | 004 | `Role`, `Permission`, `RoleAssignment` | `RbacModule`, `PermissionsGuard`, `PermissionResolverService`, `OwnershipScopeInterceptor` |
| Audit Infrastructure | 005 | `AccessLog`, `ChangeRecord` | `AuditModule`, `AccessLogInterceptor`, `AuditLogService` |

### Specified but Not Yet Implemented

| Component | Spec | Status | Dependency |
|---|---|---|---|
| Generic Repository & DataTables | 006 | Spec ready | Depends on 002, 004 |
| Dynamic Catalogs | 007 | Spec ready | Depends on 002, 006 |
| SaaS Administration | 008 | Spec ready | Depends on 002, 003, 007 |
| CRM Core | 009 | Spec ready | Depends on 006, 007 |
| Agenda & Tasks | 010 | Spec ready | Depends on 006, 007 |
| Sales & Billing | 011 | Spec ready | Depends on 006, 007, 009 |
| Basic Inventory | 012 | Spec ready | Depends on 006, 007 |

### Current Prisma Schema (10 Models)

`Plan`, `Tenant`, `User`, `TenantUser`, `RefreshToken`, `Role`,
`Permission`, `RoleAssignment`, `AccessLog`, `ChangeRecord`

### Global Guards & Interceptors (Execution Order)

1. `ThrottlerGuard` → 2. `JwtAuthGuard` → 3. `TenantGuard` →
4. `PermissionsGuard` → 5. `PlatformAdminGuard`

Interceptors: `OwnershipScopeInterceptor`, `SuperadminAuditInterceptor`

## Governance

This Constitution is the supreme governing document for all development
decisions on the Uyuni SaaS backend. In case of conflict between this
document and any other practice, convention, or prior decision, this
Constitution takes precedence.

### Amendment Procedure

1. Proposed amendments MUST be documented with rationale and impact analysis.
2. Amendments affecting existing principles MUST include a migration plan for
   in-progress work.
3. Constitution version MUST be incremented per semantic versioning:
   - **MAJOR**: Principle removal or backward-incompatible redefinition.
   - **MINOR**: New principle added or materially expanded guidance.
   - **PATCH**: Clarifications, wording, typo fixes, non-semantic refinements.
4. All PRs and code reviews MUST verify compliance with the current
   Constitution version.
5. Complexity that violates a principle MUST be justified in the
   Implementation Plan's Complexity Tracking table.

### Compliance Review

- Every feature spec MUST include a Constitution Check gate before Phase 0.
- The Constitution Check MUST be re-verified after Phase 1 design.
- Anti-patterns (manual tenant filtering, missing audit columns, centralized
  routing) MUST be caught in code review.

**Version**: 1.2.0 | **Ratified**: 2026-07-07 | **Last Amended**: 2026-07-23
