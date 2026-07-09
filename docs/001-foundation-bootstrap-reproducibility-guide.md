# 001-foundation-bootstrap — Guía de Reproducción

Documento de referencia para que un developer pueda reproducir desde cero el
esqueleto foundation del backend Uyuni SaaS y llegar al mismo resultado que el
commit `326baff` en la rama `main`.

---

## Prerequisitos

- Node.js 20+
- PostgreSQL 16+ ejecutándose y accesible
- Un usuario con privilegios CREATE en la base de datos destino
- npm

---

## Paso 1: Scaffold del proyecto NestJS 11

```bash
nest new uyuni-backend --package-manager npm
cd uyuni-backend
```

Eliminar los archivos generados por defecto que no se necesitan:

```bash
rm src/app.controller.ts src/app.service.ts src/app.controller.spec.ts test/app.e2e-spec.ts
```

---

## Paso 2: Estructura de directorios

Crear la estructura de carpetas que la constitución del proyecto exige:

```bash
mkdir -p src/common/config
mkdir -p src/common/filters
mkdir -p src/common/interceptors
mkdir -p src/infrastructure/prisma
mkdir -p src/infrastructure/logger
mkdir -p src/infrastructure/health/indicators
mkdir -p src/modules
mkdir -p test/e2e
mkdir -p test/fixtures
touch src/modules/.gitkeep
```

---

## Paso 3: Dependencias

### Producción

```bash
npm install @nestjs/platform-express @nestjs/swagger @nestjs/throttler @nestjs/terminus \
  @nestjs/config class-validator class-transformer helmet nestjs-pino pino pino-http \
  pino-pretty zod @prisma/client @prisma/adapter-pg pg
```

### Desarrollo

```bash
npm install -D prisma @types/helmet @nestjs/cli @nestjs/testing @types/express \
  @types/jest @types/node @types/supertest supertest jest ts-jest ts-loader \
  ts-node tsconfig-paths source-map-support eslint @eslint/js @eslint/eslintrc \
  eslint-config-prettier eslint-plugin-prettier globals typescript typescript-eslint \
  @nestjs/schematics prettier dotenv
```

---

## Paso 4: Configuración de TypeScript (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "strictBindCallApply": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Puntos clave:

- `module: "nodenext"` con `moduleResolution: "nodenext"` — requiere extensiones
  `.js` en los imports de TypeScript (ej: `import { X } from './module.js'`).
- `strict: true` + `noImplicitAny`, `strictNullChecks`, etc. — sin `any`.
- `target: "ES2023"` — Node 20+ soporta ES2023 nativamente.

---

## Paso 5: Configuración NestJS CLI (`nest-cli.json`)

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  },
  "plugins": [
    {
      "name": "@nestjs/swagger",
      "options": {
        "introspectComments": true
      }
    }
  ]
}
```

El plugin de Swagger auto-genera metadatos de DTOs desde los tipos TypeScript.

---

## Paso 6: Configuración de linting y formato

### `eslint.config.mjs`

```js
// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/', 'node_modules/', 'coverage/'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['test/**/*'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
```

Reglas `unsafe-*` como `warn` en src, deshabilitadas en test (supertest y
NestJS Testing usan `any` inevitablemente).

### `.prettierrc`

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

---

## Paso 7: Variables de entorno

### `.env.example` (se sube a git — plantilla sin credenciales)

```
# Uyuni SaaS Backend - Environment Configuration
# Copy to .env and fill in the values.

# === Required (no defaults) ===
DATABASE_URL=postgresql://user:pass@localhost:5432/uyuni
CORS_ORIGINS=http://localhost:4200
JWT_SECRET=dev-only-placeholder-change-me

# === Optional (with defaults) ===
PORT=3000
NODE_ENV=development

# JWT placeholders - real values set in authentication feature (spec 003)
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Rate limiting (per-IP). Window unit = seconds. Default: 100 req / 60s.
RATE_LIMIT_TTL=60
RATE_LIMIT_LIMIT=100

# Trust X-Forwarded-* headers (set true in production behind Nginx)
TRUST_PROXY=false

