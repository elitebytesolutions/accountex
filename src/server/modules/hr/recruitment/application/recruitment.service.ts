import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  EmployeeCreateSchema,
  type RecruitmentActivityInput, type RecruitmentCandidateCreate, type RecruitmentCandidateDetail, type RecruitmentCandidateQuery, type RecruitmentCandidateUpdate,
  type RecruitmentHire, type RecruitmentHireResult, type RecruitmentMove, type RecruitmentOpeningAction, type RecruitmentOpeningActionInput, type RecruitmentOpeningCreate,
  type RecruitmentOpeningDetail, type RecruitmentOpeningUpdate, type RecruitmentReject, type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, PermissionDeniedError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { EmployeesService } from '../../employees/application/employees.service.js';
import { RecruitmentStore } from './recruitment-store.js';

const TERMINAL = ['HIRED', 'REJECTED'];
const notDraft = () => new ConflictError('Only a draft requisition can be edited.', undefined, { code: 'JOB_OPENING_NOT_EDITABLE' });

/**
 * Recruitment: job requisitions (REQ-) route through the JOB_REQUISITION approval workflow (HR Manager by default);
 * with no approver available HR (emp:edit) approves directly. Approved requisitions are open for candidates. Candidates
 * move through the funnel in the database (candidateMove / Reject / Hire); hiring creates the employee through the
 * Phase 11 path and the onboarding (Phase 31 template) in one transaction, linked to the candidate.
 */
