import { Injectable, type OnModuleInit } from '@nestjs/common';
import { payrollMonthBounds, payrollTaxYearOf, type PayrollAdjustmentsInput, type PayrollRun, type RunCreate, type RunPay, type RunPreview, type RunUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { ComponentStore } from '../../components/application/component-store.js';
import { TaxSlabStore } from '../../pay-groups/application/pay-group-store.js';
import { StructureStore } from '../../structures/application/structure-store.js';
import { calculatePay, SetupMissing, type CalcComponent } from '../domain/payroll-calculator.js';
import { RunStore, type RunBase, type RunScope } from './run-store.js';

const OPEN = ['DRAFT', 'REVIEW'];
const locked = (r: { docNo: string; status: string }, what: string) =>
  new ConflictError(`${r.docNo} is ${r.status.replace(/_/g, ' ').toLowerCase()}: ${what}.`, undefined, { code: 'PAYROLL_RUN_LOCKED' });
const setupMissing = (m: string) => new ConflictError(m, undefined, { code: 'PAYROLL_SETUP_MISSING' });
const mask = (iban: string | null) => (iban ? `${iban.replace(/\s+/g, '').slice(0, 8)} •••• ${iban.replace(/\s+/g, '').slice(-4)}` : null);

const CHECKLIST = [
  ['ATTENDANCE_CUTOFF', 'Attendance cut-off applied'],
  ['OVERTIME_APPROVED', 'Overtime approved by managers'],
  ['UNPAID_LEAVE_VERIFIED', 'Unpaid leave verified'],
  ['LOANS_RECONCILED', 'Loan installments reconciled'],
  ['TAX_PROJECTED', 'Tax computed on projected annual income'],
  ['STATUTORY_APPLIED', 'EOBI / PESSI / PF ceilings applied'],
  ['VARIANCES_EXPLAINED', 'Variances above 15% explained'],
  ['BANK_DETAILS_CHECKED', 'Missing IBANs paid by cheque or cash'],
  ['BANK_BALANCE', 'Bank balance sufficient'],
] as const;

/**
 * Payroll runs: create (period & scope), inputs (approved overtime pushed in, one-time adjustments), calculate
 * (PayrollCalculator per employee), submit to the approval engine (subject PAYROLL_RUN; the preparer never approves),
 * post (accrual JV, installments recovered, payslips), pay (bank / cash voucher per batch), cancel, reverse.
 */
@Injectable()
export class RunsService implements OnModuleInit {
  constructor(
    private readonly store: RunStore,
    private readonly structures: StructureStore,
    private readonly components: ComponentStore,
    private readonly slabs: TaxSlabStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['PRUN'],
      workflowSubject: 'PAYROLL_RUN',
      link: (id) => `/hr/payroll/runs/${id}`,
      lines: async (tenantId, id) => {
        const r = await this.store.get(tenantId, id);
        if (!r) return [];
        return (await this.store.glPreview(tenantId, id, r.salaryPayableAccount.id)).map((l) => ({ account: `${l.account.code} ${l.account.name}`, particulars: l.particulars, debit: l.debit, credit: l.credit }));
      },
      onApproved: async (_tenantId, id) => { await this.store.call('approve', id); },
      onReturned: async (_tenantId, id, action, reason) => { await this.store.call(action === 'REJECT' ? 'reject' : 'sendBack', id, reason ?? (action === 'REJECT' ? 'Rejected' : 'Changes requested')); },
    });
  }

  // ---------------------------------------------------------------- reads
  list(user: SessionUser, q: { status?: string; year?: string; page: number; pageSize: number }) {
    return this.store.list(user.tenantId, q);
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  overview(user: SessionUser) {
    return this.store.overview(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<PayrollRun> {
    const r = await this.store.get(user.tenantId, id);
    if (!r) throw new NotFoundError('Payroll run not found');
    const approval = await this.approvals.forEntity(user, 'PRUN', id);
    const step = approval?.status === 'PENDING' ? approval.steps.find((s) => s.state === 'current') : null;
    const has = (p: string) => user.permissions.includes(p);
    const preparer = r.preparedBy?.id ?? r.createdBy?.id ?? null;
    const awaiting = r.status === 'AWAITING_APPROVAL';
    const inputs = ['DRAFT', 'REVIEW', 'AWAITING_APPROVAL'].includes(r.status) ? await this.store.inputs(user.tenantId, r) : null;
    return {
      ...r, inputs, glPreview: r.lines.length ? await this.store.glPreview(user.tenantId, id, r.salaryPayableAccount.id) : [],
      approval, waitingOn: step ? `${step.name}${step.approvers.length ? ` — ${step.approvers.map((a) => a.name).join(', ')}` : ''}` : awaiting ? 'An approver with payroll approval rights' : null,
      can: {
        edit: OPEN.includes(r.status) && has('prun:edit'),
        calculate: OPEN.includes(r.status) && has('prun:edit'),
        submit: r.status === 'REVIEW' && !!r.calculatedAt && has('prun:edit'),
        approve: awaiting && preparer !== user.id && (approval?.status === 'PENDING' ? approval.canAct : has('prun:approve')),
        reject: awaiting && preparer !== user.id && (approval?.status === 'PENDING' ? approval.canAct : has('prun:approve')),
        post: r.status === 'APPROVED' && has('prun:post'),
        pay: r.status === 'POSTED' && has('prun:post'),
        cancel: ['DRAFT', 'REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED'].includes(r.status) && has('prun:edit'),
        reverse: ['POSTED', 'PAID'].includes(r.status) && has('prun:post'),
      },
    };
  }

  private async base(user: SessionUser, id: string): Promise<RunBase> {
    const r = await this.store.get(user.tenantId, id);
    if (!r) throw new NotFoundError('Payroll run not found');
    return r;
  }

  private scopeOf(r: RunBase): RunScope {
    const included = r.branches.filter((b) => b.isIncluded).map((b) => b.branchId);
    return {
      runId: r.id, runType: r.runType, payrollMonth: r.payrollMonth, periodFrom: r.periodFrom, periodTo: r.periodTo, payGroupId: r.payGroup?.id ?? null,
      includeNoticePeriod: r.includeNoticePeriod, includeExited: r.includeExited, branchIds: included.length ? included : null,
    };
  }

  /** Step 1: who a run of the month would cover. */
  async preview(user: SessionUser, q: { month: string; payGroup?: string; runType: string }): Promise<RunPreview> {
    const b = payrollMonthBounds(q.month);
    const scope = await this.store.scope(user.tenantId, { runId: null, runType: q.runType, payrollMonth: b.first, periodFrom: b.first, periodTo: b.last, payGroupId: q.payGroup ?? null, includeNoticePeriod: true, includeExited: true, branchIds: null });
    const days = await this.store.workingDays(user.tenantId, b.first, b.last);
    const byBranch = new Map<string, number>();
    for (const e of scope) if (e.branchId) byBranch.set(e.branchId, (byBranch.get(e.branchId) ?? 0) + 1);
    return {
      employees: scope.filter((e) => !(e.exitDate && e.exitDate <= b.last)).length,
      newJoiners: scope.filter((e) => e.joiningDate >= b.first).length,
      exits: scope.filter((e) => e.exitDate && e.exitDate <= b.last).length,
      onNotice: scope.filter((e) => e.status === 'NOTICE_PERIOD').length,
      revisions: scope.filter((e) => e.isRevised).length,
      ...days,
      byBranch: [...byBranch.entries()].map(([branchId, employees]) => ({ branchId, employees })),
      previous: await this.store.previous(user.tenantId, q.month),
      existing: q.runType === 'REGULAR' ? await this.store.openRegular(user.tenantId, q.month, q.payGroup ?? null) : null,
    };
  }

  // ---------------------------------------------------------------- create / edit
  async create(user: SessionUser, meta: RequestMeta, input: RunCreate) {
    const b = payrollMonthBounds(input.payrollMonth);
    const periodFrom = input.periodFrom ?? b.first;
    const periodTo = input.periodTo ?? b.last;
    if (input.runType === 'REGULAR') {
      const open = await this.store.openRegular(user.tenantId, input.payrollMonth, input.payGroupId);
      if (open) throw new ConflictError(`${open.docNo} is already open for ${input.payrollMonth}. Continue it, or cancel it first.`, undefined, { code: 'PAYROLL_RUN_EXISTS', log: { runId: open.id } });
    }
    const days = await this.store.workingDays(user.tenantId, periodFrom, periodTo);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      runType: input.runType, payrollMonth: b.first, periodFrom, periodTo, payDate: input.payDate, attendanceCutoffDate: input.attendanceCutoffDate,
      payGroupId: input.payGroupId, salaryPayableAccountId: input.salaryPayableAccountId, includeNoticePeriod: input.includeNoticePeriod, includeExited: input.includeExited,
      narration: input.narration, wizardStep: 2, workingDays: days.workingDays, publicHolidays: days.publicHolidays,
      branches: input.branchIds.map((branchId) => ({ branchId, isIncluded: true })),
    }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: RunUpdate) {
    const r = await this.base(user, id);
    if (!OPEN.includes(r.status)) throw locked(r, 'its period and scope can no longer change');
    if (r.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this run. Reload and try again.');
    const { branchIds, ...fields } = input;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ id, ...fields, ...(branchIds && { branches: branchIds.map((branchId) => ({ branchId, isIncluded: true })) }) });
      if (branchIds || input.includeExited !== undefined || input.includeNoticePeriod !== undefined) await this.store.set(user.tenantId, id, { calculatedAt: null, status: 'DRAFT', wizardStep: 2 });
    });
    return this.get(user, id);
  }

  /** Step 2: pull approved overtime of the month into the run (Phase 30 "Push to payroll"). */
  async syncInputs(user: SessionUser, meta: RequestMeta, id: string) {
    const r = await this.base(user, id);
    if (!OPEN.includes(r.status)) throw locked(r, 'its inputs are frozen');
    const scope = await this.store.scope(user.tenantId, this.scopeOf(r));
    const n = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const pulled = await this.store.pullOvertime(id, scope.map((e) => e.employeeId));
      if (pulled) await this.store.set(user.tenantId, id, { calculatedAt: null, status: 'DRAFT', wizardStep: 2 });
      return pulled;
    });
    return { pushed: n, run: await this.get(user, id) };
  }

  /** Overtime screen: push the month's approved overtime into its open regular run. */
  async pushOvertime(user: SessionUser, meta: RequestMeta, month: string) {
    const open = await this.store.openRegular(user.tenantId, month, null) ?? (await this.store.list(user.tenantId, { status: 'DRAFT', page: 1, pageSize: 100 })).items.find((x) => x.runType === 'REGULAR' && x.payrollMonth.startsWith(month)) ?? null;
    if (!open) throw new ConflictError(`There is no open payroll run for ${month}. Start the month's run first.`, undefined, { code: 'PAYROLL_RUN_LOCKED' });
    if (!OPEN.includes(open.status)) throw locked(open, 'its inputs are frozen');
    const r = await this.syncInputs(user, meta, open.id);
    return { pushed: r.pushed, runId: open.id, docNo: open.docNo };
  }

  async saveAdjustments(user: SessionUser, meta: RequestMeta, id: string, input: PayrollAdjustmentsInput) {
    const r = await this.base(user, id);
    if (!OPEN.includes(r.status)) throw locked(r, 'its inputs are frozen');
    if (r.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this run. Reload and try again.');
    const opts = await this.store.options(user.tenantId);
    const existing = new Map(r.adjustments.map((a) => [a.id, a]));
    const errors: Record<string, string[]> = {};
    input.adjustments.forEach((a, i) => {
      if (a.id && !existing.has(a.id)) errors[`adjustments.${i}.id`] = ['Not an adjustment of this run'];
      const c = opts.components.find((x) => x.id === a.componentId);
      if (!c && !(a.id && existing.get(a.id)?.component.id === a.componentId)) errors[`adjustments.${i}.componentId`] = ['Choose an earning or deduction'];
      if (!opts.employees.some((e) => e.id === a.employeeId)) errors[`adjustments.${i}.employeeId`] = ['Choose an employee'];
    });
    if (Object.keys(errors).length) throw new ValidationError('Check the adjustments', errors);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({
        id, rowVersion: input.rowVersion,
        adjustments: input.adjustments.map((a) => {
          const prev = a.id ? existing.get(a.id) : undefined;
          return {
            ...(a.id && { id: a.id }), employeeId: a.employeeId, componentId: a.componentId, amount: a.amount, quantity: a.quantity, isTaxable: a.isTaxable, remarks: a.remarks,
            inputSource: prev?.inputSource ?? a.inputSource, sourceDocType: prev?.sourceDocType ?? null, sourceDocId: prev?.sourceDocId ?? null,
          };
        }),
      });
      await this.store.releaseInputs(id, false);
      await this.store.set(user.tenantId, id, { calculatedAt: null, status: 'DRAFT', wizardStep: 2 });
    });
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- calculate
  async calculate(user: SessionUser, meta: RequestMeta, id: string) {
    const r = await this.base(user, id);
    if (!OPEN.includes(r.status)) throw locked(r, 'it can no longer be recalculated');
    const ty = payrollTaxYearOf(r.payrollMonth);
    const [structures, comps, years] = await Promise.all([this.structures.list(user.tenantId), this.components.list(user.tenantId), this.slabs.years(user.tenantId)]);
    const slabs = years.find((y) => y.taxYear === ty.taxYear)?.slabs;
    if (!slabs?.length) throw setupMissing(`No salary tax slabs for tax year ${ty.taxYear}. Add them under Salary structures › Tax slabs.`);
    const calcComps: CalcComponent[] = comps.map((c) => ({ ...c, baseComponentId: c.baseComponent?.id ?? null }));
    const regular = r.runType === 'REGULAR';
    const fullScope = await this.store.scope(user.tenantId, this.scopeOf(r));
    // off-cycle and bonus runs pay only the employees with adjustments in the run
    const withInputs = new Set(r.adjustments.map((a) => a.employee.id));
    const scope = regular ? fullScope : fullScope.filter((e) => withInputs.has(e.employeeId));
    if (!scope.length) throw new ConflictError(regular ? 'No employee with a salary is in the scope of this run.' : 'Add the adjustments to pay in this run first.', undefined, { code: 'PAYROLL_NO_LINES' });

    // reads outside the write transaction (interactive transactions time out after a few seconds)
    if (regular) await this.unitOfWork.run(actorContext(user, meta), () => this.store.pullOvertime(id, scope.map((e) => e.employeeId)));
    const adjustments = await this.store.adjustments(user.tenantId, id);
    const facts = await this.store.facts(user.tenantId, this.scopeOf(r), scope, ty);
    const fresh = await this.store.get(user.tenantId, id);
    {
      const lines = scope.map((e) => {
        const f = facts.get(e.employeeId)!;
        const s = structures.find((x) => x.id === e.structureId);
        const a = e.addonStructureId ? structures.find((x) => x.id === e.addonStructureId) : undefined;
        const structureLines = [...(s?.lines ?? []), ...(a?.lines ?? [])].map((l) => ({ componentId: l.component.id, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText }));
        let res;
        try {
          res = calculatePay({
            basicAmount: e.basicAmount, structureLines, daysInMonth: payrollMonthBounds(r.payrollMonth.slice(0, 7)).days, unpaidDays: regular ? f.unpaidDays : 0, outsideDays: regular ? f.outsideDays : 0,
            paidLeaveDays: f.paidLeaveDays, missingPunches: f.missingPunches.length, statutory: f.statutory,
            adjustments: adjustments.filter((x) => x.employeeId === e.employeeId),
            loans: regular ? f.loans : [], payRecurring: regular,
            tax: { slabs, monthsLeft: ty.monthsLeft, ytdGross: f.ytdGross, ytdTaxable: f.ytdTaxable, ytdTax: f.ytdTax, declarations: f.declarations },
            prevNet: f.prevNet, payMode: e.payMode, hasIban: !!f.iban, onNotice: e.status === 'NOTICE_PERIOD',
            exitInPeriod: !!e.exitDate && e.exitDate >= r.periodFrom && e.exitDate <= r.periodTo, isNewJoiner: e.joiningDate >= r.periodFrom,
          }, calcComps);
        } catch (err) {
          if (err instanceof SetupMissing) throw setupMissing(`${err.message}. Fix the salary components first.`);
          throw err;
        }
        const { components, tax, skippedLoans, ...amounts } = res;
        void tax; void skippedLoans;
        return {
          employeeId: e.employeeId, employeeSalaryId: e.salaryId, branchId: e.branchId, departmentId: e.departmentId, gradeId: e.gradeId, costCentreId: e.costCentreId,
          structureId: e.structureId, daysInMonth: payrollMonthBounds(r.payrollMonth.slice(0, 7)).days, ...amounts, taxStatus: f.taxStatus,
          isNewJoiner: e.joiningDate >= r.periodFrom, isRevised: e.isRevised, payMode: e.payMode, bankName: f.bankName, ibanMasked: mask(f.iban),
          components: components.map((c) => ({ ...c })),
        };
      });
      const byBranch = new Map<string, number>();
      for (const l of lines) if (l.branchId) byBranch.set(l.branchId, (byBranch.get(l.branchId) ?? 0) + 1);
      await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({
        id, lines,
        ...(fresh!.branches.length && { branches: fresh!.branches.map((b) => ({ branchId: b.branchId, isIncluded: b.isIncluded, employeeCount: byBranch.get(b.branchId) ?? 0 })) }),
        ...(!fresh!.checklist.length && { checklist: CHECKLIST.map(([itemKey, label], i) => ({ itemKey, label, sortOrder: i + 1 })) }),
      });
      await this.store.refreshTotals(id);
      await this.store.set(user.tenantId, id, { status: 'REVIEW', wizardStep: 3, calculatedAt: new Date() });
      });
    }
    return this.get(user, id);
  }

  async checklist(user: SessionUser, meta: RequestMeta, id: string, itemKey: string, isDone: boolean) {
    const r = await this.base(user, id);
    if (!['REVIEW', 'AWAITING_APPROVAL', 'APPROVED'].includes(r.status)) throw locked(r, 'its checklist is closed');
    if (!r.checklist.some((c) => c.itemKey === itemKey)) throw new NotFoundError('Checklist item not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setChecklist(user.tenantId, id, itemKey, isDone, user.id));
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- approval
  async submit(user: SessionUser, meta: RequestMeta, id: string) {
    const r = await this.base(user, id);
    if (r.status !== 'REVIEW' || !r.calculatedAt) throw locked(r, 'calculate it before submitting');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.call('submit', id);
      const reqId = await this.approvals.submit(user, {
        entityType: 'PRUN', entityId: id, docLabel: r.docNo, title: `Payroll ${r.payrollMonth.slice(0, 7)} · ${r.employeeCount} employees`, amount: r.grossAmount,
        branchId: null, facts: { DOC_TYPE: 'PRUN' },
      });
      if (reqId) await this.store.set(user.tenantId, id, { approvalRequestId: reqId });
    });
    return this.get(user, id);
  }

  private async decide(user: SessionUser, meta: RequestMeta, id: string, act: 'approve' | 'reject' | 'changes', text: string | null) {
    const r = await this.get(user, id);
    if (r.status !== 'AWAITING_APPROVAL') throw new ConflictError(`${r.docNo} is not awaiting approval.`, undefined, { code: act === 'approve' ? 'PAYROLL_NOT_APPROVED' : 'PAYROLL_RUN_LOCKED' });
    if ((r.preparedBy?.id ?? r.createdBy?.id) === user.id) throw new ForbiddenError('You prepared this payroll run, so someone else must approve it.', undefined, { code: 'PAYROLL_PREPARER_APPROVAL' });
    if (r.approval?.status === 'PENDING') {
      await this.approvals.act(user, meta, r.approval.id, act, act === 'approve' ? { reason: null, comment: text } : { reason: text, comment: null });
    } else {
      if (!user.permissions.includes('prun:approve')) throw new ForbiddenError('You can’t approve payroll runs.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.call(act === 'approve' ? 'approve' : act === 'reject' ? 'reject' : 'sendBack', id, text));
    }
    return this.get(user, id);
  }

  approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) { return this.decide(user, meta, id, 'approve', comment); }
  reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) { return this.decide(user, meta, id, 'reject', reason); }
  sendBack(user: SessionUser, meta: RequestMeta, id: string, reason: string) { return this.decide(user, meta, id, 'changes', reason); }

  // ---------------------------------------------------------------- post / pay / cancel / reverse
  async post(user: SessionUser, meta: RequestMeta, id: string, opts: { publishToEss: boolean; createDepositReminders: boolean }) {
    const r = await this.base(user, id);
    if (r.status !== 'APPROVED') throw new ConflictError(`${r.docNo} must be approved before it is posted.`, undefined, { code: 'PAYROLL_NOT_APPROVED' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set(user.tenantId, id, { publishToEss: opts.publishToEss, createDepositReminders: opts.createDepositReminders });
      await this.store.call('post', id);
    });
    return this.get(user, id);
  }

  async pay(user: SessionUser, meta: RequestMeta, id: string, input: RunPay) {
    const r = await this.base(user, id);
    if (r.status !== 'POSTED') throw new ConflictError(`${r.docNo} must be posted before it is paid.`, undefined, { code: 'PAYROLL_NOT_POSTED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.pay(id, { ...input }));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const r = await this.base(user, id);
    if (!['DRAFT', 'REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED'].includes(r.status)) throw locked(r, r.status === 'POSTED' || r.status === 'PAID' ? 'reverse it instead' : 'it can’t be cancelled');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (r.status === 'AWAITING_APPROVAL') await this.approvals.cancelFor(user, 'PRUN', id, reason);
      await this.store.call('cancel', id, reason);
    });
    return this.get(user, id);
  }

  async reverse(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const r = await this.base(user, id);
    if (!['POSTED', 'PAID'].includes(r.status)) throw new ConflictError(`${r.docNo} is not posted.`, undefined, { code: 'PAYROLL_NOT_POSTED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.call('reverse', id, reason));
    return this.get(user, id);
  }

  /** Generic bank advice: one row per paid-by-bank employee (CSV). */
  async bankAdvice(user: SessionUser, id: string) {
    const r = await this.base(user, id);
    if (!['POSTED', 'PAID'].includes(r.status)) throw new ConflictError(`${r.docNo} must be posted before the bank advice is generated.`, undefined, { code: 'PAYROLL_NOT_POSTED' });
    const rows = await this.store.bankAdvice(user.tenantId, id);
    const q = (v: string | number | null) => { const s = v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = [['Employee code', 'Employee name', 'Bank', 'Account title', 'IBAN', 'Net pay', 'Pay mode', 'Reference'], ...rows.map((x) => [x.code, x.name, x.bankName, x.accountTitle, x.iban, x.netAmount.toFixed(2), x.payMode, x.paymentRef])]
      .map((row) => row.map(q).join(',')).join('\r\n');
    return { fileName: `bank-advice-${r.docNo}.csv`, body: `${body}\r\n` };
  }
}
