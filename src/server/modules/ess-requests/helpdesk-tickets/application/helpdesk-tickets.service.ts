import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type {
  TicketAssign, TicketCreate, TicketDetail, TicketList, TicketQuery, TicketRate, TicketReopen, TicketResolve,
} from '../../../../../shared/self-service/helpdesk-ticket.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { HelpdeskTicketStore, type TicketRow } from './helpdesk-ticket-store.js';

const HR = 'emp:edit';
const notFound = () => new NotFoundError('Ticket not found');
const notAgent = () => new ForbiddenError('Only HR or the ticket’s agent can do that.', undefined, { code: 'HELPDESK_NOT_AGENT' });
const wrongState = (what: string) => new ConflictError(`This ticket can’t be ${what} at its current status.`, undefined, { code: 'HELPDESK_TICKET_STATE' });
const closed = () => new ConflictError('This ticket is closed.', undefined, { code: 'HELPDESK_TICKET_CLOSED' });

/**
 * Helpdesk tickets (HD-). An employee raises a ticket on a desk; it is routed to the desk owner with the desk's
 * reply SLA (shortened by the desk's high-priority factor). Agents are HR (emp:edit), the desk owner and the
 * assigned agent. Agents reply, reassign and resolve; the requester reopens or rates a resolved ticket, which closes it.
 * Tickets are never deleted.
 */
@Injectable()
export class HelpdeskTicketsService {
  constructor(private readonly store: HelpdeskTicketStore, private readonly unitOfWork: UnitOfWork) {}

  private isHr(user: SessionUser) {
    return user.permissions.includes(HR);
  }

  private async me(user: SessionUser) {
    return this.store.employeeOfUser(user.tenantId, user.id);
  }

  private async meRequired(user: SessionUser) {
    const id = await this.me(user);
    if (!id) throw new ConflictError('Your user is not linked to an employee record. Ask HR to link it.', undefined, { code: 'ESS_NO_EMPLOYEE_RECORD' });
    return id;
  }

  private isAgentOf(user: SessionUser, me: string | null, t: TicketRow) {
    return this.isHr(user) || (!!me && (t.agent?.id === me || t.categoryOwnerId === me));
  }

  async list(user: SessionUser, q: TicketQuery): Promise<TicketList> {
    const me = await this.me(user);
    const isHr = this.isHr(user);
    const isAgent = isHr || (!!me && (await this.store.ownsDesk(user.tenantId, me)));
    if (q.scope === 'all' && !isHr) throw notAgent();
    const desks = await this.store.deskRouting(user.tenantId, me);
    if (q.scope !== 'all' && !me) return { items: [], total: 0, counts: {}, isAgent, isHr, meId: null, desks };
    const l = await this.store.list(user.tenantId, {
      ...q, ...(q.scope === 'mine' && { employeeId: me! }), ...(q.scope === 'assigned' && { agentOf: me! }),
    });
    return { ...l, isAgent, isHr, meId: me, desks };
  }

  async get(user: SessionUser, id: string): Promise<TicketDetail> {
    const t = await this.store.get(user.tenantId, id);
    if (!t) throw notFound();
    const me = await this.me(user);
    const requester = !!me && t.employee.id === me;
    const agent = this.isAgentOf(user, me, t);
    if (!requester && !agent) throw notFound();
    const { categoryOwnerId, ...rest } = t;
    void categoryOwnerId;
    return {
      ...rest,
      messages: await this.store.messages(user.tenantId, id),
      can: {
        reply: t.status !== 'CLOSED' && (requester || (agent && !!me)),
        agent,
        reopen: requester && t.status === 'RESOLVED',
        rate: requester && t.status === 'RESOLVED',
      },
    };
  }

