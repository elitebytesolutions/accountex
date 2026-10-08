import { Injectable } from '@nestjs/common';
import {
  coaAccountRow, coaTreeErrors, parseCoaCsv,
  type AdminSession, type CoaImportReport, type CoaTemplateAccountInput, type CoaTemplateCreate, type CoaTemplateDetail, type CoaTemplateImport, type CoaTemplateUpdate,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { coaEditable, nextCoaStatus, type CoaStatusAction } from '../domain/coa-status.js';
import { CoaTemplateStore } from './coa-template-store.js';

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const details = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));
const statusError = (message: string) => new ConflictError(message, undefined, { code: 'COA_TEMPLATE_STATUS' });

/**
 * COA templates (Tenants › Templates): the account trees tenants apply on demand. The tree is saved whole
 * (accounts[] replaces it), checked against the code / parent / nature rules first.
 */
@Injectable()
export class CoaTemplatesService {
  constructor(
    private readonly store: CoaTemplateStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list();
  }

  async get(id: string): Promise<CoaTemplateDetail> {
    const t = await this.store.get(id);
    if (!t) throw new NotFoundError('Template not found');
    return t;
  }

  /** A new DRAFT, blank or with a copy of another template's accounts. */
  async create(admin: AdminSession, meta: RequestMeta, input: CoaTemplateCreate): Promise<CoaTemplateDetail> {
    await this.assertCodeFree(input.code, null);
    const { copyFromId, ...fields } = input;
    const accounts = copyFromId ? (await this.get(copyFromId)).accounts.map(({ code, name, nature, subType, defaultRole }) => ({ code, name, nature: nature as 'DR' | 'CR', subType, defaultRole })) : [];
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.save({ ...fields, status: 'DRAFT', accounts: accounts.map((a) => coaAccountRow(a)) }));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: CoaTemplateUpdate): Promise<CoaTemplateDetail> {
    const t = await this.current(id, input.rowVersion);
    if (!coaEditable(t.status)) throw statusError('A retired template is read-only. Publish it again to edit it.');
    const { rowVersion, accounts, ...rest } = input;
    const patch = defined(rest) as Partial<CoaTemplateUpdate>;
    if (patch.code && patch.code !== t.code) {
      if (t.status !== 'DRAFT') throw statusError('Only a draft template can change its code.');
      await this.assertCodeFree(patch.code, id);
    }
    if (accounts) {
      const known = new Set(t.accounts.map((a) => a.id));
      if (accounts.some((a) => a.id && !known.has(a.id))) throw new ValidationError('Unknown account row', { accounts: ['Reload and try again'] });
      this.checkTree(accounts, t.status !== 'DRAFT');
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.save({ ...patch, id, rowVersion, ...(accounts && { accounts: accounts.map((a) => coaAccountRow(a)) }) }));
    return this.get(id);
  }

  /** Publish / retire / make default. Making a template the default turns the previous default into PUBLISHED. */
  async setStatus(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number, action: CoaStatusAction): Promise<CoaTemplateDetail> {
    const t = await this.current(id, rowVersion);
    const next = nextCoaStatus(t.status, action);
    if ('error' in next) throw statusError(next.error);
    if (next.status !== 'RETIRED') this.checkTree(t.accounts.map((a) => ({ ...a, nature: a.nature as 'DR' | 'CR' })), true);
    const previous = next.status === 'DEFAULT' ? (await this.store.list()).filter((x) => x.status === 'DEFAULT' && x.id !== id) : [];
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      for (const p of previous) await this.store.save({ id: p.id, rowVersion: p.rowVersion, status: 'PUBLISHED' });
      await this.store.save({ id, rowVersion, status: next.status });
    });
    return this.get(id);
  }

  /**
   * CSV import (template "Import from Excel"): validates every line and reports the issues; when valid and not a dry
   * run, the file replaces the template's tree (accounts keep their row id by code, so unchanged rows leave no history).
   */
  async importCsv(admin: AdminSession, meta: RequestMeta, id: string, input: CoaTemplateImport): Promise<CoaImportReport> {
    const t = await this.current(id, input.rowVersion);
    if (!coaEditable(t.status)) throw statusError('A retired template is read-only. Publish it again to edit it.');
    const { accounts, issues } = parseCoaCsv(input.csv);
    const report: CoaImportReport = { valid: issues.length === 0, accounts: accounts.length, postable: accounts.filter((a) => a.code.includes('-')).length, issues, saved: false };
    if (!report.valid || input.dryRun) return report;
    const byCode = new Map(t.accounts.map((a) => [a.code, a.id]));
    await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.save({ id, rowVersion: input.rowVersion, accounts: accounts.map((a) => coaAccountRow({ ...a, id: byCode.get(a.code) })) }));
    return { ...report, saved: true };
  }

  /** Only an unused draft can be deleted; otherwise retire it. */
  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const t = await this.current(id, rowVersion);
    if (t.status !== 'DRAFT' || (await this.store.inUse(id))) {
      throw new ConflictError(t.status !== 'DRAFT' ? 'Only a draft template can be deleted. Retire it instead.' : 'Tenants use this template. Retire it instead.', undefined, { code: 'COA_TEMPLATE_IN_USE' });
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.remove(id, rowVersion));
  }

  /** Tree rules (400 COA_TEMPLATE_TREE_INVALID with the bad rows); a template tenants can apply must have accounts. */
  private checkTree(accounts: CoaTemplateAccountInput[], needAccounts: boolean) {
    const e = coaTreeErrors(accounts);
    if (Object.keys(e).length) throw new ValidationError(`${Object.keys(e).length} account row${Object.keys(e).length === 1 ? ' has' : 's have'} errors: ${Object.values(e)[0]}`, details(e), { code: 'COA_TEMPLATE_TREE_INVALID' });
    if (needAccounts && !accounts.length) throw new ValidationError('Add the accounts first: a published template needs an account tree.', { accounts: ['Add accounts'] }, { code: 'COA_TEMPLATE_TREE_INVALID' });
  }

  private async assertCodeFree(code: string, id: string | null) {
    if ((await this.store.allCodes()).some((c) => c.id !== id && c.code === code)) {
      throw new ConflictError(`A template with code ${code} already exists.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(id: string, rowVersion: number) {
    const t = await this.get(id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
    return t;
  }
}
