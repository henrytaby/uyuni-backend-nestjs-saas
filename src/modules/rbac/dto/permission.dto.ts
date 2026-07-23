import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { PermissionAction, PermissionScope } from '@prisma/client';

export class PermissionDto {
  @ApiProperty({
    description: 'The module this permission applies to',
    example: 'crm',
  })
  @IsString()
  @IsNotEmpty()
  module!: string;

  @ApiProperty({ enum: PermissionAction, description: 'The action allowed' })
  @IsEnum(PermissionAction)
  action!: PermissionAction;

  @ApiProperty({
    enum: PermissionScope,
    description: 'The scope of the permission',
    default: PermissionScope.OWN,
  })
  @IsEnum(PermissionScope)
  scope!: PermissionScope;
}
