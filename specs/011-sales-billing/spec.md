# Feature Specification: Sales & Billing

**Feature Branch**: `011-sales-billing`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Implement sales and billing with quotation creation, invoice/receipt issuance, payment tracking, and basic petty cash (income/expense) recording."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quotation Management (Priority: P1)

A sales team member creates a quotation for a client. The quotation contains
line items (product/service description, quantity, unit price), subtotal,
tax, and total. The quotation has a validity period and a status flow:
Draft → Sent → Accepted / Rejected / Expired. An accepted quotation can be
converted into an invoice.

**Why this priority**: Quotations are the beginning of the sales process.
Without them, there is no formalized offer-to-invoice flow.

**Independent Test**: Create a quotation with line items, send it to a
client, accept it, and convert it to an invoice. Verify the invoice inherits
the quotation's line items and totals.

**Acceptance Scenarios**:

1. **Given** a sales team member and an existing client, **When** they
   create a quotation with line items, validity period, and client, **Then**
   the quotation is stored with status "Draft" and calculated totals.
2. **Given** a draft quotation, **When** the member changes the status to
   "Sent," **Then** the quotation is marked as sent and the validity period
   starts tracking.
3. **Given** an accepted quotation, **When** the member converts it to an
   invoice, **Then** an invoice is created with the same line items, client,
   and totals, and the quotation is linked to the invoice.

---

### User Story 2 - Invoice & Payment Tracking (Priority: P2)

A team member issues an invoice (either from an accepted quotation or
standalone). The invoice tracks payment status: Pending, Partial, Paid.
Partial payments are recorded with amount and date. The invoice shows the
remaining balance. A payment receipt can be generated when the invoice is
fully or partially paid.

**Why this priority**: Invoicing and payment tracking are essential for
cash flow management — the core of business operations.

**Independent Test**: Create an invoice, record a partial payment, verify
the remaining balance, record the final payment, verify the invoice status
changes to "Paid."

**Acceptance Scenarios**:

1. **Given** a team member, **When** they issue an invoice with line items
   and client, **Then** the invoice is created with status "Pending" and
   calculated totals.
2. **Given** a pending invoice with a total of $1000, **When** a partial
   payment of $400 is recorded, **Then** the invoice status changes to
   "Partial" and the remaining balance is $600.
3. **Given** a partially paid invoice, **When** the remaining balance is
   paid, **Then** the invoice status changes to "Paid."

---

### User Story 3 - Petty Cash (Income/Expense Recording) (Priority: P3)

A team member records day-to-day income and expenses (petty cash). Each
entry has an amount, type (income/expense), category (from dynamic catalogs),
date, and description. A simple cash flow summary shows total income, total
expenses, and the running balance for a given period.

**Why this priority**: Petty cash tracking is the simplest form of financial
control — essential for small businesses that need visibility into daily cash
flow.

**Independent Test**: Record an income of $500 and an expense of $200. View
the cash flow summary and verify the net balance is $300.

**Acceptance Scenarios**:

1. **Given** a team member, **When** they record an income entry with
   amount, category, date, and description, **Then** the entry is stored
   and appears in the cash flow list.
2. **Given** a team member, **When** they record an expense entry, **Then**
   the entry is stored with type "expense" and reduces the running balance.
3. **Given** multiple income and expense entries in a period, **When** the
   member views the cash flow summary, **Then** total income, total
   expenses, and net balance are displayed for the selected period.

### Edge Cases

- Quotation expires after validity period — system SHOULD auto-update status
  to "Expired" or flag it for manual review.
- Invoice amount is zero (pro-bono or complimentary) — MUST be allowed.
- Partial payment exceeds the remaining balance — MUST be rejected with a
  validation error.
- Currency handling — all amounts are in a single currency per tenant.
  Multi-currency is out of scope for this iteration.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow creating, updating, and listing quotations
  with line items (description, quantity, unit price), client reference,
  validity period, and status.
- **FR-002**: Quotation statuses MUST include: Draft, Sent, Accepted,
  Rejected, Expired.
- **FR-003**: System MUST calculate quotation totals (subtotal, tax, total)
  from line items automatically.
- **FR-004**: System MUST allow converting an accepted quotation into an
  invoice with inherited line items and totals.
- **FR-005**: System MUST allow creating standalone invoices (not from a
  quotation) with line items, client reference, and payment status.
- **FR-006**: Invoice payment statuses MUST include: Pending, Partial, Paid.
- **FR-007**: System MUST allow recording partial payments against an
  invoice with amount, date, and payment method.
- **FR-008**: System MUST calculate and display the remaining balance on
  partially paid invoices.
- **FR-009**: System MUST allow recording income and expense entries with
  amount, type, category (catalog), date, and description.
- **FR-010**: System MUST provide a cash flow summary for a given period
  showing total income, total expenses, and net balance.
- **FR-011**: All amounts MUST include a currency indicator. Single
  currency per tenant in this iteration.
- **FR-012**: All sales data MUST be tenant-scoped with RBAC enforcement
  (sales:CREATE, sales:READ, sales:UPDATE, sales:DELETE).

### Key Entities

- **Quotation**: Sales offer. Attributes: reference number, client, line
  items, subtotal, tax, total, validity start/end, status.
- **QuotationLineItem**: Line detail. Attributes: description, quantity,
  unit price, line total, linked Quotation.
- **Invoice**: Billing document. Attributes: reference number, client,
  line items, subtotal, tax, total, payment status, linked Quotation
  (optional).
- **Payment**: Payment record. Attributes: amount, date, payment method,
  linked Invoice.
- **CashEntry**: Income/expense record. Attributes: amount, type
  (income/expense), category (catalog), date, description.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A sales team member can create a quotation with 5 line items
  in under 1 minute.
- **SC-002**: Quotation-to-invoice conversion completes in under 3 seconds
  with all line items and totals accurately transferred.
- **SC-003**: Payment tracking maintains an accurate remaining balance —
  verified by automated tests with multiple partial payments.
- **SC-004**: Cash flow summary for a month with 100+ entries loads in
  under 2 seconds.

## Assumptions

- Tax rate is a configurable percentage applied uniformly to the subtotal.
  Line-item-level tax rates are out of scope for this iteration.
- Reference numbers (quotation #, invoice #) are auto-generated with a
  tenant-specific prefix and sequential numbering.
- Payment methods are a fixed enum (Cash, Bank Transfer, Card, Other).
  Additional methods can be added via catalogs in a future iteration.
- Currency is set at the tenant level during provisioning. Default: USD.
  Multi-currency support is a future enhancement.
- Income/expense categories come from the "Income Categories" and "Expense
  Categories" dynamic catalogs.
