import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import {
  setupTestDb,
  teardownTestDb,
  cleanTestDb,
  TestDb,
} from '../e2e/test-container.helper.js';

describe('CDC Capture (e2e)', () => {
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

  it('captures CREATE, UPDATE, and DELETE actions for a domain entity', async () => {
    // CREATE
    const plan = await testDb.adminPrisma.plan.create({
      data: {
        name: 'CDC Test Plan',
        tierLevel: 1,
        maxUsers: 5,
        storageLimit: 100,
        moduleAccess: {},
      },
    });

    const createRecords = await testDb.adminPrisma.changeRecord.findMany({
      where: { entityType: 'Plan', entityId: plan.id, action: 'CREATE' },
    });
    expect(createRecords.length).toBe(1);
    expect(createRecords[0].oldValue).toBeNull();
    expect((createRecords[0].newValue as any).name).toBe('CDC Test Plan');

    // UPDATE
    await testDb.adminPrisma.plan.update({
      where: { id: plan.id },
      data: { name: 'Updated CDC Test Plan' },
    });

    const updateRecords = await testDb.adminPrisma.changeRecord.findMany({
      where: { entityType: 'Plan', entityId: plan.id, action: 'UPDATE' },
    });
    expect(updateRecords.length).toBe(1);
    expect((updateRecords[0].oldValue as any).name).toBe('CDC Test Plan');
    expect((updateRecords[0].newValue as any).name).toBe(
      'Updated CDC Test Plan',
    );

    // DELETE
    await testDb.adminPrisma.plan.delete({
      where: { id: plan.id },
    });

    const deleteRecords = await testDb.adminPrisma.changeRecord.findMany({
      where: { entityType: 'Plan', entityId: plan.id, action: 'DELETE' },
    });
    expect(deleteRecords.length).toBe(1);
    expect((deleteRecords[0].oldValue as any).name).toBe(
      'Updated CDC Test Plan',
    );
    // newValue for a physical delete might show the final state or soft-delete state
    expect(deleteRecords[0].newValue).toBeDefined();
  });
});
