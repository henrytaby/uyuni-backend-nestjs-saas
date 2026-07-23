import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module.js';

describe('AuditQuery (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should query access logs', async () => {
    // Basic test to see if endpoint exists and returns 401 unauthenticated
    // Actual tests with JWT would require seeding and logging in
    const response = await request(app.getHttpServer()).get(
      '/audit/access-logs',
    );
    expect(response.status).toBe(401);
  });

  it('should query change records', async () => {
    const response = await request(app.getHttpServer()).get(
      '/audit/change-records',
    );
    expect(response.status).toBe(401);
  });
});
