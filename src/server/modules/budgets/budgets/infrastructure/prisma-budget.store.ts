import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { Budget, BudgetOptions, BudgetQuery, BudgetVersion } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { BudgetStore, type SeedLine, type VarianceRow } from '../application/budget-store.js';

type Ref = { id: string; code: string; name: string };
const MONTHS = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11', 'm12'] as const;
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthCols = (m: number[]) => Object.fromEntries(MONTHS.map((k, i) => [k, r2(m[i] ?? 0)]));

@Injectable()
export class PrismaBudgetStore extends BudgetStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async options(tenantId: string): Promise<BudgetOptions> {
    const db = this.prisma.db();
    const [fys, coa, ccs, projects, branches, users] = await Promise.all([
      db.fiscalYears.findMany({ where: { tenantId }, orderBy: { startDate: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, kind: 'POSTABLE', status: 'ACTIVE' }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: 'asc' } }),
      db.costCentres.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.projects.findMany({ where: { tenantId, status: { notIn: ['CLOSED', 'CANCELLED'] } }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.users.findMany({ where: { tenantId, status: 'ACTIVE', deletedAt: null }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
    ]);
    return {
      fiscalYears: fys.map((f) => ({ id: f.id, code: f.code, startDate: day(f.startDate)!, endDate: day(f.endDate)!, status: f.status })),
      accounts: coa.map((a) => ({ id: a.id, code: a.code, name: a.name, accountClass: Number(a.accountClass) })), costCentres: ccs, projects, branches,
      users: users.map((u) => ({ id: u.id, name: u.fullName })),
    };
  }

  async list(tenantId: string, q: BudgetQuery) {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const where: Prisma.BudgetsWhereInput = {
      tenantId, ...(q.fiscalYear && { fiscalYearId: q.fiscalYear }), ...(q.status && { status: q.status }),
      ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { name: { contains: s, mode: 'insensitive' } }] }),
    };
    const [rows, total] = await Promise.all([
      db.budgets.findMany({ where, orderBy: [{ code: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.budgets.count({ where }),
    ]);
    return { items: await this.map(tenantId, rows), total };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().budgets.findFirst({ where: { tenantId, id } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  private async map(tenantId: string, rows: Prisma.BudgetsGetPayload<object>[]): Promise<Budget[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const versions = await db.budgetVersions.findMany({ where: { tenantId, budgetId: { in: rows.map((b) => b.id) } }, orderBy: { versionNo: 'asc' } });
    const totals = await db.budgetVersionLines.groupBy({ by: ['budgetVersionId'], where: { tenantId, budgetVersionId: { in: versions.map((v) => v.id) } }, _sum: { totalAmount: true } });
    const [fys, ccs, projects, branches, users] = await Promise.all([
      db.fiscalYears.findMany({ where: { tenantId, id: { in: ids(rows.map((b) => b.fiscalYearId)) } } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: ids(rows.map((b) => b.costCentreId)) } }, select: { id: true, code: true, name: true } }),
      db.projects.findMany({ where: { tenantId, id: { in: ids(rows.map((b) => b.projectId)) } }, select: { id: true, code: true, name: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((b) => b.branchId)) } }, select: { id: true, code: true, name: true } }),
      userRefs(db, tenantId, [...rows.flatMap((b) => [b.ownerUserId, b.approvedByUserId]), ...versions.flatMap((v) => [v.approvedByUserId, v.createdBy])]),
    ]);
    const current = (b: (typeof rows)[number]) => versions.find((v) => v.id === b.currentVersionId) ?? versions.filter((v) => v.budgetId === b.id).at(-1) ?? null;
    const actual = await this.actualToDate(tenantId, ids(rows.map((b) => current(b)?.id ?? null)));
    const totalOf = (vId: string) => num(totals.find((t) => t.budgetVersionId === vId)?._sum.totalAmount);
    return rows.map((b) => {
      const fy = fys.find((f) => f.id === b.fiscalYearId)!;
      const cv = current(b);
      const amount = cv ? totalOf(cv.id) : 0;
      const act = cv ? actual.get(cv.id) ?? 0 : 0;
      return {
        id: b.id, code: b.code, name: b.name, fiscalYear: { id: fy.id, code: fy.code, startDate: day(fy.startDate)!, endDate: day(fy.endDate)! }, budgetType: b.budgetType,
        department: b.department, costCentre: find(ccs as Ref[], b.costCentreId), project: find(projects as Ref[], b.projectId), branch: find(branches as Ref[], b.branchId),
        owner: users.get(b.ownerUserId ?? '') ?? null, seedFrom: b.seedFrom, seedUpliftPct: b.seedUpliftPct === null ? null : num(b.seedUpliftPct), requiresCeoApproval: b.requiresCeoApproval,
        status: b.status, currentVersion: cv && { id: cv.id, versionNo: cv.versionNo, status: cv.status }, amount, actualToDate: act,
        utilisedPct: amount ? Math.round((act / amount) * 1000) / 10 : null, approvedBy: users.get(b.approvedByUserId ?? '') ?? null, approvedAt: iso(b.approvedAt),
        createdAt: b.createdAt.toISOString(), rowVersion: b.rowVersion,
        versions: versions.filter((v) => v.budgetId === b.id).map((v) => ({
          id: v.id, versionNo: v.versionNo, status: v.status, notes: v.notes, approvedBy: users.get(v.approvedByUserId ?? '') ?? null, approvedAt: iso(v.approvedAt),
          createdBy: users.get(v.createdBy ?? '') ?? null, createdAt: v.createdAt.toISOString(), rowVersion: v.rowVersion, total: totalOf(v.id),
        })),
      };
    });
  }

  async version(tenantId: string, versionId: string) {
    const db = this.prisma.db();
    const v = await db.budgetVersions.findFirst({ where: { tenantId, id: versionId } });
    if (!v) return null;
    const lines = await db.budgetVersionLines.findMany({ where: { tenantId, budgetVersionId: versionId } });
    const [accounts, ccs, users] = await Promise.all([
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.accountId)) } }, select: { id: true, code: true, name: true, accountClass: true } }),
      db.costCentres.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.costCentreId)) } }, select: { id: true, code: true, name: true } }),
      userRefs(db, tenantId, [v.approvedByUserId, v.createdBy]),
    ]);
    const mapped = lines.map((l) => {
      const a = accounts.find((x) => x.id === l.accountId)!;
      return {
        id: l.id, account: { id: a.id, code: a.code, name: a.name, accountClass: Number(a.accountClass) }, costCentre: find(ccs as Ref[], l.costCentreId),
        months: MONTHS.map((k) => num(l[k])), total: num(l.totalAmount),
      };
    }).sort((a, b) => a.account.code.localeCompare(b.account.code));
    return {
      id: v.id, budgetId: v.budgetId, versionNo: v.versionNo, status: v.status, notes: v.notes, approvedBy: users.get(v.approvedByUserId ?? '') ?? null, approvedAt: iso(v.approvedAt),
      createdBy: users.get(v.createdBy ?? '') ?? null, createdAt: v.createdAt.toISOString(), rowVersion: v.rowVersion, total: r2(mapped.reduce((s, l) => s + l.total, 0)), lines: mapped,
    } satisfies BudgetVersion & { budgetId: string };
  }

  async nextCode(tenantId: string, year: number) {
    const n = await this.prisma.db().budgets.count({ where: { tenantId, code: { startsWith: `BUD-${year}-` } } });
    return `BUD-${year}-${String(n + 1).padStart(2, '0')}`;
  }

  async previousYear(tenantId: string, fiscalYearId: string) {
    const db = this.prisma.db();
    const fy = await db.fiscalYears.findFirst({ where: { tenantId, id: fiscalYearId } });
    if (!fy) return null;
    return (await db.fiscalYears.findFirst({ where: { tenantId, endDate: { lt: fy.startDate } }, orderBy: { endDate: 'desc' }, select: { id: true } }))?.id ?? null;
  }

  async actuals(tenantId: string, fiscalYearId: string): Promise<SeedLine[]> {
    const rows = await this.prisma.db().$queryRaw<{ accountId: string; m: number; amount: Prisma.Decimal }[]>`
      select l."accountId", ((extract(year from age(date_trunc('month', v."postingDate"), date_trunc('month', fy."startDate"))) * 12
               + extract(month from age(date_trunc('month', v."postingDate"), date_trunc('month', fy."startDate"))))::int + 1) as m,
             sum(case when a."accountClass" = 4 then l.credit - l.debit else l.debit - l.credit end) as amount
        from "Accounting"."FiscalYears" fy
        join "Accounting"."Vouchers" v on v."tenantId" = fy."tenantId" and v.status = 'POSTED' and v."postingDate" between fy."startDate" and fy."endDate"
        join "Accounting"."VoucherLines" l on l."tenantId" = v."tenantId" and l."journalEntryId" = v.id
        join "Accounting"."ChartOfAccounts" a on a."tenantId" = l."tenantId" and a.id = l."accountId"
       where fy."tenantId" = ${tenantId}::uuid and fy.id = ${fiscalYearId}::uuid and a."accountClass" in (4, 5, 6)
       group by 1, 2`;
    const by = new Map<string, number[]>();
    for (const r of rows) {
      const m = by.get(r.accountId) ?? Array(12).fill(0);
      if (r.m >= 1 && r.m <= 12) m[r.m - 1] = r2(m[r.m - 1] + Number(r.amount));
      by.set(r.accountId, m);
    }
    return [...by.entries()].map(([accountId, months]) => ({ accountId, costCentreId: null, months }));
  }

  async priorBudgetLines(tenantId: string, fiscalYearId: string, budgetType: string): Promise<SeedLine[]> {
    const db = this.prisma.db();
    const b = await db.budgets.findFirst({ where: { tenantId, fiscalYearId, budgetType }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
    const vId = b?.currentVersionId ?? (b ? (await db.budgetVersions.findFirst({ where: { tenantId, budgetId: b.id }, orderBy: { versionNo: 'desc' } }))?.id : null);
    if (!vId) return [];
    return (await db.budgetVersionLines.findMany({ where: { tenantId, budgetVersionId: vId } })).map((l) => ({ accountId: l.accountId, costCentreId: l.costCentreId, months: MONTHS.map((k) => num(l[k])) }));
  }

  async variance(tenantId: string, versionId: string): Promise<VarianceRow[]> {
    const rows = await this.prisma.db().$queryRaw<Record<string, unknown>[]>`
      select v."accountId", v."accountCode", v."accountName", v."accountClass", v."costCentreId", v."costCentreCode", v."costCentreName", v."monthNo",
             v."budgetAmount", v."actualAmount"
        from "Accounting"."getBudgetVsActual" v where v."tenantId" = ${tenantId}::uuid and v."budgetVersionId" = ${versionId}::uuid`;
    return rows.map((r) => ({
      accountId: String(r.accountId), accountCode: String(r.accountCode), accountName: String(r.accountName), accountClass: Number(r.accountClass),
      costCentreId: (r.costCentreId as string | null) ?? null, costCentreCode: (r.costCentreCode as string | null) ?? null, costCentreName: (r.costCentreName as string | null) ?? null,
      monthNo: Number(r.monthNo), budget: Number(r.budgetAmount ?? 0), actual: Number(r.actualAmount ?? 0),
    }));
  }

  async actualToDate(tenantId: string, versionIds: string[]) {
    if (!versionIds.length) return new Map<string, number>();
    const rows = await this.prisma.db().$queryRaw<{ id: string; actual: Prisma.Decimal | null }[]>`
      select v."budgetVersionId" as id, sum(v."actualAmount") as actual from "Accounting"."getBudgetVsActual" v
       where v."tenantId" = ${tenantId}::uuid and v."budgetVersionId" = any(${versionIds}::uuid[]) and v."monthStart" <= current_date group by 1`;
    return new Map(rows.map((r) => [r.id, r2(Number(r.actual ?? 0))]));
  }

  // ---------------------------------------------------------------- writes
  async create(tenantId: string, budget: Record<string, unknown>, lines: SeedLine[]) {
    const db = this.prisma.db();
    const b = await db.budgets.create({ data: { tenantId, ...(budget as object) } as Prisma.BudgetsUncheckedCreateInput, select: { id: true } });
    const v = await db.budgetVersions.create({ data: { tenantId, budgetId: b.id, versionNo: 1, status: 'DRAFT' }, select: { id: true } });
    if (lines.length) await db.budgetVersionLines.createMany({ data: lines.map((l) => ({ tenantId, budgetVersionId: v.id, accountId: l.accountId, costCentreId: l.costCentreId, ...monthCols(l.months) })) });
    await db.budgets.updateMany({ where: { tenantId, id: b.id }, data: { currentVersionId: v.id } });
    return b.id;
  }

  async replaceLines(tenantId: string, versionId: string, lines: SeedLine[]) {
    const db = this.prisma.db();
    await db.budgetVersionLines.deleteMany({ where: { tenantId, budgetVersionId: versionId } });
    if (lines.length) await db.budgetVersionLines.createMany({ data: lines.map((l) => ({ tenantId, budgetVersionId: versionId, accountId: l.accountId, costCentreId: l.costCentreId, ...monthCols(l.months) })) });
    await db.budgetVersions.updateMany({ where: { tenantId, id: versionId }, data: { notes: null } });
  }

  async newVersion(tenantId: string, budgetId: string) {
    const db = this.prisma.db();
    const b = await db.budgets.findFirstOrThrow({ where: { tenantId, id: budgetId } });
    const last = await db.budgetVersions.findFirst({ where: { tenantId, budgetId }, orderBy: { versionNo: 'desc' } });
    const from = b.currentVersionId ?? last?.id ?? null;
    const v = await db.budgetVersions.create({ data: { tenantId, budgetId, versionNo: (last?.versionNo ?? 0) + 1, status: 'DRAFT' }, select: { id: true } });
    if (from) {
      const lines = await db.budgetVersionLines.findMany({ where: { tenantId, budgetVersionId: from } });
      if (lines.length) await db.budgetVersionLines.createMany({ data: lines.map((l) => ({ tenantId, budgetVersionId: v.id, accountId: l.accountId, costCentreId: l.costCentreId, ...Object.fromEntries(MONTHS.map((k) => [k, l[k]])) })) });
    }
    return v.id;
  }

  async submit(versionId: string) {
    await this.prisma.db().$queryRawUnsafe(`select "Accounting"."budgetVersionSubmit"($1::uuid)::text`, versionId);
  }

  async approve(versionId: string) {
    await this.prisma.db().$queryRawUnsafe(`select "Accounting"."budgetVersionApprove"($1::uuid)::text`, versionId);
  }

  async remove(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (!(await db.budgets.count({ where: { tenantId, id, rowVersion, status: { not: 'APPROVED' } } }))) return false;
    await db.budgets.updateMany({ where: { tenantId, id }, data: { currentVersionId: null } });
    const versions = (await db.budgetVersions.findMany({ where: { tenantId, budgetId: id }, select: { id: true } })).map((v) => v.id);
    await db.budgetVersionLines.deleteMany({ where: { tenantId, budgetVersionId: { in: versions } } });
    await db.budgetVersions.deleteMany({ where: { tenantId, budgetId: id } });
    return (await db.budgets.deleteMany({ where: { tenantId, id } })).count > 0;
  }
}
