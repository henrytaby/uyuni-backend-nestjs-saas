# Data Model: Role-Based Access Control (RBAC)

**Feature**: 004-rbac | **Date**: 2026-07-22

## New Entities

### Role

Defines a job function with associated permissions. Can be Global (system-wide) or Custom (tenant-scoped).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| name | String | NOT NULL, max 100 | Role display name (e.g., "Admin", "Gerente de Ventas") |
| description | String? | nullable, max 500 | Human-readable description |
| tenantId | UUID? | FK → Tenant, nullable | null = Global system role; UUID = Custom tenant role |
| isSystem | Boolean | default: false | true for seed roles (Admin, Empleado, Auditor) — immutable |
| isActive | Boolean | default: true | Soft-delete flag |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |
| createdById | UUID? | FK → User | Audit: who created |
| updatedById | UUID? | FK → User | Audit: who last updated |
| deletedById | UUID? | FK → User | Audit: who soft-deleted |

**Unique constraint**: `@@unique([tenantId, name])` — prevents duplicate role names within the same tenant (or globally when `tenantId` is null).

**Indexes**: `@@index([tenantId])` for efficient tenant-scoped queries.

### Permission

Granular access rule linked to a Role. Defines what module+action combination is allowed and the ownership scope.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| roleId | UUID | FK → Role, NOT NULL | Parent role |
| module | String | NOT NULL | Module name (e.g., "crm", "agenda", "sales") |
| action | String (enum) | NOT NULL | One of: CREATE, READ, UPDATE, DELETE |
| scope | String (enum) | NOT NULL, default: "OWN" | `ANY` = all tenant records; `OWN` = only creator's records |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Unique constraint**: `@@unique([roleId, module, action])` — a role can only have one permission entry per module+action pair.

**Indexes**: `@@index([roleId])` for efficient permission lookups.

### RoleAssignment

Maps a User to a Role within a specific Tenant context. Replaces the existing `TenantUser.role` string field.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| tenantUserId | UUID | FK → TenantUser, NOT NULL | The tenant membership |
| roleId | UUID | FK → Role, NOT NULL | The assigned role |
| assignedAt | DateTime | auto, default: now() | When the role was assigned |
| assignedById | UUID? | FK → User | Who assigned this role |
| isActive | Boolean | default: true | Soft-delete flag |
| createdAt | DateTime | auto | Creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Unique constraint**: `@@unique([tenantUserId, roleId])` — a user cannot be assigned the same role twice within the same tenant.

**Indexes**: `@@index([tenantUserId])`, `@@index([roleId])`.

## Enums

### PermissionAction

```
CREATE | READ | UPDATE | DELETE
```

### PermissionScope

```
ANY | OWN
```

## Entity Relationships

```
Role 1 ──── * Permission         (a Role has many Permissions)
Role 1 ──── * RoleAssignment      (a Role can be assigned to many users)
TenantUser 1 ── * RoleAssignment  (a TenantUser can have many Roles)
Tenant 1 ──── * Role              (a Tenant can have many Custom Roles; nullable FK)
```

## Migration Strategy

The existing `TenantUser.role` string field must be migrated:

1. Create new `Role`, `Permission`, and `RoleAssignment` tables.
2. Seed Global system roles: Admin (full CRUD, ANY scope), Empleado (scoped CRUD, OWN scope), Auditor (READ only, ANY scope).
3. For each existing `TenantUser` record, create a `RoleAssignment` linking to the matching Global role based on the `role` string value.
4. Drop the `TenantUser.role` column after migration verification.

## Permission Resolution Algorithm

```text
resolvePermissions(userId, tenantId):
  1. Find TenantUser where userId + tenantId
  2. Find all active RoleAssignments for that TenantUser
  3. For each RoleAssignment, load the Role's Permissions
  4. Merge all permissions (union):
     - If same module+action appears with different scopes,
       the broader scope (ANY) wins over OWN
  5. Return Map<"module:action", scope>
```

## Validation Rules

- Role name: 2-100 characters, alphanumeric + spaces + hyphens
- Module name: must be from the allowed module registry (tenancy, crm, agenda, sales, inventory, catalogs, audit)
- Action: must be one of CREATE, READ, UPDATE, DELETE
- Scope: must be one of ANY, OWN
- Tenant admins cannot modify or delete Global system roles (isSystem = true)
- Roles with active RoleAssignments cannot be deleted (409 Conflict)
