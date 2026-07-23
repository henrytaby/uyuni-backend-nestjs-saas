import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionAction } from '@prisma/client';
import { ChangeRecordService } from '../services/change-record.service.js';
import { ChangeRecordQueryDto } from '../dto/change-record-query.dto.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import { TenantContextService } from '../../../common/context/tenant-context.js';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.js';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit/change-records')
export class ChangeRecordsController {
  constructor(
    private readonly changeRecordService: ChangeRecordService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions({ module: 'audit', action: PermissionAction.READ })
  @ApiOperation({ summary: 'List change records with cursor pagination' })
  @ApiResponse({ status: 200, description: 'List of change records' })
  async getChangeRecords(@Query() query: ChangeRecordQueryDto) {
    const tenantId = this.tenantContextService.getTenantId();
    return this.changeRecordService.findMany(tenantId, query);
  }

  @Get('entity/:entityType/:entityId')
  @RequirePermissions({ module: 'audit', action: PermissionAction.READ })
  @ApiOperation({ summary: 'Get entity history' })
  @ApiResponse({ status: 200, description: 'List of changes for an entity' })
  async getEntityHistory(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    const tenantId = this.tenantContextService.getTenantId();
    return this.changeRecordService.findByEntityHistory(
      tenantId,
      entityType,
      entityId,
    );
  }

  @Get('request/:requestId')
  @RequirePermissions({ module: 'audit', action: PermissionAction.READ })
  @ApiOperation({ summary: 'Get change records by request ID' })
  @ApiResponse({ status: 200, description: 'List of changes for a request' })
  async getChangeRecordsByRequestId(@Param('requestId') requestId: string) {
    const tenantId = this.tenantContextService.getTenantId();
    return this.changeRecordService.findByRequestId(tenantId, requestId);
  }
}