  agents(user: SessionUser) {
    if (!this.isHr(user)) throw notAgent();
    return this.store.agents(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: TicketCreate) {
    const me = await this.meRequired(user);
    const desk = await this.store.desk(user.tenantId, input.categoryId);
    if (!desk || desk.status !== 'ACTIVE') throw new ValidationError('Choose an active desk', { categoryId: ['Not an active desk'] });
    const opened = new Date();
    const slaHours = Math.round(desk.slaHours * (input.priority === 'HIGH' ? desk.highPrioritySlaFactor : 1) * 100) / 100;
    const due = new Date(opened.getTime() + slaHours * 3_600_000);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save({
        employeeId: me, categoryId: desk.id, subject: input.subject, description: input.description, priority: input.priority,
        agentEmployeeId: desk.ownerEmployeeId, contactChannel: input.contactChannel, contactValue: input.contactValue,
        openedAt: opened.toISOString(), slaHours, dueAt: due.toISOString(),
      });
      await this.store.addMessage(user.tenantId, newId, 'REQUESTER', me, input.description);
      return newId;
    });
    return this.get(user, id);
  }

  /** The requester writes as REQUESTER; an agent as AGENT. The first agent reply starts work on an open ticket. */
  async message(user: SessionUser, meta: RequestMeta, id: string, body: string) {
    const t = await this.store.get(user.tenantId, id);
    if (!t) throw notFound();
    const me = await this.meRequired(user);
    const requester = t.employee.id === me;
    const agent = this.isAgentOf(user, me, t);
    if (!requester && !agent) throw notFound();
    if (t.status === 'CLOSED') throw closed();
    const role = requester ? 'REQUESTER' : 'AGENT';
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.addMessage(user.tenantId, id, role, me, body);
      if (role === 'AGENT') {
        if (!t.firstResponseAt || t.status === 'OPEN') {
          await this.store.setStatus(user.tenantId, id, null, {
            status: t.status === 'OPEN' ? 'IN_PROGRESS' : t.status, ...(!t.firstResponseAt && { firstResponseAt: new Date().toISOString() }),
          });
        }
      }
    });
    return this.get(user, id);
  }

  private async forAgent(user: SessionUser, id: string, rowVersion: number) {
    const t = await this.store.get(user.tenantId, id);
    if (!t) throw notFound();
    const me = await this.me(user);
    if (!this.isAgentOf(user, me, t)) {
      if (me && t.employee.id === me) throw notAgent();
      throw notFound();
    }
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this ticket. Reload and try again.');
    if (t.status === 'CLOSED') throw closed();
    return { t, me };
  }

  private async forRequester(user: SessionUser, id: string, rowVersion: number) {
    const t = await this.store.get(user.tenantId, id);
    if (!t) throw notFound();
    const me = await this.meRequired(user);
    if (t.employee.id !== me) {
      if (this.isAgentOf(user, me, t)) throw new ForbiddenError('Only the person who raised the ticket can do that.');
      throw notFound();
    }
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this ticket. Reload and try again.');
    if (t.status === 'CLOSED') throw closed();
    return { t, me };
  }

  async assign(user: SessionUser, meta: RequestMeta, id: string, input: TicketAssign) {
    await this.forAgent(user, id, input.rowVersion);
    if (!(await this.store.activeEmployee(user.tenantId, input.agentEmployeeId))) throw new ValidationError('Choose an active employee', { agentEmployeeId: ['Not an active employee'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, agentEmployeeId: input.agentEmployeeId, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async resolve(user: SessionUser, meta: RequestMeta, id: string, input: TicketResolve) {
    const { t, me } = await this.forAgent(user, id, input.rowVersion);
    if (t.status !== 'OPEN' && t.status !== 'IN_PROGRESS') throw wrongState('resolved');
    const now = new Date();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.note && me) await this.store.addMessage(user.tenantId, id, 'AGENT', me, input.note);
      await this.store.setStatus(user.tenantId, id, input.rowVersion, {
        status: 'RESOLVED', resolvedAt: now.toISOString(), slaMet: now.getTime() <= Date.parse(t.dueAt),
        ...(!t.firstResponseAt && { firstResponseAt: now.toISOString() }),
      });
    });
    return this.get(user, id);
  }

  async reopen(user: SessionUser, meta: RequestMeta, id: string, input: TicketReopen) {
    const { t, me } = await this.forRequester(user, id, input.rowVersion);
    if (t.status !== 'RESOLVED') throw wrongState('reopened');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.addMessage(user.tenantId, id, 'REQUESTER', me, `Reopened: ${input.reason}`);
      await this.store.setStatus(user.tenantId, id, input.rowVersion, { status: 'OPEN', resolvedAt: null, slaMet: null, reopenedCount: t.reopenedCount + 1 });
    });
    return this.get(user, id);
  }

  async rate(user: SessionUser, meta: RequestMeta, id: string, input: TicketRate) {
    const { t, me } = await this.forRequester(user, id, input.rowVersion);
    if (t.status !== 'RESOLVED') throw wrongState('rated');
    const now = new Date().toISOString();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.comment) await this.store.addMessage(user.tenantId, id, 'REQUESTER', me, input.comment);
      await this.store.setStatus(user.tenantId, id, input.rowVersion, { status: 'CLOSED', csatRating: input.csatRating, csatAt: now, closedAt: now });
    });
    return this.get(user, id);
  }
}
