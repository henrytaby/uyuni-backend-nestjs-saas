# Research: Multi-Tenancy Core

**Feature**: 002-multi-tenancy-core
**Date**: 2026-07-07

## Research Tasks

### 1. AsyncLocalStorage Request Context Pattern in NestJS

**Decision**: Use Node's `AsyncLocalStorage` (not NestJS's request-scoped
providers) to carry `TenantContext { tenantId, userId, isPlatformAdmin }`.
A **global middleware** populates the store at request entry by reading the
decoded JWT (or platform-admin flag); the store is disposed at request
completion via `als.run()`.

**Rationale**: NestJS request-scoped providers (DI scope `Scope.REQUEST`)
incur a performance penalty and require `request` injection in every
provider that needs context. `AsyncLocalStorage` is the Node-native,
performant mechanism that propagates context across async boundaries
(Promise chains, callbacks) without DI changes. Constitution Principle I
mandates "AsyncLocalStorage" explicitly. A single middleware populates the
store; any layer accesses it via a `TenantContextService` wrapper
(`getStore()`).

**Why middleware, not interceptor**: In the NestJS request lifecycle,
middleware executes BEFORE guards. Interceptors execute AFTER guards. If
the context were populated by an interceptor, the TenantGuard (global)
would read an empty store and reject every request with 401. A middleware
guarantees the context is available for all guards, pipes, interceptors,
and controllers downstream. This is the same pattern used by APM tools
(Datadog, New Relic) and distributed tracing frameworks in NestJS.

**Anti-spoofing safeguard**: The middleware MUST derive `tenantId` and
`userId` exclusively from the **decoded JWT payload** — never from HTTP
headers (e.g., `x-tenant-id`), query parameters, or request body fields.
Accepting tenant identity from client-controlled input would allow any
authenticated user to impersonate another tenant (CWE-290: Authentication
Bypass by Spoofing). During development/testing before spec 003 ships,
test fixtures inject context programmatically via the NestJS testing
module (not via HTTP headers).

**Alternatives considered**:
- *NestJS request-scoped providers (`Scope.REQUEST`)*: Rejected — heavy DI
  rebuild on each request; the constitution explicitly names AsyncLocalStorage.
- *Pass context through function parameters*: Rejected — the constitution
  forbids "manual parameter passing"; too easy to forget.
- *cls-hooked / continuation-local-storage*: Deprecated; `AsyncLocalStorage`
  is the stable, built-in replacement in Node 16+.
- *Global interceptor for context population*: Rejected — interceptors
  execute after guards, so TenantGuard would read an empty store on every
  request. The middleware→guard order is critical.

### 2. Prisma Client Extension for Automatic tenant_id Injection

**Decision**: Use the Prisma 7 Client Extensions API (`Prisma.defineExtension`,
exposed via `$extends`) to override `create`, `createMany`, `update`,
`updateMany`, `upsert`, `delete`, `deleteMany`, `findMany`, `findUnique`,
`findFirst`, and `count` on tenant-scoped models. The extension reads
`tenantId`/`userId` from `TenantContextService` and:
- calls/writes → injects `tenant_id` into the data AND `created_by_id`/
  `updated_by_id`/`deleted_by_id` (this tenancy spec populates them via
  context reads as a bridge; the full audit-extension in spec 005 reuses
  the same mechanism).
- reads → adds `WHERE tenant_id = <ctx.tenantId>` (unless
  `ctx.isPlatformAdmin`).
- For **all operations** on tenant-scoped models, the extension wraps the
  query inside a Prisma interactive transaction (`$transaction`) that first
  executes `SET LOCAL app.tenant_id = '<ctx.tenantId>'` and, when
  `ctx.isPlatformAdmin` is true, also `SET LOCAL app.is_platform_admin =
  'true'`. This guarantees that the `SET LOCAL` and the query share the
  same physical database connection, which is required for PostgreSQL RLS
  to function correctly under connection pooling (see Task 3).
- If the caller is already inside a `$transaction`, the extension detects
  this and issues only the `SET LOCAL` statements on the existing
  transaction client, avoiding a nested transaction.

**Rationale**: Prisma Client Extensions (stable since 6.x, confirmed surface
in 7.8.0 via `Prisma.defineExtension` + `$extends`) are the supported way to
intercept client operations without raw SQL. They wrap every query globally,
so no Controller/Service forgets to filter. Platform admin bypass is a flagged
branch in the extension that also sets the RLS bypass variable
(`app.is_platform_admin`) so the database policy permits cross-tenant reads.
This is the constitutional guarantee that no manual tenant filtering is needed.

