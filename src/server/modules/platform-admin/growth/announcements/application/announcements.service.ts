import { Injectable } from '@nestjs/common';
import {
  ANNOUNCEMENT_EDITABLE,
  type AdminSession, type PlatformAnnouncement, type PlatformAnnouncementAction, type PlatformAnnouncementCreate, type PlatformAnnouncementList,
  type PlatformAnnouncementSchedule, type PlatformAnnouncementTargetsInput, type PlatformAnnouncementUpdate,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { CommsService } from '../../comms/application/comms.service.js';
import { AnnouncementStore } from './announcement-store.js';

const stale = () => new ConcurrencyError('Someone else changed this announcement. Reload and try again.');
const notDraft = (message = 'Only draft or scheduled announcements can be changed; published ones are archived.') =>
  new ConflictError(message, undefined, { code: 'ANNOUNCEMENT_NOT_DRAFT' });

/** The context of the lazy "publish what is due" step when no admin is acting (a workspace request). */
export const schedulerContext = (meta: Pick<RequestMeta, 'correlationId'>): AuditContext => ({
  correlationId: meta.correlationId, userId: null, tenantId: null, actorLabel: 'announcement scheduler',
});

/**
 * Announcements & release notes (Super Admin › Operations › Announcements). Drafts and scheduled ones are edited and
 * targeted; publishing (now or at publishAt) shows them in matching workspaces and, with "Email tenant admins",
 * queues one email per company. Due scheduled announcements are published when the list or a workspace feed is read.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly store: AnnouncementStore,
    private readonly comms: CommsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** Publishes due scheduled announcements (and queues their emails) in `ctx`. */
  async publishDue(ctx: AuditContext): Promise<void> {
    await this.unitOfWork.run(ctx, async () => {
      for (const id of await this.store.promoteDue()) await this.queueEmails(id);
    });
  }

  async list(admin: AdminSession, meta: RequestMeta, q: { status?: string; type?: string }): Promise<PlatformAnnouncementList> {
    await this.publishDue(adminActorContext(admin, meta));
    return this.store.list(q);
  }

  async get(id: string): Promise<PlatformAnnouncement> {
    const a = await this.store.get(id);
    if (!a) throw new NotFoundError('Announcement not found');
    return a;
  }

  private async checkWindow(id: string | null | undefined) {
    if (id && !(await this.store.maintenanceWindowExists(id))) throw new ValidationError('Choose a maintenance window', { maintenanceWindowId: ['Unknown window'] });
  }

  async create(admin: AdminSession, meta: RequestMeta, input: PlatformAnnouncementCreate): Promise<PlatformAnnouncement> {
    await this.checkWindow(input.maintenanceWindowId);
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...input, status: 'DRAFT' }));
    return this.get(id);
  }

  private async editable(id: string, rowVersion: number) {
    const a = await this.get(id);
    if (!ANNOUNCEMENT_EDITABLE.includes(a.status)) throw notDraft();
    if (a.rowVersion !== rowVersion) throw stale();
    return a;
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: PlatformAnnouncementUpdate): Promise<PlatformAnnouncement> {
    const a = await this.editable(id, input.rowVersion);
    const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    if (data.audience && data.targets === undefined && data.audience !== a.audience) {
      throw new ValidationError('Pick the new audience’s targets', { targets: ['Required when the audience changes'] });
    }
    if (data.showBanner === false && (data.emailAdmins ?? a.emailAdmins) === false) throw new ValidationError('Show a banner, email the admins, or both', { showBanner: ['Pick one'] });
    await this.checkWindow(data.maintenanceWindowId as string | null | undefined);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...data, id }));
    return this.get(id);
  }

  async setTargets(admin: AdminSession, meta: RequestMeta, id: string, input: PlatformAnnouncementTargetsInput): Promise<PlatformAnnouncement> {
    await this.editable(id, input.rowVersion);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, audience: input.audience, targets: input.targets }));
    return this.get(id);
  }

  /** Drafts only; published content is archived instead. */
  async remove(admin: AdminSession, meta: RequestMeta, id: string): Promise<void> {
    const a = await this.get(id);
    if (a.status !== 'DRAFT') throw notDraft('Only drafts can be deleted; archive a published announcement.');
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.remove(id));
  }

  async schedule(admin: AdminSession, meta: RequestMeta, id: string, input: PlatformAnnouncementSchedule): Promise<PlatformAnnouncement> {
    await this.editable(id, input.rowVersion);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, status: 'SCHEDULED', publishAt: input.publishAt }));
    return this.get(id);
  }

  /** publish (draft / scheduled → PUBLISHED now, emails queued) · archive (published / scheduled → ARCHIVED, leaves the workspaces). */
  async act(admin: AdminSession, meta: RequestMeta, id: string, action: PlatformAnnouncementAction, rowVersion: number): Promise<PlatformAnnouncement> {
    const a = await this.get(id);
    if (a.rowVersion !== rowVersion) throw stale();
    if (action === 'publish') {
      if (!ANNOUNCEMENT_EDITABLE.includes(a.status)) throw notDraft('This announcement is already published or archived.');
      await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
        await this.store.save({ id, rowVersion, status: 'PUBLISHED', publishAt: new Date().toISOString() });
        await this.queueEmails(id);
      });
    } else {
      if (a.status === 'ARCHIVED' || a.status === 'DRAFT') throw new ConflictError(a.status === 'DRAFT' ? 'Delete a draft instead of archiving it.' : 'This announcement is already archived.');
      await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, status: 'ARCHIVED' }));
    }
    return this.get(id);
  }

  private async queueEmails(id: string) {
    const a = (await this.store.get(id))!;
    if (!a.emailAdmins) return;
    const subject = a.releaseLabel ? `${a.releaseLabel} · ${a.title}` : a.title;
    const recipients = await this.store.recipients(id);
    await this.comms.queueEmails(recipients.map((r) => ({ tenantId: r.tenantId, email: r.email, language: r.language, subject, body: a.message })));
  }
}
