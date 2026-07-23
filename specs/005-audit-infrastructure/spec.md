# Feature Specification: Audit Infrastructure

**Feature Branch**: `005-audit-infrastructure`

**Created**: 2026-07-07

**Status**: Ready

**Updated**: 2026-07-22 (Enterprise Standards Alignment)

**Input**: User description: "Implement immutable audit trail with access log interception, Change Data Capture (CDC), soft-delete enforcement, and automatic audit column injection via Prisma extension."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Access Log Capture (Priority: P1)

Every API request is automatically captured by an interceptor that records
the HTTP method, route, response status, client IP, user_id, tenant_id, and
timestamp. These access logs are queryable by auditors and tenant admins for
their own tenant only.

**Why this priority**: Access logging is the first line of security
auditing. Without it, there is no record of who accessed what and when.

**Independent Test**: Make several authenticated requests. As an auditor,
query the access logs for your tenant and verify all requests are recorded
with correct details.

**Acceptance Scenarios**:

1. **Given** an authenticated API request, **When** it completes, **Then**
   an access log entry is created with method, route, status, IP, user_id,
   tenant_id, and timestamp.
2. **Given** a tenant auditor querying access logs, **When** they request
   logs for their tenant, **Then** only their tenant's logs are returned.
3. **Given** an unauthenticated request to a public endpoint, **When** it
   completes, **Then** an access log entry is still created with user_id
   marked as anonymous/empty.

---

### User Story 2 - Change Data Capture (CDC) (Priority: P2)

Every data modification (create, update, delete) is captured as an immutable
record showing the previous value, the new value, who made the change, and
when. CDC records cannot be updated or deleted — they are append-only.
Auditors can query the full change history for any entity.

**Why this priority**: CDC provides the complete, tamper-proof history
required for regulatory compliance and operational debugging. Without it,
modifications are invisible.

**Independent Test**: Create, update, and delete a record. Query the CDC
log and verify three entries exist showing the full progression with
old/new values.

**Acceptance Scenarios**:

1. **Given** a data creation operation, **When** it completes, **Then** a
   CDC record is created with the new value, the actor, and the timestamp.
2. **Given** a data update operation, **When** it completes, **Then** a CDC
   record is created showing both old and new values, the actor, and the
   timestamp.
3. **Given** existing CDC records, **When** any attempt is made to modify
   or delete them, **Then** the operation is rejected — CDC is append-only.

---

### User Story 3 - Soft-Delete & Automatic Audit Columns (Priority: P3)

When a user deletes a record, it is not physically removed — instead the
is_active flag is set to false. Additionally, the created_by_id,
updated_by_id, and deleted_by_id columns are automatically populated from
the request context without any manual code in Controllers or Services.
Prisma natively manages created_at and updated_at timestamps.

**Why this priority**: Soft-delete prevents data loss and supports CDC.
Automatic audit column injection eliminates the #1 source of audit gaps:
developer forgetfulness. The architecture seals this by design.

**Independent Test**: Delete a record, verify it still exists with
is_active=false. Create a record, verify created_by_id is set to the
authenticated user without any explicit parameter. Update the record,
verify updated_by_id is set automatically.

**Acceptance Scenarios**:

1. **Given** a domain entity, **When** a delete operation is performed,
   **Then** the record's is_active is set to false and the record is not
   physically removed from the database.
2. **Given** an authenticated user creating a record, **When** the
   creation completes, **Then** created_by_id is automatically set to the
   user's ID without the developer passing it in the code.
3. **Given** an authenticated user updating a record, **When** the update
   completes, **Then** updated_by_id is automatically set to the user's ID
   without the developer passing it in the code.

### Edge Cases

- Bulk operations (e.g., bulk delete of 50 records) — each record MUST get
  its own CDC entry and audit column update; partial failures MUST be
  handled transactionally.
- A record with is_active=false is queried by default — list endpoints
  MUST exclude soft-deleted records unless explicitly requested by an
  auditor.
- Concurrent updates to the same record — CDC MUST capture both changes
  with accurate timestamps; last-write-wins at the record level but both
  CDC entries exist.
- Platform superadmin performing a cross-tenant action — the audit columns
  MUST reflect the superadmin's user_id, not the tenant's.

---

### User Story 4 - Audit Trail Querying & Correlation (Priority: P2)

An auditor or tenant admin can query the audit trail to investigate incidents. They can search access logs by date range, user, and route. They can view the full change history of any entity. Every CDC entry includes a `requestId` that correlates it to the access log entry that triggered the change, enabling full request-to-mutation traceability.

