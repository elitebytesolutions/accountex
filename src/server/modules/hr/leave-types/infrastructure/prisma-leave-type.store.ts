import { Injectable } from '@nestjs/common';
import type { LeaveRuleInput, LeaveType } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { LeaveTypeStore } from '../application/leave-type-store.js';

const num = (d: { toNumber(): number } | null) => (d ? d.toNumber() : null);

@Injectable()
export class PrismaLeaveTypeStore extends LeaveTypeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<LeaveType[]> {
    const db = this.prisma.db();
    const [rows, rules, branches, grades] = await Promise.all([
      db.leaveTypes.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      db.leaveEligibilityRules.findMany({ where: { tenantId } }),
      db.branches.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      db.grades.findMany({ where: { tenantId }, select: { id: true, code: true, levelName: true } }),
    ]);
    return rows.map((t) => ({
      id: t.id, code: t.code, name: t.name, category: t.category, colour: t.colour, isPaid: t.isPaid, daysPerYear: t.daysPerYear.toNumber(), unit: t.unit,
      description: t.description, statuteNote: t.statuteNote, accrualMethod: t.accrualMethod, accrualAmount: num(t.accrualAmount), prorateNewJoiners: t.prorateNewJoiners,
      carryForwardMode: t.carryForwardMode, carryForwardMax: num(t.carryForwardMax), accumulationCap: num(t.accumulationCap), carryExpiryMonths: t.carryExpiryMonths,
      encashmentMode: t.encashmentMode, encashMaxDays: num(t.encashMaxDays), encashBasis: t.encashBasis, deductionBasis: t.deductionBasis,
      sandwichRule: t.sandwichRule, allowHalfDay: t.allowHalfDay, allowNegative: t.allowNegative, blockInPayrollLock: t.blockInPayrollLock,
      attachmentRequired: t.attachmentRequired, attachmentAfterDays: num(t.attachmentAfterDays), backdateDays: t.backdateDays, minNoticeDays: t.minNoticeDays,
      maxConsecutiveDays: num(t.maxConsecutiveDays), maxPerMonth: num(t.maxPerMonth), maxTimesInService: t.maxTimesInService, applyWindowDays: t.applyWindowDays,
      compOffExpiryDays: t.compOffExpiryDays, gender: t.gender, employmentTypes: t.employmentTypes, availableAfter: t.availableAfter, probationRule: t.probationRule,
      approvalWorkflow: t.approvalWorkflow, hrApprovalAboveDays: num(t.hrApprovalAboveDays), sortOrder: t.sortOrder, status: t.status,
      rules: rules.filter((r) => r.leaveTypeId === t.id).map((r) => {
        const g = grades.find((x) => x.id === r.gradeId);
        return {
          id: r.id, scope: r.scope, branch: branches.find((b) => b.id === r.branchId) ?? null, grade: g ? { id: g.id, code: g.code, name: g.levelName } : null,
          isIncluded: r.isIncluded, daysOverride: num(r.daysOverride),
        };
      }),
      rowVersion: t.rowVersion,
    }));
  }

  async options(tenantId: string) {
    const db = this.prisma.db();
    const [branches, grades] = await Promise.all([
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.grades.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, levelName: true }, orderBy: { levelRank: 'asc' } }),
    ]);
    return { branches, grades: grades.map((g) => ({ id: g.id, code: g.code, name: g.levelName })) };
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().leaveTypes.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'leaveTypeAddUpdate', data);
  }

  async replaceRules(leaveTypeId: string, rules: LeaveRuleInput[]) {
    await addUpdate(this.prisma, 'leaveEligibilityReplace', { leaveTypeId, rules });
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'leaveTypes', id, ['leaveEligibilityRules']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const { count } = await db.leaveTypes.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this leave type. Reload and try again.');
    await db.leaveEligibilityRules.deleteMany({ where: { tenantId, leaveTypeId: id } });
  }
}
