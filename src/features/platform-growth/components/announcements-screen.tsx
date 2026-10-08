"use client";

import { Archive, Eye, FilePen, Megaphone, MousePointerClick, Pencil, Send, Users, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ANNOUNCEMENT_LOOKUPS, ANNOUNCEMENT_TYPES, type PlatformAnnouncement, type PlatformAnnouncementList } from "@/shared";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { announcementAction, listAnnouncements } from "../api";
import { ComposeModal } from "./compose-modal";
import { ago, dateTime, fmt } from "./growth-ui";

const TYPE_TONE: Record<string, string> = { RELEASE_NOTE: "good", MAINTENANCE: "warn", COMPLIANCE: "violet", BILLING: "info" };
const STATUS_TONE: Record<string, string> = { PUBLISHED: "neutral", SCHEDULED: "info", DRAFT: "neutral", ARCHIVED: "neutral" };
type Chip = "" | "PUBLISHED" | "SCHEDULED" | "DRAFT" | "ARCHIVED";

/** Audience line of a card: "all tenants", "Business, Enterprise", "Payroll module"… */
export function audienceText(a: PlatformAnnouncement) {
  if (a.audience === "ALL") return "all tenants";
  const names = a.targets.map((t) => t.label);
  const list = names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
  return a.audience === "MODULES" ? `${list} module${names.length > 1 ? "s" : ""}` : list;
}

/**
 * Template admin/announcements (30-entry-admin.html 827–912): status chips and type filter, announcement cards with
 * views / clicks, the Drafts list, 30-day engagement bars and the Compose modal #adm-compose.
 */
