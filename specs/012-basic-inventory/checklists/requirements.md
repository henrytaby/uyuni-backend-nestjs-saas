# 012-basic-inventory Implementation Checklist

## Module Setup
- [ ] Create `InventoryModule` module.
- [ ] Implement plan gating using `inventory` in `Plan.moduleAccess` (FR-017).

## Database Schema
- [ ] Create `Product` entity with `tenantId`, `sku` (unique per tenant), and audit columns.
- [ ] Add `currentStock` (optimistic locking) and denormalization logic to `Product` (FR-013).
- [ ] Add `isStockTracked` derived boolean to `Product`.
- [ ] Create `StockMovement` entity (append-only) with `PURCHASE`, `SALE`, `RETURN`, `ADJUSTMENT`, `CORRECTION` enum (FR-014).
- [ ] Add constraint: `stock >= 0`.
- [ ] Create `FixedAsset` entity with `tenantId`, `serialNumber` (unique per tenant), and `assignedToId` (FK to `TenantUser`).

## Integration
- [ ] Integrate catalogs (`product_categories`, `service_types`, `asset_categories`) from 007.
- [ ] Integrate invoicing module (011) for automatic stock reduction upon SALE movements.

## Endpoints
- [ ] Create Product CRUD endpoints (implementing DataTable pattern per 006 for lists) (FR-015).
- [ ] Create StockMovement append endpoint.
- [ ] Create StockMovement list endpoint (implementing DataTable pattern per 006) (FR-015).
- [ ] Create FixedAsset CRUD endpoints.

## Business Logic
- [ ] Implement atomic update of `Product.currentStock` when `StockMovement` is recorded (FR-013).
- [ ] Implement low-stock alert logic triggered upon stock updates (FR-016).
- [ ] Enforce SKU uniqueness per tenant.
- [ ] Enforce FixedAsset serial number uniqueness per tenant.
- [ ] Handle concurrent stock updates correctly (optimistic locking + constraints).
- [ ] Handle Product type changes carefully (preventing physical<->service changes if stock exists).

## Security & RBAC
- [ ] Enforce tenant isolation on all queries and mutations (002).
- [ ] Require `inventory:CRUD` permissions for relevant operations (004).
- [ ] Ensure audit logging is active for entities (005).

## Performance (NFRs)
- [ ] Verify Product catalog query <500ms for 10K items (NFR-001).
- [ ] Verify stock update is atomic and completes in <100ms (NFR-002).
- [ ] Verify stock movement log query responds in <500ms (NFR-003).
