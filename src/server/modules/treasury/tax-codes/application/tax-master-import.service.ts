import { Injectable } from '@nestjs/common';
import type { SalesTaxRate, SessionUser, TaxMasterImportResult, WithholdingRate } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, ValidationError } from '../../../../core/domain/errors.js';
import { TaxCodeStore } from './tax-code-store.js';
import { salesTaxCodes, withholdingCodes, type ImportedCode } from './tax-master-import.js';

/** Port: the published Tax Master rows a company can import, and the company's default posting accounts. */
export abstract class TaxMasterSource {
  /** Published rows still in force or scheduled (not superseded), oldest first. */
  abstract salesTax(): Promise<SalesTaxRate[]>;
  abstract withholding(): Promise<WithholdingRate[]>;
  /** Company.DefaultAccountMappings: posting role → account id. */
  abstract defaultAccounts(tenantId: string): Promise<Map<string, string>>;
}

const dayBefore = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
};

/**
 * Tax › Tax Codes › "Import from Tax Master" (Phase 37): copies the published master rates into the company's tax
 * codes. A missing code is created with the master rate; an existing one gets the new rate period (the open period
 * before it is closed the day before). Rows whose period is already there are skipped; when nothing is new → 409.
 */
@Injectable()
export class TaxMasterImportService {
  constructor(
    private readonly source: TaxMasterSource,
    private readonly codes: TaxCodeStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async importMaster(user: SessionUser, meta: RequestMeta): Promise<TaxMasterImportResult> {
    const [salesTax, withholding, accounts] = await Promise.all([this.source.salesTax(), this.source.withholding(), this.source.defaultAccounts(user.tenantId)]);
    const wanted: ImportedCode[] = [...salesTaxCodes(salesTax), ...withholdingCodes(withholding)].sort((a, b) => (a.rate.effectiveFrom < b.rate.effectiveFrom ? -1 : 1));
    if (!wanted.length) throw new ConflictError('The Tax Master has no published rates yet.', undefined, { code: 'TAX_MASTER_NOT_PUBLISHED' });

    const account = (roles: string[]) => roles.map((r) => accounts.get(r)).find(Boolean) ?? null;
    const missing = [...new Set(wanted.filter((w) => !account(w.accountRoles)).map((w) => w.accountRoles[0]!))];
    if (missing.length) {
      throw new ValidationError(`Map the ${missing.join(', ')} account${missing.length > 1 ? 's' : ''} in Settings › Finance › Default accounts first.`, { accountId: missing }, { code: 'TAX_MASTER_ACCOUNT_MISSING' });
    }

    const retired = new Set(await this.codes.retiredCodes(user.tenantId));
    const result: TaxMasterImportResult = { created: [], ratesAdded: [], skipped: [] };
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const w of wanted) {
        const label = `${w.code} from ${w.rate.effectiveFrom}`;
        if (retired.has(w.code)) { result.skipped.push(`${label} (code belonged to a deleted tax code)`); continue; }
        const existing = (await this.codes.list(user.tenantId)).find((c) => c.code === w.code);
        if (!existing) {
          await this.codes.save({
            code: w.code, description: w.description, taxType: w.taxType, appliesTo: w.appliesTo, rateBasis: 'PERCENT', salesTaxKind: w.salesTaxKind,
            whtSection: w.whtSection, whtNature: w.whtNature, accountId: account(w.accountRoles), inputAccountId: w.inputAccountRoles ? account(w.inputAccountRoles) : null,
            fbrReference: w.fbrReference, checkAtl: w.checkAtl, calcOnExclSalesTax: true, rates: [w.rate],
          });
          result.created.push(label);
          continue;
        }
        if (existing.rates.some((r) => r.effectiveFrom === w.rate.effectiveFrom)) { result.skipped.push(`${label} (already imported)`); continue; }
        if (existing.rates.some((r) => r.effectiveFrom > w.rate.effectiveFrom)) { result.skipped.push(`${label} (a later rate period exists)`); continue; }
        // Close the period in force, then add the master period (rows with an id are kept; order: updates first).
        const rates = existing.rates.map((r) => ({
          id: r.id, effectiveFrom: r.effectiveFrom, rate: r.rate, nonAtlRate: r.nonAtlRate, financeAct: r.financeAct, remarks: r.remarks,
          effectiveTo: r.effectiveTo === null || r.effectiveTo >= w.rate.effectiveFrom ? dayBefore(w.rate.effectiveFrom) : r.effectiveTo,
        }));
        await this.codes.save({ id: existing.id, rowVersion: existing.rowVersion, rates: [...rates, w.rate] });
        result.ratesAdded.push(label);
      }
    });
    if (!result.created.length && !result.ratesAdded.length) {
      throw new ConflictError('These Tax Master rates are already imported for their periods.', { codes: result.skipped }, { code: 'TAX_MASTER_ALREADY_IMPORTED' });
    }
    return result;
  }
}
