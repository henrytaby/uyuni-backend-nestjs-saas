import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.js';
import {
  TENANT_CONTEXT_SOURCE,
  defaultTenantContextSource,
} from './tenant-context-source.js';

@Global()
@Module({
  providers: [
    TenantContextService,
    { provide: TENANT_CONTEXT_SOURCE, useValue: defaultTenantContextSource },
  ],
  exports: [TenantContextService, TENANT_CONTEXT_SOURCE],
})
export class TenantContextModule {}
