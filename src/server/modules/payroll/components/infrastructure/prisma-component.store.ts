import { Injectable } from '@nestjs/common';
import type { PayrollOptions, SalaryComponent } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { ComponentStore } from '../application/component-store.js';

const num = (d: { toNumber(): number } | null) => (d ? d.toNumber() : null);

@Injectable()
export class PrismaComponentStore extends ComponentStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<SalaryComponent[]> {
    const db = this.prisma.db();
    const rows = await db.salaryComponents.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
    const accIds = [...new Set(rows.flatMap((r) => [r.debitAccountId, r.creditAccountId]).filter((x): x is string => !!x))];
    const [accounts, uses] = await Promise.all([
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: accIds } }, select: { id: true, code: true, name: true } }),
      db.salaryStructureComponents.groupBy({ by: ['componentId'], where: { tenantId }, _count: { _all: true } }),
    ]);
    const ref = (id: string | null) => (id ? accounts.find((a) => a.id === id) ?? null : null);
    return rows.map((c) => {
      const base = rows.find((x) => x.id === c.baseComponentId);
      return {
        id: c.id, code: c.code, name: c.name, componentType: c.componentType, calcMethod: c.calcMethod, baseBasis: c.baseBasis,
        baseComponent: base ? { id: base.id, code: base.code, name: base.name } : null, percent: num(c.percent), fixedAmount: num(c.fixedAmount), wageCeiling: num(c.wageCeiling),
        formula: c.formula, calcDescription: c.calcDescription, debitAccount: ref(c.debitAccountId), creditAccount: ref(c.creditAccountId), taxTreatment: c.taxTreatment,
        exemptLimitPercentOfBasic: num(c.exemptLimitPercentOfBasic), exemptLimitAnnualAmount: num(c.exemptLimitAnnualAmount), prorateOnPaidDays: c.prorateOnPaidDays,
        showOnPayslip: c.showOnPayslip, includeInGratuityBase: c.includeInGratuityBase, includeInEobiWage: c.includeInEobiWage, systemRole: c.systemRole,
        sortOrder: c.sortOrder, status: c.status, structures: uses.find((u) => u.componentId === c.id)?._count._all ?? 0, rowVersion: c.rowVersion,
      };
    });
  }

  async options(tenantId: string): Promise<PayrollOptions> {
    const db = this.prisma.db();
    const [structures, payGroups, grades, accounts] = await Promise.all([
      db.salaryStructures.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } }),
      db.payGroups.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.grades.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, levelName: true }, orderBy: { levelRank: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, kind: 'POSTABLE', status: 'ACTIVE' }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: 'asc' } }),
    ]);
    return {
      structures: structures.map((s) => ({ id: s.id, code: s.code, name: s.name, structureKind: s.structureKind, status: s.status, gradeId: s.gradeId, basicMin: num(s.basicMin), basicMax: num(s.basicMax) })),
      payGroups, grades: grades.map((g) => ({ id: g.id, code: g.code, name: g.levelName })), accounts: accounts.map((a) => ({ ...a, accountClass: String(a.accountClass) })),
    };
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().salaryComponents.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'salaryComponentAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'salaryComponents', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    // The system role is unique among live components, so a deleted one gives it up.
    const { count } = await this.prisma.db().salaryComponents.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE', systemRole: null } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this component. Reload and try again.');
  }
}
