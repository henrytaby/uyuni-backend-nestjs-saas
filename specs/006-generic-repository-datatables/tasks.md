# Tasks: Generic Repository & DataTables

**Input**: Design documents from `/specs/006-generic-repository-datatables/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included in the Polish phase as per typical infrastructure module development, though TDD could be applied per phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Exact file paths are included in descriptions.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

Since this is an infrastructure feature in an existing project, setup is minimal.

- [ ] T001 Create common repository directory structure (`src/common/repository/`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 [P] Create `RepositoryConfig`, `FilterCondition`, `SortItem` interfaces in `src/common/repository/repository-config.interface.ts`
- [ ] T003 [P] Create `DataTableRequestDto` in `src/common/dto/datatable-request.dto.ts` (with class-validator decorators, @ApiPropertyOptional, and @MaxLength(2000) on JSON strings to prevent DoS)
- [ ] T004 [P] Create `DataTableResponseDto` and `DataTableMetaDto` in `src/common/dto/datatable-response.dto.ts` (with @ApiProperty)
- [ ] T005 Create abstract `TenantScopedRepository<TEntity>` base structure in `src/common/repository/tenant-scoped.repository.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Paginated & Sorted Data Listing (Priority: P1) 🎯 MVP

**Goal**: A generic repository that handles pagination and sorting automatically based on standardized DTOs.

**Independent Test**: Can instantiate a concrete test repository and call `findAll` with page, pageSize, sortField, and sortOrder to get a properly formatted `DataTableResponseDto`.

### Implementation for User Story 1

- [ ] T006 [P] [US1] Implement `normalizePagination()` method in `src/common/repository/tenant-scoped.repository.ts` to handle defaults and maximums (max 100)
- [ ] T007 [P] [US1] Implement `validateFieldAllowed()` helper in `src/common/repository/tenant-scoped.repository.ts`
- [ ] T008 [US1] Implement `buildOrderBy()` method in `src/common/repository/tenant-scoped.repository.ts` handling `sort` JSON array (with field deduplication) or `sortField`/`sortOrder` fallback with validation
- [ ] T009 [US1] Implement `formatResponse()` method in `src/common/repository/tenant-scoped.repository.ts` to calculate totalPages, hasNextPage, hasPreviousPage
- [ ] T010 [US1] Implement `findAll()` main method in `src/common/repository/tenant-scoped.repository.ts` using `Promise.all([findMany, count])` with pagination, sorting, and merging `config.includes` to eagerly load relations

**Checkpoint**: At this point, User Story 1 is functional for simple paginated and sorted queries.

---

## Phase 4: User Story 3 - Automatic Tenant Isolation & Scope Enforcement (Priority: P1)

**Goal**: Ensure the repository correctly interfaces with the existing Prisma extensions for tenant isolation and ownership scoping.

**Independent Test**: Call `findAll` and verify `tenant_id` injection happens (handled by extension) and `includeDeleted` flag works.

### Implementation for User Story 3

- [ ] T011 [P] [US3] Create `@AllowIncludeDeleted()` decorator in `src/common/decorators/allow-include-deleted.decorator.ts`
- [ ] T012 [US3] Create `IncludeDeletedInterceptor` in `src/common/interceptors/include-deleted.interceptor.ts` to strip the parameter if the route lacks the decorator or the user lacks the `audit:read` permission
- [ ] T013 [US3] Ensure `findAll()` in `src/common/repository/tenant-scoped.repository.ts` passes the `includeDeleted: true` Prisma argument (now architecturally secured)

**Checkpoint**: User Story 1 & 3 are fully operational (MVP Core).

---

## Phase 5: User Story 2 - Global Search Across Searchable Fields (Priority: P2)

**Goal**: Implement case-insensitive global search across entity-defined searchable fields.

**Independent Test**: Call `findAll` with `searchTerm="foo"` and verify OR conditions are generated for `searchableFields`.

### Implementation for User Story 2

- [ ] T014 [P] [US2] Implement `buildSearchCondition()` method in `src/common/repository/tenant-scoped.repository.ts` (using `contains` and `mode: 'insensitive'` across all `config.searchableFields`)
- [ ] T015 [US2] Create or update `buildWhere()` method in `src/common/repository/tenant-scoped.repository.ts` to incorporate the search conditions

**Checkpoint**: Paginated lists can now be globally searched.

---

## Phase 6: User Story 4 - Column-Specific Filters (Priority: P2)

**Goal**: Support specific field filtering via a JSON payload in the request.

**Independent Test**: Call `findAll` with `filters={"status":{"equals":"ACTIVE"}}` and verify the correct Prisma WHERE clause is generated.

### Implementation for User Story 4

- [ ] T016 [US4] Implement `buildFilterConditions()` in `src/common/repository/tenant-scoped.repository.ts` to parse JSON, validate keys against `config.filterableFields`, and map operators (`equals`, `contains`, `gte`, `lte`, `in`)
- [ ] T017 [US4] Update `buildWhere()` in `src/common/repository/tenant-scoped.repository.ts` to merge search conditions (AND logic) with parsed filter conditions

**Checkpoint**: All user stories should now be independently functional. The repository is complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, migration, and testing.

- [ ] T018 [P] Refactor existing `DataTableRequestDto` in `src/modules/tenancy/dto/plan.dto.ts` to import/extend from `src/common/dto/datatable-request.dto.ts`
- [ ] T019 [P] Export all DTOs and classes via an index file `src/common/repository/index.ts`
- [ ] T020 Write unit tests for `TenantScopedRepository` in `test/unit/common/repository/tenant-scoped.repository.spec.ts`
- [ ] T021 Write e2e contract test for datatables in `test/e2e/datatable.e2e-spec.ts`
- [ ] T022 Write automated anti-leakage tests in `test/e2e/tenant-isolation.e2e-spec.ts` proving cross-tenant and ownership isolation invariants. **CRITICAL: You MUST ensure the test entity is registered in `TENANT_SCOPED_MODELS` (in `tenant-scoped-models.ts`), otherwise the Prisma extension will bypass it and isolation will fail silently.**
- [ ] T023 Run performance baselines for pagination and global search using a 100K record seed script to verify NFR-001/NFR-002
- [ ] T024 Run quickstart.md validation scenarios to ensure complete success

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Proceed in priority order: P1 (US1, US3) → P2 (US2, US4)
- **Polish (Final Phase)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational
- **US3 (P1)**: Can start after US1 or concurrently with US1
- **US2 (P2)**: Depends on US1 (requires base query structure)
- **US4 (P2)**: Depends on US1 and US2 (merges into `buildWhere`)

### Parallel Opportunities

- All Foundational DTOs and interfaces marked [P] can run in parallel (T002, T003, T004)
- Helpers like `normalizePagination` and `validateFieldAllowed` can be built concurrently
- Refactoring existing queries (T016, T017) can be done in parallel with testing

---

## Implementation Strategy

### MVP First (User Story 1 & 3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. Complete Phase 4: User Story 3
5. **STOP and VALIDATE**: Write and execute unit tests (T020) and anti-leakage tests (T022) to prove MVP functionality before proceeding. Do not wait for Phase 7.

### Incremental Delivery (TDD Approach)

1. Complete MVP (US1 + US3) + Tests → Foundation ready, secure, and functional
2. Add User Story 2 (Search) → Write test → Verify
3. Add User Story 4 (Filters) → Write test → Verify
4. Execute remaining Polish phase tasks (T018, T019, T021, T023, T024) for refactoring, e2e, and performance baselines.
