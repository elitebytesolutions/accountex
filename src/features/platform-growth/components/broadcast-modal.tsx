"use client";

import { Building2, Check, CreditCard, Gem, Hourglass, ListChecks, MapPin, RadioTower, Sprout, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { BROADCAST_CHANNELS, type BroadcastResult, type CommTemplate, type ConfigTenantOption, type Segment, type SubscriptionPlan } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { listPlans } from "@/features/platform-catalogue/api";
import { listConfigTenants, listSegments } from "@/features/platform-config/api";
import { listCommTemplates } from "@/features/platform-templates/api";
import { lookupOptions } from "@/features/settings/use-lookups";
import { rs } from "@/features/platform-tenants/components/tenant-ui";
import { sendBroadcast } from "../api";
import { fmt } from "./growth-ui";

const AUD: [string, string, LucideIcon][] = [
  ["ALL_ACTIVE", "All active tenants", Building2], ["TRIALS", "Trials", Hourglass], ["PAST_DUE", "Past due", CreditCard], ["PLAN", "A plan", Sprout],
  ["REGION", "A region", MapPin], ["ENTERPRISE_OWNERS", "Enterprise owners", Gem], ["SEGMENT", "A segment", Users], ["SELECTED_TENANTS", "Selected companies", ListChecks],
];
const CH: Record<string, string> = { EMAIL: "Email", SMS: "SMS", WHATSAPP: "WhatsApp", IN_APP: "In-app" };

/**
 * Template "Broadcast to a segment" modal (9B broadcast()): audience cards, template, language, channels and the
 * live estimate (a preview call counts the recipients). Sending writes the log: In-app is delivered to each company's
 * admins at once; email / SMS / WhatsApp are queued until delivery exists (Phase 29).
 */
export function BroadcastModal({ preset, onClose, onSent }: {
  preset?: { audience: string; tenantIds?: string[]; label?: string };
  onClose: () => void;
  onSent: (r: BroadcastResult) => void;
}) {
  const toast = useToast();
  const lookups = useAdminLookups(["Province", "TenantBroadcastAudience", "LanguageMode"]);
  const [templates, setTemplates] = useState<CommTemplate[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tenants, setTenants] = useState<ConfigTenantOption[]>([]);
  const [f, setF] = useState({
    audience: preset?.audience ?? "ALL_ACTIVE", audienceValue: "", segmentId: "", tenantIds: new Set(preset?.tenantIds ?? []),
    commTemplateId: "", subject: "", messageOverride: "", languageMode: "TENANT_PREFERENCE", channels: new Set(["IN_APP", "EMAIL"]),
  });
  const [est, setEst] = useState<BroadcastResult | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<BroadcastResult | null>(null);

  useEffect(() => {
    void listCommTemplates().then((t) => { const act = t.filter((x) => x.isActive); setTemplates(act); setF((x) => (x.commTemplateId || !act.length ? x : { ...x, commTemplateId: (act.find((a) => a.code === "MAINTENANCE") ?? act[0])!.id })); }).catch(() => undefined);
    void listPlans().then((p) => setPlans(p.filter((x) => x.status === "ACTIVE"))).catch(() => undefined);
    void listSegments().then(setSegments).catch(() => undefined);
    void listConfigTenants().then(setTenants).catch(() => undefined);
  }, []);

  const body = (preview: boolean) => ({
    audience: f.audience, audienceValue: f.audienceValue || null, segmentId: f.segmentId || null, tenantIds: [...f.tenantIds],
    commTemplateId: f.commTemplateId || null, subject: f.subject || null, messageOverride: f.messageOverride || null, languageMode: f.languageMode,
    channels: [...f.channels], preview,
  });
  const key = JSON.stringify(body(true));
  const missing = !f.commTemplateId && !f.messageOverride.trim() ? "Choose a template or write the message" : null;
  useEffect(() => {
    if (done || missing) return;
    let cancelled = false;
    const t = setTimeout(() => {
      sendBroadcast(JSON.parse(key) as Record<string, unknown>)
        .then((r) => !cancelled && setEst(r))
        .catch((e: unknown) => !cancelled && setEst({ error: Object.values(adminFieldErrors(e))[0] || adminErrorMessage(e, "Could not count the recipients") }));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [key, done, missing]);

  const send = async () => {
    if (!f.channels.size) { toast("Pick at least one channel", { tone: "warn" }); return; }
    setBusy(true);
    try {
      const r = await sendBroadcast(body(false));
      setDone(r); onSent(r);
      toast(`Broadcast sent to ${fmt(r.recipients)} recipient${r.recipients === 1 ? "" : "s"} · ${r.delivered} in-app delivered, ${r.queued} queued`, { tone: "good" });
    } catch (e) { toast(adminErrorMessage(e, "Could not send the broadcast"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const flip = (set: Set<string>, v: string) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  return (
    <Modal open onClose={onClose} title="Broadcast to a segment" subtitle={preset?.label ?? "Owners and admins of each tenant"} wide
      foot={done ? <button type="button" className="btn primary" onClick={onClose}><Check />Done</button> : <><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || !!missing || !est || "error" in est} onClick={send}><RadioTower />{busy ? "Sending…" : "Send broadcast"}</button></>}>
      <div className="ap-lbl">Segment</div>
      <div className="radio-cards ap-segs">
        {AUD.map(([k, l, Icon]) => (
          <label key={k} className="radio-card"><input type="radio" name="seg" checked={f.audience === k} onChange={() => setF((x) => ({ ...x, audience: k, audienceValue: "" }))} />
            <span className="icon-well"><Icon /></span><div><b>{l}</b><small>{f.audience === k && est && !("error" in est) ? `${est.companies} tenant${est.companies === 1 ? "" : "s"}` : " "}</small></div></label>
        ))}
      </div>
      <div className="form-grid ap-mt">
        {f.audience === "PLAN" && <label><span>Plan</span><select value={f.audienceValue} onChange={(e) => setF({ ...f, audienceValue: e.target.value })}><option value="">Choose…</option>{plans.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}</select></label>}
        {f.audience === "REGION" && <label><span>Province</span><select value={f.audienceValue} onChange={(e) => setF({ ...f, audienceValue: e.target.value })}><option value="">Choose…</option>{lookupOptions(lookups, "Province").map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>}
        {f.audience === "SEGMENT" && <label><span>Segment</span><select value={f.segmentId} onChange={(e) => setF({ ...f, segmentId: e.target.value })}><option value="">Choose…</option>{segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        {f.audience === "SELECTED_TENANTS" && (
          <div className="field full"><span>Companies</span>
            <div className="row" style={{ flexWrap: "wrap", gap: 10, maxHeight: 140, overflow: "auto" }}>
              {tenants.map((t) => <label key={t.id} className="check"><input type="checkbox" checked={f.tenantIds.has(t.id)} onChange={() => setF((x) => ({ ...x, tenantIds: flip(x.tenantIds, t.id) }))} /> {t.name}</label>)}
            </div></div>
        )}
        <label><span>Template</span><select value={f.commTemplateId} onChange={(e) => setF({ ...f, commTemplateId: e.target.value })}><option value="">No template (write the message)</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label><span>Language</span><select value={f.languageMode} onChange={(e) => setF({ ...f, languageMode: e.target.value })}>{["TENANT_PREFERENCE", "EN", "UR"].map((m) => <option key={m} value={m}>{lookupOptions(lookups, "LanguageMode", m).find((o) => o.code === m)?.label ?? m}</option>)}</select></label>
        <label><span>Send</span><select disabled><option>Now</option></select></label>
        <div className="field"><span>Channels</span><div className="row ap-wrap ap-chk">{BROADCAST_CHANNELS.map((c) => <label key={c} className="check"><input type="checkbox" checked={f.channels.has(c)} onChange={() => setF((x) => ({ ...x, channels: flip(x.channels, c) }))} /> {CH[c]}</label>)}</div></div>
        {!f.commTemplateId && <label className="full"><span>Subject</span><input value={f.subject} maxLength={200} placeholder="Message from Accountex" onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>}
        <label className="full"><span>{f.commTemplateId ? "Message override (optional)" : "Message *"}</span><textarea rows={3} value={f.messageOverride} maxLength={2000} placeholder={f.commTemplateId ? "Leave empty to send the template's message" : "Write the message…"} onChange={(e) => setF({ ...f, messageOverride: e.target.value })} /></label>
      </div>
      <div className={cn("ap-bc-est")}>
        <Users />
        {missing ? <span className="text-danger">{missing}</span> : !est ? <span>Counting recipients…</span> : "error" in est ? <span className="text-danger">{est.error}</span> : (
          <span>About <b>{fmt(est.recipients)}</b> message{est.recipients === 1 ? "" : "s"} to <b>{fmt(est.companies)}</b> compan{est.companies === 1 ? "y" : "ies"} across <b>{f.channels.size}</b> channel{f.channels.size === 1 ? "" : "s"}
            {est.byChannel.some((c) => c.skipped) && <> · {est.byChannel.filter((c) => c.skipped).map((c) => `${c.skipped} without ${CH[c.channel]}`).join(", ")}</>} · SMS cost ≈ <b>{rs(est.estimatedSmsCost)}</b></span>
        )}
      </div>
      {done && <p className="small mt"><b className="ap-good-t">Broadcast sent</b> · {done.delivered} in-app delivered · {done.queued} queued for email / SMS / WhatsApp (Phase 29) · the rows are in the delivery log.</p>}
    </Modal>
  );
}