# Pino log level: fatal | error | warn | info | debug | trace
LOG_LEVEL=info
```

### `.env` (local, NO se sube a git)

Copiar `.env.example` y completar con los valores reales:

```bash
cp .env.example .env
# Editar .env con DATABASE_URL real
```

### `.env.test` (local, NO se sube a git)

Para los e2e tests, usar un RATE_LIMIT_LIMIT bajo para poder probar el 429:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/uyuni
CORS_ORIGINS=http://localhost:4200
JWT_SECRET=dev-only-placeholder-change-me
PORT=3000
NODE_ENV=test
RATE_LIMIT_TTL=60
RATE_LIMIT_LIMIT=5
TRUST_PROXY=false
LOG_LEVEL=warn
```

---

## Paso 8: `.gitignore`

```gitignore
# Dependencies
node_modules/

# Build output
dist/
build/

# Environment (never commit secrets)
.env
.env.*
!.env.example

# Logs
*.log
logs/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
*.tmp

# Test artifacts
coverage/
.cache/

# NestJS
*.tsbuildinfo

# Prisma local generation
prisma/*.db
prisma/*.db-journal

# Local Spec-Driven Development state (active feature pointer — not shared)
.specify/feature.json

# Local tooling caches
.kilocode/
```

---

## Paso 9: Prisma

### `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}
```

Nota: Prisma 7.x ya no usa `url = env("DATABASE_URL")` en el schema. La URL
se configura en `prisma.config.ts`.

### `prisma.config.ts` (raíz del proyecto)

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
```

Importante: NO incluir un fallback con credenciales hardcodeadas en
`process.env.DATABASE_URL ?? "postgresql://postgres:..."`. Si falta la
variable, que falle con error claro.

### Migración inicial

```bash
npx prisma migrate dev --name init
```

Esto crea la tabla `_prisma_migrations` y la carpeta
`prisma/migrations/20260708180000_init/` con un SQL vacío (solo baseline).

### Generar el cliente

```bash
npx prisma generate
```

---

## Paso 10: Código fuente — archivo por archivo

### `src/common/config/env.validation.ts`

Validación de variables de entorno con Zod. Fail-fast en bootstrap si falta
alguna variable requerida. `z.infer<typeof envSchema>` produce el tipo
`EnvConfig` — fuente única de verdad (DRY).

```ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .url('DATABASE_URL must be a valid URL'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),
  TRUST_PROXY: z.coerce.boolean().default(false),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(
  config: Record<string, unknown> | NodeJS.ProcessEnv,
): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment configuration validation failed:\n${issues}`);
  }
  return parsed.data;
}
```

### `src/common/filters/global-exception.filter.ts`

Normaliza TODOS los errores a un shape JSON consistente. Maneja explícitamente:
`ZodError`, `ThrottlerException`, `HttpException`, y errores desconocidos.
En 429 agrega header `Retry-After` con el TTL configurado.

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ThrottlerException } from '@nestjs/throttler';

interface NormalizedError {
  statusCode: number;
  message: string | string[];
  error: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly httpAdapter: HttpAdapterHost['httpAdapter'];
  private readonly rateLimitTtl: number;

  constructor(httpAdapterHost: HttpAdapterHost, configService: ConfigService) {
    this.httpAdapter = httpAdapterHost.httpAdapter;
    this.rateLimitTtl = configService.get<number>('RATE_LIMIT_TTL', 60);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const normalized = this.normalize(exception);
    const requestId = request.id ?? null;
    const timestamp = new Date().toISOString();
    const path = request.url;

    const body: Record<string, unknown> = {
      statusCode: normalized.statusCode,
      message: normalized.message,
      error: normalized.error,
      timestamp,
      path,
      requestId,
    };

    if (normalized.statusCode === 429) {
      response.setHeader('Retry-After', String(this.rateLimitTtl));
    }
    const method = request.method;
    const url = request.url;
    if (normalized.statusCode >= 500) {
      this.logger.error(
        `[${requestId ?? '-'}] ${method} ${url} -> ${normalized.statusCode} ${normalized.error}`,
      );
    } else if (normalized.statusCode >= 400) {
      this.logger.warn(
        `[${requestId ?? '-'}] ${method} ${url} -> ${normalized.statusCode} ${normalized.error}`,
      );
    }
    void this.httpAdapter;
    response.status(normalized.statusCode).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: exception.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
        error: 'Bad Request',
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'ThrottlerException: Too Many Requests',
        error: 'Too Many Requests',
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message: string | string[];
      let error: string;
      if (typeof res === 'string') {
        message = res;
        error = exception.name;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as { message?: string | string[]; error?: string };
        message = r.message ?? exception.message;
        error = r.error ?? String(HttpStatus[status] ?? exception.name);
      } else {
        message = exception.message;
        error = exception.name;
      }
      return { statusCode: status, message, error };
    }
    const message =
      exception instanceof Error ? exception.message : String(exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      error: 'Internal Server Error',
    };
  }
}
```

