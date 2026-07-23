# Multi-Tenancy Architecture

## Isolation Stack

The system enforces tenant isolation through a layered architecture:

1. **AsyncLocalStorage (ALS)**: Request-scoped context carrying `tenantId`, `userId`, `isPlatformAdmin`, and `requestId`. Populated by `TenantContextMiddleware` (runs before guards).

2. **TenantContextMiddleware**: Global middleware that extracts tenant context from the decoded JWT payload. Must run before all guards. Registered as the first middleware in `AppModule`.

3. **TenantGuard**: Global guard that rejects requests without tenant context (401). Routes marked `@Public()` are exempt (e.g., `GET /tenancy/users/me/tenants`, health endpoints).

4. **Prisma Client Extension** (`tenant-scoped.extension.ts`): Automatically injects `tenantId` on writes and filters by `tenantId` on reads. Platform admin bypass skips the read filter.

5. **PostgreSQL RLS**: Row-Level Security on `tenant_users` table. Uses `current_setting('app.tenant_id')` and `current_setting('app.is_platform_admin')` session variables. Set via `SET LOCAL` inside interactive `$transaction`.

## Transition from Spec 001

Spec 001 shipped `RequestContextInterceptor` which defined the `AsyncLocalStorage` instance (`requestContextStorage`). Spec 002 replaces the interceptor body with `TenantContextMiddleware`:

- The interceptor class remains for its `RequestContext` interface and `requestContextStorage` export (shared ALS instance)
- The middleware owns the single `als.run()` call
- Logger `customProps` reads from `requestContextStorage.getStore()`

## Cross-Tenant Access: 404 Not 403

When a user accesses a resource belonging to another tenant, the Prisma extension's `WHERE tenant_id = <ctx.tenantId>` makes the row invisible. `findUnique` returns `null`, and the controller throws `NotFoundException` → 404. This prevents information leakage (403 would confirm the resource exists).

## Platform Admin Bypass

Platform admins (`isPlatformAdmin: true`) bypass the tenant filter in the Prisma extension for reads. The extension also sets `app.is_platform_admin = 'true'` so RLS policy permits cross-tenant reads.

## Non-Tenant-Scoped Entities: App-Guard Protection

Not all entities are tenant-scoped. The following are **platform-global** and are protected by application-layer guards, NOT by RLS or the Prisma extension:

| Entity | RLS | Protection Mechanism |
|--------|-----|----------------------|
| **Plan** | No | Platform admin only (app guard) |
| **Tenant** | No | Platform admin OR context-based membership check (`id === ctx.tenantId`) |
| **User** | No | Platform admin OR own-record access (app guard) |
| **TenantUser** | Yes | Prisma extension + RLS + TenantGuard |

For `GET /tenancy/tenants/:id`, the authorization logic is:
- If `isPlatformAdmin` → access granted
- If `id === ctx.tenantId` (user querying their own tenant) → access granted
- Otherwise → 404 (not 403, to prevent information leakage)

This design avoids cross-tenant membership queries that the Prisma extension would block by design.

## Extension Limitations

- `findUnique` on tenant-scoped models is NOT supported — the extension adds `where.tenantId` which Prisma rejects for `findUnique`. Use `findFirst` instead.
- The Prisma extension wraps every tenant-scoped operation in an interactive `$transaction` with `SET LOCAL`. This is mandatory for RLS under Prisma connection pooling.

## Guard Ordering (Implementation Detail)

NestJS executes global guards in registration order (from `app.module.ts`):

1. `ThrottlerGuard` (per-IP rate limiting, from spec 001)
2. `TenantGuard` (ensures tenant context exists before execution)
3. `PlatformAdminGuard` (enforces platform admin RBAC for CUD)

The order matters: a route marked `@Public()` skips `TenantGuard`, allowing
unauthenticated requests to health endpoints (`GET /health/live`) and the
tenant list endpoint (`GET /tenancy/users/me/tenants`). The `@Public()`
decorator is the only way to bypass the global `TenantGuard`.

## Public Endpoints & Authentication

Some endpoints are marked `@Public()` to allow unauthenticated access
before a tenant context is established (spec 001+003). These are:

- `GET /health/live` — liveness probe (always public)
- `GET /tenancy/users/me/tenants` — list user's tenants (used before login
  to select an active tenant context)

The `@Public()` decorator disables the global `TenantGuard`, but does **not**
disable authentication: the request must still provide a valid JWT for the
`tenant_context_source` implementation to extract `tenantId`/`userId`. If
no JWT is provided, the source returns `null` for both, causing the
Prisma extension to fail with a raw error (not a 401) and the service to
throw 404. Proper authentication is enforced by the authentication flow
implemented in spec 003.

## findUnique (Extension Limitation)

As documented above, `findUnique` on tenant-scoped models is NOT supported
because Prisma rejects additional `where` keys beyond the unique selector.
The extension throws an `InternalServerErrorException` directing callers
to use `findFirst` (idiomatic usage) and the console error provides the
exact error message. For tenant-scoped operations where you need to fetch
by primary key, always prefer `findFirst({ where: { id } })`.

## Security Notes

- **Anti-spoofing safeguard**: The middleware **never** reads tenant identity
  from HTTP headers, query parameters, or request body — only from the
  decoded JWT payload (`req.user`). During e2e tests, the testing module
  overrides the `TENANT_CONTEXT_SOURCE` provider to inject context from
  `x-test-*` headers (test-only, never production).
- **Platform admin bypass**: `is_platform_admin=true` in the JWT payload
  causes the Prisma extension to skip the read filter and set the RLS
  bypass variable, allowing cross-tenant reads. The admin bypass is enforced
  by the `PlatformAdminGuard` at the application layer for CUD operations
  on platform-global entities (Plan, Tenant, User).
- **RLS FORCE ROW LEVEL SECURITY**: The migration includes `FORCE ROW
  LEVEL SECURITY` on `tenant_users`, meaning even the table owner (postgres)
  must satisfy the RLS policy unless it bypasses via session variables.
  The test harness uses `adminDatabaseUrl` (postgres superuser) to bypass
  RLS for seeding; production connections via `DATABASE_URL` use a non-super
  user and respect RLS policies.
