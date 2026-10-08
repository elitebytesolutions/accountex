import { Injectable } from '@nestjs/common';
import type { DunningAttempt, DunningCaseDetail, DunningKpis, DunningQueueRow } from '../../../../../../shared/index.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import type { PlannedAttempt, RetryStep } from '../domain/dunning-schedule.js';
import { DunningStore, type ActivePolicy, type AdvanceResult, type OverdueInvoice } from '../application/dunning-store.js';

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const bucket = (days: number) => (days <= 7 ? '1-7' : days <= 14 ? '8-14' : days <= 30 ? '15-30' : '30+');

type QueueRow = Omit<DunningQueueRow, 'dueOn' | 'nextRetryAt' | 'promiseDate'> & { dueOn: Date; nextRetryAt: Date | null; promiseDate: Date | null };
const toRow = (r: QueueRow): DunningQueueRow => ({
  ...r, dueOn: isoDay(r.dueOn)!, nextRetryAt: r.nextRetryAt?.toISOString() ?? null, promiseDate: isoDay(r.promiseDate),
  daysOverdue: Number(r.daysOverdue), ageBucket: bucket(Number(r.daysOverdue)),
});

/** $1 = today. Any case (open or closed), same shape as Platform.getCollectionsQueue plus the case's own facts. */
const DETAIL = `
  select dc.id as "caseId", dc."tenantId", t.code::text as "tenantCode", t."displayName" as "tenantName", t.status as "tenantStatus",
         dc."platformInvoiceId" as "invoiceId", i."docNo", i."dueOn", dc."amountDue"::float8 as "amountDue", i."balanceAmount"::float8 as balance,
         greatest($1::date - i."dueOn", 0) as "daysOverdue", dc.stage, dc."paymentMethod", dc."attemptsCount",
         (select count(*)::int from "Platform"."DunningAttempts" a where a."dunningCaseId" = dc.id and a.status <> 'CANCELLED') as "attemptsPlanned",
         dc."lastFailureReason", dc."nextRetryAt", dc."nextRetryMethod", dc."retriesPaused", dc."promiseDate", dc."promiseAmount"::float8 as "promiseAmount",
         p.name as "policyName",
         (select s."mrrAmount"::float8 from "Platform"."Subscriptions" s where s."tenantId" = dc."tenantId" and s.status in ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED') limit 1) as mrr,
         dc."openedAt", dc."closedAt", dc."recoveredAt", dc."promiseSource", dc."promiseNote", dc."promiseLiftReadOnly", dc."promiseRemindOwner",
         i."totalAmount"::float8 as "invoiceTotal", dc."rowVersion"
    from "Platform"."DunningCases" dc
    join "Platform"."PlatformInvoices" i on i.id = dc."platformInvoiceId"
    join "Platform"."Tenants" t on t.id = dc."tenantId"
    join "Platform"."DunningPolicies" p on p.id = dc."dunningPolicyId"`;

