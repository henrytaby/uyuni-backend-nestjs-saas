# Research: Role-Based Access Control (RBAC)

**Feature**: 004-rbac | **Date**: 2026-07-22

## Research Tasks

### R1: RBAC Model Design — Per-Permission Scope vs Per-Role Scope

**Decision**: Ownership scope (`ANY`/`OWN`) is defined at the Permission level, not the Role level.

**Rationale**: Enterprise SaaS applications require granular control. A sales manager may need to see ALL clients (`ANY` on `crm:read`) but only their OWN tasks (`OWN` on `agenda:read`). Per-role scope would force an all-or-nothing visibility model.

**Alternatives considered**:
- **Per-Role `scope_all` flag**: Simpler but too coarse. Rejected because a single flag cannot express "read all CRM but only own Agenda."
- **Attribute-Based Access Control (ABAC)**: More flexible but dramatically more complex. Rejected because the current module+action+scope model covers all identified use cases without the overhead of policy engines (e.g., OPA/Casbin).

### R2: Permission Resolution Strategy — DB Per-Request vs JWT-Embedded vs Cache

**Decision**: Resolve permissions from the database on every request. No caching.

**Rationale**: SC-004 requires that permission changes take effect within one subsequent request. JWT-embedded permissions would require token re-issuance on every role change. Redis caching adds infrastructure complexity and cache invalidation bugs. The permission query is lightweight (~28 permission rows per user, indexed by userId+tenantId) and executes in < 10ms.

**Alternatives considered**:
- **JWT-embedded permissions**: Stale until token expires (15 min). Rejected per SC-004.
- **Redis cache with TTL**: Adds infrastructure dependency. Cache invalidation on role change is error-prone. Rejected for complexity.
- **In-memory cache per request**: Acceptable optimization if needed later — resolve once per request lifecycle and store in `AsyncLocalStorage`. Not needed initially.

### R3: Role Architecture — Global vs Tenant-Scoped

**Decision**: Roles have a nullable `tenantId`. `null` = Global system role (immutable). UUID = Custom tenant role (managed by tenant admin).

**Rationale**: FR-001 and FR-008 require both system defaults and tenant customization. A nullable FK is the simplest relational model that supports both without separate tables.

**Alternatives considered**:
- **Separate `SystemRole` and `TenantRole` tables**: More explicit but introduces unnecessary duplication. Rejected.
- **`isSystem` boolean flag**: Doesn't enforce tenant scoping at the DB level. Rejected.

### R4: Guard Execution Order in NestJS

**Decision**: Guards execute in registration order: `JwtAuthGuard` → `TenantGuard` → `PermissionsGuard`. The `PermissionsGuard` is the last global guard.

**Rationale**: By the time `PermissionsGuard` runs, the JWT has been validated (user identity known) and tenant context is established (tenant_id available). The guard can then query permissions for the specific user+tenant combination.

**Alternatives considered**:
- **Middleware-based authorization**: Loses access to NestJS Reflector metadata (decorators). Rejected.
- **Interceptor-based authorization**: Runs after the handler is selected but too late for access control. Rejected.

### R5: Superadmin Compliance Restrictions

**Decision**: Platform superadmins can perform READ and UPDATE actions across tenants but are explicitly blocked from DELETE on tenant transactional data. All cross-tenant actions are logged.

**Rationale**: SOC2 Type II and ISO 27001 require that administrative access to customer data be limited to the minimum necessary. Preventing destructive operations ensures data integrity while allowing support workflows.

**Alternatives considered**:
- **Full unrestricted bypass**: Violates SOC2 least-privilege principle. Rejected.
- **Read-only bypass**: Too restrictive for support scenarios requiring configuration changes. Rejected.

### R6: Existing `TenantUser.role` Field Migration

**Decision**: The existing `TenantUser.role` string field will be replaced by a proper many-to-many relationship via a `RoleAssignment` join table (`TenantUser` ↔ `Role`). The old `role` column will be migrated and dropped.

**Rationale**: FR-009 requires merging permissions from multiple roles. A single string field cannot support multi-role assignment. The migration will map existing values: `"ADMIN"` → Admin role, `"EMPLEADO"` → Empleado role.

**Alternatives considered**:
- **JSON array in `TenantUser.role`**: Loses referential integrity. Rejected.
- **Keep string field and add separate assignment table**: Confusing dual source of truth. Rejected.
