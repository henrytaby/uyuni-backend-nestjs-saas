import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsArray,
  IsIn,
  IsNumber,
  ArrayUnique,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MODULE_ACCESS } from './constants.js';

export class CreatePlanDto {
  @ApiProperty({ description: 'Plan name (1-50 chars)' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Tier level (1-10)' })
  @IsInt()
  @Min(1)
  @Max(10)
  tierLevel!: number;

  @ApiProperty({ description: 'Max users allowed' })
  @IsInt()
  @Min(1)
  maxUsers!: number;

  @ApiProperty({ description: 'Storage limit in bytes' })
  @IsNumber()
  @Min(0)
  storageLimit!: number;

  @ApiProperty({ description: 'Enabled module names', isArray: true })
  @IsArray()
  @IsIn(MODULE_ACCESS, { each: true })
  @ArrayUnique()
  moduleAccess!: string[];

  @ApiPropertyOptional({ description: 'Monthly price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  tierLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  storageLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsIn(MODULE_ACCESS, { each: true })
  @ArrayUnique()
  moduleAccess?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class PlanResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() tierLevel!: number;
  @ApiProperty() maxUsers!: number;
  @ApiProperty() storageLimit!: number;
  @ApiProperty() moduleAccess!: string[];
  @ApiPropertyOptional() price?: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/** Base DataTable query DTO shared across all entity endpoints. */
export class DataTableRequestDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 25;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}
