import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import {
  setupTestDb,
  teardownTestDb,
  cleanTestDb,
  TestDb,
} from '../e2e/test-container.helper.js';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

describe('Audit Columns Auto-injection (e2e)', () => {
  let app: INestApplication;
  let testDb: TestDb;
  let userId: string;
  let tenantId: string;
  let accessToken: string;

  const testEmail = 'audit2@example.com';
  const testPassword = 'password123';

  beforeAll(async () => {
    testDb = await setupTestDb();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = 'test-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await cleanTestDb(testDb.adminPrisma);

    const hashedPassword = await bcrypt.hash(testPassword, 10);
    const user = await testDb.adminPrisma.user.create({
      data: {
        email: testEmail,
        passwordHash: hashedPassword,
        isActive: true,
      },
    });
    userId = user.id;

    const plan = await testDb.adminPrisma.plan.create({
      data: {
        name: 'Basic Plan',
        tierLevel: 1,
        maxUsers: 5,
        storageLimit: 1000,
        moduleAccess: {},
      },
    });

    const tenant = await testDb.adminPrisma.tenant.create({
      data: {
        name: 'Test Tenant',
        slug: 'test-tenant-' + randomUUID(),
        planId: plan.id,
      },
    });
    tenantId = tenant.id;

    await testDb.adminPrisma.tenantUser.create({
      data: {
        userId,
        tenantId,
        role: 'ADMIN',
      },
    });

    // Create a role directly to test the entity creation with zero-code columns
    await testDb.getPrismaService().role.create({
      data: {
        name: 'TestRoleBase',
        tenantId,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    accessToken = loginRes.body.accessToken;
  });

  it('automatically sets createdById and updatedById', async () => {
    // Note: If you have an endpoint for creating a role, you would use it here.
    // For this test, we assume there is an endpoint like POST /roles
    // Since we don't know the exact endpoint, we can test it using the TenantContextService + Prisma Extension natively, or via an API endpoint if it exists.
    // Wait, the specification mentions "create a domain entity without passing createdById, verify it is automatically set".
    // Let's create a Role using the Role API (if it exists) or directly through a service that runs in context.

    // We will test creating a role via API:
    const createRes = await request(app.getHttpServer())
      .post('/rbac/roles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-ID', tenantId)
      .send({
        name: 'New Custom Role',
        description: 'Auto-audit test',
      })
      .expect(201);

    const newRoleId = createRes.body.id;

    const createdRole = await testDb.adminPrisma.role.findUnique({
      where: { id: newRoleId },
    });

    expect(createdRole?.createdById).toBe(userId);
    expect(createdRole?.updatedById).toBe(userId);

    // Update the role
    await request(app.getHttpServer())
      .patch(`/rbac/roles/${newRoleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-ID', tenantId)
      .send({
        description: 'Updated description',
      })
      .expect(200);

    const updatedRole = await testDb.adminPrisma.role.findUnique({
      where: { id: newRoleId },
    });

    // Verify updatedById
    expect(updatedRole?.updatedById).toBe(userId);

    // Delete the role
    await request(app.getHttpServer())
      .delete(`/rbac/roles/${newRoleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-ID', tenantId)
      .expect(200);

    const deletedRole = await testDb.adminPrisma.role.findFirst({
      where: { id: newRoleId },
    });

    expect(deletedRole?.isActive).toBe(false);
    expect(deletedRole?.deletedById).toBe(userId);
  });
});
