# Audit Infrastructure - Research & Decisions

## Research Topic 1: Prisma Extension Architecture for CDC
- **Decision:** Use Prisma `$allOperations` hook within a `defineExtension` to intercept create/update/delete and generate CDC ChangeRecord entries.
- **Rationale:** Prisma extensions are the official way to intercept operations. The existing `tenant-scoped.extension.ts` already demonstrates this pattern successfully. CDC capture at the ORM level ensures 100% coverage without developer effort.
- **Alternatives considered:** PostgreSQL triggers (rejected: harder to maintain, can't access request context like userId/requestId), Application-level middleware (rejected: would miss direct Prisma calls), Event sourcing (rejected: overkill for audit trail requirements).
- **Key insight:** Extensions compose via `$extends` chain. CDC extension MUST run AFTER tenant-scoped extension to capture the final tenantId-injected state.

## Research Topic 2: Access Log Interceptor Strategy
- **Decision:** Use a NestJS `NestInterceptor` registered globally via `APP_INTERCEPTOR` that runs AFTER the response.
- **Rationale:** Interceptors have access to both the request and response (via `tap` operator on the Observable). They can measure duration_ms accurately. The existing `SuperadminAuditInterceptor` already demonstrates this pattern.
- **Alternatives considered:** Middleware (rejected: runs before response, can't capture status code or duration), Guard (rejected: wrong lifecycle phase), Express middleware (rejected: outside NestJS DI container).
- **Key insight:** Use `tap` + `catchError` from rxjs to capture both success and error responses. The interceptor MUST be best-effort: wrap DB write in try/catch, log CRITICAL on failure, never throw.

## Research Topic 3: Append-Only Protection for Audit Tables
- **Decision:** Dual-layer protection - (1) Prisma extension that rejects update/delete operations on AccessLog/ChangeRecord at ORM level, (2) PostgreSQL REVOKE UPDATE, DELETE on the tables at DB level.
- **Rationale:** Defense in depth. The Prisma extension prevents accidental application-level modifications. The PostgreSQL REVOKE prevents direct SQL tampering. Both layers are needed for true immutability.
- **Alternatives considered:** Single-layer (Prisma only or DB only) - rejected because each layer has bypass vectors.

## Research Topic 4: Soft-Delete Integration with Existing Extension
- **Decision:** Extend the existing `tenant-scoped.extension.ts` to intercept `delete` and `deleteMany` operations, converting them to `update({ data: { isActive: false, deletedById: userId } })`.
- **Rationale:** Centralized in the existing extension chain. All tenant-scoped models already pass through this extension. Adding soft-delete here ensures 100% coverage.
- **Alternatives considered:** Separate soft-delete extension (possible but adds complexity), PostgreSQL rule (rejected: can't access request context).
- **Key insight:** The extension already handles `delete`/`deleteMany` in `injectWriteContext`. The conversion to soft-delete means transforming the operation from `delete` to `update` - this requires careful handling of the Prisma query pipeline.

## Research Topic 5: Sensitive Field Redaction Strategy
- **Decision:** Maintain a SENSITIVE_FIELDS registry (model → field names Set) in `src/common/constants/sensitive-fields.ts`. The CDC extension reads this registry and replaces matching field values with "[REDACTED]" in old_value/new_value snapshots.
- **Rationale:** Centralized registry makes it easy to add new sensitive fields as models grow. Explicit field listing prevents accidentally redacting non-sensitive data.
- **Initial fields:** User.passwordHash, RefreshToken.tokenHash

## Research Topic 6: Cursor-Based Pagination for Audit Queries
- **Decision:** Use opaque cursor (base64-encoded JSON of { id, timestamp }) with `WHERE (timestamp, id) < (cursor_timestamp, cursor_id) ORDER BY timestamp DESC, id DESC LIMIT N+1` pattern.
- **Rationale:** Cursor-based pagination is superior to offset for append-heavy tables (no skipped/duplicated records as new data arrives). The extra +1 fetch determines hasNextPage.
- **Alternatives considered:** Offset pagination (rejected: unreliable for append-heavy audit tables), Keyset with single column (rejected: timestamp alone isn't unique enough).

## Research Topic 7: Schema Normalization for FR-015
- **Decision:** Add missing audit columns to Permission and RoleAssignment models before activating audit infrastructure.
  - Permission: Add createdById, updatedById, deletedById, isActive.
  - RoleAssignment: Add createdById, updatedById, deletedById (assignedById stays for business semantics).
- **Rationale:** Consistent audit trail requires these baseline columns across all domain entities.
- **Action required:** This requires a Prisma migration.
