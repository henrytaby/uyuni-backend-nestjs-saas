# Tasks: Foundation & Bootstrap

**Input**: Design documents from `/specs/001-foundation-bootstrap/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included. plan.md (L28) mandates a minimal health e2e; quickstart.md defines 4 validation scenarios; constitution testing section requires E2E coverage. Testcontainers is deferred to later features (plan note) — foundation e2e uses a configured DB connection.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `prisma/`, `test/` at repository root (per constitution repository structure)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure (research.md §1: NestJS CLI scaffold + restructure)

- [X] T001 Scaffold NestJS 11 project via `nest new uyuni-backend --package-manager npm` then restructure to constitution layout (src/main.ts, src/app.module.ts, src/common/, src/infrastructure/, src/modules/)
- [X] T002 Install primary dependencies: `@nestjs/platform-express @nestjs/swagger @nestjs/throttler @nestjs/terminus @nestjs/config class-validator class-transformer helmet nestjs-pino pino zod @prisma/client` and dev deps `prisma @types/helmet @nestjs/cli` in package.json
- [X] T003 [P] Configure TypeScript strict mode (no `any`, strict null checks, noImplicitAny) in tsconfig.json per FR-010
- [X] T004 [P] Configure NestJS CLI Swagger plugin in nest-cli.json to auto-generate DTO property metadata (research.md §3)
- [X] T005 [P] Create reserved directory `src/modules/` with `.gitkeep` for future domain modules (plan.md structure decision)
- [X] T006 [P] Create `.env.example` at repo root documenting all env vars: DATABASE_URL, PORT, NODE_ENV, CORS_ORIGINS, JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, RATE_LIMIT_TTL, RATE_LIMIT_LIMIT, TRUST_PROXY, LOG_LEVEL (data-model.md env table) in .env.example

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented (shared config, logging, DB, error normalization)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 Implement Zod environment validation schema and `validate()` factory in src/common/config/env.validation.ts (research.md §7; data-model.md config schema) — `schema.parse(process.env)` fail-fast on `ZodError`, `z.infer<typeof schema>` produces Config type
- [X] T008 Register `ConfigModule.forRoot({ validate, isGlobal: true })` in src/app.module.ts consuming the Zod validate factory
- [X] T009 [P] Create minimal Prisma schema (datasource + generator only, no models) in prisma/schema.prisma (data-model.md §Prisma Schema) and run `npx prisma migrate dev --name init` to seed `_prisma_migrations`
- [X] T010 Implement PrismaService (extends PrismaClient) in src/infrastructure/prisma/prisma.service.ts and PrismaModule in src/infrastructure/prisma/prisma.module.ts
- [X] T011 [P] Configure nestjs-pino structured JSON logger in src/infrastructure/logger/logger.module.ts (research.md §2) — emit requestId, timestamp, level, method, url, statusCode, responseTime, `ip` (req.ip — the real client IP, which respects `app.set('trust proxy', TRUST_PROXY)` per T039 when behind Nginx); reserve tenantId/userId as null fields per data-model.md logger context shape; inject requestId via per-request UUID
- [X] T012 [P] Implement request-context interceptor in src/common/interceptors/request-context.interceptor.ts to generate per-request UUID requestId and attach to logger context (constitution Principle IV partial)
- [X] T013 Implement global exception filter in src/common/filters/global-exception.filter.ts (FR-013; data-model.md error response shape) — normalize all errors to `{ statusCode, message, error, timestamp, path, requestId }`
- [X] T014 Register global `ValidationPipe` with `whitelist:true, forbidNonWhitelisted:true, transform:true, transformOptions:{enableImplicitConversion:true}` in src/main.ts (research.md §4; FR-003)
- [X] T015 Implement Helmet (`app.use(helmet())`) in src/main.ts bootstrap (research.md §8; FR-005). NOTE: CORS is NOT configured here — T037 (US3) is the single owner of CORS wiring (origin parsing + `enableCors`) to avoid double-configuration of the same concern in `main.ts`.

**Checkpoint**: Foundation infrastructure ready — config validated, DB wired, structured logging active, errors normalized, validation pipeline + security baseline in place. User story implementation can now proceed.

---

## Phase 3: User Story 1 - Runnable API Skeleton (Priority: P1) 🎯 MVP

**Goal**: Developer clones repo, starts server, DB connects, health endpoint responds, structured JSON logs with requestId are emitted (spec.md US1; quickstart Scenario 1).

**Independent Test**: Start server → call `/health/live` → verify JSON `{status:"ok"}` and a console log entry containing `requestId`, `method`, `url`, `statusCode`, `responseTime`.

### Tests for User Story 1

> NOTE: Plan.md L28 mandates "a minimal health e2e". Write tests and ensure they FAIL before implementation.

- [X] T016 [P] [US1] Write e2e test for liveness endpoint returning 200 + `{status:"ok",timestamp}` in test/e2e/foundation.e2e-spec.ts — assert the request round-trip ≤ 5s (spec.md:30 US1.AC1 "responds to health check requests within 5 seconds"), measuring response latency NOT server startup (which is T023); record start time before the request and assert `(Date.now() - start) <= 5000`
- [X] T017 [P] [US1] Write e2e test asserting structured JSON log entry contains requestId/method/url/statusCode/responseTime after a request in test/e2e/foundation.e2e-spec.ts

### Implementation for User Story 1

- [X] T018 [P] [US1] Implement Prisma health indicator (`SELECT 1` via `$queryRaw`) in src/infrastructure/health/indicators/prisma-health.indicator.ts (research.md §5). On DB failure, set the indicator's `message` field to the raw DB error string (`err.message`, e.g. "Connection refused") to match the 503 `database.message` shape in contracts/health.md
- [X] T019 [US1] Implement HealthModule in src/infrastructure/health/health.module.ts wiring the Prisma indicator and HealthCheckService
- [X] T020 [US1] Implement HealthController with `GET /health/live` (liveness, always 200, no dependency check) in src/infrastructure/health/health.controller.ts per contract contracts/health.md
- [X] T021 [US1] Implement `GET /health/ready` (readiness, 200 when DB up / 503 when DB down) in src/infrastructure/health/health.controller.ts per contract contracts/health.md (database detail shape)
- [X] T022 [US1] Register HealthModule and PrismaModule in src/app.module.ts
- [X] T023 [US1] Complete src/main.ts bootstrap: helmet, CORS, ValidationPipe, Swagger DocumentBuilder (title/version/description, served at /api/docs + /api/docs-json), app.listen(PORT) — verify startup < 5s

**Checkpoint**: Server starts, connects to DB, `/health/live` and `/health/ready` respond, structured logs with requestId emitted. US1 fully functional and independently testable.

---

## Phase 4: User Story 2 - API Documentation & Validation (Priority: P2)

**Goal**: Swagger UI at `/api/docs` auto-generated from Controllers/DTOs; raw OpenAPI JSON at `/api/docs-json`; invalid payloads rejected with structured 400 validation errors (spec.md US2; quickstart Scenario 2).

**Independent Test**: Open `/api/docs` → verify `/health/live` and `/health/ready` listed; fetch `/api/docs-json` → verify paths; send invalid body → verify 400 with `{statusCode, message[], error, timestamp, path, requestId}`.

### Tests for User Story 2

- [X] T024 [P] [US2] Write e2e test asserting `/api/docs-json` exposes paths `["/health/live","/health/ready"]` in test/e2e/foundation.e2e-spec.ts
- [X] T025 [P] [US2] Write e2e test asserting invalid payload on a sample DTO endpoint returns 400 with the global error shape in test/e2e/foundation.e2e-spec.ts

### Implementation for User Story 2

- [X] T026 [P] [US2] Add Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse` including 200/503 variants per contracts/health.md) to HealthController in src/infrastructure/health/health.controller.ts
- [X] T027 [P] [US2] Add OpenAPI metadata for `GET /health/ready` 503 variant (`@ApiResponse({ status: 503, schema })` per contracts/health.md 503 body) and `@ApiTags('health')` on HealthController in src/infrastructure/health/health.controller.ts — DO NOT use `@ApiExcludeController()` (health endpoints MUST appear in the OpenAPI contract per constitution Principle V and T024 assertion)
- [X] T028 [US2] Verify Swagger bootstrap in src/main.ts serves UI at `/api/docs` and JSON at `/api/docs-json` via `SwaggerModule.setup` (T023 area) — confirm DocumentBuilder config complete
- [X] T029 [P] [US2] Add a test-only sample DTO + controller fixture to exercise the global ValidationPipe 400 path (quickstart.md note: needed to validate FR-003 rejection since no domain modules exist yet). Place under `test/fixtures/validation-sample.controller.ts` — import it ONLY inside `test/e2e/foundation.e2e-spec.ts` via a dedicated TestModule (NOT registered in src/ or AppModule). Remove with the first real domain DTO in spec 002.
- [X] T030 [US2] Verify global exception filter maps ValidationPipe BadRequestException to the data-model.md error shape `{statusCode, message[], ...}` in src/common/filters/global-exception.filter.ts

