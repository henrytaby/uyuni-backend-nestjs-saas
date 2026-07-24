# Feature Specification: Multi-Tenancy Core

**Feature Branch**: `002-multi-tenancy-core`

**Created**: 2026-07-07

**Status**: Planned (Re-evaluated 2026-07-23 against constitution v1.3.0)

**Input**: User description: "Implement the multi-tenant data isolation foundation with Plan, Tenant, User, and TenantUser entities, request-scoped context, automatic tenant_id injection, PostgreSQL RLS, and TenantGuard protection."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Tenant-Scoped Data Isolation (Priority: P1)

A user belonging to Tenant A performs any data operation. The system
automatically scopes all queries and writes to Tenant A's data. It is
impossible for the user to see, modify, or delete data belonging to Tenant B,
even if they manipulate request parameters.

**Why this priority**: Multi-tenant isolation is the highest-risk security
requirement. Without it, the entire platform is unsafe for B2B use.

**Independent Test**: Create two tenants with sample data. As a user of
Tenant A, attempt to read/modify Tenant B data via any endpoint — all
attempts MUST fail. Automated anti-leakage tests MUST pass.

**Acceptance Scenarios**:

1. **Given** a user authenticated as member of Tenant A, **When** they
   perform any list/query operation, **Then** only records belonging to
   Tenant A are returned.
2. **Given** a user authenticated as member of Tenant A, **When** they
   attempt to create a record, **Then** the record is automatically
   associated with Tenant A regardless of any tenant_id field in the
   request body.
3. **Given** a user of Tenant A, **When** they attempt to access a
   resource by ID that belongs to Tenant B, **Then** the system returns
   404 (not 403, to avoid information leakage).

---

### User Story 2 - Tenant & Plan Management (Priority: P2)

A platform administrator creates a new Tenant with a subscription Plan. The
Plan defines quantitative limits (max users, storage) and qualitative gates
(module access). The Tenant tracks its payment state. New users can be
registered and associated with the Tenant as members with a role.

**Why this priority**: Without Plan and Tenant entities, there is no
subscription model and no way to organize users into companies.

**Independent Test**: Create a Plan, create a Tenant under that Plan,
register a User, create a TenantUser membership. Verify all entities are
related correctly and Plan limits are stored.

**Acceptance Scenarios**:

1. **Given** a platform admin, **When** they create a Plan with defined
   limits and module gates, **Then** the Plan is persisted and available
   for assignment to Tenants.
2. **Given** a platform admin, **When** they create a Tenant with a
   Plan, **Then** the Tenant is persisted with payment state "activo" and
   the Plan's limits are inherited.
3. **Given** a registered User and an existing Tenant, **When** the User
   is added as a TenantUser with a role, **Then** the membership is
   created (the full authentication flow into that Tenant context is
   implemented in spec 003).

---

### User Story 3 - Request Context Propagation (Priority: P3)

When an authenticated request enters the system, the tenant_id and user_id
are extracted from the authentication token and stored in a request-scoped
context. Every layer of the application (Controllers, Services, Repositories,
Prisma extensions) can access these values without manual parameter passing.
PostgreSQL Row-Level Security reinforces the isolation as a secondary
defense.

**Why this priority**: Context propagation is the architectural mechanism
that makes automatic isolation possible. Without it, developers would have
to manually thread tenant_id through every function call.

**Independent Test**: Make an authenticated request, verify that logs
contain the correct tenant_id and user_id, verify that a Prisma write
automatically includes the tenant_id without explicit code.

**Acceptance Scenarios**:

1. **Given** an authenticated request with a valid JWT containing
   tenant_id and user_id, **When** the request enters the system,
   **Then** these values are available in the request context for the
   entire request lifecycle.
2. **Given** an authenticated request, **When** any database write is
   performed, **Then** the tenant_id from the request context is
   automatically injected into the record.
3. **Given** PostgreSQL RLS is enabled on a tenant-scoped table, **When**
   a query is executed with a tenant_id, **Then** RLS enforces that
   only rows matching that tenant_id are accessible.

### Edge Cases

- A user belonging to multiple tenants switches context — the system MUST
  update the request context to reflect the new active tenant. The active
  tenant is determined by the `tenant_id` claim in the JWT (set at
  authentication / token-rotation time in spec 003). A user with multiple
  memberships obtains a tenant-scoped token per active tenant; switching
  requires re-authentication or token refresh with the target tenant_id.
- A request arrives without a tenant_id (e.g., public endpoint or
  pre-authentication) — the system MUST allow unauthenticated paths while
  still requiring TenantGuard on protected endpoints.
- A Plan is deleted or deactivated while Tenants are subscribed — Tenants
  MUST NOT lose their data; the Plan change MUST be handled gracefully.
- Two concurrent requests from the same user in different tenant contexts
  MUST NOT leak data between contexts (AsyncLocalStorage isolation).
- A user's `TenantUser` membership is deactivated (offboarding) while they
  hold a valid JWT — subsequent requests from that user for that tenant MUST
  fail within the bounded revocation window (constitution v1.3.0). The
  system MUST NOT rely solely on JWT expiry; a membership existence check
  is required at guard time.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST maintain a Plan entity with quantitative limits
  (max users, storage) and qualitative module-access gates.
