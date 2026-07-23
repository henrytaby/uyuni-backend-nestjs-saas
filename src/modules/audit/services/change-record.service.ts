import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { ChangeRecordQueryDto } from '../dto/change-record-query.dto.js';
import { CursorPaginatedResponse } from '../dto/cursor-pagination.dto.js';

@Injectable()
export class ChangeRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    tenantId: string | null,
    query: ChangeRecordQueryDto,
  ): Promise<CursorPaginatedResponse<any>> {
    const where: Prisma.ChangeRecordWhereInput = {};

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (query.startDate || query.endDate) {
      where.timestamp = {};
      if (query.startDate) where.timestamp.gte = new Date(query.startDate);
      if (query.endDate) where.timestamp.lte = new Date(query.endDate);
    }

    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;

    const limit = query.limit || 50;

    const records = await this.prisma.changeRecord.findMany({
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

  async findByEntityHistory(
    tenantId: string | null,
    entityType: string,
    entityId: string,
  ) {
    const where: Prisma.ChangeRecordWhereInput = { entityType, entityId };
    if (tenantId) {
      where.tenantId = tenantId;
    }
    return this.prisma.changeRecord.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    });
  }

  async findByRequestId(tenantId: string | null, requestId: string) {
    const where: Prisma.ChangeRecordWhereInput = { requestId };
    if (tenantId) {
      where.tenantId = tenantId;
    }
    return this.prisma.changeRecord.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    });
  }
}
