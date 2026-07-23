---
description: "Task list for 004-rbac implementation"
---

# Tasks: Role-Based Access Control (RBAC)

**Input**: Design documents from `/specs/004-rbac/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes and module scaffolding

- [x] T001 Update `prisma/schema.prisma` with `Role`, `Permission`, and `RoleAssignment` models including enums `PermissionAction` and `PermissionScope`, audit columns, unique constraints, and indexes per data-model.md
- [x] T002 Generate and apply Prisma migration for RBAC tables: `npx prisma migrate dev --name rbac`
- [x] T003 Create RBAC seed script `prisma/seed-rbac.ts` to populate Global system roles (Admin with full CRUD/ANY, Empleado with scoped CRUD/OWN, Auditor with READ-only/ANY) and their permissions
- [x] T004 Create data migration script `prisma/migrate-tenant-user-roles.ts` to convert existing `TenantUser.role` string values to `RoleAssignment` records linked to the matching Global role

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create `RbacModule` base structure in `src/modules/rbac/rbac.module.ts` and register it in `src/app.module.ts`
- [x] T006 [P] Create `@RequirePermissions()` decorator in `src/common/decorators/require-permissions.decorator.ts` that stores module+action metadata via `SetMetadata`
- [x] T007 [P] Create `PermissionResolverService` in `src/modules/rbac/services/permission-resolver.service.ts` implementing the permission resolution algorithm: find TenantUser → load active RoleAssignments → load Permissions → merge union (ANY wins over OWN for same module+action)
- [x] T008 Create `PermissionsGuard` in `src/common/guards/permissions.guard.ts` that reads `@RequirePermissions()` metadata, calls `PermissionResolverService`, and enforces deny-by-default. Register as third `APP_GUARD` in `app.module.ts` (after JwtAuthGuard and TenantGuard)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Module & Action Permission Enforcement (Priority: P1) 🎯 MVP

**Goal**: Enforce module+action permissions on every protected endpoint before business logic executes.

**Independent Test**: As a user with READ-only on CRM, list clients (200 OK) and attempt to create a client (403 Forbidden).

### Implementation for User Story 1

- [x] T009 [US1] Implement superadmin bypass logic in `PermissionsGuard` (`src/common/guards/permissions.guard.ts`): if `isPlatformAdmin === true`, allow READ and UPDATE but block DELETE on tenant transactional data. Log all bypass actions via pino.
- [x] T010 [US1] Create permission DTOs in `src/modules/rbac/dto/permission.dto.ts` with `ApiProperty` decorators for Swagger (module, action, scope fields with validation)
- [x] T011 [US1] Implement `GET /rbac/permissions/effective` endpoint in `src/modules/rbac/controllers/rbac.controller.ts` that returns the merged effective permissions for the current user+tenant (calls `PermissionResolverService`)
- [x] T012 [US1] Implement `GET /rbac/permissions/modules` endpoint in `src/modules/rbac/controllers/rbac.controller.ts` returning the allowed module registry list
- [x] T013 [US1] Add `@RequirePermissions()` decorator to existing `AuthController` protected endpoints as a reference implementation, and add `@ApiBearerAuth()` + Swagger decorators to new RBAC endpoints

**Checkpoint**: At this point, permission enforcement is active on all decorated endpoints

---

## Phase 4: User Story 2 — Ownership-Scoped Access (ANY vs OWN) (Priority: P2)

**Goal**: Enforce `ANY`/`OWN` scope at the data/repository layer so users with `OWN` scope only see their own records.

**Independent Test**: User A (OWN scope) creates a record. User B (OWN scope) cannot see it. User C (ANY scope) sees all.

### Implementation for User Story 2

- [x] T014 [US2] Create `OwnershipScopeInterceptor` in `src/common/interceptors/ownership-scope.interceptor.ts`. It reads the `@RequirePermissions` metadata + `effectivePermissions` to determine if the route enforces an `OWN` scope, then mutates the current `TenantContext` to signal `scope: 'OWN'`.
- [x] T015 [US2] Update the Prisma tenant-scoped extension in `src/infrastructure/prisma/prisma.service.ts` to apply ownership filtering (e.g. `where: { createdById: userId }`) if the context signals an `OWN` scope for reads and writes.
- [x] T016 [US2] Ensure all domain models that support ownership scoping have the `createdById` audit column populated automatically via the existing Prisma extension (verify in `src/infrastructure/prisma/`).

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 — Platform Superadmin Bypass & Compliance (Priority: P3)

**Goal**: Superadmins can READ/UPDATE across tenants but are blocked from DELETE. All actions audited.

**Independent Test**: Superadmin reads Tenant A data (200). Superadmin deletes Tenant A data (403). Server logs show audit entry.

### Implementation for User Story 3

- [x] T017 [US3] Create `SuperadminAuditInterceptor` in `src/common/interceptors/superadmin-audit.interceptor.ts` that detects cross-tenant superadmin actions and logs them via pino with fields: `adminId`, `targetTenantId`, `action`, `resource`, `timestamp`
- [x] T018 [US3] Register `SuperadminAuditInterceptor` globally in `src/app.module.ts` and verify it runs after guards but before controllers
- [x] T019 [US3] Add integration verification: ensure `PermissionsGuard` correctly blocks superadmin DELETE on transactional endpoints and allows READ/UPDATE

**Checkpoint**: Superadmin compliance is active and audited

---

## Phase 6: User Story 4 — Tenant Role Management (Priority: P2)

**Goal**: Tenant admins can create, update, delete custom roles and assign them to users.

**Independent Test**: Admin creates "Gerente de Ventas" role, assigns it, member gets merged permissions.

### Implementation for User Story 4

- [x] T020 [P] [US4] Create role DTOs in `src/modules/rbac/dto/create-role.dto.ts` and `src/modules/rbac/dto/update-role.dto.ts` with validation (name 2-100 chars, permissions array with module/action/scope validation, `ApiProperty` decorators)
- [x] T021 [P] [US4] Create assignment DTO in `src/modules/rbac/dto/assign-role.dto.ts` with `userId` and `roleId` UUID validation and `ApiProperty` decorators
- [x] T022 [US4] Implement `RbacService` in `src/modules/rbac/services/rbac.service.ts` with methods: `listRoles(tenantId)` (global + tenant custom), `createRole(tenantId, dto)`, `updateRole(roleId, dto)` (block if isSystem), `deleteRole(roleId)` (block if isSystem or has active assignments → 409)
- [x] T023 [US4] Implement `RbacService` assignment methods in `src/modules/rbac/services/rbac.service.ts`: `listAssignments(tenantId)`, `assignRole(tenantUserId, roleId, assignedById)`, `removeAssignment(assignmentId)`
- [x] T024 [US4] Implement role CRUD endpoints in `src/modules/rbac/controllers/rbac.controller.ts`: `GET /rbac/roles`, `POST /rbac/roles`, `PATCH /rbac/roles/:id`, `DELETE /rbac/roles/:id` per contracts/rbac-roles.md
- [x] T025 [US4] Implement assignment endpoints in `src/modules/rbac/controllers/rbac.controller.ts`: `GET /rbac/assignments`, `POST /rbac/assignments`, `DELETE /rbac/assignments/:id` per contracts/rbac-role-assignment.md
- [x] T026 [US4] Add Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`) to all RBAC controller endpoints

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T027 Run `quickstart.md` validation scenarios end-to-end (all 5 scenarios)
- [x] T028 Verify that `TenantUser.role` string column migration completed correctly and drop the deprecated column if safe

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational phase completion
- **User Story 2 (Phase 4)**: Depends on US1 (needs PermissionsGuard working)
- **User Story 3 (Phase 5)**: Depends on US1 (needs PermissionsGuard + superadmin logic)
- **User Story 4 (Phase 6)**: Depends on Foundational only (role CRUD is independent of enforcement)
- **Polish (Phase 7)**: Depends on all user stories being complete

### Parallel Opportunities

- T006 and T007 (decorator + resolver service) can be implemented in parallel
- T020 and T021 (DTOs) can be implemented in parallel alongside T022 (service)
- US3 and US4 can be implemented in parallel after US1 is complete

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schema + migration + seed)
2. Complete Phase 2: Foundational (module + decorator + resolver + guard)
3. Complete Phase 3: User Story 1 (permission enforcement)
4. **STOP and VALIDATE**: Test that permissions are enforced on decorated endpoints

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Validates RBAC enforcement
3. Add User Story 4 → Enables role management (can run parallel with US2)
4. Add User Story 2 → Adds ownership scoping at data layer
5. Add User Story 3 → Adds superadmin compliance
