import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import {
  CreateTenantUserDto,
  UpdateTenantUserDto,
  TenantUserQueryDto,
} from '../dto/tenant-user.dto.js';

@Injectable()
export class TenantUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantUserDto) {
    return await this.prisma.tenantUser.create({
      data: {
        userId: dto.userId,
        role: dto.role,
      } as Prisma.TenantUserUncheckedCreateInput,
    });
  }

  async list(
    query: TenantUserQueryDto = {},
    role?: string,
    isActive?: boolean,
  ) {
    const where: Record<string, unknown> = {};
    // Default to active memberships (contracts/tenant-users.md no explicit
    // default, but implicitly true; allow override)
    where.isActive = isActive ?? true;
    if (role) where.role = role;
    // Only filter by tenantId if provided (caller may want cross-tenant
    // query if they are platform admin, but the extension enforces scoping)
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.searchTerm) {
      where.OR = [
        {
          user: {
            email: { contains: query.searchTerm, mode: 'insensitive' },
          },
        },
        {
          user: {
            firstName: { contains: query.searchTerm, mode: 'insensitive' },
          },
        },
        {
          user: {
            lastName: { contains: query.searchTerm, mode: 'insensitive' },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.tenantUser.findMany({
        where,
        skip:
          (query.page ?? 1) * (query.pageSize ?? 25) - (query.pageSize ?? 25),
        take: query.pageSize ?? 25,
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenantUser.count({ where }),
    ]);

    return {
      data: data.map((tu) => ({
        id: tu.id,
        tenantId: tu.tenantId,
        userId: tu.userId,
        role: tu.role,
        isActive: tu.isActive,
        joinedAt: tu.joinedAt,
        createdAt: tu.createdAt,
        // tenantId already included
        userEmail: tu.user.email,
        userFirstName: tu.user.firstName,
        userLastName: tu.user.lastName,
      })),
      total,
    };
  }

  async get(id: string) {
    const record = await this.prisma.tenantUser.findFirst({ where: { id } });
    if (!record) throw new NotFoundException('Membership not found');
    return record;
  }

  async updateRole(id: string, dto: UpdateTenantUserDto) {
    const result = await this.prisma.tenantUser.updateMany({
      where: { id },
      data: { role: dto.role },
    });
    if (result.count === 0) throw new NotFoundException('Membership not found');
    return this.prisma.tenantUser.findFirst({ where: { id } });
  }

  async deactivate(id: string) {
    const result = await this.prisma.tenantUser.updateMany({
      where: { id },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundException('Membership not found');
    return this.prisma.tenantUser.findFirst({ where: { id } });
  }
}
