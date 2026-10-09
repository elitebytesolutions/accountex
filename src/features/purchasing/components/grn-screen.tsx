"use client";

import { ChevronRight, CircleCheck, ClipboardList, ClipboardPen, Clock, Download, ListChecks, OctagonAlert, PackageCheck, PackagePlus, Plus, Receipt, Save, Search, Trash2, TriangleAlert, Truck, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Grn, GrnList, PurchaseOptions, PurchaseOrder, PurchaseOrderList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { billFromGrn, cancelGrn, createGrn, deleteGrn, getGrn, getOrder, listGrns, listOrders, postGrn, purchaseOptions, updateGrn } from "../api";
import "./grn-screen.css";

type Can = { create: boolean; edit: boolean; post: boolean; bill: boolean };
type Row = GrnList["items"][number];
/** One receiving line: rec = received now, acc = accepted (rejected = rec − acc). */
type Line = {
  key: string; id: string | null; poLineId: string | null; itemId: string; ordered: number; prev: number; rec: number; acc: number; why: string;
  batchNo: string; expiry: string; unitCost: number; accEdited: boolean;
};
const PAGE = 15;
const NO_PO = "__none__";
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const rs = (n: number) => `Rs ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const QC: Record<string, { label: string; tone: Tone }> = { PASSED: { label: "Passed", tone: "good" }, PARTIAL_REJECT: { label: "Partial reject", tone: "warn" } };
const BILL: Record<string, { label: string; tone: Tone }> = { AWAITING: { label: "Awaiting", tone: "info" }, PARTIALLY_BILLED: { label: "Part billed", tone: "warn" }, BILLED: { label: "Billed", tone: "good" } };
const STATUS: Record<string, { label: string; tone: Tone }> = { DRAFT: { label: "Draft", tone: "neutral" }, POSTED: { label: "Posted", tone: "good" }, CANCELLED: { label: "Cancelled", tone: "danger" } };
const CHIPS = [{ label: "All", status: "" }, { label: "Draft", status: "DRAFT" }, { label: "Posted", status: "POSTED" }, { label: "Cancelled", status: "CANCELLED" }];
let seq = 0;
const newKey = () => `l${++seq}`;

/** Template app/purchases/grn (44-purchase-docs.html, 94-purchase-docs.js): receive against a PO, QC, 3-way match card, GRN register. */
export function GrnScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const recvRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<PurchaseOptions | null>(null);
  const [optError, setOptError] = useState<{ message: string; reference?: string } | null>(null);
  const [pos, setPos] = useState<PurchaseOrderList["items"] | null>(null);
  const [poId, setPoId] = useState<string>(() => params.get("po") ?? "");
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [docDate, setDocDate] = useState(isoDay(new Date()));
  const [vendorRef, setVendorRef] = useState("");
  const [qcNote, setQcNote] = useState("");
  const [isImport, setIsImport] = useState(false);
  const [editing, setEditing] = useState<{ id: string; docNo: string; rowVersion: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<"draft" | "post" | null>(null);

  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<GrnList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(() => params.get("grn"));
  const reload = () => setAttempt((n) => n + 1);

  useEffect(() => {
    purchaseOptions().then(setOptions).catch((e: unknown) => setOptError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load purchasing options" }));
  }, []);
  useEffect(() => {
    // default PO: the deep link, else the first open one
    listOrders({ status: "OPEN", pageSize: 200 }).then((l) => { setPos(l.items); setPoId((p) => p || (l.items[0]?.id ?? NO_PO)); }).catch(() => { setPos([]); setPoId((p) => p || NO_PO); });
  }, [attempt]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listGrns({ status, search, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load goods receipts" }));
    return () => { cancelled = true; };
  }, [status, search, page, attempt]);

  // load the chosen PO's lines (not while a draft is being edited: its lines are already set)
  useEffect(() => {
    if (!poId || editing || poId === NO_PO) return;
    let cancelled = false;
    getOrder(poId).then((p) => {
      if (cancelled) return;
      setPo(p);
      setVendorId(p.vendor.id);
      setWarehouseId((w) => p.warehouse?.id ?? w);
      setLines(p.lines.filter((l) => l.item).map((l) => ({
        key: newKey(), id: null, poLineId: l.id, itemId: l.item!.id, ordered: l.baseQty + l.bonusQty, prev: l.receivedQty, rec: 0, acc: 0, why: "", batchNo: "", expiry: "",
        unitCost: l.baseQty + l.bonusQty > 0 ? r4(l.netAmount / (l.baseQty + l.bonusQty)) : 0, accEdited: false,
      })));
      setErrors({});
    }).catch((e: unknown) => !cancelled && toast(e instanceof ApiError ? e.message : "Could not load the purchase order", { tone: "danger" }));
    return () => { cancelled = true; };
  }, [poId, editing, toast]);
  const whId = warehouseId || options?.warehouses[0]?.id || "";

  const product = (id: string) => options?.products.find((p) => p.id === id);
  const calc = useMemo(() => {
    let units = 0, val = 0, rejV = 0, over = 0, bad = 0, variance = 0, ordered = 0, recvd = 0, billed = 0;
    for (const l of lines) {
      const acc = Math.min(l.acc, l.rec), rej = l.rec - acc, remain = l.ordered - l.prev;
      units += l.rec; val += acc * l.unitCost; rejV += rej * l.unitCost;
      if (l.poLineId && (l.rec > remain + 0.0001 || l.acc > l.rec)) over++;
      if (rej > 0 && !l.why) bad++;
      ordered += l.ordered; recvd += l.prev + acc;
      const pl = po?.lines.find((x) => x.id === l.poLineId);
      if (pl) { billed += pl.billedQty; if (pl.billedQty > 0 && l.prev + acc !== pl.billedQty) variance++; }
    }
    const hasBill = billed > 0;
    const st = over ? "bad" : !hasBill ? "two" : variance ? "warn" : "ok";
    return { units, val, rejV, over, bad, variance, ordered, recvd, billed, hasBill, st };
  }, [lines, po]);

  const choosePo = (id: string) => {
    setPoId(id);
    setErrors({});
    setPo(null);
    setLines([]);
    if (id === NO_PO) setVendorId("");
  };
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const receiveAll = () => setLines((ls) => ls.map((l) => (l.poLineId ? { ...l, rec: Math.max(0, l.ordered - l.prev), acc: Math.max(0, l.ordered - l.prev), accEdited: false } : l)));
  const resetForm = () => {
    setEditing(null);
    setQcNote(""); setVendorRef(""); setIsImport(false); setErrors({});
    choosePo(pos?.[0]?.id ?? NO_PO);
  };

  const payload = () => ({
    docDate, purchaseOrderId: po?.id ?? null, vendorId, warehouseId: whId, vendorRef: vendorRef || null, qcNote: qcNote || null, isImport,
    lines: lines.filter((l) => l.rec > 0).map((l) => ({
      ...(l.id && { id: l.id }), purchaseOrderLineId: l.poLineId, itemId: l.itemId, orderedQty: l.ordered, prevReceivedQty: l.prev,
      acceptedQty: Math.min(l.acc, l.rec), rejectedQty: r4(l.rec - Math.min(l.acc, l.rec)), rejectReason: l.rec > l.acc ? l.why || null : null,
      batchNo: l.batchNo || null, expiryDate: l.expiry || null, unitCost: l.unitCost,
    })),
  });

  const save = async (andPost: boolean) => {
    if (!calc.units) { toast("Enter the quantity received on at least one line", { tone: "warn" }); return; }
    if (calc.over) { toast("Received now exceeds the open PO quantity", { tone: "danger" }); return; }
    if (calc.bad) { toast("Pick a reason for every rejected quantity", { tone: "danger" }); return; }
    if (!vendorId) { setErrors({ vendorId: "Choose the vendor" }); return; }
    if (!whId) { setErrors({ warehouseId: "Choose the receiving warehouse" }); return; }
    if (andPost) {
      const missing = lines.find((l) => l.rec > 0 && l.acc > 0 && product(l.itemId)?.trackExpiry && (!l.batchNo.trim() || !l.expiry));
      if (missing) { setErrors({ [`batch.${missing.key}`]: "Batch no. and expiry are required for this product" }); toast("Enter the batch no. and expiry date for expiry-tracked products", { tone: "danger" }); return; }
    }
    setSaving(andPost ? "post" : "draft");
    setErrors({});
    let saved: Grn | null = null;
    try {
      saved = editing ? await updateGrn(editing.id, { ...payload(), rowVersion: editing.rowVersion }) : await createGrn(payload());
      if (andPost) saved = await postGrn(saved.id, saved.rowVersion);
      toast(andPost ? `${saved.docNo} posted · ${fmt(calc.units)} units into ${saved.warehouse.name}` : `${saved.docNo} saved as draft`, {
        tone: "good",
        action: andPost && can.bill ? { label: "Create bill", onClick: () => setBillFor(saved!) } : undefined,
      });
      setEditing(null);
      setQcNote(""); setVendorRef("");
      choosePo(pos?.[0]?.id ?? NO_PO);
      reload();
    } catch (e) {
      if (saved) setEditing({ id: saved.id, docNo: saved.docNo, rowVersion: saved.rowVersion });
      const err = e instanceof ApiError ? e : null;
      const fe: Record<string, string> = {};
      const payloadLines = payload().lines;
      for (const [k, v] of Object.entries(err?.details ?? {})) {
        const m = /^lines\.(\d+)\.(\w+)$/.exec(k);
        const line = m ? lines.filter((l) => l.rec > 0)[Number(m[1])] : null;
        if (m && line && payloadLines[Number(m[1])]) fe[`${m[2]}.${line.key}`] = v[0] ?? "";
        else fe[k] = v[0] ?? "";
      }
      setErrors(fe);
      const label = err?.code === "OVER_RECEIPT" ? "Over-receipt" : err?.code === "BATCH_REQUIRED" ? "Batch / expiry missing" : err?.code === "GRN_PO_NOT_OPEN" ? "Purchase order not open" : null;
      toast(`${label ? `${label}: ` : ""}${err?.message ?? "Could not save the goods receipt"}${saved && andPost ? " · kept as draft" : ""}`, { tone: "danger" });
      if (saved) reload();
    } finally {
      setSaving(null);
    }
  };

  /** Loads a draft GRN into the receive panel. */
  const editDraft = (g: Grn) => {
    setEditing({ id: g.id, docNo: g.docNo, rowVersion: g.rowVersion });
    setPoId(g.purchaseOrder?.id ?? NO_PO);
    if (g.purchaseOrder) getOrder(g.purchaseOrder.id).then(setPo).catch(() => setPo(null)); else setPo(null);
    setVendorId(g.vendor.id); setWarehouseId(g.warehouse.id); setDocDate(g.docDate); setVendorRef(g.vendorRef ?? ""); setQcNote(g.qcNote ?? ""); setIsImport(g.isImport);
    setLines(g.lines.map((l) => ({
      key: newKey(), id: l.id, poLineId: l.purchaseOrderLineId, itemId: l.item.id, ordered: l.orderedQty, prev: l.prevReceivedQty, rec: l.receivedQty, acc: l.acceptedQty,
      why: l.rejectReason ?? "", batchNo: l.batchNo ?? "", expiry: l.expiryDate ?? "", unitCost: l.unitCost, accEdited: true,
    })));
    setErrors({});
    setDetailId(null);
    setTimeout(() => recvRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const [billFor, setBillFor] = useState<Grn | Row | null>(null);
  const k = data?.kpis;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const items = data?.items ?? [];
  const exportCsv = () => downloadCsv(`grn-register-${isoDay(new Date())}.csv`, [
    ["GRN #", "Date", "Purchase order", "Vendor", "Warehouse", "Units", "Value", "QC", "Bill", "Status"],
    ...items.map((g) => [g.docNo, g.docDate, g.purchaseOrder?.docNo ?? "", g.vendor.name, g.warehouse.name, g.receivedQty, g.acceptedAmount, QC[g.qcStatus]?.label ?? g.qcStatus, BILL[g.billStatus]?.label ?? g.billStatus, STATUS[g.status]?.label ?? g.status]),
  ]);

  if (optError && !options) return <ErrorState message={optError.message} reference={optError.reference} onRetry={() => location.reload()} />;
  const vendorName = po?.vendor.name ?? options?.vendors.find((v) => v.id === vendorId)?.name ?? "—";
  const badge = { ok: [<CircleCheck key="i" />, "3-way matched"], warn: [<TriangleAlert key="i" />, `Qty variance on ${calc.variance} line${calc.variance === 1 ? "" : "s"}`], two: [<Clock key="i" />, "2-way matched · bill awaited"], bad: [<OctagonAlert key="i" />, "Over-receipt against PO"] }[calc.st]!;
  const note = calc.st === "ok" ? "PO, GRN and vendor bill agree on every line — the bill can be approved for payment."
    : calc.st === "warn" ? "Received quantities differ from what is already billed. Receive the balance or raise a debit note."
      : calc.st === "two" ? (po ? "Quantities agree with the PO. Matching completes when the vendor bill arrives." : "Received without a purchase order: the bill is matched to this GRN only.")
        : "Received now is more than what remains open on the PO.";
  const nodes = { po: po ? "ok" : "wait", grn: calc.over ? "bad" : calc.units > 0 || calc.recvd > 0 ? "ok" : "wait", bill: !calc.hasBill ? "wait" : calc.variance ? "warn" : "ok" };

  return (
    <div className="pd-scr pd-grn">
      <div className="page-head pd-head">
        <div className="pd-head-l">
          <span className="pd-head-ic"><PackageCheck /></span>
          <div>
            <nav className="pd-crumb"><Link href="/purchases/orders">Purchases</Link><ChevronRight /><b>Goods Received</b></nav>
            <h1>Goods Received (GRN)</h1>
            <p>Receive against purchase orders, record QC results and keep PO ↔ GRN ↔ Bill in step.</p>
          </div>
        </div>
        <div className="head-actions">
          <span className="tagline">count twice, post once</span>
          <Link className="btn secondary" href="/purchases/orders"><ClipboardList />Purchase Orders</Link>
          {can.create && <Button variant="primary" icon={<PackagePlus />} onClick={() => recvRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>Receive Goods</Button>}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>GRNs this month</span><span className="icon-well"><PackageCheck /></span></div><strong>{k?.postedThisMonth ?? "—"}</strong><small>{k ? `${rs(k.valueThisMonth)} accepted` : " "}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Open purchase orders</span><span className="icon-well blue"><ClipboardList /></span></div><strong>{pos?.length ?? "—"}</strong><small>Approved, waiting for goods</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Draft GRNs</span><span className="icon-well yellow"><ClipboardPen /></span></div><strong>{k?.drafts ?? "—"}</strong><small>Counted, not yet posted</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Received, not billed</span><span className="icon-well violet"><Receipt /></span></div><strong>{k ? rs(k.awaitingBillAmount) : "—"}</strong><small>{k ? `${k.awaitingBill} GRN${k.awaitingBill === 1 ? "" : "s"} awaiting vendor bill` : " "}</small></div>
      </div>

      {can.create && (
        <div className="panel pd-card" id="pd-grn-recv" ref={recvRef}>
          <div className="pd-sec-h">
            <span className="icon-tile"><Truck /></span>
            <span className="pd-sec-t"><b>{editing ? `Edit draft ${editing.docNo}` : "Receive against PO"}</b><small>Pick an open purchase order, count what arrived and pass it through QC.</small></span>
            <div className="pd-sec-act">
              <div className="pd-inp-ic pd-po-sel"><ClipboardList />
                <select aria-label="Purchase order" value={poId} disabled={!!editing || !pos} onChange={(e) => choosePo(e.target.value)}>
                  {!pos && <option value="">Loading…</option>}
                  {pos?.map((p) => <option key={p.id} value={p.id}>{p.docNo} · {p.vendor.name}</option>)}
                  {po && !pos?.some((p) => p.id === po.id) && <option value={po.id}>{po.docNo} · {po.vendor.name}</option>}
                  <option value={NO_PO}>Without a purchase order</option>
                </select>
              </div>
              {po && <Button icon={<ListChecks />} onClick={receiveAll}>Receive all remaining</Button>}
              {editing && <Button variant="ghost" icon={<X />} onClick={resetForm}>Discard changes</Button>}
            </div>
          </div>

          {po ? (
            <div className="pd-po-meta">
              {[["Vendor", po.vendor.name], ["PO date", dateLabel(po.docDate)], ["Expected", po.expectedDate ? dateLabel(po.expectedDate) : "—"], ["Received so far", `${po.receivedPct}%`], ["Lines", String(po.lines.length)]].map(([l, v]) => <div key={l}><small>{l}</small><b>{v}</b></div>)}
            </div>
          ) : (
            <div className="grn-novendor">
              <Field label="Vendor" required error={errors.vendorId}>
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Choose the vendor…</option>{options?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
              </Field>
              <Field label="Add product">
                <select value="" onChange={(e) => {
                  const p = product(e.target.value);
                  if (p) setLines((ls) => [...ls, { key: newKey(), id: null, poLineId: null, itemId: p.id, ordered: 0, prev: 0, rec: 0, acc: 0, why: "", batchNo: "", expiry: "", unitCost: p.cost, accEdited: false }]);
                }}><option value="">Pick a product…</option>{options?.products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select>
              </Field>
              <Field label="Received on"><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></Field>
            </div>
          )}

          <div className="pd-grn-body">
            <div className="pd-grn-lines">
              <div className="table-wrap pd-gridwrap"><table className="tbl lines pd-lines pd-grn-t" data-plain="">
                <thead><tr><th>Item</th><th className="num">{po ? "Ordered" : "Unit cost"}</th><th className="num">Prev. recv.</th><th className="num">Received now</th><th className="num">Accepted</th><th className="num">Rejected</th><th>Reason</th><th>Progress</th></tr></thead>
                <tbody>
                  {!options || (poId && poId !== NO_PO && !po && !editing) ? (
                    <tr><td colSpan={8}><Skeleton style={{ height: 90 }} /></td></tr>
                  ) : !lines.length ? (
                    <tr><td colSpan={8}><EmptyState icon={<Truck />} title={po ? "Nothing to receive on this order" : "Add the products that arrived"} description={po ? "Every stock line of this PO is fully received." : "Pick a vendor and add products above."} /></td></tr>
                  ) : lines.flatMap((l) => {
                    const it = product(l.itemId);
                    const acc = Math.min(l.acc, l.rec), rej = l.rec - acc, remain = l.ordered - l.prev;
                    const pa = l.ordered ? Math.min(100, (l.prev / l.ordered) * 100) : 0, pb = l.ordered ? Math.min(100 - pa, (acc / l.ordered) * 100) : 100;
                    const needBatch = !!it?.trackExpiry && l.rec > 0;
                    const rows = [
                      <tr key={l.key} className={cn(needBatch && "grn-has-batch")}>
                        <td className="pd-prod"><b>{it?.name ?? "?"}</b><small>{it?.sku} · {it?.unit ?? "unit"} · {rs(l.unitCost)}</small>{errors[`itemId.${l.key}`] && <span className="grn-err">{errors[`itemId.${l.key}`]}</span>}</td>
                        <td className={cn("num", !po && "pd-sm")}>{po ? fmt(l.ordered) : <input className="num" type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: Math.max(0, Number(e.target.value) || 0) })} aria-label="Unit cost" />}</td>
                        <td className="num muted">{fmt(l.prev)}</td>
                        <td className="pd-sm"><input className={cn("num", l.poLineId && l.rec > remain + 0.0001 && "pd-bad")} type="number" min="0" value={l.rec} aria-label="Received now"
                          onChange={(e) => { const rec = Math.max(0, Number(e.target.value) || 0); setLine(l.key, l.accEdited ? { rec } : { rec, acc: rec }); }} /></td>
                        <td className="pd-sm"><input className={cn("num", (l.acc > l.rec || !!errors[`acceptedQty.${l.key}`]) && "pd-bad")} type="number" min="0" value={l.acc} aria-label="Accepted"
                          onChange={(e) => setLine(l.key, { acc: Math.max(0, Number(e.target.value) || 0), accEdited: true })} />{errors[`acceptedQty.${l.key}`] && <span className="grn-err">{errors[`acceptedQty.${l.key}`]}</span>}</td>
                        <td className={cn("num pd-rej", rej > 0 && "on")}>{fmt(rej)}</td>
                        <td className="pd-why">
                          <select aria-label="Reject reason" disabled={rej <= 0} className={cn(rej > 0 && !l.why && "pd-bad")} value={l.why} onChange={(e) => setLine(l.key, { why: e.target.value })}>
                            <option value="">—</option>{options.rejectReasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                          </select>
                        </td>
                        <td className="pd-prog">
                          {po ? <><div className={cn("pd-pbar", l.prev + acc >= l.ordered && "full")}><i className="a" style={{ width: `${pa}%` }} /><i className="b" style={{ width: `${pb}%` }} /></div>
                            <small>{fmt(l.prev)} + <b>{fmt(acc)}</b> / {fmt(l.ordered)}{l.prev + acc >= l.ordered ? " · complete" : ""}</small></>
                            : <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />}
                        </td>
                      </tr>,
                    ];
                    if (needBatch) rows.push(
                      <tr key={`${l.key}-b`} className="grn-batch"><td colSpan={8}>
                        <div className="grn-batch-in">
                          <span>Expiry-tracked · batch</span>
                          <input placeholder="Batch no." value={l.batchNo} className={cn(errors[`batch.${l.key}`] && !l.batchNo.trim() && "pd-bad")} onChange={(e) => setLine(l.key, { batchNo: e.target.value })} aria-label="Batch no." />
                          <span>expiry</span>
                          <input type="date" value={l.expiry} className={cn(errors[`batch.${l.key}`] && !l.expiry && "pd-bad")} onChange={(e) => setLine(l.key, { expiry: e.target.value })} aria-label="Expiry date" />
                          {errors[`batch.${l.key}`] && <span className="grn-err">{errors[`batch.${l.key}`]}</span>}
                        </div>
                      </td></tr>,
                    );
                    return rows;
                  })}
                </tbody>
              </table></div>
              <div className="pd-fgrid c3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                {po && <label className="pd-f"><span>Received on</span><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></label>}
                <label className="pd-f"><span>Vendor delivery challan / ref</span><input value={vendorRef} maxLength={60} placeholder="DC-…" onChange={(e) => setVendorRef(e.target.value)} /></label>
                <label className="pd-f"><span>Import shipment</span><div className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" style={{ width: 16, height: 16 }} checked={isImport} onChange={(e) => setIsImport(e.target.checked)} /> Landed cost posts it later</div></label>
              </div>
              <label className="pd-f pd-qc"><span><ClipboardPen />QC note</span><textarea rows={2} maxLength={300} value={qcNote} placeholder="e.g. 2 cartons crushed in transit — photographed and logged with TCS." onChange={(e) => setQcNote(e.target.value)} /></label>
            </div>

            <div className="pd-match-card">
              <div className="pd-match" data-st={calc.st}>
                <div className="pd-mnode" data-st={nodes.po}><span><ClipboardList /></span><b>PO</b><small>{po ? `${fmt(calc.ordered)} ordered` : "none"}</small></div>
                <i className="pd-mlink" />
                <div className="pd-mnode" data-st={nodes.grn}><span><PackageCheck /></span><b>GRN</b><small>{fmt(calc.recvd)} received</small></div>
                <i className="pd-mlink" />
                <div className="pd-mnode" data-st={nodes.bill}><span><Receipt /></span><b>Bill</b><small>{calc.hasBill ? `${fmt(calc.billed)} billed` : "awaited"}</small></div>
              </div>
              <div className="pd-match-badge" data-st={calc.st}>{badge[0]}<span>{badge[1]}</span></div>
              <p className="pd-match-note">{note}</p>
              <dl className="pd-sum">
                <div><dt>Units received now</dt><dd>{fmt(calc.units)}</dd></div>
                <div><dt>Accepted value</dt><dd>{rs(calc.val)}</dd></div>
                <div><dt>Rejected (debit note)</dt><dd>{rs(calc.rejV)}</dd></div>
                <div><dt>Vendor</dt><dd>{vendorName}</dd></div>
              </dl>
              <label className="pd-f"><span>Receive into</span>
                <select value={whId} className={cn(errors.warehouseId && "pd-bad")} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">Choose…</option>{options?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <div className="grn-actions">
                <Button icon={<Save />} disabled={!!saving} onClick={() => save(false)}>{saving === "draft" ? "Saving…" : "Save draft"}</Button>
              </div>
              {can.post && <button type="button" className="btn primary lg block" disabled={!!saving} onClick={() => save(true)}><PackageCheck /><span>{saving === "post" ? "Posting GRN…" : "Post GRN"}</span></button>}
            </div>
          </div>
        </div>
      )}

      <div className="panel flush">
        <div className="panel-head"><div><h3>GRN Register</h3><p>Goods received · latest first</p></div>
          <div className="panel-actions">
            <label className="search-field"><Search /><input placeholder="Search GRN, PO, vendor…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
            <Button size="sm" icon={<Download />} onClick={exportCsv} disabled={!items.length}>Export</Button>
          </div>
        </div>
        <div className="toolbar">
          <div className="chips">
            {CHIPS.map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); }}>{c.label} <i>{data ? (c.status ? data.counts[c.status] ?? 0 : Object.values(data.counts).reduce((s, n) => s + n, 0)) : 0}</i></button>)}
          </div>
        </div>
        {error && !data ? <ErrorState message={error.message} reference={error.reference} onRetry={reload} /> : !data ? <Skeleton style={{ height: 320 }} /> : !items.length ? (
          <EmptyState icon={<PackageCheck />} title={status || search ? "No goods receipts match" : "No goods received yet"} description={status || search ? "Try another status or search." : "Receive goods against an approved purchase order above."} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>GRN #</th><th>Date</th><th>Purchase Order</th><th>Vendor</th><th>Warehouse</th><th className="num">Units</th><th className="num">Value</th><th>QC</th><th>Bill</th></tr></thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id} style={{ cursor: "pointer" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setDetailId(g.id); }}>
                  <td><b><Hl text={g.docNo} q={search} /></b>{g.status !== "POSTED" && <small><Badge tone={STATUS[g.status]?.tone}>{STATUS[g.status]?.label ?? g.status}</Badge></small>}</td>
                  <td>{dateLabel(g.docDate)}</td>
                  <td>{g.purchaseOrder ? <Link className="link" href={`/purchases/orders?po=${g.purchaseOrder.id}`}>{g.purchaseOrder.docNo}</Link> : <span className="muted">—</span>}</td>
                  <td><Hl text={g.vendor.name} q={search} /></td>
                  <td>{g.warehouse.name}</td>
                  <td className="num">{fmt(g.receivedQty)}</td>
                  <td className="num">{rs(g.acceptedAmount)}</td>
                  <td><Badge tone={QC[g.qcStatus]?.tone} dot>{QC[g.qcStatus]?.label ?? g.qcStatus}</Badge></td>
                  <td>{g.status === "POSTED" ? <Badge tone={BILL[g.billStatus]?.tone}>{BILL[g.billStatus]?.label ?? g.billStatus}</Badge> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {data && data.total > 0 && (
          <div className="table-foot">
            <span>Showing {items.length} of {data.total} goods receipt{data.total === 1 ? "" : "s"}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => <button key={p} type="button" className={cn(p === page && "active")} onClick={() => setPage(p)}>{p}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      <GrnDrawer id={detailId} can={can} attempt={attempt} onClose={() => setDetailId(null)} onEdit={editDraft} onChanged={(msg) => { toast(msg, { tone: "good" }); reload(); }} onBill={setBillFor} />
      <BillModal key={`bill-${billFor?.id ?? "none"}`} grn={billFor} onClose={() => setBillFor(null)} onDone={(id, no) => { setBillFor(null); toast(`${no} created as draft`, { tone: "good" }); router.push(`/purchases/bills/${id}`); }} />
    </div>
  );
}

/** Detail drawer: lines, journal, linked bills, history; draft → edit / post / delete, posted → cancel / create bill. */
function GrnDrawer({ id, can, attempt, onClose, onEdit, onChanged, onBill }: {
  id: string | null; can: Can; attempt: number; onClose: () => void; onEdit: (g: Grn) => void; onChanged: (msg: string) => void; onBill: (g: Grn) => void;
}) {
  const toast = useToast();
  const [loaded, setLoaded] = useState<Grn | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [tab, setTab] = useState<"lines" | "history">("lines");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getGrn(id).then((x) => !cancelled && setLoaded(x)).catch((e: unknown) => !cancelled && setFailed({ id, message: e instanceof ApiError ? e.message : "Could not load the goods receipt" }));
    return () => { cancelled = true; };
  }, [id, attempt]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); onChanged(msg); onClose(); } catch (e) { toast(e instanceof ApiError ? e.message : "Something went wrong", { tone: "danger" }); } finally { setBusy(false); }
  };
  const g = loaded && loaded.id === id ? loaded : null;
  const err = !g && failed?.id === id ? failed.message : null;
  const billed = !!g?.lines.some((l) => l.billedQty > 0);
  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={g ? `${g.docNo} · ${g.vendor.name}` : "Goods receipt"} subtitle={g ? `${dateLabel(g.docDate)} · ${g.warehouse.name}${g.purchaseOrder ? ` · ${g.purchaseOrder.docNo}` : ""}` : undefined}
        foot={g && (
          <>
            {g.status === "DRAFT" && can.create && <Button variant="ghost" icon={<Trash2 />} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <span className="spacer" />
            {g.status === "DRAFT" && can.edit && <Button icon={<ClipboardPen />} disabled={busy} onClick={() => onEdit(g)}>Edit</Button>}
            {g.status === "DRAFT" && can.post && <Button variant="primary" icon={<PackageCheck />} disabled={busy} onClick={() => run(() => postGrn(g.id, g.rowVersion), `${g.docNo} posted`)}>{busy ? "Posting…" : "Post GRN"}</Button>}
            {g.status === "POSTED" && can.post && !billed && <Button variant="ghost" icon={<X />} disabled={busy} onClick={() => setCancelOpen(true)}>Cancel GRN</Button>}
            {g.status === "POSTED" && can.bill && g.billStatus !== "BILLED" && <Button variant="primary" icon={<Plus />} onClick={() => onBill(g)}>Create bill</Button>}
          </>
        )}>
        {err ? <ErrorState message={err} /> : !g ? <Skeleton style={{ height: 300 }} /> : (
          <>
            <div className="row mb" style={{ gap: 6, flexWrap: "wrap" }}>
              <Badge tone={STATUS[g.status]?.tone} dot>{STATUS[g.status]?.label ?? g.status}</Badge>
              <Badge tone={QC[g.qcStatus]?.tone}>{QC[g.qcStatus]?.label ?? g.qcStatus}</Badge>
              {g.status === "POSTED" && <Badge tone={BILL[g.billStatus]?.tone}>{BILL[g.billStatus]?.label ?? g.billStatus}</Badge>}
              {g.isImport && <Badge tone="violet">Import</Badge>}
            </div>
            <Tabs items={[{ key: "lines", label: "Lines" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            <div className="mt" />
            {tab === "history" ? <HistoryTab schema="Purchases" table="GoodsReceivedNotes" id={g.id} /> : (
              <>
                <div className="table-wrap"><table className="tbl">
                  <thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Accepted</th><th className="num">Rejected</th><th>Batch / expiry</th><th className="num">Unit cost</th><th className="num">Value</th><th className="num">Billed</th></tr></thead>
                  <tbody>
                    {g.lines.map((l) => (
                      <tr key={l.id}>
                        <td><b>{l.item.name}</b><small>{l.item.sku}</small></td>
                        <td className="num">{l.orderedQty ? fmt(l.orderedQty) : "—"}</td>
                        <td className="num">{fmt(l.acceptedQty)}</td>
                        <td className="num">{l.rejectedQty ? <>{fmt(l.rejectedQty)}<small>{l.rejectReason}</small></> : "—"}</td>
                        <td>{l.batchNo ? <>{l.batchNo}<small>{l.expiryDate ? `exp ${dateLabel(l.expiryDate)}` : ""}</small></> : <span className="muted">—</span>}</td>
                        <td className="num">{l.unitCost.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                        <td className="num">{rs(l.acceptedAmount)}</td>
                        <td className="num">{fmt(l.billedQty)}</td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={6}>Accepted value</td><td className="num">{rs(g.acceptedAmount)}</td><td /></tr>
                  </tbody>
                </table></div>
                <div className="dl mt">
                  <div><span>Vendor ref</span><b>{g.vendorRef ?? "—"}</b></div>
                  <div><span>QC note</span><b>{g.qcNote ?? "—"}</b></div>
                  <div><span>Journal</span><b>{g.voucher ? <Link href={`/accounting/vouchers/${g.voucher.id}`}>{g.voucher.docNo}</Link> : g.isImport && g.status === "POSTED" ? "Posted with landed cost" : "—"}</b></div>
                  <div><span>Bills</span><b>{g.bills.length ? g.bills.map((b, i) => <span key={b.id}>{i > 0 && ", "}<Link href={`/purchases/bills/${b.id}`}>{b.docNo}</Link></span>) : "—"}</b></div>
                  {g.cancelledAt && <div><span>Cancelled</span><b>{dateLabel(g.cancelledAt.slice(0, 10))}{g.cancelReason ? ` — ${g.cancelReason}` : ""}</b></div>}
                  <div><span>Received by</span><b>{g.createdBy?.name ?? "—"}</b></div>
                </div>
              </>
            )}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={confirmDelete} danger busy={busy} title="Delete this draft?" confirmLabel="Delete draft" onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); if (g) void run(() => deleteGrn(g.id, g.rowVersion), `${g.docNo} deleted`); }}>
        Nothing was posted yet; the draft goods receipt is removed.
      </ConfirmDialog>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel goods receipt" subtitle="Stock and the GRNI journal are reversed." foot={
        <><button type="button" className="btn secondary" onClick={() => setCancelOpen(false)} disabled={busy}>Keep it</button>
          <button type="button" className="btn danger" disabled={busy || reason.trim().length < 3} onClick={() => { setCancelOpen(false); if (g) void run(() => cancelGrn(g.id, g.rowVersion, reason.trim()), `${g.docNo} cancelled · stock reversed`); }}>Cancel GRN</button></>
      }>
        <FormGrid><Field label="Reason" required full hint="At least 3 characters"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Goods returned to the vendor at the gate" /></Field></FormGrid>
      </Modal>
    </>
  );
}

/** Creates a draft vendor bill for the GRN's unbilled quantities. */
function BillModal({ grn, onClose, onDone }: { grn: Grn | Row | null; onClose: () => void; onDone: (id: string, docNo: string) => void }) {
  const [inv, setInv] = useState("");
  const [date, setDate] = useState(isoDay(new Date()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (!grn) return;
    setBusy(true);
    setErr(null);
    try { const b = await billFromGrn(grn.id, { vendorInvoiceNo: inv.trim(), docDate: date }); onDone(b.id, b.docNo); } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not create the bill"); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!grn} onClose={onClose} title="Create vendor bill" subtitle={grn ? `From ${grn.docNo} · ${grn.vendor.name}` : undefined} foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" disabled={busy || !inv.trim()} onClick={run}>{busy ? "Creating…" : "Create bill"}</button></>
    }>
      <FormGrid>
        <Field label="Vendor invoice no." required error={err ?? undefined}><input value={inv} maxLength={60} onChange={(e) => setInv(e.target.value)} placeholder="As printed on the vendor's invoice" /></Field>
        <Field label="Bill date" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}
