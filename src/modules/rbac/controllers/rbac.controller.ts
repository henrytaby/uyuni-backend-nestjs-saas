import { Controller, Get, Post, Patch, Delete, Param, Body, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PermissionResolverService } from '../services/permission-resolver.service.js';
import { RbacService } from '../services/rbac.service.js';
import { CreateRoleDto, UpdateRoleDto } from '../dto/role.dto.js';
import { RoleAssignmentDto } from '../dto/role-assignment.dto.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import { PermissionAction } from '@prisma/client';

@ApiTags('RBAC')
@ApiBearerAuth()
@Controller('rbac')
export class RbacController {
  constructor(
    private readonly permissionResolver: PermissionResolverService,
    private readonly rbacService: RbacService,
  ) {}

  @Get('permissions/effective')
  @ApiOperation({ summary: 'Get effective permissions for current user and tenant' })
  @ApiResponse({ status: 200, description: 'Map of module:action to scope' })
  async getEffectivePermissions(@Request() req: any) {
    const effectivePermissions = await this.permissionResolver.resolvePermissions(
      req.user.id,
      req.tenantId,
    );
    
    const permissions = Array.from(effectivePermissions.entries()).map(([key, scope]) => {
      const [module, action] = key.split(':');
      return { module, action, scope };
    });
    
    const roles = await this.rbacService.getUserRoles(req.user.id, req.tenantId);
    
    return {
      userId: req.user.id,
      tenantId: req.tenantId,
      permissions,
      roles: roles.map((r: any) => ({ id: r.id, name: r.name })),
      isPlatformAdmin: req.user.isPlatformAdmin ?? false,
    };
  }

  @Get('permissions/modules')
  @ApiOperation({ summary: 'Get allowed module registry list' })
  @ApiResponse({ status: 200, description: 'List of allowed modules' })
  getModules() {
    return { modules: ['tenancy', 'crm', 'agenda', 'sales', 'inventory', 'catalogs', 'audit'] };
  }

  @Post('roles')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.CREATE })
  @ApiOperation({ summary: 'Create a custom role' })
  createRole(@Request() req: any, @Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(dto, req.tenantId, req.user.id);
  }

  @Get('roles')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.READ })
  @ApiOperation({ summary: 'List roles (system and custom)' })
  getRoles(@Request() req: any) {
    return this.rbacService.getRoles(req.tenantId);
  }

  @Patch('roles/:id')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.UPDATE })
  @ApiOperation({ summary: 'Update a custom role' })
  updateRole(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rbacService.updateRole(id, dto, req.tenantId, req.user.id);
  }

  @Post('assignments')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.CREATE })
  @ApiOperation({ summary: 'Assign a role to a user' })
  assignRole(@Request() req: any, @Body() dto: RoleAssignmentDto) {
    return this.rbacService.assignRole(dto, req.tenantId, req.user.id);
  }

  @Delete('assignments/:id')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.DELETE })
  @ApiOperation({ summary: 'Revoke a role from a user' })
  revokeRole(@Request() req: any, @Param('id') id: string) {
    return this.rbacService.revokeRole(id, req.tenantId);
  }

  @Delete('roles/:id')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.DELETE })
  @ApiOperation({ summary: 'Delete a custom role' })
  deleteRole(@Request() req: any, @Param('id') id: string) {
    return this.rbacService.deleteRole(id, req.tenantId);
  }

  @Get('assignments')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.READ })
  @ApiOperation({ summary: 'List role assignments' })
  getAssignments(@Request() req: any) {
    return this.rbacService.getAssignments(req.tenantId);
  }
}
