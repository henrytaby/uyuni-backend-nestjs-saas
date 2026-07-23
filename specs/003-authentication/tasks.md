---
description: "Task list for 003-authentication implementation"
---

# Tasks: Authentication

**Input**: Design documents from `/specs/003-authentication/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Install authentication dependencies (`@nestjs/jwt`, `passport-jwt`, `@nestjs/passport`, `@nestjs/throttler`, `bcrypt`, `cookie-parser`, and types) in `package.json`
- [x] T002 Update `src/main.ts` to use `cookie-parser` globally

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Update `prisma/schema.prisma` with `RefreshToken` model and user lockout columns, and generate migration
- [x] T004 [P] Create `AuthModule` base structure in `src/modules/auth/auth.module.ts` and register it in `src/app.module.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Email Login with Secure Tokens (Priority: P1) 🎯 MVP

**Goal**: Authenticate users, issue short-lived JWT access tokens and long-lived HttpOnly refresh tokens.

**Independent Test**: Register a user, log in with email/password, receive HttpOnly cookie + access token, and call a protected endpoint.

### Implementation for User Story 1

- [x] T005 [P] [US1] Create login DTO in `src/modules/auth/dto/login.dto.ts`
- [x] T006 [P] [US1] Implement `JwtStrategy` in `src/modules/auth/strategies/jwt.strategy.ts` to validate JWTs and populate `TenantContext`
- [x] T007 [P] [US1] Create global `JwtAuthGuard` in `src/common/guards/jwt-auth.guard.ts`
- [x] T008 [US1] Implement `TokenService` in `src/modules/auth/services/token.service.ts` to generate and sign access and refresh tokens (ensure JWT payload includes `mfa_verified: false` placeholder for FR-015)
- [x] T009 [US1] Implement `AuthService` login method in `src/modules/auth/services/auth.service.ts` (validate bcrypt password, fetch user tenants/roles, call `TokenService`)
- [x] T010 [US1] Implement `AuthController` `/auth/login` endpoint in `src/modules/auth/controllers/auth.controller.ts` with HttpOnly cookie handling
- [x] T011 [US1] Integrate `@nestjs/throttler` in `AuthModule` and apply rate-limiting guard to `AuthController` to mitigate password spraying

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Refresh Token Rotation & Session Management (Priority: P2)

**Goal**: Rotate tokens on use, detect token reuse (invalidating families), and support local and global logout.

**Independent Test**: Log in, refresh successfully, attempt reuse of old token (fails), and log out globally.

### Implementation for User Story 2

- [x] T012 [P] [US2] Update `TokenService` in `src/modules/auth/services/token.service.ts` with refresh token rotation logic (verify, revoke, trace `replaced_by_id` for reuse detection)
- [x] T013 [US2] Update `AuthService` in `src/modules/auth/services/auth.service.ts` with local logout and global logout methods (invalidating refresh tokens in DB)
- [x] T014 [US2] Update `AuthController` in `src/modules/auth/controllers/auth.controller.ts` with `/auth/refresh`, `/auth/logout`, and `/auth/logout/global` endpoints managing cookie cleanup

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Account Lockout & Tenant Context Switch (Priority: P3)

**Goal**: Lock accounts after 5 consecutive failed attempts and allow context switching.

**Independent Test**: Fail login 5 times and verify lockout. Switch tenant context and verify new access token.

### Implementation for User Story 3

- [x] T015 [P] [US3] Create tenant context DTO in `src/modules/auth/dto/tenant-context.dto.ts`
- [x] T016 [US3] Implement `LockoutService` in `src/modules/auth/services/lockout.service.ts` to track attempts and enforce lockout duration on the `User` model
- [x] T017 [US3] Update `AuthService` login method in `src/modules/auth/services/auth.service.ts` to integrate `LockoutService` (increment on fail, reset on success, block if locked)
- [x] T018 [US3] Update `AuthService` with tenant context switch method in `src/modules/auth/services/auth.service.ts` (validate tenant membership, issue new access token)
- [x] T019 [US3] Update `AuthController` in `src/modules/auth/controllers/auth.controller.ts` with `/auth/tenant-context` endpoint

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T020 Run `quickstart.md` validation scenarios end-to-end
- [ ] T021 Run basic automated load tests (e.g., Artillery/k6) on `/auth/login` and `/auth/tenant-context` to verify latencias < 2s and < 1s (SC-001, SC-004) — **DEFERRED**: Not executed in initial implementation; can be done as part of a future performance validation pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion. Must proceed sequentially (US1 → US2 → US3) since services build upon each other.
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### Parallel Opportunities

- T005, T006, and T007 (DTOs and Guards) can be implemented in parallel alongside T008 (TokenService).
- Different team members could work on DTOs/Guards while others work on the persistence layer (Prisma).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Login & Tokens)
4. **STOP and VALIDATE**: Test login with cookies independently.

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Validates basic auth and cookie transport
3. Add User Story 2 → Adds session security and lifecycle management
4. Add User Story 3 → Adds brute-force protection and tenant switching

## Phase 7: Convergence

- [x] T022 Add audit columns (`createdById`, `updatedById`, `deletedById`) to `RefreshToken` model and generate migration per Constitution IV (missing)
