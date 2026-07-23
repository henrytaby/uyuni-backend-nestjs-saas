# Feature Specification: Role-Based Access Control (RBAC)

**Feature Branch**: `004-rbac`

**Created**: 2026-07-07

**Status**: Ready

**Updated**: 2026-07-22 (Enterprise Standards Alignment)

**Input**: User description: "Implement granular role-based access control with module-scoped, action-granular permissions, ownership-aware scope per permission (ANY vs OWN), tenant-customizable roles, and platform superadmin bypass restricted by compliance."

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

### User Story 2 - Ownership-Scoped Access (ANY vs OWN) (Priority: P2)

A permission grant includes not just the module and action, but an access scope (ANY or OWN). A user with `OWN` scope for `crm:read` can only see records they created. A user with `ANY` scope can see all records within their tenant. This flag is evaluated per-permission, enabling granular configurations (e.g., read ANY client, but edit OWN clients).

**Why this priority**: Granular ownership scoping is essential for enterprise environments where employees have differing visibility rules across different departments.

**Independent Test**: Two users in the same tenant create records. User A with `OWN` scope for read sees only their records. User B with `ANY` scope sees all records.

**Acceptance Scenarios**:

1. **Given** a user with `OWN` scope for a module's read action, **When** they list records, **Then** only records created by that user are returned.
2. **Given** a user with `OWN` scope, **When** they attempt to access a record created by another user in the same tenant, **Then** the system returns 404.
3. **Given** a user with `ANY` scope for a module's read action, **When** they list records, **Then** all records within their tenant are returned regardless of creator.

---

### User Story 3 - Platform Superadmin Bypass & Compliance (Priority: P3)

A platform superadmin can access any tenant's data for support purposes, bypassing normal RBAC. However, for SOC2/ISO27001 compliance, superadmin bypass is restricted to non-destructive actions (READ, and limited UPDATE for configuration). DELETE actions on tenant transactional data by superadmins are strictly prohibited via API. Every access is logged in the audit trail.

**Why this priority**: Cross-tenant support access is operationally necessary but carries high risk. Explicit logging and destructive action prevention create accountability and compliance.

**Independent Test**: As a platform superadmin, read data from Tenant A (succeeds, audited). Attempt to delete a client in Tenant A (denied).

**Acceptance Scenarios**:

1. **Given** a platform superadmin, **When** they attempt a READ action on any tenant's data, **Then** the request succeeds regardless of tenant membership.
2. **Given** a platform superadmin, **When** they attempt a DELETE action on tenant transactional data, **Then** the request is explicitly denied.
3. **Given** a platform superadmin performing a cross-tenant action, **When** the action completes, **Then** an immutable audit log entry is created recording the superadmin's identity, the tenant accessed, and the action performed.
4. **Given** a regular tenant admin, **When** they attempt to access data from another tenant they are not a member of, **Then** the request is denied.

---

### User Story 4 - Tenant Role Management (Priority: P2)

A tenant admin can create custom roles specific to their organization, define granular permissions for each role, assign those roles to team members, and modify or deactivate roles as needs change. Global system roles (Admin, Empleado, Auditor) remain available as templates but cannot be modified by tenants.

**Why this priority**: Without role management, every tenant would be limited to the same 3 default roles — unusable for organizations with complex hierarchies (e.g., "Gerente de Ventas", "Recepcionista", "Técnico de Campo").

**Independent Test**: As a tenant admin, create a custom role "Gerente de Ventas" with READ+UPDATE on CRM (ANY scope) and READ on Sales (OWN scope). Assign it to a user. Verify the user can read all CRM records but only their own sales records.

**Acceptance Scenarios**:

1. **Given** a tenant admin, **When** they create a custom role with specific permissions, **Then** the role is created and visible only within their tenant.
2. **Given** a tenant admin, **When** they assign a custom role to a team member, **Then** the member's permissions reflect the custom role immediately.
3. **Given** a tenant admin, **When** they attempt to modify a Global system role, **Then** the system returns 403 (global roles are immutable).
4. **Given** a tenant admin, **When** they attempt to delete a custom role that has active users assigned, **Then** the system returns 409 Conflict indicating users must be reassigned first.
5. **Given** Tenant A's admin, **When** they list available roles, **Then** they see Global roles plus only their own Custom roles — never Custom roles from Tenant B.

### Edge Cases

