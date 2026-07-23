import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { TenantContextService } from '../../common/context/tenant-context.js';
import { tenantScopedExtension } from './extensions/tenant-scoped.extension.js';
import { appendOnlyExtension } from './extensions/append-only.extension.js';
import { auditColumnsExtension } from './extensions/audit-columns.extension.js';
import { cdcExtension } from './extensions/cdc.extension.js';
import {
  TENANT_SCOPED_MODELS,
  DEFAULT_TENANT_SCOPED_MODELS,
} from './extensions/tenant-scoped-models.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(
    configService: ConfigService,
    tenantContextService: TenantContextService,
    @Inject(TENANT_SCOPED_MODELS)
    tenantScopedModels: ReadonlySet<string>,
  ) {
    const url = configService.get<string>('DATABASE_URL');
    const adapter = new PrismaPg({ connectionString: url });
    super({ adapter });
    const models = tenantScopedModels ?? DEFAULT_TENANT_SCOPED_MODELS;
    return this.$extends(tenantScopedExtension(tenantContextService, models))
      .$extends(auditColumnsExtension(tenantContextService, models))
      .$extends(cdcExtension(tenantContextService, models))
      .$extends(appendOnlyExtension()) as this;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('PrismaService connected to PostgreSQL');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.fatal(
        `Failed to connect to PostgreSQL — exiting: ${message}`,
      );
      process.exit(1);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('PrismaService disconnected from PostgreSQL');
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
