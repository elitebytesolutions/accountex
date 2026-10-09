import { Injectable } from '@nestjs/common';
import { evaluateConditions, type ApprovalDetail, type ApprovalInbox, type ApprovalItem, type ApprovalStep, type SessionUser } from '../../../../shared/index.js';
import { actorContext } from '../../../core/application/actor-context.js';
import { Notifier } from '../../../core/application/ports/notifier.js';
import { UnitOfWork, type RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../core/domain/errors.js';
import { applicableSteps, approvedBy, currentRound, pickWorkflow, stepComplete, type EngineStep, type EngineWorkflow } from '../domain/engine.js';
import { ApprovalStore, type ActionRow, type ApprovalRow } from './approval-store.js';
import { ApprovalSubjects } from './approval-subjects.js';

/** The document facts workflows are matched on (Phase 2 condition fields: AMOUNT, DOC_TYPE, BRANCH, COST_CENTRE…). */
export type DocumentFacts = Record<string, number | string>;
export type SubmitDocument = { entityType: string; entityId: string; docLabel: string; title: string | null; amount: number; branchId: string | null; facts: DocumentFacts };
type Act = 'approve' | 'reject' | 'changes';

const notPending = () => new ConflictError('This approval request is no longer pending.', undefined, { code: 'APPROVAL_NOT_PENDING' });
const hours = (h: number | null) => (h ? new Date(Date.now() + h * 3600_000) : null);

/**
 * The approval engine, shared by every document type. A document is routed to the first matching active workflow
 * (Phase 2 definitions); its steps run in order (role / user / line manager; ANY or ALL; optional amount threshold).
 * Every decision is an ApprovalActions row. The requester never approves their own document. Final approval, rejection
 * and "request changes" call the document's subject adapter in the same transaction.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly store: ApprovalStore,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
    private readonly notifier: Notifier,
  ) {}

  /** The workflow and steps a document would go through (null: not routed, it can be posted directly). */
  async route(tenantId: string, workflowSubject: string, amount: number, facts: DocumentFacts) {
    const wfs = await this.store.workflows(tenantId, workflowSubject);
    const wf = pickWorkflow(wfs, (w) => evaluateConditions(w.conditions, { ...facts, AMOUNT: amount }).matches, amount);
    return wf ? { workflow: wf, steps: applicableSteps(wf, amount) } : null;
  }

  /** Routing preview for a draft (steps with their approvers). */
  async preview(tenantId: string, workflowSubject: string, amount: number, facts: DocumentFacts, requesterUserId: string): Promise<{ workflow: { id: string; name: string }; steps: ApprovalStep[] } | null> {
    const r = await this.route(tenantId, workflowSubject, amount, facts);
    if (!r) return null;
    const steps = await this.stepViews(tenantId, r.workflow, r.steps, requesterUserId, [], null);
    return { workflow: { id: r.workflow.id, name: r.workflow.name }, steps };
  }

  /**
   * Submits (or resubmits) a document. Call inside the caller's unit of work. Returns the request id, or null when no
   * workflow applies.
   */
  async submit(user: SessionUser, doc: SubmitDocument): Promise<string | null> {
    const subject = this.subject(doc.entityType);
    const r = await this.route(user.tenantId, subject.workflowSubject, doc.amount, doc.facts);
    if (!r) return null;
    // a step nobody can approve (no line manager, an empty role) is skipped
    const open = await this.withApprovers(user.tenantId, r.steps, user.id);
    if (!open.length) throw new ConflictError('No one can approve this document: the workflow’s approvers are missing. Ask an administrator to fix the workflow.');
    const first = open[0]!;
    const skipped = r.steps.filter((s) => s.stepNo < first.stepNo);
    const prev = await this.store.requestFor(user.tenantId, doc.entityType, doc.entityId);
    if (prev && prev.status === 'PENDING') throw new ConflictError('This document is already waiting for approval.');
    let id: string;
    if (prev && prev.status !== 'APPROVED' && prev.workflowId === r.workflow.id) {
      id = prev.id;
      await this.store.update(user.tenantId, id, prev.rowVersion, { status: 'PENDING', completedAt: null, currentStepNo: first.stepNo, currentStepDueAt: hours(first.slaHours), amount: doc.amount, title: doc.title, docLabel: doc.docLabel });
      await this.store.addAction(user.tenantId, { requestId: id, stepNo: first.stepNo, action: 'RESUBMIT', actorUserId: user.id });
      for (const k of skipped) await this.store.addAction(user.tenantId, { requestId: id, stepNo: k.stepNo, action: 'AUTO_SKIP', actorUserId: null, comment: 'No approver for this step' });
    } else {
      id = await this.store.create(user.tenantId, {
        workflowId: r.workflow.id, entityType: doc.entityType, entityId: doc.entityId, docLabel: doc.docLabel, title: doc.title, amount: doc.amount, currencyCode: 'PKR',
        branchId: doc.branchId, requestedByUserId: user.id, currentStepNo: first.stepNo, currentStepDueAt: hours(first.slaHours),
      });
      await this.store.addAction(user.tenantId, { requestId: id, stepNo: first.stepNo, action: 'SUBMIT', actorUserId: user.id });
      for (const k of skipped) await this.store.addAction(user.tenantId, { requestId: id, stepNo: k.stepNo, action: 'AUTO_SKIP', actorUserId: null, comment: 'No approver for this step' });
    }
    await subject.onStepChange?.(user.tenantId, doc.entityId, { stepNo: first.stepNo, name: first.name, approverType: first.approverType }, null, null);
    await this.notifyApprovers(user.tenantId, { entityType: doc.entityType, entityId: doc.entityId, docLabel: doc.docLabel, title: doc.title, amount: doc.amount, requestedByUserId: user.id }, first, subject.workflowSubject, user.id);
    return id;
  }

  /** Withdraws a pending request (the preparer recalls the document). Call inside the caller's unit of work. */
  async cancelFor(user: SessionUser, entityType: string, entityId: string, reason: string | null) {
    const req = await this.store.requestFor(user.tenantId, entityType, entityId);
    if (!req || req.status !== 'PENDING') return;
    await this.store.update(user.tenantId, req.id, req.rowVersion, { status: 'CANCELLED', completedAt: new Date() });
    await this.store.addAction(user.tenantId, { requestId: req.id, stepNo: req.currentStepNo ?? 0, action: 'CANCEL', actorUserId: user.id, reason });
  }

  /** The latest request for a document with its steps and actions (null when it was never submitted). */
  async forEntity(user: SessionUser, entityType: string, entityId: string): Promise<ApprovalDetail | null> {
    const req = await this.store.requestFor(user.tenantId, entityType, entityId);
    return req ? this.detailOf(user, req) : null;
  }

  async status(tenantId: string, entityType: string, entityId: string) {
    return (await this.store.requestFor(tenantId, entityType, entityId))?.status ?? null;
  }

  // ---------------------------------------------------------------- inbox
  async inbox(user: SessionUser): Promise<ApprovalInbox> {
    const pending = await this.store.pending(user.tenantId);
    const actions = await this.store.actions(user.tenantId, pending.map((p) => p.id));
    const items: ApprovalItem[] = [];
    for (const req of pending) {
      const item = await this.item(user, req, actions.filter((a) => a.requestId === req.id));
      if (item.canAct) items.push(item);
    }
    const now = Date.now();
    const breached = items.filter((i) => i.currentStepDueAt && new Date(i.currentStepDueAt).getTime() < now).length;
    const oldest = items.reduce<number | null>((m, i) => { const h = (now - new Date(i.requestedAt).getTime()) / 3600_000; return m === null || h > m ? h : m; }, null);
    const mineRows = (await this.store.requestedBy(user.tenantId, user.id)).filter((r) => r.status === 'PENDING' || (r.completedAt && now - r.completedAt.getTime() < 7 * 86400_000));
    const mineActions = await this.store.actions(user.tenantId, mineRows.map((r) => r.id));
    const mine = await Promise.all(mineRows.map((r) => this.item(user, r, mineActions.filter((a) => a.requestId === r.id))));
    return {
      items, mine,
      kpis: { waiting: items.length, breached, valuePending: items.reduce((s, i) => s + (i.amount ?? 0), 0), approvedToday: await this.store.approvedTodayBy(user.tenantId, user.id), oldestHours: oldest === null ? null : Math.round(oldest) },
    };
  }

  async detail(user: SessionUser, id: string): Promise<ApprovalDetail> {
    const req = await this.store.request(user.tenantId, id);
    if (!req) throw new NotFoundError('Approval request not found');
    const d = await this.detailOf(user, req);
    const involved = req.requestedByUserId === user.id || d.canAct || d.actions.some((a) => a.actor?.id === user.id) || d.steps.some((s) => s.approvers.some((x) => x.id === user.id));
    if (!involved && !user.permissions.includes('vch:view')) throw new ForbiddenError('You are not involved in this approval.');
    return d;
  }

  // ---------------------------------------------------------------- decisions
  async act(user: SessionUser, meta: RequestMeta, id: string, act: Act, input: { reason: string | null; comment: string | null }, bulk = false): Promise<ApprovalDetail> {
    await this.unitOfWork.run(actorContext(user, meta), () => this.decide(user, meta, id, act, input, bulk));
    return this.detail(user, id);
  }

  async bulk(user: SessionUser, meta: RequestMeta, ids: string[], act: 'approve' | 'reject', reason: string | null) {
    if (act === 'reject' && !reason) throw new ValidationError('Give a reason for rejecting', { reason: ['Required to reject'] });
    const done: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await this.unitOfWork.run(actorContext(user, meta), () => this.decide(user, meta, id, act, { reason, comment: null }, true));
        done.push(id);
      } catch (e) {
        failed.push({ id, message: e instanceof Error ? e.message : 'Failed' });
      }
    }
    return { done, failed };
  }

  async delegate(user: SessionUser, meta: RequestMeta, id: string, toUserId: string, comment: string | null): Promise<ApprovalDetail> {
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const { req, step, principal } = await this.eligible(user, id);
      if (!step.allowDelegation) throw new ValidationError('This step does not allow delegation.');
      if (toUserId === user.id || toUserId === req.requestedByUserId) throw new ValidationError('Choose someone else', { userId: ['Not this person'] });
      if (!(await this.store.names(user.tenantId, [toUserId])).has(toUserId)) throw new ValidationError('Choose an active user', { userId: ['Unknown user'] });
      await this.store.addAction(user.tenantId, { requestId: id, stepNo: step.stepNo, action: 'DELEGATE', actorUserId: user.id, onBehalfOfUserId: principal, delegateToUserId: toUserId, comment, ipAddress: meta.clientIp ?? null });
    });
    return this.detail(user, id);
  }

  /** People the current approver may hand the step to: active users other than themselves and the requester. */
  async delegates(user: SessionUser, id: string) {
    const { req, step } = await this.eligible(user, id);
    if (!step.allowDelegation) return [];
    return (await this.store.activeUsers(user.tenantId)).filter((u) => u.id !== user.id && u.id !== req.requestedByUserId);
  }

  async comment(user: SessionUser, meta: RequestMeta, id: string, comment: string) {
    const req = await this.store.request(user.tenantId, id);
    if (!req) throw new NotFoundError('Approval request not found');
    await this.detail(user, id);
    const subject = this.subject(req.entityType);
    await this.unitOfWork.run(actorContext(user, meta), async () => { await subject.onComment?.(user.tenantId, req.entityId, user.id, comment); });
    return this.detail(user, id);
  }

  private async decide(user: SessionUser, meta: RequestMeta, id: string, act: Act, input: { reason: string | null; comment: string | null }, bulk: boolean) {
    const { req, wf, steps, step, principal } = await this.eligible(user, id);
    const subject = this.subject(req.entityType);
    if (act !== 'approve' && !input.reason && !input.comment) throw new ValidationError('Give a reason', { reason: ['Required'] });
    if (act === 'approve' && step.requireComment && !input.comment) throw new ValidationError('This step needs a comment', { comment: ['Required'] });
    const base = { requestId: id, stepNo: step.stepNo, actorUserId: user.id, onBehalfOfUserId: principal !== user.id ? principal : null, reason: input.reason, comment: input.comment, isBulk: bulk, ipAddress: meta.clientIp ?? null };
    if (act !== 'approve') {
      await this.store.addAction(user.tenantId, { ...base, action: act === 'reject' ? 'REJECT' : 'REQUEST_CHANGES' });
      await this.store.update(user.tenantId, id, req.rowVersion, { status: act === 'reject' ? 'REJECTED' : 'CHANGES_REQUESTED', completedAt: new Date() });
      await subject.onReturned(user.tenantId, req.entityId, act === 'reject' ? 'REJECT' : 'REQUEST_CHANGES', input.reason ?? input.comment, user.id);
      await this.notifyRequester(user.tenantId, req, act === 'reject' ? 'rejected' : 'returned for changes', input.reason ?? input.comment, user.id);
      return;
    }
    await this.store.addAction(user.tenantId, { ...base, action: 'APPROVE' });
    const round = currentRound(await this.store.actions(user.tenantId, [id]));
    const approvers = (await this.approversOf(user.tenantId, step, req.requestedByUserId)).required;
    if (!stepComplete(step, approvers, approvedBy(round, step.stepNo), req.requestedByUserId)) return;
    const later = steps.filter((s) => s.stepNo > step.stepNo);
    const next = (await this.withApprovers(user.tenantId, later, req.requestedByUserId))[0];
    for (const k of later.filter((s) => !next || s.stepNo < next.stepNo)) {
      await this.store.addAction(user.tenantId, { requestId: id, stepNo: k.stepNo, action: 'AUTO_SKIP', actorUserId: null, comment: 'No approver for this step' });
    }
    if (next) {
      await this.store.update(user.tenantId, id, req.rowVersion, { currentStepNo: next.stepNo, currentStepDueAt: hours(next.slaHours) });
      await subject.onStepChange?.(user.tenantId, req.entityId, { stepNo: next.stepNo, name: next.name, approverType: next.approverType }, { stepNo: step.stepNo, approverType: step.approverType }, user.id);
      await this.notifyApprovers(user.tenantId, req, next, subject.workflowSubject, user.id);
      return;
    }
    await this.store.update(user.tenantId, id, req.rowVersion, { status: 'APPROVED', completedAt: new Date() });
    await subject.onApproved(user.tenantId, req.entityId, user.id, wf.onComplete === 'AUTO_POST');
    await this.notifyRequester(user.tenantId, req, 'approved', input.comment, user.id);
  }

  /** Phase 44: the approvers of a step that just opened (and their delegates) get an in-app notification. */
  private async notifyApprovers(tenantId: string, doc: { entityType: string; entityId: string; docLabel: string; title: string | null; amount: number | null; requestedByUserId: string }, step: EngineStep, workflowSubject: string, actorUserId: string) {
    const { principals, actingFor } = await this.approversOf(tenantId, step, doc.requestedByUserId, workflowSubject);
    const requester = (await this.store.names(tenantId, [doc.requestedByUserId])).get(doc.requestedByUserId);
    for (const userId of new Set([...principals, ...actingFor.keys()])) {
      await this.notifier.notify(tenantId, {
        userId, eventCode: 'APPROVAL_PENDING', category: 'APPROVALS', title: `${doc.docLabel} needs your approval`,
        body: [doc.title, requester && `requested by ${requester}`, step.name && `step: ${step.name}`].filter(Boolean).join(' · ') || null,
        linkRoute: '/approvals', entityType: doc.entityType, entityId: doc.entityId, amount: doc.amount, severity: 'WARN', needsAction: true, actorUserId,
      });
    }
  }

  /** Phase 44: the requester hears the outcome of their document. */
  private async notifyRequester(tenantId: string, req: ApprovalRow, outcome: 'approved' | 'rejected' | 'returned for changes', note: string | null, actorUserId: string) {
    const actor = (await this.store.names(tenantId, [actorUserId])).get(actorUserId);
    await this.notifier.notify(tenantId, {
      userId: req.requestedByUserId, eventCode: 'APPROVAL_DECIDED', category: 'APPROVALS', title: `${req.docLabel} ${outcome}`,
      body: [actor && `by ${actor}`, note].filter(Boolean).join(' · ') || null, linkRoute: '/approvals', entityType: req.entityType, entityId: req.entityId,
      amount: req.amount, severity: outcome === 'approved' ? 'GOOD' : outcome === 'rejected' ? 'DANGER' : 'WARN', needsAction: outcome !== 'approved', actorUserId,
    });
  }

  /** Who may act on the current step: the step's approvers (never the requester), their delegates, or a per-request delegate. */
  private async eligible(user: SessionUser, id: string) {
    const req = await this.store.request(user.tenantId, id);
    if (!req) throw new NotFoundError('Approval request not found');
    if (req.status !== 'PENDING') throw notPending();
    const wf = await this.store.workflow(user.tenantId, req.workflowId);
    if (!wf) throw new NotFoundError('Workflow not found');
    const steps = applicableSteps(wf, req.amount ?? 0);
    const step = steps.find((s) => s.stepNo === req.currentStepNo);
    if (!step) throw notPending();
    if (req.requestedByUserId === user.id) throw new ConflictError('You can’t approve a document you requested.', undefined, { code: 'APPROVAL_SELF' });
    const round = currentRound(await this.store.actions(user.tenantId, [id]));
    const { principals, actingFor } = await this.approversOf(user.tenantId, step, req.requestedByUserId, this.subject(req.entityType).workflowSubject, round);
    const principal = principals.includes(user.id) ? user.id : actingFor.get(user.id);
    if (!principal) throw new ForbiddenError('You are not an approver for the current step of this document.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
    if (approvedBy(round, step.stepNo).has(principal)) throw new ConflictError('You have already approved this step.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    return { req, wf, steps, step, principal };
  }

  /** The steps that have at least one approver for this requester, in order. */
  private async withApprovers(tenantId: string, steps: EngineStep[], requesterUserId: string) {
    const out: EngineStep[] = [];
    for (const s of steps) if ((await this.approversOf(tenantId, s, requesterUserId)).principals.length) out.push(s);
    return out;
  }

  private async approversOf(tenantId: string, step: EngineStep, requesterUserId: string, workflowSubject?: string, round: ActionRow[] | import('../domain/engine.js').EngineAction[] = []) {
    let principals: string[] = [];
    if (step.approverType === 'ROLE' && step.approverRoleId) principals = (await this.store.roleMembers(tenantId, [step.approverRoleId])).map((m) => m.userId);
    else if (step.approverType === 'USER' && step.approverUserId) principals = [step.approverUserId];
    else if (step.approverType === 'LINE_MANAGER') { const m = await this.store.lineManagerUser(tenantId, requesterUserId); principals = m ? [m] : []; }
    principals = [...new Set(principals)].filter((u) => u !== requesterUserId);
    // The default user holds every role, so an ALL step over a role doesn't wait for them (they can still approve).
    let required = principals;
    if (step.approverType === 'ROLE') {
      const owner = await this.store.defaultUserId(tenantId);
      if (owner && principals.some((u) => u !== owner)) required = principals.filter((u) => u !== owner);
    }
    const actingFor = new Map<string, string>();
    if (workflowSubject && step.allowDelegation) {
      for (const d of await this.store.delegations(tenantId, workflowSubject)) if (principals.includes(d.fromUserId) && d.toUserId !== requesterUserId) actingFor.set(d.toUserId, d.fromUserId);
      for (const a of round) if (a.action === 'DELEGATE' && a.stepNo === step.stepNo && a.delegateToUserId) actingFor.set(a.delegateToUserId, a.onBehalfOfUserId ?? a.actorUserId ?? '');
    }
    return { principals, required, actingFor };
  }

  private async item(user: SessionUser, req: ApprovalRow, actions: ActionRow[]): Promise<ApprovalItem> {
    const subject = this.subject(req.entityType);
    const wf = await this.store.workflow(user.tenantId, req.workflowId);
    let canAct = false;
    if (req.status === 'PENDING' && wf && req.requestedByUserId !== user.id) {
      const step = applicableSteps(wf, req.amount ?? 0).find((s) => s.stepNo === req.currentStepNo);
      if (step) {
        const round = currentRound(actions);
        const { principals, actingFor } = await this.approversOf(user.tenantId, step, req.requestedByUserId, subject.workflowSubject, round);
        const principal = principals.includes(user.id) ? user.id : actingFor.get(user.id);
        canAct = !!principal && !approvedBy(round, step.stepNo).has(principal);
      }
    }
    const names = await this.store.names(user.tenantId, [req.requestedByUserId]);
    return {
      id: req.id, entityType: req.entityType, entityId: req.entityId, docLabel: req.docLabel, title: req.title, amount: req.amount, currencyCode: req.currencyCode,
      branch: null, requestedBy: { id: req.requestedByUserId, name: names.get(req.requestedByUserId) ?? '—' }, requestedAt: req.requestedAt.toISOString(),
      status: req.status, currentStepNo: req.currentStepNo, currentStepDueAt: req.currentStepDueAt?.toISOString() ?? null,
      workflow: { id: req.workflowId, name: wf?.name ?? '—' }, link: subject.link(req.entityId), canAct,
    };
  }

  private async detailOf(user: SessionUser, req: ApprovalRow): Promise<ApprovalDetail> {
    const actions = await this.store.actions(user.tenantId, [req.id]);
    const item = await this.item(user, req, actions);
    const wf = await this.store.workflow(user.tenantId, req.workflowId);
    const steps = wf ? await this.stepViews(user.tenantId, wf, applicableSteps(wf, req.amount ?? 0), req.requestedByUserId, currentRound(actions), req) : [];
    const ids = actions.flatMap((a) => [a.actorUserId, a.onBehalfOfUserId, a.delegateToUserId]).filter((x): x is string => !!x);
    const names = await this.store.names(user.tenantId, ids);
    const who = (x: string | null) => (x ? { id: x, name: names.get(x) ?? '—' } : null);
    return {
      ...item, steps,
      actions: actions.map((a) => ({ id: a.id, stepNo: a.stepNo, action: a.action, actor: who(a.actorUserId), onBehalfOf: who(a.onBehalfOfUserId), delegateTo: who(a.delegateToUserId), reason: a.reason, comment: a.comment, actedAt: a.actedAt.toISOString() })),
      lines: await this.subject(req.entityType).lines(user.tenantId, req.entityId),
      comments: (await this.subject(req.entityType).comments?.(user.tenantId, req.entityId)) ?? [],
    };
  }

  private async stepViews(tenantId: string, wf: EngineWorkflow, steps: EngineStep[], requesterUserId: string, round: ActionRow[], req: ApprovalRow | null): Promise<ApprovalStep[]> {
    const out: ApprovalStep[] = [];
    for (const s of steps) {
      const { principals } = await this.approversOf(tenantId, s, requesterUserId);
      const names = await this.store.names(tenantId, [...principals, ...round.map((a) => a.actorUserId).filter((x): x is string => !!x)]);
      const acted = round.filter((a) => a.stepNo === s.stepNo && a.action === 'APPROVE');
      const skipped = !principals.length || round.some((a) => a.stepNo === s.stepNo && a.action === 'AUTO_SKIP');
      const state: ApprovalStep['state'] = skipped && !acted.length ? 'skipped' : !req ? 'waiting'
        : req.status === 'APPROVED' || (req.currentStepNo !== null && s.stepNo < req.currentStepNo) ? 'done'
          : req.status === 'PENDING' && s.stepNo === req.currentStepNo ? 'current' : 'waiting';
      out.push({
        stepNo: s.stepNo, name: s.name, mode: s.approvalMode, appliesAboveAmount: s.appliesAboveAmount,
        approvers: principals.map((p) => ({ id: p, name: names.get(p) ?? '—' })),
        state, actedBy: acted.map((a) => ({ id: a.actorUserId ?? '', name: names.get(a.actorUserId ?? '') ?? '—', at: a.actedAt.toISOString() })),
      });
    }
    void wf;
    return out;
  }

  private subject(entityType: string) {
    const s = this.subjects.get(entityType);
    if (!s) throw new ValidationError(`No approval subject for ${entityType}`);
    return s;
  }
}
