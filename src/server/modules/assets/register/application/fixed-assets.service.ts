import { Injectable } from '@nestjs/common';
import { monthlyCharge, type AssetDetail, type AssetOptions, type AssetQuery, type AssetScheduleRow, type FixedAsset, type FixedAssetInput, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { FixedAssetStore } from './fixed-asset-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthKey = (d: string) => d.slice(0, 7);
const addMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, '0')}`; };
const invalid = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));

/**
 * The fixed asset register: an asset is entered (NEW, editable), then capitalised — from a posted vendor bill line
 * (reclass journal when the bill posted to another account) or as an existing asset — and depreciated by the monthly
 * runs. Cost, dates, policy and accounts are frozen once capitalised; only never-capitalised assets are deleted.
 */
@Injectable()
export class FixedAssetsService {
  constructor(private readonly store: FixedAssetStore, private readonly unitOfWork: UnitOfWork) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  capitalisableLines(user: SessionUser, search: string | null) {
    return this.store.capitalisableLines(user.tenantId, search);
  }

  list(user: SessionUser, q: AssetQuery) {
    return this.store.listAssets(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<AssetDetail> {
    const a = await this.asset(user, id);
    const [runs, transfers, disposal, years] = await Promise.all([
      this.store.assetRuns(user.tenantId, id), this.store.listTransfers(user.tenantId, id, null), this.store.disposalOf(user.tenantId, id), this.store.fiscalYears(user.tenantId),
    ]);
    return { ...a, schedule: this.schedule(a, runs, years), transfers, disposal, runs: runs.map(({ periodEnd, months, ...r }) => { void periodEnd; void months; return r; }) };
  }

  async create(user: SessionUser, meta: RequestMeta, input: FixedAssetInput) {
    const data = this.payload(await this.store.options(user.tenantId), input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('fixedAssetAddUpdate', { ...data, status: 'NEW' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: FixedAssetInput & { rowVersion: number }) {
    const a = await this.current(user, id, input.rowVersion);
    if (a.status === 'DISPOSED') throw new ConflictError('A disposed asset can’t be changed.', undefined, { code: 'ASSET_NOT_EDITABLE' });
    const data = this.payload(await this.store.options(user.tenantId), input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('fixedAssetAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const a = await this.current(user, id, rowVersion);
    if (a.status !== 'NEW') throw new ConflictError('A capitalised asset stays on the register; dispose of it instead.', undefined, { code: 'ASSET_NOT_EDITABLE' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('asset', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This asset was changed. Reload and try again.');
  }

  async capitalise(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, billLineId: string | null) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.capitalise(id, billLineId));
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private async asset(user: SessionUser, id: string): Promise<FixedAsset> {
    const a = await this.store.getAsset(user.tenantId, id);
    if (!a) throw new NotFoundError('Asset not found');
    return a;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const a = await this.asset(user, id);
    if (a.rowVersion !== rowVersion) throw new ConcurrencyError('This asset was changed. Reload and try again.');
    return a;
  }

  /** Category defaults fill a missing policy / accounts; everything else is the form's. */
  private payload(o: AssetOptions, p: FixedAssetInput) {
    const e: Record<string, string> = {};
    const cat = o.categories.find((c) => c.id === p.categoryId);
    if (!cat) e.categoryId = 'Choose an active category';
    if (!o.branches.some((b) => b.id === p.branchId)) e.branchId = 'Choose an active location';
    if (p.costCentreId && !o.costCentres.some((c) => c.id === p.costCentreId)) e.costCentreId = 'Choose an active cost centre';
    for (const k of ['costAccountId', 'accumDepAccountId', 'depExpenseAccountId'] as const) if (p[k] && !o.accounts.some((a) => a.id === p[k])) e[k] = 'Choose a postable account';
    if (Object.keys(e).length) throw invalid(e);
    return {
      name: p.name, description: p.description ?? null, categoryId: p.categoryId, branchId: p.branchId, custodianEmployeeId: p.custodianEmployeeId ?? null, costCentreId: p.costCentreId ?? null,
      tagNo: p.tagNo ?? null, serialNo: p.serialNo ?? null, acquisitionDate: p.acquisitionDate, cost: Number(p.cost), vendorId: p.vendorId ?? null, method: p.method,
      ratePct: p.method === 'NONE' ? null : p.ratePct ?? cat!.defaultRatePct, residualValue: Number(p.residualValue ?? 0), chargeFullMonthOnPurchase: p.chargeFullMonthOnPurchase ?? true,
      costAccountId: p.costAccountId, accumDepAccountId: p.method === 'NONE' ? p.accumDepAccountId ?? null : p.accumDepAccountId ?? cat!.accumDepAccountId,
      depExpenseAccountId: p.method === 'NONE' ? p.depExpenseAccountId ?? null : p.depExpenseAccountId ?? cat!.depExpenseAccountId,
      registrationNo: p.registrationNo ?? null, engineNo: p.engineNo ?? null, chassisNo: p.chassisNo ?? null, insurer: p.insurer ?? null, insurancePolicyNo: p.insurancePolicyNo ?? null,
      insuranceExpiry: p.insuranceExpiry ?? null,
    };
  }

  /** Per fiscal year: posted months (locked), then the remaining months projected with the same monthly rule. */
  private schedule(a: FixedAsset, runs: { periodEnd: string; charge: number; status: string; months: number }[], years: { code: string; startDate: string; endDate: string }[]): AssetScheduleRow[] {
    if (a.method === 'NONE' || !a.ratePct) return [];
    const posted = runs.filter((r) => r.status === 'POSTED');
    const lastPosted = a.depreciatedThrough ? monthKey(a.depreciatedThrough) : null;
    const today = new Date().toISOString().slice(0, 10);
    const out: AssetScheduleRow[] = [];
    let accumulated = 0;
    let projected = a.accumulatedDepreciation;
    for (const fy of years.filter((y) => y.endDate >= a.acquisitionDate)) {
      const openingNbv = r2(a.cost - accumulated);
      const mine = posted.filter((r) => r.periodEnd >= fy.startDate && r.periodEnd <= fy.endDate);
      const postedDep = r2(mine.reduce((s, r) => s + r.charge, 0));
      let projectedDep = 0;
      let projectedMonths = 0;
      for (let m = monthKey(fy.startDate > a.acquisitionDate ? fy.startDate : a.acquisitionDate); m <= monthKey(fy.endDate); m = addMonth(m)) {
        if (lastPosted && m <= lastPosted) continue;
        if (a.status === 'DISPOSED' || a.status === 'NEW' && m < monthKey(today)) continue;
        const c = monthlyCharge({ method: a.method, ratePct: a.ratePct, cost: a.cost, accumulated: projected, residualValue: a.residualValue });
        if (c <= 0) break;
        projected = r2(projected + c);
        projectedDep = r2(projectedDep + c);
        projectedMonths++;
      }
      const depreciation = r2(postedDep + projectedDep);
      accumulated = r2(accumulated + depreciation);
      if (depreciation === 0 && openingNbv <= a.residualValue) break;
      out.push({
        fiscalYear: fy.code, openingNbv, months: mine.length + projectedMonths, monthsPosted: mine.length, depreciation, accumulated, closingNbv: r2(a.cost - accumulated),
        status: projectedMonths === 0 ? 'LOCKED' : fy.startDate <= today && today <= fy.endDate || mine.length ? 'PENDING' : 'PROJECTED',
      });
    }
    return out;
  }
}
