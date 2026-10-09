"use client";

import {
  ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, ChartColumn, Check, CircleAlert, Download, Eye, FileText, FolderOpen, History, Info, MapPin, Package, Plus, Save, ScanBarcode,
  Search, Settings, ShieldCheck, Trash2, TriangleAlert, Upload, User, UserCheck, Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StockEntry, StockEntryList, StockOnHand, StockOpsOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { NamedIcon } from "./named-icon";
import {
  cancelStockEntry, createStockEntry, deleteStockEntry, getStockEntry, listStockEntries, postStockEntry, stockOnHand, stockOpsOptions, updateStockEntry,
} from "../stock-ops-api";

type Can = { create: boolean; edit: boolean; post: boolean };
type Mode = "IN" | "OUT";
type Line = { key: string; itemId: string; batchId: string; newBatchNo: string; newExpiryDate: string; qty: string; unitCost: string };
type Form = { id: string | null; rowVersion: number; docNo: string | null; mode: Mode; docDate: string; warehouseId: string; binId: string; reasonId: string; manualRef: string; requestedByName: string; notes: string; lines: Line[] };

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
let seq = 0;
const key = () => `l${++seq}`;
const STATUS_TONE: Record<string, Tone> = { DRAFT: "neutral", POSTED: "good", CANCELLED: "danger" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", POSTED: "Posted", CANCELLED: "Cancelled" };
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

const blank = (mode: Mode, o: StockOpsOptions | null): Form => ({
  id: null, rowVersion: 0, docNo: null, mode, docDate: today(), warehouseId: o?.warehouses[0]?.id ?? "", binId: "",
  reasonId: o?.reasons.find((r) => r.direction === mode)?.id ?? "", manualRef: "", requestedByName: "", notes: "", lines: [],
});

/** Template app/inventory/stock-in-out (4C-stock-ops.html + 9G-stock-ops.js §1): manual stock in / out with reasons, validation and recent entries. */
export function StockInOutScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [opts, setOpts] = useState<StockOpsOptions | null>(null);
  const [optError, setOptError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => blank("IN", null));
  const [onHand, setOnHand] = useState<StockOnHand>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [list, setList] = useState<StockEntryList | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(params.get("entry"));

  useEffect(() => {
    stockOpsOptions().then((o) => { setOpts(o); setForm((f) => (f.warehouseId ? f : blank(f.mode, o))); }).catch((e: unknown) => setOptError(errMsg(e, "Could not load the stock options")));
  }, []);
  useEffect(() => {
    if (!form.warehouseId) return;
    let off = false;
    stockOnHand(form.warehouseId).then((s) => !off && setOnHand(s)).catch(() => !off && setOnHand([]));
    return () => { off = true; };
  }, [form.warehouseId, attempt]);
  useEffect(() => {
    let off = false;
    const t = setTimeout(() => {
      listStockEntries({ status, search: q, pageSize: 50 }).then((l) => { if (!off) { setList(l); setListErr(null); } }).catch((e: unknown) => !off && setListErr(errMsg(e, "Could not load the entries")));
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [status, q, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const product = useCallback((id: string) => opts?.products.find((p) => p.id === id), [opts]);
  const wh = opts?.warehouses.find((w) => w.id === form.warehouseId);
  const reasons = (opts?.reasons ?? []).filter((r) => r.direction === form.mode);
  const reason = reasons.find((r) => r.id === form.reasonId);
  const avail = (l: Line) => onHand.filter((s) => s.itemId === l.itemId && (!l.batchId || s.batchId === l.batchId)).reduce((s, x) => s + x.qtyOnHand, 0);
  const costOf = (l: Line) => (form.mode === "IN" ? num(l.unitCost) : product(l.itemId)?.avgCost ?? 0);

  const issues = useMemo(() => {
    const out: string[] = [];
    if (!form.reasonId) out.push("Choose a movement reason");
    if (!form.warehouseId) out.push("Select a warehouse");
    if (!form.lines.length) out.push("Add at least one product");
    form.lines.forEach((l, i) => {
      const p = product(l.itemId);
      if (!(num(l.qty) > 0)) out.push(`Line ${i + 1}: quantity must be more than zero`);
      if (form.mode === "IN" && p?.trackExpiry && (!l.newBatchNo || !l.newExpiryDate)) out.push(`Line ${i + 1}: enter the batch no. and expiry for ${p.name}`);
      if (form.mode === "OUT" && num(l.qty) > avail(l)) out.push(`Line ${i + 1}: ${fmt(num(l.qty))} exceeds ${fmt(avail(l))} available`);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, onHand, opts]);
  const totals = { items: form.lines.length, qty: form.lines.reduce((s, l) => s + num(l.qty), 0), value: form.lines.reduce((s, l) => s + num(l.qty) * costOf(l), 0) };

  const setMode = (mode: Mode) => setForm((f) => (f.mode === mode ? f : { ...f, mode, reasonId: opts?.reasons.find((r) => r.direction === mode)?.id ?? "", lines: f.lines.map((l) => ({ ...l, newBatchNo: "", newExpiryDate: "", batchId: "" })) }));
  const setLine = (k: string, patch: Partial<Line>) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === k ? { ...l, ...patch } : l)) }));
  const addProduct = (text: string) => {
    const v = text.trim().toLowerCase();
    if (!v) { toast("Type a product name, code or barcode first", { tone: "warn" }); return; }
    const code = v.includes(" · ") ? v.split(" · ").pop()! : v;
    const p = opts?.products.find((x) => x.sku.toLowerCase() === code || x.upc === code) ?? opts?.products.find((x) => x.name.toLowerCase().includes(code) || x.sku.toLowerCase().includes(code));
    if (!p) { toast(`No product matches “${text}”`, { tone: "warn" }); return; }
    const ex = form.lines.find((l) => l.itemId === p.id);
    if (ex) setLine(ex.key, { qty: String(num(ex.qty) + 1) });
    else setForm((f) => ({ ...f, lines: [...f.lines, { key: key(), itemId: p.id, batchId: "", newBatchNo: "", newExpiryDate: "", qty: "1", unitCost: String(p.avgCost || "") }] }));
    setSearch("");
  };

  const save = async (andPost: boolean) => {
    if (andPost && issues.length) { toast(`Fix ${issues.length} issue${issues.length > 1 ? "s" : ""} before posting`, { tone: "warn" }); return; }
    if (!form.lines.length) { toast("Add at least one product", { tone: "warn" }); return; }
    setBusy(andPost ? "post" : "draft"); setErrors({});
    const body = {
      mode: form.mode, docDate: form.docDate, warehouseId: form.warehouseId, binId: form.binId || null, reasonId: form.reasonId, manualRef: form.manualRef || null,
      requestedByName: form.requestedByName || null, notes: form.notes || null,
      lines: form.lines.map((l) => ({ itemId: l.itemId, batchId: l.batchId || null, newBatchNo: l.newBatchNo || null, newExpiryDate: l.newExpiryDate || null, qty: num(l.qty), unitCost: form.mode === "IN" ? num(l.unitCost) : 0 })),
    };
    let saved: StockEntry | null = null;
    try {
      saved = form.id ? await updateStockEntry(form.id, { ...body, rowVersion: form.rowVersion }) : await createStockEntry(body);
      if (andPost) saved = await postStockEntry(saved.id, saved.rowVersion);
      toast(`${saved.docNo} ${andPost ? "posted" : "saved as draft"} · ${saved.totalItems} item${saved.totalItems === 1 ? "" : "s"}, ${fmt(saved.totalQty)} units`, { tone: andPost ? "good" : "info" });
      setForm(blank(form.mode, opts)); reload();
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, m]) => [k, m[0] ?? ""])));
      if (saved) setForm((f) => ({ ...f, id: saved!.id, rowVersion: saved!.rowVersion, docNo: saved!.docNo }));
      toast(`${err?.code === "STOCK_INSUFFICIENT" ? "Not enough stock: " : ""}${errMsg(e, "Could not save the entry")}${saved && andPost ? " · kept as draft" : ""}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  const editDraft = (e: StockEntry) => {
    setDetailId(null);
    setForm({
      id: e.id, rowVersion: e.rowVersion, docNo: e.docNo, mode: e.mode as Mode, docDate: e.docDate, warehouseId: e.warehouse.id, binId: e.bin?.id ?? "", reasonId: e.reason.id,
      manualRef: e.manualRef ?? "", requestedByName: e.requestedByName ?? "", notes: e.notes ?? "",
      lines: e.lines.map((l) => ({ key: key(), itemId: l.item.id, batchId: "", newBatchNo: e.mode === "IN" ? l.batchNo ?? "" : "", newExpiryDate: e.mode === "IN" ? l.expiryDate ?? "" : "", qty: String(l.qty), unitCost: String(l.unitCost) })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (optError && !opts) return <ErrorState message={optError} onRetry={() => location.reload()} />;
  const mode = form.mode;
  const err = (k: string) => errors[k];
  const items = list?.items ?? [];

  return (
    <div className="so-root">
      <div className="so-io" data-mode={mode.toLowerCase()}>
        <div className="so-head">
          <span className="so-head-ico"><ArrowDownUp /></span>
          <div className="so-head-t">
            <div className="so-crumb">Inventory <ArrowRight /> <b>Stock In / Out</b></div>
            <h1>Manual Stock In / Stock Out</h1>
            <p>Create manual inventory movement entries to adjust stock quantities in your warehouse.</p>
          </div>
          <div className="so-head-r">
            {form.id && <Button variant="ghost" onClick={() => setForm(blank(mode, opts))}>New entry</Button>}
            {can.create && <Button variant="secondary" icon={<Save />} disabled={!!busy} onClick={() => save(false)}>{busy === "draft" ? "Saving…" : "Save as Draft"}</Button>}
            {can.create && can.post && <Button variant="primary" className="so-acc-btn" icon={<Check />} disabled={!!busy} onClick={() => save(true)}>{busy === "post" ? "Posting…" : "Save & Post"}</Button>}
          </div>
        </div>

        <div className="so-modes" role="tablist">
          {(["IN", "OUT"] as Mode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={cn("so-mode", mode === m && "on")} data-mode={m.toLowerCase()} onClick={() => setMode(m)} disabled={!!form.id && form.mode !== m}>
              <span className="so-mode-ico">{m === "IN" ? <Upload /> : <Download />}</span>
              <span><b>{m === "IN" ? "Manual Stock In" : "Manual Stock Out"}</b><small>{m === "IN" ? "Add stock to increase inventory" : "Remove stock from inventory"}</small></span>
              <em><Check /></em>
            </button>
          ))}
          <i className="so-mode-ink" />
        </div>

        <div className="so-io-grid">
          <div className="panel so-io-info">
            <div className="so-ph"><span className="so-ph-ico"><FileText /></span><h3>Entry Information</h3></div>
            <div className="so-fg c3">
              <label><span>Entry No.</span><div className="so-inp-gear"><input className="so-entry-no" readOnly value={form.docNo ?? `${mode === "IN" ? "MI" : "MO"}-… (on save)`} /><span className="so-gear" title="Numbered from the MI / MO series"><Settings /></span></div></label>
              <label><span>Entry Date</span><input type="date" value={form.docDate} onChange={(e) => setForm({ ...form, docDate: e.target.value || today() })} /></label>
              <label><span>Manual Reference No.</span><input value={form.manualRef} placeholder="e.g. ADJ-2026-001" onChange={(e) => setForm({ ...form, manualRef: e.target.value })} /></label>
              <label><span>Movement Reason <em>*</em></span><div className={cn("so-sel", err("reasonId") && "bad")}><NamedIcon name={reason?.icon} /><select value={form.reasonId} onChange={(e) => setForm({ ...form, reasonId: e.target.value })}><option value="">Select reason</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div></label>
              <label><span>Warehouse <em>*</em></span><div className="so-sel"><Warehouse /><select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value, binId: "" })}>{opts?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div></label>
              <label><span>Location / Shelf / Rack</span><div className="so-sel"><MapPin /><select value={form.binId} onChange={(e) => setForm({ ...form, binId: e.target.value })}><option value="">No bin</option>{wh?.bins.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></div></label>
            </div>
            <div className="so-fg c2">
              <label><span>Requested By</span><div className="so-sel"><User /><input value={form.requestedByName} list="so-io-people" placeholder="Name of the requester" onChange={(e) => setForm({ ...form, requestedByName: e.target.value })} /></div></label>
              <label><span>Entered By <em>*</em></span><div className="so-sel ro"><UserCheck /><input readOnly value="You" /></div></label>
            </div>
            <datalist id="so-io-people">{opts?.users.map((u) => <option key={u.id} value={u.name} />)}</datalist>
            <label className="so-fg-full"><span>Notes</span><textarea rows={2} maxLength={500} value={form.notes} placeholder="Add notes about this manual stock movement (optional)…" onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>

          <div className="panel so-io-reasons">
            <div className="so-ph"><span className="so-ph-ico"><FolderOpen /></span><h3>Movement Reasons</h3></div>
            <div className="so-reason-grid">
              {!opts ? <Skeleton style={{ height: 120 }} /> : reasons.map((r, i) => (
                <button key={r.id} type="button" className={cn("so-rtile", r.id === form.reasonId && "on")} style={{ ["--i" as string]: i }} title={r.label} onClick={() => setForm({ ...form, reasonId: r.id })}>
                  <span><NamedIcon name={r.icon} /></span><b>{r.label}</b>
                </button>
              ))}
            </div>
            <div className="so-reason-note"><Info /><span>Select a reason that best describes this stock movement. It decides the account the value posts to.</span></div>
          </div>

          <div className="so-io-side">
            <div className="panel so-sum">
              <div className="so-ph"><span className="so-ph-ico"><ChartColumn /></span><h3>Entry Summary</h3></div>
              <div className="so-sum-rows">
                <div><span>Total Items</span><b>{fmt(totals.items)}</b></div>
                <div><span>Total Quantity</span><b>{fmt(totals.qty)}</b></div>
                <div className="big"><span>Total Value (Rs.)</span><b>{fmt(totals.value, 2)}</b></div>
              </div>
              <div className="so-movebox"><span className="so-movebox-ico">{mode === "IN" ? <ArrowUp /> : <ArrowDown />}</span><div><small>Movement Type</small><b>{mode === "IN" ? "Stock In" : "Stock Out"}</b><p>{mode === "IN" ? "Stock will be increased after posting." : "Stock will be reduced after posting (valued at average cost)."}</p></div></div>
            </div>
            <div className="panel so-valid">
              <div className="so-ph"><span className="so-ph-ico"><ShieldCheck /></span><h3>Validation</h3></div>
              <div className={cn("so-valid-box", issues.length ? "bad" : "ok")}>
                {issues.length ? (
                  <>
                    <div className="so-vb-top"><span><TriangleAlert /></span><div><b>Needs attention</b><p>{issues.length} issue{issues.length > 1 ? "s" : ""} to fix before posting.</p></div></div>
                    <ul>{issues.slice(0, 5).map((x) => <li key={x}><CircleAlert />{x}</li>)}{issues.length > 5 && <li className="more">+{issues.length - 5} more</li>}</ul>
                  </>
                ) : (
                  <div className="so-vb-top"><span><Check /></span><div><b>Ready to post</b><p>All information looks good. You can save as draft or post this entry.</p></div></div>
                )}
              </div>
            </div>
          </div>

          <div className="panel so-io-lines">
            <div className="so-lines-head">
              <div className="so-ph"><span className="so-ph-ico"><Package /></span><h3>Add Products</h3></div>
              <label className="so-search"><Search /><input value={search} list="so-io-dl" placeholder="Search product by name, code or barcode…" autoComplete="off"
                onChange={(e) => { setSearch(e.target.value); if (e.target.value.includes(" · ")) addProduct(e.target.value); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProduct(search); } }} /><span className="so-scan" title="Scan with a barcode reader into this box"><ScanBarcode /></span></label>
              <datalist id="so-io-dl">{opts?.products.map((p) => <option key={p.id} value={`${p.name} · ${p.sku}`}>{p.upc ?? ""}</option>)}</datalist>
              <Button variant="primary" className="so-acc-btn so-additem" icon={<Plus />} onClick={() => addProduct(search)}>Add Item</Button>
            </div>
            <div className="table-wrap"><table className="tbl so-lines" data-plain>
              <thead><tr><th>#</th><th>Product</th><th>UPC / Barcode</th><th>Batch</th><th className="num">Quantity</th><th className="num">Unit Cost (Rs.)</th><th className="num">Total Value (Rs.)</th><th className="so-c">Actions</th></tr></thead>
              <tbody>
                {!form.lines.length ? (
                  <tr className="so-empty-row"><td colSpan={8}><div className="so-empty"><ScanBarcode /><b>No products yet</b><span>Search, pick from the list or scan a barcode to add items.</span></div></td></tr>
                ) : form.lines.map((l, i) => {
                  const p = product(l.itemId);
                  const a = avail(l);
                  const over = mode === "OUT" && num(l.qty) > a;
                  const batches = onHand.filter((s) => s.itemId === l.itemId && s.batchId);
                  return (
                    <tr key={l.key} className={cn(over && "so-over")}>
                      <td className="so-idx">{i + 1}</td>
                      <td><div className="so-prod"><span className="so-pt"><Package /></span><div><b>{p?.name ?? "?"}</b><small>{p?.sku}{p?.trackExpiry ? " · expiry-tracked" : ""}</small></div></div></td>
                      <td className="so-mono">{p?.upc ?? "—"}</td>
                      <td>
                        {mode === "IN" ? (p?.trackExpiry ? (
                          <div className="so-batch-in">
                            <input className={cn("so-cell-in", err(`lines.${i}.newBatchNo`) && "bad")} placeholder="Batch no." value={l.newBatchNo} onChange={(e) => setLine(l.key, { newBatchNo: e.target.value })} />
                            <input className="so-cell-in" type="date" aria-label="Expiry" value={l.newExpiryDate} onChange={(e) => setLine(l.key, { newExpiryDate: e.target.value })} />
                          </div>
                        ) : <input className="so-cell-in" placeholder="Batch no. (optional)" value={l.newBatchNo} onChange={(e) => setLine(l.key, { newBatchNo: e.target.value })} />)
                          : batches.length ? (
                            <select className="so-cell-sel" value={l.batchId} onChange={(e) => setLine(l.key, { batchId: e.target.value })}>
                              <option value="">Earliest expiry first</option>
                              {batches.map((b) => <option key={b.batchId!} value={b.batchId!}>{b.batchNo}{b.expiryDate ? ` · EXP ${b.expiryDate.slice(5, 7)}/${b.expiryDate.slice(0, 4)}` : ""} · avail {fmt(b.qtyOnHand)}</option>)}
                            </select>
                          ) : <span className="so-muted">No batch tracking</span>}
                      </td>
                      <td className="num"><input className="so-cell-in num" type="number" min="0" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                        <small className={cn("so-avail", over && "bad")}>{mode === "OUT" ? (over ? `Only ${fmt(a)} available` : `${fmt(a)} ${p?.unit ?? ""} available`) : `${p?.unit ?? ""} · ctn of ${p?.ctn ?? 1}`}</small></td>
                      <td className="num">{mode === "IN" ? <input className="so-cell-in num w" type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: e.target.value })} /> : <span title="Stock out is valued at average cost">{fmt(costOf(l), 2)}</span>}</td>
                      <td className="num so-lv">{fmt(num(l.qty) * costOf(l), 2)}</td>
                      <td className="so-c"><button type="button" className="so-del" aria-label="Remove line" onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((x) => x.key !== l.key) }))}><Trash2 /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </div>

        <div className="panel flush so-recent">
          <div className="so-ph pad">
            <span className="so-ph-ico"><History /></span><h3>Recent Manual Entries</h3>
            {list && <span className="so-muted" style={{ marginLeft: 12 }}>This month: in Rs {fmt(list.kpis.inValue)} · out Rs {fmt(list.kpis.outValue)} · {list.kpis.drafts} draft{list.kpis.drafts === 1 ? "" : "s"}</span>}
            <span className="spacer" />
            <label className="so-search" style={{ maxWidth: 220 }}><Search /><input value={q} placeholder="Entry no., ref…" onChange={(e) => setQ(e.target.value)} /></label>
            <select className="so-cell-sel" style={{ width: 140 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All ({Object.values(list?.counts ?? {}).reduce((s, n) => s + n, 0)})</option>
              {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({list?.counts[s] ?? 0})</option>)}
            </select>
            <Button variant="ghost" size="sm" icon={<Download />} onClick={() => downloadCsv("stock-in-out", [["Date", "Entry No.", "Type", "Reason", "Reference", "Items", "Quantity", "Value", "Status"], ...items.map((r) => [r.docDate, r.docNo, r.mode, r.reason.label, r.manualRef, r.totalItems, r.totalQty, r.totalValue, r.status])])}>CSV</Button>
          </div>
          {listErr && !list ? <ErrorState message={listErr} onRetry={reload} /> : !list ? <Skeleton style={{ height: 180 }} /> : !items.length ? (
            <EmptyState icon={<ArrowDownUp />} title={status || q ? "No entries match" : "No manual entries yet"} description={status || q ? "Try another status or search." : "Save or post an entry above and it appears here."} />
          ) : (
            <div className="table-wrap"><table className="tbl so-rtbl" data-plain>
              <thead><tr><th>Date</th><th>Entry No.</th><th>Type</th><th>Reason</th><th>Reference No.</th><th className="num">Items</th><th className="num">Quantity</th><th className="num">Total Value (Rs.)</th><th>Status</th><th>Entered By</th><th className="so-c">Actions</th></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="so-nw">{dateLabel(r.docDate)}</td><td><b className="so-mono">{r.docNo}</b></td>
                    <td><span className={cn("so-pill", r.mode.toLowerCase())}>{r.mode === "IN" ? <ArrowUp /> : <ArrowDown />}{r.mode === "IN" ? "Stock In" : "Stock Out"}</span></td>
                    <td>{r.reason.label}</td><td className="so-mono">{r.manualRef ?? "—"}</td>
                    <td className="num">{r.totalItems}</td><td className="num">{fmt(r.totalQty)}</td><td className="num">{fmt(r.totalValue, 2)}</td>
                    <td><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td><td>{r.enteredBy?.name ?? "—"}</td>
                    <td className="so-c"><button type="button" className="icon-btn-sm so-eye" aria-label={`View ${r.docNo}`} onClick={() => setDetailId(r.id)}><Eye /></button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      <EntryDrawer key={`${detailId ?? "none"}-${attempt}`} id={detailId} can={can} attempt={attempt} onClose={() => { setDetailId(null); if (params.get("entry")) router.replace("/inventory/stock-in-out"); }}
        onEdit={editDraft} onChanged={(msg) => { toast(msg, { tone: "good" }); reload(); }} />
    </div>
  );
}

function EntryDrawer({ id, can, attempt, onClose, onEdit, onChanged }: { id: string | null; can: Can; attempt: number; onClose: () => void; onEdit: (e: StockEntry) => void; onChanged: (msg: string) => void }) {
  const toast = useToast();
  const [e, setE] = useState<StockEntry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"lines" | "history">("lines");
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!id) return;
    let off = false;
    getStockEntry(id).then((x) => !off && setE(x)).catch((x: unknown) => !off && setErr(errMsg(x, "Could not load the entry")));
    return () => { off = true; };
  }, [id, attempt]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); onChanged(msg); onClose(); } catch (x) { toast(errMsg(x, "Something went wrong"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={e ? e.docNo : "Stock entry"} subtitle={e ? `${e.mode === "IN" ? "Manual Stock In" : "Manual Stock Out"} · ${dateLabel(e.docDate)} · ${e.warehouse.name}` : undefined}
        foot={e && (
          <>
            {e.status === "DRAFT" && can.create && <Button variant="ghost" icon={<Trash2 />} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            {e.status === "POSTED" && can.post && <Button variant="ghost" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel entry</Button>}
            <span className="spacer" />
            {e.status === "DRAFT" && can.edit && <Button variant="secondary" disabled={busy} onClick={() => onEdit(e)}>Edit</Button>}
            {e.status === "DRAFT" && can.post && <Button variant="primary" icon={<Check />} disabled={busy} onClick={() => run(() => postStockEntry(e.id, e.rowVersion), `${e.docNo} posted`)}>Post</Button>}
          </>
        )}>
        {err ? <ErrorState message={err} /> : !e ? <Skeleton style={{ height: 280 }} /> : (
          <>
            <div className={cn("so-dr-hero", e.mode.toLowerCase())}><span>{e.mode === "IN" ? <ArrowUp /> : <ArrowDown />}</span><div><b>Rs {fmt(e.totalValue, 2)}</b><small>{e.totalItems} items · {fmt(e.totalQty)} units · {e.reason.label}</small></div><Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{STATUS_LABEL[e.status] ?? e.status}</Badge></div>
            <div className="dl">
              <div><span>Reference</span><b>{e.manualRef ?? "—"}</b></div>
              <div><span>Warehouse</span><b>{e.warehouse.name}{e.bin ? ` · ${e.bin.code}` : ""}</b></div>
              <div><span>Requested by</span><b>{e.requestedByName ?? "—"}</b></div>
              <div><span>Entered by</span><b>{e.enteredBy?.name ?? "—"}</b></div>
              <div><span>Journal</span><b>{e.voucher ? <Link className="link" href={`/accounting/vouchers/${e.voucher.id}`}>{e.voucher.docNo}</Link> : "—"}</b></div>
              {e.cancelReason && <div><span>Cancelled</span><b>{e.cancelReason}</b></div>}
            </div>
            <Tabs items={[{ key: "lines", label: "Lines" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "history" ? <HistoryTab schema="Inventory" table="StockInOut" id={e.id} /> : (
              <table className="tbl" data-plain>
                <thead><tr><th>Product</th><th>Batch</th><th className="num">Qty</th><th className="num">Cost</th><th className="num">Value</th></tr></thead>
                <tbody>{e.lines.map((l) => <tr key={l.id}><td><b>{l.item.name}</b><small>{l.item.sku}</small></td><td>{l.batchNo ?? "—"}{l.expiryDate ? <small>EXP {dateLabel(l.expiryDate)}</small> : null}</td><td className="num">{fmt(l.qty)}</td><td className="num">{fmt(l.unitCost, 2)}</td><td className="num">{fmt(l.value, 2)}</td></tr>)}</tbody>
              </table>
            )}
            {e.notes && <p className="so-muted" style={{ marginTop: 12 }}>{e.notes}</p>}
          </>
        )}
      </Drawer>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this entry?" subtitle="The stock movement and its journal are reversed."
        foot={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep</Button><Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => e && run(() => cancelStockEntry(e.id, e.rowVersion, reason.trim()), `${e.docNo} cancelled`).then(() => setCancelOpen(false))}>Cancel entry</Button></>}>
        <Field label="Reason" required><input value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Why is it cancelled?" /></Field>
      </Modal>
      <ConfirmDialog open={confirmDelete} danger busy={busy} title="Delete this draft?" confirmLabel="Delete draft" onClose={() => setConfirmDelete(false)}
        onConfirm={() => e && run(() => deleteStockEntry(e.id, e.rowVersion), `${e.docNo} deleted`).then(() => setConfirmDelete(false))}>
        {e?.docNo} has not been posted. Deleting it removes it for good.
      </ConfirmDialog>
    </>
  );
}
