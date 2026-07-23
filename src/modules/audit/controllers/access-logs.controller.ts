import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionAction } from '@prisma/client';
import { AccessLogService } from '../services/access-log.service.js';
import { AccessLogQueryDto } from '../dto/access-log-query.dto.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import { TenantContextService } from '../../../common/context/tenant-context.js';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.js';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit/access-logs')
export class AccessLogsController {
  constructor(
    private readonly accessLogService: AccessLogService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions({ module: 'audit', action: PermissionAction.READ })
  @ApiOperation({ summary: 'List access logs with cursor pagination' })
  @ApiResponse({ status: 200, description: 'List of access logs' })
  async getAccessLogs(@Query() query: AccessLogQueryDto) {
    const tenantId = this.tenantContextService.getTenantId();
    return this.accessLogService.findMany(tenantId, query);
  }

  @Get(':requestId')
  @RequirePermissions({ module: 'audit', action: PermissionAction.READ })
  @ApiOperation({ summary: 'Get access logs by request ID' })
  @ApiResponse({ status: 200, description: 'Access log details' })
  async getAccessLogsByRequestId(@Param('requestId') requestId: string) {
    const tenantId = this.tenantContextService.getTenantId();
    return this.accessLogService.findByRequestId(tenantId, requestId);
  }
}
