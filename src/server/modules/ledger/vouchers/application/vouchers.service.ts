import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ONE_SIDED, voucherErrors, type GlOptions, type SessionUser, type Voucher, type VoucherInput, type VoucherListQuery } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects, type ApprovalSubject } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService, type DocumentFacts } from '../../../approvals/application/approvals.service.js';
import { VoucherStore, type VoucherBase } from './voucher-store.js';

const details = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));
const notEditable = () => new ConflictError('Only draft vouchers can be changed or deleted. Reverse a posted voucher instead.', undefined, { code: 'VOUCHER_NOT_EDITABLE' });
/** Voucher types that can go through approval (opening-balance and system vouchers never do). */
const ROUTED = ['JV', 'CPV', 'CRV', 'BPV', 'BRV', 'CON'];
const TYPE_LABEL: Record<string, string> = { JV: 'Journal voucher', CPV: 'Cash payment', CRV: 'Cash receipt', BPV: 'Bank payment', BRV: 'Bank receipt', CON: 'Contra voucher', OB: 'Opening balance', SYSTEM: 'System voucher' };

/**
 * Journal vouchers: draft → (approval when a workflow applies) → posted; posted vouchers are only reversed. Cash and bank
 * vouchers are one-sided: the cash / bank leg is added as an auto-contra line. Vouchers are also the approval engine's
 * first subject (entity type VOUCHER, workflow subject VOUCHER).
 */