**Checkpoint**: Swagger UI lists health endpoints with documented response shapes; raw JSON exportable for frontend codegen (constitution Principle V); invalid payload → 400 with structured errors. US1 + US2 both independently functional.

---

## Phase 5: User Story 3 - Security Hardening & Observability Baseline (Priority: P3)

**Goal**: Helmet security headers on every response; strict CORS; per-IP rate limiting (429 + Retry-After); liveness/readiness separation verified (spec.md US3; quickstart Scenario 3).

**Independent Test**: `curl -I /health/live` → verify Helmet headers (x-content-type-options, x-frame-options, strict-transport-security); unknown origin → no ACAO header; exceed 100 req/60s → 429 + Retry-After; stop DB → `/health/ready` 503, `/health/live` still 200.

### Tests for User Story 3

- [X] T031 [P] [US3] Write e2e test asserting security headers present on `/health/live` response in test/e2e/foundation.e2e-spec.ts
- [X] T032 [P] [US3] Write e2e test asserting CORS allows configured origin and blocks unconfigured origin in test/e2e/foundation.e2e-spec.ts
- [X] T033 [P] [US3] Write e2e test asserting rate limit returns 429 + Retry-After when threshold exceeded in test/e2e/foundation.e2e-spec.ts — use a low `RATE_LIMIT_LIMIT=5` in `.env.test` (with `RATE_LIMIT_TTL=60`) so 6 rapid sequential requests trigger the 429 within the e2e run
- [X] T034 [P] [US3] Write e2e test asserting `/health/ready` returns 503 with database down detail and `/health/live` stays 200 in test/e2e/foundation.e2e-spec.ts

