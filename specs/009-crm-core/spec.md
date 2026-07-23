# Feature Specification: CRM Core (Clients & Contacts)

**Feature Branch**: `009-crm-core`

**Created**: 2026-07-07

**Status**: Ready

**Updated**: 2026-07-23 (Enterprise Architect Review — v2)

**Input**: User description: "Implement the core CRM module with Lead/Prospect management, Account/Client records, Contact directory, and interaction history — the generic adaptable core for multiple business niches."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lead Management (Priority: P1)

A sales team member captures a new lead (prospect) with basic information:
name, email, phone, source (from dynamic catalog `lead_sources`), and notes.
Leads flow through a status pipeline (New → Contacted → Qualified →
Converted / Lost). Status transitions are validated — only valid forward
transitions are allowed (e.g., cannot go from Lost back to Qualified).
A qualified lead can be converted into a Client account, carrying over the
contact information automatically. Duplicate leads (same email) trigger a
warning but are allowed (manual override).

**Why this priority**: Lead capture and qualification is the entry point of
the sales funnel. Without it, the CRM has no pipeline to manage.

**Independent Test**: Create a lead, update its status through the pipeline,
convert it to a client, and verify the client inherits the lead's data.

**Acceptance Scenarios**:

1. **Given** a sales team member, **When** they create a lead with name,
   email, phone, source, and notes, **Then** the lead is stored with
   status "New" and is visible in the lead list.
2. **Given** an existing lead with status "New", **When** the member
   updates the status to "Contacted" then "Qualified", **Then** the lead
   reflects the updated status in the pipeline.
3. **Given** a qualified lead, **When** the member converts it to a
   client, **Then** a Client account is created with the lead's contact
   information, a primary Contact is auto-created, and the lead is marked
   as "Converted" with a reference to the new Client.
4. **Given** a lead with status "Lost", **When** the member attempts to
   change the status to "Qualified", **Then** the system rejects the
   transition with a validation error listing valid transitions.
5. **Given** a new lead with the same email as an existing lead, **When**
   the member creates it, **Then** the system returns a warning in the
   response indicating a potential duplicate but creates the lead.

---

### User Story 2 - Account/Client Management (Priority: P1)

A team member manages client accounts. Each client has a name, email, phone,
category (from dynamic catalog `client_categories`), document number,
address fields (street, city, state, country, zip), and status
(Active/Inactive). Clients can be searched, filtered, and sorted using
the generic DataTable pattern. A client's full details, including
associated contacts and recent interactions, are available from the client
detail endpoint.

**Why this priority**: Client accounts are the central entity of CRM —
contacts, interactions, and sales all relate to a client.

**Independent Test**: Create a client with all fields, search for it by
name, filter by category, view its detail page showing contacts and
interactions.

**Acceptance Scenarios**:

1. **Given** a team member, **When** they create a client with name,
   category, document number, and contact details, **Then** the client is
   stored and appears in the client list.
2. **Given** multiple clients, **When** the member searches by partial
   name or filters by category, **Then** matching clients are returned
   using the DataTable pattern with pagination metadata.
3. **Given** an existing client, **When** the member views the client
   detail, **Then** all associated contacts and the last 10 interactions
   are returned.
4. **Given** a client, **When** the member deactivates it, **Then** the
   client is soft-deleted (isActive=false) and no longer appears in
   default list queries.

---

### User Story 3 - Contacts & Interaction History (Priority: P2)

A team member manages contacts (people) associated with clients or leads.
Each contact has a name, email, phone, role/title, and isPrimary flag.
When a client is created (or a lead is converted), a primary contact is
auto-created from the main contact details. Additional contacts can be
added manually. The team member logs interactions (call, email, meeting,
note) linked to a client or contact with a date, type, and description.
Interaction history provides a chronological timeline of all touchpoints.

**Why this priority**: Contacts and interactions are the relationship layer
of CRM. They provide context for every client communication.

**Independent Test**: Add a contact to a client, log an interaction (call),
verify it appears in the client's interaction timeline.

**Acceptance Scenarios**:

1. **Given** an existing client, **When** the member adds a contact with
   name, email, phone, and role, **Then** the contact is linked to the
   client and appears in the client's contact list.
