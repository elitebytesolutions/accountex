import { Injectable } from '@nestjs/common';
import type { PlatformNoticeFeed, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { NotFoundError } from '../../../../core/domain/errors.js';
import { AnnouncementStore } from '../../../platform-admin/growth/announcements/application/announcement-store.js';
import { AnnouncementsService, schedulerContext } from '../../../platform-admin/growth/announcements/application/announcements.service.js';

/**
 * The workspace's platform notices (Phase 42): published Accountex announcements that reach this company (banner +
 * notifications popover), the user's dismissals, views and clicks (once per user), and in-app broadcast messages.
 */
@Injectable()
export class PlatformNoticesService {
  constructor(
    private readonly store: AnnouncementStore,
    private readonly announcements: AnnouncementsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async feed(user: SessionUser, meta: RequestMeta): Promise<PlatformNoticeFeed> {
    await this.announcements.publishDue(schedulerContext(meta));
    const [notices, messages] = await Promise.all([this.store.feed(user.tenantId, user.id), this.store.messages(user.tenantId, user.id)]);
    return {
      banners: notices.filter((n) => n.showBanner && !n.dismissed),
      recent: notices.slice(0, 10),
      messages,
      unread: messages.filter((m) => !m.readAt).length,
    };
  }

  /** view · click · dismiss, only for an announcement this company can see. */
  async mark(user: SessionUser, meta: RequestMeta, id: string, what: 'view' | 'click' | 'dismiss'): Promise<void> {
    const visible = await this.store.feed(user.tenantId, user.id);
    if (!visible.some((n) => n.id === id)) throw new NotFoundError('Announcement not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.mark(id, user.tenantId, user.id, what));
  }

  async readMessages(user: SessionUser, meta: RequestMeta): Promise<{ read: number }> {
    const read = await this.unitOfWork.run(actorContext(user, meta), () => this.store.readMessages(user.tenantId, user.id));
    return { read };
  }
}
