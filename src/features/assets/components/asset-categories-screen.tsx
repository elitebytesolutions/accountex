"use client";

import { Boxes, Calculator, History, Pencil, Plus, Tag, Trash2, TrendingDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AssetCategory } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { AccountOptions, apiFieldErrors, apiMessage, usePostableAccounts } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createAssetCategory, deleteAssetCategory, listAssetCategories, setAssetCategoryActive, updateAssetCategory } from "../api";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = { code: string; name: string; defaultMethod: "WDV" | "SLM" | "NONE"; defaultRatePct: string; costAccountId: string; accumDepAccountId: string; depExpenseAccountId: string; tagPrefix: string };
const LOOKUPS = ["DefaultMethod"];

/**
 * Fixed Assets › Asset Categories. No setup template (app/assets is the register, Phase 27): built from the template's
 * page head, KPI cards, table and drawer (decided 2026-10-05).
 */
export function AssetCategoriesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const accounts = usePostableAccounts();
  const [rows, setRows] = useState<AssetCategory[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<AssetCategory | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [removing, setRemoving] = useState<AssetCategory | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAssetCategories()
      .then((r) => { if (!cancelled) { setRows(r); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load asset categories" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const open = (c: AssetCategory | "new") => {
    setEdit(c);
    setErrs({});
    setHistory(false);
    setForm(c === "new"
      ? { code: "", name: "", defaultMethod: "WDV", defaultRatePct: "", costAccountId: "", accumDepAccountId: "", depExpenseAccountId: "", tagPrefix: "" }
      : { code: c.code, name: c.name, defaultMethod: c.defaultMethod as Form["defaultMethod"], defaultRatePct: c.defaultRatePct?.toString() ?? "", costAccountId: c.costAccount.id,
          accumDepAccountId: c.accumDepAccount?.id ?? "", depExpenseAccountId: c.depExpenseAccount?.id ?? "", tagPrefix: c.tagPrefix ?? "" });
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => (x ? { ...x, [k]: v } : x));
  const row = edit && edit !== "new" ? edit : null;
  const none = form?.defaultMethod === "NONE";

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    const body = {
      code: form.code, name: form.name, defaultMethod: form.defaultMethod, defaultRatePct: none || !form.defaultRatePct.trim() ? null : Number(form.defaultRatePct),
      costAccountId: form.costAccountId, accumDepAccountId: none ? null : form.accumDepAccountId || null, depExpenseAccountId: none ? null : form.depExpenseAccountId || null,
      tagPrefix: form.tagPrefix || null,
    };
    try {
      const c = row ? await updateAssetCategory(row.id, { ...body, rowVersion: row.rowVersion }) : await createAssetCategory(body);
      toast(`${c.name} saved`, { tone: "good" });
      setEdit(null);
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the category"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (c: AssetCategory) => {
    try {
      await setAssetCategoryActive(c.id, c.status !== "ACTIVE", c.rowVersion);
      toast(`${c.name} ${c.status === "ACTIVE" ? "deactivated" : "activated"}`, { tone: c.status === "ACTIVE" ? "warn" : "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update"), { tone: "danger" });
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const all = rows ?? [];
  const glText = (g: { code: string; name: string } | null) => (g ? <>{g.code}<small>{g.name}</small></> : <span className="muted">—</span>);

  return (
    <>
      <PageHead
        eyebrow={<><Boxes />Fixed Assets / Asset Categories</>}
        title="Asset Categories"
        description="Depreciation defaults and the GL accounts each kind of asset posts to. The asset register and depreciation runs arrive in Phase 27."
        actions={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New category</Button>}
      />
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Categories</span><span className="icon-well"><Boxes /></span></div><strong>{all.length}</strong><small>{all.filter((c) => c.status === "ACTIVE").length} active</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Written-down value</span><span className="icon-well"><TrendingDown /></span></div><strong>{all.filter((c) => c.defaultMethod === "WDV").length}</strong><small>Reducing balance, as the tax schedule</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Straight line</span><span className="icon-well"><Calculator /></span></div><strong>{all.filter((c) => c.defaultMethod === "SLM").length}</strong><small>Even charge over the life</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Not depreciated</span><span className="icon-well"><Tag /></span></div><strong>{all.filter((c) => c.defaultMethod === "NONE").length}</strong><small>e.g. land, capital work in progress</small></div>
      </div>
      <div className="panel flush">
        <div className="panel-head"><div><h3>Categories</h3><p>Assets copy these defaults when they are added</p></div></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Category</th><th>Method</th><th className="num">Rate / year</th><th>Cost account</th><th>Accumulated depreciation</th><th>Depreciation expense</th><th>Tag prefix</th><th>Active</th><th /></tr></thead>
            <tbody>
              {!rows && <tr><td colSpan={9}><Skeleton style={{ height: 18 }} /></td></tr>}
              {all.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b><small>{c.code}</small></td>
                  <td>{labelOf(lookups, "DefaultMethod", c.defaultMethod)}</td>
                  <td className={cn("num", c.defaultRatePct === null && "zero")}>{c.defaultRatePct === null ? "—" : `${c.defaultRatePct}%`}</td>
                  <td>{glText(c.costAccount)}</td>
                  <td>{glText(c.accumDepAccount)}</td>
                  <td>{glText(c.depExpenseAccount)}</td>
                  <td>{c.tagPrefix ?? <span className="muted">—</span>}</td>
                  <td><label className="switch"><input type="checkbox" checked={c.status === "ACTIVE"} disabled={!can.edit} onChange={() => toggle(c)} aria-label={`${c.name} active`} /><i /></label></td>
                  <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Edit ${c.name}`} onClick={() => open(c)}><Pencil /></button></td>
                </tr>
              ))}
              {rows && !all.length && <tr><td colSpan={9}><EmptyState icon={<Boxes />} title="No asset categories yet" description="Add categories such as Vehicles, Computers or Furniture with their depreciation method and accounts." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New category</Button>} /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-foot"><span>{all.length} categories</span></div>
      </div>

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={row ? row.name : "New asset category"} subtitle="Depreciation default and GL accounts" foot={
        <>
          {row && (
            <span className="row" style={{ marginRight: "auto", gap: 6 }}>
              <button type="button" className="btn ghost" onClick={() => setHistory((h) => !h)}><History />{history ? "Category" : "History"}</button>
              {can.remove && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => setRemoving(row)}><Trash2 />Delete</button>}
            </span>
          )}
          <button type="button" className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
          {(row ? can.edit : can.create) && !history && <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>}
        </>
      }>
        {row && history ? <HistoryTab schema="FixedAssets" table="FixedAssetCategories" id={row.id} /> : form && (
          <FormGrid>
            <Field label="Name" required error={errs.name}><input value={form.name} autoFocus placeholder="e.g. Motor vehicles" onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Code" required error={errs.code}><input value={form.code} placeholder="e.g. VEH" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Depreciation method" error={errs.defaultMethod}>
              <select value={form.defaultMethod} onChange={(e) => set("defaultMethod", e.target.value as Form["defaultMethod"])}>
                {(["WDV", "SLM", "NONE"] as const).map((m) => <option key={m} value={m}>{labelOf(lookups, "DefaultMethod", m)}</option>)}
              </select>
            </Field>
            <Field label="Rate per year (%)" required={!none} error={errs.defaultRatePct} hint={form.defaultMethod === "WDV" ? "e.g. 15% for vehicles, 30% for computers" : undefined}>
              <input inputMode="decimal" value={none ? "" : form.defaultRatePct} disabled={none} onChange={(e) => set("defaultRatePct", e.target.value)} />
            </Field>
            <Field label="Asset (cost) account" required full error={errs.costAccountId}>
              <select value={form.costAccountId} onChange={(e) => set("costAccountId", e.target.value)}><AccountOptions accounts={accounts} classes={[1]} current={row?.costAccount} /></select>
            </Field>
            <Field label="Accumulated depreciation account" required={!none} full error={errs.accumDepAccountId}>
              <select value={none ? "" : form.accumDepAccountId} disabled={none} onChange={(e) => set("accumDepAccountId", e.target.value)}><AccountOptions accounts={accounts} classes={[1]} current={row?.accumDepAccount} /></select>
            </Field>
            <Field label="Depreciation expense account" required={!none} full error={errs.depExpenseAccountId}>
              <select value={none ? "" : form.depExpenseAccountId} disabled={none} onChange={(e) => set("depExpenseAccountId", e.target.value)}><AccountOptions accounts={accounts} classes={[5]} current={row?.depExpenseAccount} /></select>
            </Field>
            <Field label="Asset tag prefix" error={errs.tagPrefix} hint="New assets are tagged e.g. VEH-0001"><input value={form.tagPrefix} placeholder="e.g. VEH-" onChange={(e) => set("tagPrefix", e.target.value.toUpperCase())} /></Field>
          </FormGrid>
        )}
      </Drawer>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!removing) return;
        try {
          await deleteAssetCategory(removing.id, removing.rowVersion);
          toast(`${removing.name} deleted`, { tone: "good" });
          setEdit(null);
          reload();
        } catch (e) {
          toast(apiMessage(e, "Could not delete"), { tone: "danger" });
        } finally {
          setRemoving(null);
        }
      }}>Only categories no asset uses can be deleted; otherwise deactivate it.</ConfirmDialog>
    </>
  );
}
