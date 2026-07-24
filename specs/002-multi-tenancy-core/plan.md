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

**Primary Dependencies**: NestJS 11.x, Prisma 7.x (`@prisma/client` ^7.8.0 +
PrismaPg driver adapter; Client Extensions API via `Prisma.defineExtension` /
`$extends`), @nestjs/swagger,
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

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                               | Status     | Notes                                                                                                                                                                                                               |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Strict Multi-Tenant Isolation        | ⚡ PARTIAL | Architectural isolation (ALS, Prisma extension, RLS, TenantGuard, anti-leakage tests) implemented. **Re-eval 2026-07-23 (constitution v1.3.0)**: runtime membership verification, context provenance (`req.user` not raw JWT), fail-closed extensions, and bounded revocation are NOT yet implemented in code (T070, T071, T076, T077). See Phase 8 Risk Audit + Phase 9 Membership Audit. |
| II. Granular RBAC                       | ✅ PASS    | Implemented in spec 004 (`PermissionsGuard`, `OwnershipScopeInterceptor` registered in `app.module.ts`). 002 seeds `User.isPlatformAdmin` + `TenantUser.role` — consumed by 004. Staging complete.                  |
| III. Subscription-Driven Feature Gating | ⚡ PARTIAL | Plan stores `moduleAccess` + quantitative limits; `TenantsService.create` validates `plan.isActive`. **Gap**: `PlanGate` guard + `maxUsers` enforcement on `TenantUsersService.create` NOT implemented — deferred to spec 008 per plan. |
| IV. Immutable Audit Trail               | ✅ PASS    | Implemented in spec 005 (`AccessLogInterceptor`, `SuperadminAuditInterceptor`, `cdc.extension`, `append-only.extension` registered in `app.module.ts`). 002 ships audit columns + Prisma-bridge; 005 completes the extension. No longer "bridge-only" — full audit pipeline live. |
| V. API-First Modular Architecture       | ⚡ PARTIAL | Self-contained `TenancyModule`, Swagger auto-doc, decentralized routing. **Gap**: `TenantScopedRepository<T>` + `{ data, meta }` response not yet implemented (spec 006); 002 services return `{ data, total }` with duplicated pagination logic across 4 services. |

**Gate evaluation**: Principle I is architecturally complete but operationally
PARTIAL pending membership verification + revocation (constitution v1.3.0
mandates, tasks T070/T071/T076/T077). Principles II and IV are fully PASS (the
forward specs 004/005 they were staged for have been implemented — see
`app.module.ts` and `constitution.md` Implementation Status). Principle III and
V remain PARTIAL with explicit forward specs (008, 006). No violations — partial
implementations are forward-compatible and explicitly staged.

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
│   │   └── tenant-context.middleware.ts    # Populates context from JWT (MUST be middleware, not interceptor — runs before guards)
│   └── guards/
│       └── tenant.guard.ts                 # Rejects requests w/o tenant context
├── infrastructure/
│   └── prisma/
│       ├── prisma.service.ts
│       ├── prisma.module.ts
│       └── extensions/
│           ├── tenant-scoped.extension.ts  # Auto-injects tenant_id on CRUD (owned by spec 002)
│           ├── audit-columns.extension.ts  # Owned by spec 005
│           ├── cdc.extension.ts            # Owned by spec 005
│           └── append-only.extension.ts    # Owned by spec 005
├── modules/
│   └── tenancy/
│       ├── tenancy.module.ts
│       ├── controllers/
│       │   ├── plans.controller.ts
│       │   ├── tenants.controller.ts
│       │   ├── users.controller.ts         # Includes GET /tenancy/users/me/tenants (contracts/users.md L118)
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
        └── <ts>_tenant_core/               # includes RLS policy SQL (manual edit via --create-only; Prisma does not support RLS natively)
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

### Transition: RequestContextInterceptor (spec 001) → TenantContextMiddleware (spec 002)

Spec 001 shipped `RequestContextInterceptor` in
`src/common/interceptors/request-context.interceptor.ts` which wraps every
request in an `AsyncLocalStorage` (`requestContextStorage`) storing
`requestId`, `ip`, `tenantId` (null), `userId` (null). It is exported but
**not registered as `APP_INTERCEPTOR`** in the foundation AppModule — this
is intentional: the interceptor is a stub reserved for the tenancy layer.

