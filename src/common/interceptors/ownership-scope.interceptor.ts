import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import {
  REQUIRE_PERMISSIONS_KEY,
  RequiredPermission,
} from '../decorators/require-permissions.decorator.js';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';
import { TenantContextService } from '../context/tenant-context.js';
import { PermissionScope } from '@prisma/client';

@Injectable()
export class OwnershipScopeInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private tenantContextService: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      RequiredPermission[]
    >(REQUIRE_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const effectivePermissions = request.effectivePermissions as Map<
      string,
      string
    >;
    const user = request.user;

    let scopeFilter: 'ANY' | 'OWN' = 'ANY';

    if (
      requiredPermissions &&
      requiredPermissions.length > 0 &&
      effectivePermissions &&
      user
    ) {
      for (const reqPerm of requiredPermissions) {
        const key = `${reqPerm.module}:${reqPerm.action}`;
        const scope = effectivePermissions.get(key);
        if (scope === PermissionScope.OWN) {
          scopeFilter = 'OWN';
        }
      }
    }

    if (user?.isPlatformAdmin) {
      scopeFilter = 'ANY';
    }

    const ctx = this.tenantContextService.getStore();
    if (ctx) {
      ctx.scopeFilter = scopeFilter;
    }

    return next.handle();
  }
}
