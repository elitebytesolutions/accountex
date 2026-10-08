import { Injectable } from '@nestjs/common';
import {
  seedSalaryErrors, seedTaxCodeErrors,
  type AdminSession, type SeedLeaveTypeCreate, type SeedLeaveTypeUpdate, type SeedListKind, type SeedSalaryComponentCreate,
  type SeedSalaryComponentUpdate, type SeedTaxCodeCreate, type SeedTaxCodeUpdate,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { SeedStore } from './seed-store.js';

type Row = { id: string; rowVersion: number; seedVersion: string };
type Create = SeedLeaveTypeCreate | SeedSalaryComponentCreate | SeedTaxCodeCreate;
type Update = SeedLeaveTypeUpdate | SeedSalaryComponentUpdate | SeedTaxCodeUpdate;

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const NOUN: Record<SeedListKind, string> = { 'leave-types': 'leave type', 'salary-components': 'salary component', 'tax-codes': 'tax code' };
/** Cross-field rules of each list, checked on the merged record (create schemas check them too). */
const RULES: Record<SeedListKind, (r: Record<string, unknown>) => Record<string, string>> = {
  'leave-types': () => ({}),
  'salary-components': (r) => seedSalaryErrors(r),
  'tax-codes': (r) => seedTaxCodeErrors(r),
};

/**
 * Master seed lists (Templates › Master seed lists): leave types, salary components and tax codes per seed version.
 * Tenant onboarding (Phase 40) copies them into a new company; editing them never changes existing companies.
 * A duplicate name / code within a seed version is rejected by the database (409 DB_UNIQUE_VIOLATION).
 */
@Injectable()
export class SeedTemplatesService {
  constructor(
    private readonly store: SeedStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(kind: SeedListKind): Promise<Row[]> {
    return kind === 'leave-types' ? this.store.leaveTypes() : kind === 'salary-components' ? this.store.salaryComponents() : this.store.taxCodes();
  }

  async get(kind: SeedListKind, id: string): Promise<Row> {
    const r = (await this.list(kind)).find((x) => x.id === id);
    if (!r) throw new NotFoundError(`Seed ${NOUN[kind]} not found`);
    return r;
  }

  async create(admin: AdminSession, meta: RequestMeta, kind: SeedListKind, input: Create): Promise<Row> {
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save(kind, defined(input)));
    return this.get(kind, id);
  }

  async update(admin: AdminSession, meta: RequestMeta, kind: SeedListKind, id: string, input: Update): Promise<Row> {
    const row = await this.current(kind, id, input.rowVersion);
    const { rowVersion, ...rest } = input;
    const patch = defined(rest);
    const e = RULES[kind]({ ...row, ...patch });
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save(kind, { ...patch, id, rowVersion }));
    return this.get(kind, id);
  }

  async delete(admin: AdminSession, meta: RequestMeta, kind: SeedListKind, id: string, rowVersion: number): Promise<void> {
    await this.current(kind, id, rowVersion);
    if (await this.store.inUse(kind, id)) {
      throw new ConflictError(`Companies were seeded from this ${NOUN[kind]}. ${kind === 'tax-codes' ? 'Deactivate it' : 'Move it to a new seed version'} instead.`, undefined, { code: 'CONFLICT' });
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.remove(kind, id, rowVersion));
  }

  private async current(kind: SeedListKind, id: string, rowVersion: number) {
    const r = await this.get(kind, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError(`Someone else changed this ${NOUN[kind]}. Reload and try again.`);
    return r;
  }
}
