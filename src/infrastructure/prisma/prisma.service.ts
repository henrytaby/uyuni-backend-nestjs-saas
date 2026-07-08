import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const url = configService.get<string>('DATABASE_URL');
    const adapter = new PrismaPg({ connectionString: url });
    super({ adapter });
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
