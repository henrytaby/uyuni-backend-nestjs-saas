import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execAsync = promisify(exec);

export interface TestDb {
  /** Client connected as the non-superuser role (RLS enforced). Use for the app under test. */
  prisma: PrismaClient;
  /** Client connected as the postgres superuser (bypasses RLS). Use ONLY for seeding setup data. */
  adminPrisma: PrismaClient;
  /** Connection string using the non-superuser role (RLS is enforced). */
  databaseUrl: string;
  /** Connection string using the postgres superuser (bypasses RLS; for seeding only). */
  adminDatabaseUrl: string;
  container: StartedPostgreSqlContainer;
  close(): Promise<void>;
}

/**
 * Provisions an isolated PostgreSQL 16 container with:
 * - a non-superuser role (`app_user`) so RLS policies are actually enforced
 *   (superusers bypass RLS), and
 * - Prisma migrations applied via the superuser connection.
 *
 * The returned `prisma` client connects as `app_user`, so any tenant-scoped
 * read performed without `SET LOCAL app.tenant_id` will return zero rows —
 * this is what makes the RLS secondary-defense test meaningful.
 */
export async function setupTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('uyuni_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const adminDatabaseUrl = container.getConnectionUri();
  const host = container.getHost();
  const port = container.getMappedPort(5432);

  // Create a non-superuser role that RLS will apply to.
  await execAsync(
    `psql "${adminDatabaseUrl}" -v ON_ERROR_STOP=1 -c "CREATE ROLE app_user WITH LOGIN PASSWORD 'apppass' NOSUPERUSER NOCREATEDB NOCREATEROLE;" -c "GRANT ALL PRIVILEGES ON DATABASE uyuni_test TO app_user;"`,
  );

  // Apply migrations + seed as the superuser (so tables are owned by postgres;
  // we then grant DML to app_user). The Prisma schema maps to public schema.
  const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
  await execAsync(`npx prisma migrate deploy --schema "${schemaPath}"`, {
    env: { ...process.env, DATABASE_URL: adminDatabaseUrl },
  });

  // Grant app_user access to all migrated objects + future sequences.
  await execAsync(
    `psql "${adminDatabaseUrl}" -v ON_ERROR_STOP=1 -d uyuni_test -c "GRANT USAGE ON SCHEMA public TO app_user; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;"`,
  );

  const databaseUrl = `postgresql://app_user:apppass@${host}:${port}/uyuni_test`;
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  const adminAdapter = new PrismaPg({ connectionString: adminDatabaseUrl });
  const adminPrisma = new PrismaClient({ adapter: adminAdapter });
  await adminPrisma.$connect();

  return {
    prisma,
    adminPrisma,
    databaseUrl,
    adminDatabaseUrl,
    container,
    close: async () => {
      await prisma.$disconnect();
      await adminPrisma.$disconnect();
    },
  };
}

export async function teardownTestDb(testDb?: TestDb): Promise<void> {
  if (testDb) {
    await testDb.close();
    await testDb.container.stop();
  }
}

export async function cleanTestDb(prisma: PrismaClient): Promise<void> {
  await prisma.tenantUser.deleteMany({});
  await prisma.tenant.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.plan.deleteMany({});
}
