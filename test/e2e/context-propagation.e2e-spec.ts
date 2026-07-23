import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import helmet from 'helmet';
import type { Express } from 'express';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { TENANT_CONTEXT_SOURCE } from '../../src/common/context/tenant-context-source.js';
import { testTenantContextSource } from './test-tenant-context-source.js';
import {
  setupTestDb,
  teardownTestDb,
  type TestDb,
} from './test-container.helper';
import { TenantContextService } from '../../src/common/context/tenant-context.js';

describe('Context propagation e2e (US3)', () => {
  let app: INestApplication;
  let testDb: TestDb;

  let planId: string;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    process.env.DATABASE_URL = testDb.databaseUrl;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TENANT_CONTEXT_SOURCE)
      .useValue(testTenantContextSource)
      .compile();

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
    await teardownTestDb(testDb);
  });

  describe('context-based created_by_id auto-population', () => {
    test('TenantUser create auto-populates createdById from context', async () => {
      const plan = await testDb.adminPrisma.plan.create({
        data: {
          name: 'ContextTestPlan',
          tierLevel: 1,
          maxUsers: 10,
          storageLimit: BigInt(1073741824),
          moduleAccess: ['auth'],
        },
      });
      planId = plan.id;

      const tenant = await testDb.adminPrisma.tenant.create({
        data: { name: 'ContextTenant', slug: 'context-tenant', planId },
      });
      tenantId = tenant.id;

      const user = await testDb.adminPrisma.user.create({
        data: { email: 'ctx-user@uyuni.dev', passwordHash: 'hash' },
      });
      userId = user.id;

      const res = await request(app.getHttpServer())
        .post('/tenancy/tenant-users')
        .set('x-test-tenant-id', tenantId)
        .set('x-test-user-id', userId)
        .send({ tenantId, userId, role: 'ADMIN' });

      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe(tenantId);

      const membership = await testDb.adminPrisma.tenantUser.findUnique({
        where: { id: res.body.id },
      });
      expect(membership?.createdById).toBe(userId);
    });
  });

  describe('concurrent request isolation', () => {
    test('concurrent requests with different tenant contexts are isolated', async () => {
      const tenant2 = await testDb.adminPrisma.tenant.create({
        data: { name: 'ContextTenant2', slug: 'context-tenant-2', planId },
      });
      const user2 = await testDb.adminPrisma.user.create({
        data: { email: 'ctx-user2@uyuni.dev', passwordHash: 'hash' },
      });

      await request(app.getHttpServer())
        .post('/tenancy/tenant-users')
        .set('x-test-tenant-id', tenantId)
        .set('x-test-user-id', userId)
        .send({ tenantId, userId, role: 'ADMIN' });

      await request(app.getHttpServer())
        .post('/tenancy/tenant-users')
        .set('x-test-tenant-id', tenant2.id)
        .set('x-test-user-id', user2.id)
        .send({ tenantId: tenant2.id, userId: user2.id, role: 'EMPLEADO' });

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .get('/tenancy/tenant-users')
          .set('x-test-tenant-id', tenantId)
          .set('x-test-user-id', userId),
        request(app.getHttpServer())
          .get('/tenancy/tenant-users')
          .set('x-test-tenant-id', tenant2.id)
          .set('x-test-user-id', user2.id),
      ]);

      const tenantIds1 = res1.body.data.map(
        (tu: { tenantId: string }) => tu.tenantId,
      );
      const tenantIds2 = res2.body.data.map(
        (tu: { tenantId: string }) => tu.tenantId,
      );

      expect(tenantIds1.every((id: string) => id === tenantId)).toBe(true);
      expect(tenantIds2.every((id: string) => id === tenant2.id)).toBe(true);
    });
  });

  describe('SC-004: context propagation overhead < 1ms per request', () => {
    test('benchmark raw AsyncLocalStorage run overhead (< 1ms)', async () => {
      const samples: number[] = [];
      const tenantContextService = app.get(TenantContextService);

      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await tenantContextService.run(
          {
            requestId: `bench-${i}`,
            tenantId: tenantId,
            userId: userId,
            isPlatformAdmin: false,
          },
          () => Promise.resolve(1),
        );
        samples.push(performance.now() - start);
      }

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(avg).toBeLessThan(1);
    });

    test('tenant-scoped HTTP request latency smoke test', async () => {
      const samples: number[] = [];
      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await request(app.getHttpServer())
          .get('/tenancy/tenant-users')
          .set('x-test-tenant-id', tenantId)
          .set('x-test-user-id', userId);
        samples.push(performance.now() - start);
      }

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(avg).toBeLessThan(100);
    });
  });
});
