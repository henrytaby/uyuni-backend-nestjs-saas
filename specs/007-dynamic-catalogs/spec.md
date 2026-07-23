# Feature Specification: Dynamic Catalogs

**Feature Branch**: `007-dynamic-catalogs`

**Created**: 2026-07-07

**Status**: Ready

**Updated**: 2026-07-23 (Enterprise Architect Review — v2)

**Input**: User description: "Implement a catalog registry for tenant-parameterizable value lists and a bulk loader endpoint to populate multiple frontend selectors in a single request."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catalog Category & Item Management (Priority: P1)

A tenant admin creates a catalog category (e.g., "Client Categories",
"Task Statuses", "Lead Sources") and populates it with items. Each category
has a unique slug (machine-readable identifier, e.g., `client_categories`)
and a display name. Each item has a display name, a value/code (unique
within the category), and a sort order. Items can be added, reordered,
and deactivated (not deleted — soft-delete). All catalogs are scoped to
the tenant.

**Why this priority**: Catalogs are used by every domain module (CRM
categories, task statuses, payment methods). They MUST exist before domain
modules can reference them.

**Independent Test**: Create a "Client Categories" catalog with slug
`client_categories`, add items ("Corporate", "Individual", "Government"),
verify they appear in order, deactivate one, verify it no longer appears
in the active list.

**Acceptance Scenarios**:

1. **Given** a tenant admin, **When** they create a catalog category with a
   name, slug, and description, **Then** the category is stored and
   available for item addition.
2. **Given** a catalog category, **When** the admin adds items with name,
   value (unique within category), and sort order, **Then** the items are
   stored and returned in the specified order.
3. **Given** an existing catalog item, **When** the admin deactivates it,
   **Then** the item no longer appears in active item lists but remains
   in the database for historical reference.
4. **Given** a catalog category, **When** the admin attempts to create an
   item with a value/code that already exists in that category, **Then**
   the system returns a 409 Conflict error.
5. **Given** a catalog category, **When** the admin deactivates the
   category, **Then** all its items are also excluded from active queries
   (cascading deactivation at query level — items retain their own
   isActive state).

---

### User Story 2 - Bulk Loader for Frontend Selectors (Priority: P2)

The frontend needs to populate multiple dropdown selectors (client categories,
task statuses, lead sources) on a single page. Instead of making separate
requests for each catalog, the frontend sends a single bulk request listing
the catalog category slugs it needs. The backend returns all requested
catalogs and their active items in one response.

**Why this priority**: A typical form page may need 3-5 catalogs. N+1
requests for catalogs would degrade frontend performance. The bulk loader
solves this in one call.

**Independent Test**: Send a bulk request for 3 catalog category slugs.
Verify all 3 catalogs with their items are returned in a single response.

**Acceptance Scenarios**:

1. **Given** multiple catalog categories with items, **When** the frontend
   sends a bulk request listing the needed category slugs, **Then** all
   requested catalogs and their active items are returned in one response.
2. **Given** a bulk request that includes a non-existent catalog slug,
   **When** the request is processed, **Then** existing catalogs are
   returned and the missing slug is indicated as an empty array —
   the entire request does not fail.
3. **Given** a tenant with no custom catalogs, **When** the bulk request
   is sent, **Then** seeded default catalogs are returned.
4. **Given** a bulk request with an empty slugs list, **When** the request
   is processed, **Then** an empty response is returned, not an error.

---

### User Story 3 - Catalog Usage by Domain Modules (Priority: P3)

A domain module (e.g., CRM) references a catalog category for a field (e.g.,
client.categoryCode references the "Client Categories" catalog). When
creating or updating a record, the system validates that the selected value
exists in the active items of the referenced catalog. Records store the
catalog item's value/code (string), not a foreign key — enabling catalog
evolution without cascading FK updates.

**Why this priority**: Without validation against catalogs, users could enter
invalid category values, breaking data integrity.

