import { Injectable } from '@nestjs/common';
import type { FiscalYear, PeriodModule } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { FiscalStore, type PeriodState } from '../application/fiscal-store.js';

const day = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class PrismaFiscalStore extends FiscalStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<FiscalYear[]> {
    const db = this.prisma.db();
    const [years, periods, locks, counts, users] = await Promise.all([
      db.fiscalYears.findMany({ where: { tenantId }, orderBy: { startDate: 'desc' } }),
      db.fiscalPeriods.findMany({ where: { tenantId }, orderBy: [{ startDate: 'asc' }, { periodNo: 'asc' }] }),
      db.periodModuleLocks.findMany({ where: { tenantId }, select: { fiscalPeriodId: true, moduleCode: true, status: true } }),
      db.$queryRaw<{ periodId: string; total: bigint; drafts: bigint }[]>`
        select p.id::text as "periodId", count(v.id) as total,
               count(v.id) filter (where v.status in ('DRAFT','PENDING_APPROVAL')) as drafts
        from "Accounting"."FiscalPeriods" p
        left join "Accounting"."Vouchers" v on v."tenantId" = p."tenantId" and v."postingDate" between p."startDate" and p."endDate"
        where p."tenantId" = ${tenantId}::uuid
        group by p.id`,
      db.users.findMany({ where: { tenantId }, select: { id: true, fullName: true } }),
    ]);
    const name = new Map(users.map((u) => [u.id, u.fullName]));
    const count = new Map(counts.map((c) => [c.periodId, c]));
    return years.map((y) => ({
      id: y.id,
      code: y.code,
      startDate: day(y.startDate),
      endDate: day(y.endDate),
      status: y.status,
      isLocked: y.isLocked,
      hasAdjustmentPeriod: y.hasAdjustmentPeriod,
      closedAt: y.closedAt?.toISOString() ?? null,
      netProfitTransferred: y.netProfitTransferred?.toNumber() ?? null,
      auditorName: y.auditorName,
      rowVersion: y.rowVersion,
      periods: periods
        .filter((p) => p.fiscalYearId === y.id)
        .map((p) => ({
          id: p.id,
          periodNo: p.periodNo,
          code: p.code,
          startDate: day(p.startDate),
          endDate: day(p.endDate),
          isAdjustment: p.isAdjustment,
          status: p.status,
          modules: Object.fromEntries(locks.filter((l) => l.fiscalPeriodId === p.id).map((l) => [l.moduleCode, l.status])),
          closedAt: p.closedAt?.toISOString() ?? null,
          closedByName: p.closedByUserId ? (name.get(p.closedByUserId) ?? null) : null,
          lockedAt: p.lockedAt?.toISOString() ?? null,
          voucherCount: Number(count.get(p.id)?.total ?? 0),
          draftCount: Number(count.get(p.id)?.drafts ?? 0),
          rowVersion: p.rowVersion,
        })),
    }));
  }

  async nextStart(tenantId: string) {
    const last = await this.prisma.db().fiscalYears.findFirst({ where: { tenantId }, orderBy: { endDate: 'desc' }, select: { endDate: true } });
    if (!last) return null;
    const next = new Date(last.endDate);
    next.setUTCDate(next.getUTCDate() + 1);
    return day(next);
  }

  async startMonth(tenantId: string) {
    const db = this.prisma.db();
    const s = await db.companySettings.findFirst({ where: { tenantId }, select: { fyStartMonth: true } });
    if (s) return s.fyStartMonth;
    const t = await db.tenants.findUnique({ where: { id: tenantId }, select: { fiscalYearStartMonth: true } });
    return t?.fiscalYearStartMonth ?? 7;
  }

  async create(startDate: string, adjustment: boolean) {
    const rows = await this.prisma.db().$queryRaw<{ id: string }[]>`
      select "Accounting"."createFiscalYear"(${startDate}::date, ${adjustment})::text as id`;
    return rows[0]!.id;
  }

  async period(tenantId: string, id: string): Promise<PeriodState | null> {
    const db = this.prisma.db();
    const p = await db.fiscalPeriods.findFirst({ where: { tenantId, id }, select: { id: true, fiscalYearId: true, status: true, rowVersion: true } });
    if (!p) return null;
    const locks = await db.periodModuleLocks.findMany({ where: { tenantId, fiscalPeriodId: id }, select: { moduleCode: true, status: true } });
    return { ...p, modules: Object.fromEntries(locks.map((l) => [l.moduleCode, l.status])) };
  }

  async setPeriodStatus(tenantId: string, id: string, rowVersion: number, status: 'OPEN' | 'CLOSED' | 'LOCKED') {
    const { count } = await this.prisma.db().fiscalPeriods.updateMany({ where: { tenantId, id, rowVersion }, data: { status } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this period. Reload and try again.');
  }

  async setModules(tenantId: string, periodId: string, modules: PeriodModule[], status: 'OPEN' | 'CLOSED' | 'LOCKED', userId: string) {
    const db = this.prisma.db();
    const open = status === 'OPEN';
    for (const moduleCode of modules) {
      await db.periodModuleLocks.upsert({
        where: { tenantId_fiscalPeriodId_moduleCode: { tenantId, fiscalPeriodId: periodId, moduleCode } },
        create: { tenantId, fiscalPeriodId: periodId, moduleCode, status, closedAt: open ? null : new Date(), closedByUserId: open ? null : userId },
        update: { status, closedAt: open ? null : new Date(), closedByUserId: open ? null : userId },
      });
    }
  }
}
