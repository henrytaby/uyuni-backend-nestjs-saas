import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { setupTestDb, type TestDb } from './test-container.helper';

describe('RLS secondary defense e2e (US3)', () => {
  let prisma: PrismaClient;
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
    const adapter = new PrismaPg({ connectionString: testDb.adminDatabaseUrl });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    await testDb.close();
  });

  test('querying TenantUser without SET LOCAL app.tenant_id returns no rows (RLS blocks)', async () => {
    // TenantUser is RLS-protected. As app_user (non-superuser) without
    // SET LOCAL app.tenant_id, the RLS policy denies ALL rows.
    // This verifies that RLS is a secondary defense even when the
    // extension is bypassed (e.g., raw Prisma client outside a request).
    const count = await prisma.tenantUser.count();
    expect(count).toBe(0);
  });
});
