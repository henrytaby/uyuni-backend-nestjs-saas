# API Contract: Stock Movements

**Module**: Inventory
**Base Path**: `/inventory/stock-movements`
**Auth**: JWT required, TenantGuard, PlanGate (Pro/Premium), RBAC: inventory:*

---

## Endpoints

### POST /inventory/stock-movements

Record a stock movement (addition or subtraction). Updates the product's
current_stock atomically.

**RBAC**: inventory:CREATE

**Request Body**:
```json
{
  "productId": "uuid",
  "type": "ADDITION",
  "quantity": 100,
  "reason": "Purchase from supplier",
  "referenceType": "purchase_order",
  "referenceId": "uuid-of-po"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| productId | UUID | yes | Must be a PRODUCT type item |
| type | "ADDITION" \| "SUBTRACTION" | yes | Movement direction |
| quantity | number | yes | Must be > 0 |
| reason | string | yes | 1-255 chars |
| referenceType | string | no | E.g., "invoice", "purchase_order" |
| referenceId | UUID | no | ID of the referenced entity |

**Response** (201 Created):
```json
{
  "id": "uuid",
  "productId": "uuid",
  "type": "ADDITION",
  "quantity": 100,
  "reason": "Purchase from supplier",
  "referenceType": "purchase_order",
  "referenceId": "uuid-of-po",
  "createdAt": "2026-07-07T12:00:00Z",
  "createdById": "uuid"
}
```

**Side Effect**: Product's current_stock is updated:
- ADDITION: current_stock += quantity
- SUBTRACTION: current_stock -= quantity (rejected if result < 0)

**Low-Stock Alert**: If after the movement the product's current_stock is
at or below low_stock_threshold, a LowStockAlert notification is created.

**Errors**:
- 400: Product is SERVICE type (no stock tracking)
- 400: SUBTRACTION would result in negative stock
- 403: Free plan tenant or missing permission
- 404: Product not found

---

### GET /inventory/stock-movements

List stock movements with pagination and filtering.

**RBAC**: inventory:READ

**Query Parameters** (DataTableRequestDto):
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| pageSize | number | 25 | Items per page (max 100) |
| sortField | string | "createdAt" | Sort column |
| sortOrder | "asc" \| "desc" | "desc" | Sort direction |
| searchTerm | string | null | Search across reason |
| productId | UUID | null | Filter by product |
| type | "ADDITION" \| "SUBTRACTION" | null | Filter by movement type |
| dateFrom | ISO date | null | Filter from date |
| dateTo | ISO date | null | Filter to date |

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": "uuid",
      "productId": "uuid",
      "productName": "Premium Widget",
      "type": "ADDITION",
      "quantity": 100,
      "reason": "Purchase from supplier",
      "createdAt": "2026-07-07T12:00:00Z",
      "createdById": "uuid",
      "createdByName": "John Doe"
    }
  ],
  "total": 500
}
```

---

### GET /inventory/stock-movements/:id

Get a single stock movement by ID.

**RBAC**: inventory:READ

**Response** (200 OK): Full stock movement object.

**Errors**:
- 404: Movement not found or belongs to another tenant

---

## Internal Event: InvoiceConfirmedEvent

**Source**: Sales module
**Handler**: Inventory module

When a sales invoice is confirmed, the Sales module emits an
`InvoiceConfirmedEvent` containing the invoice's product line items.
The Inventory module listens and creates SUBTRACTION stock movements
for each product line item:

```json
{
  "invoiceId": "uuid",
  "tenantId": "uuid",
  "lineItems": [
    {
      "productId": "uuid",
      "quantity": 5,
      "unitPrice": 29.99
    }
  ]
}
```

If any product would go negative, the entire batch is rejected and an
error is logged. The invoice confirmation is NOT rolled back (the
invoice is already confirmed), but the stock discrepancy is flagged
for manual review.
