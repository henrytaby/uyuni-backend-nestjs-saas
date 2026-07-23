# Feature Specification: Generic Repository & DataTables

**Feature Branch**: `006-generic-repository-datatables`

**Created**: 2026-07-07

**Status**: Ready

**Updated**: 2026-07-23 (Enterprise Architect Review — v2)

**Input**: User description: "Implement a generic tenant-scoped repository pattern with standardized pagination, sorting, global search, column-specific filters, and DataTable request/response contract for all list endpoints."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paginated & Sorted Data Listing (Priority: P1)

A user navigates to any list view in the application (clients, tasks,
invoices, etc.). The system returns a paginated, sorted subset of records
with full pagination metadata (total count, current page, total pages,
navigation flags). The user can change the page size, navigate between
pages, and sort by any defined column. Multi-column sorting is supported
for up to 3 columns.

**Why this priority**: Every domain module requires paginated list endpoints.
Without a generic pattern, each module duplicates pagination logic — a
violation of DRY and a source of inconsistencies.

**Independent Test**: Call a list endpoint with pagination and sort
parameters. Verify the response contains the correct page of records, full
pagination metadata, and that sorting is applied correctly.

**Acceptance Scenarios**:

1. **Given** a list endpoint with 50 records, **When** the user requests
   page 1 with page size 10, **Then** exactly 10 records are returned with
   meta: { total: 50, page: 1, pageSize: 10, totalPages: 5,
   hasNextPage: true, hasPreviousPage: false }.
2. **Given** a list endpoint, **When** the user requests records sorted by
   name ascending, **Then** records are returned in alphabetical order by
   name.
3. **Given** a list endpoint, **When** the user requests page 6 with page
   size 10 but only 50 records exist, **Then** an empty data array is
   returned with meta: { total: 50, page: 6, pageSize: 10, totalPages: 5,
   hasNextPage: false, hasPreviousPage: true }.
4. **Given** a list endpoint, **When** no sortField is specified, **Then**
   records are sorted by createdAt DESC by default.
5. **Given** a list endpoint, **When** the user requests multi-column sort
   (e.g., status ASC then name ASC), **Then** records are sorted by the
   first column, then by the second column within ties.
6. **Given** a list endpoint with 0 records, **When** the user requests
   page 1, **Then** the response is { data: [], meta: { total: 0, page: 1,
   pageSize: 25, totalPages: 0, hasNextPage: false,
   hasPreviousPage: false } }.

---

### User Story 2 - Global Search Across Searchable Fields (Priority: P2)

A user types a search term in a global search box. The system searches
across predefined searchable fields (e.g., name, email, document number)
and returns matching records. The search is case-insensitive and
supports partial matches.

**Why this priority**: Search is a fundamental UX requirement for data
tables. Centralizing the search logic prevents each module from
implementing its own (buggy) search.

**Independent Test**: Search for "gar" in a client list where a client
named "García" exists. Verify the record is returned.

**Acceptance Scenarios**:

1. **Given** a list endpoint with searchable fields defined (name, email),
   **When** the user searches for "mar", **Then** records containing "mar"
   in either name or email (case-insensitive) are returned.
2. **Given** a list endpoint, **When** no search term is provided, **Then**
   all records (within pagination limits) are returned without filtering.
3. **Given** a list endpoint with no searchable fields defined for a
   module, **When** a search term is provided, **Then** the search
   parameter is ignored and all records are returned.

---

### User Story 3 - Automatic Tenant Isolation & Scope Enforcement (Priority: P1)

All list queries are automatically scoped to the authenticated user's
tenant. If the user's RBAC scopeFilter is 'ANY', they see all tenant
records. If scopeFilter is 'OWN', they see only their own records. This
is enforced by the generic repository leveraging the existing RBAC
OwnershipScopeInterceptor and tenant-scoped infrastructure — without any
code in the Controller or Service.

**Why this priority**: Centralizing tenant isolation and scope enforcement
in the repository layer is the architectural guarantee that no module can
accidentally leak cross-tenant or cross-owner data.

**Independent Test**: Two users in the same tenant, one with scopeFilter
'ANY' and one with scopeFilter 'OWN'. The first sees all records; the
second sees only their own. No Controller or Service code explicitly
filters by tenant or owner.

**Acceptance Scenarios**:

1. **Given** a user in Tenant A, **When** they call any list endpoint,
   **Then** only Tenant A records are returned regardless of other tenants'
   data.
