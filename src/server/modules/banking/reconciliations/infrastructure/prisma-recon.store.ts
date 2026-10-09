import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ReconMatch, Reconciliation } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { bankAccountRefs, day, ids, num, userRefs, voucherRefs } from '../../transactions/infrastructure/banking-refs.js';
import { ReconStore } from '../application/recon-store.js';

type Row = Prisma.BankReconciliationsGetPayload<object>;

@Injectable()
export class PrismaReconStore extends ReconStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, bankAccountId: string | null) {
    const rows = await this.prisma.db().bankReconciliations.findMany({ where: { tenantId, ...(bankAccountId && { bankAccountId }) }, orderBy: { periodTo: 'desc' }, take: 60 });
    return this.map(tenantId, rows);
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().bankReconciliations.findFirst({ where: { tenantId, id } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async openFor(tenantId: string, bankAccountId: string) {
    const row = await this.prisma.db().bankReconciliations.findFirst({ where: { tenantId, bankAccountId, status: { in: ['IN_PROGRESS', 'REOPENED'] } } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async closedFor(tenantId: string, bankAccountId: string) {
    const rows = await this.prisma.db().bankReconciliations.findMany({ where: { tenantId, bankAccountId, status: 'CLOSED' }, orderBy: { periodTo: 'desc' } });
    return this.map(tenantId, rows);
  }

  async firstActivity(tenantId: string, bankAccountId: string) {
    const t = await this.prisma.db().bankTransactions.findFirst({ where: { tenantId, bankAccountId }, orderBy: { txnDate: 'asc' }, select: { txnDate: true } });
    return day(t?.txnDate);
  }

  private async map(tenantId: string, rows: Row[]): Promise<Reconciliation[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [banks, users] = await Promise.all([
      bankAccountRefs(db, tenantId, rows.map((r) => r.bankAccountId)),
      userRefs(db, tenantId, [...rows.map((r) => r.closedByUserId), ...rows.map((r) => r.createdBy)]),
    ]);
    const gl = await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids([...banks.values()].map((b) => b.accountId)) } }, select: { id: true, code: true } });
    return rows.map((r) => {
      const b = banks.get(r.bankAccountId);
      return {
        id: r.id, docNo: r.docNo, bankAccount: { id: r.bankAccountId, title: b?.title ?? '?', last4: b?.last4 ?? null, glCode: gl.find((g) => g.id === b?.accountId)?.code ?? null },
        periodFrom: day(r.periodFrom)!, periodTo: day(r.periodTo)!, statementImportId: r.statementImportId,
        statementBalance: num(r.statementBalance), unpresentedCheques: num(r.unpresentedCheques), depositsInTransit: num(r.depositsInTransit),
        adjustedBankBalance: num(r.adjustedBankBalance), bookBalance: num(r.bookBalance), unbookedCredits: num(r.unbookedCredits), unbookedDebits: num(r.unbookedDebits),
        adjustedBookBalance: num(r.adjustedBookBalance), difference: num(r.difference), status: r.status,
        closedBy: users.get(r.closedByUserId ?? '') ?? null, closedAt: r.closedAt?.toISOString() ?? null, remarks: r.remarks,
        createdBy: users.get(r.createdBy ?? '') ?? null, rowVersion: r.rowVersion,
      };
    });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'bankReconciliationAddUpdate', data);
  }

  async bookBalance(tenantId: string, bankAccountId: string, on: string) {
    const r = await this.prisma.db().$queryRaw<{ b: number | string | null }[]>`
      SELECT COALESCE(sum(l.debit - l.credit), 0)::text AS b
        FROM "BankCash"."BankAccounts" ba
        JOIN "Accounting"."VoucherLines" l ON l."tenantId" = ba."tenantId" AND l."accountId" = ba."accountId"
        JOIN "Accounting"."Vouchers" v ON v."tenantId" = l."tenantId" AND v.id = l."journalEntryId"
       WHERE ba."tenantId" = ${tenantId}::uuid AND ba.id = ${bankAccountId}::uuid AND v.status IN ('POSTED', 'REVERSED') AND v."postingDate" <= ${on}::date`;
    return Number(r[0]?.b ?? 0);
  }

