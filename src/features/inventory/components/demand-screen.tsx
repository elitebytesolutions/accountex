"use client";

import {
  Boxes, Building2, Calculator, Calendar, ChartColumn, ChevronRight, CircleCheck, ClipboardList, Copy, Eye, FilePlus, Gift, Hash, NotebookPen, Package, Plus, Save, Search,
  ShoppingCart, Sparkles, Trash2, User, UserCheck, Wand2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { DemandOptions, GoodsDemand, GoodsDemandList, ReorderSuggestion, StockOpsOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { reorderSuggestions } from "../products-api";
import {
  cancelDemand, convertDemandToPo, createDemand, deleteDemand, demandOptions, generateDemand, getDemand, listDemands, updateDemand,
} from "../stock-demand-api";
import { stockOpsOptions } from "../stock-ops-api";

type Can = { edit: boolean; po: boolean };
type Tab = "dem" | "ro";
type DLine = { key: string; itemId: string; qtyCtn: string; baseQty: string; bonusQty: string; rate: string; discountPct: string; onHand?: number; lowLevel?: number; highLevel?: number };
type DForm = { id: string | null; rowVersion: number; docNo: string | null; status: string; docDate: string; vendorId: string; manufacturerId: string; notes: string; lines: DLine[] };

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const rowKey = (r: ReorderSuggestion) => `${r.product.id}|${r.warehouse?.id ?? ""}`;
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
let seq = 0;
const key = () => `dl${++seq}`;
const blankLine = (): DLine => ({ key: key(), itemId: "", qtyCtn: "", baseQty: "", bonusQty: "", rate: "", discountPct: "" });
const blankForm = (): DForm => ({ id: null, rowVersion: 0, docNo: null, status: "DRAFT", docDate: today(), vendorId: "", manufacturerId: "", notes: "", lines: [blankLine(), blankLine(), blankLine()] });
const STATUS_TONE: Record<string, Tone> = { DRAFT: "neutral", SAVED: "info", ORDERED: "good", CANCELLED: "danger" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SAVED: "Saved", ORDERED: "Ordered", CANCELLED: "Cancelled" };
const lineGross = (l: DLine) => num(l.baseQty) * num(l.rate);
const lineDisc = (l: DLine) => (lineGross(l) * num(l.discountPct)) / 100;
const fromDemand = (d: GoodsDemand): DForm => ({
  id: d.id, rowVersion: d.rowVersion, docNo: d.docNo, status: d.status, docDate: d.docDate, vendorId: d.vendor?.id ?? "", manufacturerId: d.manufacturer.id, notes: d.notes ?? "",
  lines: d.lines.map((l) => ({ key: key(), itemId: l.item.id, qtyCtn: String(l.qtyCtn || ""), baseQty: String(l.baseQty), bonusQty: String(l.bonusQty || ""), rate: String(l.rate), discountPct: String(l.discountPct || ""), onHand: l.onHand, lowLevel: l.lowLevel, highLevel: l.highLevel })),
});

/**
 * Template app/inventory/demand (4C-stock-ops.html + 9G-stock-ops.js §7): Demand of Goods (per vendor + company, generated from
 * reorder levels or keyed in; converts to a draft purchase order) and Reorder Suggestions.
 */
export function DemandScreen({ can = { edit: false, po: false } }: { can?: Can }) {
  const [tab, setTab] = useState<Tab>("dem");
  const [roCount, setRoCount] = useState<number | null>(null);
  const addLinesRef = useRef<((lines: DLine[], vendorId: string) => void) | null>(null);

  return (
    <div className="so-root">
      <div className="so-dm">
        <div className="so-dm-head">
          <div className="so-head">
            <span className="so-head-ico"><Boxes /></span>
            <div className="so-head-t">
              <div className="so-crumb">Inventory <ChevronRight /> <b>Demand &amp; Reorder</b></div>
              <h1>{tab === "dem" ? "Demand of Goods" : "Reorder Suggestions"}</h1>
              <p>{tab === "dem" ? "Create and manage product demand for suppliers" : "Items running low, grouped by preferred supplier"}</p>
            </div>
            <div className="so-head-r">
              <span className="tagline so-tagline">Stock today · business tomorrow</span>
              <div className={cn("so-dtabs", tab === "ro" && "r")} role="tablist">
                <button type="button" role="tab" aria-selected={tab === "dem"} className={cn(tab === "dem" && "on")} onClick={() => setTab("dem")}><ShoppingCart />Demand of Goods</button>
                <button type="button" role="tab" aria-selected={tab === "ro"} className={cn(tab === "ro" && "on")} onClick={() => setTab("ro")}><Sparkles />Reorder Suggestions<em>{roCount ?? 0}</em></button><i />
              </div>
            </div>
          </div>
        </div>
        <div className="so-dm-pane" hidden={tab !== "dem"}><GoodsDemandPane can={can} addLinesRef={addLinesRef} /></div>
        <div className="so-dm-pane" hidden={tab !== "ro"}>
          <ReorderPane can={can} onCount={setRoCount} onSend={(lines, vendorId) => { addLinesRef.current?.(lines, vendorId); setTab("dem"); }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Demand of Goods
function GoodsDemandPane({ can, addLinesRef }: { can: Can; addLinesRef: RefObject<((lines: DLine[], vendorId: string) => void) | null> }) {
  const toast = useToast();
  const [opts, setOpts] = useState<StockOpsOptions | null>(null);
  const [dOpts, setDOpts] = useState<DemandOptions | null>(null);
  const [optErr, setOptErr] = useState<string | null>(null);
  const [form, setForm] = useState<DForm>(blankForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [list, setList] = useState<GoodsDemandList | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [nothing, setNothing] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([stockOpsOptions(), demandOptions()]).then(([o, d]) => { setOpts(o); setDOpts(d); }).catch((e: unknown) => setOptErr(errMsg(e, "Could not load the demand options")));
  }, []);
  useEffect(() => {
    let off = false;
    const t = setTimeout(() => {
      listDemands({ status, search: q, pageSize: 50 }).then((l) => { if (!off) { setList(l); setListErr(null); } }).catch((e: unknown) => !off && setListErr(errMsg(e, "Could not load the demands")));
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [status, q, attempt]);
  useEffect(() => {
    addLinesRef.current = (lines, vendorId) => {
      setForm((f) => ({ ...(f.id ? blankForm() : f), vendorId: vendorId || (f.id ? "" : f.vendorId), lines: [...(f.id ? [] : f.lines.filter((l) => l.itemId)), ...lines] }));
      toast(`${lines.length} line${lines.length === 1 ? "" : "s"} added to the demand`, { tone: "good" });
    };
    return () => { addLinesRef.current = null; };
  }, [addLinesRef, toast]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const product = (id: string) => opts?.products.find((p) => p.id === id);
  const locked = !!form.id && !["DRAFT", "SAVED"].includes(form.status);
  const editable = can.edit && !locked;
  const filled = form.lines.filter((l) => l.itemId);
  const totals = { items: filled.length, qty: filled.reduce((s, l) => s + num(l.baseQty), 0), bonus: filled.reduce((s, l) => s + num(l.bonusQty), 0), amount: filled.reduce((s, l) => s + lineGross(l) - lineDisc(l), 0) };

  const setLine = (k: string, patch: Partial<DLine>) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === k ? { ...l, ...patch } : l)) }));
  const pickProduct = (l: DLine, itemId: string) => {
    const p = product(itemId);
    if (!p) { setLine(l.key, { itemId: "" }); return; }
    const ctn = Math.max(1, p.ctn);
    setLine(l.key, { itemId, qtyCtn: "1", baseQty: String(ctn), rate: l.rate || String(p.avgCost || ""), onHand: undefined, lowLevel: undefined, highLevel: undefined });
  };
  const setCtn = (l: DLine, v: string) => {
    const ctn = Math.max(1, product(l.itemId)?.ctn ?? 1);
    setLine(l.key, { qtyCtn: v, baseQty: v === "" ? l.baseQty : String(num(v) * ctn) });
  };

  const load = async (id: string) => {
    setDetailId(null);
    try { const d = await getDemand(id); setForm(fromDemand(d)); setErrors({}); window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { toast(errMsg(e, "Could not load the demand"), { tone: "danger" }); }
  };

  const generate = async () => {
    const e: Record<string, string> = {};
    if (!form.vendorId) e.vendorId = "Choose the supplier";
    if (!form.manufacturerId) e.manufacturerId = "Choose the company";
    if (Object.keys(e).length) { setErrors(e); toast("Choose the supplier and the company first", { tone: "warn" }); return; }
    setBusy("gen"); setNothing(null);
    try {
      const d = await generateDemand({ vendorId: form.vendorId, manufacturerId: form.manufacturerId, notes: form.notes || null });
      setForm(fromDemand(d)); reload();
      toast(`${d.docNo} generated from reorder levels · ${d.totalItems} item${d.totalItems === 1 ? "" : "s"}`, { tone: "good" });
    } catch (x) {
      if (x instanceof ApiError && x.code === "DEMAND_NOTHING_TO_ORDER") setNothing(x.message);
      else toast(errMsg(x, "Could not generate the demand"), { tone: "danger" });
    } finally { setBusy(null); }
  };

  const save = async () => {
    const lines = form.lines.filter((l) => l.itemId);
    const e: Record<string, string> = {};
    if (!form.vendorId) e.vendorId = "Choose the supplier";
    if (!form.manufacturerId) e.manufacturerId = "Choose the company";
    if (!lines.length) e.lines = "Add at least one product";
    lines.forEach((l) => { if (!(num(l.baseQty) > 0)) e[`q:${l.key}`] = "More than 0"; });
    if (Object.keys(e).length) { setErrors(e); toast(Object.values(e)[0]!, { tone: "warn" }); return; }
    setBusy("save"); setErrors({});
    const body = {
      docDate: form.docDate, vendorId: form.vendorId, manufacturerId: form.manufacturerId, notes: form.notes || null,
      lines: lines.map((l) => ({ itemId: l.itemId, qtyCtn: num(l.qtyCtn), baseQty: num(l.baseQty), bonusQty: num(l.bonusQty), rate: num(l.rate), discountPct: num(l.discountPct) })),
    };
    try {
      const d = form.id ? await updateDemand(form.id, { ...body, rowVersion: form.rowVersion }) : await createDemand(body);
      setForm(fromDemand(d)); reload();
      toast(`${d.docNo} saved · Rs ${fmt(d.netAmount, 2)}`, { tone: "good" });
    } catch (x) {
      if (x instanceof ApiError && x.details) setErrors(Object.fromEntries(Object.entries(x.details).map(([k, m]) => [k, m[0] ?? ""])));
      toast(errMsg(x, "Could not save the demand"), { tone: "danger" });
    } finally { setBusy(null); }
  };

  if (optErr && !opts) return <ErrorState message={optErr} onRetry={() => location.reload()} />;
  const items = list?.items ?? [];
  const me = opts ? "You" : "";

  return (
    <>
      <div className="so-dstrip">
        <label className={cn("so-dsf", errors.vendorId && "need")}><span className="so-dsf-i"><User /></span><span><small>Supplier Name <em>*</em></small>
          <select value={form.vendorId} disabled={!editable} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}><option value="">Select Supplier</option>{dOpts?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></span></label>
        <label className={cn("so-dsf", errors.manufacturerId && "need")}><span className="so-dsf-i"><Building2 /></span><span><small>Company <em>*</em></small>
          <select value={form.manufacturerId} disabled={!editable} onChange={(e) => setForm({ ...form, manufacturerId: e.target.value })}><option value="">Select Company</option>{dOpts?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></span></label>
        <label className="so-dsf sm"><span className="so-dsf-i"><Hash /></span><span><small>DNO <em>*</em></small><input readOnly value={form.docNo ?? "On save"} /></span></label>
        <label className="so-dsf sm"><span className="so-dsf-i"><Calendar /></span><span><small>Date <em>*</em></small><input type="date" value={form.docDate} disabled={!editable} onChange={(e) => setForm({ ...form, docDate: e.target.value || today() })} /></span></label>
        <label className="so-dsf"><span className="so-dsf-i"><UserCheck /></span><span><small>Prepared By</small><input readOnly value={me} /></span></label>
      </div>

      {nothing && (
        <div className="banner info" style={{ marginBottom: 16 }}><CircleCheck /><div><b>Nothing to order</b><p>{nothing} Lower stock or set reorder levels on the products, or key the lines in below.</p></div>
          <Button variant="ghost" size="sm" onClick={() => setNothing(null)}>Dismiss</Button></div>
      )}

      <div className="panel so-dgrid-p">
        <div className="so-dg-head">
          <span className="so-ph-ico lg"><ShoppingCart /></span>
          <div><h2>Products / Demand of Goods {form.docNo && <Badge tone={STATUS_TONE[form.status] ?? "neutral"}>{STATUS_LABEL[form.status] ?? form.status}</Badge>}</h2>
            <p>{locked ? "This demand is closed; start a new one to order again." : "Generate from reorder levels, or add products and the quantities to order."}</p></div>
          <div className="so-dg-tools">
            {can.edit && !form.id && <Button variant="primary" icon={<Wand2 />} disabled={!!busy} onClick={generate}>{busy === "gen" ? "Generating…" : "Generate from reorder"}</Button>}
            {editable && <Button variant="secondary" icon={<Plus />} onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, blankLine()] }))}>Add Row</Button>}
            {editable && <Button variant="secondary" icon={<Trash2 />} onClick={() => setForm((f) => ({ ...f, lines: [blankLine()] }))}>Clear Lines</Button>}
          </div>
        </div>
        {!opts ? <Skeleton style={{ height: 220 }} /> : (
          <div className="table-wrap"><table className="tbl so-dg" data-plain>
            <thead><tr><th>#</th><th>Product Name <em>*</em></th><th className="num">On hand</th><th className="num">CTN</th><th className="num">Rate</th><th className="num">Qty <em>*</em></th><th className="num">Bonus</th><th className="num">% Disc.</th><th className="num">Discount</th><th className="num">Amount</th><th className="so-c">Actions</th></tr></thead>
            <tbody>
              {form.lines.map((l, i) => {
                const p = product(l.itemId);
                const low = l.onHand !== undefined && l.lowLevel !== undefined && l.onHand <= l.lowLevel;
                return (
                  <tr key={l.key} className={cn(l.itemId && "filled")}>
                    <td className="so-idx">{i + 1}</td>
                    <td><div className="so-dprod"><Search /><select style={{ paddingLeft: 30 }} value={l.itemId} disabled={!editable} onChange={(e) => pickProduct(l, e.target.value)}><option value="">Search product…</option>{opts.products.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.sku}</option>)}</select></div></td>
                    <td className="num">{l.onHand !== undefined ? <span className={cn(low && "neg")} title={`Low ${fmt(l.lowLevel ?? 0)} · High ${fmt(l.highLevel ?? 0)}`}>{fmt(l.onHand)}<small style={{ display: "block" }}>{fmt(l.lowLevel ?? 0)} / {fmt(l.highLevel ?? 0)}</small></span> : <span className="muted">—</span>}</td>
                    <td className="num"><input className="n" type="number" min="0" step="1" value={l.qtyCtn} disabled={!editable} onChange={(e) => setCtn(l, e.target.value)} />{p && <small style={{ display: "block" }}>× {Math.max(1, p.ctn)}</small>}</td>
                    <td className="num"><input className="n w" type="number" min="0" step="0.01" placeholder="0.00" value={l.rate} disabled={!editable} onChange={(e) => setLine(l.key, { rate: e.target.value })} /></td>
                    <td className="num"><input className={cn("n", errors[`q:${l.key}`] && "bad")} type="number" min="0" placeholder="0" value={l.baseQty} disabled={!editable} onChange={(e) => setLine(l.key, { baseQty: e.target.value })} /></td>
                    <td className="num"><input className="n" type="number" min="0" placeholder="0" value={l.bonusQty} disabled={!editable} onChange={(e) => setLine(l.key, { bonusQty: e.target.value })} /></td>
                    <td className="num"><input className="n" type="number" min="0" max="100" step="0.5" placeholder="0.00" value={l.discountPct} disabled={!editable} onChange={(e) => setLine(l.key, { discountPct: e.target.value })} /></td>
                    <td className="num"><output className="so-ro">{fmt(lineDisc(l), 2)}</output></td>
                    <td className="num"><output className="so-ro amt">{fmt(lineGross(l) - lineDisc(l), 2)}</output></td>
                    <td className="so-c so-nw">{editable && <>
                      <button type="button" className="so-ra dup" title="Duplicate" onClick={() => setForm((f) => { const k = f.lines.findIndex((x) => x.key === l.key); const n = [...f.lines]; n.splice(k + 1, 0, { ...l, key: key() }); return { ...f, lines: n }; })}><Copy /></button>
                      <button type="button" className="so-ra del" title="Delete" onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((x) => x.key !== l.key) }))}><Trash2 /></button>
                    </>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        <div className="so-dtot">
          <div><span><Package /></span><div><small>Total Items</small><b>{fmt(totals.items)} <em>products</em></b></div></div>
          <div><span><ChartColumn /></span><div><small>Total Quantity</small><b>{fmt(totals.qty)}</b></div></div>
          <div><span><Gift /></span><div><small>Total Bonus</small><b>{fmt(totals.bonus)}</b></div></div>
          <div><span><Calculator /></span><div><small>Grand Amount</small><b>Rs {fmt(totals.amount, 2)}</b></div></div>
        </div>
        <div className="so-dnotes"><span><NotebookPen />Notes</span><div><textarea rows={2} maxLength={500} value={form.notes} disabled={!editable} placeholder="Add notes or remarks here…" onChange={(e) => setForm({ ...form, notes: e.target.value })} /><small className="so-d-cnt">{form.notes.length}/500</small></div></div>
      </div>

      <div className="so-ro-foot">
        <div>{form.docNo ? <><b>{form.docNo}</b> · {STATUS_LABEL[form.status] ?? form.status}</> : "New demand"}{errors.lines && <span className="neg"> · {errors.lines}</span>}</div>
        <span className="spacer" />
        <Button variant="ghost" icon={<FilePlus />} disabled={!!busy} onClick={() => { setForm(blankForm()); setErrors({}); setNothing(null); }}>New</Button>
        {editable && <Button variant="secondary" icon={<Save />} disabled={!!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</Button>}
        {form.id && <Button variant="primary" icon={<Eye />} onClick={() => setDetailId(form.id)}>Open &amp; order</Button>}
      </div>

      <div className="panel flush" style={{ marginTop: 16 }}>
        <div className="so-ph pad">
          <span className="so-ph-ico"><ClipboardList /></span><h3>Demands</h3>
          <span className="spacer" />
          <label className="so-search" style={{ maxWidth: 220 }}><Search /><input value={q} placeholder="DNO, supplier, company…" onChange={(e) => setQ(e.target.value)} /></label>
          <select className="so-cell-sel" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All ({Object.values(list?.counts ?? {}).reduce((s, n) => s + n, 0)})</option>
            {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({list?.counts[s] ?? 0})</option>)}
          </select>
        </div>
        {listErr && !list ? <ErrorState message={listErr} onRetry={reload} /> : !list ? <Skeleton style={{ height: 160 }} /> : !items.length ? (
          <EmptyState icon={<ShoppingCart />} title={status || q ? "No demands match" : "No demands yet"} description={status || q ? "Try another status or search." : "Generate one from reorder levels or key one in above."} />
        ) : (
          <div className="table-wrap"><table className="tbl" data-plain>
            <thead><tr><th>Date</th><th>DNO</th><th>Supplier</th><th>Company</th><th>Source</th><th className="num">Items</th><th className="num">Qty</th><th className="num">Amount</th><th>Status</th><th>Purchase order</th><th /></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>{dateLabel(d.docDate)}</td><td><b>{d.docNo}</b></td><td>{d.vendor?.name ?? "—"}</td><td>{d.manufacturer.name}</td>
                  <td>{d.source === "REORDER" ? <Badge tone="violet">Reorder</Badge> : <Badge tone="outline">Manual</Badge>}</td>
                  <td className="num">{d.totalItems}</td><td className="num">{fmt(d.totalQty)}</td><td className="num">{fmt(d.netAmount, 2)}</td>
                  <td><Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{STATUS_LABEL[d.status] ?? d.status}</Badge></td>
                  <td>{d.purchaseOrder ? <Link className="link" href={`/purchases/orders?po=${d.purchaseOrder.id}`}>{d.purchaseOrder.docNo}</Link> : "—"}</td>
                  <td className="so-c"><button type="button" className="icon-btn-sm so-eye" aria-label={`View ${d.docNo}`} onClick={() => setDetailId(d.id)}><Eye /></button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <DemandDrawer key={`${detailId ?? "none"}-${attempt}`} id={detailId} can={can} dOpts={dOpts} opts={opts} onClose={() => setDetailId(null)} onEdit={load}
        onChanged={(d, msg) => { toast(msg, { tone: "good" }); if (form.id && d && d.id === form.id) setForm(fromDemand(d)); else if (form.id === detailId && !d) setForm(blankForm()); reload(); }} />
    </>
  );
}

function DemandDrawer({ id, can, dOpts, opts, onClose, onEdit, onChanged }: {
  id: string | null; can: Can; dOpts: DemandOptions | null; opts: StockOpsOptions | null; onClose: () => void; onEdit: (id: string) => void; onChanged: (d: GoodsDemand | null, msg: string) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<GoodsDemand | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"lines" | "history">("lines");
  const [busy, setBusy] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [po, setPo] = useState({ branchId: "", warehouseId: "", expectedDate: "" });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!id) return;
    let off = false;
    getDemand(id).then((x) => !off && setD(x)).catch((x: unknown) => !off && setErr(errMsg(x, "Could not load the demand")));
    return () => { off = true; };
  }, [id]);
  const run = async (fn: () => Promise<GoodsDemand | null>, msg: string) => {
    setBusy(true);
    try { const x = await fn(); onChanged(x, msg); onClose(); } catch (x) { toast(errMsg(x, "Something went wrong"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const open = d && ["DRAFT", "SAVED"].includes(d.status);
  const branchId = po.branchId || dOpts?.branches[0]?.id || "";
  const warehouses = (opts?.warehouses ?? []).filter((w) => !w.branchId || w.branchId === branchId);
  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={d ? d.docNo : "Demand"} subtitle={d ? `${d.vendor?.name ?? "No supplier"} · ${d.manufacturer.name} · ${dateLabel(d.docDate)}` : undefined}
        foot={d && (
          <>
            {open && can.edit && <Button variant="ghost" icon={<Trash2 />} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            {open && can.edit && <Button variant="ghost" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel demand</Button>}
            <span className="spacer" />
            {open && can.edit && <Button variant="secondary" disabled={busy} onClick={() => onEdit(d.id)}>Edit</Button>}
            {open && can.po && <Button variant="primary" icon={<FilePlus />} disabled={busy} onClick={() => setConvertOpen(true)}>Convert to PO</Button>}
            {d.purchaseOrder && <Link className="btn primary" href={`/purchases/orders?po=${d.purchaseOrder.id}`}><FilePlus />Open {d.purchaseOrder.docNo}</Link>}
          </>
        )}>
        {err ? <ErrorState message={err} /> : !d ? <Skeleton style={{ height: 280 }} /> : (
          <>
            <div className="dl">
              <div><span>Status</span><b><Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{STATUS_LABEL[d.status] ?? d.status}</Badge></b></div>
              <div><span>Source</span><b>{d.source === "REORDER" ? "Generated from reorder levels" : "Keyed in"}</b></div>
              <div><span>Amount</span><b>Rs {fmt(d.netAmount, 2)}{d.discountAmount ? ` (gross ${fmt(d.grossAmount, 2)} − disc ${fmt(d.discountAmount, 2)})` : ""}</b></div>
              <div><span>Quantity</span><b>{fmt(d.totalQty)} + {fmt(d.totalBonus)} bonus · {d.totalItems} items</b></div>
              <div><span>Purchase order</span><b>{d.purchaseOrder ? <Link className="link" href={`/purchases/orders?po=${d.purchaseOrder.id}`}>{d.purchaseOrder.docNo} · {d.purchaseOrder.status}</Link> : "—"}</b></div>
              <div><span>Prepared by</span><b>{d.preparedBy?.name ?? "—"}</b></div>
            </div>
            <Tabs items={[{ key: "lines", label: "Lines" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "history" ? <HistoryTab schema="Inventory" table="GoodsDemands" id={d.id} /> : (
              <table className="tbl" data-plain>
                <thead><tr><th>Product</th><th className="num">On hand</th><th className="num">Low / High</th><th className="num">CTN</th><th className="num">Qty</th><th className="num">Bonus</th><th className="num">Rate</th><th className="num">Disc %</th><th className="num">Net</th></tr></thead>
                <tbody>{d.lines.map((l) => (
                  <tr key={l.id}><td><b>{l.item.name}</b><small>{l.item.sku}</small></td><td className={cn("num", l.onHand <= l.lowLevel && "neg")}>{fmt(l.onHand)}</td><td className="num">{fmt(l.lowLevel)} / {fmt(l.highLevel)}</td>
                    <td className="num">{fmt(l.qtyCtn)}</td><td className="num">{fmt(l.baseQty)}</td><td className="num">{fmt(l.bonusQty)}</td><td className="num">{fmt(l.rate, 2)}</td><td className="num">{fmt(l.discountPct, 1)}</td><td className="num">{fmt(l.netAmount, 2)}</td></tr>
                ))}</tbody>
              </table>
            )}
            {d.notes && <p className="muted" style={{ marginTop: 12 }}>{d.notes}</p>}
          </>
        )}
      </Drawer>
      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} title="Convert to a purchase order" subtitle="A draft PO is created with these lines; review and approve it in Purchases."
        foot={<><Button variant="secondary" onClick={() => setConvertOpen(false)}>Back</Button><Button variant="primary" icon={<FilePlus />} disabled={busy || !branchId}
          onClick={() => d && run(() => convertDemandToPo(d.id, { rowVersion: d.rowVersion, branchId, warehouseId: po.warehouseId || null, expectedDate: po.expectedDate || null }), `${d.docNo} converted to a draft PO`).then(() => setConvertOpen(false))}>Create draft PO</Button></>}>
        <Field label="Branch" required><select value={branchId} onChange={(e) => setPo({ ...po, branchId: e.target.value, warehouseId: "" })}>{dOpts?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Deliver to warehouse"><select value={po.warehouseId} onChange={(e) => setPo({ ...po, warehouseId: e.target.value })}><option value="">Branch default</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="Expected date"><input type="date" value={po.expectedDate} onChange={(e) => setPo({ ...po, expectedDate: e.target.value })} /></Field>
      </Modal>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this demand?" subtitle="It stays on record but can no longer be ordered."
        foot={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep</Button><Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => d && run(() => cancelDemand(d.id, d.rowVersion, reason.trim()), `${d.docNo} cancelled`).then(() => setCancelOpen(false))}>Cancel demand</Button></>}>
        <Field label="Reason" required><input value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Why is it cancelled?" /></Field>
      </Modal>
      <ConfirmDialog open={confirmDelete} danger busy={busy} title="Delete this demand?" confirmLabel="Delete demand" onClose={() => setConfirmDelete(false)}
        onConfirm={() => d && run(async () => { await deleteDemand(d.id, d.rowVersion); return null; }, `${d.docNo} deleted`).then(() => setConfirmDelete(false))}>
        {d?.docNo} has not been ordered. Deleting it removes it for good.
      </ConfirmDialog>
    </>
  );
}

// ---------------------------------------------------------------- Reorder Suggestions
function ReorderPane({ can, onCount, onSend }: { can: Can; onCount: (n: number) => void; onSend: (lines: DLine[], vendorId: string) => void }) {
  const [rows, setRows] = useState<ReorderSuggestion[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [ctn, setCtn] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    reorderSuggestions()
      .then((r) => { if (!cancelled) { setRows(r); setSel(new Set(r.map(rowKey))); setCtn({}); setError(null); onCount(r.length); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load reorder suggestions" }));
    return () => { cancelled = true; };
  }, [attempt, onCount]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const cartons = (r: ReorderSuggestion) => ctn[rowKey(r)] ?? r.suggestCartons;
  const value = (r: ReorderSuggestion) => cartons(r) * Math.max(1, r.product.ctn) * r.product.cost;
  const groups = new Map<string, { name: string; code: string | null; preferred: boolean; rows: ReorderSuggestion[] }>();
  rows?.forEach((r) => {
    const k = r.supplier?.id ?? "";
    const g = groups.get(k) ?? { name: r.supplier?.name ?? "No preferred supplier", code: r.supplier?.code ?? null, preferred: !!r.supplier, rows: [] };
    g.rows.push(r);
    groups.set(k, g);
  });
  const chosen = rows?.filter((r) => sel?.has(rowKey(r))) ?? [];
  const toggle = (keys: string[], on: boolean) => setSel((s) => { const n = new Set(s); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); return n; });
  const send = () => {
    const suppliers = new Set(chosen.map((r) => r.supplier?.id ?? ""));
    const merged = new Map<string, DLine>();
    chosen.forEach((r) => {
      const c = Math.max(1, r.product.ctn);
      const ex = merged.get(r.product.id);
      if (ex) merged.set(r.product.id, { ...ex, qtyCtn: String(num(ex.qtyCtn) + cartons(r)), baseQty: String(num(ex.baseQty) + cartons(r) * c) });
      else merged.set(r.product.id, { key: key(), itemId: r.product.id, qtyCtn: String(cartons(r)), baseQty: String(cartons(r) * c), bonusQty: "", rate: String(r.product.cost || ""), discountPct: "", onHand: r.onHand, lowLevel: r.lowLevel });
    });
    onSend([...merged.values()], suppliers.size === 1 ? [...suppliers][0]! : "");
  };

  return !rows ? <Skeleton style={{ height: 220 }} /> : (
    <>
      <div className="so-ro-top">
        <div className="banner info"><Sparkles /><div><b>{rows.length ? `${rows.length} product${rows.length === 1 ? "" : "s"} need reordering` : "Nothing needs reordering"}</b>
          <p>Below the low level, or less than the cover-alert days of cover at the current sales rate. Suggestions top up to the high level plus the lead and safety days of sales, in whole cartons. Set levels per warehouse on each product&apos;s Reorder settings.</p></div></div>
      </div>
      {rows.length ? (
        <div className="so-ro-grid">
          {[...groups.entries()].map(([k, g], gi) => {
            const keys = g.rows.map(rowKey);
            const all = keys.every((x) => sel?.has(x));
            return (
              <div key={k} className="panel flush so-rog" style={{ ["--i" as string]: gi }}>
                <div className="so-rog-h"><label className="so-ck"><input type="checkbox" checked={all} onChange={(e) => toggle(keys, e.target.checked)} aria-label={`Select ${g.name}`} /><span /></label>
                  <span className="so-rog-av" style={{ ["--c" as string]: "var(--primary)" }}>{initials(g.name)}</span><div><b>{g.name}</b><small>{g.rows.length} item{g.rows.length > 1 ? "s" : ""} · {g.preferred ? `preferred supplier${g.code ? ` · ${g.code}` : ""}` : "add a preferred supplier on the product"}</small></div>
                  <span className="spacer" /><b className="so-rog-v">Rs {fmt(g.rows.reduce((s, r) => s + value(r), 0))}</b></div>
                <table className="tbl so-rot"><thead><tr><th /><th>Product</th><th className="num">On hand</th><th className="num">Low</th><th className="num">Avg / day</th><th>Cover</th><th className="num">Suggest CTN</th><th className="num">Value</th></tr></thead><tbody>
                  {g.rows.map((r) => {
                    const rk = rowKey(r);
                    const d = r.coverDays;
                    return (
                      <tr key={rk}>
                        <td><label className="so-ck"><input type="checkbox" checked={!!sel?.has(rk)} onChange={(e) => toggle([rk], e.target.checked)} aria-label={`Select ${r.product.sku}`} /><span /></label></td>
                        <td><b><Link href={`/inventory/products/${r.product.id}`} style={{ color: "inherit", textDecoration: "none" }}>{r.product.name}</Link></b><small>{r.product.sku}{r.warehouse ? ` · ${r.warehouse.name}` : ""}</small></td>
                        <td className={cn("num", r.onHand <= r.lowLevel && "neg")}>{fmt(r.onHand)}</td><td className="num">{fmt(r.lowLevel)}</td><td className="num">{fmt(r.avgDaily, r.avgDaily % 1 ? 1 : 0)}</td>
                        <td>{d === null ? <span className="so-cover r"><i style={{ width: "0%" }} />{r.onHand <= 0 ? "0 days" : "No sales yet"}</span> : <span className={cn("so-cover", d < 7 ? "r" : d < 14 ? "w" : "i")}><i style={{ width: `${Math.min(100, (d / 30) * 100)}%` }} />{d} days</span>}</td>
                        <td className="num"><input type="number" min={1} className="so-ro-ctn" value={cartons(r)} onChange={(e) => setCtn((c) => ({ ...c, [rk]: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))} aria-label={`Cartons of ${r.product.sku}`} /><small>{fmt(cartons(r) * Math.max(1, r.product.ctn))} {r.product.uomCode}</small></td>
                        <td className="num">{fmt(value(r))}</td>
                      </tr>
                    );
                  })}
                </tbody></table>
              </div>
            );
          })}
        </div>
      ) : <div className="panel"><div className="so-empty"><CircleCheck /><b>Stock is healthy</b><span>Every product is above its low level.</span></div></div>}
      <div className="so-ro-foot"><div><b className="so-ro-n">{chosen.length}</b> items from <b>{new Set(chosen.map((r) => r.supplier?.id ?? "")).size}</b> suppliers selected · <b>Rs {fmt(chosen.reduce((s, r) => s + value(r), 0))}</b></div><span className="spacer" />
        <Button variant="secondary" icon={<ClipboardList />} disabled={!can.edit || !chosen.length} onClick={send}>Send to demand</Button>
        <Button variant="primary" icon={<FilePlus />} disabled title="Send to a demand, then convert it to a purchase order">Create POs</Button>
      </div>
    </>
  );
}
