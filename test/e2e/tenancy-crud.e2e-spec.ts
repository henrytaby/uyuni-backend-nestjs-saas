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
import { ThrottlerGuard } from '@nestjs/throttler';
import { TENANT_CONTEXT_SOURCE } from '../../src/common/context/tenant-context-source.js';
import { testTenantContextSource } from './test-tenant-context-source.js';
import {
  setupTestDb,
  teardownTestDb,
  type TestDb,
} from './test-container.helper';

const ADMIN_HEADERS = {
  'x-test-platform-admin': 'true',
  'x-test-tenant-id': '00000000-0000-0000-0000-000000000000',
  'x-test-user-id': '00000000-0000-0000-0000-000000000001',
};

describe('Tenancy CRUD e2e (US2)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
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

  describe('Plans CRUD', () => {
    test('POST /tenancy/plans creates a plan', async () => {
      const res = await request(server)
        .post('/tenancy/plans')
        .set(ADMIN_HEADERS)
        .send({
          name: 'CrudTestPlan',
          tierLevel: 1,
          maxUsers: 10,
          storageLimit: 1073741824,
          moduleAccess: ['auth', 'tenancy'],
        });
      expect(res.status).toBe(201);
      planId = res.body.id;
      expect(res.body.name).toBe('CrudTestPlan');
    });

    test('GET /tenancy/plans lists plans', async () => {
      const res = await request(server)
        .get('/tenancy/plans')
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('GET /tenancy/plans/:id returns the plan', async () => {
      const res = await request(server)
        .get(`/tenancy/plans/${planId}`)
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('CrudTestPlan');
    });

    test('DELETE /tenancy/plans/:id on in-use plan returns 409', async () => {
      const tenant = await prisma.tenant.create({
        data: { name: 'PlanUserTenant', slug: 'plan-user-tenant', planId },
      });
      tenantId = tenant.id;

      const res = await request(server)
        .delete(`/tenancy/plans/${planId}`)
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(409);

      await prisma.tenant.delete({ where: { id: tenantId } });
    });

    test('DELETE /tenancy/plans/:id soft-deletes when not in use', async () => {
      const res = await request(server)
        .delete(`/tenancy/plans/${planId}`)
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });
  });

  describe('Tenants CRUD', () => {
    let newPlanId: string;

    beforeAll(async () => {
      const plan = await prisma.plan.create({
        data: {
          name: 'TenantCrudPlan',
          tierLevel: 2,
          maxUsers: 50,
          storageLimit: BigInt(10737418240),
          moduleAccess: ['auth'],
        },
      });
      newPlanId = plan.id;
    });

    test('POST /tenancy/tenants creates a tenant', async () => {
      const res = await request(server)
        .post('/tenancy/tenants')
        .set(ADMIN_HEADERS)
        .send({ name: 'CrudTenant', slug: 'crud-tenant', planId: newPlanId });
      expect(res.status).toBe(201);
      expect(res.body.paymentState).toBe('ACTIVO');
      tenantId = res.body.id;
    });

    test('GET /tenancy/tenants lists tenants', async () => {
      const res = await request(server)
        .get('/tenancy/tenants')
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('GET /tenancy/tenants/:id returns the tenant', async () => {
      const res = await request(server)
        .get(`/tenancy/tenants/${tenantId}`)
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('crud-tenant');
    });

    test('PATCH /tenancy/tenants/:id updates the tenant', async () => {
      const res = await request(server)
        .patch(`/tenancy/tenants/${tenantId}`)
        .set(ADMIN_HEADERS)
        .send({ name: 'UpdatedTenant' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('UpdatedTenant');
    });

    test('DELETE /tenancy/tenants/:id soft-deletes', async () => {
      const res = await request(server)
        .delete(`/tenancy/tenants/${tenantId}`)
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });
  });

  describe('Users CRUD', () => {
    test('POST /tenancy/users creates a user', async () => {
      const res = await request(server)
        .post('/tenancy/users')
        .set(ADMIN_HEADERS)
        .send({
          email: 'crud-test@uyuni.dev',
          password: 'TestPass123!',
          firstName: 'Crud',
          lastName: 'Test',
        });
      expect(res.status).toBe(201);
      expect(res.body.email).toBe('crud-test@uyuni.dev');
      expect(res.body.passwordHash).toBeUndefined();
      userId = res.body.id;
    });

    test('POST /tenancy/users duplicate email returns 409', async () => {
      const res = await request(server)
        .post('/tenancy/users')
        .set(ADMIN_HEADERS)
        .send({ email: 'crud-test@uyuni.dev', password: 'TestPass123!' });
      expect(res.status).toBe(409);
    });

    test('GET /tenancy/users lists users', async () => {
      const res = await request(server)
        .get('/tenancy/users')
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('GET /tenancy/users/:id returns the user', async () => {
      const res = await request(server)
        .get(`/tenancy/users/${userId}`)
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('crud-test@uyuni.dev');
    });

    test('PATCH /tenancy/users/:id updates the user', async () => {
      const res = await request(server)
        .patch(`/tenancy/users/${userId}`)
        .set(ADMIN_HEADERS)
        .send({ firstName: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Updated');
    });

    test('DELETE /tenancy/users/:id soft-deletes', async () => {
      const res = await request(server)
        .delete(`/tenancy/users/${userId}`)
        .set(ADMIN_HEADERS);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });
  });

  describe('TenantUser membership', () => {
    let memPlanId: string;
    let memTenantId: string;
    let memUserId: string;

    beforeAll(async () => {
      const plan = await prisma.plan.create({
        data: {
          name: 'MembershipPlan',
          tierLevel: 1,
          maxUsers: 10,
          storageLimit: BigInt(1073741824),
          moduleAccess: ['auth'],
        },
      });
      memPlanId = plan.id;

      const tenant = await prisma.tenant.create({
        data: {
          name: 'MembershipTenant',
          slug: 'membership-tenant',
          planId: memPlanId,
        },
      });
      memTenantId = tenant.id;

      const user = await prisma.user.create({
        data: { email: 'membership@uyuni.dev', passwordHash: 'hash' },
      });
      memUserId = user.id;
    });

    test('POST /tenancy/tenant-users creates a membership', async () => {
      const res = await request(server)
        .post('/tenancy/tenant-users')
        .set({
          'x-test-tenant-id': memTenantId,
          'x-test-user-id': memUserId,
        })
        .send({ tenantId: memTenantId, userId: memUserId, role: 'ADMIN' });
      expect(res.status).toBe(201);
      expect(res.body.role).toBe('ADMIN');
    });

    test('POST /tenancy/tenant-users duplicate returns 409', async () => {
      const res = await request(server)
        .post('/tenancy/tenant-users')
        .set({
          'x-test-tenant-id': memTenantId,
          'x-test-user-id': memUserId,
        })
        .send({ tenantId: memTenantId, userId: memUserId, role: 'EMPLEADO' });
      expect(res.status).toBe(409);
    });
  });

  describe('CUD endpoints reject non-platform-admin (plan B2 — platform-admin guard)', () => {
    let b2PlanId: string;
    let b2TenantId: string;
    let b2UserId: string;

    beforeAll(async () => {
      const plan = await testDb.adminPrisma.plan.create({
        data: {
          name: 'B2Plan',
          tierLevel: 1,
          maxUsers: 10,
          storageLimit: BigInt(1073741824),
          moduleAccess: ['auth'],
        },
      });
      b2PlanId = plan.id;

      const tenant = await testDb.adminPrisma.tenant.create({
        data: { name: 'B2Tenant', slug: 'b2-tenant', planId: b2PlanId },
      });
      b2TenantId = tenant.id;

      const user = await testDb.adminPrisma.user.create({
        data: { email: 'b2-user@uyuni.dev', passwordHash: 'hash' },
      });
      b2UserId = user.id;
    });

    test('POST /tenancy/plans rejects non-platform-admin', async () => {
      const res = await request(server)
        .post('/tenancy/plans')
        .set({
          'x-test-tenant-id': b2TenantId,
          'x-test-user-id': b2UserId,
        })
        .send({
          name: 'ForbiddenPlan',
          tierLevel: 1,
          maxUsers: 10,
          storageLimit: 1073741824,
          moduleAccess: ['auth'],
        });
      expect(res.status).toBe(403);
    });

    test('PATCH /tenancy/plans/:id rejects non-platform-admin', async () => {
      const res = await request(server)
        .patch(`/tenancy/plans/${b2PlanId}`)
        .set({
          'x-test-tenant-id': b2TenantId,
          'x-test-user-id': b2UserId,
        })
        .send({ name: 'UpdateForbidden' });
      expect(res.status).toBe(403);
    });

    test('DELETE /tenancy/plans/:id rejects non-platform-admin', async () => {
      const res = await request(server)
        .delete(`/tenancy/plans/${b2PlanId}`)
        .set({
          'x-test-tenant-id': b2TenantId,
          'x-test-user-id': b2UserId,
        });
      expect(res.status).toBe(403);
    });

    test('POST /tenancy/tenants rejects non-platform-admin', async () => {
      const res = await request(server)
        .post('/tenancy/tenants')
        .set({
          'x-test-tenant-id': b2TenantId,
          'x-test-user-id': b2UserId,
        })
        .send({ name: 'b2-tenant-2', slug: 'b2-tenant-2', planId: b2PlanId });
      expect(res.status).toBe(403);
    });

    test('PATCH /tenancy/tenants/:id rejects non-platform-admin', async () => {
      const res = await request(server)
        .patch(`/tenancy/tenants/${b2TenantId}`)
        .set({
          'x-test-tenant-id': b2TenantId,
          'x-test-user-id': b2UserId,
        })
        .send({ name: 'UpdateForbidden' });
      expect(res.status).toBe(403);
    });

    test('DELETE /tenancy/tenants/:id rejects non-platform-admin', async () => {
      const res = await request(server)
        .delete(`/tenancy/tenants/${b2TenantId}`)
        .set({
          'x-test-tenant-id': b2TenantId,
          'x-test-user-id': b2UserId,
        });
      expect(res.status).toBe(403);
    });

    test('POST /tenancy/users rejects non-platform-admin', async () => {
      const res = await request(server)
        .post('/tenancy/users')
        .set({
          'x-test-tenant-id': b2TenantId,
          'x-test-user-id': b2UserId,
        })
        .send({
          email: 'b2-new-user@uyuni.dev',
          password: 'TestPass123!',
        });
      expect(res.status).toBe(403);
    });

    test('PATCH /tenancy/users/:id rejects non-platform-admin', async () => {
      const res = await request(server)
        .patch(`/tenancy/users/${b2UserId}`)
        .set({
          'x-test-tenant-id': b2TenantId,
          'x-test-user-id': b2UserId,
        })
        .send({ firstName: 'UpdateForbidden' });
      expect(res.status).toBe(403);
    });

    test('DELETE /tenancy/users/:id rejects non-platform-admin', async () => {
      const res = await request(server)
        .delete(`/tenancy/users/${b2UserId}`)
        .set({
          'x-test-tenant-id': b2TenantId,
          'x-test-user-id': b2UserId,
        });
      expect(res.status).toBe(403);
    });
  });
});
