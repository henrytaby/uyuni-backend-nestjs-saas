import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PLATFORM_ADMIN_KEY = 'requirePlatformAdmin';
export const RequirePlatformAdmin = () =>
  SetMetadata(REQUIRE_PLATFORM_ADMIN_KEY, true);
