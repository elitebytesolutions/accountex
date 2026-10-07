import { Injectable } from '@nestjs/common';
import type { CashAccount, CashCategory, ExpenseCategory } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { glBalances, isReferenced } from '../../../../infrastructure/prisma/references.js';
import { CashStore, type CashTable } from '../application/cash-store.js';

@Injectable()
export class PrismaCashStore extends CashStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async glRefs(tenantId: string, ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = wanted.length ? await this.prisma.db().chartOfAccounts.findMany({ where: { tenantId, id: { in: wanted } }, select: { id: true, code: true, name: true } }) : [];
    return (id: string | null) => (id ? (rows.find((r) => r.id === id) ?? null) : null);
  }

  async accounts(tenantId: string): Promise<CashAccount[]> {
    const db = this.prisma.db();
    const rows = await db.cashAccounts.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } });
    if (!rows.length) return [];
    const [gl, branches, users, balances] = await Promise.all([
      this.glRefs(tenantId, rows.map((r) => r.accountId)),
      db.branches.findMany({ where: { tenantId, id: { in: rows.map((r) => r.branchId) } }, select: { id: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: rows.map((r) => r.custodianUserId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } }),
      glBalances(this.prisma, tenantId, rows.map((r) => r.accountId)),
    ]);
    return rows.map((a) => {
      const u = users.find((x) => x.id === a.custodianUserId);
      return {
        id: a.id, code: a.code, name: a.name, shortName: a.shortName, kind: a.kind,
        branch: branches.find((b) => b.id === a.branchId)!, custodian: u ? { id: u.id, name: u.fullName } : null,
        account: gl(a.accountId)!, imprestAmount: a.imprestAmount?.toNumber() ?? null, varianceTolerance: a.varianceTolerance.toNumber(),
        approvalThreshold: a.approvalThreshold.toNumber(), isActive: a.isActive, balance: balances.get(a.accountId) ?? 0,
        rowVersion: a.rowVersion,
      };
    });
  }

  saveAccount(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'cashAccountAddUpdate', data);
  }

  async categories(tenantId: string): Promise<CashCategory[]> {
    const rows = await this.prisma.db().cashCategories.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ direction: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
    const gl = await this.glRefs(tenantId, rows.map((r) => r.defaultAccountId));
    return rows.map((c) => ({
      id: c.id, code: c.code, name: c.name, direction: c.direction, voucherType: c.voucherType, defaultAccount: gl(c.defaultAccountId), partyKind: c.partyKind,
      icon: c.icon, colorToken: c.colorToken, sortOrder: c.sortOrder, isSystem: c.isSystem, isActive: c.isActive, rowVersion: c.rowVersion,
    }));
  }

  saveCategory(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'cashCategoryAddUpdate', data);
  }

  async expenseCategories(tenantId: string): Promise<ExpenseCategory[]> {
    const rows = await this.prisma.db().expenseCategories.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const gl = await this.glRefs(tenantId, rows.map((r) => r.accountId));
    return rows.map((c) => ({
      id: c.id, code: c.code, name: c.name, appliesTo: c.appliesTo, account: gl(c.accountId)!, limitAmount: c.limitAmount?.toNumber() ?? null,
      limitPeriod: c.limitPeriod, requiresPreApproval: c.requiresPreApproval, receiptRequired: c.receiptRequired, submitWithinDays: c.submitWithinDays,
      icon: c.icon, sortOrder: c.sortOrder, isActive: c.isActive, rowVersion: c.rowVersion,
    }));
  }

  saveExpenseCategory(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'expenseCategoryAddUpdate', data);
  }

  async retiredCodes(tenantId: string, table: CashTable) {
    const db = this.prisma.db();
    const where = { tenantId, deletedAt: { not: null } };
    const rows =
      table === 'cashAccounts' ? await db.cashAccounts.findMany({ where, select: { code: true } })
      : table === 'cashCategories' ? await db.cashCategories.findMany({ where, select: { code: true } })
      : await db.expenseCategories.findMany({ where, select: { code: true } });
    return rows.map((r) => r.code);
  }

  inUse(table: CashTable, id: string) {
    return isReferenced(this.prisma, table, id);
  }

  async softDelete(tenantId: string, table: CashTable, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const args = { where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } };
    const { count } =
      table === 'cashAccounts' ? await db.cashAccounts.updateMany(args)
      : table === 'cashCategories' ? await db.cashCategories.updateMany(args)
      : await db.expenseCategories.updateMany(args);
    if (count !== 1) throw new ConcurrencyError('Someone else changed this record. Reload and try again.');
  }

  async activeBranch(tenantId: string, id: string) {
    return (await this.prisma.db().branches.count({ where: { tenantId, id, status: 'ACTIVE', deletedAt: null } })) === 1;
  }

  async hasFund(tenantId: string, cashAccountId: string) {
    return (await this.prisma.db().pettyCashFunds.count({ where: { tenantId, cashAccountId, deletedAt: null } })) > 0;
  }

  async activeUser(tenantId: string, id: string) {
    return (await this.prisma.db().users.count({ where: { tenantId, id, status: 'ACTIVE' } })) === 1;
  }
}