  /** Statement lines up to the period end not ignored and not reconciled in an earlier closed reconciliation. */
  async statementRows(tenantId: string, bankAccountId: string, periodTo: string, reconId: string) {
    const db = this.prisma.db();
    const done = await db.bankReconciliationMatches.findMany({ where: { tenantId, status: 'MATCHED', reconciliationId: { not: reconId }, statementLineId: { not: null } }, select: { statementLineId: true, reconciliationId: true } });
    const closed = new Set((await db.bankReconciliations.findMany({ where: { tenantId, bankAccountId, status: 'CLOSED', id: { in: ids(done.map((d) => d.reconciliationId)) } }, select: { id: true } })).map((c) => c.id));
    const skip = new Set(done.filter((d) => closed.has(d.reconciliationId)).map((d) => d.statementLineId!));
    const rows = await db.bankStatementLines.findMany({ where: { tenantId, bankAccountId, status: { not: 'IGNORED' }, txnDate: { lte: new Date(periodTo) } }, orderBy: [{ txnDate: 'asc' }, { lineNo: 'asc' }] });
    const txns = await db.bankTransactions.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.bankTransactionId)) } }, select: { id: true, journalEntryId: true } });
    return rows.filter((r) => !skip.has(r.id)).map((r) => ({
      id: r.id, txnDate: day(r.txnDate)!, description: r.description, reference: r.reference, amount: num(r.amount), status: r.status, matchId: null, suggestedTxnId: null,
      bankTransactionId: r.bankTransactionId, txnHasVoucher: !!txns.find((t) => t.id === r.bankTransactionId)?.journalEntryId,
    }));
  }

  /** Booked entries (from posted vouchers) up to the period end, not reconciled elsewhere. */
  async bookRows(tenantId: string, bankAccountId: string, periodTo: string, reconId: string) {
    const db = this.prisma.db();
    const rows = await db.bankTransactions.findMany({
      where: { tenantId, bankAccountId, journalEntryId: { not: null }, txnDate: { lte: new Date(periodTo) }, OR: [{ reconciliationId: null }, { reconciliationId: reconId }] },
      orderBy: [{ txnDate: 'asc' }, { createdAt: 'asc' }],
    });
    const vouchers = await voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId));
    return rows.map((r) => ({
      id: r.id, txnDate: day(r.txnDate)!, description: r.description, reference: r.reference, amount: num(r.depositAmount) - num(r.withdrawalAmount),
      voucher: vouchers.get(r.journalEntryId!) ?? null, status: r.status, matchId: null, statementLineId: r.statementLineId,
    }));
  }

  async matches(tenantId: string, reconId: string): Promise<ReconMatch[]> {
    const db = this.prisma.db();
    const rows = await db.bankReconciliationMatches.findMany({ where: { tenantId, reconciliationId: reconId }, orderBy: { createdAt: 'asc' } });
    const users = await userRefs(db, tenantId, rows.map((r) => r.matchedByUserId));
    return rows.map((r) => ({
      id: r.id, statementLineId: r.statementLineId, bankTransactionId: r.bankTransactionId, statementAmount: r.statementAmount ? num(r.statementAmount) : null,
      bookAmount: r.bookAmount ? num(r.bookAmount) : null, status: r.status, matchMethod: r.matchMethod, confidence: r.confidence ? num(r.confidence) : null,
      matchedBy: users.get(r.matchedByUserId ?? '') ?? null, matchedAt: r.matchedAt?.toISOString() ?? null,
    }));
  }

  async addMatch(tenantId: string, d: { reconciliationId: string; statementLineId: string; bankTransactionId: string; statementAmount: number; bookAmount: number; matchMethod: string; confidence: number | null; userId: string }) {
    await this.prisma.db().bankReconciliationMatches.create({
      data: { tenantId, reconciliationId: d.reconciliationId, statementLineId: d.statementLineId, bankTransactionId: d.bankTransactionId, statementAmount: d.statementAmount, bookAmount: d.bookAmount, status: 'MATCHED', matchMethod: d.matchMethod, confidence: d.confidence, matchedByUserId: d.userId, matchedAt: new Date() },
    });
  }

  async removeMatch(tenantId: string, matchId: string) {
    const db = this.prisma.db();
    const m = await db.bankReconciliationMatches.findFirst({ where: { tenantId, id: matchId }, select: { statementLineId: true, bankTransactionId: true } });
    if (m) await db.bankReconciliationMatches.deleteMany({ where: { tenantId, id: matchId } });
    return m;
  }

  async linkLine(tenantId: string, lineId: string, txnId: string) {
    const db = this.prisma.db();
    const line = await db.bankStatementLines.findFirst({ where: { tenantId, id: lineId }, select: { bankTransactionId: true, txnDate: true } });
    const standIn = line?.bankTransactionId && line.bankTransactionId !== txnId ? line.bankTransactionId : null;
    await db.bankStatementLines.updateMany({ where: { tenantId, id: lineId }, data: { status: 'MATCHED', bankTransactionId: txnId, matchReason: 'Matched in reconciliation' } });
    if (standIn) await db.bankTransactions.deleteMany({ where: { tenantId, id: standIn, status: 'UNCATEGORISED' } });
    await db.bankTransactions.updateMany({ where: { tenantId, id: txnId }, data: { statementLineId: lineId, status: 'CLEARED', clearedOn: line?.txnDate ?? null } });
  }

  async unlinkLine(tenantId: string, lineId: string, txnId: string) {
    const db = this.prisma.db();
    const t = await db.bankTransactions.findFirst({ where: { tenantId, id: txnId }, select: { withdrawalAmount: true } });
    await db.bankTransactions.updateMany({ where: { tenantId, id: txnId }, data: { statementLineId: null, status: num(t?.withdrawalAmount) > 0 ? 'UNPRESENTED' : 'UNCLEARED', clearedOn: null } });
    const line = await db.bankStatementLines.findFirst({ where: { tenantId, id: lineId }, select: { statementImportId: true } });
    await db.bankStatementLines.updateMany({ where: { tenantId, id: lineId }, data: { status: 'UNMATCHED', bankTransactionId: null, matchConfidence: null, matchReason: null } });
    await db.$executeRaw`
      WITH ins AS (
        INSERT INTO "BankCash"."BankTransactions" ("tenantId", "bankAccountId", "txnDate", "valueDate", description, reference, "depositAmount", "withdrawalAmount", source, status, "statementLineId")
        SELECT s."tenantId", s."bankAccountId", s."txnDate", s."valueDate", s.description, s.reference, GREATEST(s.amount, 0), GREATEST(-s.amount, 0), 'STATEMENT_IMPORT', 'UNCATEGORISED', s.id
          FROM "BankCash"."BankStatementLines" s WHERE s."tenantId" = ${tenantId}::uuid AND s.id = ${lineId}::uuid
        RETURNING id, "statementLineId")
      UPDATE "BankCash"."BankStatementLines" s SET "bankTransactionId" = ins.id FROM ins WHERE s.id = ins."statementLineId"`;
    void line;
  }

  /** Locks the month: matched entries become reconciled; open items are kept as unpresented / unmatched rows. */
  async close(tenantId: string, reconId: string, userId: string) {
    const db = this.prisma.db();
    const r = (await db.bankReconciliations.findFirst({ where: { tenantId, id: reconId } }))!;
    const ms = await db.bankReconciliationMatches.findMany({ where: { tenantId, reconciliationId: reconId, status: 'MATCHED' } });
    await db.bankTransactions.updateMany({ where: { tenantId, id: { in: ids(ms.map((m) => m.bankTransactionId)) } }, data: { status: 'RECONCILED', reconciledOn: r.periodTo, reconciliationId: reconId } });
    await db.bankStatementLines.updateMany({ where: { tenantId, id: { in: ids(ms.map((m) => m.statementLineId)) } }, data: { status: 'MATCHED' } });
    const book = await this.bookRows(tenantId, r.bankAccountId, day(r.periodTo)!, reconId);
    const stmt = await this.statementRows(tenantId, r.bankAccountId, day(r.periodTo)!, reconId);
    const mb = new Set(ms.map((m) => m.bankTransactionId)), mst = new Set(ms.map((m) => m.statementLineId));
    const open = [
      ...book.filter((b) => !mb.has(b.id)).map((b) => ({ tenantId, reconciliationId: reconId, bankTransactionId: b.id, bookAmount: b.amount, status: 'UNPRESENTED' })),
      ...stmt.filter((s) => !mst.has(s.id)).map((s) => ({ tenantId, reconciliationId: reconId, statementLineId: s.id, statementAmount: s.amount, status: 'UNMATCHED' })),
    ];
    if (open.length) await db.bankReconciliationMatches.createMany({ data: open });
    void userId;
  }

  async setReconciledTo(tenantId: string, bankAccountId: string, previous: Reconciliation | null) {
    await this.prisma.db().bankAccounts.updateMany({
      where: { tenantId, id: bankAccountId },
      data: { reconciledTo: previous ? new Date(previous.periodTo) : null, lastStatementBalance: previous?.statementBalance ?? null, lastStatementDate: previous ? new Date(previous.periodTo) : null },
    });
  }

  async setStatus(tenantId: string, reconId: string, status: 'CLOSED' | 'REOPENED', userId: string | null) {
    await this.prisma.db().bankReconciliations.updateMany({
      where: { tenantId, id: reconId },
      data: status === 'CLOSED' ? { status, closedByUserId: userId, closedAt: new Date() } : { status, closedByUserId: null, closedAt: null },
    });
  }

  async reopen(tenantId: string, reconId: string) {
    const db = this.prisma.db();
    await db.bankReconciliationMatches.deleteMany({ where: { tenantId, reconciliationId: reconId, status: { in: ['UNPRESENTED', 'UNMATCHED'] } } });
    await db.bankTransactions.updateMany({ where: { tenantId, reconciliationId: reconId }, data: { status: 'CLEARED', reconciledOn: null, reconciliationId: null } });
  }
}
