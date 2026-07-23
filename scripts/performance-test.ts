import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';

const url = 'postgresql://postgres:postgres@localhost:5432/uyuni';
const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function run() {
  console.log('--- NFR-001: Access Log + CDC Overhead ---');
  // Warm up
  await prisma.plan.findFirst();

  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    await prisma.plan.create({
      data: {
        name: `Test Plan ${randomUUID()}`,
        tierLevel: Math.floor(Math.random() * 1000),
        maxUsers: 10,
        storageLimit: 100,
        moduleAccess: {},
      }
    });
  }
  const end = Date.now();
  const avg = (end - start) / 100;
  console.log(`Average write time (includes CDC trigger): ${avg}ms per request`);
  
  console.log('\n--- NFR-004: Query Performance with Large Data ---');
  console.log('Seeding 10,000 access logs...');
  const logs = [];
  for (let i = 0; i < 10000; i++) {
    logs.push({
      route: '/test/perf',
      method: 'POST',
      statusCode: 200,
      durationMs: 15,
      ip: '127.0.0.1',
      userAgent: 'perf-script',
      requestId: randomUUID()
    });
  }
  
  await prisma.accessLog.createMany({ data: logs });
  
  const queryStart = Date.now();
  await prisma.accessLog.findMany({
    take: 100,
    orderBy: { timestamp: 'desc' },
    where: { route: '/test/perf' }
  });
  const queryEnd = Date.now();
  console.log(`Query time for top 100 logs out of 10k+: ${queryEnd - queryStart}ms (Must be < 2000ms)`);
  
  console.log('\nCleaning up...');
  await prisma.accessLog.deleteMany({ where: { route: '/test/perf' } });
  await prisma.plan.deleteMany({ where: { name: { startsWith: 'Test Plan' } } });
}

run().catch(console.error).finally(() => prisma.$disconnect());
