import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import {
  monthlyCharge, type AssetDisposal, type AssetDisposalList, type AssetOptions, type AssetQuery, type AssetTransfer, type CapitalisableLine, type DepreciationRun,
  type DepreciationRunList, type FixedAsset, type FixedAssetList,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { FixedAssetStore, type AssetAction, type AssetSave } from '../application/fixed-asset-store.js';

type Db = Prisma.TransactionClient;
type Ref = { id: string; code: string; name: string };
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const today = () => new Date().toISOString().slice(0, 10);
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const ref = (xs: Ref[], id: string) => find(xs, id) ?? { id, code: '?', name: '?' };
const TEXT_ACTIONS: AssetAction[] = ['depreciationRunCancel', 'assetTransferApprove', 'assetTransferReject', 'assetTransferCancel', 'assetDisposalCancel'];

async function names(db: Db, tenantId: string, xs: (string | null)[]) {
  const rows = ids(xs).length ? await db.employees.findMany({ where: { tenantId, id: { in: ids(xs) } }, select: { id: true, displayName: true, firstName: true, lastName: true } }) : [];
  return new Map(rows.map((e) => [e.id, { id: e.id, name: e.displayName ?? [e.firstName, e.lastName].filter(Boolean).join(' ') }]));
}

@Injectable()
export class PrismaFixedAssetStore extends FixedAssetStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async refs(tenantId: string, k: { categories?: (string | null)[]; branches?: (string | null)[]; costCentres?: (string | null)[]; accounts?: (string | null)[]; vendors?: (string | null)[]; customers?: (string | null)[]; taxCodes?: (string | null)[] }) {
    const db = this.prisma.db();
    const q = <T,>(xs: (string | null)[] | undefined, f: (i: string[]) => Promise<T[]>) => (xs && ids(xs).length ? f(ids(xs)) : Promise.resolve([] as T[]));
    const [categories, branches, costCentres, accounts, vendors, customers, taxCodes] = await Promise.all([
      q(k.categories, (i) => db.fixedAssetCategories.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
      q(k.branches, (i) => db.branches.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
      q(k.costCentres, (i) => db.costCentres.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
      q(k.accounts, (i) => db.chartOfAccounts.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
      q(k.vendors, (i) => db.vendors.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
      q(k.customers, (i) => db.customers.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
      q(k.taxCodes, (i) => db.taxCodes.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, description: true } })),
    ]);
    return {
      categories: categories as Ref[], branches: branches as Ref[], costCentres: costCentres as Ref[], accounts: accounts as Ref[], vendors: vendors as Ref[], customers: customers as Ref[],
      taxCodes: taxCodes.map((t) => ({ id: t.id, code: t.code, name: t.description })),
    };
  }

  // ---------------------------------------------------------------- options
  async options(tenantId: string): Promise<AssetOptions> {
    const db = this.prisma.db();
    const [cats, branches, ccs, emps, coa, periods, banks, cash, taxCodes, rates, roles] = await Promise.all([
      db.fixedAssetCategories.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.costCentres.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.employees.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, displayName: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, kind: 'POSTABLE', status: 'ACTIVE' }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: 'asc' } }),
      db.fiscalPeriods.findMany({ where: { tenantId, isAdjustment: false }, orderBy: { startDate: 'asc' } }),
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { accountId: true, accountTitle: true, accountLast4: true } }),
      db.cashAccounts.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { accountId: true, name: true } }),
      db.taxCodes.findMany({ where: { tenantId, deletedAt: null, isActive: true, appliesTo: { in: ['SALES', 'SALES_AND_PURCHASES'] }, taxType: { notIn: ['WHT', 'COLLECTION'] } }, orderBy: { code: 'asc' } }),
      db.taxCodeRates.findMany({ where: { tenantId, effectiveFrom: { lte: new Date(today()) } }, orderBy: { effectiveFrom: 'desc' } }),
      db.defaultAccountMappings.findMany({ where: { tenantId, role: { in: ['FA_GAIN', 'FA_LOSS', 'GAIN_LOSS_ON_DISPOSAL'] } }, select: { role: true, accountId: true } }),
    ]);
    const role = (r: string) => roles.find((x) => x.role === r)?.accountId ?? null;
    return {
      categories: cats.map((c) => ({ id: c.id, code: c.code, name: c.name, defaultMethod: c.defaultMethod, defaultRatePct: c.defaultRatePct === null ? null : num(c.defaultRatePct), costAccountId: c.costAccountId, accumDepAccountId: c.accumDepAccountId, depExpenseAccountId: c.depExpenseAccountId })),
      branches, costCentres: ccs,
      employees: emps.map((e) => ({ id: e.id, name: e.displayName ?? [e.firstName, e.lastName].filter(Boolean).join(' ') })),
      accounts: coa.map((a) => ({ id: a.id, code: a.code, name: a.name, accountClass: Number(a.accountClass) })),
      periods: periods.map((p) => ({ id: p.id, code: p.code, startDate: day(p.startDate)!, endDate: day(p.endDate)!, status: p.status, fiscalYearId: p.fiscalYearId })),
      receiveInto: [...banks.map((b) => ({ accountId: b.accountId, label: `${b.accountTitle}${b.accountLast4 ? ` — ${b.accountLast4}` : ''}` })), ...cash.map((c) => ({ accountId: c.accountId, label: c.name }))],
      taxCodes: taxCodes.map((t) => {
        const r = rates.find((x) => x.taxCodeId === t.id && (!x.effectiveTo || day(x.effectiveTo)! >= today()));
        return { id: t.id, code: t.code, name: t.description, rate: r?.rate ? num(r.rate) : null, accountId: t.accountId };
      }),
      gainAccountId: role('FA_GAIN') ?? role('GAIN_LOSS_ON_DISPOSAL'), lossAccountId: role('FA_LOSS') ?? role('GAIN_LOSS_ON_DISPOSAL'),
    };
  }

  async capitalisableLines(tenantId: string, search: string | null): Promise<CapitalisableLine[]> {
    const db = this.prisma.db();
    const used = (await db.fixedAssets.findMany({ where: { tenantId, sourceDocLineId: { not: null }, deletedAt: null }, select: { sourceDocLineId: true } })).map((a) => a.sourceDocLineId!);
    const bills = await db.vendorBills.findMany({
      where: { tenantId, status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] }, ...(search && { OR: [{ docNo: { contains: search, mode: 'insensitive' } }, { vendorInvoiceNo: { contains: search, mode: 'insensitive' } }] }) },
      select: { id: true, docNo: true, docDate: true, vendorId: true }, orderBy: { docDate: 'desc' }, take: 100,
    });
    if (!bills.length) return [];
    const lines = await db.vendorBillLines.findMany({ where: { tenantId, billId: { in: bills.map((b) => b.id) }, id: { notIn: used } }, orderBy: { lineNo: 'asc' } });
    const r = await this.refs(tenantId, { vendors: bills.map((b) => b.vendorId), accounts: lines.map((l) => l.accountId) });
    return lines.map((l) => {
      const b = bills.find((x) => x.id === l.billId)!;
      return { id: l.id, billId: b.id, billNo: b.docNo, billDate: day(b.docDate)!, vendor: ref(r.vendors, b.vendorId), description: l.description, account: find(r.accounts, l.accountId), netAmount: num(l.netAmount) };
    });
  }

  // ---------------------------------------------------------------- register
  async listAssets(tenantId: string, q: AssetQuery): Promise<FixedAssetList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.FixedAssetsWhereInput = {
      tenantId, deletedAt: null, ...(q.branch && { branchId: q.branch }),
      ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { name: { contains: s, mode: 'insensitive' } }, { serialNo: { contains: s, mode: 'insensitive' } }, { tagNo: { contains: s, mode: 'insensitive' } }] }),
    };
    const where = { ...base, ...(q.category && { categoryId: q.category }), ...(q.status && { status: q.status }) };
    const fy = await db.fiscalYears.findFirst({ where: { tenantId, startDate: { lte: new Date(today()) }, endDate: { gte: new Date(today()) } } });
    const [rows, total, all] = await Promise.all([
      db.fixedAssets.findMany({ where, orderBy: { code: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.fixedAssets.count({ where }),
      db.fixedAssets.findMany({ where: { ...base, status: { not: 'DISPOSED' } }, select: { categoryId: true, branchId: true, cost: true, accumulatedDepreciation: true, status: true, method: true, ratePct: true, residualValue: true, acquisitionDate: true } }),
    ]);
    const cats = await db.fixedAssetCategories.findMany({ where: { tenantId, id: { in: ids(all.map((a) => a.categoryId)) } }, select: { id: true, code: true, name: true, defaultMethod: true } });
    const live = all.filter((a) => a.status !== 'NEW');
    const sum = (xs: typeof all, f: (a: (typeof all)[number]) => number) => Math.round(xs.reduce((s, a) => s + f(a), 0) * 100) / 100;
    const counts: Record<string, number> = {};
    for (const a of all) counts[a.categoryId] = (counts[a.categoryId] ?? 0) + 1;
    return {
      items: await this.mapAssets(tenantId, rows), total, counts,
      kpis: {
        grossCost: sum(live, (a) => num(a.cost)), accumulated: sum(live, (a) => num(a.accumulatedDepreciation)), nbv: sum(live, (a) => num(a.cost) - num(a.accumulatedDepreciation)),
        active: live.length, fullyDepreciated: live.filter((a) => a.status === 'FULLY_DEPRECIATED').length, branches: new Set(live.map((a) => a.branchId)).size,
        monthlyCharge: sum(live.filter((a) => ['IN_USE', 'UNDER_REPAIR'].includes(a.status)), (a) => monthlyCharge({ method: a.method, ratePct: a.ratePct === null ? null : num(a.ratePct), cost: num(a.cost), accumulated: num(a.accumulatedDepreciation), residualValue: num(a.residualValue) })),
        additionsFy: fy ? sum(live.filter((a) => a.acquisitionDate >= fy.startDate), (a) => num(a.cost)) : 0,
      },
      byCategory: cats.map((c) => {
        const mine = live.filter((a) => a.categoryId === c.id);
        return { category: { id: c.id, code: c.code, name: c.name }, count: mine.length, cost: sum(mine, (a) => num(a.cost)), nbv: sum(mine, (a) => num(a.cost) - num(a.accumulatedDepreciation)), method: c.defaultMethod };
      }).sort((a, b) => b.cost - a.cost),
    };
  }

  async getAsset(tenantId: string, id: string) {
    const row = await this.prisma.db().fixedAssets.findFirst({ where: { tenantId, id, deletedAt: null } });
    return row ? (await this.mapAssets(tenantId, [row]))[0]! : null;
  }

  private async mapAssets(tenantId: string, rows: Prisma.FixedAssetsGetPayload<object>[]): Promise<FixedAsset[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [r, emps, users] = await Promise.all([
      this.refs(tenantId, { categories: rows.map((a) => a.categoryId), branches: rows.map((a) => a.branchId), costCentres: rows.map((a) => a.costCentreId), vendors: rows.map((a) => a.vendorId), accounts: rows.flatMap((a) => [a.costAccountId, a.accumDepAccountId, a.depExpenseAccountId]) }),
      names(db, tenantId, rows.map((a) => a.custodianEmployeeId)),
      userRefs(db, tenantId, rows.map((a) => a.capitalisedByUserId)),
    ]);
    return rows.map((a) => ({
      id: a.id, code: a.code, name: a.name, description: a.description, category: ref(r.categories, a.categoryId), branch: ref(r.branches, a.branchId), custodian: emps.get(a.custodianEmployeeId ?? '') ?? null,
      costCentre: find(r.costCentres, a.costCentreId), tagNo: a.tagNo, serialNo: a.serialNo, acquisitionDate: day(a.acquisitionDate)!, cost: num(a.cost),
      source: { type: a.sourceDocType, id: a.sourceDocId, docNo: a.sourceDocNo, lineId: a.sourceDocLineId }, vendor: find(r.vendors, a.vendorId), method: a.method,
      ratePct: a.ratePct === null ? null : num(a.ratePct), residualValue: num(a.residualValue), chargeFullMonthOnPurchase: a.chargeFullMonthOnPurchase,
      costAccount: ref(r.accounts, a.costAccountId), accumDepAccount: find(r.accounts, a.accumDepAccountId), depExpenseAccount: find(r.accounts, a.depExpenseAccountId),
      accumulatedDepreciation: num(a.accumulatedDepreciation), nbv: num(a.cost) - num(a.accumulatedDepreciation), depreciatedThrough: day(a.depreciatedThrough),
      registrationNo: a.registrationNo, engineNo: a.engineNo, chassisNo: a.chassisNo, insurer: a.insurer, insurancePolicyNo: a.insurancePolicyNo, insuranceExpiry: day(a.insuranceExpiry),
      status: a.status, disposedOn: day(a.disposedOn), capitalisedBy: users.get(a.capitalisedByUserId ?? '') ?? null,
      monthlyCharge: ['IN_USE', 'UNDER_REPAIR', 'NEW'].includes(a.status) ? monthlyCharge({ method: a.method, ratePct: a.ratePct === null ? null : num(a.ratePct), cost: num(a.cost), accumulated: num(a.accumulatedDepreciation), residualValue: num(a.residualValue) }) : 0,
      createdAt: a.createdAt.toISOString(), rowVersion: a.rowVersion,
    }));
  }

  async assetRuns(tenantId: string, id: string) {
    const db = this.prisma.db();
    const lines = await db.depreciationRunLines.findMany({ where: { tenantId, assetId: id } });
    if (!lines.length) return [];
    const [runs, periods] = await Promise.all([
      db.depreciationRuns.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.depreciationRunId)) } }, select: { id: true, docNo: true, status: true } }),
      db.fiscalPeriods.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.fiscalPeriodId)) } }, select: { id: true, code: true, endDate: true } }),
    ]);
    return lines.map((l) => {
      const run = runs.find((x) => x.id === l.depreciationRunId)!;
      const p = periods.find((x) => x.id === l.fiscalPeriodId)!;
      return { runId: run.id, docNo: run.docNo, period: p.code, periodEnd: day(p.endDate)!, charge: num(l.charge), status: run.status, months: num(l.months) };
    }).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  }

  async fiscalYears(tenantId: string) {
    return (await this.prisma.db().fiscalYears.findMany({ where: { tenantId }, orderBy: { startDate: 'asc' } })).map((f) => ({ id: f.id, code: f.code, startDate: day(f.startDate)!, endDate: day(f.endDate)! }));
  }

  // ---------------------------------------------------------------- transfers
  async listTransfers(tenantId: string, assetId: string | null, status: string | null) {
    const rows = await this.prisma.db().assetTransfers.findMany({ where: { tenantId, ...(assetId && { assetId }), ...(status && { status }) }, orderBy: { createdAt: 'desc' }, take: 200 });
    return this.mapTransfers(tenantId, rows);
  }

  async getTransfer(tenantId: string, id: string) {
    const row = await this.prisma.db().assetTransfers.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapTransfers(tenantId, [row]))[0]! : null;
  }

  private async mapTransfers(tenantId: string, rows: Prisma.AssetTransfersGetPayload<object>[]): Promise<AssetTransfer[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [r, emps, users, assets] = await Promise.all([
      this.refs(tenantId, { branches: rows.flatMap((t) => [t.fromBranchId, t.toBranchId]) }),
      names(db, tenantId, rows.flatMap((t) => [t.fromCustodianEmployeeId, t.toCustodianEmployeeId])),
      userRefs(db, tenantId, rows.flatMap((t) => [t.requestedByUserId, t.approvedByUserId, t.createdBy])),
      db.fixedAssets.findMany({ where: { tenantId, id: { in: ids(rows.map((t) => t.assetId)) } }, select: { id: true, code: true, name: true } }),
    ]);
    return rows.map((t) => ({
      id: t.id, asset: find(assets, t.assetId) ?? { id: t.assetId, code: '?', name: '?' }, fromBranch: ref(r.branches, t.fromBranchId), toBranch: ref(r.branches, t.toBranchId),
      fromCustodian: emps.get(t.fromCustodianEmployeeId ?? '') ?? null, toCustodian: emps.get(t.toCustodianEmployeeId ?? '') ?? null, effectiveDate: day(t.effectiveDate)!,
      reason: t.reason, status: t.status, requestedBy: users.get(t.requestedByUserId ?? t.createdBy ?? '') ?? null, approvedBy: users.get(t.approvedByUserId ?? '') ?? null,
      approvedAt: iso(t.approvedAt), completedAt: iso(t.completedAt), createdAt: t.createdAt.toISOString(), rowVersion: t.rowVersion,
    }));
  }

  // ---------------------------------------------------------------- disposals
  async listDisposals(tenantId: string, q: AssetQuery): Promise<AssetDisposalList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const assetIds = s ? (await db.fixedAssets.findMany({ where: { tenantId, OR: [{ code: { contains: s, mode: 'insensitive' } }, { name: { contains: s, mode: 'insensitive' } }] }, select: { id: true }, take: 100 })).map((a) => a.id) : [];
    const base: Prisma.AssetDisposalsWhereInput = { tenantId, ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { buyerName: { contains: s, mode: 'insensitive' } }, { assetId: { in: assetIds } }] }) };
    const where = { ...base, ...(q.type && { disposalType: q.type }), ...(q.status && { status: q.status }) };
    const [rows, total, all] = await Promise.all([
      db.assetDisposals.findMany({ where, orderBy: [{ disposalDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.assetDisposals.count({ where }),
      db.assetDisposals.findMany({ where: { ...base, status: { not: 'CANCELLED' } }, select: { status: true, disposalType: true, cost: true, nbv: true, proceeds: true, gainLoss: true } }),
    ]);
    const posted = all.filter((d) => d.status === 'POSTED');
    const counts: Record<string, number> = {};
    for (const d of all) counts[d.disposalType] = (counts[d.disposalType] ?? 0) + 1;
    const sum = (xs: typeof all, f: (d: (typeof all)[number]) => number) => Math.round(xs.reduce((a, d) => a + f(d), 0) * 100) / 100;
    return {
      items: await this.mapDisposals(tenantId, rows), total, counts,
      kpis: {
        count: all.length, posted: posted.length, pending: all.filter((d) => d.status === 'PENDING_APPROVAL').length, draft: all.filter((d) => d.status === 'DRAFT').length,
        nbvDerecognised: sum(posted, (d) => num(d.nbv)), costDerecognised: sum(posted, (d) => num(d.cost)), proceeds: sum(posted, (d) => num(d.proceeds)), netGain: sum(posted, (d) => num(d.gainLoss)),
      },
    };
  }

  async getDisposal(tenantId: string, id: string) {
    const row = await this.prisma.db().assetDisposals.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapDisposals(tenantId, [row]))[0]! : null;
  }

  async disposalOf(tenantId: string, assetId: string) {
    const d = await this.prisma.db().assetDisposals.findFirst({ where: { tenantId, assetId, status: { not: 'CANCELLED' } }, select: { id: true, docNo: true, status: true, disposalDate: true } });
    return d ? { id: d.id, docNo: d.docNo, status: d.status, disposalDate: day(d.disposalDate)! } : null;
  }

  private async mapDisposals(tenantId: string, rows: Prisma.AssetDisposalsGetPayload<object>[]): Promise<AssetDisposal[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const assets = await db.fixedAssets.findMany({ where: { tenantId, id: { in: ids(rows.map((d) => d.assetId)) } }, select: { id: true, code: true, name: true, categoryId: true } });
    const [r, users, vouchers] = await Promise.all([
      this.refs(tenantId, { categories: assets.map((a) => a.categoryId), customers: rows.map((d) => d.customerId), taxCodes: rows.map((d) => d.taxCodeId), accounts: rows.map((d) => d.receiveIntoAccountId) }),
      userRefs(db, tenantId, rows.flatMap((d) => [d.approvedByUserId, d.createdBy])),
      voucherRefs(db, tenantId, rows.map((d) => d.journalEntryId)),
    ]);
    return rows.map((d) => {
      const a = find(assets, d.assetId);
      return {
        id: d.id, docNo: d.docNo, asset: { id: d.assetId, code: a?.code ?? '?', name: a?.name ?? '?', category: find(r.categories, a?.categoryId)?.name ?? '?' }, disposalDate: day(d.disposalDate)!,
        disposalType: d.disposalType, buyerName: d.buyerName, customer: find(r.customers, d.customerId), cost: num(d.cost), accumulatedDepreciation: num(d.accumulatedDepreciation),
        nbv: num(d.nbv), proceeds: num(d.proceeds), taxCode: find(r.taxCodes, d.taxCodeId), gstRate: num(d.gstRate), gstAmount: num(d.gstAmount), gainLoss: num(d.gainLoss),
        receiveIntoAccount: find(r.accounts, d.receiveIntoAccountId), status: d.status, submittedAt: iso(d.submittedAt), approvedBy: users.get(d.approvedByUserId ?? '') ?? null,
        approvedAt: iso(d.approvedAt), journal: vouchers.get(d.journalEntryId ?? '') ?? null, postedAt: iso(d.postedAt), remarks: d.remarks, createdBy: users.get(d.createdBy ?? '') ?? null,
        createdAt: d.createdAt.toISOString(), rowVersion: d.rowVersion,
      };
    });
  }

  // ---------------------------------------------------------------- depreciation runs
  async listRuns(tenantId: string, q: AssetQuery): Promise<DepreciationRunList> {
    const db = this.prisma.db();
    const where: Prisma.DepreciationRunsWhereInput = { tenantId, ...(q.status && { status: q.status }) };
    const [rows, total] = await Promise.all([
      db.depreciationRuns.findMany({ where, orderBy: { postingDate: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.depreciationRuns.count({ where }),
    ]);
    return { items: (await this.mapRuns(tenantId, rows, false)).map(({ lines, journalPreview, ...x }) => { void lines; void journalPreview; return x; }), total };
  }

  async getRun(tenantId: string, id: string) {
    const row = await this.prisma.db().depreciationRuns.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapRuns(tenantId, [row], true))[0]! : null;
  }

  async runForPeriod(tenantId: string, fiscalPeriodId: string) {
    return this.prisma.db().depreciationRuns.findFirst({ where: { tenantId, fiscalPeriodId, status: { not: 'CANCELLED' } }, select: { id: true, docNo: true } });
  }

  private async mapRuns(tenantId: string, rows: Prisma.DepreciationRunsGetPayload<object>[], full: boolean): Promise<DepreciationRun[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.depreciationRunLines.findMany({ where: { tenantId, depreciationRunId: { in: rows.map((x) => x.id) } } }) : [];
    const [r, users, vouchers, periods, assets] = await Promise.all([
      this.refs(tenantId, { branches: [...rows.map((x) => x.branchId), ...lines.map((l) => l.branchId)], categories: [...rows.map((x) => x.categoryId), ...lines.map((l) => l.categoryId)], accounts: lines.flatMap((l) => [l.expenseAccountId, l.accumDepAccountId]) }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.computedByUserId, x.postedByUserId])),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
      db.fiscalPeriods.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.fiscalPeriodId)) } } }),
      lines.length ? db.fixedAssets.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.assetId)) } }, select: { id: true, code: true, name: true } }) : Promise.resolve([]),
    ]);
    return rows.map((x) => {
      const p = periods.find((y) => y.id === x.fiscalPeriodId)!;
      const mine = lines.filter((l) => l.depreciationRunId === x.id);
      const preview = new Map<string, { account: Ref; debit: number; credit: number }>();
      for (const l of mine) {
        const dr = preview.get(`D${l.expenseAccountId}`) ?? { account: ref(r.accounts, l.expenseAccountId), debit: 0, credit: 0 };
        dr.debit = Math.round((dr.debit + num(l.charge)) * 100) / 100;
        preview.set(`D${l.expenseAccountId}`, dr);
        const cr = preview.get(`C${l.accumDepAccountId}`) ?? { account: ref(r.accounts, l.accumDepAccountId), debit: 0, credit: 0 };
        cr.credit = Math.round((cr.credit + num(l.charge)) * 100) / 100;
        preview.set(`C${l.accumDepAccountId}`, cr);
      }
      return {
        id: x.id, docNo: x.docNo, period: { id: p.id, code: p.code, startDate: day(p.startDate)!, endDate: day(p.endDate)!, status: p.status }, postingDate: day(x.postingDate)!,
        branch: find(r.branches, x.branchId), category: find(r.categories, x.categoryId), status: x.status, assetsCount: x.assetsCount, skippedCount: x.skippedCount,
        totalDepreciation: num(x.totalDepreciation), nbvBefore: num(x.nbvBefore), nbvAfter: num(x.nbvAfter), computedAt: iso(x.computedAt), computedBy: users.get(x.computedByUserId ?? '') ?? null,
        journal: vouchers.get(x.journalEntryId ?? '') ?? null, postedAt: iso(x.postedAt), postedBy: users.get(x.postedByUserId ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
        lines: mine.map((l) => ({
          id: l.id, asset: find(assets, l.assetId) ?? { id: l.assetId, code: '?', name: '?' }, category: ref(r.categories, l.categoryId), branch: ref(r.branches, l.branchId), method: l.method,
          ratePct: num(l.ratePct), months: num(l.months), openingNbv: num(l.openingNbv), charge: num(l.charge), closingNbv: num(l.openingNbv) - num(l.charge),
        })).sort((a, b) => a.category.name.localeCompare(b.category.name) || a.asset.code.localeCompare(b.asset.code)),
        journalPreview: [...preview.values()].sort((a, b) => b.debit - a.debit || a.account.code.localeCompare(b.account.code)),
      };
    });
  }

  // ---------------------------------------------------------------- writes
  save(fn: AssetSave, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  async run(fn: AssetAction, id: string, text: string | null = null) {
    const db = this.prisma.db();
    if (TEXT_ACTIONS.includes(fn)) await db.$queryRawUnsafe(`select "FixedAssets"."${fn}"($1::uuid, $2::text)::text`, id, text);
    else await db.$queryRawUnsafe(`select "FixedAssets"."${fn}"($1::uuid)::text`, id);
  }

  async capitalise(id: string, billLineId: string | null) {
    await this.prisma.db().$queryRawUnsafe(`select "FixedAssets"."fixedAssetCapitalise"($1::uuid, $2::uuid)::text`, id, billLineId);
  }

  async setStatus(table: 'disposal', tenantId: string, id: string, status: string) {
    await this.prisma.db().assetDisposals.updateMany({ where: { tenantId, id }, data: { status } });
  }

  async deleteDraft(kind: 'asset' | 'run' | 'disposal', tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (kind === 'asset') return (await db.fixedAssets.deleteMany({ where: { tenantId, id, rowVersion, status: 'NEW' } })).count > 0;
    if (kind === 'run') {
      if (!(await db.depreciationRuns.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.depreciationRunLines.deleteMany({ where: { tenantId, depreciationRunId: id } });
      return (await db.depreciationRuns.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    return (await db.assetDisposals.deleteMany({ where: { tenantId, id, rowVersion, status: 'DRAFT' } })).count > 0;
  }
}
