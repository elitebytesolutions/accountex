import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { CommentInput, FeedQuery, PostInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { AttachmentsService, type UploadedFileData } from '../../../attachments/application/attachments.service.js';
import { CollaborationStore } from './collaboration-store.js';

/**
 * The workspace activity feed: posts (with @mentions, a linked document, attachments), threaded comments, reactions
 * and record tags. Everyone in the company sees the feed; only the author removes their post or comment; files on
 * posts and comments download for any company user. Mentions show on the Mentions tab (notifications are Phase 29).
 */
@Injectable()
export class CollaborationService implements OnModuleInit {
  constructor(private readonly store: CollaborationStore, private readonly attachments: AttachmentsService, private readonly unitOfWork: UnitOfWork) {}

  onModuleInit() {
    this.attachments.registerAccess('collaboration', (user, att) => this.store.isCollabAttachment(user.tenantId, att.id));
  }

  people(user: SessionUser) {
    return this.store.people(user.tenantId);
  }

  async feed(user: SessionUser, meta: RequestMeta, q: FeedQuery) {
    const f = await this.store.feed(user.tenantId, user.id, q);
    if (q.tab === 'MENTIONS' && f.unreadMentions) {
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.markMentionsRead(user.tenantId, user.id));
      return { ...f, unreadMentions: 0 };
    }
    return f;
  }

  async post(user: SessionUser, meta: RequestMeta, input: PostInput) {
    const mentions = (input.mentionUserIds ?? []).filter((u) => u !== user.id);
    await this.check(user, mentions, input.entityType ?? null);
    return this.unitOfWork.run(actorContext(user, meta), async () => {
      const id = await this.store.createPost(user.tenantId, {
        kind: 'POST', actorUserId: user.id, module: input.module ?? 'SYSTEM', eventCode: 'USER_POST', verb: input.entityType ? 'posted about' : 'posted', body: input.body,
        entityType: input.entityType ?? null, entityId: input.entityId ?? null, entityLabel: input.entityLabel ?? null, linkRoute: input.linkRoute ?? null,
      });
      await this.store.addMentions(user.tenantId, user.id, mentions, { activityEventId: id });
      return { id };
    });
  }

  async comment(user: SessionUser, meta: RequestMeta, input: CommentInput) {
    const mentions = (input.mentionUserIds ?? []).filter((u) => u !== user.id);
    if (input.activityEventId) {
      const p = await this.store.post(user.tenantId, input.activityEventId);
      if (!p || p.deletedAt) throw new NotFoundError('Post not found');
    }
    if (input.parentCommentId) {
      const c = await this.store.comment(user.tenantId, input.parentCommentId);
      if (!c || c.deletedAt) throw new NotFoundError('Comment not found');
    }
    await this.check(user, mentions, input.entityType ?? null);
    return this.unitOfWork.run(actorContext(user, meta), async () => {
      const id = await this.store.createComment(user.tenantId, {
        authorUserId: user.id, body: input.body, activityEventId: input.activityEventId ?? null, parentCommentId: input.parentCommentId ?? null,
        entityType: input.entityType ?? null, entityId: input.entityId ?? null,
      });
      await this.store.addMentions(user.tenantId, user.id, mentions, { commentId: id });
      return { id };
    });
  }

  async deletePost(user: SessionUser, meta: RequestMeta, id: string) {
    const p = await this.store.post(user.tenantId, id);
    if (!p || p.deletedAt) throw new NotFoundError('Post not found');
    if (p.actorUserId !== user.id) throw new ForbiddenError('Only the author can remove this post.', undefined, { code: 'COLLAB_NOT_YOURS' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeletePost(user.tenantId, id));
  }

  async deleteComment(user: SessionUser, meta: RequestMeta, id: string) {
    const c = await this.store.comment(user.tenantId, id);
    if (!c || c.deletedAt) throw new NotFoundError('Comment not found');
    if (c.authorUserId !== user.id) throw new ForbiddenError('Only the author can remove this comment.', undefined, { code: 'COLLAB_NOT_YOURS' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteComment(user.tenantId, id));
  }

  async react(user: SessionUser, meta: RequestMeta, input: { emoji: string; activityEventId: string | null; commentId: string | null }) {
    if (input.activityEventId && !(await this.store.post(user.tenantId, input.activityEventId))) throw new NotFoundError('Post not found');
    if (input.commentId && !(await this.store.comment(user.tenantId, input.commentId))) throw new NotFoundError('Comment not found');
    const added = await this.unitOfWork.run(actorContext(user, meta), () => this.store.toggleReaction(user.tenantId, user.id, input.emoji, { activityEventId: input.activityEventId, commentId: input.commentId }));
    return { added };
  }

  /** A file (PDF, JPG, PNG, up to 10 MB) on a post or comment. */
  async attach(user: SessionUser, meta: RequestMeta, file: UploadedFileData, target: { activityEventId: string | null; commentId: string | null }) {
    if (!!target.activityEventId === !!target.commentId) throw new ValidationError('Attach to a post or a comment', { activityEventId: ['Choose one'] });
    if (target.activityEventId && !(await this.store.post(user.tenantId, target.activityEventId))) throw new NotFoundError('Post not found');
    if (target.commentId && !(await this.store.comment(user.tenantId, target.commentId))) throw new NotFoundError('Comment not found');
    return this.unitOfWork.run(actorContext(user, meta), async () => {
      const a = await this.attachments.save(user, file, { purpose: 'DOCUMENT' }, { maxBytes: 10 * 1024 * 1024 });
      await this.store.linkAttachment(user.tenantId, a.id, target);
      return a;
    });
  }

  async tags(user: SessionUser, entityType: string, entityId: string) {
    return this.store.recordTags(user.tenantId, entityType, entityId);
  }

  async setTags(user: SessionUser, meta: RequestMeta, entityType: string, entityId: string, names: string[]) {
    if (!(await this.store.documentTypeExists(entityType))) throw new ValidationError('Unknown record type', { recordType: ['Not a document type'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setRecordTags(user.tenantId, entityType, entityId, names));
    return this.store.recordTags(user.tenantId, entityType, entityId);
  }

  allTags(user: SessionUser) {
    return this.store.allTags(user.tenantId);
  }

  private async check(user: SessionUser, mentions: string[], entityType: string | null) {
    if (!(await this.store.usersExist(user.tenantId, mentions))) throw new ValidationError('Mention people in your company', { mentionUserIds: ['Unknown user'] });
    if (entityType && !(await this.store.documentTypeExists(entityType))) throw new ValidationError('Unknown document type', { entityType: ['Not a document type'] });
  }
}