**Why this priority**: Without a query interface, audit data exists but is inaccessible to the people who need it. Request-to-mutation correlation is required for forensic investigations and SOC2 evidence.

**Independent Test**: Make 3 requests that modify data. As an auditor, query access logs filtered by date range. Pick one access log entry, use its `requestId` to find the corresponding CDC entries.

**Acceptance Scenarios**:

1. **Given** an auditor, **When** they query access logs with filters (date range, userId, route), **Then** only matching entries for their tenant are returned with pagination.
2. **Given** an auditor, **When** they query CDC records for a specific entity by ID, **Then** the full change history is returned in chronological order.
3. **Given** a CDC entry, **When** the auditor reads its `requestId`, **Then** it matches exactly one access log entry, enabling full traceability.
4. **Given** a non-auditor user, **When** they attempt to query audit endpoints, **Then** access is denied (requires `audit:read` permission).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST capture an access log entry for every API request
  containing method, route, status, IP, user_id, tenant_id, and timestamp.
- **FR-002**: System MUST make access logs queryable by auditors, scoped to
  their own tenant only.
- **FR-003**: System MUST capture CDC entries for every data modification
  (create, update, delete) with old_value, new_value, actor, entity type,
  entity ID, and timestamp.
- **FR-004**: CDC records MUST be append-only — no updates or deletes are
  permitted on CDC records.
- **FR-005**: System MUST enforce soft-delete on all domain entities using
  the is_active flag; physical deletion is prohibited.
- **FR-006**: System MUST automatically inject created_by_id on creation and
  updated_by_id on update via a Prisma extension reading from the request
  context — no manual passing by developers.
- **FR-007**: System MUST automatically inject deleted_by_id when a soft-
  delete operation is performed.
- **FR-008**: Prisma MUST natively manage created_at and updated_at
  timestamps.
- **FR-009**: List endpoints MUST exclude soft-deleted records by default;
  auditors MAY request inclusion via a query parameter.
- **FR-010**: CDC entries MUST be queryable by entity type, entity ID,
  date range, and actor.
- **FR-011**: CDC records MUST include a `requestId` field that correlates
  each mutation to the access log entry that triggered it.
- **FR-012**: Audit tables (AccessLog, ChangeRecord) MUST be protected at
  both the application layer (Prisma middleware rejects UPDATE/DELETE) and
  the database layer (PostgreSQL `REVOKE UPDATE, DELETE` on the tables).
- **FR-013**: Access log and CDC query endpoints MUST require the
  `audit:read` RBAC permission and MUST be scoped to the requesting
  user's tenant.

### Key Entities

- **AccessLog**: Request record. Attributes: method, route, status code,
  client IP, user_id, tenant_id, request_id, duration_ms, timestamp.
- **ChangeRecord**: CDC entry. Attributes: entity type, entity ID,
  action (create/update/delete), old_value (JSON), new_value (JSON),
  actor user_id, tenant_id, request_id, timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of API requests generate an access log entry — verified by
  automated tests covering authenticated, unauthenticated, success, and
  error scenarios.
- **SC-002**: 100% of data modifications generate a CDC entry — verified by
  automated tests for create, update, and delete operations across all
  domain entities.
- **SC-003**: Developers adding a new entity do not need to write any code
  to populate audit columns — the Prisma extension handles it
  automatically.
- **SC-004**: No CDC record has ever been modified or deleted — verified by
  a constraint check in the test suite.

## Assumptions

- Access logs are stored in the same PostgreSQL database as business data.
  For very high-traffic scenarios, a separate log store may be needed in
  the future.
- CDC old_value and new_value are stored as JSON. The schema does not
  enforce their internal structure — they capture the full entity state.
- Soft-deleted records are permanently excluded from list queries unless
  an explicit "include_deleted=true" parameter is passed by an auditor.
  This parameter requires the AUDIT module READ permission.
- Access log retention is assumed to be indefinite. A future feature may
  add retention policies.
- Expected volume: ~100-500 access log entries per minute at moderate load;
  CDC entries are proportional to write operations (~10-50 per minute).
  No partitioning required initially, but indexes on `tenantId` + `timestamp`
  are mandatory for query performance.

## Dependencies

- **003-authentication**: Provides `userId` from JWT claims for audit column
  injection and access log attribution.
- **002-multi-tenancy-core**: Provides `tenantId` from `TenantContextService`
  (AsyncLocalStorage) for scoping all audit records.
- **004-rbac**: Provides `audit:read` permission for controlling access to
  audit query endpoints.
- **001-foundation-bootstrap**: Provides `requestId` from the global
  correlation ID middleware for traceability.
