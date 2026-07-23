import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  CreatePlanDto,
  UpdatePlanDto,
  DataTableRequestDto,
} from '../dto/plan.dto.js';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  private serializePlan(plan: {
    id: string;
    name: string;
    tierLevel: number;
    maxUsers: number;
    storageLimit: bigint;
    moduleAccess: unknown;
    price: unknown;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...plan,
      storageLimit: Number(plan.storageLimit),
      price: plan.price === null ? null : Number(plan.price),
    };
  }

  async create(dto: CreatePlanDto) {
    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name,
        tierLevel: dto.tierLevel,
        maxUsers: dto.maxUsers,
        storageLimit: BigInt(dto.storageLimit),
        moduleAccess: dto.moduleAccess,
        price: dto.price ?? null,
      },
    });
    return this.serializePlan(plan);
  }

  async list(query: DataTableRequestDto = {}, isActive?: boolean) {
    const where: Record<string, unknown> = {};
    // Default to active plans (contracts/plans.md:84 — isActive defaults true)
    where.isActive = isActive ?? true;
    if (query.searchTerm) {
      where.name = { contains: query.searchTerm, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.plan.findMany({
        where,
        skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 25),
        take: query.pageSize ?? 25,
        orderBy: { tierLevel: 'asc' },
      }),
      this.prisma.plan.count({ where }),
    ]);
    return {
      data: data.map((p) => this.serializePlan(p)),
      total,
    };
  }

  async get(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return this.serializePlan(plan);
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.get(id);

    if (dto.maxUsers !== undefined) {
      const tenantCount = await this.prisma.tenant.count({
        where: { planId: id, isActive: true },
      });
      if (tenantCount > 0) {
        const memberCounts = await this.prisma.tenantUser.groupBy({
          by: ['tenantId'],
          where: { tenant: { planId: id }, isActive: true },
          _count: true,
        });
        for (const mc of memberCounts) {
          if (mc._count > dto.maxUsers) {
            throw new ConflictException(
              `Cannot reduce maxUsers below current member count for tenant ${mc.tenantId}`,
            );
          }
        }
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.tierLevel !== undefined) data.tierLevel = dto.tierLevel;
    if (dto.maxUsers !== undefined) data.maxUsers = dto.maxUsers;
    if (dto.storageLimit !== undefined)
      data.storageLimit = BigInt(dto.storageLimit);
    if (dto.moduleAccess !== undefined) data.moduleAccess = dto.moduleAccess;
    if (dto.price !== undefined) data.price = dto.price;

    const plan = await this.prisma.plan.update({ where: { id }, data });
    return this.serializePlan(plan);
  }

  async softDelete(id: string) {
    await this.get(id);
    const tenantCount = await this.prisma.tenant.count({
      where: { planId: id, isActive: true },
    });
    if (tenantCount > 0) {
      throw new ConflictException('Plan is in use by one or more tenants');
    }
    const plan = await this.prisma.plan.update({
      where: { id },
      data: { isActive: false },
    });
    return this.serializePlan(plan);
  }
}
