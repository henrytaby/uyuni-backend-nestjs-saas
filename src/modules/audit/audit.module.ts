import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AccessLogService } from './services/access-log.service.js';
import { ChangeRecordService } from './services/change-record.service.js';
import { AccessLogsController } from './controllers/access-logs.controller.js';
import { ChangeRecordsController } from './controllers/change-records.controller.js';

@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [AccessLogsController, ChangeRecordsController],
  providers: [AccessLogService, ChangeRecordService],
  exports: [AccessLogService, ChangeRecordService],
})
export class AuditModule {}
