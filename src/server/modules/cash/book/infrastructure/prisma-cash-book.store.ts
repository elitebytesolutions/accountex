import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { CashEntry, CashLedgerRow, CashOptions } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { CashBookStore } from '../application/cash-book-store.js';

const ROLES = ['CASH_OVER_SHORT', 'EMPLOYEE_CLAIMS_PAYABLE', 'PETTY_CASH', 'BANK_CHARGES'];
type EntryRow = Prisma.CashBookEntriesGetPayload<object>;

@Injectable()
export class PrismaCashBookStore extends CashBookStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Today's GL balance of many accounts at once. */
  private async balances(tenantId: string, glIds: string[]) {
    if (!glIds.length) return new Map<string, number>();
    const rows = await this.prisma.db().$queryRaw<{ a: string; b: string }[]>`
      SELECT l."accountId"::text AS a, sum(l.debit - l.credit)::text AS b
        FROM "Accounting"."VoucherLines" l JOIN "Accounting"."Vouchers" v ON v."tenantId" = l."tenantId" AND v.id = l."journalEntryId"
       WHERE l."tenantId" = ${tenantId}::uuid AND v.status IN ('POSTED', 'REVERSED') AND l."accountId" = ANY(${glIds}::uuid[])
       GROUP BY l."accountId"`;
    return new Map(rows.map((r) => [r.a, Number(r.b)]));
  }

  async options(tenantId: string): Promise<CashOptions> {
    const db = this.prisma.db();
    const [cash, banks, cats, ecats, coa, ccs, branches, customers, vendors, employees, bankMasters, funds, roles, pending] = await Promise.all([
      db.cashAccounts.findMany({ where: { tenantId, deletedAt: null, isActive: true }, orderBy: { name: 'asc' } }),
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { accountTitle: 'asc' } }),
      db.cashCategories.findMany({ where: { tenantId, deletedAt: null, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      db.expenseCategories.findMany({ where: { tenantId, deletedAt: null, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, kind: 'POSTABLE', status: 'ACTIVE' }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: 'asc' } }),
      db.costCentres.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.customers.findMany({ where: { tenantId, deletedAt: null, status: { in: ['ACTIVE', 'ON_HOLD'] } }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.vendors.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.employees.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, displayName: true, firstName: true, lastName: true }, orderBy: { code: 'asc' } }),
      db.banks.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.pettyCashFunds.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: 'asc' } }),
      db.defaultAccountMappings.findMany({ where: { tenantId, role: { in: ROLES } }, select: { role: true, accountId: true } }),
      db.pettyCashVouchers.groupBy({ by: ['fundId'], where: { tenantId, status: 'UNREPLENISHED' }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const bal = await this.balances(tenantId, ids([...cash.map((c) => c.accountId), ...banks.map((b) => b.accountId)]));
    const custodians = await userRefs(db, tenantId, cash.map((c) => c.custodianUserId));
    const acc = (id: string | null) => coa.find((a) => a.id === id) ?? null;
    return {
      cashAccounts: cash.map((c) => ({
        id: c.id, code: c.code, name: c.name, kind: c.kind, branchId: c.branchId, accountId: c.accountId, balance: Math.round((bal.get(c.accountId) ?? 0) * 100) / 100,
        varianceTolerance: num(c.varianceTolerance), approvalThreshold: c.approvalThreshold ? num(c.approvalThreshold) : null, custodianUserId: c.custodianUserId, custodianName: custodians.get(c.custodianUserId ?? '')?.name ?? null,
      })),
      bankAccounts: banks.map((b) => ({ id: b.id, title: b.accountTitle, last4: b.accountLast4, accountId: b.accountId, branchId: b.branchId, balance: Math.round((bal.get(b.accountId ?? '') ?? 0) * 100) / 100 })),
      categories: cats.map((c) => ({ id: c.id, code: c.code, name: c.name, direction: c.direction, voucherType: c.voucherType, defaultAccountId: c.defaultAccountId, partyKind: c.partyKind, icon: c.icon })),
      expenseCategories: ecats.map((c) => ({ id: c.id, code: c.code, name: c.name, accountId: c.accountId, limitAmount: c.limitAmount ? num(c.limitAmount) : null, limitPeriod: c.limitPeriod, receiptRequired: c.receiptRequired, requiresPreApproval: c.requiresPreApproval, icon: c.icon })),
      accounts: coa.map((a) => ({ id: a.id, code: a.code, name: a.name, accountClass: Number(a.accountClass) })),
      costCentres: ccs, branches, customers, vendors, banks: bankMasters,
      employees: employees.map((e) => ({ id: e.id, code: e.code, name: e.displayName ?? `${e.firstName} ${e.lastName ?? ''}`.trim() })),
      pettyFunds: funds.map((f) => {
        const c = cash.find((x) => x.id === f.cashAccountId);
        const p = pending.find((x) => x.fundId === f.id);
        const gl = c ? (bal.get(c.accountId) ?? 0) : 0;
        const spent = num(p?._sum.amount);
        return { id: f.id, name: f.name, branchId: f.branchId, cashAccountId: f.cashAccountId, imprestAmount: num(f.imprestAmount), status: f.status ?? 'ACTIVE', cashOnHand: Math.round((gl - spent) * 100) / 100, unreplenishedCount: p?._count._all ?? 0, unreplenishedTotal: spent };
      }),
      postingRoles: Object.fromEntries(ROLES.map((r) => { const a = acc(roles.find((m) => m.role === r)?.accountId ?? null); return [r, a ? { id: a.id, code: a.code, name: a.name } : null]; })),
    };
  }

  async glBalance(tenantId: string, glAccountId: string, date: string, before = false) {
    const r = before
      ? await this.prisma.db().$queryRaw<{ b: string }[]>`
          SELECT COALESCE(sum(l.debit - l.credit), 0)::text AS b FROM "Accounting"."VoucherLines" l JOIN "Accounting"."Vouchers" v ON v."tenantId" = l."tenantId" AND v.id = l."journalEntryId"
           WHERE l."tenantId" = ${tenantId}::uuid AND l."accountId" = ${glAccountId}::uuid AND v.status IN ('POSTED', 'REVERSED') AND v."postingDate" < ${date}::date`
      : await this.prisma.db().$queryRaw<{ b: string }[]>`
          SELECT COALESCE(sum(l.debit - l.credit), 0)::text AS b FROM "Accounting"."VoucherLines" l JOIN "Accounting"."Vouchers" v ON v."tenantId" = l."tenantId" AND v.id = l."journalEntryId"
           WHERE l."tenantId" = ${tenantId}::uuid AND l."accountId" = ${glAccountId}::uuid AND v.status IN ('POSTED', 'REVERSED') AND v."postingDate" <= ${date}::date`;
    return Math.round(Number(r[0]?.b ?? 0) * 100) / 100;
  }

  async entries(tenantId: string, q: { cashAccountId?: string; bankAccountId?: string; from: string; to: string }) {
    const or: Prisma.CashBookEntriesWhereInput[] = [];
    if (q.cashAccountId) or.push({ cashAccountId: q.cashAccountId }, { toCashAccountId: q.cashAccountId });
    if (q.bankAccountId) or.push({ bankAccountId: q.bankAccountId }, { toBankAccountId: q.bankAccountId });
    const rows = await this.prisma.db().cashBookEntries.findMany({
      where: { tenantId, entryDate: { gte: new Date(q.from), lte: new Date(q.to) }, ...(or.length && { OR: or }) },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }], take: 1000,
    });
    return this.map(tenantId, rows);
  }

  async entry(tenantId: string, id: string) {
    const row = await this.prisma.db().cashBookEntries.findFirst({ where: { tenantId, id } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  private async map(tenantId: string, rows: EntryRow[]): Promise<CashEntry[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [cash, banks, cats, branches, cheques, vouchers, users] = await Promise.all([
      db.cashAccounts.findMany({ where: { tenantId, id: { in: ids(rows.flatMap((r) => [r.cashAccountId, r.toCashAccountId])) } }, select: { id: true, code: true, name: true } }),
      db.bankAccounts.findMany({ where: { tenantId, id: { in: ids(rows.flatMap((r) => [r.bankAccountId, r.toBankAccountId])) } }, select: { id: true, accountTitle: true } }),
      db.cashCategories.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.categoryId)) } }, select: { id: true, code: true, name: true, icon: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.branchId)) } }, select: { id: true, code: true, name: true } }),
      db.cheques.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.chequeId)) } }, select: { id: true, docNo: true, chequeNo: true, status: true } }),
      voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId)),
      userRefs(db, tenantId, rows.map((r) => r.createdBy)),
    ]);
    const bank = (id: string | null) => { const b = banks.find((x) => x.id === id); return b ? { id: b.id, title: b.accountTitle } : null; };
    return rows.map((r) => ({
      id: r.id, kind: r.entryKind, entryDate: day(r.entryDate)!, entryTime: r.entryTime ? r.entryTime.toISOString().slice(11, 16) : null,
      branch: branches.find((b) => b.id === r.branchId) ?? { id: r.branchId, code: '?', name: '?' },
      cashAccount: cash.find((c) => c.id === r.cashAccountId) ?? null, bankAccount: bank(r.bankAccountId),
      toCashAccount: cash.find((c) => c.id === r.toCashAccountId) ?? null, toBankAccount: bank(r.toBankAccountId),
      category: cats.find((c) => c.id === r.categoryId) ?? null, paymentMode: r.paymentMode, partyName: r.partyName, referenceNo: r.referenceNo,
      amount: num(r.amount), narration: r.narration, cheque: cheques.find((c) => c.id === r.chequeId) ?? null,
      voucher: vouchers.get(r.journalEntryId) ?? null, createdBy: users.get(r.createdBy ?? '') ?? null, createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }

  async insertEntry(data: Record<string, unknown>) {
    const row = await this.prisma.db().cashBookEntries.create({ data: data as Prisma.CashBookEntriesUncheckedCreateInput, select: { id: true } });
    return row.id;
  }

  async ledgerRows(tenantId: string, glAccountId: string, from: string, to: string): Promise<CashLedgerRow[]> {
    const db = this.prisma.db();
    const rows = await db.$queryRaw<{ vid: string; date: Date; debit: string; credit: string; particulars: string | null; narration: string; contraCode: string | null; contraName: string | null; category: string | null; createdBy: string | null; entryId: string | null; entryTime: string | null; postedAt: Date | null }[]>`
      SELECT v.id::text AS vid, v."postingDate" AS date, l.debit::text, l.credit::text, l.particulars, v.narration,
             e.id::text AS "entryId", to_char(e."entryTime", 'HH24:MI') AS "entryTime", v."postedAt",
             c.code AS "contraCode", c.name AS "contraName", cat.name AS category, v."preparedByUserId"::text AS "createdBy"
        FROM "Accounting"."VoucherLines" l
        JOIN "Accounting"."Vouchers" v ON v."tenantId" = l."tenantId" AND v.id = l."journalEntryId"
        LEFT JOIN LATERAL (
          SELECT a.code, a.name FROM "Accounting"."VoucherLines" o JOIN "Accounting"."ChartOfAccounts" a ON a."tenantId" = o."tenantId" AND a.id = o."accountId"
           WHERE o."tenantId" = l."tenantId" AND o."journalEntryId" = l."journalEntryId" AND o."accountId" <> l."accountId"
           ORDER BY (o.debit + o.credit) DESC LIMIT 1) c ON true
        LEFT JOIN "BankCash"."CashBookEntries" e ON e."tenantId" = v."tenantId" AND e."journalEntryId" = v.id
        LEFT JOIN "BankCash"."CashCategories" cat ON cat."tenantId" = e."tenantId" AND cat.id = e."categoryId"
       WHERE l."tenantId" = ${tenantId}::uuid AND l."accountId" = ${glAccountId}::uuid AND v.status IN ('POSTED', 'REVERSED')
         AND v."postingDate" BETWEEN ${from}::date AND ${to}::date
       ORDER BY v."postingDate", v."postedAt" NULLS LAST, v."docNo"`;
    const [vouchers, users] = await Promise.all([voucherRefs(db, tenantId, rows.map((r) => r.vid)), userRefs(db, tenantId, rows.map((r) => r.createdBy))]);
    return rows.map((r) => {
      const receipt = Number(r.debit), payment = Number(r.credit);
      return {
        date: day(r.date)!, time: r.entryTime ?? (r.postedAt ? r.postedAt.toISOString().slice(11, 16) : null), entryId: r.entryId, voucher: vouchers.get(r.vid) ?? null, particulars: `${receipt > 0 ? 'By' : 'To'} ${r.contraCode ?? ''} · ${r.contraName ?? r.particulars ?? ''}`.trim(),
        contra: r.contraCode ? { code: r.contraCode, name: r.contraName ?? '' } : null, category: r.category, receipt, payment, balance: 0, narration: r.narration,
        createdBy: users.get(r.createdBy ?? '') ?? null,
      };
    });
  }

  async lockedDay(tenantId: string, cashAccountId: string, date: string) {
    return (await this.prisma.db().cashDayCloses.count({ where: { tenantId, cashAccountId, closeDate: new Date(date), status: 'LOCKED' } })) > 0;
  }

  async dayCloses(tenantId: string, cashAccountId: string, from: string, to: string) {
    const rows = await this.prisma.db().cashDayCloses.findMany({ where: { tenantId, cashAccountId, closeDate: { gte: new Date(from), lte: new Date(to) } }, select: { id: true, closeDate: true, status: true, varianceAmount: true } });
    return rows.map((r) => ({ id: r.id, closeDate: day(r.closeDate)!, status: r.status, varianceAmount: num(r.varianceAmount) }));
  }

  async custodian(tenantId: string, userId: string | null) {
    if (!userId) return null;
    return (await userRefs(this.prisma.db(), tenantId, [userId])).get(userId) ?? null;
  }
}
