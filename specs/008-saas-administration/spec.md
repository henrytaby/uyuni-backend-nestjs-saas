# Feature Specification: SaaS Administration & Tenancy Management

**Feature Branch**: `008-saas-administration`

**Created**: 2026-07-07

**Status**: Ready

**Updated**: 2026-07-23 (Enterprise Architect Review — v2)

**Input**: User description: "Implement SaaS operator features — subscription management, plan upgrades/downgrades, payment state tracking, plan limit enforcement, user invitations, and tenant provisioning."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tenant Provisioning (Priority: P1)

A platform administrator provisions a new tenant: they select a Plan, enter
the company details (name, slug), and specify an initial admin user email.
The system creates the Tenant, assigns the Plan, creates the admin User (if
not existing) and their TenantUser membership with the Admin role, seeds
default RBAC roles, and seeds default catalog data for the new tenant. The
entire provisioning is atomic — if any step fails, the whole operation rolls
back.

**Why this priority**: Tenant provisioning is the onboarding flow. Without
it, no new customers can use the platform.

**Independent Test**: Provision a tenant with the "Free" Plan and an admin
email. Verify the Tenant, User, TenantUser (with Admin role), default
RBAC roles, and default catalogs are all created.

**Acceptance Scenarios**:

1. **Given** a platform admin and an available Plan, **When** they provision
   a new tenant with company details and admin email, **Then** the Tenant
   is created with the assigned Plan, paymentState 'ACTIVO', and the
   specified admin User has TenantUser membership with Admin role.
2. **Given** a provisioning request, **When** the admin email already exists
   as a User, **Then** the existing User is linked to the new Tenant rather
   than creating a duplicate.
3. **Given** a newly provisioned tenant, **When** the admin logs in,
   **Then** default catalogs (client_categories, lead_sources,
   payment_methods, task_statuses, service_types) and default RBAC roles
   (Admin, Empleado, Auditor) are available.
4. **Given** a provisioning request, **When** any step fails (e.g., catalog
   seeding), **Then** the entire operation rolls back — no partial tenant
   is created.
5. **Given** a provisioning request with a tenant slug that already exists,
   **Then** the system returns 409 Conflict.

---

### User Story 2 - Plan Limits & Feature Gating Enforcement (Priority: P1)

When a tenant user attempts an action that exceeds their Plan's limits (e.g.,
inviting a 6th user when max_users is 5) or accesses a module not included
in their Plan's moduleAccess JSON (e.g., Inventory module on the Free plan),
the system rejects the operation with a clear message indicating the limit
and suggesting a plan upgrade.

**Why this priority**: Plan enforcement is the revenue engine. Without it,
users can exceed limits and access premium features without paying.

**Independent Test**: Create a tenant with a Free Plan (max_users=3, no
inventory module). Add 3 users (succeeds). Attempt to add a 4th (rejected
with upgrade prompt). Attempt to access the inventory module (rejected with
upgrade prompt).

**Acceptance Scenarios**:

1. **Given** a tenant on a Plan with max_users=3, **When** the 4th user
   invitation is attempted, **Then** the system rejects with 403 and a
   message: "User limit reached (3/3). Upgrade to [Plan Name] for up to
   [N] users."
2. **Given** a tenant on a Plan without the inventory module gate, **When**
   a user attempts to access any inventory endpoint, **Then** the system
   returns 403 with message: "The Inventory module requires the [Plan Name]
   plan or higher."
3. **Given** a tenant on a Pro Plan with all features, **When** a user
   accesses any module, **Then** no feature gating restrictions apply.
4. **Given** a tenant with paymentState 'SUSPENDIDO', **When** any user
   attempts any action (except reading their own profile), **Then** the
   system returns 403 with message: "Account suspended. Contact support."
5. **Given** a tenant with paymentState 'MOROSO', **When** users continue
   to work, **Then** the system allows normal operation but displays a
   warning header in API responses indicating overdue payment.

---

### User Story 3 - Subscription Changes (Priority: P2)

A platform admin upgrades or downgrades a tenant's Plan. Upgrades take
effect immediately — all newly gated modules become accessible. Downgrades
restrict access to gated modules but NEVER delete existing data. Every plan
change is recorded as an immutable SubscriptionChange record for audit.

**Why this priority**: Subscription changes are ongoing operational needs.
Downgrade data preservation is critical for customer trust.

**Independent Test**: Upgrade from Free to Pro (immediate access to all
modules). Downgrade from Pro to Free (inventory data preserved but
inaccessible). Verify SubscriptionChange records exist for both operations.

**Acceptance Scenarios**:

1. **Given** a tenant on the Free plan, **When** the plan is upgraded to
   Pro, **Then** all Pro features are immediately accessible and a
   SubscriptionChange record is created.
2. **Given** a tenant on the Pro plan with inventory data, **When** the
   plan is downgraded to Free, **Then** inventory data is preserved but
   inaccessible; the inventory module returns 403 with upgrade prompt.
3. **Given** a plan change, **When** it completes, **Then** a
   SubscriptionChange record is created with previousPlanId, newPlanId,
   changeDate, initiatedById — this record is append-only.

