# Research: Generic Repository & DataTables

**Feature**: 006-generic-repository-datatables | **Date**: 2026-07-23

## Research Tasks & Findings

### 1. Generic Repository Pattern Strategy
- **Decision**: Abstract class with protected `delegate` getter pattern. Each concrete repository provides `protected get delegate() { return this.prisma.modelName; }`.
- **Rationale**: Works seamlessly with NestJS Dependency Injection (each concrete is its own `@Injectable`) while preserving Prisma type safety via the delegate getter.
- **Alternatives Considered**: 
  - Utility function approach: Rejected because it doesn't integrate well with NestJS DI testing/mocking.
  - Prisma extension approach: Rejected because extensions are global, whereas we need per-entity configurability.

### 2. DataTableRequestDto Location & Migration
- **Decision**: Place the new standardized DTO in `src/common/dto/datatable-request.dto.ts`. The existing `DataTableRequestDto` in `src/modules/tenancy/dto/plan.dto.ts` will be refactored to import from this common location.
- **Rationale**: The constitution mandates ALL list endpoints must use the exact same DTO. A common location prevents duplication.

### 3. Filter Representation in Query Params
- **Decision**: The `filters` field will be a JSON-encoded string passed in query params. The repository will parse and validate this against the entity's `filterableFields`. Supported operators include `equals`, `contains`, `gte`, `lte`, and `in`. (e.g., `?filters={"status":{"equals":"ACTIVE"},"createdAt":{"gte":"2026-01-01"}}`)
- **Rationale**: This works cleanly with GET query parameters, avoids overly complex nested DTO validation at the controller level, and keeps entity-specific validation securely within the repository layer.
- **Alternatives Considered**: 
  - Structured query params (`?filter[field][op]=value`): Harder to parse properly, and not a standard pattern in typical NestJS setups.
  - POST method for list endpoints: Violates REST semantics for read operations.

### 4. Multi-Column Sort Representation
- **Decision**: Support single-column sorting via `sortField` and `sortOrder` query parameters, and multi-column sorting via a `sort` JSON array parameter. The `sort` array takes precedence if both are provided. Max 3 sort columns (validated in the repository). (e.g., `?sort=[{"field":"status","order":"asc"},{"field":"name","order":"asc"}]`)
- **Rationale**: Simple single-column sort is the most common use case (UI clicks), while the JSON array provides an upgrade path for advanced use cases.

### 5. Sort/Filter Field Validation
- **Decision**: Field validation will happen at runtime in the repository's `buildOrderBy` and `buildWhere` methods. Invalid fields will trigger a `BadRequestException` containing the list of allowed fields.
- **Rationale**: Validations are entity-specific and declared in the `RepositoryConfig`, meaning they cannot be statically validated at the generic DTO level.

### 6. includeDeleted & RBAC Check [SUPERSEDED]
- **Decision (Superseded)**: Provide an `includeDeleted` boolean in `DataTableRequestDto`. RBAC checking for the `audit:read` permission will be enforced at the controller level via `@RequirePermissions`.
- **Rationale**: Maintains a clean separation of concerns.
- **Update**: *This decision was SUPERSEDED in Phase 1 Design to comply with Constitution Principle I. Relying on developers to remember `@RequirePermissions` violates architectural enforcement. The final design uses an `IncludeDeletedInterceptor` and an `@AllowIncludeDeleted()` decorator.*

### 7. Parallel Query Execution (data + count)
- **Decision**: Use `Promise.all([delegate.findMany(...), delegate.count(...)])` to execute both queries in parallel. Both queries run within the same tenant-scoped transaction context (via AsyncLocalStorage).
- **Rationale**: Guarantees consistent results for pagination metadata while providing better performance than sequential execution.

### 8. Default Sort Behavior
- **Decision**: Default to `createdAt DESC` when no explicit sort is specified. Each entity MAY override this behavior via `config.defaultSort`.
- **Rationale**: Matches spec FR-012. Most recent records first is almost universally the most useful default view for users.

### 9. Page Size Capping
- **Decision**: Establish a global max page size of 100 in the DTO (via `@Max(100)`), with a per-entity override via `config.maxPageSize`. The repository will resolve the limit using `Math.min(dto.pageSize, config.maxPageSize ?? 100)`.
- **Rationale**: Prevents excessive database load and memory consumption from malicious or poorly constructed requests, while leaving an escape hatch for special cases.

### 10. Existing DataTableRequestDto Migration
- **Decision**: Create the new DTO in `src/common/dto/`. Update existing queries (like `TenantQueryDto`, `UserQueryDto`, `TenantUserQueryDto`) to extend from this new location. The old DTO file will be kept for backward compatibility during the transitional period.
- **Rationale**: Allows for a gradual migration path without introducing immediate breaking changes across the codebase.

## Summary of Resolved Decisions

| Topic | Decision |
|-------|----------|
| **Generic Repository Pattern** | Abstract class with protected `delegate` getter. |
| **DTO Location** | `src/common/dto/datatable-request.dto.ts`. |
| **Filter Representation** | JSON-encoded string in query params, parsed/validated in repository. |
| **Multi-Column Sort** | JSON array `sort` param (max 3), supersedes `sortField`/`sortOrder`. |
| **Sort/Filter Validation** | Runtime validation in repository; throws `BadRequestException`. |
| **includeDeleted & RBAC** | Boolean in DTO; controller handles `@RequirePermissions`, repository handles data. |
| **Parallel Queries** | Use `Promise.all` for `findMany` and `count` under ALS transaction context. |
| **Default Sort** | `createdAt DESC` with optional per-entity override. |
| **Page Size Capping** | Max 100 globally, bounded by `Math.min(dto, config)`. |
| **Migration Path** | Create new common DTO, extend old query DTOs, keep old file for transition. |
