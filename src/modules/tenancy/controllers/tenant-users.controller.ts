import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantUsersService } from '../services/tenant-users.service.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import { PermissionAction } from '@prisma/client';
import {
  CreateTenantUserDto,
  UpdateTenantUserDto,
  TenantUserQueryDto,
} from '../dto/tenant-user.dto.js';

@ApiTags('tenant-users')
@ApiBearerAuth()
@Controller('tenancy/tenant-users')
export class TenantUsersController {
  constructor(private readonly service: TenantUsersService) {}

  @Post()
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.CREATE })
  @ApiOperation({ summary: 'Create a tenant membership' })
  @ApiResponse({ status: 201, description: 'Membership created' })
  @ApiResponse({ status: 409, description: 'Duplicate membership' })
  create(@Body() dto: CreateTenantUserDto) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.READ })
  @ApiOperation({ summary: 'List tenant memberships' })
  findAll(@Query() query: TenantUserQueryDto, @Query('role') role?: string) {
    return this.service.list(query, role, query.isActive);
  }

  @Get(':id')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.READ })
  @ApiOperation({ summary: 'Get a membership by ID' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.UPDATE })
  @ApiOperation({ summary: 'Update membership role' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantUserDto) {
    return this.service.updateRole(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ module: 'tenancy', action: PermissionAction.DELETE })
  @ApiOperation({ summary: 'Deactivate a membership' })
  remove(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}
