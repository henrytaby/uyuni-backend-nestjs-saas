# Data Model: Multi-Tenancy Core

**Feature**: 002-multi-tenancy-core
**Date**: 2026-07-07

## Overview

Four entities establish the multi-tenant backbone. `Plan` is platform-global
(no tenant_id, no RLS). `Tenant`, `User`, and `TenantUser` are the tenant
membership triangle. All except `Plan` are tenant-scoped or have
tenant-isolation semantics where applicable. Note: `User` is *global*
(unique email platform-wide, no tenant_id) but `TenantUser` carries the
tenant link.

## Entities

### Plan

Platform-global subscription tier definition. NOT tenant-scoped (no
tenant_id column, no RLS).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Unique identifier |
| name | String | NOT NULL, unique | Plan display name (e.g., "Free", "Pro", "Premium") |
| tier_level | Int | NOT NULL | Numeric tier (1=Free, 2=Pro, 3=Premium) |
| max_users | Int | NOT NULL, > 0 | Quantitative limit: max tenant users |
| storage_limit | BigInt | NOT NULL, >= 0 | Quantitative limit: bytes of storage |
| module_access | Json | NOT NULL | Array of enabled module names (qualitative gates), e.g., `["auth","tenancy","crm","agenda","sales","inventory"]` |
| price | Decimal | nullable | Monthly price |
| is_active | Boolean | NOT NULL, default true | Soft-delete flag (cannot hard-delete a Plan in use) |
| created_at | DateTime | NOT NULL, auto | Creation timestamp (Prisma managed) |
| updated_at | DateTime | NOT NULL, auto | Last update timestamp (Prisma managed) |

**Indexes**: `@unique([name])`.

**Validation Rules**:
- name: 1-50 chars, unique
- module_access: must be a JSON array of valid module name strings
- tier_level: integer 1-10

---

### Tenant

Company account. Tenant-scoped (has `tenant_id`? No — Tenant IS the
tenant root). RLS applies to all *other* tenant-scoped tables via FK to
Tenant; Tenant itself is platform-managed (created by platform admin),
so no RLS on Tenant — but access is restricted to platform admin +
the Tenant's own members via app-layer guards.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Tenant identifier (used as tenant_id FK elsewhere) |
| plan_id | UUID | FK → Plan, NOT NULL | Current subscription plan |
| name | String | NOT NULL | Company display name |
| slug | String | NOT NULL, unique | URL-safe identifier (subdomain/path routing) |
| payment_state | Enum | NOT NULL, default ACTIVO | ACTIVO \| MOROSO \| SUSPENDIDO |
| subscription_start | DateTime | nullable | Current plan period start |
| subscription_end | DateTime | nullable | Current plan period end |
| is_active | Boolean | NOT NULL, default true | Soft-delete / suspension flag |
| created_at | DateTime | NOT NULL, auto | Creation timestamp |
| updated_at | DateTime | NOT NULL, auto | Last update timestamp |
| created_by_id | UUID | FK → User, nullable | Auto-injected (bridge in this spec; full extension in spec 005) |
| updated_by_id | UUID | FK → User, nullable | Auto-injected |

**Indexes**: `@unique([slug])`, `(plan_id)`.

**Validation Rules**:
- name: 1-100 chars
- slug: lowercase, alphanumeric + hyphens, 3-50 chars, unique
- payment_state: exactly one of ACTIVO/MOROSO/SUSPENDIDO

**State Transitions**:
```text
[Created: ACTIVO] ──(missed payment)──▶ [MOROSO] ──(sustained)──▶ [SUSPENDIDO]
                          ▲
                          └──(payment received)── [ACTIVO] (from any state)
```
Note: state transitions are triggered externally (billing); this feature
only stores + reads the state.

---

### User

Global person record. NOT tenant-scoped — has no tenant_id (a user can
belong to many tenants via TenantUser). Unique email platform-wide. RLS does
not apply (global identity). Access is restricted by app guards — a user
sees only their own record + records visible via their TenantUser
memberships.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | User identifier (used as user_id FK elsewhere) |
| email | String | NOT NULL, unique | Global unique email (login identity) |
| password_hash | String | NOT NULL | bcrypt hash |
| first_name | String | nullable | Given name |
| last_name | String | nullable | Family name |
| is_platform_admin | Boolean | NOT NULL, default false | Platform superadmin bypass flag |
| is_active | Boolean | NOT NULL, default true | Soft-delete flag |
| created_at | DateTime | NOT NULL, auto | Creation timestamp |
| updated_at | DateTime | NOT NULL, auto | Last update timestamp |
| created_by_id | UUID | FK → User (self), nullable | For audit (self-creation or platform admin) |
| updated_by_id | UUID | FK → User (self), nullable | |