### `src/common/interceptors/request-context.interceptor.ts`

Interceptor que almacena `requestId`, `ip`, `tenantId`, `userId` en
`AsyncLocalStorage` para uso futuro por specs 002-003.

```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface RequestContext {
  requestId?: string;
  ip?: string;
  tenantId: string | null;
  userId: string | null;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestContextInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      id?: string;
      ip?: string;
      method?: string;
      url?: string;
    }>();
    const ctx: RequestContext = {
      requestId: request.id,
      ip: request.ip,
      tenantId: null,
      userId: null,
    };
    const start = Date.now();
    return requestContextStorage.run(ctx, () =>
      next.handle().pipe(
        tap(() => {
          const ms = Date.now() - start;
          this.logger.debug(
            `[${ctx.requestId ?? '-'}] ${request.method ?? 'HTTP'} ${request.url ?? '/'} ${ms}ms`,
          );
        }),
      ),
    );
  }
}
```

### `src/infrastructure/logger/logger.module.ts`

Logger estructurado con nestjs-pino. Emite JSON con `requestId`, `ip`,
`tenantId`, `userId`, `method`, `url`, `statusCode`, `responseTime`.
En development usa `pino-pretty` para logs legibles.

```ts
import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LevelWithSilent } from 'pino';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logLevel = configService.get<string>('LOG_LEVEL', 'info');
        const isDev =
          configService.get<string>('NODE_ENV', 'development') === 'development';
        return {
          pinoHttp: {
            level: logLevel,
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: false },
                }
              : undefined,
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const existingId = (req as { id?: string }).id;
              if (existingId) return existingId;
              const newId = randomUUID();
              (res as { id?: string }).id = newId;
              return newId;
            },
            customLogLevel: (
              _req: IncomingMessage,
              res: ServerResponse,
              err?: Error,
            ): LevelWithSilent => {
              if (err || res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },
            serializers: {
              req: (req: IncomingMessage) => ({
                id: (req as { id?: string }).id,
                method: req.method,
                url: req.url,
                remoteAddress: req.socket?.remoteAddress ?? null,
              }),
              res: (res: ServerResponse) => ({
                statusCode: res.statusCode,
              }),
            },
            customProps: (req: IncomingMessage) => ({
              requestId: (req as { id?: string }).id ?? null,
              ip:
                (req as { ip?: string }).ip ??
                req.socket?.remoteAddress ??
                null,
              tenantId: null,
              userId: null,
            }),
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
```

Nota de debugging: `req.socket?.remoteAddress` usa optional chaining porque
`socket` puede ser `undefined` en ciertos contextos de pino-http. Sin el `?.`,
la aplicación crashea con 500 en cada request.

### `src/infrastructure/prisma/prisma.module.ts`

Módulo global que exporta `PrismaService` para toda la aplicación.

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### `src/infrastructure/prisma/prisma.service.ts`

Usa el adapter `PrismaPg` (Prisma 7.x con driver `pg`) en vez de la conexión
por defecto del datasource. En caso de falla de conexión, hace `process.exit(1)`
para evitar que el server quede colgado sin DB.

```ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const url = configService.get<string>('DATABASE_URL');
    const adapter = new PrismaPg({ connectionString: url });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('PrismaService connected to PostgreSQL');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.fatal(
        `Failed to connect to PostgreSQL — exiting: ${message}`,
      );
      process.exit(1);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('PrismaService disconnected from PostgreSQL');
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
```

### `src/infrastructure/health/indicators/prisma-health.indicator.ts`

Ejecuta `SELECT 1` vía `$queryRaw`. Si falla, incluye el `message` del error
en la respuesta 503.

```ts
import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ping(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.ping();
      return this.getStatus(key, true, { status: 'up' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = this.getStatus(key, false, { status: 'down', message });
      throw new HealthCheckError('PrismaHealthIndicator failed', result);
    }
  }
}
```

### `src/infrastructure/health/health.module.ts`

```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { PrismaHealthIndicator } from './indicators/prisma-health.indicator.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [TerminusModule, PrismaModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator],
})
export class HealthModule {}
```

### `src/infrastructure/health/health.controller.ts`

Dos endpoints:
- `GET /health/live` — liveness, siempre 200, sin dependencias
- `GET /health/ready` — readiness, 200 si DB ok, 503 si DB caída

Ambos exentos de rate limiting con `@SkipThrottle()`.

```ts
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaHealthIndicator } from './indicators/prisma-health.indicator.js';

interface ReadinessResponse extends Partial<HealthCheckResult> {
  timestamp: string;
}

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({
    status: 200,
    description: 'Process is alive',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-07-07T12:00:00.000Z' },
      },
    },
  })
  liveness(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — checks DB connectivity' })
  @ApiResponse({
    status: 200,
    description: 'Database is connected',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        info: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: { status: { type: 'string', example: 'up' } },
            },
          },
        },
        error: { type: 'object' },
        details: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: { status: { type: 'string', example: 'up' } },
            },
          },
        },
        timestamp: { type: 'string', example: '2026-07-07T12:00:00.000Z' },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Database is unavailable',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        info: { type: 'object' },
        error: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'down' },
                message: { type: 'string', example: 'Connection refused' },
              },
            },
          },
        },
        details: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'down' },
                message: { type: 'string', example: 'Connection refused' },
              },
            },
          },
        },
        timestamp: { type: 'string', example: '2026-07-07T12:00:00.000Z' },
      },
    },
  })
  async readiness(): Promise<ReadinessResponse> {
    const result: HealthCheckResult = await this.health.check([
      async () => this.prismaIndicator.ping('database'),
    ]);
    return { ...result, timestamp: new Date().toISOString() };
  }
}
```

### `src/app.module.ts`

Root module. Registra: `ConfigModule` (Zod validate), `ThrottlerModule`
(configurable desde env), `LoggerModule`, `PrismaModule`, `HealthModule`.
Provee `ThrottlerGuard` como guard global.

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { validate } from './common/config/env.validation.js';
import { LoggerModule } from './infrastructure/logger/logger.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { HealthModule } from './infrastructure/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: (env) => validate(env),
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('RATE_LIMIT_TTL', 60) * 1000,
          limit: configService.get<number>('RATE_LIMIT_LIMIT', 100),
        },
      ],
    }),
    LoggerModule,
    PrismaModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

Nota: `ThrottlerModule` v6 usa TTL en **milisegundos**. La env var
`RATE_LIMIT_TTL` está en **segundos**, por eso se multiplica por 1000.

### `src/main.ts`

Bootstrap. Orden importante:
1. `helmet()` — headers de seguridad
2. `trust proxy` — para que `req.ip` funcione detrás de Nginx
3. CORS — parsea `CORS_ORIGINS` separado por comas
4. `ValidationPipe` — global, whitelist + forbidNonWhitelisted
5. `GlobalExceptionFilter` — con `ConfigService` para el Retry-After
6. Swagger — DocumentBuilder + setup
7. `app.listen()`

