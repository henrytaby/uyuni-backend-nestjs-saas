# Audit Infrastructure: REST API Contracts

This document defines the REST API contracts for the audit module.

## 1. Query Access Logs

**Endpoint:** `GET /audit/access-logs`

- **Auth:** JWT required
- **Permissions:** `audit:read`
- **Tenant Scope:** Scoped to requesting user's tenant ID.

### Request Parameters (Query)
| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `cursor` | string | Opaque cursor for pagination | No | - |
| `limit` | integer | Number of items to return | No | 50 (max 200) |
| `startDate` | ISO date | Start timestamp to filter logs | No | - |
| `endDate` | ISO date | End timestamp to filter logs | No | - |
| `userId` | UUID | Filter logs by specific user | No | - |
| `route` | string | Filter logs where route contains match | No | - |

### Response Schema (200 OK)
```json
{
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "userId": "uuid",
      "requestId": "uuid",
      "ipAddress": "string",
      "userAgent": "string",
      "method": "string",
      "route": "string",
      "statusCode": 200,
      "durationMs": 45,
      "timestamp": "2023-10-25T10:00:00Z"
    }
  ],
  "cursor": "base64-encoded-cursor-string",
  "hasNext": true
}
```
*Note: Sorting is fixed to `timestamp DESC`.*

### Error Codes
- **401 Unauthorized:** Missing or invalid JWT.
- **403 Forbidden:** Lacks `audit:read` permission.
- **400 Bad Request:** Invalid query parameters (e.g., malformed UUID or date).

---

## 2. Get Access Log by Request ID

**Endpoint:** `GET /audit/access-logs/:requestId`

- **Auth:** JWT required
- **Permissions:** `audit:read`
- **Tenant Scope:** Scoped to requesting user's tenant ID.

### Request Parameters (Path)
| Name | Type | Description | Required |
|---|---|---|---|
| `requestId` | UUID | The unique request identifier | Yes |

### Response Schema (200 OK)
```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "userId": "uuid",
  "requestId": "uuid",
  "ipAddress": "string",
  "userAgent": "string",
  "method": "string",
  "route": "string",
  "statusCode": 200,
  "durationMs": 45,
  "requestBody": "{}", 
  "responseBody": "{}",
  "timestamp": "2023-10-25T10:00:00Z"
}
```

### Error Codes
- **401 Unauthorized:** Missing or invalid JWT.
- **403 Forbidden:** Lacks `audit:read` permission.
- **404 Not Found:** Log not found or does not belong to the user's tenant.

---

## 3. Query Change Records (CDC)

**Endpoint:** `GET /audit/change-records`

- **Auth:** JWT required
- **Permissions:** `audit:read`
- **Tenant Scope:** Scoped to requesting user's tenant ID.

### Request Parameters (Query)
| Name | Type | Description | Required | Default |
|---|---|---|---|---|
| `cursor` | string | Opaque cursor for pagination | No | - |
| `limit` | integer | Number of items to return | No | 50 (max 200) |
| `entityType` | string | Filter by entity table name (e.g., 'TenantUser') | No | - |
| `entityId` | UUID | Filter by specific entity ID | No | - |
| `startDate` | ISO date | Start timestamp | No | - |
| `endDate` | ISO date | End timestamp | No | - |
| `actorId` | UUID | Filter by the user who made the change | No | - |
| `action` | string | `CREATE`, `UPDATE`, or `DELETE` | No | - |

### Response Schema (200 OK)
```json
{
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "entityType": "TenantUser",
      "entityId": "uuid",
      "action": "UPDATE",
      "oldValues": { "status": "ACTIVE" },
      "newValues": { "status": "INACTIVE" },
      "actorId": "uuid",
      "requestId": "uuid",
      "timestamp": "2023-10-25T10:05:00Z"
    }
  ],
  "cursor": "base64-encoded-cursor-string",
  "hasNext": true
}
```

### Error Codes
- **401 Unauthorized:** Missing or invalid JWT.
- **403 Forbidden:** Lacks `audit:read` permission.
- **400 Bad Request:** Invalid query parameters.

---

## 4. Get Change History for Entity

**Endpoint:** `GET /audit/change-records/entity/:entityType/:entityId`

- **Auth:** JWT required
- **Permissions:** `audit:read`
- **Tenant Scope:** Scoped to requesting user's tenant ID.

### Request Parameters (Path)
| Name | Type | Description | Required |
|---|---|---|---|
| `entityType` | string | Entity table name | Yes |
| `entityId` | UUID | The entity ID | Yes |

### Response Schema (200 OK)
```json
{
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "entityType": "TenantUser",
      "entityId": "uuid",
      "action": "CREATE",
      "oldValues": null,
      "newValues": { "name": "John", "status": "ACTIVE" },
      "actorId": "uuid",
      "requestId": "uuid",
      "timestamp": "2023-10-25T09:00:00Z"
    },
    {
      "id": "uuid",
      "tenantId": "uuid",
      "entityType": "TenantUser",
      "entityId": "uuid",
      "action": "UPDATE",
      "oldValues": { "status": "ACTIVE" },
      "newValues": { "status": "INACTIVE" },
      "actorId": "uuid",
      "requestId": "uuid",
      "timestamp": "2023-10-25T10:05:00Z"
    }
  ],
  "cursor": "string|null",
  "hasNext": false
}
```
*Note: Sorted chronologically (oldest to newest).*

### Error Codes
- **401 Unauthorized:** Missing or invalid JWT.
- **403 Forbidden:** Lacks `audit:read` permission.

---

## 5. Get Changes by Request ID

**Endpoint:** `GET /audit/change-records/request/:requestId`

- **Auth:** JWT required
- **Permissions:** `audit:read`
- **Tenant Scope:** Scoped to requesting user's tenant ID.

### Request Parameters (Path)
| Name | Type | Description | Required |
|---|---|---|---|
| `requestId` | UUID | The correlation request identifier | Yes |

### Response Schema (200 OK)
```json
[
  {
    "id": "uuid",
    "tenantId": "uuid",
    "entityType": "TenantUser",
    "entityId": "uuid",
    "action": "CREATE",
    "oldValues": null,
    "newValues": { "id": "...", "name": "..." },
    "actorId": "uuid",
    "requestId": "uuid",
    "timestamp": "2023-10-25T10:00:00Z"
  }
]
```

### Error Codes
- **401 Unauthorized:** Missing or invalid JWT.
- **403 Forbidden:** Lacks `audit:read` permission.
