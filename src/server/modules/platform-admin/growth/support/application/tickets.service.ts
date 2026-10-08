import { Injectable } from '@nestjs/common';
import {
  TICKET_OPEN_STATUSES,
  type AdminSession, type ImpersonationSession, type TicketAction, type TicketActionInput, type TicketAssign, type TicketBoard, type TicketCreate,
  type TicketDetail, type TicketImpersonate, type TicketListQuery, type TicketReply, type TicketUpdate,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { ImpersonationService } from '../../../tenants/impersonation/application/impersonation.service.js';
import { TicketStore } from './ticket-store.js';

const stale = () => new ConcurrencyError('Someone else changed this ticket. Reload and try again.');
export const ticketClosed = () => new ConflictError('This ticket is closed.', undefined, { code: 'TICKET_CLOSED' });

/**
 * Support tickets (Super Admin › Operations › Support Tickets): board and KPIs, tickets logged for a company, replies
 * and internal notes, assignment, resolve / reopen / close, and support access started from a ticket (the Phase 40
 * impersonation session, linked through supportTicketId). Every write runs as the Super Admin.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly store: TicketStore,
    private readonly impersonation: ImpersonationService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async board(q: TicketListQuery): Promise<TicketBoard> {
    const [items, kpis, staff] = await Promise.all([this.store.list(q), this.store.kpis(), this.store.staff()]);
    return { items, kpis, staff };
  }

  async get(id: string): Promise<TicketDetail> {
    const t = await this.store.get(id);
    if (!t) throw new NotFoundError('Ticket not found');
    const [messages, supportSessions] = await Promise.all([this.store.messages(id, true), this.store.supportSessions(id)]);
    return { ...t, messages, supportSessions };
  }

  async create(admin: AdminSession, meta: RequestMeta, input: TicketCreate): Promise<TicketDetail> {
    if (!(await this.store.tenantExists(input.tenantId))) throw new ValidationError('Choose the company', { tenantId: ['Unknown company'] });
    if (input.assigneeStaffId && !(await this.store.staffExists(input.assigneeStaffId))) throw new ValidationError('Choose an agent', { assigneeStaffId: ['Unknown staff member'] });
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({
      tenantId: input.tenantId, subject: input.subject, category: input.category, priority: input.priority, channel: input.channel,
      status: input.assigneeStaffId ? 'IN_PROGRESS' : 'NEW', requesterName: input.requesterName, requesterEmail: input.requesterEmail,
      requesterRole: input.requesterRole, assigneeStaffId: input.assigneeStaffId,
      // the issue as the customer reported it (by phone, email…), logged by the Super Admin
      messages: [{ authorKind: 'CUSTOMER', authorName: input.requesterName, body: input.body }],
    }));
    return this.get(id);
  }

  private async open(id: string, rowVersion?: number) {
    const t = await this.get(id);
    if (t.status === 'CLOSED') throw ticketClosed();
    if (rowVersion !== undefined && t.rowVersion !== rowVersion) throw stale();
    return t;
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: TicketUpdate): Promise<TicketDetail> {
    await this.open(id, input.rowVersion);
    const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...data, id }));
    return this.get(id);
  }

  /** A reply (first response, waits on the customer), an internal note (never shown to the company), or reply + resolve. */
  async reply(admin: AdminSession, meta: RequestMeta, id: string, input: TicketReply): Promise<TicketDetail> {
    await this.open(id);
    if (input.resolve && input.isInternalNote) throw new ValidationError('Resolve with a reply, not an internal note', { resolve: ['Untick "Internal note" to resolve'] });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.reply({
      ticketId: id, authorKind: 'STAFF', authorStaffId: admin.staffId, authorName: admin.name, body: input.body, isInternalNote: input.isInternalNote,
      ...(input.resolve ? { status: 'RESOLVED' } : {}),
    }));
    return this.get(id);
  }

  async assign(admin: AdminSession, meta: RequestMeta, id: string, input: TicketAssign): Promise<TicketDetail> {
    const t = await this.open(id, input.rowVersion);
    if (input.assigneeStaffId && !(await this.store.staffExists(input.assigneeStaffId))) throw new ValidationError('Choose an agent', { assigneeStaffId: ['Unknown staff member'] });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({
      id, rowVersion: input.rowVersion, assigneeStaffId: input.assigneeStaffId, ...(t.status === 'NEW' && input.assigneeStaffId ? { status: 'IN_PROGRESS' } : {}),
    }));
    return this.get(id);
  }

  /** resolve (open → RESOLVED, optional closing reply) · reopen (RESOLVED → IN_PROGRESS) · close (→ CLOSED, final). */
  async act(admin: AdminSession, meta: RequestMeta, id: string, action: TicketAction, input: TicketActionInput): Promise<TicketDetail> {
    const t = await this.open(id, input.rowVersion);
    const ctx = adminActorContext(admin, meta);
    if (action === 'resolve') {
      if (!TICKET_OPEN_STATUSES.includes(t.status)) throw new ConflictError('Only open tickets can be resolved.', undefined, { code: 'TICKET_CLOSED' });
      await this.unitOfWork.run(ctx, () => input.note
        ? this.store.reply({ ticketId: id, authorKind: 'STAFF', authorStaffId: admin.staffId, authorName: admin.name, body: input.note, status: 'RESOLVED' })
        : this.store.save({ id, rowVersion: input.rowVersion, status: 'RESOLVED', resolvedAt: new Date().toISOString() }));
    } else if (action === 'reopen') {
      if (t.status !== 'RESOLVED') throw new ConflictError('Only resolved tickets can be reopened.');
      await this.unitOfWork.run(ctx, () => this.store.save({ id, rowVersion: input.rowVersion, status: 'IN_PROGRESS', resolvedAt: null }));
    } else {
      const now = new Date().toISOString();
      await this.unitOfWork.run(ctx, () => this.store.save({ id, rowVersion: input.rowVersion, status: 'CLOSED', closedAt: now, resolvedAt: t.resolvedAt ?? now }));
    }
    return this.get(id);
  }

  /**
   * "Impersonate from ticket": a Phase 40 support session in the ticket's company (as the requester unless another
   * user is chosen), linked to the ticket. Returns what the controller needs to set the workspace cookie.
   */
  async impersonate(admin: AdminSession, meta: RequestMeta, id: string, input: TicketImpersonate): Promise<{ session: ImpersonationSession; token: string; expiresAt: Date }> {
    const t = await this.get(id);
    const started = await this.impersonation.start(admin, meta, t.tenantId, {
      targetUserId: input.targetUserId ?? t.requesterUserId ?? undefined,
      reason: `${t.docNo} · ${input.reason}`.slice(0, 500), timeLimitMinutes: input.timeLimitMinutes, isReadOnly: input.isReadOnly,
    });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.linkSupportSession(started.session.id, id));
    return started;
  }
}
