# Phase 1 Data Model: Generic Repository & DataTables

This is an INFRASTRUCTURE feature — it does NOT define new database models/tables. Instead, it defines TypeScript interfaces, abstract classes, and DTOs that are consumed by domain modules.

## 1. DataTableRequestDto

**File Path:** `src/common/dto/datatable-request.dto.ts`

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `page` | `number` | No | `@IsOptional()`, `@Type(() => Number)`, `@IsInt()`, `@Min(1)` | Page number, default 1, min 1, integer |
| `pageSize` | `number` | No | `@IsOptional()`, `@Type(() => Number)`, `@IsInt()`, `@Min(1)`, `@Max(100)` | Items per page, default 25, min 1, max 100, integer |
| `sortField` | `string` | No | `@IsOptional()`, `@IsString()` | Single sort field name |
| `sortOrder` | `'asc' \| 'desc'` | No | `@IsOptional()`, `@IsIn(['asc', 'desc'])` | Sort direction, default 'desc' |
| `sort` | `string` | No | `@IsOptional()`, `@IsString()`, `@MaxLength(2000)` | JSON array of `{ field: string, order: 'asc' \| 'desc' }` for multi-column sort, max 3 (validated as JSON in repository) |
| `searchTerm` | `string` | No | `@IsOptional()`, `@IsString()`, `@MaxLength(2000)` | Global search string, case-insensitive partial matching |
| `filters` | `string` | No | `@IsOptional()`, `@IsString()`, `@MaxLength(2000)` | JSON-encoded object mapping field names to filter conditions (validated as JSON in repository) |
| `includeDeleted` | `boolean` | No | `@IsOptional()`, `@Type(() => Boolean)`, `@IsBoolean()` | Include soft-deleted records, default false (requires `audit:read` permission) |

*Note: All fields are decorated with `@ApiPropertyOptional()` for Swagger.*

## 2. DataTableMetaDto

**File Path:** `src/common/dto/datatable-response.dto.ts`

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `total` | `number` | Yes | - | Total matching records |
| `page` | `number` | Yes | - | Current page number |
| `pageSize` | `number` | Yes | - | Items per page |
| `totalPages` | `number` | Yes | - | `ceil(total / pageSize)` |
| `hasNextPage` | `boolean` | Yes | - | `page < totalPages` |
| `hasPreviousPage` | `boolean` | Yes | - | `page > 1` |

*Note: All fields are decorated with `@ApiProperty()`.*

## 3. DataTableResponseDto<T>

**File Path:** `src/common/dto/datatable-response.dto.ts`

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `data` | `T[]` | Yes | - | Array of entity records |
| `meta` | `DataTableMetaDto` | Yes | - | Pagination metadata |

*Note: Decorated with `@ApiProperty()`. Generic type `T` is the entity type.*

## 4. FilterCondition

**File Path:** `src/common/repository/repository-config.interface.ts`

```typescript
export interface FilterCondition {
  equals?: string | number | boolean;
  contains?: string;
  gte?: string | number;  // >= (dates as ISO strings)
  lte?: string | number;  // <= (dates as ISO strings)
  in?: (string | number)[];  // IN array
}
```

## 5. SortItem

**File Path:** `src/common/repository/repository-config.interface.ts`

```typescript
export interface SortItem {
  field: string;
  order: 'asc' | 'desc';
}
```

## 6. RepositoryConfig

**File Path:** `src/common/repository/repository-config.interface.ts`

```typescript
export interface RepositoryConfig {
  searchableFields: readonly string[];   // Fields for global search (OR logic, case-insensitive contains)
  filterableFields: readonly string[];   // Fields allowed in column filters
  sortableFields: readonly string[];     // Fields allowed in sort
  defaultSort: SortItem;                 // Default when no sort specified (default: { field: 'createdAt', order: 'desc' })
  maxPageSize?: number;                  // Override global 100 cap per entity
  defaultPageSize?: number;              // Override global 25 default per entity
  includes?: Record<string, boolean | object>;  // Prisma include for eager loading relations
}
```

## 7. TenantScopedRepository<TEntity>

**File Path:** `src/common/repository/tenant-scoped.repository.ts`

**Abstract Members:**
- `protected abstract readonly config: RepositoryConfig`
- `protected abstract get delegate(): PrismaDelegate` (returns the Prisma model delegate e.g., `this.prisma.catalogCategory`)

**Constructor:**
- `constructor(protected readonly prisma: PrismaService)`

**Public Methods:**
- `findAll(dto: DataTableRequestDto): Promise<DataTableResponseDto<TEntity>>` — Main paginated list method

**Protected Methods (internal, overridable by subclasses):**
- `buildWhere(dto: DataTableRequestDto): object` — Constructs Prisma where clause from search + filters
- `buildSearchCondition(searchTerm: string): object` — Constructs OR conditions across searchableFields
- `buildFilterConditions(filtersJson: string): object` — Parses and validates column filters
- `buildOrderBy(dto: DataTableRequestDto): object[]` — Constructs Prisma orderBy from sort params
- `normalizePagination(dto: DataTableRequestDto): { page: number, pageSize: number }` — Caps and normalizes
- `formatResponse(data: TEntity[], total: number, page: number, pageSize: number): DataTableResponseDto<TEntity>` — Builds response
- `validateFieldAllowed(field: string, allowedFields: readonly string[], fieldType: string): void` — Throws BadRequestException

## Relationships Diagram

```
DataTableRequestDto ──(input)──> TenantScopedRepository<T>.findAll()
                                        │
                                        ├── uses RepositoryConfig
                                        │     ├── searchableFields
                                        │     ├── filterableFields
                                        │     ├── sortableFields
                                        │     ├── defaultSort: SortItem
                                        │     └── includes
                                        │
                                        ├── FilterCondition (parsed from filters JSON)
                                        │
                                        └── returns DataTableResponseDto<T>
                                              ├── data: T[]
                                              └── meta: DataTableMetaDto

Concrete Repositories:
  ClientRepository extends TenantScopedRepository<Client>
  CatalogCategoryRepository extends TenantScopedRepository<CatalogCategory>
  TaskRepository extends TenantScopedRepository<Task>
```

## State Transitions

N/A (no state machine in this feature)
