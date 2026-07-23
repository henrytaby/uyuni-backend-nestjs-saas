import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaHealthIndicator } from './indicators/prisma-health.indicator.js';
import { Public } from '../../common/decorators/public.decorator.js';

interface ReadinessResponse extends Partial<HealthCheckResult> {
  timestamp: string;
}

@Public()
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({
    status: 200,
    description: 'Process is alive',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-07-07T12:00:00.000Z' },
      },
    },
  })
  liveness(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — checks DB connectivity' })
  @ApiResponse({
    status: 200,
    description: 'Database is connected',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        info: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: { status: { type: 'string', example: 'up' } },
            },
          },
        },
        error: { type: 'object' },
        details: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: { status: { type: 'string', example: 'up' } },
            },
          },
        },
        timestamp: { type: 'string', example: '2026-07-07T12:00:00.000Z' },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Database is unavailable',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        info: { type: 'object' },
        error: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'down' },
                message: { type: 'string', example: 'Connection refused' },
              },
            },
          },
        },
        details: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'down' },
                message: { type: 'string', example: 'Connection refused' },
              },
            },
          },
        },
        timestamp: { type: 'string', example: '2026-07-07T12:00:00.000Z' },
      },
    },
  })
  async readiness(): Promise<ReadinessResponse> {
    const result: HealthCheckResult = await this.health.check([
      async () => this.prismaIndicator.ping('database'),
    ]);
    return { ...result, timestamp: new Date().toISOString() };
  }
}
