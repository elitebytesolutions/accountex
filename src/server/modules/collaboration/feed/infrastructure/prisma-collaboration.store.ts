import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { CollabAttachment, CollabComment, Feed, FeedQuery, RecordTags } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { ids, userRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { CollaborationStore } from '../application/collaboration-store.js';

type Reaction = { emoji: string; userId: string; activityEventId: string | null; commentId: string | null };
const summarise = (rs: Reaction[], me: string) => {
  const by = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of rs) {
    const x = by.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    x.count++;
    if (r.userId === me) x.mine = true;
    by.set(r.emoji, x);
  }
  return [...by.values()];
};

@Injectable()
export class PrismaCollaborationStore extends CollaborationStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async people(tenantId: string) {
    const rows = await this.prisma.db().users.findMany({ where: { tenantId, status: 'ACTIVE', deletedAt: null }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } });
    return rows.map((u) => ({ id: u.id, name: u.fullName, email: u.email }));
  }

  async usersExist(tenantId: string, xs: string[]) {
    return !xs.length || (await this.prisma.db().users.count({ where: { tenantId, id: { in: ids(xs) }, deletedAt: null } })) === ids(xs).length;
  }

  async documentTypeExists(code: string) {
    return (await this.prisma.db().documentTypes.count({ where: { code } })) > 0;
  }

  async feed(tenantId: string, userId: string, q: FeedQuery): Promise<Feed> {
    const db = this.prisma.db();
    const myMentions = await db.mentions.findMany({ where: { tenantId, mentionedUserId: userId }, select: { activityEventId: true, commentId: true, readAt: true } });
    const mentionComments = myMentions.filter((m) => m.commentId).length
      ? await db.comments.findMany({ where: { tenantId, id: { in: ids(myMentions.map((m) => m.commentId)) } }, select: { id: true, activityEventId: true } })
      : [];
    const mentionedEvents = ids([...myMentions.map((m) => m.activityEventId), ...mentionComments.map((c) => c.activityEventId)]);
    const base: Prisma.ActivityEventsWhereInput = { tenantId, deletedAt: null };
    const where: Prisma.ActivityEventsWhereInput = {
      ...base, ...(q.module && { module: q.module }), ...(q.person && { actorUserId: q.person }), ...(q.before && { occurredAt: { lt: new Date(q.before) } }),
      ...(q.tab === 'MENTIONS' && { id: { in: mentionedEvents } }), ...(q.tab === 'MINE' && { actorUserId: userId }),
    };
    const [events, byPerson, byModule] = await Promise.all([
      db.activityEvents.findMany({ where, orderBy: { occurredAt: 'desc' }, take: q.limit + 1 }),
      db.activityEvents.groupBy({ by: ['actorUserId'], where: { ...base, actorUserId: { not: null } }, _count: { _all: true } }),
      db.activityEvents.groupBy({ by: ['module'], where: base, _count: { _all: true } }),
    ]);
    const page = events.slice(0, q.limit);
    const eIds = page.map((e) => e.id);
    const comments = eIds.length ? await db.comments.findMany({ where: { tenantId, activityEventId: { in: eIds }, deletedAt: null }, orderBy: { createdAt: 'asc' } }) : [];
    const cIds = comments.map((c) => c.id);
    const [reactions, atts, users] = await Promise.all([
      db.reactions.findMany({ where: { tenantId, OR: [{ activityEventId: { in: eIds } }, { commentId: { in: cIds } }] }, select: { emoji: true, userId: true, activityEventId: true, commentId: true } }),
      db.attachments.findMany({ where: { tenantId, deletedAt: null, OR: [{ activityEventId: { in: eIds } }, { commentId: { in: cIds } }] }, select: { id: true, fileName: true, contentType: true, sizeBytes: true, activityEventId: true, commentId: true } }),
      userRefs(db, tenantId, [...page.map((e) => e.actorUserId), ...comments.map((c) => c.authorUserId), ...byPerson.map((p) => p.actorUserId)]),
    ]);
    const att = (a: (typeof atts)[number]): CollabAttachment => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, sizeBytes: Number(a.sizeBytes) });
    const mentionedComment = new Set(myMentions.map((m) => m.commentId).filter(Boolean));
    const mentionedEvent = new Set(myMentions.map((m) => m.activityEventId).filter(Boolean));
    return {
      posts: page.map((e) => ({
        id: e.id, kind: e.kind, occurredAt: e.occurredAt.toISOString(), actor: users.get(e.actorUserId ?? '') ?? null, module: e.module, verb: e.verb, body: e.body, summary: e.summary,
        entity: e.entityType && e.entityId ? { type: e.entityType, id: e.entityId, label: e.entityLabel, route: e.linkRoute } : null, amount: e.amount === null ? null : Number(e.amount),
        statusLabel: e.statusLabel, statusTone: e.statusTone, mentionsMe: mentionedEvent.has(e.id), mine: e.actorUserId === userId,
        reactions: summarise(reactions.filter((r) => r.activityEventId === e.id), userId),
        attachments: atts.filter((a) => a.activityEventId === e.id).map(att),
        comments: comments.filter((c) => c.activityEventId === e.id).map((c): CollabComment => ({
          id: c.id, author: users.get(c.authorUserId) ?? null, body: c.body, parentCommentId: c.parentCommentId, createdAt: c.createdAt.toISOString(), editedAt: c.editedAt?.toISOString() ?? null,
          mentionsMe: mentionedComment.has(c.id), mine: c.authorUserId === userId, reactions: summarise(reactions.filter((r) => r.commentId === c.id), userId),
          attachments: atts.filter((a) => a.commentId === c.id).map(att),
        })),
      })),
      nextBefore: events.length > q.limit ? page.at(-1)!.occurredAt.toISOString() : null,
      unreadMentions: myMentions.filter((m) => !m.readAt).length,
      people: byPerson.map((p) => ({ id: p.actorUserId!, name: users.get(p.actorUserId!)?.name ?? '?', count: p._count._all })).sort((a, b) => b.count - a.count),
      modules: byModule.map((m) => ({ module: m.module, count: m._count._all })).sort((a, b) => b.count - a.count),
    };
  }

  async markMentionsRead(tenantId: string, userId: string) {
    await this.prisma.db().mentions.updateMany({ where: { tenantId, mentionedUserId: userId, readAt: null }, data: { readAt: new Date() } });
  }

  async createPost(tenantId: string, data: Record<string, unknown>) {
    return (await this.prisma.db().activityEvents.create({ data: { tenantId, ...data } as never, select: { id: true } })).id;
  }

  async createComment(tenantId: string, data: Record<string, unknown>) {
    return (await this.prisma.db().comments.create({ data: { tenantId, ...data } as never, select: { id: true } })).id;
  }

  async addMentions(tenantId: string, by: string, userIds: string[], target: { activityEventId?: string; commentId?: string }) {
    const xs = ids(userIds);
    if (xs.length) await this.prisma.db().mentions.createMany({ data: xs.map((u) => ({ tenantId, mentionedUserId: u, mentionedByUserId: by, activityEventId: target.activityEventId ?? null, commentId: target.commentId ?? null })), skipDuplicates: true });
  }

  post(tenantId: string, id: string) {
    return this.prisma.db().activityEvents.findFirst({ where: { tenantId, id }, select: { id: true, actorUserId: true, deletedAt: true } });
  }

  comment(tenantId: string, id: string) {
    return this.prisma.db().comments.findFirst({ where: { tenantId, id }, select: { id: true, authorUserId: true, activityEventId: true, deletedAt: true } });
  }

  async softDeletePost(tenantId: string, id: string) {
    await this.prisma.db().activityEvents.updateMany({ where: { tenantId, id }, data: { deletedAt: new Date() } });
  }

  async softDeleteComment(tenantId: string, id: string) {
    await this.prisma.db().comments.updateMany({ where: { tenantId, id }, data: { deletedAt: new Date() } });
  }

  async toggleReaction(tenantId: string, userId: string, emoji: string, target: { activityEventId: string | null; commentId: string | null }) {
    const db = this.prisma.db();
    const where = { tenantId, userId, emoji, activityEventId: target.activityEventId, commentId: target.commentId };
    const existing = await db.reactions.findFirst({ where, select: { id: true } });
    if (existing) {
      await db.reactions.deleteMany({ where: { tenantId, id: existing.id } });
      return false;
    }
    await db.reactions.create({ data: where });
    return true;
  }

  async linkAttachment(tenantId: string, attachmentId: string, target: { activityEventId: string | null; commentId: string | null }) {
    await this.prisma.db().attachments.updateMany({ where: { tenantId, id: attachmentId }, data: target });
  }

  async isCollabAttachment(tenantId: string, attachmentId: string) {
    return (await this.prisma.db().attachments.count({ where: { tenantId, id: attachmentId, OR: [{ activityEventId: { not: null } }, { commentId: { not: null } }] } })) > 0;
  }

  async recordTags(tenantId: string, entityType: string, entityId: string): Promise<RecordTags> {
    const db = this.prisma.db();
    const links = await db.taggedRecords.findMany({ where: { tenantId, entityType, entityId }, select: { tagId: true } });
    const tags = links.length ? await db.tags.findMany({ where: { tenantId, id: { in: links.map((l) => l.tagId) } }, orderBy: { name: 'asc' } }) : [];
    return { entityType, entityId, tags: tags.map((t) => ({ id: t.id, name: t.name, tone: t.tone })) };
  }

  async setRecordTags(tenantId: string, entityType: string, entityId: string, names: string[]) {
    const db = this.prisma.db();
    const wanted = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
    const existing = await db.tags.findMany({ where: { tenantId }, select: { id: true, name: true, deletedAt: true } });
    const tagIds: string[] = [];
    for (const n of wanted) {
      const t = existing.find((x) => x.name.toLowerCase() === n.toLowerCase());
      if (t) {
        if (t.deletedAt) await db.tags.updateMany({ where: { tenantId, id: t.id }, data: { deletedAt: null } });
        tagIds.push(t.id);
      } else tagIds.push((await db.tags.create({ data: { tenantId, name: n }, select: { id: true } })).id);
    }
    await db.taggedRecords.deleteMany({ where: { tenantId, entityType, entityId, tagId: { notIn: tagIds } } });
    const have = new Set((await db.taggedRecords.findMany({ where: { tenantId, entityType, entityId }, select: { tagId: true } })).map((x) => x.tagId));
    const add = tagIds.filter((t) => !have.has(t));
    if (add.length) await db.taggedRecords.createMany({ data: add.map((tagId) => ({ tenantId, tagId, entityType, entityId })) });
  }

  async allTags(tenantId: string) {
    const db = this.prisma.db();
    const [tags, counts] = await Promise.all([
      db.tags.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: 'asc' } }),
      db.taggedRecords.groupBy({ by: ['tagId'], where: { tenantId }, _count: { _all: true } }),
    ]);
    return tags.map((t) => ({ id: t.id, name: t.name, tone: t.tone, count: counts.find((c) => c.tagId === t.id)?._count._all ?? 0 }));
  }
}
