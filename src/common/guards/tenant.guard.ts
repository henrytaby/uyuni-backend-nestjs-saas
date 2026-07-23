import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from '../context/tenant-context.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContextService: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const bypassTenant = this.reflector.getAllAndOverride<boolean>(
      'bypassTenant',
      [context.getHandler(), context.getClass()],
    );

    if (bypassTenant) {
      return true;
    }

    const tenantId = this.tenantContextService.getTenantId();

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }

    return true;
  }
}
