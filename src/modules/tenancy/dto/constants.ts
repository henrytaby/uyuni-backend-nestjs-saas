export const MODULE_ACCESS = [
  'auth',
  'tenancy',
  'crm',
  'agenda',
  'sales',
  'inventory',
] as const;

export type ModuleName = (typeof MODULE_ACCESS)[number];

export const TENANT_ROLES = ['ADMIN', 'EMPLEADO', 'AUDITOR'] as const;

export type TenantRole = (typeof TENANT_ROLES)[number];
