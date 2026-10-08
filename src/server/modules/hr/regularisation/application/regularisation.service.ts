import { Injectable, type OnModuleInit } from '@nestjs/common';
import { REGULARISATION_REJECT_REASONS, regularisationErrors, type RegularisationDetail, type RegularisationInput, type RegularisationUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { RegularisationStore, type RegularisationQuery } from './regularisation-store.js';

const TYPE_LABEL: Record<string, string> = { MISSED_PUNCH: 'Missed punch', LATE_ARRIVAL: 'Late arrival', ON_DUTY: 'On duty', WFH: 'Work from home', EARLY_LEAVING: 'Early leaving' };
const notPending = () => new ConflictError('This request is no longer pending.', undefined, { code: 'REQUEST_NOT_PENDING' });
const locked = () => new ConflictError('Attendance for that month is locked for payroll.', undefined, { code: 'ATTENDANCE_DAY_LOCKED' });
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));

/**
 * Regularisation requests (REG-): an employee corrects a day from My Profile; the request routes through the approval
 * engine (default workflow "Attendance regularisation": line manager, then HR; no workflow → HR approves directly).
 * Approval adds the requested punches and rebuilds the day; rejection records the reason.
 */
@Injectable()
export class RegularisationService implements OnModuleInit {
  constructor(
    private readonly store: RegularisationStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['REG'],
      workflowSubject: 'ATTENDANCE_REGULARISATION',
      link: (id) => `/hr/attendance/requests?request=${id}`,
      lines: async (tenantId, id) => {
        const r = await this.store.get(tenantId, id);
        return r ? [{ account: `${TYPE_LABEL[r.requestType] ?? r.requestType} · ${r.attDate}`, particulars: `${r.requestedIn ? `In ${r.requestedIn}` : ''}${r.requestedIn && r.requestedOut ? ' · ' : ''}${r.requestedOut ? `Out ${r.requestedOut}` : ''} — ${r.reason}`, debit: 0, credit: 0 }] : [];
      },
      onApproved: async (_tenantId, id) => { await this.store.approve(id, null); },
      onReturned: async (_tenantId, id, action, reason) => {
        const code = (REGULARISATION_REJECT_REASONS as readonly string[]).includes(reason ?? '') ? reason! : 'OTHER';
        await this.store.reject(id, code, code === reason ? null : action === 'REQUEST_CHANGES' ? `Changes requested: ${reason ?? ''}` : reason, false);
      },
      onStepChange: async (tenantId, id, step) => { await this.store.set(tenantId, id, { stage: step.approverType === 'LINE_MANAGER' ? 'LINE_MANAGER' : 'HR' }); },
    });
  }

  // ---------------------------------------------------------------- HR
  async list(user: SessionUser, q: RegularisationQuery) {
    const l = await this.store.list(user.tenantId, q);
    return { ...l, items: await Promise.all(l.items.map(async (i) => ({ ...i, waitingOn: i.status === 'PENDING' ? await this.waitingOn(user, i.id) : null }))) };
  }

  async get(user: SessionUser, id: string, own = false): Promise<RegularisationDetail> {
    const r = await this.store.get(user.tenantId, id);
    if (!r) throw new NotFoundError('Regularisation request not found');
    if (own) {
      const me = await this.store.employeeOf(user.tenantId, user.id);
      if (!me || me.id !== r.employee.id) throw new NotFoundError('Regularisation request not found');
    }
    const approval = await this.approvals.forEntity(user, 'REG', id);
    const current = approval?.status === 'PENDING' ? approval.steps.find((s) => s.state === 'current') : null;
    return { ...r, approval, canAct: !!approval?.canAct, waitingOn: current ? `${current.name}${current.approvers.length ? ` — ${current.approvers.map((a) => a.name).join(', ')}` : ''}` : r.status === 'PENDING' ? 'HR' : null };
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: RegularisationUpdate) {
    const r = await this.get(user, id);
    if (r.status !== 'PENDING') throw notPending();
    if (r.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this request. Reload and try again.');
    const merged = { requestType: input.requestType ?? r.requestType, punchDirection: input.punchDirection !== undefined ? input.punchDirection : r.punchDirection, requestedIn: input.requestedIn !== undefined ? input.requestedIn : r.requestedIn, requestedOut: input.requestedOut !== undefined ? input.requestedOut : r.requestedOut };
    const e = regularisationErrors(merged);
    if (Object.keys(e).length) throw v(e);
    if (input.attDate && input.attDate > (await this.store.today(user.tenantId))) throw v({ attDate: 'Not after today' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...Object.fromEntries(Object.entries(input).filter(([, x]) => x !== undefined)), id }));
    return this.get(user, id);
  }

  /** Approve through the request's approval step; with no workflow, HR (att:approve) approves directly. */
  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const r = await this.get(user, id);
    if (r.status !== 'PENDING') throw notPending();
    if (r.approval?.status === 'PENDING') await this.approvals.act(user, meta, r.approval.id, 'approve', { reason: null, comment });
    else {
      if (!user.permissions.includes('att:approve')) throw new ForbiddenError('You can’t approve attendance requests.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.approve(id, comment));
    }
    if (comment) await this.unitOfWork.run(actorContext(user, meta), () => this.store.set(user.tenantId, id, { decisionComment: comment }));
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, input: { reason: string; comment: string | null; markAbsentIfUnresolved: boolean }) {
    const r = await this.get(user, id);
    if (r.status !== 'PENDING') throw notPending();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (r.approval?.status === 'PENDING') await this.approvals.act(user, meta, r.approval.id, 'reject', { reason: input.reason, comment: input.comment });
      else {
        if (!user.permissions.includes('att:approve')) throw new ForbiddenError('You can’t reject attendance requests.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
        await this.store.reject(id, input.reason, input.comment, input.markAbsentIfUnresolved);
      }
      await this.store.set(user.tenantId, id, { rejectionReason: input.reason, decisionComment: input.comment, markAbsentIfUnresolved: input.markAbsentIfUnresolved });
    });
    return this.get(user, id);
  }

  async approveMany(user: SessionUser, meta: RequestMeta, ids: string[]) {
    const done: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      try { await this.approve(user, meta, id, null); done.push(id); } catch (e) { failed.push({ id, message: (e as Error).message }); }
    }
    return { done, failed };
  }

  // ---------------------------------------------------------------- my requests
  async mine(user: SessionUser, q: RegularisationQuery) {
    const me = await this.me(user);
    return this.list(user, { ...q, employeeId: me.id });
  }

  async create(user: SessionUser, meta: RequestMeta, input: RegularisationInput) {
    const me = await this.me(user);
    if (input.attDate > (await this.store.today(user.tenantId))) throw v({ attDate: 'You can’t correct a future day' });
    if (await this.store.monthLocked(user.tenantId, input.attDate)) throw locked();
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save({ ...input, employeeId: me.id, channel: 'ESS_WEB' });
      const r = (await this.store.get(user.tenantId, newId))!;
      const req = await this.approvals.submit(user, { entityType: 'REG', entityId: newId, docLabel: r.docNo, title: `${TYPE_LABEL[r.requestType]} · ${r.attDate}`, amount: 0, branchId: me.branchId, facts: { DOC_TYPE: 'REG', ...(me.branchId && { BRANCH: me.branchId }) } });
      if (!req) await this.store.set(user.tenantId, newId, { stage: 'HR' });
      return newId;
    });
    return this.get(user, id, true);
  }

  async withdraw(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.get(user, id, true);
    if (r.status !== 'PENDING') throw notPending();
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('This request was changed. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, 'REG', id, 'Withdrawn by the employee');
      await this.store.set(user.tenantId, id, { status: 'WITHDRAWN', stage: 'COMPLETED' });
    });
    return this.get(user, id, true);
  }

  private async waitingOn(user: SessionUser, id: string) {
    const a = await this.approvals.forEntity(user, 'REG', id);
    const s = a?.status === 'PENDING' ? a.steps.find((x) => x.state === 'current') : null;
    return s ? `${s.name}${s.approvers.length ? ` — ${s.approvers.map((x) => x.name).join(', ')}` : ''}` : 'HR';
  }

  private async me(user: SessionUser) {
    const me = await this.store.employeeOf(user.tenantId, user.id);
    if (!me) throw new ForbiddenError('Your user isn’t linked to an employee record, so you can’t file attendance requests. Ask HR to link it.');
    return me;
  }
}
