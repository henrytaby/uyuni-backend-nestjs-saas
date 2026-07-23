import { Module } from '@nestjs/common';
import { PermissionResolverService } from './services/permission-resolver.service.js';
import { RbacService } from './services/rbac.service.js';

import { RbacController } from './controllers/rbac.controller.js';

@Module({
  controllers: [RbacController],
  providers: [PermissionResolverService, RbacService],
  exports: [PermissionResolverService, RbacService],
})
export class RbacModule {}
