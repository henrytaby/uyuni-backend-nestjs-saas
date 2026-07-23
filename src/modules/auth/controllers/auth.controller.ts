import { Controller, Post, Body, Res, Req, HttpCode, HttpStatus, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service.js';
import { LoginDto } from '../dto/login.dto.js';
import { TenantContextDto } from '../dto/tenant-context.dto.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { BypassTenant } from '../../../common/decorators/bypass-tenant.decorator.js';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user', description: 'Authenticates a user via email and password, returning an access token and setting a secure HttpOnly refresh token cookie.' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated.' })
  @ApiResponse({ status: 400, description: 'Bad Request (validation error).' })
  @ApiResponse({ status: 401, description: 'Unauthorized (invalid credentials).' })
  @ApiResponse({ status: 403, description: 'Forbidden (account locked).' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: any) {
    const { accessToken, refreshToken, user, tenants } = await this.authService.login(loginDto);

    this.setRefreshTokenCookie(response, refreshToken);

    return { accessToken, user, tenants };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token', description: 'Rotates the refresh token securely and issues a new access token.' })
  @ApiResponse({ status: 200, description: 'Successfully refreshed token.' })
  @ApiResponse({ status: 401, description: 'Unauthorized (invalid or missing refresh token).' })
  async refresh(@Req() request: any, @Res({ passthrough: true }) response: any) {
    const oldRefreshToken = request.cookies?.refresh_token;
    if (!oldRefreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const { accessToken, refreshToken } = await this.authService.rotateToken(oldRefreshToken);

    this.setRefreshTokenCookie(response, refreshToken);

    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @BypassTenant()
  @ApiOperation({ summary: 'Local logout', description: 'Invalidates the current session/refresh token family.' })
  @ApiResponse({ status: 200, description: 'Successfully logged out.' })
  async logout(@Req() request: any, @Res({ passthrough: true }) response: any) {
    const refreshToken = request.cookies?.refresh_token;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    
    this.clearRefreshTokenCookie(response);
    return { message: 'Successfully logged out' };
  }

  @Post('logout/global')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @BypassTenant()
  @ApiOperation({ summary: 'Global logout', description: 'Invalidates all active sessions for the user.' })
  @ApiResponse({ status: 200, description: 'Successfully logged out from all devices.' })
  async logoutGlobal(@Req() request: any, @Res({ passthrough: true }) response: any) {
    const userId = request.user?.userId;
    if (userId) {
      await this.authService.logoutGlobal(userId);
    }
    
    this.clearRefreshTokenCookie(response);
    return { message: 'Successfully logged out from all devices' };
  }

  @Post('tenant-context')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @BypassTenant()
  @ApiOperation({ summary: 'Switch tenant context', description: 'Issues a new access token scoped to the specified tenant.' })
  @ApiResponse({ status: 200, description: 'Successfully switched tenant.' })
  @ApiResponse({ status: 403, description: 'Forbidden (user is not an active member of this tenant).' })
  async switchTenantContext(
    @Req() request: any,
    @Body() body: TenantContextDto,
  ) {
    const userId = request.user.userId;
    const email = request.user.email;
    return this.authService.switchTenantContext(userId, email, body.tenantId);
  }

  private setRefreshTokenCookie(response: any, token: string) {
    response.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
    });
  }

  private clearRefreshTokenCookie(response: any) {
    response.cookie('refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
      maxAge: 0,
    });
  }
}