**Indexes**: `@unique([email])`.

**Validation Rules**:
- email: valid email format (class-validator `@IsEmail`)
- password_hash: bcrypt hash (length 60 when hashed; validated at the auth
  layer, not stored as plain text)
- first_name/last_name: 1-50 chars if provided

---

### TenantUser

Membership join linking a User to a Tenant with a role. This is the
tenant-scoped entity: tenant_id column present, RLS enabled. The role
field is seeded as a string here (e.g., "ADMIN", "EMPLEADO", "AUDITOR")
and formalized into the full RBAC model in spec 004.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Membership identifier |
| tenant_id | UUID | FK → Tenant, NOT NULL | Tenant scope (RLS applies) |
| user_id | UUID | FK → User, NOT NULL | The member user |
| role | String | NOT NULL, default "EMPLEADO" | Initial seed roles: ADMIN, EMPLEADO, AUDITOR |
| is_active | Boolean | NOT NULL, default true | Membership active flag |
| joined_at | DateTime | NOT NULL, auto | Membership creation timestamp |
| created_at | DateTime | NOT NULL, auto | Creation timestamp |
| updated_at | DateTime | NOT NULL, auto | Last update timestamp |
| created_by_id | UUID | FK → User, nullable | Auto-injected (the inviter) |
| updated_by_id | UUID | FK → User, nullable | |

**Indexes**: `@unique([tenant_id, user_id])`, `(user_id)`.

**Validation Rules**:
- role: one of "ADMIN", "EMPLEADO", "AUDITOR" (string here; enum enforced
  in DTO via class-validator; normalized in spec 004)
- (tenant_id, user_id) unique: a user has exactly one membership per tenant

---

## Entity Relationships

```text
Plan 1──N Tenant                      (one plan, many tenants)
Tenant 1──N TenantUser                (one tenant, many members)
User 1──N TenantUser                  (one user, many memberships)
User 1──N User (created_by/updated_by) (audit self-reference)

TenantUser N──1 User  N──1 Tenant    (membership triangle)
```

## RLS Policy Matrix

| Table | RLS | tenant_id column? | Policy |
|-------|-----|-------------------|--------|
| Plan | ❌ No | No | Platform-global; access via app guards (platform admin) |
| Tenant | ❌ No | Is the tenant root | App guards restrict (platform admin or self-member) |
| User | ❌ No | Global identity | App guards restrict (own record / members visible) |
| TenantUser | ✅ Yes | Yes | `USING/WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid)` |

All *future* tenant-scoped domain entities (CRM, Sales, etc.) will carry
`tenant_id` + RLS following the TenantUser pattern.

## Indexes Summary

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| Plan | (name) | Unique | Plan name uniqueness |
| Plan | (tier_level) | B-tree | Order by tier |
| Tenant | (slug) | Unique | URL routing |
| Tenant | (plan_id) | B-tree | Plan lookups |
| User | (email) | Unique | Global login identity |
| TenantUser | (tenant_id, user_id) | Unique | One membership per pair |
| TenantUser | (user_id) | B-tree | User's memberships |

## Cross-Cutting: Request Context & Audit Columns

These are not entities but are defined here because every tenant-scoped
entity depends on them.

### TenantContext (AsyncLocalStorage store shape)

```typescript
interface TenantContext {
  tenantId: string | null;       // UUID of active tenant
  userId: string | null;         // UUID of authenticated user
  isPlatformAdmin: boolean;     // bypass flag
  requestId: string;             // correlates with logs (from spec 001)
}
```

### Standard Audit Columns (applied to Tenant, User, TenantUser; reused by all future entities)

| Column | Type | Populated By |
|--------|------|--------------|
| created_at | DateTime | Prisma native (`@default(now())`) |
| updated_at | DateTime | Prisma native (`@updatedAt`) |
| created_by_id | UUID FK→User | Prisma extension reading TenantContext **— bridge in this spec; full extension in spec 005** |
| updated_by_id | UUID FK→User | Prisma extension reading TenantContext **— bridge in this spec; full extension in spec 005** |
| deleted_by_id | UUID FK→User | Prisma extension reading TenantContext (spec 005) |
