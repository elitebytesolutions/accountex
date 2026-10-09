"use client";

import "./activity-screen.css";
import { Activity, AtSign, Bell, Inbox, MessagesSquare, Paperclip, Reply, Send, SmilePlus, Trash2, User, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ACTIVITY_MODULES, REACTION_EMOJIS, type CollabComment, type CollabPerson, type Feed, type FeedPost } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { initialsOf } from "@/features/auth/initials";
import { Money } from "@/features/finance/components/finance-ui";
import { attachFile, attachmentUrl, createComment, createPost, deleteComment, deletePost, feed as loadFeed, people as loadPeople, react } from "../api";
import { ALLOWED_TYPES, apiMessage, Avatar, fileIcon, makeClock, MAX_BYTES, MentionText, mentionedIds, modOf, MODULES, sizeLabel } from "./activity-ui";

type Tab = "ALL" | "MENTIONS" | "MINE";
type Reactions = FeedPost["reactions"];
type Props = { userId: string; userName: string; companyName: string; timeZone: string };
type Del = { kind: "post"; id: string } | { kind: "comment"; postId: string; id: string } | null;

const MENTION_RE = /@([A-Za-z]*(?: [A-Za-z]*)?)$/;
const PINNED: string[] = ["👍", "🎉"];

/** Toggles `emoji` in a reaction list (optimistic UI). */
function toggled(list: Reactions, emoji: string): Reactions {
  const r = list.find((x) => x.emoji === emoji);
  if (!r) return [...list, { emoji, count: 1, mine: true }];
  return list.map((x) => (x.emoji === emoji ? { ...x, mine: !x.mine, count: x.count + (x.mine ? -1 : 1) } : x)).filter((x) => x.count > 0 || PINNED.includes(x.emoji));
}

/**
 * Template app/activity (4A-company-plus.html + 9A-company-plus.js "activity()"): composer with @mentions and files,
 * All / Mentions / My activity tabs, posts grouped by day with reactions and replies, and People / Modules filters.
 * Deviations: no "Link document" (a post links a document only from that document's screen), no "Online now" panel
 * (no presence), Notifications button disabled until notifications ship.
 */
