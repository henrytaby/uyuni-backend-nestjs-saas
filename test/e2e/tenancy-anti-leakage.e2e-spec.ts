import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import helmet from 'helmet';
import type { Express } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

import { setupTestDb, teardownTestDb, TestDb } from './test-container.helper';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TENANT_CONTEXT_SOURCE } from '../../src/common/context/tenant-context-source.js';
import { testTenantContextSource } from './test-tenant-context-source.js';
import { TenantContextService } from '../../src/common/context/tenant-context.js';

describe('Tenancy anti-leakage e2e (US1 - FR-009/SC-001 CI gate)', () => {
  let app: INestApplication;
  let server: Server;
  let testDb: TestDb;
  let prisma: PrismaService;

  let planId: string;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let membershipBId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    process.env.DATABASE_URL = testDb.databaseUrl;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(TENANT_CONTEXT_SOURCE)
      .useValue(testTenantContextSource)
      .compile();

    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance() as Express;
    app.use(helmet());
    server = app.getHttpServer();

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
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
    await teardownTestDb(testDb);
  });

  describe('Setup: seed two tenants with memberships', () => {
    test('creates plan, tenants, users, and memberships', async () => {
      const seed = testDb.adminPrisma;
      const plan = await seed.plan.create({
        data: {
          name: 'AntiLeakTestPlan',
          tierLevel: 1,
          maxUsers: 100,
          storageLimit: BigInt(1073741824),
          moduleAccess: ['auth', 'tenancy'],
        },
      });
      planId = plan.id;

      const tenantA = await seed.tenant.create({
        data: { name: 'Tenant A', slug: 'tenant-a-anti', planId },
      });
      tenantAId = tenantA.id;

      const tenantB = await seed.tenant.create({
        data: { name: 'Tenant B', slug: 'tenant-b-anti', planId },
      });
      tenantBId = tenantB.id;

      const userA = await seed.user.create({
        data: {
          email: 'user-a-anti@uyuni.dev',
          passwordHash: 'hash',
          firstName: 'User',
          lastName: 'A',
        },
      });
      userAId = userA.id;

      const userB = await seed.user.create({
        data: {
          email: 'user-b-anti@uyuni.dev',
          passwordHash: 'hash',
          firstName: 'User',
          lastName: 'B',
        },
      });
      userBId = userB.id;

      await seed.tenantUser.create({
        data: { tenantId: tenantAId, userId: userAId, role: 'ADMIN' },
      });

      const memB = await seed.tenantUser.create({
        data: { tenantId: tenantBId, userId: userBId, role: 'ADMIN' },
      });
      membershipBId = memB.id;
    });
  });

  describe('SC-001: (a) GET /tenancy/tenant-users as Tenant A returns only A memberships', () => {
    test('Tenant A sees only their own memberships', async () => {
      const res = await request(server)
        .get('/tenancy/tenant-users')
        .set('x-test-tenant-id', tenantAId)
        .set('x-test-user-id', userAId);

      expect(res.status).toBe(200);
      const tenantIds = res.body.data.map(
        (tu: { tenantId: string }) => tu.tenantId,
      );
      expect(tenantIds.every((id: string) => id === tenantAId)).toBe(true);
      expect(tenantIds.some((id: string) => id === tenantBId)).toBe(false);
    });
  });

  describe('SC-001: (b) GET /tenancy/tenant-users/:bMembershipId as Tenant A returns 404', () => {
    test('Tenant A cannot see Tenant B membership by ID', async () => {
      const res = await request(server)
        .get(`/tenancy/tenant-users/${membershipBId}`)
        .set('x-test-tenant-id', tenantAId)
        .set('x-test-user-id', userAId);

      expect(res.status).toBe(404);
    });
  });

  describe('SC-001: (c) POST /tenancy/tenant-users with forged tenantId overrides to Tenant A', () => {
    test('Forged tenantId is overridden by context', async () => {
      const newUser = await prisma.user.create({
        data: {
          email: 'forged-user@uyuni.dev',
          passwordHash: 'hash',
        },
      });

      const res = await request(server)
        .post('/tenancy/tenant-users')
        .set('x-test-tenant-id', tenantAId)
        .set('x-test-user-id', userAId)
        .send({
          tenantId: tenantBId,
          userId: newUser.id,
          role: 'EMPLEADO',
        });

      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe(tenantAId);
    });
  });

  describe('SC-001: (d) platform admin bypass reads cross-tenant', () => {
    test('Platform admin can see cross-tenant data', async () => {
      const res = await request(server)
        .get('/tenancy/tenant-users')
        .set('x-test-platform-admin', 'true')
        .set('x-test-tenant-id', tenantAId)
        .set('x-test-user-id', userAId);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('SC-001: (e) concurrent requests with different tenant contexts are isolated', () => {
    test('AsyncLocalStorage isolation between concurrent requests', async () => {
      const [resA, resB] = await Promise.all([
        request(server)
          .get('/tenancy/tenant-users')
          .set('x-test-tenant-id', tenantAId)
          .set('x-test-user-id', userAId),
        request(server)
          .get('/tenancy/tenant-users')
          .set('x-test-tenant-id', tenantBId)
          .set('x-test-user-id', userBId),
      ]);

      const tenantIdsA = resA.body.data.map(
        (tu: { tenantId: string }) => tu.tenantId,
      );
      const tenantIdsB = resB.body.data.map(
        (tu: { tenantId: string }) => tu.tenantId,
      );

      expect(tenantIdsA.every((id: string) => id === tenantAId)).toBe(true);
      expect(tenantIdsB.every((id: string) => id === tenantBId)).toBe(true);
    });
  });

  describe('SC-001: (f) GET /tenancy/tenants/:otherTenantId as Tenant A returns 404', () => {
    test('Tenant A cannot access Tenant B via GET /tenancy/tenants/:id', async () => {
      const res = await request(server)
        .get(`/tenancy/tenants/${tenantBId}`)
        .set('x-test-tenant-id', tenantAId)
        .set('x-test-user-id', userAId);

      expect(res.status).toBe(404);
    });

    test('Tenant A can access their own tenant via GET /tenancy/tenants/:id', async () => {
      const res = await request(server)
        .get(`/tenancy/tenants/${tenantAId}`)
        .set('x-test-tenant-id', tenantAId)
        .set('x-test-user-id', userAId);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tenantAId);
    });
  });

  describe('SC-004: context propagation overhead < 1ms per request', () => {
    test('raw AsyncLocalStorage run overhead is < 1ms', async () => {
      const samples: number[] = [];
      const tenantContextService = app.get(TenantContextService);

      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await tenantContextService.run(
          {
            requestId: `bench-${i}`,
            tenantId: tenantAId,
            userId: userAId,
            isPlatformAdmin: false,
          },
          () => Promise.resolve(1),
        );
        samples.push(performance.now() - start);
      }

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(avg).toBeLessThan(1);
    });
  });
});
