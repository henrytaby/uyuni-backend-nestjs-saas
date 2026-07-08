# Research: Basic Inventory Module

**Feature**: 012-basic-inventory
**Date**: 2026-07-07

## Research Tasks

### 1. Stock Level Concurrency & Integrity

**Decision**: Use PostgreSQL CHECK constraint + optimistic concurrency via
Prisma's interactive transactions.

**Rationale**: The constitution requires "mathematically impossible" negative
stock. Application-level checks are insufficient under concurrent writes.
A database CHECK constraint (`current_stock >= 0`) provides the hard
guarantee. Prisma interactive transactions (`$transaction` callback form)
ensure stock reads and writes are atomic within a single transaction,
preventing race conditions where two concurrent sales both read stock=10
and each sell 8 units.

**Alternatives considered**:
- *Application-level validation only*: Rejected — race conditions can
  cause negative stock under concurrent writes.
- *Pessimistic locking (SELECT FOR UPDATE)*: Prisma does not natively
  support row-level locks. Would require raw queries, violating the
  "no raw SQL without review" constraint.
- *Event sourcing for stock*: Over-engineered for a basic inventory
  module. The append-only StockMovement log provides the audit trail
  without the complexity of full event sourcing.

### 2. Plan-Gate Guard Implementation Pattern

**Decision**: Implement a `PlanGate` guard as a shared NestJS guard in
`src/common/guards/`. It reads the tenant's plan from the request context
(or queries it) and checks if the requested module is in the plan's
module-access list. The guard is applied at the module level via
`@UseGuards(PlanGate)` on the InventoryModule's controllers.

**Rationale**: Constitution Principle III requires feature gating based on
Plan tiers. A shared guard allows any future gated module (e.g., advanced
reporting) to use the same mechanism. The guard checks the plan's
module-access gates (qualitative) and returns 403 with a structured upgrade
prompt if the module is not included.

**Alternatives considered**:
- *Per-endpoint decorator*: Rejected — too granular; the entire inventory
  module is gated, not individual endpoints.
- *Middleware-based check*: Rejected — guards integrate with NestJS's
  execution context and are the idiomatic approach.
- *Module-level conditional registration*: Rejected — would require
  dynamic module loading per request, which is not how NestJS modules
  work (they are singletons registered at bootstrap).

### 3. Automatic Stock Reduction on Invoice Confirmation

**Decision**: The Sales module emits a domain event (`InvoiceConfirmedEvent`)
that the Inventory module listens to. On receiving the event, the Inventory
service creates subtraction stock movements for each product line item and
updates the product's current_stock.

**Rationale**: Constitution Principle V requires modules to be autonomous
and decoupled. Direct cross-module service calls create tight coupling.
Domain events via NestJS's built-in EventEmitter allow the Sales module to
confirm invoices without knowing about inventory, and the Inventory module
to react independently. If the inventory module is not available (e.g.,
Free plan tenant), the event is simply not listened to.

**Alternatives considered**:
- *Direct service call from Sales to Inventory*: Rejected — violates module
  autonomy and creates a circular dependency risk.
- *Database trigger on invoice confirmation*: Rejected — bypasses the
  application layer, making the stock movement invisible to audit and
  business rules.
- *Polling-based approach*: Rejected — introduces latency and unnecessary
  complexity for a simple event-driven flow.

### 4. Low-Stock Alert Delivery Mechanism

**Decision**: After any stock movement, the Inventory service checks if the
new stock level is at or below the product's low_stock_threshold. If so,
it creates a notification record in a notifications table. A future
notification delivery service can pick these up for email/push delivery.

**Rationale**: The spec requires "in-app notifications" for this iteration.
Creating a notification record is the simplest mechanism that supports
future delivery channels. The check is synchronous within the stock
movement transaction — no background jobs needed yet.

**Alternatives considered**:
- *Background job (Bull/BullMQ)*: Over-engineered for in-app notifications.
  Can be added when email/push delivery is needed.
- *WebSocket push*: Out of scope — the frontend polls for notifications
  in this iteration.
- *Separate microservice*: Rejected — violates the monolithic architecture
  defined in the constitution.

### 5. SKU Uniqueness Strategy

**Decision**: Composite unique index on `(tenant_id, sku)` in the Product
table. This ensures SKU uniqueness within a tenant while allowing different
tenants to have the same SKU.

**Rationale**: The spec requires SKU uniqueness "within a tenant." A
composite index is the standard multi-tenant approach. Prisma supports
`@@unique([tenant_id, sku])` natively.

**Alternatives considered**:
- *Global SKU uniqueness*: Rejected — different businesses may use the
  same SKU for different products.
- *Application-level check*: Rejected — race condition risk; the database
  constraint is the source of truth.

### 6. Service Type Items Without Stock

**Decision**: The Product entity uses a `type` enum field (`PRODUCT` |
`SERVICE`). When type is SERVICE, the `current_stock` and
`low_stock_threshold` fields are null. Stock movement endpoints reject
operations on SERVICE-type items.

**Rationale**: The spec explicitly states "Products have stock tracking;
services do not." A single entity with a type discriminator is simpler
than two separate entities. Null stock fields for services are validated
at the DTO level.

**Alternatives considered**:
- *Separate Service entity*: Rejected — leads to duplicate fields (name,
  description, price, category) and makes the unified catalog harder to
  manage.
- *Polymorphic table pattern*: Over-complicated for two types; a simple
  enum discriminator suffices.
