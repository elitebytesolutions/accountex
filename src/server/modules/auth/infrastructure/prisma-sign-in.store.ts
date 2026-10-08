import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { SignInStore, type SignInCandidate } from '../application/sign-in-store.js';

const hhmm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);

@Injectable()
export class PrismaSignInStore extends SignInStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findCandidate(companyCode: string, email: string): Promise<SignInCandidate | null> {
    const db = this.prisma.db();
    const tenant = await db.tenants.findFirst({ where: { code: companyCode }, select: { id: true, status: true } });
    if (!tenant) return null;
    const user = await db.users.findFirst({
      where: { tenantId: tenant.id, email, status: { not: 'REMOVED' }, deletedAt: null },
      select: { id: true, tenantId: true, status: true, passwordHash: true, failedLoginCount: true, lockedUntil: true, loginHours: true, loginFrom: true, loginTo: true },
    });
    if (!user) return null;
    const settings = await db.companySettings.findFirst({ where: { tenantId: tenant.id }, select: { timezone: true } });
    return { ...user, loginFrom: hhmm(user.loginFrom), loginTo: hhmm(user.loginTo), timeZone: settings?.timezone ?? 'Asia/Karachi', tenantStatus: tenant.status };
  }

  async ipAllowed(userId: string, ip: string | undefined) {
    // ipAllowlist is cidr[], which Prisma cannot read; the containment test runs in SQL.
    const rows = await this.prisma.db().$queryRaw<{ ok: boolean }[]>`
      select (not "ipRestricted") or (${ip ?? null}::inet is not null and ${ip ?? null}::inet <<= any("ipAllowlist")) as ok
      from "Company"."Users" where id = ${userId}::uuid`;
    return rows[0]?.ok ?? false;
  }

  async recordLogin(userId: string, ip: string | undefined) {
    await this.prisma.db().users.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lastActiveAt: new Date(), lastLoginIp: ip ?? null, failedLoginCount: 0, lockedUntil: null },
    });
  }

  async recordFailedLogin(userId: string, lockUntil: Date | null) {
    await this.prisma.db().users.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 }, ...(lockUntil && { lockedUntil: lockUntil }) },
    });
  }
}