This spec replaces it with **`TenantContextMiddleware`**:

1. **Lifecycle ordering**: Middleware runs _before_ guards; the interceptor
   ran _after_ guards. TenantGuard needs the context populated before it
   evaluates, so middleware is the correct mechanism (see research.md Task 1).
2. **Reuses the same AsyncLocalStorage**: The middleware populates the
   existing `requestContextStorage` exported from the interceptor module
   (kept in `src/common/interceptors/request-context.interceptor.ts` as
   the ALS instance owner). The middleware writes `tenantId`, `userId`,
   `isPlatformAdmin` decoded from the JWT; it preserves the `requestId`
   already generated by pino-http's `genReqId`.
3. **Logger integration**: Spec 001's `logger.module.ts` hardcodes
   `tenantId: null, userId: null` in pino `customProps`. This spec updates
   `customProps` to read from `requestContextStorage.getStore()` so that
   every log line carries the real tenant/user once the middleware has run.
   The middleware is registered as the **first middleware** (before
   `ThrottlerGuard` and any route handler) to guarantee context availability
   for throttling-by-tenant (spec 003) and for logging.
4. **RequestContextInterceptor disposition**: The interceptor class remains
   in the codebase for its `RequestContext` interface and `requestContextStorage`
   export (shared ALS instance), but its interceptor body is removed to
   avoid double-wrapping. A single ALS run() wrapper is owned by the
   middleware.

## Constitution Check (Post-Design Re-Evaluation)

_Re-checked after Phase 1 design (data-model, contracts, quickstart)._

