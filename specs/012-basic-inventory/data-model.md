# Data Model: Basic Inventory

**Feature**: 012-basic-inventory
**Date**: 2026-07-07

## Entities

### Product

Unified catalog item (product or service). Products have stock tracking;
services do not.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| tenant_id | UUID | FK → Tenant, NOT NULL | Tenant scope |
| sku | String | NOT NULL, @@unique([tenant_id, sku]) | Stock-keeping unit code, unique per tenant |
| name | String | NOT NULL | Display name |
| description | String | nullable | Detailed description |
| type | Enum | NOT NULL, PRODUCT \| SERVICE | Item type discriminator |
| category_id | UUID | FK → CatalogItem, nullable | Category from dynamic catalogs |
| unit_price | Decimal | NOT NULL | Sale price per unit |
| cost | Decimal | nullable | Cost per unit (for margin calculation) |
| tax_rate | Decimal | nullable, default 0 | Tax percentage |
| current_stock | Int | nullable | Current stock level (null for SERVICE type) |
| low_stock_threshold | Int | nullable | Alert threshold (null for SERVICE type) |
| is_active | Boolean | NOT NULL, default true | Soft-delete flag |
| created_at | DateTime | NOT NULL, auto | Creation timestamp (Prisma managed) |
| updated_at | DateTime | NOT NULL, auto | Last update timestamp (Prisma managed) |
| created_by_id | UUID | FK → User, nullable | Auto-injected by Prisma extension |
| updated_by_id | UUID | FK → User, nullable | Auto-injected by Prisma extension |
| deleted_by_id | UUID | FK → User, nullable | Auto-injected on soft-delete |

**Validation Rules**:
- SKU: alphanumeric + hyphens, 1-50 chars, required
- Name: 1-255 chars, required
- unit_price: >= 0, required
- cost: >= 0 if provided
- tax_rate: 0-100 if provided
- type=SERVICE → current_stock MUST be null, low_stock_threshold MUST be null
- type=PRODUCT → current_stock MUST be 0 or positive integer

**Database Constraints**:
- `@@unique([tenant_id, sku])` — SKU unique per tenant
- `CHECK (type = 'SERVICE' AND current_stock IS NULL) OR (type = 'PRODUCT')`
- `CHECK (current_stock >= 0)` — prevent negative stock at DB level

---

### StockMovement

Append-only log of inventory transactions. Each movement adjusts the
product's current_stock.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| tenant_id | UUID | FK → Tenant, NOT NULL | Tenant scope |
| product_id | UUID | FK → Product, NOT NULL | Affected product |
| type | Enum | NOT NULL, ADDITION \| SUBTRACTION | Movement direction |
| quantity | Int | NOT NULL, > 0 | Number of units (always positive; direction determined by type) |
| reason | String | NOT NULL | Reason for movement (e.g., "Purchase", "Sale", "Adjustment", "Correction") |
| reference_type | String | nullable | Polymorphic reference (e.g., "invoice", "purchase_order") |
| reference_id | UUID | nullable | ID of the referenced entity |
| created_at | DateTime | NOT NULL, auto | Timestamp (append-only — no updates) |
| created_by_id | UUID | FK → User, nullable | Auto-injected by Prisma extension |

**Validation Rules**:
- quantity: > 0 (always positive; type determines direction)
- reason: 1-255 chars, required
- product_id MUST reference a PRODUCT type item (not SERVICE)

**Database Constraints**:
- No UPDATE or DELETE allowed on this table (enforced by RLS policy or
  application-level guard; CDC provides the audit trail for any
  unauthorized modification attempts)

**Business Rules**:
- On ADDITION: product.current_stock += quantity
- On SUBTRACTION: product.current_stock -= quantity, but ONLY if
  result >= 0 (CHECK constraint is the hard guarantee; application
  validates first for user-friendly error)

---

### FixedAsset

Operational fixed assets tracked separately from saleable inventory.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| tenant_id | UUID | FK → Tenant, NOT NULL | Tenant scope |
| name | String | NOT NULL | Asset name |
| description | String | nullable | Detailed description |
| acquisition_value | Decimal | NOT NULL | Purchase/acquisition value |
| acquisition_date | Date | NOT NULL | Date of acquisition |
| status | Enum | NOT NULL, ACTIVE \| DISPOSED, default ACTIVE | Current status |
| is_active | Boolean | NOT NULL, default true | Soft-delete flag |
| created_at | DateTime | NOT NULL, auto | Creation timestamp |
| updated_at | DateTime | NOT NULL, auto | Last update timestamp |
| created_by_id | UUID | FK → User, nullable | Auto-injected |
| updated_by_id | UUID | FK → User, nullable | Auto-injected |
| deleted_by_id | UUID | FK → User, nullable | Auto-injected on soft-delete |

**Validation Rules**:
- Name: 1-255 chars, required
- acquisition_value: >= 0, required
- acquisition_date: must not be in the future

---

## Entity Relationships

```text
Tenant 1──N Product
Tenant 1──N StockMovement
Tenant 1──N FixedAsset

Product 1──N StockMovement    (one product has many movements)
CatalogItem 1──N Product     (category catalog items are referenced by products)

User (created_by) 1──N Product
User (created_by) 1──N StockMovement
User (created_by) 1──N FixedAsset
```

## State Transitions

### Product (type=PRODUCT) Stock Flow

```text
[New Product: current_stock=0]
        │
        ▼ (ADDITION movement)
[current_stock > 0]
        │
        ├── (more ADDITIONs) → stock increases
        │
        ├── (SUBTRACTION movement) → stock decreases
        │   └── if stock <= low_stock_threshold → LowStockAlert
        │
        └── (soft-delete: is_active=false) → excluded from queries
```

### FixedAsset Status Flow

```text
[ACTIVE] ──(mark disposed)──▶ [DISPOSED]
                                 │
                                 └── excluded from active list
                                     but preserved in full history
```

## Indexes

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| Product | (tenant_id, sku) | Unique | SKU uniqueness per tenant |
| Product | (tenant_id, name) | B-tree | Search by name |
| Product | (tenant_id, type) | B-tree | Filter by product/service |
| Product | (tenant_id, is_active) | B-tree | Exclude soft-deleted |
| StockMovement | (tenant_id, product_id) | B-tree | Movements per product |
| StockMovement | (tenant_id, created_at) | B-tree | Chronological queries |
| StockMovement | (reference_type, reference_id) | B-tree | Link to invoices/purchases |
| FixedAsset | (tenant_id, status) | B-tree | Filter active/disposed |
| FixedAsset | (tenant_id, is_active) | B-tree | Exclude soft-deleted |
