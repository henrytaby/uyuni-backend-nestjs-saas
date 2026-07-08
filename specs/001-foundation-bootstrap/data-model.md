# Data Model: Foundation & Bootstrap

**Feature**: 001-foundation-bootstrap
**Date**: 2026-07-07

## Overview

This feature establishes the application skeleton and infrastructure
configuration. It does NOT introduce domain entities. The only
"data" managed by this feature is:

1. **Prisma schema** — minimal datasource + generator configuration
   (no models yet; domain models added by specs 002+).
2. **Configuration schema** — Zod-validated environment variables.
3. **Logger context** — request-scoped fields (requestId, and reserved
   tenantId/userId).

## Prisma Schema (Minimal)

The `prisma/schema.prisma` file contains only the datasource and generator
blocks. No model is defined in this iteration. This establishes the Prisma
client and migration baseline so subsequent features can incrementally add
tenant-scoped models.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**First migration**: An empty initial migration is created
(`prisma migrate dev --name init`) to establish the migration history.
This migration creates no tables but seeds `_prisma_migrations`.

## Configuration Schema (Environment Variables)

Validated at startup via Zod (`schema.parse(process.env)`). Missing
required variables throw a `ZodError` on bootstrap, failing fast. The
schema is the single source of truth: `z.infer<typeof schema>` produces
the `Config` TypeScript type (no duplicated interface).

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| DATABASE_URL | string | yes | — | PostgreSQL connection string |
| PORT | number | no | 3000 | HTTP listen port |
| NODE_ENV | string | no | "development" | Environment (development/staging/production) |
| CORS_ORIGINS | string | yes | — | Comma-separated allowed origins |
| JWT_SECRET | string | yes | — | Placeholder for auth feature (spec 003) |
| JWT_EXPIRES_IN | string | no | "15m" | Access token TTL (placeholder) |
| JWT_REFRESH_EXPIRES_IN | string | no | "7d" | Refresh token TTL (placeholder) |
| RATE_LIMIT_TTL | number | no | 60 | Rate limit window in seconds |
| RATE_LIMIT_LIMIT | number | no | 100 | Max requests per window per IP |
| TRUST_PROXY | boolean | no | false | Trust X-Forwarded-* headers (prod behind Nginx) |
| LOG_LEVEL | string | no | "info" | Pino log level (fatal/error/warn/info/debug/trace) |

**Validation Rules**:
- DATABASE_URL: must be a valid `postgresql://` URL
- PORT: integer 1-65535
- NODE_ENV: must be one of development, staging, production, test
- RATE_LIMIT_TTL: integer > 0
- RATE_LIMIT_LIMIT: integer > 0
- LOG_LEVEL: must be one of fatal, error, warn, info, debug, trace

## Logger Context Shape

Each structured log entry is a JSON object. The contextual fields below
are attached by `nestjs-pino`'s request interceptor. The `requestId` is
generated per-request; `tenantId` and `userId` are reserved and null in
this iteration.

```json
{
  "level": "info",
  "time": 1688760000000,
  "requestId": "uuid-v4",
  "tenantId": null,
  "userId": null,
  "ip": "203.0.113.7",
  "method": "GET",
  "url": "/health/live",
  "statusCode": 200,
  "responseTime": 3,
  "msg": "request completed"
}
```

The `ip` field is the **real client IP**. It comes from `req.ip`, which Express resolves from the `X-Forwarded-For` header when `app.set('trust proxy', TRUST_PROXY)` is enabled (default `false`, set `true` in production behind Nginx). In local dev without a proxy, it falls back to the direct connection IP. Without `trust proxy`, all requests behind Nginx would appear as `127.0.0.1`, breaking per-IP rate limiting (FR-007) and audit traceability (constitution Principle IV).

## Application Error Response Shape

The global exception filter normalizes all errors into a single JSON
format. This shape is the contract for ALL error responses across the
application, established here and inherited by all future modules.

```json
{
  "statusCode": 400,
  "message": ["field must be a string"],
  "error": "Bad Request",
  "timestamp": "2026-07-07T12:00:00.000Z",
  "path": "/resource",
  "requestId": "uuid-v4"
}
```

## Health Response Shapes

### Liveness (`GET /health/live`)

```json
{
  "status": "ok",
  "timestamp": "2026-07-07T12:00:00.000Z"
}
```

### Readiness (`GET /health/ready`)

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" }
  },
  "timestamp": "2026-07-07T12:00:00.000Z"
}
```

On database failure, status becomes "error" and the HTTP status code is 503.