| Principle                               | Status               | Post-Design Verification (Re-eval 2026-07-23, constitution v1.3.0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Strict Multi-Tenant Isolation        | ⚡ PARTIAL           | Architectural isolation confirmed via design (ALS, `SET LOCAL` in `$transaction`, RLS FORCE matrix, global middleware before guards, anti-leakage e2e). **Operational isolation NOT yet in code** (constitution v1.3.0 mandates): (a) context populated via raw JWT `Buffer.from(base64)` not `req.user` — spoofing risk (T070); (b) extension fail-open on null `tenantId` for reads/writes (T071); (c) `TenantGuard` checks only `tenantId !== null`, no membership existence check (T076); (d) no bounded revocation window beyond JWT TTL (T077). See Phase 8 + Phase 9 audits. |
| II. Granular RBAC                       | ✅ PASS              | Spec 004 implemented: `PermissionsGuard` + `OwnershipScopeInterceptor` live in `app.module.ts`. `User.isPlatformAdmin` + `TenantUser.role` seeded here are consumed by 004. `scopeFilter` (`ANY`/`OWN`) is now active via 004's interceptor — T075 ensures the extension's `OWN` branch is safe under live RBAC. **Accepted Compensation (resolved)**: `SuperadminAuditInterceptor` (spec 005) is now live, closing the previously-accepted audit-logging gap for platform-admin bypasses. |
| III. Subscription-Driven Feature Gating | ⚡ PARTIAL           | `Plan.moduleAccess` JSON + `maxUsers` limit stored; `Tenant.paymentState` persisted; `TenantsService.create` rejects inactive plans. **Gap**: `PlanGate` guard + `maxUsers`/`storageLimit` enforcement on `TenantUsersService.create` NOT implemented — a tenant can currently exceed `maxUsers` (violates constitution Principle III line 62). Deferred to spec 008 per plan; tracked here as T078 (atomic limit-check on membership create) as an interim guard. |
| IV. Immutable Audit Trail               | ✅ PASS              | Spec 005 implemented: `AccessLogInterceptor` (request capture) + `SuperadminAuditInterceptor` (bypass logging) + `cdc.extension` (old/new value CDC) + `append-only.extension` live in `app.module.ts`. 002's audit-column bridge (`created_by_id`/`updated_by_id`/`deleted_by_id` via tenant-scoped extension) validated in quickstart Scenario 3. Full audit pipeline operational — no longer "bridge-only". |
| V. API-First Modular Architecture       | ⚡ PARTIAL           | Self-contained `TenancyModule` in src/modules/; 4 contracts auto-documented at /api/docs; decentralized `@Controller` decorators. **Divergence Notes**: (1) 002 services return `{ data, total }` — migration to `{ data, meta }` deferred to spec 006; (2) `DataTableRequestDto` lives in `plan.dto.ts` not `src/common/dto/`; (3) pagination+search logic duplicated across 4 services pending `TenantScopedRepository<T>` (spec 006). All accepted and tracked. |

**Post-design conclusion**: Principles II and IV are PASS — the forward specs
004/005 they were staged for have shipped. Principle I is architecturally
PASS but operationally PARTIAL pending the v1.3.0 membership + revocation
mandates (T070/T071/T076/T077). Principles III and V remain PARTIAL with
explicit forward specs (008, 006). The staging remains non-breaking and
forward-compatible.

### Constitution Security Gate: Rate Limiting (deferred)

The constitution (Security §DevSecOps) mandates rate limiting per IP, User,
**and Tenant**. Spec 001 wired the global ThrottlerGuard (per-IP) already.
**Per-Tenant and per-User throttling is deferred** to spec 003
(Authentication), where the tenant ID is reliably available from the JWT and
a custom ThrottlerGuard can key on `TenantContext.tenantId`. Deferring is
safe because no tenant-scoped endpoints exist until authentication lands;
the per-IP throttle from spec 001 remains active in the meantime.

### Constitution Security Gate: Account Lockout (deferred)

The constitution (Security §DevSecOps) mandates that account lockout MUST
trigger after 5 failed login attempts. This requires authentication token
tracking and login-attempt counters, which depend on the authentication layer.
**Account lockout policy is deferred** to spec 003 (Authentication), where the
login flow and attempt-tracking infrastructure are implemented. Deferring is
safe because no login endpoint exists in spec 002.

However, to avoid a separate schema migration in spec 003, the User entity
seeds the lockout _infrastructure columns_ here: `failed_login_attempts`
(Int, default 0), `locked_until` (DateTime, nullable), `last_login_at`
(DateTime, nullable), and `is_verified` (Boolean, default false). These
columns are persisted in the `tenant_core` migration; spec 003 implements
the increment/lock/unlock/reset logic and the email-verification OTP flow
(`verification_token` table — ephemeral, NOT a User column). The
`is_platform_admin` flag (already present) fulfills the superuser role at a
single level; a two-tier superadmin split would be a spec 004 change.

## Complexity Tracking

> No violations — table intentionally empty.

---

## Audit Findings (Post-Implementation Review)

**Conducted**: 2026-07-09 — Cross-check against spec.md, contracts/, data-model.md, constitution.md, and implementation code.
**Result**: Security gaps found in RBAC and public routes. Code fixes applied.

| ID  | Category                     | Severity     | Location(s)                                                               | Summary                                                                                                                                                                                                                                                          | Fix Applied                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------- | ------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Cross-Cutting (RBAC)         | **CRITICAL** | `users.controller.ts:37`                                                  | `GET /tenancy/users/me/tenants` missing `@BypassTenant()` decorator — violates contracts/users.md:123 which requires TenantGuard bypass for tenant selection before authentication. The `guard-coverage` e2e expected 2 public routes (only `/health/live` was). | Applied `@BypassTenant()` at the UsersController class level (inherited by `GET /me/tenants`); bypasses only TenantGuard. Authentication remains enforced by the global JwtAuthGuard (not `@Public()`, which would skip JWT). `@RequirePlatformAdmin()` was deliberately NOT added because the contract limits this endpoint to any authenticated user. |
| B2  | Cross-Cutting (RBAC)         | **CRITICAL** | All 4 controllers (plans, tenants, users, tenant-users)                   | Platform-admin RBAC guards missing on CUD endpoints. Contracts/plans.md, tenants.md, users.md mandate "Platform admin only" for plan/tenant/user creation/update/delete. Today any authenticated tenant member can create plans/tenants/users.                   | Created `PlatformAdminGuard` with `@RequirePlatformAdmin()` decorator. Registered as `APP_GUARD` in AppModule (after TenantGuard). Applied guard to CUD endpoints in all 4 controllers.                                                                                                                                                                 |
| B3  | Services (Data Filters)      | **HIGH**     | All 4 `list()` methods                                                    | `searchTerm` field in `DataTableRequestDto` defined but not used. Contracts list filters `paymentState` (tenants), `role` (tenant-users), `isActive` (all). These filters are not accepted by controllers or services.                                           | Added `searchTerm`/`isActive`/`role`/`paymentState` parameters to `list()` signatures; implemented `ILIKE` search (PostgreSQL `mode: 'insensitive'`) for email/firstName/lastName (users), name/slug (plans, tenants), user.email/firstName/lastName (tenant-users).                                                                                    |
| B4  | Services (Hardcoded Filters) | **HIGH**     | `tenants.service.ts:29`, `users.service.ts:50`, `plans.service.ts:48`     | `list()` hardcode `isActive: true` instead of respecting query param. Contracts define `isActive` as optional query filter (tenants.md:74, users.md:71, plans.md:84).                                                                                            | Changed where clauses to use `isActive ?? true` (default true) to respect filter.                                                                                                                                                                                                                                                                       |
| B5  | Services (403 Enforcement)   | **MEDIUM**   | `tenant-users.service.ts:13`                                              | Contract (tenant-users.md:53) requires 403 if caller's tenantId != requested tenantId when creating membership. Extension overwrites `tenantId` from context, but no explicit 403 for mismatched tenantId from body.                                             | Extension already injects `tenantId` from context, ignoring body. The team agreed this behavior is preferred over an explicit 403 to avoid leaking tenant existence. Contract updated to reflect silent override.                                                                                                                                       |
| B6  | Module Wiring                | **MEDIUM**   | `tenancy.module.ts`                                                       | TenancyModule doesn't explicitly import `TenantContextModule`. Depends on PrismaModule's `@Global()` status to provide `TenantContextService`. This creates fragility: if PrismaModule changes to non-global, services won't receive context.                    | Kept as-is (PrismaModule is marked `@Global()` per spec 001). No change needed for now.                                                                                                                                                                                                                                                                 |
| B7  | Service Dependencies         | **MEDIUM**   | `prisma.service.ts:60-81`, `tenants.service.ts:58`, `users.service.ts:95` | Deprecated getters (`effectiveTenantId`, `effectiveUserId`, `isPlatformAdmin`) still used by `tenants.service.ts` and `users.service.ts`. Violates clean code principle and defeats deprecation intent.                                                          | Migrated `tenants.service.ts.get()` and `users.service.ts.getTenantsForUser()` to use `TenantContextService` directly (`tenantContext.getTenantId()`, `tenantContext.getUserId()`, `tenantContext.getIsPlatformAdmin()`). Marked deprecated getters in `prisma.service.ts` with `@deprecated` JSDoc.                                                    |

### Security Impact

- **B1**: Allows users to enumerate their tenants before selecting active context. Not a security vulnerability per se, but violates contract and breaks workflow in spec 003 (user needs to see tenants before login).
- **B2**: **CRITICAL SECURITY GAP**. Any tenant member can create plans, tenants, or users. An attacker in Tenant A could create a Plan with malicious `maxUsers` limit or `moduleAccess` to gain elevated privileges. Platform-only CUD must be enforced at infrastructure layer.
- **B3/B4**: Affects filterability of list endpoints. While not a security issue, it violates contracts and reduces data-access ergonomics.

### Remediation Status

| ID  | Status                                                                                            |
| --- | ------------------------------------------------------------------------------------------------- |
| B1  | ✅ Fixed (via `@BypassTenant` + global `JwtAuthGuard`, not `@Public()`+`@RequirePlatformAdmin()`) |
| B2  | ✅ Fixed                                                                                          |
| B3  | ✅ Fixed                                                                                          |
| B4  | ✅ Fixed                                                                                          |
| B5  | ✅ No action (contract updated to prefer silent override over 403)                                |
| B6  | ✅ No action (by design)                                                                          |
| B7  | ✅ Fixed                                                                                          |

### New Tests Required

To verify B2 (platform-admin guard), add e2e test in `tenancy-crud.e2e-spec.ts`:

```typescript
test('CUD endpoints reject non-platform-admin', async () => {
  const res = await request(server)
    .post('/tenancy/plans')
    .set({
      'x-test-tenant-id': tenantId,
      'x-test-user-id': userId,
    })
    .send({
      name: 'ForbiddenPlan',
      tierLevel: 1,
      maxUsers: 10,
      storageLimit: 1073741824,
      moduleAccess: ['auth'],
    });
  expect(res.status).toBe(403);
});
```

Repeat for POST/DELETE/PATCH on tenants and users.

### Constitution Compliance

| Principle                               | Status Post-Fix                                                          |
| --------------------------------------- | ------------------------------------------------------------------------ |
| I. Strict Multi-Tenant Isolation        | ⚡ PARTIAL — architectural isolation live; operational mandates (R1/R2/R3, T070/T071) pending. See Phase 8 + Phase 9. |
| II. Granular RBAC                       | ✅ PASS — platform-admin guard enforced; spec 004 `PermissionsGuard` live |
| III. Subscription-Driven Feature Gating | ⚡ PARTIAL — Plan moduleAccess gate enforced in spec 008 (deferred); `maxUsers` interim guard T078 |
| IV. Immutable Audit Trail               | ✅ PASS — spec 005 audit pipeline live (`AccessLogInterceptor`, `SuperadminAuditInterceptor`, CDC) |
| V. API-First Modular Architecture       | ✅ PASS — contracts matched, Swagger auto-documented                      |

**Security Gate Compliance**: Platform-admin RBAC now enforced at guard layer (Infrastructure/Application boundary), per constitution Security §DevSecOps. Remaining Principle I operational mandates tracked in Phase 9.

---

## Post-Audit Hardening (2026-07-09 — Phase 7)

**Conducted**: 2026-07-09 — Comprehensive code review against spec, contracts, data-model, constitution, and clean-code standards (SOLID, DRY, Open/Closed).

**Result**: All B1–B7 fixes verified + additional clean-code improvements applied.

| ID  | Category              | Severity | Summary                                                                                                                     | Fix Applied                                                                                                                                                                                       |
| --- | --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Cross-Cutting (OCP)   | HIGH     | `TENANT_SCOPED_MODELS` hardcoded as `Set<string>` inside extension — future modules must edit the constant.                 | Extracted to `TENANT_SCOPED_MODELS` injection token with `DEFAULT_TENANT_SCOPED_MODELS` default in `tenant-scoped-models.ts`. New modules register via provider override (Open/Closed Principle). |
| P2  | Extension (DX)        | MEDIUM   | `findUnique` on tenant-scoped models threw raw `Error` → 500 with opaque message.                                           | Replaced with `InternalServerErrorException` directing callers to `findFirst`. Documented in `docs/tenancy.md`.                                                                                   |
| P3  | Services (SRP)        | MEDIUM   | `PrismaService` exposed `tenantContextService` as public + deprecated getters still present.                                | Privatized `tenantContextService`; removed `effectiveTenantId`/`effectiveUserId`/`isPlatformAdmin` getters. Services use `TenantContextService` directly.                                         |
| P4  | Services (Pagination) | HIGH     | `PlansService.list` returned all records without pagination despite `DataTableRequestDto` accepting `page`/`pageSize`.      | Added `skip`/`take` + `count` to `PlansService.list`, consistent with `TenantsService.list` and `UsersService.list`.                                                                              |
| P5  | Services (Contract)   | MEDIUM   | `TenantsService.create` did not validate `plan.isActive` — allowed tenant creation on inactive plan.                        | Added validation: 404 if plan is inactive (`contracts/tenants.md:37`).                                                                                                                            |
| P6  | DTOs (DRY)            | MEDIUM   | Query DTOs (`TenantQueryDto`, `TenantUserQueryDto`, `UserQueryDto`) did not exist — controllers parsed query params ad-hoc. | Created typed query DTOs in their respective DTO files, extending `DataTableRequestDto`. Controllers use typed DTOs.                                                                              |
| P7  | Exception Filter      | MEDIUM   | `GlobalExceptionFilter` did not handle P2025 (Prisma record not found) → 500.                                               | Added P2025 → 404 mapping.                                                                                                                                                                        |
| P8  | Module Wiring         | LOW      | `TenancyModule` did not import `TenantContextModule` explicitly (relied on `@Global()`).                                    | Added explicit import for dependency clarity.                                                                                                                                                     |
| P9  | Test Coverage         | HIGH     | Plan B2 mandated e2e test "CUD endpoints reject non-platform-admin" — test was missing.                                     | Added 9 regression tests in `tenancy-crud.e2e-spec.ts` covering Plans/Tenants/Users CUD with non-admin caller → 403.                                                                              |
| P10 | Documentation         | LOW      | `docs/tenancy.md` lacked guard ordering, `@Public()` auth flow, RLS FORCE, security notes.                                  | Added sections: Guard Ordering, Public Endpoints & Authentication, findUnique limitation, Security Notes.                                                                                         |

### Remediation Status

| ID  | Status   |
| --- | -------- |
| P1  | ✅ Fixed |
| P2  | ✅ Fixed |
| P3  | ✅ Fixed |
| P4  | ✅ Fixed |
| P5  | ✅ Fixed |
| P6  | ✅ Fixed |
| P7  | ✅ Fixed |
| P8  | ✅ Fixed |
| P9  | ✅ Fixed |
| P10 | ✅ Fixed |

---

## Phase 8: Risk Audit (R1-R9)

A secondary audit identified critical isolation and context vulnerabilities that must be addressed before domain modules (spec 009+) depend on this core. These fixes are tracked as tasks `T070` through `T074` and will be implemented immediately.

| ID  | Finding                                                                                | Severity     | Recommendation / Fix Plan                                                                                                      |
| --- | -------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| R1  | `TenantContextMiddleware` decodes raw JWT without verifying signature (Spoofing risk). | **CRITICAL** | Populate `TenantContext` exclusively from `req.user` post-Passport validation. Do not manually parse `Buffer.from(base64url)`. |
| R2  | `tenant-scoped.extension.ts` reads are fail-open when `tenantId` is null.              | **CRITICAL** | Extension reads must throw `UnauthorizedException` if `tenantId` is missing and caller is not `isPlatformAdmin`.               |
| R3  | `tenant-scoped.extension.ts` writes are fail-open when `tenantId` is null.             | **HIGH**     | Extension writes must throw `UnauthorizedException` if `tenantId` is missing. Never accept `tenant_id` from the request body.  |
| R4  | Manual `$transaction` skips `SET LOCAL`, breaking RLS for nested calls.                | **HIGH**     | Expose `runInTenantTx(prisma, ctx, cb)` helper to guarantee `SET LOCAL` is emitted in manual transactions.                     |
| R5  | `isActive` override clashes with DTO `includeDeleted` behavior.                        | **MEDIUM**   | Clarify in contracts that extension is the absolute authority for soft-delete.                                                 |
| R6  | `data-model.md` desynced from actual migrations (partial unique index, cascades).      | **MEDIUM**   | Sync `data-model.md` with Prisma schema.                                                                                       |
| R7  | `BCRYPT_ROUNDS` is hardcoded to 10.                                                    | **MEDIUM**   | Extract to `BCRYPT_ROUNDS` env var (Zod validated). (Tracked as T069).                                                         |
| R8  | `findUnique` throws 500 error in extension, breaking Prisma DX.                        | **MEDIUM**   | Modify extension to internally transform `findUnique` into `findFirst` injecting the `tenantId`.                               |
| R9  | Test context source reads from headers.                                                | **LOW**      | Ensure `test-tenant-context-source` is guarded by a strict `NODE_ENV !== 'production'` fail-closed check.                      |
| R10 | `scopeFilter` ('OWN') prematurely applies `createdById = userId`.                      | **LOW**      | Document as inert currently, but ensure no accidental trigger until RBAC 004 properly enables it.                              |

### Updated Constitution Compliance (Post-Phase 8)

| Principle                               | Status                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| I. Strict Multi-Tenant Isolation        | ⚡ PARTIAL — R1/R2/R3 documented but **PENDING IMPLEMENTATION** in code (T070, T071). R4-R9 similarly pending (T072-T075). |
| II. Granular RBAC                       | ✅ PASS — platform-admin guard enforced on platform-global CUD; spec 004 live.                                              |
| III. Subscription-Driven Feature Gating | ⚡ PARTIAL — Plan moduleAccess gate enforced in spec 008 (deferred).                                                       |
| IV. Immutable Audit Trail               | ✅ PASS — audit columns seeded; spec 005 audit pipeline live (no longer bridge-only).                                      |
| V. API-First Modular Architecture       | ✅ PASS — contracts matched, Swagger auto-documented.                                                                       |

**Security Gate Compliance**: Platform-admin RBAC now enforced at guard layer (Infrastructure/Application boundary), per constitution Security §DevSecOps. The remaining Principle I gap is the fail-closed + provenance + membership mandate added in constitution v1.3.0 (Phase 9).

---

## Phase 9: Membership & Revocation Audit (constitution v1.3.0)

**Conducted**: 2026-07-23 — Re-evaluation of operational isolation against the new constitution v1.3.0 mandates (membership verification, bounded revocation window) and standard B2B SaaS practices. Cross-checked against actual code (`tenant.guard.ts`, `tenant-context-source.ts`, `tenant-scoped.extension.ts`, `app.module.ts`) and the implementation status of forward specs 003/004/005.

**Result**: Architecture is correct; operational hardening is incomplete. 4 new findings (T076-T079) identified, prioritizing membership verification and subscription-limit enforcement.

| ID  | Finding                                                                                                | Severity     | Recommendation / Fix Plan                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `TenantGuard` checks only `tenantId !== null` — no membership existence check (re-entrancy after offboard). | **HIGH**     | `TenantGuard` MUST verify an active `TenantUser(userId, tenantId, isActive=true)` exists per request; cacheable via Redis with invalidation on membership mutation. Tracked as T076.                    |
| M2  | No bounded revocation window beyond JWT TTL — a deactivated member keeps access until access token expiry. | **HIGH**     | Either (a) short-lived access tokens + refresh-token revalidation of membership (already supported by spec 003 `RefreshToken`), OR (b) a membership denylist checked in `TenantGuard`. Tracked as T077. |
| M3  | `TenantUsersService.create` does not enforce `Plan.maxUsers` — a tenant can exceed its subscription limit. | **HIGH**     | Add atomic limit check (count active memberships < `Plan.maxUsers`) inside the same `$transaction` as the membership create; throw 403 with upgrade prompt per constitution Principle III. Tracked as T078. |
| M4  | `BCRYPT_ROUNDS` hardcoded to `10` across 5 files (`users.service.ts`, `seed.ts`, `create-test-user.ts`, 2 e2e fixtures). | **MEDIUM**   | Extract to `BCRYPT_ROUNDS` env var (Zod-validated in `env.validation.ts`); refactor all call sites to read from `ConfigService`. Tracked as T069 (existing).                                             |
| M5  | `TenantsService.get` danger: `id !== ctxTenantId` compares against a context populated by raw-JWT decoding (R1) — a forged JWT escalates here. | **MEDIUM**   | Resolved transitively by T070 (provenance from `req.user`); additionally, M1's membership check makes the context trustworthy. No standalone task.                                                      |
| M6  | `CreateTenantDto` slug uniqueness check via `findFirst({ slug })` ignores `is_active` — collides with soft-deleted tenants' slugs. | **MEDIUM**   | Uniqueness check MUST respect partial index (`WHERE is_active = true`); a soft-deleted slug MUST be reusable. Tracked as T079.                                                                           |
| M7  | Idempotency: `POST /tenancy/tenants` and `POST /tenancy/tenant-users` lack `Idempotency-Key` support — network retries duplicate resources. | **LOW**      | Accepted as non-blocking for 002; tracked for spec 008 (SaaS Administration) where tenant provisioning is finalized. Constitution v1.3.0 marks this as SHOULD.                                          |

### Constitution Compliance (Post-Phase 9)

| Principle                               | Status                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| I. Strict Multi-Tenant Isolation        | ⚡ PARTIAL — architecture PASS; operational mandates (membership M1, revocation M2, provenance R1, fail-closed R2/R3) pending via T070/T071/T076/T077. |
| II. Granular RBAC                       | ✅ PASS — spec 004 live; `scopeFilter` OWN branch safe (T075).                                                                      |
| III. Subscription-Driven Feature Gating | ⚡ PARTIAL — `PlanGate` + `maxUsers` enforcement deferred to spec 008; interim guard T078 added to prevent limit-excess in 002.   |
| IV. Immutable Audit Trail               | ✅ PASS — spec 005 audit pipeline live.                                                                                            |
| V. API-First Modular Architecture       | ⚡ PARTIAL — `{ data, total }` + duplicated pagination deferred to spec 006.                                                       |

**Security Gate Compliance (Post-Phase 9)**: The v1.3.0 constitution mandates
membership verification (Principle I) and idempotency (Security). These are
operational requirements layered on top of the existing architectural isolation.
Implementation is tracked as T076-T079 in tasks.md; until then, Principle I is
architecturally complete but operationally PARTIAL — acceptable for development
but NOT for production tenant onboarding.
