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

- [ ] T001 Create the tenancy module directory structure per plan.md (`src/modules/tenancy/{controllers,services,dto}/`, `src/common/context/`, `src/common/guards/`, `src/infrastructure/prisma/extensions/`)
- [ ] T002 [P] Install required runtime dependencies (`bcryptjs` for password hashing — pure JS, avoids `node-gyp` native build issues) and dev dependencies (`testcontainers`, `@testcontainers/postgresql` if not present) verifying against `package.json`
- [ ] T003 Add `MODULE_ACCESS` canonical module name constant set (auth, tenancy, crm, agenda, sales, inventory) and `TENANT_ROLES` seed set (ADMIN, EMPLEADO, AUDITOR) in `src/modules/tenancy/dto/constants.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented — the request context store, TenantContextMiddleware, TenantGuard, and the Prisma tenant-scoped extension with RLS.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. This phase realizes US3 (Request Context Propagation) machinery plus the anti-leakage enforcement that all stories depend on.

- [ ] T004 Define the `TenantContext` interface (tenantId, userId, isPlatformAdmin, requestId) and the AsyncLocalStorage wrapper service in `src/common/context/tenant-context.ts`, reusing the existing `requestContextStorage` exported from `src/common/interceptors/request-context.interceptor.ts` (spec 001)
- [ ] T005 Create `TenantContextModule` in `src/common/context/tenant-context.module.ts` exporting the `TenantContextService` wrapper
- [ ] T006 Implement `TenantContextMiddleware` in `src/common/context/tenant-context.middleware.ts` that runs `als.run()` and populates the store from the decoded JWT payload (tenant_id, user_id, is_platform_admin) — NEVER from headers/query/body (research.md Task 1 anti-spoofing). Register it as the FIRST middleware in `AppModule` (before ThrottlerGuard). Preserve requestId from pino `genReqId`
- [ ] T007 Update `src/common/interceptors/request-context.interceptor.ts` to remove the interceptor body (avoid double ALS wrapping) while keeping the `RequestContext` interface and `requestContextStorage` export intact
- [ ] T008 [P] Update `src/infrastructure/logger/logger.module.ts` (spec 001 logger) pino `customProps` to read `tenantId`/`userId` from `requestContextStorage.getStore()` instead of the current hardcoded `null` values (customProps at lines 59-60 today hold nulls). This is the access-log capture per constitution Principle IV — pino-http serializes req/res per request, so it is the access log layer (no separate access interceptor exists). (plan.md §Logger integration)
- [ ] T009 Create the `@Public()` metadata decorator in `src/common/decorators/public.decorator.ts` for allowlisting routes from TenantGuard
- [ ] T010 Implement `TenantGuard` in `src/common/guards/tenant.guard.ts` as a global guard reading `TenantContextService`; reject with 401 when no tenant context AND route is NOT `@Public()` (research.md Task 4). Register as `APP_GUARD` in `AppModule`
- [ ] T011 Add `models.TenantUser` to `prisma/schema.prisma` with tenant_id FK, `@unique([tenantId, userId])`, audit columns (created_by_id/updated_by_id/deleted_by_id), and `@@index([userId])` (requires Plan, Tenant, User models added first via US2/T027–T029 — coordinate so the migration batches all four models; see Cross-Phase Coordination Note below)
- [ ] T012 Generate the tenancy migration with `npx prisma migrate dev --create-only --name tenant_core` then manually append RLS SQL to `prisma/migrations/<ts>_tenant_core/migration.sql`: `ALTER TABLE "TenantUser" ENABLE ROW LEVEL SECURITY` + the `isolation_policy` with USING/WITH CHECK using `current_setting('app.is_platform_admin', true)` and `current_setting('app.tenant_id', true)::uuid` (data-model.md RLS matrix, quickstart.md Step 1). Apply with `npx prisma migrate dev`
- [ ] T013 Modify the existing `PrismaService` in `src/infrastructure/prisma/prisma.service.ts` (created by spec 001 with `PrismaPg` adapter) to apply the tenant-scoped extension via `$extends` on the client instance, re-exporting the extended client for consumption by services. The existing class already extends `PrismaClient` with `PrismaPg`; this task adds the `$extends(tenantScopedExtension)` call after `super()`
- [ ] T014 Implement the tenant-scoped Prisma extension in `src/infrastructure/prisma/extensions/tenant-scoped.extension.ts` overriding create/createMany/update/updateMany/upsert/delete/deleteMany/findMany/findUnique/findFirst/count on tenant-scoped models (TenantUser + future tenant-scoped entities): writes inject tenant_id + created_by_id/updated_by_id/deleted_by_id from context; reads add `WHERE tenant_id = ctx.tenantId` unless `isPlatformAdmin`; wrap every op in interactive `$transaction` issuing `SET LOCAL app.tenant_id` (+ `SET LOCAL app.is_platform_admin='true'` when bypassing); detect existing transaction to avoid nesting (research.md Tasks 2 & 3). 404-not-403 flows naturally from `findUnique` returning null (research.md Task 5)
- [ ] T015 Update the existing `PrismaModule` in `src/infrastructure/prisma/prisma.module.ts` (already `@Global()` from spec 001) to import `TenantContextModule` so `PrismaService` can inject `TenantContextService`; ensure the extended `PrismaService` is still exported globally
- [ ] T016 Set up Testcontainers harness in `test/e2e/test-container.helper.ts` to spin up a real PostgreSQL 16+ container with RLS-capable role, shared across the anti-leakage suite
- [ ] T017 [P] Add seed script `prisma/seed.ts` (or extend existing) seeding a Free Plan (tier 1, maxUsers 3, moduleAccess [auth,tenancy,crm,agenda]) and a platform-admin User (isPlatformAdmin true, isVerified true, lastLoginAt now) per quickstart.md Setup. Register the seed command in `package.json` under `prisma.seed` so `npx prisma migrate dev` auto-executes it

**Checkpoint**: Foundation ready — context store, middleware, guard, Prisma extension + RLS migration applied. User-story module work can now begin.

---

## Phase 3: User Story 1 - Tenant-Scoped Data Isolation (Priority: P1) 🎯 MVP

**Goal**: A user of Tenant A cannot see/modify/delete any data belonging to Tenant B by design — proven by automated anti-leakage e2e against real PostgreSQL with RLS.

**Independent Test**: Provision two tenants + memberships; authenticate as Tenant A; assert list returns only Tenant A rows, direct Tenant B ID access yields 404, and a forged `tenantId` body field is overridden by the caller's context (quickstart.md Scenario 1).

### Tests for User Story 1 ⚠️ REQUIRED (FR-009 / SC-001 CI gate)

> **NOTE**: Write the anti-leakage e2e FIRST; it exercises the foundation (Phase 2) + the TenantUser endpoints.

- [ ] T018 [P] [US1] Write `test/e2e/tenancy-anti-leakage.e2e-spec.ts` (Testcontainers + supertest): seed Tenant A + Tenant B + memberships; assert (a) GET /tenancy/tenant-users as Tenant A returns only A memberships, (b) GET /tenancy/tenant-users/:bMembershipId as Tenant A returns 404, (c) POST /tenancy/tenant-users with forged `tenantId=Tenant B` overrides to Tenant A, (d) platform admin bypass reads cross-tenant, (e) concurrent requests with different tenant contexts don't leak (AsyncLocalStorage isolation)
- [ ] T019 [P] [US1] Write `test/e2e/tenancy-guard-coverage.e2e-spec.ts` (SC-002): introspect `HttpAdapterHost` to enumerate registered routes and assert each non-`@Public()` route has TenantGuard in its guard pipeline
- [ ] T020 [P] [US1] Add performance assertion to `test/e2e/tenancy-anti-leakage.e2e-spec.ts` (SC-004): context propagation overhead < 1ms per request vs the spec 001 baseline

### Implementation for User Story 1

- [ ] T021 [US1] Create `TenantUsersService` in `src/modules/tenancy/services/tenant-users.service.ts` using the extended `PrismaService` (no manual tenant filtering) for create/list/get/update-role/deactivate; reject body `tenantId` override by relying on extension injection
- [ ] T022 [US1] Create create + response DTOs in `src/modules/tenancy/dto/tenant-user.dto.ts` (CreateTenantUserDto with tenantId/userId/role validated to ADMIN|EMPLEADO|AUDITOR; UpdateTenantUserDto with role; TenantUserResponseDto excluding audit FKs)
- [ ] T023 [US1] Create `TenantUsersController` in `src/modules/tenancy/controllers/tenant-users.controller.ts` mapping POST/GET (list with DataTableRequestDto)/GET:id/PATCH/DELETE; map `null` findUnique → `NotFoundException` (research.md Task 5)
- [ ] T024 [US1] Ensure the TenantGuard + Prisma extension + RLS chain produces 404 (not 403) for cross-tenant IDs end-to-end in `src/modules/tenancy/controllers/tenant-users.controller.ts`

**Checkpoint**: User Story 1 fully functional — cross-tenant access is impossible by design. Anti-leakage e2e is the CI gate.

---

## Phase 4: User Story 2 - Tenant & Plan Management (Priority: P2)

**Goal**: A platform admin can create a subscription Plan (quantitative limits + module gates) and a Tenant under a Plan; users can be registered and linked to a tenant as members with a role.

**Independent Test**: Create a Plan, create a Tenant under it (paymentState ACTIVO), register a User, create a TenantUser membership; verify relationships and that soft-deleting a Plan in use returns 409 (quickstart.md Scenario 2).

### Tests for User Story 2

- [ ] T025 [P] [US2] Write `test/e2e/tenancy-crud.e2e-spec.ts` covering Plans CRUD (409 on delete-in-use), Tenants CRUD (100 chars name, slug uniqueness, paymentState default ACTIVO), Users CRUD (email unique 409, password never returned), and TenantUser membership creation (409 on duplicate pair)
- [ ] T026 [P] [US2] Write validation unit tests for Plan/Tenant/User/TenantUser DTOs in `src/modules/tenancy/dto/tenancy-dto.spec.ts` (module_access canonical set rejection of unknown names, slug format, role enum). Note: jest `rootDir` is `src/` and `testRegex` is `.*\.spec\.ts$`, so unit tests must live under `src/` to be discovered by `npm test`

### Implementation for User Story 2

- [ ] T027 [P] [US2] Add the `Plan` model to `prisma/schema.prisma` (id, name @unique, tierLevel, maxUsers, storageLimit BigInt, moduleAccess Json, price Decimal nullable, isActive, audit FKs) per data-model.md (coordinate with T011 in one migration)
- [ ] T028 [P] [US2] Add the `Tenant` model to `prisma/schema.prisma` (id, planId FK→Plan, name, slug @unique, paymentState enum ACTIVO|MOROSO|SUSPENDIDO default ACTIVO, subscriptionStart/End, isActive, audit FKs, @@index([planId]))
- [ ] T029 [P] [US2] Add the `User` model to `prisma/schema.prisma` (id, email @unique, passwordHash, firstName/lastName, isPlatformAdmin default false, isVerified default false, failedLoginAttempts Int default 0, lockedUntil DateTime nullable, lastLoginAt DateTime nullable, isActive, self-ref audit FKs created_by_id/updated_by_id/deleted_by_id → User). The auth-seeding fields (isVerified, failedLoginAttempts, lockedUntil, lastLoginAt) are persisted here so spec 003 does not need a migration; the lockout policy + OTP flow are spec 003 (see plan.md §Account Lockout)
- [ ] T030 [US2] Create Plan DTOs in `src/modules/tenancy/dto/plan.dto.ts` (CreatePlanDto: name 1-50, tierLevel 1-10, maxUsers>0, storageLimit>=0, moduleAccess string[] validated to canonical set, price>=0; response DTO excluding audit FKs)
- [ ] T031 [US2] Create `PlansService` in `src/modules/tenancy/services/plans.service.ts`: create/list/get/update; soft-delete (isActive=false) rejecting Plan-in-use by any Tenant → 409; block maxUsers reduction below any tenant's member count → 409 (contracts/plans.md)
- [ ] T032 [US2] Create `PlansController` in `src/modules/tenancy/controllers/plans.controller.ts` mapping POST/GET/GET:id/PATCH/DELETE under `/tenancy/plans` (platform-admin RBAC guard; full PlanGate guard deferred to spec 008)
- [ ] T033 [US2] Create Tenant DTOs in `src/modules/tenancy/dto/tenant.dto.ts` (CreateTenantDto: name 1-100, slug lowercase alphanumeric+hyphens 3-50 @unique, planId UUID; update DTO name/slug/planId; response DTO with plan embedded on GET:id)
- [ ] T034 [US2] Create `TenantsService` in `src/modules/tenancy/services/tenants.service.ts`: create (validate planId exists→404, default paymentState ACTIVO, subscriptionStart=now), list (platform admin) with DataTableRequestDto filters, get (platform admin OR membership; 404 if not member → info-leak prevention), update, soft-delete via DELETE (isActive=false; PATCH must NOT accept isActive per contracts/tenants.md)
- [ ] T035 [US2] Create `TenantsController` in `src/modules/tenancy/controllers/tenants.controller.ts` mapping POST/GET/GET:id/PATCH/DELETE under `/tenancy/tenants`; enforce 404 (not 403) for non-member GET attempts
- [ ] T036 [US2] Create User DTOs in `src/modules/tenancy/dto/user.dto.ts` (CreateUserDto: email @IsEmail unique, password min 8 (hashed via bcryptjs in service), firstName/lastName 1-50 optional, isPlatformAdmin default false; response DTO never includes passwordHash — auth-seeding fields isVerified/failedLoginAttempts/lockedUntil/lastLoginAt are internal-only, not accepted in create body nor returned by these platform-admin CRUD endpoints; they are consumed by spec 003)
- [ ] T037 [US2] Create `UsersService` in `src/modules/tenancy/services/users.service.ts`: create (bcryptjs hash password with cost 10+, reject duplicate email→409, set isVerified=false / failedLoginAttempts=0 / lockedUntil=null / lastLoginAt=null as defaults), list (platform admin), get (platform admin OR self), update, soft-delete via DELETE (is_active=false; does not remove TenantUser memberships). NOTE: this spec does NOT increment login attempts or set lockedUntil — that logic is spec 003; here User CRUD uses DB defaults for auth fields
- [ ] T038 [US2] Create `UsersController` in `src/modules/tenancy/controllers/users.controller.ts` mapping POST/GET/GET:id/PATCH/DELETE under `/tenancy/users` plus `GET /tenancy/users/me/tenants` marked `@Public()` (no TenantGuard) returning the authenticated user's tenants via TenantUser join (contracts/users.md)
- [ ] T039 [US2] Assemble `TenancyModule` in `src/modules/tenancy/tenancy.module.ts` wiring all four controllers + services + DTOs; import PrismaModule, TenantContextModule; export nothing (self-contained per plan.md Structure Decision). Register `TenancyModule` in `AppModule` after the middleware/guard wiring
- [ ] T040 [US2] Wire Swagger auto-documentation for all tenancy endpoints (ApiTags/ApiOperation/ApiBody/ApiResponse) verifying they surface at `/api/docs` (constitution Principle V)

**Checkpoint**: User Stories 1 AND 2 both work independently — full CRUD + isolation proven.

---

## Phase 5: User Story 3 - Request Context Propagation (Priority: P3)

**Goal**: Any authenticated request has tenant_id/user_id available throughout the stack without manual threading; logs carry them; Prisma writes auto-include tenant_id and audit columns; RLS enforces the secondary defense.

**Independent Test**: Make an authenticated request; logs show correct tenantId/userId; a Prisma write auto-includes tenant_id without explicit code; platform-admin bypass reads cross-tenant; RLS blocks reads when app.tenant_id unset (quickstart.md Scenario 3 + edge cases).

> **NOTE**: The machinery for US3 is largely built in Phase 2 (foundational). This phase adds the verification + audit-column bridge wiring + edge-case guarantees.

### Tests for User Story 3

- [ ] T041 [P] [US3] Write `test/e2e/context-propagation.e2e-spec.ts`: assert pino log entries carry tenantId/userId matching the JWT; assert a TenantUser create auto-populates created_by_id from context (no body field); assert concurrent requests from the same user with different tenant contexts are isolated
- [ ] T042 [P] [US3] Write `test/e2e/rls-secondary-defense.e2e-spec.ts` (Testcontainers): query TenantUser directly without `SET LOCAL app.tenant_id` → expect zero rows, proving RLS is the secondary defense (quickstart.md edge case "RLS enforcement with extension bypassed")

### Implementation for User Story 3

- [ ] T043 [US3] Verify that T014's audit-column bridge works correctly in `src/infrastructure/prisma/extensions/tenant-scoped.extension.ts`: confirm that on create `created_by_id=ctx.userId`, on update `updated_by_id=ctx.userId`, on soft-delete `deleted_by_id=ctx.userId` (T014 implements this; this task validates the behavior end-to-end against the US3 acceptance criteria — bridge per data-model.md; full extension in spec 005)
- [ ] T044 [US3] Verify that T014's platform-admin bypass works correctly in `src/infrastructure/prisma/extensions/tenant-scoped.extension.ts`: confirm that `WHERE tenant_id` filter is skipped AND `app.is_platform_admin='true'` is set so RLS policy permits cross-tenant reads (T014 implements this; this task validates the behavior against US3 acceptance criteria — research.md Task 2 + RLS matrix). Verify via T041/T042
- [ ] T045 [US3] Verify middleware runs before guards in `src/app.module.ts` (TenantContextMiddleware registered first); verify 401 for unauthenticated protected endpoints (quickstart.md edge case "Unauthenticated access")
- [ ] T046 [US3] Document the RequestContextInterceptor→TenantContextMiddleware transition in `README.md` or `docs/tenancy.md` (plan.md §Transition) so future contributors understand the single ALS run() owner

**Checkpoint**: All user stories independently functional — context propagation verified end-to-end including RLS secondary defense.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation.

- [ ] T047 [P] Add module-access canonical-name JSON-schema validation helper reused by Plan DTO in `src/modules/tenancy/dto/validators.ts` (rejects duplicates + unknown names per data-model.md Plan validation rules)
- [ ] T048 [P] Add centralized exception mapping for tenancy errors by updating the existing `GlobalExceptionFilter` in `src/common/filters/global-exception.filter.ts` (spec 001) to normalize Prisma P2002 unique-constraint violations to 409 for slug/email/(tenant_id,user_id) with field-specific messages
- [ ] T049 Run `npm run lint` and `npm run typecheck` (or project equivalent) and resolve all tenancy-layer errors
- [ ] T050 Run the full quickstart.md validation (Scenarios 1-3 + edge cases) against the running server + seeded data; capture results as the final acceptance gate
- [ ] T051 [P] Add `docs/tenancy.md` summarizing the isolation architecture (ALS → middleware → guard → Prisma extension → RLS) for onboarding (constitution Principle V knowledge sharing)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories. The Prisma extension (T014) and RLS migration (T011–T012) require the four models; coordinate Phase 2 model adds (T027–T029 from US2) into a single migration to avoid schema drift. Dependency: **T002 → T013/T014**; **T009 before T010**; **T027/T028/T029 + T011 → single T012 migration**.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
  - US1 (Phase 3) depends most directly on Phase 2 (context + guard + extension + RLS) — it is the MVP.
  - US2 (Phase 4) depends on Phase 2 + the model definitions it contributes (T027–T029 are part of the shared migration with T011/T012).
  - US3 (Phase 5) depends on Phase 2 (it verifies + completes the context/RLS wiring) and benefits from US2's entities existing.
- **Polish (Phase 6)**: Depends on all user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2. No dependencies on other stories — it uses TenantUser which the shared migration provides. MVP scope.
- **User Story 2 (P2)**: Can start after Phase 2 (and contributes the Plan/Tenant/User models the shared migration needs). Independently testable via its own CRUD suite.
- **User Story 3 (P3)**: Can start after Phase 2. Verifies + completes the propagation machinery; depends on entities from US2 being available for the audit-column bridge tests.

### Cross-Phase Coordination Note

T027–T029 (Plan, Tenant, User models — listed under US2 for ownership) MUST be added to `prisma/schema.prisma` together with T011's `TenantUser` model before the single tenancy migration (T012) is generated and RLS SQL appended — otherwise the audit FKs (created_by_id → User) and TenantUser.tenant_id → Tenant FKs cannot resolve. Execute these as one coordinated batch at the end of Phase 2 / start of Phase 4.

### Within Each User Story

- Tests (where included) MUST be written and FAIL before implementation (TDD for the anti-leakage CI gate).
- Models before services; services before controllers; core before integration.
- Story complete before moving to next priority.

### Parallel Opportunities

- Phase 1: T002–T003 in parallel (different files).
- Phase 2: T008 (logger) parallel to the guard/extension work; T016 (testcontainers helper) parallel to T017 (seed).
- US1 tests: T018 and T019 fully parallel (separate spec files); T020 appends to the *same file* as T018 (`tenancy-anti-leakage.e2e-spec.ts`), so run T020 sequentially after T018 (or fold it into T018). T020's `[P]` marker denotes it does not depend on US1 implementation tasks, not that it is file-parallel with T018.
- US2: T025/T026 tests parallel; T027/T028/T029 model adds parallel with each other.
- US3 tests: T041, T042 fully parallel.
- A team with 3 developers can run US1, US2, US3 concurrently after Phase 2 (US2 must land its models first to unblock the shared migration, then others proceed).

---

## Parallel Example: User Story 1

```bash
# Launch all required tests for User Story 1 together:
Task: "T018 anti-leakage e2e in test/e2e/tenancy-anti-leakage.e2e-spec.ts"
Task: "T019 guard-coverage e2e in test/e2e/tenancy-guard-coverage.e2e-spec.ts"
Task: "T020 performance assertion appended to tenancy-anti-leakage.e2e-spec.ts"
# (T020 edits the same file as T018 — run sequentially after T018 exists, or combine)
```

## Parallel Example: User Story 2

```bash
# Launch DTO/service/controller triples in parallel batches:
Task: "T030 Plan DTOs in src/modules/tenancy/dto/plan.dto.ts"
Task: "T033 Tenant DTOs in src/modules/tenancy/dto/tenant.dto.ts"
Task: "T036 User DTOs in src/modules/tenancy/dto/user.dto.ts"
# ...then services in parallel (different files):
Task: "T031 PlansService in src/modules/tenancy/services/plans.service.ts"
Task: "T034 TenantsService in src/modules/tenancy/services/tenants.service.ts"
Task: "T037 UsersService in src/modules/tenancy/services/users.service.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories). Land the shared Prisma migration (models + RLS) here even though models are "owned" by US2 tasks — coordinate accordingly.
3. Complete Phase 3: User Story 1 (TenantUsersService + controller + anti-leakage e2e).
4. **STOP and VALIDATE**: Run `test/e2e/tenancy-anti-leakage.e2e-spec.ts` — cross-tenant access must be impossible. This is the constitution's non-negotiable CI gate.
5. Deploy/demo if ready.

