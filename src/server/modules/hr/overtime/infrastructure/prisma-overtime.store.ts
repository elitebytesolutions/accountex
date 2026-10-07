import { Injectable } from '@nestjs/common';
import type { OvertimePolicy } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { OvertimeStore } from '../application/overtime-store.js';

const num = (d: { toNumber(): number } | null) => (d ? d.toNumber() : null);

@Injectable()
export class PrismaOvertimeStore extends OvertimeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<OvertimePolicy[]> {
    const db = this.prisma.db();
    const rows = await db.overtimePolicies.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ isActive: 'desc' }, { effectiveFrom: 'desc' }] });
    const grades = await db.grades.findMany({ where: { tenantId, id: { in: rows.map((r) => r.eligibleUpToGradeId).filter((x): x is string => !!x) } }, select: { id: true, code: true, levelName: true } });
    return rows.map((p) => {
      const g = grades.find((x) => x.id === p.eligibleUpToGradeId);
      return {
        id: p.id, name: p.name, statuteNote: p.statuteNote, weekdayMultiplier: p.weekdayMultiplier.toNumber(), weeklyOffMultiplier: p.weeklyOffMultiplier.toNumber(),
        holidayMultiplier: p.holidayMultiplier.toNumber(), hourlyRateBasis: p.hourlyRateBasis, minMinutes: p.minMinutes, dailyCapHours: num(p.dailyCapHours),
        monthlyCapHours: num(p.monthlyCapHours), rounding: p.rounding, eligibleUpToGrade: g ? { id: g.id, code: g.code, name: g.levelName } : null,
        requiresPreApproval: p.requiresPreApproval, allowCompOff: p.allowCompOff, effectiveFrom: p.effectiveFrom.toISOString().slice(0, 10), isActive: p.isActive, rowVersion: p.rowVersion,
      };
    });
  }

  async grades(tenantId: string) {
    const rows = await this.prisma.db().grades.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, levelName: true }, orderBy: { levelRank: 'asc' } });
    return rows.map((g) => ({ id: g.id, code: g.code, name: g.levelName }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'overtimePolicyAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'overtimePolicies', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().overtimePolicies.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this policy. Reload and try again.');
  }
}
