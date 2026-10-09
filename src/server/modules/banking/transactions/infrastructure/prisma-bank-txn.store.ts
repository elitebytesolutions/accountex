import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { BankingOptions, BankTxn, BankTxnList, BankTxnQuery, StatementLayout } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { BankTxnStore } from '../application/bank-txn-store.js';
import { bankAccountRefs, day, ids, num, userRefs, voucherRefs } from './banking-refs.js';

type Row = Prisma.BankTransactionsGetPayload<object>;
const ROLES = ['CHEQUES_IN_HAND', 'PDC_PAYABLE', 'AR_CONTROL', 'AP_CONTROL', 'BANK_CHARGES', 'PROFIT_ON_DEPOSIT'];

@Injectable()
export class PrismaBankTxnStore extends BankTxnStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async options(tenantId: string): Promise<BankingOptions> {
    const db = this.prisma.db();
    const [accounts, banks, books, bankMasters, customers, vendors, coa, ccs, branches, roles] = await Promise.all([
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null }, orderBy: { accountTitle: 'asc' } }),
      db.banks.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.chequeBooks.findMany({ where: { tenantId }, orderBy: { firstLeafNo: 'asc' } }),
      db.banks.findMany({ where: { tenantId }, select: { id: true, name: true, shortName: true } }),
      db.customers.findMany({ where: { tenantId, deletedAt: null, status: { in: ['ACTIVE', 'ON_HOLD'] } }, select: { id: true, code: true, name: true, receivableAccountId: true }, orderBy: { name: 'asc' } }),
      db.vendors.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, payableAccountId: true }, orderBy: { name: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, kind: 'POSTABLE', status: 'ACTIVE' }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: 'asc' } }),
      db.costCentres.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.defaultAccountMappings.findMany({ where: { tenantId, role: { in: ROLES } }, select: { role: true, accountId: true } }),
    ]);
    const acc = (id: string | null) => coa.find((a) => a.id === id) ?? null;
    return {
      bankAccounts: accounts.map((a) => ({
        id: a.id, title: a.accountTitle, last4: a.accountLast4, bankName: bankMasters.find((b) => b.id === a.bankId)?.shortName ?? bankMasters.find((b) => b.id === a.bankId)?.name ?? '',
        branchId: a.branchId, accountId: a.accountId, status: a.status, reconciledTo: day(a.reconciledTo), lastStatementBalance: a.lastStatementBalance ? num(a.lastStatementBalance) : null,
        statementLayout: (a.statementLayout as StatementLayout | null) ?? null,
        chequeBooks: books.filter((b) => b.bankAccountId === a.id).map((b) => ({ id: b.id, bookRef: b.bookRef, firstLeafNo: Number(b.firstLeafNo), lastLeafNo: Number(b.lastLeafNo), nextLeafNo: Number(b.nextLeafNo), status: b.status })),
      })),
      banks,
      customers: customers.map((c) => ({ id: c.id, code: c.code, name: c.name, accountId: c.receivableAccountId })),
      vendors: vendors.map((v) => ({ id: v.id, code: v.code, name: v.name, accountId: v.payableAccountId })),
      accounts: coa.map((a) => ({ id: a.id, code: a.code, name: a.name, accountClass: Number(a.accountClass) })),
      costCentres: ccs, branches,
      postingRoles: Object.fromEntries(ROLES.map((r) => { const a = acc(roles.find((m) => m.role === r)?.accountId ?? null); return [r, a ? { id: a.id, code: a.code, name: a.name } : null]; })),
    };
  }

  async list(tenantId: string, userId: string, q: BankTxnQuery): Promise<BankTxnList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const amount = s && /^[\d,.]+$/.test(s) ? Number(s.replace(/,/g, '')) : null;
    const base: Prisma.BankTransactionsWhereInput = {
      tenantId,
      ...(q.account && { bankAccountId: q.account }),
      ...((q.from || q.to) && { txnDate: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(q.mine && { createdBy: userId }),
      ...(q.minAmount && { OR: [{ depositAmount: { gt: q.minAmount } }, { withdrawalAmount: { gt: q.minAmount } }] }),
      ...(s && { AND: [{ OR: [
        { description: { contains: s, mode: 'insensitive' } }, { detail: { contains: s, mode: 'insensitive' } }, { reference: { contains: s, mode: 'insensitive' } },
        ...(amount ? [{ depositAmount: amount }, { withdrawalAmount: amount }] : []),
      ] }] }),
    };
    const where: Prisma.BankTransactionsWhereInput = {
      ...base,
      ...(q.status && { status: q.status }),
      ...(q.type === 'deposit' && { depositAmount: { gt: 0 } }),
      ...(q.type === 'withdrawal' && { withdrawalAmount: { gt: 0 } }),
      ...(q.type === 'uncategorised' && { status: 'UNCATEGORISED' }),
    };
    const [rows, total, sums, byStatus, charges] = await Promise.all([
      db.bankTransactions.findMany({ where, orderBy: [{ txnDate: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.bankTransactions.count({ where }),
      db.bankTransactions.aggregate({ where: base, _sum: { depositAmount: true, withdrawalAmount: true } }),
      db.bankTransactions.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.bankTransactions.aggregate({ where: { ...base, category: 'BANK_CHARGES' }, _sum: { withdrawalAmount: true } }),
    ]);
    const statusCounts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    return {
      items: await this.map(tenantId, rows), total,
      kpis: { deposits: num(sums._sum.depositAmount), withdrawals: num(sums._sum.withdrawalAmount), uncategorised: statusCounts.UNCATEGORISED ?? 0, bankCharges: num(charges._sum.withdrawalAmount) },
      statusCounts,
    };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().bankTransactions.findFirst({ where: { tenantId, id } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async balanceBefore(tenantId: string, bankAccountId: string, date: string) {
    const r = await this.prisma.db().$queryRaw<{ b: string }[]>`
      SELECT COALESCE(sum(l.debit - l.credit), 0)::text AS b
        FROM "BankCash"."BankAccounts" ba
        JOIN "Accounting"."VoucherLines" l ON l."tenantId" = ba."tenantId" AND l."accountId" = ba."accountId"
        JOIN "Accounting"."Vouchers" v ON v."tenantId" = l."tenantId" AND v.id = l."journalEntryId"
       WHERE ba."tenantId" = ${tenantId}::uuid AND ba.id = ${bankAccountId}::uuid AND v.status IN ('POSTED', 'REVERSED') AND v."postingDate" < ${date}::date`;
    return Number(r[0]?.b ?? 0);
  }

  async booked(tenantId: string, bankAccountId: string, from: string, to: string) {
    const rows = await this.prisma.db().bankTransactions.findMany({
      where: { tenantId, bankAccountId, journalEntryId: { not: null }, txnDate: { gte: new Date(from), lte: new Date(to) } },
      orderBy: [{ txnDate: 'asc' }, { createdAt: 'asc' }], take: 5000,
    });
    return this.map(tenantId, rows);
  }

  private async map(tenantId: string, rows: Row[]): Promise<BankTxn[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    // an uncategorised line may already have a voucher waiting for approval
    const pending = await db.vouchers.findMany({
      where: { tenantId, sourceDocType: 'BK', sourceDocId: { in: rows.filter((r) => !r.journalEntryId).map((r) => r.id) }, status: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
      select: { id: true, sourceDocId: true },
    });
    const [banks, vouchers, users, cheques] = await Promise.all([
      bankAccountRefs(db, tenantId, rows.map((r) => r.bankAccountId)),
      voucherRefs(db, tenantId, [...rows.map((r) => r.journalEntryId), ...pending.map((p) => p.id)]),
      userRefs(db, tenantId, rows.map((r) => r.createdBy)),
      db.cheques.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.chequeId)) } }, select: { id: true, docNo: true, chequeNo: true } }),
    ]);
    return rows.map((r) => {
      const b = banks.get(r.bankAccountId);
      const vId = r.journalEntryId ?? pending.find((p) => p.sourceDocId === r.id)?.id ?? null;
      return {
        id: r.id, bankAccount: { id: r.bankAccountId, title: b?.title ?? '?', last4: b?.last4 ?? null }, txnDate: day(r.txnDate)!, valueDate: day(r.valueDate),
        description: r.description, detail: r.detail, reference: r.reference, paymentMode: r.paymentMode, category: r.category,
        deposit: num(r.depositAmount), withdrawal: num(r.withdrawalAmount), cheque: cheques.find((c) => c.id === r.chequeId) ?? null,
        voucher: vId ? (vouchers.get(vId) ?? null) : null, source: r.source, status: r.status, statementLineId: r.statementLineId,
        clearedOn: day(r.clearedOn), reconciledOn: day(r.reconciledOn), createdBy: users.get(r.createdBy ?? '') ?? null, rowVersion: r.rowVersion,
      };
    });
  }

  async openVoucherFor(tenantId: string, txnId: string) {
    return this.prisma.db().vouchers.findFirst({ where: { tenantId, sourceDocType: 'BK', sourceDocId: txnId, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'POSTED'] } }, select: { id: true, docNo: true, status: true } });
  }

  async categoriseLine(tenantId: string, txnId: string, data: { accountId: string; costCentreId: string | null; category: string | null; bankRuleId?: string | null }) {
    const db = this.prisma.db();
    await db.bankTransactions.updateMany({ where: { tenantId, id: txnId }, data: { category: data.category } });
    await db.bankStatementLines.updateMany({
      where: { tenantId, bankTransactionId: txnId },
      data: { status: 'CATEGORISED', categoryAccountId: data.accountId, costCentreId: data.costCentreId, ...(data.bankRuleId !== undefined && { bankRuleId: data.bankRuleId }) },
    });
  }
}
