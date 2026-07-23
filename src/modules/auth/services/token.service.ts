import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import * as crypto from 'crypto';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async generateTokens(
    userId: string,
    email: string,
    roles: string[] = [],
    tenantId?: string,
  ) {
    const payload = {
      sub: userId,
      email,
      roles,
      tenant_id: tenantId,
      mfa_verified: false,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    const expiresInDays = this.configService.get<number>('REFRESH_TOKEN_EXPIRES_IN_DAYS', 7);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const createdToken = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenId: createdToken.id,
    };
  }

  async rotateToken(oldRefreshToken: string) {
    const tokenHash = this.hashToken(oldRefreshToken);
    const existingToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: {
        user: {
          include: { memberships: { include: { tenant: true } } },
        },
      },
    });

    if (!existingToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existingToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (existingToken.isRevoked) {
      // Token reuse detected! Revoke the entire family
      await this.invalidateFamily(existingToken.id);
      throw new UnauthorizedException('Token reuse detected. Session invalidated.');
    }

    // Determine roles/tenant from user
    const activeMemberships = existingToken.user.memberships.filter(
      (m: any) => m.isActive && m.tenant.isActive,
    );
    let tenantId: string | undefined;
    let roles: string[] = [];
    if (activeMemberships.length > 0) {
      tenantId = activeMemberships[0].tenantId;
      roles = [activeMemberships[0].role];
    }

    // Generate new tokens
    const newTokens = await this.generateTokens(
      existingToken.user.id,
      existingToken.user.email,
      roles,
      tenantId,
    );

    // Mark old token as revoked and point it to the new token
    await this.prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: {
        isRevoked: true,
        replacedById: newTokens.tokenId,
      },
    });

    return newTokens;
  }

  private async invalidateFamily(tokenId: string) {
    let currentId: string | null = tokenId;
    while (currentId) {
      const token: any = await this.prisma.refreshToken.findUnique({
        where: { id: currentId },
        include: { replacements: true },
      });
      if (!token) break;

      await this.prisma.refreshToken.update({
        where: { id: currentId },
        data: { isRevoked: true },
      });

      // Move to the next token in the chain
      currentId = token.replacements.length > 0 ? token.replacements[0].id : null;
    }
  }

  async revokeToken(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
