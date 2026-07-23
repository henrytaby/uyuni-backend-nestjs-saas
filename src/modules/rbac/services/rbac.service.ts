import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { CreateRoleDto, UpdateRoleDto } from '../dto/role.dto.js';
import { RoleAssignmentDto } from '../dto/role-assignment.dto.js';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async createRole(dto: CreateRoleDto, tenantId: string, userId: string) {
    const existing = await this.prisma.role.findFirst({
      where: { name: dto.name, tenantId },
    });
    if (existing)
      throw new BadRequestException('Role already exists in this tenant');

    return this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        isSystem: false,
        tenantId,
        createdById: userId,
        permissions: {
          create:
            dto.permissions?.map((p) => ({
              module: p.module,
              action: p.action,
              scope: p.scope,
            })) ?? [],
        },
      },
    });
  }

  async getUserRoles(userId: string, tenantId: string) {
    const tenantUser = await this.prisma.tenantUser.findFirst({
      where: { userId, tenantId },
      include: {
        roleAssignments: {
          where: { isActive: true },
          include: { role: true },
        },
      },
    });
    if (!tenantUser) return [];
    return tenantUser.roleAssignments
      .filter((a) => a.role.isActive)
      .map((a) => a.role);
  }

  async getRoles(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
      },
      include: {
        permissions: true,
      },
      orderBy: { name: 'asc' },
    });
    return { data: roles, total: roles.length };
  }

  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    tenantId: string,
    userId: string,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: { permissions: true },
    });

    if (!role) {
      const systemRole = await this.prisma.role.findFirst({
        where: { id, tenantId: null },
      });
      if (systemRole)
        throw new ForbiddenException('Cannot modify system roles');
      throw new NotFoundException('Role not found');
    }

    if (role.isSystem) {
      throw new ForbiddenException('Cannot modify system roles');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          isActive: dto.isActive,
          updatedById: userId,
        },
      });

      if (dto.permissions) {
        await tx.permission.deleteMany({ where: { roleId: id } });
        if (dto.permissions.length > 0) {
          await tx.permission.createMany({
            data: dto.permissions.map((p) => ({
              roleId: id,
              module: p.module,
              action: p.action,
              scope: p.scope,
            })),
          });
        }
      }

      return updated;
    });
  }

  async assignRole(dto: RoleAssignmentDto, tenantId: string, userId: string) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: dto.roleId,
        OR: [{ tenantId: null }, { tenantId }],
      },
    });

    if (!role)
      throw new NotFoundException(
        'Role not found or not available in this tenant',
      );

    const tenantUser = await this.prisma.tenantUser.findFirst({
      where: { id: dto.tenantUserId, tenantId },
    });

    if (!tenantUser)
      throw new NotFoundException('TenantUser not found in this tenant');

    return this.prisma.roleAssignment.upsert({
      where: {
        tenantUserId_roleId: {
          tenantUserId: dto.tenantUserId,
          roleId: dto.roleId,
        },
      },
      update: { isActive: true },
      create: {
        tenantUserId: dto.tenantUserId,
        roleId: dto.roleId,
        assignedById: userId,
      },
    });
  }

  async revokeRole(id: string, tenantId: string) {
    const assignment = await this.prisma.roleAssignment.findFirst({
      where: { id },
      include: { tenantUser: true },
    });

    if (!assignment || assignment.tenantUser.tenantId !== tenantId) {
      throw new NotFoundException('Role assignment not found in this tenant');
    }

    return this.prisma.roleAssignment.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async deleteRole(id: string, tenantId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: { roleAssignments: true },
    });

    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem)
      throw new ForbiddenException('Cannot modify system roles');

    const activeAssignments = role.roleAssignments.filter((a) => a.isActive);
    if (activeAssignments.length > 0)
      throw new ConflictException({
        message:
          'Cannot delete role with active assignments. Reassign users first.',
        activeAssignments: activeAssignments.length,
      });

    return this.prisma.role.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getAssignments(tenantId: string) {
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { tenantUser: { tenantId } },
      include: { role: true, tenantUser: true },
    });
    return { data: assignments, total: assignments.length };
  }
}