- A user has multiple roles within the same tenant — permissions MUST be
  merged (union of all permissions across roles). If one role grants ANY scope and another OWN for the same action, the broader scope (ANY) wins.
- A role is modified while a user with that role is actively making
  requests — the new permissions MUST take effect on the next request
  (not retroactively).
- A permission's scope is reduced from ANY to OWN — the user immediately loses
  visibility of other users' records; no cached data should persist.
- A module is accessed that does not exist in the permission registry —
  MUST default to denied (deny-by-default).
- A tenant admin attempts to delete a custom role with active user
  assignments — MUST return 409 Conflict; the role cannot be deleted
  until all users are reassigned.
- A tenant admin creates a custom role with the same name as a global
  role — MUST be allowed; custom roles are namespaced to the tenant.
- A user's only role is deactivated — the user effectively has zero
  permissions (deny-by-default applies); they can still authenticate
  but cannot perform any actions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define Roles that can be either Global (system-wide, null `tenantId`) or Custom (scoped to a specific `tenantId`).
- **FR-002**: System MUST define permissions per module and per action (CREATE, READ, UPDATE, DELETE).
- **FR-003**: System MUST enforce permissions on every protected endpoint before the request reaches business logic.
- **FR-004**: System MUST support an Ownership Scope (`ANY` or `OWN`) at the Permission level, not the Role level, for granular visibility rules.
- **FR-005**: System MUST enforce Ownership Scope at the data/repository layer to prevent data leakage.
- **FR-006**: System MUST allow platform superadmins to bypass RBAC for cross-tenant support access, but explicitly block them from performing DELETE actions on tenant transactional data.
- **FR-007**: System MUST log every superadmin bypass action in the audit trail with identity, tenant, and action details.
- **FR-008**: System MUST allow tenant admins to assign roles, and create Custom Roles specific to their tenant.
- **FR-009**: System MUST merge permissions (union) when a user has multiple roles within the same tenant.
- **FR-010**: System MUST deny access by default for any module/action combination not explicitly granted.
- **FR-011**: System MUST prevent tenant admins from modifying or deleting Global system roles.
- **FR-012**: System MUST prevent deletion of Custom Roles that have active user assignments (return 409 Conflict).
- **FR-013**: Permissions MUST be resolved from the database on every request — no long-lived permission caching that could cause stale authorization decisions.

### Key Entities

- **Role**: Definition of a job function. Attributes: name, description, `tenantId` (nullable: null = global, UUID = custom tenant role).
- **Permission**: Granular access rule linked to a Role. Attributes: module name, action (CREATE/READ/UPDATE/DELETE), scope (`ANY` or `OWN`).
- **RoleAssignment**: Maps a User to a Role within a specific Tenant context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of protected endpoints enforce RBAC — verifiable by an
  automated scan that sends requests without required permissions.
- **SC-002**: A user with `OWN` scope for a read action never sees records created by
  other users in the same tenant — verified by automated tests across
  all list endpoints.
- **SC-003**: Every superadmin cross-tenant access is recorded in the audit
  trail without exception.
- **SC-004**: Permission changes take effect within one subsequent request
  — no stale permission caching beyond a single request cycle.
- **SC-005**: Custom roles created by Tenant A are never visible or
  assignable by Tenant B — verified by cross-tenant isolation tests.

## Assumptions

- The initial module names match the domain modules: tenancy, crm, agenda,
  sales, inventory, catalogs, audit.
- "Auditor" role has READ-only access across all modules with `ANY` scope by default.
- "Admin" role has full CRUD across all modules with `ANY` scope by default.
- "Empleado" role defaults to scoped CRUD per module (often `OWN` scope) — exact permissions are configurable by the tenant admin.
- The system supports both Global and Custom roles natively from day one.
- Permissions are resolved from the database on every request (no JWT-embedded
  permissions) to guarantee SC-004 compliance. Performance is acceptable
  because the permission set is small and queries are indexed.

## Dependencies

- **003-authentication**: JWT tokens provide `userId`, `tenantId`, and
  `isPlatformAdmin` claims. RBAC reads these to determine identity.
- **002-multi-tenancy-core**: `TenantContextService` (AsyncLocalStorage)
  provides the active tenant for scoping queries.
- **005-audit-infrastructure**: Superadmin bypass logging (FR-007) will
  integrate with the audit module once available. Until then, structured
  pino logs serve as the interim audit trail.
