"use client";

import {
  Boxes, Building, Building2, Calendar, ChevronRight, CircleAlert, CircleCheck, CirclePlus, Download, Eye, FlaskConical, FolderKanban, Gift, Hash, History, NotebookPen,
  Package, PackageX, Paperclip, PartyPopper, PencilLine, Plus, RotateCcw, Save, ScanBarcode, Search, Settings, ShoppingCart, Trash2, UserRound, Users, Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { DemandOptions, StockOnHand, StockOpsOptions, StockVoucher, StockVoucherList } from "@/shared";
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
import {
  cancelStockVoucher, createStockVoucher, deleteStockVoucher, demandOptions, getStockVoucher, listStockVouchers, postStockVoucher, updateStockVoucher,
} from "../stock-demand-api";
import { stockOnHand, stockOpsOptions } from "../stock-ops-api";
import "../../purchasing/components/purchase-voucher.css";
import "./stock-vouchers.css";

type Can = { create: boolean; edit: boolean; post: boolean };
type VType = "BRK" | "GFT" | "SMP" | "INT";
type Line = { key: string; itemId: string; batchId: string; qty: string; remark: string; sel: boolean };
type Form = {
  id: string | null; rowVersion: number; docNo: string | null; docDate: string; warehouseId: string; referenceNo: string; breakageReason: string; recipientName: string;
  occasion: string; isReturnable: boolean; returnDueDate: string; expenseAccountId: string; remarks: string; lines: Line[];
};

const TYPES: Record<VType, { title: string; tab: string; pill: string; icon: ReactNode; tone: string; desc: string; sub: string }> = {
  BRK: { title: "Breakage Voucher", tab: "Breakage", pill: "BREAKAGE", icon: <PackageX />, tone: "red", desc: "Record damaged, expired or unusable stock. Value is written off to cost of sales.", sub: "Enter breakage details and the damaged items." },
  GFT: { title: "Gift Voucher", tab: "Gift", pill: "GIFTS", icon: <Gift />, tone: "green", desc: "Issue items as gifts for guests, promotions or other purposes.", sub: "Enter gift voucher information and add items." },
  SMP: { title: "Sample Voucher", tab: "Sample", pill: "SAMPLES", icon: <FlaskConical />, tone: "blue", desc: "Send product samples to customers and prospects — track returnable samples.", sub: "Who receives the samples and why." },
  INT: { title: "Internal Use Voucher", tab: "Internal Use", pill: "INTERNAL USE", icon: <Building2 />, tone: "orange", desc: "Consume stock inside the company — charged to a department or cost centre.", sub: "Which department consumes the stock." },
};
const TYPE_KEYS = Object.keys(TYPES) as VType[];
const REASONS: [string, string][] = [["DAMAGED_IN_HANDLING", "Damaged in handling"], ["EXPIRED", "Expired"], ["LEAKAGE_SPILLAGE", "Leakage / spillage"], ["WATER_DAMAGE", "Water damage"], ["PEST_DAMAGE", "Pest damage"]];
const OCCASIONS: [string, string][] = [["PROMOTIONAL", "Promotional"], ["EID_HAMPER", "Eid hamper"], ["CORPORATE_GIFT", "Corporate gift"], ["EVENT_GIVEAWAY", "Event giveaway"]];
const WHO_LABEL: Record<VType, string> = { BRK: "Employee / Person", GFT: "Guest / Recipient", SMP: "Customer / Prospect", INT: "Department / Requested by" };
const STATUS_TONE: Record<string, Tone> = { DRAFT: "neutral", POSTED: "good", CANCELLED: "danger" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", POSTED: "Posted", CANCELLED: "Cancelled" };

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };
let seq = 0;
const key = () => `sv${++seq}`;
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const newLine = (): Line => ({ key: key(), itemId: "", batchId: "", qty: "", remark: "", sel: false });

const blank = (t: VType, o: StockOpsOptions | null, d: DemandOptions | null): Form => ({
  id: null, rowVersion: 0, docNo: null, docDate: today(), warehouseId: o?.warehouses[0]?.id ?? "", referenceNo: "", breakageReason: "", recipientName: "",
  occasion: t === "GFT" ? "PROMOTIONAL" : "", isReturnable: t === "SMP", returnDueDate: t === "SMP" ? plusDays(14) : "", expenseAccountId: d?.expenseDefaults[t]?.id ?? "", remarks: "",
  lines: [newLine()],
});

/** Template app/inventory/stock-vouchers (44-purchase-docs.html + 94-purchase-docs.js): breakage / gift / sample / internal-use vouchers, stock out at cost. */
export function StockVouchersScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [opts, setOpts] = useState<StockOpsOptions | null>(null);
  const [dOpts, setDOpts] = useState<DemandOptions | null>(null);
  const [optError, setOptError] = useState<string | null>(null);
  const [type, setType] = useState<VType>("BRK");
  const [form, setForm] = useState<Form>(() => blank("BRK", null, null));
  const [onHand, setOnHand] = useState<StockOnHand>([]);
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [list, setList] = useState<StockVoucherList | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [q, setQ] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(params.get("voucher"));

  useEffect(() => {
    Promise.all([stockOpsOptions(), demandOptions()])
      .then(([o, d]) => { setOpts(o); setDOpts(d); setForm((f) => (f.warehouseId ? f : blank("BRK", o, d))); })
      .catch((e: unknown) => setOptError(errMsg(e, "Could not load the voucher options")));
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
      listStockVouchers({ type: fType, status: fStatus, search: q, pageSize: 50 })
        .then((l) => { if (!off) { setList(l); setListErr(null); } })
        .catch((e: unknown) => !off && setListErr(errMsg(e, "Could not load the vouchers")));
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [fType, fStatus, q, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const product = (id: string) => opts?.products.find((p) => p.id === id);
  const avail = (l: Line) => onHand.filter((s) => s.itemId === l.itemId && (!l.batchId || s.batchId === l.batchId)).reduce((s, x) => s + x.qtyOnHand, 0);
  const rate = (l: Line) => product(l.itemId)?.avgCost ?? 0;
  const T = TYPES[type];
  const wh = opts?.warehouses.find((w) => w.id === form.warehouseId);
  const expenseAccounts = (opts?.accounts ?? []).filter((a) => a.accountClass >= 5 || a.id === form.expenseAccountId);
  const account = opts?.accounts.find((a) => a.id === form.expenseAccountId) ?? dOpts?.expenseDefaults[type] ?? null;
  const filled = form.lines.filter((l) => l.itemId);
  const totals = {
    qty: filled.reduce((s, l) => s + num(l.qty), 0), amount: filled.reduce((s, l) => s + num(l.qty) * rate(l), 0),
    left: filled.reduce((s, l) => s + avail(l) - num(l.qty), 0), short: filled.filter((l) => num(l.qty) > avail(l)).length,
  };
  const selected = form.lines.filter((l) => l.sel).length;

  const switchType = (t: VType) => {
    if (t === type) return;
    if (form.id) { toast("Finish or reset the draft you are editing first", { tone: "warn" }); return; }
    setType(t); setErrors({});
    setForm((f) => ({ ...blank(t, opts, dOpts), docDate: f.docDate, warehouseId: f.warehouseId, lines: f.lines }));
  };
  const setLine = (k: string, patch: Partial<Line>) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === k ? { ...l, ...patch } : l)) }));
  const reset = () => { setForm(blank(type, opts, dOpts)); setErrors({}); };

  const save = async (andPost: boolean) => {
    const lines = form.lines.filter((l) => l.itemId);
    const e: Record<string, string> = {};
    if (type === "BRK" && !form.breakageReason) e.breakageReason = "Select a reason";
    if (type === "GFT" && !form.recipientName.trim()) e.recipientName = "Who receives the gift?";
    if (!lines.length) e.lines = "Add at least one item";
    lines.forEach((l) => { if (!(num(l.qty) > 0)) e[`q:${l.key}`] = "More than 0"; });
    if (andPost && totals.short) e.lines = `${totals.short} item${totals.short > 1 ? "s" : ""} exceed the stock on hand`;
    if (Object.keys(e).length) { setErrors(e); toast(Object.values(e)[0]!, { tone: "warn" }); return; }
    setBusy(andPost ? "post" : "draft"); setErrors({});
    const body = {
      voucherType: type, docDate: form.docDate, warehouseId: form.warehouseId, referenceNo: form.referenceNo || null, breakageReason: type === "BRK" ? form.breakageReason : null,
      recipientName: form.recipientName.trim() || null, occasion: type === "GFT" ? form.occasion || null : null, isReturnable: type === "SMP" && form.isReturnable,
      returnDueDate: type === "SMP" && form.isReturnable ? form.returnDueDate || null : null, expenseAccountId: form.expenseAccountId || null, remarks: form.remarks || null,
      lines: lines.map((l) => ({ itemId: l.itemId, batchId: l.batchId || null, qty: num(l.qty), remark: l.remark || null })),
    };
    let saved: StockVoucher | null = null;
    try {
      saved = form.id ? await updateStockVoucher(form.id, { ...body, rowVersion: form.rowVersion }) : await createStockVoucher(body);
      if (andPost) saved = await postStockVoucher(saved.id, saved.rowVersion);
      toast(`${saved.docNo} ${andPost ? "posted" : "saved as draft"} · ${saved.totalItems} item${saved.totalItems === 1 ? "" : "s"}, Rs ${fmt(saved.totalAmount, 2)}`, { tone: andPost ? "good" : "info" });
      reset(); reload();
    } catch (x) {
      const err = x instanceof ApiError ? x : null;
      if (err?.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, m]) => [k, m[0] ?? ""])));
      if (saved) setForm((f) => ({ ...f, id: saved!.id, rowVersion: saved!.rowVersion, docNo: saved!.docNo }));
      toast(`${err?.code === "STOCK_INSUFFICIENT" ? "Not enough stock: " : ""}${errMsg(x, "Could not save the voucher")}${saved && andPost ? " · kept as draft" : ""}`, { tone: "danger" });
    } finally { setBusy(null); }
  };

  const editDraft = (v: StockVoucher) => {
    setDetailId(null);
    const t = v.voucherType as VType;
    setType(t); setErrors({});
    setForm({
      id: v.id, rowVersion: v.rowVersion, docNo: v.docNo, docDate: v.docDate, warehouseId: v.warehouse.id, referenceNo: v.referenceNo ?? "", breakageReason: v.breakageReason ?? "",
      recipientName: v.recipientName ?? "", occasion: v.occasion ?? "", isReturnable: v.isReturnable, returnDueDate: v.returnDueDate ?? "", expenseAccountId: v.expenseAccount?.id ?? "",
      remarks: v.remarks ?? "", lines: v.lines.map((l) => ({ key: key(), itemId: l.item.id, batchId: "", qty: String(l.qty), remark: l.remark ?? "", sel: false })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (optError && !opts) return <ErrorState message={optError} onRetry={() => location.reload()} />;
  const items = list?.items ?? [];
  const bad = (k: string) => (errors[k] ? "bad" : undefined);

  return (
    <>
      <div className="page-head pd-head">
        <div className="pd-head-l">
          <span className="pd-head-ic"><Gift /></span>
          <div>
            <nav className="pd-crumb"><Link href="/inventory/products">Inventory</Link><ChevronRight /><b>Stock Vouchers</b></nav>
            <h1>Stock Vouchers</h1>
            <p>Record breakage, gifts, samples and internal consumption — stock and the GL update on posting.</p>
          </div>
        </div>
        <div className="head-actions">
          <span className="pill"><Calendar />{dateLabel(today())}</span>
          <Link className="btn primary" href="/inventory/products"><Boxes />View Stock</Link>
        </div>
      </div>

      <div className="pd-folder" role="tablist">
        {TYPE_KEYS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={type === t} className={cn(type === t && "on")} onClick={() => switchType(t)}>
            {TYPES[t].icon}{TYPES[t].tab}<span>Voucher{list?.byType[t] ? ` · ${list.byType[t]}` : ""}</span>
          </button>
        ))}
      </div>
      <div className="panel pd-folder-body" data-t={type.toLowerCase()}>
        <div className="pd-sv-top">
          <div className="pd-sv-details">
            <div className="pd-sec-h nob">
              <span className="icon-tile"><PencilLine /></span>
              <span className="pd-sec-t"><b>Voucher Details</b><small>{T.sub}</small></span>
            </div>
            {!opts ? <Skeleton style={{ height: 200 }} /> : (
              <div className="pd-fgrid c3 pd-sv-fields">
                <label className="pd-f"><span>Voucher No <em>*</em></span><div className="pd-inp-btn"><input readOnly value={form.docNo ?? `${type}-… (on save)`} /><span className="btn secondary icon" title={`Numbered from the ${type} series`}><Settings /></span></div></label>
                <label className="pd-f"><span>Date <em>*</em></span><div className="pd-inp-ic"><Calendar /><input type="date" value={form.docDate} onChange={(e) => setForm({ ...form, docDate: e.target.value || today() })} /></div></label>
                <label className="pd-f"><span>Warehouse <em>*</em></span><div className="pd-inp-ic"><Warehouse /><select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value, lines: form.lines.map((l) => ({ ...l, batchId: "" })) })}>{opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div></label>
                {type === "BRK" && (
                  <label className="pd-f"><span>Reason / Type <em>*</em></span><div className="pd-inp-ic"><CircleAlert /><select className={bad("breakageReason")} value={form.breakageReason} onChange={(e) => setForm({ ...form, breakageReason: e.target.value })}><option value="">Select reason</option>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>{errors.breakageReason && <small className="pd-err-m" style={{ display: "block" }}>{errors.breakageReason}</small>}</label>
                )}
                <label className="pd-f"><span>{WHO_LABEL[type]}{type === "GFT" && <em> *</em>}</span><div className="pd-inp-ic">{type === "SMP" ? <Building /> : type === "INT" ? <Users /> : <UserRound />}<input className={bad("recipientName")} value={form.recipientName} list="sv-people" placeholder={type === "GFT" ? "Search or enter guest name" : "Name (optional)"} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} /></div>{errors.recipientName && <small className="pd-err-m" style={{ display: "block" }}>{errors.recipientName}</small>}</label>
                {type === "GFT" && (
                  <label className="pd-f"><span>Occasion</span><div className="pd-inp-ic"><PartyPopper /><select value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })}>{OCCASIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></label>
                )}
                {type === "SMP" && (
                  <div className="pd-f"><span>Returnable</span><label className="switch"><input type="checkbox" checked={form.isReturnable} onChange={(e) => setForm({ ...form, isReturnable: e.target.checked, returnDueDate: e.target.checked ? form.returnDueDate || plusDays(14) : "" })} /><i /><span>Expect samples back</span></label></div>
                )}
                {type === "SMP" && form.isReturnable && (
                  <label className="pd-f"><span>Return due</span><div className="pd-inp-ic"><Calendar /><input type="date" value={form.returnDueDate} onChange={(e) => setForm({ ...form, returnDueDate: e.target.value })} /></div></label>
                )}
                <label className="pd-f"><span>Reference No</span><div className="pd-inp-ic"><Hash /><input value={form.referenceNo} maxLength={60} placeholder="Enter reference no" onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} /></div></label>
                <label className="pd-f"><span>Expense account <em>*</em></span><div className="pd-inp-ic"><FolderKanban /><select className={bad("expenseAccountId")} value={form.expenseAccountId} onChange={(e) => setForm({ ...form, expenseAccountId: e.target.value })}><option value="">Select account</option>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></div>{errors.expenseAccountId && <small className="pd-err-m" style={{ display: "block" }}>{errors.expenseAccountId}</small>}</label>
                <label className="pd-f full"><span>Remarks <small className="muted">(optional)</small></span><div className="pd-inp-ic top"><NotebookPen /><textarea style={{ paddingLeft: 38 }} rows={2} maxLength={500} value={form.remarks} placeholder="Enter remarks (optional)" onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div></label>
                <datalist id="sv-people">{opts.users.map((u) => <option key={u.id} value={u.name} />)}</datalist>
              </div>
            )}
          </div>
          <div className="pd-sv-side">
            <div className="pd-typecard">
              <div className="pd-tc-top" key={type}><span className={cn("pd-tc-ic", T.tone)}>{T.icon}</span><div><small>Voucher Type</small><b>{T.title}</b><p>{T.desc}</p></div></div>
              <dl className="pd-tk-dl">
                <div><dt>Voucher No</dt><dd>{form.docNo ?? "On save"}</dd></div>
                <div><dt>Date</dt><dd>{dateLabel(form.docDate)}</dd></div>
                <div><dt>Account</dt><dd>{account ? `${account.code} · ${account.name}` : "Not set"}</dd></div>
                <div><dt>Type</dt><dd><span className={cn("pd-tpill", type.toLowerCase())}>{T.pill}</span></dd></div>
                <div><dt>Warehouse</dt><dd>{wh?.name ?? "—"}</dd></div>
              </dl>
            </div>
          </div>
        </div>

        <div className="pd-sv-items">
          <div className="pd-sec-h nob">
            <span className="icon-tile"><ShoppingCart /></span>
            <span className="pd-sec-t"><b>Items</b><small>{errors.lines ? <span className="neg">{errors.lines}</span> : "Products leaving stock on this voucher, valued at average cost."}</small></span>
            <div className="pd-sec-act">
              <Button variant="secondary" icon={<CirclePlus />} onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, newLine()] }))}>Add Item</Button>
              <Button variant="ghost" icon={<Trash2 />} disabled={!form.lines.length} onClick={() => setForm((f) => ({ ...f, lines: [newLine()] }))}>Clear All</Button>
            </div>
          </div>
          <div className="table-wrap pd-gridwrap"><table className="tbl lines pd-lines pd-sv-lines" data-plain>
            <thead><tr>
              <th className="pd-ck"><input type="checkbox" aria-label="Select all" checked={selected > 0 && selected === form.lines.length} onChange={(e) => setForm((f) => ({ ...f, lines: f.lines.map((l) => ({ ...l, sel: e.target.checked })) }))} /></th>
              <th>#</th><th className="pd-prod">Product <em>*</em></th><th>Batch / Lot</th><th>Expiry</th><th>UOM</th><th className="num">Qty <em>*</em></th><th className="num">Rate</th><th className="num">Amount</th><th className="num">Stock after</th><th>Remark</th><th />
            </tr></thead>
            <tbody>
              {!form.lines.length ? (
                <tr className="pd-empty"><td colSpan={12}><div><span className="icon-well"><ScanBarcode /></span><b>No items on this voucher</b><small>Add an item to begin.</small></div></td></tr>
              ) : form.lines.map((l, i) => {
                const p = product(l.itemId);
                const a = avail(l);
                const after = a - num(l.qty);
                const batches = onHand.filter((s) => s.itemId === l.itemId && s.batchId);
                const batch = batches.find((b) => b.batchId === l.batchId);
                return (
                  <tr key={l.key} className={cn(l.sel && "selected")}>
                    <td className="pd-ck"><input type="checkbox" aria-label="Select" checked={l.sel} onChange={(e) => setLine(l.key, { sel: e.target.checked })} /></td>
                    <td className="pd-idx">{i + 1}</td>
                    <td className="pd-prod"><select value={l.itemId} onChange={(e) => setLine(l.key, { itemId: e.target.value, batchId: "", qty: l.qty || "1" })}><option value="">Select product…</option>{opts?.products.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.sku}</option>)}</select></td>
                    <td className="pd-sm">{batches.length ? (
                      <select value={l.batchId} onChange={(e) => setLine(l.key, { batchId: e.target.value })}><option value="">Earliest expiry</option>{batches.map((b) => <option key={b.batchId!} value={b.batchId!}>{b.batchNo} · {fmt(b.qtyOnHand)}</option>)}</select>
                    ) : <span className="muted">—</span>}</td>
                    <td className="pd-sm2">{batch?.expiryDate ? dateLabel(batch.expiryDate) : <span className="muted">—</span>}</td>
                    <td className="pd-xs2">{p?.unit ?? "—"}</td>
                    <td className="pd-xs"><input className={cn("num", errors[`q:${l.key}`] && "bad")} type="number" min="0" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></td>
                    <td className="num pd-out-c">{p ? fmt(rate(l), 2) : "—"}</td>
                    <td className="num pd-out-c pd-amt"><b>{fmt(num(l.qty) * rate(l), 2)}</b></td>
                    <td className="num pd-out-c">{p ? <span className={cn("pd-after", after < 0 && "neg")}><b>{fmt(after)}</b><i style={{ ["--w" as string]: `${a ? Math.max(0, Math.min(100, (after / a) * 100)) : 0}%` }} /></span> : <span className="muted">—</span>}</td>
                    <td><input value={l.remark} maxLength={200} placeholder="Optional" onChange={(e) => setLine(l.key, { remark: e.target.value })} /></td>
                    <td className="pd-del"><button type="button" className="pd-icb danger" aria-label="Delete" onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((x) => x.key !== l.key) }))}><Trash2 /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <div className="pd-sv-under">
            <div className="row">
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, newLine()] }))}>Add Row</Button>
              <Button variant="danger" size="sm" icon={<Trash2 />} disabled={!selected} onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((l) => !l.sel) }))}>{selected ? `Remove Selected (${selected})` : "Remove Selected"}</Button>
            </div>
            <div className="pd-sv-totals">
              <div><span>Total Quantity</span><b>{fmt(totals.qty)}</b></div>
              <div><span>Total Amount</span><b>Rs {fmt(totals.amount, 2)}</b></div>
              <div className="after"><span><Boxes />Stock After Voucher</span><b>{filled.length ? (totals.short ? <span className="neg">{totals.short} SKU short</span> : `${fmt(totals.left)} units · ${filled.length} SKU${filled.length > 1 ? "s" : ""}`) : "Auto updated"}</b></div>
            </div>
          </div>
        </div>

        <div className="pd-sv-foot">
          <div className="pd-attach"><b>Attachments</b><span className="btn secondary sm" aria-disabled="true" title="Attachments arrive with document storage"><Paperclip />Attach File</span><span className="muted small">No file selected</span></div>
          <span className="spacer" />
          <Button variant="secondary" icon={<RotateCcw />} disabled={!!busy} onClick={reset}>{form.id ? "New voucher" : "Reset"}</Button>
          {can.create && <Button variant="secondary" icon={<Save />} disabled={!!busy || (!!form.id && !can.edit)} onClick={() => save(false)}>{busy === "draft" ? "Saving…" : "Save as Draft"}</Button>}
          {can.create && can.post && <Button variant="primary" icon={<CircleCheck />} disabled={!!busy} onClick={() => save(true)}>{busy === "post" ? "Posting…" : "Save & Post"}</Button>}
        </div>
      </div>

      <div className="panel pd-card flushx">
        <div className="pd-sec-h">
          <span className="icon-tile"><History /></span>
          <span className="pd-sec-t"><b>Previous Vouchers</b><small>View and search all stock vouchers.</small></span>
          <div className="pd-sec-act pd-sv-filt">
            <select value={fType} onChange={(e) => setFType(e.target.value)}><option value="">All voucher types</option>{TYPE_KEYS.map((t) => <option key={t} value={t}>{TYPES[t].tab} ({list?.byType[t] ?? 0})</option>)}</select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">All status</option>{Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({list?.counts[s] ?? 0})</option>)}</select>
            <label className="search-field"><Search /><input value={q} placeholder="Search voucher no, person, reference…" onChange={(e) => setQ(e.target.value)} /></label>
            <Button variant="ghost" size="sm" icon={<Download />} onClick={() => downloadCsv("stock-vouchers", [["Date", "Voucher No", "Type", "Reference", "Person / Party", "Items", "Quantity", "Amount", "Status", "Remarks"], ...items.map((r) => [r.docDate, r.docNo, r.voucherType, r.referenceNo, r.recipientName, r.totalItems, r.totalQty, r.totalAmount, r.status, r.remarks])])}>CSV</Button>
          </div>
        </div>
        {listErr && !list ? <ErrorState message={listErr} onRetry={reload} /> : !list ? <Skeleton style={{ height: 180 }} /> : !items.length ? (
          <EmptyState icon={<Package />} title={fType || fStatus || q ? "No vouchers match" : "No stock vouchers yet"} description={fType || fStatus || q ? "Try another type, status or search." : "Save or post a voucher above and it appears here."} />
        ) : (
          <div className="table-wrap"><table className="tbl pd-sv-prev" data-plain>
            <thead><tr><th>Date</th><th>Voucher No</th><th>Type</th><th>Reference</th><th>Person / Party</th><th className="num">Items</th><th className="num">Amount</th><th>Status</th><th>Remarks</th><th>Posted By</th><th /></tr></thead>
            <tbody>
              {items.map((r) => {
                const t = TYPES[r.voucherType as VType];
                return (
                  <tr key={r.id}>
                    <td>{dateLabel(r.docDate)}</td><td><b>{r.docNo}</b></td>
                    <td><span className={cn("pd-tpill", r.voucherType.toLowerCase())}>{t?.icon}{t?.pill ?? r.voucherType}</span></td>
                    <td>{r.referenceNo ?? "—"}</td><td>{r.recipientName ?? "—"}</td>
                    <td className="num">{r.totalItems}</td><td className="num">{fmt(r.totalAmount, 2)}</td>
                    <td><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                    <td className="muted">{r.remarks ?? "—"}</td><td>{r.postedBy?.name ?? "—"}</td>
                    <td><button type="button" className="pd-icb" aria-label={`View ${r.docNo}`} onClick={() => setDetailId(r.id)}><Eye /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        {list && <div className="table-foot"><span>Showing {items.length} of {list.total}</span></div>}
      </div>

      <VoucherDrawer key={`${detailId ?? "none"}-${attempt}`} id={detailId} can={can} onClose={() => { setDetailId(null); if (params.get("voucher")) router.replace("/inventory/stock-vouchers"); }}
        onEdit={editDraft} onChanged={(msg) => { toast(msg, { tone: "good" }); reload(); }} />
    </>
  );
}

function VoucherDrawer({ id, can, onClose, onEdit, onChanged }: { id: string | null; can: Can; onClose: () => void; onEdit: (v: StockVoucher) => void; onChanged: (msg: string) => void }) {
  const toast = useToast();
  const [v, setV] = useState<StockVoucher | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"lines" | "history">("lines");
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!id) return;
    let off = false;
    getStockVoucher(id).then((x) => !off && setV(x)).catch((x: unknown) => !off && setErr(errMsg(x, "Could not load the voucher")));
    return () => { off = true; };
  }, [id]);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); onChanged(msg); onClose(); } catch (x) { toast(errMsg(x, "Something went wrong"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const t = v ? TYPES[v.voucherType as VType] : null;
  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={v ? v.docNo : "Stock voucher"} subtitle={v ? `${t?.title ?? v.voucherType} · ${dateLabel(v.docDate)} · ${v.warehouse.name}` : undefined}
        foot={v && (
          <>
            {v.status === "DRAFT" && can.create && <Button variant="ghost" icon={<Trash2 />} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            {v.status === "POSTED" && can.post && <Button variant="ghost" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel voucher</Button>}
            <span className="spacer" />
            {v.status === "DRAFT" && can.edit && <Button variant="secondary" disabled={busy} onClick={() => onEdit(v)}>Edit</Button>}
            {v.status === "DRAFT" && can.post && <Button variant="primary" icon={<CircleCheck />} disabled={busy} onClick={() => run(() => postStockVoucher(v.id, v.rowVersion), `${v.docNo} posted`)}>Post</Button>}
          </>
        )}>
        {err ? <ErrorState message={err} /> : !v ? <Skeleton style={{ height: 280 }} /> : (
          <>
            <div className="dl">
              <div><span>Status</span><b><Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{STATUS_LABEL[v.status] ?? v.status}</Badge></b></div>
              <div><span>Amount</span><b>Rs {fmt(v.totalAmount, 2)} · {v.totalItems} items, {fmt(v.totalQty)} units</b></div>
              <div><span>Type</span><b><span className={cn("pd-tpill", v.voucherType.toLowerCase())}>{t?.pill ?? v.voucherType}</span></b></div>
              {v.breakageReason && <div><span>Reason</span><b>{REASONS.find(([k]) => k === v.breakageReason)?.[1] ?? v.breakageReason}</b></div>}
              <div><span>{WHO_LABEL[v.voucherType as VType] ?? "Person"}</span><b>{v.recipientName ?? "—"}</b></div>
              {v.occasion && <div><span>Occasion</span><b>{OCCASIONS.find(([k]) => k === v.occasion)?.[1] ?? v.occasion}</b></div>}
              {v.isReturnable && <div><span>Return due</span><b>{v.returnDueDate ? dateLabel(v.returnDueDate) : "Returnable"}</b></div>}
              <div><span>Reference</span><b>{v.referenceNo ?? "—"}</b></div>
              <div><span>Expense account</span><b>{v.expenseAccount ? `${v.expenseAccount.code} · ${v.expenseAccount.name}` : "—"}</b></div>
              <div><span>Journal</span><b>{v.voucher ? <Link className="link" href={`/accounting/vouchers/${v.voucher.id}`}>{v.voucher.docNo}</Link> : "—"}</b></div>
              {v.postedBy && <div><span>Posted by</span><b>{v.postedBy.name}</b></div>}
            </div>
            <Tabs items={[{ key: "lines", label: "Lines" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "history" ? <HistoryTab schema="Inventory" table="StockVouchers" id={v.id} /> : (
              <table className="tbl" data-plain>
                <thead><tr><th>Product</th><th>Batch</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th><th>Remark</th></tr></thead>
                <tbody>{v.lines.map((l) => <tr key={l.id}><td><b>{l.item.name}</b><small>{l.item.sku}</small></td><td>{l.batchNo ?? "—"}</td><td className="num">{fmt(l.qty)}</td><td className="num">{fmt(l.rate, 2)}</td><td className="num">{fmt(l.amount, 2)}</td><td>{l.remark ?? "—"}</td></tr>)}</tbody>
              </table>
            )}
            {v.remarks && <p className="muted" style={{ marginTop: 12 }}>{v.remarks}</p>}
          </>
        )}
      </Drawer>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this voucher?" subtitle="The stock goes back and the journal is reversed."
        foot={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep</Button><Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => v && run(() => cancelStockVoucher(v.id, v.rowVersion, reason.trim()), `${v.docNo} cancelled`).then(() => setCancelOpen(false))}>Cancel voucher</Button></>}>
        <Field label="Reason" required><input value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Why is it cancelled?" /></Field>
      </Modal>
      <ConfirmDialog open={confirmDelete} danger busy={busy} title="Delete this draft?" confirmLabel="Delete draft" onClose={() => setConfirmDelete(false)}
        onConfirm={() => v && run(() => deleteStockVoucher(v.id, v.rowVersion), `${v.docNo} deleted`).then(() => setConfirmDelete(false))}>
        {v?.docNo} has not been posted. Deleting it removes it for good.
      </ConfirmDialog>
    </>
  );
}
