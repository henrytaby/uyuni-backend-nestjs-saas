# Requirements Checklist: Sales & Billing (011)

## Data Layer (TypeORM)
- [ ] Entities defined: `Quotation`, `Invoice`, `InvoiceLineItem`, `PettyCash`.
- [ ] Tenant tracking (`tenantId`) explicitly defined and indexed on all entities.
- [ ] Required relations defined (CRM `clientId`, catalog `categoryId`, `paymentMethodId`).
- [ ] Soft delete standard audit columns included.
- [ ] Enums configured for statuses (`QuotationStatus`, `InvoiceStatus`, `PettyCashType`).

## Services & Business Logic
- [ ] `QuotationService` implemented with status pipeline logic (DRAFT → SENT → ACCEPTED/REJECTED, auto-EXPIRED).
- [ ] `InvoiceService` implemented with status pipeline logic (DRAFT → ISSUED → PARTIAL → PAID, VOID flow).
- [ ] Reference number generation ensures atomic, gap-free sequencing per tenant (`QUO-TENANT-XXXX`, `INV-TENANT-XXXX`).
- [ ] Atomic conversion of Quotation to Invoice (rollback on failure).
- [ ] Void invoice logic strictly reverses associated state.
- [ ] `PettyCashService` manages catalog-linked income/expense logging.
- [ ] Cash flow summary logic respects DataTable date filtering.

## API / Controllers
- [ ] Standard CRUD endpoints for Quotations, Invoices, and PettyCash.
- [ ] Endpoints implement the DataTable pattern from 006 for lists and filtering.
- [ ] Quotation endpoints properly handle validity tracking.
- [ ] Invoice endpoints enforce correct state transitions (e.g., cannot go from DRAFT to PAID directly).
- [ ] PettyCash endpoints enforce valid `income_categories` and `expense_categories`.

## Security & Tenancy
- [ ] All queries implicitly scoped to the active `tenantId`.
- [ ] RBAC permissions (`sales:CRUD` or granular) verified on all controller routes.
- [ ] Atomic operations correctly use transaction blocks to prevent race conditions.
