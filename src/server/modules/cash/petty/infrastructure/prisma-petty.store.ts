import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { PettyReplenishment, PettyVoucher, PettyVoucherList } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { PettyStore } from '../application/petty-store.js';

type VRow = Prisma.PettyCashVouchersGetPayload<object>;
type RRow = Prisma.PettyCashReplenishmentsGetPayload<object>;

@Injectable()
export class PrismaPettyStore extends PettyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async vouchers(tenantId: string, q: { fund?: string; status?: string; search?: string; page: number; pageSize: number }): Promise<PettyVoucherList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.PettyCashVouchersWhereInput = { tenantId, ...(q.fund && { fundId: q.fund }) };
    const where: Prisma.PettyCashVouchersWhereInput = {
      ...base, ...(q.status && { status: q.status }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { description: { contains: s, mode: 'insensitive' } }, { paidTo: { contains: s, mode: 'insensitive' } }] }),
    };
    const [rows, total, byCat, pending] = await Promise.all([
      db.pettyCashVouchers.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.pettyCashVouchers.count({ where }),
      db.pettyCashVouchers.groupBy({ by: ['categoryId'], where: { ...base, status: { not: 'VOID' } }, _sum: { amount: true } }),
      db.pettyCashVouchers.aggregate({ where: { ...base, status: 'UNREPLENISHED' }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const cats = await db.expenseCategories.findMany({ where: { tenantId, id: { in: byCat.map((b) => b.categoryId) } }, select: { id: true, name: true } });
    return {
      items: await this.mapVouchers(tenantId, rows), total,
      byCategory: byCat.map((b) => ({ name: cats.find((c) => c.id === b.categoryId)?.name ?? '?', amount: num(b._sum.amount) })).sort((a, b) => b.amount - a.amount),
      pending: { count: pending._count._all, total: num(pending._sum.amount) },
    };
  }

  async voucher(tenantId: string, id: string) {
    const row = await this.prisma.db().pettyCashVouchers.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapVouchers(tenantId, [row]))[0]! : null;
  }

  private async mapVouchers(tenantId: string, rows: VRow[]): Promise<PettyVoucher[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [funds, cats, accounts, ccs, reps, users] = await Promise.all([
      db.pettyCashFunds.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.fundId)) } }, select: { id: true, name: true } }),
      db.expenseCategories.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.categoryId)) } }, select: { id: true, code: true, name: true, icon: true } }),
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.accountId)) } }, select: { id: true, code: true, name: true } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.costCentreId)) } }, select: { id: true, code: true, name: true } }),
      db.pettyCashReplenishments.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.replenishmentId)) } }, select: { id: true, docDate: true, journalEntryId: true } }),
      userRefs(db, tenantId, rows.map((r) => r.recordedByUserId)),
    ]);
    const vs = await voucherRefs(db, tenantId, reps.map((r) => r.journalEntryId));
    return rows.map((r) => {
      const rep = reps.find((x) => x.id === r.replenishmentId);
      return {
        id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, fund: funds.find((f) => f.id === r.fundId) ?? { id: r.fundId, name: '?' },
        category: cats.find((c) => c.id === r.categoryId) ?? { id: r.categoryId, code: '?', name: '?', icon: null }, description: r.description, paidTo: r.paidTo,
        amount: num(r.amount), account: accounts.find((a) => a.id === r.accountId) ?? { id: r.accountId, code: '?', name: '?' }, costCentre: ccs.find((c) => c.id === r.costCentreId) ?? null,
        receiptStatus: r.receiptStatus, receiptCount: r.receiptCount, status: r.status,
        replenishment: rep ? { id: rep.id, docDate: day(rep.docDate)!, voucher: vs.get(rep.journalEntryId ?? '') ?? null } : null,
        recordedBy: users.get(r.recordedByUserId ?? '') ?? null, rowVersion: r.rowVersion,
      };
    });
  }

  saveVoucher(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'pettyCashVoucherAddUpdate', data);
  }

  async voidVoucher(id: string, reason: string | null) {
    await this.prisma.db().$queryRaw`select "BankCash"."pettyCashVoucherVoid"(${id}::uuid, ${reason})::text`;
  }

  async replenishments(tenantId: string, fundId: string | null) {
    const rows = await this.prisma.db().pettyCashReplenishments.findMany({ where: { tenantId, ...(fundId && { fundId }) }, orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }], take: 100 });
    return this.mapReps(tenantId, rows);
  }

  async replenishment(tenantId: string, id: string) {
    const row = await this.prisma.db().pettyCashReplenishments.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapReps(tenantId, [row]))[0]! : null;
  }

  private async mapReps(tenantId: string, rows: RRow[]): Promise<PettyReplenishment[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [funds, cash, banks, vs, users] = await Promise.all([
      db.pettyCashFunds.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.fundId)) } }, select: { id: true, name: true } }),
      db.cashAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.payFromCashAccountId)) } }, select: { id: true, name: true } }),
      db.bankAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.payFromBankAccountId)) } }, select: { id: true, accountTitle: true } }),
      voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId)),
      userRefs(db, tenantId, rows.map((r) => r.createdBy)),
    ]);
    return rows.map((r) => ({
      id: r.id, fund: funds.find((f) => f.id === r.fundId) ?? { id: r.fundId, name: '?' }, docDate: day(r.docDate)!,
      payFrom: r.payFromCashAccountId
        ? { kind: 'CASH' as const, id: r.payFromCashAccountId, name: cash.find((c) => c.id === r.payFromCashAccountId)?.name ?? '?' }
        : { kind: 'BANK' as const, id: r.payFromBankAccountId!, name: banks.find((b) => b.id === r.payFromBankAccountId)?.accountTitle ?? '?' },
      amount: num(r.amount), voucherCount: r.voucherCount, vouchersTotal: num(r.vouchersTotal), status: r.status, voucher: vs.get(r.journalEntryId ?? '') ?? null,
      remarks: r.remarks, createdBy: users.get(r.createdBy ?? '') ?? null, rowVersion: r.rowVersion,
    }));
  }

  saveReplenishment(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'pettyCashReplenishmentAddUpdate', data);
  }

  async postReplenishment(id: string) {
    await this.prisma.db().$queryRaw`select "BankCash"."pettyCashReplenishmentPost"(${id}::uuid)::text`;
  }

  async cancelReplenishment(id: string, reason: string | null) {
    await this.prisma.db().$queryRaw`select "BankCash"."pettyCashReplenishmentCancel"(${id}::uuid, ${reason})::text`;
  }
}