**Alternatives considered**:
- *Prisma middleware (`$use`)*: Removed in Prisma 5+ (and not reintroduced in
  7.x); extensions are the supported replacement.
- *Manual repository methods per service*: Rejected — creates N points of
  failure where a developer forgets the filter; violates "by design, not
  by convention."
- *PostgreSQL RLS as the only mechanism*: RLS protects data but doesn't
  populate new records with `tenant_id`; an extension is still needed for
  writes. RLS is the *secondary* layer (see next task).

### 3. PostgreSQL Row-Level Security (RLS) as Secondary Defense

**Decision**: Enable RLS on every tenant-scoped table via Prisma migrations
with raw SQL `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Session variables
`app.tenant_id` and `app.is_platform_admin` are set per-query via Prisma's
`$executeRaw` `SET LOCAL` inside an **interactive transaction** so RLS
policies read `current_setting('app.tenant_id')` and
`current_setting('app.is_platform_admin')`. The policy enforces:
- `USING (current_setting('app.is_platform_admin', true) = 'true' OR tenant_id = current_setting('app.tenant_id', true)::uuid)` on SELECT.
- `WITH CHECK (current_setting('app.is_platform_admin', true) = 'true' OR tenant_id = current_setting('app.tenant_id', true)::uuid)` on INSERT/UPDATE.

**Why `$transaction` is mandatory**: Prisma manages an internal connection
pool. If `SET LOCAL` and the subsequent query are executed as separate
Prisma calls (e.g., `$executeRaw` followed by `findMany`), Prisma may
route them to different physical connections from the pool. Since `SET
LOCAL` is scoped to the current transaction, the session variable would
be absent on the second connection, and RLS would either block the query
or return unfiltered rows. The ONLY way to guarantee both statements share
the same physical connection is to wrap them inside a Prisma interactive
transaction (`$transaction(async (tx) => { ... })`). The Prisma extension
must therefore:
1. Detect whether the caller is already inside a `$transaction` (in which
   case it only issues the `SET LOCAL` on the existing transaction client).
2. If not inside a transaction, wrap the operation in
   `$transaction(async (tx) => { await tx.$executeRaw`SET LOCAL ...`; return tx.model.findMany(...); })`.
3. The `SET LOCAL` is scoped to the transaction — it resets automatically
   on `COMMIT`/`ROLLBACK`, making it safe for connection pooling.

**Rationale**: Constitution Principle I mandates RLS as "a secondary
defense layer." Even if the Prisma extension has a bug, RLS blocks the
leak at the database. The `$transaction` requirement is not optional —
without it, RLS is silently bypassed under connection pooling, which is
worse than having no RLS at all (it creates a false sense of security).
The `current_setting(..., true)` form (with `missing_ok = true`) returns
`NULL` instead of throwing when the variable is unset, causing the policy
to fail gracefully (no bypass = filter by tenant_id normally). The
`app.is_platform_admin` condition allows platform superadmins to bypass
RLS for cross-tenant support queries; the extension sets this variable
when `TenantContext.isPlatformAdmin` is true.

**Alternatives considered**:
- *RLS only on SELECT (no WITH CHECK)*: Rejected — allows inserting rows
  with the wrong tenant_id at the DB level if the app bypasses the
  extension. WITH CHECK makes the DB refuse wrong-tenant writes too.
- *Session-level `SET` (not `SET LOCAL`)*: Rejected — leaks across
  connections from a pool; `SET LOCAL` is transaction-scoped and safe.
- *No RLS, app-only*: Rejected — violates the constitution; defense in
  depth is the whole point.
- *Sequential `$executeRaw` + query without `$transaction`*: Rejected —
  Prisma's connection pool may route the two statements to different
  connections, silently breaking RLS. The interactive transaction is the
  only mechanism that guarantees same-connection execution.

**Performance note**: Wrapping every tenant-scoped read in `$transaction`
adds ~3 additional round-trips per query (BEGIN + SET LOCAL + COMMIT).
On a local PostgreSQL instance (~0.1ms per round-trip), this is ~0.3ms
overhead — within the SC-004 target of < 1ms. If production profiling
later shows this is a bottleneck at scale, a future optimization could
skip `$transaction` for reads and rely solely on the Prisma extension's
`WHERE tenant_id` filter (primary defense), restricting `$transaction`
to writes only (where RLS WITH CHECK enforces the secondary defense).
This would require a constitution amendment (Principle I mandates RLS as
"a secondary defense layer" for ALL operations) and is NOT in scope for
this spec. The current design prioritizes security (dual-layer for reads
+ writes) over marginal performance gains.

### 4. TenantGuard: Where to Enforce and What to Reject

**Decision**: Implement `TenantGuard` as a global guard registered in
`AppModule`. It reads `TenantContextService.getTenantId()`. If null and
the request hits a protected route, it rejects with 401 (not 403) — no
tenant context means not authenticated into a tenant. Public routes (health,
login, swagger) are allowlisted via a metadata decorator `@Public()`.

The guard relies on the context being pre-populated by the global
middleware (see Task 1). Since middleware executes before guards in the
NestJS lifecycle, the store is guaranteed to contain the tenant/user
context by the time the guard evaluates it.

**Rationale**: Constitution Principle I requires "a TenantGuard protecting
every domain endpoint." Making it global (rather than per-controller)
guarantees every endpoint is covered by default — a new module's
controller is protected without an explicit decorator. This is the
"provable" property the anti-leakage tests check (FR-010 / SC-001 of
the constitution).

**Alternatives considered**:
- *Per-controller `@UseGuards(TenantGuard)`*: Rejected — easy to forget on a
  new controller; breaks "by default protected."
- *Middleware to populate tenant context, guard to check*: The middleware
  populates context (runs first); the guard enforces presence (runs second).
  Splitting is idiomatic NestJS and respects the execution lifecycle.
- *Reject with 403 instead of 401*: 403 implies authenticated-but-forbidden;
  401 (or a custom "tenant required" status) is more accurate — there is no
  tenant membership to authorize against.

### 5. Cross-Tenant Access Returns 404, Not 403

**Decision**: When a user accesses a resource by ID belonging to another
tenant, the Prisma extension's `WHERE tenant_id = <ctx.tenantId>` makes
the row invisible; `findUnique` returns `null`, and the controller throws
`NotFoundException` → 404. No code path reveals that the row exists
elsewhere.

**Rationale**: Constitution Principle I mandates "404 (not 403) ...
to avoid information leakage." Returning 403 confirms the resource exists
to a probing attacker. 404 is indistinguishable from "doesn't exist." The
auto-filtering extension produces this naturally — the controller never
sees the row, so it can't conditionally 403.

**Alternatives considered**:
- *Check existence first, then 403*: Rejected — leaks existence.
- *Global 403 for wrong-tenant IDs*: Requires querying before the filter,
  defeating the purpose.

### 6. Plan, Tenant, User, TenantUser Schema Design

**Decision**: 4 entities with the fields from the spec. TenantUser is the
join with `role` (string for now; formalized in spec 004). User has
`is_platform_admin` (boolean) for the platform superadmin bypass. Plan has
`module_access` (JSON array of module names — qualitative gates) and
`max_users`/`storage_limit` (quantitative). Composite unique indexes:
`(email)` on User (global), `(tenant_id, user_id)` on TenantUser, `(slug)`
on Tenant. All tables get `is_active` + audit columns + RLS (except Plan,
which is platform-global, not tenant-scoped — so no RLS on Plan).

**Rationale**: TenantUser as a separate join satisfies "a user belongs to
multiple tenants via separate memberships." Plan being platform-global
(no tenant_id, no RLS) matches "Plans are global definitions." The
module_access JSON is simple and matches the constitution's "qualitative
gates"; a normalized join table is over-engineering for a small fixed
module list.

**Alternatives considered**:
- *role as a normalized Role table here*: Rejected — RBAC is a whole
  feature (spec 004); seeding a string role column here avoids premature
  normalization and is migrated cleanly later.
- *module_access as a join table*: Rejected — over-normalized for ~7
  module names; JSON array is queryable in PostgreSQL.

### 7. Anti-Leakage Test Strategy

**Decision**: An e2e suite `tenancy-anti-leakage.e2e-spec.ts` using
Testcontainers (real PostgreSQL). It seeds Tenant A + Tenant B with sample
tenant-scoped records, authenticates as Tenant A's user, and asserts:
- list endpoints return only Tenant A rows;
- direct access to Tenant B's record by ID returns 404;
- a request with a manually-set `tenant_id` body field is ignored (the
  extension overrides it).
The suite runs in CI as a non-negotiable gate (constitution: "anti-leakage
CI gate is non-negotiable").

**Rationale**: Constitution Principles I + Testing section require these
tests to prove isolation "mathematically." Real-DB tests (not mocked
Prisma) validate RLS too — a mock would hide a missing RLS policy.
Making it a CI gate means a regression that breaks isolation fails the
build, never reaching production.

**Alternatives considered**:
- *Unit tests with mocked Prisma*: Rejected — mocks the very layer
  (Prisma extension + RLS) under test.
- *Manual checklist*: Rejected — not provable or repeatable.
