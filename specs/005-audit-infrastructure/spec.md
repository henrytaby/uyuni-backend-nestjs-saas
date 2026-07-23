# Feature Specification: Audit Infrastructure

**Feature Branch**: `005-audit-infrastructure`

**Created**: 2026-07-07

**Status**: Ready

**Updated**: 2026-07-23 (Enterprise Architect Review — v3)

**Input**: User description: "Implement immutable audit trail with access log interception, Change Data Capture (CDC), soft-delete enforcement, and automatic audit column injection via Prisma extension."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Access Log Capture (Priority: P1)

Every API request is automatically captured by an interceptor that records
the HTTP method, route, response status, client IP, user-agent, user_id,
tenant_id, request_id, duration in milliseconds, and timestamp. These access
logs are queryable by auditors and tenant admins for their own tenant only.

**Why this priority**: Access logging is the first line of security
auditing. Without it, there is no record of who accessed what and when.

**Independent Test**: Make several authenticated requests. As an auditor,
query the access logs for your tenant and verify all requests are recorded
with correct details including duration_ms and request_id.

**Acceptance Scenarios**:

1. **Given** an authenticated API request, **When** it completes, **Then**
   an access log entry is created with method, route, status, IP,
   user_agent, user_id, tenant_id, request_id, duration_ms, and timestamp.
2. **Given** a tenant auditor querying access logs, **When** they request
   logs for their tenant, **Then** only their tenant's logs are returned.
3. **Given** an unauthenticated request to a public endpoint, **When** it
   completes, **Then** an access log entry is still created with user_id
   marked as anonymous/empty.
4. **Given** an access log write failure (e.g., database timeout), **When**
   it occurs, **Then** the business operation still completes successfully
   and the failure is logged as a CRITICAL error via pino for operational
   alerting.

---

### User Story 2 - Change Data Capture (CDC) (Priority: P2)

Every data modification (create, update, delete) is captured as an immutable
record showing the previous value (full entity snapshot), the new value (full
entity snapshot), who made the change, and when. Sensitive fields (password
hashes, tokens) are automatically redacted from CDC snapshots. CDC records
cannot be updated or deleted — they are append-only. Auditors can query the
full change history for any entity.

**Why this priority**: CDC provides the complete, tamper-proof history
required for regulatory compliance and operational debugging. Without it,
modifications are invisible.

**Independent Test**: Create, update, and delete a record. Query the CDC
log and verify three entries exist showing the full progression with
old/new values. Verify that sensitive fields appear as "[REDACTED]".

**Acceptance Scenarios**:

1. **Given** a data creation operation, **When** it completes, **Then** a
   CDC record is created with the full new_value snapshot, the actor,
   request_id, and the timestamp. old_value is null.
2. **Given** a data update operation, **When** it completes, **Then** a CDC
   record is created showing both old and new full entity snapshots, the
   actor, request_id, and the timestamp.
3. **Given** existing CDC records, **When** any attempt is made to modify
   or delete them, **Then** the operation is rejected — CDC is append-only.
4. **Given** an entity with sensitive fields (e.g., User.passwordHash,
   RefreshToken.token), **When** a CDC record is created, **Then** those
   fields are replaced with "[REDACTED]" in both old_value and new_value.
5. **Given** a CDC write failure, **When** it occurs, **Then** the business
   operation still completes successfully and the failure is logged as a
   CRITICAL error via pino.

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
is_active=false and deleted_by_id set. Create a record, verify
created_by_id is set to the authenticated user without any explicit
parameter. Update the record, verify updated_by_id is set automatically.

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
4. **Given** an authenticated user performing a soft-delete, **When** the
   delete completes, **Then** deleted_by_id is automatically set to the
   user's ID and is_active is set to false.

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
- Activation of soft-delete is a BREAKING CHANGE in delete behavior. All
  existing delete operations will be converted to updates (is_active=false).
  The migration plan MUST include a verification step ensuring no business
  logic depends on physical deletion.
- If an AccessLog or CDC write fails (disk full, database timeout), the
  business operation MUST still complete successfully. The failure MUST be
  logged as a CRITICAL error via pino for operational alerting. Audit writes
  are best-effort and MUST NOT block business transactions.

---

### User Story 4 - Audit Trail Querying & Correlation (Priority: P2)

An auditor or tenant admin can query the audit trail to investigate
incidents. They can search access logs by date range, user, and route.
They can view the full change history of any entity. Every CDC entry
includes a `requestId` that correlates it to the access log entry that
triggered the change, enabling full request-to-mutation traceability.
Query endpoints use cursor-based pagination.

**Why this priority**: Without a query interface, audit data exists but is
inaccessible to the people who need it. Request-to-mutation correlation is
required for forensic investigations and SOC2 evidence.

**Independent Test**: Make 3 requests that modify data. As an auditor,
query access logs filtered by date range. Pick one access log entry, use
its `requestId` to find the corresponding CDC entries.

**Acceptance Scenarios**:

1. **Given** an auditor, **When** they query access logs with filters
   (date range, userId, route), **Then** only matching entries for their
   tenant are returned with cursor-based pagination.
