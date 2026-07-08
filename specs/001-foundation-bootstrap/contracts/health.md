# API Contract: Health Endpoints

**Module**: Infrastructure/Health
**Base Path**: `/health`
**Auth**: None (public)

The health endpoints report service and dependency status for
orchestration (Kubernetes liveness/readiness probes) and operational
monitoring. They are the only endpoints in this foundation feature;
domain endpoints are added by subsequent specs.

---

## GET /health/live

Liveness probe — returns 200 as long as the Node.js process is running
and accepting requests. No dependency checks. Used by orchestrators to
decide whether to restart the process.

**Authentication**: None (public).

**Response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2026-07-07T12:00:00.000Z"
}
```

This endpoint always returns 200 when the process is alive. It never
returns 503 — if the process is down, there is no HTTP response at all.

**Rate Limit**: Not throttled (probes must always pass).

---

## GET /health/ready

Readiness probe — returns 200 only when all dependencies are connected
and ready to serve traffic. Returns 503 if any dependency (currently:
the PostgreSQL database) is unavailable. Used by orchestrators to decide
whether to route traffic to this instance.

**Authentication**: None (public).

**Response** (200 OK):
```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    }
  },
  "timestamp": "2026-07-07T12:00:00.000Z"
}
```

**Response** (503 Service Unavailable):
```json
{
  "status": "error",
  "info": {},
  "error": {
    "database": {
      "status": "down",
      "message": "Connection refused"
    }
  },
  "details": {
    "database": {
      "status": "down",
      "message": "Connection refused"
    }
  },
  "timestamp": "2026-07-07T12:00:00.000Z"
}
```

**Rate Limit**: Not throttled (probes must always pass).

---

## Error Response Shape (Global)

All endpoints (including future domain endpoints) return errors in this
shape, enforced by the global exception filter:

```json
{
  "statusCode": 400,
  "message": "string or array of strings",
  "error": "Bad Request",
  "timestamp": "2026-07-07T12:00:00.000Z",
  "path": "/resource",
  "requestId": "uuid-v4"
}
```

| Element | Description |
|---------|-------------|
| statusCode | HTTP status code |
| message | Human-readable error detail (array for validation errors) |
| error | HTTP status reason phrase |
| timestamp | ISO 8601 UTC timestamp |
| path | Requested path |
| requestId | Unique per-request identifier (correlates with structured logs) |

**Rate Limit Exceeded** (429):
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests",
  "timestamp": "2026-07-07T12:00:00.000Z",
  "path": "/health/ready",
  "requestId": "uuid-v4"
}
```
(Response also includes a `Retry-After` header with the window TTL in seconds.)

---

## API Documentation

Interactive Swagger UI is available at `/api/docs`. Raw OpenAPI JSON is
available at `/api/docs-json` for the Angular frontend's code generation.

All future domain endpoints are automatically documented here upon
Controller and DTO registration — no manual documentation required
(Principle V: OpenAPI as Contract).
