# Research: Foundation & Bootstrap

**Feature**: 001-foundation-bootstrap
**Date**: 2026-07-07

## Research Tasks

### 1. NestJS 11 Project Scaffolding Strategy

**Decision**: Use the NestJS CLI (`nest new`) to generate the base project,
then restructure to match the constitution's repository layout
(src/main.ts, app.module.ts, common/, infrastructure/, modules/).

**Rationale**: The NestJS CLI produces a standardized, working project with
correct TypeScript, Jest, and build configuration. Manually reorganizing
the src/ into common/, infrastructure/, and modules/ preserves the CLI's
tooling while conforming to the constitution's Clean Architecture layers.
This avoids bespoke scaffolding that would diverge from the framework's
conventions.

**Alternatives considered**:
- *Manual project setup (package.json + tsconfig from scratch)*: Rejected —
  error-prone, misses CLI defaults for Jest/E2E config, and reinvents what
  the CLI already does correctly.
- *NestJS CLI with `--directory` to place files in src/*: Partial — the CLI
  flattens everything into src/. The restructure into common/infrastructure/
  modules/ must be done regardless.

### 2. Pino Structured Logging with Request Context

**Decision**: Use `nestjs-pino` with `pino-http`. Configure a custom logger
that emits JSON with the fields: requestId, timestamp, level, message,
method, path, statusCode, responseTime. Inject requestId via a middleware
that generates a UUID per request and stores it on the request object.

**Rationale**: `nestjs-pino` is the idiomatic Pino integration for NestJS.
It replaces the default logger, supports request-scoped logging out of the
box, and emits structured JSON. The requestId field (constitution Principle
IV: "Structured Logging with traceable context") is the minimum observability
baseline. The tenantId and userId fields are reserved and set to null in
this iteration; they will be populated once authentication and tenancy
(specs 002-003) inject them into the request context (AsyncLocalStorage).

**Alternatives considered**:
- *Winston*: Rejected — the constitution mandates `pino` + `nestjs-pino`.
- *NestJS default logger*: Rejected — not structured JSON, not performant
  at scale.
- *Pino without nestjs-pino*: Rejected — manual integration loses request
  scoping and interceptors that nestjs-pino provides.

### 3. OpenAPI/Swagger Auto-Generation

**Decision**: Use `@nestjs/swagger` with `SwaggerModule.loadPluginMetadata`
enabled in the NestJS CLI plugin config (nest-cli.json). Configure
`DocumentBuilder` with API title, version, and description. Serve Swagger
UI at `/api/docs` and the raw JSON at `/api/docs-json`.

**Rationale**: The `@nestjs/swagger` CLI plugin auto-generates DTO property
metadata from TypeScript types, reducing boilerplate `@ApiProperty()`
decorators (though explicit decorators are still preferred for clarity).
Serving at `/api/docs` is the documented path the constitution references.
The JSON endpoint is what the Angular frontend will consume via
`openapi-generator` (Principle V: "OpenAPI as Contract").

**Alternatives considered**:
- *Manual OpenAPI YAML*: Rejected — drifts from code; violates DRY.
- *express-openapi-validator*: Rejected — runtime validation only, no
  documentation generation.
- *Alternative Swagger packages (swagger-ui-express standalone)*: Rejected —
  loses the NestJS DTO introspection that @nestjs/swagger provides.

### 4. Global Validation Pipeline & Error Format

**Decision**: Register a global `ValidationPipe` with
`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, and
`transformOptions: { enableImplicitConversion: true }`. Pair with a global
exception filter that normalizes all errors into a consistent JSON shape:
`{ statusCode, message, error, timestamp, path, requestId }`.

**Rationale**: `whitelist` strips non-DTO props (defense-in-depth),
`forbidNonWhitelisted` rejects unknown props (fail-loud), `transform`
enables DTO class instantiation and type coercion. The global exception
filter (FR-013) ensures consistent error responses regardless of error
source (validation, auth, business, or unhandled). The requestId in the
error body correlates logs with client-visible errors.

**Alternatives considered**:
- *Per-controller pipes*: Rejected — error-prone, easy to forget.
- *No forbidNonWhitelisted*: Rejected — silently accepting extra fields
  masks bugs and is a security risk.

### 5. Health Checks: Liveness vs Readiness

**Decision**: Use `@nestjs/terminus` for health checks. Liveness endpoint
(`/health/live`) returns 200 with `{ status: 'ok' }` — no dependency
checks. Readiness endpoint (`health/ready`) returns 200 with the Prisma
health indicator result, or 503 if the database ping fails.

**Rationale**: Kubernetes-style liveness/readiness split is the industry
standard. Liveness = "should this process be restarted?" (always 200 while
the process runs). Readiness = "should this process receive traffic?"
(depends on DB). Terminus provides built-in indicators, retry logic, and
formatted responses. The Prisma health indicator runs a `SELECT 1` via
`$queryRaw` to check connectivity.

**Alternatives considered**:
- *Single health endpoint*: Rejected — doesn't distinguish process health
  from dependency health; can cause cascading restarts in orchestration.
- *Custom health controller without terminus*: Rejected — reinvents
  indicator composition and retry logic.

### 6. Rate Limiting

**Decision**: Use `@nestjs/throttler` with a global `ThrottlerGuard`.
Configuration: 100 requests per 60 seconds per IP (configurable via env).
Return 429 with a `Retry-After` header on limit exceeded.

**Rationale**: `@nestjs/throttler` is the official NestJS throttling
solution, integrates with guards, and supports per-IP and per-key
strategies. IP-only throttling is the baseline per FR-007;
per-user and per-tenant throttling will be layered on after
authentication (spec 003) using a custom `ThrottlerGuard` override.

**Alternatives considered**:
- *express-rate-limit middleware*: Rejected — not NestJS-native, doesn't
  integrate with the guard system.
- *Reverse-proxy rate limiting (Nginx)*: Acceptable as defense-in-depth in
  production, but the constitution requires application-level enforcement.

### 7. Environment Configuration & Validation

**Decision**: Use `@nestjs/config` with a **Zod** validation schema at
startup. Define a `z.object` schema, `schema.parse(process.env)` on
bootstrap; on `ZodError`, throw a single consolidated error (fail-fast)
with all field issues listed. Required: `DATABASE_URL`, `PORT`
(default 3000), `CORS_ORIGINS` (comma-separated), `JWT_SECRET`
(placeholder), `RATE_LIMIT_TTL` (default 60), `RATE_LIMIT_LIMIT`
(default 100). If validation fails, the app throws on bootstrap (fail-fast
per the spec edge case).

The validated config is exposed via a custom `validate` factory passed to
`ConfigModule.forRoot({ validate })`, which returns the parsed (typed)
config and feeds `ConfigService`. The Zod schema uses `z.infer<typeof
schema>` to produce the `Config` TypeScript type — a single source of
truth (no duplicated type definitions, honoring DRY).

**Rationale**: `@nestjs/config` is the standard config module. Validating
at startup catches misconfiguration before the server accepts traffic —
satisfying the spec's edge case "Invalid environment
configuration — application MUST fail fast." Zod is chosen over Joi because:
(i) it infers TypeScript types natively (`z.infer`), eliminating type
duplication — a single schema is both the runtime validator and the
type definition (DRY, aligned with the constitution's "Contract is Law");
(ii) it is the de-facto standard in the modern TypeScript ecosystem
(tRPC, React Hook Form, Next.js); (iii) the project is 100% strict TS,
making type inference the deciding factor. `@nestjs/config`'s `validate`
factory accepts any function that returns a config object, so Joi is not
required — Zod drops in cleanly. Defaults for local dev mean only
`DATABASE_URL` is strictly required. JWT_SECRET is included as a
placeholder env var so the auth feature (spec 003) can assume it exists.

**Alternatives considered**:
- *dotenv only, no validation*: Rejected — no fail-fast; missing vars
  cause runtime errors in obscure places.
- *Joi*: Acceptable and the historically-documented `@nestjs/config`
  pairing, but it cannot infer TypeScript types from the schema, forcing
  a duplicated `interface Config` definition alongside the Joi schema
  (DRY violation). Rejected in favor of Zod's native type inference.
- *class-validator DTO for config*: Rejected — DTOs validate request
  payloads, not `process.env`; the env layer predates the HTTP pipeline.

### 8. Helmet & CORS

**Decision**: Use `helmet` via App `use(helmet())` in bootstrap, and
`app.enableCors({ origin: parsed CORS_ORIGINS, credentials: true })`.
Strict-Transport-Security enabled by Helmet by default; even without HTTPS
locally, the header is harmless and required in production.

**Rationale**: Helmet applies a curated set of security headers
(X-Content-Type-Options, X-Frame-Options, HSTS, etc.) with sensible
defaults. CORS restricted to `CORS_ORIGINS` satisfies FR-006 and the
constitution's DevSecOps requirement. In production, `CORS_ORIGINS` equals
the frontend Angular domain; in development, it can include localhost:4200.

**Alternatives considered**:
- *Manual security headers*: Rejected — easy to miss headers, Helmet is
  the standard.
- *CORS with `origin: '*'`*: Rejected — violates the strict-CORS
  constitution requirement.
