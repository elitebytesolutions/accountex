"use client";

import { ArrowRight, History, MessageSquarePlus, Pencil, Plus, Rocket, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LEAD_LOG_TYPES, LEAD_SOURCES, LeadCreateSchema, leadErrors, type LeadDetail, type LookupsResponse, type PartnerOption, type SubscriptionPlan } from "@/shared";
import { Modal } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { listPartnerOptions, listPlans } from "@/features/platform-catalogue/api";
import { labelOf } from "@/features/settings/use-lookups";
import { addLeadActivity, createLead, getLead, updateLead } from "../api";
import { CITIES, dateTime } from "./growth-ui";

type F = {
  companyName: string; contactPerson: string; phone: string; email: string; city: string; source: string; partnerId: string; ownerStaffId: string;
  planInterestId: string; expectedMrr: string; notes: string; demoAt: string; trialEngagementScore: string;
};
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");

/**
 * Template "New lead" modal (9B newLead): company, contact, phone, city, source, owner, plan interest (sets the
 * expected MRR), notes. An existing lead adds email, partner, demo time, trial engagement, its activity log and History.
 */
export function LeadModal({ id, staff, lookups, onClose, onSaved }: {
  id: string | null; staff: { id: string; name: string }[]; lookups: LookupsResponse; onClose: () => void; onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [f, setF] = useState<F>({
    companyName: "", contactPerson: "", phone: "", email: "", city: "Lahore", source: "WEBSITE", partnerId: "", ownerStaffId: staff[0]?.id ?? "",
    planInterestId: "", expectedMrr: "", notes: "", demoAt: "", trialEngagementScore: "",
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"details" | "activity" | "history">("details");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState({ activityType: "NOTE", note: "" });
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    void listPlans().then((p) => {
      const active = p.filter((x) => x.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder);
      setPlans(active);
      if (!id) {
        const growth = active.find((x) => x.code.startsWith("GROWTH")) ?? active[0];
        if (growth) setF((x) => (x.planInterestId ? x : { ...x, planInterestId: growth.id, expectedMrr: String(growth.priceMonthly) }));
      }
    }).catch(() => undefined);
    void listPartnerOptions().then(setPartners).catch(() => undefined);
  }, [id]);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getLead(id).then((l) => {
      if (cancelled) return;
      setLead(l);
      setF({
        companyName: l.companyName, contactPerson: l.contactPerson ?? "", phone: l.phone ?? "", email: l.email ?? "", city: l.city ?? "", source: l.source,
        partnerId: l.partnerId ?? "", ownerStaffId: l.ownerStaffId, planInterestId: l.planInterestId ?? "", expectedMrr: String(l.expectedMrr), notes: l.notes ?? "",
        demoAt: toLocal(l.demoAt), trialEngagementScore: l.trialEngagementScore === null ? "" : String(l.trialEngagementScore),
      });
    }).catch((e: unknown) => { toast(adminErrorMessage(e, "Could not load the lead"), { tone: "danger" }); closeRef.current(); });
    return () => { cancelled = true; };
  }, [id, toast]);

  const set = <K extends keyof F>(k: K, v: F[K]) => { setErrs((e) => { const n = { ...e }; delete n[k]; return n; }); setF((x) => ({ ...x, [k]: v })); };
  const body = () => ({
    companyName: f.companyName, contactPerson: f.contactPerson, phone: f.phone, email: f.email, city: f.city, source: f.source,
    partnerId: f.source === "PARTNER" ? f.partnerId : null, ownerStaffId: f.ownerStaffId, planInterestId: f.planInterestId || null,
    expectedMrr: f.expectedMrr === "" ? 0 : Number(f.expectedMrr), notes: f.notes,
    demoAt: f.demoAt ? new Date(f.demoAt).toISOString() : null, trialEngagementScore: f.trialEngagementScore,
  });

  const save = async () => {
    const parsed = LeadCreateSchema.safeParse(body());
    const e: Record<string, string> = { ...leadErrors(body()) };
    if (!parsed.success) for (const i of parsed.error.issues) { const k = String(i.path[0]); if (!e[k]) e[k] = i.message; }
    if (Object.keys(e).length) { setErrs(e); toast("Fix the highlighted fields", { tone: "warn" }); return; }
    setBusy(true);
    try {
      const saved = lead ? await updateLead(lead.id, { ...body(), rowVersion: lead.rowVersion }) : await createLead(body());
      toast(lead ? `${saved.companyName} saved` : `${saved.companyName} added to leads · assigned to ${saved.ownerName}`, { tone: "good" });
      onSaved(saved.id);
      onClose();
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the lead"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  const addLog = async () => {
    if (!lead || log.note.trim().length < 2) { toast("Write the note first", { tone: "warn" }); return; }
    setBusy(true);
    try { setLead(await addLeadActivity(lead.id, { activityType: log.activityType, note: log.note.trim() })); setLog({ ...log, note: "" }); toast("Activity logged", { tone: "good" }); }
    catch (e) { toast(adminErrorMessage(e, "Could not log the activity"), { tone: "danger" }); }
    finally { setBusy(false); }
  };

  const err = (k: keyof F) => errs[k] && <small className="hint text-danger">{errs[k]}</small>;
  const loading = id && !lead;
  const title = id ? lead?.companyName ?? "Lead" : "New lead";
  const sub = id ? (lead ? `${labelOf(lookups, "PlatformLeadStage", lead.stage)} · owner ${lead.ownerName}${lead.tenantName ? ` · onboarded as ${lead.tenantName}` : ""}` : "Loading…") : "Lands in the Lead column";

  return (
    <Modal open onClose={onClose} title={title} subtitle={sub} wide
      foot={tab !== "details" ? <button type="button" className="btn secondary" onClick={() => setTab("details")}><Pencil />Back to details</button> : (
        <>
          {lead && <button type="button" className="btn ghost" onClick={() => setTab("activity")}><MessageSquarePlus />Activity</button>}
          {lead && <button type="button" className="btn ghost" onClick={() => setTab("history")}><History />History</button>}
          <span className="spacer" />
          {lead && !lead.tenantId && <Link className="btn secondary" href={`/admin/leads/${lead.id}/convert`}><Rocket />Onboard</Link>}
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy || !!loading} onClick={save}>{busy ? "Saving…" : lead ? <><Save />Save lead</> : <><Plus />Add lead</>}</button>
        </>
      )}>
      {loading ? <Skeleton style={{ height: 320, borderRadius: 14 }} /> : tab === "history" && lead ? (
        <AdminHistoryTab table="PlatformLeads" id={lead.id} />
      ) : tab === "activity" && lead ? (
        <div className="stack">
          <div className="form-grid">
            <label><span>Type</span><select value={log.activityType} onChange={(e) => setLog({ ...log, activityType: e.target.value })}>{LEAD_LOG_TYPES.map((t) => <option key={t} value={t}>{labelOf(lookups, "PlatformLeadActivityType", t)}</option>)}</select></label>
            <label className="full"><span>Note</span><textarea rows={2} value={log.note} maxLength={2000} placeholder="Called the owner; demo moved to Friday…" onChange={(e) => setLog({ ...log, note: e.target.value })} /></label>
          </div>
          <div className="row"><span className="spacer" /><button type="button" className="btn primary sm" disabled={busy} onClick={addLog}><Plus />Log activity</button></div>
          <div className="list">
            {lead.activities.map((a) => (
              <div key={a.id} className="list-item">
                <span className="icon-well">{a.activityType === "STAGE_CHANGE" ? <ArrowRight /> : <MessageSquarePlus />}</span>
                <div><b>{a.activityType === "STAGE_CHANGE" ? `${labelOf(lookups, "PlatformLeadStage", a.fromStage)} → ${labelOf(lookups, "PlatformLeadStage", a.toStage)}` : labelOf(lookups, "PlatformLeadActivityType", a.activityType)}</b>
                  <small>{a.staffName ?? "System"} · {dateTime(a.occurredAt)}</small>{a.note && <p className="small">{a.note}</p>}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="form-grid">
          <label><span>Company *</span><input value={f.companyName} maxLength={160} placeholder="e.g. Sargodha Citrus Exports" aria-invalid={!!errs.companyName} onChange={(e) => set("companyName", e.target.value)} />{err("companyName")}</label>
          <label><span>Contact person</span><input value={f.contactPerson} maxLength={120} placeholder="e.g. Waqas Ahmed" onChange={(e) => set("contactPerson", e.target.value)} /></label>
          <label><span>Phone</span><input value={f.phone} maxLength={40} placeholder="0300 1234567" onChange={(e) => set("phone", e.target.value)} /></label>
          <label><span>City</span><select value={f.city} onChange={(e) => set("city", e.target.value)}>{(CITIES.includes(f.city) || !f.city ? CITIES : [f.city, ...CITIES]).map((c) => <option key={c}>{c}</option>)}</select></label>
          <label><span>Source</span><select value={f.source} onChange={(e) => set("source", e.target.value)}>{LEAD_SOURCES.map((s) => <option key={s} value={s}>{labelOf(lookups, "PlatformLeadSource", s)}</option>)}</select></label>
          <label><span>Owner</span><select value={f.ownerStaffId} aria-invalid={!!errs.ownerStaffId} onChange={(e) => set("ownerStaffId", e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{err("ownerStaffId")}</label>
          {f.source === "PARTNER" && (
            <label><span>Partner *</span><select value={f.partnerId} aria-invalid={!!errs.partnerId} onChange={(e) => set("partnerId", e.target.value)}><option value="">Choose…</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{err("partnerId")}</label>
          )}
          <label><span>Plan interest</span>
            <select value={f.planInterestId} onChange={(e) => { const p = plans.find((x) => x.id === e.target.value); set("planInterestId", e.target.value); if (p) set("expectedMrr", String(p.priceMonthly)); }}>
              <option value="">Not sure yet</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label><span>Expected MRR (Rs)</span><input type="number" min={0} value={f.expectedMrr} aria-invalid={!!errs.expectedMrr} onChange={(e) => set("expectedMrr", e.target.value)} />{err("expectedMrr")}</label>
          {lead && <>
            <label><span>Email</span><input type="email" value={f.email} maxLength={160} aria-invalid={!!errs.email} onChange={(e) => set("email", e.target.value)} />{err("email")}</label>
            <label><span>Demo</span><input type="datetime-local" value={f.demoAt} onChange={(e) => set("demoAt", e.target.value)} /></label>
            <label><span>Trial engagement (0–100)</span><input type="number" min={0} max={100} value={f.trialEngagementScore} aria-invalid={!!errs.trialEngagementScore} onChange={(e) => set("trialEngagementScore", e.target.value)} />{err("trialEngagementScore")}</label>
          </>}
          <label className="full"><span>Notes</span><textarea rows={2} value={f.notes} maxLength={2000} placeholder="Pain points, current software (Tally, QuickBooks, Excel)…" onChange={(e) => set("notes", e.target.value)} /></label>
        </div>
      )}
    </Modal>
  );
}
