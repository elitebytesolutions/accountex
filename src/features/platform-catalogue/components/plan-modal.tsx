"use client";

import { Archive, ArchiveRestore, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { PlanFeatureInput, SubscriptionPlan } from "@/shared";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { lookupOptions } from "@/features/settings/use-lookups";
import type { LookupsResponse } from "@/shared";
import { createPlan, deletePlan, setPlanFeatures, setPlanStatus, updatePlan } from "../api";
import { MODULE_KEY_LABELS, moduleKeyLabel, rs } from "./catalogue-ui";

type Form = Record<string, string | boolean>;
type Feat = { included: boolean; addonPrice: string };
const TEXT = ["code", "name", "tagline", "priceMonthly", "priceAnnual", "extraSeatPrice", "userSeats", "storageGb", "trialDays", "sortOrder", "supportChannel", "supportResponseHours", "slaUptimePct"] as const;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

const fromPlan = (p: SubscriptionPlan | null, nextSort: number): Form =>
  p
    ? { ...Object.fromEntries(TEXT.map((k) => [k, str(p[k])])), isPublic: p.isPublic, isCustomPrice: p.isCustomPrice }
    : { ...Object.fromEntries(TEXT.map((k) => [k, ""])), trialDays: "14", sortOrder: String(nextSort), isPublic: true, isCustomPrice: false };
const featsOf = (p: SubscriptionPlan | null): Record<string, Feat> =>
  Object.fromEntries(Object.keys(MODULE_KEY_LABELS).map((k) => {
    const f = p?.features.find((x) => x.moduleKey === k);
    return [k, { included: f?.inclusion === "INCLUDED", addonPrice: f?.inclusion === "ADDON" ? str(f.addonPrice) : "" }];
  }));

/**
 * Template `#adm-edit-plan` (30-entry-admin.html): name, prices, seats, storage, trial, tagline and included modules,
 * plus what the template leaves out: code, extra-seat price, custom price, visibility, support and SLA, add-on prices,
 * History, Retire / Reactivate and Delete. A price change on a plan with subscriptions saves as a new version.
 */
export function PlanModal({ plan, nextSort, lookups, onClose, onSaved }: {
  plan: SubscriptionPlan | null;
  nextSort: number;
  lookups: LookupsResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(() => fromPlan(plan, nextSort));
  const [feats, setFeats] = useState<Record<string, Feat>>(() => featsOf(plan));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const setFeat = (k: string, v: Partial<Feat>) => setFeats((x) => ({ ...x, [k]: { ...x[k]!, ...v } }));

  const features = (): PlanFeatureInput[] => Object.entries(feats).map(([moduleKey, x]) =>
    x.included ? { moduleKey, inclusion: "INCLUDED", addonPrice: null }
      : x.addonPrice !== "" ? { moduleKey, inclusion: "ADDON", addonPrice: Number(x.addonPrice) }
        : { moduleKey, inclusion: "NOT_AVAILABLE", addonPrice: null });
  const featuresChanged = () => !plan || features().some((x) => {
    const cur = plan.features.find((c) => c.moduleKey === x.moduleKey);
    return !cur || cur.inclusion !== x.inclusion || (cur.addonPrice ?? null) !== x.addonPrice;
  });

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setErrs({});
    try { toast(await work(), { tone: "good" }); onSaved(); }
    catch (e) { setErrs(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not save the plan"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const body: Record<string, unknown> = Object.fromEntries(TEXT.map((k) => [k, s(k)]));
    body.isPublic = Boolean(f.isPublic);
    body.isCustomPrice = Boolean(f.isCustomPrice);
    if (!plan) {
      await createPlan({ ...body, features: features() });
      return `Plan ${s("name")} created`;
    }
    const res = await updatePlan(plan.id, { ...body, rowVersion: plan.rowVersion });
    if (featuresChanged()) await setPlanFeatures(res.plan.id, res.plan.rowVersion, features());
    return res.versioned ? `Price changed: ${res.plan.code} created for new sign-ups, ${plan.code} retired` : `Plan ${s("name")} updated`;
  });
  const toggleStatus = () => plan && run(async () => {
    const retire = plan.status === "ACTIVE";
    await setPlanStatus(plan.id, retire ? "retire" : "reactivate", plan.rowVersion);
    return retire ? `${plan.name} retired: no new sign-ups` : `${plan.name} is on sale again`;
  });

  const sub = plan ? `${plan.code} · ${plan.subscribers} tenant${plan.subscribers === 1 ? "" : "s"} currently subscribed${plan.status === "RETIRED" ? " · retired" : ""}` : "Pricing, seats, storage and included modules";
  return (
    <AdminRecordModal open wide onClose={onClose} busy={busy} title={plan ? `Edit plan — ${plan.name}` : "New plan"} subtitle={sub}
      history={plan ? { table: "SubscriptionPlans", id: plan.id } : null} historyLabels={{ SubscriptionPlanFeatures: "Feature", SubscriptionPlanLimits: "Limit" }}
      saveLabel={plan ? "Save plan" : "Create plan"} onSave={save}
      onDelete={plan && !plan.hasSubscriptions ? async () => { await run(async () => { await deletePlan(plan.id, plan.rowVersion); return `${plan.name} deleted`; }); } : undefined}
      deleteNote="Only a plan nobody has subscribed to, and nothing else refers to, can be deleted. Retire it instead."
      extra={plan && (
        <button type="button" className="btn secondary" disabled={busy} onClick={toggleStatus}>
          {plan.status === "ACTIVE" ? <><Archive />Retire</> : <><ArchiveRestore />Reactivate</>}
        </button>
      )}>
      <FormGrid cols={3}>
        <Field label="Plan name" required error={errs.name}><input value={s("name")} maxLength={80} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Monthly price (Rs)" required error={errs.priceMonthly}><input type="number" min={0} step="any" value={s("priceMonthly")} onChange={(e) => set("priceMonthly", e.target.value)} /></Field>
        <Field label="Annual price (Rs)" error={errs.priceAnnual}><input type="number" min={0} step="any" value={s("priceAnnual")} onChange={(e) => set("priceAnnual", e.target.value)} /></Field>
        <Field label="User seats" error={errs.userSeats} hint="Blank = unlimited"><input type="number" min={1} value={s("userSeats")} onChange={(e) => set("userSeats", e.target.value)} /></Field>
        <Field label="Storage (GB)" error={errs.storageGb} hint="Blank = unlimited"><input type="number" min={1} value={s("storageGb")} onChange={(e) => set("storageGb", e.target.value)} /></Field>
        <Field label="Trial length" error={errs.trialDays}>
          <select value={s("trialDays")} onChange={(e) => set("trialDays", e.target.value)}>
            <option value="0">No trial</option><option value="14">14 days</option><option value="30">30 days</option>
          </select>
        </Field>
        <Field label="Tagline" full error={errs.tagline}><input value={s("tagline")} maxLength={200} onChange={(e) => set("tagline", e.target.value)} /></Field>
      </FormGrid>

      <div className="form-section mt"><h4>Billing &amp; support</h4></div>
      <FormGrid cols={3}>
        <Field label="Code" required error={errs.code} hint={plan ? "Versions add _V2, _V3…" : "e.g. GROWTH"}>
          <input value={s("code")} maxLength={20} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} />
        </Field>
        <Field label="Extra seat (Rs / month)" error={errs.extraSeatPrice}><input type="number" min={0} step="any" value={s("extraSeatPrice")} onChange={(e) => set("extraSeatPrice", e.target.value)} /></Field>
        <Field label="Sort order" error={errs.sortOrder}><input type="number" min={0} value={s("sortOrder")} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
        <Field label="Support channel" error={errs.supportChannel}>
          <select value={s("supportChannel")} onChange={(e) => set("supportChannel", e.target.value)}>
            <option value="">—</option>
            {lookupOptions(lookups, "SupportChannel", s("supportChannel") || null).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Response time (hours)" error={errs.supportResponseHours}><input type="number" min={1} value={s("supportResponseHours")} onChange={(e) => set("supportResponseHours", e.target.value)} /></Field>
        <Field label="SLA uptime (%)" error={errs.slaUptimePct} hint="90 to 100"><input type="number" min={90} max={100} step="0.01" value={s("slaUptimePct")} onChange={(e) => set("slaUptimePct", e.target.value)} /></Field>
      </FormGrid>
      <div className="row mt" style={{ gap: 24, flexWrap: "wrap" }}>
        <Switch label="Public (shown on the pricing page)" checked={Boolean(f.isPublic)} onChange={(e) => set("isPublic", e.target.checked)} />
        <Switch label="Custom price (quoted per customer)" checked={Boolean(f.isCustomPrice)} onChange={(e) => set("isCustomPrice", e.target.checked)} />
      </div>

      <div className="form-section mt"><h4>Included modules</h4></div>
      <div className="grid-3">
        {Object.keys(MODULE_KEY_LABELS).map((k) => (
          <div key={k} className="stack" style={{ gap: 6 }}>
            <Switch label={moduleKeyLabel(k)} checked={feats[k]!.included} onChange={(e) => setFeat(k, { included: e.target.checked })} />
            {!feats[k]!.included && (
              <label className="small muted row" style={{ gap: 6 }}>
                Add-on Rs
                <input type="number" min={0} step="any" placeholder="not sold" style={{ height: 30, width: 110 }} value={feats[k]!.addonPrice} onChange={(e) => setFeat(k, { addonPrice: e.target.value })} aria-label={`${moduleKeyLabel(k)} add-on price`} />
              </label>
            )}
          </div>
        ))}
      </div>

      {plan && (
        <div className={`banner ${plan.hasSubscriptions ? "warn" : "info"} mt`}>
          <TriangleAlert />
          <div>
            <b>Grandfathering</b>
            <p>
              {plan.hasSubscriptions
                ? `Changing the price creates a new version of this plan for new sign-ups; the ${plan.subscribers} current subscriber${plan.subscribers === 1 ? "" : "s"} keep ${rs(plan.priceMonthly)} / month on ${plan.code}, which is retired.`
                : "Nobody has subscribed to this plan yet, so changes apply to it directly."}
            </p>
          </div>
        </div>
      )}
    </AdminRecordModal>
  );
}
