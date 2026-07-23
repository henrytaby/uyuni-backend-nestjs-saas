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
import { TenantsService } from '../services/tenants.service.js';
import {
  CreateTenantDto,
  UpdateTenantDto,
  TenantQueryDto,
} from '../dto/tenant.dto.js';
import { RequirePlatformAdmin } from '../../../common/decorators/require-platform-admin.decorator.js';
import { BypassTenant } from '../../../common/decorators/bypass-tenant.decorator.js';

@ApiTags('tenants')
@ApiBearerAuth('bearer')
@BypassTenant()
@Controller('tenancy/tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @RequirePlatformAdmin()
  @Post()
  @ApiOperation({ summary: 'Create a tenant (platform admin)' })
  @ApiResponse({ status: 201, description: 'Tenant created' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  create(@Body() dto: CreateTenantDto) {
    return this.service.create(dto);
  }

  @RequirePlatformAdmin()
  @Get()
  @ApiOperation({ summary: 'List tenants (platform admin)' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  findAll(
    @Query() query: TenantQueryDto,
    @Query('paymentState') paymentState?: string,
  ) {
    return this.service.list(
      query.page,
      query.pageSize,
      query.searchTerm,
      paymentState,
      query.isActive,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant by ID (platform admin or member)' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  findOne(@Param('id') id: string) {
    return this.service.get(id);
  }

  @RequirePlatformAdmin()
  @Patch(':id')
  @ApiOperation({ summary: 'Update a tenant (platform admin)' })
  @ApiResponse({ status: 409, description: 'Slug conflict' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.service.update(id, dto);
  }

  @RequirePlatformAdmin()
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a tenant (platform admin)' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
