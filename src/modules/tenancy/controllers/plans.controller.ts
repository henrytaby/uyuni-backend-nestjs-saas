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
import { PlansService } from '../services/plans.service.js';
import {
  CreatePlanDto,
  UpdatePlanDto,
  DataTableRequestDto,
} from '../dto/plan.dto.js';
import { RequirePlatformAdmin } from '../../../common/decorators/require-platform-admin.decorator.js';
import { BypassTenant } from '../../../common/decorators/bypass-tenant.decorator.js';

@ApiTags('plans')
@ApiBearerAuth('bearer')
@RequirePlatformAdmin()
@BypassTenant()
@Controller('tenancy/plans')
export class PlansController {
  constructor(private readonly service: PlansService) {}

  @Post()
  @ApiOperation({ summary: 'Create a plan (platform admin)' })
  @ApiResponse({ status: 201, description: 'Plan created' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  create(@Body() dto: CreatePlanDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all plans (platform admin)' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  findAll(@Query() query: DataTableRequestDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a plan by ID (platform admin)' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  findOne(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a plan (platform admin)' })
  @ApiResponse({ status: 409, description: 'maxUsers below member count' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a plan (platform admin)' })
  @ApiResponse({ status: 409, description: 'Plan in use' })
  @ApiResponse({
    status: 403,
    description: 'Platform admin privileges required',
  })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