### Incremental Delivery

1. Setup + Foundational → Foundation ready (context, middleware, guard, Prisma extension, RLS).
2. Add User Story 1 → Test independently (anti-leakage e2e) → MVP!
3. Add User Story 2 → Test CRUD e2e → Plans/Tenants/Users/memberships functional.
4. Add User Story 3 → Test propagation + RLS secondary-defense e2e → audit-column bridge + bypass verified.
5. Each story adds value without breaking previous stories.

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together (one developer owns the Prisma migration + extension given its cross-model coordination).
2. Once Foundational is done:
   - Developer A: User Story 1 (TenantUsersService + anti-leakage e2e — MVP priority).
   - Developer B: User Story 2 (Plan/Tenant/User services + controllers + CRUD e2e).
   - Developer C: User Story 3 (context-propagation + RLS-secondary-defense e2e + audit-column bridge).
3. Stories complete and integrate independently; US2 must merge its models/migration before US1/US3 e2e can fully run against the DB.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to a specific user story for traceability.
- Each user story should be independently completable and testable.
- Verify tests fail before implementing (TDD for the anti-leakage CI gate).
- Commit after each task or logical group.
- Stop at any checkpoint to validate the story independently.
- Anti-leakage e2e (`tenancy-anti-leakage.e2e-spec.ts`) is a CI gate — a regression that breaks isolation MUST block the build (constitution Principle I).
- The tenancy Prisma extension MUST wrap every tenant-scoped operation in an interactive `$transaction` with `SET LOCAL` — without this, RLS is silently bypassed under connection pooling (research.md Task 3).
- 404 (not 403) on cross-tenant access is mandatory to prevent information leakage (FR-010, research.md Task 5).
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.
