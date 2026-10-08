import { Injectable } from '@nestjs/common';
import type {
  AdminHistoryPage, AdminSession, ConnectionTestResult, HistoryQuery, SalarySlabsSave, SalesTaxRate, SalesTaxRateUpdate, SalesTaxSchedule,
  TaxAuthority, TaxAuthorityUpdate, TaxMaster, TaxMasterPublish, TaxMasterPublishResult, WithholdingRate, WithholdingRateUpdate, WithholdingSchedule,
} from '../../../../../../shared/index.js';
import { withholdingErrors } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { SecretBox } from '../../../../../core/application/ports/secret-box.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { slabRangeError, sortSlabs } from '../domain/salary-slabs.js';
import { TaxAuthorityGateway, TaxMasterStore, type RateKind } from './tax-master-store.js';

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const today = () => new Date().toISOString().slice(0, 10);
const immutable = () => new ConflictError('Published rates can\'t be edited or deleted. Schedule a new rate instead.', undefined, { code: 'TAX_RATE_PUBLISHED_IMMUTABLE' });
const overlap = (from: string) => new ConflictError(`A rate starting ${from} is already scheduled. Cancel or edit that change first.`, { effectiveFrom: ['Already scheduled'] }, { code: 'TAX_MASTER_RATE_OVERLAP' });
type Rate = SalesTaxRate | WithholdingRate;

/**
 * Tax Master (Operations › System › Tax Master). "Change rate" schedules a new effective-dated row and supersedes the
 * one in force (Platform.taxMaster*Schedule); published rows are never edited. The authority API token is sealed with
 * SecretBox and never returned. "Publish to tenants" stamps every unpublished row with the master version.
 */
