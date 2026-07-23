import { PrismaClient } from '@prisma/client';

import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Migrating TenantUser.role to RoleAssignment...');

  const tenantUsers = await prisma.tenantUser.findMany();
  let migrated = 0;

  for (const tu of tenantUsers) {
    const rawRole = tu.role.toUpperCase();
    const roleName = rawRole === 'ADMIN' ? 'Admin' :
                     rawRole === 'AUDITOR' ? 'Auditor' : 'Empleado';
    
    const role = await prisma.role.findFirst({
      where: { name: roleName, tenantId: null },
    });

    if (role) {
      await prisma.roleAssignment.upsert({
        where: {
          tenantUserId_roleId: {
            tenantUserId: tu.id,
            roleId: role.id,
          },
        },
        update: {},
        create: {
          tenantUserId: tu.id,
          roleId: role.id,
        },
      });
      migrated++;
    }
  }

  console.log(`Migrated ${migrated} role assignments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