### Implementation for User Story 3

- [X] T035 [US3] Implement global ThrottlerGuard with configurable TTL/LIMIT from env (RATE_LIMIT_TTL, RATE_LIMIT_LIMIT, defaults 60/100) in src/app.module.ts via ThrottlerModule.forRootAsync (research.md §6; FR-007) — the guard's `getTracker` MUST read `req.ip` (the real client IP, respecting `app.set('trust proxy', TRUST_PROXY)` per T039) so per-IP rate limiting works correctly behind Nginx; window unit is seconds (RATE_LIMIT_TTL default 60s = 1 minute per spec.md assumption)
- [X] T036 [P] [US3] Exclude `/health/live` and `/health/ready` from rate limiting via `@SkipThrottle()` on HealthController to satisfy contract (health must always pass probes) in src/infrastructure/health/health.controller.ts (contracts/health.md "Rate Limit: Not throttled")
- [X] T037 [US3] Configure CORS dynamically from parsed `CORS_ORIGINS` env (comma-split) via `app.enableCors({ origin: parsed CORS_ORIGINS, credentials: true })` in src/main.ts — THIS IS THE SINGLE CORS OWNER (T015 does Helmet only); verify unknown origin returns no `Access-Control-Allow-Origin` header
- [X] T038 [US3] Normalize ThrottlerException to global error shape with 429 + `Retry-After` header (window TTL) in src/common/filters/global-exception.filter.ts (contracts/health.md 429 shape)
- [X] T039 [P] [US3] Configure `app.set('trust proxy', TRUST_PROXY)` in src/main.ts for prod behind Nginx (data-model.md env table; spec assumption) — gate by config value
- [X] T040 [US3] Add edge case handling: DB connection failure on startup logs error and exits gracefully (no silent hang) in src/infrastructure/prisma/prisma.service.ts (spec edge case)

