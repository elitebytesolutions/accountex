import { Injectable } from '@nestjs/common';
import type { RecurringRun, RecurringTemplate } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { RecurringStore } from '../application/recurring-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const ids = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
type Schedule = Parameters<RecurringStore['firstRun']>[1];

@Injectable()
export class PrismaRecurringStore extends RecurringStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string) {
    const rows = await this.prisma.db().recurringVoucherTemplates.findMany({ where: { tenantId }, orderBy: [{ nextRunDate: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }] });
    return this.map(tenantId, rows);
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().recurringVoucherTemplates.findFirst({ where: { tenantId, id } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  private async map(tenantId: string, rows: Awaited<ReturnType<ReturnType<PrismaService['db']>['recurringVoucherTemplates']['findMany']>>): Promise<RecurringTemplate[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = await db.recurringVoucherTemplateLines.findMany({ where: { tenantId, recurringTemplateId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } });
    const [accounts, branches, ccs, users] = await Promise.all([
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids([...lines.map((l) => l.accountId), ...rows.map((r) => r.cashBankAccountId)]) } }, select: { id: true, code: true, name: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.branchId)) } }, select: { id: true, code: true, name: true } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.costCentreId)) } }, select: { id: true, code: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.notifyUserId)) } }, select: { id: true, fullName: true } }),
    ]);
    const acc = (id: string | null) => (id ? (accounts.find((a) => a.id === id) ?? { id, code: '?', name: '?' }) : null);
    return rows.map((r) => {
      const u = users.find((x) => x.id === r.notifyUserId);
      return {
        id: r.id, name: r.name, description: r.description, voucherType: r.voucherType, frequency: r.frequency, runDay: r.runDay, runOnLastDay: r.runOnLastDay,
        runWeekday: r.runWeekday, runMonth: r.runMonth, startDate: day(r.startDate), endMode: r.endMode, endAfterCount: r.endAfterCount, endOnDate: day(r.endOnDate),
        branch: branches.find((b) => b.id === r.branchId) ?? { id: r.branchId, code: '?', name: '?' }, narration: r.narration, cashBankAccount: acc(r.cashBankAccountId),
        partyName: r.partyName, amount: r.amount.toNumber(), autoPost: r.autoPost, notifyOnFailure: r.notifyOnFailure, notifyUser: u ? { id: u.id, name: u.fullName } : null,
        nextRunDate: day(r.nextRunDate), lastRunDate: day(r.lastRunDate), occurrencesDone: r.occurrencesDone, status: r.status, lastError: r.lastError,
        lines: lines.filter((l) => l.recurringTemplateId === r.id).map((l) => ({
          id: l.id, account: acc(l.accountId)!, narration: l.narration, debit: l.debit.toNumber(), credit: l.credit.toNumber(), costCentre: ccs.find((c) => c.id === l.costCentreId) ?? null,
        })),
        rowVersion: r.rowVersion,
      };
    });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'recurringVoucherTemplateAddUpdate', data);
  }

  async delete(tenantId: string, id: string, rowVersion: number) {
    // the lines go with it (ON DELETE CASCADE)
    const r = await this.prisma.db().recurringVoucherTemplates.deleteMany({ where: { tenantId, id, rowVersion } });
    if (!r.count) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
  }

  async hasRuns(tenantId: string, id: string) {
    return (await this.prisma.db().recurringVoucherRuns.count({ where: { tenantId, recurringTemplateId: id } })) > 0;
  }

  async runs(tenantId: string, id: string): Promise<RecurringRun[]> {
    const db = this.prisma.db();
    const rows = await db.recurringVoucherRuns.findMany({ where: { tenantId, recurringTemplateId: id }, orderBy: { runAt: 'desc' }, take: 100 });
    const vs = await db.vouchers.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.journalEntryId)) } }, select: { id: true, docNo: true } });
    return rows.map((r) => ({
      id: r.id, scheduledDate: day(r.scheduledDate)!, runAt: r.runAt.toISOString(), triggerType: r.triggerType, status: r.status,
      voucher: vs.find((v) => v.id === r.journalEntryId) ?? null, errorMessage: r.errorMessage,
    }));
  }

  /** The DB function always moves to the next period, so the current period's date is checked here first. */
  async firstRun(from: string, t: Schedule) {
    if (t.frequency === 'NONE') return null;
    const f = new Date(`${from}T00:00:00Z`);
    const onDay = (y: number, m: number) => {
      const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return new Date(Date.UTC(y, m, t.runOnLastDay ? dim : Math.min(t.runDay ?? 1, dim))).toISOString().slice(0, 10);
    };
    if (t.frequency === 'MONTHLY' || t.frequency === 'QUARTERLY') {
      const here = onDay(f.getUTCFullYear(), f.getUTCMonth());
      if (here >= from) return here;
    }
    if (t.frequency === 'YEARLY' && t.runMonth) {
      const here = onDay(f.getUTCFullYear(), t.runMonth - 1);
      if (here >= from) return here;
    }
    const base = t.frequency === 'WEEKLY' ? new Date(f.getTime() - 86_400_000).toISOString().slice(0, 10) : from;
    const r = await this.prisma.db().$queryRaw<{ d: Date | null }[]>`
      select "Accounting"."getRecurringVoucherNextDate"(${base}::date, ${t.frequency}, ${t.runDay}::smallint, ${t.runOnLastDay}, ${t.runWeekday}::smallint, ${t.runMonth}::smallint) as d`;
    return day(r[0]?.d ?? null);
  }

  async run(id: string, date: string, trigger: 'MANUAL' | 'SCHEDULE') {
    const r = await this.prisma.db().$queryRaw<{ id: string | null }[]>`select "Accounting"."recurringVoucherTemplateRun"(${id}::uuid, ${date}::date, ${trigger})::text as id`;
    return r[0]?.id ?? null;
  }

  async tenants() {
    const rows = await this.prisma.db().tenants.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async due(tenantId: string, today: string) {
    const rows = await this.prisma.db().recurringVoucherTemplates.findMany({
      where: { tenantId, status: 'ACTIVE', frequency: { not: 'NONE' }, nextRunDate: { lte: new Date(today) } }, select: { id: true, nextRunDate: true }, orderBy: { nextRunDate: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, nextRunDate: day(r.nextRunDate)! }));
  }
}
