"use client";

import {
  ArrowLeftRight, ArrowRight, Banknote, Barcode, Boxes, Calendar, Check, ChevronDown, ChevronRight, CircleCheck, Clock, History, Layers, LayoutGrid, ListChecks, Lock,
  MapPin, Package, PackageCheck, PackageOpen, Plus, ReceiptText, Save, ScanLine, Search, Send, Store, Trash2, TriangleAlert, Truck, User, Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StockOnHand, StockOpsOptions, StockTransfer, StockTransferList } from "@/shared";
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
import { cancelTransfer, createTransfer, deleteTransfer, dispatchTransfer, getTransfer, listTransfers, receiveTransfer, stockOnHand, stockOpsOptions, updateTransfer } from "../stock-ops-api";

type Can = { create: boolean; edit: boolean; post: boolean };
type Line = { key: string; itemId: string; batchId: string; qtyCtn: string; qtyLoose: string };
type Form = { id: string | null; rowVersion: number; docNo: string | null; docDate: string; fromWarehouseId: string; toWarehouseId: string; carrier: string; driverName: string; vehicleNo: string; etaAt: string; remarks: string; lines: Line[] };

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
let seq = 0;
const key = () => `t${++seq}`;
const IN_TRANSIT = ["POSTED", "DISPATCHED", "IN_TRANSIT"];
const STATUS: Record<string, [string, Tone]> = { DRAFT: ["Draft", "neutral"], POSTED: ["In transit", "info"], DISPATCHED: ["Dispatched", "info"], IN_TRANSIT: ["In transit", "info"], RECEIVED: ["Received", "good"], CANCELLED: ["Cancelled", "danger"] };
const stat = (s: string) => STATUS[s] ?? [s, "neutral" as Tone];
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const WAREHOUSE_ART = `<svg class="so-art" viewBox="0 0 220 150" aria-hidden="true"><ellipse class="a-ground" cx="112" cy="136" rx="104" ry="11"/><circle class="a-cloud" cx="40" cy="26" r="9"/><circle class="a-cloud" cx="52" cy="22" r="12"/><circle class="a-cloud" cx="64" cy="27" r="8"/><g class="a-tree-g"><rect class="a-trunk" x="18" y="104" width="5" height="26" rx="2"/><circle class="a-tree" cx="20" cy="96" r="14"/><circle class="a-tree2" cx="26" cy="104" r="9"/></g><path class="a-wall" d="M44 70 L118 36 L192 70 V130 H44 Z"/><path class="a-roof" d="M36 72 L118 30 L200 72 L194 80 L118 42 L42 80 Z"/><path class="a-roof2" d="M42 80 L118 42 L194 80 L194 84 L118 47 L42 84 Z"/><rect class="a-sign" x="98" y="56" width="40" height="11" rx="3"/><rect class="a-door" x="88" y="84" width="60" height="46" rx="2"/><path class="a-slat" d="M90 90 H146 M90 96 H146 M90 102 H146 M90 108 H146 M90 114 H146 M90 120 H146"/><rect class="a-win" x="56" y="88" width="20" height="13" rx="2"/><rect class="a-win" x="162" y="88" width="20" height="13" rx="2"/><rect class="a-box" x="150" y="112" width="18" height="18" rx="1.5"/><rect class="a-box2" x="168" y="112" width="18" height="18" rx="1.5"/><rect class="a-box" x="159" y="95" width="18" height="17" rx="1.5"/><path class="a-tape" d="M159 112 V130 M177 112 V130 M168 95 V112"/></svg>`;
const SHOP_ART = `<svg class="so-art" viewBox="0 0 220 150" aria-hidden="true"><ellipse class="a-ground" cx="112" cy="136" rx="104" ry="11"/><circle class="a-cloud" cx="168" cy="20" r="8"/><circle class="a-cloud" cx="180" cy="16" r="11"/><circle class="a-cloud" cx="192" cy="21" r="7"/><rect class="a-wall" x="40" y="58" width="144" height="72" rx="2"/><rect class="a-roof2" x="34" y="52" width="156" height="8" rx="2"/><rect class="a-roof" x="76" y="26" width="72" height="22" rx="5"/><text class="a-signtxt" x="112" y="41.5" text-anchor="middle">SHOP</text><path class="a-awn" d="M36 60 H188 L182 80 H42 Z"/><rect class="a-win" x="50" y="90" width="38" height="28" rx="2"/><rect class="a-win" x="136" y="90" width="38" height="28" rx="2"/><rect class="a-door" x="98" y="88" width="28" height="42" rx="2"/><circle class="a-knob" cx="120" cy="110" r="1.6"/></svg>`;
const TRUCK = `<svg class="so-truck-svg" viewBox="0 0 120 64" aria-hidden="true"><rect class="t-body" x="4" y="8" width="70" height="38" rx="4"/><rect class="t-stripe" x="4" y="32" width="70" height="5"/><path class="t-cab" d="M74 20 H96 Q100 20 103 24 L114 38 V46 H74 Z"/><path class="t-glass" d="M80 25 H95 L104 37 H80 Z"/><rect class="t-base" x="2" y="46" width="114" height="4" rx="2"/><path class="t-logo" d="M24 18 l8 -4 8 4 v9 l-8 4 -8 -4 Z"/><g class="t-wheel"><circle cx="24" cy="52" r="8"/><circle class="t-hub" cx="24" cy="52" r="3"/><path class="t-spoke" d="M24 45 V59 M17 52 H31"/></g><g class="t-wheel"><circle cx="94" cy="52" r="8"/><circle class="t-hub" cx="94" cy="52" r="3"/><path class="t-spoke" d="M94 45 V59 M87 52 H101"/></g></svg>`;

