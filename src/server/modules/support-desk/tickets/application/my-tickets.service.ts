import { Injectable } from '@nestjs/common';
import type { MyTicketList, MyTicketReply, SessionUser, TicketCsat, TicketDetail, TicketRaise } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { TicketStore } from '../../../platform-admin/growth/support/application/ticket-store.js';

/** Company admins (ADMIN system role) see every ticket of their company; everyone else sees their own. */
const seesAll = (user: SessionUser) => user.roles.includes('ADMIN');
const roleLabel = (user: SessionUser) => {
  const key = user.roles.find((r) => r !== 'EMPLOYEE') ?? user.roles[0];
  return key ? key.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : null;
};

/**
 * "Help & support" in the workspace (Phase 42): any signed-in user raises a platform support ticket, follows the
 * replies (internal notes are never returned), answers, and rates the help once it is resolved. Writes run in the
 * user's own actor context, so the row history names them.
 */
@Injectable()
export class MyTicketsService {
  constructor(
    private readonly store: TicketStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(user: SessionUser): Promise<MyTicketList> {
    const all = seesAll(user);
    return { items: await this.store.listForTenant(user.tenantId, all ? null : user.id), seesAll: all };
  }

  /** 403 for another company's ticket (or another user's, for non-admins). */
  async get(user: SessionUser, id: string): Promise<TicketDetail> {
    const t = await this.store.get(id);
    if (!t) throw new NotFoundError('Ticket not found');
    if (t.tenantId !== user.tenantId || (!seesAll(user) && t.requesterUserId !== user.id)) throw new ForbiddenError('This ticket belongs to someone else.');
    const messages = await this.store.messages(id, false);
    // the company sees the support agent as "Accountex support", and its own count of messages
    return {
      ...t, assigneeName: t.assigneeName ? 'Accountex support' : null, messageCount: messages.length,
      messages: messages.map((m) => ({ ...m, mine: m.authorKind === 'CUSTOMER' && m.authorName === user.name })), supportSessions: [],
    };
  }

  async raise(user: SessionUser, meta: RequestMeta, input: TicketRaise): Promise<TicketDetail> {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      subject: input.subject, category: input.category, priority: input.priority, status: 'NEW', channel: 'PORTAL',
      requesterUserId: user.id, requesterName: user.name, requesterEmail: user.email, requesterRole: roleLabel(user),
      messages: [{ authorKind: 'CUSTOMER', authorUserId: user.id, authorName: user.name, body: input.body }],
    }));
    return this.get(user, id);
  }

  async reply(user: SessionUser, meta: RequestMeta, id: string, input: MyTicketReply): Promise<TicketDetail> {
    const t = await this.get(user, id);
    if (t.status === 'CLOSED') throw new ConflictError('This ticket is closed.', undefined, { code: 'TICKET_CLOSED' });
    await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.reply({ ticketId: id, authorKind: 'CUSTOMER', authorUserId: user.id, authorName: user.name, body: input.body }));
    return this.get(user, id);
  }

  /** CSAT on a resolved ticket closes it. */
  async rate(user: SessionUser, meta: RequestMeta, id: string, input: TicketCsat): Promise<TicketDetail> {
    const t = await this.get(user, id);
    if (t.status === 'CLOSED') throw new ConflictError('This ticket is closed.', undefined, { code: 'TICKET_CLOSED' });
    if (t.status !== 'RESOLVED') throw new ConflictError('You can rate a ticket once it is resolved.', undefined, { code: 'TICKET_CSAT_NOT_ALLOWED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      id, rowVersion: t.rowVersion, csatRating: input.rating, csatComment: input.comment, status: 'CLOSED', closedAt: new Date().toISOString(),
    }));
    return this.get(user, id);
  }
}