---

### User Story 4 - User Invitations (Priority: P2)

A tenant admin can invite new users by email to join the tenant with a
specified role. The system generates a secure invitation token, records
the invitation, and (in the future) triggers an email. The invitee
accepts the invitation via a token-based endpoint. If the invitee already
has a User account, they are linked; otherwise, a new User is created.
Invitations expire after a configurable period.

**Why this priority**: User onboarding within a tenant is a core SaaS
workflow. Without invitations, the only way to add users is through the
platform admin, which doesn't scale.

**Independent Test**: Invite a user by email with Empleado role. Accept the
invitation via token. Verify TenantUser is created with the correct role.
Wait past expiry and verify acceptance fails.

**Acceptance Scenarios**:

1. **Given** a tenant admin, **When** they invite a user by email with a
   role, **Then** an Invitation record is created with status 'PENDING',
   a secure token, and an expiry date.
2. **Given** a pending invitation, **When** the invitee accepts via the
   token endpoint, **Then** a User (or existing User) and TenantUser
   membership with the assigned role are created. Invitation status
   changes to 'ACCEPTED'.
3. **Given** an expired invitation, **When** the invitee attempts to
   accept, **Then** the system returns 410 Gone with message: "This
   invitation has expired. Please request a new one."
4. **Given** a pending invitation for the same email in the same tenant,
   **When** the admin attempts to re-invite, **Then** the system returns
   409 Conflict indicating a pending invitation exists.
5. **Given** an invitation, **When** the admin wants to re-invite after
   expiry, **Then** the expired invitation is marked as 'EXPIRED' and a
   new one is created.

### Edge Cases

- Downgrade from Pro to Free when the tenant has 10 users but Free
  allows only 3 — existing users MUST NOT be removed, but new invitations
  MUST be blocked until the user count is within the Free plan limit.
- Plan upgrade/downgrade is initiated while the payment state is
  'MOROSO' — MUST be allowed but logged as a warning in the audit trail.
- Invitation to an email that already has a pending invitation for the same
  tenant — MUST return 409 Conflict indicating the pending invitation
  rather than creating a duplicate.
- Invitation expiry — invitations MUST expire after a configurable period
  (default: 7 days). Expired invitations can be replaced with new ones.
- Invitation acceptance for a user who already is a TenantUser of that
  tenant — MUST return 409 Conflict indicating the user is already a
  member.
- Payment state transitions: ACTIVO → MOROSO → SUSPENDIDO (forward only
  for automated transitions). SUSPENDIDO → ACTIVO and MOROSO → ACTIVO
  are allowed only via platform admin manual action.
- Platform admin provisions a tenant with an invalid Plan (deactivated) —
  MUST return validation error.
- Concurrent provisioning with the same tenant slug — MUST be prevented
  by the unique constraint; one succeeds, the other gets 409.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow platform admins to provision new tenants
  with a Plan, company details (name, slug), and an initial admin user
  email. Provisioning MUST be atomic (all-or-nothing transaction).
- **FR-002**: System MUST enforce Plan quantitative limits (maxUsers,
  storageLimit) before allowing operations that would exceed them.
- **FR-003**: System MUST enforce Plan qualitative gates (moduleAccess
  JSON) by rejecting access to modules not included in the tenant's Plan.
- **FR-004**: Plan limit violations MUST return 403 with a structured
  error response containing: limit type, current usage, plan limit,
  and suggested upgrade plan name.
- **FR-005**: Plan upgrades MUST take effect immediately. All modules in
  the new Plan's moduleAccess become accessible on the next request.
- **FR-006**: Plan downgrades MUST restrict access to gated modules but
  MUST NEVER delete existing data created under the higher plan.
- **FR-007**: System MUST track tenant paymentState (ACTIVO, MOROSO,
  SUSPENDIDO) as defined in the existing PaymentState enum. Payment state
  changes are triggered externally (billing system or platform admin).
- **FR-008**: System MUST allow tenant admins to invite users by email
  with a specified role. Invitations generate a secure random token.
- **FR-009**: Invitations MUST expire after a configurable period (default:
  7 days, configurable via environment variable).
- **FR-010**: Upon tenant provisioning, system MUST seed: (a) default
  RBAC RoleAssignment for admin user with Admin role, (b) default catalog
  data from 007-dynamic-catalogs seed list.
- **FR-011**: If an invited user's email already exists as a User, the
  system MUST link the existing User to the tenant rather than creating
  a duplicate.
- **FR-012**: Every plan change MUST create an immutable SubscriptionChange
  record with previousPlanId, newPlanId, changeDate, effectiveDate,
  initiatedById. These records are append-only.
- **FR-013**: When paymentState is 'SUSPENDIDO', the system MUST block
  all operations for that tenant except authentication and profile
  reading. The block MUST be enforced at the guard level.
- **FR-014**: When paymentState is 'MOROSO', the system MUST allow normal
  operation but include a warning header (`X-Payment-Warning: overdue`)
  in API responses.
