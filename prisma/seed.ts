import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcryptjs from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const freePlan = await prisma.plan.upsert({
    where: { name: 'Free' },
    update: {},
    create: {
      name: 'Free',
      tierLevel: 1,
      maxUsers: 3,
      storageLimit: BigInt(1073741824),
      moduleAccess: ['auth', 'tenancy', 'crm', 'agenda'],
      price: null,
      isActive: true,
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { name: 'Pro' },
    update: {},
    create: {
      name: 'Pro',
      tierLevel: 2,
      maxUsers: 25,
      storageLimit: BigInt(10737418240),
      moduleAccess: ['auth', 'tenancy', 'crm', 'agenda', 'sales', 'inventory'],
      price: 49.99,
      isActive: true,
    },
  });

  const passwordHash = await bcryptjs.hash('Admin123!', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'platform-admin@uyuni.dev' },
    update: {},
    create: {
      email: 'platform-admin@uyuni.dev',
      passwordHash,
      firstName: 'Platform',
      lastName: 'Admin',
      isPlatformAdmin: true,
      isVerified: true,
      failedLoginAttempts: 0,
      isActive: true,
    },
  });

  console.log({
    freePlan: freePlan.id,
    proPlan: proPlan.id,
    adminUser: adminUser.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
