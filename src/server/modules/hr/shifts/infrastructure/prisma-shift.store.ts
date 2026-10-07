import { Injectable } from '@nestjs/common';
import type { Shift } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { ShiftStore } from '../application/shift-store.js';

const hm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaShiftStore extends ShiftStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<Shift[]> {
    const [rows, staff] = await Promise.all([
      this.prisma.db().workShifts.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { startTime: 'asc' }, { name: 'asc' }] }),
      this.prisma.db().employees.groupBy({ by: ['shiftId'], where: { tenantId, deletedAt: null, status: { not: 'EXITED' }, shiftId: { not: null } }, _count: { _all: true } }),
    ]);
    return rows.map((s) => ({
      id: s.id, code: s.code, name: s.name, description: s.description, colour: s.colour, startTime: hm(s.startTime)!, endTime: hm(s.endTime)!, crossesMidnight: s.crossesMidnight,
      scheduledHours: s.scheduledHours?.toNumber() ?? 0, graceMinutes: s.graceMinutes, breakStart: hm(s.breakStart), breakEnd: hm(s.breakEnd),
      fridayExtendedBreak: s.fridayExtendedBreak, fridayBreakEnd: hm(s.fridayBreakEnd), prayerBreakNote: s.prayerBreakNote, halfDayBelowHours: s.halfDayBelowHours?.toNumber() ?? null,
      lateMarksPerHalfDay: s.lateMarksPerHalfDay, overtimeAfterMinutes: s.overtimeAfterMinutes, weeklyOff: s.weeklyOff, isDefault: s.isDefault, isSeasonal: s.isSeasonal,
      season: s.season, validFrom: day(s.validFrom), validTo: day(s.validTo), status: s.status, employees: staff.find((x) => x.shiftId === s.id)?._count._all ?? 0, rowVersion: s.rowVersion,
    }));
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().workShifts.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'workShiftAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'workShifts', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().workShifts.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE', isDefault: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this shift. Reload and try again.');
  }
}
