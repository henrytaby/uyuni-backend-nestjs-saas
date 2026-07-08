# Feature Specification: Generic Repository & DataTables

**Feature Branch**: `006-generic-repository-datatables`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Implement a generic tenant-scoped repository pattern with standardized pagination, sorting, global search, and DataTable request/response contract for all list endpoints."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paginated & Sorted Data Listing (Priority: P1)

A user navigates to any list view in the application (clients, tasks,
invoices, etc.). The system returns a paginated, sorted subset of records
with a total count. The user can change the page size, navigate between
pages, and sort by any defined column.

**Why this priority**: Every domain module requires paginated list endpoints.
Without a generic pattern, each module duplicates pagination logic — a
violation of DRY and a source of inconsistencies.

**Independent Test**: Call a list endpoint with pagination and sort
parameters. Verify the response contains the correct page of records, the
total count, and that sorting is applied correctly.

**Acceptance Scenarios**:

1. **Given** a list endpoint with 50 records, **When** the user requests
   page 1 with page size 10, **Then** exactly 10 records are returned and
   the total count is 50.
2. **Given** a list endpoint, **When** the user requests records sorted by
   name ascending, **Then** records are returned in alphabetical order by
   name.
3. **Given** a list endpoint, **When** the user requests page 6 with page
  size 10 but only 50 records exist, **Then** an empty data array is
   returned with total count 50.

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

### User Story 3 - Automatic Tenant Isolation & Scope Enforcement (Priority: P3)

All list queries are automatically scoped to the authenticated user's
tenant. If the user has scope_all=true, they see all tenant records. If
scope_all=false, they see only their own records. This is enforced by the
generic repository without any code in the Controller or Service.

**Why this priority**: Centralizing tenant isolation and scope enforcement
in the repository layer is the architectural guarantee that no module can
accidentally leak cross-tenant or cross-owner data.

**Independent Test**: Two users in the same tenant, one with scope_all=true
and one with scope_all=false. The first sees all records; the second sees
only their own. No Controller or Service code explicitly filters by tenant
or owner.

**Acceptance Scenarios**:

1. **Given** a user in Tenant A, **When** they call any list endpoint,
   **Then** only Tenant A records are returned regardless of other tenants'
  data.
2. **Given** a user with scope_all=true, **When** they call a list endpoint,
   **Then** all records within their tenant are returned.
3. **Given** a user with scope_all=false, **When** they call a list endpoint,
   **Then** only records created by that user are returned.

### Edge Cases

- Search term contains special SQL characters — MUST be escaped to prevent
  injection; no raw string interpolation into queries.
- Page size exceeds a maximum threshold (e.g., 500) — MUST be capped at the
  maximum to prevent excessive memory usage.
- Sort field is not a valid column — MUST default to the primary sort field
  or return a validation error.
- Concurrent count and data queries — MUST be consistent (same total count
  as the data result set) within the same request.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a generic tenant-scoped repository pattern
  that all domain modules use for data access.
- **FR-002**: System MUST support pagination via limit/offset (or
  skip/take) with a standardized DataTableRequestDto accepted by all list
  endpoints.
- **FR-003**: System MUST support sorting via sortField and sortOrder
  parameters in the DataTableRequestDto.
- **FR-004**: System MUST execute data query and count query in parallel,
  returning a standardized response: { data: T[], total: number }.
- **FR-005**: System MUST support global search across predefined searchable
  fields using case-insensitive partial matching.
- **FR-006**: System MUST automatically enforce tenant isolation in all
  queries via the request context (tenant_id injection).
- **FR-007**: System MUST automatically enforce scope_all in all queries —
  scope_all=true returns all tenant records; scope_all=false returns only
  records created by the requesting user.
- **FR-008**: System MUST cap the maximum page size to prevent excessive
  resource consumption (default cap: 100, configurable).
- **FR-009**: System MUST validate sort fields against an allowed list to
  prevent invalid or malicious sort parameters.
- **FR-010**: The DataTableRequestDto MUST be exposed via OpenAPI/Swagger
  for frontend auto-generation.

### Key Entities

- **DataTableRequest**: Standardized request DTO. Attributes: page (number),
  pageSize (number), sortField (string), sortOrder (asc/desc),
  searchTerm (string).
- **DataTableResponse**: Standardized response. Attributes: data (array of
  records), total (count of all matching records).
- **SearchableField**: Configuration per entity defining which fields are
  included in global search.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer adding a new domain module can create a paginated,
  searchable, tenant-isolated list endpoint without writing pagination or
  filtering logic — only defining the entity's searchable fields.
- **SC-002**: All list endpoints across the system accept the same request
  format and return the same response structure — verified by an automated
  contract test.
- **SC-003**: Search results include all matching records regardless of
  which searchable field contains the match — verified by tests with
  matches in different fields.
- **SC-004**: Data and count queries return consistent results — the total
  count always matches the number of records that would be returned without
  pagination limits.

## Assumptions

- The generic repository operates on top of Prisma, abstracting the ORM
  details from domain Services.
- Searchable fields are defined declaratively per entity (e.g., an array
  of field names in the repository configuration).
- The default page size is 25; the maximum allowed is 100. Both are
  configurable.
- Soft-deleted records (is_active=false) are excluded from list queries
  by default in the generic repository.
