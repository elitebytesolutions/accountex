import { Injectable } from '@nestjs/common';
import type { MyOnboarding, OnboardingStart, OnboardingTaskUpdate, OnboardingUpdate, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { OnboardingStore } from './onboarding-store.js';

const closed = () => new ConflictError('This onboarding is completed or cancelled.', undefined, { code: 'ONBOARDING_CLOSED' });
const OPEN = ['PRE_JOINING', 'IN_PROGRESS'];

/**
 * Onboardings (ONB-) from a Phase 13 checklist template: the database copies the template's tasks with due dates
 * (joining date + offset) and owners; task updates move the onboarding along (completed when every task is done or
 * skipped). The joiner completes their own tasks from My Profile; policy acknowledgements stay read-only until Phase 34.
 */
@Injectable()
export class OnboardingsService {
  constructor(
    private readonly store: OnboardingStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async board(user: SessionUser, status: string) {
    const [b, myId] = await Promise.all([this.store.board(user.tenantId, { status, today: await this.store.today(user.tenantId) }), this.store.employeeIdOfUser(user.tenantId, user.id)]);
    return { ...b, myId };
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async get(user: SessionUser, id: string) {
    const o = await this.store.get(user.tenantId, id, await this.store.today(user.tenantId));
    if (!o) throw new NotFoundError('Onboarding not found');
    return o;
  }

  async start(user: SessionUser, meta: RequestMeta, input: OnboardingStart) {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.start(input));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: OnboardingUpdate) {
    const o = await this.get(user, id);
    if (!OPEN.includes(o.status)) throw closed();
    if (o.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this onboarding. Reload and try again.');
    if (input.buddyEmployeeId && input.buddyEmployeeId === o.employee.id) throw new ConflictError('Choose someone else as buddy', { buddyEmployeeId: ['Not the joiner'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(Object.fromEntries(Object.entries({ ...input, id }).filter(([, v]) => v !== undefined))));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, reason: string | null, rowVersion: number) {
    const o = await this.get(user, id);
    if (!OPEN.includes(o.status)) throw closed();
    if (o.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this onboarding. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.cancel(id, reason));
    return this.get(user, id);
  }

  async updateTask(user: SessionUser, meta: RequestMeta, onboardingId: string, taskId: string, input: OnboardingTaskUpdate) {
    const t = await this.store.task(user.tenantId, taskId);
    if (!t || t.onboardingId !== onboardingId) throw new NotFoundError('Onboarding task not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.updateTask(taskId, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))));
    return this.get(user, onboardingId);
  }

  // ---------------------------------------------------------------- my onboarding
  async mine(user: SessionUser): Promise<MyOnboarding> {
    const me = await this.store.employeeIdOfUser(user.tenantId, user.id);
    const today = await this.store.today(user.tenantId);
    if (!me) return { today, onboarding: null, past: [], myId: null };
    return { ...(await this.store.myOnboarding(user.tenantId, me, today)), myId: me };
  }

  /** The joiner completes a task of their own onboarding that they own (EMPLOYEE tasks or assigned to them). */
  async completeMine(user: SessionUser, meta: RequestMeta, taskId: string, note: string | null, rowVersion: number) {
    const me = await this.store.employeeIdOfUser(user.tenantId, user.id);
    const t = await this.store.task(user.tenantId, taskId);
    if (!me || !t || t.employeeId !== me) throw new NotFoundError('Onboarding task not found');
    if (t.ownerFunction !== 'EMPLOYEE' && t.ownerEmployeeId !== me) throw new ForbiddenError('This task is done by someone else; it updates when they complete it.');
    if (t.actionKind === 'POLICY_ACK') throw new ForbiddenError('Policy acknowledgements open with My Profile › Policies (Phase 34).');
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('This task was changed. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.updateTask(taskId, { status: 'COMPLETED', completionNote: note, rowVersion }));
    return this.mine(user);
  }
}