export function ActivityScreen({ userId, userName, companyName, timeZone }: Props) {
  const toast = useToast();
  const clock = useMemo(() => makeClock(timeZone), [timeZone]);
  const [tab, setTab] = useState<Tab>("ALL");
  const [person, setPerson] = useState<string | null>(null);
  const [mod, setMod] = useState<string | null>(null);
  type FeedState = { status: "error"; message: string; reference?: string } | { status: "ready"; feed: Feed };
  const [raw, setData] = useState<(FeedState & { key: string }) | null>(null);
  const [nonce, setNonce] = useState(0);
  const [unread, setUnread] = useState(0);
  const [more, setMore] = useState(false);
  const [team, setTeam] = useState<CollabPerson[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [del, setDel] = useState<Del>(null);
  const [deleting, setDeleting] = useState(false);

  /* The feed for the current tab + filters; `nonce` forces a reload. Loading = no result for this key yet. */
  const key = `${tab}|${person ?? ""}|${mod ?? ""}|${nonce}`;
  useEffect(() => {
    let live = true;
    loadFeed({ tab, person: person ?? undefined, module: mod ?? undefined, limit: 30 }).then(
      (f) => { if (!live) return; setData({ key, status: "ready", feed: f }); setUnread(f.unreadMentions); },
      (e) => live && setData({ key, status: "error", message: apiMessage(e, "Could not load the activity feed"), reference: (e as { correlationId?: string }).correlationId }),
    );
    return () => { live = false; };
  }, [key, tab, person, mod]);
  const data: FeedState | { status: "loading" } = raw && raw.key === key ? raw : { status: "loading" };
  const reload = () => setNonce((n) => n + 1);
  useEffect(() => { loadPeople().then(setTeam, () => setTeam([])); }, []);

  async function loadMore() {
    if (data.status !== "ready" || !data.feed.nextBefore) return;
    setMore(true);
    try {
      const f = await loadFeed({ tab, person: person ?? undefined, module: mod ?? undefined, before: data.feed.nextBefore, limit: 30 });
      setData({ key, status: "ready", feed: { ...data.feed, posts: [...data.feed.posts, ...f.posts.filter((p) => !data.feed.posts.some((x) => x.id === p.id))], nextBefore: f.nextBefore } });
    } catch (e) {
      toast(apiMessage(e, "Could not load more activity"), { tone: "danger" });
    } finally {
      setMore(false);
    }
  }

  /** Applies `fn` to one post in the loaded feed. */
  const patch = useCallback((id: string, fn: (p: FeedPost) => FeedPost | null) => {
    setData((d) => (!d || d.status !== "ready" ? d : { ...d, feed: { ...d.feed, posts: d.feed.posts.flatMap((p) => (p.id === id ? (fn(p) ?? []) : [p])) } }));
  }, []);

  function onPosted(id: string) {
    setFresh(id);
    setPerson(null); setMod(null); setTab("ALL"); reload();
  }

  async function confirmDelete() {
    if (!del) return;
    setDeleting(true);
    try {
      if (del.kind === "post") {
        await deletePost(del.id);
        patch(del.id, () => null);
        toast("Post removed");
      } else {
        await deleteComment(del.id);
        const cid = del.id;
        patch(del.postId, (p) => ({ ...p, comments: p.comments.filter((c) => c.id !== cid) }));
        toast("Reply removed");
      }
      setDel(null);
    } catch (e) {
      toast(apiMessage(e, "Could not remove it"), { tone: "danger" });
    } finally {
      setDeleting(false);
    }
  }

  const names = useMemo(() => team.map((p) => p.name), [team]);
  const posts = data.status === "ready" ? data.feed.posts : [];
  const filtered = !!person || !!mod;

  return (
    <>
      <PageHead
        eyebrow={<><MessagesSquare />Workspace / Activity</>}
        title="Activity"
        description={`What's happening across ${companyName}: documents, approvals and conversations, with @mentions that land in the right inbox.`}
        actions={<>
          <span className="tagline">the team, live</span>
          <Button variant="secondary" icon={<Bell />} disabled title="Notifications arrive in a later phase">Notifications</Button>
        </>}
      />
      <div className="split cp-af-split">
        <div className="cp-af-main">
          <Composer userId={userId} userName={userName} team={team} onPosted={onPosted} />
          <div data-tabs>
            <div className="tabs" role="tablist">
              {([["ALL", "All activity", <Activity key="i" />], ["MENTIONS", "Mentions", <AtSign key="i" />], ["MINE", "My activity", <User key="i" />]] as const).map(([k, label, icon]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={cn(tab === k && "active")} onClick={() => setTab(k)}>
                  {icon}{label}{k === "MENTIONS" && <> <span className="badge lime">{unread}</span></>}
                </button>
              ))}
            </div>
          </div>
          <div className="cp-feed">
            {data.status === "loading" && [0, 1, 2].map((i) => (
              <div key={i} className="cp-post cp-post-skel"><Skeleton style={{ width: 36, height: 36, borderRadius: "50%" }} /><div className="cp-post-b"><Skeleton style={{ height: 14, width: "55%" }} /><Skeleton style={{ height: 40, marginTop: 10 }} /></div></div>
            ))}
            {data.status === "error" && <ErrorState message={data.message} reference={data.reference} onRetry={reload} />}
            {data.status === "ready" && posts.length === 0 && (
              <EmptyState
                icon={tab === "MENTIONS" ? <AtSign /> : <Inbox />}
                title={filtered ? "Nothing matches" : tab === "MENTIONS" ? "No mentions yet" : tab === "MINE" ? "Nothing from you yet" : "Nothing here yet"}
                description={filtered ? "Try clearing the people or module filters." : tab === "MENTIONS" ? "When someone @mentions you, it lands here." : "Share an update above to get the conversation going."}
                action={filtered ? <Button size="sm" onClick={() => { setPerson(null); setMod(null); }}>Clear filters</Button> : undefined}
              />
            )}
            {posts.map((p, i) => {
              const day = clock.dayKey(p.occurredAt);
              const showDay = i === 0 || clock.dayKey(posts[i - 1]!.occurredAt) !== day;
              return (
                <Fragment key={p.id}>
                  {showDay && <div className="cp-day"><span>{clock.dayLabel(p.occurredAt)}</span></div>}
                  <Post
                    post={p} index={i} fresh={fresh === p.id} userId={userId} userName={userName} names={names} team={team} clock={clock}
                    patch={patch} onDelete={(d) => setDel(d)}
                  />
                </Fragment>
              );
            })}
            {data.status === "ready" && data.feed.nextBefore && (
              <div className="cp-af-more"><Button onClick={loadMore} disabled={more}>{more ? "Loading…" : "Load more"}</Button></div>
            )}
          </div>
        </div>

        <div className="stack cp-af-side">
          <div className="panel">
            <div className="panel-head">
              <div><h3>People</h3><p>Filter by who did it</p></div>
              {filtered && <Button variant="ghost" size="sm" onClick={() => { setPerson(null); setMod(null); }}>Clear</Button>}
            </div>
            <div className="cp-pps">
              {data.status === "ready" && data.feed.people.length === 0 && !person && <p className="muted cp-af-none">No one has posted yet.</p>}
              {data.status === "ready" && data.feed.people.map((u) => (
                <button key={u.id} type="button" className={cn("cp-pp", person === u.id && "on")} onClick={() => setPerson(person === u.id ? null : u.id)}>
                  <Avatar name={u.name} size="xs" /><span>{u.id === userId ? `${u.name} (you)` : u.name}</span><b>{u.count}</b>
                </button>
              ))}
              {data.status === "loading" && [0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 28 }} />)}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Modules</h3></div></div>
            <div className="cp-mbs">
              {data.status === "ready" && data.feed.modules.length === 0 && !mod && <p className="muted cp-af-none">No activity yet.</p>}
              {data.status === "ready" && data.feed.modules.map((m) => {
                const meta = modOf(m.module);
                return (
                  <button key={m.module} type="button" className={cn("cp-mb", mod === m.module && "on")} onClick={() => setMod(mod === m.module ? null : m.module)}>
                    <span className={`cp-mod ${meta.tone}`}><meta.icon /></span>{meta.label}<b>{m.count}</b>
                  </button>
                );
              })}
              {data.status === "loading" && [0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 28 }} />)}
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={!!del} onClose={() => !deleting && setDel(null)} onConfirm={confirmDelete} busy={deleting} danger
        title={del?.kind === "comment" ? "Remove this reply?" : "Remove this post?"} confirmLabel="Remove"
      >
        {del?.kind === "comment" ? "The reply disappears from the thread for everyone." : "The post, its replies and its files disappear from the feed for everyone."}
      </ConfirmDialog>
    </>
  );
}