```ts
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Express, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const trustProxy = configService.get<boolean>('TRUST_PROXY', false);
  const rawOrigins = configService.get<string>('CORS_ORIGINS', '');

  const expressInstance = app.getHttpAdapter().getInstance() as Express;
  app.use(helmet());
  expressInstance.set('trust proxy', trustProxy);

  const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  app.enableCors({ origin: allowedOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(
    new GlobalExceptionFilter(httpAdapterHost, configService),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Uyuni SaaS Backend')
    .setDescription(
      'REST API for the Uyuni SaaS platform — foundation (spec 001).',
    )
    .setVersion('0.0.1')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Uyuni API Docs',
  });
  expressInstance.get('/api/docs-json', (_req: Request, res: Response) => {
    res.json(document);
  });

  await app.listen(port);
  logger.log(`Uyuni backend listening on http://localhost:${port}`);
  logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
  logger.log(`OpenAPI JSON at http://localhost:${port}/api/docs-json`);
}

void bootstrap().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({ level: 'error', msg: `Bootstrap failed: ${msg}` }),
  );
  process.exit(1);
});
```

---

## Paso 11: Tests e2e

### `test/setup-e2e.ts`

Carga variables de entorno antes de los tests. Prefiere `.env.test`, fallback a
`.env`.

```ts
import { config } from 'dotenv';

try {
  const result = config({ path: '.env.test' });
  if (result.error) {
    config({ path: '.env' });
  }
} catch {
  config({ path: '.env' });
}
```

### `test/jest-e2e.json`

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "setupFiles": ["<rootDir>/setup-e2e.ts"],
  "transform": {
    "^.+\\.(t|j)s$": ["ts-jest", { "tsconfig": "tsconfig.json" }]
  },
  "moduleNameMapper": {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
}
```

### `test/fixtures/validation-sample.controller.ts`

Controller temporal (solo en tests) para ejercitar el path 400 del
ValidationPipe. Se elimina cuando el spec 002 agregue el primer DTO real.

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SampleDto {
  @IsString()
  @MinLength(3)
  name!: string;
}

@ApiTags('test-validation')
@Controller('test-validation')
export class ValidationSampleController {
  @Post()
  @ApiOperation({
    summary: 'Sample endpoint to exercise the global ValidationPipe',
  })
  @ApiResponse({ status: 201, description: 'Valid payload accepted' })
  @ApiResponse({
    status: 400,
    description: 'Invalid payload rejected by ValidationPipe',
  })
  create(@Body() dto: SampleDto): { name: string } {
    return { name: dto.name };
  }
}
```

### `test/e2e/foundation.e2e-spec.ts`

12 tests que cubren las 3 user stories + performance:

- **US1**: liveness 200, structured log, readiness 200
- **US2**: Swagger JSON paths, Swagger UI HTML, validation 400, valid payload 201
- **US3**: security headers, CORS allow/block, rate limit 429+Retry-After,
  liveness siempre 200
- **Performance**: p95 ≤ 200ms en health endpoints

El test configura la app replicando `main.ts` (helmet, CORS, ValidationPipe,
GlobalExceptionFilter, Swagger) y registra un `ValidationTestModule` con el
controller temporal.

Ver el archivo completo en el repositorio: `test/e2e/foundation.e2e-spec.ts`.

---

## Paso 12: Verificación final

```bash
# Build sin errores
npm run build

# Lint sin errores
npm run lint

# E2E tests (requiere PostgreSQL corriendo y .env configurado)
npm run test:e2e

# Servidor en modo desarrollo
npm run start:dev
```

Validar manualmente:

```bash
# Liveness
curl http://localhost:3000/health/live
# {"status":"ok","timestamp":"..."}

# Readiness
curl http://localhost:3000/health/ready
# {"status":"ok","info":{"database":{"status":"up"}},...}

# Swagger UI
open http://localhost:3000/api/docs

