"use client";

import { Power, PowerOff } from "lucide-react";
import { useState } from "react";
import type { Addon, AddonPlanInput, LookupsResponse, PlatformModule, SubscriptionPlan } from "@/shared";
import { Field, FormGrid } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { lookupOptions } from "@/features/settings/use-lookups";
import { createAddon, deleteAddon, setAddonActive, setAddonPlans, updateAddon } from "../api";
import { CATALOGUE_ICONS, PlanPill } from "./catalogue-ui";

type Form = Record<string, string>;
const TEXT = ["code", "name", "icon", "price", "billingUnit", "usagePrice", "usageUnit", "note", "platformModuleId"] as const;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * Add-on add / edit modal (template style: the template's add-ons panel only edits prices). Price and billing unit,
 * an optional usage price, the module it unlocks and availability per plan (available / included / not available).
 */
export function AddonModal({ addon, plans, modules, lookups, onClose, onSaved }: {
  addon: Addon | null;
  plans: SubscriptionPlan[];
  modules: PlatformModule[];
  lookups: LookupsResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(() => addon
    ? Object.fromEntries(TEXT.map((k) => [k, str(addon[k])]))
    : { ...Object.fromEntries(TEXT.map((k) => [k, ""])), billingUnit: "MONTH" });
  const [avail, setAvail] = useState<Record<string, string>>(() =>
    Object.fromEntries(plans.map((p) => [p.id, addon?.plans.find((x) => x.planId === p.id)?.availability ?? "AVAILABLE"])));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const s = (k: string) => f[k] ?? "";
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setErrs({});
    try { toast(await work(), { tone: "good" }); onSaved(); }
    catch (e) { setErrs(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not save the add-on"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const planRows = () => plans.map((p) => ({ planId: p.id, availability: (avail[p.id] ?? "AVAILABLE") as AddonPlanInput["availability"] }));
  const save = () => run(async () => {
    const body: Record<string, unknown> = Object.fromEntries(TEXT.map((k) => [k, s(k)]));
    if (!addon) {
      await createAddon({ ...body, plans: planRows() });
      return `Add-on ${s("name")} created`;
    }
    const saved = await updateAddon(addon.id, { ...body, rowVersion: addon.rowVersion });
    const changed = plans.some((p) => (addon.plans.find((x) => x.planId === p.id)?.availability ?? "AVAILABLE") !== avail[p.id]);
    if (changed) await setAddonPlans(addon.id, saved.rowVersion, planRows());
    return `Add-on ${s("name")} saved`;
  });

  return (
    <AdminRecordModal open wide onClose={onClose} busy={busy} title={addon ? `Edit add-on — ${addon.name}` : "New add-on"}
      subtitle="Sold on top of a plan. Prices in PKR, excluding sales tax."
      history={addon ? { table: "Addons", id: addon.id } : null} historyLabels={{ AddonPlans: "Plan availability" }}
      saveLabel={addon ? "Save add-on" : "Create add-on"} onSave={save}
      onDelete={addon ? async () => { await run(async () => { await deleteAddon(addon.id, addon.rowVersion); return `${addon.name} deleted`; }); } : undefined}
      deleteNote="Only an add-on no tenant, invoice or alert rule uses can be deleted. Deactivate it instead."
      extra={addon && (
        <button type="button" className="btn secondary" disabled={busy} onClick={() => run(async () => { await setAddonActive(addon.id, !addon.isActive, addon.rowVersion); return `${addon.name} ${addon.isActive ? "deactivated" : "activated"}`; })}>
          {addon.isActive ? <><PowerOff />Deactivate</> : <><Power />Activate</>}
        </button>
      )}>
      <FormGrid cols={3}>
        <Field label="Name" required error={errs.name}><input value={s("name")} maxLength={80} placeholder="e.g. POS terminal" onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Code" required error={errs.code}><input value={s("code")} maxLength={40} placeholder="e.g. POS_TERMINAL" onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} /></Field>
        <Field label="Icon" error={errs.icon}>
          <select value={s("icon")} onChange={(e) => set("icon", e.target.value)}>
            <option value="">Default</option>
            {Object.keys(CATALOGUE_ICONS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Price (Rs)" required error={errs.price}><input type="number" min={0} step="any" value={s("price")} onChange={(e) => set("price", e.target.value)} /></Field>
        <Field label="Billed per" error={errs.billingUnit}>
          <select value={s("billingUnit")} onChange={(e) => set("billingUnit", e.target.value)}>
            {lookupOptions(lookups, "BillingUnit", s("billingUnit")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Unlocks module" error={errs.platformModuleId}>
          <select value={s("platformModuleId")} onChange={(e) => set("platformModuleId", e.target.value)}>
            <option value="">—</option>
            {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Usage price (Rs)" error={errs.usagePrice} hint="Optional, e.g. 1.20"><input type="number" min={0} step="any" value={s("usagePrice")} onChange={(e) => set("usagePrice", e.target.value)} /></Field>
        <Field label="Usage unit" error={errs.usageUnit} hint="e.g. message"><input value={s("usageUnit")} maxLength={40} onChange={(e) => set("usageUnit", e.target.value)} /></Field>
        <Field label="Note" error={errs.note} hint="e.g. Included from Business"><input value={s("note")} maxLength={200} onChange={(e) => set("note", e.target.value)} /></Field>
      </FormGrid>
      <div className="form-section mt"><h4>Availability by plan</h4></div>
      {!plans.length ? <p className="muted small">No active plans yet.</p> : (
        <FormGrid cols={3}>
          {plans.map((p) => (
            <label key={p.id}>
              <span><PlanPill plan={p} /></span>
              <select value={avail[p.id] ?? "AVAILABLE"} onChange={(e) => setAvail((x) => ({ ...x, [p.id]: e.target.value }))} aria-label={`${p.name} availability`}>
                {lookupOptions(lookups, "Availability", avail[p.id] ?? "AVAILABLE").map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </label>
          ))}
        </FormGrid>
      )}
      {errs.plans && <small className="hint text-danger" role="alert">{errs.plans}</small>}
    </AdminRecordModal>
  );
}
