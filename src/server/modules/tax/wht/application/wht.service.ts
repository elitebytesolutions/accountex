import { Injectable } from '@nestjs/common';
import type { SessionUser, WhtChallanInput, WhtDeductionInput, WhtQuery, WhtSummary } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { TaxStore } from '../../common/application/tax-store.js';
import { fiscalQuarter, monthStart, whtDueDate } from '../domain/tax-periods.js';

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const locked = () => new ConflictError('Only unpaid deductions entered by hand can be changed or deleted.', undefined, { code: 'WHT_DEDUCTION_LOCKED' });

/**
 * Withholding tax register and challans. Posting fills the register (DB triggers); deductions can also be entered by
 * hand. A challan pays one month's unpaid deductions of the chosen sections: its amount must match them; posting links
 * them (PAID) and posts the BPV (Dr the section's payable, Cr bank). Cancelling reverses the BPV and frees them.
 */
@Injectable()
export class WhtService {
  constructor(private readonly store: TaxStore, private readonly unitOfWork: UnitOfWork) {}

  list(user: SessionUser, q: WhtQuery) {
    return this.store.listDeductions(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const d = await this.store.getDeduction(user.tenantId, id);
    if (!d) throw new NotFoundError('Deduction not found');
    return d;
  }

  async summary(user: SessionUser, period?: string): Promise<WhtSummary> {
    const p = monthStart(period ?? today());
    const q = fiscalQuarter(p);
    const [rows, suffered, challans, statements] = await Promise.all([
      this.store.sectionSummary(user.tenantId, p), this.store.sufferedTotal(user.tenantId, p),
      this.store.listChallans(user.tenantId, q.from, q.to), this.store.listStatements(user.tenantId),
    ]);
    const st = statements.find((s) => s.returnType === 'QUARTERLY_165' && s.periodFrom === q.from) ?? null;
    return {
      period: p,
      sections: rows.map((r) => ({
        direction: r.direction, whtSection: r.whtSection, transactions: r.transactions, taxableAmount: r.taxableAmount,
        rate: r.rates.length === 1 ? r.rates[0]! : null, taxAmount: r.taxAmount, unpaid: r.unpaid,
        status: r.unpaid === 0 ? 'PAID' : r.unpaid < r.taxAmount ? 'PART_PAID' : 'UNPAID',
      })),
      deducted: r2(rows.reduce((s, r) => s + r.taxAmount, 0)),
      transactions: rows.reduce((s, r) => s + r.transactions, 0),
      unpaid: r2(rows.reduce((s, r) => s + r.unpaid, 0)),
      dueDate: whtDueDate(p),
      depositedQuarter: r2(challans.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.amount, 0)),
      quarterLabel: q.label,
      statement: st ? { label: st.label, dueDate: st.dueDate, status: st.status } : { label: q.label, dueDate: q.dueDate, status: 'NOT_PREPARED' },
      suffered,
    };
  }

  private check(input: WhtDeductionInput) {
    if (input.direction === 'DEDUCTED' && input.customerId) throw new ValidationError('Tax deducted is from a vendor or employee', { customerId: ['Not for deductions'] });
    if (input.direction !== 'DEDUCTED' && (input.vendorId || input.employeeId)) throw new ValidationError('Collected / suffered tax is with a customer', { vendorId: ['Choose a customer'] });
    if (input.taxAmount > input.taxableAmount && input.taxableAmount > 0) throw new ValidationError('Tax is more than the taxable amount', { taxAmount: ['More than the taxable amount'] });
  }

  async create(user: SessionUser, meta: RequestMeta, input: WhtDeductionInput) {
    this.check(input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.createDeduction(user.tenantId, input));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: WhtDeductionInput & { rowVersion: number }) {
    const d = await this.get(user, id);
    if (d.source || d.status !== 'UNPAID' || d.certificate) throw locked();
    if (d.rowVersion !== input.rowVersion) throw new ConcurrencyError('This deduction was changed. Reload and try again.');
    this.check(input);
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.updateDeduction(user.tenantId, id, input.rowVersion, input)))) throw locked();
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const d = await this.get(user, id);
    if (d.source || d.status !== 'UNPAID' || d.certificate) throw locked();
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDeduction(user.tenantId, id, rowVersion)))) throw new ConcurrencyError('This deduction was changed. Reload and try again.');
  }

  // ---------------------------------------------------------------- challans
  listChallans(user: SessionUser, from: string | null, to: string | null) {
    return this.store.listChallans(user.tenantId, from, to);
  }

  async getChallan(user: SessionUser, id: string) {
    const c = await this.store.getChallan(user.tenantId, id);
    if (!c) throw new NotFoundError('Challan not found');
    return c;
  }

  /** Unpaid total of a month's sections: the amount a challan for them must carry. */
  unpaid(user: SessionUser, period: string, sections: string[]) {
    return this.store.unpaidTotal(user.tenantId, monthStart(period), sections).then((amount) => ({ amount }));
  }

  async createChallan(user: SessionUser, meta: RequestMeta, input: WhtChallanInput) {
    const due = await this.store.unpaidTotal(user.tenantId, input.periodMonth, input.sections);
    if (r2(due) !== r2(input.amount)) {
      throw new ValidationError(`The unpaid deductions of these sections total ${due.toFixed(2)}`, { amount: [`Must equal ${due.toFixed(2)}`] }, { code: 'WHT_CHALLAN_AMOUNT_MISMATCH' });
    }
    if (await this.store.cprInUse(user.tenantId, input.cprNo)) throw new ConflictError('This CPR number is already recorded.', { cprNo: ['Already used'] }, { code: 'TAX_CPR_DUPLICATE' });
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const cid = await this.store.saveChallan({
        periodMonth: input.periodMonth, sections: input.sections, cprNo: input.cprNo, paymentDate: input.paymentDate, bankAccountId: input.bankAccountId,
        amount: input.amount, remarks: input.remarks,
      });
      if (input.post) await this.store.payChallan(cid);
      return cid;
    });
    return this.getChallan(user, id);
  }

  async postChallan(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.getChallan(user, id);
    if (c.status !== 'DRAFT') throw new ConflictError('This challan is already paid or cancelled.', undefined, { code: 'WHT_CHALLAN_NOT_DRAFT' });
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('This challan was changed. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.payChallan(id));
    return this.getChallan(user, id);
  }

  async cancelChallan(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string | null) {
    const c = await this.getChallan(user, id);
    if (c.status === 'CANCELLED') throw new ConflictError('This challan is already cancelled.', undefined, { code: 'WHT_CHALLAN_NOT_DRAFT' });
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('This challan was changed. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.cancelChallan(id, reason));
    return this.getChallan(user, id);
  }

  async removeChallan(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.getChallan(user, id);
    if (c.status !== 'DRAFT') throw new ConflictError('A paid challan is cancelled, not deleted.', undefined, { code: 'WHT_CHALLAN_NOT_DRAFT' });
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteChallan(user.tenantId, id, rowVersion)))) throw new ConcurrencyError('This challan was changed. Reload and try again.');
  }
}