@Injectable()
export class TaxMasterService {
  constructor(
    private readonly store: TaxMasterStore,
    private readonly gateway: TaxAuthorityGateway,
    private readonly box: SecretBox,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async get(): Promise<TaxMaster> {
    const [authorities, salesTax, withholding, slabs, imports] = await Promise.all([
      this.store.authorities(), this.store.salesTax(), this.store.withholding(), this.store.slabs(), this.store.slabImports(),
    ]);
    const years = [...new Set(slabs.map((s) => s.taxYear))].sort((a, b) => b - a);
    const rates: Rate[] = [...salesTax, ...withholding];
    const published = rates.filter((r) => r.publishedAt).sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : -1));
    return {
      authorities, salesTax, withholding,
      slabYears: years.map((taxYear) => ({ taxYear, slabs: slabs.filter((s) => s.taxYear === taxYear), importedByTenants: imports.get(taxYear) ?? 0 })),
      unpublished: rates.filter((r) => !r.publishedAt).length,
      masterVersion: published[0]?.masterVersion ?? null,
    };
  }

  // ---------------------------------------------------------------- rates
  async scheduleSalesTax(admin: AdminSession, meta: RequestMeta, input: SalesTaxSchedule): Promise<SalesTaxRate> {
    if (!(await this.store.authorities()).some((a) => a.id === input.taxAuthorityId)) throw new ValidationError('Choose an authority', { taxAuthorityId: ['Unknown authority'] });
    const lineage = (await this.store.salesTax()).filter((r) => r.taxAuthorityId === input.taxAuthorityId && r.appliesTo.toLowerCase() === input.appliesTo.toLowerCase());
    this.checkSchedule(lineage, input.effectiveFrom, input.rate, (r) => (r as SalesTaxRate).rate);
    const appliesTo = lineage[0]?.appliesTo ?? input.appliesTo;
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.schedule('sales-tax', { ...defined(input), appliesTo }));
    return (await this.store.salesTax()).find((r) => r.id === id)!;
  }

  async scheduleWithholding(admin: AdminSession, meta: RequestMeta, input: WithholdingSchedule): Promise<WithholdingRate> {
    const lineage = (await this.store.withholding()).filter((r) => r.sectionCode.toLowerCase() === input.sectionCode.toLowerCase());
    this.checkSchedule(lineage, input.effectiveFrom, null, () => null);
    const sectionCode = lineage[0]?.sectionCode ?? input.sectionCode;
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.schedule('withholding', { ...defined(input), sectionCode }));
    return (await this.store.withholding()).find((r) => r.id === id)!;
  }

  /** Edit of a row that is not published yet (a scheduled change); published rows → 409 TAX_RATE_PUBLISHED_IMMUTABLE. */
  async updateRate(admin: AdminSession, meta: RequestMeta, kind: RateKind, id: string, input: SalesTaxRateUpdate | WithholdingRateUpdate): Promise<Rate> {
    const r = await this.currentRate(kind, id, input.rowVersion);
    if (r.publishedAt) throw immutable();
    const { rowVersion, ...rest } = input;
    const patch = defined(rest);
    if (kind === 'withholding') {
      const e = withholdingErrors({ ...(r as WithholdingRate), ...patch });
      if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.saveRate(kind, { ...patch, id, rowVersion }));
    return this.rate(kind, id);
  }

  /** Cancels a scheduled (unpublished) change: the row is deleted and the rate before it is open again. */
  async cancelRate(admin: AdminSession, meta: RequestMeta, kind: RateKind, id: string, rowVersion: number): Promise<void> {
    const r = await this.currentRate(kind, id, rowVersion);
    if (r.publishedAt) throw immutable();
    const rows: Rate[] = kind === 'sales-tax' ? await this.store.salesTax() : await this.store.withholding();
    const dayBefore = new Date(`${r.effectiveFrom}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const prevTo = dayBefore.toISOString().slice(0, 10);
    const previous = rows.find((x) => x.id !== id && this.sameLineage(kind, x, r) && x.effectiveTo === prevTo);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.deleteRate(kind, id, rowVersion);
      if (previous) await this.store.saveRate(kind, { id: previous.id, rowVersion: previous.rowVersion, effectiveTo: r.effectiveTo, status: previous.effectiveFrom > today() ? 'SCHEDULED' : 'ACTIVE' });
    });
  }

  // ---------------------------------------------------------------- salary slabs
  async saveSlabs(admin: AdminSession, meta: RequestMeta, taxYear: number, input: SalarySlabsSave) {
    const slabs = sortSlabs(input.slabs.map((s) => ({ ...s, excessOver: s.excessOver ?? null })));
    const e = slabRangeError(slabs);
    if (e) throw new ValidationError(e, { slabs: [e] }, { code: 'TAX_SLABS_NOT_CONTIGUOUS' });
    if (((await this.store.slabImports()).get(taxYear) ?? 0) > 0) {
      throw new ConflictError(`Tenants imported the ${taxYear} slabs. Add the next tax year instead of changing this one.`, undefined, { code: 'TAX_MASTER_SLABS_IN_USE' });
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.replaceSlabs(taxYear, slabs.map((s, i) => ({
        taxYear, slabNo: i + 1, incomeFrom: s.incomeFrom, incomeTo: s.incomeTo, fixedTax: s.fixedTax, ratePct: s.ratePct,
        excessOver: s.excessOver ?? s.incomeFrom, legalReference: input.legalReference,
      }))));
    return (await this.get()).slabYears.find((y) => y.taxYear === taxYear)!;
  }

  // ---------------------------------------------------------------- authorities
  async updateAuthority(admin: AdminSession, meta: RequestMeta, id: string, input: TaxAuthorityUpdate): Promise<TaxAuthority> {
    const a = await this.authority(id);
    if (a.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this connection. Reload and try again.');
    const { apiToken, clearToken, rowVersion, ...rest } = input;
    const token = apiToken
      ? { apiTokenEnc: `\\x${Buffer.from(JSON.stringify(this.box.seal(apiToken))).toString('hex')}`, apiTokenLast4: apiToken.slice(-4) }
      : clearToken ? { apiTokenEnc: null, apiTokenLast4: null } : {};
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.saveAuthority({ ...defined(rest), ...token, id, rowVersion }));
    return this.authority(id);
  }

  /**
   * Test connection: calls the authority's sandbox endpoint with the saved token and the configured timeout, and stores
   * the outcome (lastTestAt / lastTestOk / lastTestMs) in the row history.
   */
  async testConnection(admin: AdminSession, meta: RequestMeta, id: string): Promise<ConnectionTestResult> {
    const a = await this.authority(id);
    if (!a.sandboxEndpoint) throw new ValidationError('Set the sandbox endpoint before testing the connection.', { sandboxEndpoint: ['Required for the test'] }, { code: 'TAX_AUTHORITY_NO_ENDPOINT' });
    const sealed = await this.store.authorityToken(id);
    const probe = await this.gateway.probe({ endpoint: a.sandboxEndpoint, token: sealed ? this.box.open(sealed) : null, posId: a.platformPosId, timeoutMs: a.timeoutSeconds * 1000 });
    const testedAt = new Date().toISOString();
    await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.saveAuthority({ id, lastTestAt: testedAt, lastTestOk: probe.ok, lastTestMs: Math.max(0, Math.round(probe.ms)) }));
    return { ...probe, endpoint: a.sandboxEndpoint, testedAt };
  }

  // ---------------------------------------------------------------- publish & log
  async publish(admin: AdminSession, meta: RequestMeta, input: TaxMasterPublish): Promise<TaxMasterPublishResult> {
    const [salesTax, withholding] = await Promise.all([this.store.salesTax(), this.store.withholding()]);
    const pending: [RateKind, Rate][] = [...salesTax.map((r) => ['sales-tax', r] as [RateKind, Rate]), ...withholding.map((r) => ['withholding', r] as [RateKind, Rate])].filter(([, r]) => !r.publishedAt);
    if (!pending.length) throw new ConflictError('Every rate is already published.', undefined, { code: 'TAX_MASTER_NOTHING_TO_PUBLISH' });
    const now = new Date();
    const masterVersion = input.masterVersion ?? `v${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      for (const [kind, r] of pending) await this.store.saveRate(kind, { id: r.id, rowVersion: r.rowVersion, publishedAt: now.toISOString(), masterVersion });
    });
    return { masterVersion, published: pending.length };
  }

  log(query: HistoryQuery): Promise<AdminHistoryPage> {
    return this.store.log(query.pageSize, (query.page - 1) * query.pageSize);
  }

  // ---------------------------------------------------------------- helpers
  /** Today or later, after every row of the lineage, and a different rate from the one it replaces. */
  private checkSchedule(lineage: Rate[], from: string, rate: number | null, rateOf: (r: Rate) => number | null) {
    if (from < today()) throw new ValidationError('A rate change takes effect today or later.', { effectiveFrom: ['Today or later'] }, { code: 'TAX_RATE_EFFECTIVE_PAST' });
    const later = lineage.filter((r) => r.effectiveFrom >= from).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))[0];
    if (later) throw overlap(later.effectiveFrom);
    const current = lineage.find((r) => r.effectiveFrom < from && (r.effectiveTo === null || r.effectiveTo >= from));
    if (current && rate !== null && rateOf(current) === rate) throw new ValidationError('The new rate equals the current rate.', { rate: ['Same as the current rate'] });
  }

  private sameLineage(kind: RateKind, a: Rate, b: Rate) {
    return kind === 'sales-tax'
      ? (a as SalesTaxRate).taxAuthorityId === (b as SalesTaxRate).taxAuthorityId && (a as SalesTaxRate).appliesTo === (b as SalesTaxRate).appliesTo
      : (a as WithholdingRate).sectionCode === (b as WithholdingRate).sectionCode;
  }

  private async rate(kind: RateKind, id: string): Promise<Rate> {
    const rows: Rate[] = kind === 'sales-tax' ? await this.store.salesTax() : await this.store.withholding();
    const r = rows.find((x) => x.id === id);
    if (!r) throw new NotFoundError('Rate not found');
    return r;
  }

  private async currentRate(kind: RateKind, id: string, rowVersion: number) {
    const r = await this.rate(kind, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this rate. Reload and try again.');
    return r;
  }

  private async authority(id: string) {
    const a = (await this.store.authorities()).find((x) => x.id === id);
    if (!a) throw new NotFoundError('Authority not found');
    return a;
  }
}