2. **Given** an auditor, **When** they query CDC records for a specific
   entity by ID, **Then** the full change history is returned in
   chronological order.
3. **Given** a CDC entry, **When** the auditor reads its `requestId`,
   **Then** it matches exactly one access log entry, enabling full
   traceability.
4. **Given** a non-auditor user, **When** they attempt to query audit
   endpoints, **Then** access is denied (requires `audit:read` permission).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST capture an access log entry for every API request
  containing method, route, status, IP, user_agent, user_id, tenant_id,
  request_id, duration_ms, and timestamp.
- **FR-002**: System MUST make access logs queryable by auditors, scoped to
  their own tenant only.
- **FR-003**: System MUST capture CDC entries for every data modification
  (create, update, delete) with old_value (full entity snapshot),
  new_value (full entity snapshot), actor, entity type, entity ID,
  request_id, and timestamp.
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
- **FR-014**: CDC MUST redact sensitive fields from old_value/new_value
  snapshots. Redacted fields include: passwordHash, token (RefreshToken),
  and any field explicitly marked as sensitive in the domain model.
  Redacted values MUST be replaced with "[REDACTED]".
- **FR-015**: All domain entities MUST conform to the standard audit column
  pattern: createdById, updatedById, deletedById, isActive, createdAt,
  updatedAt. Entities that deviate (Permission, RoleAssignment) MUST be
  normalized before audit infrastructure activation.
- **FR-016**: Audit query endpoints MUST use cursor-based pagination with
  a default page size of 50 and a maximum of 200. Parameters: cursor
  (opaque string), limit (integer, default 50, max 200).

### Non-Functional Requirements

- **NFR-001**: Access log and CDC writes MUST NOT add more than 15ms of
  latency to any API request under normal conditions.
- **NFR-002**: Audit write failures MUST NOT block business operations. If
  the audit write fails, the business operation proceeds and the failure is
  logged as a CRITICAL error for operational alerting.
- **NFR-003**: Access logs older than 90 days SHOULD be archivable to cold
  storage. The system MUST support a configurable retention window via
  environment variable (default: indefinite).
- **NFR-004**: Audit query endpoints MUST return results in < 2 seconds for
  date ranges of up to 30 days with appropriate indexes.

### Key Entities

- **AccessLog**: Request record. Attributes: method, route, status code,
  client IP, user_agent, user_id, tenant_id, request_id, duration_ms,
  timestamp.
- **ChangeRecord**: CDC entry. Attributes: entity type, entity ID,
  action (create/update/delete), old_value (JSON, full snapshot with
  sensitive fields redacted), new_value (JSON, full snapshot with sensitive
  fields redacted), actor user_id, tenant_id, request_id, timestamp.

### Required Database Indexes

- **AccessLog**: `(tenantId, timestamp DESC)`, `(requestId)`,
  `(userId, timestamp DESC)`
- **ChangeRecord**: `(tenantId, entityType, entityId)`, `(requestId)`,
  `(tenantId, timestamp DESC)`

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
- **SC-005**: Sensitive fields (passwordHash, token) never appear in
  plain text within CDC old_value/new_value — verified by automated test.

## Assumptions

- Access logs are stored in the same PostgreSQL database as business data.
  For very high-traffic scenarios, a separate log store may be needed in
  the future.
- CDC old_value and new_value store **full entity snapshots** (not diffs).
  This enables point-in-time reconstruction without replaying the entire
  change history. Sensitive fields are redacted per FR-014.
- Soft-deleted records are permanently excluded from list queries unless
  an explicit "include_deleted=true" parameter is passed by an auditor.
  This parameter requires the AUDIT module READ permission.
- Access log retention is configurable via environment variable. Default is
  indefinite. A future feature may add automatic archival/purge jobs.
- Expected volume: ~100-500 access log entries per minute at moderate load;
  CDC entries are proportional to write operations (~10-50 per minute).
  No partitioning required initially, but indexes on `tenantId` +
  `timestamp` are mandatory for query performance.
- AccessLog SHOULD be partitioned by month (range partition on timestamp)
  once volume exceeds 10M records. Initial implementation uses indexes.
  Partitioning is a future operational concern — the schema supports it
  natively via PostgreSQL declarative partitioning.
- Audit query endpoints use cursor-based pagination with a default page
  size of 50 and a maximum of 200.
- Activation of soft-delete is a **breaking change** in delete behavior.
  The implementation plan MUST include a verification step ensuring no
  existing business logic depends on physical deletion.

## Dependencies

- **003-authentication**: Provides `userId` from JWT claims for audit column
  injection and access log attribution.
- **002-multi-tenancy-core**: Provides `tenantId` from `TenantContextService`
  (AsyncLocalStorage) for scoping all audit records.
- **004-rbac**: Provides `audit:read` permission for controlling access to
  audit query endpoints. The `audit` module is already registered in the
  RBAC module registry.
- **001-foundation-bootstrap**: Provides `requestId` generated by pinoHttp
  (`genReqId` in `logger.module.ts`) and propagated via
  `TenantContextMiddleware` into `TenantContextService.getRequestId()`.