- **FR-002**: System MUST maintain a Tenant entity linked to a Plan, with
  payment state tracking (ACTIVO, MOROSO, SUSPENDIDO).
- **FR-003**: System MUST maintain a User entity with global email-based
  identity.
- **FR-004**: System MUST maintain a TenantUser membership entity linking
  a User to a Tenant with an assigned role.
- **FR-005**: System MUST propagate tenant_id and user_id in a
  request-scoped context (AsyncLocalStorage) available to all layers. This context MUST be populated exclusively post-authentication from a cryptographically verified source (e.g. Passport `req.user`), never from raw JWT decoding or unverified headers.
- **FR-006**: System MUST automatically inject tenant_id into all
  database queries and writes via a Prisma extension, with no manual
  filtering in Controllers or Services. The extension MUST be fail-closed (throw UnauthorizedException if context is missing).
- **FR-007**: System MUST enforce PostgreSQL Row-Level Security on all
  tenant-scoped tables as a secondary isolation layer.
- **FR-008**: System MUST protect every domain endpoint with a TenantGuard
  that validates tenant context before allowing the request.
- **FR-009**: System MUST prevent cross-tenant data access by design;
  automated anti-leakage tests MUST verify this invariant.
- **FR-010**: System MUST return 404 (not 403) when a user attempts to
  access a resource belonging to another tenant, to avoid information
  leakage.
- **FR-011**: System MUST allow a user to belong to multiple tenants via
  separate TenantUser memberships.
- **FR-012** _(constitution v1.3.0)_ : `TenantGuard` MUST verify that the
  authenticated user holds an **active `TenantUser` membership** in the
  asserted `tenant_id`. A JWT signed while the user held a membership is
  NOT sufficient after that membership is revoked or deactivated. Platform
  superadmins bypass this check. The verification MUST be cacheable to
  avoid a DB hit on every request, with cache invalidation on membership
  mutation.
- **FR-013** _(constitution v1.3.0)_ : Membership revocation MUST take
  effect within a bounded window — satisfied by either short-lived access
  tokens with refresh-token rotation revalidating membership, OR a
  membership denylist checked in `TenantGuard`. The maximum revocation
  window equals the access-token TTL.
- **FR-014** _(constitution v1.3.0)_ : `TenantUsersService.create` MUST
  reject a new membership if the target Tenant's `Plan.maxUsers` limit
  would be exceeded, returning 403 with a clear upgrade prompt. The
  count-check and the create MUST be atomic (same transaction).
- **FR-015** _(constitution v1.3.0)_ : Mutating endpoints that create
  durable resources (`POST /tenancy/tenants`, `POST /tenancy/tenant-users`)
  SHOULD support an `Idempotency-Key` header to safely retry
  network-failed requests without side-effect duplication.

### Key Entities

- **Plan**: Subscription tier definition. Attributes: name, quantitative
  limits (max users, storage), qualitative module-access gates, pricing.
- **Tenant**: Company account. Attributes: company name, linked Plan,
  payment state (activo/moroso/suspendido), creation date.
- **User**: Global person. Attributes: email (unique), name, password hash,
  is_active flag.
- **TenantUser**: Membership. Attributes: linked User, linked Tenant,
  assigned role, is_active flag.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user of Tenant A can never access any data belonging to
  Tenant B under any circumstance — verified by automated anti-leakage
  test suite.
- **SC-002**: 100% of domain endpoints are protected by TenantGuard —
  verified by an automated e2e test that introspects the NestJS
  `HttpAdapterHost` to enumerate all registered routes and asserts each
  (except those decorated with `@Public()`) has TenantGuard in its guard
  pipeline.
- **SC-003**: A developer adding a new database write operation does not
  need to manually specify tenant_id — the system injects it
  automatically.
- **SC-004**: `AsyncLocalStorage` `run()` overhead adds < 1ms per request (benchmarked in `tenancy-anti-leakage.e2e-spec.ts`). Note: the per-operation `$transaction` + `SET LOCAL` cost (≈3 round-trips) is the subject of a separate production-latency benchmark; see `research.md` Task 3 for the trade-off and constitution-amendment path.
- **SC-005** _(constitution v1.3.0)_ : A user whose `TenantUser` membership
  is deactivated (offboarded) CANNOT perform any tenant-scoped operation
  within the bounded revocation window — verified by an e2e test that
  deactivates a membership mid-session and asserts subsequent requests
  fail within the access-token TTL (or immediately if a denylist is used).
- **SC-006** _(constitution v1.3.0)_ : Creating a `TenantUser` membership
  that would exceed `Plan.maxUsers` returns 403 with an upgrade prompt —
  verified by an e2e test seeding a plan with `maxUsers=1`, creating one
  membership, then attempting a second.

## Assumptions

- RLS policies use a session variable set per-query inside an interactive
  Prisma `$transaction`; `SET LOCAL` is transaction-scoped and safe for
  connection-pooling architectures with Prisma (see research.md Task 3 for
  why `$transaction` is mandatory, not optional).
- Plan module-access gates are a predefined list matching the domain
  modules in the constitution (crm, agenda, sales, inventory).
- The initial set of roles for TenantUser is: Admin, Empleado, Auditor.
  The role string is normalized into a formal enum in spec 004 (RBAC);
  no additional roles are introduced in this spec.
- Payment state transitions (activo → moroso → suspendido) are managed
  externally; this feature only stores and reads the state.
