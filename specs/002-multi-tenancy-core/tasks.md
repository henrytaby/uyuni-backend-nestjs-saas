---
description: 'Task list for 002-multi-tenancy-core feature implementation'
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

- [x] T001 Create the tenancy module directory structure per plan.md (`src/modules/tenancy/{controllers,services,dto}/`, `src/common/context/`, `src/common/guards/`, `src/infrastructure/prisma/extensions/`)
- [x] T002 [P] Install required runtime dependencies (`bcryptjs` for password hashing — pure JS, avoids `node-gyp` native build issues) and dev dependencies (`testcontainers`, `@testcontainers/postgresql` if not present) verifying against `package.json`
- [x] T003 [P] Add `MODULE_ACCESS` canonical module name constant set (auth, tenancy, crm, agenda, sales, inventory) and `TENANT_ROLES` seed set (ADMIN, EMPLEADO, AUDITOR) in `src/modules/tenancy/dto/constants.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented — the request context store, TenantContextMiddleware, TenantGuard, and the Prisma tenant-scoped extension with RLS.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. This phase realizes US3 (Request Context Propagation) machinery plus the anti-leakage enforcement that all stories depend on.

- [x] T004 Define the `TenantContext` interface (tenantId, userId, isPlatformAdmin, requestId) and the AsyncLocalStorage wrapper service in `src/common/context/tenant-context.ts`, reusing the existing `requestContextStorage` exported from `src/common/interceptors/request-context.interceptor.ts` (spec 001)
- [x] T005 Create `TenantContextModule` in `src/common/context/tenant-context.module.ts` exporting the `TenantContextService` wrapper
- [x] T006 Implement `TenantContextMiddleware` in `src/common/context/tenant-context.middleware.ts` that runs `als.run()` and populates the store from the decoded JWT payload (tenant_id, user_id, is_platform_admin) — NEVER from headers/query/body (research.md Task 1 anti-spoofing). Register it as the FIRST middleware in `AppModule` (before ThrottlerGuard). Preserve requestId from pino `genReqId`
- [x] T007 Update `src/common/interceptors/request-context.interceptor.ts` to remove the interceptor body (avoid double ALS wrapping) while keeping the `RequestContext` interface and `requestContextStorage` export intact
- [x] T008 [P] Update `src/infrastructure/logger/logger.module.ts` (spec 001 logger) pino `customProps` to read `tenantId`/`userId` from `requestContextStorage.getStore()` instead of the current hardcoded `null` values
- [x] T009 Create the `@Public()` metadata decorator in `src/common/decorators/public.decorator.ts` for allowlisting routes from TenantGuard
- [x] T010 Implement `TenantGuard` in `src/common/guards/tenant.guard.ts` as a global guard reading `TenantContextService`; reject with 401 when no tenant context AND route is NOT `@Public()`. Register as `APP_GUARD` in `AppModule`
- [x] T011 Add `models.TenantUser` to `prisma/schema.prisma` with tenant_id FK, `@unique([tenantId, userId])`, audit columns, and `@@index([userId])`
- [x] T012 Generate the tenancy migration with `npx prisma migrate dev --create-only --name tenant_core` then manually append RLS SQL (including `FORCE ROW LEVEL SECURITY`). Apply with `npx prisma migrate dev`
- [x] T013 Modify `PrismaService` to apply the tenant-scoped extension via `$extends` on the client instance, injecting `TENANT_SCOPED_MODELS` token for dynamic model registration (Open/Closed Principle)
- [x] T014 Implement the tenant-scoped Prisma extension in `src/infrastructure/prisma/extensions/tenant-scoped.extension.ts` overriding CRUD operations on tenant-scoped models. `findUnique` throws `InternalServerErrorException` directing callers to `findFirst`. Wraps every op in interactive `$transaction` with `SET LOCAL`. 404-not-403 flows naturally from `findFirst` returning null
- [x] T015 Update `PrismaModule` to import `TenantContextModule` and provide `TENANT_SCOPED_MODELS` token with `DEFAULT_TENANT_SCOPED_MODELS`
- [x] T016 Set up Testcontainers harness in `test/e2e/test-container.helper.ts` to spin up a real PostgreSQL 16+ container with RLS-capable role
- [x] T017 [P] Add seed script `prisma/seed.ts` seeding a Free Plan, Pro Plan, and platform-admin User. Register in `package.json` under `prisma.seed`

**Checkpoint**: Foundation ready — context store, middleware, guard, Prisma extension + RLS migration applied.

---

## Phase 3: User Story 1 - Tenant-Scoped Data Isolation (Priority: P1) 🎯 MVP

**Goal**: A user of Tenant A cannot see/modify/delete any data belonging to Tenant B by design — proven by automated anti-leakage e2e against real PostgreSQL with RLS.

### Tests for User Story 1 ⚠️ REQUIRED (FR-009 / SC-001 CI gate)

- [x] T018 [P] [US1] Write `test/e2e/tenancy-anti-leakage.e2e-spec.ts` (Testcontainers + supertest): cross-tenant isolation, forged tenantId override, platform admin bypass, AsyncLocalStorage isolation, tenant GET 404. _(Note: covers cross-tenant isolation with distinct users per tenant; the same-user multi-membership invariant of FR-011 is covered by T081 in Phase 9.)_
- [x] T019 [P] [US1] Write `test/e2e/tenancy-guard-coverage.e2e-spec.ts` (SC-002): introspect `HttpAdapterHost` to verify all non-`@Public()` routes have TenantGuard
- [x] T020 [P] [US1] Add performance assertion to `test/e2e/tenancy-anti-leakage.e2e-spec.ts` (SC-004): context propagation overhead < 1ms per request

### Implementation for User Story 1

- [x] T021 [US1] Create `TenantUsersService` using the extended `PrismaService` for create/list/get/update-role/deactivate
- [x] T022 [US1] Create create + response DTOs in `src/modules/tenancy/dto/tenant-user.dto.ts` validated to canonical roles
- [x] T023 [US1] Create `TenantUsersController` mapping CRUD endpoints
- [x] T024 [US1] Ensure 404 (not 403) for cross-tenant IDs end-to-end

**Checkpoint**: User Story 1 fully functional — cross-tenant access is impossible by design.

---

## Phase 4: User Story 2 - Tenant & Plan Management (Priority: P2)

**Goal**: A platform admin can create subscription Plans and Tenants; users can be registered and linked to a tenant as members.

### Tests for User Story 2

- [x] T025 [P] [US2] Write `test/e2e/tenancy-crud.e2e-spec.ts` covering Plans/Tenants/Users/TenantUser CRUD + 409 on constraints + B2 platform-admin guard regression
- [x] T026 [P] [US2] Write validation unit tests for DTOs in `src/modules/tenancy/dto/tenancy-dto.spec.ts`

### Implementation for User Story 2

- [x] T027 [P] [US2] Add the `Plan` model to `prisma/schema.prisma` per data-model.md
- [x] T028 [P] [US2] Add the `Tenant` model to `prisma/schema.prisma`
- [x] T029 [P] [US2] Add the `User` model to `prisma/schema.prisma` (including auth-seeding fields)
- [x] T030 [US2] Create Plan DTOs in `src/modules/tenancy/dto/plan.dto.ts` including `DataTableRequestDto`
- [x] T031 [US2] Create `PlansService`: create/list(get with pagination + default isActive=true)/get/update/soft-delete
- [x] T032 [US2] Create `PlansController` mapping CRUD under `/tenancy/plans` (platform-admin RBAC guard)
- [x] T033 [US2] Create Tenant DTOs in `src/modules/tenancy/dto/tenant.dto.ts` including `TenantQueryDto`
- [x] T034 [US2] Create `TenantsService`: create (validate planId exists AND isActive), list with filters, get (platform admin OR membership), update, soft-delete
- [x] T035 [US2] Create `TenantsController` mapping CRUD under `/tenancy/tenants`
- [x] T036 [US2] Create User DTOs in `src/modules/tenancy/dto/user.dto.ts` including `UserQueryDto`
- [x] T037 [US2] Create `UsersService`: create (bcrypt hash, reject duplicate email), list, get, update, soft-delete
- [x] T038 [US2] Create `UsersController` mapping CRUD under `/tenancy/users` plus `GET /me/tenants` marked `@Public()`
- [x] T039 [US2] Assemble `TenancyModule` wiring all controllers + services; import `PrismaModule` and `TenantContextModule` explicitly (dependency clarity)
- [x] T040 [US2] Wire Swagger auto-documentation for all tenancy endpoints

---

## Phase 5: User Story 3 - Request Context Propagation (Priority: P3)

**Goal**: Verify context propagation end-to-end: audit-column auto-population, platform-admin bypass, middleware-before-guards ordering, RLS secondary defense.

### Tests for User Story 3

- [x] T041 [P] [US3] Write `test/e2e/context-propagation.e2e-spec.ts`: assert audit-column auto-population, concurrent request isolation, performance overhead
- [x] T042 [P] [US3] Write `test/e2e/rls-secondary-defense.e2e-spec.ts` (Testcontainers): query TenantUser without `SET LOCAL` → zero rows
- [x] T043 [US3] Verify audit-column bridge: `created_by_id` auto-populated from context on create
- [x] T044 [US3] Verify platform-admin bypass: `WHERE tenant_id` filter skipped, `app.is_platform_admin='true'` set for RLS policy
- [x] T045 [US3] Verify middleware runs before guards in `app.module.ts`; 401 for unauthenticated protected endpoints
- [x] T046 [US3] Document the RequestContextInterceptor→TenantContextMiddleware transition in `docs/tenancy.md`

**Checkpoint**: All user stories independently functional — context propagation verified end-to-end including RLS secondary defense.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation.

- [x] T047 [P] Add module-access canonical-name JSON-schema validation helper in `src/modules/tenancy/dto/validators.ts`
- [x] T048 [P] Add centralized exception mapping for tenancy errors by updating `GlobalExceptionFilter` to normalize P2002→409 and P2025→404
- [x] T049 Run `npm run lint` and `npm run typecheck` and resolve all tenancy-layer errors
- [x] T050 Run the full quickstart.md validation against the running server + seeded data
- [x] T051 [P] Add `docs/tenancy.md` summarizing the isolation architecture for onboarding

---

## Phase 7: Post-Audit Hardening (from plan.md B1–B7)

**Purpose**: Fixes from the post-implementation audit (plan.md §Audit Findings) plus additional clean-code improvements identified during code review.

- [x] T052 Apply `@BypassTenant()` to `UsersController` class (inherited by `GET /tenancy/users/me/tenants`) to skip TenantGuard while keeping JWT authentication (plan.md B1)
- [x] T053 Create `PlatformAdminGuard` with `@RequirePlatformAdmin()` decorator; register as `APP_GUARD` after TenantGuard; apply to CUD endpoints in all 4 controllers (plan.md B2)
- [x] T054 Add `searchTerm`/`isActive`/`role`/`paymentState` parameters to `list()` signatures with ILIKE search (plan.md B3)
- [x] T055 Fix hardcoded `isActive: true` filters to respect query param with default `true` (plan.md B4)
- [x] T056 Migrate `tenants.service.ts` and `users.service.ts` from deprecated `PrismaService` getters to `TenantContextService` directly (plan.md B7)
- [x] T057 Add e2e regression tests for B2: CUD endpoints reject non-platform-admin (9 tests in `tenancy-crud.e2e-spec.ts`)
- [x] T058 [P] Add `TENANT_SCOPED_MODELS` injection token for dynamic model registration (Open/Closed Principle) — `src/infrastructure/prisma/extensions/tenant-scoped-models.ts`
- [x] T059 [P] Replace `findUnique` raw `Error` throw with `InternalServerErrorException` in Prisma extension (controlled HTTP error)
- [x] T060 [P] Add P2025 (record not found) → 404 mapping in `GlobalExceptionFilter`
- [x] T061 [P] Privatize `tenantContextService` in `PrismaService`; remove deprecated `effectiveTenantId`/`effectiveUserId`/`isPlatformAdmin` getters
- [x] T062 [P] `TenantsService.create` validates `plan.isActive === true` (404 if plan inactive per contracts/tenants.md)
- [x] T063 [P] `PlansService.list` adds pagination (`page`/`pageSize`/`total`) consistent with DataTableRequestDto
- [x] T064 [P] `TenancyModule` imports `TenantContextModule` explicitly for dependency clarity
- [x] T065 [P] `TenantUserQueryDto` and `TenantQueryDto` extracted to their respective DTO files (DRY, co-location)
- [x] T066 [P] `docs/tenancy.md` updated with guard ordering, `@Public()` authentication notes, `findUnique` limitation, security notes
- [x] T068 Add `@IsEmail()` decorator to `email` field in `CreateUserDto` to enforce format validation alongside unique check.
- [ ] T070 [R1] Refactor context population to read from `req.user` AFTER Passport verification (e.g., via global Interceptor/Guard) instead of raw JWT decoding in `TenantContextMiddleware`.
- [ ] T071 [R2/R3] Update `tenant-scoped.extension.ts` to be **fail-closed**: reads and writes MUST throw `UnauthorizedException` if `tenantId` is missing and caller is not a platform admin.
- [ ] T073 [R8] Modify `tenant-scoped.extension.ts` to intercept `findUnique` and internally transform it into `findFirst` injecting the `tenantId`, rather than throwing a 500 error.
- [ ] T075 [R10] Review and ensure `scopeFilter === 'OWN'` logic in the Prisma extension is entirely inert or safely guarded until RBAC spec 004 is active, to prevent unexpected filtering.
- [ ] T067 Add guard-coverage e2e test specifically for `/tenancy/users` endpoints to assert `PlatformAdminGuard` enforcement, as `User` is not tenant-scoped and lacks RLS protection.
- [ ] T072 [R4] Implement and export `runInTenantTx(prisma, ctx, cb)` helper to guarantee `SET LOCAL` is emitted during manual nested transactions.
- [ ] T074 [R9] Add a strict `NODE_ENV !== 'production'` fail-closed check to `test-tenant-context-source.ts`.
- [ ] T069 Extract hardcoded `bcrypt.hash(..., 10)` rounds to a `BCRYPT_ROUNDS` environment variable validated by Zod.

---

## Phase 9: Membership & Revocation Hardening (constitution v1.3.0)

**Purpose**: Implement the operational isolation mandates added to constitution v1.3.0 — runtime membership verification, bounded revocation, subscription-limit enforcement, and slug-softdelete correctness. These complete Principle I operationally and close the Principle III `maxUsers` gap.

**Rationale**: Architectural isolation (ALS + Prisma extension + RLS) prevents cross-tenant leaks by design, but a deactivated member retains access until token expiry. Constitution v1.3.0 mandates membership verification at `TenantGuard` time (FR-012/FR-013) and `Plan.maxUsers` enforcement on membership creation (FR-014). Without these, the feature is architecturally complete but operationally PARTIAL — acceptable for development, NOT for production tenant onboarding.

- [ ] T076 [M1/FR-012] Implement membership existence check in `TenantGuard`: verify an active `TenantUser(userId=ctx.userId, tenantId=ctx.tenantId, isActive=true)` exists. Cache the result (Redis or in-memory LRU with short TTL) keyed by `userId+tenantId`; invalidate the cache in `TenantUsersService.create/updateRole/deactivate`. Platform superadmins bypass this check. Add e2e test asserting a deactivated member fails on the next guarded request.
- [ ] T077 [M2/FR-013] Establish a bounded revocation window. Choose one: (a) document that spec 003's refresh-token rotation revalidates membership on each refresh and reduce access-token TTL accordingly, OR (b) implement a membership denylist in `TenantGuard`. Verify SC-005 via e2e (offboard mid-session → requests fail within TTL).
- [ ] T078 [M3/FR-014/SC-006] Add atomic `Plan.maxUsers` enforcement in `TenantUsersService.create`: inside a single `$transaction`, count active memberships for the target tenant and compare against the linked `Plan.maxUsers`; throw 403 with an upgrade prompt if exceeded. Verify SC-006 via e2e (plan maxUsers=1, second create → 403).
- [ ] T079 [M6] Fix `CreateTenantDto` slug uniqueness pre-check to respect `is_active = true` (partial index semantics) so that a soft-deleted tenant's slug is reusable. The DB partial unique index already allows this; only the application-level validation currently blocks it.
- [ ] T080 [P] Add e2e regression tests for Phase 9 in a new `test/e2e/tenancy-membership-revocation.e2e-spec.ts` covering FR-012/FR-013/FR-014 (membership revocation time-to-fail + `maxUsers` 403), using the Testcontainers harness from T016.
- [ ] T081 [LOW/FR-011] Add e2e scenario in `tenancy-membership-revocation.e2e-spec.ts` (T080 file): one user with active memberships in two tenants (`tenantA=ADMIN`, `tenantB=EMPLEADO`). Assert: token scoped to `tenantA` → reads only A; token scoped to `tenantB` → reads only B; both pass `TenantGuard`'s membership check (T076). Proves FR-011 + FR-012 jointly — the invariant that multiple memberships coexist and each context isolates correctly. Closes the multi-membership gap not exercised by T018 (distinct users per tenant).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
- **Polish (Phase 6)**: Depends on all user stories being complete.
- **Post-Audit Hardening (Phase 7)**: Depends on Phase 6 + audit findings.
- **Membership & Revocation (Phase 9)**: Depends on Phase 7 (T071 fail-closed extension is a prerequisite for T076's membership check to be meaningful). BLOCKS production tenant onboarding per constitution v1.3.0.

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
- Phase 9: T076 (TenantGuard membership check) is sequential to T071 (fail-closed extension). T077, T078, T079 are mostly parallel (different modules: guard, tenant-users service, tenant DTO). T080 builds the e2e file; T081 appends a scenario to the same file — sequential to T080.

---

## Notes

- [P] tasks = different files, no dependencies.
- Anti-leakage e2e (`tenancy-anti-leakage.e2e-spec.ts`) is a CI gate — a regression that breaks isolation MUST block the build (constitution Principle I).
- The tenancy Prisma extension wraps every tenant-scoped operation in an interactive `$transaction` with `SET LOCAL` — without this, RLS is silently bypassed under connection pooling (research.md Task 3).
- 404 (not 403) on cross-tenant access is mandatory to prevent information leakage (FR-010, research.md Task 5).
- `TENANT_SCOPED_MODELS` token allows future tenant-scoped entities (CRM, Sales) to register themselves without editing the extension (Open/Closed Principle).
- `findUnique` on tenant-scoped models throws `InternalServerErrorException` directing callers to `findFirst` — documented in `docs/tenancy.md`.
- Constitution v1.3.0 (2026-07-23) added operational isolation mandates: membership verification (FR-012), bounded revocation (FR-013), `Plan.maxUsers` enforcement (FR-014), idempotency-key (FR-015/SOFT). Phase 9 tasks (T076-T080) implement them. Until Phase 9 lands, Principle I is architecturally PASS but operationally PARTIAL.
