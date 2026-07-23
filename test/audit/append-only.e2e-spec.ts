import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import {
  setupTestDb,
  teardownTestDb,
  cleanTestDb,
  TestDb,
} from '../e2e/test-container.helper.js';

describe('Append-Only Protection (e2e)', () => {
  let app: INestApplication;
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = 'test-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await cleanTestDb(testDb.adminPrisma);
  });

  it('rejects updates to access_logs via Prisma', async () => {
    const log = await testDb.adminPrisma.accessLog.create({
      data: {
        method: 'GET',
        route: '/test',
        statusCode: 200,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        durationMs: 10,
      },
    });

    await expect(
      testDb.adminPrisma.accessLog.update({
        where: { id: log.id },
        data: { statusCode: 500 },
      }),
    ).rejects.toThrow(); // Should throw DB error
  });

  it('rejects deletes to access_logs via Prisma', async () => {
    const log = await testDb.adminPrisma.accessLog.create({
      data: {
        method: 'GET',
        route: '/test',
        statusCode: 200,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        durationMs: 10,
      },
    });

    await expect(
      testDb.adminPrisma.accessLog.delete({
        where: { id: log.id },
      }),
    ).rejects.toThrow();
  });

  it('rejects updates to change_records via direct SQL', async () => {
    const record = await testDb.adminPrisma.changeRecord.create({
      data: {
        tableName: 'users',
        recordId: '123',
        action: 'CREATE',
        oldValues: {},
        newValues: { id: '123' },
      },
    });

    await expect(
      testDb.adminPrisma.$executeRawUnsafe(
        `UPDATE change_records SET action = 'UPDATE' WHERE id = '${record.id}'`,
      ),
    ).rejects.toThrow();
  });

  it('rejects deletes to change_records via direct SQL', async () => {
    const record = await testDb.adminPrisma.changeRecord.create({
      data: {
        tableName: 'users',
        recordId: '123',
        action: 'CREATE',
        oldValues: {},
        newValues: { id: '123' },
      },
    });

    await expect(
      testDb.adminPrisma.$executeRawUnsafe(
        `DELETE FROM change_records WHERE id = '${record.id}'`,
      ),
    ).rejects.toThrow();
  });
});
