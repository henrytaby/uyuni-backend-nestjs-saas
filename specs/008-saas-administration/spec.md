# Feature Specification: SaaS Administration & Tenancy Management

**Feature Branch**: `008-saas-administration`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Implement SaaS operator features — subscription management, plan upgrades/downgrades, payment state tracking, plan limit enforcement, user invitations, and tenant provisioning."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tenant Provisioning (Priority: P1)

A platform administrator provisions a new tenant: they select a Plan, enter
the company details, and specify an initial admin user. The system creates
the Tenant, assigns the Plan, creates the admin User (if not existing) and
their TenantUser membership with the Admin role, and seeds any default
catalog data for the new tenant.

**Why this priority**: Tenant provisioning is the onboarding flow. Without
it, no new customers can use the platform.

**Independent Test**: Provision a tenant with the "Free" Plan and an admin
email. Verify the Tenant, User, TenantUser, and default catalogs are created.

**Acceptance Scenarios**:

1. **Given** a platform admin and an available Plan, **When** they provision
   a new tenant with company details and admin email, **Then** the Tenant
   is created with the assigned Plan, payment state "activo", and the
   specified admin User has TenantUser membership with Admin role.
2. **Given** a provisioning request, **When** the admin email already exists
   as a User, **Then** the existing User is linked to the new Tenant rather
   than creating a duplicate.
3. **Given** a newly provisioned tenant, **When** the admin logs in,
   **Then** default catalogs (client categories, lead sources, etc.) are
   available.

---

### User Story 2 - Plan Limits & Feature Gating Enforcement (Priority: P2)

When a tenant user attempts an action that exceeds their Plan's limits (e.g.,
inviting a 6th user when max_users is 5) or accesses a module not included
in their Plan (e.g., Inventory module on the Free plan), the system rejects
the operation with a clear message indicating the limit and suggesting a plan
upgrade.

**Why this priority**: Plan enforcement is the revenue engine. Without it,
users can exceed limits and access premium features without paying.

**Independent Test**: Create a tenant with a Free Plan (max_users=3, no
inventory module). Add 3 users (succeeds). Attempt to add a 4th (rejected
with upgrade prompt). Attempt to access the inventory module (rejected with
upgrade prompt).

**Acceptance Scenarios**:

1. **Given** a tenant on a Plan with max_users=3, **When** the 4th user
   invitation is attempted, **Then** the system rejects the request with a
   403 error and a message indicating the user limit and available upgrade
   plans.
2. **Given** a tenant on a Plan without the inventory module gate, **When**
   a user attempts to access any inventory endpoint, **Then** the system
   returns 403 with a message indicating the feature requires a higher
   plan.
3. **Given** a tenant on a Pro Plan with all features, **When** a user
   accesses any module, **Then** no feature gating restrictions apply.

---

### User Story 3 - Subscription Changes & User Invitations (Priority: P3)

A platform admin or tenant admin upgrades or downgrades a tenant's Plan.
Upgrades take effect immediately. Downgrades restrict access to gated modules
but never delete existing data. A tenant admin can invite new users by email
to join the tenant with a specified role. The invitee receives an invitation
and is added as a TenantUser upon acceptance.

**Why this priority**: Subscription changes and user invitations are ongoing
operational needs. Downgrade data preservation is critical for trust.

**Independent Test**: Upgrade from Free to Pro (immediate access to all
modules). Downgrade from Pro to Free (inventory data preserved but
inaccessible). Invite a user, accept the invitation, verify membership.

**Acceptance Scenarios**:

1. **Given** a tenant on the Free plan, **When** the plan is upgraded to
   Pro, **Then** all Pro features are immediately accessible.
2. **Given** a tenant on the Pro plan with inventory data, **When** the
   plan is downgraded to Free, **Then** inventory data is preserved but
   inaccessible; the inventory module returns 403 with upgrade prompt.
3. **Given** a tenant admin, **When** they invite a user by email with a
   role, **Then** the invitee can accept the invitation and becomes a
   TenantUser with the assigned role.

### Edge Cases

- Downgrade from Pro to Free when the tenant has 10 users but Free
  allows only 3 — existing users MUST NOT be removed, but new invitations
  MUST be blocked until the user count is within the Free plan limit.
- Plan upgrade/downgrade is initiated while the payment state is
  "moroso" — MUST be allowed but the effective date may be deferred based
  on billing cycle.
- Invitation to an email that already has a pending invitation for the same
  tenant — MUST return a clear message indicating the pending invitation
  rather than creating a duplicate.
- Invitation expiry — invitations MUST expire after a configurable period
  (default: 7 days).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow platform admins to provision new tenants
  with a Plan, company details, and an initial admin user.
- **FR-002**: System MUST enforce Plan quantitative limits (max_users,
  storage) before allowing operations that would exceed them.
- **FR-003**: System MUST enforce Plan qualitative gates (module access)
  by rejecting access to modules not included in the tenant's Plan.
- **FR-004**: Plan limit violations MUST return 403 with a clear message
  indicating the limit exceeded and suggesting plan upgrade.
- **FR-005**: Plan upgrades MUST take effect immediately.
- **FR-006**: Plan downgrades MUST restrict access to gated modules but
  MUST NEVER delete existing data.
- **FR-007**: System MUST track tenant payment state (activo, moroso,
  suspendido) and make it available for feature gating.
- **FR-008**: System MUST allow tenant admins to invite users by email
  with a specified role.
- **FR-009**: Invitations MUST expire after a configurable period.
- **FR-010**: Upon tenant provisioning, system MUST seed default catalog
  data for the new tenant.
- **FR-011**: If an invited user already exists, the system MUST link the
  existing User to the tenant rather than creating a duplicate.

### Key Entities

- **Invitation**: User invite record. Attributes: email, linked Tenant,
  assigned role, status (pending/accepted/expired), expires_at, created_at.
- **SubscriptionChange**: Record of plan change. Attributes: linked
  Tenant, previous Plan, new Plan, change date, effective date, initiated
  by (user).

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

## Assumptions

- Payment state changes (activo → moroso → suspendido) are triggered by
  an external billing system or manual admin action; this feature only
  stores and reads the state.
- Storage limits are enforced as a soft check (warning at 80%, hard block
  at 100%) rather than a hard limit, as measuring exact storage in
  real-time is complex.
- Plan pricing and billing are not handled by this feature — only the
  Plan entity limits and gates.
- The invitation acceptance flow involves an email with a link; email
  sending infrastructure is assumed to be available.
