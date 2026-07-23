import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

@Injectable()
export class LockoutService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_MINUTES = 15;

  constructor(private readonly prisma: PrismaService) {}

  checkLockout(user: { lockedUntil: Date | null }) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        `Account is locked due to too many failed attempts. Try again later. Locked until: ${user.lockedUntil.toISOString()}`,
      );
    }
  }

  async incrementFailedAttempts(userId: string, currentAttempts: number) {
    const nextAttempts = currentAttempts + 1;
    let lockedUntil: Date | null = null;

    if (nextAttempts >= this.MAX_ATTEMPTS) {
      lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + this.LOCKOUT_MINUTES);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: nextAttempts,
        lockedUntil,
      },
    });

    if (lockedUntil) {
      throw new ForbiddenException(
        `Account is locked due to too many failed attempts. Try again later. Locked until: ${lockedUntil.toISOString()}`,
      );
    }
  }

  async resetFailedAttempts(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }
}
