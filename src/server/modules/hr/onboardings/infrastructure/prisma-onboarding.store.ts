import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { OnboardingBoard, OnboardingItem, OnboardingTaskItem } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeName, employeeOfUser, employeeRefs, ids, num, tenantTimezone, todayIn, unknownEmp, userNames } from '../../attendance/infrastructure/hr-refs.js';
import { OnboardingStore } from '../application/onboarding-store.js';

type Db = Prisma.TransactionClient;
type ObRow = Prisma.OnboardingsGetPayload<object>;
type TaskRow = Prisma.OnboardingTasksGetPayload<object>;
const OPEN = ['PRE_JOINING', 'IN_PROGRESS'];
const DONE = ['COMPLETED', 'SKIPPED'];

@Injectable()
export class PrismaOnboardingStore extends OnboardingStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.db(), tenantId));
  }

  private async tasks(db: Db, tenantId: string, rows: TaskRow[], today: string): Promise<OnboardingTaskItem[]> {
    const [refs, users] = await Promise.all([employeeRefs(db, tenantId, rows.map((t) => t.ownerEmployeeId)), userNames(db, tenantId, rows.map((t) => t.completedByUserId))]);
    return rows.map((t) => {
      const o = t.ownerEmployeeId ? refs.get(t.ownerEmployeeId) : null;
      return {
        id: t.id, onboardingId: t.onboardingId, taskGroup: t.taskGroup, title: t.title, description: t.description, ownerFunction: t.ownerFunction,
        owner: o ? { id: o.id, name: o.name } : null, dueOn: day(t.dueOn), actionKind: t.actionKind, progressPct: num(t.progressPct), status: t.status,
        scheduledAt: t.scheduledAt?.toISOString() ?? null, completionNote: t.completionNote, completedAt: t.completedAt?.toISOString() ?? null,
        completedBy: users.get(t.completedByUserId ?? '') ?? null, sortOrder: t.sortOrder, overdue: !DONE.includes(t.status) && !!t.dueOn && day(t.dueOn)! < today, rowVersion: t.rowVersion,
      };
    });
  }

  private async items(db: Db, tenantId: string, rows: ObRow[], today: string): Promise<OnboardingItem[]> {
    const [refs, templates, desigs, tasks] = await Promise.all([
      employeeRefs(db, tenantId, rows.flatMap((o) => [o.employeeId, o.buddyEmployeeId])),
      db.onboardingTemplates.findMany({ where: { tenantId, id: { in: ids(rows.map((o) => o.templateId)) } }, select: { id: true, name: true } }),
      db.designations.findMany({ where: { tenantId, id: { in: ids(rows.map((o) => o.designationId)) } }, select: { id: true, title: true } }),
      db.onboardingTasks.findMany({ where: { tenantId, onboardingId: { in: rows.map((o) => o.id) } }, select: { onboardingId: true, status: true, dueOn: true } }),
    ]);
    return rows.map((o) => {
      const mine = tasks.filter((t) => t.onboardingId === o.id);
      const b = o.buddyEmployeeId ? refs.get(o.buddyEmployeeId) : null;
      return {
        id: o.id, docNo: o.docNo, employee: refs.get(o.employeeId) ?? unknownEmp(o.employeeId), template: templates.find((t) => t.id === o.templateId) ?? null, track: o.track,
        designation: desigs.find((d) => d.id === o.designationId)?.title ?? null, joiningDate: day(o.joiningDate)!, startDate: day(o.startDate)!, targetDate: day(o.targetDate),
        buddy: b ? { id: b.id, name: b.name } : null, status: o.status, completedAt: o.completedAt?.toISOString() ?? null,
        tasksDone: mine.filter((t) => DONE.includes(t.status)).length, tasksTotal: mine.length,
        overdue: OPEN.includes(o.status) ? mine.filter((t) => !DONE.includes(t.status) && t.dueOn && day(t.dueOn)! < today).length : 0, rowVersion: o.rowVersion,
      };
    });
  }

  async board(tenantId: string, q: { status: string; today: string }): Promise<Omit<OnboardingBoard, 'myId'>> {
    const db = this.db();
    const statusWhere = q.status === 'OPEN' ? { in: OPEN } : q.status === 'ALL' ? undefined : { equals: q.status };
    const [rows, open] = await Promise.all([
      db.onboardings.findMany({ where: { tenantId, ...(statusWhere && { status: statusWhere }) }, orderBy: [{ joiningDate: 'desc' }] }),
      db.onboardings.findMany({ where: { tenantId, status: { in: OPEN } }, select: { id: true, employeeId: true, joiningDate: true } }),
    ]);
    const openTasks = await db.onboardingTasks.findMany({ where: { tenantId, onboardingId: { in: open.map((o) => o.id) } }, orderBy: [{ dueOn: 'asc' }, { sortOrder: 'asc' }] });
    const tasks = await this.tasks(db, tenantId, openTasks.filter((t) => !DONE.includes(t.status)), q.today);
    const joiners = await employeeRefs(db, tenantId, open.map((o) => o.employeeId));
    const in30 = new Date(asDate(q.today).getTime() + 30 * 86_400_000);
    const probationDue = await db.employees.count({ where: { tenantId, deletedAt: null, status: 'PROBATION', confirmedOn: null, confirmationDueOn: { gte: asDate(q.today), lte: in30 } } });
    const overdue = tasks.filter((t) => t.overdue);
    return {
      today: q.today,
      items: await this.items(db, tenantId, rows, q.today),
      tasks: tasks.map((t) => { const o = open.find((x) => x.id === t.onboardingId)!; const j = joiners.get(o.employeeId); return { ...t, joiner: { id: o.employeeId, name: j?.name ?? '?' } }; }),
      kpis: {
        inOnboarding: open.length, joiningThisMonth: open.filter((o) => day(o.joiningDate)!.slice(0, 7) === q.today.slice(0, 7)).length,
        tasksDone: openTasks.filter((t) => DONE.includes(t.status)).length, tasksTotal: openTasks.length, overdue: overdue.length,
        overdueTitles: [...new Set(overdue.map((t) => t.title))].slice(0, 3), probationDue,
      },
    };
  }

  async get(tenantId: string, id: string, today: string) {
    const db = this.db();
    const o = await db.onboardings.findFirst({ where: { tenantId, id } });
    if (!o) return null;
    const [item] = await this.items(db, tenantId, [o], today);
    const tasks = await db.onboardingTasks.findMany({ where: { tenantId, onboardingId: id }, orderBy: { sortOrder: 'asc' } });
    return { ...item!, tasks: await this.tasks(db, tenantId, tasks, today) };
  }

  async options(tenantId: string) {
    const db = this.db();
    const [emps, open, templates, counts] = await Promise.all([
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, orderBy: { joiningDate: 'desc' }, select: { id: true, code: true, displayName: true, firstName: true, lastName: true, joiningDate: true } }),
      db.onboardings.findMany({ where: { tenantId, status: { in: OPEN } }, select: { employeeId: true } }),
      db.onboardingTemplates.findMany({ where: { tenantId, deletedAt: null, isActive: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
      db.onboardingTemplateTasks.groupBy({ by: ['templateId'], where: { tenantId }, _count: { _all: true } }),
    ]);
    return {
      employees: emps.map((e) => ({ id: e.id, code: e.code, name: employeeName(e), joiningDate: day(e.joiningDate)!, hasOpen: open.some((o) => o.employeeId === e.id) })),
      templates: templates.map((t) => ({ id: t.id, name: t.name, track: t.track, isDefault: t.isDefault, tasks: counts.find((c) => c.templateId === t.id)?._count._all ?? 0 })),
    };
  }

  async task(tenantId: string, taskId: string) {
    const db = this.db();
    const t = await db.onboardingTasks.findFirst({ where: { tenantId, id: taskId } });
    if (!t) return null;
    const o = await db.onboardings.findFirst({ where: { tenantId, id: t.onboardingId }, select: { employeeId: true } });
    return { id: t.id, onboardingId: t.onboardingId, ownerFunction: t.ownerFunction, ownerEmployeeId: t.ownerEmployeeId, actionKind: t.actionKind, status: t.status, rowVersion: t.rowVersion, employeeId: o!.employeeId };
  }

  async myOnboarding(tenantId: string, employeeId: string, today: string) {
    const db = this.db();
    const rows = await db.onboardings.findMany({ where: { tenantId, employeeId, status: { not: 'CANCELLED' } }, orderBy: [{ startDate: 'desc' }] });
    const current = rows.find((o) => OPEN.includes(o.status)) ?? rows[0];
    return {
      today,
      onboarding: current ? await this.get(tenantId, current.id, today) : null,
      past: await this.items(db, tenantId, rows.filter((o) => o.id !== current?.id), today),
    };
  }

  async employeeIdOfUser(tenantId: string, userId: string) {
    return (await employeeOfUser(this.db(), tenantId, userId))?.id ?? null;
  }

  start(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'onboardingFromTemplate', data);
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'onboardingAddUpdate', data);
  }

  async cancel(id: string, reason: string | null) {
    await this.db().$queryRaw`select "HumanResources"."onboardingCancel"(${id}::uuid, ${reason})::text`;
  }

  async updateTask(id: string, data: Record<string, unknown>) {
    await this.db().$queryRaw`select "HumanResources"."onboardingTaskUpdate"(${id}::uuid, ${JSON.stringify(data)}::jsonb)::text`;
  }
}
