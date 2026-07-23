# REST API Contract: Generic Repository & DataTables

This document specifies the REST API contract for the Generic Repository and DataTables feature. This feature **does NOT define its own REST endpoints**. Instead, it defines a **contract pattern** that ALL domain module list endpoints MUST follow across the Uyuni SaaS NestJS backend.

## Contract: DataTable List Endpoint Pattern

Every domain module list endpoint MUST adhere to the following rules:

1. **Accept `DataTableRequestDto`** as query parameters for all list requests.
2. **Return a `DataTableResponseDto<T>`** structure as the response body.
3. **Use the `HTTP GET` method** for retrieving list data.
4. **Require Authentication** (JWT) and relevant **RBAC permissions** (e.g., `module:READ`).

---

## 1. Request Contract

**Method**: `GET`  
**Path**: `/{resource}` *(e.g., `/catalogs/categories`, `/clients`, `/tasks`)*  
**Authentication**: Bearer JWT token required  
**RBAC**: Requires `{module}:READ` permission

### Query Parameters (`DataTableRequestDto`)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number (min: 1) |
| `pageSize` | integer | `25` | Items per page (min: 1, max: 100) |
| `sortField` | string | - | Sort by field name (validated against entity's `sortableFields`) |
| `sortOrder` | `'asc'` \| `'desc'` | `'desc'` | Sort direction |
| `sort` | string (JSON) | - | Multi-column sort: `[{"field":"name","order":"asc"}]` (max 3) |
| `searchTerm` | string | - | Global search across entity's `searchableFields` (case-insensitive, partial match) |
| `filters` | string (JSON) | - | Column filters: `{"status":{"equals":"ACTIVE"}}` |
| `includeDeleted` | boolean | `false` | Include soft-deleted records (requires `audit:read` permission) |

### Filter Operators (within `filters` JSON)

| Operator | Type | Prisma Mapping | Example |
|---|---|---|---|
| `equals` | string \| number \| boolean | `{ field: value }` | `{"status":{"equals":"ACTIVE"}}` |
| `contains` | string | `{ field: { contains: value, mode: 'insensitive' } }` | `{"name":{"contains":"gar"}}` |
| `gte` | string \| number | `{ field: { gte: value } }` | `{"createdAt":{"gte":"2026-01-01"}}` |
| `lte` | string \| number | `{ field: { lte: value } }` | `{"createdAt":{"lte":"2026-12-31"}}` |
| `in` | array | `{ field: { in: values } }` | `{"status":{"in":["ACTIVE","PENDING"]}}` |

---

## 2. Response Contract

**Status**: `200 OK`  
**Content-Type**: `application/json`

```json
{
  "data": [
    { /* entity fields */ }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "pageSize": 10,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## 3. Error Responses

| Status | Condition | Response Body |
|---|---|---|
| `400 Bad Request` | Invalid sort field | `{ "statusCode": 400, "message": "Invalid sort field 'xyz'. Allowed: [name, email, createdAt]", "error": "Bad Request" }` |
| `400 Bad Request` | Invalid filter field | `{ "statusCode": 400, "message": "Invalid filter field 'passwordHash'. Allowed: [status, createdAt, isActive]", "error": "Bad Request" }` |
| `400 Bad Request` | Invalid filter JSON | `{ "statusCode": 400, "message": "Invalid filters format: must be a valid JSON object", "error": "Bad Request" }` |
| `400 Bad Request` | Too many sort columns | `{ "statusCode": 400, "message": "Maximum 3 sort columns allowed", "error": "Bad Request" }` |
| `401 Unauthorized` | Missing/invalid JWT | `{ "statusCode": 401, "message": "Unauthorized" }` |
| `403 Forbidden` | Missing RBAC permission | `{ "statusCode": 403, "message": "Forbidden" }` |

---

## 4. Usage Examples

### Example 1: List Catalog Categories

**Request**:
```http
GET /catalogs/categories?page=1&pageSize=10&sortField=name&sortOrder=asc&searchTerm=client
Authorization: Bearer eyJ...
```

**Response (200 OK)**:
```json
{
  "data": [
    {
      "id": "uuid-1",
      "name": "Client Categories",
      "slug": "client_categories",
      "description": "Categories for client classification",
      "isActive": true,
      "sortOrder": 1,
      "createdAt": "2026-01-15T10:30:00Z",
      "updatedAt": "2026-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "pageSize": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### Example 2: Combined Search + Filter

**Request**:
```http
GET /clients?searchTerm=gar&filters={"status":{"equals":"ACTIVE"},"createdAt":{"gte":"2026-01-01"}}&sortField=name&sortOrder=asc&page=1&pageSize=25
Authorization: Bearer eyJ...
```

### Example 3: Multi-Column Sort

**Request**:
```http
GET /tasks?sort=[{"field":"status","order":"asc"},{"field":"createdAt","order":"desc"}]&page=1&pageSize=25
Authorization: Bearer eyJ...
```

### Example 4: Empty Results

**Request**:
```http
GET /invoices?searchTerm=nonexistent&page=1&pageSize=10
Authorization: Bearer eyJ...
```

**Response (200 OK)**:
```json
{
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "pageSize": 10,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

---

## 5. Consumer Implementation Pattern

This section demonstrates how a specific domain module integrates the Generic Repository and DataTable pattern.

### Controller

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import { PermissionAction } from '@prisma/client';
import { DataTableRequestDto } from '../../../common/dto/datatable-request.dto.js';
import { CatalogCategoryService } from './catalog-category.service.js';

@Controller('catalogs/categories')
@ApiTags('Catalogs')
@ApiBearerAuth('bearer')
export class CatalogCategoryController {
  constructor(private readonly service: CatalogCategoryService) {}

  @Get()
  @RequirePermissions({ module: 'catalogs', action: PermissionAction.READ })
  @ApiOperation({ summary: 'List catalog categories (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated list of catalog categories' })
  findAll(@Query() dto: DataTableRequestDto) {
    return this.service.findAll(dto);
  }
}
```

### Service

```typescript
import { Injectable } from '@nestjs/common';
import { DataTableRequestDto } from '../../../common/dto/datatable-request.dto.js';
import { CatalogCategoryRepository } from './catalog-category.repository.js';

@Injectable()
export class CatalogCategoryService {
  constructor(private readonly repository: CatalogCategoryRepository) {}

  findAll(dto: DataTableRequestDto) {
    return this.repository.findAll(dto);
  }
}
```

### Repository

```typescript
import { Injectable } from '@nestjs/common';
import { TenantScopedRepository } from '../../../common/repository/tenant-scoped.repository.js';
import { RepositoryConfig } from '../../../common/repository/repository-config.interface.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { CatalogCategory } from '@prisma/client';

@Injectable()
export class CatalogCategoryRepository extends TenantScopedRepository<CatalogCategory> {
  protected readonly config: RepositoryConfig = {
    searchableFields: ['name', 'slug', 'description'],
    filterableFields: ['isActive', 'slug'],
    sortableFields: ['name', 'slug', 'sortOrder', 'createdAt', 'updatedAt'],
    defaultSort: { field: 'sortOrder', order: 'asc' },
    includes: {},
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected get delegate() {
    return this.prisma.catalogCategory;
  }
}
```
