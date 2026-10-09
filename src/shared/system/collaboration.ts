import { z } from 'zod';

type Who = { id: string; name: string } | null;

export const ACTIVITY_MODULES = ['SALES', 'PURCHASES', 'ACCOUNTING', 'BANK', 'HR', 'INVENTORY', 'PAYROLL', 'TAX', 'DISTRIBUTION', 'SYSTEM'] as const;
export const REACTION_EMOJIS = ['👍', '🎉', '❤️', '👀', '✅'] as const;

/** A document a post / comment can point at: Company.DocumentTypes code + id (+ label and route for the card). */
const EntityRef = {
  entityType: z.string().trim().regex(/^[A-Z]{2,6}$/).optional().nullable().transform((v) => v ?? null),
  entityId: z.uuid().optional().nullable().transform((v) => v ?? null),
  entityLabel: z.string().trim().max(120).optional().nullable().transform((v) => v ?? null),
  linkRoute: z.string().trim().max(200).regex(/^\/[A-Za-z0-9/_?=&.-]*$/, 'An app route').optional().nullable().transform((v) => v ?? null),
};

export const PostInputSchema = z.object({
  body: z.string().trim().min(1, 'Write something').max(5000),
  module: z.enum(ACTIVITY_MODULES).default('SYSTEM'),
  mentionUserIds: z.array(z.uuid()).max(20).default([]),
  ...EntityRef,
}).refine((p) => !!p.entityType === !!p.entityId, { message: 'Document type and id go together', path: ['entityId'] });
export type PostInput = z.input<typeof PostInputSchema>;

export const CommentInputSchema = z.object({
  body: z.string().trim().min(1, 'Write something').max(5000),
  activityEventId: z.uuid().optional().nullable().transform((v) => v ?? null),
  parentCommentId: z.uuid().optional().nullable().transform((v) => v ?? null),
  mentionUserIds: z.array(z.uuid()).max(20).default([]),
  entityType: EntityRef.entityType,
  entityId: EntityRef.entityId,
}).refine((c) => !!c.activityEventId || (!!c.entityType && !!c.entityId), { message: 'Comment on a post or a document', path: ['activityEventId'] });
export type CommentInput = z.input<typeof CommentInputSchema>;

export const ReactionInputSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
  activityEventId: z.uuid().optional().nullable().transform((v) => v ?? null),
  commentId: z.uuid().optional().nullable().transform((v) => v ?? null),
}).refine((r) => !!r.activityEventId !== !!r.commentId, { message: 'React to a post or a comment', path: ['activityEventId'] });

export const TagsInputSchema = z.object({ tags: z.array(z.string().trim().min(1).max(40)).max(20) });
export const FeedQuerySchema = z.object({
  tab: z.enum(['ALL', 'MENTIONS', 'MINE']).default('ALL'),
  module: z.enum(ACTIVITY_MODULES).optional(),
  person: z.uuid().optional(),
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export type CollabAttachment = { id: string; fileName: string; contentType: string; sizeBytes: number };
export type CollabComment = {
  id: string; author: Who; body: string; parentCommentId: string | null; createdAt: string; editedAt: string | null; mentionsMe: boolean; mine: boolean;
  reactions: { emoji: string; count: number; mine: boolean }[]; attachments: CollabAttachment[];
};
export type FeedPost = {
  id: string; kind: string; occurredAt: string; actor: Who; module: string; verb: string | null; body: string | null; summary: string | null;
  entity: { type: string; id: string; label: string | null; route: string | null } | null; amount: number | null; statusLabel: string | null; statusTone: string | null;
  mentionsMe: boolean; mine: boolean; reactions: { emoji: string; count: number; mine: boolean }[]; comments: CollabComment[]; attachments: CollabAttachment[];
};
export type Feed = {
  posts: FeedPost[]; nextBefore: string | null; unreadMentions: number;
  people: { id: string; name: string; count: number }[]; modules: { module: string; count: number }[];
};
export type RecordTags = { entityType: string; entityId: string; tags: { id: string; name: string; tone: string }[] };
export type CollabPerson = { id: string; name: string; email: string | null };
