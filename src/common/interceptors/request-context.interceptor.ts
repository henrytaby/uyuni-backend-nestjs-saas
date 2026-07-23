import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Observable } from 'rxjs';

export interface RequestContext {
  requestId?: string;
  ip?: string;
  tenantId: string | null;
  userId: string | null;
  isPlatformAdmin?: boolean;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    _next: CallHandler,
  ): Observable<unknown> {
    return _next.handle();
  }
}
