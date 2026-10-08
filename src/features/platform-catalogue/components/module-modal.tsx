"use client";

import { Power, PowerOff } from "lucide-react";
import { useState } from "react";
import type { LookupsResponse, PlatformModule, SubscriptionPlan } from "@/shared";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { lookupOptions } from "@/features/settings/use-lookups";
import { createModule, deleteModule, setModuleEnabled, setModulePlans, updateModule } from "../api";
import { CATALOGUE_ICONS, moduleKeyLabel, PlanPill } from "./catalogue-ui";

type Form = Record<string, string | boolean>;
const TEXT = ["key", "name", "icon", "kind", "entGroup", "moduleKey", "minPlanId", "sortOrder"] as const;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * Module add / edit modal (template style: the template has no module form; rows come from the entitlement matrix and
 * the "Modules by plan" table). Key, name, icon, group, gated workspace module, minimum plan, plans, core and enabled.
 */
export function ModuleModal({ mod, plans, lookups, onClose, onSaved }: {
  mod: PlatformModule | null;
  plans: SubscriptionPlan[];
  lookups: LookupsResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(() => mod
    ? { ...Object.fromEntries(TEXT.map((k) => [k, str(mod[k])])), isCore: mod.isCore, isEnabled: mod.isEnabled }
    : { ...Object.fromEntries(TEXT.map((k) => [k, ""])), kind: "MODULE", entGroup: "CORE_MODULES", sortOrder: "0", isCore: false, isEnabled: true });
  const [inc, setInc] = useState<Record<string, boolean>>(() => Object.fromEntries(plans.map((p) => [p.id, mod?.plans.find((x) => x.planId === p.id)?.isIncluded ?? false])));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  /** Choosing a minimum plan switches on that plan and every plan above it (template modMinChange). */
  const setMin = (planId: string) => {
    set("minPlanId", planId);
    const min = plans.find((p) => p.id === planId);
    if (min) setInc(Object.fromEntries(plans.map((p) => [p.id, p.sortOrder >= min.sortOrder])));
  };

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setErrs({});
    try { toast(await work(), { tone: "good" }); onSaved(); }
    catch (e) { setErrs(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not save the module"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const planRows = () => plans.map((p) => ({ planId: p.id, isIncluded: Boolean(inc[p.id]) }));
  const save = () => run(async () => {
    const body: Record<string, unknown> = Object.fromEntries(TEXT.map((k) => [k, s(k)]));
    body.isCore = Boolean(f.isCore);
    body.isEnabled = Boolean(f.isCore) || Boolean(f.isEnabled);
    if (!mod) {
      await createModule({ ...body, plans: planRows() });
      return `Module ${s("name")} created`;
    }
    const saved = await updateModule(mod.id, { ...body, rowVersion: mod.rowVersion });
    const changed = plans.some((p) => (mod.plans.find((x) => x.planId === p.id)?.isIncluded ?? false) !== Boolean(inc[p.id]));
    if (changed) await setModulePlans(mod.id, saved.rowVersion, planRows());
    return `Module ${s("name")} saved`;
  });

  return (
    <AdminRecordModal open wide onClose={onClose} busy={busy} title={mod ? `Edit module — ${mod.name}` : "New module"}
      subtitle="A module or feature tenants get through their plan"
      history={mod ? { table: "PlatformModules", id: mod.id } : null} historyLabels={{ PlatformModulePlans: "Plan inclusion" }}
      saveLabel={mod ? "Save module" : "Create module"} onSave={save}
      onDelete={mod && !mod.isCore ? async () => { await run(async () => { await deleteModule(mod.id, mod.rowVersion); return `${mod.name} deleted`; }); } : undefined}
      deleteNote="Only a module no add-on, feature flag or entitlement log uses can be deleted. Disable it instead."
      extra={mod && !mod.isCore && (
        <button type="button" className="btn secondary" disabled={busy} onClick={() => run(async () => { await setModuleEnabled(mod.id, !mod.isEnabled, mod.rowVersion); return `${mod.name} ${mod.isEnabled ? "disabled" : "enabled"} for all tenants`; })}>
          {mod.isEnabled ? <><PowerOff />Disable</> : <><Power />Enable</>}
        </button>
      )}>
      <FormGrid cols={3}>
        <Field label="Name" required error={errs.name}><input value={s("name")} maxLength={80} placeholder="e.g. Batch & expiry" onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Key" required error={errs.key} hint="e.g. mod.inventory"><input className="ff-mono-in" value={s("key")} maxLength={60} onChange={(e) => set("key", e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} /></Field>
        <Field label="Kind" error={errs.kind}>
          <select value={s("kind")} onChange={(e) => set("kind", e.target.value)}>
            {lookupOptions(lookups, "PlatformModuleKind", s("kind")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Group" error={errs.entGroup}>
          <select value={s("entGroup")} onChange={(e) => set("entGroup", e.target.value)}>
            {lookupOptions(lookups, "EntGroup", s("entGroup")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Workspace module" error={errs.moduleKey} hint="What it unlocks">
          <select value={s("moduleKey")} onChange={(e) => set("moduleKey", e.target.value)}>
            <option value="">—</option>
            {lookupOptions(lookups, "ModuleKey", s("moduleKey") || null).map((o) => <option key={o.code} value={o.code}>{moduleKeyLabel(o.code)}</option>)}
          </select>
        </Field>
        <Field label="Icon" error={errs.icon}>
          <select value={s("icon")} onChange={(e) => set("icon", e.target.value)}>
            <option value="">Default</option>
            {Object.keys(CATALOGUE_ICONS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Minimum plan" error={errs.minPlanId}>
          <select value={s("minPlanId")} onChange={(e) => setMin(e.target.value)}>
            <option value="">—</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Sort order" error={errs.sortOrder}><input type="number" min={0} value={s("sortOrder")} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
      </FormGrid>
      <div className="row mt" style={{ gap: 24, flexWrap: "wrap" }}>
        <Switch label="Core (always on, can't be disabled)" checked={Boolean(f.isCore)} onChange={(e) => set("isCore", e.target.checked)} />
        <Switch label="Enabled for all tenants" checked={Boolean(f.isCore) || Boolean(f.isEnabled)} disabled={Boolean(f.isCore)} onChange={(e) => set("isEnabled", e.target.checked)} />
      </div>
      {errs.isEnabled && <small className="hint text-danger" role="alert">{errs.isEnabled}</small>}
      <div className="form-section mt"><h4>Included in plans</h4></div>
      {!plans.length ? <p className="muted small">No active plans yet.</p> : (
        <div className="grid-4">
          {plans.map((p) => <Switch key={p.id} label={<PlanPill plan={p} />} checked={Boolean(inc[p.id])} onChange={(e) => setInc((x) => ({ ...x, [p.id]: e.target.checked }))} />)}
        </div>
      )}
    </AdminRecordModal>
  );
}
