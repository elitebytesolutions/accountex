import { Injectable } from '@nestjs/common';
import type { NotificationList, NotificationPreferences, NotificationQuery, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { NotFoundError } from '../../../../core/domain/errors.js';
import { WorkStore } from '../../common/application/work-store.js';

/**
 * Notification Centre: the signed-in user's own notifications (raised by approvals, tasks, due items and sign-in
 * events through Company.notify), read / read-all / archive, and their preferences. In-app preferences take effect;
 * email / SMS / WhatsApp choices are kept for when a provider is connected.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly store: WorkStore, private readonly unitOfWork: UnitOfWork) {}

  async list(user: SessionUser, meta: RequestMeta, q: NotificationQuery): Promise<NotificationList> {
    const [page, summary] = await Promise.all([
      this.store.listNotifications(user.tenantId, user.id, q),
      this.unitOfWork.run(actorContext(user, meta), () => this.store.notificationSummary()),
    ]);
    return { ...page, summary };
  }

  /** The header bell: unread count and the latest few. */
  async bell(user: SessionUser, meta: RequestMeta) {
    const [items, summary] = await Promise.all([
      this.store.latestUnread(user.tenantId, user.id, 8),
      this.unitOfWork.run(actorContext(user, meta), () => this.store.notificationSummary()),
    ]);
    return { unread: summary.unread, items };
  }

  async read(user: SessionUser, meta: RequestMeta, ids: string[]) {
    const n = await this.unitOfWork.run(actorContext(user, meta), () => this.store.markRead(user.tenantId, user.id, ids, null));
    return { read: n };
  }

  async readAll(user: SessionUser, meta: RequestMeta, category: string | null) {
    const n = await this.unitOfWork.run(actorContext(user, meta), () => this.store.markRead(user.tenantId, user.id, null, category));
    return { read: n };
  }

  async archive(user: SessionUser, meta: RequestMeta, id: string) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.archive(user.tenantId, user.id, id)))) throw new NotFoundError('Notification not found');
  }

  preferences(user: SessionUser) {
    return this.store.preferences(user.tenantId, user.id);
  }

  async savePreferences(user: SessionUser, meta: RequestMeta, p: NotificationPreferences) {
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.savePreferences(user.tenantId, user.id, p));
    return this.preferences(user);
  }
}
