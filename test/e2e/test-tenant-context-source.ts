import type { Request } from 'express';
import type {
  RawTenantContext,
  TenantContextSource,
} from '../../src/common/context/tenant-context-source.js';

/**
 * Testing-only implementation of TenantContextSource. Reads tenant identity
 * from x-test-* headers so e2e tests can simulate authenticated requests
 * without a real JWT (auth lands in spec 003). This provider is injected
 * ONLY in the e2e TestingModule via .overrideProvider(TENANT_CONTEXT_SOURCE)
 * — it never ships in production, preserving the production anti-spoofing
 * guarantee (identity derived solely from the decoded JWT).
 */
export const testTenantContextSource: TenantContextSource = (
  req: Request,
): RawTenantContext => ({
  tenantId: (req.headers['x-test-tenant-id'] as string | undefined) ?? null,
  userId: (req.headers['x-test-user-id'] as string | undefined) ?? null,
  isPlatformAdmin:
    (req.headers['x-test-platform-admin'] as string | undefined) === 'true',
});