@Injectable()
export class RecruitmentService implements OnModuleInit {
  constructor(
    private readonly store: RecruitmentStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly employees: EmployeesService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['REQ'],
      workflowSubject: 'JOB_REQUISITION',
      link: (id) => `/hr/recruitment?opening=${id}`,
      lines: async (tenantId, id) => {
        const o = await this.store.opening(tenantId, id);
        return o ? [{ account: `${o.title} · ${o.department.name} · ${o.branch.name}`, particulars: `${o.openings} opening${o.openings === 1 ? '' : 's'} · ${o.requisitionType === 'REPLACEMENT' ? `replaces ${o.replaces?.name ?? '?'}` : 'new position'}`, debit: 0, credit: 0 }] : [];
      },
      onApproved: async (_tenantId, id) => { await this.store.moveOpening(id, 'approve', {}); },
      onReturned: async (_tenantId, id) => { await this.store.moveOpening(id, 'return', {}); },
    });
  }

  // ---------------------------------------------------------------- requisitions
  async overview(user: SessionUser) {
    return this.store.overview(user.tenantId, await this.store.today(user.tenantId));
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async opening(user: SessionUser, id: string): Promise<RecruitmentOpeningDetail> {
    const o = await this.store.opening(user.tenantId, id);
    if (!o) throw new NotFoundError('Job requisition not found');
    const approval = await this.approvals.forEntity(user, 'REQ', id);
    const pendingEngine = approval?.status === 'PENDING';
    const current = pendingEngine ? approval.steps.find((s) => s.state === 'current') : null;
    const rest: Omit<typeof o, 'createdBy'> & { createdBy?: string | null } = { ...o };
    delete rest.createdBy;
    return {
      ...rest, approval,
      canApprove: o.status === 'PENDING_APPROVAL' && (pendingEngine ? !!approval.canAct : user.permissions.includes('emp:edit')),
      waitingOn: o.status !== 'PENDING_APPROVAL' ? null : current ? `${current.name}${current.approvers.length ? ` — ${current.approvers.map((a) => a.name).join(', ')}` : ''}` : 'HR',
    };
  }

  async createOpening(user: SessionUser, meta: RequestMeta, input: RecruitmentOpeningCreate) {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveOpening({ ...input, replacesEmployeeId: input.requisitionType === 'REPLACEMENT' ? input.replacesEmployeeId : null }));
    return this.opening(user, id);
  }

  async updateOpening(user: SessionUser, meta: RequestMeta, id: string, input: RecruitmentOpeningUpdate) {
    const o = await this.opening(user, id);
    if (o.status !== 'DRAFT') throw notDraft();
    if (o.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this requisition. Reload and try again.');
    const patch = Object.fromEntries(Object.entries({ ...input, id }).filter(([, v]) => v !== undefined));
    const type = input.requisitionType ?? o.requisitionType;
    if (type === 'REPLACEMENT' && !(input.replacesEmployeeId ?? o.replaces?.id)) throw new ValidationError('Choose who is being replaced', { replacesEmployeeId: ['Required for a replacement'] });
    if (type === 'NEW') patch.replacesEmployeeId = null;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveOpening(patch));
    return this.opening(user, id);
  }

  async openingAction(user: SessionUser, meta: RequestMeta, id: string, action: RecruitmentOpeningAction, input: RecruitmentOpeningActionInput) {
    if (!['submit', 'approve', 'return'].includes(action) && !user.permissions.includes('emp:edit')) throw new PermissionDeniedError('You need permission to edit employees for this.');
    const o = await this.opening(user, id);
    if (o.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this requisition. Reload and try again.');
    const ctx = actorContext(user, meta);
    if (action === 'submit') {
      if (o.status !== 'DRAFT') throw new ConflictError('Only a draft requisition can be submitted.', undefined, { code: 'JOB_OPENING_STATUS' });
      await this.unitOfWork.run(ctx, async () => {
        const facts = { DOC_TYPE: 'REQ', BRANCH: o.branch.id, DEPARTMENT: o.department.id };
        const route = await this.approvals.preview(user.tenantId, 'JOB_REQUISITION', o.salaryMax ?? 0, facts, user.id);
        let reqId: string | null = null;
        if (route?.steps.some((s) => s.approvers.length)) {
          reqId = await this.approvals.submit(user, { entityType: 'REQ', entityId: id, docLabel: o.docNo, title: `${o.title} · ${o.department.name} · ${o.branch.name}`, amount: 0, branchId: o.branch.id, facts });
        }
        await this.store.moveOpening(id, 'submit', { approvalRequestId: reqId });
      });
    } else if (action === 'approve' || action === 'return') {
      if (o.status !== 'PENDING_APPROVAL') throw new ConflictError('This requisition is not waiting for approval.', undefined, { code: 'JOB_OPENING_STATUS' });
      if (o.approval?.status === 'PENDING') {
        await this.approvals.act(user, meta, o.approval.id, action === 'approve' ? 'approve' : 'reject', { reason: input.reason, comment: null });
      } else {
        if (!user.permissions.includes('emp:edit')) throw new ForbiddenError('You can’t approve this requisition.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
        await this.unitOfWork.run(ctx, () => this.store.moveOpening(id, action, {}));
      }
    } else if (action === 'cancel') {
      await this.unitOfWork.run(ctx, async () => {
        await this.approvals.cancelFor(user, 'REQ', id, input.reason ?? 'Requisition cancelled');
        await this.store.moveOpening(id, 'cancel', { reason: input.reason });
      });
    } else {
      await this.unitOfWork.run(ctx, () => this.store.moveOpening(id, action, { channels: input.channels ?? null }));
    }
    return this.opening(user, id);
  }

  // ---------------------------------------------------------------- candidates
  candidates(user: SessionUser, q: RecruitmentCandidateQuery) {
    return this.store.candidates(user.tenantId, q);
  }

  async candidate(user: SessionUser, id: string): Promise<RecruitmentCandidateDetail> {
    const c = await this.store.candidate(user.tenantId, id);
    if (!c) throw new NotFoundError('Candidate not found');
    return c;
  }

  async createCandidate(user: SessionUser, meta: RequestMeta, input: RecruitmentCandidateCreate) {
    const o = await this.store.opening(user.tenantId, input.jobRequisitionId);
    if (!o) throw new NotFoundError('Job requisition not found');
    if (!['OPEN', 'OFFER_STAGE'].includes(o.status)) throw new ConflictError('Candidates can be added only to an open requisition.', undefined, { code: 'JOB_OPENING_NOT_OPEN' });
    if (input.email && (await this.store.emailTaken(user.tenantId, o.id, input.email, null))) throw this.duplicate();
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCandidate(Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== null || k === 'jobRequisitionId'))));
    return this.candidate(user, id);
  }

  async updateCandidate(user: SessionUser, meta: RequestMeta, id: string, input: RecruitmentCandidateUpdate) {
    const c = await this.current(user, id, input.rowVersion);
    if (TERMINAL.includes(c.stage)) throw this.closed(c.stage);
    if (input.email && (await this.store.emailTaken(user.tenantId, c.opening.id, input.email, id))) throw this.duplicate();
    const source = input.source ?? c.source;
    if (source === 'REFERRAL' && !(input.referredByEmployeeId ?? c.referredBy?.id)) throw new ValidationError('Choose who referred them', { referredByEmployeeId: ['Required for a referral'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCandidate(Object.fromEntries(Object.entries({ ...input, id }).filter(([, v]) => v !== undefined))));
    return this.candidate(user, id);
  }

  async move(user: SessionUser, meta: RequestMeta, id: string, input: RecruitmentMove) {
    const c = await this.current(user, id, input.rowVersion);
    if (TERMINAL.includes(c.stage)) throw this.closed(c.stage);
    if (input.toStage === 'OFFER' && input.offeredSalary == null && c.offeredSalary == null) {
      throw new ValidationError('An offer needs the offered salary', { offeredSalary: ['Enter the offered salary'] }, { code: 'CANDIDATE_OFFER_SALARY' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.moveCandidate(id, input));
    return this.candidate(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, input: RecruitmentReject) {
    const c = await this.current(user, id, input.rowVersion);
    if (TERMINAL.includes(c.stage)) throw this.closed(c.stage);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.rejectCandidate(id, input));
    return this.candidate(user, id);
  }

  async addActivity(user: SessionUser, meta: RequestMeta, id: string, input: RecruitmentActivityInput) {
    await this.candidate(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.addActivity(user.tenantId, id, input));
    return this.candidate(user, id);
  }

  /** Employee (Phase 11) + onboarding (Phase 31) + the candidate's HIRED stage: one transaction. */
  async hire(user: SessionUser, meta: RequestMeta, id: string, input: RecruitmentHire): Promise<RecruitmentHireResult> {
    const c = await this.current(user, id, input.rowVersion);
    if (c.stage !== 'OFFER') throw new ConflictError('Only a candidate at the offer stage can be hired.', undefined, { code: 'TALENT_STAGE_ORDER' });
    const o = await this.store.opening(user.tenantId, c.opening.id);
    if (!o) throw new NotFoundError('Job requisition not found');
    const parsed = EmployeeCreateSchema.safeParse({
      firstName: input.firstName, lastName: input.lastName, guardianName: input.guardianName, cnic: input.cnic, dateOfBirth: input.dateOfBirth, gender: input.gender,
      mobile: input.mobile, personalEmail: input.personalEmail ?? c.email ?? '', joiningDate: input.joiningDate, departmentId: o.department.id, designationId: input.designationId,
      gradeId: input.gradeId ?? '', reportingManagerId: input.reportingManagerId ?? o.hiringManager?.id ?? '', branchId: o.branch.id, employmentType: input.employmentType,
      probationMonths: input.probationMonths, noticeDays: c.noticeDays ?? 30,
    });
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const i of parsed.error.issues) (details[i.path.join('.')] ??= []).push(i.message);
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Check the employee details', details);
    }
    const out = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const emp = await this.employees.create(user, meta, parsed.data);
      const onboardingId = await this.store.hireCandidate(id, {
        employeeId: emp.id, templateId: input.templateId, joiningDate: input.joiningDate, buddyEmployeeId: input.buddyEmployeeId, offeredSalary: input.offeredSalary, rowVersion: input.rowVersion,
      });
      return { employee: { id: emp.id, code: emp.code, name: emp.name }, onboarding: await this.store.onboardingRef(user.tenantId, onboardingId) };
    });
    return { ...out, candidate: await this.candidate(user, id) };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.candidate(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this candidate. Reload and try again.');
    return c;
  }

  private duplicate() {
    return new ConflictError('This candidate has already applied for this opening.', { email: ['Already applied'] }, { code: 'CANDIDATE_DUPLICATE' });
  }

  private closed(stage: string) {
    return new ConflictError(`This candidate is already ${stage.toLowerCase()}.`, undefined, { code: 'TALENT_STAGE_ORDER' });
  }
}
