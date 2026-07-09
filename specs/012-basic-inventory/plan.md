# Implementation Plan: Basic Inventory (Logistics — Pro/Premium Plans Only)

**Branch**: `012-basic-inventory` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-basic-inventory/spec.md`

## Summary

Implement a basic inventory module gated to Pro/Premium plans. The module
provides a product/service catalog (SKU-based, categorized), stock control
with real-time movements and low-stock alerts, and fixed-asset management.
Inventory endpoints enforce subscription-driven feature gating (Free plan
tenants receive 403). Stock integrity is guaranteed via database-level
constraints preventing negative values. Sales invoices automatically reduce
stock on confirmation.

## Technical Context

**Language/Version**: TypeScript 5.x strict

**Primary Dependencies**: NestJS 11.x, Prisma 7.x, class-validator,
class-transformer, @nestjs/swagger

**Storage**: PostgreSQL 16+ (tenant-scoped tables with RLS)

**Testing**: Jest + supertest + Testcontainers

**Target Platform**: Linux server (VPS with Nginx reverse proxy)

**Project Type**: web-service (REST API backend)

**Performance Goals**: Product catalog search < 2s for 10k+ items;
stock level update reflected in < 500ms; bulk stock movements of 100+
items complete in < 5s

**Constraints**: Zero negative stock (DB constraint); SKU uniqueness per
tenant (unique composite index); Free plan 403 on all inventory endpoints

**Scale/Scope**: Up to 10k products per tenant; 100k stock movements per
tenant; 1k fixed assets per tenant

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Strict Multi-Tenant Isolation | ✅ PASS | All inventory tables tenant-scoped via AsyncLocalStorage + Prisma extension; RLS enabled; TenantGuard on all endpoints; anti-leakage tests required |
| II. Granular RBAC | ✅ PASS | inventory:CREATE/READ/UPDATE/DELETE permissions enforced; scope_all determines visibility of products/assets created by others |
| III. Subscription-Driven Feature Gating | ✅ PASS | PlanGate guard on entire InventoryModule — Free plan tenants receive 403 with upgrade prompt; this is a core requirement of this feature |
| IV. Immutable Audit Trail | ✅ PASS | Access logs via interceptor; CDC on all inventory mutations; soft-delete (is_active) on products and assets; audit columns auto-injected via Prisma extension |
| V. API-First Modular Architecture | ✅ PASS | Self-contained InventoryModule with own Controllers/Services/DTOs; Swagger auto-generated; DataTableRequestDto for all list endpoints; TenantScopedRepository for data access |

**No violations** — all principles are natively supported by the existing
architecture. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/012-basic-inventory/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── products.md
│   ├── stock-movements.md
│   └── fixed-assets.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── modules/
│   └── inventory/
│       ├── inventory.module.ts
│       ├── controllers/
│       │   ├── products.controller.ts
│       │   ├── stock-movements.controller.ts
│       │   └── fixed-assets.controller.ts
│       ├── services/
│       │   ├── products.service.ts
│       │   ├── stock-movements.service.ts
│       │   └── fixed-assets.service.ts
│       └── dto/
│           ├── create-product.dto.ts
│           ├── update-product.dto.ts
│           ├── product-response.dto.ts
│           ├── create-stock-movement.dto.ts
│           ├── stock-movement-response.dto.ts
│           ├── create-fixed-asset.dto.ts
│           ├── update-fixed-asset.dto.ts
│           └── fixed-asset-response.dto.ts
├── common/
│   └── guards/
│       └── plan-gate.guard.ts        # Shared — checks plan module gates
├── infrastructure/
│   └── prisma/
│       └── extensions/               # Audit column extension (existing)
└── prisma/
    └── schema.prisma                 # Add Product, StockMovement, FixedAsset models

test/
└── e2e/
    └── inventory.e2e-spec.ts
```

**Structure Decision**: Standard NestJS Feature Module under
`src/modules/inventory/`. The module is fully self-contained with its own
Controllers, Services, and DTOs. It registers in AppModule. The PlanGate
guard is a shared concern placed in `src/common/guards/` as it gates any
module that requires plan-level access control.

## Constitution Check (Post-Design Re-Evaluation)

*Re-checked after Phase 1 design (data-model, contracts, quickstart).*

| Principle | Status | Post-Design Verification |
|-----------|--------|--------------------------|
| I. Strict Multi-Tenant Isolation | ✅ CONFIRMED | All 3 entities (Product, StockMovement, FixedAsset) have tenant_id with composite unique indexes + RLS; TenantGuard on all endpoints; quickstart Scenario 5 tests isolation |
| II. Granular RBAC | ✅ CONFIRMED | All contracts specify required inventory:CREATE/READ/UPDATE/DELETE permission per endpoint; scope_all applied via TenantScopedRepository |
| III. Subscription-Driven Feature Gating | ✅ CONFIRMED | PlanGate guard design documented in research.md; all 3 contract files specify Pro/Premium requirement; quickstart Scenario 4 validates Free plan 403 |
| IV. Immutable Audit Trail | ✅ CONFIRMED | StockMovement is append-only (no update/delete); all entities have is_active soft-delete; audit columns auto-injected (created_by_id, updated_by_id, deleted_by_id); CDC captures all mutations |
| V. API-First Modular Architecture | ✅ CONFIRMED | Self-contained InventoryModule; Swagger auto-generated; DataTableRequestDto used on all list endpoints; products searchable by name+sku; returns { data, total } shape |

**Post-design conclusion**: No violations detected. All principles are
natively enforced by the architecture. No complexity tracking entries needed.

## Complexity Tracking

> No violations — table intentionally empty.
