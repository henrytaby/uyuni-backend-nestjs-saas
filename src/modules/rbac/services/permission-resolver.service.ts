import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PermissionScope } from '@prisma/client';

@Injectable()
export class PermissionResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the effective permissions for a user within a specific tenant.
   * Union of all permissions across all active RoleAssignments.
   * ANY scope overrides OWN scope for the same module+action.
   */
  async resolvePermissions(userId: string, tenantId: string): Promise<Map<string, PermissionScope>> {
    const tenantUser = await this.prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: { tenantId, userId },
      },
      include: {
        roleAssignments: {
          where: { isActive: true },
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    const effectivePermissions = new Map<string, PermissionScope>();

    if (!tenantUser) {
      return effectivePermissions;
    }

    for (const assignment of tenantUser.roleAssignments) {
      if (!assignment.role.isActive) continue;

      for (const permission of assignment.role.permissions) {
        const key = `${permission.module}:${permission.action}`;
        const existingScope = effectivePermissions.get(key);

        if (!existingScope || (existingScope === PermissionScope.OWN && permission.scope === PermissionScope.ANY)) {
          effectivePermissions.set(key, permission.scope);
        }
      }
    }

    return effectivePermissions;
  }
}
