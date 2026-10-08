import { Injectable } from '@nestjs/common';
import type { SalaryStructure } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { StructureStore } from '../application/structure-store.js';

const num = (d: { toNumber(): number } | null) => (d ? d.toNumber() : null);

@Injectable()
export class PrismaStructureStore extends StructureStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<SalaryStructure[]> {
    const db = this.prisma.db();
    const today = new Date(new Date().toISOString().slice(0, 10));
    const [rows, lines, tiers, comps, grades, staff, addonStaff] = await Promise.all([
      db.salaryStructures.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } }),
      db.salaryStructureComponents.findMany({ where: { tenantId }, orderBy: [{ sortOrder: 'asc' }] }),
      db.salaryStructureCommissionTiers.findMany({ where: { tenantId }, orderBy: { achievementFromPct: 'asc' } }),
      db.salaryComponents.findMany({ where: { tenantId }, select: { id: true, code: true, name: true, componentType: true, calcMethod: true } }),
      db.grades.findMany({ where: { tenantId }, select: { id: true, code: true, levelName: true } }),
      db.employeeSalaries.groupBy({ by: ['structureId'], where: { tenantId, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, _count: { _all: true } }),
      db.employeeSalaries.groupBy({ by: ['addonStructureId'], where: { tenantId, addonStructureId: { not: null }, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, _count: { _all: true } }),
    ]);
    return rows.map((s) => {
      const g = grades.find((x) => x.id === s.gradeId);
      const from = rows.find((x) => x.id === s.copiedFromStructureId);
      return {
        id: s.id, code: s.code, name: s.name, structureKind: s.structureKind, grade: g ? { id: g.id, code: g.code, name: g.levelName } : null,
        basicMin: num(s.basicMin), basicMax: num(s.basicMax), grossMid: num(s.grossMid), commissionCapPercentOfBasic: num(s.commissionCapPercentOfBasic),
        description: s.description, effectiveFrom: s.effectiveFrom.toISOString().slice(0, 10), copiedFrom: from ? { id: from.id, code: from.code, name: from.name } : null, status: s.status,
        lines: lines.filter((l) => l.structureId === s.id).map((l) => ({
          id: l.id, component: comps.find((c) => c.id === l.componentId) ?? { id: l.componentId, code: '?', name: '?', componentType: 'EARNING', calcMethod: 'FIXED' },
          calcMethod: l.calcMethod, percent: num(l.percent), fixedAmount: num(l.fixedAmount), quantity: num(l.quantity), formula: l.formula, displayText: l.displayText, sortOrder: l.sortOrder,
        })),
        tiers: tiers.filter((t) => t.structureId === s.id).map((t) => ({ id: t.id, achievementFromPct: t.achievementFromPct.toNumber(), achievementToPct: num(t.achievementToPct), commissionRatePct: t.commissionRatePct.toNumber() })),
        staff: (staff.find((x) => x.structureId === s.id)?._count._all ?? 0) + (addonStaff.find((x) => x.addonStructureId === s.id)?._count._all ?? 0),
        rowVersion: s.rowVersion,
      };
    });
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().salaryStructures.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'salaryStructureAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'salaryStructures', id, ['structureComponents', 'commissionTiers']);
  }

  /** Soft-deletes the structure and removes its lines and tiers, so its components stop counting as used. */
  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const { count } = await db.salaryStructures.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), status: 'RETIRED' } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this structure. Reload and try again.');
    await db.salaryStructureComponents.deleteMany({ where: { tenantId, structureId: id } });
    await db.salaryStructureCommissionTiers.deleteMany({ where: { tenantId, structureId: id } });
  }
}
