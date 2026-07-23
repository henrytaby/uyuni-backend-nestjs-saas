import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import * as bcrypt from 'bcrypt';

const { Pool } = pkg;
const connectionString = 'postgresql://postgres:postgres@localhost:5432/uyuni?schema=public';

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedUser() {
  try {
    const passwordHash = await bcrypt.hash('Test1234!', 10);
    
    const plan = await prisma.plan.upsert({
      where: { name: 'Free' },
      update: {},
      create: {
        name: 'Free',
        tierLevel: 1,
        maxUsers: 5,
        storageLimit: BigInt(1073741824),
        moduleAccess: ['auth'],
        isActive: true,
      },
    });

    // Create the tenant
    let tenant = await prisma.tenant.findFirst({
      where: { slug: 'test-company' },
    });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Test Company',
          slug: 'test-company',
          isActive: true,
          planId: plan.id,
        },
      });
    }

    // Create the user
    let user = await prisma.user.findFirst({
      where: { email: 'test@uyuni.dev' },
    });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: 'test@uyuni.dev',
          passwordHash,
          firstName: 'Test',
          lastName: 'User',
          isPlatformAdmin: false,
          isVerified: true,
          failedLoginAttempts: 0,
          isActive: true,
        },
      });
    }

    // Link user to tenant
    await prisma.tenantUser.upsert({
      where: {
        tenantId_userId: {
          tenantId: tenant.id,
          userId: user.id
        }
      },
      update: {
        role: 'owner',
        isActive: true
      },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'owner',
        isActive: true
      }
    });

    console.log('✅ TEST USER CREATED SUCCESSFULLY');
    console.log('Email: test@uyuni.dev');
    console.log('Password: Test1234!');
    console.log('Tenant ID:', tenant.id);

  } catch (error) {
    console.error('Error seeding test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedUser();
