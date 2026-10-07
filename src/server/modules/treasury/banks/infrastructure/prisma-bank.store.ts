import { Injectable } from '@nestjs/common';
import type { Bank, BankAccount, ChequeBook } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { glBalances, isReferenced } from '../../../../infrastructure/prisma/references.js';
import { BankStore } from '../application/bank-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaBankStore extends BankStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // ------------------------------------------------------------ Banks
  async banks(tenantId: string): Promise<Bank[]> {
    const db = this.prisma.db();
    const [rows, counts] = await Promise.all([
      db.banks.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: 'asc' } }),
      db.bankAccounts.groupBy({ by: ['bankId'], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
    ]);
    return rows.map((b) => ({
      id: b.id, code: b.code, name: b.name, shortName: b.shortName, swiftBic: b.swiftBic, ibanBankCode: b.ibanBankCode?.trim() ?? null,
      isIslamic: b.isIslamic, isActive: b.isActive, accountCount: counts.find((c) => c.bankId === b.id)?._count._all ?? 0, rowVersion: b.rowVersion,
    }));
  }

  async retiredBankCodes(tenantId: string) {
    return (await this.prisma.db().banks.findMany({ where: { tenantId, deletedAt: { not: null } }, select: { code: true } })).map((r) => r.code);
  }

  saveBank(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'bankAddUpdate', data);
  }

  bankInUse(id: string) {
    return isReferenced(this.prisma, 'banks', id);
  }

  async deleteBank(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().banks.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this bank. Reload and try again.');
  }

  // ------------------------------------------------------------ Bank accounts
  async accounts(tenantId: string): Promise<BankAccount[]> {
    const db = this.prisma.db();
    const rows = await db.bankAccounts.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: 'asc' }] });
    if (!rows.length) return [];
    const [banks, branches, gl, books, balances] = await Promise.all([
      db.banks.findMany({ where: { tenantId, id: { in: rows.map((r) => r.bankId) } }, select: { id: true, code: true, name: true, shortName: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: rows.map((r) => r.branchId) } }, select: { id: true, name: true } }),
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: rows.map((r) => r.accountId) } }, select: { id: true, code: true, name: true } }),
      this.books(tenantId),
      glBalances(this.prisma, tenantId, rows.map((r) => r.accountId)),
    ]);
    return rows.map((a) => {
      const own = books.filter((b) => b.bankAccountId === a.id);
      return {
        id: a.id,
        bank: banks.find((b) => b.id === a.bankId)!,
        branch: branches.find((b) => b.id === a.branchId)!,
        accountType: a.accountType, accountTitle: a.accountTitle, accountNo: a.accountNo, accountLast4: a.accountLast4, iban: a.iban, bankBranch: a.bankBranch,
        account: gl.find((g) => g.id === a.accountId)!,
        currencyCode: a.currencyCode.trim(), creditLimit: a.creditLimit?.toNumber() ?? null, markupTerms: a.markupTerms, purpose: a.purpose,
        statementImportEnabled: a.statementImportEnabled, statementFormat: a.statementFormat, useForPayroll: a.useForPayroll,
        reconciledTo: day(a.reconciledTo), status: a.status, closedOn: day(a.closedOn),
        balance: balances.get(a.accountId) ?? 0,
        activeBook: own.find((b) => b.status === 'ACTIVE') ?? null, bookCount: own.length, rowVersion: a.rowVersion,
      };
    });
  }

  saveAccount(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'bankAccountAddUpdate', data);
  }

  accountInUse(id: string) {
    return isReferenced(this.prisma, 'bankAccounts', id);
  }

  async deleteAccount(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().bankAccounts.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this bank account. Reload and try again.');
  }

  async activeBranch(tenantId: string, id: string) {
    return (await this.prisma.db().branches.count({ where: { tenantId, id, status: 'ACTIVE', deletedAt: null } })) === 1;
  }

  async activeCurrency(code: string) {
    return (await this.prisma.db().currencies.count({ where: { code, isActive: true } })) === 1;
  }

  // ------------------------------------------------------------ Cheque books
  async books(tenantId: string, bankAccountId?: string): Promise<ChequeBook[]> {
    const rows = await this.prisma.db().chequeBooks.findMany({ where: { tenantId, ...(bankAccountId && { bankAccountId }) }, orderBy: { firstLeafNo: 'asc' } });
    return rows.map((b) => ({
      id: b.id, bankAccountId: b.bankAccountId, bookRef: b.bookRef, firstLeafNo: Number(b.firstLeafNo), lastLeafNo: Number(b.lastLeafNo),
      nextLeafNo: Number(b.nextLeafNo), leafDigits: b.leafDigits, leaves: b.leaves ?? Number(b.lastLeafNo - b.firstLeafNo) + 1,
      used: Number(b.nextLeafNo - b.firstLeafNo), crossedAcPayee: b.crossedAcPayee, receivedOn: day(b.receivedOn), status: b.status, remarks: b.remarks,
      rowVersion: b.rowVersion,
    }));
  }

  saveBook(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'chequeBookAddUpdate', data);
  }

  bookInUse(id: string) {
    return isReferenced(this.prisma, 'chequeBooks', id);
  }

  async deleteBook(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().chequeBooks.deleteMany({ where: { tenantId, id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this cheque book. Reload and try again.');
  }
}
