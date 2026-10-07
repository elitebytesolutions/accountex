import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ListResult, PerformanceCycle, TalentListQuery } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { PerformanceCycleStore } from '../application/performance-cycle-store.js';

type Row = Prisma.PerformanceCyclesGetPayload<object>;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const STATUS_ORDER: Record<string, number> = { ACTIVE: 0, DRAFT: 1, CLOSED: 2 };

const map = (r: Row): PerformanceCycle => ({
  id: r.id, name: r.name, cycleType: r.cycleType, periodStart: day(r.periodStart)!, periodEnd: day(r.periodEnd)!,
  goalSettingDue: day(r.goalSettingDue), selfReviewDue: day(r.selfReviewDue), managerReviewDue: day(r.managerReviewDue),
  calibrationStart: day(r.calibrationStart), calibrationEnd: day(r.calibrationEnd), signOffDue: day(r.signOffDue),
  incrementsEffectiveMonth: day(r.incrementsEffectiveMonth), excludeProbation: r.excludeProbation, ratingScaleMax: r.ratingScaleMax,
  stage: r.stage, status: r.status, rowVersion: r.rowVersion,
});

@Injectable()
export class PrismaPerformanceCycleStore extends PerformanceCycleStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: TalentListQuery): Promise<ListResult<PerformanceCycle>> {
    const s = q.search?.trim();
    const where: Prisma.PerformanceCyclesWhereInput = { tenantId, ...(q.status && { status: q.status }), ...(s && { name: { contains: s, mode: 'insensitive' } }) };
    const db = this.prisma.db();
    const [rows, total] = await Promise.all([db.performanceCycles.findMany({ where, orderBy: [{ periodStart: 'desc' }, { name: 'asc' }] }), db.performanceCycles.count({ where })]);
    // The active cycle first, then drafts, then closed ones (newest period first within each).
    const sorted = rows.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
    return { items: sorted.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map(map), total };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().performanceCycles.findFirst({ where: { tenantId, id } });
    return row ? map(row) : null;
  }

  byName(tenantId: string, name: string) {
    return this.prisma.db().performanceCycles.findFirst({ where: { tenantId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
  }

  active(tenantId: string) {
    return this.prisma.db().performanceCycles.findFirst({ where: { tenantId, status: 'ACTIVE' }, select: { id: true, name: true } });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'performanceCycleAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'performanceCycles', id);
  }

  async remove(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().performanceCycles.deleteMany({ where: { tenantId, id, rowVersion, status: 'DRAFT' } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this cycle. Reload and try again.');
  }
}
