import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import {
  setupTestDb,
  teardownTestDb,
  cleanTestDb,
  TestDb,
} from '../e2e/test-container.helper.js';

describe('CDC Sensitive Field Redaction (e2e)', () => {
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

  it('redacts User.passwordHash in ChangeRecord', async () => {
    const user = await testDb.adminPrisma.user.create({
      data: {
        email: 'redact@example.com',
        passwordHash: 'super-secret-hash',
        isActive: true,
      },
    });

    const records = await testDb.adminPrisma.changeRecord.findMany({
      where: { entityType: 'User', entityId: user.id, action: 'CREATE' },
    });

    expect(records.length).toBe(1);
    const newValue = records[0].newValue as any;
    expect(newValue).toBeDefined();
    expect(newValue.email).toBe('redact@example.com');
    expect(newValue.passwordHash).toBe('[REDACTED]');
  });

  it('redacts RefreshToken.tokenHash in ChangeRecord', async () => {
    const user = await testDb.adminPrisma.user.create({
      data: {
        email: 'refresh@example.com',
        passwordHash: 'super-secret-hash',
        isActive: true,
      },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const token = await testDb.adminPrisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'very-secret-token-hash',
        expiresAt,
        deviceInfo: 'test-device',
        ipAddress: '127.0.0.1',
      },
    });

    const records = await testDb.adminPrisma.changeRecord.findMany({
      where: {
        entityType: 'RefreshToken',
        entityId: token.id,
        action: 'CREATE',
      },
    });

    expect(records.length).toBe(1);
    const newValue = records[0].newValue as any;
    expect(newValue).toBeDefined();
    expect(newValue.deviceInfo).toBe('test-device');
    expect(newValue.tokenHash).toBe('[REDACTED]');
  });
});
