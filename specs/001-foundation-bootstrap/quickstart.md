# Quickstart: Foundation & Bootstrap

**Feature**: 001-foundation-bootstrap
**Date**: 2026-07-07

## Prerequisites

- Node.js 20+ installed
- PostgreSQL 16+ running and accessible
- A user with CREATE privileges on the target database

## Setup

1. **Clone and install**:

   ```bash
   git clone <repo-url> uyuni-backend
   cd uyuni-backend
   npm install
   ```

2. **Configure environment** (see `.env.example`):

   ```bash
   cp .env.example .env
   # Edit .env and set DATABASE_URL and CORS_ORIGINS:
   #   DATABASE_URL=postgresql://user:pass@localhost:5432/uyuni
   #   CORS_ORIGINS=http://localhost:4200
   #   JWT_SECRET=dev-only-placeholder-change-me
   ```

3. **Apply the initial migration** (creates the migration baseline):

   ```bash
   npx prisma migrate dev --name init
   ```

   This migration creates no tables but seeds the `_prisma_migrations` table.

4. **Start the server**:
   ```bash
   npm run start:dev
   ```
   The server starts in watch mode with hot reload.

## Validation Scenarios

### Scenario 1: Runnable API Skeleton (US1)

Validate the server starts, connects to the database, and emits structured
logs with a requestId.

1. **Start the server** (step 4 above). Observe the startup log emitted as
   structured JSON in the console:

   ```json
   {
     "level": 30,
     "time": 1688760000000,
     "msg": "Nest application successfully started"
   }
   ```

2. **Call the liveness endpoint**:

   ```bash
   curl http://localhost:3000/health/live
   ```

   **Expected**: `200 OK` with:

   ```json
   { "status": "ok", "timestamp": "2026-07-07T...Z" }
   ```

3. **Call the readiness endpoint** (database connected):

   ```bash
   curl http://localhost:3000/health/ready
   ```

   **Expected**: `200 OK` with `"database": {"status": "up"}`.

4. **Inspect the structured log**: After the curl call, the console shows
   a log entry with `requestId`, `method`, `url`, `statusCode`, and
   `responseTime` as JSON fields.

### Scenario 2: API Documentation & Validation (US2)

Validate Swagger is auto-generated and DTO validation rejects bad input.

1. **Open Swagger UI** in a browser: `http://localhost:3000/api/docs`.
   **Expected**: Interactive API documentation page listing the health
   endpoints.

2. **Fetch the raw OpenAPI JSON**:

   ```bash
   curl http://localhost:3000/api/docs-json | jq '.paths | keys'
   ```

   **Expected**: `["/health/live", "/health/ready"]` (and `/health/ready`
   shows the 503 response variant).

   _Note_: To exercise validation, a sample DTO endpoint is required. Since
   no domain modules exist yet, validation is exercised via a dedicated
   test-only fixture (`test/fixtures/validation-sample.controller.ts`,
   task T029) imported inside the e2e spec via a TestModule. This proves
   the ValidationPipe rejects invalid payloads with a structured 400. The
   fixture is removed once the first real domain DTO arrives in spec 002.

3. **Alternatively, verify the ValidationPipe is registered** by checking
   `main.ts` includes:
   ```typescript
   app.useGlobalPipes(
     new ValidationPipe({
       whitelist: true,
       forbidNonWhitelisted: true,
       transform: true,
     }),
   );
   ```

### Scenario 3: Security Hardening & Observability (US3)

Validate Helmet, CORS, rate limiting, and liveness/readiness separation.

1. **Inspect security headers**:

   ```bash
   curl -I http://localhost:3000/health/live
   ```

   **Expected**: Response headers include:
   - `x-content-type-options: nosniff`
   - `x-frame-options: SAMEORIGIN`
   - `strict-transport-security: max-age=...`
   - `x-download-options`, `x-dns-prefetch-control`, etc. (Helmet defaults)

2. **Verify CORS restriction**:

   ```bash
   curl -I -H "Origin: http://evil.example.com" http://localhost:3000/health/live
   ```

   **Expected**: No `Access-Control-Allow-Origin` header in the response
   (origin not in CORS_ORIGINS). Repeat with `-H "Origin: http://localhost:4200"`
   **Expected**: `access-control-allow-origin: http://localhost:4200`.

3. **Trigger rate limiting** (run quickly — the window is 60s; slow
   execution may let early requests expire from the window):

   ```bash
   for i in $(seq 1 110); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/docs-json; done
   ```

   _(Note: The `/health` endpoints are often exempted or tested via e2e fixtures, so we use the Swagger JSON endpoint for this curl test)._
   **Expected**: The first 100 requests return `200`; requests 101+ return
   `429` with a `Retry-After` header. After 60 seconds, requests succeed again.

4. **Verify readiness reflects DB state**:
   - Stop the PostgreSQL database.
   - Call `GET /health/ready`.
     **Expected**: `503 Service Unavailable` with
     `"database": {"status": "down", "message": "..."}`.
   - Start PostgreSQL again; `/health/ready` returns `200`.

5. **Verify liveness ignores DB state**:
   - While PostgreSQL is stopped, call `GET /health/live`.
     **Expected**: `200 OK` (liveness never checks the database).

## Edge Case Verification

- **Missing env var**: Remove `DATABASE_URL` from `.env`, restart the server.
  **Expected**: Server fails to start with a clear Zod validation error
  naming `DATABASE_URL`.

- **Invalid env var**: Set `PORT=notanumber` in `.env`, restart.
  **Expected**: Server fails to start with a Zod error listing the invalid
  `PORT` field.

## Constitution Compliance Verification

- **Principle V (API-First)**: Swagger at `/api/docs` auto-generated; future
  domain modules inherit this with zero configuration.
- **Principle IV (partial)**: Structured JSON logs with requestId; tenantId
  and userId fields reserved (populated in specs 002-003).
- **DevSecOps**: Helmet + strict CORS + rate limiting all active.
- **SRE**: Liveness/readiness split enables health-based autoscaling.