**Independent Test**: Create a client with a category value that exists in
the catalog (succeeds). Attempt to create a client with a category value
not in the catalog (fails with validation error).

**Acceptance Scenarios**:

1. **Given** a catalog "Client Categories" with items, **When** a user
   creates a record referencing a valid catalog item value, **Then** the
   record is created with the catalog value stored as a string.
2. **Given** a catalog "Client Categories", **When** a user creates a
   record referencing a value not in the catalog's active items, **Then**
   the system returns a validation error indicating the invalid catalog
   value.
3. **Given** a catalog item that has been deactivated, **When** a user
   attempts to create a new record referencing that deactivated item,
   **Then** the system returns a validation error.
4. **Given** an existing record referencing a catalog item that was later
   deactivated, **When** the record is read, **Then** the stored value
   is preserved and returned — existing data is not affected by catalog
   changes.

### Edge Cases

- Two tenants have catalogs with the same category slug but different items
  — each tenant sees only their own catalogs (tenant isolation).
- A catalog item is deactivated while existing records reference it —
  existing records retain the value but new records cannot select it.
- Bulk request with an empty slugs list — MUST return an empty
  response, not an error.
- Special characters in catalog item names — MUST be stored and returned
  correctly without encoding issues.
- A category slug is renamed — MUST NOT be allowed after creation.
  Slugs are immutable identifiers used for programmatic lookup.
- A category is deactivated while records reference its items — existing
  records retain their values. The bulk loader returns nothing for that
  category. New record creation fails validation.
- Concurrent item creation with the same value/code in the same category —
  MUST be prevented by unique constraint; one succeeds, the other gets 409.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow tenant admins to create, update, and
  deactivate (soft-delete) catalog categories within their tenant.
- **FR-002**: System MUST allow tenant admins to create, update, reorder,
  and deactivate catalog items within a category.
- **FR-003**: Catalog items MUST have a display name, a value/code (unique
  within the category), and a sort order for frontend rendering.
- **FR-004**: System MUST provide a bulk loader endpoint that accepts a
  list of catalog category slugs and returns all requested catalogs with
  their active items in a single response.
- **FR-005**: All catalog data MUST be scoped to the tenant — one tenant's
  catalogs are invisible to another.
- **FR-006**: Deactivated catalog items MUST NOT appear in active item
  lists but MUST be preserved in the database for historical data
  integrity.
- **FR-007**: System MUST provide a catalog validation service that domain
  modules call to verify that a value exists in a catalog's active items.
  This service accepts a category slug and a value, returning valid/invalid.
- **FR-008**: Bulk loader MUST handle partial success — if some requested
  slugs do not exist, the existing ones are still returned.
- **FR-009**: Catalog categories MUST have a unique slug (machine-readable
  identifier, e.g., `client_categories`) per tenant. Slugs are immutable
  after creation and used for programmatic lookups.
- **FR-010**: Catalog item values/codes MUST be unique within their
  parent category (enforced by unique constraint).
- **FR-011**: Catalog CRUD endpoints MUST require the `catalogs:CREATE`,
  `catalogs:READ`, `catalogs:UPDATE`, `catalogs:DELETE` RBAC permissions.
  The bulk loader endpoint requires only `catalogs:READ`.
- **FR-012**: Catalog list endpoints MUST use the generic DataTable
  pattern from 006 (DataTableRequestDto/DataTableResponseDto with
  pagination, search, and filters).
- **FR-013**: System MUST expose a `CatalogSeedService` that accepts a
  list of category definitions (slug, name, items[]) and creates them
  atomically for a given tenant. This service is consumed by
  008-saas-administration (Provisioning) to seed default catalogs during
  tenant creation. The specific catalog list is defined in 008, not here.
  Tenants can customize the seeded catalogs after creation.
- **FR-014**: When a catalog category is deactivated, the bulk loader
  MUST NOT return it. All items within a deactivated category are
  excluded from active queries regardless of their individual isActive
  state (cascading at query level, not data mutation).

