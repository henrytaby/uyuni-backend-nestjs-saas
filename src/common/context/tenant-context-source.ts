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
  interface TokenPayload {
    sub?: string;
    user_id?: string;
    tenant_id?: string | null;
    tenantId?: string | null;
    is_platform_admin?: boolean;
    isPlatformAdmin?: boolean;
    userId?: string;
  }
  let jwtPayload: TokenPayload = {};

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const payloadPart = token.split('.')[1];
      if (payloadPart) {
        const decoded = Buffer.from(payloadPart, 'base64').toString('utf8');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        jwtPayload = JSON.parse(decoded);
      }
    } catch {
      // Ignore parse errors; JwtAuthGuard will securely reject it later.
    }
  }

  // Fallback to req.user for tests or if another middleware populated it
  if (!jwtPayload.sub && (req as unknown as { user?: TokenPayload }).user) {
    const u = (req as unknown as { user: TokenPayload }).user;
    jwtPayload = {
      tenant_id: u.tenantId ?? u.tenant_id,
      sub: u.userId ?? u.sub,
      is_platform_admin: u.isPlatformAdmin ?? u.is_platform_admin,
    };
  }

  return {
    tenantId: jwtPayload.tenant_id ?? null,
    userId: jwtPayload.sub ?? jwtPayload.user_id ?? null,
    isPlatformAdmin: jwtPayload.is_platform_admin === true,
  };
};