# OpenAPI JSON
curl http://localhost:3000/api/docs-json | python3 -m json.tool | grep '"paths"'
```

---

## Lecciones aprendidas y notas de debugging

### 1. `req.socket?.remoteAddress` — Optional chaining obligatorio

El serializer de pino-http recibe un `IncomingMessage` cuyo `socket` puede ser
`undefined` en ciertos contextos internos. Sin `?.`, cada request crashea con:

```
Cannot read properties of undefined (reading 'remoteAddress')
```

### 2. `@SkipThrottle()` en HealthController

Sin `@SkipThrottle()`, el rate limit bloquea los health probes después de
N requests. Kubernetes reiniciaría el pod por falla del liveness probe.

### 3. Prisma 7.x — `url` ya no va en el schema

El schema `prisma/schema.prisma` NO debe tener `url = env("DATABASE_URL")`.
Prisma 7.x lo rechaza con error de validación. La URL se configura en
`prisma.config.ts` (raíz) usando `defineConfig({ datasource: { url } })`.

### 4. ThrottlerModule TTL en milisegundos

`@nestjs/throttler` v6 usa milisegundos. `RATE_LIMIT_TTL` está en segundos.
Multiplicar por 1000 al registrar el módulo:

```ts
ttl: configService.get<number>('RATE_LIMIT_TTL', 60) * 1000,
```

### 5. CORS — único owner en `main.ts`

CORS se configura **solo** en `main.ts` (T037). No duplicar en otros lugares.
Helmet no configura CORS — son concerns separados.

### 6. `GlobalExceptionFilter` necesita `ConfigService`

El filter necesita `RATE_LIMIT_TTL` para el header `Retry-After`. Se inyecta
`ConfigService` en el constructor. En `main.ts` se pasa explícitamente:

```ts
app.useGlobalFilters(new GlobalExceptionFilter(httpAdapterHost, configService));
```

### 7. Test e2e — Swagger setup manual

El test NO usa `main.ts` directamente. Debe configurar Swagger manualmente en
el `beforeAll` (DocumentBuilder + SwaggerModule.setup + express route para
`/api/docs-json`). Sin esto, los endpoints de Swagger retornan 404 en los
tests.

### 8. ESLint — reglas unsafe relajadas en test/

Supertest y NestJS Testing usan `any` extensivamente. Sin relajar las reglas
`no-unsafe-*` para `test/**/*`, hay decenas de falsos positivos.

### 9. `prisma.config.ts` — sin fallback de credenciales

NO incluir `process.env.DATABASE_URL ?? "postgresql://postgres:..."`. El
fallback expone credenciales en el repo. Si falta la variable, que falle con
un error claro en lugar de conectar a una DB incorrecta.

---

## Estructura final del proyecto

```
uyuni-backend/
├── .env                          # Local, NO se sube a git
├── .env.example                  # Plantilla segura, sí se sube
├── .env.test                     # Local, NO se sube a git
├── .gitignore
├── .prettierrc
├── eslint.config.mjs
├── nest-cli.json
├── package.json
├── package-lock.json
├── prisma.config.ts
├── tsconfig.json
├── tsconfig.build.json
├── README.md
├── docs/
│   └── uyuni-saas-constitution.md
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── 20260708180000_init/
│           ├── migration.sql
│           └── migration.toml
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── config/
│   │   │   └── env.validation.ts
│   │   ├── filters/
│   │   │   └── global-exception.filter.ts
│   │   └── interceptors/
│   │       └── request-context.interceptor.ts
│   ├── infrastructure/
│   │   ├── health/
│   │   │   ├── health.controller.ts
│   │   │   ├── health.module.ts
│   │   │   └── indicators/
│   │   │       └── prisma-health.indicator.ts
│   │   ├── logger/
│   │   │   └── logger.module.ts
│   │   └── prisma/
│   │       ├── prisma.module.ts
│   │       └── prisma.service.ts
│   └── modules/
│       └── .gitkeep
├── test/
│   ├── jest-e2e.json
│   ├── setup-e2e.ts
│   ├── e2e/
│   │   └── foundation.e2e-spec.ts
│   └── fixtures/
│       └── validation-sample.controller.ts
└── specs/                        # Documentación de diseño (12 specs)
    ├── 001-foundation-bootstrap/
    │   ├── spec.md
    │   ├── plan.md
    │   ├── research.md
    │   ├── data-model.md
    │   ├── quickstart.md
    │   ├── tasks.md
    │   ├── checklists/
    │   │   └── requirements.md
    │   └── contracts/
    │       └── health.md
    ├── 002-multi-tenancy-core/
    ├── 003-authentication/
    └── ... (hasta 012-basic-inventory)
```
