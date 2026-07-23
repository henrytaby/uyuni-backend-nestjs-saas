import {
  IsEmail,
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataTableRequestDto } from './plan.dto.js';

export class CreateUserDto {
  @ApiProperty({ description: 'Unique email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Password (min 8 chars, stored as bcrypt hash)' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ description: 'First name (1-50 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name (1-50 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Platform admin flag', default: false })
  @IsOptional()
  @IsBoolean()
  isPlatformAdmin?: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPlatformAdmin?: boolean;
}

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional() firstName?: string;
  @ApiPropertyOptional() lastName?: string;
  @ApiProperty() isPlatformAdmin!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

/**
 * Query DTO for user listings. Inherits page/pageSize/searchTerm/isActive
 * from DataTableRequestDto — no additional filters needed for the platform-
 * admin user list endpoint (contracts/users.md).
 */
export class UserQueryDto extends DataTableRequestDto {}
