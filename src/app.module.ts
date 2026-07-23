import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { validate } from './common/config/env.validation.js';
import { LoggerModule } from './infrastructure/logger/logger.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { HealthModule } from './infrastructure/health/health.module.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { TenantContextMiddleware } from './common/context/tenant-context.middleware.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { TenantGuard } from './common/guards/tenant.guard.js';
import { PlatformAdminGuard } from './common/guards/platform-admin.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: (env) => validate(env),
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('RATE_LIMIT_TTL', 60) * 1000,
          limit: configService.get<number>('RATE_LIMIT_LIMIT', 100),
        },
      ],
    }),
    LoggerModule,
    PrismaModule,
    HealthModule,
    TenancyModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PlatformAdminGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
