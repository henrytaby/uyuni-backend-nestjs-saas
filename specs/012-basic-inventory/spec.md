# Feature Specification: Basic Inventory (Logistics — Pro/Premium Plans Only)

**Feature Branch**: `012-basic-inventory`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Implement a basic inventory module gated to Pro/Premium plans with product/service catalog, simple stock control with movements and alerts, and fixed-asset management."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Product/Service Catalog (Priority: P1)

A team member manages the product and service catalog. Each item has an SKU,
name, description, category (from dynamic catalogs), unit price, cost,
tax rate, and type (product vs. service). Products have stock tracking;
services do not. Items are searchable by name and SKU.

**Why this priority**: The product catalog is the foundation for inventory
and sales. Without it, there are no items to stock, sell, or invoice.

**Independent Test**: Create a product with SKU and a service, verify both
appear in the catalog. Search by SKU and verify the product is found.

**Acceptance Scenarios**:

1. **Given** a team member with inventory permissions, **When** they create
   a product with SKU, name, price, cost, and category, **Then** the product
   is stored and appears in the catalog with an initial stock level of 0.
2. **Given** a team member, **When** they create a service item (no stock),
   **Then** the service is stored without stock tracking fields.
3. **Given** catalog items, **When** the member searches by partial SKU or
   name, **Then** matching items are returned in a paginated list.

---

### User Story 2 - Stock Control & Alerts (Priority: P2)

A warehouse team member records stock movements: additions (purchases,
returns) and subtractions (sales, adjustments) with a reason and quantity.
Current stock level is updated in real time. When stock falls below a
configurable low-stock threshold, the system generates an alert. Sales
invoices automatically reduce stock for the invoiced products.

**Why this priority**: Stock control prevents overselling and stockouts.
Automatic reduction on sale connects inventory with the sales module.

**Independent Test**: Add 100 units of a product, sell 30 via an invoice,
verify stock is 70. Set low-stock threshold to 50, sell 25 more, verify
stock is 45 and a low-stock alert is generated.

**Acceptance Scenarios**:

1. **Given** a product with current stock of 0, **When** a stock addition
   of 100 units is recorded with reason "Purchase," **Then** the product's
   stock level is updated to 100.
2. **Given** a product with stock of 100 and a low-stock threshold of 50,
   **When** 55 units are sold via an invoice, **Then** the stock level
   becomes 45 and a low-stock alert is generated.
3. **Given** a product with stock of 10, **When** a sale of 15 units is
   attempted, **Then** the system rejects the sale indicating insufficient
   stock.

---

### User Story 3 - Fixed-Asset Management (Priority: P3)

A team member registers fixed assets (computers, furniture, vehicles) with
name, description, acquisition value, acquisition date, and status (Active,
Disposed). Fixed assets are tracked separately from saleable inventory.
A list of active assets with their total value is available.

**Why this priority**: Fixed-asset tracking is important for operational
accountability and basic financial reporting, but is less critical than
saleable inventory.

**Independent Test**: Register a fixed asset, verify it appears in the
active assets list with the correct value. Mark it as "Disposed" and verify
it no longer appears in the active list.

**Acceptance Scenarios**:

1. **Given** a team member, **When** they register a fixed asset with
   name, value, acquisition date, and status, **Then** the asset is stored
   and appears in the active assets list.
2. **Given** an active fixed asset, **When** it is marked as "Disposed,"
   **Then** it no longer appears in the active assets list but is preserved
   in the full asset history.
3. **Given** multiple active fixed assets, **When** the member views the
   asset summary, **Then** the total value of all active assets is
   displayed.

### Edge Cases

- Accessing inventory endpoints from a tenant on the Free plan — MUST
  return 403 with a message indicating the feature requires Pro or Premium.
- Stock movement with negative quantity — MUST be rejected; subtractions
  use a separate operation type.
- SKU uniqueness — MUST be unique within a tenant. Attempting to create
  a duplicate SKU MUST return a validation error.
- Stock goes negative due to a race condition — the system MUST use
  database-level constraints to prevent negative stock values.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow creating, updating, and listing products
  and services with SKU, name, description, category (catalog), unit price,
  cost, tax rate, and type (product/service).
- **FR-002**: Products MUST have stock tracking; services MUST NOT.
- **FR-003**: SKU MUST be unique within a tenant.
- **FR-004**: System MUST allow recording stock movements (additions and
  subtractions) with quantity, reason, and timestamp.
- **FR-005**: System MUST maintain a real-time current stock level per
  product updated on each movement.
- **FR-006**: System MUST generate low-stock alerts when stock falls below
  a configurable threshold.
- **FR-007**: Sales invoices MUST automatically reduce stock for invoiced
  products upon invoice confirmation.
- **FR-008**: System MUST reject sales that would result in negative
  stock levels.
- **FR-009**: System MUST allow registering fixed assets with name,
  description, acquisition value, acquisition date, and status.
- **FR-010**: Fixed assets MUST be tracked separately from saleable
  inventory.
- **FR-011**: Inventory module MUST be gated to Pro/Premium plans — Free
  plan tenants MUST receive 403 with an upgrade prompt on any inventory
  endpoint.
- **FR-012**: All inventory data MUST be tenant-scoped with RBAC
  enforcement (inventory:CREATE, inventory:READ, inventory:UPDATE,
  inventory:DELETE).

### Key Entities

- **Product**: Saleable item. Attributes: SKU, name, description, category
  (catalog), unit price, cost, tax rate, type (product/service), current
  stock level (products only), low-stock threshold.
- **StockMovement**: Inventory transaction. Attributes: linked Product,
  type (addition/subtraction), quantity, reason, timestamp.
- **FixedAsset**: Operational asset. Attributes: name, description,
  acquisition value, acquisition date, status (Active/Disposed).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member can add a new product to the catalog in under
  30 seconds.
- **SC-002**: Stock levels are updated in real time — a sale of 10 units
  reflects immediately in the product's stock level, verified by automated
  tests.
- **SC-003**: Zero instances of negative stock values — database-level
  constraints prevent it, verified by attempted overselling tests.
- **SC-004**: Free plan tenants receive 403 on 100% of inventory endpoints
  — verified by automated tests scanning all inventory routes.

## Assumptions

- Inventory module access is controlled by the Plan's module-access gates.
  The gate name is "inventory" or "logistics."
- Stock movements are an append-only log; corrections are made via
  adjustment movements (e.g., subtraction with reason "Correction").
- Low-stock alerts are delivered as in-app notifications; email alerts
  are a future enhancement.
- Fixed-asset depreciation is out of scope for this iteration — assets are
  tracked at acquisition value only.
- Tax rate is a percentage stored per product; it defaults to a configurable
  tenant-level default.
