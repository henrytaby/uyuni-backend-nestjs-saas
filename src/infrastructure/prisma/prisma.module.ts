import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { TenantContextModule } from '../../common/context/tenant-context.module.js';
import {
  TENANT_SCOPED_MODELS,
  DEFAULT_TENANT_SCOPED_MODELS,
} from './extensions/tenant-scoped-models.js';

@Global()
@Module({
  imports: [TenantContextModule],
  providers: [
    PrismaService,
    { provide: TENANT_SCOPED_MODELS, useValue: DEFAULT_TENANT_SCOPED_MODELS },
  ],
  exports: [PrismaService, TENANT_SCOPED_MODELS],
})
export class PrismaModule {}
