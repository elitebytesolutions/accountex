import type { CollabPerson, Feed, FeedQuery, RecordTags } from '../../../../../shared/index.js';

/** Persistence for the activity feed: posts (ActivityEvents), comments, mentions, reactions, attachment links and tags. */
export abstract class CollaborationStore {
  abstract people(tenantId: string): Promise<CollabPerson[]>;
  abstract usersExist(tenantId: string, ids: string[]): Promise<boolean>;
  abstract documentTypeExists(code: string): Promise<boolean>;
  abstract feed(tenantId: string, userId: string, q: FeedQuery): Promise<Feed>;
  abstract markMentionsRead(tenantId: string, userId: string): Promise<void>;

  abstract createPost(tenantId: string, data: Record<string, unknown>): Promise<string>;
  abstract createComment(tenantId: string, data: Record<string, unknown>): Promise<string>;
  abstract addMentions(tenantId: string, by: string, userIds: string[], target: { activityEventId?: string; commentId?: string }): Promise<void>;
  abstract post(tenantId: string, id: string): Promise<{ id: string; actorUserId: string | null; deletedAt: Date | null } | null>;
  abstract comment(tenantId: string, id: string): Promise<{ id: string; authorUserId: string; activityEventId: string | null; deletedAt: Date | null } | null>;
  abstract softDeletePost(tenantId: string, id: string): Promise<void>;
  abstract softDeleteComment(tenantId: string, id: string): Promise<void>;
  /** Adds the reaction, or removes it when the user already reacted with that emoji; true when added. */
  abstract toggleReaction(tenantId: string, userId: string, emoji: string, target: { activityEventId: string | null; commentId: string | null }): Promise<boolean>;
  abstract linkAttachment(tenantId: string, attachmentId: string, target: { activityEventId: string | null; commentId: string | null }): Promise<void>;
  abstract isCollabAttachment(tenantId: string, attachmentId: string): Promise<boolean>;

  abstract recordTags(tenantId: string, entityType: string, entityId: string): Promise<RecordTags>;
  abstract setRecordTags(tenantId: string, entityType: string, entityId: string, names: string[]): Promise<void>;
  abstract allTags(tenantId: string): Promise<{ id: string; name: string; tone: string; count: number }[]>;
}
