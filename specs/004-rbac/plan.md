# Implementation Plan: Role-Based Access Control (RBAC)

**Branch**: `004-rbac` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-rbac/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement granular Role-Based Access Control with module-scoped, action-granular permissions using an `ANY`/`OWN` ownership scope model evaluated per-permission. Roles can be Global (system-wide) or Custom (tenant-scoped). A `PermissionsGuard` enforces RBAC on every protected endpoint before business logic executes. Ownership scope is enforced at the repository/data layer via the existing `TenantScopedRepository` pattern. Platform superadmins can bypass RBAC for READ/UPDATE but are blocked from DELETE on tenant transactional data. All bypass actions are logged. Permissions are resolved from the database on every request — no caching.

## Technical Context

**Language/Version**: TypeScript 5.x strict

**Primary Dependencies**: NestJS 11.x, Prisma 7.x, @nestjs/passport, passport-jwt, class-validator, class-transformer

**Storage**: PostgreSQL 16+ (extend existing schema with Role, Permission, RoleAssignment tables)

**Testing**: Jest + supertest (no Testcontainers per user constraint — VPS with Nginx)

**Target Platform**: Linux server (VPS with Nginx reverse proxy)

**Project Type**: web-service

**Performance Goals**: Permission resolution < 50ms per request; role assignment changes reflected < 1 request cycle

**Constraints**: Permissions resolved from DB per-request (no JWT-embedded permissions, no cache). Express `@Req()` and `@Res()` typed as `any` (TS1272 workaround). Deny-by-default policy. Superadmin DELETE restricted for SOC2 compliance.

**Scale/Scope**: Hundreds of roles per tenant; thousands of concurrent authenticated users; ~7 modules × 4 actions = ~28 permission slots per role.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Strict Multi-Tenant Isolation | ✅ PASS | Custom Roles are scoped by `tenantId`. Permission queries always filter by tenant context. RLS provides secondary defense. |
| II. Granular RBAC | ✅ DIRECT | This feature IS the RBAC implementation. Per-module, per-action, `ANY`/`OWN` scope enforced at repository layer. |
| III. Subscription-Driven Feature Gating | ⚪ N/A | No plan-gating logic in RBAC. Module access restrictions by Plan are a separate concern. |
| IV. Immutable Audit Trail | ⚡ PARTIAL | Superadmin bypass actions logged via structured pino logs. Full CDC deferred to spec 005. Audit columns (`createdById`, `updatedById`, `deletedById`) on all new entities. |
| V. API-First Modular Architecture | ✅ PASS | Self-contained RbacModule. Controllers auto-documented at /api/docs. Decentralized `@Controller` decorators. DTOs with class-validator. |

**Gate evaluation**: No violations. RBAC is the direct implementation of Constitution Principle II.

## Project Structure

### Documentation (this feature)

```text
specs/004-rbac/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── rbac-permissions.md
│   ├── rbac-roles.md
│   └── rbac-role-assignment.md
└── tasks.md             # Phase 2 output (via /speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── common/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts              # Existing (stage 003)
│   │   ├── tenant.guard.ts                # Existing (stage 002)
│   │   └── permissions.guard.ts           # NEW: RBAC enforcement guard
│   ├── interceptors/
│   │   ├── ownership-scope.interceptor.ts # NEW: Enforces OWN scope
│   │   └── superadmin-audit.interceptor.ts # NEW: Audits bypass actions
│   └── decorators/
│       ├── public.decorator.ts            # Existing
│       ├── bypass-tenant.decorator.ts     # Existing (stage 003)
│       └── require-permissions.decorator.ts # NEW: @RequirePermissions('crm', 'READ')
├── modules/
│   └── rbac/
│       ├── rbac.module.ts
│       ├── controllers/
│       │   └── rbac.controller.ts         # Role CRUD + assignment endpoints
│       ├── services/
│       │   ├── rbac.service.ts            # Business logic (role management)
│       │   └── permission-resolver.service.ts # Resolves effective permissions per user+tenant
│       └── dto/
│           ├── create-role.dto.ts
│           ├── update-role.dto.ts
│           ├── assign-role.dto.ts
│           └── permission.dto.ts
└── infrastructure/
    └── prisma/
        └── prisma.service.ts              # Existing
prisma/
├── schema.prisma                          # Add Role, Permission models
└── migrations/
    └── <ts>_rbac/
```

**Structure Decision**: Feature module `rbac` in `src/modules/`. The `PermissionsGuard` is registered globally (APP_GUARD) and reads the `@RequirePermissions()` decorator metadata. `PermissionResolverService` queries the DB on every request to resolve the user's effective permissions (union of all assigned roles). Ownership scope (`ANY`/`OWN`) is enforced downstream in the repository layer via the existing tenant-scoped Prisma extension.

## Constitution Check (Post-Design Re-Evaluation)

*Re-checked after Phase 1 design (data-model, contracts, quickstart).*

| Principle | Status | Post-Design Verification |
|-----------|--------|--------------------------|
| I. Strict Multi-Tenant Isolation | ✅ CONFIRMED | Custom Roles have `tenantId` FK. Global roles have `tenantId = null`. Permission queries always scoped. |
| II. Granular RBAC | ✅ CONFIRMED DIRECT | data-model defines Role → Permission → scope(ANY/OWN). Guard enforces before business logic. Repository enforces ownership. |
| III. Subscription-Driven Feature Gating | ⚪ N/A | Confirmed — no Plan checks in RBAC. |
| IV. Immutable Audit Trail | ⚡ CONFIRMED PARTIAL | All new models include audit columns. Superadmin bypass logged via pino. |
| V. API-First Modular Architecture | ✅ CONFIRMED | RbacModule is self-contained. 3 contracts documented. Swagger decorators on all endpoints. |

**Post-design conclusion**: No violations. The architecture fully implements Constitution Principle II.

## Complexity Tracking

> No violations — table intentionally empty.
