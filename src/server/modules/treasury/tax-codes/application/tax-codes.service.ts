import { Injectable } from '@nestjs/common';
import { ratesOverlap, taxCodeErrors, type SessionUser, type TaxCode, type TaxCodeCreate, type TaxCodeUpdate } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { GlLinks } from '../../gl-links/application/gl-links.js';
import { TaxCodeStore } from './tax-code-store.js';

const fieldErrors = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));
const retired = (code: string) =>
  new ConflictError(`Code ${code} belonged to a deleted tax code and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });

type Checked = {
  taxType: string;
  rateBasis: string;
  salesTaxKind: string | null;
  whtSection: string | null;
  accountId: string | null;
  inputAccountId: string | null;
  rates: { effectiveFrom: string; effectiveTo: string | null; rate: number | null }[];
};

/** Tax codes: sales tax, further tax and withholding, with dated rates and their GL accounts. */
@Injectable()
export class TaxCodesService {
  constructor(
    private readonly store: TaxCodeStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<TaxCode> {
    const t = await this.store.get(user.tenantId, id);
    if (!t) throw new NotFoundError('Tax code not found');
    return t;
  }

  async create(user: SessionUser, meta: RequestMeta, input: TaxCodeCreate): Promise<TaxCode> {
    if ((await this.store.retiredCodes(user.tenantId)).includes(input.code)) throw retired(input.code);
    await this.check(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(input));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: TaxCodeUpdate): Promise<TaxCode> {
    const t = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== t.code && (await this.store.retiredCodes(user.tenantId)).includes(input.code)) throw retired(input.code);
    if (input.rates?.some((r) => r.id && !t.rates.some((x) => x.id === r.id))) throw new ValidationError('Unknown rate row', { rates: ['Reload and try again'] });
    await this.check(user, {
      taxType: input.taxType ?? t.taxType,
      rateBasis: input.rateBasis ?? t.rateBasis,
      salesTaxKind: input.salesTaxKind !== undefined ? input.salesTaxKind : t.salesTaxKind,
      whtSection: input.whtSection !== undefined ? input.whtSection : t.whtSection,
      accountId: input.accountId !== undefined ? input.accountId : (t.account?.id ?? null),
      inputAccountId: input.inputAccountId !== undefined ? input.inputAccountId : (t.inputAccount?.id ?? null),
      rates: input.rates ?? t.rates,
    });
    // Rates are replaced by id: rows sent with an id are kept/updated, missing ones removed, new ones inserted.
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, isActive: boolean, rowVersion: number): Promise<TaxCode> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const t = await this.current(user, id, rowVersion);
    if (t.isSystem || (await this.store.inUse(id))) {
      throw new ConflictError('This tax code is used on documents or settings. Deactivate it instead.', undefined, { code: 'TAX_CODE_IN_USE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async check(user: SessionUser, t: Checked) {
    const errors = taxCodeErrors(t);
    if (Object.keys(errors).length) throw new ValidationError('Check the highlighted fields', fieldErrors(errors));
    if (ratesOverlap(t.rates)) throw new ValidationError('Rate periods overlap', { rates: ['Rate periods overlap'] }, { code: 'TAX_RATE_OVERLAP' });
    if (t.accountId) await this.gl.postable(user, t.accountId, 'accountId', [1, 2]);
    if (t.inputAccountId) await this.gl.postable(user, t.inputAccountId, 'inputAccountId', [1, 2]);
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const t = await this.get(user, id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this tax code. Reload and try again.');
    return t;
  }
}
