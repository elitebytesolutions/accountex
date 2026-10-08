"use client";

import { History, Pencil, Save, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_SEVERITIES, ANNOUNCEMENT_TYPES, PlatformAnnouncementCreateSchema,
  type ConfigTenantOption, type LookupsResponse, type MaintenanceWindow, type PlatformAnnouncement, type SubscriptionPlan,
} from "@/shared";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { listPlans } from "@/features/platform-catalogue/api";
import { listConfigTenants } from "@/features/platform-config/api";
import { listMaintenanceWindows } from "@/features/platform-flags/api";
import { labelOf } from "@/features/settings/use-lookups";
import { MODULES } from "@/features/platform-tenants/components/tenant-ui";
import { announcementAction, createAnnouncement, deleteAnnouncement, scheduleAnnouncement, updateAnnouncement } from "../api";

const KEY = { PLANS: "planId", MODULES: "moduleKey", TENANTS: "tenantId" } as const;
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");

/**
 * Template Compose modal #adm-compose: type, severity, title, message, audience, publish time, "Show in-app banner",
 * "Email tenant admins". Targets (plans / modules / companies) are picked below the audience. Drafts save; a future
 * publish time schedules, otherwise it publishes now. Published ones open read-only with History.
 */
export function ComposeModal({ announcement: a, lookups, onClose, onSaved }: {
  announcement: PlatformAnnouncement | null; lookups: LookupsResponse; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const readOnly = !!a && (a.status === "PUBLISHED" || a.status === "ARCHIVED");
  const [f, setF] = useState(() => ({
    announcementType: a?.announcementType ?? "RELEASE_NOTE", severity: a?.severity ?? "INFO", releaseLabel: a?.releaseLabel ?? "", title: a?.title ?? "",
    message: a?.message ?? "", audience: a?.audience ?? "ALL", showBanner: a?.showBanner ?? true, emailAdmins: a?.emailAdmins ?? false,
    maintenanceWindowId: a?.maintenanceWindowId ?? "", publishAt: toLocal(a?.publishAt ?? null),
    picked: new Set(a?.targets.map((t) => t.planId ?? t.moduleKey ?? t.tenantId ?? "") ?? []),
  }));
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [tenants, setTenants] = useState<ConfigTenantOption[]>([]);
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"form" | "history">("form");
  const [confirmDel, setConfirmDel] = useState(false);
  // "now" as a datetime-local string (fixed when the modal opens): a later publish time schedules
  const [nowLocal] = useState(() => toLocal(new Date().toISOString()));

  useEffect(() => {
    void listPlans().then((p) => setPlans(p.filter((x) => x.status === "ACTIVE"))).catch(() => undefined);
    void listConfigTenants().then(setTenants).catch(() => undefined);
    void listMaintenanceWindows("upcoming").then(setWindows).catch(() => undefined);
  }, []);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setErrs((e) => { const n = { ...e }; delete n[k as string]; return n; }); setF((x) => ({ ...x, [k]: v })); };
  const options: { id: string; label: string }[] = f.audience === "PLANS" ? plans.map((p) => ({ id: p.id, label: p.name }))
    : f.audience === "MODULES" ? MODULES.map((m) => ({ id: m.key, label: m.label }))
      : f.audience === "TENANTS" ? tenants.map((t) => ({ id: t.id, label: `${t.name} (${t.code.toUpperCase()})` })) : [];
  const toggle = (id: string) => setF((x) => { const p = new Set(x.picked); if (p.has(id)) p.delete(id); else p.add(id); return { ...x, picked: p }; });
  const body = () => {
    const key = KEY[f.audience as keyof typeof KEY];
    const valid = new Set(options.map((o) => o.id));
    return {
      announcementType: f.announcementType, severity: f.severity, releaseLabel: f.releaseLabel, title: f.title, message: f.message, audience: f.audience,
      targets: key ? [...f.picked].filter((id) => valid.has(id) || !options.length).map((id) => ({ [key]: id })) : [],
      showBanner: f.showBanner, emailAdmins: f.emailAdmins, maintenanceWindowId: f.maintenanceWindowId || null,
    };
  };

  /** mode: draft (save only) · go (publish now, or schedule when the time is in the future). */
  const save = async (mode: "draft" | "go") => {
    const b = body();
    const p = PlatformAnnouncementCreateSchema.safeParse(b);
    if (!p.success) { const e: Record<string, string> = {}; for (const i of p.error.issues) { const k = String(i.path[0]); if (!e[k]) e[k] = i.message; } setErrs(e); toast("Fix the highlighted fields", { tone: "warn" }); return; }
    const when = f.publishAt ? new Date(f.publishAt) : null;
    setBusy(true);
    try {
      let saved = a ? await updateAnnouncement(a.id, { ...b, rowVersion: a.rowVersion }) : await createAnnouncement(b);
      if (mode === "go") {
        if (when && when.getTime() > Date.now() + 30_000) {
          saved = await scheduleAnnouncement(saved.id, when.toISOString(), saved.rowVersion);
          toast(`Announcement scheduled for ${when.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, { tone: "good" });
        } else {
          saved = await announcementAction(saved.id, "publish", saved.rowVersion);
          toast(`“${saved.title}” published${saved.emailAdmins ? " · admin emails queued" : ""}`, { tone: "good" });
        }
      } else toast("Draft saved", { tone: "good" });
      onSaved();
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the announcement"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!a) return;
    setBusy(true);
    try { await deleteAnnouncement(a.id); toast("Draft deleted", { tone: "danger" }); onSaved(); }
    catch (e) { toast(adminErrorMessage(e, "Could not delete the draft"), { tone: "danger" }); }
    finally { setBusy(false); setConfirmDel(false); }
  };

  const future = !!f.publishAt && f.publishAt > nowLocal;
  const err = (k: string) => errs[k] && <small className="hint text-danger">{errs[k]}</small>;
  return (
    <>
      <Modal open onClose={onClose} title={a ? (readOnly ? a.title : "Edit announcement") : "Compose announcement"} subtitle="Shown as an in-app banner and optional email" wide
        foot={tab === "history" ? <button type="button" className="btn secondary" onClick={() => setTab("form")}><Pencil />Back to details</button> : (
          <>
            {a && <button type="button" className="btn ghost" onClick={() => setTab("history")}><History />History</button>}
            {a?.status === "DRAFT" && <button type="button" className="btn ghost" onClick={() => setConfirmDel(true)}><Trash2 />Delete</button>}
            <span className="spacer" />
            {readOnly ? <button type="button" className="btn secondary" onClick={onClose}>Close</button> : <>
              {(!a || a.status === "DRAFT") && <button type="button" className="btn secondary" disabled={busy} onClick={() => save("draft")}><Save />Save draft</button>}
              <button type="button" className="btn primary" disabled={busy} onClick={() => save("go")}><Send />{busy ? "Saving…" : future ? "Schedule" : "Publish now"}</button>
            </>}
          </>
        )}>
        {tab === "history" && a ? <AdminHistoryTab table="Announcements" id={a.id} /> : (
          <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-grid">
              <label><span>Type</span><select value={f.announcementType} onChange={(e) => set("announcementType", e.target.value)}>{ANNOUNCEMENT_TYPES.map((t) => <option key={t} value={t}>{labelOf(lookups, "AnnouncementType", t)}</option>)}</select></label>
              <label><span>Severity</span><select value={f.severity} onChange={(e) => set("severity", e.target.value)}>{ANNOUNCEMENT_SEVERITIES.map((s) => <option key={s} value={s}>{labelOf(lookups, "AnnouncementSeverity", s)}</option>)}</select></label>
              <label className="full"><span>Title</span><input value={f.title} maxLength={160} aria-invalid={!!errs.title} placeholder="Budget 2026-27 salary tax slabs applied" onChange={(e) => set("title", e.target.value)} />{err("title")}</label>
              <label className="full"><span>Message</span><textarea rows={5} value={f.message} maxLength={4000} aria-invalid={!!errs.message} onChange={(e) => set("message", e.target.value)} />{err("message")}</label>
              <label><span>Audience</span><select value={f.audience} onChange={(e) => setF((x) => ({ ...x, audience: e.target.value, picked: new Set() }))}>{ANNOUNCEMENT_AUDIENCES.map((au) => <option key={au} value={au}>{labelOf(lookups, "AnnouncementAudience", au)}</option>)}</select></label>
              <label><span>Publish</span><input type="datetime-local" value={f.publishAt} onChange={(e) => set("publishAt", e.target.value)} /><small className="hint">{future ? "Scheduled: goes live at this time" : "Empty or past: publishes now"}</small></label>
              {f.audience !== "ALL" && (
                <div className="field full"><span>{f.audience === "PLANS" ? "Plans" : f.audience === "MODULES" ? "Modules" : "Companies"} *</span>
                  <div className="row" style={{ flexWrap: "wrap", gap: 10, maxHeight: 160, overflow: "auto" }}>
                    {options.map((o) => <label key={o.id} className="check"><input type="checkbox" checked={f.picked.has(o.id)} onChange={() => toggle(o.id)} /> {o.label}</label>)}
                    {!options.length && <small className="muted">Loading…</small>}
                  </div>{err("targets")}
                </div>
              )}
              <label><span>Release label</span><input value={f.releaseLabel} maxLength={40} placeholder="e.g. Release 4.12" onChange={(e) => set("releaseLabel", e.target.value)} /></label>
              <label><span>Maintenance window</span><select value={f.maintenanceWindowId} onChange={(e) => set("maintenanceWindowId", e.target.value)}><option value="">None</option>
                {windows.map((w) => <option key={w.id} value={w.id}>{w.title} · {new Date(w.startsAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</option>)}
                {a?.maintenanceWindowId && !windows.some((w) => w.id === a.maintenanceWindowId) && <option value={a.maintenanceWindowId}>{a.maintenanceWindowTitle ?? "Linked window"}</option>}
              </select></label>
              <label className="check"><input type="checkbox" checked={f.showBanner} onChange={(e) => set("showBanner", e.target.checked)} /> Show in-app banner</label>
              <label className="check"><input type="checkbox" checked={f.emailAdmins} onChange={(e) => set("emailAdmins", e.target.checked)} /> Email tenant admins <small className="muted">(queued until email delivery)</small></label>
              {err("showBanner")}
            </div>
          </fieldset>
        )}
      </Modal>
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this draft?" confirmLabel="Delete" danger busy={busy} onConfirm={remove}>Drafts can be deleted; published announcements are archived instead.</ConfirmDialog>
    </>
  );
}
