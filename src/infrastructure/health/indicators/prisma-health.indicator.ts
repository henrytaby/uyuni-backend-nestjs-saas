import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ping(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.ping();
      return this.getStatus(key, true, { status: 'up' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = this.getStatus(key, false, { status: 'down', message });
      throw new HealthCheckError('PrismaHealthIndicator failed', result);
    }
  }
}