2. **Given** a user with RBAC scopeFilter 'ANY', **When** they call a list
   endpoint, **Then** all records within their tenant are returned.
3. **Given** a user with RBAC scopeFilter 'OWN', **When** they call a list
   endpoint, **Then** only records created by that user are returned.

---

### User Story 4 - Column-Specific Filters (Priority: P2)

A user applies filters to specific columns in a data table (e.g., filter
by status, date range, category). The generic repository accepts a
standardized filters object that maps field names to filter conditions
(equals, contains, gte, lte, in). Filters are validated against an allowed
list per entity to prevent injection of arbitrary fields.

**Why this priority**: Global search alone is insufficient for enterprise
data tables. Users need to filter by status, date ranges, categories, and
other column-specific criteria. Without a generic mechanism, every module
implements ad-hoc filtering — violating DRY and introducing bugs.

**Independent Test**: Filter an invoices list by status='PAID' and
createdAt >= '2026-01-01'. Verify only matching records are returned.
Attempt to filter by a non-allowed field (e.g., passwordHash) and verify
it is rejected.

**Acceptance Scenarios**:

1. **Given** a list endpoint with allowed filter fields (status, createdAt),
   **When** the user filters by status='ACTIVE', **Then** only records
   with status ACTIVE are returned.
2. **Given** a list endpoint, **When** the user filters by createdAt with
   gte='2026-01-01' and lte='2026-06-30', **Then** only records within
   that date range are returned.
3. **Given** a list endpoint, **When** the user filters by a field NOT in
   the allowed list, **Then** the filter is rejected with a validation
   error.
4. **Given** a list endpoint, **When** the user combines global search AND
   column filters, **Then** both are applied (AND logic) — the search
   narrows the filtered results.

### Edge Cases

- Search term contains special SQL characters — MUST be safely handled
  via parameterized queries; no raw string interpolation.
- Page size exceeds a maximum threshold (e.g., 100) — MUST be capped at
  the maximum to prevent excessive memory usage.
- Sort field is not a valid column — MUST return a validation error
  listing the allowed sort fields.
- Concurrent count and data queries — MUST be consistent (same total count
  as the data result set) within the same request.
- Filter field is a relation field (e.g., categoryId) — MUST be supported
  if declared as an allowed filter field.
- Soft-deleted records (is_active=false) — MUST be excluded from all list
  queries by default. Auditors MAY include them via an explicit
  include_deleted=true parameter. This MUST be architecturally enforced via
  an `IncludeDeletedInterceptor` that strips the parameter if the user lacks
  the `audit:read` permission, preventing developers from accidentally leaking
  soft-deleted records.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a generic tenant-scoped repository pattern
  that all domain modules use for data access.
- **FR-002**: System MUST support pagination via page number and pageSize
  with a standardized DataTableRequestDto accepted by all list endpoints.
- **FR-003**: System MUST support sorting via sortField and sortOrder
  parameters in the DataTableRequestDto. Single-column sort uses sortField
  (string) and sortOrder ('asc'|'desc'). Multi-column sort uses an array
  of {field, order} objects. Maximum 3 sort columns.
- **FR-004**: System MUST execute data query and count query in parallel,
  returning a standardized response: { data: T[], meta: { total, page,
  pageSize, totalPages, hasNextPage, hasPreviousPage } }.
- **FR-005**: System MUST support global search across predefined searchable
  fields using case-insensitive partial matching (OR logic across fields).
- **FR-006**: System MUST automatically enforce tenant isolation in all
  queries via the existing tenant-scoped infrastructure (tenant_id
  injection from TenantContext).
- **FR-007**: System MUST automatically enforce ownership scoping via the
  existing RBAC scopeFilter from TenantContext. When scopeFilter is 'ANY',
  all tenant records are returned. When scopeFilter is 'OWN', only records
  created by the requesting user are returned. This leverages the existing
  OwnershipScopeInterceptor and tenant-scoped extension from 004-rbac.
- **FR-008**: System MUST cap the maximum page size to prevent excessive
  resource consumption (default cap: 100, configurable per entity).
- **FR-009**: System MUST validate sort fields against an allowed list per
  entity to prevent invalid or malicious sort parameters.
- **FR-010**: The DataTableRequestDto and DataTableResponseDto MUST be
  exposed via OpenAPI/Swagger for frontend auto-generation.
