import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { chequeActions, type Cheque, type ChequeBatch, type ChequeList, type ChequeQuery } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { bankAccountRefs, day, ids, num, userRefs, voucherRefs } from '../../transactions/infrastructure/banking-refs.js';
import { ChequeStore } from '../application/cheque-store.js';

type Row = Prisma.ChequesGetPayload<object>;
type BatchRow = Prisma.ChequeBatchesGetPayload<object>;
const OPEN_RECEIVED = ['IN_HAND', 'DEPOSITED'];
const OPEN_ISSUED = ['ISSUED', 'PRESENTED'];
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

@Injectable()
export class PrismaChequeStore extends ChequeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, q: ChequeQuery, today: string, fyStart: string): Promise<ChequeList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const t = new Date(today);
    const where: Prisma.ChequesWhereInput = {
      tenantId,
      ...(q.direction && { direction: q.direction }),
      ...(q.status && { status: q.status }),
      ...(q.pdc && { isPdc: true }),
      ...(q.maturing === '30' && { chequeDate: { gte: t, lte: new Date(addDays(today, 30)) }, status: { in: [...OPEN_RECEIVED, ...OPEN_ISSUED] } }),
      ...(q.maturing === 'overdue' && { chequeDate: { lt: t }, status: { in: ['IN_HAND', 'ISSUED'] } }),
      ...(s && { OR: [{ chequeNo: { contains: s } }, { partyName: { contains: s, mode: 'insensitive' } }, { docNo: { contains: s, mode: 'insensitive' } }, { legacyNo: { contains: s, mode: 'insensitive' } }] }),
    };
    const sum = (w: Prisma.ChequesWhereInput) => db.cheques.aggregate({ where: { tenantId, ...w }, _sum: { amount: true }, _count: { _all: true } });
    const [rows, total, inHand, dep, iss, pdcR, pdcP, today0, bounced, byStatus, cal] = await Promise.all([
      db.cheques.findMany({ where, orderBy: [{ chequeDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.cheques.count({ where }),
      sum({ direction: 'RECEIVED', status: 'IN_HAND' }),
      sum({ direction: 'RECEIVED', status: 'DEPOSITED' }),
      sum({ direction: 'ISSUED', status: { in: OPEN_ISSUED } }),
      sum({ direction: 'RECEIVED', status: 'IN_HAND', chequeDate: { gt: t } }),
      sum({ direction: 'ISSUED', status: { in: OPEN_ISSUED }, chequeDate: { gt: t } }),
      sum({ chequeDate: t, status: { in: ['IN_HAND', 'ISSUED'] } }),
      db.chequeBounces.findMany({ where: { tenantId, bounceDate: { gte: new Date(fyStart) } }, select: { chequeId: true } }),
      db.cheques.groupBy({ by: ['status'], where: { tenantId, ...(q.direction && { direction: q.direction }) }, _count: { _all: true } }),
      db.cheques.findMany({ where: { tenantId, chequeDate: { gte: t, lte: new Date(addDays(today, 9)) }, OR: [{ direction: 'RECEIVED', status: 'IN_HAND' }, { direction: 'ISSUED', status: { in: OPEN_ISSUED } }] }, select: { chequeDate: true, direction: true, amount: true } }),
    ]);
    const bouncedAmt = await db.cheques.aggregate({ where: { tenantId, id: { in: ids(bounced.map((b) => b.chequeId)) } }, _sum: { amount: true } });
    return {
      items: await this.map(tenantId, rows), total,
      kpis: {
        inHand: num(inHand._sum.amount), inHandCount: inHand._count._all, deposited: num(dep._sum.amount), depositedCount: dep._count._all,
        issuedUnpresented: num(iss._sum.amount), issuedCount: iss._count._all, bounced: num(bouncedAmt._sum.amount), bouncedCount: new Set(bounced.map((b) => b.chequeId)).size,
        pdcReceivable: num(pdcR._sum.amount), pdcPayable: num(pdcP._sum.amount), maturingToday: num(today0._sum.amount),
      },
      calendar: Array.from({ length: 10 }, (_, i) => {
        const d = addDays(today, i);
        const on = cal.filter((c) => day(c.chequeDate) === d);
        return { date: d, receivable: on.filter((c) => c.direction === 'RECEIVED').reduce((s2, c) => s2 + num(c.amount), 0), payable: on.filter((c) => c.direction === 'ISSUED').reduce((s2, c) => s2 + num(c.amount), 0) };
      }),
      statusCounts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
    };
  }

  async get(tenantId: string, id: string) {
    const db = this.prisma.db();
    const row = await db.cheques.findFirst({ where: { tenantId, id } });
    if (!row) return null;
    const [c] = await this.map(tenantId, [row]);
    const bounces = await db.chequeBounces.findMany({ where: { tenantId, chequeId: id }, orderBy: { createdAt: 'asc' } });
    const vs = await voucherRefs(db, tenantId, bounces.flatMap((b) => [b.reversalJournalEntryId, b.chargesJournalEntryId]));
    return {
      ...c!,
      bounces: bounces.map((b) => ({
        id: b.id, bounceDate: day(b.bounceDate)!, reason: b.reason, bankCharges: num(b.bankCharges), recoverCharges: b.recoverCharges, creditHold: b.creditHold,
        resolution: b.resolution, resolvedOn: day(b.resolvedOn), reversalVoucher: vs.get(b.reversalJournalEntryId ?? '') ?? null, chargesVoucher: vs.get(b.chargesJournalEntryId ?? '') ?? null, remarks: b.remarks,
      })),
    };
  }

  private async map(tenantId: string, rows: Row[]): Promise<Cheque[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [banks, vouchers, users, customers, vendors, accounts, branches, drawnOn, links] = await Promise.all([
      bankAccountRefs(db, tenantId, rows.map((r) => r.bankAccountId)),
      voucherRefs(db, tenantId, rows.flatMap((r) => [r.journalEntryId, r.clearingJournalEntryId])),
      userRefs(db, tenantId, rows.map((r) => r.createdBy)),
      db.customers.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.customerId)) } }, select: { id: true, code: true, name: true } }),
      db.vendors.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.vendorId)) } }, select: { id: true, code: true, name: true } }),
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.accountId)) } }, select: { id: true, code: true, name: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.branchId)) } }, select: { id: true, code: true, name: true } }),
      db.banks.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.drawnOnBankId)) } }, select: { id: true, name: true } }),
      db.cheques.findMany({ where: { tenantId, OR: [{ id: { in: ids(rows.map((r) => r.replacedByChequeId)) } }, { replacedByChequeId: { in: rows.map((r) => r.id) } }] }, select: { id: true, docNo: true, replacedByChequeId: true } }),
    ]);
    return rows.map((r) => {
      const b = r.bankAccountId ? banks.get(r.bankAccountId) : null;
      const replaced = links.find((l) => l.id === r.replacedByChequeId);
      const replaces = links.find((l) => l.replacedByChequeId === r.id);
      return {
        id: r.id, docNo: r.docNo, legacyNo: r.legacyNo, docDate: day(r.docDate)!, branch: branches.find((x) => x.id === r.branchId) ?? { id: r.branchId, code: '?', name: '?' },
        direction: r.direction, chequeNo: r.chequeNo, customer: customers.find((x) => x.id === r.customerId) ?? null, vendor: vendors.find((x) => x.id === r.vendorId) ?? null,
        account: accounts.find((x) => x.id === r.accountId) ?? null, partyName: r.partyName, drawnOnBank: drawnOn.find((x) => x.id === r.drawnOnBankId) ?? null,
        bankAccount: b ? { id: b.id, title: b.title, last4: b.last4 } : null, chequeDate: day(r.chequeDate)!, dueDate: day(r.dueDate), receivedOn: day(r.receivedOn),
        amount: num(r.amount), isPdc: r.isPdc, postingMode: r.postingMode, status: r.status, depositedOn: day(r.depositedOn), presentedOn: day(r.presentedOn),
        clearedOn: day(r.clearedOn), bouncedOn: day(r.bouncedOn), bounceCount: r.bounceCount, stoppedOn: day(r.stoppedOn),
        replacedBy: replaced ? { id: replaced.id, docNo: replaced.docNo } : null, replaces: replaces ? { id: replaces.id, docNo: replaces.docNo } : null,
        voucher: vouchers.get(r.journalEntryId ?? '') ?? null, clearingVoucher: vouchers.get(r.clearingJournalEntryId ?? '') ?? null,
        remarks: r.remarks, narration: r.narration, chequeBookId: r.chequeBookId, crossedAcPayee: r.crossedAcPayee, createdBy: users.get(r.createdBy ?? '') ?? null,
        rowVersion: r.rowVersion, actions: chequeActions(r.direction, r.status),
      };
    });
  }

  async fiscalYearStart(tenantId: string, today: string) {
    const fy = await this.prisma.db().fiscalYears.findFirst({ where: { tenantId, startDate: { lte: new Date(today) }, endDate: { gte: new Date(today) } }, select: { startDate: true } });
    return day(fy?.startDate) ?? `${today.slice(0, 4)}-01-01`;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'chequeAddUpdate', data);
  }

  async set(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().cheques.updateMany({ where: { tenantId, id }, data });
  }

  async record(id: string, date?: string) {
    await this.prisma.db().$queryRaw`select "BankCash"."chequeRecordEntries"(${id}::uuid, ${date ?? null}::date)::text`;
  }

  async lifecycle(fn: 'chequeDeposit' | 'chequeClear' | 'chequePresent' | 'chequeBounce' | 'chequeCancel', id: string) {
    const db = this.prisma.db();
    if (fn === 'chequeDeposit') await db.$queryRaw`select "BankCash"."chequeDeposit"(${id}::uuid)::text`;
    else if (fn === 'chequeClear') await db.$queryRaw`select "BankCash"."chequeClear"(${id}::uuid)::text`;
    else if (fn === 'chequePresent') await db.$queryRaw`select "BankCash"."chequePresent"(${id}::uuid)::text`;
    else if (fn === 'chequeBounce') await db.$queryRaw`select "BankCash"."chequeBounce"(${id}::uuid)::text`;
    else await db.$queryRaw`select "BankCash"."chequeCancel"(${id}::uuid)::text`;
  }

  async reverseEntries(id: string, date: string, remarks: string) {
    await this.prisma.db().$queryRaw`select "BankCash"."chequeReverseEntries"(${id}::uuid, ${date}::date, ${remarks})::text`;
  }

  async addBounce(tenantId: string, data: Record<string, unknown>) {
    await this.prisma.db().chequeBounces.create({ data: { tenantId, ...(data as Omit<Prisma.ChequeBouncesUncheckedCreateInput, 'tenantId'>) } });
  }

  async resolveBounce(tenantId: string, chequeId: string, resolution: string, on: string, replacementChequeId?: string) {
    await this.prisma.db().chequeBounces.updateMany({ where: { tenantId, chequeId, resolution: 'OPEN' }, data: { resolution, resolvedOn: new Date(on), ...(replacementChequeId && { replacementChequeId }) } });
  }

  async issuedLeafUsed(tenantId: string, bankAccountId: string, chequeNo: string, exceptId: string | null) {
    return (await this.prisma.db().cheques.count({ where: { tenantId, direction: 'ISSUED', bankAccountId, chequeNo, ...(exceptId && { id: { not: exceptId } }) } })) > 0;
  }

  async receivedDuplicate(tenantId: string, drawnOnBankId: string | null, chequeNo: string, customerId: string | null, exceptId: string | null) {
    return (await this.prisma.db().cheques.count({ where: { tenantId, direction: 'RECEIVED', drawnOnBankId, chequeNo, customerId, status: { not: 'CANCELLED' }, ...(exceptId && { id: { not: exceptId } }) } })) > 0;
  }

  async chequeBook(tenantId: string, id: string) {
    const b = await this.prisma.db().chequeBooks.findFirst({ where: { tenantId, id } });
    return b ? { id: b.id, bankAccountId: b.bankAccountId, firstLeafNo: Number(b.firstLeafNo), lastLeafNo: Number(b.lastLeafNo), nextLeafNo: Number(b.nextLeafNo), status: b.status } : null;
  }

  async advanceBook(tenantId: string, id: string, nextLeafNo: number) {
    await this.prisma.db().chequeBooks.updateMany({ where: { tenantId, id }, data: { nextLeafNo } });
  }

  // ---------------------------------------------------------------- batches
  async batches(tenantId: string) {
    const rows = await this.prisma.db().chequeBatches.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return this.mapBatches(tenantId, rows);
  }

  async batch(tenantId: string, id: string): Promise<ChequeBatch | null> {
    const db = this.prisma.db();
    const row = await db.chequeBatches.findFirst({ where: { tenantId, id } });
    if (!row) return null;
    const [b] = await this.mapBatches(tenantId, [row]);
    const lines = await db.chequeBatchLines.findMany({ where: { tenantId, batchId: id }, orderBy: { lineNo: 'asc' } });
    const cheques = await db.cheques.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.chequeId)) } }, select: { id: true, docNo: true } });
    return {
      ...b!,
      lines: lines.map((l) => ({
        id: l.id, lineNo: l.lineNo, partyCode: l.partyCode, partyName: l.partyName, chequeNo: l.chequeNo, chequeDate: day(l.chequeDate)!, dueDate: day(l.dueDate),
        amount: num(l.amount), remarks: l.remarks, legacyNo: l.legacyNo, customerId: l.customerId, vendorId: l.vendorId, validationStatus: l.validationStatus,
        validationErrors: (l.validationErrors as Record<string, string> | null) ?? null, cheque: cheques.find((c) => c.id === l.chequeId) ?? null,
      })),
    };
  }

  private async mapBatches(tenantId: string, rows: BatchRow[]) {
    const db = this.prisma.db();
    const [banks, users, branches] = await Promise.all([
      bankAccountRefs(db, tenantId, rows.map((r) => r.bankAccountId)),
      userRefs(db, tenantId, rows.map((r) => r.preparedByUserId)),
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.branchId)) } }, select: { id: true, code: true, name: true } }),
    ]);
    return rows.map((r) => {
      const b = banks.get(r.bankAccountId);
      return {
        id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, branch: branches.find((x) => x.id === r.branchId) ?? { id: r.branchId, code: '?', name: '?' }, direction: r.direction,
        bankAccount: { id: r.bankAccountId, title: b?.title ?? '?', last4: b?.last4 ?? null }, postingMode: r.postingMode, oldNoRule: r.oldNoRule, remarksPrefix: r.remarksPrefix,
        source: r.source, rowCount: r.rowCount, totalAmount: num(r.totalAmount), status: r.status, generatedAt: r.generatedAt?.toISOString() ?? null,
        preparedBy: users.get(r.preparedByUserId ?? '') ?? null, rowVersion: r.rowVersion,
      };
    });
  }

  saveBatch(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'chequeBatchAddUpdate', data);
  }

  async setBatch(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().chequeBatches.updateMany({ where: { tenantId, id }, data });
  }

  async setBatchLine(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().chequeBatchLines.updateMany({ where: { tenantId, id }, data });
  }

  async cancelBatch(id: string, reason: string | null) {
    await this.prisma.db().$queryRaw`select "BankCash"."chequeBatchCancel"(${id}::uuid, ${reason})::text`;
  }
}
