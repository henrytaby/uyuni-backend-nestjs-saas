import { Injectable } from '@nestjs/common';
import { requestContextStorage } from '../interceptors/request-context.interceptor.js';

export interface TenantContext {
  tenantId: string | null;
  userId: string | null;
  isPlatformAdmin: boolean;
  requestId: string;
}

@Injectable()
export class TenantContextService {
  run<T>(context: TenantContext, callback: () => T): T {
    return requestContextStorage.run(context, callback);
  }

  getStore(): TenantContext | undefined {
    return requestContextStorage.getStore() as TenantContext | undefined;
  }

  getTenantId(): string | null {
    return this.getStore()?.tenantId ?? null;
  }

  getUserId(): string | null {
    return this.getStore()?.userId ?? null;
  }

  getIsPlatformAdmin(): boolean {
    return this.getStore()?.isPlatformAdmin ?? false;
  }

  getRequestId(): string {
    return this.getStore()?.requestId ?? '';
  }
}
