import { Injectable } from '@nestjs/common';
import type { FinancialStatement, ReminderDue, ReminderLog, ReopenRequest, StatementRow, YearEnd, YearEndCheck } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { PeriodCloseStore, type PeriodCloseLifecycle, type PeriodCloseSave, type PeriodFacts, type YearFacts } from '../application/period-close-store.js';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const N = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const TEXT_ARG: PeriodCloseLifecycle[] = ['periodReopenRequestApprove', 'periodReopenRequestReject', 'periodReopenRequestCancel', 'yearEndCloseCancel'];

@Injectable()
export class PrismaPeriodCloseStore extends PeriodCloseStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async tenants() {
    return (await this.prisma.db().tenants.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })).map((t) => t.id);
  }

  // ---------------------------------------------------------------- reopen requests
  private async reopenRows(tenantId: string, rows: Awaited<ReturnType<ReturnType<PrismaService['db']>['periodReopenRequests']['findMany']>>): Promise<ReopenRequest[]> {
    const db = this.prisma.db();
    const periods = await db.fiscalPeriods.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.fiscalPeriodId)) } }, select: { id: true, code: true, startDate: true, endDate: true, fiscalYearId: true } });
    const years = await db.fiscalYears.findMany({ where: { tenantId, id: { in: ids(periods.map((p) => p.fiscalYearId)) } }, select: { id: true, code: true } });
    const users = await userRefs(db, tenantId, rows.flatMap((r) => [r.requestedByUserId, r.approverUserId]));
    return rows.map((r) => {
      const p = periods.find((x) => x.id === r.fiscalPeriodId);
      return {
        id: r.id, period: { id: r.fiscalPeriodId, code: p?.code ?? '?', startDate: day(p?.startDate) ?? '', endDate: day(p?.endDate) ?? '', fiscalYear: years.find((y) => y.id === p?.fiscalYearId)?.code ?? '?' },
        moduleCode: r.moduleCode, previousStatus: r.previousStatus, reopenUntil: iso(r.reopenUntil)!, reason: r.reason, autoReclose: r.autoReclose, status: r.status,
        requestedBy: users.get(r.requestedByUserId) ?? null, requestedAt: iso(r.createdAt)!, approver: users.get(r.approverUserId) ?? null,
        decidedAt: iso(r.decidedAt), reclosedAt: iso(r.reclosedAt), rowVersion: r.rowVersion,
      };
    });
  }

  async listReopen(tenantId: string) {
    const rows = await this.prisma.db().periodReopenRequests.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 200 });
    return this.reopenRows(tenantId, rows);
  }

  async getReopen(tenantId: string, id: string) {
    const rows = await this.prisma.db().periodReopenRequests.findMany({ where: { tenantId, id } });
    return rows.length ? (await this.reopenRows(tenantId, rows))[0]! : null;
  }

  async period(tenantId: string, id: string): Promise<PeriodFacts | null> {
    const db = this.prisma.db();
    const p = await db.fiscalPeriods.findFirst({ where: { tenantId, id }, select: { id: true, code: true, status: true, fiscalYearId: true } });
    if (!p) return null;
    const locks = await db.periodModuleLocks.findMany({ where: { tenantId, fiscalPeriodId: id }, select: { moduleCode: true, status: true } });
    return { ...p, modules: Object.fromEntries(locks.map((l) => [l.moduleCode, l.status])) };
  }

  async dueReclose(tenantId: string) {
    const rows = await this.prisma.db().periodReopenRequests.findMany({ where: { tenantId, status: 'APPROVED', autoReclose: true, reopenUntil: { lt: new Date() } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  // ---------------------------------------------------------------- year-end
  async year(tenantId: string, fiscalYearId: string): Promise<YearFacts | null> {
    const y = await this.prisma.db().fiscalYears.findFirst({ where: { tenantId, id: fiscalYearId } });
    return y ? { id: y.id, code: y.code, startDate: day(y.startDate)!, endDate: day(y.endDate)!, status: y.status } : null;
  }

  async checklist(tenantId: string, fiscalYearId: string): Promise<YearEndCheck[]> {
    const y = (await this.year(tenantId, fiscalYearId))!;
    const rows = await this.prisma.db().$queryRaw<{ k: string; n: number }[]>`
      select 'periods' as k, count(*)::int as n from "Accounting"."FiscalPeriods" where "tenantId" = ${tenantId}::uuid and "fiscalYearId" = ${fiscalYearId}::uuid and status = 'OPEN'
      union all select 'vouchers', count(*)::int from "Accounting"."Vouchers" where "tenantId" = ${tenantId}::uuid and status in ('DRAFT', 'PENDING_APPROVAL') and "postingDate" between ${y.startDate}::date and ${y.endDate}::date
      union all select 'invoices', count(*)::int from "Sales"."SalesInvoices" where "tenantId" = ${tenantId}::uuid and status = 'DRAFT' and "docDate" between ${y.startDate}::date and ${y.endDate}::date
      union all select 'bills', count(*)::int from "Purchases"."VendorBills" where "tenantId" = ${tenantId}::uuid and status = 'DRAFT' and "docDate" between ${y.startDate}::date and ${y.endDate}::date
      union all select 'pos', count(*)::int from "Sales"."PosShifts" where "tenantId" = ${tenantId}::uuid and status = 'OPEN'
      union all select 'settlements', count(*)::int from "Distribution"."RouteSettlements" where "tenantId" = ${tenantId}::uuid and status = 'OPEN'
      union all select 'commissions', count(*)::int from "Distribution"."SalesmanCommissions" where "tenantId" = ${tenantId}::uuid and status in ('DRAFT', 'APPROVED') and "periodEnd" <= ${y.endDate}::date
      union all select 'adjustments', count(*)::int from "Accounting"."YearEndAdjustments" a join "Accounting"."YearEndCloses" c on c."tenantId" = a."tenantId" and c.id = a."yearEndCloseId"
                 where a."tenantId" = ${tenantId}::uuid and c."fiscalYearId" = ${fiscalYearId}::uuid and c.status = 'DRAFT' and a.status in ('PROPOSED', 'AWAITING_INPUT') and a."isIncluded"`;
    const n = (k: string) => rows.find((r) => r.k === k)?.n ?? 0;
    const item = (key: string, label: string, count: number, blocking: boolean, ok: string, bad: string, link: string | null): YearEndCheck =>
      ({ key, label, count, state: count === 0 ? 'ok' : blocking ? 'block' : 'warn', detail: count === 0 ? ok : bad.replace('{n}', String(count)), link });
    return [
      item('periods', 'All periods closed', n('periods'), true, 'Every period of the year is closed or locked', '{n} period(s) still open', '/periods'),
      item('vouchers', 'No draft or pending vouchers', n('vouchers'), true, 'All vouchers dated in the year are posted', '{n} draft / pending voucher(s) in the year', '/accounting/vouchers?status=DRAFT'),
      item('adjustments', 'Year-end adjustments posted', n('adjustments'), true, 'No proposed adjustment left', '{n} proposed adjustment(s) not posted', null),
      item('invoices', 'Sales invoices posted', n('invoices'), false, 'No draft sales invoice in the year', '{n} draft sales invoice(s)', '/sales/invoices?status=DRAFT'),
      item('bills', 'Vendor bills posted', n('bills'), false, 'No draft vendor bill in the year', '{n} draft vendor bill(s)', '/purchases/bills?status=DRAFT'),
      item('pos', 'POS shifts closed', n('pos'), false, 'No POS shift open', '{n} POS shift(s) open', '/sales/pos'),
      item('settlements', 'Route settlements posted', n('settlements'), false, 'No open route settlement', '{n} route settlement(s) open', '/wholesale/settlement'),
      item('commissions', 'Commissions accrued', n('commissions'), false, 'All commissions of the year are posted', '{n} commission(s) not posted', '/wholesale/routes'),
    ];
  }

  async yearEnd(tenantId: string, fiscalYearId: string, checklist: YearEndCheck[]): Promise<YearEnd> {
    const db = this.prisma.db();
    const y = await db.fiscalYears.findFirst({ where: { tenantId, id: fiscalYearId } });
    const [periods, runs, closing] = await Promise.all([
      db.fiscalPeriods.findMany({ where: { tenantId, fiscalYearId }, orderBy: { periodNo: 'asc' }, select: { id: true, code: true, status: true } }),
      db.yearEndCloses.findMany({ where: { tenantId, fiscalYearId }, orderBy: { createdAt: 'desc' } }),
      voucherRefs(db, tenantId, [y!.closingJournalEntryId]),
    ]);
    const draft = runs.find((r) => r.runMode === 'FINAL' && r.status === 'DRAFT');
    const adj = draft ? await db.yearEndAdjustments.findMany({ where: { tenantId, yearEndCloseId: draft.id }, orderBy: { createdAt: 'asc' } }) : [];
    const lines = await db.$queryRaw<{ accountId: string; code: string; name: string; cls: number; net: string }[]>`
      select ll."accountId"::text as "accountId", ll."accountCode" as code, ll."accountName" as name, ll."accountClass"::int as cls, round(sum(ll.credit - ll.debit), 2)::text as net
        from "Accounting"."getLedgerLines" ll
       where ll."tenantId" = ${tenantId}::uuid and ll."accountClass" in (4, 5) and not ll."isClosingEntry" and ll."postingDate" between ${y!.startDate}::date and ${y!.endDate}::date
       group by 1, 2, 3, 4 having round(sum(ll.credit - ll.debit), 2) <> 0 order by 2`;
    const reRole = await db.$queryRaw<{ id: string | null }[]>`select m."accountId"::text as id from "Company"."DefaultAccountMappings" m where m."tenantId" = ${tenantId}::uuid and m.role = 'RETAINED_EARNINGS'`;
    const reId = reRole[0]?.id ?? null;
    const re = reId ? await db.chartOfAccounts.findFirst({ where: { tenantId, id: reId }, select: { id: true, code: true, name: true } }) : null;
    const opening = reId ? await db.$queryRaw<{ v: string | null }[]>`select round(sum(credit - debit), 2)::text as v from "Accounting"."getLedgerLines" where "tenantId" = ${tenantId}::uuid and "accountId" = ${reId}::uuid and "postingDate" < ${y!.startDate}::date` : [{ v: '0' }];
    const net = r2(lines.reduce((s, l) => s + Number(l.net), 0));
    const revenue = r2(lines.filter((l) => l.cls === 4).reduce((s, l) => s + Number(l.net), 0));
    const accts = await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids(adj.flatMap((a) => [a.debitAccountId, a.creditAccountId])) } }, select: { id: true, code: true, name: true } });
    const adjV = await voucherRefs(db, tenantId, adj.map((a) => a.journalEntryId));
    const runV = await voucherRefs(db, tenantId, runs.map((r) => r.closingJournalEntryId));
    const users = await userRefs(db, tenantId, runs.map((r) => r.runByUserId));
    const acc = (id: string) => accts.find((a) => a.id === id) ?? { id, code: '?', name: '?' };
    const ro = Number(opening[0]?.v ?? 0);
    return {
      fiscalYear: { id: y!.id, code: y!.code, startDate: day(y!.startDate)!, endDate: day(y!.endDate)!, status: y!.status, isLocked: y!.isLocked, closing: y!.closingJournalEntryId ? closing.get(y!.closingJournalEntryId) ?? null : null },
      periods, checklist,
      figures: { revenue, expenses: r2(revenue - net), netProfit: net, retainedOpening: ro, retainedClosing: r2(ro + net), retainedEarningsAccount: re },
      closingLines: lines.map((l) => ({ account: { id: l.accountId, code: l.code, name: l.name }, debit: Math.max(Number(l.net), 0), credit: Math.max(-Number(l.net), 0) })),
      adjustments: adj.map((a) => ({
        id: a.id, description: a.description, debitAccount: acc(a.debitAccountId), creditAccount: acc(a.creditAccountId), amount: num(a.amount), status: a.status,
        journal: a.journalEntryId ? adjV.get(a.journalEntryId) ?? null : null, rowVersion: a.rowVersion,
      })),
      runs: runs.filter((r) => !(r.runMode === 'FINAL' && r.status === 'DRAFT')).map((r) => ({
        id: r.id, runMode: r.runMode, status: r.status, asAtDate: day(r.asAtDate)!, checksTotal: r.checksTotal, checksPassed: r.checksPassed, checksWarning: r.checksWarning,
        netProfit: r.netProfit === null ? null : num(r.netProfit), retainedOpening: r.retainedOpening === null ? null : num(r.retainedOpening),
        retainedClosing: r.retainedClosing === null ? null : num(r.retainedClosing), journal: r.closingJournalEntryId ? runV.get(r.closingJournalEntryId) ?? null : null,
        runBy: r.runByUserId ? users.get(r.runByUserId) ?? null : null, runAt: iso(r.runAt), rowVersion: r.rowVersion,
      })),
    };
  }

  async draftFinal(tenantId: string, fiscalYearId: string) {
    return this.prisma.db().yearEndCloses.findFirst({ where: { tenantId, fiscalYearId, runMode: 'FINAL', status: 'DRAFT' }, select: { id: true, rowVersion: true } });
  }

  async accountsExist(tenantId: string, accountIds: string[]) {
    const n = await this.prisma.db().chartOfAccounts.count({ where: { tenantId, id: { in: accountIds }, kind: 'POSTABLE', deletedAt: null } });
    return n === new Set(accountIds).size;
  }

  async adjustment(tenantId: string, id: string) {
    const a = await this.prisma.db().yearEndAdjustments.findFirst({ where: { tenantId, id } });
    return a ? { id: a.id, yearEndCloseId: a.yearEndCloseId, description: a.description, debitAccountId: a.debitAccountId, creditAccountId: a.creditAccountId, amount: num(a.amount), status: a.status, rowVersion: a.rowVersion } : null;
  }

  async addAdjustment(tenantId: string, yearEndCloseId: string, row: { description: string; debitAccountId: string; creditAccountId: string; amount: number }) {
    await this.prisma.db().yearEndAdjustments.create({ data: { tenantId, yearEndCloseId, ...row, status: 'PROPOSED', isIncluded: true } });
  }

  async setAdjustment(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().yearEndAdjustments.updateMany({ where: { tenantId, id }, data });
  }

  async deleteAdjustment(tenantId: string, id: string) {
    const r = await this.prisma.db().yearEndAdjustments.deleteMany({ where: { tenantId, id, status: { not: 'POSTED' } } });
    return r.count > 0;
  }

  async journal(header: Record<string, unknown>, lines: Record<string, unknown>[]) {
    const r = await this.prisma.db().$queryRawUnsafe<{ id: string }[]>(`select "Accounting"."journalCreate"($1::jsonb, $2::jsonb)::text as id`, JSON.stringify(header), JSON.stringify(lines));
    return r[0]!.id;
  }

  async runOf(tenantId: string, id: string) {
    return this.prisma.db().yearEndCloses.findFirst({ where: { tenantId, id }, select: { id: true, fiscalYearId: true, runMode: true, status: true, rowVersion: true } });
  }

  // ---------------------------------------------------------------- reminder runs
  async reminderQueue(tenantId: string, customerId: string | null): Promise<ReminderDue[]> {
    const rows = await this.prisma.db().$queryRaw<Record<string, unknown>[]>`
      select q.* from "Sales"."getPaymentReminderQueue" q where q."tenantId" = ${tenantId}::uuid and (${customerId}::uuid is null or q."customerId" = ${customerId}::uuid)
       order by q."daysOverdue" desc nulls last, q."docNo" limit 500`;
    return rows.map((q) => ({
      invoice: { id: String(q.invoiceId), docNo: String(q.docNo), dueDate: (q.dueDate as Date).toISOString().slice(0, 10) },
      customer: { id: String(q.customerId), code: String(q.customerCode ?? ''), name: String(q.customerName ?? '') },
      balance: N(q.balanceAmount), daysOverdue: N(q.daysOverdue), rule: q.reminderRuleId ? { id: String(q.reminderRuleId), name: String(q.ruleName ?? '') } : null,
      dunningLevel: (q.dunningLevel as string | null) ?? null,
      channels: [q.sendWhatsapp ? 'WHATSAPP' : null, q.sendSms ? 'SMS' : null, q.sendEmail ? 'EMAIL' : null].filter((x): x is string => !!x),
      recipientMobile: (q.contactMobile as string | null) ?? null, recipientEmail: (q.contactEmail as string | null) ?? null, isDueNow: !!q.isDueNow,
      lastReminderAt: q.lastReminderAt ? (q.lastReminderAt as Date).toISOString() : null, lastReminderStatus: (q.lastReminderStatus as string | null) ?? null,
    }));
  }

  async reminderWork(tenantId: string, customerId: string | null, invoiceIds: string[] | null) {
    const rows = await this.prisma.db().$queryRaw<Record<string, unknown>[]>`
      select q."invoiceId"::text as "invoiceId", q."docNo", q."dueDate", q."customerId"::text as "customerId", q."customerName", q."contactMobile", q."contactEmail",
             q."balanceAmount", q."daysOverdue", q."reminderRuleId"::text as "reminderRuleId", q."templateId"::text as "templateId", q."sendWhatsapp", q."sendSms", q."sendEmail",
             t."bodyEn", t."emailSubject"
        from "Sales"."getPaymentReminderQueue" q
        left join "Sales"."PaymentReminderTemplates" t on t."tenantId" = q."tenantId" and t.id = q."templateId"
       where q."tenantId" = ${tenantId}::uuid and (${customerId}::uuid is null or q."customerId" = ${customerId}::uuid)
         and (${customerId}::uuid is not null or q."isDueNow")`;
    return rows.filter((q) => !invoiceIds || invoiceIds.includes(String(q.invoiceId))).map((q) => ({
      invoiceId: String(q.invoiceId), docNo: String(q.docNo), dueDate: (q.dueDate as Date).toISOString().slice(0, 10), customerId: String(q.customerId), customerName: String(q.customerName ?? ''),
      mobile: (q.contactMobile as string | null) ?? null, email: (q.contactEmail as string | null) ?? null, balance: N(q.balanceAmount), daysOverdue: N(q.daysOverdue),
      ruleId: (q.reminderRuleId as string | null) ?? null, templateId: (q.templateId as string | null) ?? null,
      channels: [q.sendWhatsapp ? 'WHATSAPP' : null, q.sendSms ? 'SMS' : null, q.sendEmail ? 'EMAIL' : null].filter((x): x is string => !!x),
      bodyEn: (q.bodyEn as string | null) ?? null, emailSubject: (q.emailSubject as string | null) ?? null,
    }));
  }

  async reminderLog(tenantId: string, limit: number): Promise<ReminderLog[]> {
    const db = this.prisma.db();
    const rows = await db.paymentReminderLogs.findMany({ where: { tenantId }, orderBy: { sentAt: 'desc' }, take: limit });
    const [customers, invoices, rules, templates, users] = await Promise.all([
      db.customers.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.customerId)) } }, select: { id: true, name: true } }),
      db.salesInvoices.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.invoiceId)) } }, select: { id: true, docNo: true } }),
      db.paymentReminderRules.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.reminderRuleId)) } }, select: { id: true, name: true } }),
      db.paymentReminderTemplates.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.templateId)) } }, select: { id: true, name: true } }),
      userRefs(db, tenantId, rows.map((r) => r.sentByUserId)),
    ]);
    return rows.map((r) => ({
      id: r.id, sentAt: iso(r.sentAt)!, customer: customers.find((c) => c.id === r.customerId) ?? { id: r.customerId, name: '?' }, invoice: invoices.find((i) => i.id === r.invoiceId) ?? null,
      rule: rules.find((x) => x.id === r.reminderRuleId)?.name ?? null, template: templates.find((x) => x.id === r.templateId)?.name ?? null, channel: r.channel, recipient: r.recipient,
      triggerMode: r.triggerMode, amount: num(r.amount), daysOverdue: r.daysOverdue ?? 0, status: r.status, message: r.errorMessage, sentBy: r.sentByUserId ? users.get(r.sentByUserId) ?? null : null,
    }));
  }

  async reminderKpis(tenantId: string) {
    const db = this.prisma.db();
    const [o, due, q] = await Promise.all([
      db.$queryRaw<{ c: number; a: string | null }[]>`select count(distinct "customerId")::int as c, sum("balanceAmount")::text as a from "Sales"."SalesInvoices"
        where "tenantId" = ${tenantId}::uuid and status in ('POSTED', 'PARTIALLY_PAID') and "balanceAmount" > 0 and "dueDate" < current_date`,
      db.$queryRaw<{ c: number }[]>`select count(*)::int as c from "Sales"."getPaymentReminderQueue" where "tenantId" = ${tenantId}::uuid and "isDueNow"`,
      db.paymentReminderLogs.count({ where: { tenantId, sentAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } } }),
    ]);
    return { overdueCustomers: o[0]?.c ?? 0, overdueAmount: Number(o[0]?.a ?? 0), dueNow: due[0]?.c ?? 0, queuedToday: q };
  }

  async companyName(tenantId: string) {
    return (await this.prisma.db().tenants.findFirst({ where: { id: tenantId }, select: { displayName: true } }))?.displayName ?? '';
  }

  async addReminderLogs(tenantId: string, rows: Record<string, unknown>[]) {
    if (rows.length) await this.prisma.db().paymentReminderLogs.createMany({ data: rows.map((r) => ({ tenantId, ...(r as object) })) as never });
  }

  // ---------------------------------------------------------------- statements
  async pnl(tenantId: string, from: string, to: string, cmpFrom: string | null, cmpTo: string | null, branch: string | null): Promise<FinancialStatement> {
    const rows = await this.prisma.db().$queryRaw<Record<string, unknown>[]>`
      select * from "Accounting"."getProfitAndLossForPeriod"(${from}::date, ${to}::date, ${cmpFrom}::date, ${cmpTo}::date, ${branch}::uuid)
       where "tenantId" = ${tenantId}::uuid order by "sectionOrder", code`;
    const out: StatementRow[] = [];
    let net = 0;
    let netPy = 0;
    const sections = [...new Set(rows.map((r) => String(r.section)))];
    for (const s of sections) {
      const rs = rows.filter((r) => r.section === s && (N(r.amountCy) !== 0 || N(r.amountPy) !== 0));
      if (!rs.length) continue;
      out.push({ kind: 's', label: String(rs[0]!.sectionLabel) , amount: 0 });
      for (const r of rs) out.push({ kind: 'r', label: String(r.lineLabel ?? r.name), code: String(r.code), accountId: String(r.accountId), amount: N(r.amountCy), comparative: N(r.amountPy), change: N(r.variance), pct: r.pctOfRevenue === null ? null : N(r.pctOfRevenue) });
      const t = r2(rs.reduce((a, r) => a + N(r.amountCy), 0));
      const tp = r2(rs.reduce((a, r) => a + N(r.amountPy), 0));
      out.push({ kind: 't', label: `Total ${String(rs[0]!.sectionLabel).toLowerCase()}`, amount: t, comparative: tp, change: r2(t - tp) });
      net += rs.reduce((a, r) => a + N(r.profitEffectCy), 0);
      netPy += rs.reduce((a, r) => a + N(r.profitEffectPy), 0);
    }
    out.push({ kind: 'g', label: 'Net profit / (loss)', amount: r2(net), comparative: r2(netPy), change: r2(net - netPy) });
    return { kind: 'pnl', title: 'Profit & Loss', period: `${from} – ${to}`, comparativePeriod: cmpFrom && cmpTo ? `${cmpFrom} – ${cmpTo}` : 'Same period last year', rows: out, totals: { netProfit: r2(net), netProfitPy: r2(netPy) } };
  }

  async balanceSheet(tenantId: string, asAt: string, cmpAsAt: string | null, branch: string | null): Promise<FinancialStatement> {
    const rows = await this.prisma.db().$queryRaw<Record<string, unknown>[]>`
      select * from "Accounting"."getBalanceSheetAsAt"(${asAt}::date, ${cmpAsAt}::date, ${branch}::uuid) where "tenantId" = ${tenantId}::uuid order by side, "sectionOrder", "lineOrder", code`;
    const out: StatementRow[] = [];
    const totals: Record<string, number> = {};
    for (const side of ['ASSETS', 'EQUITY_AND_LIABILITIES']) {
      const sr = rows.filter((r) => r.side === side);
      out.push({ kind: 's', label: side === 'ASSETS' ? 'Assets' : 'Equity & liabilities', amount: 0 });
      for (const s of [...new Set(sr.map((r) => String(r.section)))]) {
        const rs = sr.filter((r) => r.section === s && (N(r.amountCy) !== 0 || N(r.amountPy) !== 0));
        if (!rs.length) continue;
        for (const r of rs) out.push({ kind: 'r', label: String(r.lineLabel ?? r.name), code: (r.code as string | null) ?? null, accountId: (r.accountId as string | null) ?? null, amount: N(r.amountCy), comparative: N(r.amountPy), change: N(r.change) });
        const t = r2(rs.reduce((a, r) => a + N(r.amountCy), 0));
        out.push({ kind: 't', label: `Total ${String(rs[0]!.sectionLabel).toLowerCase()}`, amount: t, comparative: r2(rs.reduce((a, r) => a + N(r.amountPy), 0)) });
      }
      const total = r2(sr.reduce((a, r) => a + N(r.amountCy), 0));
      totals[side === 'ASSETS' ? 'assets' : 'equityAndLiabilities'] = total;
      out.push({ kind: 'g', label: side === 'ASSETS' ? 'Total assets' : 'Total equity & liabilities', amount: total, comparative: r2(sr.reduce((a, r) => a + N(r.amountPy), 0)) });
    }
    const cmp = rows.find((r) => r.comparativeAsAt)?.comparativeAsAt as Date | undefined;
    return { kind: 'balance-sheet', title: 'Balance Sheet', period: `As at ${asAt}`, comparativePeriod: cmp ? `As at ${cmp.toISOString().slice(0, 10)}` : null, rows: out, totals, difference: r2((totals.assets ?? 0) - (totals.equityAndLiabilities ?? 0)) };
  }

  async cashFlow(tenantId: string, from: string, to: string, branch: string | null): Promise<FinancialStatement> {
    const rows = await this.prisma.db().$queryRaw<Record<string, unknown>[]>`
      select * from "Accounting"."getCashFlowForPeriod"(${from}::date, ${to}::date, ${branch}::uuid) where "tenantId" = ${tenantId}::uuid order by "activityOrder", "lineOrder"`;
    const out: StatementRow[] = [];
    const totals: Record<string, number> = {};
    for (const a of [...new Set(rows.map((r) => String(r.activity)))]) {
      const rs = rows.filter((r) => r.activity === a);
      out.push({ kind: 's', label: String(rs[0]!.activityLabel), amount: 0 });
      for (const r of rs) out.push({ kind: a === 'CASH' ? 'g' : 'r', label: String(r.lineLabel), amount: N(r.amount) });
      if (a !== 'CASH') {
        const sub = rs[0]!.subtotal === null ? r2(rs.reduce((x, r) => x + N(r.amount), 0)) : N(rs[0]!.subtotal);
        totals[a.toLowerCase()] = sub;
        out.push({ kind: 't', label: `Net cash from ${String(rs[0]!.activityLabel).toLowerCase()}`, amount: sub });
      } else {
        rs.forEach((r, i) => { totals[['netChange', 'opening', 'closing'][i] ?? `cash${i}`] = N(r.amount); });
      }
    }
    return { kind: 'cash-flow', title: 'Cash Flow Statement', period: `${from} – ${to}`, comparativePeriod: null, rows: out, totals };
  }

  // ---------------------------------------------------------------- writes
  save(fn: PeriodCloseSave, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  async run(fn: PeriodCloseLifecycle, id: string, text: string | null = null) {
    const db = this.prisma.db();
    if (TEXT_ARG.includes(fn)) await db.$queryRawUnsafe(`select "Accounting"."${fn}"($1::uuid, $2::text)::text`, id, text);
    else await db.$queryRawUnsafe(`select "Accounting"."${fn}"($1::uuid)::text`, id);
  }
}