@Injectable()
export class PrismaDunningStore extends DunningStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async activePolicy(): Promise<ActivePolicy | null> {
    const p = await this.prisma.db().dunningPolicies.findFirst({ where: { isActive: true }, orderBy: { effectiveFrom: 'desc' } });
    if (!p) return null;
    return {
      id: p.id, name: p.name, graceDays: p.graceDays, readOnlyDays: p.readOnlyDays, suspendedDays: p.suspendedDays, retryHour: p.retryHour,
      salaryRetryDays: p.salaryRetryDays, retrySchedule: (Array.isArray(p.retrySchedule) ? p.retrySchedule : []) as RetryStep[],
    };
  }

  async queue(today: string): Promise<DunningQueueRow[]> {
    const rows = await this.prisma.db().$queryRawUnsafe<QueueRow[]>(`
      select q."dunningCaseId" as "caseId", q."tenantId", q."tenantCode"::text as "tenantCode", q."tenantName", q."tenantStatus", q."platformInvoiceId" as "invoiceId",
             q."invoiceDocNo" as "docNo", q."dueOn", q."amountDue"::float8 as "amountDue", q."balanceAmount"::float8 as balance,
             greatest($1::date - q."dueOn", 0) as "daysOverdue", q.stage, q."paymentMethod", q."attemptsCount", q."attemptsPlanned", q."lastFailureReason",
             q."nextRetryAt", q."nextRetryMethod", q."retriesPaused", q."promiseDate", q."promiseAmount"::float8 as "promiseAmount", q."policyName", q.mrr::float8 as mrr
        from "Platform"."getCollectionsQueue" q
       order by q."dueOn", q."tenantName"`, today);
    return rows.map(toRow);
  }

  async kpis(): Promise<DunningKpis> {
    const rows = await this.prisma.db().$queryRaw<DunningKpis[]>`
      select "recoveredMonthAmount"::float8 as "recoveredMonthAmount", "recoveredMonthCount", "recoveryRate30dPct"::float8 as "recoveryRate30dPct",
             "inDunningCount", "inDunningAmount"::float8 as "inDunningAmount", "churnSavedMrr"::float8 as "churnSavedMrr"
        from "Platform"."getDunningKpis"`;
    return rows[0] ?? { recoveredMonthAmount: 0, recoveredMonthCount: 0, recoveryRate30dPct: null, inDunningCount: 0, inDunningAmount: 0, churnSavedMrr: 0 };
  }

  async detail(id: string, today: string): Promise<DunningCaseDetail | null> {
    const rows = await this.prisma.db().$queryRawUnsafe<(QueueRow & {
      openedAt: Date; closedAt: Date | null; recoveredAt: Date | null; promiseSource: string | null; promiseNote: string | null;
      promiseLiftReadOnly: boolean; promiseRemindOwner: boolean; invoiceTotal: number; rowVersion: number;
    })[]>(`${DETAIL} where dc.id = $2::uuid`, today, id);
    const r = rows[0];
    if (!r) return null;
    const attempts = await this.prisma.db().$queryRaw<(Omit<DunningAttempt, 'scheduledAt' | 'attemptedAt'> & { scheduledAt: Date; attemptedAt: Date | null })[]>`
      select a.id, a."attemptNo", a."planDay", a.label, a.method, a."scheduledAt", a."attemptedAt", a.status, a."triggeredBy", a."failureReason",
             s."fullName" as staff, a."platformPaymentId" as "paymentId"
        from "Platform"."DunningAttempts" a left join "Platform"."PlatformStaff" s on s.id = a."staffUserId"
       where a."dunningCaseId" = ${id}::uuid order by a."attemptNo"`;
    return {
      ...toRow(r), openedAt: r.openedAt.toISOString(), closedAt: r.closedAt?.toISOString() ?? null, recoveredAt: r.recoveredAt?.toISOString() ?? null,
      promiseSource: r.promiseSource, promiseNote: r.promiseNote, promiseLiftReadOnly: r.promiseLiftReadOnly, promiseRemindOwner: r.promiseRemindOwner,
      invoiceTotal: r.invoiceTotal, rowVersion: r.rowVersion,
      attempts: attempts.map((a) => ({ ...a, scheduledAt: a.scheduledAt.toISOString(), attemptedAt: a.attemptedAt?.toISOString() ?? null })),
    };
  }

  async caseForTenant(tenantId: string) {
    const c = await this.prisma.db().dunningCases.findFirst({ where: { tenantId }, orderBy: [{ closedAt: { sort: 'desc', nulls: 'first' } }, { openedAt: 'desc' }], select: { id: true } });
    return c?.id ?? null;
  }

  async caseForInvoice(invoiceId: string) {
    const c = await this.prisma.db().dunningCases.findUnique({ where: { platformInvoiceId: invoiceId }, select: { id: true, closedAt: true } });
    return c ? { id: c.id, closed: c.closedAt !== null } : null;
  }

  async overdueWithoutCase(asOf: string): Promise<OverdueInvoice[]> {
    const rows = await this.prisma.db().$queryRaw<(Omit<OverdueInvoice, 'dueOn'> & { dueOn: Date })[]>`
      select i.id as "invoiceId", i."tenantId", t."displayName" as "tenantName", i."docNo", i."dueOn", i."balanceAmount"::float8 as balance,
             (select s."paymentMethod" from "Platform"."Subscriptions" s where s.id = i."subscriptionId") as "paymentMethod"
        from "Platform"."PlatformInvoices" i
        join "Platform"."Tenants" t on t.id = i."tenantId"
       where i.status in ('OPEN', 'PARTIALLY_PAID') and i."balanceAmount" > 0 and i."dueOn" < ${asOf}::date
         and not exists (select 1 from "Platform"."DunningCases" dc where dc."platformInvoiceId" = i.id)
       order by i."dueOn"`;
    return rows.map((r) => ({ ...r, dueOn: isoDay(r.dueOn)! }));
  }

  async openCaseIds() {
    const rows = await this.prisma.db().dunningCases.findMany({ where: { closedAt: null }, select: { id: true }, orderBy: { openedAt: 'asc' } });
    return rows.map((r) => r.id);
  }

  async tenantStatus(tenantId: string) {
    const t = await this.prisma.db().tenants.findUnique({ where: { id: tenantId }, select: { displayName: true, status: true } });
    return t ? { name: t.displayName, status: t.status } : null;
  }

  open(c: { tenantId: string; invoiceId: string; policyId: string; amountDue: number; paymentMethod: string | null; attempts: PlannedAttempt[] }) {
    return addUpdate(this.prisma, 'dunningCaseAddUpdate', {
      tenantId: c.tenantId, platformInvoiceId: c.invoiceId, dunningPolicyId: c.policyId, amountDue: c.amountDue, paymentMethod: c.paymentMethod,
      stage: 'GRACE', attempts: c.attempts.map((a) => ({ ...a, status: 'SCHEDULED', triggeredBy: 'SCHEDULE' })),
    });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'dunningCaseAddUpdate', data);
  }

  async advance(id: string, asOf: string, escalate: boolean) {
    const rows = await this.prisma.db().$queryRaw<{ r: AdvanceResult }[]>`
      select "Platform"."dunningCaseAdvance"(${id}::uuid, ${asOf}::date, ${escalate}) as r`;
    return rows[0]!.r;
  }

  async tenantSync(tenantId: string) {
    const rows = await this.prisma.db().$queryRaw<{ r: { before: string; after: string } | null }[]>`select "Platform"."dunningTenantSync"(${tenantId}::uuid) as r`;
    return rows[0]?.r ?? null;
  }

  async recordAttempt(caseId: string, a: { method: string; status: 'SUCCEEDED' | 'FAILED'; paymentId: string; failureReason: string | null; staffId: string | null; planDay: number }) {
    const db = this.prisma.db();
    const next = await db.dunningAttempts.findFirst({ where: { dunningCaseId: caseId, status: 'SCHEDULED' }, orderBy: [{ scheduledAt: 'asc' }, { attemptNo: 'asc' }] });
    const done = { status: a.status, attemptedAt: new Date(), triggeredBy: 'MANUAL', platformPaymentId: a.paymentId, failureReason: a.failureReason, staffUserId: a.staffId, method: a.method };
    if (next) {
      await db.dunningAttempts.update({ where: { id: next.id }, data: done });
      return;
    }
    const last = await db.dunningAttempts.aggregate({ where: { dunningCaseId: caseId }, _max: { attemptNo: true } });
    await db.dunningAttempts.create({
      data: { dunningCaseId: caseId, attemptNo: (last._max.attemptNo ?? 0) + 1, planDay: Math.max(0, a.planDay), label: 'Manual retry', scheduledAt: new Date(), ...done },
    });
  }

  async cancelScheduled(caseId: string) {
    await this.prisma.db().dunningAttempts.updateMany({ where: { dunningCaseId: caseId, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
  }

  async markUncollectible(invoiceId: string) {
    await this.prisma.db().platformInvoices.update({ where: { id: invoiceId }, data: { status: 'UNCOLLECTIBLE' } });
  }
}
