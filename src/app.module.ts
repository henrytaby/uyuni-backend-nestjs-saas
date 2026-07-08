import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { validate } from './common/config/env.validation.js';
import { LoggerModule } from './infrastructure/logger/logger.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { HealthModule } from './infrastructure/health/health.module.js';

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
          // TTL is expressed in ms by @nestjs/throttler v6; env stores seconds.
          ttl: configService.get<number>('RATE_LIMIT_TTL', 60) * 1000,
          limit: configService.get<number>('RATE_LIMIT_LIMIT', 100),
        },
      ],
    }),
    LoggerModule,
    PrismaModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
