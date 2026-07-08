# Feature Specification: Dynamic Catalogs

**Feature Branch**: `007-dynamic-catalogs`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Implement a catalog registry for tenant-parameterizable value lists and a bulk loader endpoint to populate multiple frontend selectors in a single request."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catalog Category & Item Management (Priority: P1)

A tenant admin creates a catalog category (e.g., "Client Categories",
"Task Statuses", "Lead Sources") and populates it with items. Each item
has a display name, a value/code, and a sort order. Items can be added,
reordered, and deactivated (not deleted — soft-delete). All catalogs are
scoped to the tenant.

**Why this priority**: Catalogs are used by every domain module (CRM
categories, task statuses, payment methods). They MUST exist before domain
modules can reference them.

**Independent Test**: Create a "Client Categories" catalog, add items
("Corporate", "Individual", "Government"), verify they appear in order,
deactivate one, verify it no longer appears in the active list.

**Acceptance Scenarios**:

1. **Given** a tenant admin, **When** they create a catalog category with a
   name and description, **Then** the category is stored and available for
   item addition.
2. **Given** a catalog category, **When** the admin adds items with name,
   value, and sort order, **Then** the items are stored and returned in
   the specified order.
3. **Given** an existing catalog item, **When** the admin deactivates it,
   **Then** the item no longer appears in active item lists but remains
   in the database for historical reference.

---

### User Story 2 - Bulk Loader for Frontend Selectors (Priority: P2)

The frontend needs to populate multiple dropdown selectors (client categories,
task statuses, lead sources) on a single page. Instead of making separate
requests for each catalog, the frontend sends a single bulk request listing
the catalog categories it needs. The backend returns all requested catalogs
and their active items in one response.

**Why this priority**: A typical form page may need 3-5 catalogs. N+1
requests for catalogs would degrade frontend performance. The bulk loader
solves this in one call.

**Independent Test**: Send a bulk request for 3 catalog categories. Verify
all 3 catalogs with their items are returned in a single response.

**Acceptance Scenarios**:

1. **Given** multiple catalog categories with items, **When** the frontend
   sends a bulk request listing the needed category names, **Then** all
   requested catalogs and their active items are returned in one response.
2. **Given** a bulk request that includes a non-existent catalog category,
   **When** the request is processed, **Then** existing catalogs are
   returned and the missing category is indicated (empty or error flag)
  without failing the entire request.
3. **Given** a tenant with no custom catalogs, **When** the bulk request
   is sent, **Then** seeded default catalogs (if any) are returned.

---

### User Story 3 - Catalog Usage by Domain Modules (Priority: P3)

A domain module (e.g., CRM) references a catalog category for a field (e.g.,
client.category references the "Client Categories" catalog). When creating or
updating a record, the system validates that the selected value exists in the
active items of the referenced catalog.

**Why this priority**: Without validation against catalogs, users could enter
invalid category values, breaking data integrity.

**Independent Test**: Create a client with a category value that exists in
the catalog (succeeds). Attempt to create a client with a category value
not in the catalog (fails with validation error).

**Acceptance Scenarios**:

1. **Given** a catalog "Client Categories" with items, **When** a user
   creates a record referencing a valid catalog item, **Then** the record
   is created with the catalog reference.
2. **Given** a catalog "Client Categories", **When** a user creates a
   record referencing a value not in the catalog's active items, **Then**
   the system returns a validation error indicating the invalid catalog
   value.
3. **Given** a catalog item that has been deactivated, **When** a user
   attempts to create a new record referencing that deactivated item,
   **Then** the system returns a validation error.

### Edge Cases

- Two tenants have catalogs with the same category name but different items
  — each tenant sees only their own catalogs (tenant isolation).
- A catalog item is deactivated while existing records reference it —
  existing records retain the value but new records cannot select it.
- Bulk request with an empty categories list — MUST return an empty
  response, not an error.
- Special characters in catalog item names — MUST be stored and returned
  correctly without encoding issues.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow tenant admins to create, update, and
  deactivate (soft-delete) catalog categories within their tenant.
- **FR-002**: System MUST allow tenant admins to create, update, reorder,
  and deactivate catalog items within a category.
- **FR-003**: Catalog items MUST have a display name, a value/code, and a
  sort order for frontend rendering.
- **FR-004**: System MUST provide a bulk loader endpoint that accepts a
  list of catalog category names and returns all requested catalogs with
  their active items in a single response.
- **FR-005**: All catalog data MUST be scoped to the tenant — one tenant's
  catalogs are invisible to another.
- **FR-006**: Deactivated catalog items MUST NOT appear in active item
  lists but MUST be preserved in the database for historical data
  integrity.
- **FR-007**: System MUST validate that values referencing a catalog
  exist in that catalog's active items before accepting a record creation
  or update.
- **FR-008**: Bulk loader MUST handle partial success — if some requested
  categories do not exist, the existing ones are still returned.

### Key Entities

- **CatalogCategory**: Named group of values. Attributes: name (unique per
  tenant), description, is_active flag, sort order.
- **CatalogItem**: Individual value within a category. Attributes: display
  name, value/code, linked category, sort order, is_active flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tenant admin can create a catalog category with 10 items in
  under 1 minute.
- **SC-002**: The bulk loader returns all requested catalogs in a single
  response under 500 milliseconds for up to 10 catalogs.
- **SC-003**: 100% of catalog-referencing fields validate against the
  active items of the referenced catalog — no orphaned values accepted.
- **SC-004**: Frontend can populate all dropdowns on a complex form with a
  single bulk loader request instead of N separate requests.

## Assumptions

- Default/seeded catalogs are provided for common categories (client
  categories, lead sources, payment methods, task statuses). Tenants can
  customize these.
- Catalog item values are strings; no typed values (numeric, date) are
  needed initially.
- Sort order is a simple integer; ties are broken alphabetically by name.
- The bulk loader is a public endpoint within the authenticated tenant
  context — no special permission beyond module READ access is required.
