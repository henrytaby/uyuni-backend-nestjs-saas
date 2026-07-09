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
| module_access | Json | NOT NULL | Array of enabled module names (qualitative gates). Canonical names: `["auth","tenancy","crm","agenda","sales","inventory"]`. Order does not matter; validation rejects unknown names. |
| price | Decimal | nullable | Monthly price |
| is_active | Boolean | NOT NULL, default true | Soft-delete flag (cannot hard-delete a Plan in use) |
| created_at | DateTime | NOT NULL, auto | Creation timestamp (Prisma managed) |
| updated_at | DateTime | NOT NULL, auto | Last update timestamp (Prisma managed) |
| created_by_id | UUID | FK → User, nullable | Auto-injected (bridge in this spec; full extension in spec 005) |
| updated_by_id | UUID | FK → User, nullable | Auto-injected |
| deleted_by_id | UUID | FK → User, nullable | Auto-injected on soft-delete (bridge in this spec; full extension in spec 005) |

**Indexes**: `@unique([name])`.

**Validation Rules**:
- name: 1-50 chars, unique
- module_access: must be a JSON array of strings from the canonical set
  {auth, tenancy, crm, agenda, sales, inventory}; empty array allowed;
  duplicates rejected
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
| deleted_by_id | UUID | FK → User, nullable | Auto-injected on soft-delete (bridge in this spec; full extension in spec 005) |

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
| is_platform_admin | Boolean | NOT NULL, default false | Platform superadmin bypass flag (RLS `app.is_platform_admin` + Prisma extension skip) |
| is_verified | Boolean | NOT NULL, default false | Email verification status. Set true after the user completes the email-verification flow (spec 003) |
| failed_login_attempts | Int | NOT NULL, default 0 | Consecutive failed login attempts. Seeded here; the lockout policy (5 attempts → lock) is enforced in spec 003 (auth). Reset to 0 on successful login |
| locked_until | DateTime | nullable | If set, the account is locked until this timestamp. Seeded here; the unlock logic (lock + TTL expiry) is enforced in spec 003 |
| last_login_at | DateTime | nullable | Last successful login timestamp. Updated by spec 003 (auth) on each login |
| is_active | Boolean | NOT NULL, default true | Soft-delete flag |
| created_at | DateTime | NOT NULL, auto | Creation timestamp |
| updated_at | DateTime | NOT NULL, auto | Last update timestamp |
| created_by_id | UUID | FK → User (self), nullable | For audit (self-creation or platform admin) |
| updated_by_id | UUID | FK → User (self), nullable | |
| deleted_by_id | UUID | FK → User (self), nullable | Auto-injected on soft-delete (bridge in this spec; full extension in spec 005) |

**Indexes**: `@unique([email])`.

**Validation Rules**:
- email: valid email format (class-validator `@IsEmail`)
- password_hash: bcrypt hash (length 60 when hashed; validated at the auth
  layer, not stored as plain text)
- first_name/last_name: 1-50 chars if provided
- is_verified: boolean; default false; flipped to true only by the
  email-verification flow in spec 003
- failed_login_attempts: integer >= 0; default 0. The 5-attempt → lock
  policy is enforced in spec 003; this spec only persists the counter
- locked_until: nullable timestamp. When non-null, login is rejected;
  null means the account is not locked. Enforcement in spec 003
- last_login_at: nullable timestamp; updated on successful login (spec 003)

**Forward-Compatibility Note** (spec 003 / auth):
The four auth-seeding fields (`is_verified`, `failed_login_attempts`,
`locked_until`, `last_login_at`) are persisted here so spec 003 does not
need a separate schema migration. The *verification token / OTP* storage
for email verification is NOT a User column — it is a separate
`verification_token` (or `otp_token`) table created in spec 003, because
verification codes are ephemeral (TTL, attempts, regeneratable) and do not
belong on the permanent User entity. Similarly, the lockout policy
(threshold = 5 attempts, lock TTL) is spec 003 configuration, not a DB
constraint. The `is_platform_admin` flag fulfills the "superuser" role
(single level); a future two-tier superadmin split, if needed, would be a
spec 004 (RBAC) change — do NOT add a separate `is_superuser` column here.

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
| deleted_by_id | UUID | FK → User, nullable | Auto-injected on soft-delete (bridge in this spec; full extension in spec 005) |

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
| TenantUser | ✅ Yes | Yes | `USING/WITH CHECK (current_setting('app.is_platform_admin', true) = 'true' OR tenant_id = current_setting('app.tenant_id', true)::uuid)` |

**RLS Policy Explanation**: The policy includes a bypass for platform
superadmins via `current_setting('app.is_platform_admin', true) = 'true'`.
When the Prisma extension detects `TenantContext.isPlatformAdmin`, it sets
the session variable `app.is_platform_admin = 'true'` alongside
`app.tenant_id`. The `true` second argument to `current_setting()` is
`missing_ok` — if the variable is not set, it returns NULL (policy
denies bypass) instead of throwing an error. This allows platform admins
to perform cross-tenant support queries while RLS still blocks all other
users to their own tenant's data.

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

### Standard Audit Columns (applied to Plan, Tenant, User, TenantUser; reused by all future entities)

| Column | Type | Populated By |
|--------|------|--------------|
| created_at | DateTime | Prisma native (`@default(now())`) |
| updated_at | DateTime | Prisma native (`@updatedAt`) |
| created_by_id | UUID FK→User | Prisma extension reading TenantContext **— bridge in this spec; full extension in spec 005** |
| updated_by_id | UUID FK→User | Prisma extension reading TenantContext **— bridge in this spec; full extension in spec 005** |
| deleted_by_id | UUID FK→User | Prisma extension reading TenantContext **— bridge in this spec; full extension in spec 005** |

**Note**: `deleted_by_id` is included in all entities from this spec forward.
Constitution Principle IV mandates it for every soft-deleted entity (`is_active =
false`). The column exists in the schema from this migration; the Prisma
extension in spec 005 will make injection fully automatic for all audit columns.
In the interim, the tenancy Prisma extension populates it via context reads
when a soft-delete operation occurs.