- **FR-015**: Invitation acceptance MUST validate: (a) token exists and
  is not expired, (b) invitation status is 'PENDING', (c) invitee is
  not already a member of the tenant.
- **FR-016**: Plan CRUD endpoints MUST be restricted to platform admins
  only (isPlatformAdmin claim). Regular tenant admins cannot create or
  modify Plans.
- **FR-017**: Tenant provisioning and subscription management endpoints
  MUST require `tenancy:CREATE` and `tenancy:UPDATE` RBAC permissions
  respectively. Invitation management requires `tenancy:CREATE`.

### Non-Functional Requirements

- **NFR-001**: Tenant provisioning (including all seeding) MUST complete
  in < 5 seconds.
- **NFR-002**: Plan limit checks MUST add < 10ms latency per request
  (cached plan data per request lifecycle).
- **NFR-003**: Feature gate checks MUST be evaluated before business logic
  executes (guard-level enforcement, not service-level).

### Key Entities

- **Plan** (existing): Subscription tier definition. Attributes: name
  (unique), tierLevel (int), maxUsers, storageLimit, moduleAccess (JSON
  — map of module names to boolean), price (decimal), isActive, audit
  columns.
- **Tenant** (existing): Customer organization. Attributes: planId (FK),
  name, slug (unique), paymentState (ACTIVO/MOROSO/SUSPENDIDO),
  subscriptionStart, subscriptionEnd, isActive, audit columns.
- **Invitation** (new): User invite record. Attributes: email, tenantId
  (FK), roleId (FK), token (unique, secure random), status
  (PENDING/ACCEPTED/EXPIRED/CANCELLED), expiresAt, acceptedAt, createdById,
  isActive, audit columns.
- **SubscriptionChange** (new): Immutable plan change record. Attributes:
  tenantId (FK), previousPlanId (FK), newPlanId (FK), changeDate,
  effectiveDate, initiatedById (FK), reason (optional string). Append-only
  — no updates or deletes permitted.

### Payment State Transitions

```
ACTIVO ──→ MOROSO ──→ SUSPENDIDO
  ↑           ↑            │
  │           └────────────┘ (platform admin only)
  └────────────────────────┘ (platform admin only)
```

- **ACTIVO → MOROSO**: Triggered by external billing system (payment
  overdue).
- **MOROSO → SUSPENDIDO**: Triggered by external billing system (payment
  critically overdue, e.g., 30+ days).
- **SUSPENDIDO → ACTIVO**: Platform admin manual action only (payment
  resolved).
- **MOROSO → ACTIVO**: Platform admin manual action only (payment resolved).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new tenant can be provisioned and its admin can log in
  within 30 seconds of the provisioning request.
- **SC-002**: Plan limit enforcement is instantaneous — no request
  exceeding limits is ever processed, verified by automated tests.
- **SC-003**: Zero data loss on plan downgrade — all data created under a
  higher plan is preserved when downgraded, verified by automated tests.
- **SC-004**: An invited user can accept an invitation and access the
  tenant within 2 clicks from the invitation.
- **SC-005**: Every plan change has a corresponding SubscriptionChange
  record — verified by automated test.
- **SC-006**: A tenant with paymentState 'SUSPENDIDO' cannot perform any
  business operation — verified by automated test.

## Assumptions

- Payment state changes (ACTIVO → MOROSO → SUSPENDIDO) are triggered by
  an external billing system or manual platform admin action; this feature
  only stores and reads the state.
- Storage limits are enforced as a soft check (warning at 80%, hard block
  at 100%) rather than a hard limit, as measuring exact storage in
  real-time is complex.
- Plan pricing and billing are not handled by this feature — only the
  Plan entity limits and gates.
- The invitation acceptance flow involves a token-based endpoint. Email
  sending infrastructure is assumed to be available (or will be added
  as a separate concern). The invitation endpoint works independently
  of email delivery.
- Invitation tokens are cryptographically secure random strings (32+
  bytes, hex-encoded). They are NOT JWTs — they are opaque lookup tokens.
- Plan.moduleAccess is a JSON object mapping module names to booleans:
  `{ "crm": true, "agenda": true, "inventory": false }`. A missing key
  is treated as false (deny by default).
- Self-service tenant registration (sign-up) is NOT in scope for this
  feature. Only platform admin provisioning is covered. Self-service
  may be added as a future enhancement.
- The Plan model already exists in the schema with maxUsers, storageLimit,
  moduleAccess (JSON), and tierLevel fields.

## Dependencies

- **002-multi-tenancy-core**: Provides Tenant, TenantUser, Plan models
  and TenantContextService for tenant scoping.
- **003-authentication**: Provides JWT authentication, User model, and
  isPlatformAdmin claim for platform admin authorization.
- **004-rbac**: Provides Admin/Empleado/Auditor global roles for seeding
  during provisioning. Provides `tenancy:CREATE/UPDATE` permissions.
- **005-audit-infrastructure**: Provides audit column injection and CDC
  for tracking all provisioning and subscription changes.
- **007-dynamic-catalogs**: Provides catalog seeding service called during
  tenant provisioning to populate default catalogs.
