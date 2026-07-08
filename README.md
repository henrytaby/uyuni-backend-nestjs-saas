# Uyuni SaaS Backend

NestJS 11 backend for the Uyuni SaaS platform.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- npm

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment** (see `.env.example`):
   ```bash
   cp .env.example .env
   # Edit .env — set DATABASE_URL and CORS_ORIGINS at minimum
   ```

3. **Apply the initial migration**:
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Start the server**:
   ```bash
   npm run start:dev
   ```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | yes | — | PostgreSQL connection string |
| CORS_ORIGINS | yes | — | Comma-separated allowed origins |
| JWT_SECRET | yes | — | Placeholder for auth feature (spec 003) |
| PORT | no | 3000 | HTTP listen port |
| NODE_ENV | no | development | Environment |
| RATE_LIMIT_TTL | no | 60 | Rate limit window (seconds) |
| RATE_LIMIT_LIMIT | no | 100 | Max requests per window per IP |
| TRUST_PROXY | no | false | Trust X-Forwarded-* headers (prod behind Nginx) |
| LOG_LEVEL | no | info | Pino log level |

## API Documentation

- **Swagger UI**: http://localhost:3000/api/docs
- **OpenAPI JSON**: http://localhost:3000/api/docs-json

## Health Endpoints

- **Liveness** (`GET /health/live`): Returns 200 when the process is running.
- **Readiness** (`GET /health/ready`): Returns 200 when DB is connected, 503 otherwise.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run start:dev` | Start with hot reload |
| `npm run lint` | ESLint + Prettier |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run prisma:migrate` | Run Prisma migrations |
| `npm run prisma:generate` | Generate Prisma client |
