import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';

@Injectable()
export class SuperadminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SuperadminAuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const tenantId = request.user?.tenantId;

    return next.handle().pipe(
      tap(() => {
        if (user?.isPlatformAdmin && tenantId) {
          this.logger.log(
            `Superadmin Action | adminId: ${user.userId} | targetTenantId: ${tenantId} | action: ${request.method} | resource: ${request.url}`,
          );
        }
      }),
    );
  }
}
