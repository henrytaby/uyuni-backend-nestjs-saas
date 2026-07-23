---

description: "Task list for 002-multi-tenancy-core feature implementation"
---

# Tasks: Multi-Tenancy Core

**Input**: Design documents from `/specs/002-multi-tenancy-core/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are included because the spec mandates automated anti-leakage tests (`tenancy-anti-leakage.e2e-spec.ts`) as a critical CI gate (FR-009, SC-001, constitution Principle I). These are REQUIRED, not optional.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/`, `test/` at repository root
- Prisma schema at `prisma/schema.prisma`, migrations at `prisma/migrations/`
- Adjust based on plan.md structure (project root is `/opt/uyuni/uyuni-backend-nestjs-saas`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for the tenancy feature.

- [X] T001 Create the tenancy module directory structure per plan.md (`src/modules/tenancy/{controllers,services,dto}/`, `src/common/context/`, `src/common/guards/`, `src/infrastructure/prisma/extensions/`)
- [X] T002 [P] Install required runtime dependencies (`bcryptjs` for password hashing — pure JS, avoids `node-gyp` native build issues) and dev dependencies (`testcontainers`, `@testcontainers/postgresql` if not present) verifying against `package.json`
- [X] T003 [P] Add `MODULE_ACCESS` canonical module name constant set (auth, tenancy, crm, agenda, sales, inventory) and `TENANT_ROLES` seed set (ADMIN, EMPLEADO, AUDITOR) in `src/modules/tenancy/dto/constants.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented — the request context store, TenantContextMiddleware, TenantGuard, and the Prisma tenant-scoped extension with RLS.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. This phase realizes US3 (Request Context Propagation) machinery plus the anti-leakage enforcement that all stories depend on.

- [X] T004 Define the `TenantContext` interface (tenantId, userId, isPlatformAdmin, requestId) and the AsyncLocalStorage wrapper service in `src/common/context/tenant-context.ts`, reusing the existing `requestContextStorage` exported from `src/common/interceptors/request-context.interceptor.ts` (spec 001)
- [X] T005 Create `TenantContextModule` in `src/common/context/tenant-context.module.ts` exporting the `TenantContextService` wrapper
- [X] T006 Implement `TenantContextMiddleware` in `src/common/context/tenant-context.middleware.ts` that runs `als.run()` and populates the store from the decoded JWT payload (tenant_id, user_id, is_platform_admin) — NEVER from headers/query/body (research.md Task 1 anti-spoofing). Register it as the FIRST middleware in `AppModule` (before ThrottlerGuard). Preserve requestId from pino `genReqId`
- [X] T007 Update `src/common/interceptors/request-context.interceptor.ts` to remove the interceptor body (avoid double ALS wrapping) while keeping the `RequestContext` interface and `requestContextStorage` export intact
- [X] T008 [P] Update `src/infrastructure/logger/logger.module.ts` (spec 001 logger) pino `customProps` to read `tenantId`/`userId` from `requestContextStorage.getStore()` instead of the current hardcoded `null` values
- [X] T009 Create the `@Public()` metadata decorator in `src/common/decorators/public.decorator.ts` for allowlisting routes from TenantGuard
- [X] T010 Implement `TenantGuard` in `src/common/guards/tenant.guard.ts` as a global guard reading `TenantContextService`; reject with 401 when no tenant context AND route is NOT `@Public()`. Register as `APP_GUARD` in `AppModule`
- [X] T011 Add `models.TenantUser` to `prisma/schema.prisma` with tenant_id FK, `@unique([tenantId, userId])`, audit columns, and `@@index([userId])`
- [X] T012 Generate the tenancy migration with `npx prisma migrate dev --create-only --name tenant_core` then manually append RLS SQL (including `FORCE ROW LEVEL SECURITY`). Apply with `npx prisma migrate dev`
- [X] T013 Modify `PrismaService` to apply the tenant-scoped extension via `$extends` on the client instance, injecting `TENANT_SCOPED_MODELS` token for dynamic model registration (Open/Closed Principle)
- [X] T014 Implement the tenant-scoped Prisma extension in `src/infrastructure/prisma/extensions/tenant-scoped.extension.ts` overriding CRUD operations on tenant-scoped models. `findUnique` throws `InternalServerErrorException` directing callers to `findFirst`. Wraps every op in interactive `$transaction` with `SET LOCAL`. 404-not-403 flows naturally from `findFirst` returning null
- [X] T015 Update `PrismaModule` to import `TenantContextModule` and provide `TENANT_SCOPED_MODELS` token with `DEFAULT_TENANT_SCOPED_MODELS`
- [X] T016 Set up Testcontainers harness in `test/e2e/test-container.helper.ts` to spin up a real PostgreSQL 16+ container with RLS-capable role
- [X] T017 [P] Add seed script `prisma/seed.ts` seeding a Free Plan, Pro Plan, and platform-admin User. Register in `package.json` under `prisma.seed`

**Checkpoint**: Foundation ready — context store, middleware, guard, Prisma extension + RLS migration applied.

---

## Phase 3: User Story 1 - Tenant-Scoped Data Isolation (Priority: P1) 🎯 MVP

**Goal**: A user of Tenant A cannot see/modify/delete any data belonging to Tenant B by design — proven by automated anti-leakage e2e against real PostgreSQL with RLS.

### Tests for User Story 1 ⚠️ REQUIRED (FR-009 / SC-001 CI gate)

- [X] T018 [P] [US1] Write `test/e2e/tenancy-anti-leakage.e2e-spec.ts` (Testcontainers + supertest): cross-tenant isolation, forged tenantId override, platform admin bypass, AsyncLocalStorage isolation, tenant GET 404
- [X] T019 [P] [US1] Write `test/e2e/tenancy-guard-coverage.e2e-spec.ts` (SC-002): introspect `HttpAdapterHost` to verify all non-`@Public()` routes have TenantGuard
- [X] T020 [P] [US1] Add performance assertion to `test/e2e/tenancy-anti-leakage.e2e-spec.ts` (SC-004): context propagation overhead < 1ms per request

### Implementation for User Story 1

- [X] T021 [US1] Create `TenantUsersService` using the extended `PrismaService` for create/list/get/update-role/deactivate
- [X] T022 [US1] Create create + response DTOs in `src/modules/tenancy/dto/tenant-user.dto.ts` validated to canonical roles
- [X] T023 [US1] Create `TenantUsersController` mapping CRUD endpoints
- [X] T024 [US1] Ensure 404 (not 403) for cross-tenant IDs end-to-end

**Checkpoint**: User Story 1 fully functional — cross-tenant access is impossible by design.

---

## Phase 4: User Story 2 - Tenant & Plan Management (Priority: P2)

**Goal**: A platform admin can create subscription Plans and Tenants; users can be registered and linked to a tenant as members.

### Tests for User Story 2

- [X] T025 [P] [US2] Write `test/e2e/tenancy-crud.e2e-spec.ts` covering Plans/Tenants/Users/TenantUser CRUD + 409 on constraints + B2 platform-admin guard regression
- [X] T026 [P] [US2] Write validation unit tests for DTOs in `src/modules/tenancy/dto/tenancy-dto.spec.ts`

### Implementation for User Story 2

- [X] T027 [P] [US2] Add the `Plan` model to `prisma/schema.prisma` per data-model.md
- [X] T028 [P] [US2] Add the `Tenant` model to `prisma/schema.prisma`
- [X] T029 [P] [US2] Add the `User` model to `prisma/schema.prisma` (including auth-seeding fields)
- [X] T030 [US2] Create Plan DTOs in `src/modules/tenancy/dto/plan.dto.ts` including `DataTableRequestDto`
- [X] T031 [US2] Create `PlansService`: create/list(get with pagination + default isActive=true)/get/update/soft-delete
- [X] T032 [US2] Create `PlansController` mapping CRUD under `/tenancy/plans` (platform-admin RBAC guard)
- [X] T033 [US2] Create Tenant DTOs in `src/modules/tenancy/dto/tenant.dto.ts` including `TenantQueryDto`
- [X] T034 [US2] Create `TenantsService`: create (validate planId exists AND isActive), list with filters, get (platform admin OR membership), update, soft-delete
- [X] T035 [US2] Create `TenantsController` mapping CRUD under `/tenancy/tenants`
- [X] T036 [US2] Create User DTOs in `src/modules/tenancy/dto/user.dto.ts` including `UserQueryDto`
- [X] T037 [US2] Create `UsersService`: create (bcrypt hash, reject duplicate email), list, get, update, soft-delete
- [X] T038 [US2] Create `UsersController` mapping CRUD under `/tenancy/users` plus `GET /me/tenants` marked `@Public()`
- [X] T039 [US2] Assemble `TenancyModule` wiring all controllers + services; import `PrismaModule` and `TenantContextModule` explicitly (dependency clarity)
- [X] T040 [US2] Wire Swagger auto-documentation for all tenancy endpoints

---

## Phase 5: User Story 3 - Request Context Propagation (Priority: P3)

**Goal**: Verify context propagation end-to-end: audit-column auto-population, platform-admin bypass, middleware-before-guards ordering, RLS secondary defense.

### Tests for User Story 3

- [X] T041 [P] [US3] Write `test/e2e/context-propagation.e2e-spec.ts`: assert audit-column auto-population, concurrent request isolation, performance overhead
- [X] T042 [P] [US3] Write `test/e2e/rls-secondary-defense.e2e-spec.ts` (Testcontainers): query TenantUser without `SET LOCAL` → zero rows
- [X] T043 [US3] Verify audit-column bridge: `created_by_id` auto-populated from context on create
- [X] T044 [US3] Verify platform-admin bypass: `WHERE tenant_id` filter skipped, `app.is_platform_admin='true'` set for RLS policy
- [X] T045 [US3] Verify middleware runs before guards in `app.module.ts`; 401 for unauthenticated protected endpoints
- [X] T046 [US3] Document the RequestContextInterceptor→TenantContextMiddleware transition in `docs/tenancy.md`

**Checkpoint**: All user stories independently functional — context propagation verified end-to-end including RLS secondary defense.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation.

- [X] T047 [P] Add module-access canonical-name JSON-schema validation helper in `src/modules/tenancy/dto/validators.ts`
- [X] T048 [P] Add centralized exception mapping for tenancy errors by updating `GlobalExceptionFilter` to normalize P2002→409 and P2025→404
- [X] T049 Run `npm run lint` and `npm run typecheck` and resolve all tenancy-layer errors
- [X] T050 Run the full quickstart.md validation against the running server + seeded data
- [X] T051 [P] Add `docs/tenancy.md` summarizing the isolation architecture for onboarding

---

## Phase 7: Post-Audit Hardening (from plan.md B1–B7)

**Purpose**: Fixes from the post-implementation audit (plan.md §Audit Findings) plus additional clean-code improvements identified during code review.

- [X] T052 Add `@Public()` and `@RequirePlatformAdmin()` to `GET /tenancy/users/me/tenants` (plan.md B1)
- [X] T053 Create `PlatformAdminGuard` with `@RequirePlatformAdmin()` decorator; register as `APP_GUARD` after TenantGuard; apply to CUD endpoints in all 4 controllers (plan.md B2)
- [X] T054 Add `searchTerm`/`isActive`/`role`/`paymentState` parameters to `list()` signatures with ILIKE search (plan.md B3)
- [X] T055 Fix hardcoded `isActive: true` filters to respect query param with default `true` (plan.md B4)
- [X] T056 Migrate `tenants.service.ts` and `users.service.ts` from deprecated `PrismaService` getters to `TenantContextService` directly (plan.md B7)
- [X] T057 Add e2e regression tests for B2: CUD endpoints reject non-platform-admin (9 tests in `tenancy-crud.e2e-spec.ts`)
- [X] T058 [P] Add `TENANT_SCOPED_MODELS` injection token for dynamic model registration (Open/Closed Principle) — `src/infrastructure/prisma/extensions/tenant-scoped-models.ts`
- [X] T059 [P] Replace `findUnique` raw `Error` throw with `InternalServerErrorException` in Prisma extension (controlled HTTP error)
- [X] T060 [P] Add P2025 (record not found) → 404 mapping in `GlobalExceptionFilter`
- [X] T061 [P] Privatize `tenantContextService` in `PrismaService`; remove deprecated `effectiveTenantId`/`effectiveUserId`/`isPlatformAdmin` getters
- [X] T062 [P] `TenantsService.create` validates `plan.isActive === true` (404 if plan inactive per contracts/tenants.md)
- [X] T063 [P] `PlansService.list` adds pagination (`page`/`pageSize`/`total`) consistent with DataTableRequestDto
- [X] T064 [P] `TenancyModule` imports `TenantContextModule` explicitly for dependency clarity
- [X] T065 [P] `TenantUserQueryDto` and `TenantQueryDto` extracted to their respective DTO files (DRY, co-location)
- [X] T066 [P] `docs/tenancy.md` updated with guard ordering, `@Public()` authentication notes, `findUnique` limitation, security notes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
- **Polish (Phase 6)**: Depends on all user stories being complete.
- **Post-Audit Hardening (Phase 7)**: Depends on Phase 6 + audit findings.

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD for the anti-leakage CI gate).
- Models before services; services before controllers; core before integration.
- Story complete before moving to next priority.

### Parallel Opportunities

- Phase 1: T002–T003 in parallel.
- Phase 2: T008 parallel to guard/extension work; T016 parallel to T017.
- US1 tests: T018 and T019 fully parallel; T020 appended to T018's file.
- US2: T025/T026 tests parallel; T027/T028/T029 model adds parallel.
- US3 tests: T041, T042 fully parallel.
- Phase 7: T052–T066 are mostly parallel (different files).

---

## Notes

- [P] tasks = different files, no dependencies.
- Anti-leakage e2e (`tenancy-anti-leakage.e2e-spec.ts`) is a CI gate — a regression that breaks isolation MUST block the build (constitution Principle I).
- The tenancy Prisma extension wraps every tenant-scoped operation in an interactive `$transaction` with `SET LOCAL` — without this, RLS is silently bypassed under connection pooling (research.md Task 3).
- 404 (not 403) on cross-tenant access is mandatory to prevent information leakage (FR-010, research.md Task 5).
- `TENANT_SCOPED_MODELS` token allows future tenant-scoped entities (CRM, Sales) to register themselves without editing the extension (Open/Closed Principle).
- `findUnique` on tenant-scoped models throws `InternalServerErrorException` directing callers to `findFirst` — documented in `docs/tenancy.md`.
