"use client";

import { Bell, ChevronLeft, ChevronRight, Info, Megaphone, OctagonAlert, Siren, TriangleAlert, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAINTENANCE_COMPONENTS, type PlatformNotice, type PlatformNoticeFeed } from "@/shared";
import { cn } from "@/components/ui/cn";
import { getActiveIncidents, getPlatformNotices, markPlatformNotice, readPlatformMessages, type ActiveIncident } from "@/features/support/api";

const POLL_MS = 5 * 60_000;
const toneOf = (n: Pick<PlatformNotice, "severity" | "announcementType">) =>
  n.severity === "CRITICAL" ? "danger" : n.severity === "WARNING" || n.announcementType === "MAINTENANCE" ? "warn" : "info";
const iconOf = (n: Pick<PlatformNotice, "severity" | "announcementType">) =>
  n.severity === "CRITICAL" ? <OctagonAlert /> : n.announcementType === "MAINTENANCE" ? <Wrench /> : n.severity === "WARNING" ? <TriangleAlert /> : <Megaphone />;
/** Incident times follow the status page (Pakistan time, labelled PKT). */
const whenPk = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
const componentLabel = (code: string) => MAINTENANCE_COMPONENTS.find((c) => c.code === code)?.label ?? code.replace(/_/g, " ").toLowerCase();
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** One shared poll of the feed for the banner and the bell (both mount in the app shell). */
const shared: { feed: PlatformNoticeFeed | null; listeners: Set<(f: PlatformNoticeFeed | null) => void>; timer: ReturnType<typeof setInterval> | null } = { feed: null, listeners: new Set(), timer: null };
async function refresh() {
  try { shared.feed = await getPlatformNotices(); } catch { shared.feed = null; }
  for (const l of shared.listeners) l(shared.feed);
}
function useNoticeFeed() {
  const [feed, setFeed] = useState<PlatformNoticeFeed | null>(shared.feed);
  useEffect(() => {
    shared.listeners.add(setFeed);
    if (shared.listeners.size === 1) { void refresh(); shared.timer = setInterval(() => void refresh(), POLL_MS); }
    return () => {
      shared.listeners.delete(setFeed);
      if (!shared.listeners.size && shared.timer) { clearInterval(shared.timer); shared.timer = null; }
    };
  }, []);
  return { feed, refresh: useCallback(() => void refresh(), []) };
}

/**
 * Workspace banner for Accountex platform notices (Phase 42), shown beside the support-access banner: open public
 * service incidents (Phase 43's GET /api/status/active-incidents; nothing when it is missing or empty) and published
 * announcements that reach this company with "Show in-app banner", one at a time. Each is counted as viewed once per
 * user; "Read more" counts a click; × dismisses it for this user (it stays in the notifications popover).
 */
export function PlatformNoticeBanner() {
  const { feed, refresh: reload } = useNoticeFeed();
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const viewed = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const load = () => getActiveIncidents().then((x) => !cancelled && setIncidents(x));
    void load();
    const t = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const banners = (feed?.banners ?? []).filter((b) => !hidden.has(b.id));
  const cur = banners[Math.min(i, Math.max(0, banners.length - 1))];
  useEffect(() => {
    if (!cur || viewed.current.has(cur.id)) return;
    viewed.current.add(cur.id);
    void markPlatformNotice(cur.id, "view").catch(() => undefined);
  }, [cur]);

  const dismiss = (id: string) => {
    setHidden((h) => new Set(h).add(id)); setOpen(false); setI(0);
    void markPlatformNotice(id, "dismiss").catch(() => undefined).then(reload);
  };
  const more = (id: string) => {
    setOpen((o) => !o);
    if (!open) void markPlatformNotice(id, "click").catch(() => undefined);
  };

  return (
    <>
      {incidents.map((inc) => (
        <div key={inc.id} className={cn("banner", /MAJOR|CRITICAL|OUTAGE/i.test(inc.impact) ? "danger" : "warn")} role="alert">
          <Siren />
          <div><b>{inc.title}</b><p>{inc.docNo} · {inc.stage.replace(/_/g, " ").toLowerCase()} · since {whenPk(inc.startedAt)} PKT{inc.components.length ? ` · ${inc.components.map(componentLabel).join(", ")}` : ""}</p></div>
        </div>
      ))}
      {cur && (
        <div className={cn("banner", toneOf(cur))} role="status">
          {iconOf(cur)}
          <div>
            <b>{cur.releaseLabel ? `${cur.releaseLabel} · ` : ""}{cur.title}</b>
            <p style={open ? { whiteSpace: "pre-wrap" } : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur.message}</p>
            {cur.maintenance && <p>Maintenance window: {when(cur.maintenance.startsAt)} – {when(cur.maintenance.endsAt)}</p>}
          </div>
          {banners.length > 1 && (
            <span className="row" style={{ gap: 2 }}>
              <button type="button" className="btn ghost sm" aria-label="Previous notice" onClick={() => setI((x) => (x - 1 + banners.length) % banners.length)}><ChevronLeft /></button>
              <small className="muted tnum">{(i % banners.length) + 1} / {banners.length}</small>
              <button type="button" className="btn ghost sm" aria-label="Next notice" onClick={() => setI((x) => (x + 1) % banners.length)}><ChevronRight /></button>
            </span>
          )}
          <button type="button" className="btn ghost sm" onClick={() => more(cur.id)}>{open ? "Less" : "Read more"}</button>
          <button type="button" className="btn ghost sm" aria-label="Dismiss" onClick={() => dismiss(cur.id)}><X /></button>
        </div>
      )}
    </>
  );
}

/**
 * Template top-bar notifications bell (99-app.js popNotif) for platform notices: recent announcements (dismissed ones
 * too) and in-app broadcast messages; the dot shows unread messages, and opening the popover marks them read.
 */
export function PlatformNoticesBell() {
  const { feed, refresh: reload } = useNoticeFeed();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const toggle = () => {
    setOpen((o) => !o);
    if (!open && feed?.unread) void readPlatformMessages().catch(() => undefined).then(reload);
  };
  const items = [
    ...(feed?.messages ?? []).map((m) => ({ key: `m${m.id}`, at: m.createdAt, icon: <Bell />, title: m.title, body: m.body ?? "", fresh: !m.readAt })),
    ...(feed?.recent ?? []).map((n) => ({ key: `a${n.id}`, at: n.publishAt, icon: iconOf(n), title: n.releaseLabel ? `${n.releaseLabel} · ${n.title}` : n.title, body: n.message, fresh: false })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  return (
    <div className="pop-wrap" ref={ref}>
      <button className="round-btn" type="button" aria-label="Notifications" aria-expanded={open} onClick={toggle}><Bell />{!!feed?.unread && <em />}</button>
      <div className={cn("pop notif-pop", open && "open")} role="dialog" aria-label="Notifications">
        <h3>Notifications <Link className="link small" href="/support" onClick={() => setOpen(false)}>Help &amp; support</Link></h3>
        {items.map((n) => (
          <div key={n.key} className={cn("n", n.fresh && "fresh")}>
            <span className="icon-well sm">{n.icon}</span>
            <div><b>{n.title}</b><span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.body}</span><small className="muted" style={{ display: "block" }}>{when(n.at)}</small></div>
          </div>
        ))}
        {!items.length && <div className="n"><span className="icon-well sm"><Info /></span><div><b>You&apos;re all caught up</b>Accountex announcements and messages appear here.</div></div>}
      </div>
    </div>
  );
}
