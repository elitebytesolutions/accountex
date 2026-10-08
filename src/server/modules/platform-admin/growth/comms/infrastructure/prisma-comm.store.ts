import { Injectable } from '@nestjs/common';
import type { BroadcastInput, CommLog, CommLogList, CommLogQuery } from '../../../../../../shared/index.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { CommStore, type BroadcastCompany, type CommTemplateRow, type NewCommLog } from '../application/comm-store.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const LIVE_SUB = `('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED')`;
const PLAN_CODE = `(select p.code from "Platform"."Subscriptions" s join "Platform"."SubscriptionPlans" p on p.id = s."planId"
                    where s."tenantId" = tn.id and s.status in ${LIVE_SUB} order by s."startsOn" desc limit 1)`;
const PLAN_NAME = PLAN_CODE.replace('p.code', 'p.name');

const FILTER: Record<CommLogQuery['filter'], string> = {
  all: 'true',
  delivered: `l.status in ('DELIVERED', 'OPENED', 'READ')`,
  failed: `l.status in ('FAILED', 'BOUNCED')`,
  queued: `l.status = 'QUEUED'`,
};

type LogRow = {
  id: string; createdAt: Date; templateId: string | null; templateName: string | null; broadcastId: string | null; tenantId: string | null;
  tenantName: string | null; recipient: string; channel: string; language: string; subject: string | null; status: string; errorMessage: string | null;
  sentAt: Date | null; deliveredAt: Date | null; isTest: boolean; retryOfId: string | null; retried: boolean;
  body: string | null; relatedDocType: string | null; relatedDocId: string | null;
};
const LOG_SELECT = `
  select l.id::text, l."createdAt", l."commTemplateId"::text as "templateId", ct.name as "templateName", l."commBroadcastId"::text as "broadcastId",
         l."tenantId"::text as "tenantId", tn."displayName" as "tenantName", l.recipient, l.channel, l.language, l.subject, l.status, l."errorMessage",
         l."sentAt", l."deliveredAt", l."isTest", l."retryOfId"::text as "retryOfId",
         exists (select 1 from "Platform"."CommunicationLogs" rr where rr."retryOfId" = l.id) as retried,
         l.body, l."relatedDocType", l."relatedDocId"::text as "relatedDocId"
    from "Platform"."CommunicationLogs" l
    left join "Platform"."CommunicationTemplates" ct on ct.id = l."commTemplateId"
    left join "Platform"."Tenants" tn on tn.id = l."tenantId"`;
const toLog = (r: LogRow): CommLog => ({
  id: r.id, createdAt: r.createdAt.toISOString(), templateId: r.templateId, templateName: r.templateName, broadcastId: r.broadcastId, tenantId: r.tenantId,
  tenantName: r.tenantName, recipient: r.recipient, channel: r.channel, language: r.language, subject: r.subject, status: r.status,
  errorMessage: r.errorMessage, sentAt: iso(r.sentAt), deliveredAt: iso(r.deliveredAt), isTest: r.isTest, retryOfId: r.retryOfId, retried: r.retried,
});