/* ------------------------------------------------------------------ composer */

function Composer({ userId, userName, team, onPosted }: { userId: string; userName: string; team: CollabPerson[]; onPosted: (id: string) => void }) {
  const toast = useToast();
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [module, setModule] = useState<string>("ACCOUNTING");
  const [busy, setBusy] = useState(false);
  const [mn, setMn] = useState<{ list: CollabPerson[]; idx: number } | null>(null);

  const mentionState = (value: string, caret: number, idx = 0) => {
    const m = value.slice(0, caret).match(MENTION_RE);
    if (!m) return setMn(null);
    const q = m[1]!.toLowerCase();
    const list = team.filter((p) => p.id !== userId && (!q || p.name.toLowerCase().startsWith(q) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))).slice(0, 6);
    setMn(list.length ? { list, idx: Math.min(idx, list.length - 1) } : null);
  };
  const pick = (p: CollabPerson) => {
    const el = ta.current;
    if (!el) return;
    const pos = el.selectionStart, before = el.value.slice(0, pos).replace(MENTION_RE, `@${p.name} `);
    const next = before + el.value.slice(pos);
    setText(next);
    setMn(null);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = before.length; });
  };
  const grow = () => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(160, el.scrollHeight)}px`; } };

  function addFiles(list: FileList | null) {
    const ok: File[] = [];
    for (const f of Array.from(list ?? [])) {
      if (!ALLOWED_TYPES.includes(f.type)) toast(`${f.name}: only PDF, JPG or PNG files`, { tone: "warn" });
      else if (f.size > MAX_BYTES) toast(`${f.name} is larger than 10 MB`, { tone: "warn" });
      else ok.push(f);
    }
    setFiles((cur) => [...cur, ...ok]);
  }

  async function post() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const mentionUserIds = mentionedIds(body, team, userId);
    try {
      const { id } = await createPost({ body, module, mentionUserIds });
      let failed = 0;
      for (const f of files) {
        try { await attachFile(f, { activityEventId: id }); } catch (e) { failed++; toast(`${f.name}: ${apiMessage(e, "upload failed")}`, { tone: "danger" }); }
      }
      setText(""); setFiles([]); setMn(null);
      if (ta.current) ta.current.style.height = "";
      const who = team.filter((p) => mentionUserIds.includes(p.id)).map((p) => p.name);
      if (!failed) toast(who.length ? `Posted · ${who.join(", ")} notified` : "Posted to the activity feed", { ms: 2400 });
      onPosted(id);
    } catch (e) {
      toast(apiMessage(e, "Could not post"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mn) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setMn({ ...mn, idx: (mn.idx + (e.key === "ArrowDown" ? 1 : -1) + mn.list.length) % mn.list.length }); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(mn.list[mn.idx]!); return; }
      if (e.key === "Escape") { e.stopPropagation(); setMn(null); return; }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void post(); }
  }

  return (
    <div className="panel cp-compose">
      <div className="cp-comp-row">
        <span className="avatar lime">{initialsOf(userName)}</span>
        <div className="cp-comp-in">
          <textarea
            ref={ta} rows={2} value={text} maxLength={5000} aria-label="Write a post"
            placeholder="Share an update, ask a question… type @ to mention someone"
            onChange={(e) => { setText(e.target.value); mentionState(e.target.value, e.target.selectionStart); grow(); }}
            onClick={(e) => mentionState(e.currentTarget.value, e.currentTarget.selectionStart)}
            onKeyDown={onKey}
            onBlur={() => setTimeout(() => { if (document.activeElement !== ta.current) setMn(null); }, 150)}
          />
          {mn && (
            <div className="cp-mention" role="listbox" aria-label="Mention a teammate">
              <small>Mention a teammate</small>
              {mn.list.map((p, i) => (
                <button key={p.id} type="button" role="option" aria-selected={i === mn.idx} className={cn(i === mn.idx && "hl")} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
                  <Avatar name={p.name} size="xs" /><span><b>{p.name}</b>{p.email && <em>{p.email}</em>}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {files.length > 0 && (
        <div className="cp-comp-atts">
          {files.map((f, i) => {
            const Icon = fileIcon(f.type, f.name);
            return (
              <span key={`${f.name}-${i}`} className="cp-file cp-pop">
                <Icon /><b>{f.name}</b><small>{sizeLabel(f.size)}</small>
                <button type="button" title="Remove" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}><X /></button>
              </span>
            );
          })}
        </div>
      )}
      <div className="cp-comp-f">
        <Button variant="ghost" size="sm" icon={<Paperclip />} onClick={() => fileIn.current?.click()}>Attach</Button>
        <input ref={fileIn} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <Button variant="ghost" size="sm" icon={<AtSign />} onClick={() => {
          const v = text, next = v + (v && !/\s$/.test(v) ? " " : "") + "@";
          setText(next);
          requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.selectionStart = el.selectionEnd = next.length; mentionState(next, next.length); } });
        }}>Mention</Button>
        <select className="cp-sel-sm" value={module} onChange={(e) => setModule(e.target.value)} aria-label="Module">
          {ACTIVITY_MODULES.map((m) => <option key={m} value={m}>{MODULES[m]?.label ?? m}</option>)}
        </select>
        <span className="spacer" />
        <small className="muted cp-hide-sm"><kbd>Ctrl</kbd>+<kbd>Enter</kbd></small>
        <Button variant="primary" size="sm" icon={<Send />} disabled={!text.trim() || busy} onClick={() => void post()}>{busy ? "Posting…" : "Post"}</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ post */

type Clock = ReturnType<typeof makeClock>;

function Post({ post: p, index, fresh, userId, userName, names, team, clock, patch, onDelete }: {
  post: FeedPost; index: number; fresh: boolean; userId: string; userName: string; names: string[]; team: CollabPerson[]; clock: Clock;
  patch: (id: string, fn: (p: FeedPost) => FeedPost | null) => void; onDelete: (d: Del) => void;
}) {
  const toast = useToast();
  const meta = modOf(p.module);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const actor = p.actor?.name ?? "System";
  const text = p.body ?? p.summary;

  async function toggle(emoji: string, commentId?: string) {
    const flip = (r: Reactions) => toggled(r, emoji);
    const apply = () => patch(p.id, (x) => (commentId ? { ...x, comments: x.comments.map((c) => (c.id === commentId ? { ...c, reactions: flip(c.reactions) } : c)) } : { ...x, reactions: flip(x.reactions) }));
    const wasMine = (commentId ? p.comments.find((c) => c.id === commentId)?.reactions : p.reactions)?.find((r) => r.emoji === emoji)?.mine;
    apply();
    if (!wasMine) { setBurst(`${commentId ?? ""}${emoji}`); setTimeout(() => setBurst(null), 500); }
    try {
      await react(commentId ? { emoji, commentId } : { emoji, activityEventId: p.id });
    } catch (e) {
      apply(); // toggling again restores the previous state
      toast(apiMessage(e, "Could not react"), { tone: "danger" });
    }
  }

  async function send() {
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const mentionUserIds = mentionedIds(body, team, userId);
      const { id } = await createComment({ body, activityEventId: p.id, mentionUserIds });
      const c: CollabComment = { id, author: { id: userId, name: userName }, body, parentCommentId: null, createdAt: new Date().toISOString(), editedAt: null, mentionsMe: false, mine: true, reactions: [], attachments: [] };
      patch(p.id, (x) => ({ ...x, comments: [...x.comments, c] }));
      setReply("");
    } catch (e) {
      toast(apiMessage(e, "Could not send the reply"), { tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  const shownReactions = (list: Reactions) => {
    const by = new Map(list.map((r) => [r.emoji, r]));
    return [...new Set([...PINNED, ...list.filter((r) => r.count > 0).map((r) => r.emoji)])].map((e) => by.get(e) ?? { emoji: e, count: 0, mine: false });
  };

  return (
    <article className={cn("cp-post", p.mentionsMe && "ment", fresh && "cp-new-post")} style={{ "--i": Math.min(index, 10) } as CSSProperties}>
      <div className="cp-post-av">
        <Avatar name={actor} />
        <span className={`cp-mod ${meta.tone}`} title={meta.label}><meta.icon /></span>
      </div>
      <div className="cp-post-b">
        <div className="cp-post-h">
          <b>{actor}</b> {p.verb && <span>{p.verb}</span>}{" "}
          {p.entity && (p.entity.route ? <Link className="link" href={p.entity.route}>{p.entity.label ?? p.entity.type}</Link> : <span>{p.entity.label ?? p.entity.type}</span>)}
          <span className="spacer" />
          <small title={new Date(p.occurredAt).toLocaleString()}>{clock.time(p.occurredAt)}</small>
          {p.mine && p.kind === "POST" && (
            <button type="button" className="cp-af-del" aria-label="Remove post" title="Remove post" onClick={() => onDelete({ kind: "post", id: p.id })}><Trash2 /></button>
          )}
        </div>
        {text && <p className="cp-post-t"><MentionText text={text} names={names} me={userName} /></p>}
        {p.entity && <EntityCard post={p} />}
        {p.attachments.length > 0 && (
          <div className="cp-att cp-af-files">
            {p.attachments.map((a) => {
              const Icon = fileIcon(a.contentType, a.fileName);
              return <a key={a.id} className="cp-file" href={attachmentUrl(a.id)} target="_blank" rel="noreferrer"><Icon /><b>{a.fileName}</b><small>{sizeLabel(a.sizeBytes)}</small></a>;
            })}
          </div>
        )}
        <div className="cp-post-f">
          <span className="badge neutral"><meta.icon />{meta.label}</span>
          {shownReactions(p.reactions).map((r) => (
            <button key={r.emoji} type="button" className={cn("cp-re", r.mine && "on", burst === r.emoji && "cp-burst-re")} onClick={() => void toggle(r.emoji)} aria-pressed={r.mine}>
              <span>{r.emoji}</span><b>{r.count || ""}</b>
            </button>
          ))}
          <button type="button" className="cp-re add" title="React" aria-label="React" onClick={(e) => setMenu(e.currentTarget)}><SmilePlus /></button>
          <button type="button" className="cp-rbtn" onClick={() => setReplyOpen((o) => !o)}><Reply />Reply{p.comments.length ? ` · ${p.comments.length}` : ""}</button>
        </div>
        {menu && (
          <Menu anchor={menu} onClose={() => setMenu(null)} items={REACTION_EMOJIS.map((e) => ({
            label: `${e} ${p.reactions.find((r) => r.emoji === e)?.mine ? "Remove" : "React"}`, onClick: () => { setMenu(null); void toggle(e); },
          }))} />
        )}
        {p.comments.length > 0 && (
          <div className="cp-rps">
            {p.comments.map((c) => (
              <div key={c.id} className="cp-rp">
                <Avatar name={c.author?.name ?? "?"} size="xs" />
                <div>
                  <b>{c.author?.name ?? "Someone"}</b><small>{clock.dayKey(c.createdAt) === clock.dayKey(new Date().toISOString()) ? clock.time(c.createdAt) : `${clock.dayLabel(c.createdAt)}, ${clock.time(c.createdAt)}`}</small>
                  {c.mine && <button type="button" className="cp-af-del sm" aria-label="Remove reply" title="Remove reply" onClick={() => onDelete({ kind: "comment", postId: p.id, id: c.id })}><Trash2 /></button>}
                  <p><MentionText text={c.body} names={names} me={userName} /></p>
                  {c.attachments.length > 0 && (
                    <div className="cp-af-files">
                      {c.attachments.map((a) => { const Icon = fileIcon(a.contentType, a.fileName); return <a key={a.id} className="cp-file" href={attachmentUrl(a.id)} target="_blank" rel="noreferrer"><Icon /><b>{a.fileName}</b><small>{sizeLabel(a.sizeBytes)}</small></a>; })}
                    </div>
                  )}
                  <div className="cp-af-cre">
                    {shownReactions(c.reactions).filter((r) => r.count > 0 || r.emoji === "👍").map((r) => (
                      <button key={r.emoji} type="button" className={cn("cp-re", r.mine && "on", burst === `${c.id}${r.emoji}` && "cp-burst-re")} onClick={() => void toggle(r.emoji, c.id)} aria-pressed={r.mine}>
                        <span>{r.emoji}</span><b>{r.count || ""}</b>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {replyOpen && (
          <div className="cp-rin">
            <span className="avatar xs lime">{initialsOf(userName)}</span>
            <input
              autoFocus value={reply} maxLength={5000} placeholder={`Reply to ${actor.split(" ")[0]}…`} aria-label="Reply"
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } if (e.key === "Escape") setReplyOpen(false); }}
            />
            <Button variant="primary" size="sm" className="icon" aria-label="Send reply" disabled={!reply.trim() || sending} onClick={() => void send()}><Send /></Button>
          </div>
        )}
      </div>
    </article>
  );
}

function EntityCard({ post: p }: { post: FeedPost }) {
  const meta = modOf(p.module);
  const e = p.entity!;
  const inner = (
    <>
      <span className={cn("icon-tile", meta.tone !== "green" && meta.tone)}><meta.icon /></span>
      <div><b>{e.label ?? e.type}</b><small>{e.type}</small></div>
      <span className="spacer" />
      {(p.amount !== null || p.statusLabel) && (
        <div className="cp-doc-r">
          {p.amount !== null && <b><Money value={p.amount} dec={0} /></b>}
          {p.statusLabel && <Badge tone={(p.statusTone as Tone | null) ?? "neutral"}>{p.statusLabel}</Badge>}
        </div>
      )}
    </>
  );
  return e.route ? <Link className="cp-doc" href={e.route}>{inner}</Link> : <div className="cp-doc">{inner}</div>;
}
