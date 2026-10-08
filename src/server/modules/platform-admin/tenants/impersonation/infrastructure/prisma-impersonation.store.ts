import { Injectable } from '@nestjs/common';
import type { ImpersonationSession } from '../../../../../../shared/index.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { ImpersonationStore, type ImpersonationTarget } from '../application/impersonation-store.js';

type Row = {
  id: string; tenantId: string; tenantCode: string; tenantName: string; staff: string | null; targetUserId: string; targetUserLabel: string; reason: string;
  timeLimitMinutes: number; isReadOnly: boolean; startedAt: Date; expiresAt: Date; endedAt: Date | null; endReason: string | null;
};
const SELECT = `
  select i.id, i."tenantId", t.code::text as "tenantCode", t."displayName" as "tenantName", coalesce(s."fullName" || ' · ' || s.email, s."fullName") as staff,
         i."targetUserId", i."targetUserLabel", i.reason, i."timeLimitMinutes", i."isReadOnly", i."startedAt", i."expiresAt", i."endedAt", i."endReason"
    from "Platform"."ImpersonationSessions" i
    join "Platform"."Tenants" t on t.id = i."tenantId"
    left join "Platform"."PlatformStaff" s on s.id = i."staffUserId"`;
const toSession = (r: Row): ImpersonationSession => ({
  id: r.id, tenantId: r.tenantId, tenantCode: r.tenantCode, tenantName: r.tenantName, staff: r.staff, targetUserId: r.targetUserId,
  targetUserLabel: r.targetUserLabel, reason: r.reason, timeLimitMinutes: r.timeLimitMinutes, isReadOnly: r.isReadOnly,
  startedAt: r.startedAt.toISOString(), expiresAt: r.expiresAt.toISOString(), endedAt: r.endedAt?.toISOString() ?? null, endReason: r.endReason,
  live: !r.endedAt && r.expiresAt.getTime() > Date.now(),
});

@Injectable()
export class PrismaImpersonationStore extends ImpersonationStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(f: { tenantId?: string; staffId?: string; liveOnly?: boolean }) {
    const where: string[] = ['true'];
    const args: unknown[] = [];
    if (f.tenantId) { args.push(f.tenantId); where.push(`i."tenantId" = $${args.length}::uuid`); }
    if (f.staffId) { args.push(f.staffId); where.push(`i."staffUserId" = $${args.length}::uuid`); }
    if (f.liveOnly) where.push(`i."endedAt" is null and i."expiresAt" > now()`);
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where ${where.join(' and ')} order by i."startedAt" desc limit 100`, ...args);
    return rows.map(toSession);
  }

  async get(id: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where i.id = $1::uuid`, id);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async byUserSession(userSessionId: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where i."userSessionId" = $1::uuid`, userSessionId);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async staffOf(id: string) {
    const rows = await this.prisma.db().$queryRaw<{ staffId: string; email: string | null }[]>`
      select i."staffUserId" as "staffId", s.email::text as email from "Platform"."ImpersonationSessions" i
        left join "Platform"."PlatformStaff" s on s.id = i."staffUserId" where i.id = ${id}::uuid`;
    return rows[0] ?? null;
  }

  async target(tenantId: string, userId?: string): Promise<ImpersonationTarget | null> {
    const rows = await this.prisma.db().$queryRaw<{ tenantStatus: string; userId: string; fullName: string; email: string }[]>`
      select t.status as "tenantStatus", u.id as "userId", u."fullName", u.email::text
        from "Platform"."Tenants" t
        join "Company"."Users" u on u."tenantId" = t.id and u.id = coalesce(${userId ?? null}::uuid, t."defaultUserId")
       where t.id = ${tenantId}::uuid and u.status = 'ACTIVE' and u."deletedAt" is null`;
    const r = rows[0];
    return r ? { tenantId, tenantStatus: r.tenantStatus, userId: r.userId, label: `${r.fullName} <${r.email}>` } : null;
  }

  async liveForStaff(staffId: string) {
    const r = await this.prisma.db().impersonationSessions.findFirst({ where: { staffUserId: staffId, endedAt: null }, select: { id: true, userSessionId: true, expiresAt: true } });
    return r ?? null;
  }

  async start(s: {
    tenantId: string; staffId: string; target: ImpersonationTarget; reason: string; timeLimitMinutes: number; isReadOnly: boolean;
    userSessionId: string; tokenHash: Uint8Array<ArrayBuffer>; expiresAt: Date; ipAddress?: string; userAgent?: string;
  }) {
    const db = this.prisma.db();
    const now = new Date();
    await db.userSessions.create({
      data: {
        id: s.userSessionId, tenantId: s.tenantId, userId: s.target.userId, tokenHash: s.tokenHash, clientType: 'WEB', authMethod: 'IMPERSONATION',
        deviceLabel: 'Accountex support', userAgent: s.userAgent ?? null, ipAddress: s.ipAddress ?? null, signedInAt: now, lastActiveAt: now, expiresAt: s.expiresAt,
      },
    });
    const row = await db.impersonationSessions.create({
      data: {
        tenantId: s.tenantId, staffUserId: s.staffId, targetUserId: s.target.userId, targetUserLabel: s.target.label, reason: s.reason,
        timeLimitMinutes: s.timeLimitMinutes, isReadOnly: s.isReadOnly, startedAt: now, expiresAt: s.expiresAt, userSessionId: s.userSessionId,
      },
      select: { id: true },
    });
    return row.id;
  }

  async end(id: string, reason: 'MANUAL' | 'EXPIRED' | 'REVOKED') {
    const db = this.prisma.db();
    const row = await db.impersonationSessions.findUnique({ where: { id }, select: { userSessionId: true, endedAt: true } });
    if (!row || row.endedAt) return false;
    await db.impersonationSessions.update({ where: { id }, data: { endedAt: new Date(), endReason: reason } });
    if (row.userSessionId) {
      await db.userSessions.updateMany({ where: { id: row.userSessionId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'IMPERSONATION_ENDED' } });
    }
    return true;
  }
}