@Injectable()
export class VouchersService implements OnModuleInit {
  constructor(
    private readonly store: VoucherStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    const subject: ApprovalSubject = {
      entityTypes: ROUTED,
      workflowSubject: 'VOUCHER',
      link: (id) => `/accounting/vouchers/${id}`,
      lines: async (tenantId, id) => (await this.store.get(tenantId, id))?.lines.map((l) => ({ account: `${l.account.code} ${l.account.name}`, particulars: l.particulars, debit: l.debit, credit: l.credit })) ?? [],
      onApproved: async (tenantId, id, approverUserId, autoPost) => {
        await this.store.setState(tenantId, id, { approvedByUserId: approverUserId, approvedAt: new Date() });
        await this.store.addActivity(tenantId, id, approverUserId, 'APPROVED', autoPost ? 'Final approval · posted automatically' : 'Final approval');
        if (autoPost) await this.store.post(id);
      },
      onReturned: async (tenantId, id, action, reason, actorUserId) => {
        await this.store.setState(tenantId, id, { status: 'DRAFT' });
        if (reason) await this.store.addActivity(tenantId, id, actorUserId ?? null, 'COMMENT', `${action === 'REJECT' ? 'Rejected' : 'Changes requested'}: ${reason}`);
      },
      onComment: async (tenantId, id, userId, comment) => { await this.store.addActivity(tenantId, id, userId, 'COMMENT', comment); },
      comments: async (tenantId, id) => ((await this.store.get(tenantId, id))?.activities ?? [])
        .filter((a) => a.action === 'COMMENT').map((a) => ({ id: a.id, by: a.user, at: a.occurredAt, text: a.detail ?? '' })),
    };
    this.subjects.register(subject);
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  list(user: SessionUser, q: VoucherListQuery) {
    return this.store.list(user.tenantId, user.id, q);
  }

  async get(user: SessionUser, id: string): Promise<Voucher> {
    const v = await this.store.get(user.tenantId, id);
    if (!v) throw new NotFoundError('Voucher not found');
    const approval = await this.approvals.forEntity(user, v.voucherType, id);
    const routing = v.status === 'DRAFT' ? await this.approvals.preview(user.tenantId, 'VOUCHER', v.totalDebit, this.facts(v), v.preparedBy?.id ?? user.id) : null;
    return { ...v, approval, routing };
  }

  async create(user: SessionUser, meta: RequestMeta, input: VoucherInput): Promise<Voucher> {
    const opts = await this.store.options(user.tenantId);
    const lines = this.lines(input, opts);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...this.header(input), status: 'DRAFT', preparedByUserId: user.id, lines }));
    return this.get(user, id);
  }

  /**
   * A voucher another module raises for its own document (an imported bank statement line, …). Posted at once when no
   * workflow routes it, otherwise submitted for approval. Runs inside the caller's unit of work.
   */
  async createForSource(user: SessionUser, meta: RequestMeta, input: VoucherInput, source: { type: string; id: string; no: string | null } | null): Promise<Voucher> {
    const opts = await this.store.options(user.tenantId);
    const lines = this.lines(input, opts);
    return this.unitOfWork.run(actorContext(user, meta), async () => {
      const id = await this.store.save({ ...this.header(input), status: 'DRAFT', preparedByUserId: user.id, ...(source && { sourceDocType: source.type, sourceDocId: source.id, sourceDocNo: source.no }), lines });
      const v = (await this.store.get(user.tenantId, id))!;
      this.assertBalanced(v);
      const req = await this.approvals.submit(user, { entityType: v.voucherType, entityId: id, docLabel: v.docNo, title: v.narration, amount: v.totalDebit, branchId: v.branch.id, facts: this.facts(v) });
      if (req) await this.store.setState(user.tenantId, id, { status: 'PENDING_APPROVAL', submittedAt: new Date() });
      else await this.store.post(id);
      return this.get(user, id);
    });
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: VoucherInput & { rowVersion: number }): Promise<Voucher> {
    const v = await this.current(user, id, input.rowVersion);
    if (v.status !== 'DRAFT') throw notEditable();
    const opts = await this.store.options(user.tenantId);
    const known = new Set(v.lines.filter((l) => !l.isAutoContra).map((l) => l.id));
    const lines = this.lines({ ...input, lines: input.lines.map((l) => (l.id && known.has(l.id) ? l : { ...l, id: undefined })) }, opts);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ ...this.header(input), id, rowVersion: input.rowVersion, lines });
      await this.store.addActivity(user.tenantId, id, user.id, 'EDITED', null);
    });
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const v = await this.current(user, id, rowVersion);
    if (v.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, v.voucherType, id, 'Draft deleted');
      await this.store.deleteDraft(user.tenantId, id, rowVersion);
    });
  }

  /** Sends a balanced draft to the workflow that matches it (409 when none applies: post it instead). */
  async submit(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<Voucher> {
    const v = await this.current(user, id, rowVersion);
    if (v.status !== 'DRAFT') throw notEditable();
    this.assertBalanced(v);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const req = await this.approvals.submit(user, { entityType: v.voucherType, entityId: id, docLabel: v.docNo, title: v.narration, amount: v.totalDebit, branchId: v.branch.id, facts: this.facts(v) });
      if (!req) throw new ConflictError('No approval workflow applies to this voucher; post it directly.');
      await this.store.setState(user.tenantId, id, { status: 'PENDING_APPROVAL', submittedAt: new Date() });
    });
    return this.get(user, id);
  }

  /** Recalls a voucher waiting for approval back to draft. */
  async recall(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<Voucher> {
    const v = await this.current(user, id, rowVersion);
    if (v.status !== 'PENDING_APPROVAL') throw new ConflictError('Only a voucher waiting for approval can be recalled.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, v.voucherType, id, 'Recalled by the preparer');
      await this.store.setState(user.tenantId, id, { status: 'DRAFT' });
    });
    return this.get(user, id);
  }

  /** Posts a draft or an approved voucher. A voucher a workflow routes must be approved first. */
  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, postingDate?: string): Promise<Voucher> {
    const v = await this.current(user, id, rowVersion);
    if (v.status === 'POSTED') return this.get(user, id);
    if (v.status !== 'DRAFT' && v.status !== 'PENDING_APPROVAL') throw notEditable();
    this.assertBalanced(v);
    const status = await this.approvals.status(user.tenantId, v.voucherType, id);
    if (status !== 'APPROVED') {
      const routed = await this.approvals.route(user.tenantId, 'VOUCHER', v.totalDebit, this.facts(v));
      if (routed || status === 'PENDING') throw new ConflictError('This voucher needs approval before it can be posted. Submit it for approval.', undefined, { code: 'VOUCHER_APPROVAL_REQUIRED' });
    }
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (postingDate && postingDate !== v.postingDate && v.status === 'DRAFT') await this.store.save({ id, postingDate });
      await this.store.post(id);
    });
    return this.get(user, id);
  }

  async reverse(user: SessionUser, meta: RequestMeta, id: string, input: { reversalDate: string; reason: string; remarks: string | null; rowVersion: number }): Promise<Voucher> {
    const v = await this.current(user, id, input.rowVersion);
    if (v.status !== 'POSTED') throw new ConflictError(v.status === 'REVERSED' ? 'This voucher is already reversed.' : 'Only posted vouchers can be reversed.');
    if (input.reversalDate < v.postingDate) throw new ValidationError('The reversal can’t be dated before the voucher', { reversalDate: [`On or after ${v.postingDate}`] });
    const newId = await this.unitOfWork.run(actorContext(user, meta), () => this.store.reverse(id, input.reversalDate, input.reason, input.remarks));
    return this.get(user, newId);
  }

  async duplicate(user: SessionUser, meta: RequestMeta, id: string): Promise<Voucher> {
    const v = await this.get(user, id);
    if (v.voucherType === 'OB' || v.voucherType === 'SYSTEM') throw new ValidationError('System and opening-balance vouchers can’t be duplicated.');
    const today = new Date().toISOString().slice(0, 10);
    const input: VoucherInput = {
      voucherType: v.voucherType as VoucherInput['voucherType'], docDate: today, postingDate: today, referenceNo: v.referenceNo, branchId: v.branch.id, department: v.department,
      narration: v.narration, remarks: v.remarks, tags: v.tags, cashBankAccountId: v.cashBankAccount?.id ?? null, partyName: v.partyName,
      instrumentType: null, instrumentNo: null, instrumentDate: null, autoReverseOn: null,
      lines: v.lines.filter((l) => !l.isAutoContra).map((l) => ({ accountId: l.account.id, particulars: l.particulars, debit: l.debit, credit: l.credit, costCentreId: l.costCentre?.id ?? null })),
    };
    const opts = await this.store.options(user.tenantId);
    const newId = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const created = await this.store.save({ ...this.header(input), status: 'DRAFT', preparedByUserId: user.id, lines: this.lines(input, opts) });
      await this.store.addActivity(user.tenantId, id, user.id, 'DUPLICATED', `Copied to a new draft`);
      return created;
    });
    return this.get(user, newId);
  }

  async comment(user: SessionUser, meta: RequestMeta, id: string, comment: string): Promise<Voucher> {
    await this.get(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.addActivity(user.tenantId, id, user.id, 'COMMENT', comment));
    return this.get(user, id);
  }

  async printed(user: SessionUser, meta: RequestMeta, id: string) {
    await this.get(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.addActivity(user.tenantId, id, user.id, 'PRINTED', null));
  }

  // ---------------------------------------------------------------- helpers
  private header(v: VoucherInput) {
    return {
      voucherType: v.voucherType, docDate: v.docDate, postingDate: v.postingDate, referenceNo: v.referenceNo, branchId: v.branchId, department: v.department,
      narration: v.narration, remarks: v.remarks, tags: v.tags, cashBankAccountId: ONE_SIDED[v.voucherType] ? v.cashBankAccountId : null, partyName: v.partyName,
      instrumentType: v.instrumentType, instrumentNo: v.instrumentNo, instrumentDate: v.instrumentDate, autoReverseOn: v.voucherType === 'JV' ? v.autoReverseOn : null,
    };
  }

  /** Validates and numbers the lines; one-sided vouchers get their cash / bank leg as an auto-contra line. */
  private lines(v: VoucherInput, opts: GlOptions) {
    const e = voucherErrors(v);
    const postable = new Set(opts.accounts.map((a) => a.id));
    const cashBank = new Set([...opts.cashAccounts, ...opts.bankAccounts].map((a) => a.accountId));
    v.lines.forEach((l, i) => {
      if (!postable.has(l.accountId)) e[`lines.${i}.accountId`] = 'Choose an active postable account';
      else if (v.voucherType === 'CON' && !cashBank.has(l.accountId)) e[`lines.${i}.accountId`] = 'A contra voucher moves money between cash and bank accounts only';
      if (l.costCentreId && !opts.costCentres.some((c) => c.id === l.costCentreId)) e[`lines.${i}.costCentreId`] = 'Choose an active cost centre';
    });
    const side = ONE_SIDED[v.voucherType];
    if (side && v.cashBankAccountId) {
      const list = v.voucherType.startsWith('C') ? opts.cashAccounts : opts.bankAccounts;
      if (!list.some((a) => a.accountId === v.cashBankAccountId)) e.cashBankAccountId = v.voucherType.startsWith('C') ? 'Choose a cash account' : 'Choose a bank account';
    }
    if (Object.keys(e).length) {
      const unbalanced = !!e.lines && /Unbalanced|at least/.test(e.lines) && Object.keys(e).length === 1;
      throw new ValidationError(Object.values(e)[0]!, details(e), unbalanced ? { code: 'VOUCHER_UNBALANCED' } : undefined);
    }
    const out: Record<string, unknown>[] = v.lines.map((l, i) => ({ ...(l.id && { id: l.id }), lineNo: i + 1, accountId: l.accountId, particulars: l.particulars, debit: l.debit, credit: l.credit, costCentreId: l.costCentreId, isAutoContra: false }));
    if (side) {
      const total = Math.round(v.lines.reduce((s, l) => s + l.debit + l.credit, 0) * 100) / 100;
      out.push({ lineNo: out.length + 1, accountId: v.cashBankAccountId, particulars: v.partyName ?? v.narration.slice(0, 200), debit: side === 'CREDIT' ? total : 0, credit: side === 'DEBIT' ? total : 0, costCentreId: null, isAutoContra: true });
    }
    return out;
  }

  private assertBalanced(v: VoucherBase) {
    if (v.lines.length < 2 || Math.round(v.totalDebit * 100) !== Math.round(v.totalCredit * 100) || v.totalDebit <= 0) {
      throw new ValidationError('Debits must equal credits, with at least two lines and an amount above zero.', undefined, { code: 'VOUCHER_UNBALANCED' });
    }
  }

  /** The facts workflows are matched on. */
  private facts(v: VoucherBase): DocumentFacts {
    const cc = v.lines.find((l) => l.costCentre)?.costCentre?.id;
    return { DOC_TYPE: v.voucherType, BRANCH: v.branch.id, ...(v.department && { DEPARTMENT: v.department }), ...(cc && { COST_CENTRE: cc }), TITLE: TYPE_LABEL[v.voucherType] ?? v.voucherType };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const v = await this.store.get(user.tenantId, id);
    if (!v) throw new NotFoundError('Voucher not found');
    if (v.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this voucher. Reload and try again.');
    return v;
  }
}
