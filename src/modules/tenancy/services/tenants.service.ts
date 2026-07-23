import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { TenantContextService } from '../../../common/context/tenant-context.js';
import { CreateTenantDto, UpdateTenantDto } from '../dto/tenant.dto.js';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(dto: CreateTenantDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.isActive) {
      throw new NotFoundException(
        `Cannot create tenant with inactive plan: ${plan.name}`,
      );
    }

    return await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        planId: dto.planId,
        paymentState: 'ACTIVO',
        subscriptionStart: new Date(),
      },
    });
  }

  async list(
    page = 1,
    pageSize = 25,
    searchTerm?: string,
    paymentState?: string,
    isActive?: boolean,
  ) {
    const where: Record<string, unknown> = {};
    // Default to active tenants (contracts/tenants.md no explicit default,
    // but implicitly true for platform view; allow override)
    where.isActive = isActive ?? true;
    if (paymentState) where.paymentState = paymentState;
    if (searchTerm) {
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { slug: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { plan: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data: data.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        paymentState: t.paymentState,
        planName: t.plan.name,
        isActive: t.isActive,
      })),
      total,
    };
  }

  async get(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const ctxTenantId = this.tenantContext.getTenantId();
    const isPlatformAdmin = this.tenantContext.getIsPlatformAdmin();

    if (!isPlatformAdmin && id !== ctxTenantId) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: {
        id: tenant.plan.id,
        name: tenant.plan.name,
        tierLevel: tenant.plan.tierLevel,
        maxUsers: tenant.plan.maxUsers,
        moduleAccess: tenant.plan.moduleAccess,
      },
      planId: tenant.planId,
      paymentState: tenant.paymentState,
      isActive: tenant.isActive,
      subscriptionStart: tenant.subscriptionStart,
      subscriptionEnd: tenant.subscriptionEnd,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.planId !== undefined && { planId: dto.planId }),
      },
    });
  }

  async softDelete(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
