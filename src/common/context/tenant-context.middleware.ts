import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { requestContextStorage } from '../interceptors/request-context.interceptor.js';
import {
  TENANT_CONTEXT_SOURCE,
  type TenantContextSource,
} from './tenant-context-source.js';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(TENANT_CONTEXT_SOURCE)
    private readonly source: TenantContextSource,
  ) {}

  use(
    req: Request & { id?: string },
    _res: Response,
    next: NextFunction,
  ): void {
    const ctx = this.source(req);
    const store = {
      requestId: req.id ?? '',
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      isPlatformAdmin: ctx.isPlatformAdmin,
    };

    requestContextStorage.run(store, () => next());
  }
}
