import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { DayCloseStore, type DayCloseRow } from '../application/day-close-store.js';

type Row = Prisma.CashDayClosesGetPayload<object>;

@Injectable()
export class PrismaDayCloseStore extends DayCloseStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(tenantId: string, cashAccountId: string, date: string) {
    const row = await this.prisma.db().cashDayCloses.findFirst({ where: { tenantId, cashAccountId, closeDate: new Date(date) } });
    return row ? this.map(tenantId, row) : null;
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().cashDayCloses.findFirst({ where: { tenantId, id } });
    return row ? this.map(tenantId, row) : null;
  }

  private async map(tenantId: string, r: Row): Promise<DayCloseRow> {
    const db = this.prisma.db();
    const [dens, users, vouchers] = await Promise.all([
      db.cashDayCloseDenominations.findMany({ where: { tenantId, dayCloseId: r.id }, orderBy: { noteValue: 'desc' } }),
      userRefs(db, tenantId, [r.lockedByUserId]),
      voucherRefs(db, tenantId, [r.varianceJournalEntryId]),
    ]);
    return {
      id: r.id, cashAccountId: r.cashAccountId, closeDate: day(r.closeDate)!, bookBalance: num(r.bookBalance), countedAmount: num(r.countedAmount), varianceAmount: num(r.varianceAmount),
      status: r.status, lockedBy: users.get(r.lockedByUserId ?? '') ?? null, lockedAt: r.lockedAt?.toISOString() ?? null,
      varianceVoucher: vouchers.get(r.varianceJournalEntryId ?? '') ?? null, remarks: r.remarks, denominations: dens.map((d) => ({ noteValue: d.noteValue, qty: d.qty })), rowVersion: r.rowVersion,
    };
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'cashDayCloseAddUpdate', data);
  }

  async set(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().cashDayCloses.updateMany({ where: { tenantId, id }, data });
  }

  async dayTotals(tenantId: string, glAccountId: string, date: string) {
    const r = await this.prisma.db().$queryRaw<{ dr: string; cr: string }[]>`
      SELECT COALESCE(sum(l.debit), 0)::text AS dr, COALESCE(sum(l.credit), 0)::text AS cr
        FROM "Accounting"."VoucherLines" l JOIN "Accounting"."Vouchers" v ON v."tenantId" = l."tenantId" AND v.id = l."journalEntryId"
       WHERE l."tenantId" = ${tenantId}::uuid AND l."accountId" = ${glAccountId}::uuid AND v.status IN ('POSTED', 'REVERSED') AND v."postingDate" = ${date}::date`;
    return { receipts: Number(r[0]?.dr ?? 0), payments: Number(r[0]?.cr ?? 0) };
  }

  async postVariance(date: string, branchId: string, cashGlAccountId: string, variance: number, label: string) {
    const amt = Math.abs(variance);
    const overShort = await this.role('CASH_OVER_SHORT');
    const resolved = variance < 0
      ? [{ accountId: overShort, debit: amt, particulars: `Cash short · ${label}` }, { accountId: cashGlAccountId, credit: amt, particulars: 'Short in the cash count' }]
      : [{ accountId: cashGlAccountId, debit: amt, particulars: 'Over in the cash count' }, { accountId: overShort, credit: amt, particulars: `Cash over · ${label}` }];
    const r = await this.prisma.db().$queryRaw<{ id: string }[]>`
      SELECT "BankCash"."postBankingVoucher"('JV', ${date}::date, ${branchId}::uuid, ${`Cash count variance · ${label}`}, NULL::uuid, NULL::text, NULL::text, NULL::date, NULL::text, NULL::uuid, NULL::text, ${JSON.stringify(resolved)}::jsonb)::text AS id`;
    return r[0]!.id;
  }

  private async role(role: string) {
    const r = await this.prisma.db().$queryRaw<{ id: string }[]>`SELECT "Company"."getAccountForRole"(${role})::text AS id`;
    return r[0]!.id;
  }
}
