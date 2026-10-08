import { Injectable } from '@nestjs/common';
import { slabErrors, TAX_YEAR, type PayGroup, type PayGroupCreate, type PayGroupUpdate, type SessionUser, type TaxSlabInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertCodeFree } from '../../domain/codes.js';
import { PayGroupStore, TaxSlabStore } from './pay-group-store.js';

const notContiguous = (msg: string) => new ValidationError(msg, { slabs: [msg] }, { code: 'TAX_SLABS_NOT_CONTIGUOUS' });

/** Pay groups (payroll runs are per pay group) and salary income-tax slabs per tax year. */
@Injectable()
export class PayGroupsService {
  constructor(
    private readonly store: PayGroupStore,
    private readonly slabs: TaxSlabStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: PayGroupCreate): Promise<PayGroup> {
    assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'pay group');
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, status: 'ACTIVE' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: PayGroupUpdate): Promise<PayGroup> {
    const g = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== g.code) assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'pay group');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<PayGroup> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Employee salaries or payroll runs use this pay group. Deactivate it instead.', undefined, { code: 'PAY_GROUP_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  // ---------------------------------------------------------------- tax slabs
  taxYears(user: SessionUser) {
    return this.slabs.years(user.tenantId);
  }

  /**
   * Replaces a tax year's slabs, contiguous from 0. Unchanged slabs are left alone; when anything changes the year is
   * rewritten (old rows deleted, new rows inserted, both in row history), since renumbering in place would collide.
   */
  async saveYear(user: SessionUser, meta: RequestMeta, year: string, input: TaxSlabInput[]) {
    this.checkYear(year);
    const sorted = [...input].sort((a, b) => a.incomeFrom - b.incomeFrom);
    const e = slabErrors(sorted);
    if (e) throw notContiguous(e);
    const existing = (await this.slabs.years(user.tenantId)).find((y) => y.taxYear === year)?.slabs ?? [];
    const same = existing.length === sorted.length && existing.every((s, i) => {
      const n = sorted[i]!;
      return s.incomeFrom === n.incomeFrom && s.incomeTo === n.incomeTo && s.fixedTax === n.fixedTax && s.ratePercent === n.ratePercent;
    });
    if (!same) {
      await this.unitOfWork.run(actorContext(user, meta), async () => {
        await this.slabs.remove(user.tenantId, existing.map((s) => s.id));
        for (const [i, s] of sorted.entries()) await this.slabs.save({ taxYear: year, slabNo: i + 1, incomeFrom: s.incomeFrom, incomeTo: s.incomeTo, fixedTax: s.fixedTax, ratePercent: s.ratePercent });
      });
    }
    return (await this.slabs.years(user.tenantId)).find((y) => y.taxYear === year)!;
  }

  async copyYear(user: SessionUser, meta: RequestMeta, from: string, to: string) {
    this.checkYear(to);
    const years = await this.slabs.years(user.tenantId);
    const src = years.find((y) => y.taxYear === from);
    if (!src) throw new NotFoundError(`No slabs for ${from}`);
    if (years.some((y) => y.taxYear === to)) throw new ConflictError(`${to} already has slabs. Edit it instead.`, { taxYear: ['Already exists'] });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const s of src.slabs) await this.slabs.save({ taxYear: to, slabNo: s.slabNo, incomeFrom: s.incomeFrom, incomeTo: s.incomeTo, fixedTax: s.fixedTax, ratePercent: s.ratePercent });
    });
    return (await this.slabs.years(user.tenantId)).find((y) => y.taxYear === to)!;
  }

  async deleteYear(user: SessionUser, meta: RequestMeta, year: string) {
    const y = (await this.slabs.years(user.tenantId)).find((x) => x.taxYear === year);
    if (!y) throw new NotFoundError(`No slabs for ${year}`);
    await this.unitOfWork.run(actorContext(user, meta), () => this.slabs.remove(user.tenantId, y.slabs.map((s) => s.id)));
  }

  private checkYear(year: string) {
    if (!TAX_YEAR.test(year) || Number(year.slice(5)) !== (Number(year.slice(2, 4)) + 1) % 100) throw new ValidationError('Use a tax year like 2026-27', { taxYear: ['Like 2026-27'] });
  }

  private async get(user: SessionUser, id: string) {
    const g = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!g) throw new NotFoundError('Pay group not found');
    return g;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const g = await this.get(user, id);
    if (g.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this pay group. Reload and try again.');
    return g;
  }
}
