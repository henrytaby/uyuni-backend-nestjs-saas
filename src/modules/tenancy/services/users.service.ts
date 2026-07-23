import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcryptjs from 'bcryptjs';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { TenantContextService } from '../../../common/context/tenant-context.js';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto.js';

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isPlatformAdmin: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcryptjs.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        isPlatformAdmin: dto.isPlatformAdmin ?? false,
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  async list(page = 1, pageSize = 25, searchTerm?: string, isActive?: boolean) {
    const where: Record<string, unknown> = {};
    // Default to active users (contracts/users.md no explicit default,
    // but implicitly true for platform view; allow override)
    where.isActive = isActive ?? true;
    if (searchTerm) {
      where.OR = [
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { firstName: { contains: searchTerm, mode: 'insensitive' } },
        { lastName: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: USER_PUBLIC_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total };
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.get(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.isPlatformAdmin !== undefined && {
          isPlatformAdmin: dto.isPlatformAdmin,
        }),
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  async softDelete(id: string) {
    await this.get(id);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  }

  async getTenantsForUser() {
    const userId = this.tenantContext.getUserId();
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }

    const memberships = await this.prisma.tenantUser.findMany({
      where: { userId, isActive: true },
      include: { tenant: { select: { name: true, slug: true } } },
    });
    return {
      data: memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        slug: m.tenant.slug,
        role: m.role,
        isActive: m.isActive,
      })),
      total: memberships.length,
    };
  }
}
