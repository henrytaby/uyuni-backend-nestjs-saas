import { IsUUID, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TENANT_ROLES } from './constants.js';
import { DataTableRequestDto } from './plan.dto.js';

export class CreateTenantUserDto {
  /**
   * Tenant ID (ignored on write — the tenant_id is injected from the
   * request context by the Prisma extension to prevent cross-tenant
   * injection via the request body).
   */
  @ApiProperty({
    description: 'Tenant ID (overridden by context)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  tenantId!: string;

  /**
   * User ID to add as a member. The user must exist globally (this
   * endpoint does NOT handle user registration).
   */
  @ApiProperty({
    description: 'User ID to add as member',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  userId!: string;

  /**
   * Role assignment for the new membership. Valid roles are enforced
   * via class-validator and normalized to uppercase strings.
   */
  @ApiProperty({
    description: 'Role assignment',
    enum: TENANT_ROLES,
    example: 'ADMIN',
  })
  @IsIn(TENANT_ROLES)
  role!: string;
}

export class UpdateTenantUserDto {
  @ApiPropertyOptional({
    description: 'Updated role',
    enum: TENANT_ROLES,
    example: 'ADMIN',
  })
  @IsOptional()
  @IsIn(TENANT_ROLES)
  role?: string;
}

export class TenantUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() role!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() joinedAt!: Date;
  @ApiProperty() createdAt!: Date;
}

/**
 * Query DTO for tenant-user memberships (extends DataTableRequestDto with
 * scoping filters). Delegates `isActive` and `searchTerm` to the base class
 * — only adds tenant-specific filters.
 */
export class TenantUserQueryDto extends DataTableRequestDto {
  @ApiPropertyOptional({
    description: "Filter by tenant (defaults to caller's context)",
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Filter by role' })
  @IsOptional()
  @IsString()
  role?: string;
}
