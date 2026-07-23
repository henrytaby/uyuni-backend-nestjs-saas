import { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  mfaVerified: boolean;
  isPlatformAdmin: boolean;
  tenantId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  cookies: Record<string, string>;
  effectivePermissions?: Map<string, string>;
}