2. **Given** an existing client, **When** the member logs an interaction
   of type "call" with a description and date, **Then** the interaction
   appears in the client's chronological timeline.
3. **Given** a client with multiple interactions, **When** the member
   views the interaction timeline, **Then** interactions are displayed
   in reverse chronological order with pagination.
4. **Given** a contact linked to Client A, **When** the member also links
   that contact to Client B, **Then** the contact appears in both clients'
   contact lists (many-to-many).

### Edge Cases

- A lead is converted to a client but later the client is deactivated —
  the original lead record is preserved with status "Converted" and the
  Client reference intact.
- A contact belongs to multiple clients — the same person can be linked
  to more than one client account (many-to-many via join table).
- Interaction logged with a future date — MUST be accepted (scheduled
  follow-up notes).
- Duplicate lead detection — the system SHOULD warn on leads with the same
  email but MUST allow creation (manual override, warning in response).
- Lead conversion when lead has no email — MUST still create the Client
  with available data; email can be added later.
- Client with document number that already exists in the same tenant —
  MUST return 409 Conflict (document numbers are unique per tenant).
- Deleting a client with interactions — soft-delete only; interactions
  are preserved for audit trail.
- Lead source or client category catalog item deactivated — existing
  records retain the stored value; new records cannot use the deactivated
  value (validated by catalog validation service from 007).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow creating, updating, and listing leads with
  name, email, phone, source (catalog `lead_sources`), status, and notes.
- **FR-002**: Leads MUST follow a validated status pipeline: New → Contacted
  → Qualified → Converted/Lost. Only valid forward transitions are allowed.
  Converted and Lost are terminal states.
- **FR-003**: System MUST allow converting a qualified lead into a Client
  account, carrying over contact information automatically. A primary
  Contact is auto-created from the lead's details. The lead's status
  becomes "Converted" and stores a reference to the new Client.
- **FR-004**: System MUST allow creating, updating, and listing clients
  with name, email, phone, category (catalog `client_categories`),
  document number (unique per tenant), address fields, and status.
- **FR-005**: Clients MUST be searchable by name, email, and document
  number using the generic DataTable pattern from 006. Filterable by
  category, status, and createdAt range.
- **FR-006**: System MUST allow creating, updating, and listing contacts
  linked to clients or leads, with name, email, phone, role/title, and
  isPrimary flag. Contacts can be linked to multiple clients
  (many-to-many).
- **FR-007**: System MUST allow logging interactions (call, email,
  meeting, note) linked to a client and optionally to a contact, with
  date, type (enum), and description.
- **FR-008**: System MUST display interaction history in reverse
  chronological order for any client, with pagination via the DataTable
  pattern.
- **FR-009**: All CRM data MUST be tenant-scoped and follow the generic
  DataTable pattern from 006 (DataTableRequestDto/DataTableResponseDto
  with pagination, search, sorting, and column filters).
- **FR-010**: CRM module MUST require appropriate RBAC permissions
  (crm:CREATE, crm:READ, crm:UPDATE, crm:DELETE) on all endpoints.
  Ownership scoping (ANY/OWN) applies per the user's permission scope.
- **FR-011**: System MUST validate lead source and client category values
  against their respective dynamic catalogs' active items before accepting
  creation or update operations (using catalog validation service from 007).
- **FR-012**: Client detail endpoint MUST return the client record with
  its contacts (all) and recent interactions (last 10, configurable) in
  a single response to avoid N+1 frontend requests.
- **FR-013**: System MUST support duplicate lead detection — warn on
  leads with the same email in the same tenant. The warning is returned
  in the response but does not block creation.
- **FR-014**: Lead conversion MUST be atomic — if Client or Contact
  creation fails, the lead status remains unchanged.
- **FR-015**: Document number MUST be unique per tenant. Attempts to
  create a client with a duplicate document number return 409 Conflict.

### Non-Functional Requirements

- **NFR-001**: Client list queries with up to 10,000 records MUST return
  in < 500ms using the generic DataTable pattern with appropriate indexes.
- **NFR-002**: Lead-to-client conversion MUST complete in < 2 seconds
  including Contact auto-creation.
