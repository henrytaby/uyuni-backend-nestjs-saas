import { PrismaClient, PermissionAction, PermissionScope } from '@prisma/client';

import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const modules = ['tenancy', 'crm', 'agenda', 'sales', 'inventory', 'catalogs', 'audit'];

async function getOrCreateRole(name: string, description: string) {
  let role = await prisma.role.findFirst({
    where: { name, tenantId: null },
  });

  if (!role) {
    role = await prisma.role.create({
      data: {
        name,
        description,
        isSystem: true,
      },
    });
  }
  return role;
}

async function upsertPermission(roleId: string, moduleName: string, action: PermissionAction, scope: PermissionScope) {
  await prisma.permission.upsert({
    where: {
      roleId_module_action: {
        roleId,
        module: moduleName,
        action,
      },
    },
    update: { scope },
    create: {
      roleId,
      module: moduleName,
      action,
      scope,
    },
  });
}

async function main() {
  console.log('Seeding Global RBAC Roles...');

  // 1. Admin Role (System) - Full CRUD, ANY scope
  const adminRole = await getOrCreateRole('Admin', 'System Administrator with full access across the tenant.');
  for (const mod of modules) {
    for (const action of [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE]) {
      await upsertPermission(adminRole.id, mod, action, PermissionScope.ANY);
    }
  }

  // 2. Empleado Role (System) - Scoped CRUD, OWN scope
  const empleadoRole = await getOrCreateRole('Empleado', 'Standard employee with access to their own records.');
  for (const mod of modules) {
    for (const action of [PermissionAction.CREATE, PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.DELETE]) {
      await upsertPermission(empleadoRole.id, mod, action, PermissionScope.OWN);
    }
  }

  // 3. Auditor Role (System) - READ-only, ANY scope
  const auditorRole = await getOrCreateRole('Auditor', 'Auditor with read-only access to all records.');
  for (const mod of modules) {
    await upsertPermission(auditorRole.id, mod, PermissionAction.READ, PermissionScope.ANY);
  }

  console.log('RBAC Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
