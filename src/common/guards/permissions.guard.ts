import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  REQUIRE_PERMISSIONS_KEY,
  RequiredPermission,
} from '../decorators/require-permissions.decorator.js';
import { PermissionResolverService } from '../../modules/rbac/services/permission-resolver.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    private permissionResolver: PermissionResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<RequiredPermission[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.tenantId;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!tenantId) {
      throw new ForbiddenException('Tenant context not established');
    }

    if (user.isPlatformAdmin) {
      const isDelete = requiredPermissions.some((p) => p.action === 'DELETE');
      if (isDelete) {
         this.logger.warn(`Superadmin ${user.id} attempted DELETE in tenant ${tenantId}. Blocked for compliance.`);
         throw new ForbiddenException('Superadmins cannot perform DELETE operations on tenant data');
      }
      this.logger.log(`Superadmin ${user.id} bypassed permissions for tenant ${tenantId}`);
      return true;
    }

    const effectivePermissions = await this.permissionResolver.resolvePermissions(
      user.id,
      tenantId,
    );

    const hasPermission = requiredPermissions.every((reqPerm) => {
      const key = `${reqPerm.module}:${reqPerm.action}`;
      return effectivePermissions.has(key);
    });

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    request.effectivePermissions = effectivePermissions;

    return true;
  }
}
