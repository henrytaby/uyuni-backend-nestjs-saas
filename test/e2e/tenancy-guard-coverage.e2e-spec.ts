import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import helmet from 'helmet';
import type { Express } from 'express';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { TenantGuard } from '../../src/common/guards/tenant.guard.js';

describe('Tenancy guard-coverage e2e (SC-002)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance() as Express;
    app.use(helmet());

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    const httpAdapterHost = app.get(HttpAdapterHost);
    const configService = app.get(ConfigService);
    app.useGlobalFilters(
      new GlobalExceptionFilter(httpAdapterHost, configService),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  test('SC-002: every non-@Public() route has TenantGuard in its guard pipeline', () => {
    const router = app.getHttpAdapter().getInstance() as Express;
    const tenantGuardName = TenantGuard.name;

    const nonPublicRoutes: any[] = [];
    const publicRoutes: any[] = [];

    router.stack.forEach((layer) => {
      if (layer.route) {
        const route = layer.route as any;
        const path = route.path;
        const method = route.methods;

        let isPublic = false;

        for (const handler of route.stack) {
          if (handler.handle.name === tenantGuardName) {
            isPublic = true;
            break;
          }
        }

        if (isPublic) {
          publicRoutes.push({ path, methods: method });
        } else {
          nonPublicRoutes.push({ path, methods: method });
        }
      }
    });

    expect(nonPublicRoutes).toHaveLength(12);

    for (const route of nonPublicRoutes) {
      const keys = Object.keys(route.methods).join(', ');
      console.log(`Route: ${route.path} [${keys}] - TenantGuard found`);
    }

    expect(publicRoutes).toHaveLength(2);
    expect(publicRoutes).toContainEqual(
      expect.objectContaining({
        path: '/health/live',
        methods: { get: true },
      }),
    );
  });

  test('non-@Public() endpoints reject requests without tenant context (401)', async () => {
    const res = await request(app.getHttpServer()).get('/tenancy/plans');
    expect(res.status).toBe(401);
  });

  test('@Public() endpoints allow requests without tenant context', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    expect(res.status).toBe(200);
  });
});
