import { Injectable } from '@nestjs/common';
import type { BankRule } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { BankRuleStore } from '../application/bank-rule-store.js';

@Injectable()
export class PrismaBankRuleStore extends BankRuleStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<BankRule[]> {
    const db = this.prisma.db();
    const rules = await db.bankRules.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ priority: 'asc' }, { code: 'asc' }] });
    if (!rules.length) return [];
    const ids = rules.map((r) => r.id);
    const [conditions, gl, centres, accounts] = await Promise.all([
      db.bankRuleConditions.findMany({ where: { tenantId, bankRuleId: { in: ids } }, orderBy: { seq: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: rules.map((r) => r.accountId) } }, select: { id: true, code: true, name: true } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: rules.map((r) => r.costCentreId).filter((x): x is string => !!x) } }, select: { id: true, code: true, name: true } }),
      db.bankAccounts.findMany({ where: { tenantId, id: { in: rules.map((r) => r.bankAccountId).filter((x): x is string => !!x) } }, select: { id: true, bankId: true, accountLast4: true } }),
    ]);
    const banks = await db.banks.findMany({ where: { tenantId, id: { in: accounts.map((a) => a.bankId) } }, select: { id: true, name: true, shortName: true } });
    const accountName = (id: string) => {
      const a = accounts.find((x) => x.id === id), b = banks.find((x) => x.id === a?.bankId);
      return `${b?.shortName ?? b?.name ?? 'Bank'} •••• ${a?.accountLast4 ?? ''}`;
    };
    return rules.map((r) => ({
      id: r.id, code: r.code, name: r.name, priority: r.priority, matchMode: r.matchMode,
      bankAccount: r.bankAccountId ? { id: r.bankAccountId, name: accountName(r.bankAccountId) } : null,
      account: gl.find((g) => g.id === r.accountId)!, costCentre: centres.find((c) => c.id === r.costCentreId) ?? null,
      autoPost: r.autoPost, isEnabled: r.isEnabled, hitCount: r.hitCount, lastHitAt: r.lastHitAt?.toISOString() ?? null,
      conditions: conditions.filter((c) => c.bankRuleId === r.id).map((c) => ({ id: c.id, seq: c.seq, field: c.field, operator: c.operator, value: c.value })),
      rowVersion: r.rowVersion,
    }));
  }

  async allCodes(tenantId: string) {
    return (await this.prisma.db().bankRules.findMany({ where: { tenantId }, select: { code: true } })).map((r) => r.code);
  }

  async retiredCodes(tenantId: string) {
    return (await this.prisma.db().bankRules.findMany({ where: { tenantId, deletedAt: { not: null } }, select: { code: true } })).map((r) => r.code);
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'bankRuleAddUpdate', data);
  }

  async setPriorities(tenantId: string, order: { id: string; priority: number }[]) {
    const db = this.prisma.db();
    for (const o of order) await db.bankRules.updateMany({ where: { tenantId, id: o.id, NOT: { priority: o.priority } }, data: { priority: o.priority } });
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'bankRules', id, ['bankRuleConditions']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().bankRules.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
  }

  async activeBankAccount(tenantId: string, id: string) {
    return (await this.prisma.db().bankAccounts.count({ where: { tenantId, id, status: 'ACTIVE', deletedAt: null } })) === 1;
  }

  async activeCostCentre(tenantId: string, id: string) {
    return (await this.prisma.db().costCentres.count({ where: { tenantId, id, status: 'ACTIVE', deletedAt: null } })) === 1;
  }
}