@Injectable()
export class PrismaCommStore extends CommStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolveAudience(input: Pick<BroadcastInput, 'audience' | 'audienceValue' | 'segmentId' | 'tenantIds'>): Promise<BroadcastCompany[]> {
    const args: unknown[] = [];
    const arg = (v: unknown) => { args.push(v); return `$${args.length}`; };
    const live = `tn.status in ('TRIAL', 'ACTIVE', 'PAST_DUE', 'READ_ONLY')`;
    const where: Record<BroadcastInput['audience'], () => string> = {
      ALL_ACTIVE: () => live,
      TRIALS: () => `tn.status = 'TRIAL'`,
      PAST_DUE: () => `tn.status = 'PAST_DUE'`,
      PLAN: () => `${live} and ${PLAN_CODE} = ${arg(input.audienceValue)}`,
      REGION: () => `${live} and tn.province = ${arg(input.audienceValue)}`,
      ENTERPRISE_OWNERS: () => `${live} and ${PLAN_CODE} = 'ENTERPRISE'`,
      SEGMENT: () => `tn.status <> 'CHURNED' and tn.id in (select e."tenantId" from "Platform"."evaluateTenantSegment"(${arg(input.segmentId)}::uuid) e)`,
      SELECTED_TENANTS: () => `tn.status <> 'CHURNED' and tn.id = any(${arg(input.tenantIds)}::uuid[])`,
    };
    const filter = where[input.audience]();
    return this.prisma.db().$queryRawUnsafe<BroadcastCompany[]>(`
      select tn.id::text as "tenantId", tn.code::text as code, tn."displayName" as name, tn."defaultLanguage" as language, ${PLAN_NAME} as "planName",
             o."fullName" as "ownerName", coalesce(o.email::text, tn.email::text) as "ownerEmail", coalesce(o.mobile, tn.phone) as "ownerMobile"
        from "Platform"."Tenants" tn
        left join lateral (select c."fullName", c.email, c.mobile from "Platform"."TenantContacts" c
                            where c."tenantId" = tn.id and c."contactRole" = 'OWNER' order by c."isPrimary" desc, c."createdAt" limit 1) o on true
       where ${filter}
       order by tn."displayName"`, ...args);
  }

  async template(id: string): Promise<CommTemplateRow | null> {
    return this.prisma.db().communicationTemplates.findUnique({
      where: { id }, select: { id: true, name: true, isActive: true, subjectEn: true, bodyEn: true, subjectUr: true, bodyUr: true },
    });
  }

  saveBroadcast(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'tenantBroadcastAddUpdate', data);
  }

  async insertLogs(rows: NewCommLog[]): Promise<string[]> {
    const ids: string[] = [];
    for (const r of rows) {
      const row = await this.prisma.db().communicationLogs.create({ data: { ...r, isTest: false }, select: { id: true } });
      ids.push(row.id);
    }
    return ids;
  }

  async deliverInApp(tenantId: string, title: string, body: string, severity: string) {
    const rows = await this.prisma.db().$queryRaw<{ n: number }[]>`
      select "Platform"."deliverInAppNotice"(${tenantId}::uuid, ${title}, ${body}, ${severity}, null) as n`;
    return rows[0]?.n ?? 0;
  }

  async listLogs(q: CommLogQuery): Promise<CommLogList> {
    const args: unknown[] = [];
    const arg = (v: unknown) => { args.push(v); return `$${args.length}`; };
    const base: string[] = [];
    if (q.hours) base.push(`l."createdAt" >= now() - make_interval(hours => ${arg(q.hours)}::int)`);
    if (q.tenantId) base.push(`l."tenantId" = ${arg(q.tenantId)}::uuid`);
    if (q.broadcastId) base.push(`l."commBroadcastId" = ${arg(q.broadcastId)}::uuid`);
    const scope = base.length ? base.join(' and ') : 'true';
    const db = this.prisma.db();
    const [rows, counts] = await Promise.all([
      db.$queryRawUnsafe<LogRow[]>(`${LOG_SELECT} where ${scope} and ${FILTER[q.filter]} order by l."createdAt" desc limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`, ...args),
      db.$queryRawUnsafe<{ all: number; delivered: number; failed: number; queued: number }[]>(`
        select count(*)::int as "all", count(*) filter (where ${FILTER.delivered})::int as delivered,
               count(*) filter (where ${FILTER.failed})::int as failed, count(*) filter (where ${FILTER.queued})::int as queued
          from "Platform"."CommunicationLogs" l where ${scope}`, ...args),
    ]);
    const c = counts[0]!;
    return { items: rows.map(toLog), total: c[q.filter], counts: c };
  }

  async getLog(id: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<LogRow[]>(`${LOG_SELECT} where l.id = $1::uuid`, id);
    const r = rows[0];
    return r ? { ...toLog(r), body: r.body, commTemplateId: r.templateId, relatedDocType: r.relatedDocType, relatedDocId: r.relatedDocId } : null;
  }
}
