import { Injectable, type OnModuleInit } from '@nestjs/common';
import { addDays, weekDays, weekStartOf, type MyShifts, type OpenShiftInput, type OpenShiftItem, type RosterSave, type SessionUser, type SwapInput, type SwapItem } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { RosterStore, type SwapBase } from './roster-store.js';

const published = () => new ConflictError('This roster week is published. Edit it through a republish.', undefined, { code: 'ROSTER_PUBLISHED' });
const notActionable = (m = 'This swap can’t be changed at its current step.') => new ConflictError(m, undefined, { code: 'SWAP_NOT_ACTIONABLE' });
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));

/**
 * Rosters, shift swaps and open shifts. HR plans the weekly roster (drafts) and publishes it; employees see only the
 * published roster. A swap is requested by an employee, accepted by the colleague, then approved through the engine
 * (default "Shift swaps" workflow: line manager, then HR), which updates the published roster. Open shifts are posted
 * by HR, picked up by employees within the slots, and confirmed by HR (the roster follows).
 */
@Injectable()
export class RostersService implements OnModuleInit {
  constructor(
    private readonly store: RosterStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['SW'],
      workflowSubject: 'SHIFT_SWAP',
      link: (id) => `/hr/shifts?swap=${id}`,
      lines: async (tenantId, id) => {
        const s = await this.store.swap(tenantId, id);
        return s ? [{ account: `${s.requester.name} ⇄ ${s.counterpart.name} · ${s.swapDate}`, particulars: `${s.requesterShift?.code ?? '—'} ⇄ ${s.counterpartShift?.code ?? 'cover'} · ${s.reasonCategory}`, debit: 0, credit: 0 }] : [];
      },
      onApproved: async (_tenantId, id) => { await this.store.approveSwap(id, null); },
      onReturned: async (_tenantId, id, _action, reason) => { await this.store.rejectSwap(id, reason ?? 'Rejected'); },
    });
  }

  // ---------------------------------------------------------------- roster
  async week(user: SessionUser, q: { week: string; department?: string; branch?: string }) {
    return this.store.week(user.tenantId, weekStartOf(q.week), q);
  }

  /** Saves a week's entries. A published day changes only with `republish` (it goes back to draft); deletes only unpublished days. */
  async save(user: SessionUser, meta: RequestMeta, weekOf: string, input: RosterSave) {
    const monday = weekStartOf(weekOf);
    const days = weekDays(monday);
    const bad = input.entries.findIndex((e) => !days.includes(e.date));
    if (bad >= 0) throw v({ [`entries.${bad}.date`]: 'Not in this week' });
    const empIds = [...new Set(input.entries.map((e) => e.employeeId))];
    const active = await this.store.activeEmployees(user.tenantId, empIds, days[6]!);
    if (empIds.some((id) => !active.includes(id))) throw v({ entries: 'Choose employees who are employed that week' });
    const shifts = new Set((await this.store.activeShifts(user.tenantId)).map((s) => s.id));
    const badShift = input.entries.findIndex((e) => e.shiftId && !shifts.has(e.shiftId));
    if (badShift >= 0) throw v({ [`entries.${badShift}.shiftId`]: 'Choose an active shift' });
    const cells = await this.store.cells(user.tenantId, empIds, days[0]!, days[6]!);
    for (const e of input.entries) {
      const c = cells.get(`${e.employeeId}|${e.date}`);
      if (c?.isPublished && (!input.republish || e.entryType === null)) throw published();
    }
    const changed = await this.unitOfWork.run(actorContext(user, meta), async () => {
      let n = 0;
      for (const e of input.entries) {
        const c = cells.get(`${e.employeeId}|${e.date}`);
        if (e.entryType === null) { if (c) { await this.store.deleteEntry(user.tenantId, c.id); n++; } continue; }
        const shiftId = e.entryType === 'SHIFT' ? e.shiftId : null;
        if (c && c.entryType === e.entryType && c.shiftId === shiftId && (c.remarks ?? null) === (e.remarks ?? null)) continue;
        await this.store.saveEntry({
          ...(c && { id: c.id, rowVersion: c.rowVersion }), ...(c?.isPublished && { isPublished: false, publishedAt: null }),
          employeeId: e.employeeId, rosterDate: e.date, entryType: e.entryType, shiftId, remarks: e.remarks,
        });
        n++;
      }
      return n;
    });
    return { changed, week: await this.store.week(user.tenantId, monday, {}) };
  }

  async publish(user: SessionUser, meta: RequestMeta, weekOf: string, department?: string) {
    const monday = weekStartOf(weekOf);
    const w = await this.store.week(user.tenantId, monday, { department });
    const ids = department ? w.rows.map((r) => r.employee.id) : null;
    if (!w.unpublished) throw new ConflictError('Nothing to publish: this week has no draft roster days.');
    const n = await this.unitOfWork.run(actorContext(user, meta), () => this.store.publish(monday, addDays(monday, 6), ids));
    return { published: n, week: await this.store.week(user.tenantId, monday, { department }) };
  }

  // ---------------------------------------------------------------- swaps
  async swapList(user: SessionUser, q: { status?: string }) {
    return Promise.all((await this.store.swaps(user.tenantId, q)).map((s) => this.withApproval(user, s)));
  }

  async getSwap(user: SessionUser, id: string): Promise<SwapItem> {
    const s = await this.store.swap(user.tenantId, id);
    if (!s) throw new NotFoundError('Swap request not found');
    return this.withApproval(user, s);
  }

  private async withApproval(user: SessionUser, s: SwapBase): Promise<SwapItem> {
    const approval = s.status === 'ACCEPTED' || s.status === 'APPROVED' || s.status === 'REJECTED' ? await this.approvals.forEntity(user, 'SW', s.id) : null;
    return { ...s, approval, canAct: !!approval?.canAct };
  }

  async approveSwap(user: SessionUser, meta: RequestMeta, id: string, comment: string | null, viaEngineOnly = false) {
    const s = await this.getSwap(user, id);
    if (s.status !== 'ACCEPTED') throw notActionable('Only a swap the colleague has accepted can be approved.');
    if (s.approval?.status === 'PENDING') await this.approvals.act(user, meta, s.approval.id, 'approve', { reason: null, comment });
    else {
      if (viaEngineOnly || !user.permissions.includes('att:approve')) throw new ForbiddenError('You can’t approve shift swaps.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.approveSwap(id, comment));
    }
    return this.getSwap(user, id);
  }

  async rejectSwap(user: SessionUser, meta: RequestMeta, id: string, reason: string, viaEngineOnly = false) {
    const s = await this.getSwap(user, id);
    if (s.status !== 'ACCEPTED' && s.status !== 'REQUESTED') throw notActionable();
    if (s.approval?.status === 'PENDING') await this.approvals.act(user, meta, s.approval.id, 'reject', { reason, comment: null });
    else {
      if (viaEngineOnly || !user.permissions.includes('att:approve')) throw new ForbiddenError('You can’t reject shift swaps.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.rejectSwap(id, reason));
    }
    return this.getSwap(user, id);
  }

  async requestSwap(user: SessionUser, meta: RequestMeta, input: SwapInput) {
    const me = await this.me(user);
    const today = await this.store.today(user.tenantId);
    if (input.swapDate < today) throw v({ swapDate: 'Choose today or a later day' });
    if (input.counterpartEmployeeId === me.id) throw v({ counterpartEmployeeId: 'Choose a colleague, not yourself' });
    if (!(await this.store.activeEmployees(user.tenantId, [input.counterpartEmployeeId], input.swapDate)).length) throw v({ counterpartEmployeeId: 'Choose a colleague employed that day' });
    const mine = await this.store.planned(user.tenantId, me.id, input.swapDate);
    if (mine.entryType !== 'SHIFT' || !mine.shiftId) throw v({ swapDate: 'You have no shift that day to give away' });
    const theirs = await this.store.planned(user.tenantId, input.counterpartEmployeeId, input.swapDate);
    if (theirs.entryType === 'LEAVE') throw v({ counterpartEmployeeId: 'Your colleague is on leave that day' });
    if (theirs.entryType === 'SHIFT' && theirs.shiftId === mine.shiftId) throw v({ counterpartEmployeeId: 'Your colleague already works the same shift that day' });
    const swapMode = theirs.entryType === 'SHIFT' ? 'SWAP' : 'COVER';
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveSwap({
      docDate: today, requesterEmployeeId: me.id, counterpartEmployeeId: input.counterpartEmployeeId, swapDate: input.swapDate, swapMode, requesterShiftId: mine.shiftId,
      counterpartShiftId: swapMode === 'SWAP' ? theirs.shiftId : null, reasonCategory: input.reasonCategory, reason: input.reason, noteToCounterpart: input.noteToCounterpart,
    }));
    return this.getSwap(user, id);
  }

  /** The colleague accepts (the swap then goes for approval, requested by the requester) or declines. */
  async answerSwap(user: SessionUser, meta: RequestMeta, id: string, accept: boolean, reason: string | null) {
    const me = await this.me(user);
    const s = await this.getSwap(user, id);
    if (s.counterpart.id !== me.id) throw new NotFoundError('Swap request not found');
    if (s.status !== 'REQUESTED') throw notActionable('This swap was already answered.');
    if (!accept && !reason) throw v({ reason: 'Give a reason' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (!accept) { await this.store.setSwap(user.tenantId, id, { status: 'DECLINED', decisionReason: reason }); return; }
      await this.store.setSwap(user.tenantId, id, { status: 'ACCEPTED', acceptedAt: new Date() });
      const requester = await this.store.employee(user.tenantId, s.requester.id);
      if (!requester?.appUserId) return;
      await this.approvals.submit({ ...user, id: requester.appUserId }, { entityType: 'SW', entityId: id, docLabel: s.docNo, title: `${s.requester.name} ⇄ ${s.counterpart.name} · ${s.swapDate}`, amount: 0, branchId: requester.branchId, facts: { DOC_TYPE: 'SW', ...(requester.branchId && { BRANCH: requester.branchId }) } });
    });
    return this.getSwap(user, id);
  }

  async withdrawSwap(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const me = await this.me(user);
    const s = await this.getSwap(user, id);
    if (s.requester.id !== me.id) throw new NotFoundError('Swap request not found');
    if (s.status !== 'REQUESTED' && s.status !== 'ACCEPTED') throw notActionable();
    if (s.rowVersion !== rowVersion) throw new ConcurrencyError('This swap was changed. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (s.approval?.status === 'PENDING') await this.approvals.cancelFor(user, 'SW', id, 'Withdrawn by the requester');
      await this.store.setSwap(user.tenantId, id, { status: 'WITHDRAWN' });
    });
    return this.getSwap(user, id);
  }

  // ---------------------------------------------------------------- open shifts
  async openList(user: SessionUser, q: { status?: string }) {
    return (await this.store.openShifts(user.tenantId, q)).map((o) => ({ ...o, myClaim: null }));
  }

  async postOpen(user: SessionUser, meta: RequestMeta, input: OpenShiftInput) {
    if (input.shiftDate < (await this.store.today(user.tenantId))) throw v({ shiftDate: 'Choose today or a later day' });
    if (!(await this.store.activeShifts(user.tenantId)).some((s) => s.id === input.shiftId)) throw v({ shiftId: 'Choose an active shift' });
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => this.store.saveOpen({ ...input, code: await this.store.nextOpenCode(user.tenantId), postedByUserId: user.id }));
    return { ...(await this.store.openShift(user.tenantId, id))!, myClaim: null };
  }

  async cancelOpen(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const o = await this.store.openShift(user.tenantId, id);
    if (!o) throw new NotFoundError('Open shift not found');
    if (o.rowVersion !== rowVersion) throw new ConcurrencyError('This open shift was changed. Reload and try again.');
    if (o.status === 'CANCELLED') throw new ConflictError('This open shift is already cancelled.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.cancelOpen(id, null));
    return { ...(await this.store.openShift(user.tenantId, id))!, myClaim: null };
  }

  async decideClaim(user: SessionUser, meta: RequestMeta, claimId: string, confirm: boolean) {
    const c = await this.store.claim(user.tenantId, claimId);
    if (!c) throw new NotFoundError('Pick-up request not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.decideClaim(claimId, confirm));
    return { ...(await this.store.openShift(user.tenantId, c.openShiftId))!, myClaim: null };
  }

  async claimOpen(user: SessionUser, meta: RequestMeta, id: string): Promise<OpenShiftItem> {
    const me = await this.me(user);
    const o = await this.store.openShift(user.tenantId, id);
    if (!o || (o.branch && o.branch.id !== me.branchId) || (o.department && o.department.id !== me.departmentId)) throw new NotFoundError('Open shift not found');
    const p = await this.store.planned(user.tenantId, me.id, o.shiftDate);
    if (p.entryType === 'SHIFT') throw new ConflictError('You’re already rostered that day. Swap your shift first.');
    const claimId = await this.unitOfWork.run(actorContext(user, meta), () => this.store.claimOpen(id, me.id));
    return { ...(await this.store.openShift(user.tenantId, id))!, myClaim: { id: claimId, status: 'REQUESTED' } };
  }

  async withdrawClaim(user: SessionUser, meta: RequestMeta, id: string) {
    const me = await this.me(user);
    const o = await this.store.openShift(user.tenantId, id);
    const mine = o?.claims.find((c) => c.employee.id === me.id && c.status === 'REQUESTED');
    if (!o || !mine) throw new ConflictError('You have no pending pick-up on this shift.', undefined, { code: 'REQUEST_NOT_PENDING' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setClaim(user.tenantId, mine.id, { status: 'WITHDRAWN' }));
    return { ...(await this.store.openShift(user.tenantId, id))!, myClaim: { id: mine.id, status: 'WITHDRAWN' } };
  }

  // ---------------------------------------------------------------- my shifts
  async mine(user: SessionUser, weekOf?: string): Promise<MyShifts> {
    const me = await this.me(user);
    const today = await this.store.today(user.tenantId);
    const monday = weekStartOf(weekOf ?? today);
    const roster = await this.store.week(user.tenantId, monday, { department: me.departmentId ?? undefined, employeeIds: me.departmentId ? undefined : [me.id] });
    // employees see the published roster only
    for (const r of roster.rows) for (const d of Object.keys(r.cells)) if (!r.cells[d]!.isPublished) delete r.cells[d];
    roster.rows.sort((a, b) => (a.employee.id === me.id ? -1 : b.employee.id === me.id ? 1 : a.employee.name.localeCompare(b.employee.name)));
    const thisWeek = weekDays(weekStartOf(today));
    const planned = await Promise.all(thisWeek.map((d) => this.store.planned(user.tenantId, me.id, d)));
    const shifts = new Map((await this.store.activeShifts(user.tenantId)).map((s) => [s.id, s.scheduledHours]));
    const todayPlan = await this.store.planned(user.tenantId, me.id, today);
    let next: { date: string; startTime: string } | null = null;
    for (let i = 1; i <= 14 && !next; i++) {
      const d = addDays(today, i);
      const p = await this.store.planned(user.tenantId, me.id, d);
      if (p.entryType === 'SHIFT' && p.shiftId) next = { date: d, startTime: (await this.store.shift(user.tenantId, p.shiftId))?.startTime ?? '' };
    }
    const worked = await this.store.worked(user.tenantId, me.id, thisWeek[0]!, thisWeek[6]!);
    const all = await this.store.swaps(user.tenantId, { employeeId: me.id });
    const answer = await this.store.swaps(user.tenantId, { counterpartId: me.id, status: 'REQUESTED' });
    const accepted = await this.store.swaps(user.tenantId, { status: 'ACCEPTED' });
    const toApprove = (await Promise.all(accepted.map((s) => this.withApproval(user, s)))).filter((s) => s.canAct);
    const open = await this.store.openShifts(user.tenantId, { status: 'OPEN', from: today, branchId: me.branchId, departmentId: me.departmentId, forEmployee: true });
    const peers = roster.rows.filter((r) => r.employee.id !== me.id).map((r) => ({ employee: r.employee, entries: {} as Record<string, { entryType: string; shiftId: string | null }> }));
    for (const p of peers) for (const d of weekDays(weekStartOf(today)).concat(weekDays(addDays(weekStartOf(today), 7)))) {
      const x = await this.store.planned(user.tenantId, p.employee.id, d);
      p.entries[d] = { entryType: x.entryType, shiftId: x.shiftId };
    }
    return {
      employee: roster.rows.find((r) => r.employee.id === me.id)?.employee ?? (await this.store.week(user.tenantId, monday, { employeeIds: [me.id] })).rows[0]!.employee,
      today, roster, myId: me.id,
      todayShift: todayPlan.entryType === 'SHIFT' && todayPlan.shiftId ? await this.store.shift(user.tenantId, todayPlan.shiftId) : null,
      nextShift: next, firstIn: await this.store.firstInToday(user.tenantId, me.id),
      week: {
        scheduledHours: planned.reduce((s, p) => s + (p.entryType === 'SHIFT' && p.shiftId ? shifts.get(p.shiftId) ?? 0 : 0), 0),
        workedHours: Math.round((worked.minutes / 60) * 10) / 10, overtimeMinutes: worked.overtime,
        restDays: thisWeek.filter((_, i) => planned[i]!.entryType === 'OFF'), swapsThisMonth: await this.store.swapsThisMonth(user.tenantId, me.id, today.slice(0, 7)),
      },
      swaps: await Promise.all(all.slice(0, 10).map((s) => this.withApproval(user, s))),
      toAnswer: await Promise.all(answer.map((s) => this.withApproval(user, s))),
      toApprove,
      openShifts: open.map((o) => {
        const c = o.claims.find((x) => x.employee.id === me.id);
        return { ...o, claims: [], myClaim: c ? { id: c.id, status: c.status } : null };
      }),
      peers, approver: await this.store.managerName(user.tenantId, me.id),
    };
  }

  private async me(user: SessionUser) {
    const me = await this.store.employeeOf(user.tenantId, user.id);
    if (!me) throw new ForbiddenError('Your user isn’t linked to an employee record, so shifts aren’t available. Ask HR to link it.');
    return me;
  }
}
