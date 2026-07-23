import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RoleAssignmentDto {
  @ApiProperty({
    description: 'The UUID of the TenantUser to assign the role to',
  })
  @IsUUID()
  tenantUserId!: string;

  @ApiProperty({ description: 'The UUID of the Role to assign' })
  @IsUUID()
  roleId!: string;
}
