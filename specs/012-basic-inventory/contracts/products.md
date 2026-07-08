# API Contract: Products

**Module**: Inventory
**Base Path**: `/inventory/products`
**Auth**: JWT required, TenantGuard, PlanGate (Pro/Premium), RBAC: inventory:*

---

## Endpoints

### POST /inventory/products

Create a new product or service item.

**RBAC**: inventory:CREATE

**Request Body**:
```json
{
  "sku": "WIDGET-001",
  "name": "Premium Widget",
  "description": "High-quality widget for industrial use",
  "type": "PRODUCT",
  "categoryId": "uuid-of-catalog-item",
  "unitPrice": 29.99,
  "cost": 15.00,
  "taxRate": 19.0,
  "lowStockThreshold": 10
}
```

**Response** (201 Created):
```json
{
  "id": "uuid",
  "sku": "WIDGET-001",
  "name": "Premium Widget",
  "description": "High-quality widget for industrial use",
  "type": "PRODUCT",
  "categoryId": "uuid",
  "unitPrice": 29.99,
  "cost": 15.00,
  "taxRate": 19.0,
  "currentStock": 0,
  "lowStockThreshold": 10,
  "isActive": true,
  "createdAt": "2026-07-07T12:00:00Z",
  "updatedAt": "2026-07-07T12:00:00Z"
}
```

**Errors**:
- 400: Validation error (invalid SKU, missing required fields, SERVICE with stock fields)
- 403: Free plan tenant (PlanGate) or missing inventory:CREATE permission
- 409: Duplicate SKU within tenant

---

### GET /inventory/products

List products with pagination, sorting, and search.

**RBAC**: inventory:READ

**Query Parameters** (DataTableRequestDto):
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| pageSize | number | 25 | Items per page (max 100) |
| sortField | string | "name" | Sort column |
| sortOrder | "asc" \| "desc" | "asc" | Sort direction |
| searchTerm | string | null | Search across name, sku |
| type | "PRODUCT" \| "SERVICE" | null | Filter by type |

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": "uuid",
      "sku": "WIDGET-001",
      "name": "Premium Widget",
      "type": "PRODUCT",
      "unitPrice": 29.99,
      "currentStock": 45,
      "lowStockThreshold": 10,
      "isActive": true
    }
  ],
  "total": 150
}
```

---

### GET /inventory/products/:id

Get a single product by ID.

**RBAC**: inventory:READ

**Response** (200 OK): Full product object (same as POST response).

**Errors**:
- 404: Product not found or belongs to another tenant

---

### PATCH /inventory/products/:id

Update a product. Stock level is NOT updated via this endpoint — use stock
movements.

**RBAC**: inventory:UPDATE

**Request Body** (partial):
```json
{
  "name": "Premium Widget v2",
  "unitPrice": 34.99,
  "lowStockThreshold": 15
}
```

**Response** (200 OK): Updated product object.

**Errors**:
- 404: Product not found
- 409: SKU conflict if SKU is changed to a duplicate

---

### DELETE /inventory/products/:id

Soft-delete a product (sets is_active=false). Product must have zero stock
to be deactivated.

**RBAC**: inventory:DELETE

**Response** (200 OK):
```json
{
  "id": "uuid",
  "isActive": false
}
```

**Errors**:
- 400: Product still has stock (current_stock > 0)
- 404: Product not found