**Checkpoint**: All US3 acceptance scenarios pass. Security headers universal, strict CORS enforced, rate limiting active (health exempt), liveness/readiness split verified, fail-fast on bad config confirmed. All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation

- [X] T041 [P] Document local setup, env configuration, and migration steps from quickstart.md in README.md (SC-001: running in < 10 min)
- [X] T042 Run quickstart.md Scenario 1 (US1), Scenario 2 (US2), Scenario 3 (US3) end-to-end against a live PostgreSQL instance and verify all expectations
- [X] T043 Run edge case verification from quickstart.md (missing DATABASE_URL → Zod fail-fast; invalid PORT → Zod error) and confirm clear error messages
- [X] T044 [P] Verify TypeScript strict build passes (`npm run build`) with zero `any` types (FR-010) across src/ and test/
- [X] T045 [P] Run lint + format (`npm run lint`) and resolve any violations in src/, test/, prisma/
- [X] T046 [P] Assert health endpoint latency performance goal (plan.md:34 "health endpoint < 100ms p95") — add a perf assertion to test/e2e/foundation.e2e-spec.ts that issues ≥20 sequential calls to `/health/live` and `/health/ready` and rejects if the p95 round-trip exceeds 100ms
- [X] T047 Verify constitution compliance: Principle IV partial (structured JSON logs with requestId + reserved tenantId/userId), Principle V (Swagger auto-gen, src/modules/ reserved) in final review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T001 must complete before T002; T003/T004/T005/T006 are parallel after T001.
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories.
  - T007 → T008 (validate factory must exist before AppModule consumes it)
  - T009 independent (Prisma schema) — parallel foundation
  - T011/T012 parallel (logger + request-context interceptor)
  - T013, T014, T015 register in main.ts; T015 owns Helmet only (CORS deferred to T037 in Phase 5, the single CORS owner)
- **User Stories (Phase 3+)**: All depend on Phase 2 completion.
  - **US1 (Phase 3)**: Foundational must be complete. T018–T023 build on PrismaModule (T010) + HealthModule.
  - **US2 (Phase 4)**: Depends on US1 (HealthController exists to document). T026/T027 decorate the US1 controller.
  - **US3 (Phase 5)**: Depends on US1 (health endpoints exist to exempt throttle). T036 decorates the US1 controller.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational (Phase 2). No dependency on other stories. → **MVP**
- **US2 (P2)**: Depends on US1 (HealthController from T020/T021 must exist to receive Swagger decorators). Independently testable (Swagger at `/api/docs-json` + validation 400).
- **US3 (P3)**: Depends on US1 (health endpoints must exist to apply `@SkipThrottle()` and verify 503/200 split). Independently testable (security headers, CORS, throttle, ready/live).

### Within Each User Story

- Tests written FIRST and FAILING before implementation (TDD where mandated)
- Models/indicators before services/modules
- Modules before controllers
- Controllers before app registration
- Story complete and independently testable before next priority

### Parallel Opportunities

