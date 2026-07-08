import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface RequestContext {
  requestId?: string;
  ip?: string;
  tenantId: string | null;
  userId: string | null;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestContextInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      id?: string;
      ip?: string;
      method?: string;
      url?: string;
    }>();

    const ctx: RequestContext = {
      requestId: request.id,
      ip: request.ip,
      tenantId: null,
      userId: null,
    };

    const start = Date.now();

    return requestContextStorage.run(ctx, () =>
      next.handle().pipe(
        tap(() => {
          const ms = Date.now() - start;
          this.logger.debug(
            `[${ctx.requestId ?? '-'}] ${request.method ?? 'HTTP'} ${request.url ?? '/'} ${ms}ms`,
          );
        }),
      ),
    );
  }
}
