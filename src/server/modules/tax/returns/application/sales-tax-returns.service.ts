import { Injectable } from '@nestjs/common';
import type {
  SalesTaxReturnDetail, SalesTaxReturnPay, SalesTaxReturnPrepare, SalesTaxReturnQuery, SalesTaxReturnUpdate, SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { TaxStore } from '../../common/application/tax-store.js';

const money = (n: number) => n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const changed = () => new ConcurrencyError('This return was changed. Reload and try again.');
const notDraft = () => new ConflictError('This return is already filed and can\'t be changed.', undefined, { code: 'TAX_RETURN_NOT_DRAFT' });
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => `${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
const ntnOrCnic = (v: string | null) => {
  const digits = (v ?? '').replace(/-/g, '');
  return digits.length === 13 ? { ntn: '', cnic: digits } : { ntn: digits, cnic: '' };
};

/**
 * Monthly sales tax return (Sales Tax Act 1990): Prepare builds Annex-C (posted sales invoices, credit notes negative)
 * and Annex-A (posted vendor bills, debit notes negative) with totals, carry-forward and the 90% input cap. Validate →
 * File (locks the month's tax documents) → Pay (CPR + BPV). Drafts can flag Annex-A lines unmatched and are deleted, not
 * cancelled; filed returns are never changed.
 */
@Injectable()
export class SalesTaxReturnsService {
  constructor(private readonly store: TaxStore, private readonly unitOfWork: UnitOfWork) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  list(user: SessionUser, q: SalesTaxReturnQuery) {
    return this.store.listReturns(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<SalesTaxReturnDetail> {
    const r = await this.store.getReturn(user.tenantId, id);
    if (!r) throw new NotFoundError('Sales tax return not found');
    const f = await this.store.returnFacts(user.tenantId, r);
    const annexC = r.lines.filter((l) => l.annex === 'C');
    const annexCTax = annexC.reduce((s, l) => s + l.salesTax, 0);
    const glDiff = f.glOutputTax === null ? null : Math.round((f.glOutputTax - annexCTax) * 100) / 100;
    const checks: SalesTaxReturnDetail['checks'] = [
      { key: 'buyers', ok: f.annexCMissingTaxId === 0, title: f.annexCMissingTaxId === 0 ? 'All buyers have an NTN / CNIC' : `${f.annexCMissingTaxId} buyer(s) without NTN / CNIC`, detail: `${annexC.length - f.annexCMissingTaxId} of ${annexC.length} sales documents` },
      {
        key: 'gl', ok: glDiff === 0, title: 'Annex-C reconciles to the output tax account',
        detail: glDiff === null ? 'No output GST account is mapped' : `Difference Rs ${money(glDiff)}`,
      },
      {
        key: 'unmatched', ok: f.unmatched.count === 0,
        title: f.unmatched.count ? `${f.unmatched.count} unmatched input invoice(s)` : 'All input invoices matched',
        detail: f.unmatched.first ? `${f.unmatched.first.party ?? '—'} · Rs ${money(f.unmatched.tax)}` : `${r.annexACount} purchase documents`,
      },
      {
        key: 'fbr', ok: f.fbrReported === f.fbrRequired, title: f.fbrRequired ? 'Digital invoices synced with FBR' : 'No invoices queued for FBR reporting',
        detail: `${f.fbrReported} / ${f.fbrRequired}`,
      },
    ];
    return { ...r, checks, furtherTaxInvoices: f.furtherTaxInvoices, fbrSync: { reported: f.fbrReported, required: f.fbrRequired } };
  }

  async prepare(user: SessionUser, meta: RequestMeta, input: SalesTaxReturnPrepare) {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.prepareReturn(input.periodMonth, input.authority));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: SalesTaxReturnUpdate) {
    const r = await this.get(user, id);
    if (!['DRAFT', 'VALIDATED'].includes(r.status)) throw notDraft();
    if (r.rowVersion !== input.rowVersion) throw changed();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (!(await this.store.saveReturnDraft(user.tenantId, id, input.rowVersion, { remarks: input.remarks, excludeUnmatchedInput: input.excludeUnmatchedInput }))) throw changed();
      if (input.unmatchedLineIds) await this.store.setUnmatched(user.tenantId, id, input.unmatchedLineIds);
      await this.store.recalcReturn(id);
    });
    return this.get(user, id);
  }

  /** Validate (tax:approve): the draft is reviewed and ready to file. */
  async validate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.status !== 'DRAFT') throw new ConflictError('Only a draft return can be validated.', undefined, { code: 'TAX_RETURN_INVALID_STATE' });
    if (r.rowVersion !== rowVersion) throw changed();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (!(await this.store.setReturnStatus(user.tenantId, id, rowVersion, ['DRAFT'], 'VALIDATED'))) throw changed();
    });
    return this.get(user, id);
  }

  /** File (tax:post): the return is submitted on IRIS; the month's tax documents are locked from now on. */
  async file(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.status !== 'VALIDATED') throw new ConflictError('Validate the return before filing it.', undefined, { code: 'TAX_RETURN_INVALID_STATE' });
    if (r.rowVersion !== rowVersion) throw changed();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.fileReturn(id));
    return this.get(user, id);
  }

  async pay(user: SessionUser, meta: RequestMeta, id: string, input: SalesTaxReturnPay) {
    const r = await this.get(user, id);
    if (r.status !== 'FILED') throw new ConflictError('File the return before recording its payment.', undefined, { code: 'TAX_RETURN_INVALID_STATE' });
    if (r.rowVersion !== input.rowVersion) throw changed();
    if (await this.store.cprInUse(user.tenantId, input.cprNo)) throw new ConflictError('This CPR number is already recorded.', { cprNo: ['Already used'] }, { code: 'TAX_CPR_DUPLICATE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.payReturn(id, { cprNo: input.cprNo, paidOn: input.paidOn, paidAmount: input.paidAmount, bankAccountId: input.bankAccountId }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (!['DRAFT', 'VALIDATED'].includes(r.status)) throw notDraft();
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteReturn(user.tenantId, id, rowVersion)))) throw changed();
  }

  /** IRIS upload file for an annex (CSV, UTF-8). */
  async annexCsv(user: SessionUser, id: string, annex: 'A' | 'C') {
    const r = await this.get(user, id);
    const lines = r.lines.filter((l) => l.annex === annex);
    const period = r.periodMonth.slice(0, 7).replace('-', '');
    const fileName = `STR_${period}_ANNEX_${annex}.csv`;
    if (annex === 'C') {
      return {
        fileName,
        body: csv([
          ['Sr.', 'Buyer NTN', 'Buyer CNIC', 'Buyer Name', 'Buyer Type', 'Document Type', 'Document Number', 'Document Date', 'Rate', 'Value of Sales Excluding Sales Tax', 'Sales Tax', 'Further Tax'],
          ...lines.map((l, i) => {
            const t = ntnOrCnic(l.partyNtnCnic);
            return [i + 1, t.ntn, t.cnic, l.party ?? '', l.isRegistered ? 'Registered' : 'Unregistered', l.document?.kind === 'CREDIT_NOTE' ? 'Credit Note' : 'Sale Invoice',
              l.document?.no ?? '', l.documentDate ?? '', l.taxRate ?? '', l.valueExclTax.toFixed(2), l.salesTax.toFixed(2), l.furtherTax.toFixed(2)];
          }),
        ]),
      };
    }
    return {
      fileName,
      body: csv([
        ['Sr.', 'Supplier NTN', 'Supplier CNIC', 'Supplier Name', 'Supplier STRN', 'Document Type', 'Document Number', 'Document Date', 'Rate', 'Value Excluding Sales Tax', 'Input Tax', 'Match', 'Admissible'],
        ...lines.filter((l) => !(r.excludeUnmatchedInput && l.matchStatus === 'UNMATCHED')).map((l, i) => {
          const t = ntnOrCnic(l.partyNtnCnic);
          return [i + 1, t.ntn, t.cnic, l.party ?? '', l.partyStrn ?? '', l.document?.kind === 'DEBIT_NOTE' ? 'Debit Note' : 'Purchase Invoice', l.document?.no ?? '',
            l.documentDate ?? '', l.taxRate ?? '', l.valueExclTax.toFixed(2), l.salesTax.toFixed(2), l.matchStatus ?? '', l.isAdmissible ? 'Yes' : 'No'];
        }),
      ]),
    };
  }
}
