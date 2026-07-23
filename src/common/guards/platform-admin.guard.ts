import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from '../context/tenant-context.js';
import { REQUIRE_PLATFORM_ADMIN_KEY } from '../decorators/require-platform-admin.decorator.js';

/**
 * Enforces the platform-admin RBAC contract on CUD endpoints for
 * platform-global entities (Plan, Tenant, User). Routes marked with
 * @RequirePlatformAdmin() reject any caller whose TenantContext
 * is_platform_admin flag is not true.
 *
 * Reads identity from the request-scoped AsyncLocalStorage store
 * (populated from the decoded JWT by TenantContextMiddleware) — never
 * from client-controlled input (anti-spoofing, research.md Task 1).
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContextService: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_PLATFORM_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const isPlatformAdmin = this.tenantContextService.getIsPlatformAdmin();
    if (!isPlatformAdmin) {
      throw new ForbiddenException('Platform admin privileges required');
    }
    return true;
  }
}
