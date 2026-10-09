"use client";

import { Bell, CheckCheck, CircleAlert, ClipboardList, FileCheck2, Info, Landmark, Megaphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationItem } from "@/shared";
import { cn } from "@/components/ui/cn";
import { useNoticeFeed } from "@/features/shell/components/platform-notice-banner";
import { readPlatformMessages } from "@/features/support/api";
import { notificationBell, readNotifications } from "../api";
import { whenShort } from "./work-ui";

const POLL_MS = 2 * 60_000;
export const notificationIcon = (n: Pick<NotificationItem, "category" | "eventCode" | "severity">) =>
  n.eventCode === "PLATFORM_BROADCAST" ? <Megaphone />
    : n.category === "APPROVALS" ? <FileCheck2 />
    : n.category === "FINANCE" ? <Landmark />
    : n.eventCode.startsWith("TASK_") ? <ClipboardList />
    : n.severity === "DANGER" ? <CircleAlert /> : <Info />;

/**
 * Template top-bar bell (99-app.js popNotif): my unread notifications (approvals, tasks, finance alerts, Accountex
 * broadcasts) and recent Accountex announcements, with "View all" to the Notification Centre. Opening an item marks it
 * read; opening the bell marks broadcast messages read (Phase 42 behaviour).
 */
export function WorkspaceBell() {
  const router = useRouter();
  const { feed, refresh: reloadFeed } = useNoticeFeed();
  const [mine, setMine] = useState<{ unread: number; items: NotificationItem[] } | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const load = useCallback(() => void notificationBell().then(setMine).catch(() => undefined), []);
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
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
    if (!open) {
      load();
      if (feed?.unread) void readPlatformMessages().catch(() => undefined).then(reloadFeed);
    }
  };
  const go = (n: NotificationItem) => {
    setOpen(false);
    void readNotifications([n.id]).catch(() => undefined).then(load);
    if (n.href) router.push(n.href);
  };
  const announcements = (feed?.recent ?? []).slice(0, 3);
  const unread = mine?.unread ?? 0;

  return (
    <div className="pop-wrap" ref={ref}>
      <button className="round-btn" type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} onClick={toggle}>
        <Bell />{(unread > 0 || !!feed?.unread) && <em />}
      </button>
      <div className={cn("pop notif-pop", open && "open")} role="dialog" aria-label="Notifications">
        <h3>Notifications <Link className="link small" href="/notifications" onClick={() => setOpen(false)}>View all</Link></h3>
        {(mine?.items ?? []).map((n) => (
          <button key={n.id} type="button" className="n fresh" style={{ width: "100%", textAlign: "left", background: "none", border: 0, cursor: "pointer" }} onClick={() => go(n)}>
            <span className="icon-well sm">{notificationIcon(n)}</span>
            <div><b>{n.title}</b><span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.body}</span><small className="muted" style={{ display: "block" }}>{whenShort(n.createdAt)}</small></div>
          </button>
        ))}
        {announcements.map((a) => (
          <div key={a.id} className="n">
            <span className="icon-well sm"><Megaphone /></span>
            <div><b>{a.releaseLabel ? `${a.releaseLabel} · ${a.title}` : a.title}</b><span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.message}</span><small className="muted" style={{ display: "block" }}>{whenShort(a.publishAt)}</small></div>
          </div>
        ))}
        {!mine?.items.length && !announcements.length && (
          <div className="n"><span className="icon-well sm"><CheckCheck /></span><div><b>You&apos;re all caught up</b>Approvals, tasks and alerts for you appear here.</div></div>
        )}
      </div>
    </div>
  );
}
