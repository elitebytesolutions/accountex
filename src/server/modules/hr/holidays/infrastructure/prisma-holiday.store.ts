import { Injectable } from '@nestjs/common';
import type { Holiday, HolidayListQuery } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { HolidayStore } from '../application/holiday-store.js';

const day = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class PrismaHolidayStore extends HolidayStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, q: HolidayListQuery): Promise<Holiday[]> {
    const db = this.prisma.db();
    const rows = await db.holidays.findMany({
      where: {
        tenantId, deletedAt: null,
        ...(q.from && { toDate: { gte: new Date(`${q.from}T00:00:00Z`) } }),
        ...(q.to && { fromDate: { lte: new Date(`${q.to}T00:00:00Z`) } }),
      },
      orderBy: { fromDate: 'asc' },
    });
    const links = await db.holidayBranches.findMany({ where: { tenantId, holidayId: { in: rows.map((r) => r.id) } } });
    const branches = await db.branches.findMany({ where: { tenantId, id: { in: [...new Set(links.map((l) => l.branchId))] } }, select: { id: true, name: true } });
    return rows
      .map((h) => ({
        id: h.id, name: h.name, fromDate: day(h.fromDate), toDate: day(h.toDate), days: h.days ?? 1, holidayType: h.holidayType, isMoonDependent: h.isMoonDependent,
        hijriNote: h.hijriNote, eligibilityNote: h.eligibilityNote, appliesToAllBranches: h.appliesToAllBranches,
        branches: links.filter((l) => l.holidayId === h.id).map((l) => branches.find((b) => b.id === l.branchId) ?? { id: l.branchId, name: '?' }),
        status: h.status, source: h.source, notifyEss: h.notifyEss, rowVersion: h.rowVersion,
      }))
      .filter((h) => !q.branch || h.appliesToAllBranches || h.branches.some((b) => b.id === q.branch));
  }

  branchRows(tenantId: string, holidayId: string) {
    return this.prisma.db().holidayBranches.findMany({ where: { tenantId, holidayId }, select: { id: true, branchId: true } });
  }

  async activeBranches(tenantId: string, ids: string[]) {
    const u = [...new Set(ids)];
    return !u.length || (await this.prisma.db().branches.count({ where: { tenantId, id: { in: u }, deletedAt: null, status: 'ACTIVE' } })) === u.length;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'holidayAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'holidays', id, ['holidayBranches']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().holidays.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this holiday. Reload and try again.');
  }
}
