import { SetMetadata } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';

export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';

export interface RequiredPermission {
  module: string;
  action: PermissionAction;
}

export const RequirePermissions = (...permissions: RequiredPermission[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
