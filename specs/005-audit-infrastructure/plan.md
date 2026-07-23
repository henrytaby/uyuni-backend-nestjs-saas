# Implementation Plan: Audit Infrastructure

**Branch**: `005-audit-infrastructure` | **Date**: 2026-07-23 | **Spec**: [005-audit-infrastructure spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-audit-infrastructure/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement an immutable audit trail capturing tenant-scoped Access Logs and Change Data Capture (CDC) records without blocking business operations. This infrastructure will use a global interceptor for request logging and a formalized Prisma extension for soft-deletes and CDC, maintaining strict performance constraints (<15ms latency overhead per request).

## Technical Context

**Language/Version**: TypeScript 5.7+ (strict mode)

**Primary Dependencies**: @prisma/client ^7.8.0, @prisma/adapter-pg ^7.8.0, nestjs-pino ^4.6.1, @nestjs/throttler ^6.5.0, class-validator ^0.15.1

**Storage**: PostgreSQL 16+ via Prisma ORM with PrismaPg driver adapter

**Testing**: Jest ^30.0.0 + supertest ^7.0.0 + @testcontainers/postgresql ^12.0.4

**Target Platform**: Linux server (REST API backend)

**Project Type**: Web service (NestJS backend for B2B SaaS ERP-lite)

**Performance Goals**: Audit writes <15ms latency overhead per request (NFR-001)

**Constraints**: Audit write failures MUST NOT block business operations (NFR-002); CDC records are append-only (FR-004/FR-012)

**Scale/Scope**: ~100-500 access log entries/min, ~10-50 CDC entries/min at moderate load

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- ✅ PASS (Principle IV - Immutable Audit Trail): Access Logs interceptor captures method, route, status, IP, user_id, tenant_id → Spec FR-001 directly implements this
- ✅ PASS (Principle IV - Immutable Audit Trail): CDC records old_value vs new_value, actor, timestamp, append-only → Spec FR-003, FR-004
- ✅ PASS (Principle IV - Immutable Audit Trail): Soft-Delete via is_active=false → Spec FR-005
- ✅ PASS (Principle IV - Immutable Audit Trail): Audit columns auto-injection via Prisma Extension → Spec FR-006, FR-007, FR-008
- ⚠️ NOTE: Existing tenant-scoped.extension.ts already injects createdById/updatedById on writes - this is a 'bridge' implementation. Spec 005 will formalize and extend it with deletedById on soft-delete
- ⚠️ NOTE: Some existing models (Permission, RoleAssignment) don't have full audit columns per FR-015. A schema normalization migration is needed.
- ✅ PASS (Principle I - Multi-Tenancy): AccessLog and ChangeRecord MUST be tenant-scoped. Both models carry tenantId.
- ✅ PASS (Principle II - RBAC): Audit query endpoints require audit:read permission (FR-013).
- ✅ PASS (Principle V - API-First): Audit endpoints exposed via REST with OpenAPI contracts, cursor-based pagination.

## Project Structure

### Documentation (this feature)

```text
specs/005-audit-infrastructure/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── common/
│   ├── interceptors/
│   │   └── access-log.interceptor.ts          # NEW: Global interceptor capturing every request
│   └── constants/
│       └── sensitive-fields.ts                 # NEW: Registry of fields to redact in CDC
├── infrastructure/
│   └── prisma/
│       └── extensions/
│           ├── tenant-scoped.extension.ts      # MODIFIED: Add soft-delete interception + deletedById
│           ├── audit-columns.extension.ts      # NEW: Formalized audit column injection
│           ├── cdc.extension.ts                # NEW: Change Data Capture extension
│           └── append-only.extension.ts        # NEW: Prevent UPDATE/DELETE on audit tables
└── modules/
    └── audit/
        ├── audit.module.ts                     # NEW: Feature module
        ├── controllers/
        │   ├── access-logs.controller.ts        # NEW: GET /audit/access-logs
        │   └── change-records.controller.ts     # NEW: GET /audit/change-records
        ├── dto/
        │   ├── access-log-query.dto.ts          # NEW: Cursor-based pagination + filters
        │   ├── change-record-query.dto.ts       # NEW: Entity type + ID + date range filters
        │   └── cursor-pagination.dto.ts         # Shared cursor pagination DTO
        └── services/
            ├── access-log.service.ts            # NEW: Access log query service
            └── change-record.service.ts         # NEW: CDC query service

prisma/
└── schema.prisma                               # MODIFIED: Add AccessLog + ChangeRecord models
```

**Structure Decision**: NestJS Feature Module pattern. The audit module follows the existing convention seen in auth, rbac, tenancy modules.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. The audit infrastructure directly implements Principle IV.