const blank = (o: StockOpsOptions | null): Form => ({
  id: null, rowVersion: 0, docNo: null, docDate: today(), fromWarehouseId: o?.warehouses[0]?.id ?? "", toWarehouseId: o?.warehouses[1]?.id ?? "",
  carrier: "", driverName: "", vehicleNo: "", etaAt: "", remarks: "", lines: [],
});

/** Template app/inventory/transfer (4C-stock-ops.html + 9G-stock-ops.js §2): route cards, manifest, slip preview, recent and incoming transfers with the receive sheet. */
export function StockTransferScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [opts, setOpts] = useState<StockOpsOptions | null>(null);
  const [optError, setOptError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => blank(null));
  const [fromStock, setFromStock] = useState<StockOnHand>([]);
  const [toStock, setToStock] = useState<StockOnHand>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);
  const [list, setList] = useState<StockTransferList | null>(null);
  const [incoming, setIncoming] = useState<StockTransferList | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(params.get("transfer"));
  const [receiveId, setReceiveId] = useState<string | null>(null);

  useEffect(() => {
    stockOpsOptions().then((o) => { setOpts(o); setForm((f) => (f.fromWarehouseId ? f : blank(o))); }).catch((e: unknown) => setOptError(errMsg(e, "Could not load the stock options")));
  }, []);
  useEffect(() => {
    if (!form.fromWarehouseId) return;
    let off = false;
    stockOnHand(form.fromWarehouseId).then((s) => !off && setFromStock(s)).catch(() => !off && setFromStock([]));
    return () => { off = true; };
  }, [form.fromWarehouseId, attempt]);
  useEffect(() => {
    if (!form.toWarehouseId) return;
    let off = false;
    stockOnHand(form.toWarehouseId).then((s) => !off && setToStock(s)).catch(() => !off && setToStock([]));
    return () => { off = true; };
  }, [form.toWarehouseId, attempt]);
  useEffect(() => {
    let off = false;
    Promise.all([listTransfers({ pageSize: 8 }), listTransfers({ status: "IN_TRANSIT", pageSize: 12 })])
      .then(([l, i]) => { if (!off) { setList(l); setIncoming(i); setListErr(null); } })
      .catch((e: unknown) => !off && setListErr(errMsg(e, "Could not load transfers")));
    return () => { off = true; };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const product = useCallback((id: string) => opts?.products.find((p) => p.id === id), [opts]);
  const whOf = (id: string) => opts?.warehouses.find((w) => w.id === id);
  const availOf = (l: Line) => fromStock.filter((s) => s.itemId === l.itemId && (!l.batchId || s.batchId === l.batchId)).reduce((s, x) => s + x.qtyOnHand, 0);
  const qtyOf = (l: Line) => num(l.qtyCtn) * (product(l.itemId)?.ctn || 1) + num(l.qtyLoose);
  const costOf = (l: Line) => product(l.itemId)?.avgCost ?? 0;
  const same = form.fromWarehouseId === form.toWarehouseId;
  const totals = useMemo(() => ({
    items: form.lines.length, qty: form.lines.reduce((s, l) => s + qtyOf(l), 0), loose: form.lines.reduce((s, l) => s + num(l.qtyLoose), 0), value: form.lines.reduce((s, l) => s + qtyOf(l) * costOf(l), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [form.lines, opts]);
  const issues = useMemo(() => {
    const out: string[] = [];
    if (same) out.push("Source and destination cannot be the same");
    if (!form.lines.length) out.push("Add at least one product");
    form.lines.forEach((l, i) => { if (qtyOf(l) <= 0) out.push(`Line ${i + 1} has no quantity`); else if (qtyOf(l) > availOf(l)) out.push(`Line ${i + 1} exceeds available stock`); });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, fromStock, opts]);

  const setLine = (k: string, patch: Partial<Line>) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === k ? { ...l, ...patch } : l)) }));
  const addProduct = (text: string) => {
    const v = text.trim().toLowerCase();
    if (!v) { toast("Type a product name or code first", { tone: "warn" }); return; }
    const code = v.includes(" · ") ? v.split(" · ").pop()! : v;
    const p = opts?.products.find((x) => x.sku.toLowerCase() === code || x.upc === code) ?? opts?.products.find((x) => x.name.toLowerCase().includes(code) || x.sku.toLowerCase().includes(code));
    if (!p) { toast(`No product matches “${text}”`, { tone: "warn" }); return; }
    const ex = form.lines.find((l) => l.itemId === p.id);
    if (ex) { setLine(ex.key, { qtyLoose: String(num(ex.qtyLoose) + 1) }); toast(`${p.name} already on the manifest · +1`, { tone: "info" }); }
    else setForm((f) => ({ ...f, lines: [...f.lines, { key: key(), itemId: p.id, batchId: "", qtyCtn: p.ctn > 1 ? "1" : "0", qtyLoose: p.ctn > 1 ? "0" : "1" }] }));
    setSearch("");
  };

  const save = async (andDispatch: boolean) => {
    if (andDispatch && issues.length) { toast(issues[0] + (issues.length > 1 ? ` (+${issues.length - 1} more)` : ""), { tone: "warn" }); return; }
    if (!form.lines.length) { toast("Add at least one product to save a draft", { tone: "warn" }); return; }
    if (same) { toast("Source and destination cannot be the same", { tone: "warn" }); return; }
    setBusy(andDispatch ? "post" : "draft");
    const body = {
      docDate: form.docDate, fromWarehouseId: form.fromWarehouseId, toWarehouseId: form.toWarehouseId, carrier: form.carrier || null, driverName: form.driverName || null,
      vehicleNo: form.vehicleNo || null, etaAt: form.etaAt || null, remarks: form.remarks || null,
      lines: form.lines.map((l) => ({ itemId: l.itemId, batchId: l.batchId || null, qtyCtn: num(l.qtyCtn), qtyLoose: num(l.qtyLoose) })),
    };
    let saved: StockTransfer | null = null;
    try {
      saved = form.id ? await updateTransfer(form.id, { ...body, rowVersion: form.rowVersion }) : await createTransfer(body);
      if (andDispatch) saved = await dispatchTransfer(saved.id, saved.rowVersion);
      toast(`${saved.docNo} ${andDispatch ? `dispatched to ${saved.to.name}` : "saved as draft"} · ${fmt(saved.totalQty)} units`, { tone: andDispatch ? "good" : "info" });
      setForm(blank(opts)); reload();
    } catch (e) {
      if (saved) setForm((f) => ({ ...f, id: saved!.id, rowVersion: saved!.rowVersion, docNo: saved!.docNo }));
      const code = e instanceof ApiError ? e.code : "";
      toast(`${code === "STOCK_INSUFFICIENT" ? "Not enough stock: " : ""}${errMsg(e, "Could not save the transfer")}${saved && andDispatch ? " · kept as draft" : ""}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  const editDraft = (t: StockTransfer) => {
    setDetailId(null);
    setForm({
      id: t.id, rowVersion: t.rowVersion, docNo: t.docNo, docDate: t.docDate, fromWarehouseId: t.from.id, toWarehouseId: t.to.id, carrier: t.carrier ?? "", driverName: t.driverName ?? "",
      vehicleNo: t.vehicleNo ?? "", etaAt: t.etaAt?.slice(0, 10) ?? "", remarks: t.remarks ?? "",
      lines: t.lines.map((l) => ({ key: key(), itemId: l.item.id, batchId: "", qtyCtn: String(l.qtyCtn), qtyLoose: String(l.qtyLoose) })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (optError && !opts) return <ErrorState message={optError} onRetry={() => location.reload()} />;

  const locCard = (side: "from" | "to") => {
    const id = side === "from" ? form.fromWarehouseId : form.toWarehouseId;
    const w = whOf(id);
    const stock = side === "from" ? fromStock : toStock;
    const shop = w?.type === "SHOP";
    return (
      <div className={cn("so-loc", shop ? "shop" : "wh")} data-side={side}>
        <div className="so-loc-top">
          <div className="so-loc-art" dangerouslySetInnerHTML={{ __html: shop ? SHOP_ART : WAREHOUSE_ART }} />
          <div className="so-loc-main">
            <span className="so-chip">{side === "from" ? "From" : "To"}</span>
            <label className="so-loc-pick"><b>{w?.name ?? "Choose a location"}</b><ChevronDown />
              <select aria-label={`${side} location`} value={id} onChange={(e) => setForm((f) => (side === "from" ? { ...f, fromWarehouseId: e.target.value, lines: f.lines.map((l) => ({ ...l, batchId: "" })) } : { ...f, toWarehouseId: e.target.value }))}>
                {opts?.warehouses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <small>{side === "from" ? "Source" : "Destination"} Location</small>
            <p><span><MapPin /></span>{w?.code ?? "—"}</p>
          </div>
          <span className={cn("so-kind", shop ? "shop" : "wh")}>{shop ? <Store /> : <Warehouse />}{shop ? "Shop" : "Warehouse"}</span>
        </div>
        <div className="so-loc-stats">
          <div><span><Boxes /></span><div><small>Current Stock</small><b>{fmt(stock.reduce((s, x) => s + x.qtyOnHand, 0))} <em>units</em></b></div></div>
          <div><span><LayoutGrid /></span><div><small>Location Type</small><b>{shop ? "Shop" : "Warehouse"}</b></div></div>
          <div><span><Layers /></span><div><small>Active Products</small><b>{fmt(new Set(stock.filter((x) => x.qtyOnHand > 0).map((x) => x.itemId)).size)}</b></div></div>
        </div>
      </div>
    );
  };

  const fromW = whOf(form.fromWarehouseId), toW = whOf(form.toWarehouseId);
  const open = incoming?.items ?? [];

  return (
    <div className="so-root">
      <div className="so-tr">
        <div className="so-tr-head">
          <div className="so-tr-title"><span className="so-head-ico"><Package /></span><div><div className="so-crumb">Inventory <ChevronRight /> <b>Stock Transfers</b></div><h1>Stock Transfer</h1><p>Move stock between your warehouses and shops</p></div></div>
          <div className="so-tr-meta">
            <label><span>Transfer No.</span><div className="so-tf ro"><b className="so-trno">{form.docNo ?? "TRF-… (on save)"}</b><Lock /></div></label>
            <label><span>Date</span><div className="so-tf"><Calendar /><input type="date" value={form.docDate} onChange={(e) => setForm({ ...form, docDate: e.target.value || today() })} /></div></label>
            <label><span>Carrier / Driver</span><div className="so-tf"><User /><input value={form.driverName} placeholder="Driver name" onChange={(e) => setForm({ ...form, driverName: e.target.value })} /></div></label>
            <label className="grow"><span>Remarks (Optional)</span><div className="so-tf"><input value={form.remarks} placeholder="e.g. Replenishment for the branch shop" onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div></label>
            <span className="so-tr-status badge neutral dot">{form.id ? "Draft" : "New"}</span>
          </div>
          <div className="so-head-r">
            {form.id && <Button variant="ghost" onClick={() => setForm(blank(opts))}>New transfer</Button>}
            {can.create && <Button icon={<Save />} disabled={!!busy} onClick={() => save(false)}>{busy === "draft" ? "Saving…" : "Save Draft"}</Button>}
            {can.create && can.post && <Button variant="primary" icon={<Send />} disabled={!!busy} onClick={() => save(true)}>{busy === "post" ? "Dispatching…" : "Save & Dispatch"}</Button>}
          </div>
        </div>

        <div className="so-route">
          <div className="so-loc-slot" data-slot="from">{locCard("from")}</div>
          <div className={cn("so-truck", same && "bad")}>
            <div className="so-track"><i className="so-road" /><div className="so-truck-mover" dangerouslySetInnerHTML={{ __html: TRUCK }} /><ChevronRight className="so-track-end" /></div>
            <b className="so-truck-t">Transferring Stock</b>
            <small className="so-truck-s">From {fromW?.type === "SHOP" ? "Shop" : "Warehouse"} to {toW?.type === "SHOP" ? "Shop" : "Warehouse"}</small>
            {same && <em className="so-truck-err"><TriangleAlert />Source and destination are the same</em>}
            <button className="so-swap" type="button" title="Swap locations" onClick={() => setForm((f) => ({ ...f, fromWarehouseId: f.toWarehouseId, toWarehouseId: f.fromWarehouseId, lines: f.lines.map((l) => ({ ...l, batchId: "" })) }))}><ArrowLeftRight />Swap</button>
          </div>
          <div className="so-loc-slot" data-slot="to">{locCard("to")}</div>
        </div>

        <div className="so-tr-body">
          <div className="panel so-manifest">
            <div className="so-mf-head">
              <span className="so-ph-ico lg"><PackageCheck /></span>
              <div><h2>Transfer Manifest</h2><p>Add products to transfer from the source to destination</p></div>
              <div className="so-mf-tools">
                <Button icon={<Plus />} className="so-mf-add" onClick={() => addProduct(search)}>Add Product</Button>
                <div className="so-search so-mf-search"><Search /><input value={search} list="so-tr-dl" placeholder="Search product by code or name…" autoComplete="off"
                  onChange={(e) => { setSearch(e.target.value); if (e.target.value.includes(" · ")) addProduct(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProduct(search); } }} /></div>
                <span className="btn secondary so-mf-scan" title="Scan with a barcode reader into the search box"><ScanLine />Scan</span>
              </div>
              <datalist id="so-tr-dl">{opts?.products.filter((p) => fromStock.some((s) => s.itemId === p.id && s.qtyOnHand > 0)).map((p) => <option key={p.id} value={`${p.name} · ${p.sku}`} />)}</datalist>
            </div>
            <div className="so-mf-lines">
              {form.lines.map((l, i) => {
                const p = product(l.itemId);
                const av = availOf(l), q = qtyOf(l), bad = q > av;
                const batches = fromStock.filter((s) => s.itemId === l.itemId && s.batchId);
                const b = batches.find((x) => x.batchId === l.batchId);
                return (
                  <div key={l.key} className={cn("so-line", bad && "bad")} style={{ ["--i" as string]: i }}>
                    <span className="so-no">{i + 1}</span>
                    <span className="so-thumb"><Package /><em>{p?.unit ?? ""}</em></span>
                    <div className="so-lprod">
                      <b>{p?.sku}</b><span title={p?.name}>{p?.name}</span>
                      <div className="so-lmeta">
                        <div><small>Batch</small>{batches.length ? <select value={l.batchId} onChange={(e) => setLine(l.key, { batchId: e.target.value })}><option value="">Earliest expiry</option>{batches.map((x) => <option key={x.batchId!} value={x.batchId!}>{x.batchNo}</option>)}</select> : <b>—</b>}</div>
                        <div><small>Expiry</small><b><Calendar />{b?.expiryDate ? dateLabel(b.expiryDate) : "N/A"}</b></div>
                        <div><small>Ctn size</small><b>{p?.ctn ?? 1}</b></div>
                      </div>
                    </div>
                    <div className="so-nums">
                      <div><small>Available</small><b className="so-av">{fmt(av)}</b><em>{p?.unit}</em></div>
                      <div><small>Transfer CTN</small><input type="number" min="0" value={l.qtyCtn} className={cn(bad && "bad")} onChange={(e) => setLine(l.key, { qtyCtn: e.target.value })} /><em>× {p?.ctn ?? 1}</em></div>
                      <div><small>Loose Qty</small><input type="number" min="0" value={l.qtyLoose} className={cn(bad && "bad")} onChange={(e) => setLine(l.key, { qtyLoose: e.target.value })} /><em className="so-lq">{fmt(q)} {p?.unit}</em></div>
                      <div><small>Cost (Rs.)</small><output>{fmt(costOf(l), 2)}</output></div>
                      <div><small>Value (Rs.)</small><output className="so-lval">{fmt(q * costOf(l), 2)}</output></div>
                    </div>
                    <div className="so-line-foot">
                      <span className="so-ean"><Barcode />{p?.upc ?? "—"}</span>
                      <span className="so-over-msg">{bad && <><TriangleAlert />Exceeds available by {fmt(q - av)}</>}</span>
                    </div>
                    <button type="button" className="so-ldel" aria-label="Remove" onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((x) => x.key !== l.key) }))}><Trash2 /></button>
                  </div>
                );
              })}
              <button className="so-add-more" type="button" onClick={() => (search ? addProduct(search) : document.querySelector<HTMLInputElement>(".so-mf-search input")?.focus())}><Plus /><span><b>Add Another Product</b><small>Search or scan to add products to this transfer</small></span></button>
            </div>
          </div>

          <div className="so-tr-side">
            <div className="panel so-slip-panel">
              <div className="so-ph"><span className="so-ph-ico"><ReceiptText /></span><h3>Transfer Slip Preview</h3><span className="spacer" /><Button size="sm" onClick={() => window.print()}>Print</Button></div>
              <div className="so-slip">
                <div className="so-slip-brand"><span><Truck /></span><b>STOCK TRANSFER SLIP</b><small>{form.docNo ?? "Not saved yet"}</small></div>
                <dl className="so-slip-kv"><dt>Transfer No.</dt><dd>{form.docNo ?? "—"}</dd><dt>Date</dt><dd>{dateLabel(form.docDate)}</dd><dt>Carrier</dt><dd>{[form.carrier, form.driverName, form.vehicleNo].filter(Boolean).join(" · ") || "—"}</dd></dl>
                <div className="so-slip-route"><p><span>{fromW?.type === "SHOP" ? <Store /> : <Warehouse />}</span><small>From</small>{fromW?.name ?? "—"}</p><p><span>{toW?.type === "SHOP" ? <Store /> : <Warehouse />}</span><small>To</small>{toW?.name ?? "—"}</p></div>
                <div className="so-slip-tot"><span>Items: <b>{totals.items}</b></span><span>Total Qty: <b>{fmt(totals.qty)}</b></span><span>Value: <b>Rs {fmt(totals.value, 2)}</b></span></div>
              </div>
              <div className="so-fg c2" style={{ marginTop: 12 }}>
                <label><span>Carrier</span><input value={form.carrier} placeholder="e.g. TCS" onChange={(e) => setForm({ ...form, carrier: e.target.value })} /></label>
                <label><span>Vehicle No.</span><input value={form.vehicleNo} placeholder="e.g. LEA-2290" onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} /></label>
                <label><span>ETA</span><input type="date" value={form.etaAt} onChange={(e) => setForm({ ...form, etaAt: e.target.value })} /></label>
              </div>
            </div>
            <div className="panel so-recent-tr">
              <div className="so-ph"><span className="so-ph-ico"><History /></span><h3>Recent Transfers</h3><span className="spacer" />{list && <Badge tone="neutral">{list.kpis.drafts} draft{list.kpis.drafts === 1 ? "" : "s"}</Badge>}</div>
              <div className="so-tl">
                {listErr && !list ? <ErrorState message={listErr} onRetry={reload} /> : !list ? <Skeleton style={{ height: 140 }} /> : !list.items.length ? (
                  <EmptyState icon={<Truck />} title="No transfers yet" description="Save or dispatch a transfer above." />
                ) : list.items.map((r) => {
                  const [label, tone] = stat(r.status);
                  return (
                    <div role="button" tabIndex={0} key={r.id} className="so-tl-row" style={{ cursor: "pointer" }} onClick={() => setDetailId(r.id)} onKeyDown={(e) => { if (e.key === "Enter") setDetailId(r.id); }}>
                      <i className={cn("so-tl-dot", tone)} />
                      <div className="so-tl-main"><b>{r.docNo}</b><small>{r.from.name} <ArrowRight /> {r.to.name}</small><small>{r.totalItems} items · {fmt(r.totalQty)} qty · Rs {fmt(r.totalValue, 2)}</small></div>
                      <div className="so-tl-r"><small>{dateLabel(r.docDate)}</small><Badge tone={tone}>{label}</Badge></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="panel so-incoming">
          <div className="so-ph"><span className="so-ph-ico"><Truck /></span><div><h3>Incoming transfers</h3><p>Dispatched stock on the road. Receive it at the destination to update stock.</p></div><span className="spacer" /><Badge tone="info" dot>{open.length} in transit · Rs {fmt(incoming?.kpis.inTransitValue ?? 0)}</Badge></div>
          <div className="so-inc-grid">
            {!incoming ? <Skeleton style={{ height: 160 }} /> : !open.length ? (
              <div className="so-empty"><Truck /><b>Nothing on the road</b><span>Dispatched transfers appear here until they are received.</span></div>
            ) : open.map((x, k) => (
              <div key={x.id} className="so-inc" style={{ ["--i" as string]: k }}>
                <div className="so-inc-top"><b>{x.docNo}</b><Badge tone="info" dot>{stat(x.status)[0]}</Badge></div>
                <div className="so-inc-route"><span><Warehouse />{x.from.name}</span><span><Warehouse />{x.to.name}</span></div>
                <div className="so-inc-bar"><i style={{ width: "50%" }} /><span className="so-inc-truck" style={{ left: "50%" }}><Truck /></span></div>
                <div className="so-inc-meta"><div><small>Lines</small><b>{x.totalItems}</b></div><div><small>Quantity</small><b>{fmt(x.totalQty)}</b></div><div><small>Value</small><b>Rs {fmt(x.totalValue)}</b></div></div>
                <div className="so-inc-when"><span><Clock />Dispatched {when(x.dispatchedAt)}</span><span><MapPin />ETA {x.etaAt ? dateLabel(x.etaAt.slice(0, 10)) : "—"}</span></div>
                <div className="so-inc-actions"><span className="so-muted"><User />{x.driverName ?? x.carrier ?? "—"}</span>{can.post && <Button size="sm" variant="primary" icon={<PackageCheck />} onClick={() => setReceiveId(x.id)}>Receive</Button>}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="so-tr-foot">
          <div className="so-foot-note"><Truck /><span>Transferring today<br />for a stronger tomorrow.</span></div>
          <div className="so-foot-stats">
            <div><span><ListChecks /></span><div><small>Total Items</small><b>{fmt(totals.items)}</b></div></div>
            <div><span><Boxes /></span><div><small>Total Quantity</small><b>{fmt(totals.qty)}</b></div></div>
            <div><span><PackageOpen /></span><div><small>Total Loose</small><b>{fmt(totals.loose)}</b></div></div>
            <div><span><Banknote /></span><div><small>Total Value</small><b>Rs {fmt(totals.value, 2)}</b></div></div>
          </div>
          {can.create && can.post && <Button variant="primary" size="lg" className="so-foot-post" icon={<Check />} disabled={!!busy} onClick={() => save(true)}>Save &amp; Dispatch Transfer<span className="so-tail"><ChevronRight /></span></Button>}
        </div>
      </div>

      <TransferDrawer key={`${detailId ?? "none"}-${attempt}`} id={detailId} can={can} attempt={attempt} onClose={() => { setDetailId(null); if (params.get("transfer")) router.replace("/inventory/transfer"); }}
        onEdit={editDraft} onReceive={(id) => { setDetailId(null); setReceiveId(id); }} onChanged={(msg) => { toast(msg, { tone: "good" }); reload(); }} />
      <ReceiveSheet key={receiveId ?? "none"} id={receiveId} onClose={() => setReceiveId(null)} onDone={(msg, warn) => { setReceiveId(null); toast(msg, { tone: warn ? "warn" : "good" }); reload(); }} />
    </div>
  );
}

function ReceiveSheet({ id, onClose, onDone }: { id: string | null; onClose: () => void; onDone: (msg: string, warn: boolean) => void }) {
  const toast = useToast();
  const [t, setT] = useState<StockTransfer | null>(null);
  const [rec, setRec] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    let off = false;
    getTransfer(id).then((x) => { if (!off) { setT(x); setRec(Object.fromEntries(x.lines.map((l) => [l.id, String(l.baseQty)]))); } }).catch((e: unknown) => toast(errMsg(e, "Could not load the transfer"), { tone: "danger" }));
    return () => { off = true; };
  }, [id, toast]);
  const sent = t?.lines.reduce((s, l) => s + l.baseQty, 0) ?? 0;
  const got = t?.lines.reduce((s, l) => s + num(rec[l.id] ?? "0"), 0) ?? 0;
  const short = t?.lines.reduce((s, l) => s + Math.max(0, l.baseQty - num(rec[l.id] ?? "0")), 0) ?? 0;
  const excess = t?.lines.reduce((s, l) => s + Math.max(0, num(rec[l.id] ?? "0") - l.baseQty), 0) ?? 0;
  const confirm = async () => {
    if (!t) return;
    setBusy(true);
    try {
      const r = await receiveTransfer(t.id, { rowVersion: t.rowVersion, note: note || null, lines: t.lines.map((l) => ({ transferLineId: l.id, receivedQty: num(rec[l.id] ?? "0") })) });
      onDone(`${r.docNo} received at ${r.to.name}${short || excess ? ` · ${short ? `${fmt(short)} short` : ""}${short && excess ? " · " : ""}${excess ? `${fmt(excess)} excess` : ""} · variance posted` : " in full"}`, short > 0);
    } catch (e) {
      toast(`${e instanceof ApiError && e.code === "TRANSFER_NOT_DISPATCHED" ? "Not dispatched yet: " : ""}${errMsg(e, "Could not receive the transfer")}`, { tone: "danger" });
    } finally { setBusy(false); }
  };
  return (
    <Modal open={!!id} onClose={onClose} wide title={t ? `Receive ${t.docNo}` : "Receive transfer"} subtitle={t ? `${t.from.name} → ${t.to.name} · count what arrived` : undefined}
      foot={<><Button variant="ghost" icon={<ListChecks />} onClick={() => t && setRec(Object.fromEntries(t.lines.map((l) => [l.id, String(l.baseQty)])))}>Receive all as sent</Button><span className="spacer" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Check />} disabled={busy || !t} onClick={confirm}>{busy ? "Receiving…" : "Confirm Receipt"}</Button></>}>
      {!t ? <Skeleton style={{ height: 200 }} /> : (
        <div className="so-rcv">
          <div className="so-rcv-stats"><div><small>Sent</small><b>{fmt(sent)}</b></div><div><small>Received</small><b>{fmt(got)}</b></div><div className="sh"><small>Shortage</small><b>{fmt(short)}</b></div><div className="ex"><small>Excess</small><b>{fmt(excess)}</b></div></div>
          <table className="tbl so-rcv-tbl" data-plain>
            <thead><tr><th>Product</th><th>Batch</th><th className="num">Sent</th><th className="num">Received</th><th className="num">Difference</th></tr></thead>
            <tbody>
              {t.lines.map((l) => {
                const d = num(rec[l.id] ?? "0") - l.baseQty;
                return (
                  <tr key={l.id} className={d < 0 ? "short" : d > 0 ? "excess" : ""}>
                    <td><div className="so-prod"><span className="so-pt"><Package /></span><div><b>{l.item.name}</b><small>{l.item.sku}</small></div></div></td>
                    <td>{l.batchNo ?? "—"}</td><td className="num">{fmt(l.baseQty)}</td>
                    <td className="num"><input type="number" min="0" className="so-cell-in" value={rec[l.id] ?? ""} onChange={(e) => setRec((r) => ({ ...r, [l.id]: e.target.value }))} /></td>
                    <td className="num"><span className={cn("so-diff", d < 0 ? "short" : d > 0 ? "excess" : "ok")}>{d === 0 ? <><Check />Matched</> : d < 0 ? <>Short {fmt(-d)}</> : <>Excess {fmt(d)}</>}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <label className="so-rcv-note"><span>Receiving note</span><input value={note} placeholder="e.g. 2 cartons crushed in transit" onChange={(e) => setNote(e.target.value)} /></label>
        </div>
      )}
    </Modal>
  );
}

function TransferDrawer({ id, can, attempt, onClose, onEdit, onReceive, onChanged }: {
  id: string | null; can: Can; attempt: number; onClose: () => void; onEdit: (t: StockTransfer) => void; onReceive: (id: string) => void; onChanged: (msg: string) => void;
}) {
  const toast = useToast();
  const [t, setT] = useState<StockTransfer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"lines" | "history">("lines");
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!id) return;
    let off = false;
    getTransfer(id).then((x) => !off && setT(x)).catch((x: unknown) => !off && setErr(errMsg(x, "Could not load the transfer")));
    return () => { off = true; };
  }, [id, attempt]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); onChanged(msg); onClose(); } catch (x) { toast(errMsg(x, "Something went wrong"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const [label, tone] = t ? stat(t.status) : ["", "neutral" as Tone];
  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={t ? t.docNo : "Transfer"} subtitle={t ? `${t.from.name} → ${t.to.name} · ${dateLabel(t.docDate)}` : undefined}
        foot={t && (
          <>
            {t.status === "DRAFT" && can.create && <Button variant="ghost" icon={<Trash2 />} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            {t.status !== "DRAFT" && t.status !== "CANCELLED" && can.post && <Button variant="ghost" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel transfer</Button>}
            <span className="spacer" />
            {t.status === "DRAFT" && can.edit && <Button disabled={busy} onClick={() => onEdit(t)}>Edit</Button>}
            {t.status === "DRAFT" && can.post && <Button variant="primary" icon={<Send />} disabled={busy} onClick={() => run(() => dispatchTransfer(t.id, t.rowVersion), `${t.docNo} dispatched`)}>Dispatch</Button>}
            {IN_TRANSIT.includes(t.status) && can.post && <Button variant="primary" icon={<PackageCheck />} disabled={busy} onClick={() => onReceive(t.id)}>Receive</Button>}
          </>
        )}>
        {err ? <ErrorState message={err} /> : !t ? <Skeleton style={{ height: 280 }} /> : (
          <>
            <div className="so-dr-hero in"><span><Truck /></span><div><b>Rs {fmt(t.totalValue, 2)}</b><small>{t.totalItems} items · {fmt(t.totalQty)} units</small></div><Badge tone={tone}>{label}</Badge></div>
            <div className="dl">
              <div><span>Carrier</span><b>{[t.carrier, t.driverName, t.vehicleNo].filter(Boolean).join(" · ") || "—"}</b></div>
              <div><span>Prepared by</span><b>{t.preparedBy?.name ?? "—"}</b></div>
              <div><span>Dispatched</span><b>{when(t.dispatchedAt)}</b></div>
              <div><span>Received</span><b>{t.receivedAt ? `${when(t.receivedAt)}${t.receivedBy ? ` · ${t.receivedBy.name}` : ""}` : "—"}</b></div>
              <div><span>Dispatch journal</span><b>{t.voucher ? <Link className="link" href={`/accounting/vouchers/${t.voucher.id}`}>{t.voucher.docNo}</Link> : "—"}</b></div>
              <div><span>Receipt journal</span><b>{t.receiptVoucher ? <Link className="link" href={`/accounting/vouchers/${t.receiptVoucher.id}`}>{t.receiptVoucher.docNo}</Link> : "—"}</b></div>
              {t.receiptNote && <div><span>Receiving note</span><b>{t.receiptNote}</b></div>}
              {t.cancelReason && <div><span>Cancelled</span><b>{t.cancelReason}</b></div>}
            </div>
            <Tabs items={[{ key: "lines", label: "Lines" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "history" ? <HistoryTab schema="Inventory" table="StockTransfers" id={t.id} /> : (
              <table className="tbl" data-plain>
                <thead><tr><th>Product</th><th>Batch</th><th className="num">Sent</th><th className="num">Received</th><th className="num">Variance</th><th className="num">Value</th></tr></thead>
                <tbody>{t.lines.map((l) => (
                  <tr key={l.id}><td><b>{l.item.name}</b><small>{l.item.sku} · {fmt(l.qtyCtn)} ctn + {fmt(l.qtyLoose)}</small></td><td>{l.batchNo ?? "—"}</td><td className="num">{fmt(l.baseQty)}</td>
                    <td className="num">{l.receivedQty === null ? "—" : fmt(l.receivedQty)}</td>
                    <td className="num">{l.varianceQty ? <span className={cn("so-diff", l.varianceQty < 0 ? "short" : "excess")}>{l.varianceQty < 0 ? `Short ${fmt(-l.varianceQty)}` : `Excess ${fmt(l.varianceQty)}`}</span> : l.receivedQty === null ? "—" : <><CircleCheck /> Matched</>}</td>
                    <td className="num">{fmt(l.value, 2)}</td></tr>
                ))}</tbody>
              </table>
            )}
            {t.remarks && <p className="so-muted" style={{ marginTop: 12 }}>{t.remarks}</p>}
          </>
        )}
      </Drawer>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this transfer?" subtitle="Dispatch and receipt are reversed: the stock goes back to the sending warehouse."
        foot={<><Button onClick={() => setCancelOpen(false)}>Keep</Button><Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => t && run(() => cancelTransfer(t.id, t.rowVersion, reason.trim()), `${t.docNo} cancelled`).then(() => setCancelOpen(false))}>Cancel transfer</Button></>}>
        <Field label="Reason" required><input value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Why is it cancelled?" /></Field>
      </Modal>
      <ConfirmDialog open={confirmDelete} danger busy={busy} title="Delete this draft?" confirmLabel="Delete draft" onClose={() => setConfirmDelete(false)}
        onConfirm={() => t && run(() => deleteTransfer(t.id, t.rowVersion), `${t.docNo} deleted`).then(() => setConfirmDelete(false))}>
        {t?.docNo} has not been dispatched. Deleting it removes it for good.
      </ConfirmDialog>
    </>
  );
}

