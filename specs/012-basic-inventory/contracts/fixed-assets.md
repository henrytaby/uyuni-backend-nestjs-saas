# API Contract: Fixed Assets

**Module**: Inventory
**Base Path**: `/inventory/fixed-assets`
**Auth**: JWT required, TenantGuard, PlanGate (Pro/Premium), RBAC: inventory:*

---

## Endpoints

### POST /inventory/fixed-assets

Register a new fixed asset.

**RBAC**: inventory:CREATE

**Request Body**:
```json
{
  "name": "Dell Latitude Laptop",
  "description": "15-inch laptop for sales team",
  "acquisitionValue": 1200.00,
  "acquisitionDate": "2026-06-15"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | yes | 1-255 chars |
| description | string | no | max 1000 chars |
| acquisitionValue | decimal | yes | >= 0 |
| acquisitionDate | ISO date | yes | Not in the future |

**Response** (201 Created):
```json
{
  "id": "uuid",
  "name": "Dell Latitude Laptop",
  "description": "15-inch laptop for sales team",
  "acquisitionValue": 1200.00,
  "acquisitionDate": "2026-06-15",
  "status": "ACTIVE",
  "isActive": true,
  "createdAt": "2026-07-07T12:00:00Z",
  "updatedAt": "2026-07-07T12:00:00Z"
}
```

**Errors**:
- 400: Validation error (missing name, negative value, future date)
- 403: Free plan tenant (PlanGate) or missing inventory:CREATE permission

---

### GET /inventory/fixed-assets

List fixed assets with pagination, sorting, and search.

**RBAC**: inventory:READ

**Query Parameters** (DataTableRequestDto):
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| pageSize | number | 25 | Items per page (max 100) |
| sortField | string | "name" | Sort column |
| sortOrder | "asc" \| "desc" | "asc" | Sort direction |
| searchTerm | string | null | Search across name, description |
| status | "ACTIVE" \| "DISPOSED" | "ACTIVE" | Filter by status |

**Response** (200 OK):
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Dell Latitude Laptop",
      "acquisitionValue": 1200.00,
      "acquisitionDate": "2026-06-15",
      "status": "ACTIVE",
      "isActive": true
    }
  ],
  "total": 35
}
```

---

### GET /inventory/fixed-assets/summary

Get a summary of active fixed assets — total count and total value.

**RBAC**: inventory:READ

**Response** (200 OK):
```json
{
  "totalAssets": 35,
  "totalValue": 42000.00,
  "activeCount": 32,
  "disposedCount": 3
}
```

---

### GET /inventory/fixed-assets/:id

Get a single fixed asset by ID.

**RBAC**: inventory:READ

**Response** (200 OK): Full fixed asset object (same as POST response).

**Errors**:
- 404: Asset not found or belongs to another tenant

---

### PATCH /inventory/fixed-assets/:id

Update a fixed asset. The acquisitionValue and acquisitionDate are
immutable after creation (they represent historical facts).

**RBAC**: inventory:UPDATE

**Request Body** (partial):
```json
{
  "name": "Dell Latitude Laptop (Sales)",
  "description": "Updated description"
}
```

**Response** (200 OK): Updated fixed asset object.

---

### POST /inventory/fixed-assets/:id/dispose

Mark a fixed asset as disposed. This changes status to DISPOSED and
removes it from the active assets list. The asset is preserved in the
full history (not deleted).

**RBAC**: inventory:UPDATE

**Response** (200 OK):
```json
{
  "id": "uuid",
  "status": "DISPOSED",
  "isActive": true
}
```

**Errors**:
- 404: Asset not found
- 409: Asset is already disposed

---

### DELETE /inventory/fixed-assets/:id

Soft-delete a fixed asset (sets is_active=false).

**RBAC**: inventory:DELETE

**Response** (200 OK):
```json
{
  "id": "uuid",
  "isActive": false
}
```
