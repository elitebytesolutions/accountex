import { Injectable } from '@nestjs/common';
import type { AuditAlertRule, MaintenanceWindow, PlatformAuditLogQuery, PlatformAuditLogRow, UsageAlertRule, UsageAlertRuleOptions } from '../../../../../shared/index.js';
import type { AuditAlertRules, MaintenanceWindows } from '../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { AuditAlertRuleStore, MaintenanceWindowStore, UsageAlertRuleStore } from '../application/alerting-stores.js';

const toWindow = (r: MaintenanceWindows): MaintenanceWindow => ({
  id: r.id, title: r.title, message: r.message, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), components: r.components,
  bannerLeadHours: r.bannerLeadHours, readOnlyMode: r.readOnlyMode, status: r.status, createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
});

@Injectable()
export class PrismaMaintenanceWindowStore extends MaintenanceWindowStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(upcomingOnly: boolean) {
    const rows = await this.prisma.db().maintenanceWindows.findMany({
      where: upcomingOnly ? { status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, endsAt: { gt: new Date() } } : {},
      orderBy: upcomingOnly ? { startsAt: 'asc' } : { startsAt: 'desc' },
      take: 200,
    });
    return rows.map(toWindow);
  }

  async get(id: string) {
    const r = await this.prisma.db().maintenanceWindows.findUnique({ where: { id } });
    return r ? toWindow(r) : null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'maintenanceWindowAddUpdate', data);
  }
}

@Injectable()
export class PrismaUsageAlertRuleStore extends UsageAlertRuleStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async rows(id?: string): Promise<UsageAlertRule[]> {
    const db = this.prisma.db();
    const rules = await db.usageAlertRules.findMany({ where: id ? { id } : {}, orderBy: [{ isEnabled: 'desc' }, { thresholdPct: 'asc' }, { createdAt: 'asc' }] });
    if (!rules.length) return [];
    const [meters, plans, addons] = await Promise.all([
      db.$queryRawUnsafe<{ id: string; name: string }[]>(`select id::text, name from "Platform"."UsageMeters"`),
      db.subscriptionPlans.findMany({ select: { id: true, name: true } }),
      db.addons.findMany({ select: { id: true, name: true } }),
    ]);
    const name = (list: { id: string; name: string }[], i: string | null) => (i ? (list.find((x) => x.id === i)?.name ?? null) : null);
    return rules.map((r) => ({
      id: r.id, usageMeterId: r.usageMeterId, usageMeterName: name(meters, r.usageMeterId), thresholdPct: r.thresholdPct, planId: r.planId,
      planName: name(plans, r.planId), action: r.action, actionDetail: r.actionDetail, throttleRps: r.throttleRps, offerAddonId: r.offerAddonId,
      offerAddonName: name(addons, r.offerAddonId), isEnabled: r.isEnabled, evalIntervalMinutes: r.evalIntervalMinutes,
      lastEvaluatedAt: r.lastEvaluatedAt?.toISOString() ?? null, updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }

  list() {
    return this.rows();
  }

  async get(id: string) {
    return (await this.rows(id))[0] ?? null;
  }

  async options(): Promise<UsageAlertRuleOptions> {
    const db = this.prisma.db();
    const [meters, plans, addons] = await Promise.all([
      db.$queryRawUnsafe<{ id: string; name: string }[]>(`select id::text, name from "Platform"."UsageMeters" where "isActive" order by "sortOrder", name`),
      db.subscriptionPlans.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, code: true, name: true } }),
      db.addons.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    return { meters, plans, addons };
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'usageAlertRuleAddUpdate', data);
  }

  async delete(id: string) {
    await this.prisma.db().usageAlertRules.delete({ where: { id } });
  }
}

const toAuditRule = (r: AuditAlertRules): AuditAlertRule => ({
  id: r.id, name: r.name, actionPattern: r.actionPattern, resultFilter: r.resultFilter, thresholdCount: r.thresholdCount, windowMinutes: r.windowMinutes,
  channels: r.channels, recipients: r.recipients, isActive: r.isActive, updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
});

@Injectable()
export class PrismaAuditAlertRuleStore extends AuditAlertRuleStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    const rows = await this.prisma.db().auditAlertRules.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return rows.map(toAuditRule);
  }

  async get(id: string) {
    const r = await this.prisma.db().auditAlertRules.findUnique({ where: { id } });
    return r ? toAuditRule(r) : null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'auditAlertRuleAddUpdate', data);
  }

  async delete(id: string) {
    await this.prisma.db().auditAlertRules.delete({ where: { id } });
  }

  async auditLog(q: PlatformAuditLogQuery) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.search) {
      args.push(`%${q.search}%`);
      where.push(`(l.action ilike $${args.length} or l."actorLabel" ilike $${args.length} or l.details ilike $${args.length} or host(l."ipAddress") ilike $${args.length} or t.code::text ilike $${args.length})`);
    }
    if (q.result) {
      args.push(q.result);
      where.push(`l.result = $${args.length}`);
    }
    const w = where.length ? `where ${where.join(' and ')}` : '';
    args.push(q.pageSize, (q.page - 1) * q.pageSize);
    const rows = await this.prisma.db().$queryRawUnsafe<(Omit<PlatformAuditLogRow, 'occurredAt'> & { occurredAt: Date; total: bigint })[]>(`
      select l.id::text, l."occurredAt", l."actorLabel", l."actorDetail", l.action, t.code::text as "tenantCode", l.details,
             host(l."ipAddress") as "ipAddress", l.result, count(*) over () as total
        from "Platform"."PlatformAuditLogs" l left join "Platform"."Tenants" t on t.id = l."tenantId"
        ${w}
       order by l."occurredAt" desc, l.id desc
       limit $${args.length - 1} offset $${args.length}`, ...args);
    return {
      total: Number(rows[0]?.total ?? 0),
      items: rows.map((r) => ({ id: r.id, occurredAt: r.occurredAt.toISOString(), actorLabel: r.actorLabel, actorDetail: r.actorDetail, action: r.action, tenantCode: r.tenantCode, details: r.details, ipAddress: r.ipAddress, result: r.result })),
    };
  }
}
