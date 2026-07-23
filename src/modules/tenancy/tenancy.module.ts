import { Module } from '@nestjs/common';
import { TenantContextModule } from '../../common/context/tenant-context.module.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { PlansController } from './controllers/plans.controller.js';
import { TenantsController } from './controllers/tenants.controller.js';
import { UsersController } from './controllers/users.controller.js';
import { TenantUsersController } from './controllers/tenant-users.controller.js';
import { PlansService } from './services/plans.service.js';
import { TenantsService } from './services/tenants.service.js';
import { UsersService } from './services/users.service.js';
import { TenantUsersService } from './services/tenant-users.service.js';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [
    PlansController,
    TenantsController,
    UsersController,
    TenantUsersController,
  ],
  providers: [PlansService, TenantsService, UsersService, TenantUsersService],
  exports: [],
})
export class TenancyModule {}
