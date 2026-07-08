# Feature Specification: CRM Core (Clients & Contacts)

**Feature Branch**: `009-crm-core`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Implement the core CRM module with Lead/Prospect management, Account/Client records, Contact directory, and interaction history — the generic adaptable core for multiple business niches."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lead Management (Priority: P1)

A sales team member captures a new lead (prospect) with basic information:
name, email, phone, source (from dynamic catalogs), and notes. Leads flow
through a basic status pipeline (New → Contacted → Qualified → Converted /
Lost). A qualified lead can be converted into a Client account, carrying
over the contact information automatically.

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
   information and the lead is marked as "Converted."

---

### User Story 2 - Account/Client Management (Priority: P2)

A team member manages client accounts. Each client has a name, email, phone,
category (from dynamic catalogs), address, and status (Active, Inactive).
Clients can be searched by name, email, or document number. A client's
full details, including associated contacts and recent interactions, are
available from the client detail view.

**Why this priority**: Client accounts are the central entity of CRM —
contacts, interactions, and sales all relate to a client.

**Independent Test**: Create a client with all fields, search for it by
name, view its detail page showing contacts and interactions.

**Acceptance Scenarios**:

1. **Given** a team member, **When** they create a client with name,
   category, and contact details, **Then** the client is stored and
   appears in the client list.
2. **Given** multiple clients, **When** the member searches by partial
   name, **Then** matching clients are returned in a paginated list.
3. **Given** an existing client, **When** the member views the client
   detail, **Then** all associated contacts and recent interactions are
   displayed.

---

### User Story 3 - Contacts & Interaction History (Priority: P3)

A team member manages contacts (people) associated with clients or leads.
Each contact has a name, email, phone, and role/title. The team member logs
interactions (call, email, meeting, note) linked to a client or contact with
a date, type, and description. Interaction history provides a chronological
timeline of all touchpoints.

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
  in reverse chronological order.

### Edge Cases

- A lead is converted to a client but later the client is deactivated —
  the original lead record is preserved.
- A contact belongs to multiple clients — the same person can be linked
  to more than one client account.
- Interaction logged with a future date — MUST be accepted (scheduled
  follow-up notes).
- Duplicate lead detection — the system SHOULD warn on leads with the same
  email but MUST allow creation (manual override).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow creating, updating, and listing leads with
  name, email, phone, source (catalog), status, and notes.
- **FR-002**: Leads MUST follow a status pipeline: New → Contacted →
  Qualified → Converted/Lost.
- **FR-003**: System MUST allow converting a qualified lead into a Client
  account, carrying over contact information automatically.
- **FR-004**: System MUST allow creating, updating, and listing clients
  with name, email, phone, category (catalog), address, document number,
  and status.
- **FR-005**: Clients MUST be searchable by name, email, and document
  number using the generic repository search pattern.
- **FR-006**: System MUST allow creating, updating, and listing contacts
  linked to a client or lead, with name, email, phone, and role.
- **FR-007**: System MUST allow logging interactions (call, email,
  meeting, note) linked to a client or contact with date, type, and
  description.
- **FR-008**: System MUST display interaction history in reverse
  chronological order for any client.
- **FR-009**: All CRM data MUST be tenant-scoped and follow the generic
  repository pagination/search/sort pattern.
- **FR-010**: CRM module MUST require appropriate RBAC permissions
  (crm:CREATE, crm:READ, crm:UPDATE, crm:DELETE).

### Key Entities

- **Lead**: Prospect entity. Attributes: name, email, phone, source
  (catalog reference), status (pipeline), notes, conversion date,
  linked Client (after conversion).
- **Client**: Account entity. Attributes: name, email, phone, category
  (catalog reference), document number, address, status
  (Active/Inactive).
- **Contact**: Person entity. Attributes: name, email, phone, role/title,
  linked Client or Lead.
- **Interaction**: Touchpoint record. Attributes: type (call/email/
  meeting/note), date, description, linked Client, linked Contact
  (optional).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A sales team member can capture a new lead in under 30
  seconds.
- **SC-002**: Lead-to-client conversion completes in under 5 seconds,
  with all contact information carried over accurately.
- **SC-003**: Client search returns results in under 2 seconds for a
  tenant with 10,000+ client records.
- **SC-004**: All CRM list endpoints follow the standardized DataTable
  request/response contract — verified by automated contract tests.

## Assumptions

- Document number is a free-text field (different countries use different
  ID formats). Validation is minimal (non-empty) in this iteration.
- Lead source values come from the "Lead Sources" dynamic catalog.
  Client category values come from the "Client Categories" dynamic catalog.
- A lead can only be converted once. After conversion, the lead status is
  permanently "Converted" and the linked Client reference is immutable.
- Interaction types are a fixed enum (call, email, meeting, note). Custom
  types can be added via catalogs in a future iteration.
