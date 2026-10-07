"use client";

import { ArrowLeft, History, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";

type Row = { id: string; name: string; isActive: boolean; rowVersion: number };
export type MasterField<R> = {
  key: string; label: string; required?: boolean; placeholder?: string; full?: boolean; upper?: boolean; value: (r: R | null) => string;
  /** Renders a select instead of a text input ("" = none). */
  options?: { value: string; label: string }[];
};
type Can = { create: boolean; edit: boolean; remove: boolean };

/**
 * Template-styled drawer for the small masters without a template (customer groups, vendor categories): table with
 * counts and active switches, an add / edit form and the row history (decided 2026-10-05).
 */
export function MasterDrawer<R extends Row>({ open, onClose, title, subtitle, noun, can, table, fields, columns, load, create, update, setActive, remove, onChanged }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  noun: string;
  can: Can;
  table: { schema: string; name: string };
  fields: MasterField<R>[];
  columns: { header: string; num?: boolean; render: (r: R) => ReactNode }[];
  load: () => Promise<R[]>;
  create: (body: Record<string, string>) => Promise<unknown>;
  update: (id: string, body: Record<string, unknown> & { rowVersion: number }) => Promise<unknown>;
  setActive: (id: string, on: boolean, rowVersion: number) => Promise<unknown>;
  remove: (id: string, rowVersion: number) => Promise<unknown>;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<R[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<R | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [removing, setRemoving] = useState<R | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    load().then((r) => !cancelled && setRows(r)).catch((e: unknown) => !cancelled && toast(apiMessage(e, `Could not load ${noun}s`), { tone: "danger" }));
    return () => { cancelled = true; };
  }, [open, attempt, load, noun, toast]);
  const reload = useCallback(() => { setAttempt((n) => n + 1); onChanged(); }, [onChanged]);

  const start = (r: R | "new") => {
    setEdit(r);
    setErrs({});
    setHistory(false);
    setForm(Object.fromEntries(fields.map((f) => [f.key, f.value(r === "new" ? null : r)])));
  };
  const row = edit && edit !== "new" ? edit : null;
  const run = async (work: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(true);
    try {
      await work();
      toast(done, { tone: "good" });
      after?.();
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer open={open} onClose={() => { setEdit(null); onClose(); }} wide title={edit ? (row ? row.name : `New ${noun}`) : title} subtitle={edit ? (row ? `Edit ${noun}` : `Add a ${noun}`) : subtitle} foot={
        edit ? (
          <>
            <span className="row" style={{ marginRight: "auto", gap: 6 }}>
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}><ArrowLeft />All</button>
              {row && <button type="button" className="btn ghost" onClick={() => setHistory((h) => !h)}><History />{history ? "Form" : "History"}</button>}
              {row && can.remove && !history && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => setRemoving(row)}><Trash2 />Delete</button>}
            </span>
            {(row ? can.edit : can.create) && !history && (
              <button type="button" className="btn primary" disabled={busy} onClick={() => run(() => (row ? update(row.id, { ...form, rowVersion: row.rowVersion }) : create(form)), `${form.name ?? noun} saved`, () => setEdit(null))}>
                {busy ? "Saving…" : "Save"}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn secondary" onClick={onClose}>Close</button>
            {can.create && <button type="button" className="btn primary" onClick={() => start("new")}><Plus />New {noun}</button>}
          </>
        )
      }>
        {edit ? (
          row && history ? <HistoryTab schema={table.schema} table={table.name} id={row.id} /> : (
            <FormGrid>
              {fields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required} full={f.full} error={errs[f.key]}>
                  {f.options ? (
                    <select value={form[f.key] ?? ""} disabled={!(row ? can.edit : can.create)} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input value={form[f.key] ?? ""} placeholder={f.placeholder} disabled={!(row ? can.edit : can.create)}
                      onChange={(e) => setForm((x) => ({ ...x, [f.key]: f.upper ? e.target.value.toUpperCase() : e.target.value }))} />
                  )}
                </Field>
              ))}
            </FormGrid>
          )
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>{columns.map((c) => <th key={c.header} className={c.num ? "num" : undefined}>{c.header}</th>)}<th>Active</th><th /></tr></thead>
              <tbody>
                {!rows && <tr><td colSpan={columns.length + 2}><Skeleton style={{ height: 18 }} /></td></tr>}
                {rows?.map((r) => (
                  <tr key={r.id}>
                    {columns.map((c) => <td key={c.header} className={c.num ? "num" : undefined}>{c.render(r)}</td>)}
                    <td><label className="switch"><input type="checkbox" checked={r.isActive} disabled={!can.edit || busy} aria-label={`${r.name} active`}
                      onChange={() => run(() => setActive(r.id, !r.isActive, r.rowVersion), `${r.name} ${r.isActive ? "deactivated" : "activated"}`)} /><i /></label></td>
                    <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Edit ${r.name}`} onClick={() => start(r)}><Pencil /></button></td>
                  </tr>
                ))}
                {rows && !rows.length && <tr><td colSpan={columns.length + 2}><EmptyState title={`No ${noun}s yet`} description={subtitle} /></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!removing) return;
        const r = removing;
        setRemoving(null);
        await run(() => remove(r.id, r.rowVersion), `${r.name} deleted`, () => setEdit(null));
      }}>Only a {noun} nothing uses can be deleted; otherwise deactivate it.</ConfirmDialog>
    </>
  );
}
