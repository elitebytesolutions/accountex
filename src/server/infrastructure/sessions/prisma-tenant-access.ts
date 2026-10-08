import { Injectable } from '@nestjs/common';
import { TenantAccess, type SupportSession } from '../../core/application/ports/tenant-access.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PrismaTenantAccess extends TenantAccess {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async tenantStatus(tenantId: string) {
    return (await this.prisma.db().tenants.findUnique({ where: { id: tenantId }, select: { status: true } }))?.status ?? null;
  }

  async supportSession(userSessionId: string): Promise<SupportSession | null> {
    const rows = await this.prisma.db().$queryRaw<{ id: string; email: string | null; isReadOnly: boolean; reason: string; expiresAt: Date; endedAt: Date | null }[]>`
      select i.id, s.email::text as email, i."isReadOnly", i.reason, i."expiresAt", i."endedAt"
        from "Platform"."ImpersonationSessions" i left join "Platform"."PlatformStaff" s on s.id = i."staffUserId"
       where i."userSessionId" = ${userSessionId}::uuid`;
    const r = rows[0];
    return r ? { id: r.id, staffLabel: `Super Admin ${r.email ?? ''}`.trim(), isReadOnly: r.isReadOnly, reason: r.reason, expiresAt: r.expiresAt, endedAt: r.endedAt } : null;
  }

  async expire(supportSessionId: string, userSessionId: string) {
    await this.prisma.withContext({ userId: null, tenantId: null, correlationId: 'support-session-expiry', actorLabel: 'support-session-expiry' }, async () => {
      await this.prisma.db().impersonationSessions.updateMany({ where: { id: supportSessionId, endedAt: null }, data: { endedAt: new Date(), endReason: 'EXPIRED' } });
      await this.prisma.db().userSessions.updateMany({ where: { id: userSessionId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'IMPERSONATION_ENDED' } });
    });
  }
}
