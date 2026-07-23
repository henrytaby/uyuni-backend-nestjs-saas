import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * Test-only sample DTO + controller to exercise the global ValidationPipe
 * 400 path. Imported ONLY inside test/e2e/foundation.e2e-spec.ts via a
 * dedicated TestModule. NOT registered in src/ or AppModule.
 * Remove with the first real domain DTO in spec 002 (T029).
 */
export class SampleDto {
  @IsString()
  @MinLength(3)
  name!: string;
}

import { Public } from '../../src/common/decorators/public.decorator';

@ApiTags('test-validation')
@Public()
@Controller('test-validation')
export class ValidationSampleController {
  @Post()
  @ApiOperation({
    summary: 'Sample endpoint to exercise the global ValidationPipe',
  })
  @ApiResponse({ status: 201, description: 'Valid payload accepted' })
  @ApiResponse({
    status: 400,
    description: 'Invalid payload rejected by ValidationPipe',
  })
  create(@Body() dto: SampleDto): { name: string } {
    return { name: dto.name };
  }
}
