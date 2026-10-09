import type { CollabAttachment, CollabPerson, Feed, RecordTags } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Q = Record<string, string | number | boolean | null | undefined>;
const qs = (q: Q) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const post = <T,>(path: string, body?: Record<string, unknown>) => apiRequest<T>(path, { method: "POST", body });

/** Browser clients for Phase 35 collaboration (activity feed, comments, mentions, reactions, attachments, tags). */
export const feed = (q: { tab?: "ALL" | "MENTIONS" | "MINE"; module?: string; person?: string; before?: string; limit?: number }) => apiRequest<Feed>(`/collaboration/feed${qs(q)}`);
export const people = () => apiRequest<CollabPerson[]>("/collaboration/people");
export const createPost = (body: { body: string; module?: string; mentionUserIds?: string[]; entityType?: string | null; entityId?: string | null; entityLabel?: string | null; linkRoute?: string | null }) => post<{ id: string }>("/collaboration/posts", body);
export const deletePost = (id: string) => apiRequest<void>(`/collaboration/posts/${id}`, { method: "DELETE" });
export const createComment = (body: { body: string; activityEventId?: string | null; parentCommentId?: string | null; mentionUserIds?: string[] }) => post<{ id: string }>("/collaboration/comments", body);
export const deleteComment = (id: string) => apiRequest<void>(`/collaboration/comments/${id}`, { method: "DELETE" });
export const react = (body: { emoji: string; activityEventId?: string | null; commentId?: string | null }) => post<{ added: boolean }>("/collaboration/reactions", body);
/** multipart upload of one file (PDF / JPG / PNG, ≤ 10 MB) to a post or comment. */
export async function attachFile(file: File, target: { activityEventId?: string; commentId?: string }): Promise<CollabAttachment> {
  const fd = new FormData();
  fd.append("file", file);
  if (target.activityEventId) fd.append("activityEventId", target.activityEventId);
  if (target.commentId) fd.append("commentId", target.commentId);
  const res = await fetch("/api/collaboration/attachments", { method: "POST", body: fd, credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? "Upload failed"), { code: json?.error?.code, details: json?.error?.details });
  return json as CollabAttachment;
}
export const attachmentUrl = (id: string) => `/api/attachments/${id}`;
export const allTags = () => apiRequest<{ id: string; name: string; tone: string; count: number }[]>("/collaboration/tags");
export const recordTags = (type: string, id: string) => apiRequest<RecordTags>(`/collaboration/tags/${type}/${id}`);
export const setRecordTags = (type: string, id: string, tags: string[]) => apiRequest<RecordTags>(`/collaboration/tags/${type}/${id}`, { method: "PUT", body: { tags } });
