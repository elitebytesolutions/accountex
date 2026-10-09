"use client";

import "./sales-voucher-screen.css";
import {
  BookOpen, Box, Calculator, CalendarCheck, CalendarDays, Check, ChevronDown, ClipboardList, Clock, Ellipsis, FilePenLine, FileText, HandCoins, Info, Layers, ListOrdered,
  MapPin, Package, Percent, Plus, Printer, ReceiptText, Search, Tag, Trash2, Truck, UserRound, Users, Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { amountInWords, docTotals, lineAmounts, termDays, type CustomerCredit, type PriceMap, type SalesDocOptions, type SalesInvoice } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu } from "@/components/ui/menu";
import { Drawer } from "@/components/ui/overlay";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, isoDay } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { createSalesVoucher, customerCredit, priceListPrices, salesDocOptions } from "../api";

type Product = SalesDocOptions["products"][number];
type Row = { key: number; itemId: string; q: string | null; qty: string; bonus: string; rate: string; disc: string; taxCodeId: string; taxRate: string };
type Head = {
  docDate: string; customerId: string; poNo: string; poDate: string; billBookNo: string; branchId: string; warehouseId: string; booker: string; deliveryman: string;
  salesman: string; supervisor: string; saleType: string; paymentTerms: string; remarks: string; slot: string;
};
type Ac = { el: HTMLInputElement; target: "search" | number; q: string; idx: number } | null;

const FIELDS = ["prod", "qty", "bonus", "rate", "disc", "gst"] as const;
const BLOCKERS: Record<string, string> = {
  CREDIT_LIMIT_EXCEEDED: "Over the credit limit", CUSTOMER_ON_HOLD: "Customer is on hold", STOCK_INSUFFICIENT: "Not enough stock", INVOICE_APPROVAL_REQUIRED: "Approval required",
};
let seq = 0;
const blankRow = (): Row => ({ key: ++seq, itemId: "", q: null, qty: "", bonus: "", rate: "", disc: "", taxCodeId: "", taxRate: "" });
const n = (s: string) => { const v = Number(String(s).replace(/[,\s]/g, "")); return Number.isFinite(v) && v > 0 ? v : 0; };
const grp = (v: number, dec = 2) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const rs = (v: number, dec = 0) => `Rs ${grp(v, dec)}`;
function plusDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const packOf = (p: Product | undefined) => (!p ? "—" : p.ctn > 1 ? `${p.ctn} × ${p.unit ?? "pcs"}` : p.unit ?? "Unit");

function freshHead(o: SalesDocOptions): Head {
  const c = o.customers[0];
  const branchId = (c?.branchId && o.branches.some((b) => b.id === c.branchId) ? c.branchId : o.branches[0]?.id) ?? "";
  return {
    docDate: isoDay(new Date()), customerId: c?.id ?? "", poNo: "", poDate: "", billBookNo: "", branchId,
    warehouseId: (o.warehouses.find((w) => w.branchId === branchId) ?? o.warehouses[0])?.id ?? "", booker: "", deliveryman: "", salesman: "", supervisor: "",
    saleType: o.saleTypes[0]?.code ?? "REGULAR", paymentTerms: c && o.paymentTerms.some((t) => t.code === c.paymentTerms) ? c.paymentTerms : (o.paymentTerms[0]?.code ?? ""),
    remarks: "", slot: o.deliverySlots[0]?.code ?? "",
  };
}

