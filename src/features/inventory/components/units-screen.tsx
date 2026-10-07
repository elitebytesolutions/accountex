"use client";

import { Droplet, History, Pencil, Plus, Ruler, Scale, Shapes, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { UNIT_KINDS, type Unit } from "@/shared";
import { Button } from "@/components/ui/button";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createUnit, deleteUnit, listUnits, setUnitActive, updateUnit } from "../api";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = { code: string; name: string; nameUrdu: string; kind: string; decimals: string };
const LOOKUPS = ["UnitOfMeasureKind"];
const EXAMPLE: Record<string, string> = { COUNT: "12 pcs", WEIGHT: "2.500 kg", VOLUME: "1.500 L", LENGTH: "3.25 m" };

/**
 * Inventory › Products › Units of Measure. No template (decided 2026-10-05): built from the template's page head, KPI
 * cards, table and drawer. Standard units are seeded per company; they can be edited or deactivated, not deleted.
 */
export function UnitsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [rows, setRows] = useState<Unit[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<Unit | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [removing, setRemoving] = useState<Unit | null>(null);

  useEffect(() => {
    let cancelled = false;
    listUnits()
      .then((r) => { if (!cancelled) { setRows(r); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load units" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const open = (u: Unit | "new") => {
    setEdit(u);
    setErrs({});
    setHistory(false);
    setForm(u === "new" ? { code: "", name: "", nameUrdu: "", kind: "COUNT", decimals: "0" } : { code: u.code, name: u.name, nameUrdu: u.nameUrdu ?? "", kind: u.kind, decimals: String(u.decimals) });
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => (x ? { ...x, [k]: v } : x));
  const row = edit && edit !== "new" ? edit : null;

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    const body = { code: form.code, name: form.name, nameUrdu: form.nameUrdu || null, kind: form.kind, decimals: form.decimals };
    try {
      const u = row ? await updateUnit(row.id, { ...body, rowVersion: row.rowVersion }) : await createUnit(body);
      toast(`${u.code} · ${u.name} saved`, { tone: "good" });
      setEdit(null);
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the unit"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (u: Unit) => {
    try {
      await setUnitActive(u.id, !u.isActive, u.rowVersion);
      toast(`${u.code} ${u.isActive ? "deactivated" : "activated"}`, { tone: u.isActive ? "warn" : "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update"), { tone: "danger" });
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const all = rows ?? [];
  const byKind = (k: string) => all.filter((u) => u.kind === k && u.isActive).length;

  return (
    <>
      <PageHead
        eyebrow={<><Ruler />Products / Units of Measure</>}
        title="Units of Measure"
        description="The units products are counted, weighed and sold in. Standard units come with every company; add your own for special packs."
        actions={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New unit</Button>}
      />
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Units</span><span className="icon-well"><Ruler /></span></div><strong>{all.length}</strong><small>{all.filter((u) => u.isActive).length} active · {all.filter((u) => u.isSystem).length} standard</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Count</span><span className="icon-well"><Shapes /></span></div><strong>{byKind("COUNT")}</strong><small>Pieces, packets, cartons…</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Weight</span><span className="icon-well"><Scale /></span></div><strong>{byKind("WEIGHT")}</strong><small>Kilograms and grams</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Volume & length</span><span className="icon-well"><Droplet /></span></div><strong>{byKind("VOLUME") + byKind("LENGTH")}</strong><small>Litres, millilitres, metres</small></div>
      </div>
      <div className="panel flush">
        <div className="panel-head"><div><h3>Units</h3><p>Decimals set how precisely quantities are entered</p></div></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Unit</th><th>Urdu name</th><th>Kind</th><th className="num">Decimals</th><th className="num">Products</th><th>Active</th><th /></tr></thead>
            <tbody>
              {!rows && <tr><td colSpan={7}><Skeleton style={{ height: 18 }} /></td></tr>}
              {all.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.code}</b> {u.isSystem && <span className="badge neutral" style={{ marginLeft: 6 }}>Standard</span>}<small>{u.name}</small></td>
                  <td dir="rtl" lang="ur">{u.nameUrdu ?? <span className="muted">—</span>}</td>
                  <td>{labelOf(lookups, "UnitOfMeasureKind", u.kind)}</td>
                  <td className="num">{u.decimals}</td>
                  <td className="num">{u.productCount}</td>
                  <td><label className="switch"><input type="checkbox" checked={u.isActive} disabled={!can.edit} onChange={() => toggle(u)} aria-label={`${u.code} active`} /><i /></label></td>
                  <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Edit ${u.code}`} onClick={() => open(u)}><Pencil /></button></td>
                </tr>
              ))}
              {rows && !all.length && <tr><td colSpan={7}><EmptyState icon={<Ruler />} title="No units yet" description="Add the units your products are counted in, such as PCS, CTN or KG." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New unit</Button>} /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-foot"><span>{all.length} units</span></div>
      </div>

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={row ? `${row.code} · ${row.name}` : "New unit"} subtitle={row?.isSystem ? "Standard unit: edit or deactivate, not delete" : "Code, name and precision"} foot={
        <>
          {row && (
            <span className="row" style={{ marginRight: "auto", gap: 6 }}>
              <button type="button" className="btn ghost" onClick={() => setHistory((h) => !h)}><History />{history ? "Unit" : "History"}</button>
              {can.remove && !row.isSystem && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => setRemoving(row)}><Trash2 />Delete</button>}
            </span>
          )}
          <button type="button" className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
          {(row ? can.edit : can.create) && !history && <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>}
        </>
      }>
        {row && history ? <HistoryTab schema="Inventory" table="UnitsOfMeasure" id={row.id} /> : form && (
          <FormGrid>
            <Field label="Code" required error={errs.code} hint="Printed on documents, e.g. CTN"><input value={form.code} autoFocus placeholder="e.g. BAG" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Name" required error={errs.name}><input value={form.name} placeholder="e.g. Bag" onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Urdu name" error={errs.nameUrdu}><input dir="rtl" lang="ur" value={form.nameUrdu} onChange={(e) => set("nameUrdu", e.target.value)} /></Field>
            <Field label="Kind" error={errs.kind}>
              <select value={form.kind} onChange={(e) => set("kind", e.target.value)}>{UNIT_KINDS.map((k) => <option key={k} value={k}>{labelOf(lookups, "UnitOfMeasureKind", k)}</option>)}</select>
            </Field>
            <Field label="Decimals" error={errs.decimals} hint={`e.g. ${EXAMPLE[form.kind] ?? "12"}`}>
              <select value={form.decimals} onChange={(e) => set("decimals", e.target.value)}>{["0", "1", "2", "3"].map((d) => <option key={d} value={d}>{d === "0" ? "None (whole numbers)" : `${d} decimal${d === "1" ? "" : "s"}`}</option>)}</select>
            </Field>
          </FormGrid>
        )}
      </Drawer>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.code ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!removing) return;
        try {
          await deleteUnit(removing.id, removing.rowVersion);
          toast(`${removing.code} deleted`, { tone: "good" });
          setEdit(null);
          reload();
        } catch (e) {
          toast(apiMessage(e, "Could not delete"), { tone: "danger" });
        } finally {
          setRemoving(null);
        }
      }}>Only units no product uses can be deleted, and the code can&apos;t be used again. Otherwise deactivate it.</ConfirmDialog>
    </>
  );
}
