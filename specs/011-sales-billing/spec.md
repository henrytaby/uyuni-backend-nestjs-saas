# 011: Sales & Billing
**Status**: Ready
**Updated**: 2026-07-23 (Enterprise Architect Review — v2)

## Description
This module provides a comprehensive sales and billing subsystem encompassing Quotations, Invoicing, and Petty Cash/Cashbook tracking. It supports full financial workflows including state transitions, precise document referencing, and dynamic catalog integration.

## Dependencies
- **002-multi-tenancy-core**: Tenant isolation (`tenantId`).
- **004-rbac**: Permission enforcement (`sales:CRUD`).
- **005-audit-infrastructure**: System auditing for all financial transactions.
- **006-generic-repository-datatables**: Filtering, pagination, sorting (DataTable pattern) for lists.
- **007-catalogs**: Dynamic categories (`income_categories`, `expense_categories`, `payment_methods`).
- **009-crm**: Client linking for quotations and invoices (`clientId`).

## User Stories

### US1 - Quotations
As a sales agent, I want to create, send, and manage quotations, so I can provide pricing to clients.
- **Status Pipeline**: `DRAFT` → `SENT` → `ACCEPTED` / `REJECTED`, with auto-`EXPIRED` based on validity tracking.
- Sequential reference number generation: Tenant-scoped, formatted as `QUO-TENANT-0001`.
- Track quotation validity period.

### US2 - Invoices
As a billing manager, I want to manage the invoice lifecycle and track payments, so I can ensure revenue collection.
- **Status Pipeline**: `DRAFT` → `ISSUED` → `PARTIAL` → `PAID`. (Also allows `DRAFT` → `VOID` and `ISSUED` → `VOID`).
- Uses `InvoiceLineItem` for detailed billing structures.
- Sequential reference number: Tenant-scoped, formatted as `INV-TENANT-0001`.
- Linked to CRM Clients from `009`.
- Includes a structured void/cancel flow.

### US3 - Petty Cash
As an accountant, I want to log minor cash movements (income and expenses), so the business has an accurate daily cashbook.
- Uses dynamic catalogs from `007` for `income_categories` and `expense_categories`.
- Supports period-based filtering using the DataTable pattern.

## Functional Requirements
- **FR-001**: CRUD on Quotations, Invoices, and Petty Cash records.
- **FR-002**: Apply tenant scoping on all queries.
- **FR-013**: Reference numbers MUST be auto-generated with tenant-specific prefix and sequential numbering. Numbers MUST be unique per tenant and gap-free within each document type.
- **FR-014**: Quotation-to-invoice conversion MUST be atomic. If invoice creation fails, the quotation status remains unchanged.
- **FR-015**: Void/cancelled invoices MUST change status to VOID and record the void date and reason. Stock movement reversal (if inventory module is active) is handled by 012-basic-inventory, not by this module.
- **FR-016**: All sales list endpoints MUST use the DataTable pattern from 006.
- **FR-017**: Payment methods MUST come from the `payment_methods` dynamic catalog from 007, not a fixed enum.

## Non-Functional Requirements
- **NFR-001**: Invoice generation must complete in <2s.
- **NFR-002**: Cash flow summary aggregation must complete in <1s for 100+ entries.
- **NFR-003**: Reference number generation must be atomic and guarantee no gaps even under concurrency.

## Entities

### Quotation
- `id` (UUID)
- `tenantId` (UUID)
- `clientId` (UUID) - FK to CRM
- `referenceNumber` (String) - e.g., QUO-TENANT-0001
- `status` (Enum: DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED)
- `currency` (String)
- `totalAmount` (Decimal)
- `validUntil` (Date)
- standard audit columns (createdAt, updatedAt, deletedAt)

### Invoice
- `id` (UUID)
- `tenantId` (UUID)
- `clientId` (UUID) - FK to CRM
- `quotationId` (UUID, optional)
- `referenceNumber` (String) - e.g., INV-TENANT-0001
- `status` (Enum: DRAFT, ISSUED, PARTIAL, PAID, VOID)
- `currency` (String)
- `totalAmount` (Decimal)
- `paidAmount` (Decimal)
- standard audit columns (createdAt, updatedAt, deletedAt)

### InvoiceLineItem
- `id` (UUID)
- `invoiceId` (UUID)
- `description` (String)
- `quantity` (Decimal)
- `unitPrice` (Decimal)
- `totalPrice` (Decimal)
- standard audit columns

### QuotationLineItem
- `id` (UUID)
- `tenantId` (UUID)
- `quotationId` (UUID) - linked Quotation
- `description` (String)
- `quantity` (Decimal)
- `unitPrice` (Decimal)
- `lineTotal` (Decimal)
- standard audit columns

### Payment
- `id` (UUID)
- `tenantId` (UUID)
- `invoiceId` (UUID) - linked Invoice
- `amount` (Decimal)
- `date` (Date)
- `paymentMethod` (String) - catalog payment_methods value/code
- standard audit columns

### PettyCash
- `id` (UUID)
- `tenantId` (UUID)
- `type` (Enum: INCOME, EXPENSE)
- `categoryId` (UUID) - FK to dynamic catalog (income_categories / expense_categories)
- `paymentMethodId` (UUID) - FK to dynamic catalog (payment_methods)
- `amount` (Decimal)
- `currency` (String)
- `description` (String)
- `date` (Date)
- standard audit columns

## Edge Cases
- **Concurrent reference number generation**: Must use database locking or sequence generators to ensure gap-free unique numbering per tenant.
- **Voided invoice with existing payments**: Requires compensating transactions or strict prevention (e.g., cannot void if fully/partially paid unless payments are rolled back first).
- **Expired quotations**: Automatically transitioning quotations to EXPIRED once their validity period ends.

## Assumptions
- Tax rate is configured at the tenant level.
- Reference number format (`PREFIX-TENANT-XXXX`) is standardized.
- `payment_methods` and other categories exist in the catalogs module.
