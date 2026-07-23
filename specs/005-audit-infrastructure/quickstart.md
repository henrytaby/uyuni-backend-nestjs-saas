# Audit Infrastructure: Validation & Quickstart Guide

This guide documents how to validate that the Audit Infrastructure (Access Logs and Change Data Capture - CDC) is functioning correctly. 

## Prerequisites

Before running these tests, ensure:
1. PostgreSQL is running.
2. All migrations have been applied (including the CDC triggers and audit tables).
3. RBAC is seeded: A role named `Auditor` (or similar) exists with the `audit:read` permission, and your test user is assigned this role.

---

## Validation Scenarios

### Scenario 1: Access Log Capture
**Goal:** Verify that incoming HTTP requests are captured in the access logs.

1. **Action:** Make 3 authenticated requests to any endpoint (e.g., `GET /users/me`).
2. **Query:** `GET /audit/access-logs` (as the Auditor user).
3. **Verify:** Confirm the response contains at least 3 entries reflecting the requests you just made. Check that `route`, `method`, `statusCode`, and `userId` are correct.

### Scenario 2: CDC Capture
**Goal:** Verify that data mutations generate corresponding change records.

1. **Action:** Create a new `TenantUser` via the API.
2. **Action:** Update the created `TenantUser`.
3. **Action:** Soft-delete the `TenantUser`.
4. **Query:** `GET /audit/change-records/entity/TenantUser/{id}` (using the ID from step 1).
5. **Verify:** Confirm the response contains exactly 3 entries:
   - A `CREATE` action with `oldValues: null` and `newValues` containing the initial data.
   - An `UPDATE` action showing the difference in `oldValues` and `newValues`.
   - A `DELETE` (or soft-delete update) action reflecting the removal.

### Scenario 3: Sensitive Field Redaction
**Goal:** Verify that sensitive information is not stored in plaintext in the CDC tables.

1. **Action:** Create or update a `User` entity, explicitly setting a password.
2. **Query:** Find the corresponding CDC entry via `GET /audit/change-records`.
3. **Verify:** Inspect the `newValues` (and `oldValues` if updating). Verify that the `passwordHash` field shows `"[REDACTED]"` instead of the actual hash.

### Scenario 4: Append-Only Protection
**Goal:** Verify that audit tables cannot be tampered with directly.

1. **Action:** Connect directly to the PostgreSQL database using a standard application user role.
2. **Action:** Attempt to execute `DELETE FROM access_logs WHERE id = 'some-uuid';`
3. **Verify:** Confirm the database rejects the command (e.g., via trigger throwing an exception or permission denied), ensuring immutability.

### Scenario 5: Request Correlation
**Goal:** Verify that access logs and CDC entries are linked via `requestId`.

1. **Action:** Make a `POST` or `PATCH` request that modifies data. Note the `x-request-id` header from the HTTP response (or the generated ID if returned in the payload).
2. **Query:** `GET /audit/access-logs/{requestId}` to find the access log.
3. **Query:** `GET /audit/change-records/request/{requestId}` to find the exact database changes caused by that request.
4. **Verify:** Both queries succeed and correlate to the exact same action and timestamp.

### Scenario 6: Soft-Delete Verification
**Goal:** Verify that deleting a record sets appropriate metadata and hides it from lists.

1. **Action:** Delete a record (e.g., `TenantUser`) via its standard API endpoint.
2. **Database Query:** Check the record directly in the DB: `SELECT * FROM tenant_users WHERE id = '{id}';`
3. **Verify Database:** Confirm `is_active = false` (or `deleted_at IS NOT NULL`) and `deleted_by_id` is set to the user who performed the deletion.
4. **API Query:** Query the list endpoint (e.g., `GET /tenant-users`).
5. **Verify API:** Confirm the deleted record does not appear in the results.
