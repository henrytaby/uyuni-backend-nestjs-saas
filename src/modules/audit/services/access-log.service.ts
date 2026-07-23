import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { AccessLogQueryDto } from '../dto/access-log-query.dto.js';
import { CursorPaginatedResponse } from '../dto/cursor-pagination.dto.js';

@Injectable()
export class AccessLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    tenantId: string | null,
    query: AccessLogQueryDto,
  ): Promise<CursorPaginatedResponse<any>> {
    const where: Prisma.AccessLogWhereInput = {};

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (query.startDate || query.endDate) {
      where.timestamp = {};
      if (query.startDate) where.timestamp.gte = new Date(query.startDate);
      if (query.endDate) where.timestamp.lte = new Date(query.endDate);
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.route) {
      where.route = { contains: query.route, mode: 'insensitive' };
    }

    const limit = query.limit || 50;

    const records = await this.prisma.accessLog.findMany({
      where,
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    });

    const hasNext = records.length > limit;
    const data = hasNext ? records.slice(0, limit) : records;
    const nextCursor = data.length > 0 ? data[data.length - 1].id : null;

    return {
      data,
      cursor: hasNext ? nextCursor : null,
      hasNext,
    };
  }

  async findByRequestId(tenantId: string | null, requestId: string) {
    const where: Prisma.AccessLogWhereInput = { requestId };
    if (tenantId) {
      where.tenantId = tenantId;
    }
    return this.prisma.accessLog.findFirst({
      where,
      orderBy: { timestamp: 'desc' },
    });
  }
}
