import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { StatementImport, StatementLayout, StatementLine } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { bankAccountRefs, day, ids, num, userRefs, voucherRefs } from '../../transactions/infrastructure/banking-refs.js';
import { StatementStore, type BookCandidate, type EngineRule } from '../application/statement-store.js';

type ImportRow = Prisma.BankStatementImportsGetPayload<object>;
type LineRow = Prisma.BankStatementLinesGetPayload<object>;

@Injectable()
export class PrismaStatementStore extends StatementStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, bankAccountId: string | null) {
    const rows = await this.prisma.db().bankStatementImports.findMany({ where: { tenantId, ...(bankAccountId && { bankAccountId }) }, orderBy: { importedAt: 'desc' }, take: 100 });
    return this.mapImports(tenantId, rows);
  }

  async get(tenantId: string, id: string) {
    const db = this.prisma.db();
    const row = await db.bankStatementImports.findFirst({ where: { tenantId, id } });
    if (!row) return null;
    const [imp] = await this.mapImports(tenantId, [row]);
    const lines = await db.bankStatementLines.findMany({ where: { tenantId, statementImportId: id }, orderBy: { lineNo: 'asc' } });
    return { ...imp!, lines: await this.mapLines(tenantId, lines) };
  }

  async line(tenantId: string, id: string) {
    const row = await this.prisma.db().bankStatementLines.findFirst({ where: { tenantId, id } });
    if (!row) return null;
    const [l] = await this.mapLines(tenantId, [row]);
    return { ...l!, statementImportId: row.statementImportId, bankAccountId: row.bankAccountId };
  }

  private async mapImports(tenantId: string, rows: ImportRow[]): Promise<StatementImport[]> {
    const db = this.prisma.db();
    const [banks, users] = await Promise.all([bankAccountRefs(db, tenantId, rows.map((r) => r.bankAccountId)), userRefs(db, tenantId, rows.map((r) => r.importedByUserId))]);
    return rows.map((r) => {
      const b = banks.get(r.bankAccountId);
      return {
        id: r.id, bankAccount: { id: r.bankAccountId, title: b?.title ?? '?', last4: b?.last4 ?? null }, fileName: r.fileName, format: r.format,
        periodFrom: day(r.periodFrom)!, periodTo: day(r.periodTo)!, openingBalance: r.openingBalance ? num(r.openingBalance) : null,
        closingBalance: r.closingBalance ? num(r.closingBalance) : null, lineCount: r.lineCount, duplicateCount: r.duplicateCount, matchedCount: r.matchedCount,
        status: r.status, importedAt: r.importedAt.toISOString(), importedBy: users.get(r.importedByUserId ?? '') ?? null, rowVersion: r.rowVersion,
      };
    });
  }

  private async mapLines(tenantId: string, rows: LineRow[]): Promise<StatementLine[]> {
    const db = this.prisma.db();
    const [accounts, ccs, rules, vouchers] = await Promise.all([
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.categoryAccountId)) } }, select: { id: true, code: true, name: true } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.costCentreId)) } }, select: { id: true, code: true, name: true } }),
      db.bankRules.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.bankRuleId)) } }, select: { id: true, code: true, name: true } }),
      voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId)),
    ]);
    // a categorised line whose voucher waits for approval
    const pending = await db.vouchers.findMany({
      where: { tenantId, sourceDocType: 'BK', sourceDocId: { in: ids(rows.filter((r) => !r.journalEntryId).map((r) => r.bankTransactionId)) }, status: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
      select: { id: true, docNo: true, voucherType: true, status: true, sourceDocId: true },
    });
    return rows.map((r) => {
      const p = pending.find((x) => x.sourceDocId === r.bankTransactionId);
      return {
        id: r.id, lineNo: r.lineNo, txnDate: day(r.txnDate)!, valueDate: day(r.valueDate), description: r.description, reference: r.reference, amount: num(r.amount),
        direction: r.direction ?? (num(r.amount) > 0 ? 'IN' : 'OUT'), runningBalance: r.runningBalance ? num(r.runningBalance) : null, channel: r.channel, status: r.status,
        categoryAccount: accounts.find((a) => a.id === r.categoryAccountId) ?? null, costCentre: ccs.find((c) => c.id === r.costCentreId) ?? null,
        bankRule: rules.find((x) => x.id === r.bankRuleId) ?? null, bankTransactionId: r.bankTransactionId,
        voucher: r.journalEntryId ? (vouchers.get(r.journalEntryId) ?? null) : p ? { id: p.id, docNo: p.docNo, voucherType: p.voucherType, status: p.status } : null,
        rowVersion: r.rowVersion,
      };
    });
  }

  async existingHashes(tenantId: string, bankAccountId: string, hashes: string[]) {
    const rows = await this.prisma.db().bankStatementLines.findMany({ where: { tenantId, bankAccountId, dedupeHash: { in: hashes } }, select: { dedupeHash: true } });
    return new Set(rows.map((r) => r.dedupeHash));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'bankStatementImportAddUpdate', data);
  }

  async unmatchedBook(tenantId: string, bankAccountId: string, from: string, to: string): Promise<BookCandidate[]> {
    const rows = await this.prisma.db().bankTransactions.findMany({
      where: { tenantId, bankAccountId, statementLineId: null, journalEntryId: { not: null }, status: { in: ['UNCLEARED', 'UNPRESENTED', 'PENDING'] }, txnDate: { gte: new Date(from), lte: new Date(to) } },
      select: { id: true, txnDate: true, depositAmount: true, withdrawalAmount: true, reference: true },
    });
    return rows.map((r) => ({ id: r.id, txnDate: day(r.txnDate)!, amount: num(r.depositAmount) - num(r.withdrawalAmount), reference: r.reference }));
  }

  async link(tenantId: string, pairs: { lineId: string; txnId: string; confidence: number }[]) {
    const db = this.prisma.db();
    for (const p of pairs) {
      const line = await db.bankStatementLines.findFirst({ where: { tenantId, id: p.lineId }, select: { txnDate: true } });
      await db.bankStatementLines.updateMany({ where: { tenantId, id: p.lineId }, data: { status: 'MATCHED', bankTransactionId: p.txnId, matchConfidence: p.confidence, matchReason: 'Amount and date match a posted voucher' } });
      await db.bankTransactions.updateMany({ where: { tenantId, id: p.txnId }, data: { statementLineId: p.lineId, status: 'CLEARED', clearedOn: line?.txnDate ?? null } });
    }
  }

  async createUncategorised(tenantId: string, importId: string, lineId?: string) {
    const db = this.prisma.db();
    const n = await db.$executeRaw`
      WITH ins AS (
        INSERT INTO "BankCash"."BankTransactions" ("tenantId", "bankAccountId", "txnDate", "valueDate", description, reference, "paymentMode",
                                                  "depositAmount", "withdrawalAmount", source, status, "statementLineId", "statementRef")
        SELECT s."tenantId", s."bankAccountId", s."txnDate", s."valueDate", s.description, s.reference,
               CASE s.channel WHEN 'RAAST' THEN 'RAAST' WHEN 'IBFT' THEN 'IBFT' WHEN 'CHEQUE' THEN 'CHEQUE' WHEN 'CASH' THEN 'CASH' WHEN 'CARD' THEN 'CARD' END,
               GREATEST(s.amount, 0), GREATEST(-s.amount, 0), 'STATEMENT_IMPORT', 'UNCATEGORISED', s.id, i."fileName"
          FROM "BankCash"."BankStatementLines" s
          JOIN "BankCash"."BankStatementImports" i ON i."tenantId" = s."tenantId" AND i.id = s."statementImportId"
         WHERE s."tenantId" = ${tenantId}::uuid AND s."statementImportId" = ${importId}::uuid AND s."bankTransactionId" IS NULL
           AND s.status = 'UNMATCHED' AND (${lineId ?? null}::uuid IS NULL OR s.id = ${lineId ?? null}::uuid)
        RETURNING id, "statementLineId")
      UPDATE "BankCash"."BankStatementLines" s SET "bankTransactionId" = ins.id FROM ins WHERE s.id = ins."statementLineId"`;
    return n;
  }

  async saveLayout(tenantId: string, bankAccountId: string, layout: StatementLayout) {
    await this.prisma.db().bankAccounts.updateMany({ where: { tenantId, id: bankAccountId }, data: { statementLayout: layout as Prisma.InputJsonValue } });
  }

  async rules(tenantId: string, bankAccountId: string): Promise<EngineRule[]> {
    const db = this.prisma.db();
    const rules = await db.bankRules.findMany({ where: { tenantId, deletedAt: null, isEnabled: true, OR: [{ bankAccountId: null }, { bankAccountId }] }, orderBy: [{ priority: 'asc' }, { code: 'asc' }] });
    const conds = await db.bankRuleConditions.findMany({ where: { tenantId, bankRuleId: { in: rules.map((r) => r.id) } }, orderBy: { seq: 'asc' } });
    return rules.map((r) => ({ id: r.id, code: r.code, name: r.name, matchMode: r.matchMode, accountId: r.accountId, costCentreId: r.costCentreId, autoPost: r.autoPost, conditions: conds.filter((c) => c.bankRuleId === r.id) }));
  }

  async suggest(tenantId: string, lineId: string, data: { categoryAccountId: string; costCentreId: string | null; bankRuleId: string }) {
    await this.prisma.db().bankStatementLines.updateMany({ where: { tenantId, id: lineId }, data });
  }

  async ruleHits(tenantId: string, hits: Map<string, number>) {
    const db = this.prisma.db();
    for (const [id, n] of hits) await db.bankRules.updateMany({ where: { tenantId, id }, data: { hitCount: { increment: n }, lastHitAt: new Date() } });
  }

  async ignore(tenantId: string, lineId: string) {
    const db = this.prisma.db();
    const line = await db.bankStatementLines.findFirst({ where: { tenantId, id: lineId }, select: { bankTransactionId: true } });
    await db.bankStatementLines.updateMany({ where: { tenantId, id: lineId }, data: { status: 'IGNORED', bankTransactionId: null } });
    if (line?.bankTransactionId) await db.bankTransactions.deleteMany({ where: { tenantId, id: line.bankTransactionId, status: 'UNCATEGORISED' } });
  }

  async restore(tenantId: string, lineId: string) {
    const db = this.prisma.db();
    const line = await db.bankStatementLines.findFirst({ where: { tenantId, id: lineId }, select: { statementImportId: true } });
    await db.bankStatementLines.updateMany({ where: { tenantId, id: lineId }, data: { status: 'UNMATCHED' } });
    await this.createUncategorised(tenantId, line!.statementImportId, lineId);
  }

  async updateCounts(tenantId: string, importId: string) {
    const db = this.prisma.db();
    const [total, matched] = await Promise.all([
      db.bankStatementLines.count({ where: { tenantId, statementImportId: importId } }),
      db.bankStatementLines.count({ where: { tenantId, statementImportId: importId, status: { in: ['MATCHED', 'CATEGORISED'] } } }),
    ]);
    await db.bankStatementImports.updateMany({ where: { tenantId, id: importId }, data: { lineCount: total, matchedCount: matched, status: matched === total && total > 0 ? 'MATCHED' : 'PARSED' } });
  }

  async deleteImport(tenantId: string, importId: string) {
    const db = this.prisma.db();
    const lines = await db.bankStatementLines.findMany({ where: { tenantId, statementImportId: importId }, select: { id: true, bankTransactionId: true } });
    await db.bankStatementLines.updateMany({ where: { tenantId, statementImportId: importId }, data: { bankTransactionId: null } });
    await db.bankTransactions.deleteMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.bankTransactionId)) }, status: 'UNCATEGORISED' } });
    await db.bankStatementLines.deleteMany({ where: { tenantId, statementImportId: importId } });
    await db.bankStatementImports.deleteMany({ where: { tenantId, id: importId } });
  }
}
