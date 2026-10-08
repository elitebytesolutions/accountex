import { Injectable } from '@nestjs/common';
import type { AllowedIp } from '../../../../../../shared/index.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { AdminLoginPolicyStore, SecurityStore, type LoginPolicy, type StoredSecuritySettings } from '../application/security-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Allowed ranges: cidr is Unsupported in Prisma, so they are read with SQL (cidr::text). */
async function readRanges(prisma: PrismaService): Promise<AllowedIp[]> {
  return prisma.db().$queryRaw<AllowedIp[]>`
    select id::text as id, cidr::text as cidr, label, "isActive", "rowVersion" from "Platform"."PlatformAllowedIps" order by "createdAt", cidr`;
}

@Injectable()
export class PrismaSecurityStore extends SecurityStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async settings(): Promise<StoredSecuritySettings | null> {
    const r = await this.prisma.db().platformSecuritySettings.findUnique({ where: { id: 1 } });
    if (!r) return null;
    // Everything except the id, audit stamps and the certificate PEM (shown as its file name and expiry only).
    return {
      ssoProvider: r.ssoProvider, samlIdpSsoUrl: r.samlIdpSsoUrl, samlIdpEntityId: r.samlIdpEntityId, samlNameIdFormat: r.samlNameIdFormat,
      samlCertFilename: r.samlCertFilename, samlCertExpiresOn: day(r.samlCertExpiresOn), samlAcsUrl: r.samlAcsUrl, googleDomain: r.googleDomain,
      googleClientId: r.googleClientId, googleAllowedGroups: r.googleAllowedGroups, requireSso: r.requireSso, breakGlassSuperAdmin: r.breakGlassSuperAdmin,
      mfaEnforcement: r.mfaEnforcement, mfaAllowWebauthn: r.mfaAllowWebauthn, mfaAllowTotp: r.mfaAllowTotp, mfaAllowSms: r.mfaAllowSms,
      ipAllowlistEnforced: r.ipAllowlistEnforced, pwMinLength: r.pwMinLength, pwRequireMixedCase: r.pwRequireMixedCase, pwRequireNumber: r.pwRequireNumber,
      pwRequireSymbol: r.pwRequireSymbol, pwBlockBreached: r.pwBlockBreached, pwBlockReuse: r.pwBlockReuse, pwRotationDays: r.pwRotationDays,
      lockoutAttempts: r.lockoutAttempts, lockoutMinutes: r.lockoutMinutes, updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
    };
  }

  async saveSettings(data: Record<string, unknown>) {
    await addUpdate(this.prisma, 'platformSecuritySettingAddUpdate', data);
  }

  allowedIps() {
    return readRanges(this.prisma);
  }

  addAllowedIp(data: { cidr: string; label: string | null }) {
    return addUpdate(this.prisma, 'platformAllowedIpAddUpdate', { cidr: data.cidr, ...(data.label && { label: data.label }), isActive: true });
  }

  async removeAllowedIp(id: string) {
    await this.prisma.db().platformAllowedIps.deleteMany({ where: { id } });
  }
}

/**
 * Sign-in state on Platform.PlatformAdmin. PlatformAdmin has no audit trigger, so counting attempts writes no history;
 * the updates are single atomic statements (no read-modify-write race between parallel attempts).
 */
@Injectable()
export class PrismaAdminLoginPolicyStore extends AdminLoginPolicyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async policy(): Promise<LoginPolicy | null> {
    const s = await this.prisma.db().platformSecuritySettings.findUnique({ where: { id: 1 } });
    if (!s) return null;
    return {
      ipAllowlistEnforced: s.ipAllowlistEnforced, ranges: await readRanges(this.prisma),
      lockoutAttempts: s.lockoutAttempts, lockoutMinutes: s.lockoutMinutes,
      pwMinLength: s.pwMinLength, pwRequireMixedCase: s.pwRequireMixedCase, pwRequireNumber: s.pwRequireNumber,
      pwRequireSymbol: s.pwRequireSymbol, pwBlockBreached: s.pwBlockBreached, pwBlockReuse: s.pwBlockReuse,
    };
  }

  async lockedUntil(adminId: string) {
    const r = await this.prisma.db().platformAdmin.findUnique({ where: { id: adminId }, select: { lockedUntil: true } });
    return r?.lockedUntil ?? null;
  }

  async recordFailure(adminId: string, attempts: number, minutes: number): Promise<Date | null> {
    const rows = await this.prisma.db().$queryRaw<{ lockedNow: boolean; lockedUntil: Date | null }[]>`
      update "Platform"."PlatformAdmin"
         set "failedLoginCount" = case when "failedLoginCount" + 1 >= ${attempts}::int then 0 else "failedLoginCount" + 1 end,
             "lockedUntil" = case when "failedLoginCount" + 1 >= ${attempts}::int then now() + make_interval(mins => ${minutes}::int) else "lockedUntil" end
       where id = ${adminId}::uuid
      returning ("lockedUntil" > now()) as "lockedNow", "lockedUntil"`;
    const r = rows[0];
    return r?.lockedNow && r.lockedUntil ? r.lockedUntil : null;
  }

  async recordSuccess(adminId: string) {
    await this.prisma.db().platformAdmin.update({ where: { id: adminId }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  }

  async setPasswordHash(adminId: string, hash: string) {
    await this.prisma.db().platformAdmin.update({ where: { id: adminId }, data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null } });
  }
}
