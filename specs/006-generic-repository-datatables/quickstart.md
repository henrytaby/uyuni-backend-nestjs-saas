# Generic Repository & DataTables - Validation Guide

This document outlines the validation procedures for the Generic Repository and DataTables feature (post-implementation). It focuses on verifying end-to-end functionality after implementation.

See [Data Model](data-model.md) and [API Contracts](contracts/datatable-api.md) for implementation details.

## Prerequisites

- Node.js 20+
- Docker (for Testcontainers PostgreSQL database)
- Project dependencies installed (`npm install`)
- Database migrations applied (`npx prisma migrate dev`)
- At least one domain module consuming the generic repository (e.g., a test entity or the upcoming `CatalogCategory` from 007)

## Validation Scenarios

### Scenario 1: Basic Pagination
- **Action**: Seed 50 test records for a tenant. Perform `GET /{resource}?page=1&pageSize=10`
- **Expected**: 10 records returned. Metadata shows `total=50`, `totalPages=5`, `hasNextPage=true`.

### Scenario 2: Default Sort (createdAt DESC)
- **Action**: Perform `GET /{resource}?page=1&pageSize=5` without sort parameters.
- **Expected**: Records are sorted by `createdAt` descending (most recent first).

### Scenario 3: Custom Sort
- **Action**: Perform `GET /{resource}?sortField=name&sortOrder=asc`
- **Expected**: Records are sorted alphabetically by `name` ascending.

### Scenario 4: Multi-Column Sort
- **Action**: Perform `GET /{resource}?sort=[{"field":"status","order":"asc"},{"field":"name","order":"asc"}]`
- **Expected**: Records are sorted by `status` first, then by `name` within the same status.

### Scenario 5: Global Search
- **Action**: Perform `GET /{resource}?searchTerm=gar`
- **Expected**: Returns records containing "gar" in any configured searchable field (case-insensitive).

### Scenario 6: Column Filter (equals)
- **Action**: Perform `GET /{resource}?filters={"status":{"equals":"ACTIVE"}}`
- **Expected**: Only records with `status` exactly matching "ACTIVE" are returned.

### Scenario 7: Column Filter (date range)
- **Action**: Perform `GET /{resource}?filters={"createdAt":{"gte":"2026-01-01","lte":"2026-06-30"}}`
- **Expected**: Only records created within the specified date range are returned.

### Scenario 8: Combined Search + Filter
- **Action**: Perform `GET /{resource}?searchTerm=corp&filters={"status":{"equals":"ACTIVE"}}`
- **Expected**: Records matching BOTH the search term AND the filter (logical AND).

### Scenario 9: Tenant Isolation
- **Action**: Seed records for two different tenants. Perform a GET request as a user from one tenant.
- **Expected**: The user only sees their tenant's records. Total counts reflect only that tenant's data.

### Scenario 10: Ownership Scoping (OWN)
- **Action**: Perform requests as users with different scope filters.
- **Expected**: A user with scope filter 'OWN' sees only records they created. A user with scope filter 'ANY' sees all tenant records.

### Scenario 11: Soft-Delete Exclusion
- **Action**: Soft-delete a record (`isActive=false`). Perform a normal GET request, then a GET with `includeDeleted=true`.
- **Expected**: Normal GET excludes the record and it's not in the total count. GET with `includeDeleted=true` (requires `audit:read` permission) includes the record.

### Scenario 12: Invalid Sort Field
- **Action**: Perform `GET /{resource}?sortField=passwordHash`
- **Expected**: 400 Bad Request error. The message lists the allowed sort fields.

### Scenario 13: Invalid Filter Field
- **Action**: Perform `GET /{resource}?filters={"passwordHash":{"equals":"secret"}}`
- **Expected**: 400 Bad Request error. The message lists the allowed filter fields.

### Scenario 14: Empty Results
- **Action**: Perform `GET /{resource}?page=1&pageSize=10` when no records exist.
- **Expected**: 
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

### Scenario 15: Page Size Capping
- **Action**: Perform `GET /{resource}?pageSize=500`
- **Expected**: `pageSize` is capped to 100 in the response and behavior.

### Scenario 16: Page Beyond Data
- **Action**: With 50 total records, perform `GET /{resource}?page=10&pageSize=10`
- **Expected**: 
  ```json
  { 
    "data": [], 
    "meta": { 
      "total": 50, 
      "page": 10, 
      "pageSize": 10, 
      "totalPages": 5, 
      "hasNextPage": false, 
      "hasPreviousPage": true 
    } 
  }
  ```

## Running Validation

### Unit Tests
Verify the core repository logic in isolation:
```bash
npm run test -- --testPathPattern=common/repository
```

### E2E Tests
Verify end-to-end functionality via API requests:
```bash
npm run test:e2e -- --testPathPattern=datatable
```

## Expected Test File Structure
```text
test/
├── unit/
│   └── common/
│       └── repository/
│           └── tenant-scoped.repository.spec.ts
└── e2e/
    └── datatable.e2e-spec.ts
```
