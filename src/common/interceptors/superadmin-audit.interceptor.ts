import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class SuperadminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SuperadminAuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.tenantId;

    return next.handle().pipe(
      tap(() => {
        if (user?.isPlatformAdmin && tenantId) {
          this.logger.log(
            `Superadmin Action | adminId: ${user.id} | targetTenantId: ${tenantId} | action: ${request.method} | resource: ${request.url}`
          );
        }
      }),
    );
  }
}