- **Phase 1**: T003, T004, T005, T006 run in parallel (different files) after T001
- **Phase 2**: T009, T011, T012 run in parallel (different files, independent foundational pieces)
- **Phase 3**: T016, T017 (tests) and T018 (indicator) run in parallel — different files
- **Phase 4**: T024, T025 (tests), T026, T027, T029 (decorators/sample DTO) run in parallel — different files
- **Phase 5**: T031–T034 (tests), T036 (decorator), T039 (main.ts proxy) run in parallel — different files
- **Phase 6**: T041 (README), T044 (build), T045 (lint) run in parallel — different concerns
- **Cross-story**: US1 must precede US2/US3 (shared HealthController), but US2 and US3 tasks are otherwise independent of each other and can interleave.

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together (must fail first):
Task: T016 "e2e test for liveness endpoint in test/e2e/foundation.e2e-spec.ts"
Task: T017 "e2e test for structured log requestId in test/e2e/foundation.e2e-spec.ts"

# Launch foundational pieces together:
Task: T018 "Prisma health indicator in src/infrastructure/health/indicators/prisma-health.indicator.ts"
# then sequentially:
Task: T019 "HealthModule" → T020/T021 "HealthController" → T022 "AppModule register" → T023 "main.ts bootstrap"
```

## Parallel Example: User Story 3

```bash
Task: T031 "security headers e2e in test/e2e/foundation.e2e-spec.ts"
Task: T032 "CORS e2e in test/e2e/foundation.e2e-spec.ts"
Task: T033 "rate limit 429 e2e in test/e2e/foundation.e2e-spec.ts"
Task: T034 "ready 503 / live 200 e2e in test/e2e/foundation.e2e-spec.ts"
# then:
Task: T036 "@SkipThrottle on HealthController" (parallel with T039 proxy config)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T006)
2. Complete Phase 2: Foundational (T007–T015) — **CRITICAL, blocks all stories**
3. Complete Phase 3: User Story 1 (T016–T023)
4. **STOP and VALIDATE**: Run quickstart Scenario 1 — server starts < 5s, `/health/live` 200, `/health/ready` 200 with DB up, structured logs with requestId emitted.
5. Deploy/demo if ready. MVP = runnable API skeleton with health + structured logging.

### Incremental Delivery

1. Setup + Foundational → infrastructure ready
2. Add US1 → test independently → **MVP delivered** (health + logging + DB)
3. Add US2 → test independently → Swagger auto-doc + validation 400
4. Add US3 → test independently → Helmet + strict CORS + rate limit + live/ready split
5. Polish → README, full quickstart run, strict build, lint, constitution re-check

### Parallel Team Strategy

With multiple developers after Foundational:

1. Team completes Setup + Foundational together (T001–T015)
2. Once Foundational done — US1 is the critical path (US2/US3 depend on its HealthController):
   - Developer A: US1 (T016–T023)
3. After US1 ready, split:
   - Developer B: US2 (T024–T030)
   - Developer C: US3 (T031–T040) — US2/US3 touch different files (decorators vs filters/main.ts) but both modify HealthController: coordinate T026/T027 (US2) vs T036 (US3) sequentially or merge carefully
4. Polish phase shared

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label (US1/US2/US3) maps task to user story for traceability; Setup/Foundational/Polish phases intentionally have NO story label
- Each user story is independently completable and testable per spec.md acceptance scenarios
- Write tests FIRST and confirm they FAIL before implementing (TDD for mandated e2e)
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- FR mapping: FR-001 (T001,T009,T010,T022,T023), FR-002 (T023,T026,T028), FR-003 (T014,T029,T030), FR-004 (T011,T012,T017), FR-005 (T015,T031), FR-006 (T015,T037,T032), FR-007 (T035,T033,T038), FR-008 (T020,T021), FR-009 (T018,T021), FR-010 (T003,T044), FR-011 (T006,T007,T008), FR-012 (T001,T005), FR-013 (T013,T030,T038)
- SC mapping: SC-001 (T041), SC-002 (T015,T031), SC-003 (T026,T028), SC-004 (T014,T029,T030)
- Plan perf-goal mapping: startup < 5s (T023), health endpoint < 100ms p95 (T046)
- Avoid: vague tasks, same-file conflicts (T026/T036 both touch HealthController — sequence them), cross-story dependencies that break independence
- Testcontainers deferred to later specs per plan.md note; foundation e2e uses a configured DATABASE_URL against a running PostgreSQL instance