function Hl({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/**
 * Template app/sales/voucher (43-sales-docs.html + 93-sales-docs.js): the counter sales voucher. Saved as a COUNTER
 * invoice (SV number) and, with Save & Post, posted in the same step: stock out (FEFO batches), receivable and GL.
 */
export function SalesVoucherScreen({ can }: { can: { post: boolean } }) {
  const toast = useToast();
  const [o, setO] = useState<SalesDocOptions | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [head, setHead] = useState<Head | null>(null);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [prices, setPrices] = useState<Record<string, PriceMap>>({});
  const [credit, setCredit] = useState<CustomerCredit | null>(null);
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);
  const [saved, setSaved] = useState<SalesInvoice | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [ac, setAc] = useState<Ac>(null);
  const [search, setSearch] = useState("");
  const [printing, setPrinting] = useState(false);
  const [more, setMore] = useState<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLTableSectionElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const x = await salesDocOptions();
      setO(x);
      setHead((h) => h ?? freshHead(x));
    } catch (e) {
      setLoadError(e instanceof ApiError ? e : new ApiError(0, "NETWORK", "Couldn't reach the server"));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the data once
    void load();
  }, [load]);

  const customer = o?.customers.find((c) => c.id === head?.customerId);
  const defaultList = o?.priceLists.find((p) => p.isDefault)?.id ?? "";
  const listId = customer?.priceListId || defaultList;
  const products = useMemo(() => new Map(o?.products.map((p) => [p.id, p]) ?? []), [o]);
  const priceOf = useCallback((p: Product) => prices[listId]?.[p.id] ?? p.price, [prices, listId]);
  const locked = !!saved;

  useEffect(() => {
    if (!listId || prices[listId]) return;
    let off = false;
    priceListPrices(listId).then((m) => { if (!off) setPrices((x) => ({ ...x, [listId]: m })); }).catch(() => undefined);
    return () => { off = true; };
  }, [listId, prices]);

  const customerId = head?.customerId ?? "";
  useEffect(() => {
    if (!customerId) return;
    let off = false;
    customerCredit(customerId).then((c) => { if (!off) setCredit(c); }).catch(() => { if (!off) setCredit(null); });
    return () => { off = true; };
  }, [customerId]);

  // ---------------------------------------------------------------- maths (same as the server)
  const calc = useMemo(() => rows.map((r) => {
    const qty = n(r.qty);
    const a = lineAmounts({ baseQty: qty, rate: n(r.rate), discountPct: n(r.disc), taxRate: n(r.taxRate) });
    return { r, p: products.get(r.itemId), qty, a, nrate: qty ? a.totalAmount / qty : 0 };
  }), [rows, products]);
  const T = useMemo(() => docTotals(calc.filter((c) => c.r.itemId).map((c) => c.a)), [calc]);
  const items = calc.filter((c) => c.r.itemId).length;
  const totalQty = calc.filter((c) => c.r.itemId).reduce((s, c) => s + c.qty, 0);
  const net = T.totalAmount;

  // ---------------------------------------------------------------- autocomplete
  const acList = useMemo(() => {
    if (!ac || !o) return [];
    const q = ac.q.trim().toLowerCase();
    return o.products.filter((p) => !q || `${p.name} ${p.sku}`.toLowerCase().includes(q)).slice(0, 8);
  }, [ac, o]);
  const openAc = (el: HTMLInputElement, target: "search" | number, q: string) => setAc({ el, target, q, idx: 0 });
  const closeAc = useCallback(() => setAc(null), []);

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs0) => rs0.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const taxFor = (taxCodeId: string | null | undefined, fallback?: number) => {
    const t = taxCodeId ? o?.taxCodes.find((x) => x.id === taxCodeId) : fallback ? o?.taxCodes.find((x) => x.rate === fallback) : null;
    return { taxCodeId: t?.id ?? "", taxRate: String(t?.rate ?? fallback ?? 0) };
  };
  const fill = (p: Product, qty: string): Partial<Row> => ({ itemId: p.id, q: null, qty: qty || "1", rate: priceOf(p).toFixed(2), ...taxFor(p.taxCodeId, p.gstRate) });
  const focusCell = (key: number, f: (typeof FIELDS)[number]) => setTimeout(() => {
    const el = gridRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`tr[data-k="${key}"] [data-f="${f}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, 0);
  const pick = (p: Product) => {
    if (!ac) return;
    if (ac.target === "search") {
      setSearch("");
      const empty = rows.find((r) => !r.itemId);
      if (empty) { setRow(empty.key, fill(p, empty.qty)); focusCell(empty.key, "qty"); }
      else { const r = { ...blankRow(), ...fill(p, "1") }; setRows((x) => [...x, r]); focusCell(r.key, "qty"); }
      toast(`${p.name} added`, { ms: 1800 });
    } else {
      const k = ac.target;
      setRow(k, fill(p, rows.find((r) => r.key === k)?.qty ?? ""));
      focusCell(k, "qty");
    }
    setErrs({});
    closeAc();
  };
  const acKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!ac || ac.el !== e.currentTarget) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setAc({ ...ac, idx: acList.length ? (ac.idx + 1) % acList.length : 0 }); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setAc({ ...ac, idx: acList.length ? (ac.idx - 1 + acList.length) % acList.length : 0 }); return true; }
    if (e.key === "Enter" && acList.length) { e.preventDefault(); pick(acList[ac.idx] ?? acList[0]!); return true; }
    if (e.key === "Escape") { e.preventDefault(); closeAc(); return true; }
    return false;
  };

  const addRow = useCallback(() => {
    const r = blankRow();
    setRows((x) => [...x, r]);
    setTimeout(() => gridRef.current?.querySelector<HTMLInputElement>(`tr[data-k="${r.key}"] [data-f="prod"]`)?.focus(), 0);
  }, []);
  const cellKey = (e: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>, key: number, f: (typeof FIELDS)[number]) => {
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const i = FIELDS.indexOf(f);
    if (i < FIELDS.length - 1) { focusCell(key, FIELDS[i + 1]!); return; }
    const idx = rows.findIndex((r) => r.key === key);
    const next = rows[idx + 1];
    if (next) focusCell(next.key, "prod");
    else addRow();
  };

  // F2 search, Ctrl+Enter add row
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (locked || document.querySelector(".overlay.open")) return;
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setAc(null); addRow(); }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [locked, addRow]);

  if (loadError) return <ErrorState message={loadError.message} reference={loadError.correlationId} onRetry={() => void load()} />;
  if (!o || !head) return <VoucherSkeleton />;

  const setH = <K extends keyof Head>(k: K, v: Head[K]) => {
    setHead((h) => (h ? { ...h, [k]: v } : h));
    setErrs((e) => (e[k] ? { ...e, [k]: "" } : e));
  };
  const pickCustomer = (id: string) => {
    const c = o.customers.find((x) => x.id === id);
    setCredit(null);
    setHead((h) => {
      if (!h) return h;
      const branchId = c?.branchId && o.branches.some((b) => b.id === c.branchId) ? c.branchId : h.branchId;
      return {
        ...h, customerId: id, paymentTerms: c && o.paymentTerms.some((t) => t.code === c.paymentTerms) ? c.paymentTerms : h.paymentTerms, branchId,
        warehouseId: branchId !== h.branchId ? (o.warehouses.find((w) => w.branchId === branchId)?.id ?? h.warehouseId) : h.warehouseId,
      };
    });
    setErrs((e) => ({ ...e, customerId: "" }));
    if (c) toast(`${c.name} selected · address and credit terms loaded`, { tone: "info", ms: 2400 });
  };
  const delRow = (key: number) => {
    const prev = rows;
    const r = rows.find((x) => x.key === key);
    const left = rows.filter((x) => x.key !== key);
    setRows(left.length ? left : [blankRow()]);
    const p = r && products.get(r.itemId);
    if (p) toast(`Removed ${p.name}`, { action: { label: "Undo", onClick: () => setRows(prev) } });
  };
  const clearAll = () => {
    const prev = rows;
    const had = rows.filter((r) => r.itemId).length;
    if (!had) return;
    setRows([blankRow()]);
    toast(`Cleared ${had} line${had === 1 ? "" : "s"}`, { tone: "warn", action: { label: "Undo", onClick: () => setRows(prev) } });
  };
  const reset = () => {
    setSaved(null);
    setRows([blankRow()]);
    setErrs({});
    setNotice(null);
    setHead((h) => (h ? { ...h, poNo: "", poDate: "", remarks: "" } : h));
  };

  // ---------------------------------------------------------------- save
  const validate = (keep: typeof calc) => {
    const e: Record<string, string> = {};
    if (!head.customerId) e.customerId = "Choose a customer";
    if (!head.branchId) e.branchId = "Choose the branch";
    if (!head.warehouseId) e.warehouseId = "Choose the warehouse the goods leave from";
    if (!head.paymentTerms) e.paymentTerms = "Choose payment terms";
    if (!keep.length) e.lines = "Add at least one product line";
    keep.forEach((c, i) => {
      if (c.qty <= 0) e[`lines.${i}.qtyLoose`] = "Enter a quantity";
      if (n(c.r.disc) > 100) e[`lines.${i}.discountPct`] = "At most 100";
    });
    return e;
  };
  const save = async (post: boolean) => {
    if (locked || busy) return;
    const keep = calc.filter((c) => c.r.itemId);
    if (keep.length !== rows.length) setRows(keep.length ? keep.map((c) => c.r) : [blankRow()]);
    const e = validate(keep);
    setErrs(e);
    if (Object.keys(e).length) { toast(Object.values(e)[0]!, { tone: "danger" }); return; }
    setBusy(post ? "post" : "draft");
    try {
      const inv = await createSalesVoucher({
        channel: "COUNTER", customerId: head.customerId, docDate: head.docDate, branchId: head.branchId, warehouseId: head.warehouseId, customerPoNo: head.poNo.trim() || null,
        customerPoDate: head.poDate || null, priceListId: customer?.priceListId ?? null, paymentTerms: head.paymentTerms, dueDate: plusDays(head.docDate, termDays(head.paymentTerms)),
        saleType: head.saleType || "REGULAR", submitToFbr: o.fbr.active, remarks: head.remarks.trim() || null, billBookNo: head.billBookNo.trim() || null,
        bookerName: head.booker.trim() || null, deliverymanName: head.deliveryman.trim() || null, salesmanName: head.salesman.trim() || null,
        supervisorName: head.supervisor.trim() || null, deliverySlot: head.slot || null, post,
        lines: keep.map((c) => ({
          itemId: c.r.itemId, description: null, qtyCtn: 0, qtyLoose: c.qty, bonusQty: n(c.r.bonus), rate: n(c.r.rate), discountPct: n(c.r.disc),
          taxCodeId: c.r.taxCodeId || null, taxRate: n(c.r.taxRate),
        })),
      });
      setSaved(inv);
      setNotice(null);
      toast(post ? `${inv.docNo} posted · ${rs(inv.netAmount, 2)}` : `Draft saved · ${inv.docNo}`, { tone: "good", ms: 6000 });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details) setErrs(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? ""])));
        if (BLOCKERS[err.code]) setNotice({ title: BLOCKERS[err.code]!, message: err.message });
        toast(err.message, { tone: "danger" });
      } else toast("Something went wrong — try again", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  // ---------------------------------------------------------------- render bits
  const limit = credit ? credit.effectiveLimit || credit.creditLimit : 0;
  const bal = credit?.balance ?? 0;
  const pb = limit ? Math.min(100, (bal / limit) * 100) : 0;
  const pn = limit ? Math.min(100 - pb, (net / limit) * 100) : 0;
  const pct = limit ? ((bal + net) / limit) * 100 : 0;
  const onHold = credit?.status === "ON_HOLD" || !!credit?.holdReason;
  const terms = o.paymentTerms.find((t) => t.code === head.paymentTerms)?.label ?? head.paymentTerms;
  const due = plusDays(head.docDate, termDays(head.paymentTerms));
  const listName = o.priceLists.find((p) => p.id === listId)?.name;
  const wh = o.warehouses.find((w) => w.id === head.warehouseId);
  const lineErr = (key: number, f: string) => {
    const i = calc.filter((c) => c.r.itemId).findIndex((c) => c.r.key === key);
    return i >= 0 ? errs[`lines.${i}.${f}`] || "" : "";
  };
  const fbrNo = saved ? saved.fbrInvoiceNo ?? (saved.status === "DRAFT" ? "On posting" : saved.fbrStatus === "PENDING" ? "Queued for FBR" : saved.docNo) : "On posting";

  return (
    <>
      <div className="sd-head">
        <span className="sd-head-ic"><FileText /></span>
        <div className="sd-head-t">
          <h1>Sales Voucher{saved && <span className={cn("badge dot", saved.status === "DRAFT" ? "warn" : "good")}>{saved.status === "DRAFT" ? "Draft" : "Posted"}</span>}</h1>
          <p>Create and record a sales invoice with customer, order and item details.</p>
        </div>
        <div className="sd-head-btns">
          <Button icon={<FilePenLine />} disabled={locked || !!busy} onClick={() => void save(false)}>{busy === "draft" ? "Saving…" : "Save Draft"}</Button>
          <Button variant="primary" icon={<Check />} disabled={locked || !!busy || !can.post} title={can.post ? undefined : "You can’t post sales vouchers; save it as a draft"} onClick={() => void save(true)}>{busy === "post" ? "Posting…" : "Save & Post"}</Button>
          <Button icon={<Printer />} disabled={!items} onClick={() => setPrinting(true)}>Print</Button>
          <Button icon={<Ellipsis />} onClick={(e) => setMore(e.currentTarget)}>More<ChevronDown /></Button>
        </div>
      </div>

      {saved && (
        <div className="sv-done">
          <Banner tone="good" title={saved.status === "DRAFT" ? `Draft ${saved.docNo} saved` : `${saved.docNo} posted · ${rs(saved.netAmount, 2)}`}
            action={<div className="row"><Link className="btn sm secondary" href={`/sales/invoices/${saved.id}`}>{saved.status === "DRAFT" ? "Open draft" : "View invoice"}</Link><Button size="sm" variant="primary" icon={<Plus />} onClick={reset}>New voucher</Button></div>}>
            {saved.status === "DRAFT" ? "Finish and post it from the invoice, or start a new voucher." : `${saved.customer.name} · ${saved.journal ? `journal ${saved.journal.docNo} · ` : ""}${saved.submitToFbr ? "queued for FBR" : "not reported to FBR"}.`}
          </Banner>
        </div>
      )}
      {notice && <Banner tone="danger" title={notice.title}>{notice.message}</Banner>}

      <div className="sd-refs">
        <div className="sd-ref"><span><FileText /></span><div><small>Sale No</small><b className={cn(!saved && "sv-auto")}>{saved?.docNo ?? "auto"}</b></div></div>
        <div className="sd-ref"><span><CalendarDays /></span><div><small>Sale Date</small><input type="date" className="cell-input sd-ref-in" value={head.docDate} disabled={locked} aria-label="Sale date" onChange={(e) => setH("docDate", e.target.value)} /></div></div>
        <div className="sd-ref"><span><ClipboardList /></span><div><small>Customer PO No</small><input className="cell-input sd-ref-in" value={head.poNo} maxLength={60} disabled={locked} placeholder="—" aria-label="Customer PO number" onChange={(e) => setH("poNo", e.target.value)} /></div></div>
        <div className="sd-ref"><span><CalendarCheck /></span><div><small>PO Date</small><input type="date" className="cell-input sd-ref-in" value={head.poDate} disabled={locked} aria-label="PO date" onChange={(e) => setH("poDate", e.target.value)} /></div></div>
        <div className="sd-ref"><span><ReceiptText /></span><div><small>Invoice No</small><b className={cn(!saved?.fbrInvoiceNo && "sv-auto")} title="FBR invoice number">{fbrNo}</b></div></div>
        <div className="sd-ref"><span><BookOpen /></span><div><small>Bill Book No</small><input className="cell-input sd-ref-in" value={head.billBookNo} maxLength={30} disabled={locked} placeholder="—" aria-label="Bill book number" onChange={(e) => setH("billBookNo", e.target.value)} /></div></div>
      </div>

      <fieldset disabled={locked}>
        <div className="sd-sv-cards">
          <div className="panel sd-card">
            <div className="sd-card-head">
              <span className="sd-card-ic"><UserRound /></span>
              <h3>Order &amp; Customer Information</h3>
              <span className="sd-hint"><Info />Select a customer to auto-fill customer details.</span>
            </div>
            <div className="sd-form sd-two">
              <label><span>Customer / Party <i>*</i></span>
                <select value={head.customerId} className={cn(errs.customerId && "sv-bad")} onChange={(e) => pickCustomer(e.target.value)}>
                  <option value="">Choose the customer…</option>
                  {o.customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === "ON_HOLD" ? " (on hold)" : ""}</option>)}
                </select>
                {errs.customerId && <small className="sv-err">{errs.customerId}</small>}
              </label>
              <label><span>Customer Name</span><input value={customer?.name ?? ""} readOnly /></label>
            </div>
            <div className="sd-addr">
              <span className="sd-addr-pin"><MapPin /></span>
              <div className="sd-addr-body">
                <b>Address</b>
                <p>{customer ? [customer.address, customer.city].filter(Boolean).join(", ") || "No address on file" : "—"}</p>
                <small>{customer ? [customer.phone, customer.ntn ? `NTN ${customer.ntn}` : customer.cnic ? `CNIC ${customer.cnic}` : "Unregistered", customer.code].filter(Boolean).join(" · ") : "—"}</small>
              </div>
              <div className={cn("sd-credit", (!credit || !limit) && "sd-na", limit > 0 && pct > 80 && pct <= 100 && "warn", (limit > 0 && pct > 100) || onHold ? "over" : "")}>
                <div className="sd-credit-top"><span>Credit used</span><b>{onHold ? "Hold" : limit ? `${Math.round(pct)}%` : "Cash"}</b></div>
                <div className="sd-gauge"><i className="sd-g-bal" style={{ width: `${pb}%` }} /><i className="sd-g-bill" style={{ left: `${pb}%`, width: `${pn}%` }} /></div>
                <small>
                  {!credit ? "—" : onHold ? <><b>On hold</b>{credit.holdReason ? ` · ${credit.holdReason}` : ""}</> : limit ? (
                    <>Balance {rs(bal)} + this bill {rs(net)} of {rs(limit)} limit{pct > 100 && <> · <b>over limit</b></>}</>
                  ) : `No credit facility · balance ${rs(bal)}`}
                </small>
              </div>
            </div>
            <div className="sd-form sd-two-eq">
              <label><span>Branch</span>
                <select value={head.branchId} className={cn(errs.branchId && "sv-bad")} onChange={(e) => { const b = e.target.value; setHead((h) => (h ? { ...h, branchId: b, warehouseId: o.warehouses.find((w) => w.id === h.warehouseId)?.branchId === b ? h.warehouseId : (o.warehouses.find((w) => w.branchId === b)?.id ?? h.warehouseId) } : h)); }}>
                  {o.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label><span>City</span><input value={customer?.city ?? ""} readOnly placeholder="—" /></label>
            </div>
          </div>

          <div className="panel sd-card">
            <div className="sd-card-head">
              <span className="sd-card-ic"><Truck /></span>
              <h3>Fulfillment &amp; Sales Team</h3>
              <span className="sd-hint plain"><Users />Commission follows the salesman</span>
            </div>
            <div className="sd-form sd-three">
              <label><span>Booker Name</span><input value={head.booker} maxLength={100} onChange={(e) => setH("booker", e.target.value)} /></label>
              <label><span>Deliveryman</span><input value={head.deliveryman} maxLength={100} onChange={(e) => setH("deliveryman", e.target.value)} /></label>
              <label><span>Salesman</span><input value={head.salesman} maxLength={100} onChange={(e) => setH("salesman", e.target.value)} /></label>
              <label><span>Supervisor</span><input value={head.supervisor} maxLength={100} onChange={(e) => setH("supervisor", e.target.value)} /></label>
              <label><span>Sale Type</span>
                <select value={head.saleType} onChange={(e) => setH("saleType", e.target.value)}>{o.saleTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select>
              </label>
              <label><span>Payment Terms</span>
                <select value={head.paymentTerms} className={cn(errs.paymentTerms && "sv-bad")} onChange={(e) => setH("paymentTerms", e.target.value)}>{o.paymentTerms.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select>
              </label>
              <label><span>Place / Warehouse</span>
                <select value={head.warehouseId} className={cn(errs.warehouseId && "sv-bad")} onChange={(e) => setH("warehouseId", e.target.value)}>
                  <option value="">Choose…</option>
                  {o.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {errs.warehouseId && <small className="sv-err">{errs.warehouseId}</small>}
              </label>
              <label className="sd-span2"><span>Remarks</span><input value={head.remarks} maxLength={1000} placeholder="e.g. Deliver before 2 PM — loading bay 3." onChange={(e) => setH("remarks", e.target.value)} /></label>
            </div>
            <div className="sd-ful-foot">
              <div>
                <small>Delivery slot</small>
                <div className="seg sd-seg-sm">
                  {o.deliverySlots.map((s) => <button key={s.code} type="button" className={cn(head.slot === s.code && "active")} onClick={() => setH("slot", s.code)}>{s.label}</button>)}
                </div>
              </div>
              <div className="sd-ful-pills">
                {wh && <span className="pill"><Truck />{wh.name}</span>}
                <span className="pill"><Clock />Due <b>{dateLabel(due)}</b></span>
                {listName && <span className="pill"><Tag />{listName}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="panel sd-card sd-items">
          <div className="sd-card-head">
            <span className="sd-card-ic"><Package /></span>
            <h3>Item Entry</h3>
            <p className="sd-sub">{errs.lines ? <span className="sv-err">{errs.lines}</span> : "Select a product to auto-fill pack, rate and tax details."}</p>
            <div className="sd-tools">
              <label className="sd-find">
                <Search />
                <input ref={searchRef} className="cell-input" placeholder="Search product by name or SKU…" autoComplete="off" value={search}
                  onChange={(e) => { setSearch(e.target.value); openAc(e.currentTarget, "search", e.target.value); }}
                  onFocus={(e) => openAc(e.currentTarget, "search", search)}
                  onBlur={() => setTimeout(() => setAc((a) => (a?.target === "search" ? null : a)), 140)}
                  onKeyDown={(e) => { if (acKey(e)) return; if (e.key === "ArrowDown") openAc(e.currentTarget, "search", search); }} />
                <kbd className="kbd">F2</kbd>
              </label>
              <Button size="sm" variant="primary" icon={<Search />} onClick={() => searchRef.current?.focus()}>Find Product</Button>
              <Button size="sm" icon={<Plus />} onClick={addRow}>Add Product</Button>
            </div>
          </div>
          <div className="table-wrap sd-grid-wrap">
            <table className="tbl lines sd-grid" data-plain>
              <thead><tr>
                <th className="sd-c-idx">#</th><th>Product Name <i className="sd-req">*</i></th><th>Pack</th><th>Batch / Expiry</th>
                <th className="num">Qty</th><th className="num">Bonus</th><th className="num">Sale Rate</th><th className="num">Gross</th>
                <th className="num">Disc %</th><th className="num">GST %</th><th className="num">Net Rate</th><th className="num">Net Amount</th><th />
              </tr></thead>
              <tbody ref={gridRef}>
                {calc.map(({ r, p, a, nrate }, i) => (
                  <tr key={r.key} data-k={r.key}>
                    <td className="sd-c-idx">{i + 1}</td>
                    <td className="sd-c-prod">
                      <div className="sd-prod">
                        <input className={cn("cell-input", lineErr(r.key, "itemId") && "sv-bad")} data-f="prod" value={r.q ?? p?.name ?? ""} placeholder="Type to search product…" autoComplete="off"
                          onChange={(e) => { setRow(r.key, { q: e.target.value }); openAc(e.currentTarget, r.key, e.target.value); }}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={() => setTimeout(() => { setAc((x) => (x?.target === r.key ? null : x)); setRow(r.key, { q: null }); }, 140)}
                          onKeyDown={(e) => {
                            if (acKey(e)) return;
                            if (e.key === "ArrowDown") { e.preventDefault(); openAc(e.currentTarget, r.key, ""); return; }
                            cellKey(e, r.key, "prod");
                          }} />
                        <button type="button" className="sd-prod-dd" tabIndex={-1} aria-label="Browse products"
                          onMouseDown={(e) => { e.preventDefault(); const inp = e.currentTarget.parentElement?.querySelector("input"); if (inp) { inp.focus(); openAc(inp, r.key, ""); } }}><ChevronDown /></button>
                      </div>
                      <div className="sd-meta">
                        {p ? <><code>{p.sku}</code>{p.hsCode && <span className="sd-meta-empty">HS {p.hsCode}</span>}</> : <span className="sd-meta-empty">No product selected · type or press ↓</span>}
                      </div>
                    </td>
                    <td><span className="sd-pack">{packOf(p)}</span></td>
                    <td>{p ? <span className="sv-fefo" title="Batches are picked first-expiry-first-out on posting"><Layers />{p.trackExpiry ? "FEFO" : "—"}</span> : <span className="sv-fefo">—</span>}</td>
                    <td><input className={cn("cell-input num", lineErr(r.key, "qtyLoose") && "sv-bad")} data-f="qty" inputMode="decimal" value={r.qty} title={lineErr(r.key, "qtyLoose") || undefined} onChange={(e) => setRow(r.key, { qty: e.target.value })} onKeyDown={(e) => cellKey(e, r.key, "qty")} /></td>
                    <td><input className="cell-input num" data-f="bonus" inputMode="decimal" value={r.bonus} placeholder="0" onChange={(e) => setRow(r.key, { bonus: e.target.value })} onKeyDown={(e) => cellKey(e, r.key, "bonus")} /></td>
                    <td><input className={cn("cell-input num", lineErr(r.key, "rate") && "sv-bad")} data-f="rate" inputMode="decimal" value={r.rate} onChange={(e) => setRow(r.key, { rate: e.target.value })} onBlur={() => { if (n(r.rate)) setRow(r.key, { rate: n(r.rate).toFixed(2) }); }} onKeyDown={(e) => cellKey(e, r.key, "rate")} /></td>
                    <td className="num sd-out">{grp(a.grossAmount)}</td>
                    <td><input className={cn("cell-input num", lineErr(r.key, "discountPct") && "sv-bad")} data-f="disc" inputMode="decimal" value={r.disc} placeholder="0" onChange={(e) => setRow(r.key, { disc: e.target.value })} onKeyDown={(e) => cellKey(e, r.key, "disc")} /></td>
                    <td>
                      <select className="cell-input" data-f="gst" value={r.taxCodeId} onChange={(e) => setRow(r.key, taxFor(e.target.value))} onKeyDown={(e) => cellKey(e, r.key, "gst")} aria-label="GST %">
                        <option value="">0</option>
                        {o.taxCodes.map((t) => <option key={t.id} value={t.id}>{t.rate ?? 0}{o.taxCodes.filter((x) => x.rate === t.rate).length > 1 ? ` ${t.code}` : ""}</option>)}
                      </select>
                    </td>
                    <td className="num sd-out">{grp(nrate)}</td>
                    <td className="num sd-out sd-strong">{grp(a.totalAmount)}</td>
                    <td className="sd-c-del"><button type="button" className="sd-del" aria-label="Delete line" onClick={() => delRow(r.key)}><Trash2 /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sd-grid-foot">
            <Button size="sm" className="sd-addrow" icon={<Plus />} onClick={addRow}>Add Row</Button>
            <button type="button" className="sd-linkbtn" onClick={clearAll}><Trash2 />Clear All Items</button>
            <span className="spacer" />
            <span className="sd-keys"><kbd className="kbd">Enter</kbd> next cell <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd> add row <kbd className="kbd">F2</kbd> search</span>
          </div>
        </div>
      </fieldset>

      <div className="sd-totbar">
        <div><span><Box /></span><div><small>Total Items</small><b>{items}</b></div></div>
        <div><span><Layers /></span><div><small>Total Qty</small><b>{totalQty.toLocaleString("en-US", { maximumFractionDigits: 3 })}</b></div></div>
        <div><span><Calculator /></span><div><small>Gross Amount</small><b>{grp(T.grossAmount)}</b></div></div>
        <div><span><Tag /></span><div><small>Discount</small><b>{grp(T.discountAmount)}</b></div></div>
        <div><span><Percent /></span><div><small>GST Amount</small><b>{grp(T.taxAmount)}</b></div></div>
        <div className="sd-net">
          <span><Wallet /></span>
          <div><small>Net Amount</small><b>Rs {grp(net).split(".")[0]}<span className="dec">.{grp(net).split(".")[1]}</span></b></div>
          {saved && saved.status !== "DRAFT" && saved.status !== "VOID"
            ? <Link className="btn sm sd-pay-btn" href={`/receivables/receipts?invoice=${saved.id}`}><HandCoins /><span>Receive</span></Link>
            : <button type="button" className="btn sm sd-pay-btn" disabled title="Post the voucher, then receive payment"><HandCoins /><span>Receive</span></button>}
        </div>
      </div>

      {ac && <AcPop ac={ac} list={acList} priceOf={priceOf} onPick={pick} onHover={(idx) => setAc({ ...ac, idx })} onClose={closeAc} />}

      {more && <Menu anchor={more} onClose={() => setMore(null)} items={[
        { label: "Discard voucher", icon: <Trash2 />, danger: true, disabled: locked, onClick: () => { setMore(null); clearAll(); } },
      ]} />}

      <Drawer open={printing} onClose={() => setPrinting(false)} title="Print preview" subtitle="Sales tax invoice · A4 portrait" wide className="sv-print sd-print-drawer"
        foot={<><Button onClick={() => setPrinting(false)}>Close</Button><Button variant="primary" icon={<Printer />} onClick={() => window.print()}>Print</Button></>}>
        <div className="paper sd-paper">
          <div className="paper-head">
            <div><h2>{saved?.branch.name ?? o.branches.find((b) => b.id === head.branchId)?.name ?? "Accountex"}</h2><p className="sd-pmuted">{wh ? `Dispatched from ${wh.name}` : ""}</p></div>
            <div className="doc-title"><h2>Sales Tax Invoice</h2><b>{saved?.docNo ?? "Draft — not saved"}</b><p className="sd-pmuted">{dateLabel(head.docDate)}{head.billBookNo ? ` · Bill book ${head.billBookNo}` : ""}</p></div>
          </div>
          <div className="paper-meta">
            <div><small>Bill to</small><b>{customer?.name ?? "—"}</b><div className="sd-pmuted">{[customer?.address, customer?.city].filter(Boolean).join(", ")}{customer?.ntn ? <><br />NTN {customer.ntn}</> : null}</div></div>
            <div><small>Customer PO</small><b>{head.poNo || "—"}</b><div className="sd-pmuted">{head.poDate ? dateLabel(head.poDate) : ""}</div></div>
            <div><small>Terms</small><b>{terms}</b><div className="sd-pmuted">Due {dateLabel(due)}</div></div>
            <div><small>Salesman</small><b>{head.salesman || "—"}</b><div className="sd-pmuted">{head.booker ? `Booker ${head.booker}` : ""}</div></div>
          </div>
          <table className="tbl" data-plain>
            <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Bonus</th><th className="num">Rate</th><th className="num">Disc</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {calc.filter((c) => c.p).map((c, i) => (
                <tr key={c.r.key}><td>{i + 1}</td><td><b>{c.p!.name}</b><small>{c.p!.sku}</small></td><td className="num">{grp(c.qty, 0)}</td><td className="num">{n(c.r.bonus) || "—"}</td><td className="num">{grp(n(c.r.rate))}</td><td className="num">{n(c.r.disc)}%</td><td className="num">{grp(c.a.taxAmount)}</td><td className="num"><b>{grp(c.a.totalAmount)}</b></td></tr>
              ))}
            </tbody>
          </table>
          <div className="sd-paper-bot">
            <div className="sd-fbr"><ListOrdered /><div><b>FBR Invoice No.</b><code>{fbrNo}</code><small>{o.fbr.active ? "Reported to FBR on posting." : "FBR reporting is not set up."}</small></div></div>
            <div className="paper-totals">
              <div><span>Gross amount</span><b>{grp(T.grossAmount)}</b></div>
              <div><span>Discount</span><b>− {grp(T.discountAmount)}</b></div>
              <div><span>Sales tax (GST)</span><b>{grp(T.taxAmount)}</b></div>
              <div className="grand"><span>Net payable</span><span>{rs(net, 2)}</span></div>
            </div>
          </div>
          <div className="paper-foot"><span><b>Amount in words:</b> {amountInWords(net)}</span><span>Authorised signatory ____________</span></div>
        </div>
      </Drawer>
    </>
  );
}

/** Product autocomplete popover (template .sd-ac): fixed under its input, follows scrolling, flips above when there is no room. */
function AcPop({ ac, list, priceOf, onPick, onHover, onClose }: {
  ac: NonNullable<Ac>; list: Product[]; priceOf: (p: Product) => number; onPick: (p: Product) => void; onHover: (i: number) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const r = ac.el.getBoundingClientRect();
      if (!r.width) { onClose(); return; }
      const w = Math.min(innerWidth - 20, Math.max(r.width, 520));
      const h = ref.current?.offsetHeight ?? 0;
      let top = r.bottom + 6;
      if (top + h > innerHeight - 10 && r.top - h - 6 > 0) top = r.top - h - 6;
      const left = Math.max(10, Math.min(r.left, innerWidth - w - 10));
      setPos((p) => (p && p.left === left && p.top === top && p.width === w ? p : { left, top, width: w }));
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", onClose);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", onClose); };
  }, [ac.el, list.length, onClose]);
  useEffect(() => { ref.current?.querySelector(".sd-ac-row.on")?.scrollIntoView({ block: "nearest" }); }, [ac.idx]);
  const q = ac.q.trim();
  return createPortal(
    <div ref={ref} className="sd-ac open" style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: "hidden" }} onMouseDown={(e) => e.preventDefault()}>
      <div className="sd-ac-h"><span>Products</span><small><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> move <kbd className="kbd">Enter</kbd> pick <kbd className="kbd">Esc</kbd> close</small></div>
      {list.length ? list.map((p, i) => (
        <div key={p.id} className={cn("sd-ac-row", i === ac.idx && "on")} onMouseEnter={() => onHover(i)} onClick={() => onPick(p)}>
          <span className="icon-well sm"><Package /></span>
          <div className="sd-ac-main"><b><Hl text={p.name} q={q} /></b><small><Hl text={p.sku} q={q} /> · {packOf(p)}{p.trackExpiry ? " · expiry tracked" : ""}</small></div>
          <span className="sv-ac-code">{p.gstRate ? `GST ${p.gstRate}%` : "No GST"}</span>
          <div className="sd-ac-price"><b>Rs {grp(priceOf(p), 0)}</b><small>List Rs {grp(p.price, 2)}</small></div>
        </div>
      )) : <div className="sd-ac-empty">No product matches “{q}”.</div>}
    </div>,
    document.body,
  );
}

function VoucherSkeleton() {
  return (
    <div aria-busy>
      <Skeleton style={{ height: 64, marginBottom: 16 }} />
      <Skeleton style={{ height: 70, marginBottom: 16 }} />
      <div className="sd-sv-cards"><Skeleton style={{ height: 300 }} /><Skeleton style={{ height: 300 }} /></div>
      <Skeleton style={{ height: 320 }} />
    </div>
  );
}
