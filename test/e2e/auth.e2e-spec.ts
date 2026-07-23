import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import {
  setupTestDb,
  teardownTestDb,
  cleanTestDb,
  TestDb,
} from './test-container.helper.js';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

describe('AuthModule (e2e)', () => {
  let app: INestApplication;
  let testDb: TestDb;
  let userId: string;
  let tenantId: string;
  const testEmail = 'test@example.com';
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

    // Seed User
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    const user = await testDb.adminPrisma.user.create({
      data: {
        email: testEmail,
        passwordHash: hashedPassword,
        isActive: true,
      },
    });
    userId = user.id;

    // Seed Plan
    const plan = await testDb.adminPrisma.plan.create({
      data: {
        name: 'Basic Plan',
        tierLevel: 1,
        maxUsers: 5,
        storageLimit: 1000,
        moduleAccess: {},
      },
    });

    // Seed Tenant
    const tenant = await testDb.adminPrisma.tenant.create({
      data: {
        name: 'Test Tenant',
        slug: 'test-tenant-' + randomUUID(),
        planId: plan.id,
      },
    });
    tenantId = tenant.id;

    // Link user to tenant
    await testDb.adminPrisma.tenantUser.create({
      data: {
        userId,
        tenantId,
        role: 'ADMIN',
      },
    });
  });

  afterEach(async () => {
    // Delete refresh tokens to avoid foreign key conflicts when users are deleted
    await testDb.adminPrisma.refreshToken.deleteMany({});
  });

  it('/auth/login (POST) - Success', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.user.email).toBe(testEmail);
    expect(response.body.tenants.length).toBe(1);

    const cookies = response.header['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('refresh_token=');
    expect(cookies[0]).toContain('HttpOnly');
  });

  it('/auth/login (POST) - Invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: 'wrongpassword' })
      .expect(401);
  });

  it('/auth/login (POST) - Lockout after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: 'wrongpassword' });

      if (i < 4) {
        expect(res.status).toBe(401);
      } else {
        expect(res.status).toBe(403); // 5th attempt locks the account
      }
    }
  });

  it('/auth/refresh (POST) - Success', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    const cookies = loginRes.header['set-cookie'];

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies)
      .expect(200);

    expect(refreshRes.body.accessToken).toBeDefined();
    const newCookies = refreshRes.header['set-cookie'];
    expect(newCookies[0]).toContain('refresh_token=');
  });

  it('/auth/refresh (POST) - Reuse detection', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    const cookies = loginRes.header['set-cookie'];

    // First refresh works
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies)
      .expect(200);

    // Second refresh with the same (old) token fails (401)
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies)
      .expect(401);
  });

  it('/auth/logout (POST) - Local logout', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    const cookies = loginRes.header['set-cookie'];

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookies)
      .expect(200);

    // Refresh should now fail because the token was revoked
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies)
      .expect(401);
  });
});
