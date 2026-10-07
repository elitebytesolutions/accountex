import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type { Announcement, AnnouncementCreate, AnnouncementPublish, AnnouncementUpdate } from '../../../../../shared/self-service/announcement.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertAnnouncementDraft, assertPublishable } from '../../domain/rules.js';
import { AnnouncementStore } from './announcement-store.js';

/** Company announcements: drafted, published (optionally until an expiry), pinned and archived. No read receipts (Phase 34). */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly store: AnnouncementStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, status?: string) {
    return this.store.list(user.tenantId, status);
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<Announcement> {
    const a = await this.store.get(user.tenantId, id);
    if (!a) throw new NotFoundError('Announcement not found');
    return a;
  }

  async feed(user: SessionUser) {
    return this.store.feed(user.tenantId, await this.store.placement(user.tenantId, user.id), new Date());
  }

  async create(user: SessionUser, meta: RequestMeta, input: AnnouncementCreate): Promise<Announcement> {
    await this.checkLinks(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, authorLabel: input.authorLabel ?? user.name }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: AnnouncementUpdate): Promise<Announcement> {
    const a = await this.current(user, id, input.rowVersion);
    assertAnnouncementDraft(a.status);
    await this.checkLinks(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async publish(user: SessionUser, meta: RequestMeta, id: string, input: AnnouncementPublish): Promise<Announcement> {
    const a = await this.current(user, id, input.rowVersion);
    const now = new Date();
    const expiresAt = input.expiresAt !== undefined && input.expiresAt !== null ? new Date(input.expiresAt) : a.expiresAt ? new Date(a.expiresAt) : null;
    assertPublishable(a.status, now, expiresAt);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setState(user.tenantId, id, input.rowVersion, { status: 'PUBLISHED', publishedAt: now, expiresAt }));
    return this.get(user, id);
  }

  /** Takes it out of the feed for good (drafts too); archived announcements are unpinned. */
  async archive(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<Announcement> {
    const a = await this.current(user, id, rowVersion);
    if (a.status === 'ARCHIVED') throw new ValidationError('Already archived', { status: ['Archived'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setState(user.tenantId, id, rowVersion, { status: 'ARCHIVED', isPinned: false }));
    return this.get(user, id);
  }

  async pin(user: SessionUser, meta: RequestMeta, id: string, isPinned: boolean, rowVersion: number): Promise<Announcement> {
    const a = await this.current(user, id, rowVersion);
    if (a.status === 'ARCHIVED') throw new ValidationError('Archived announcements cannot be pinned', { isPinned: ['Archived'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setState(user.tenantId, id, rowVersion, { isPinned }));
    return this.get(user, id);
  }

  private async checkLinks(user: SessionUser, l: { branchId?: string | null; departmentId?: string | null; policyDocumentId?: string | null; authorEmployeeId?: string | null }) {
    if (l.authorEmployeeId && !(await this.store.activeEmployee(user.tenantId, l.authorEmployeeId))) throw new ValidationError('Choose an active employee', { authorEmployeeId: ['Unknown or exited employee'] });
    if (l.branchId && !(await this.store.activeBranch(user.tenantId, l.branchId))) throw new ValidationError('Choose an active branch', { branchId: ['Unknown or inactive branch'] });
    if (l.departmentId && !(await this.store.activeDepartment(user.tenantId, l.departmentId))) throw new ValidationError('Choose an active department', { departmentId: ['Unknown or inactive department'] });
    if (l.policyDocumentId && !(await this.store.policyExists(user.tenantId, l.policyDocumentId))) throw new ValidationError('Choose a policy', { policyDocumentId: ['Unknown policy'] });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const a = await this.get(user, id);
    if (a.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this announcement. Reload and try again.');
    return a;
  }
}
