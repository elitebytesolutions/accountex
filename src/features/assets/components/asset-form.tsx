"use client";

import { Armchair, Building, ChevronDown, ChevronRight, Factory, Monitor, Package, Search, Truck, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { AssetOptions, CapitalisableLine, FixedAsset } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Money, dateLabel, isoDay } from "@/features/finance/components/finance-ui";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { capitalisableLines, capitaliseAsset, createAsset, updateAsset } from "../register-api";
import "./asset-form.css";

// ---------------------------------------------------------------- shared labels

export const ASSET_STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "info" },
  IN_USE: { label: "In use", tone: "good" },
  UNDER_REPAIR: { label: "Under repair", tone: "warn" },
  FULLY_DEPRECIATED: { label: "Fully depreciated", tone: "neutral" },
  DISPOSED: { label: "Disposed", tone: "danger" },
};
export function AssetStatus({ status }: { status: string }) {
  const s = ASSET_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}
export const METHOD_LABEL: Record<string, string> = { WDV: "WDV — Written down value", SLM: "SLM — Straight line", NONE: "No depreciation" };
export const methodShort = (method: string, rate: number | null) => (method === "NONE" ? "Not depreciated" : `${method} ${rate ?? 0}%`);
/** Assets still on the books (can be transferred or disposed). */
export const isActiveAsset = (status: string) => ["IN_USE", "UNDER_REPAIR", "FULLY_DEPRECIATED"].includes(status);

/** Template category icons (building / factory / truck / monitor / armchair), matched on the category's name. */
export function categoryIcon(name: string): { icon: LucideIcon; tone?: "teal" | "blue" | "yellow" | "violet" } {
  const n = name.toLowerCase();
  if (/land|build|premis/.test(n)) return { icon: Building };
  if (/plant|machin|equip/.test(n)) return { icon: Factory, tone: "teal" };
  if (/vehic|motor|car|truck/.test(n)) return { icon: Truck, tone: "blue" };
  if (/comput|it |laptop|server|electron/.test(n)) return { icon: Monitor, tone: "yellow" };
  if (/furnit|fixture|fitting|office/.test(n)) return { icon: Armchair, tone: "violet" };
  return { icon: Package };
}

const CAPITALISE_ERRORS: Record<string, string> = {
  ASSET_BILL_LINE_USED: "That bill line is already capitalised as another asset.",
  ASSET_BILL_NOT_POSTED: "Capitalise from a posted vendor bill.",
  ASSET_ALREADY_CAPITALISED: "This asset is already capitalised.",
};
const capitaliseMessage = (e: unknown) => (e instanceof ApiError && CAPITALISE_ERRORS[e.code]) || apiMessage(e, "Could not capitalise the asset");

