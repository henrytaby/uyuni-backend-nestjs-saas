import { InjectionToken } from '@nestjs/common';
import type { Request } from 'express';

export interface TenantJwtPayload {
  tenant_id?: string;
  user_id?: string;
  is_platform_admin?: boolean;
}

export interface RawTenantContext {
  tenantId: string | null;
  userId: string | null;
  isPlatformAdmin: boolean;
}

export type TenantContextSource = (req: Request) => RawTenantContext;

/**
 * Injection token for the strategy that extracts tenant identity from an
 * incoming request. The production implementation reads it exclusively
 * from the decoded JWT payload (req.user) — never from headers/query/body
 * (anti-spoofing safeguard, see research.md Task 1). Tests override this
 * token to inject context programmatically without touching the production
 * middleware.
 */
export const TENANT_CONTEXT_SOURCE: InjectionToken<TenantContextSource> =
  'TENANT_CONTEXT_SOURCE';

export const defaultTenantContextSource: TenantContextSource = (
  req: Request,
): RawTenantContext => {
  const jwtPayload = (req as { user?: TenantJwtPayload }).user ?? {};
  return {
    tenantId: jwtPayload.tenant_id ?? null,
    userId: jwtPayload.user_id ?? null,
    isPlatformAdmin: jwtPayload.is_platform_admin ?? false,
  };
};
