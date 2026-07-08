# Quickstart: Basic Inventory Module

**Feature**: 012-basic-inventory
**Date**: 2026-07-07

## Prerequisites

- Uyuni SaaS backend running locally (see specs/001-foundation-bootstrap)
- PostgreSQL 16+ running and accessible via DATABASE_URL
- Prisma migrations applied
- A tenant on a Pro or Premium plan with an authenticated user
- A tenant on a Free plan with an authenticated user (for gating tests)
- The "Product Categories" dynamic catalog exists with at least one item

## Validation Scenarios

### Scenario 1: Product Catalog Management (US1)

Validate that products and services can be created and searched.

1. **Create a product**:
   ```bash
   curl -X POST http://localhost:3000/inventory/products \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "sku": "WIDGET-001",
       "name": "Premium Widget",
       "type": "PRODUCT",
       "categoryId": "$CATEGORY_ID",
       "unitPrice": 29.99,
       "cost": 15.00,
       "taxRate": 19,
       "lowStockThreshold": 10
     }'
   ```
   **Expected**: 201 Created with `currentStock: 0`

2. **Create a service** (no stock fields):
   ```bash
   curl -X POST http://localhost:3000/inventory/products \
     -H "Authorization: Bearer $TOKEN" \
     -d '{ "sku": "SVC-CONSULT", "name": "Consulting Hour", "type": "SERVICE", "unitPrice": 100.00 }'
   ```
   **Expected**: 201 Created with `currentStock: null`

3. **Search by SKU**:
   ```bash
   curl "http://localhost:3000/inventory/products?searchTerm=WIDGET" \
     -H "Authorization: Bearer $TOKEN"
   ```
   **Expected**: 200 OK with the Premium Widget in `data`, `total: 1`

4. **Reject duplicate SKU**:
   Repeat step 1 with the same SKU.
   **Expected**: 409 Conflict

### Scenario 2: Stock Control & Alerts (US2)

Validate stock movements, real-time updates, and low-stock alerts.

1. **Add stock** (ADDITION):
   ```bash
   curl -X POST http://localhost:3000/inventory/stock-movements \
     -H "Authorization: Bearer $TOKEN" \
     -d '{ "productId": "$PRODUCT_ID", "type": "ADDITION", "quantity": 100, "reason": "Purchase" }'
   ```
   **Expected**: 201 Created. Verify product's `currentStock` is now 100.

2. **Subtract stock** (SUBTRACTION):
   ```bash
   curl -X POST http://localhost:3000/inventory/stock-movements \
     -d '{ "productId": "$PRODUCT_ID", "type": "SUBTRACTION", "quantity": 55, "reason": "Sale" }'
   ```
   **Expected**: 201 Created. `currentStock` now 45. Since 45 < low_stock_threshold (10 default = set to 50 for test), a low-stock alert is generated.

3. **Reject negative stock**:
   ```bash
   curl -X POST http://localhost:3000/inventory/stock-movements \
     -d '{ "productId": "$PRODUCT_ID", "type": "SUBTRACTION", "quantity": 999, "reason": "Overdraw" }'
   ```
   **Expected**: 400 Bad Request indicating insufficient stock

4. **Reject stock movement on SERVICE type**:
   Attempt a movement on the service item from Scenario 1.
   **Expected**: 400 Bad Request — service items have no stock tracking

### Scenario 3: Fixed-Asset Management (US3)

Validate fixed-asset registration, listing, and disposal.

1. **Register a fixed asset**:
   ```bash
   curl -X POST http://localhost:3000/inventory/fixed-assets \
     -H "Authorization: Bearer $TOKEN" \
     -d '{ "name": "Office Desk", "acquisitionValue": 450.00, "acquisitionDate": "2026-06-01" }'
   ```
   **Expected**: 201 Created with `status: "ACTIVE"`

2. **View the asset summary**:
   ```bash
   curl "http://localhost:3000/inventory/fixed-assets/summary" \
     -H "Authorization: Bearer $TOKEN"
   ```
   **Expected**: 200 OK with `activeCount` and `totalValue` reflecting the new asset

3. **Dispose of the asset**:
   ```bash
   curl -X POST "http://localhost:3000/inventory/fixed-assets/$ASSET_ID/dispose" \
     -H "Authorization: Bearer $TOKEN"
   ```
   **Expected**: 200 OK with `status: "DISPOSED"`. Asset no longer appears in the default active list.

4. **Verify asset preserved in history**:
   ```bash
   curl "http://localhost:3000/inventory/fixed-assets?status=DISPOSED" \
     -H "Authorization: Bearer $TOKEN"
   ```
   **Expected**: The disposed asset appears in the list

### Scenario 4: Plan Gating (Cross-cutting)

Validate that Free plan tenants cannot access the inventory module.

1. **Auth as Free plan user**:
   Obtain a token for a user in a tenant with a Free plan.

2. **Attempt any inventory endpoint**:
   ```bash
   curl -X POST http://localhost:3000/inventory/products \
     -H "Authorization: Bearer $FREE_TOKEN" \
     -d '{ "sku": "TEST", "name": "Test", "type": "PRODUCT", "unitPrice": 1 }'
   ```
   **Expected**: 403 Forbidden with a message like "Feature requires Pro or Premium plan"

### Scenario 5: Tenant Isolation (Cross-cutting)

Validate that inventory data is isolated per tenant.

1. **Auth as Tenant A user**: Create a product in Tenant A.

2. **Auth as Tenant B user**: List products.
   **Expected**: Tenant A's product does NOT appear in Tenant B's list.

3. **Attempt to access Tenant A's product by ID as Tenant B user**:
   ```Expected**: 404 Not Found (no information leakage)

## Constitution Compliance Verification

- **Tenant Isolation**: Scenario 5 proves no cross-tenant data access
- **RBAC**: Each endpoint requires inventory:CREATE/READ/UPDATE/DELETE
- **Feature Gating**: Scenario 4 proves Free plan is blocked
- **Audit Trail**: All mutations generate CDC entries (verify in DB after movements)
- **Soft-Delete**: DELETE endpoints set is_active=false (verify in DB)
- **Audit Columns**: created_by_id is auto-injected (verify in DB — no manual passing)
