"use client";

import { Bell, BellPlus, Gauge, HardDrive, Mail, MessageSquareOff, Plus, Tags, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { UsageAlertRule, UsageAlertRuleOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { UsageMetering } from "@/features/platform-tenants/components/usage-metering";
import { ApiError } from "@/lib/api/errors";
import { createUsageAlertRule, deleteUsageAlertRule, listUsageAlertRules, setUsageAlertRuleEnabled, updateUsageAlertRule, usageAlertRuleOptions } from "../api";

const ACTIONS: { code: string; label: string; icon: React.ElementType }[] = [
  { code: "NOTIFY_ACCOUNT_MANAGER", label: "Notify account manager", icon: Bell },
  { code: "EMAIL_OWNER", label: "Email tenant owner", icon: Mail },
  { code: "THROTTLE", label: "Throttle", icon: Gauge },
  { code: "BLOCK", label: "Block usage", icon: MessageSquareOff },
  { code: "OFFER_ADDON", label: "Offer add-on in-app", icon: HardDrive },
];
const actionOf = (c: string) => ACTIONS.find((a) => a.code === c) ?? ACTIONS[0]!;
const condition = (r: Pick<UsageAlertRule, "usageMeterName" | "thresholdPct" | "planName">) => `${r.usageMeterName ?? "Any meter"} ≥ ${r.thresholdPct}%${r.planName ? ` on ${r.planName}` : ""}`;
const actionText = (r: Pick<UsageAlertRule, "action" | "throttleRps" | "offerAddonName" | "actionDetail">) =>
  [r.action === "THROTTLE" ? `Throttle to ${r.throttleRps} req/s` : r.action === "OFFER_ADDON" ? `Offer ${r.offerAddonName ?? "add-on"} in-app` : actionOf(r.action).label, r.actionDetail].filter(Boolean).join(" · ");

type Form = { usageMeterId: string; thresholdPct: number; planId: string; action: string; throttleRps: string; offerAddonId: string; actionDetail: string; evalIntervalMinutes: number; isEnabled: boolean };
const blank: Form = { usageMeterId: "", thresholdPct: 90, planId: "", action: "NOTIFY_ACCOUNT_MANAGER", throttleRps: "", offerAddonId: "", actionDetail: "", evalIntervalMinutes: 15, isEnabled: true };

/**
 * Template admin/usage (3A-admin-plus.html, 9B-admin-plus.js ~1204): KPIs, per-tenant meters, top consumers and the
 * override modal are usage metering (Phase 40, UsageMetering from platform-tenants); the "Alert rules" panel and the
 * "New alert rule" modal (meter, threshold slider, plans, action, live sentence) are Phase 39.
 */
export function UsageScreen() {
  const toast = useToast();
  const [rules, setRules] = useState<UsageAlertRule[] | null>(null);
  const [opts, setOpts] = useState<UsageAlertRuleOptions>({ meters: [], plans: [], addons: [] });
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<UsageAlertRule | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listUsageAlertRules(), usageAlertRuleOptions()])
      .then(([r, o]) => { if (!cancelled) { setRules(r); setOpts(o); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load alert rules" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const open = (r: UsageAlertRule | "new") => {
    setErrors({});
    setForm(r === "new" ? blank : { usageMeterId: r.usageMeterId ?? "", thresholdPct: r.thresholdPct, planId: r.planId ?? "", action: r.action, throttleRps: r.throttleRps ? String(r.throttleRps) : "", offerAddonId: r.offerAddonId ?? "", actionDetail: r.actionDetail ?? "", evalIntervalMinutes: r.evalIntervalMinutes, isEnabled: r.isEnabled });
    setEdit(r);
  };
  const save = async () => {
    setBusy(true);
    const body = { ...form, usageMeterId: form.usageMeterId || null, planId: form.planId || null, offerAddonId: form.offerAddonId || null, throttleRps: form.throttleRps || null, actionDetail: form.actionDetail || null };
    try {
      if (edit === "new") await createUsageAlertRule(body);
      else if (edit) await updateUsageAlertRule(edit.id, { ...body, rowVersion: edit.rowVersion });
      toast(edit === "new" ? "Alert rule created" : "Alert rule saved", { tone: "good" });
      setEdit(null); reload();
    } catch (e) {
      setErrors(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the rule"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  const toggle = async (r: UsageAlertRule, on: boolean) => {
    try { await setUsageAlertRuleEnabled(r.id, on, r.rowVersion); toast(`Rule ${on ? "enabled" : "paused"}: ${condition(r)}`, { tone: on ? "good" : "warn", ms: 2000 }); reload(); }
    catch (e) { toast(adminErrorMessage(e, "Could not update the rule"), { tone: "danger" }); }
  };

  const meterName = opts.meters.find((m) => m.id === form.usageMeterId)?.name ?? "any meter";
  const planName = opts.plans.find((p) => p.id === form.planId)?.name ?? "all plans";
  const addonName = opts.addons.find((a) => a.id === form.offerAddonId)?.name;

  return (
    <>
      <PageHead eyebrow="Billing / Usage & Quotas" title="Usage & Quotas" description="Metered usage against plan limits for every tenant. Bars turn amber at 80%, red at 100% and striped when over."
        actions={<>
          <Link className="btn secondary" href="/admin/plans"><Tags />Plan limits</Link>
          <button type="button" className="btn primary" onClick={() => open("new")}><BellPlus />New alert rule</button>
        </>} />

      {/* Phase 40: KPIs, per-tenant meters, top consumers (platform-tenants); Phase 39: the alert rules panel. */}
      <UsageMetering rulesPanel={
        <div className="panel">
          <div className="panel-head"><div><h3>Alert rules</h3><p>Evaluated every {rules?.[0]?.evalIntervalMinutes ?? 15} minutes against live meters</p></div>
            <div className="panel-actions"><button type="button" className="btn secondary sm" onClick={() => open("new")}><Plus />Rule</button></div></div>
          {error ? <ErrorState message={error.message} reference={error.reference} onRetry={reload} /> : !rules ? <Skeleton style={{ height: 120 }} /> : rules.length === 0 ? (
            <EmptyState icon={<Bell />} title="No alert rules" description="Add a rule to notify, throttle, block or upsell when a tenant nears a limit." action={<button type="button" className="btn primary sm" onClick={() => open("new")}><Plus />New alert rule</button>} />
          ) : (
            <div className="ap-rules">
              {rules.map((r, i) => {
                const Icon = actionOf(r.action).icon;
                return <div key={r.id} className={cn("ap-rule", r.isEnabled && "on")} style={{ ["--i" as string]: i }}>
                  <span className={cn("icon-well", !r.isEnabled && "neutral")}><Icon /></span>
                  <div role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => open(r)} onKeyDown={(e) => e.key === "Enter" && open(r)}><b>{condition(r)}</b><small>{actionText(r)}</small></div>
                  <label className="switch"><input type="checkbox" checked={r.isEnabled} aria-label={`Rule ${condition(r)}`} onChange={(e) => void toggle(r, e.target.checked)} /><i /></label>
                </div>;
              })}
            </div>
          )}
        </div>
      } />

      <AdminRecordModal open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New alert rule" : "Edit alert rule"} subtitle="Runs against live meters once usage metering is on"
        history={edit && edit !== "new" ? { table: "UsageAlertRules", id: edit.id } : null} busy={busy} saveLabel={edit === "new" ? "Create rule" : "Save rule"} saveIcon={edit === "new" ? <BellPlus /> : undefined} onSave={save}
        onDelete={edit && edit !== "new" ? async () => { try { await deleteUsageAlertRule(edit.id); toast("Alert rule deleted", { tone: "warn" }); setEdit(null); reload(); } catch (e) { toast(adminErrorMessage(e, "Could not delete the rule"), { tone: "danger" }); } } : undefined}
        deleteNote="The rule stops firing. Its history is kept.">
        <div className="form-grid">
          <label><span>Meter</span><select value={form.usageMeterId} onChange={(e) => setForm({ ...form, usageMeterId: e.target.value })}><option value="">Any meter</option>{opts.meters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label><span>Threshold</span><div className="ap-range"><input type="range" min={50} max={150} step={5} value={form.thresholdPct} onChange={(e) => setForm({ ...form, thresholdPct: Number(e.target.value) })} /><b>{form.thresholdPct}%</b></div>{errors.thresholdPct && <small className="hint text-danger">{errors.thresholdPct}</small>}</label>
          <label><span>Plans</span><select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}><option value="">All plans</option>{opts.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label><span>Action</span><select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>{ACTIONS.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}</select></label>
          {form.action === "THROTTLE" && <label><span>Throttle to (req/s) *</span><input type="number" min={1} value={form.throttleRps} onChange={(e) => setForm({ ...form, throttleRps: e.target.value })} aria-invalid={!!errors.throttleRps} />{errors.throttleRps && <small className="hint text-danger">{errors.throttleRps}</small>}</label>}
          {form.action === "OFFER_ADDON" && <label><span>Add-on to offer *</span><select value={form.offerAddonId} onChange={(e) => setForm({ ...form, offerAddonId: e.target.value })} aria-invalid={!!errors.offerAddonId}><option value="">Choose an add-on…</option>{opts.addons.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{errors.offerAddonId && <small className="hint text-danger">{errors.offerAddonId}</small>}</label>}
          <label><span>Evaluate every (minutes)</span><input type="number" min={1} max={1440} value={form.evalIntervalMinutes} onChange={(e) => setForm({ ...form, evalIntervalMinutes: Number(e.target.value) })} /></label>
          <label className="full"><span>Detail</span><input value={form.actionDetail} maxLength={300} placeholder="e.g. Slack #cs-alerts, with upgrade link (EN/UR)" onChange={(e) => setForm({ ...form, actionDetail: e.target.value })} /></label>
        </div>
        <div className="ap-rule-say"><Zap /><span>When <b>{meterName.toLowerCase()}</b> reaches <b>{form.thresholdPct}%</b> for <b>{planName.toLowerCase()}</b> → <b>{form.action === "THROTTLE" ? `throttle to ${form.throttleRps || "…"} req/s` : form.action === "OFFER_ADDON" ? `offer ${addonName ?? "an add-on"} in-app` : actionOf(form.action).label.toLowerCase()}</b>.</span></div>
      </AdminRecordModal>
    </>
  );
}
