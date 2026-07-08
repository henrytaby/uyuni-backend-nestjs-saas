# Feature Specification: Role-Based Access Control (RBAC)

**Feature Branch**: `004-rbac`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Implement granular role-based access control with module-scoped, action-granular permissions, ownership-aware scope (scope_all), and platform superadmin bypass."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Module & Action Permission Enforcement (Priority: P1)

A tenant admin assigns a role to a team member. The role determines which
modules the member can access and which actions (create, read, update, delete)
they can perform within each module. When the member attempts an action,
the system checks their permissions and either allows or denies the request.

**Why this priority**: Without permission enforcement, any authenticated user
could perform any action within their tenant — a critical security gap.

**Independent Test**: Create an "Empleado" role with READ-only access to the
CRM module. As that user, attempt to create a client (denied) and list
clients (allowed).

**Acceptance Scenarios**:

1. **Given** a user with the "Empleado" role having only READ permission on
   the CRM module, **When** they attempt to list clients, **Then** the
   request succeeds.
2. **Given** a user with the "Empleado" role having only READ permission on
   the CRM module, **When** they attempt to create a client, **Then** the
   system returns 403 with a message indicating insufficient permissions.
3. **Given** a tenant admin, **When** they assign a role with specific
   module+action permissions to a team member, **Then** those permissions
   take effect immediately on the next request.

---

### User Story 2 - Ownership-Scoped Access (scope_all) (Priority: P2)

A user with scope_all=false can only see and modify records they created.
A user with scope_all=true can see and modify all records within their
tenant. This flag is part of the role definition and is enforced
automatically at the data layer.

**Why this priority**: Ownership scoping is essential for environments where
employees should only manage their own clients/tasks (e.g., clinics with
patient privacy, sales teams with individual pipelines).

**Independent Test**: Two users in the same tenant create records. User A
with scope_all=false sees only their records. User B with scope_all=true
sees all records.

**Acceptance Scenarios**:

1. **Given** a user with scope_all=false, **When** they list records in a
   module, **Then** only records created by that user are returned.
2. **Given** a user with scope_all=false, **When** they attempt to access
   a record created by another user in the same tenant, **Then** the system
   returns 404.
3. **Given** a user with scope_all=true, **When** they list records, **Then**
   all records within their tenant are returned regardless of creator.

---

### User Story 3 - Platform Superadmin Bypass (Priority: P3)

A platform superadmin can access any tenant's data for support purposes.
Every such access is logged in the audit trail with the superadmin's
identity and the reason context. Superadmin actions are distinguishable
from regular tenant admin actions.

**Why this priority**: Cross-tenant support access is operationally necessary
but carries high risk. Explicit logging and audit trail create accountability.

**Independent Test**: As a platform superadmin, access data from Tenant A.
Verify the access succeeds and an audit entry is created documenting the
superadmin bypass.

**Acceptance Scenarios**:

1. **Given** a platform superadmin, **When** they access data from any
   tenant, **Then** the request succeeds regardless of tenant membership.
2. **Given** a platform superadmin performing a cross-tenant action,
   **When** the action completes, **Then** an audit log entry is created
   recording the superadmin's identity, the tenant accessed, and the
   action performed.
3. **Given** a regular tenant admin, **When** they attempt to access
   data from another tenant they are not a member of, **Then** the
   request is denied.

### Edge Cases

- A user has multiple roles within the same tenant — permissions MUST be
  merged (union of all permissions across roles).
- A role is modified while a user with that role is actively making
  requests — the new permissions MUST take effect on the next request
  (not retroactively).
- scope_all is changed from true to false — the user immediately loses
  visibility of other users' records; no cached data should persist.
- A module is accessed that does not exist in the permission registry —
  MUST default to denied (deny-by-default).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define roles (Admin, Empleado, Auditor) as global
  role definitions assignable per-tenant via TenantUser.
- **FR-002**: System MUST define permissions per module and per action
  (CREATE, READ, UPDATE, DELETE) — no blanket or wildcard access.
- **FR-003**: System MUST enforce permissions on every protected endpoint
  before the request reaches business logic.
- **FR-004**: System MUST support the scope_all flag per role, determining
  whether a user sees all tenant records or only their own.
- **FR-005**: System MUST enforce scope_all at the data/repository layer,
  not in Controllers or Services.
- **FR-006**: System MUST allow platform superadmins to bypass RBAC for
  cross-tenant support access.
- **FR-007**: System MUST log every superadmin bypass action in the audit
  trail with identity, tenant, and action details.
- **FR-008**: System MUST allow tenant admins to assign and change roles
  for users within their tenant.
- **FR-009**: System MUST merge permissions (union) when a user has
  multiple roles within the same tenant.
- **FR-010**: System MUST deny access by default for any module/action
  combination not explicitly granted.

### Key Entities

- **Role**: Global role definition. Attributes: name, description, list of
  permission grants (module + action pairs), scope_all flag.
- **Permission**: Granular access rule. Attributes: module name, action
  (CREATE/READ/UPDATE/DELETE), granted (boolean).
- **RoleAssignment**: TenantUser carries the assigned role(s) as established
  in the multi-tenancy core.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of protected endpoints enforce RBAC — verifiable by an
  automated scan that sends requests without required permissions.
- **SC-002**: A user with scope_all=false never sees records created by
  other users in the same tenant — verified by automated tests across
  all list endpoints.
- **SC-003**: Every superadmin cross-tenant access is recorded in the audit
  trail without exception.
- **SC-004**: Permission changes take effect within one subsequent request
  — no stale permission caching beyond a single request cycle.

## Assumptions

- The initial module names match the domain modules: tenancy, crm, agenda,
  sales, inventory, catalogs, audit.
- "Auditor" role has READ-only access across all modules with scope_all=true
  by default.
- "Admin" role has full CRUD across all modules with scope_all=true by
  default.
- "Empleado" role defaults to scoped CRUD per module — exact permissions
  are configurable by the tenant admin.
- Custom roles beyond the initial three are out of scope for this feature
  but the architecture MUST support adding them without code changes.
