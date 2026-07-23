import { InjectionToken } from '@nestjs/common';

/**
 * Injection token carrying the set of Prisma model names that are
 * tenant-scoped (carry a `tenant_id` column + RLS policy).
 *
 * New domain modules register their tenant-scoped models here instead of
 * editing a hardcoded set inside the extension (Open/Closed Principle).
 * The default seed is `['TenantUser']` — future tenant-scoped entities
 * (CRM, Sales, Inventory, ...) append their model name via a provider
 * override when their module lands.
 */
export const TENANT_SCOPED_MODELS: InjectionToken<ReadonlySet<string>> =
  'TENANT_SCOPED_MODELS';

/** Default tenant-scoped models for spec 002 (TenantUser only). */
export const DEFAULT_TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'TenantUser',
]);