- **FR-011**: System MUST support column-specific filters via a standardized
  filters object in the DataTableRequestDto. Supported operators: equals,
  contains, gte (>=), lte (<=), in (array of values). Filter fields MUST
  be validated against an allowed list per entity.
- **FR-012**: When no sortField is specified, the system MUST default to
  sorting by createdAt DESC. Each entity MAY override the default sort
  field in its repository configuration.
- **FR-013**: The generic repository MUST support a declarative include
  configuration per entity, defining which relations are eagerly loaded
  in list queries. This prevents N+1 query problems and is configured
  once in the repository definition, not in each Controller call.
- **FR-014**: System MUST exclude soft-deleted records (is_active=false)
  from all list queries by default. Auditors MAY request inclusion via
  an explicit include_deleted=true query parameter. To enforce this architecturally,
  an `IncludeDeletedInterceptor` MUST strip this parameter from the request
  unless the route is decorated with `@AllowIncludeDeleted()` AND the user
  has the `audit:read` permission.
- **FR-015**: The repository MUST ensure `config.includes` is successfully
  passed to the underlying Prisma `findMany` call to eagerly load relations.

### Non-Functional Requirements

- **NFR-001**: List queries on tables with up to 100K records MUST return
  results in < 500ms with appropriate indexes.
- **NFR-002**: Global search using case-insensitive partial matching MUST
  perform acceptably (< 1s) on tables with up to 100K records. For larger
  tables, trigram indexes SHOULD be considered.
- **NFR-003**: The generic repository MUST add zero boilerplate for new
  domain modules — a developer defines only the entity's searchable fields,
  filterable fields, sortable fields, and default includes.

### Key Entities

- **DataTableRequestDto**: Standardized request DTO. Attributes: page
  (number, default 1), pageSize (number, default 25, max 100),
  sortField (string, optional), sortOrder ('asc'|'desc', default 'desc'),
  sort (array of {field, order}, optional, max 3),
  searchTerm (string, optional),
  filters (object mapping field names to filter conditions, optional).
- **DataTableResponseDto<T>**: Standardized response. Attributes:
  data (array of T),
  meta: { total (number), page (number), pageSize (number),
  totalPages (number), hasNextPage (boolean), hasPreviousPage (boolean) }.
- **RepositoryConfig**: Per-entity configuration. Attributes:
  searchableFields (string[]), filterableFields (string[]),
  sortableFields (string[]), defaultSort ({field, order}),
  includes (relation names to eagerly load).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer adding a new domain module can create a paginated,
  searchable, filterable, tenant-isolated list endpoint by defining only
  the entity's RepositoryConfig — no pagination, filtering, or scoping
  logic required.
- **SC-002**: All list endpoints across the system accept the same
  DataTableRequestDto and return the same DataTableResponseDto structure —
  verified by an automated contract test.
- **SC-003**: Search results include all matching records regardless of
  which searchable field contains the match — verified by tests with
  matches in different fields.
- **SC-004**: Data and count queries return consistent results — the total
  count always matches the number of records that would be returned without
  pagination limits.
- **SC-005**: No list endpoint returns records from other tenants or
  records outside the user's ownership scope — verified by cross-tenant
  and cross-user isolation tests.

## Assumptions

- The generic repository abstracts the data access layer, providing a
  clean interface to domain Services regardless of the underlying ORM
  or data access technology.
- Searchable fields, filterable fields, and sortable fields are defined
  declaratively per entity in the repository configuration.
- The default page size is 25; the maximum allowed is 100. Both are
  configurable per entity.
- Soft-deleted records (is_active=false) are excluded from list queries
  by default in the generic repository.
- Global search and column-specific filters are combined with AND logic:
  the search narrows the filtered results.
- Relation search (searching across related entity fields, e.g., searching
  TenantUser by User.email) is NOT in scope for the initial implementation.
  This MAY be added as a future enhancement.
- Multi-column sort supports a maximum of 3 columns to prevent complex
  query plans.

## Dependencies

- **002-multi-tenancy-core**: Provides tenant isolation via
  `TenantContextService` and the tenant-scoped Prisma extension.
- **004-rbac**: Provides ownership scoping via `scopeFilter` ('ANY'/'OWN')
  set by the `OwnershipScopeInterceptor` in `TenantContext`.
- **005-audit-infrastructure**: Provides soft-delete enforcement
  (is_active=false exclusion) and audit column injection (createdById,
  updatedById).
- **001-foundation-bootstrap**: Provides base infrastructure and
  request context propagation.
