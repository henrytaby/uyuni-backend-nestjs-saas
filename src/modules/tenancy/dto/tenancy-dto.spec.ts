import { CreatePlanDto } from './plan.dto.js';
import { CreateTenantDto } from './tenant.dto.js';
import { CreateUserDto } from './user.dto.js';
import { CreateTenantUserDto } from './tenant-user.dto.js';
import { MODULE_ACCESS, TENANT_ROLES } from './constants.js';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('Tenancy DTO validation', () => {
  describe('CreatePlanDto', () => {
    test('accepts valid plan', async () => {
      const dto = plainToInstance(CreatePlanDto, {
        name: 'TestPlan',
        tierLevel: 1,
        maxUsers: 5,
        storageLimit: 1073741824,
        moduleAccess: ['auth', 'tenancy'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    test('rejects unknown module names', async () => {
      const dto = plainToInstance(CreatePlanDto, {
        name: 'TestPlan',
        tierLevel: 1,
        maxUsers: 5,
        storageLimit: 1073741824,
        moduleAccess: ['auth', 'invalid_module'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects tierLevel outside 1-10', async () => {
      const dto = plainToInstance(CreatePlanDto, {
        name: 'TestPlan',
        tierLevel: 11,
        maxUsers: 5,
        storageLimit: 1073741824,
        moduleAccess: ['auth'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects maxUsers <= 0', async () => {
      const dto = plainToInstance(CreatePlanDto, {
        name: 'TestPlan',
        tierLevel: 1,
        maxUsers: 0,
        storageLimit: 1073741824,
        moduleAccess: ['auth'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateTenantDto', () => {
    test('accepts valid tenant', async () => {
      const dto = plainToInstance(CreateTenantDto, {
        name: 'Test Tenant',
        slug: 'test-tenant',
        planId: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    test('rejects invalid slug format', async () => {
      const dto = plainToInstance(CreateTenantDto, {
        name: 'Test Tenant',
        slug: 'INVALID_SLUG',
        planId: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects slug shorter than 3 chars', async () => {
      const dto = plainToInstance(CreateTenantDto, {
        name: 'Test Tenant',
        slug: 'ab',
        planId: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateUserDto', () => {
    test('accepts valid user', async () => {
      const dto = plainToInstance(CreateUserDto, {
        email: 'test@uyuni.dev',
        password: 'TestPass123!',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    test('rejects invalid email', async () => {
      const dto = plainToInstance(CreateUserDto, {
        email: 'not-an-email',
        password: 'TestPass123!',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('rejects password shorter than 8 chars', async () => {
      const dto = plainToInstance(CreateUserDto, {
        email: 'test@uyuni.dev',
        password: 'short',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateTenantUserDto', () => {
    test('accepts valid role', async () => {
      for (const role of TENANT_ROLES) {
        const dto = plainToInstance(CreateTenantUserDto, {
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          userId: '550e8400-e29b-41d4-a716-446655440001',
          role,
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });

    test('rejects invalid role', async () => {
      const dto = plainToInstance(CreateTenantUserDto, {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        role: 'SUPERUSER',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('MODULE_ACCESS canonical set', () => {
    test('contains all expected module names', () => {
      expect(MODULE_ACCESS).toEqual(
        expect.arrayContaining([
          'auth',
          'tenancy',
          'crm',
          'agenda',
          'sales',
          'inventory',
        ]),
      );
    });

    test('has exactly 6 modules', () => {
      expect(MODULE_ACCESS.length).toBe(6);
    });
  });

  describe('TENANT_ROLES', () => {
    test('contains ADMIN, EMPLEADO, AUDITOR', () => {
      expect(TENANT_ROLES).toEqual(['ADMIN', 'EMPLEADO', 'AUDITOR']);
    });
  });
});