function AccountOpts({ options, classes }: { options: AssetOptions | null; classes: number[] }) {
  return (
    <>
      <option value="">Choose…</option>
      {(options?.accounts ?? []).filter((a) => classes.includes(a.accountClass)).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
    </>
  );
}

// ---------------------------------------------------------------- new / edit asset (template #rpt-new-asset)

type Form = {
  name: string; description: string; categoryId: string; branchId: string; custodianEmployeeId: string; costCentreId: string; acquisitionDate: string; cost: string;
  method: "WDV" | "SLM" | "NONE"; ratePct: string; residualValue: string; costAccountId: string; accumDepAccountId: string; depExpenseAccountId: string;
  tagNo: string; serialNo: string; chargeFullMonthOnPurchase: boolean;
  registrationNo: string; engineNo: string; chassisNo: string; insurer: string; insurancePolicyNo: string; insuranceExpiry: string;
};

const blank = (): Form => ({
  name: "", description: "", categoryId: "", branchId: "", custodianEmployeeId: "", costCentreId: "", acquisitionDate: isoDay(new Date()), cost: "", method: "WDV", ratePct: "",
  residualValue: "0", costAccountId: "", accumDepAccountId: "", depExpenseAccountId: "", tagNo: "", serialNo: "", chargeFullMonthOnPurchase: true,
  registrationNo: "", engineNo: "", chassisNo: "", insurer: "", insurancePolicyNo: "", insuranceExpiry: "",
});
const fromAsset = (a: FixedAsset): Form => ({
  name: a.name, description: a.description ?? "", categoryId: a.category.id, branchId: a.branch.id, custodianEmployeeId: a.custodian?.id ?? "", costCentreId: a.costCentre?.id ?? "",
  acquisitionDate: a.acquisitionDate, cost: String(a.cost), method: a.method as Form["method"], ratePct: a.ratePct?.toString() ?? "", residualValue: String(a.residualValue),
  costAccountId: a.costAccount.id, accumDepAccountId: a.accumDepAccount?.id ?? "", depExpenseAccountId: a.depExpenseAccount?.id ?? "", tagNo: a.tagNo ?? "", serialNo: a.serialNo ?? "",
  chargeFullMonthOnPurchase: a.chargeFullMonthOnPurchase, registrationNo: a.registrationNo ?? "", engineNo: a.engineNo ?? "", chassisNo: a.chassisNo ?? "", insurer: a.insurer ?? "",
  insurancePolicyNo: a.insurancePolicyNo ?? "", insuranceExpiry: a.insuranceExpiry ?? "",
});

/**
 * New / edit fixed asset (template `#rpt-new-asset`, wide modal, 3-column form). Picking a category copies its method, rate
 * and accounts. Once the asset is capitalised its cost, dates, policy and accounts are locked (server: ASSET_NOT_EDITABLE).
 * `onSaved(asset, capitalise)` — `capitalise` is true for "Save & capitalise".
 */
export function AssetFormModal({ open, asset, options, canPost, onClose, onSaved }: {
  open: boolean;
  asset: FixedAsset | null;
  options: AssetOptions | null;
  canPost: boolean;
  onClose: () => void;
  onSaved: (asset: FixedAsset, capitalise: boolean) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [prevKey, setPrevKey] = useState<string | null>(null);

  // Reset the form each time the modal opens (during render, no effect).
  const key = open ? (asset?.id ?? "new") : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (key) {
      const f = asset ? fromAsset(asset) : blank();
      setForm(f);
      setErrs({});
      setMore(!!(f.description || f.registrationNo || f.engineNo || f.chassisNo || f.insurer || f.insurancePolicyNo || f.insuranceExpiry));
    }
  }

  const locked = !!asset && asset.status !== "NEW";
  const none = form.method === "NONE";
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => ({ ...x, [k]: v }));
  const pickCategory = (id: string) => {
    const c = options?.categories.find((x) => x.id === id);
    setForm((x) => (c ? {
      ...x, categoryId: id, method: c.defaultMethod as Form["method"], ratePct: c.defaultRatePct?.toString() ?? "", costAccountId: c.costAccountId,
      accumDepAccountId: c.accumDepAccountId ?? "", depExpenseAccountId: c.depExpenseAccountId ?? "",
    } : { ...x, categoryId: id }));
  };

  const save = async (capitalise: boolean) => {
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = "Name the asset";
    if (!form.categoryId) local.categoryId = "Choose the category";
    if (!form.branchId) local.branchId = "Choose the location";
    if (!form.acquisitionDate) local.acquisitionDate = "Enter the acquisition date";
    if (!(Number(form.cost) > 0)) local.cost = "More than 0";
    if (!none && !(Number(form.ratePct) > 0)) local.ratePct = "Enter the yearly rate";
    if (!form.costAccountId) local.costAccountId = "Choose the asset account";
    if (Object.keys(local).length) { setErrs(local); return; }
    setBusy(true);
    setErrs({});
    const body = {
      name: form.name, description: form.description || null, categoryId: form.categoryId, branchId: form.branchId, custodianEmployeeId: form.custodianEmployeeId || null,
      costCentreId: form.costCentreId || null, tagNo: form.tagNo || null, serialNo: form.serialNo || null, acquisitionDate: form.acquisitionDate, cost: Number(form.cost),
      vendorId: asset?.vendor?.id ?? null, method: form.method, ratePct: none ? null : Number(form.ratePct), residualValue: Number(form.residualValue || 0),
      chargeFullMonthOnPurchase: form.chargeFullMonthOnPurchase, costAccountId: form.costAccountId, accumDepAccountId: none ? null : form.accumDepAccountId || null,
      depExpenseAccountId: none ? null : form.depExpenseAccountId || null, registrationNo: form.registrationNo || null, engineNo: form.engineNo || null, chassisNo: form.chassisNo || null,
      insurer: form.insurer || null, insurancePolicyNo: form.insurancePolicyNo || null, insuranceExpiry: form.insuranceExpiry || null,
    };
    try {
      const a = asset ? await updateAsset(asset.id, { ...body, rowVersion: asset.rowVersion }) : await createAsset(body);
      toast(asset ? `${a.code} saved` : `Asset ${a.code} created`, { tone: "good" });
      onSaved(a, capitalise);
    } catch (e) {
      const f = apiFieldErrors(e);
      setErrs(f);
      if (Object.keys(f).length) setMore((m) => m || ["description", "registrationNo", "engineNo", "chassisNo", "insurer", "insurancePolicyNo", "insuranceExpiry"].some((k) => f[k]));
      toast(apiMessage(e, "Could not save the asset"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const showCapitalise = canPost && (!asset || asset.status === "NEW");
  return (
    <Modal open={open} onClose={() => !busy && onClose()} wide title={asset ? `Edit ${asset.code}` : "New fixed asset"}
      subtitle={asset ? (locked ? "Capitalised — cost, dates, policy and accounts are locked." : asset.name) : "Capitalise an asset and set its depreciation policy."}
      foot={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => save(false)} disabled={busy || !options}>{busy ? "Saving…" : "Save asset"}</button>
          {showCapitalise && <button type="button" className="btn lime" onClick={() => save(true)} disabled={busy || !options}>Save &amp; capitalise</button>}
        </>
      }>
      {!options ? <Skeleton style={{ height: 220 }} /> : (
        <FormGrid cols={3}>
          <Field label="Asset code"><input value={asset?.code ?? "auto"} readOnly /></Field>
          <Field label="Asset name" required full error={errs.name}><input value={form.name} autoFocus placeholder="e.g. Toyota Corolla Altis 1.6" onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Category" required error={errs.categoryId}>
            <select value={form.categoryId} disabled={locked} onChange={(e) => pickCategory(e.target.value)}>
              <option value="">Choose…</option>
              {asset && !options.categories.some((c) => c.id === asset.category.id) && <option value={asset.category.id}>{asset.category.name}</option>}
              {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Location" required error={errs.branchId}>
            <select value={form.branchId} onChange={(e) => set("branchId", e.target.value)}>
              <option value="">Choose…</option>
              {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Custodian" error={errs.custodianEmployeeId}>
            <select value={form.custodianEmployeeId} onChange={(e) => set("custodianEmployeeId", e.target.value)}>
              <option value="">None</option>
              {options.employees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Cost centre" error={errs.costCentreId}>
            <select value={form.costCentreId} onChange={(e) => set("costCentreId", e.target.value)}>
              <option value="">None</option>
              {options.costCentres.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
            </select>
          </Field>
          <Field label="Acquisition date" required error={errs.acquisitionDate}><input type="date" value={form.acquisitionDate} disabled={locked} onChange={(e) => set("acquisitionDate", e.target.value)} /></Field>
          <Field label="Cost (Rs)" required error={errs.cost}><input inputMode="decimal" value={form.cost} placeholder="0.00" disabled={locked} onChange={(e) => set("cost", e.target.value)} /></Field>
          <Field label="Source document"><input value={asset?.source.docNo ?? ""} placeholder="Filled when capitalised from a bill" readOnly /></Field>
          <Field label="Method" error={errs.method}>
            <select value={form.method} disabled={locked} onChange={(e) => set("method", e.target.value as Form["method"])}>
              {(["WDV", "SLM", "NONE"] as const).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          </Field>
          <Field label="Rate % p.a." required={!none} error={errs.ratePct}><input inputMode="decimal" value={none ? "" : form.ratePct} disabled={locked || none} onChange={(e) => set("ratePct", e.target.value)} /></Field>
          <Field label="Residual value" error={errs.residualValue}><input inputMode="decimal" value={form.residualValue} disabled={locked} onChange={(e) => set("residualValue", e.target.value)} /></Field>
          <Field label="Asset account" required error={errs.costAccountId}>
            <select value={form.costAccountId} disabled={locked} onChange={(e) => set("costAccountId", e.target.value)}><AccountOpts options={options} classes={[1]} /></select>
          </Field>
          <Field label="Accum. dep. account" required={!none} error={errs.accumDepAccountId}>
            <select value={none ? "" : form.accumDepAccountId} disabled={locked || none} onChange={(e) => set("accumDepAccountId", e.target.value)}><AccountOpts options={options} classes={[1]} /></select>
          </Field>
          <Field label="Expense account" required={!none} error={errs.depExpenseAccountId}>
            <select value={none ? "" : form.depExpenseAccountId} disabled={locked || none} onChange={(e) => set("depExpenseAccountId", e.target.value)}><AccountOpts options={options} classes={[5]} /></select>
          </Field>
          <Field label="Tag no" error={errs.tagNo}><input value={form.tagNo} placeholder="Auto from category prefix" onChange={(e) => set("tagNo", e.target.value)} /></Field>
          <Field label="Serial no" error={errs.serialNo}><input value={form.serialNo} onChange={(e) => set("serialNo", e.target.value)} /></Field>
          <Check label="Charge full month in month of purchase" checked={form.chargeFullMonthOnPurchase} disabled={locked} onChange={(e) => set("chargeFullMonthOnPurchase", e.target.checked)} />
          <button type="button" className="fa-more-toggle full" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {more ? <ChevronDown /> : <ChevronRight />}More details <small>description, vehicle registration and insurance</small>
          </button>
          {more && (
            <>
              <Field label="Description" full error={errs.description}><input value={form.description} placeholder="e.g. Plot 14-B, 2 kanal" onChange={(e) => set("description", e.target.value)} /></Field>
              <Field label="Registration no" error={errs.registrationNo}><input value={form.registrationNo} placeholder="e.g. LEB-21-4587" onChange={(e) => set("registrationNo", e.target.value)} /></Field>
              <Field label="Engine no" error={errs.engineNo}><input value={form.engineNo} onChange={(e) => set("engineNo", e.target.value)} /></Field>
              <Field label="Chassis no" error={errs.chassisNo}><input value={form.chassisNo} onChange={(e) => set("chassisNo", e.target.value)} /></Field>
              <Field label="Insurer" error={errs.insurer}><input value={form.insurer} placeholder="e.g. EFU General" onChange={(e) => set("insurer", e.target.value)} /></Field>
              <Field label="Insurance policy no" error={errs.insurancePolicyNo}><input value={form.insurancePolicyNo} onChange={(e) => set("insurancePolicyNo", e.target.value)} /></Field>
              <Field label="Insurance expiry" error={errs.insuranceExpiry}><input type="date" value={form.insuranceExpiry} onChange={(e) => set("insuranceExpiry", e.target.value)} /></Field>
            </>
          )}
        </FormGrid>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- capitalise

/**
 * Capitalise a NEW asset: from a posted vendor bill line (a reclass journal moves it to the asset's cost account when the bill
 * posted elsewhere) or as an existing asset with no journal. No template screen; built from the template's modal and radio cards.
 */
export function CapitaliseModal({ asset, onClose, onDone }: {
  asset: Pick<FixedAsset, "id" | "code" | "name" | "cost" | "rowVersion" | "costAccount"> | null;
  onClose: () => void;
  onDone: (a: FixedAsset) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"bill" | "existing">("bill");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<CapitalisableLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prevId, setPrevId] = useState<string | null>(null);

  if ((asset?.id ?? null) !== prevId) {
    setPrevId(asset?.id ?? null);
    setMode("bill");
    setSearch("");
    setPicked(null);
    setLines(null);
  }

  useEffect(() => {
    if (!asset || mode !== "bill") return;
    let cancelled = false;
    const t = setTimeout(() => {
      capitalisableLines(search.trim() || undefined)
        .then((r) => { if (!cancelled) { setLines(r); setLoadError(null); } })
        .catch((e: unknown) => !cancelled && setLoadError(apiMessage(e, "Could not load bill lines")));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [asset, mode, search]);

  const line = lines?.find((l) => l.id === picked) ?? null;
  const submit = async () => {
    if (!asset) return;
    if (mode === "bill" && !line) { toast("Pick the bill line this asset came from", { tone: "warn" }); return; }
    setBusy(true);
    try {
      const a = await capitaliseAsset(asset.id, asset.rowVersion, mode === "bill" ? line!.id : null);
      toast(`${a.code} capitalised`, { tone: "good" });
      onDone(a);
    } catch (e) {
      toast(capitaliseMessage(e), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!asset} onClose={() => !busy && onClose()} wide title={`Capitalise ${asset?.code ?? ""}`} subtitle={asset ? `${asset.name} · cost Rs ${asset.cost.toLocaleString("en-US")}` : undefined}
      foot={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={submit} disabled={busy || (mode === "bill" && !line)}>{busy ? "Capitalising…" : "Capitalise"}</button>
        </>
      }>
      <div className="radio-cards mb">
        <label className="radio-card"><input type="radio" name="fa-cap" checked={mode === "bill"} onChange={() => setMode("bill")} /><div><b>From a vendor bill line</b><small>Links the asset to a posted bill; reclassifies the cost if needed</small></div></label>
        <label className="radio-card"><input type="radio" name="fa-cap" checked={mode === "existing"} onChange={() => setMode("existing")} /><div><b>Existing asset (no journal)</b><small>Already on the books, e.g. brought in with opening balances</small></div></label>
      </div>
      {mode === "existing" ? (
        <p className="muted">The asset goes into use without a journal; its cost is assumed to be in the asset account already.</p>
      ) : (
        <>
          <label className="search-field fa-cap-search"><Search /><input placeholder="Search bill no or vendor invoice…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          {loadError ? <p className="text-danger">{loadError}</p> : !lines ? <Skeleton style={{ height: 120 }} /> : !lines.length ? (
            <EmptyState title="No bill lines to capitalise" description="Only lines on posted vendor bills that aren't already on an asset are listed." />
          ) : (
            <div className="table-wrap fa-cap-lines">
              <table className="tbl">
                <thead><tr><th /><th>Bill</th><th>Date</th><th>Vendor</th><th>Description</th><th>Account</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} onClick={() => setPicked(l.id)} style={{ cursor: "pointer" }}>
                      <td><input type="radio" name="fa-cap-line" checked={picked === l.id} onChange={() => setPicked(l.id)} aria-label={`Bill ${l.billNo}`} /></td>
                      <td><b>{l.billNo}</b></td>
                      <td>{dateLabel(l.billDate)}</td>
                      <td>{l.vendor.name}</td>
                      <td>{l.description ?? <span className="muted">—</span>}</td>
                      <td>{l.account ? `${l.account.code} ${l.account.name}` : "—"}</td>
                      <td className="num"><Money value={l.netAmount} rs={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {line && asset && line.account && line.account.id !== asset.costAccount.id && (
            <p className="hint fa-cap-note">The bill posted to <b>{line.account.code} {line.account.name}</b>; a reclass journal moves it to the asset account <b>{asset.costAccount.code} {asset.costAccount.name}</b>.</p>
          )}
          {line && Math.abs(line.netAmount - (asset?.cost ?? 0)) > 0.005 && <p className="hint">The bill line amount differs from the asset cost; check the cost before capitalising.</p>}
        </>
      )}
    </Modal>
  );
}
