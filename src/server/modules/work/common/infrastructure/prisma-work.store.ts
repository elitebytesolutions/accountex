import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import type {
  DueItem, NotificationItem, NotificationPreferences, NotificationQuery, NotificationSummary, TaskQuery, TodayKpis, WorkUser, WorkspaceDashboard,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { WorkStore, type TaskRow } from '../application/work-store.js';

type Db = Prisma.TransactionClient;
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const hhmm = (d: Date | null | undefined) => (d ? d.toISOString().slice(11, 16) : null);
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
/** Template-style routes from the views ("app/sales/invoices/view") → app paths. */
const route = (r: string | null, id: string | null) => {
  if (!r) return '/today';
  const p = `/${r.replace(/^\/?app\//, '')}`;
  return p.endsWith('/view') && id ? p.replace(/\/view$/, `/${id}`) : p.replace(/\/view$/, '');
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ALL = 'ALL_EVENTS';

async function names(db: Db, tenantId: string, ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = list.length ? await db.users.findMany({ where: { tenantId, id: { in: list } }, select: { id: true, fullName: true, email: true } }) : [];
  return new Map(rows.map((u) => [u.id, { id: u.id, name: u.fullName ?? u.email }]));
}

@Injectable()
export class PrismaWorkStore extends WorkStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private raw<T>(sql: string, ...args: unknown[]) {
    return this.prisma.db().$queryRawUnsafe<T[]>(sql, ...args);
  }

  async users(tenantId: string): Promise<WorkUser[]> {
    const rows = await this.prisma.db().users.findMany({ where: { tenantId, status: 'ACTIVE', deletedAt: null }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } });
    return rows.map((u) => ({ id: u.id, name: u.fullName ?? u.email }));
  }

  async companyToday(tenantId: string) {
    const r = await this.raw<{ d: string }>(
      `select (now() at time zone coalesce((select nullif(cs.timezone, '') from "Company"."CompanySettings" cs where cs."tenantId" = $1::uuid), 'Asia/Karachi'))::date::text as d`, tenantId);
    return r[0]!.d;
  }

  // ---------------------------------------------------------------- tasks
  private async mapTasks(tenantId: string, rows: Prisma.TasksGetPayload<object>[]): Promise<TaskRow[]> {
    const who = await names(this.prisma.db(), tenantId, rows.flatMap((r) => [r.assigneeUserId, r.assignedByUserId]));
    return rows.map((t) => ({
      id: t.id, kind: t.kind, title: t.title, notes: t.notes, module: t.module, assignee: who.get(t.assigneeUserId) ?? null,
      assignedBy: t.assignedByUserId ? who.get(t.assignedByUserId) ?? null : null, assigneeUserId: t.assigneeUserId, assignedByUserId: t.assignedByUserId,
      dueDate: day(t.dueDate)!, dueTime: hhmm(t.dueTime), priority: t.priority, status: t.status, repeatRule: t.repeatRule, remindBeforeMin: t.remindBeforeMin,
      source: t.source, linkRoute: t.linkRoute, completedAt: t.completedAt?.toISOString() ?? null, rowVersion: t.rowVersion,
    }));
  }

  async listTasks(tenantId: string, userId: string, q: TaskQuery) {
    const rows = await this.prisma.db().tasks.findMany({
      where: {
        tenantId,
        ...(q.scope === 'mine' ? { assigneeUserId: userId } : { assignedByUserId: userId, assigneeUserId: { not: userId } }),
        ...(q.status === 'open' ? { status: { in: ['PENDING', 'IN_PROGRESS'] } } : q.status === 'done' ? { status: 'DONE' } : {}),
        ...((q.from || q.to) && { dueDate: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      },
      orderBy: [{ dueDate: 'asc' }, { dueTime: 'asc' }, { createdAt: 'asc' }],
      take: 300,
    });
    return this.mapTasks(tenantId, rows);
  }

  async getTask(tenantId: string, id: string) {
    const row = await this.prisma.db().tasks.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapTasks(tenantId, [row]))[0]! : null;
  }

  saveTask(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'taskAddUpdate', data);
  }

  async completeTask(id: string) {
    return (await this.raw<{ id: string | null }>('select "Company"."taskComplete"($1::uuid)::text as id', id))[0]?.id ?? null;
  }

  async setTaskStatus(tenantId: string, id: string, rowVersion: number, status: 'IN_PROGRESS' | 'CANCELLED' | 'PENDING') {
    return (await this.prisma.db().tasks.updateMany({ where: { tenantId, id, rowVersion, status: { in: ['PENDING', 'IN_PROGRESS'] } }, data: { status } })).count > 0;
  }

  async deleteTask(tenantId: string, id: string, rowVersion: number) {
    return (await this.prisma.db().tasks.deleteMany({ where: { tenantId, id, rowVersion, status: 'PENDING' } })).count > 0;
  }

  async todayKpis(): Promise<TodayKpis> {
    const r = (await this.raw<Record<string, unknown>>('select * from "Company"."getTodayKpis"'))[0] ?? {};
    return {
      tasksDueToday: n(r.tasksDueToday), tasksDoneToday: n(r.tasksDoneToday), dailyProgressPct: n(r.dailyProgressPct), overdueTasks: n(r.overdueTasks),
      oldestOverdueDate: r.oldestOverdueDate ? day(r.oldestOverdueDate as Date) : null, awaitingApprovalCount: n(r.awaitingApprovalCount),
      awaitingApprovalValue: n(r.awaitingApprovalValue), dueTodayAmount: n(r.dueTodayAmount),
      invoicesDueToday: { count: n(r.invoicesDueTodayCount), amount: n(r.invoicesDueTodayAmount) },
      billsDueToday: { count: n(r.billsDueTodayCount), amount: n(r.billsDueTodayAmount) },
      chequesDueToday: { count: n(r.chequesMaturingTodayCount), amount: n(r.chequesMaturingTodayAmount) },
    };
  }

  async dueItems(): Promise<DueItem[]> {
    const rows = await this.raw<Record<string, unknown>>(
      `select kind, "docNo", title, "partyName", "dueOn", "isOverdue", "daysOverdue", direction, amount, "linkRoute", "sourceDocId"
         from "Company"."getTodayDueItems" where kind <> 'TASK_DUE' order by "isOverdue" asc, "dueOn" desc, amount desc limit 60`);
    return rows.map((r) => ({
      kind: String(r.kind), docNo: (r.docNo as string) ?? null, title: String(r.title ?? ''), party: (r.partyName as string) ?? null, dueOn: day(r.dueOn as Date)!,
      isOverdue: !!r.isOverdue, daysOverdue: n(r.daysOverdue), direction: (r.direction as string) ?? null, amount: n(r.amount),
      href: route((r.linkRoute as string) ?? null, (r.sourceDocId as string) ?? null),
    }));
  }

  async weekCounts(tenantId: string, userId: string, from: string, to: string) {
    const rows = await this.raw<{ d: string; tasks: bigint; overdue: bigint; due: bigint }>(
      `with days as (select generate_series($3::date, $4::date, interval '1 day')::date as d)
       select days.d::text as d,
              (select count(*) from "Company"."Tasks" t where t."tenantId" = $1::uuid and t."assigneeUserId" = $2::uuid and t."dueDate" = days.d and t.status in ('PENDING','IN_PROGRESS')) as tasks,
              (select count(*) from "Company"."Tasks" t where t."tenantId" = $1::uuid and t."assigneeUserId" = $2::uuid and t."dueDate" = days.d and t.status in ('PENDING','IN_PROGRESS') and days.d < current_date) as overdue,
              ((select count(*) from "Sales"."SalesInvoices" i where i."tenantId" = $1::uuid and i.status in ('POSTED','PARTIALLY_PAID') and i."balanceAmount" > 0 and i."dueDate" = days.d)
             + (select count(*) from "Purchases"."VendorBills" b where b."tenantId" = $1::uuid and b.status in ('POSTED','PARTIALLY_PAID') and b."balanceAmount" > 0 and b."dueDate" = days.d)
             + (select count(*) from "BankCash"."Cheques" q where q."tenantId" = $1::uuid and q.status in ('IN_HAND','ISSUED') and coalesce(q."dueDate", q."chequeDate") = days.d)) as due
         from days order by days.d`, tenantId, userId, from, to);
    return rows.map((r) => ({ date: r.d, tasks: Number(r.tasks), overdue: Number(r.overdue), due: Number(r.due) }));
  }

  async isActiveUser(tenantId: string, userId: string) {
    return (await this.prisma.db().users.count({ where: { tenantId, id: userId, status: 'ACTIVE', deletedAt: null } })) > 0;
  }

  // ---------------------------------------------------------------- notifications
  private async mapNotifications(tenantId: string, rows: Prisma.NotificationsGetPayload<object>[]): Promise<NotificationItem[]> {
    const who = await names(this.prisma.db(), tenantId, rows.map((r) => r.actorUserId));
    return rows.map((r) => ({
      id: r.id, category: r.category, eventCode: r.eventCode, title: r.title, body: r.body, href: r.linkRoute ? route(r.linkRoute, r.entityId) : null,
      amount: r.amount === null ? null : Number(r.amount), severity: r.severity, needsAction: r.needsAction, isMention: r.isMention,
      actor: r.actorUserId ? who.get(r.actorUserId) ?? null : null, readAt: r.readAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
    }));
  }

  async listNotifications(tenantId: string, userId: string, q: NotificationQuery) {
    const db = this.prisma.db();
    const where: Prisma.NotificationsWhereInput = { tenantId, userId, archivedAt: null, ...(q.category && { category: q.category }), ...(q.unread && { readAt: null }) };
    const [rows, total] = await Promise.all([
      db.notifications.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.notifications.count({ where }),
    ]);
    return { items: await this.mapNotifications(tenantId, rows), total };
  }

  async notificationSummary(): Promise<NotificationSummary> {
    const r = (await this.raw<Record<string, unknown>>('select * from "Company"."getNotificationSummary"'))[0] ?? {};
    return {
      unread: n(r.unread), needsAction: n(r.needsAction), mentions: n(r.mentions), total7d: n(r.total7d), total: n(r.total),
      byCategory: {
        APPROVALS: { count: n(r.countApprovals), unread: n(r.unreadApprovals) },
        FINANCE: { count: n(r.countFinance), unread: n(r.unreadFinance) },
        HR: { count: n(r.countHr), unread: n(r.unreadHr) },
        SYSTEM: { count: n(r.countSystem), unread: n(r.unreadSystem) },
      },
    };
  }

  async latestUnread(tenantId: string, userId: string, limit: number) {
    const rows = await this.prisma.db().notifications.findMany({ where: { tenantId, userId, archivedAt: null, readAt: null }, orderBy: { createdAt: 'desc' }, take: limit });
    return this.mapNotifications(tenantId, rows);
  }

  async markRead(tenantId: string, userId: string, ids: string[] | null, category: string | null) {
    return (await this.prisma.db().notifications.updateMany({
      where: { tenantId, userId, readAt: null, archivedAt: null, ...(ids && { id: { in: ids } }), ...(category && { category }) },
      data: { readAt: new Date() },
    })).count;
  }

  async archive(tenantId: string, userId: string, id: string) {
    return (await this.prisma.db().notifications.updateMany({ where: { tenantId, userId, id, archivedAt: null }, data: { archivedAt: new Date(), readAt: new Date() } })).count > 0;
  }

  async preferences(tenantId: string, userId: string): Promise<NotificationPreferences> {
    const rows = await this.prisma.db().notificationPreferences.findMany({ where: { tenantId, userId } });
    const find = (code: string, channel: string) => rows.find((r) => r.eventCode === code && r.channel === channel);
    const email = find(ALL, 'EMAIL');
    const sms = find('APPROVAL_PENDING', 'SMS');
    return {
      inApp: find(ALL, 'IN_APP')?.isEnabled ?? true,
      emailDigest: { on: email?.isEnabled ?? false, time: hhmm(email?.digestTime) ?? '08:00' },
      smsApprovalsAbove: { on: sms?.isEnabled ?? false, amount: sms?.minAmount ? Number(sms.minAmount) : 1_000_000 },
      whatsappCheques: find('CHEQUE_MATURING', 'WHATSAPP')?.isEnabled ?? false,
      mutedEvents: rows.filter((r) => r.channel === 'IN_APP' && r.eventCode !== ALL && !r.isEnabled).map((r) => r.eventCode),
    };
  }

  async savePreferences(tenantId: string, userId: string, p: NotificationPreferences) {
    const db = this.prisma.db();
    const rows = await db.notificationPreferences.findMany({ where: { tenantId, userId } });
    const put = async (eventCode: string, channel: string, data: { isEnabled: boolean; minAmount?: number | null; delivery?: string; digestTime?: string | null }) => {
      const cur = rows.find((r) => r.eventCode === eventCode && r.channel === channel);
      await addUpdate(this.prisma, 'notificationPreferenceAddUpdate', {
        ...(cur ? { id: cur.id } : { userId, eventCode, channel }),
        isEnabled: data.isEnabled, ...(data.minAmount !== undefined && { minAmount: data.minAmount }),
        ...(data.delivery && { delivery: data.delivery }), ...(data.digestTime !== undefined && { digestTime: data.digestTime }),
      });
    };
    await put(ALL, 'IN_APP', { isEnabled: p.inApp });
    await put(ALL, 'EMAIL', { isEnabled: p.emailDigest.on, delivery: 'DAILY_DIGEST', digestTime: `${p.emailDigest.time}:00` });
    await put('APPROVAL_PENDING', 'SMS', { isEnabled: p.smsApprovalsAbove.on, minAmount: p.smsApprovalsAbove.amount });
    await put('CHEQUE_MATURING', 'WHATSAPP', { isEnabled: p.whatsappCheques });
    const muted = new Set(p.mutedEvents);
    for (const r of rows.filter((x) => x.channel === 'IN_APP' && x.eventCode !== ALL)) {
      if (!muted.has(r.eventCode) && !r.isEnabled) await put(r.eventCode, 'IN_APP', { isEnabled: true });
    }
    for (const code of muted) {
      const cur = rows.find((r) => r.eventCode === code && r.channel === 'IN_APP');
      if (!cur || cur.isEnabled) await put(code, 'IN_APP', { isEnabled: false });
    }
  }

  // ---------------------------------------------------------------- jobs
  async activeTenants() {
    const rows = await this.raw<{ id: string; tz: string }>(
      `select t.id::text as id, coalesce(nullif(cs.timezone, ''), nullif(t.timezone, ''), 'Asia/Karachi') as tz
         from "Platform"."Tenants" t left join "Company"."CompanySettings" cs on cs."tenantId" = t.id
        where t.status in ('ACTIVE', 'TRIAL')`);
    return rows.map((r) => ({ id: r.id, timeZone: r.tz }));
  }

  async runTaskReminders(tenantId: string) {
    return Number((await this.raw<{ n: number }>('select "Company"."notifyTaskReminders"($1::uuid) as n', tenantId))[0]?.n ?? 0);
  }

  async runDueItems(tenantId: string, date: string) {
    return Number((await this.raw<{ n: number }>('select "Company"."notifyDueItems"($1::uuid, $2::date) as n', tenantId, date))[0]?.n ?? 0);
  }

  // ---------------------------------------------------------------- dashboard (call inside the tenant's context: views use RLS)
  async dashboard(tenantId: string, today: string): Promise<Omit<WorkspaceDashboard, 'approvals'>> {
    const [y, m] = today.split('-').map(Number) as [number, number];
    const monthStart = `${today.slice(0, 7)}-01`;
    const prevStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    const flowStart = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);
    const T = tenantId;
    // posted GL movement per account class and month, last 12 months
    const flowRows = await this.raw<{ mo: string; cls: number; amt: Prisma.Decimal }>(
      `select to_char(date_trunc('month', v."docDate"), 'YYYY-MM') as mo, a."accountClass" as cls,
              sum(case when a."accountClass" = 4 then l.credit - l.debit else l.debit - l.credit end) as amt
         from "Accounting"."VoucherLines" l
         join "Accounting"."Vouchers" v on v."tenantId" = l."tenantId" and v.id = l."journalEntryId"
         join "Accounting"."ChartOfAccounts" a on a."tenantId" = l."tenantId" and a.id = l."accountId"
        where l."tenantId" = $1::uuid and v.status = 'POSTED' and v."docDate" >= $2::date and v."docDate" <= $3::date and a."accountClass" in (4, 5)
        group by 1, 2`, T, flowStart, today);
    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 12 + i, 1)).toISOString().slice(0, 7));
    const amt = (mo: string, cls: number) => n(flowRows.find((r) => r.mo === mo && Number(r.cls) === cls)?.amt);
    const thisMo = today.slice(0, 7);
    const prevMo = prevStart.slice(0, 7);

    const [cash, collections, heatRows, splitRows, budgetRows, txRows, payroll] = await Promise.all([
      this.raw<{ total: Prisma.Decimal | null; banks: bigint; books: bigint }>(
        `with accts as (select "accountId" as id from "BankCash"."BankAccounts" where "tenantId" = $1::uuid and status = 'ACTIVE' and "deletedAt" is null and "accountId" is not null
                        union select "accountId" from "BankCash"."CashAccounts" where "tenantId" = $1::uuid and "isActive" and "deletedAt" is null and "accountId" is not null)
         select (select sum(a."openingBalance") from "Accounting"."ChartOfAccounts" a where a."tenantId" = $1::uuid and a.id in (select id from accts))
              + coalesce((select sum(l.debit - l.credit) from "Accounting"."VoucherLines" l join "Accounting"."Vouchers" v on v."tenantId" = l."tenantId" and v.id = l."journalEntryId"
                           where l."tenantId" = $1::uuid and v.status = 'POSTED' and l."accountId" in (select id from accts)), 0) as total,
                (select count(*) from "BankCash"."BankAccounts" where "tenantId" = $1::uuid and status = 'ACTIVE' and "deletedAt" is null) as banks,
                (select count(*) from "BankCash"."CashAccounts" where "tenantId" = $1::uuid and "isActive" and "deletedAt" is null) as books`, T),
      this.raw<{ s: Prisma.Decimal | null }>(
        `select sum("amountReceived" * coalesce(nullif("fxRate", 0), 1)) as s from "Sales"."CustomerReceipts"
          where "tenantId" = $1::uuid and status not in ('VOID', 'BOUNCED') and "docDate" between $2::date and $3::date`, T, monthStart, today),
      this.raw<{ d: string; amt: Prisma.Decimal }>(
        `select v."docDate"::text as d, sum(l.credit - l.debit) as amt
           from "Accounting"."VoucherLines" l join "Accounting"."Vouchers" v on v."tenantId" = l."tenantId" and v.id = l."journalEntryId"
           join "Accounting"."ChartOfAccounts" a on a."tenantId" = l."tenantId" and a.id = l."accountId"
          where l."tenantId" = $1::uuid and v.status = 'POSTED' and a."accountClass" = 4 and v."docDate" > $2::date - 12 and v."docDate" <= $2::date
          group by 1`, T, today),
      this.raw<{ name: string; amt: Prisma.Decimal }>(
        `select coalesce(g.name, a.name) as name, sum(l.credit - l.debit) as amt
           from "Accounting"."VoucherLines" l join "Accounting"."Vouchers" v on v."tenantId" = l."tenantId" and v.id = l."journalEntryId"
           join "Accounting"."ChartOfAccounts" a on a."tenantId" = l."tenantId" and a.id = l."accountId"
           left join "Accounting"."ChartOfAccounts" g on g."tenantId" = a."tenantId" and g.id = a."parentAccountId"
          where l."tenantId" = $1::uuid and v.status = 'POSTED' and a."accountClass" = 4 and v."docDate" between $2::date and $3::date
          group by 1 order by 2 desc`, T, monthStart, today),
      this.raw<{ budgetName: string; groupName: string | null; accountClass: number; monthStart: Date; budgetAmount: Prisma.Decimal; actualAmount: Prisma.Decimal }>(
        `select b."budgetName", b."groupName", b."accountClass", b."monthStart", b."budgetAmount", b."actualAmount"
           from "Accounting"."getBudgetVsActual" b
          where b."tenantId" = $1::uuid and b."isCurrentVersion" and b."budgetStatus" in ('APPROVED', 'ACTIVE', 'LOCKED')
            and $2::date between (select fy."startDate" from "Accounting"."FiscalYears" fy where fy.id = b."fiscalYearId") and (select fy."endDate" from "Accounting"."FiscalYears" fy where fy.id = b."fiscalYearId")`, T, today),
      this.raw<{ id: string; party: string; ref: string; d: Date; at: Date; method: string; amount: Prisma.Decimal; dir: 'IN' | 'OUT'; status: string; kind: string }>(
        `(select r.id::text, coalesce(c."displayName", c.name) as party, r."docNo" as ref, r."docDate" as d, r."createdAt" as at, r.method, r."amountReceived" as amount,
                 'IN' as dir, r.status, 'RCPT' as kind
            from "Sales"."CustomerReceipts" r join "Sales"."Customers" c on c."tenantId" = r."tenantId" and c.id = r."customerId" where r."tenantId" = $1::uuid)
         union all
         (select p.id::text, vd.name, p."docNo", p."docDate", p."createdAt", p.method, p.amount, 'OUT', p.status, 'PAY'
            from "Purchases"."VendorPayments" p join "Purchases"."Vendors" vd on vd."tenantId" = p."tenantId" and vd.id = p."vendorId" where p."tenantId" = $1::uuid and p.status <> 'DRAFT')
         order by d desc, at desc limit 8`, T),
      this.raw<{ id: string; docNo: string; payrollMonth: Date; netAmount: Prisma.Decimal; employeeCount: number; status: string; payDate: Date | null; done: bigint; total: bigint }>(
        `select r.id::text, r."docNo", r."payrollMonth", r."netAmount", r."employeeCount", r.status, r."payDate",
                (select count(*) from "Payroll"."PayrollRunChecklistItems" c where c."tenantId" = r."tenantId" and c."payrollRunId" = r.id and c."isDone") as done,
                (select count(*) from "Payroll"."PayrollRunChecklistItems" c where c."tenantId" = r."tenantId" and c."payrollRunId" = r.id) as total
           from "Payroll"."PayrollRuns" r where r."tenantId" = $1::uuid and r.status <> 'CANCELLED' order by r."payrollMonth" desc, r."createdAt" desc limit 1`, T),
    ]);

    const revenue = amt(thisMo, 4);
    const prevRevenue = amt(prevMo, 4);
    const expense = amt(thisMo, 5);
    const heat = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1, Number(today.slice(8, 10)) - 11 + i)).toISOString().slice(0, 10);
      return Math.max(0, n(heatRows.find((r) => r.d === d)?.amt));
    });
    const maxHeat = Math.max(...heat, 0);
    const split = splitRows.slice(0, 2).map((r) => ({ label: r.name, amount: n(r.amt) }));
    const other = splitRows.slice(2).reduce((s, r) => s + n(r.amt), 0);
    if (other) split.push({ label: 'Other', amount: other });

    const monthBudget = budgetRows.filter((b) => Number(b.accountClass) === 5 && day(b.monthStart) === monthStart).reduce((s, b) => s + n(b.budgetAmount), 0);
    const fyBudget = budgetRows.reduce((s, b) => s + n(b.budgetAmount), 0);
    const fyActual = budgetRows.filter((b) => day(b.monthStart)! <= today).reduce((s, b) => s + n(b.actualAmount), 0);
    const groups = new Map<string, { budget: number; used: number }>();
    for (const b of budgetRows) {
      const k = b.groupName ?? 'Other';
      const g = groups.get(k) ?? { budget: 0, used: 0 };
      g.budget += n(b.budgetAmount);
      if (day(b.monthStart)! <= today) g.used += n(b.actualAmount);
      groups.set(k, g);
    }
    const lines = [...groups].map(([label, g]) => ({ label, budget: g.budget, used: g.used, usedPct: g.budget > 0 ? Math.round((g.used / g.budget) * 100) : 0 }))
      .sort((a, b) => b.budget - a.budget).slice(0, 3);
    const pr = payroll[0];
    const fy = await this.raw<{ code: string }>(`select code from "Accounting"."FiscalYears" where "tenantId" = $1::uuid and $2::date between "startDate" and "endDate" limit 1`, T, today);

    return {
      asOf: today,
      fiscalLabel: fy[0]?.code ?? null,
      cash: {
        total: n(cash[0]?.total), banks: Number(cash[0]?.banks ?? 0), cashBooks: Number(cash[0]?.books ?? 0),
        earnedLastMonth: amt(prevMo, 4) - amt(prevMo, 5), collectionsMtd: n(collections[0]?.s),
      },
      revenue: {
        month: `${LONG[m - 1]} ${y}`, total: revenue, prevTotal: prevRevenue, heat: heat.map((v) => (maxHeat > 0 ? Math.max(1, Math.round((v / maxHeat) * 6)) : 1)),
        split, earnedVsPrev: revenue - prevRevenue,
      },
      expenses: {
        month: `${LONG[m - 1]} ${y}`, total: expense, budget: monthBudget || null,
        gaugePct: Math.min(100, Math.round(monthBudget ? (expense / monthBudget) * 100 : revenue ? (expense / revenue) * 100 : 0)),
        vsPlanPct: monthBudget ? Math.round(((monthBudget - expense) / monthBudget) * 1000) / 10 : null,
      },
      flow: months.map((mo) => ({ label: MONTHS[Number(mo.slice(5, 7)) - 1]!, income: amt(mo, 4), expense: amt(mo, 5) })),
      budget: {
        name: budgetRows[0]?.budgetName ?? null,
        remainingPct: fyBudget > 0 ? Math.max(0, Math.round(((fyBudget - fyActual) / fyBudget) * 100)) : null,
        lines,
      },
      transactions: txRows.map((t) => ({
        id: t.id, party: t.party, ref: t.ref, date: day(t.d)!, method: t.method, amount: n(t.amount), direction: t.dir, status: t.status,
        href: t.kind === 'RCPT' ? '/receivables/receipts' : '/payables/payments',
      })),
      payroll: pr ? {
        runNo: pr.docNo, period: `${LONG[pr.payrollMonth.getUTCMonth()]} ${pr.payrollMonth.getUTCFullYear()}`, netPay: n(pr.netAmount), employees: Number(pr.employeeCount ?? 0),
        stepsDone: Number(pr.done), stepsTotal: Number(pr.total), status: pr.status, dueDate: day(pr.payDate), href: '/hr/payroll',
      } : null,
    };
  }
}
