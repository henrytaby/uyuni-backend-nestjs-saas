import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PermissionDto } from './permission.dto.js';

export class CreateRoleDto {
  @ApiProperty({ example: 'Manager' })
  @IsString()
  name!: string;

  @ApiProperty({ required: false, example: 'Store Manager' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [PermissionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions?: PermissionDto[];
}

export class UpdateRoleDto {
  @ApiProperty({ required: false, example: 'Manager updated' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [PermissionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions?: PermissionDto[];
}
