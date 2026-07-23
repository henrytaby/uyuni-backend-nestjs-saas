import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { TenantContextService } from '../context/tenant-context.js';

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AccessLogInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    const startMs = Date.now();
    const method = req.method;
    const route = req.url;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || null;

    res.on('finish', () => {
      const durationMs = Date.now() - startMs;
      const statusCode = res.statusCode;

      const tenantId = this.tenantContextService.getTenantId();
      const userId = this.tenantContextService.getUserId();
      const requestId = this.tenantContextService.getRequestId();

      this.prisma.accessLog
        .create({
          data: {
            method,
            route,
            statusCode,
            ip,
            userAgent,
            userId,
            tenantId,
            requestId,
            durationMs,
          },
        })
        .catch((error) => {
          this.logger.error(
            `CRITICAL: Failed to write access log for request ${requestId}`,
            error instanceof Error ? error.stack : String(error),
          );
        });
    });

    return next.handle();
  }
}
