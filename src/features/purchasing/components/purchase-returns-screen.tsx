"use client";

import {
  Ban, Banknote, Boxes, Check, ChevronRight, CircleAlert, CirclePlus, Coins, Download, Ellipsis, Eye, FileMinus2, FileSearch, GitCompareArrows, History, Info, List,
  Package, PackageOpen, PackageX, Pencil, Percent, Plus, Save, Search, Trash2, Undo2, UserRound, Wallet, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { returnLineAmounts, type PurchaseOptions, type PurchaseReturn, type PurchaseReturnList, type ReturnBill } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { cancelReturn, createReturn, deleteReturn, getReturn, listReturns, postReturn, purchaseOptions, returnBills, returnableLines, updateReturn } from "../api";
import "./purchase-voucher.css";
import "./purchase-returns.css";

type Can = { create: boolean; edit: boolean; post: boolean };
type Row = PurchaseReturnList["items"][number];
type Bill = ReturnBill;
/** An editor line; `max` is what can still be returned on its bill line (null without a bill). */
type Line = {
  key: string; billLineId: string | null; itemId: string; batchNo: string; expiry: string; rate: number; qty: number; bonus: number; disc: number;
  taxCodeId: string | null; gst: number; max: number | null; purchased: number | null; returned: number | null;
};
type Editing = { id: string; docNo: string; rowVersion: number };
const PAGE = 6;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const rs = (n: number) => `Rs ${fmt(n)}`;
const REASONS: { code: string; label: string }[] = [
  { code: "EXPIRED", label: "Expired / near expiry" }, { code: "DAMAGED", label: "Damaged in transit" },
  { code: "WRONG_ITEM", label: "Wrong item supplied" }, { code: "QUALITY", label: "Quality rejected (QC)" },
];
const reasonLabel = (c: string) => REASONS.find((r) => r.code === c)?.label ?? c;
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, POSTED: { label: "Posted", tone: "good" }, REFERENCED: { label: "Referenced", tone: "info" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const CHIPS = [{ label: "All", status: "" }, { label: "Draft", status: "DRAFT" }, { label: "Posted", status: "POSTED" }, { label: "Cancelled", status: "CANCELLED" }];
const payLabel = (s: string) => (s === "CASH_REFUND" ? "Cash refund" : "Credit");
let seq = 0;
const newKey = () => `r${++seq}`;
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Template app/purchases/returns (44-purchase-docs.html, 94-purchase-docs.js): returns register with expandable rows and the return editor. */
export function PurchaseReturnsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const editorRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<PurchaseOptions | null>(null);
  const [optError, setOptError] = useState<{ message: string; reference?: string } | null>(null);

  // register
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PurchaseReturnList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, PurchaseReturn>>({});
  const [drawerId, setDrawerId] = useState<string | null>(() => params.get("pr"));
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [cancelFor, setCancelFor] = useState<Row | PurchaseReturn | null>(null);
  const [deleteFor, setDeleteFor] = useState<Row | PurchaseReturn | null>(null);
  const reload = () => { setAttempt((n) => n + 1); setDetails({}); };

  // editor
  const [editing, setEditing] = useState<Editing | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [billsDenied, setBillsDenied] = useState(false);
  const [billId, setBillId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [docDate, setDocDate] = useState(isoDay(new Date()));
  const [supplierBillNo, setSupplierBillNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [settlement, setSettlement] = useState<"CREDIT" | "CASH_REFUND">("CREDIT");
  const [cashAccountId, setCashAccountId] = useState("");
  const [reason, setReason] = useState("DAMAGED");
  const [gatePass, setGatePass] = useState("");
  const [transporter, setTransporter] = useState("");
  const [dnNarration, setDnNarration] = useState("Goods returned against supplier bill — please issue credit note.");
  const [lines, setLines] = useState<Line[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [tab, setTab] = useState<"items" | "effect" | "info">("items");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<"draft" | "post" | null>(null);
  const [lastStatus, setLastStatus] = useState<string>("Draft");

  useEffect(() => {
    purchaseOptions().then(setOptions).catch((e: unknown) => setOptError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load purchasing options" }));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listReturns({ status, search, vendor: vendorFilter, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load purchase returns" }));
    return () => { cancelled = true; };
  }, [status, search, vendorFilter, page, attempt]);
  // the vendor's posted bills (reference purchase)
  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    returnBills(vendorId)
      .then((l) => { if (!cancelled) { setBills(l); setBillsDenied(false); } })
      .catch((e: unknown) => { if (!cancelled) { setBills([]); setBillsDenied(e instanceof ApiError && e.status === 403); } });
    return () => { cancelled = true; };
  }, [vendorId]);

  // defaults until the user (or the bill) picks one
  const whId = warehouseId || options?.warehouses[0]?.id || "";
  const brId = branchId || options?.branches[0]?.id || "";
  const cashId = cashAccountId || options?.cashAccounts[0]?.id || "";
  const product = useCallback((id: string) => options?.products.find((p) => p.id === id), [options]);
  const taxRateOf = useCallback((taxCodeId: string | null, fallback: number) => options?.taxCodes.find((t) => t.id === taxCodeId)?.rate ?? fallback, [options]);
  const active = lines.filter((l) => l.itemId && l.qty > 0);
  const totals = useMemo(() => {
    const T = { n: 0, g: 0, d: 0, t: 0, a: 0, units: 0, stock: 0 };
    for (const l of lines) {
      if (!l.itemId) continue;
      const a = returnLineAmounts({ returnQty: l.qty, rate: l.rate, discountPct: l.disc, taxRate: l.gst });
      T.n++; T.g += a.grossAmount; T.d += a.discountAmount; T.t += a.taxAmount; T.a += a.totalAmount;
      T.units += l.qty + l.bonus; T.stock += (l.qty + l.bonus) * (product(l.itemId)?.avgCost ?? l.rate);
    }
    return T;
  }, [lines, product]);
  const over = lines.some((l) => l.max !== null && l.qty + l.bonus > l.max + 0.0001);

  // ---------------------------------------------------------------- editor actions
  const chooseVendor = (id: string) => {
    setVendorId(id);
    setBills(id ? null : []);
    setBillId("");
    setLines([]);
    setErrors((e) => ({ ...e, vendorId: "" }));
  };
  const loadReturnable = async (id: string, exceptId?: string, keep?: Line[]) => {
    setLinesLoading(true);
    try {
      const rl = await returnableLines(id, exceptId);
      if (keep) {
        setLines(keep.map((l) => {
          const r = rl.find((x) => x.billLineId === l.billLineId);
          return r ? { ...l, max: r.returnableQty, purchased: r.purchasedQty, returned: r.returnedQty } : l;
        }));
      } else {
        setLines(rl.filter((r) => r.returnableQty > 0).map((r) => ({
          key: newKey(), billLineId: r.billLineId, itemId: r.item.id, batchNo: r.batchNo ?? "", expiry: r.expiryDate ?? "", rate: r.rate, qty: 0, bonus: 0, disc: r.discountPct,
          taxCodeId: r.taxCode?.id ?? null, gst: r.taxRate, max: r.returnableQty, purchased: r.purchasedQty, returned: r.returnedQty,
        })));
        if (!rl.some((r) => r.returnableQty > 0)) toast("Everything on this bill has already been returned", { tone: "warn" });
      }
    } catch (e) {
      toast(errMsg(e, "Could not load the bill's lines"), { tone: "danger" });
    } finally {
      setLinesLoading(false);
    }
  };
  const chooseBill = (id: string) => {
    setBillId(id);
    setErrors({});
    if (!id) { setLines([]); return; }
    const b = bills?.find((x) => x.id === id);
    if (b) {
      setSupplierBillNo(b.vendorInvoiceNo);
      setBranchId(b.branch.id);
      if (b.warehouse) setWarehouseId(b.warehouse.id);
    }
    void loadReturnable(id, editing?.id);
    setTab("items");
  };
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addItem = () => {
    setLines((ls) => [...ls, { key: newKey(), billLineId: null, itemId: "", batchNo: "", expiry: "", rate: 0, qty: 1, bonus: 0, disc: 0, taxCodeId: null, gst: 18, max: null, purchased: null, returned: null }]);
    setTab("items");
  };
  const pickProduct = (key: string, id: string) => {
    const p = product(id);
    if (!p) return;
    setLine(key, { itemId: p.id, rate: p.cost, taxCodeId: p.taxCodeId, gst: taxRateOf(p.taxCodeId, p.gstRate) });
  };
  const resetEditor = () => {
    setEditing(null);
    setVendorId(""); setBills([]); setBillId(""); setLines([]); setSupplierBillNo(""); setRemarks(""); setSettlement("CREDIT");
    setReason("DAMAGED"); setGatePass(""); setTransporter(""); setErrors({}); setDocDate(isoDay(new Date()));
    setDnNarration("Goods returned against supplier bill — please issue credit note.");
  };
  const scrollToEditor = () => setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);

  /** Loads a draft return into the editor. */
  const editDraft = async (id: string) => {
    try {
      const r = await getReturn(id);
      setEditing({ id: r.id, docNo: r.docNo, rowVersion: r.rowVersion });
      setVendorId(r.vendor.id); setBills(null); setBillId(r.bill?.id ?? ""); setWarehouseId(r.warehouse.id); setBranchId(r.branch.id); setDocDate(r.docDate);
      setSupplierBillNo(r.supplierBillNo ?? ""); setRemarks(r.remarks ?? ""); setSettlement(r.settlement === "CASH_REFUND" ? "CASH_REFUND" : "CREDIT");
      if (r.cashAccount) setCashAccountId(r.cashAccount.id);
      setReason(r.reason); setGatePass(r.gatePassNo ?? ""); setTransporter(r.transporter ?? ""); setDnNarration(r.debitNoteNarration ?? "");
      const ls: Line[] = r.lines.map((l) => ({
        key: newKey(), billLineId: l.billLineId, itemId: l.item.id, batchNo: l.batchNo ?? "", expiry: l.expiryDate ?? "", rate: l.rate, qty: l.returnQty, bonus: l.bonusQty,
        disc: l.discountPct, taxCodeId: l.taxCode?.id ?? null, gst: l.taxRate, max: null, purchased: l.purchasedQty, returned: null,
      }));
      setLines(ls);
      if (r.bill) void loadReturnable(r.bill.id, r.id, ls);
      setErrors({}); setTab("items"); setDrawerId(null);
      scrollToEditor();
    } catch (e) {
      toast(errMsg(e, "Could not load the return"), { tone: "danger" });
    }
  };

  const payload = () => ({
    docDate, vendorId, branchId: brId, warehouseId: whId, billId: billId || null, supplierBillNo: supplierBillNo || null, settlement,
    cashAccountId: settlement === "CASH_REFUND" ? cashId || null : null, reason, gatePassNo: gatePass || null, transporter: transporter || null,
    debitNoteNarration: dnNarration || null, remarks: remarks || null,
    lines: active.map((l) => ({
      billLineId: l.billLineId, itemId: l.itemId, batchNo: l.batchNo || null, expiryDate: l.expiry || null, returnQty: l.qty, bonusQty: l.bonus, rate: l.rate,
      discountPct: l.disc, taxCodeId: l.taxCodeId, taxRate: l.gst,
    })),
  });

  const save = async (act: "draft" | "post") => {
    const fe: Record<string, string> = {};
    if (!vendorId) fe.vendorId = "Select a supplier";
    if (!whId) fe.warehouseId = "Choose the warehouse the goods leave from";
    if (settlement === "CASH_REFUND" && !cashId) fe.cashAccountId = "Choose the cash account the refund goes into";
    if (Object.keys(fe).length) { setErrors(fe); toast(Object.values(fe)[0]!, { tone: "danger" }); return; }
    if (!active.length) { toast("Add at least one item to return", { tone: "warn" }); setTab("items"); return; }
    if (over) { toast("Returned qty exceeds what can still be returned on a line", { tone: "danger" }); setTab("items"); return; }
    setSaving(act);
    setErrors({});
    let saved: PurchaseReturn | null = null;
    try {
      saved = editing ? await updateReturn(editing.id, { ...payload(), rowVersion: editing.rowVersion }) : await createReturn(payload());
      if (act === "post") saved = await postReturn(saved.id, saved.rowVersion);
      setLastStatus(act === "post" ? "Posted" : "Draft");
      toast(act === "post"
        ? `${saved.docNo} posted · stock, ${saved.settlement === "CASH_REFUND" ? "cash" : "payable"} and GST reversed${saved.debitNote ? ` · ${saved.debitNote.docNo} applied` : ""}`
        : `${saved.docNo} saved as draft`, {
        tone: "good",
        action: saved.debitNote ? { label: "Debit note", onClick: () => router.push(`/purchases/debit-notes?dn=${saved!.debitNote!.id}`) } : undefined,
      });
      resetEditor();
      reload();
      setTimeout(() => setLastStatus("Draft"), 2600);
    } catch (e) {
      if (saved) setEditing({ id: saved.id, docNo: saved.docNo, rowVersion: saved.rowVersion });
      const err = e instanceof ApiError ? e : null;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(err?.details ?? {})) {
        const m = /^lines\.(\d+)\.(\w+)$/.exec(k);
        const line = m ? active[Number(m[1])] : null;
        if (m && line) out[`${m[2]}.${line.key}`] = v[0] ?? "";
        else out[k] = v[0] ?? "";
      }
      setErrors(out);
      if (Object.keys(out).some((k) => k.includes("."))) setTab("items");
      const label = err?.code === "RETURN_QTY_EXCEEDS" ? "Over-return" : err?.code === "RETURN_NOT_EDITABLE" ? "Not editable" : null;
      toast(`${label ? `${label}: ` : ""}${err?.message ?? "Could not save the return"}${saved && act === "post" ? " · kept as draft" : ""}`, { tone: "danger" });
      if (saved) reload();
    } finally {
      setSaving(null);
    }
  };

  // ---------------------------------------------------------------- register actions
  const toggle = (r: Row) => {
    setOpen((o) => ({ ...o, [r.id]: !o[r.id] }));
    if (!details[r.id]) getReturn(r.id).then((d) => setDetails((x) => ({ ...x, [r.id]: d }))).catch(() => undefined);
  };
  const rowMenu = (anchor: HTMLElement, r: Row) => {
    const items: MenuItem[] = [
      { label: "View details", icon: <Eye />, onClick: () => setDrawerId(r.id) },
      { label: "History", icon: <History />, onClick: () => setDrawerId(r.id) },
    ];
    if (r.debitNote) items.push({ label: `Open ${r.debitNote.docNo}`, icon: <FileMinus2 />, onClick: () => router.push(`/purchases/debit-notes?dn=${r.debitNote!.id}`) });
    if (r.status === "DRAFT" && can.edit) items.push({ label: "Edit return", icon: <Pencil />, onClick: () => void editDraft(r.id) });
    if (r.status === "DRAFT" && can.create) items.push({ sep: true }, { label: "Delete draft", icon: <Trash2 />, danger: true, onClick: () => setDeleteFor(r) });
    if (r.status === "POSTED" && can.post) items.push({ sep: true }, { label: "Cancel return", icon: <Ban />, danger: true, onClick: () => setCancelFor(r) });
    setMenu({ anchor, items });
  };
  const runAction = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg, { tone: "good" }); reload(); setDrawerId(null); } catch (e) { toast(errMsg(e, "Something went wrong"), { tone: "danger" }); }
  };

  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const start = (page - 1) * PAGE;
  const k = data?.kpis;
  const exportCsv = () => downloadCsv(`purchase-returns-${isoDay(new Date())}.csv`, [
    ["Return #", "Date", "Supplier", "Reference #", "Supplier Bill #", "Reason", "Amount", "Status", "Payment"],
    ...items.map((r) => [r.docNo, r.docDate, r.vendor.name, r.bill?.docNo ?? "", r.supplierBillNo ?? "", reasonLabel(r.reason), r.totalAmount, STATUS[r.status]?.label ?? r.status, payLabel(r.settlement)]),
  ]);

  if (optError && !options) return <ErrorState message={optError.message} reference={optError.reference} onRetry={() => location.reload()} />;
  const bill = bills?.find((b) => b.id === billId);
  const vendorName = options?.vendors.find((v) => v.id === vendorId)?.name;
  const cash = settlement === "CASH_REFUND";
  const cashName = options?.cashAccounts.find((c) => c.id === cashId)?.name;
  const whName = options?.warehouses.find((w) => w.id === whId)?.name ?? "the warehouse";
  const priceDiff = Math.round((totals.g - totals.d - totals.stock) * 100) / 100;
  const jv: [string, number, number][] = [
    [cash ? `Cash — ${cashName ?? "cash account"}` : `Supplier payable — ${vendorName ?? "supplier"}`, totals.a, 0],
    [`Stock in trade — ${whName} (book value)`, 0, totals.stock],
    ["Input sales tax (reversal)", 0, totals.t],
  ];
  if (Math.abs(priceDiff) >= 0.01) jv.push(["Price difference (cost of sales)", priceDiff < 0 ? -priceDiff : 0, priceDiff > 0 ? priceDiff : 0]);
  const dr = jv.reduce((s, l) => s + l[1], 0), cr = jv.reduce((s, l) => s + l[2], 0);
  const balanced = Math.abs(dr - cr) < 0.01 && totals.a > 0;

  return (
    <div className="pd-scr pd-pr">
      <div className="page-head pd-head">
        <div className="pd-head-l">
          <span className="pd-head-ic"><PackageX /></span>
          <div>
            <nav className="pd-crumb"><Link href="/purchases/bills">Purchases</Link><ChevronRight /><b>Purchase Returns</b></nav>
            <h1>Purchase Returns</h1>
            <p>View and manage everything sent back to suppliers — with its stock, payable and GST effect.</p>
          </div>
        </div>
        <div className="head-actions">
          <Button icon={<Download />} onClick={exportCsv} disabled={!items.length}>Export</Button>
          {can.create && <Button variant="primary" icon={<Plus />} onClick={() => { resetEditor(); scrollToEditor(); }}>New Purchase Return</Button>}
        </div>
      </div>

      <div className="panel pd-card flushx">
        <div className="pd-pr-filters">
          <label className="search-field pd-pr-q"><Search /><input placeholder="Search by return #, supplier, bill #…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <label className="pd-f"><span>Supplier</span>
            <select value={vendorFilter} onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}>
              <option value="">All Suppliers</option>{options?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <div className="pd-pr-fbtn">
            <Button variant="primary" icon={<Search />} onClick={() => { setSearch(q.trim()); setPage(1); reload(); }}>Search</Button>
            <Button onClick={() => { setQ(""); setSearch(""); setVendorFilter(""); setStatus(""); setPage(1); }}>Clear</Button>
          </div>
        </div>
        <div className="pd-pr-chiprow">
          <div className="chips">
            {CHIPS.map((c) => (
              <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); }}>
                {c.label} <i>{data ? (c.status ? data.counts[c.status] ?? 0 : Object.values(data.counts).reduce((s, n) => s + n, 0)) : 0}</i>
              </button>
            ))}
          </div>
          <span className="spacer" />
          {k && (
            <span className="muted small">
              This month <b>{k.thisMonth}</b> returned · <b>{rs(k.thisMonthAmount)}</b> (credit {rs(k.creditAmount)} · cash {rs(k.cashRefundAmount)}){k.drafts ? <> · <b>{k.drafts}</b> draft{k.drafts === 1 ? "" : "s"}</> : null}
            </span>
          )}
        </div>
        {error && !data ? <ErrorState message={error.message} reference={error.reference} onRetry={reload} /> : !data ? <Skeleton style={{ height: 300 }} /> : !items.length ? (
          <EmptyState icon={<PackageX />} title={status || search || vendorFilter ? "No returns match" : "No purchase returns yet"}
            description={status || search || vendorFilter ? "Try another status, supplier or search." : "Goods sent back to suppliers appear here once saved."} />
        ) : (
          <div className="table-wrap"><table className="tbl pd-pr-t" data-plain="">
            <thead><tr><th className="pd-xc" /><th>#</th><th>Return #</th><th>Date</th><th>Supplier</th><th>Reference #</th><th>Supplier Bill #</th><th className="num">Amount</th><th>Status</th><th>Payment</th><th className="pd-act-h">Actions</th></tr></thead>
            <tbody>
              {items.flatMap((r, i) => {
                const isOpen = !!open[r.id];
                const d = details[r.id];
                const rows = [
                  <tr key={r.id} className={cn("pd-pr-row", isOpen && "open")} style={{ ["--i" as string]: i }}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) toggle(r); }}>
                    <td className="pd-xc"><button type="button" className="pd-chevb" aria-label="Expand" aria-expanded={isOpen} onClick={() => toggle(r)}><ChevronRight /></button></td>
                    <td className="muted">{start + i + 1}</td>
                    <td><b><Hl text={r.docNo} q={search} /></b></td>
                    <td>{dateLabel(r.docDate)}</td>
                    <td><Hl text={r.vendor.name} q={search} /></td>
                    <td>{r.bill ? <Link className="link" href={`/purchases/bills/${r.bill.id}`}>{r.bill.docNo}</Link> : "—"}</td>
                    <td>{r.supplierBillNo ? <Hl text={r.supplierBillNo} q={search} /> : "—"}</td>
                    <td className="num"><b>{fmt(r.totalAmount)}</b></td>
                    <td><Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                    <td>{payLabel(r.settlement)}</td>
                    <td className="pd-act">
                      <button type="button" className="pd-icb" title="View" aria-label="View" onClick={() => setDrawerId(r.id)}><Eye /></button>
                      <button type="button" className="pd-icb" title="More" aria-label="More actions" onClick={(e) => rowMenu(e.currentTarget, r)}><Ellipsis /></button>
                    </td>
                  </tr>,
                ];
                if (isOpen) rows.push(
                  <tr key={`${r.id}-d`} className="pd-pr-detail open"><td colSpan={11}><div className="pd-xd"><div className="pd-xd-in"><div className="pd-xd-card">
                    <div className="pd-xd-top">
                      <dl className="pd-xd-dl">
                        <div><dt>Supplier</dt><dd>{r.vendor.name}</dd></div>
                        <div><dt>Reference #</dt><dd>{r.bill?.docNo ?? "—"}</dd></div>
                        <div><dt>Supplier Bill #</dt><dd>{r.supplierBillNo ?? "—"}</dd></div>
                      </dl>
                      <dl className="pd-xd-dl">
                        <div><dt>Return Date</dt><dd>{dateLabel(r.docDate)}</dd></div>
                        <div><dt>Payment Type</dt><dd>{payLabel(r.settlement)}{r.cashAccount ? ` · ${r.cashAccount.name}` : ""}</dd></div>
                        <div><dt>Reason</dt><dd>{reasonLabel(r.reason)}</dd></div>
                        <div><dt>Remarks</dt><dd>{r.remarks ?? "—"}</dd></div>
                      </dl>
                      <div className="pd-xd-stats">
                        <div><span className="icon-well"><Package /></span><span><small>Total Items</small><b>{d ? d.lines.length : "…"}</b></span></div>
                        <div><span className="icon-well blue"><Coins /></span><span><small>Total Amount</small><b>{fmt(r.totalAmount)}</b></span></div>
                      </div>
                      <div className="pd-xd-btns">
                        <Button size="sm" icon={<Eye />} onClick={() => setDrawerId(r.id)}>View Details</Button>
                        {r.status === "DRAFT" && can.edit && <Button size="sm" variant="primary" icon={<Pencil />} onClick={() => void editDraft(r.id)}>Edit Return</Button>}
                        {r.debitNote && <Link className="btn secondary sm" href={`/purchases/debit-notes?dn=${r.debitNote.id}`}><FileMinus2 />{r.debitNote.docNo}</Link>}
                      </div>
                    </div>
                    <b className="pd-xd-h">Return Items ({d ? d.lines.length : "…"})</b>
                    {!d ? <Skeleton style={{ height: 60 }} /> : (
                      <>
                        <table className="pd-mt"><thead><tr><th>#</th><th>Product Name</th><th>Pack</th><th>Batch No.</th><th>Expiry</th><th className="num">Rate</th><th className="num">Returned Qty</th><th className="num">Amount</th></tr></thead>
                          <tbody>{d.lines.slice(0, 3).map((l, j) => (
                            <tr key={l.id}><td>{j + 1}</td><td>{l.item.name}</td><td>{product(l.item.id)?.unit ?? "—"}</td><td>{l.batchNo ?? "—"}</td><td>{l.expiryDate ? dateLabel(l.expiryDate) : "—"}</td>
                              <td className="num">{fmt(l.rate)}</td><td className="num">{qty(l.returnQty)}{l.bonusQty ? ` + ${qty(l.bonusQty)}` : ""}</td><td className="num">{fmt(l.totalAmount)}</td></tr>
                          ))}</tbody>
                        </table>
                        {d.lines.length > 3 && <small className="pd-more-l">+{d.lines.length - 3} more items…</small>}
                      </>
                    )}
                  </div></div></div></td></tr>,
                );
                return rows;
              })}
            </tbody>
          </table></div>
        )}
        {data && data.total > 0 && (
          <div className="table-foot">
            <span>Showing {start + 1} to {start + items.length} of {data.total} entries</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, j) => j + 1).map((p) => <button key={p} type="button" className={cn(p === page && "active")} onClick={() => setPage(p)}>{p}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {can.create && (
        <div className="panel pd-card pd-pr-editor" ref={editorRef}>
          <div className="pd-ed-h">
            <span className="icon-tile orange"><Undo2 /></span>
            <div>
              <h2>{editing ? `Edit ${editing.docNo}` : "New Purchase Return"}</h2>
              <p>Create a return against a posted purchase — stock, payable and input tax reverse automatically.</p>
            </div>
            <span className="spacer" />
            <div className="head-actions">
              {editing && <Button variant="ghost" icon={<X />} onClick={resetEditor} disabled={!!saving}>Discard</Button>}
              <Button icon={<Save />} disabled={!!saving} onClick={() => void save("draft")}>{saving === "draft" ? "Saving…" : "Save as Draft"}</Button>
              {can.post && <Button variant="primary" icon={<Check />} disabled={!!saving} onClick={() => void save("post")}>{saving === "post" ? "Posting…" : "Save & Post"}</Button>}
            </div>
          </div>
          <div className="pd-pr-top">
            <div className="pd-fgrid c2 pd-pr-form">
              <label className={cn("pd-f", errors.vendorId && "pd-invalid")}><span>Supplier <em>*</em></span>
                <div className="pd-inp-ic"><UserRound />
                  <select value={vendorId} disabled={!!editing} onChange={(e) => chooseVendor(e.target.value)}>
                    <option value="">Search and select supplier</option>{options?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>{errors.vendorId && <small className="pd-err-m">{errors.vendorId}</small>}
              </label>
              <label className="pd-f"><span>Return Date <em>*</em></span><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></label>
              <label className={cn("pd-f", errors.billId && "pd-invalid")}><span>Reference Purchase</span>
                <div className="pd-inp-ic"><FileSearch />
                  <select value={billId} disabled={!vendorId || bills === null || (!!editing && !!billId)} onChange={(e) => chooseBill(e.target.value)}>
                    {!vendorId ? <option value="">Select supplier first</option> : bills === null ? <option value="">Loading bills…</option> : (
                      <>
                        <option value="">{billsDenied ? "No access to vendor bills — return without a reference" : "No reference (return without a bill)"}</option>
                        {bills.map((b) => <option key={b.id} value={b.id}>{b.docNo} · {dateLabel(b.docDate)} · {rs(b.netPayableAmount)}</option>)}
                      </>
                    )}
                  </select>
                </div>{errors.billId && <small className="pd-err-m">{errors.billId}</small>}
              </label>
              <label className="pd-f"><span>Supplier Bill #</span><input value={supplierBillNo} maxLength={60} onChange={(e) => setSupplierBillNo(e.target.value)} placeholder="Enter supplier bill number" /></label>
              <label className={cn("pd-f", errors.warehouseId && "pd-invalid")}><span>Warehouse <em>*</em></span>
                <select value={whId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">Choose the warehouse…</option>{options?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.code}</option>)}
                </select>{errors.warehouseId && <small className="pd-err-m">{errors.warehouseId}</small>}
              </label>
              <div className="pd-f"><span>Payment Type</span>
                <div className="pd-radio-pills sm">
                  <label className={cn(!cash && "on")}><input type="radio" name="pd-pr-pay" checked={!cash} onChange={() => setSettlement("CREDIT")} /><i /><span>Credit</span></label>
                  <label className={cn(cash && "on")}><input type="radio" name="pd-pr-pay" checked={cash} onChange={() => setSettlement("CASH_REFUND")} /><i /><span>Cash refund</span></label>
                </div>
              </div>
              {cash && (
                <label className={cn("pd-f", errors.cashAccountId && "pd-invalid")}><span>Refund into <em>*</em></span>
                  <select value={cashId} onChange={(e) => setCashAccountId(e.target.value)}>
                    <option value="">Choose the cash account…</option>{options?.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>{errors.cashAccountId && <small className="pd-err-m">{errors.cashAccountId}</small>}
                </label>
              )}
              <label className={cn("pd-f", cash ? "" : "full")}><span>Remarks</span><textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Enter remarks…" /></label>
            </div>
            <div className="pd-pr-side">
              <div className="pd-prno">
                <span className="pd-prno-ic"><PackageOpen /></span>
                <div><small>Purchase Return #</small><div className="pd-inp-btn"><input value={editing?.docNo ?? "PR-… (on save)"} readOnly /></div></div>
              </div>
              <div className="pd-pr-cards">
                <div><span className="icon-well"><Package /></span><small>Total Items</small><b>{totals.n}</b></div>
                <div><span className="icon-well blue"><Coins /></span><small>Total Amount</small><b>{fmt(totals.a)}</b></div>
                <div data-st={lastStatus.toLowerCase()}><span className="pd-dotst" /><small>Status</small><b>{editing ? "Draft" : lastStatus}</b></div>
              </div>
              {bill && (
                <p className="muted small" style={{ margin: 0 }}>
                  <Info style={{ width: 13, height: 13, verticalAlign: -2 }} /> {cash ? "Cash comes back into the cash account." : `${bill.docNo} balance ${rs(bill.balanceAmount)} → ${rs(Math.max(0, bill.balanceAmount - totals.a))}: a debit note is created and applied on posting.`}
                </p>
              )}
            </div>
          </div>

          <div className="pd-pr-bar">
            <div className="seg">
              <button type="button" className={cn(tab === "items" && "active")} onClick={() => setTab("items")}><List />Return Items</button>
              <button type="button" className={cn(tab === "effect" && "active")} onClick={() => setTab("effect")}><GitCompareArrows />Effect</button>
              <button type="button" className={cn(tab === "info" && "active")} onClick={() => setTab("info")}><Info />Additional Information</button>
            </div>
            <span className="spacer" />
            <Button size="sm" icon={<CirclePlus />} onClick={addItem} disabled={!vendorId}>Add Item</Button>
          </div>

          {tab === "items" && (
            <div className="pd-pr-pane on">
              <div className="table-wrap pd-gridwrap"><table className="tbl lines pd-lines pd-pr-lines" data-plain="">
                <thead><tr><th>#</th><th className="pd-prod">Product Name <em>*</em></th><th>Pack</th><th>Batch No.</th><th className="num">Rate</th><th className="num">Ret. Qty</th><th className="num">Bonus</th><th className="num">Disc %</th><th className="num">Disc.</th><th className="num">% GST</th><th className="num">GST</th><th className="num">Amount</th><th /></tr></thead>
                <tbody>
                  {linesLoading ? <tr><td colSpan={13}><Skeleton style={{ height: 80 }} /></td></tr> : !lines.length ? (
                    <tr className="pd-empty"><td colSpan={13}><div><span className="icon-well"><FileSearch /></span><b>No return lines yet</b><small>Pick a supplier and a reference purchase to load its lines, or press “Add Item”.</small></div></td></tr>
                  ) : lines.map((l, i) => {
                    const it = product(l.itemId);
                    const a = returnLineAmounts({ returnQty: l.qty, rate: l.rate, discountPct: l.disc, taxRate: l.gst });
                    const bad = l.max !== null && l.qty + l.bonus > l.max + 0.0001;
                    const lerr = (f: string) => errors[`${f}.${l.key}`];
                    return (
                      <tr key={l.key}>
                        <td className="pd-idx">{i + 1}</td>
                        <td className="pd-prod">
                          {l.billLineId ? <><b>{it?.name ?? "?"}</b><small>{it?.sku}{l.purchased !== null ? ` · bought ${qty(l.purchased)}${l.returned ? `, returned ${qty(l.returned)}` : ""}` : ""}</small></> : (
                            <select value={l.itemId} onChange={(e) => pickProduct(l.key, e.target.value)} aria-label="Product">
                              <option value="">Search product…</option>{options?.products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                            </select>
                          )}
                          {(lerr("itemId") || lerr("billLineId")) && <span className="grn-err">{lerr("itemId") || lerr("billLineId")}</span>}
                        </td>
                        <td className="muted" style={{ whiteSpace: "nowrap" }}>{it ? `${it.unit ?? "unit"}${it.ctn > 1 ? ` × ${it.ctn}` : ""}` : "—"}</td>
                        <td className="pd-sm">
                          <input value={l.batchNo} placeholder={it?.trackExpiry ? "Earliest expiry" : ""} onChange={(e) => setLine(l.key, { batchNo: e.target.value })} aria-label="Batch no." />
                          {it?.trackExpiry && <input type="date" value={l.expiry} onChange={(e) => setLine(l.key, { expiry: e.target.value })} aria-label="Expiry" style={{ marginTop: 4 }} />}
                        </td>
                        <td className="pd-sm"><input className="num" type="number" min="0" step="0.01" value={l.rate} onChange={(e) => setLine(l.key, { rate: Math.max(0, Number(e.target.value) || 0) })} aria-label="Rate" /></td>
                        <td className="pd-sm pd-qtyc">
                          <input className={cn("num", (bad || !!lerr("returnQty")) && "pd-bad")} type="number" min="0" value={l.qty} onChange={(e) => setLine(l.key, { qty: Math.max(0, Number(e.target.value) || 0) })} aria-label="Return qty" />
                          {l.max !== null && <small>of {qty(l.max)}</small>}
                        </td>
                        <td className="pd-sm"><input className="num" type="number" min="0" value={l.bonus} onChange={(e) => setLine(l.key, { bonus: Math.max(0, Number(e.target.value) || 0) })} aria-label="Bonus" /></td>
                        <td className="pd-sm"><input className="num" type="number" min="0" max="100" step="0.5" value={l.disc} onChange={(e) => setLine(l.key, { disc: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} aria-label="Discount %" /></td>
                        <td className="num pd-out-c">{fmt(a.discountAmount)}</td>
                        <td className="pd-sm"><input className="num" type="number" min="0" max="100" value={l.gst} onChange={(e) => setLine(l.key, { gst: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} aria-label="GST %" /></td>
                        <td className="num pd-out-c">{fmt(a.taxAmount)}</td>
                        <td className="num pd-out-c pd-amt"><b>{fmt(a.totalAmount)}</b></td>
                        <td className="pd-del"><button type="button" className="pd-icb danger" aria-label="Delete line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
              {over && <p className="muted small" style={{ color: "var(--danger)", margin: "8px 0 0" }}><CircleAlert style={{ width: 13, height: 13, verticalAlign: -2 }} /> A line returns more than can still be returned on the bill.</p>}
            </div>
          )}
          {tab === "effect" && (
            <div className="pd-pr-pane on">
              <div className="pd-effect">
                <div className="pd-eff-tiles">
                  <div className="pd-eff"><span className="icon-tile orange"><Boxes /></span><div><small>Stock</small><b>−{qty(totals.units)} units</b><span>Leaves {whName} at book value</span></div></div>
                  <div className="pd-eff"><span className="icon-tile blue">{cash ? <Banknote /> : <Wallet />}</span><div><small>{cash ? "Cash refund" : "Supplier payable"}</small>
                    <b>{cash ? `+${rs(totals.a)}` : bill ? `${rs(bill.balanceAmount)} → ${rs(Math.max(0, bill.balanceAmount - totals.a))}` : `−${rs(totals.a)}`}</b>
                    <span>{cash ? `Received into ${cashName ?? "the cash account"}` : vendorName ? `${vendorName} balance reduces` : "Select a supplier"}</span></div></div>
                  <div className="pd-eff"><span className="icon-tile violet"><Percent /></span><div><small>GST reversal</small><b>−{rs(totals.t)}</b><span>Input tax reversed in this month&apos;s return</span></div></div>
                </div>
                <div className="pd-eff-jv">
                  <div className="pd-jv-h"><b>Reversal journal preview</b><Badge tone={balanced ? "good" : "neutral"} dot>{balanced ? "Balanced" : "Waiting for lines"}</Badge></div>
                  <table className="pd-mt pd-jv-t"><thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
                    <tbody>
                      {jv.map(([a, d, c]) => <tr key={a}><td>{a}</td><td className="num dr">{d ? fmt(d) : ""}</td><td className="num cr">{c ? fmt(c) : ""}</td></tr>)}
                      <tr className="pd-jv-tot"><td>Total</td><td className="num">{fmt(dr)}</td><td className="num">{fmt(cr)}</td></tr>
                    </tbody>
                  </table>
                  <small className="muted">Stock leaves at its book (average) cost; the difference to the bill rate goes to cost of sales. Estimated here, exact on posting.</small>
                </div>
              </div>
            </div>
          )}
          {tab === "info" && (
            <div className="pd-pr-pane on">
              <div className="pd-fgrid c3">
                <label className="pd-f"><span>Return reason <em>*</em></span>
                  <select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>
                </label>
                <label className="pd-f"><span>Gate pass #</span><input value={gatePass} maxLength={40} onChange={(e) => setGatePass(e.target.value)} placeholder="GP-2026-…" /></label>
                <label className="pd-f"><span>Transporter</span><input value={transporter} maxLength={80} onChange={(e) => setTransporter(e.target.value)} placeholder="e.g. TCS Logistics, supplier vehicle" /></label>
                <label className="pd-f"><span>Branch</span>
                  <select value={brId} onChange={(e) => setBranchId(e.target.value)}>{options?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                </label>
                <label className="pd-f span-2"><span>Debit note narration</span><input value={dnNarration} maxLength={300} onChange={(e) => setDnNarration(e.target.value)} /></label>
              </div>
            </div>
          )}

          <div className="pd-pr-totals">
            <div><small>Total Items</small><b>{totals.n}</b></div>
            <div><small>Sub Total</small><b>{fmt(totals.g)}</b></div>
            <div><small>Total Discount</small><b>{fmt(totals.d)}</b></div>
            <div><small>Total GST</small><b>{fmt(totals.t)}</b></div>
            <div className="net"><small>Net Amount</small><b>{rs(totals.a)}</b></div>
          </div>
        </div>
      )}

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
      <ReturnDrawer id={drawerId} can={can} attempt={attempt} onClose={() => setDrawerId(null)} onEdit={(id) => void editDraft(id)} onCancel={setCancelFor} onDelete={setDeleteFor} onPosted={(msg) => { toast(msg, { tone: "good" }); reload(); }} />
      <ConfirmDialog open={!!deleteFor} danger title="Delete this draft?" confirmLabel="Delete draft" onClose={() => setDeleteFor(null)}
        onConfirm={() => { const r = deleteFor; setDeleteFor(null); if (r) void runAction(() => deleteReturn(r.id, r.rowVersion), `${r.docNo} deleted`); }}>
        Nothing was posted yet; the draft return is removed.
      </ConfirmDialog>
      <CancelModal key={cancelFor?.id ?? "none"} ret={cancelFor} onClose={() => setCancelFor(null)} onDone={(msg) => { setCancelFor(null); toast(msg, { tone: "good" }); reload(); setDrawerId(null); }} />
    </div>
  );
}

/** Detail drawer: lines, links (bill, debit note, journal), History; draft → edit / post / delete, posted → cancel. */
function ReturnDrawer({ id, can, attempt, onClose, onEdit, onCancel, onDelete, onPosted }: {
  id: string | null; can: Can; attempt: number; onClose: () => void; onEdit: (id: string) => void; onCancel: (r: PurchaseReturn) => void; onDelete: (r: PurchaseReturn) => void; onPosted: (msg: string) => void;
}) {
  const toast = useToast();
  const [loaded, setLoaded] = useState<PurchaseReturn | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [tab, setTab] = useState<"lines" | "history">("lines");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getReturn(id).then((x) => !cancelled && setLoaded(x)).catch((e: unknown) => !cancelled && setFailed({ id, message: errMsg(e, "Could not load the return") }));
    return () => { cancelled = true; };
  }, [id, attempt]);
  const r = loaded && loaded.id === id ? loaded : null;
  const err = !r && failed?.id === id ? failed.message : null;
  const post = async () => {
    if (!r) return;
    setBusy(true);
    try { const x = await postReturn(r.id, r.rowVersion); onPosted(`${x.docNo} posted${x.debitNote ? ` · ${x.debitNote.docNo} applied` : ""}`); onClose(); } catch (e) { toast(errMsg(e, "Could not post the return"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return (
    <Drawer open={!!id} onClose={onClose} wide title={r ? `${r.docNo} · ${r.vendor.name}` : "Purchase return"} subtitle={r ? `${dateLabel(r.docDate)} · ${r.warehouse.name} · ${payLabel(r.settlement)}` : undefined}
      foot={r && (
        <>
          {r.status === "DRAFT" && can.create && <Button variant="ghost" icon={<Trash2 />} disabled={busy} onClick={() => onDelete(r)}>Delete</Button>}
          <span className="spacer" />
          {r.status === "DRAFT" && can.edit && <Button icon={<Pencil />} disabled={busy} onClick={() => onEdit(r.id)}>Edit</Button>}
          {r.status === "DRAFT" && can.post && <Button variant="primary" icon={<Check />} disabled={busy} onClick={() => void post()}>{busy ? "Posting…" : "Post return"}</Button>}
          {r.status === "POSTED" && can.post && <Button variant="ghost" icon={<Ban />} disabled={busy} onClick={() => onCancel(r)}>Cancel return</Button>}
        </>
      )}>
      {err ? <ErrorState message={err} /> : !r ? <Skeleton style={{ height: 300 }} /> : (
        <>
          <div className="row mb" style={{ gap: 6, flexWrap: "wrap" }}>
            <Badge tone={STATUS[r.status]?.tone} dot>{STATUS[r.status]?.label ?? r.status}</Badge>
            <Badge tone="neutral">{reasonLabel(r.reason)}</Badge>
            {r.debitNote && <Badge tone={r.debitNote.status === "APPLIED" ? "good" : "info"}>{r.debitNote.docNo} · {r.debitNote.status.toLowerCase()}</Badge>}
          </div>
          <Tabs items={[{ key: "lines", label: "Lines" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
          <div className="mt" />
          {tab === "history" ? <HistoryTab schema="Purchases" table="PurchaseReturns" id={r.id} /> : (
            <>
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Item</th><th>Batch / expiry</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Disc %</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {r.lines.map((l) => (
                    <tr key={l.id}>
                      <td><b>{l.item.name}</b><small>{l.item.sku}{l.purchasedQty !== null ? ` · bought ${qty(l.purchasedQty)}` : ""}</small></td>
                      <td>{l.batchNo ? <>{l.batchNo}<small>{l.expiryDate ? `exp ${dateLabel(l.expiryDate)}` : ""}</small></> : <span className="muted">—</span>}</td>
                      <td className="num">{qty(l.returnQty)}{l.bonusQty ? <small>+{qty(l.bonusQty)} bonus</small> : null}</td>
                      <td className="num">{fmt(l.rate)}</td>
                      <td className="num">{l.discountPct ? `${l.discountPct}%` : "—"}</td>
                      <td className="num">{fmt(l.taxAmount)}<small>{l.taxRate}%</small></td>
                      <td className="num">{fmt(l.totalAmount)}</td>
                    </tr>
                  ))}
                  <tr className="total"><td colSpan={6}>Net amount</td><td className="num">{rs(r.totalAmount)}</td></tr>
                </tbody>
              </table></div>
              <div className="dl mt">
                <div><span>Reference bill</span><b>{r.bill ? <Link href={`/purchases/bills/${r.bill.id}`}>{r.bill.docNo}</Link> : "—"}</b></div>
                <div><span>Supplier bill #</span><b>{r.supplierBillNo ?? "—"}</b></div>
                <div><span>Settlement</span><b>{payLabel(r.settlement)}{r.cashAccount ? ` · ${r.cashAccount.name}` : ""}</b></div>
                <div><span>Debit note</span><b>{r.debitNote ? <Link href={`/purchases/debit-notes?dn=${r.debitNote.id}`}>{r.debitNote.docNo}</Link> : r.settlement === "CREDIT" && !r.bill ? "None (no reference bill)" : "—"}</b></div>
                <div><span>Journal</span><b>{r.voucher ? <Link href={`/accounting/vouchers/${r.voucher.id}`}>{r.voucher.docNo}</Link> : "—"}</b></div>
                <div><span>Gate pass</span><b>{r.gatePassNo ?? "—"}</b></div>
                <div><span>Transporter</span><b>{r.transporter ?? "—"}</b></div>
                <div><span>Remarks</span><b>{r.remarks ?? "—"}</b></div>
                {r.cancelledAt && <div><span>Cancelled</span><b>{dateLabel(r.cancelledAt.slice(0, 10))}{r.cancelReason ? ` — ${r.cancelReason}` : ""}</b></div>}
                <div><span>Returned by</span><b>{r.createdBy?.name ?? "—"}</b></div>
              </div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}

/** Cancels a posted return: stock comes back and the journal is reversed (409 while its debit note is applied). */
function CancelModal({ ret, onClose, onDone }: { ret: Row | PurchaseReturn | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (!ret) return;
    setBusy(true);
    setErr(null);
    try { await cancelReturn(ret.id, ret.rowVersion, reason.trim()); onDone(`${ret.docNo} cancelled · stock and journal reversed`); } catch (e) { setErr(errMsg(e, "Could not cancel the return")); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!ret} onClose={onClose} title="Cancel purchase return" subtitle={ret ? `${ret.docNo} · ${ret.vendor.name}` : undefined} foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Keep it</button>
        <button type="button" className="btn danger" disabled={busy || reason.trim().length < 3} onClick={() => void run()}>{busy ? "Cancelling…" : "Cancel return"}</button></>
    }>
      {err && <div className="callout warn mb"><CircleAlert /><div>{err}</div></div>}
      <FormGrid><Field label="Reason" required full hint="At least 3 characters"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vendor refused the goods" /></Field></FormGrid>
    </Modal>
  );
}
