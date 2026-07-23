import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { TokenService } from './token.service.js';
import { LockoutService } from './lockout.service.js';
import { LoginDto } from '../dto/login.dto.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly lockoutService: LockoutService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { tenant: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.lockoutService.checkLockout(user);

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      await this.lockoutService.incrementFailedAttempts(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.lockoutService.resetFailedAttempts(user.id);

    const activeMemberships = user.memberships.filter((m) => m.isActive && m.tenant.isActive);
    let initialTenantId: string | undefined;
    let initialRoles: string[] = [];

    if (activeMemberships.length > 0) {
      initialTenantId = activeMemberships[0].tenantId;
      initialRoles = [activeMemberships[0].role];
    }

    const tokens = await this.tokenService.generateTokens(
      user.id,
      user.email,
      initialRoles,
      initialTenantId,
      user.isPlatformAdmin,
    );

    const tenantsInfo = activeMemberships.map((m) => ({
      tenantId: m.tenant.id,
      name: m.tenant.name,
      role: m.role,
    }));

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      tenants: tenantsInfo,
    };
  }

  async logout(refreshToken: string) {
    if (refreshToken) {
      await this.tokenService.revokeToken(refreshToken);
    }
  }

  async logoutGlobal(userId: string) {
    await this.tokenService.revokeAllForUser(userId);
  }

  async rotateToken(refreshToken: string) {
    return this.tokenService.rotateToken(refreshToken);
  }

  async switchTenantContext(userId: string, email: string, targetTenantId: string) {
    const membership = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: targetTenantId, userId } },
      include: { tenant: true, user: true },
    });

    if (!membership || !membership.isActive || !membership.tenant.isActive) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    const tokens = await this.tokenService.generateTokens(
      userId,
      email,
      [membership.role],
      targetTenantId,
      membership.user.isPlatformAdmin,
    );

    return {
      accessToken: tokens.accessToken,
      tenantId: targetTenantId,
    };
  }
}
