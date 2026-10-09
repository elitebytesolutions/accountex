import { Injectable } from '@nestjs/common';
import type { SessionUser, Task, TaskInput, TaskQuery, TodayView } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { WorkStore, type TaskRow } from '../../common/application/work-store.js';
import { weekOf } from '../domain/week.js';

const changed = () => new ConcurrencyError('This task was changed. Reload and try again.');
const notYours = () => new ForbiddenError('This task belongs to someone else.', undefined, { code: 'TASK_NOT_YOURS' });
const notOpen = () => new ConflictError('This task is already done or cancelled.', undefined, { code: 'TASK_NOT_OPEN' });

/**
 * Today's Work: my tasks (assigned to me, or given by me to others) and everything due today — invoices, bills and
 * cheques (Company.getTodayDueItems) with the day's KPIs (Company.getTodayKpis). Completing a repeating task creates its
 * next occurrence; giving a task to someone notifies them (DB trigger). Only the assignee or the assigner may change a
 * task; only a pending one is deleted, otherwise it is cancelled.
 */
@Injectable()
export class TasksService {
  constructor(private readonly store: WorkStore, private readonly approvals: ApprovalsService, private readonly unitOfWork: UnitOfWork) {}

  private view(user: SessionUser, today: string, t: TaskRow): Task {
    const { assigneeUserId, assignedByUserId, ...rest } = t;
    return { ...rest, canEdit: assigneeUserId === user.id || assignedByUserId === user.id, overdue: ['PENDING', 'IN_PROGRESS'].includes(t.status) && t.dueDate < today };
  }

  users(user: SessionUser) {
    return this.store.users(user.tenantId);
  }

  async list(user: SessionUser, q: TaskQuery) {
    const today = await this.store.companyToday(user.tenantId);
    return (await this.store.listTasks(user.tenantId, user.id, q)).map((t) => this.view(user, today, t));
  }

  async get(user: SessionUser, id: string) {
    const t = await this.store.getTask(user.tenantId, id);
    if (!t) throw new NotFoundError('Task not found');
    if (t.assigneeUserId !== user.id && t.assignedByUserId !== user.id) throw notYours();
    return this.view(user, await this.store.companyToday(user.tenantId), t);
  }

  async today(user: SessionUser, meta: RequestMeta): Promise<TodayView> {
    const today = await this.store.companyToday(user.tenantId);
    const week = weekOf(today);
    // the views read the current user from the session context
    const [kpis, due, inbox] = await this.unitOfWork.run(actorContext(user, meta), () => Promise.all([this.store.todayKpis(), this.store.dueItems(), this.approvals.inbox(user)]));
    const [tasks, counts] = await Promise.all([
      this.store.listTasks(user.tenantId, user.id, { status: 'all', scope: 'mine', from: week[0], to: week[6] }),
      this.store.weekCounts(user.tenantId, user.id, week[0]!, week[6]!),
    ]);
    const open = await this.store.listTasks(user.tenantId, user.id, { status: 'open', scope: 'mine', to: today });
    const ids = new Set(tasks.map((t) => t.id));
    return {
      date: today,
      kpis: { ...kpis, awaitingApprovalCount: inbox.kpis.waiting, awaitingApprovalValue: inbox.kpis.valuePending },
      due,
      tasks: [...open.filter((t) => !ids.has(t.id)), ...tasks].map((t) => this.view(user, today, t)),
      week: counts,
    };
  }

  private async assignee(user: SessionUser, input: TaskInput) {
    const id = input.assigneeUserId ?? user.id;
    if (id !== user.id && !(await this.store.isActiveUser(user.tenantId, id))) throw new ValidationError('Choose an active user', { assigneeUserId: ['Unknown user'] });
    return id;
  }

  private data(input: TaskInput, assigneeUserId: string) {
    return {
      title: input.title, notes: input.notes, module: input.module, kind: input.kind, assigneeUserId, dueDate: input.dueDate, dueTime: input.dueTime ? `${input.dueTime}:00` : null,
      priority: input.priority, repeatRule: input.repeatRule, remindBeforeMin: input.remindBeforeMin ?? null, linkRoute: input.linkRoute ?? null,
    };
  }

  async create(user: SessionUser, meta: RequestMeta, input: TaskInput) {
    const assigneeUserId = await this.assignee(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.saveTask({ ...this.data(input, assigneeUserId), assignedByUserId: user.id, status: 'PENDING', source: 'MANUAL' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: TaskInput & { rowVersion: number }) {
    const t = await this.get(user, id);
    if (!t.canEdit) throw notYours();
    if (!['PENDING', 'IN_PROGRESS'].includes(t.status)) throw notOpen();
    if (t.rowVersion !== input.rowVersion) throw changed();
    const assigneeUserId = await this.assignee(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveTask({ id, rowVersion: input.rowVersion, ...this.data(input, assigneeUserId) }));
    return this.get(user, id);
  }

  async complete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const t = await this.get(user, id);
    if (!t.canEdit) throw notYours();
    if (t.rowVersion !== rowVersion) throw changed();
    const next = await this.unitOfWork.run(actorContext(user, meta), () => this.store.completeTask(id));
    return { task: await this.get(user, id), next: next ? await this.get(user, next) : null };
  }

  async setStatus(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, status: 'IN_PROGRESS' | 'CANCELLED' | 'PENDING') {
    const t = await this.get(user, id);
    if (!t.canEdit) throw notYours();
    if (!['PENDING', 'IN_PROGRESS'].includes(t.status)) throw notOpen();
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.setTaskStatus(user.tenantId, id, rowVersion, status)))) throw changed();
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const t = await this.get(user, id);
    if (!t.canEdit) throw notYours();
    if (t.status !== 'PENDING') throw new ConflictError('Only a pending task is deleted; cancel it instead.', undefined, { code: 'TASK_NOT_OPEN' });
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteTask(user.tenantId, id, rowVersion)))) throw changed();
  }
}
