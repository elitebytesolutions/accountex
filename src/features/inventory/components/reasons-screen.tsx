"use client";

import { ArrowDownToLine, ArrowUpFromLine, History, ListChecks, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LEDGER_TYPES_BY_DIRECTION, REASON_DIRECTIONS, REASON_ICONS, type MovementReason, type ReasonDirection } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createReason, deleteReason, listReasons, reasonExpenseAccounts, setReasonActive, updateReason } from "../api";
import { NamedIcon } from "./named-icon";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = { code: string; label: string; hint: string; icon: string; ledgerMovementType: string; expenseAccountId: string; sortOrder: string };
const LOOKUPS = ["StockMovementReasonLedgerMovementType"];
const TAB_LABEL: Record<ReasonDirection, string> = { IN: "Stock in", OUT: "Stock out", ADJ: "Adjustment" };
const TONE: Record<ReasonDirection, string> = { IN: "teal", OUT: "red", ADJ: "violet" };

/**
 * Inventory › Stock › Movement Reasons. No template (Stock Adjustments only shows a by-reason report; decided 2026-10-05):
 * the template's page head, tabs, table and drawer. Standard reasons are seeded per company and can't be deleted.
 */
export function ReasonsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [rows, setRows] = useState<MovementReason[] | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<ReasonDirection>("OUT");
  const [edit, setEdit] = useState<MovementReason | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [removing, setRemoving] = useState<MovementReason | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listReasons(), reasonExpenseAccounts()])
      .then(([r, a]) => { if (!cancelled) { setRows(r); setAccounts(a); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load reasons" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const all = useMemo(() => rows ?? [], [rows]);
  const shown = all.filter((r) => r.direction === tab);
  const row = edit && edit !== "new" ? edit : null;
  const direction = (row?.direction as ReasonDirection | undefined) ?? tab;
  const open = (r: MovementReason | "new") => {
    setEdit(r);
    setErrs({});
    setHistory(false);
    setForm(r === "new"
      ? { code: "", label: "", hint: "", icon: "", ledgerMovementType: LEDGER_TYPES_BY_DIRECTION[tab][0]!, expenseAccountId: "", sortOrder: String((Math.max(0, ...shown.map((x) => x.sortOrder)) + 10)) }
      : { code: r.code, label: r.label, hint: r.hint ?? "", icon: r.icon ?? "", ledgerMovementType: r.ledgerMovementType, expenseAccountId: r.expenseAccount?.id ?? "", sortOrder: String(r.sortOrder) });
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => (x ? { ...x, [k]: v } : x));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    const body = { code: form.code, label: form.label, hint: form.hint || null, icon: form.icon || null, ledgerMovementType: form.ledgerMovementType, expenseAccountId: form.expenseAccountId || null, sortOrder: form.sortOrder };
    try {
      const r = row ? await updateReason(row.id, { ...body, rowVersion: row.rowVersion }) : await createReason({ ...body, direction: tab });
      toast(`${r.label} saved`, { tone: "good" });
      setEdit(null);
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the reason"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (r: MovementReason) => {
    try {
      await setReasonActive(r.id, !r.isActive, r.rowVersion);
      toast(`${r.label} ${r.isActive ? "deactivated" : "activated"}`, { tone: r.isActive ? "warn" : "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update"), { tone: "danger" });
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const count = (d: ReasonDirection) => all.filter((r) => r.direction === d).length;
  const writeOffs = all.filter((r) => r.ledgerMovementType === "WRITE_OFF");

  return (
    <>
      <PageHead
        eyebrow="Inventory / Movement Reasons"
        title="Stock Movement Reasons"
        description="Why stock comes in, goes out or is adjusted. Stock in / out and adjustments pick one; write-offs post to the reason's expense account."
        actions={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New reason</Button>}
      />
      <div className="kpi-grid">
        <div className="kpi teal"><div className="kpi-top"><span>Stock in</span><span className="icon-well"><ArrowDownToLine /></span></div><strong>{count("IN")}</strong><small>Opening, received without a document…</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Stock out</span><span className="icon-well"><ArrowUpFromLine /></span></div><strong>{count("OUT")}</strong><small>Damaged, expired, internal use…</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Adjustments</span><span className="icon-well"><Scale /></span></div><strong>{count("ADJ")}</strong><small>Count variances</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Write-offs without account</span><span className="icon-well"><ListChecks /></span></div><strong>{writeOffs.filter((r) => !r.expenseAccount).length}</strong><small>Set an expense account before the first adjustment</small></div>
      </div>
      <Tabs items={REASON_DIRECTIONS.map((d) => ({ key: d, label: TAB_LABEL[d], count: count(d) }))} active={tab} onChange={setTab} />
      <div className="panel flush">
        <div className="panel-head"><div><h3>{TAB_LABEL[tab]} reasons</h3><p>Shown in this order on stock documents</p></div></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Reason</th><th>Ledger movement</th><th>Expense account</th><th className="num">Order</th><th>Active</th><th /></tr></thead>
            <tbody>
              {!rows && <tr><td colSpan={6}><Skeleton style={{ height: 18 }} /></td></tr>}
              {shown.map((r) => (
                <tr key={r.id} className={cn(!r.isActive && "muted")}>
                  <td>
                    <span className="row" style={{ gap: 12 }}>
                      <span className={cn("icon-well", TONE[tab])}><NamedIcon name={r.icon} /></span>
                      <span><b>{r.label}</b> {r.isSystem && <span className="badge neutral" style={{ marginLeft: 6 }}>Standard</span>}<small>{r.code}{r.hint ? ` · ${r.hint}` : ""}</small></span>
                    </span>
                  </td>
                  <td>{labelOf(lookups, "StockMovementReasonLedgerMovementType", r.ledgerMovementType)}</td>
                  <td>{r.expenseAccount ? <>{r.expenseAccount.code}<small>{r.expenseAccount.name}</small></> : <span className={r.ledgerMovementType === "WRITE_OFF" ? "badge warn" : "muted"}>{r.ledgerMovementType === "WRITE_OFF" ? "Not set" : "—"}</span>}</td>
                  <td className="num">{r.sortOrder}</td>
                  <td><label className="switch"><input type="checkbox" checked={r.isActive} disabled={!can.edit} onChange={() => toggle(r)} aria-label={`${r.label} active`} /><i /></label></td>
                  <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Edit ${r.label}`} onClick={() => open(r)}><Pencil /></button></td>
                </tr>
              ))}
              {rows && !shown.length && <tr><td colSpan={6}><EmptyState icon={<ListChecks />} title={`No ${TAB_LABEL[tab].toLowerCase()} reasons`} description="Add the reasons your team picks when stock moves without a purchase or sale." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New reason</Button>} /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-foot"><span>{shown.length} reasons</span></div>
      </div>

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={row ? row.label : `New ${TAB_LABEL[tab].toLowerCase()} reason`} subtitle={row?.isSystem ? "Standard reason: edit or deactivate, not delete" : TAB_LABEL[direction]} foot={
        <>
          {row && (
            <span className="row" style={{ marginRight: "auto", gap: 6 }}>
              <button type="button" className="btn ghost" onClick={() => setHistory((h) => !h)}><History />{history ? "Reason" : "History"}</button>
              {can.remove && !row.isSystem && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => setRemoving(row)}><Trash2 />Delete</button>}
            </span>
          )}
          <button type="button" className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
          {(row ? can.edit : can.create) && !history && <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>}
        </>
      }>
        {row && history ? <HistoryTab schema="Inventory" table="StockMovementReasons" id={row.id} /> : form && (
          <FormGrid>
            <Field label="Label" required error={errs.label}><input value={form.label} autoFocus placeholder="e.g. Water damage" onChange={(e) => set("label", e.target.value)} /></Field>
            <Field label="Code" required error={errs.code}><input value={form.code} placeholder="e.g. WATER_DAMAGE" onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s+/g, "_"))} /></Field>
            <Field label="Hint" full error={errs.hint}><input value={form.hint} placeholder="Shown under the reason when picking it" onChange={(e) => set("hint", e.target.value)} /></Field>
            <Field label="Ledger movement" required error={errs.ledgerMovementType}>
              <select value={form.ledgerMovementType} onChange={(e) => set("ledgerMovementType", e.target.value)}>
                {LEDGER_TYPES_BY_DIRECTION[direction].map((t) => <option key={t} value={t}>{labelOf(lookups, "StockMovementReasonLedgerMovementType", t)}</option>)}
              </select>
            </Field>
            <Field label="Order" error={errs.sortOrder}><input inputMode="numeric" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
            <Field label="Expense account" full error={errs.expenseAccountId} hint={form.ledgerMovementType === "WRITE_OFF" ? "Write-offs post their value here" : "Optional"}>
              <select value={form.expenseAccountId} onChange={(e) => set("expenseAccountId", e.target.value)}>
                <option value="">(none)</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                {row?.expenseAccount && !accounts.some((a) => a.id === row.expenseAccount!.id) && <option value={row.expenseAccount.id}>{row.expenseAccount.code} {row.expenseAccount.name}</option>}
              </select>
            </Field>
            <Field label="Icon" full>
              <div className="pr-iconpick">{REASON_ICONS.map((ic) => <button key={ic} type="button" className={cn(form.icon === ic && "on")} aria-label={ic} onClick={() => set("icon", form.icon === ic ? "" : ic)}><NamedIcon name={ic} /></button>)}</div>
            </Field>
          </FormGrid>
        )}
      </Drawer>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.label ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!removing) return;
        try {
          await deleteReason(removing.id, removing.rowVersion);
          toast(`${removing.label} deleted`, { tone: "good" });
          setEdit(null);
          reload();
        } catch (e) {
          toast(apiMessage(e, "Could not delete"), { tone: "danger" });
        } finally {
          setRemoving(null);
        }
      }}>Only reasons no stock movement uses can be deleted, and the code can&apos;t be used again. Otherwise deactivate it.</ConfirmDialog>
    </>
  );
}
