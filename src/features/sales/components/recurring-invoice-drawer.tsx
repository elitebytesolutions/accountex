"use client";

import { Check as CheckIcon, FilePenLine, History, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReceivablesOptions, RecurringInvoice } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createRecurring, deleteRecurring, getRecurring, recurringAction, updateRecurring } from "@/features/receivables/completion-api";

export type RecurringCan = { create: boolean; edit: boolean; post: boolean; delete: boolean };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const grp = (v: number, dec = 2) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const rs = (v: number, dec = 0) => `Rs ${grp(v, dec)}`;
export const parseIso = (d: string) => new Date(`${d}T00:00:00`);
export const dstr = (d: Date, year = true) => `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ""}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayIso = () => iso(new Date());
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const freqLabel = (f: string, every: number | null) =>
  f === "CUSTOM" ? `Every ${every ?? 30} days` : f === "WEEKLY" ? "Weekly" : f === "QUARTERLY" ? "Quarterly" : "Monthly";
export const endLabel = (p: Pick<RecurringInvoice, "endMode" | "endDate" | "maxRuns">) =>
  p.endMode === "ON_DATE" && p.endDate ? dstr(parseIso(p.endDate)) : p.endMode === "AFTER_RUNS" ? `after ${p.maxRuns} runs` : "never";
export const statusBadge = (s: string) =>
  s === "ACTIVE" ? <Badge tone="good" dot>Active</Badge> : s === "PAUSED" ? <Badge tone="neutral" dot>Paused</Badge> : <Badge tone="warn" dot>Ended</Badge>;

/** The template's next-runs timeline (template 9A-company-plus.js nextDates). */
function nextDates(start: Date, freq: string, every: number, n: number, end: Date | null) {
  const out: Date[] = [];
  let d = new Date(start);
  for (let i = 0; i < n; i++) {
    if (end && d > end) break;
    out.push(new Date(d));
    if (freq === "WEEKLY") d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    else if (freq === "CUSTOM") d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (every || 30));
    else {
      const m = freq === "MONTHLY" ? 1 : 3;
      const day = start.getDate();
      d = new Date(d.getFullYear(), d.getMonth() + m, 1);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    }
  }
  return out;
}

type Line = { itemId: string; description: string; qty: string; rate: string; useCurrentPrice: boolean; taxRate: string };
const blankLine = (): Line => ({ itemId: "", description: "", qty: "1", rate: "0", useCurrentPrice: true, taxRate: "0" });

/** New / edit profile (template "New recurring profile" drawer): customer, template lines, schedule with the next-6-runs timeline, delivery. */
export function RecurringEditor({ profile, options, onClose, onSaved }: {
  profile: RecurringInvoice | null;
  options: ReceivablesOptions;
  onClose: () => void;
  onSaved: (p: RecurringInvoice) => void;
}) {
  const toast = useToast();
  const firstCust = options.customers[0];
  const [f, setF] = useState(() => ({
    name: profile?.name ?? "Monthly supply agreement",
    customerId: profile?.customer.id ?? firstCust?.id ?? "",
    branchId: profile?.branch?.id ?? firstCust?.branchId ?? options.branches[0]?.id ?? "",
    warehouseId: profile?.warehouse?.id ?? options.warehouses[0]?.id ?? "",
    paymentTerms: profile?.paymentTerms ?? firstCust?.paymentTerms ?? options.paymentTerms[0]?.code ?? "NET_30",
    frequency: profile?.frequency ?? "MONTHLY",
    everyDays: String(profile?.everyDays ?? 30),
    startDate: profile?.startDate ?? todayIso(),
    endMode: profile?.endMode ?? "NEVER",
    endDate: profile?.endDate ?? "",
    maxRuns: String(profile?.maxRuns ?? 12),
    saveAsDraft: profile?.saveAsDraft ?? false,
  }));
  const [lines, setLines] = useState<Line[]>(() => profile?.lines.length
    ? profile.lines.map((l) => ({ itemId: l.item?.id ?? "", description: l.item ? "" : l.description, qty: String(l.qty), rate: String(l.rate), useCurrentPrice: l.useCurrentPrice, taxRate: String(l.taxRate) }))
    : [blankLine()]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const product = (id: string) => options.products.find((p) => p.id === id);
  const lineAmt = (l: Line) => {
    const p = product(l.itemId);
    const rate = l.useCurrentPrice && p ? p.price : Number(l.rate) || 0;
    const net = r2((Number(l.qty) || 0) * rate);
    return { rate, net, tax: r2((net * (Number(l.taxRate) || 0)) / 100) };
  };
  const total = r2(lines.reduce((s, l) => { const a = lineAmt(l); return s + a.net + a.tax; }, 0));
  const runs = useMemo(() => {
    const end = f.endMode === "ON_DATE" && f.endDate ? parseIso(f.endDate) : null;
    const n = f.endMode === "AFTER_RUNS" ? Math.min(6, Number(f.maxRuns) || 1) : 6;
    return f.startDate ? nextDates(parseIso(f.startDate), f.frequency, Number(f.everyDays) || 30, n, end) : [];
  }, [f.startDate, f.frequency, f.everyDays, f.endMode, f.endDate, f.maxRuns]);

  const save = async () => {
    setBusy(true);
    setErrs({});
    const body = {
      ...f, everyDays: f.frequency === "CUSTOM" ? Number(f.everyDays) : null, endDate: f.endMode === "ON_DATE" ? f.endDate : null,
      maxRuns: f.endMode === "AFTER_RUNS" ? Number(f.maxRuns) : null, warehouseId: f.warehouseId || null,
      lines: lines.map((l) => {
        const p = product(l.itemId);
        return { itemId: l.itemId || null, description: l.itemId ? p?.name ?? null : l.description, qty: Number(l.qty), rate: lineAmt(l).rate, useCurrentPrice: !!l.itemId && l.useCurrentPrice, taxRate: Number(l.taxRate) || 0 };
      }),
    };
    try {
      const saved = profile ? await updateRecurring(profile.id, { ...body, rowVersion: profile.rowVersion }) : await createRecurring(body);
      toast(profile ? `${saved.docNo} saved` : `${saved.docNo} created · first invoice on ${saved.nextRunDate ? dstr(parseIso(saved.nextRunDate)) : "—"}`, { tone: "good" });
      onSaved(saved);
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the profile"), { tone: "danger" }); } finally { setBusy(false); }
  };

  return (
    <Drawer open onClose={onClose} wide className="cp-ri-drawer" title={profile ? `Edit ${profile.docNo}` : "New recurring profile"} subtitle="Raise the same invoice on a schedule"
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={() => void save()}><CheckIcon />{busy ? "Saving…" : "Save profile"}</button></>}>
      <FormGrid>
        <Field label="Customer" required error={errs.customerId}>
          <Select value={f.customerId} onChange={(e) => { const c = options.customers.find((x) => x.id === e.target.value); set("customerId", e.target.value); if (c) { set("paymentTerms", c.paymentTerms); if (c.branchId) set("branchId", c.branchId); } }}>
            {options.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Profile name" required error={errs.name}><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Branch" required error={errs.branchId}>
          <Select value={f.branchId} onChange={(e) => set("branchId", e.target.value)}>{options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        </Field>
        <Field label="Warehouse" error={errs.warehouseId} hint="Where the goods leave from">
          <Select value={f.warehouseId} onChange={(e) => set("warehouseId", e.target.value)}><option value="">—</option>{options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
        </Field>
        <Field label="Payment terms" required error={errs.paymentTerms}>
          <Select value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)}>{options.paymentTerms.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</Select>
        </Field>
      </FormGrid>

      <h4 className="cp-h4">Template lines</h4>
      <div className="table-wrap cp-ln-wrap">
        <table className="tbl lines cp-ln" data-plain="">
          <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Tax %</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const a = lineAmt(l);
              return (
                <tr key={i}>
                  <td>
                    <select className="cp-ln-i" value={l.itemId} aria-label="Item" onChange={(e) => { const p = product(e.target.value); setLine(i, { itemId: e.target.value, rate: p ? String(p.price) : l.rate, taxRate: p ? String(p.gstRate) : l.taxRate }); }}>
                      <option value="">Service / description…</option>
                      {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                    </select>
                    {!l.itemId && <input className="cell-input" style={{ marginTop: 6, width: "100%" }} placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />}
                    {l.itemId && <label className="check" style={{ marginTop: 6, fontSize: 12 }}><input type="checkbox" checked={l.useCurrentPrice} onChange={(e) => setLine(i, { useCurrentPrice: e.target.checked })} /> Use the price on the run date</label>}
                    {errs[`lines.${i}.itemId`] && <small className="hint text-danger">{errs[`lines.${i}.itemId`]}</small>}
                  </td>
                  <td><input className="cp-ln-q num cell-input" type="number" min="0" value={l.qty} aria-label="Qty" onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
                  <td className="num">{l.itemId && l.useCurrentPrice ? grp(a.rate) : <input className="cp-ln-q num cell-input" type="number" min="0" value={l.rate} aria-label="Rate" onChange={(e) => setLine(i, { rate: e.target.value })} />}</td>
                  <td className="num"><input className="cp-ln-q num cell-input" style={{ width: 64 }} type="number" min="0" max="100" value={l.taxRate} aria-label="Tax %" onChange={(e) => setLine(i, { taxRate: e.target.value })} /></td>
                  <td className="num cp-ln-a">{grp(a.net + a.tax)}</td>
                  <td><button type="button" className="icon-btn-sm cp-ln-x" title="Remove" disabled={lines.length <= 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><X /></button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td colSpan={3}><button className="btn ghost sm" type="button" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus />Add line</button></td><td className="num muted">incl. tax</td><td className="num">{rs(total, 2)}</td><td /></tr></tfoot>
        </table>
      </div>

      <h4 className="cp-h4">Schedule</h4>
      <div className="seg cp-rf-fq">
        {(options.lookups.frequencies.length ? options.lookups.frequencies : [{ code: "WEEKLY", label: "Weekly" }, { code: "MONTHLY", label: "Monthly" }, { code: "QUARTERLY", label: "Quarterly" }, { code: "CUSTOM", label: "Custom" }])
          .map((x) => <button key={x.code} type="button" className={cn(f.frequency === x.code && "active")} onClick={() => set("frequency", x.code)}>{x.label}</button>)}
      </div>
      {errs.frequency && <small className="hint text-danger">{errs.frequency}</small>}
      <div className="form-grid c3 cp-mt">
        <Field label="Start date" error={errs.startDate}><Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
        <Field label="End" error={errs.endMode}>
          <Select value={f.endMode} onChange={(e) => set("endMode", e.target.value)}>
            {(options.lookups.endModes.length ? options.lookups.endModes : [{ code: "NEVER", label: "Never" }, { code: "ON_DATE", label: "On a date" }, { code: "AFTER_RUNS", label: "After N runs" }]).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
          </Select>
        </Field>
        {f.frequency === "CUSTOM" && <Field label="Every (days)" error={errs.everyDays}><Input type="number" min="1" value={f.everyDays} onChange={(e) => set("everyDays", e.target.value)} /></Field>}
        {f.endMode === "ON_DATE" && <Field label="End date" error={errs.endDate}><Input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>}
        {f.endMode === "AFTER_RUNS" && <Field label="Number of runs" error={errs.maxRuns}><Input type="number" min="1" value={f.maxRuns} onChange={(e) => set("maxRuns", e.target.value)} /></Field>}
      </div>
      <div className="cp-tl6">
        <div className="cp-tl6-h"><b>Next {runs.length || 6} runs</b><small>{runs.length ? `${runs.length} invoices · ${rs(total * runs.length)} in the window` : ""}</small></div>
        <div className="cp-tl6-line">
          {runs.length ? runs.map((d, i) => (
            <div key={i} className="cp-tl6-pt" style={{ ["--i" as string]: i }}><i /><b>{DOW[d.getDay()]}, {dstr(d, false)}</b><small>{d.getFullYear()}</small><em>{i === 0 ? "First run" : `+${Math.round((d.getTime() - runs[0]!.getTime()) / 864e5)}d`}</em></div>
          )) : <span className="muted small">End date is before the start date.</span>}
        </div>
      </div>

      <h4 className="cp-h4">Delivery</h4>
      <div className="cp-deliv">
        <label className="cp-dv"><span className="cp-ch dr"><FilePenLine /></span><div><b>Keep invoices as drafts</b><small>Review each invoice before posting it; off = posted to receivables on the run date</small></div>
          <span className="switch"><input type="checkbox" checked={f.saveAsDraft} onChange={(e) => set("saveAsDraft", e.target.checked)} /><i /></span></label>
      </div>
    </Drawer>
  );
}

/** Profile detail: schedule, runs, generated invoices, actions and row history. */
export function RecurringView({ id, can, onClose, onEdit, onChanged }: {
  id: string;
  can: RecurringCan;
  onClose: () => void;
  onEdit: (p: RecurringInvoice) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [p, setP] = useState<RecurringInvoice | null>(null);
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getRecurring(id).then((x) => !cancelled && setP(x)).catch((e: unknown) => { toast(apiMessage(e, "Could not load the profile"), { tone: "danger" }); });
    return () => { cancelled = true; };
  }, [id, toast]);

  const act = async (a: "run-now" | "pause" | "resume") => {
    if (!p) return;
    setBusy(true);
    try {
      const x = await recurringAction(p.id, a, p.rowVersion);
      setP(x);
      onChanged();
      if (a === "run-now") toast(`${x.lastInvoice?.docNo ?? "Invoice"} raised for ${x.customer.name}${x.saveAsDraft ? " · saved as draft" : " · posted"}`, { tone: "good" });
      else toast(`${x.docNo} ${a === "pause" ? "paused" : "resumed"}`, { tone: "info" });
    } catch (e) { toast(apiMessage(e, "Could not do that"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!p) return;
    setBusy(true);
    try { await deleteRecurring(p.id, p.rowVersion); toast(`${p.docNo} deleted`, { tone: "good" }); onChanged(); onClose(); } catch (e) { toast(apiMessage(e, "Could not delete"), { tone: "danger" }); } finally { setBusy(false); setConfirm(false); }
  };

  return (
    <>
      <Drawer open onClose={onClose} wide className="cp-ri-drawer" title={p ? `${p.docNo} · ${p.name}` : "Recurring profile"} subtitle={p ? `${p.customer.name} · ${freqLabel(p.frequency, p.everyDays)}` : undefined}
        foot={p && <>
          <button type="button" className="btn ghost" onClick={() => setTab(tab === "history" ? "detail" : "history")}>{tab === "history" ? <><Pencil />Details</> : <><History />History</>}</button>
          {can.delete && p.runsCount === 0 && <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirm(true)}><Trash2 />Delete</button>}
          <span className="spacer" />
          {can.edit && p.status !== "ENDED" && <button type="button" className="btn secondary" disabled={busy} onClick={() => onEdit(p)}><Pencil />Edit</button>}
          {can.edit && p.status === "ACTIVE" && <button type="button" className="btn secondary" disabled={busy} onClick={() => void act("pause")}><Pause />Pause</button>}
          {can.edit && p.status === "PAUSED" && <button type="button" className="btn secondary" disabled={busy} onClick={() => void act("resume")}><Play />Resume</button>}
          {can.post && p.status === "ACTIVE" && <button type="button" className="btn primary" disabled={busy} onClick={() => void act("run-now")}><Play />{busy ? "Generating…" : "Run now"}</button>}
        </>}>
        {!p ? <Skeleton style={{ height: 260 }} /> : tab === "history" ? <HistoryTab schema="Sales" table="RecurringInvoices" id={p.id} /> : (
          <>
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
              <div className="kpi"><div className="kpi-top"><span>Next run</span></div><strong style={{ fontSize: 20 }}>{p.nextRunDate ? dstr(parseIso(p.nextRunDate)) : "—"}</strong><small>{statusBadge(p.status)}</small></div>
              <div className="kpi blue"><div className="kpi-top"><span>Per invoice</span></div><strong style={{ fontSize: 20 }}>{rs(p.amount, 2)}</strong><small>{p.saveAsDraft ? "Kept as draft" : "Posted on the run date"}</small></div>
              <div className="kpi yellow"><div className="kpi-top"><span>Runs</span></div><strong style={{ fontSize: 20 }}>{p.runsCount}</strong><small>Ends {endLabel(p)}</small></div>
            </div>
            <p className="muted small" style={{ margin: "10px 0 0" }}>An hourly job raises due invoices automatically; Run now raises the next one today. Started {dstr(parseIso(p.startDate))} · {p.paymentTerms.replace("_", " ")} · {p.branch?.name ?? "—"}{p.warehouse ? ` · ${p.warehouse.name}` : ""}.</p>
            <h4 className="cp-h4">Template lines</h4>
            <div className="table-wrap cp-ln-wrap">
              <table className="tbl lines cp-ln" data-plain="">
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Tax</th><th className="num">Amount</th></tr></thead>
                <tbody>{p.lines.map((l) => (
                  <tr key={l.id}><td>{l.item ? `${l.item.sku} · ${l.item.name}` : l.description}{l.useCurrentPrice && l.item && <small className="muted" style={{ display: "block" }}>Current price on the run date</small>}</td>
                    <td className="num">{l.qty}</td><td className="num">{grp(l.rate)}</td><td className="num">{grp(l.taxAmount)}</td><td className="num">{grp(l.totalAmount)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <h4 className="cp-h4">Generated invoices</h4>
            {p.invoices.length ? (
              <div className="table-wrap cp-ln-wrap">
                <table className="tbl" data-plain="">
                  <thead><tr><th>Invoice</th><th>Date</th><th className="num">Amount (Rs)</th><th>Status</th></tr></thead>
                  <tbody>{p.invoices.map((i) => (
                    <tr key={i.id}><td><Link className="link" href={`/sales/invoices/${i.id}`}>{i.docNo}</Link></td><td>{dstr(parseIso(i.docDate))}</td><td className="num">{grp(i.netAmount)}</td>
                      <td><Badge tone={i.status === "DRAFT" ? "neutral" : i.status === "PAID" ? "good" : i.status === "VOID" ? "danger" : "info"} dot>{i.status.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge></td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="muted small">No invoices yet. The first one is raised on {p.nextRunDate ? dstr(parseIso(p.nextRunDate)) : "the start date"}.</p>}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void remove()} title={`Delete ${p?.docNo ?? ""}?`} confirmLabel="Delete" danger busy={busy}>
        The profile has not raised any invoice yet. This can’t be undone.
      </ConfirmDialog>
    </>
  );
}