### Non-Functional Requirements

- **NFR-001**: The bulk loader MUST return results for up to 10 catalogs
  in < 200ms.
- **NFR-002**: Catalog queries SHOULD be cacheable at the application
  level with a configurable TTL (default: 5 minutes). Cache invalidation
  MUST occur on any catalog mutation (create, update, deactivate).
- **NFR-003**: The catalog validation service MUST resolve in < 10ms for
  single-value lookups (with cache warm).

### Key Entities

- **CatalogCategory**: Named group of values. Attributes: name (display),
  slug (unique per tenant, immutable), description, is_active flag,
  sort order, tenant_id, standard audit columns.
- **CatalogItem**: Individual value within a category. Attributes: display
  name, value/code (unique within category), linked category (FK),
  sort order, is_active flag, tenant_id, standard audit columns.

### Bulk Loader Request/Response Shape

**Request**: `POST /catalogs/bulk`
```
{ "slugs": ["client_categories", "lead_sources", "payment_methods"] }
```

**Response** (200 OK):
```
{
  "data": {
    "client_categories": [
      { "id": "uuid", "name": "Corporate", "value": "corporate", "sortOrder": 1 },
      { "id": "uuid", "name": "Individual", "value": "individual", "sortOrder": 2 }
    ],
    "lead_sources": [
      { "id": "uuid", "name": "Website", "value": "website", "sortOrder": 1 }
    ],
    "payment_methods": []
  },
  "missing": []
}
```

If a slug doesn't exist:
```
{
  "data": {
    "client_categories": [...]
  },
  "missing": ["nonexistent_slug"]
}
```

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tenant admin can create a catalog category with 10 items in
  under 1 minute.
- **SC-002**: The bulk loader returns all requested catalogs in a single
  response under 200 milliseconds for up to 10 catalogs.
- **SC-003**: 100% of catalog-referencing fields validate against the
  active items of the referenced catalog — no orphaned values accepted.
- **SC-004**: Frontend can populate all dropdowns on a complex form with a
  single bulk loader request instead of N separate requests.
- **SC-005**: Default catalogs are automatically available for new tenants
  without manual configuration.

## Assumptions

- Default/seeded catalogs are provided during tenant provisioning by
  008-saas-administration, which calls the `CatalogSeedService` exposed
  by this module. The specific catalog list (client_categories,
  lead_sources, payment_methods, etc.) is defined and maintained in 008.
  This module provides the engine; 008 provides the data.
- Catalog item values are strings; no typed values (numeric, date) are
  needed initially.
- Sort order is a simple integer; ties are broken alphabetically by name.
- The bulk loader is authenticated but requires only `catalogs:READ`
  RBAC permission — no special elevated access needed.
- Domain modules store the catalog item's value/code (string) in their
  records, NOT a foreign key to CatalogItem. This enables catalog
  evolution (adding/removing items) without cascading FK updates.
- Catalog slugs follow lowercase_snake_case convention and are immutable
  after creation. They are the programmatic identifier used by the
  frontend and by domain module validation.
- Catalogs are expected to be small (< 100 items per category, < 50
  categories per tenant). No pagination is needed for the bulk loader
  response (items within a category are returned in full).

## Dependencies

- **002-multi-tenancy-core**: Provides tenant isolation via
  `TenantContextService` for scoping all catalog data.
- **004-rbac**: Provides `catalogs:CREATE/READ/UPDATE/DELETE` permissions
  for controlling access to catalog management endpoints. The `catalogs`
  module is registered in the RBAC module registry.
- **005-audit-infrastructure**: Provides soft-delete enforcement
  (isActive flag), audit column injection (createdById, updatedById),
  and CDC for catalog mutations.
- **006-generic-repository-datatables**: Provides the generic DataTable
  pattern for catalog list endpoints (pagination, search, sorting).
