"use client";

import {
  Activity, CircleCheck, Code, Crosshair, DatabaseBackup, ExternalLink, FileText, Landmark, Lock, Monitor, Plug, Search, Send, Siren, WalletCards, Zap, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { INCIDENT_STAGES, MAINTENANCE_COMPONENTS, type Incident } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { declareIncident, getStatusPage, listIncidents, postIncidentUpdate, savePostmortem } from "../api";
import { fmtDay, fmtMinutes, fmtWhen, useLoad } from "./ops-ui";

const COMP_ICON: Record<string, LucideIcon> = {
  WEB_APP: Monitor, PUBLIC_API: Code, FBR_PRAL_GATEWAY: Plug, PRA_SRB_EINVOICING: Landmark, PAYROLL_ENGINE: WalletCards, EMAIL_SMS: Send, BANK_FEEDS_RAAST: Zap, BACKUPS_DR: DatabaseBackup,
};
const STAGE_LABEL: Record<string, string> = { INVESTIGATING: "Investigating", IDENTIFIED: "Identified", MONITORING: "Monitoring", RESOLVED: "Resolved" };
const STAGE_BADGE: Record<string, string> = { INVESTIGATING: "warn", IDENTIFIED: "violet", MONITORING: "info", RESOLVED: "good" };
const STAGE_ICON = [Search, Crosshair, Activity, CircleCheck];
const IMPACT_LABEL: Record<string, string> = { MINOR: "Minor", MAJOR: "Major", CRITICAL: "Critical" };
const compLabel = (c: string) => MAINTENANCE_COMPONENTS.find((x) => x.code === c)?.label ?? c;
const BAR: Record<string, string> = { NONE: "good", MINOR: "warn", MAJOR: "danger", CRITICAL: "danger" };
const BAR_TIP: Record<string, string> = { NONE: "No incidents", MINOR: "Degraded performance", MAJOR: "Partial outage", CRITICAL: "Major outage" };
const CSTAT: Record<string, [string, string]> = { OPERATIONAL: ["good", "Operational"], DEGRADED: ["warn", "Degraded"], OUTAGE: ["danger", "Outage"], MAINTENANCE: ["info", "Maintenance"] };

/**
 * Template admin/status incident part (9B-admin-plus.js 1950–2075): status banner, public status page with 90-day
 * component bars, incident detail (4-stage stepper, update timeline, composer, post-mortem) and the incident list,
 * plus the "Declare incident" modal (opened from the page head).
 */
export function IncidentsSection({ declareOpen, onDeclareClose }: { declareOpen: boolean; onDeclareClose: () => void }) {
  const toast = useToast();
  const status = useLoad(getStatusPage, "Could not load the status page");
  const incidents = useLoad(() => listIncidents(90), "Could not load incidents");
  const [selId, setSelId] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const list = incidents.data ?? [];
  const sel = list.find((i) => i.id === selId) ?? list[0] ?? null;
  const open = list.filter((i) => i.stage !== "RESOLVED");
  const reload = () => { status.reload(); incidents.reload(); };

  return (
    <>
      <div className={cn("ap-status-ban", open.length ? "warn" : "good")}>
        <span className={cn("ap-sdot", open.length ? "warn" : "good")} />
        {open.length
          ? <div><b>{open.some((i) => i.impact === "CRITICAL") ? "Major outage" : "Partial degradation"}</b><small>{open.map((i) => i.title).join(" · ")}</small></div>
          : <div><b>All systems operational</b><small>Updated just now · {status.data ? `${status.data.uptimePct.toFixed(2)}%` : "…"} uptime over 90 days</small></div>}
        <span className="spacer" />
        <span className={cn("badge", open.length ? "warn" : "good")}>{open.length ? `${open.length} open incident${open.length > 1 ? "s" : ""}` : "No open incidents"}</span>
      </div>

      <div className="panel ap-pubpage">
        <div className="ap-browser"><i /><i /><i /><span><Lock />status.accountex.pk</span><span className="btn ghost sm" title="The public page is served at /api/status/components"><ExternalLink />Public</span></div>
        <div className="ap-pub-head"><div><span className="sb-mark ap-mk"><Activity /></span><b>Accountex Cloud status</b></div><span className="pill">Email &amp; SMS subscribers arrive with Phase 29</span></div>
        {status.error ? <ErrorState message={status.error.message} reference={status.error.reference} onRetry={status.reload} /> : !status.data ? <Skeleton style={{ height: 200 }} /> : (
          <div className="ap-comps">
            {status.data.components.map((c, ci) => {
              const Icon = COMP_ICON[c.component] ?? Monitor;
              const [tone, label] = CSTAT[c.current] ?? ["good", "Operational"];
              return (
                <div key={c.component} className="ap-comp" style={{ ["--i" as string]: ci }}>
                  <div className="ap-comp-h"><Icon /><b>{c.name}</b><span className="spacer" /><small>{c.uptimePct.toFixed(2)}% uptime</small><span className={cn("ap-cstat", tone)}>{label}</span></div>
                  <div className="ap-ubars">{c.days.map((d, di) => <i key={d.day} className={BAR[d.worstImpact]} style={{ ["--d" as string]: di }} title={`${fmtDay(d.day)} · ${BAR_TIP[d.worstImpact]}${d.inMaintenance ? " · maintenance" : ""}`} />)}</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="ap-pub-foot"><span>90 days ago</span><span className="spacer" /><span className="legend ap-legend-in"><span><i style={{ background: "var(--good)" }} />Operational</span><span><i style={{ background: "var(--warn)" }} />Degraded</span><span><i style={{ background: "var(--danger)" }} />Outage</span></span><span className="spacer" /><span>Today</span></div>
      </div>

      <div className="split ap-inc-split">
        <div className="panel ap-incd">
          {incidents.error ? <ErrorState message={incidents.error.message} reference={incidents.error.reference} onRetry={incidents.reload} />
            : !incidents.data ? <Skeleton style={{ height: 220 }} />
            : !sel ? <EmptyState icon={<Siren />} title="No incidents" description="Declared incidents and their updates appear here." />
            : <IncidentDetail key={`${sel.id}-${sel.rowVersion}-${sel.updates.length}`} inc={sel} onHistory={() => setHistory(true)} onChanged={reload} />}
        </div>
        <div className="panel"><div className="panel-head"><div><h3>Incidents</h3><p>Last 90 days</p></div></div>
          {!incidents.data ? <Skeleton style={{ height: 120 }} /> : list.length === 0 ? <EmptyState title="No incidents" description="Nothing declared in the last 90 days." /> : (
            <div className="ap-incs">
              {list.map((i) => (
                <button key={i.id} type="button" className={cn("ap-inc", i.id === sel?.id && "on", i.stage !== "RESOLVED" && "open")} onClick={() => setSelId(i.id)}>
                  <span className={cn("ap-sdot", i.stage !== "RESOLVED" ? "warn" : "good")} />
                  <div><b>{i.title}</b><small>{i.docNo} · {fmtWhen(i.startedAt)}{i.stage === "RESOLVED" ? ` · ${fmtMinutes(i.durationMinutes)}` : ""}</small></div>
                  <span className={cn("badge", i.stage !== "RESOLVED" ? (i.impact === "MINOR" ? "warn" : "danger") : "good")}>{STAGE_LABEL[i.stage]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {declareOpen && <DeclareModal onClose={onDeclareClose} onDone={(inc) => { onDeclareClose(); setSelId(inc.id); reload(); toast(`${inc.docNo} published`, { tone: "danger" }); }} />}
      <Modal open={history && !!sel} onClose={() => setHistory(false)} title="Incident history" subtitle={sel?.docNo} wide>
        {sel && <AdminHistoryTab table="ServiceIncidents" id={sel.id} labels={{ ServiceIncidentUpdates: "Update" }} />}
      </Modal>
    </>
  );
}

function IncidentDetail({ inc, onChanged, onHistory }: { inc: Incident; onChanged: () => void; onHistory: () => void }) {
  const toast = useToast();
  const cur = INCIDENT_STAGES.indexOf(inc.stage as never);
  const [stage, setStage] = useState(Math.min(3, cur + 1));
  const [msg, setMsg] = useState("");
  const [notify, setNotify] = useState(true);
  const [banner, setBanner] = useState(true);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pm, setPm] = useState(inc.postmortemRef ?? "");
  const resolved = inc.stage === "RESOLVED";

  const post = async () => {
    if (!msg.trim()) { setInvalid(true); toast("Write a short update first", { tone: "warn" }); return; }
    setBusy(true);
    try {
      await postIncidentUpdate(inc.id, { stage: INCIDENT_STAGES[stage]!, message: msg, notifySubscribers: notify, updateBanner: banner });
      toast(stage === 3 ? `${inc.docNo} resolved` : `Update posted (${STAGE_LABEL[INCIDENT_STAGES[stage]!]})`, { tone: stage === 3 ? "good" : "info" });
      setMsg(""); onChanged();
    } catch (e) { toast(adminErrorMessage(e, "Could not post the update"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const savePm = async () => {
    setBusy(true);
    try { await savePostmortem(inc.id, { postmortemRef: pm, rowVersion: inc.rowVersion }); toast("Post-mortem saved", { tone: "good" }); onChanged(); }
    catch (e) { toast(adminErrorMessage(e, "Could not save the post-mortem"), { tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="panel-head"><div><h3>{inc.title}</h3><p>{inc.docNo} · {IMPACT_LABEL[inc.impact] ?? inc.impact} impact · {inc.components.map(compLabel).join(", ")}{inc.isPublic ? "" : " · internal"}</p></div>
        <div className="panel-actions"><button type="button" className="btn ghost sm" onClick={onHistory}>History</button><span className={cn("badge dot", resolved ? "good" : "warn")}>{resolved ? "Resolved" : "Open"}</span></div></div>
      <div className="ap-istep">
        {INCIDENT_STAGES.map((s, k) => { const Icon = STAGE_ICON[k]!; return <div key={s} className={cn(k < cur && "done", k === cur && "cur")}><span><Icon /></span><b>{STAGE_LABEL[s]}</b></div>; })}
      </div>
      <div className="ap-iupd">
        {inc.updates.map((u, k) => (
          <div key={u.id} className="ap-upd" style={{ ["--i" as string]: k }}><span className={cn("badge", STAGE_BADGE[u.stage])}>{STAGE_LABEL[u.stage]}</span>
            <div><p>{u.message}</p><small>{fmtWhen(u.postedAt)} PKT · posted by {u.postedBy ?? "—"}{u.updateBanner ? " · in-app banner" : ""}</small></div></div>
        ))}
      </div>
      {!resolved ? (
        <div className="ap-composer">
          <div className="row ap-wrap"><b>Post an update</b><span className="spacer" />
            <div className="seg">{INCIDENT_STAGES.map((s, k) => <button key={s} type="button" className={cn(k === stage && "active")} disabled={k < cur} onClick={() => setStage(k)}>{STAGE_LABEL[s]}</button>)}</div></div>
          <textarea rows={3} placeholder="What changed? Keep it short and human." className={cn(invalid && "ap-invalid")} value={msg} onChange={(e) => { setMsg(e.target.value); setInvalid(false); }} />
          <div className="row ap-wrap">
            <label className="check" title="Email / SMS delivery arrives with Phase 29; the choice is recorded"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email &amp; SMS subscribers</label>
            <label className="check"><input type="checkbox" checked={banner} onChange={(e) => setBanner(e.target.checked)} /> Update in-app banner</label>
            <span className="spacer" /><button type="button" className="btn primary" disabled={busy} onClick={post}><Send />{busy ? "Posting…" : "Post update"}</button>
          </div>
        </div>
      ) : (
        <div className="banner good ap-mt"><CircleCheck /><div><b>Resolved{inc.resolvedAt ? ` · ${fmtWhen(inc.resolvedAt)}` : ""}</b>
          <p>{inc.postmortemRef ? `Post-mortem: ${inc.postmortemRef}` : `Post-incident review due by ${fmtDay(inc.postmortemDueOn)}.`}</p>
          <div className="row" style={{ marginTop: 8 }}><input value={pm} placeholder="Post-mortem link or reference" onChange={(e) => setPm(e.target.value)} aria-label="Post-mortem reference" />
            <button type="button" className="btn secondary sm" disabled={busy || pm.trim().length < 3} onClick={savePm}><FileText />{inc.postmortemRef ? "Update post-mortem" : "Write post-mortem"}</button></div></div></div>
      )}
    </>
  );
}

function DeclareModal({ onClose, onDone }: { onClose: () => void; onDone: (i: Incident) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", impact: "MINOR", stage: "INVESTIGATING", message: "", comps: [] as string[], isPublic: true });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = "Give it a title";
    if (!f.message.trim()) e.message = "What are tenants seeing?";
    if (!f.comps.length) e.components = "Pick affected components";
    if (Object.keys(e).length) { setErrs(e); toast(Object.values(e)[0]!, { tone: "warn" }); return; }
    setBusy(true);
    try { onDone(await declareIncident({ title: f.title, impact: f.impact, stage: f.stage, message: f.message, components: f.comps, isPublic: f.isPublic })); }
    catch (err) { setErrs(adminFieldErrors(err)); toast(adminErrorMessage(err, "Could not declare the incident"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Declare an incident" subtitle="Creates a public incident on the status page" wide
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn danger solid" disabled={busy} onClick={submit}><Siren />{busy ? "Publishing…" : "Declare"}</button></>}>
      <div className="form-grid">
        <label className="full"><span>Title *</span><input value={f.title} maxLength={160} placeholder="e.g. Bank feed sync delayed for HBL" aria-invalid={!!errs.title} onChange={(e) => setF({ ...f, title: e.target.value })} />{errs.title && <small className="hint text-danger">{errs.title}</small>}</label>
        <label><span>Impact</span><select value={f.impact} onChange={(e) => setF({ ...f, impact: e.target.value })}>{Object.entries(IMPACT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label><span>Status</span><select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="INVESTIGATING">Investigating</option><option value="IDENTIFIED">Identified</option></select></label>
        <label className="full"><span>First update *</span><textarea rows={3} value={f.message} placeholder="What are tenants seeing?" aria-invalid={!!errs.message} onChange={(e) => setF({ ...f, message: e.target.value })} />{errs.message && <small className="hint text-danger">{errs.message}</small>}</label>
      </div>
      <div className="ap-lbl ap-mt">Components</div>
      <div className="ap-chipsel">{MAINTENANCE_COMPONENTS.map((c) => <button key={c.code} type="button" className={cn(f.comps.includes(c.code) && "on")} onClick={() => setF({ ...f, comps: f.comps.includes(c.code) ? f.comps.filter((x) => x !== c.code) : [...f.comps, c.code] })}>{c.label}</button>)}</div>
      {errs.components && <small className="hint text-danger">{errs.components}</small>}
      <label className="switch ap-mt"><input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} /><i /><span>Public (status page and in-app banner)</span></label>
    </Modal>
  );
}
