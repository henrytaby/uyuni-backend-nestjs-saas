import {
  IsString,
  IsUUID,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataTableRequestDto } from './plan.dto.js';

export class CreateTenantDto {
  @ApiProperty({ description: 'Tenant name (1-100 chars)' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'URL-safe slug (lowercase alphanumeric+hyphens, 3-50)',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @ApiProperty({ description: 'Plan ID' })
  @IsUUID()
  planId!: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;
}

export class TenantResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() paymentState!: string;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() subscriptionStart?: Date;
  @ApiPropertyOptional() subscriptionEnd?: Date;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/**
 * Query DTO for tenant listings (extends DataTableRequestDto with
 * platform-admin-specific filters).
 */
export class TenantQueryDto extends DataTableRequestDto {
  @ApiPropertyOptional({ description: 'Filter by payment state' })
  @IsOptional()
  @IsString()
  paymentState?: string;
}
