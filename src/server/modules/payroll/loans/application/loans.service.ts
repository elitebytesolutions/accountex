import { Injectable, type OnModuleInit } from '@nestjs/common';
import { installmentOf, LOAN_POLICY, loanChecks, type Loan, type LoanCreate, type LoanEligibility, type MyLoanCreate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { LoanStore, type LoanBase, type LoanQuery } from './loan-store.js';

type LoanType = 'LOAN' | 'MEDICAL' | 'SALARY_ADVANCE';
const notActionable = (l: { docNo: string; status: string }) => new ConflictError(`${l.docNo} is ${l.status.toLowerCase()}.`, undefined, { code: 'LOAN_NOT_ACTIONABLE' });
const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) - (Number(to.slice(8, 10)) < Number(from.slice(8, 10)) ? 1 : 0);

/**
 * Loans (LN-) and salary advances (ADV-): requested by HR or by the employee in My Profile, routed through the approval
 * engine (subject LOAN; the preparer never approves), disbursed by bank or cash voucher with the recovery schedule,
 * then recovered by payroll until closed.
 */
@Injectable()
export class LoansService implements OnModuleInit {
  constructor(
    private readonly store: LoanStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['LN', 'ADV'],
      workflowSubject: 'LOAN',
      link: (id) => `/hr/loans?loan=${id}`,
      lines: async (tenantId, id) => {
        const l = await this.store.get(tenantId, id);
        return l ? [{ account: `${l.employee.name} · ${l.loanType === 'SALARY_ADVANCE' ? 'Salary advance' : 'Loan'}`, particulars: `${l.installmentCount} × Rs ${l.installmentAmount.toLocaleString('en-US')} from ${l.firstDeductionMonth.slice(0, 7)}`, debit: l.approvedAmount ?? l.requestedAmount, credit: 0 }] : [];
      },
      onApproved: async (_tenantId, id) => { await this.store.approve(id, null); },
      onReturned: async (_tenantId, id, _action, reason) => { await this.store.reject(id, reason ?? 'Rejected'); },
    });
  }

  async list(user: SessionUser, q: LoanQuery) {
    return this.store.list(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<Loan> {
    const l = await this.store.get(user.tenantId, id);
    if (!l) throw new NotFoundError('Loan not found');
    return this.withApproval(user, l);
  }

  private async withApproval(user: SessionUser, l: LoanBase): Promise<Loan> {
    const type = l.loanType === 'SALARY_ADVANCE' ? 'ADV' : 'LN';
    const approval = await this.approvals.forEntity(user, type, l.id);
    const s = approval?.status === 'PENDING' ? approval.steps.find((x) => x.state === 'current') : null;
    return { ...l, approval, canAct: !!approval?.canAct, waitingOn: s ? `${s.name}${s.approvers.length ? ` — ${s.approvers.map((a) => a.name).join(', ')}` : ''}` : l.status === 'PENDING' ? 'HR' : null };
  }

  async eligibility(user: SessionUser, employeeId: string): Promise<LoanEligibility> {
    const f = await this.store.facts(user.tenantId, employeeId);
    if (!f) throw new NotFoundError('Employee not found');
    const service = f.joiningDate ? Math.max(0, monthsBetween(f.joiningDate, new Date().toISOString().slice(0, 10))) : 0;
    const noSalary = f.gross <= 0 ? 'No salary is on record' : null;
    const loanReason = noSalary ?? (f.openLoans ? 'One loan at a time: an open loan exists' : null);
    return {
      employeeId, gross: f.gross, basic: f.basic, serviceMonths: service, activeLoans: f.openLoans + f.openAdvances, runningInstallments: f.runningInstallments,
      limits: {
        LOAN: { limit: Math.round(f.gross * LOAN_POLICY.LOAN.limitTimesGross), maxInstallments: LOAN_POLICY.LOAN.maxInstallments, eligible: !loanReason && service >= LOAN_POLICY.LOAN.minServiceMonths, reason: loanReason ?? (service < LOAN_POLICY.LOAN.minServiceMonths ? `Needs ${LOAN_POLICY.LOAN.minServiceMonths} months of service (${service} so far)` : null) },
        MEDICAL: { limit: Math.round(f.gross * LOAN_POLICY.MEDICAL.limitTimesGross), maxInstallments: LOAN_POLICY.MEDICAL.maxInstallments, eligible: !loanReason, reason: loanReason },
        SALARY_ADVANCE: { limit: Math.round((f.basic * LOAN_POLICY.SALARY_ADVANCE.limitPctOfBasic) / 100), maxInstallments: LOAN_POLICY.SALARY_ADVANCE.maxInstallments, eligible: !noSalary && !f.openAdvances, reason: noSalary ?? (f.openAdvances ? 'An advance is already open' : null) },
      },
    };
  }

  async myEligibility(user: SessionUser) {
    return this.eligibility(user, await this.myEmployee(user));
  }

  private async myEmployee(user: SessionUser) {
    const e = await this.store.employeeOf(user.tenantId, user.id);
    if (!e) throw new ConflictError('Your user is not linked to an employee record.', undefined, { code: 'NO_EMPLOYEE_RECORD' });
    return e.id;
  }

  async create(user: SessionUser, meta: RequestMeta, input: LoanCreate) {
    return this.request(user, meta, input.employeeId, input, 'HR');
  }

  async myList(user: SessionUser) {
    const employeeId = await this.myEmployee(user);
    const list = await this.store.list(user.tenantId, { employeeId, page: 1, pageSize: 100 });
    const full = await Promise.all(list.items.map((l) => this.get(user, l.id)));
    return { items: full, kpis: list.kpis, eligibility: await this.eligibility(user, employeeId) };
  }

  async myGet(user: SessionUser, id: string) {
    const l = await this.get(user, id);
    if (l.employee.id !== await this.myEmployee(user)) throw new ForbiddenError('You can only see your own loans.', undefined, { code: 'PAYSLIP_NOT_YOURS' });
    return l;
  }

  async myCreate(user: SessionUser, meta: RequestMeta, input: MyLoanCreate) {
    return this.request(user, meta, await this.myEmployee(user), input, 'ESS');
  }

  private async request(user: SessionUser, meta: RequestMeta, employeeId: string, input: MyLoanCreate, channel: 'HR' | 'ESS') {
    const e = await this.eligibility(user, employeeId);
    if (e.gross <= 0) throw new ValidationError('This employee has no salary on record.', { employeeId: ['No salary'] });
    const checks = loanChecks(e, input.loanType as LoanType, input.requestedAmount, input.installmentCount);
    const within = checks.every((c) => c.ok);
    if (channel === 'ESS' && !within) {
      const bad = checks.find((c) => !c.ok)!;
      throw new ValidationError(`Outside the loan policy: ${bad.label} (${bad.detail}).`, { requestedAmount: [bad.label] }, { code: 'LOAN_OVER_LIMIT' });
    }
    const today = new Date().toISOString().slice(0, 7);
    if (input.firstDeductionMonth < today) throw new ValidationError('Recovery can’t start in a past month', { firstDeductionMonth: ['From this month on'] }, { code: 'LOAN_INSTALLMENTS_INVALID' });
    const emi = installmentOf(input.requestedAmount, input.installmentCount);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save({
        docDate: new Date().toISOString().slice(0, 10), employeeId, loanType: input.loanType, purpose: input.purpose, purposeDetail: input.purposeDetail, requestChannel: channel, requestedAmount: input.requestedAmount,
        installmentCount: input.installmentCount, installmentAmount: emi, firstDeductionMonth: `${input.firstDeductionMonth}-01`, markupType: 'INTEREST_FREE',
        grossSalarySnapshot: e.gross, installmentPctOfGross: Math.round((emi / e.gross) * 10000) / 100, eligibleLimitAmount: e.limits[input.loanType as LoanType].limit,
        isWithinPolicy: within, remarks: input.remarks,
      });
      const l = (await this.store.get(user.tenantId, newId))!;
      const reqId = await this.approvals.submit(user, {
        entityType: input.loanType === 'SALARY_ADVANCE' ? 'ADV' : 'LN', entityId: newId, docLabel: l.docNo, title: `${input.loanType === 'SALARY_ADVANCE' ? 'Salary advance' : 'Loan'} · ${l.employee.name}`,
        amount: input.requestedAmount, branchId: null, facts: { DOC_TYPE: input.loanType === 'SALARY_ADVANCE' ? 'ADV' : 'LN' },
      });
      if (reqId) await this.store.setApprovalRequest(user.tenantId, newId, reqId);
      return newId;
    });
    return this.get(user, id);
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, input: { approvedAmount?: number; installmentCount?: number; comment: string | null }) {
    const l = await this.get(user, id);
    if (l.status !== 'PENDING') throw notActionable(l);
    if (l.createdBy?.id === user.id) throw new ForbiddenError('You prepared this request, so someone else must approve it.', undefined, { code: 'PAYROLL_PREPARER_APPROVAL' });
    const amount = input.approvedAmount ?? l.approvedAmount ?? l.requestedAmount;
    const count = input.installmentCount ?? l.installmentCount;
    const changed = amount !== (l.approvedAmount ?? l.requestedAmount) || count !== l.installmentCount;
    if (count < 1 || count > 60) throw new ValidationError('1 to 60 installments', { installmentCount: ['1 to 60'] }, { code: 'LOAN_INSTALLMENTS_INVALID' });
    const terms = async () => {
      if (changed) await this.store.save({ id, rowVersion: l.rowVersion, approvedAmount: amount, installmentCount: count, installmentAmount: installmentOf(amount, count) });
    };
    if (l.approval?.status === 'PENDING') {
      if (!l.canAct) throw new ForbiddenError('You are not an approver for the current step of this request.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      if (changed) await this.unitOfWork.run(actorContext(user, meta), terms);
      await this.approvals.act(user, meta, l.approval.id, 'approve', { reason: null, comment: input.comment });
    } else {
      if (!user.permissions.includes('loan:approve')) throw new ForbiddenError('You can’t approve loans.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), async () => { await terms(); await this.store.approve(id, input.comment); });
    }
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const l = await this.get(user, id);
    if (l.status !== 'PENDING' && l.status !== 'APPROVED') throw notActionable(l);
    if (l.approval?.status === 'PENDING') await this.approvals.act(user, meta, l.approval.id, 'reject', { reason, comment: null });
    else {
      if (!user.permissions.includes('loan:approve')) throw new ForbiddenError('You can’t reject loans.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.reject(id, reason));
    }
    return this.get(user, id);
  }

  async disburse(user: SessionUser, meta: RequestMeta, id: string, input: { disbursementDate: string; bankAccountId: string | null; cashAccountId: string | null }) {
    const l = await this.get(user, id);
    if (l.status !== 'APPROVED') throw notActionable(l);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.disburse(id, input.disbursementDate, input.bankAccountId, input.cashAccountId));
    return this.get(user, id);
  }
}
