"use client";

import { Archive, Bell, CheckCheck, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { NotificationItem, NotificationList, NotificationPreferences } from "@/shared";
import { NOTIFICATION_EVENTS } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { archiveNotification, getPreferences, listNotifications, readAllNotifications, readNotifications, savePreferences } from "../api";
import { notificationIcon } from "./workspace-bell";
import { money } from "./work-ui";

type Tab = "all" | "APPROVALS" | "FINANCE" | "HR" | "SYSTEM";
const TABS: { k: Tab; label: string; tone: "neutral" | "warn" | "info" | "good" }[] = [
  { k: "all", label: "All", tone: "neutral" }, { k: "APPROVALS", label: "Approvals", tone: "warn" }, { k: "FINANCE", label: "Finance", tone: "info" },
  { k: "HR", label: "HR", tone: "good" }, { k: "SYSTEM", label: "System", tone: "neutral" },
];
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function groupOf(iso: string) {
  const t = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  if (t === today) return "Today";
  if (t === today - 86_400_000) return "Yesterday";
  if (t > today - 7 * 86_400_000) return "Earlier this week";
  return "Older";
}

/** Template app/notifications (40-acc-core.html): Notification Centre with category tabs, summary and delivery channels. */
export function NotificationsScreen() {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [list, setList] = useState<NotificationList | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    listNotifications({ category: tab === "all" ? null : tab, pageSize: 100 })
      .then((l) => { if (!cancelled) { setList(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load notifications" }));
    return () => { cancelled = true; };
  }, [tab, attempt]);
  useEffect(() => { void getPreferences().then(setPrefs).catch(() => undefined); }, []);

  const open = (n: NotificationItem) => {
    if (!n.readAt) void readNotifications([n.id]).catch(() => undefined);
    if (n.href) router.push(n.href);
    else reload();
  };
  const savePref = async (p: NotificationPreferences, msg: string) => {
    const before = prefs;
    setPrefs(p);
    try {
      setPrefs(await savePreferences(p));
      toast(msg, { tone: "good" });
    } catch (e) {
      setPrefs(before);
      toast(apiMessage(e, "Could not save your preferences"), { tone: "danger" });
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const s = list?.summary;
  const countOf = (t: Tab) => (t === "all" ? s?.total ?? 0 : s?.byCategory[t]?.count ?? 0);
  const groups = new Map<string, NotificationItem[]>();
  for (const n of list?.items ?? []) {
    const g = tab === "all" ? groupOf(n.createdAt) : "";
    groups.set(g, [...(groups.get(g) ?? []), n]);
  }

  return (
    <>
      <PageHead
        eyebrow="System / Notifications"
        title="Notification Centre"
        description="Approvals, finance alerts, HR events and system messages in one place."
        actions={
          <>
            <Button icon={<CheckCheck />} disabled={!s?.unread} onClick={() => void readAllNotifications(tab === "all" ? null : tab).then((r) => { toast(`${r.read} marked as read`, { tone: "good" }); reload(); }).catch((e: unknown) => toast(apiMessage(e, "Could not mark them"), { tone: "danger" }))}>Mark all read</Button>
            <Button icon={<SlidersHorizontal />} onClick={() => setDrawer(true)}>Preferences</Button>
          </>
        }
      />
      <div className="split">
        <div className="panel">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.k} type="button" className={tab === t.k ? "active" : undefined} onClick={() => setTab(t.k)}>
                {t.label} <Badge tone={t.tone}>{countOf(t.k)}</Badge>
              </button>
            ))}
          </div>
          {!list ? <Skeleton style={{ height: 320 }} /> : !list.items.length ? (
            <EmptyState icon={<Bell />} title="No notifications" description="Approvals routed to you, tasks, finance alerts and Accountex messages appear here." />
          ) : (
            [...groups].map(([g, items]) => (
              <div key={g || "flat"}>
                {g && <div className="form-section"><h4>{g}</h4></div>}
                <div className="list">
                  {items.map((n) => (
                    <div key={n.id} className="list-item" role="button" tabIndex={0} style={{ cursor: "pointer", ...(n.readAt ? {} : { background: "var(--primary-soft)" }) }}
                      onClick={() => open(n)} onKeyDown={(e) => e.key === "Enter" && open(n)}>
                      <span className="icon-well">{notificationIcon(n)}</span>
                      <div>
                        <b>{n.title}</b>
                        <small>{[n.body, n.amount !== null ? `Rs ${money(n.amount)}` : null, `${g === "Today" || g === "Yesterday" ? "" : new Date(n.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " "}${time(n.createdAt)}`].filter(Boolean).join(" · ")}</small>
                      </div>
                      <span className="spacer" />
                      {n.readAt ? <span className="small muted">Read</span> : <Badge tone={n.severity === "DANGER" ? "danger" : "warn"} dot>Unread</Badge>}
                      <button type="button" className="icon-btn-sm" title="Archive" aria-label="Archive" onClick={(e) => { e.stopPropagation(); void archiveNotification(n.id).then(reload).catch(() => undefined); }}><Archive /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Summary</h3><p>Last 7 days</p></div></div>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", margin: 0 }}>
              <dt className="muted">Unread</dt><dd><b>{s?.unread ?? "…"}</b></dd>
              <dt className="muted">Needs action</dt><dd><b>{s?.needsAction ?? "…"}</b></dd>
              <dt className="muted">Mentions</dt><dd><b>{s?.mentions ?? "…"}</b></dd>
              <dt className="muted">Total received</dt><dd><b>{s?.total7d ?? "…"}</b></dd>
            </dl>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Delivery channels</h3><p>Email, SMS and WhatsApp are saved for when a provider is connected</p></div></div>
            {!prefs ? <Skeleton style={{ height: 120 }} /> : (
              <div className="stack">
                <Switch label="In-app" checked={prefs.inApp} onChange={(e) => void savePref({ ...prefs, inApp: e.target.checked }, e.target.checked ? "In-app notifications on" : "In-app notifications off")} />
                <Switch label={`Email digest · daily ${prefs.emailDigest.time}`} checked={prefs.emailDigest.on} onChange={(e) => void savePref({ ...prefs, emailDigest: { ...prefs.emailDigest, on: e.target.checked } }, "Email digest preference saved")} />
                <Switch label={`SMS for approvals above Rs ${Math.round(prefs.smsApprovalsAbove.amount).toLocaleString("en-US")}`} checked={prefs.smsApprovalsAbove.on} onChange={(e) => void savePref({ ...prefs, smsApprovalsAbove: { ...prefs.smsApprovalsAbove, on: e.target.checked } }, "SMS preference saved")} />
                <Switch label="WhatsApp cheque maturity alerts" checked={prefs.whatsappCheques} onChange={(e) => void savePref({ ...prefs, whatsappCheques: e.target.checked }, "WhatsApp preference saved")} />
              </div>
            )}
          </div>
        </div>
      </div>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Notification preferences" subtitle="Choose what reaches you in the app">
        {!prefs ? <Skeleton style={{ height: 200 }} /> : <div className="stack">{NOTIFICATION_EVENTS.map((e) => (
          <Switch key={e.code} label={e.label} checked={!prefs.mutedEvents.includes(e.code)}
            onChange={(ev) => void savePref({ ...prefs, mutedEvents: ev.target.checked ? prefs.mutedEvents.filter((c) => c !== e.code) : [...prefs.mutedEvents, e.code] }, ev.target.checked ? `${e.label}: on` : `${e.label}: off`)} />
        ))}</div>}
        <p className="small muted mt">Turning an event off stops new in-app notifications for it; existing ones stay.</p>
      </Drawer>
    </>
  );
}
