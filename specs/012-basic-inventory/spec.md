# 012-basic-inventory

**Status**: Ready
**Updated**: 2026-07-23 (Enterprise Architect Review — v2)

## Overview
This specification details the Basic Inventory module, providing multi-tenant capabilities for managing products, tracking stock, and controlling fixed assets. It ensures robust concurrency control, accurate stock levels, and integration with invoicing and catalog modules.

## User Stories

### US1 - Product Catalog
As an inventory manager, I need a comprehensive product catalog to manage physical goods, services, and digital items.
- Reference catalogs from `007-catalogs` for `product_categories` and `service_types`.
- Enforce SKU uniqueness per tenant.
- Include a derived boolean `isStockTracked` based on the product type (e.g., physical goods are tracked, services are not).

### US2 - Stock Control
As an inventory clerk, I need precise stock tracking and movement logs to maintain accurate inventory levels.
- Implement strict concurrency control using database-level `CHECK constraint (stock >= 0)` and optimistic locking on `currentStock`.
- All stock movements must be append-only to serve as an immutable audit trail.
- Movement types enum: `PURCHASE`, `SALE`, `RETURN`, `ADJUSTMENT`, `CORRECTION`.
- Automatically link `SALE` movements to an `Invoice` from `011-invoicing`.

### US3 - Fixed Assets
As an operations manager, I need to track fixed assets distinct from regular inventory for accounting and assignment purposes.
- Reference `asset_categories` catalog from `007-catalogs`.
- Track `serialNumber` (must be unique per tenant).
- Track `assignedToId` (reference to `TenantUser`, optional) for tracking who is currently in possession of the asset.

## Functional Requirements (FR)

- **FR-013**: Stock level MUST be maintained as a denormalized field on the Product entity, updated atomically with each StockMovement creation within a single database transaction.
- **FR-014**: StockMovement records are append-only. Updates or deletions are strictly prohibited. Any adjustments to previous movements MUST be made via new `CORRECTION` type movements.
- **FR-015**: Product catalog and stock movement list endpoints MUST implement the DataTable pattern defined in `006-datatable`.
- **FR-016**: Low-stock alerts MUST include the product name, SKU, current stock level, and the defined threshold in the notification payload.
- **FR-017**: Access to the inventory module is gated. The module gate name in `Plan.moduleAccess` MUST be exactly `inventory`.

## Dependencies
- **002-multi-tenancy-core**: Tenancy (tenantId isolation)
- **004**: RBAC (requires permissions `inventory:CREATE`, `inventory:READ`, `inventory:UPDATE`, `inventory:DELETE`)
- **005-audit-infrastructure**: Audit Logging
- **006-generic-repository-datatables**: DataTable
- **007**: Catalogs (`product_categories`, `service_types`, `asset_categories`)
- **008**: Plan Gating (module access control)
- **011**: Invoicing (integration for automatic stock reduction upon sales)

## Non-Functional Requirements (NFR)
- **NFR-001**: Product catalog list queries MUST respond in <500ms for up to 10,000 items.
- **NFR-002**: Stock updates (transactional creation of movement + denormalized stock update) MUST complete in <100ms.
- **NFR-003**: Stock movement log queries MUST respond in <500ms.

## Key Entities

### Product
- `id` (UUID, PK)
- `tenantId` (UUID, FK to Tenant)
- `sku` (String, unique per tenant)
- `name` (String)
- `productCategoryId` (UUID, FK to CatalogItem)
- `serviceTypeId` (UUID, FK to CatalogItem, nullable)
- `type` (Enum: PHYSICAL, SERVICE, DIGITAL)
- `isStockTracked` (Boolean, derived from type)
- `currentStock` (Integer, default 0, versioned for optimistic locking)
- `lowStockThreshold` (Integer, nullable)
- Audit columns (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`)

### StockMovement
- `id` (UUID, PK)
- `tenantId` (UUID, FK to Tenant)
- `productId` (UUID, FK to Product)
- `type` (Enum: PURCHASE, SALE, RETURN, ADJUSTMENT, CORRECTION)
- `quantity` (Integer, positive or negative)
- `invoiceId` (UUID, nullable, FK to Invoice from 011)
- `notes` (String, nullable)
- Audit columns (append-only, so `createdAt`, `createdBy` typically suffice)

### FixedAsset
- `id` (UUID, PK)
- `tenantId` (UUID, FK to Tenant)
- `assetCategoryId` (UUID, FK to CatalogItem)
- `name` (String)
- `serialNumber` (String, unique per tenant)
- `assignedToId` (UUID, nullable, FK to TenantUser)
- Audit columns (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`)

## Edge Cases
- **Concurrent Stock Movements**: Handled via database constraints (`stock >= 0`) and optimistic locking on the `Product.currentStock` field.
- **Product Type Change**: Attempting to change a product from physical to service (or vice versa) when existing stock movements exist MUST be handled carefully; typically prevented or requiring stock clearance first.

## Assumptions
- The module gate name in `Plan.moduleAccess` is exactly `'inventory'`.