- **NFR-003**: Client detail endpoint (with contacts + last 10
  interactions) MUST return in < 300ms.

### Key Entities

- **Lead**: Prospect entity. Attributes: name, email, phone, source
  (catalog `lead_sources` value/code), status (enum: NEW, CONTACTED,
  QUALIFIED, CONVERTED, LOST), notes, conversionDate, clientId (FK,
  nullable — populated on conversion), tenantId, standard audit columns.
- **Client**: Account entity. Attributes: name, email, phone, category
  (catalog `client_categories` value/code), documentNumber (unique per
  tenant), address (street, city, state, country, zipCode), status
  (enum: ACTIVE, INACTIVE), tenantId, standard audit columns.
- **Contact**: Person entity. Attributes: name, email, phone, role/title,
  isPrimary (boolean), tenantId, standard audit columns. Linked to
  clients via a many-to-many join table (ClientContact).
- **Interaction**: Touchpoint record. Attributes: type (enum: CALL,
  EMAIL, MEETING, NOTE), date, description, clientId (FK), contactId
  (FK, optional), tenantId, standard audit columns.
- **ClientContact**: Join table. Attributes: clientId (FK), contactId
  (FK), tenantId.

### Lead Status Pipeline

```
NEW ──→ CONTACTED ──→ QUALIFIED ──→ CONVERTED
                         │
                         └──→ LOST
```

- **NEW**: Initial state on creation
- **CONTACTED**: First outreach completed
- **QUALIFIED**: Prospect shows genuine interest/fit
- **CONVERTED**: Successfully converted to Client (terminal, triggers conversion)
- **LOST**: Prospect lost/disqualified (terminal)

Valid transitions: NEW→CONTACTED, CONTACTED→QUALIFIED, QUALIFIED→CONVERTED,
QUALIFIED→LOST, NEW→LOST, CONTACTED→LOST.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A sales team member can capture a new lead in under 30
  seconds.
- **SC-002**: Lead-to-client conversion completes in under 2 seconds,
  with all contact information carried over accurately and a primary
  Contact auto-created.
- **SC-003**: Client search returns results in under 500ms for a
  tenant with 10,000+ client records.
- **SC-004**: All CRM list endpoints follow the standardized DataTable
  request/response contract — verified by automated contract tests.
- **SC-005**: No CRM endpoint allows cross-tenant data access — verified
  by automated isolation tests.
- **SC-006**: Catalog validation prevents invalid source/category values
  — verified by automated test.

## Assumptions

- Document number is a free-text field (different countries use different
  ID formats). Validation is minimal (non-empty, unique per tenant).
- Lead source values come from the `lead_sources` dynamic catalog.
  Client category values come from the `client_categories` dynamic catalog.
  Both are validated via the catalog validation service from 007.
- A lead can only be converted once. After conversion, the lead status is
  permanently "CONVERTED" and the linked clientId reference is immutable.
- Interaction types are a fixed enum (CALL, EMAIL, MEETING, NOTE) for the
  initial implementation. Custom types via catalogs are a future iteration.
- Address is stored as individual fields (street, city, state, country,
  zipCode) — not a single freeform field. This enables structured
  filtering and reporting.
- Contact-to-Client relationship is many-to-many via a ClientContact
  join table. A contact can represent the same person across multiple
  client organizations.
- The isPrimary flag on Contact indicates the main contact for a client.
  Each client SHOULD have exactly one primary contact, but this is not
  enforced at the database level (business rule warning only).

## Dependencies

- **002-multi-tenancy-core**: Provides tenant isolation via
  `TenantContextService` for scoping all CRM data.
- **004-rbac**: Provides `crm:CREATE/READ/UPDATE/DELETE` permissions and
  ownership scoping (ANY/OWN) via OwnershipScopeInterceptor.
- **005-audit-infrastructure**: Provides soft-delete enforcement, audit
  column injection, and CDC for all CRM entity mutations.
- **006-generic-repository-datatables**: Provides the DataTable pattern
  for all CRM list endpoints (pagination, search, sorting, filters).
- **007-dynamic-catalogs**: Provides `lead_sources` and `client_categories`
  catalogs with validation service for source/category fields.