export function AnnouncementsScreen() {
  const toast = useToast();
  const lookups = useAdminLookups(ANNOUNCEMENT_LOOKUPS);
  const [data, setData] = useState<PlatformAnnouncementList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chip, setChip] = useState<Chip>("");
  const [type, setType] = useState("");
  const [compose, setCompose] = useState<{ a: PlatformAnnouncement | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    listAnnouncements({ type: type || undefined })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the announcements" }));
    return () => { cancelled = true; };
  }, [attempt, type]);

  const head = (
    <div className="page-head">
      <div><div className="eyebrow">Support / Announcements</div><h1>Announcements &amp; release notes</h1><p>In-app banners and emails sent to tenant users. Target by plan, module or tenant.</p></div>
      <div className="head-actions"><button type="button" className="btn primary" onClick={() => setCompose({ a: null })}><Megaphone />Compose</button></div>
    </div>
  );
  if (error) return <>{head}<ErrorState {...error} onRetry={reload} /></>;
  if (!data) return <>{head}<Skeleton style={{ height: 480, borderRadius: 18 }} /></>;

  const act = async (a: PlatformAnnouncement, action: "publish" | "archive") => {
    setBusy(a.id);
    try { await announcementAction(a.id, action, a.rowVersion); toast(action === "publish" ? `“${a.title}” published` : `“${a.title}” archived`, { tone: action === "publish" ? "good" : "info" }); reload(); }
    catch (e) { toast(adminErrorMessage(e, "Could not update the announcement"), { tone: "danger" }); }
    finally { setBusy(null); }
  };
  const cards = data.items.filter((a) => a.status !== "DRAFT" && (chip === "" || a.status === chip));
  const drafts = data.items.filter((a) => a.status === "DRAFT");
  const shown = chip === "DRAFT" ? drafts : cards;
  const top = data.items.filter((a) => a.status === "PUBLISHED").sort((a, b) => b.viewCount - a.viewCount).slice(0, 4);
  const maxViews = Math.max(1, ...top.map((a) => a.viewCount));
  const chips: [Chip, string, number][] = [["", "All", data.counts.all], ["PUBLISHED", "Published", data.counts.PUBLISHED], ["SCHEDULED", "Scheduled", data.counts.SCHEDULED], ["DRAFT", "Draft", data.counts.DRAFT], ["ARCHIVED", "Archived", data.counts.ARCHIVED]];

  return (
    <>
      {head}
      <div className="toolbar">
        <div className="chips">{chips.map(([c, l, n]) => <button key={c || "all"} type="button" className={chip === c ? "active" : undefined} onClick={() => setChip(c)}>{l} <i>{n}</i></button>)}</div>
        <span className="spacer" />
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{ANNOUNCEMENT_TYPES.map((t) => <option key={t} value={t}>{labelOf(lookups, "AnnouncementType", t)}</option>)}</select>
      </div>

      <div className="split">
        <div className="stack">
          {!shown.length && <EmptyState icon={<Megaphone />} title={chip === "DRAFT" ? "No drafts" : "Nothing here yet"} description="Compose a release note, maintenance notice or compliance update." action={<button type="button" className="btn primary sm" onClick={() => setCompose({ a: null })}><Megaphone />Compose</button>} />}
          {shown.map((a) => (
            <div key={a.id} className="panel">
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                <span className={`badge ${TYPE_TONE[a.announcementType] ?? "neutral"}`}>{a.releaseLabel ?? labelOf(lookups, "AnnouncementType", a.announcementType)}</span>
                <span className={`badge ${STATUS_TONE[a.status] ?? "neutral"}`}>{labelOf(lookups, "AnnouncementStatus", a.status)}</span>
                {a.severity !== "INFO" && <span className={`badge ${a.severity === "CRITICAL" ? "danger" : "warn"}`}>{labelOf(lookups, "AnnouncementSeverity", a.severity)}</span>}
                <span className="spacer" />
                <small className="muted">{a.publishAt ? dateTime(a.publishAt) : `Edited ${ago(a.updatedAt)}`} · {audienceText(a)}</small>
              </div>
              <h3 className="mt">{a.title}</h3>
              <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{a.message}</p>
              <div className="row small muted mt" style={{ gap: 6 }}>
                {a.status === "SCHEDULED" || a.status === "DRAFT"
                  ? <><Users size={14} />{a.audience === "ALL" ? "All tenants" : audienceText(a)} · {[a.showBanner && "banner", a.emailAdmins && "email"].filter(Boolean).join(" + ")}</>
                  : <><Eye size={14} />{fmt(a.viewCount)} views<MousePointerClick size={14} />{fmt(a.clickCount)} clicks<XCircle size={14} />{fmt(a.dismissCount)} dismissed</>}
                <span className="spacer" />
                {(a.status === "DRAFT" || a.status === "SCHEDULED") && <button type="button" className="btn ghost sm" onClick={() => setCompose({ a })}><Pencil />Edit</button>}
                {a.status === "SCHEDULED" && <button type="button" className="btn ghost sm" disabled={busy === a.id} onClick={() => act(a, "publish")}><Send />Publish now</button>}
                {(a.status === "PUBLISHED" || a.status === "SCHEDULED") && <button type="button" className="btn ghost sm" disabled={busy === a.id} onClick={() => act(a, "archive")}><Archive />Archive</button>}
                {(a.status === "PUBLISHED" || a.status === "ARCHIVED") && <button type="button" className="btn ghost sm" onClick={() => setCompose({ a })}><Eye />View</button>}
              </div>
            </div>
          ))}
        </div>
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Drafts</h3></div></div>
            <div className="list">
              {drafts.map((d) => (
                <button key={d.id} type="button" className="list-item" style={{ textAlign: "left", width: "100%", background: "none", border: 0 }} onClick={() => setCompose({ a: d })}>
                  <span className="icon-well"><FilePen /></span><div><b>{d.title}</b><small>Edited by {d.updatedBy ?? "Super Admin"} · {ago(d.updatedAt)}</small></div>
                </button>
              ))}
              {!drafts.length && <p className="muted small">No drafts.</p>}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Engagement</h3></div></div>
            {top.length ? (
              <div className="bars">{top.map((a) => <div key={a.id} className="bar" style={{ ["--h" as string]: `${Math.max(4, Math.round((a.viewCount / maxViews) * 100))}%` }} title={`${fmt(a.viewCount)} views · ${fmt(a.clickCount)} clicks`}><i /><span>{a.releaseLabel ?? a.title.split(" ")[0]}</span></div>)}</div>
            ) : <p className="muted small">Views appear once announcements are published.</p>}
          </div>
        </div>
      </div>

      {compose && <ComposeModal announcement={compose.a} lookups={lookups} onClose={() => setCompose(null)} onSaved={() => { setCompose(null); reload(); }} />}
    </>
  );
}
