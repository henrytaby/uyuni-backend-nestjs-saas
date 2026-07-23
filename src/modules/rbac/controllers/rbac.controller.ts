import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { PermissionResolverService } from '../services/permission-resolver.service.js';
import { RbacService } from '../services/rbac.service.js';
import { CreateRoleDto, UpdateRoleDto } from '../dto/role.dto.js';
import { RoleAssignmentDto } from '../dto/role-assignment.dto.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import { PermissionAction } from '@prisma/client';
import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request.interface.js';

@ApiTags('RBAC')
@ApiBearerAuth()
@Controller('rbac')
export class RbacController {
  constructor(
    private readonly permissionResolver: PermissionResolverService,
    private readonly rbacService: RbacService,
  ) {}

  @Get('permissions/effective')
  @ApiOperation({
    summary: 'Get effective permissions for current user and tenant',
  })
  @ApiResponse({ status: 200, description: 'Map of module:action to scope' })
  async getEffectivePermissions(@Request() req: AuthenticatedRequest) {
    const effectivePermissions =
      await this.permissionResolver.resolvePermissions(
        req.user.userId,
        req.user.tenantId!,
      );

    const permissions = Array.from(effectivePermissions.entries()).map(
      ([key, scope]) => {
        const [module, action] = key.split(':');
        return { module, action, scope };
      },
    );

    const roles = await this.rbacService.getUserRoles(
      req.user.userId,
      req.user.tenantId!,
    );

    return {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      permissions,
      roles: roles.map((r: { id: string; name: string }) => ({
        id: r.id,
        name: r.name,
      })),
      isPlatformAdmin: req.user.isPlatformAdmin ?? false,
    };
  }

  @Get('permissions/modules')
  @ApiOperation({ summary: 'Get allowed module registry list' })
  @ApiResponse({ status: 200, description: 'List of allowed modules' })
  getModules() {
    return {
      modules: [
        'tenancy',
        'crm',
        'agenda',
        'sales',
        'inventory',
        'catalogs',
        'audit',
      ],
    };
  }

  @Post('roles')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.CREATE })
  @ApiOperation({ summary: 'Create a custom role' })
  createRole(@Request() req: AuthenticatedRequest, @Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(
      dto,
      req.user.tenantId!,
      req.user.userId,
    );
  }

  @Get('roles')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.READ })
  @ApiOperation({ summary: 'List roles (system and custom)' })
  getRoles(@Request() req: AuthenticatedRequest) {
    return this.rbacService.getRoles(req.user.tenantId!);
  }

  @Patch('roles/:id')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.UPDATE })
  @ApiOperation({ summary: 'Update a custom role' })
  updateRole(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rbacService.updateRole(
      id,
      dto,
      req.user.tenantId!,
      req.user.userId,
    );
  }

  @Post('assignments')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.CREATE })
  @ApiOperation({ summary: 'Assign a role to a user' })
  assignRole(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RoleAssignmentDto,
  ) {
    return this.rbacService.assignRole(
      dto,
      req.user.tenantId!,
      req.user.userId,
    );
  }

  @Delete('assignments/:id')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.DELETE })
  @ApiOperation({ summary: 'Revoke a role from a user' })
  revokeRole(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.rbacService.revokeRole(id, req.user.tenantId!);
  }

  @Delete('roles/:id')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.DELETE })
  @ApiOperation({ summary: 'Delete a custom role' })
  deleteRole(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.rbacService.deleteRole(id, req.user.tenantId!);
  }

  @Get('assignments')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.READ })
  @ApiOperation({ summary: 'List role assignments' })
  getAssignments(@Request() req: AuthenticatedRequest) {
    return this.rbacService.getAssignments(req.user.tenantId!);
  }
}
