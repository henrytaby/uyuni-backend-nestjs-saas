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
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

describe('AccessLogInterceptor (e2e)', () => {
  let app: INestApplication;
  let testDb: TestDb;
  let userId: string;
  let tenantId: string;
  let accessToken: string;
  const testEmail = 'audit1@example.com';
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

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    accessToken = loginRes.body.accessToken;
  });

  const waitForLog = async (route: string) => {
    for (let i = 0; i < 20; i++) {
      const logs = await testDb.adminPrisma.accessLog.findMany({
        where: { route },
      });
      if (logs.length > 0) return logs;
      await new Promise((r) => setTimeout(r, 50));
    }
    return [];
  };

  it('captures unauthenticated requests (tenantId and userId are null)', async () => {
    Date.now();
    await request(app.getHttpServer()).get('/health/live').expect(200);

    const logs = await waitForLog('/health/live');
    expect(logs.length).toBeGreaterThan(0);
    const log = logs.find((l) => l.statusCode === 200);
    expect(log).toBeDefined();
    expect(log?.method).toBe('GET');
    expect(log?.route).toBe('/health/live');
    expect(log?.statusCode).toBe(200);
    expect(log?.userId).toBeNull();
    expect(log?.tenantId).toBeNull();
    expect(log?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures authenticated requests (tenantId and userId are populated)', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-ID', tenantId)
      .expect(200);

    const logs = await waitForLog('/auth/me');
    expect(logs.length).toBeGreaterThan(0);
    const log = logs.find((l) => l.statusCode === 200 && l.userId === userId);
    expect(log).toBeDefined();
    expect(log?.method).toBe('GET');
    expect(log?.route).toBe('/auth/me');
    expect(log?.statusCode).toBe(200);
    expect(log?.userId).toBe(userId);
    expect(log?.tenantId).toBe(tenantId);
  });

  it('captures error responses (statusCode reflects the error)', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer invalid-token`)
      .expect(401);

    const logs = await waitForLog('/auth/me');
    expect(logs.length).toBeGreaterThan(0);
    const log = logs.find((l) => l.statusCode === 401);
    expect(log).toBeDefined();
    expect(log?.statusCode).toBe(401);
  });
});
