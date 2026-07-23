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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from '../services/users.service.js';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from '../dto/user.dto.js';

import { RequirePlatformAdmin } from '../../../common/decorators/require-platform-admin.decorator.js';
import { BypassTenant } from '../../../common/decorators/bypass-tenant.decorator.js';

@ApiTags('users')
@ApiBearerAuth('bearer')
@BypassTenant()
@Controller('tenancy/users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @RequirePlatformAdmin()
  @Post()
  @ApiOperation({ summary: 'Create a user (platform admin)' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  @RequirePlatformAdmin()
  @Get()
  @ApiOperation({ summary: 'List users (platform admin)' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  findAll(@Query() query: UserQueryDto) {
    return this.service.list(
      query.page,
      query.pageSize,
      query.searchTerm,
      query.isActive,
    );
  }

  @Get('me/tenants')
  @ApiOperation({ summary: "List the authenticated user's tenants" })
  @ApiResponse({
    status: 200,
    description: 'Returns the tenants the caller belongs to',
  })
  getMyTenants() {
    return this.service.getTenantsForUser();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID (platform admin or self)' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.service.get(id);
  }

  @RequirePlatformAdmin()
  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (platform admin)' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }

  @RequirePlatformAdmin()
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a user (platform admin)' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
