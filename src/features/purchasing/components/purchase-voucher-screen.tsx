"use client";

import "./purchase-voucher.css";
import {
  Banknote, Boxes, Calendar, ChartColumn, ChartNoAxesColumn, ChartPie, Check, ChevronRight, ChevronUp, ClipboardCheck, Clock, Clock3, FilePenLine, FileText, HandCoins, History, Info, Landmark,
  Layers, NotebookPen, Package, Percent, Plus, Printer, Receipt, ScanBarcode, ScrollText, Search, Send, Settings, ShieldCheck, ShoppingBasket, Store, Trash, Trash2, TrendingUp, Upload, UserRound,
  WalletCards, Warehouse, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { baseQtyOf, docTotals, dueDateFor, lineAmounts, type ItemInsight, type PurchaseOptions, type VendorBill } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { createPurchaseVoucher, itemInsight, purchaseOptions } from "../api";

type Mode = "CREDIT" | "CASH" | "BANK" | "CHEQUE";
type PType = "SHOP" | "WAREHOUSE";
type Product = PurchaseOptions["products"][number];
type Row = {
  key: number; itemId: string; upc: string; rate: string; sale: string; saleTouched: boolean; ctn: string; loose: string; bonus: string; brk: string;
  gst: string; taxCodeId: string | null; disc: string; batchNo: string; expiry: string; sel: boolean;
};
type Head = {
  docDate: string; vendorId: string; branchId: string; warehouseId: string; invoice: string; retailPct: string; deal: string; purchaser: string; costCentre: string; due: string; dueTouched: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);
const n = (s: string) => { const x = Number(String(s).replace(/[,\s]/g, "")); return Number.isFinite(x) && x > 0 ? x : 0; };
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const grp = (x: number, dec = 2) => Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const rs = (x: number) => `${x < 0 ? "−" : ""}Rs ${grp(x)}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fd = (iso: string) => (iso ? `${iso.slice(8)} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—");
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const STEPS = [
  { t: "Voucher Details", s: "Basic information" }, { t: "Items", s: "Products to purchase" }, { t: "Payments & Tax", s: "Settle & withhold" }, { t: "Review & Post", s: "Verify and post" },
];
const MODES: { m: Mode; icon: typeof Clock3; b: string; s: string }[] = [
  { m: "CREDIT", icon: Clock3, b: "On Credit", s: "Pay later" }, { m: "CASH", icon: Banknote, b: "Cash", s: "From drawer" },
  { m: "BANK", icon: Landmark, b: "Bank Transfer", s: "IBFT / online" }, { m: "CHEQUE", icon: ScrollText, b: "Cheque", s: "Issue cheque" },
];
const STATE_LABEL: Record<string, string> = { DRAFT: "DRAFT", POSTED: "POSTED", PAID: "PAID", PARTIALLY_PAID: "PART PAID" };
/** WHT u/s 153(1)(a) goods default by the supplier's ATL status (template: filer 5.5%, non-filer double). */
const whtDefault = (atl: string | undefined, section: string | undefined) => (section === "EXEMPT" ? 0 : atl === "ACTIVE" ? 5.5 : 11);
/** 153_1_A → 153(1)(a) */
const sectionLabel = (code: string) => (code === "EXEMPT" ? "153 (exempt)" : code.replace(/^(\d+)_(\d+)_([A-Z])$/, (_m, a: string, b: string, c: string) => `${a}(${b})(${c.toLowerCase()})`));

let seq = 0;
const blankRow = (p?: Product): Row => ({
  key: ++seq, itemId: p?.id ?? "", upc: p?.upc ?? "", rate: p ? String(p.cost) : "", sale: p ? String(p.price) : "", saleTouched: false, ctn: "0", loose: p ? "1" : "0", bonus: "0", brk: "0",
  gst: p ? String(p.gstRate) : "18", taxCodeId: p?.taxCodeId ?? null, disc: "0", batchNo: "", expiry: "", sel: false,
});

/** Template app/purchases/voucher (44-purchase-docs.html + 94-purchase-docs.js): the counter purchase in one flow; stock in, supplier ledger and GL on posting. */
export function PurchaseVoucherScreen({ can }: { can: { post: boolean } }) {
  const toast = useToast();
  const [o, setO] = useState<PurchaseOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [head, setHead] = useState<Head>({ docDate: today(), vendorId: "", branchId: "", warehouseId: "", invoice: "", retailPct: "0", deal: "", purchaser: "", costCentre: "", due: today(), dueTouched: false });
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<Mode>("CREDIT");
  const [cash, setCash] = useState("");
  const [bank, setBank] = useState("");
  const [chq, setChq] = useState("");
  const [whtSection, setWhtSection] = useState("153_1_A");
  const [wht, setWht] = useState("5.5");
  const [paid, setPaid] = useState("0");
  const [adv, setAdv] = useState("0");
  const [notes, setNotes] = useState("");
  const [markup, setMarkup] = useState("0.00");
  const [markupNote, setMarkupNote] = useState("Live — type to reprice every line");
  const [shut, setShut] = useState(false);
  const [q, setQ] = useState("");
  const [sugOpen, setSugOpen] = useState(false);
  const [hit, setHit] = useState(false);
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);
  const [saved, setSaved] = useState<VendorBill | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [step, setStep] = useState({ act: 0, prog: 0 });
  const [ptype, setPtype] = useState<PType>("SHOP");
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [ins, setIns] = useState<Record<string, ItemInsight | "loading" | "error">>({});
  const secs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const scanRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => purchaseOptions().then((x) => {
    setO(x);
    setHead((h) => {
      const v = h.vendorId ? x.vendors.find((y) => y.id === h.vendorId) : x.vendors[0];
      const wh = x.warehouses.find((w) => w.id === h.warehouseId) ?? x.warehouses[0];
      if (wh && !h.warehouseId) setPtype(wh.type === "SHOP" ? "SHOP" : "WAREHOUSE");
      return { ...h, vendorId: h.vendorId || v?.id || "", branchId: h.branchId || wh?.branchId || x.branches[0]?.id || "", warehouseId: h.warehouseId || wh?.id || "", due: h.dueTouched ? h.due : dueDateFor(h.docDate, v?.creditDays ?? 0) };
    });
    setCash((c) => c || x.cashAccounts[0]?.id || "");
    setBank((b) => b || x.bankAccounts[0]?.id || "");
    const v0 = x.vendors[0];
    if (v0) { setWhtSection(v0.whtSection); setWht(String(whtDefault(v0.atlStatus, v0.whtSection))); }
  }).catch((e: unknown) => setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load purchasing data" })), []);
  useEffect(() => { void load(); }, [load, attempt]);

  const vendor = o?.vendors.find((v) => v.id === head.vendorId);
  const prod = useCallback((id: string) => o?.products.find((p) => p.id === id), [o]);
  const locked = !!saved;

  // ---------------------------------------------------------------- maths (same as the server)
  const calc = useMemo(() => rows.map((r) => {
    const p = prod(r.itemId);
    const baseQty = baseQtyOf(n(r.ctn), n(r.loose), p?.ctn ?? 1);
    const a = lineAmounts({ baseQty, rate: n(r.rate), discountPct: n(r.disc), taxRate: n(r.gst), whtRate: n(wht) });
    return { r, p, baseQty, t: baseQty + n(r.bonus) - n(r.brk), a };
  }), [rows, prod, wht]);
  const T = useMemo(() => docTotals(calc.map((c) => c.a), n(adv)), [calc, adv]);
  const qtyTotal = calc.reduce((s, c) => s + c.t, 0);
  // product context for "More information" and "Stock after posting" (fetched once per product)
  const itemIds = useMemo(() => [...new Set(rows.map((r) => r.itemId).filter(Boolean))], [rows]);
  useEffect(() => {
    for (const id of itemIds) {
      if (ins[id]) continue;
      setIns((m) => ({ ...m, [id]: "loading" }));
      itemInsight(id).then((x) => setIns((m) => ({ ...m, [id]: x }))).catch(() => setIns((m) => ({ ...m, [id]: "error" })));
    }
  }, [itemIds, ins]);
  const focusRow = rows.find((r) => r.key === focusKey && r.itemId) ?? [...rows].reverse().find((r) => r.itemId);
  const fi = focusRow ? ins[focusRow.itemId] : undefined;
  const focus = fi && typeof fi === "object" ? fi : null;
  const onHandNow = itemIds.reduce((s, id) => { const x = ins[id]; return s + (x && typeof x === "object" ? x.onHand : 0); }, 0);
  const paidNow = mode === "CREDIT" ? 0 : n(paid);
  const over = paidNow > T.netPayableAmount + 0.005;
  const bal = r2(Math.max(0, T.netPayableAmount - Math.min(paidNow, T.netPayableAmount)));

  // ---------------------------------------------------------------- scroll-spy stepper
  useEffect(() => {
    let ticking = false;
    const spy = () => {
      ticking = false;
      const line = 170;
      const els = secs.map((s) => s.current).filter((x): x is HTMLDivElement => !!x);
      if (els.length < 4) return;
      let act = 0;
      els.forEach((el, i) => { if (el.getBoundingClientRect().top <= line) act = i; });
      const cur = els[act]!.getBoundingClientRect();
      const nxt = els[act + 1] ? els[act + 1]!.getBoundingClientRect().top : cur.bottom;
      let prog = Math.max(0, Math.min(1, (line - cur.top) / Math.max(1, nxt - cur.top)));
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) { act = 3; prog = 1; }
      setStep((s) => (s.act === act && Math.abs(s.prog - prog) < 0.02 ? s : { act, prog }));
    };
    const on = () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    const t = setTimeout(spy, 60);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o]);
  const goStep = (i: number) => {
    const el = secs[i]?.current;
    if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 150), behavior: "smooth" });
  };

  // ---------------------------------------------------------------- edits
  const setRow = (key: number, patch: Partial<Row>) => setRows((rs0) => rs0.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const pickItem = (key: number, id: string) => {
    const p = prod(id);
    setRow(key, p ? { itemId: p.id, upc: p.upc ?? "", rate: String(p.cost), sale: String(p.price), saleTouched: false, gst: String(p.gstRate), taxCodeId: p.taxCodeId, loose: "1" } : { itemId: "" });
  };
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !o) return [];
    return o.products.filter((p) => p.upc === s || p.sku.toLowerCase() === s || p.name.toLowerCase().includes(s) || (p.upc ?? "").startsWith(s) || p.sku.toLowerCase().includes(s)).slice(0, 5);
  }, [q, o]);
  const addBy = (p: Product) => {
    const ex = rows.find((r) => r.itemId === p.id);
    if (ex) setRow(ex.key, { loose: String(n(ex.loose) + 1) });
    else { const nr = blankRow(p); setRows((x) => [...x, nr]); setFocusKey(nr.key); }
    setQ(""); setSugOpen(false); setHit(true); setTimeout(() => setHit(false), 700);
    toast(`${ex ? "Qty +1 · " : "Added · "}${p.name}`, { tone: "good" });
  };
  const onScanKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setSugOpen(false); return; }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!q.trim()) return;
    if (matches[0]) addBy(matches[0]);
    else toast(`No product matches “${q.trim()}”`, { tone: "warn" });
  };
  const removeSel = () => {
    const prev = rows;
    const gone = rows.filter((r) => r.sel).length;
    if (!gone) return;
    setRows(rows.filter((r) => !r.sel));
    toast(`${gone} line${gone > 1 ? "s" : ""} removed`, { action: { label: "Undo", onClick: () => setRows(prev.map((r) => ({ ...r, sel: false }))) } });
  };
  const clearAll = () => {
    if (!rows.length) return;
    const prev = rows;
    setRows([]);
    toast("All lines cleared", { tone: "warn", action: { label: "Undo", onClick: () => setRows(prev) } });
  };
  const delRow = (key: number) => {
    const prev = rows;
    const r = rows.find((x) => x.key === key);
    setRows(rows.filter((x) => x.key !== key));
    toast(`Line removed${r && prod(r.itemId) ? ` — ${prod(r.itemId)!.name}` : ""}`, { action: { label: "Undo", onClick: () => setRows(prev) } });
  };
  const applyMarkup = (v: string) => {
    setMarkup(v);
    const x = Number(v) || 0;
    let c = 0;
    setRows((rs0) => rs0.map((r) => { if (!n(r.rate)) return r; c++; return { ...r, sale: r2(n(r.rate) * (1 + x / 100)).toFixed(2), saleTouched: true }; }));
    setTimeout(() => setMarkupNote(`${c} sale price${c === 1 ? "" : "s"} repriced at +${x}%`), 0);
  };
  const changeVendor = (id: string) => {
    const v = o?.vendors.find((x) => x.id === id);
    setHead((h) => ({ ...h, vendorId: id, due: h.dueTouched ? h.due : dueDateFor(h.docDate, v?.creditDays ?? 0) }));
    if (v) { setWhtSection(v.whtSection); setWht(String(whtDefault(v.atlStatus, v.whtSection))); }
  };
  const pickType = (t: PType) => {
    const w = o?.warehouses.find((x) => (x.type === "SHOP") === (t === "SHOP"));
    if (!w) return;
    setPtype(t);
    setHead((h) => ({ ...h, warehouseId: w.id, branchId: w.branchId ?? h.branchId }));
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    if (m === "CREDIT") setPaid("0");
    else if (!n(paid)) setPaid(T.netPayableAmount.toFixed(2));
  };

  // ---------------------------------------------------------------- review
  const ready = calc.filter((c) => c.r.itemId && c.baseQty + n(c.r.bonus) > 0);
  const batchMissing = calc.filter((c) => c.p?.trackExpiry && (!c.r.batchNo.trim() || !c.r.expiry));
  const checks: [boolean, string, string][] = [
    [!!vendor, "Supplier selected", vendor?.name ?? "Choose the supplier"],
    [!!head.invoice.trim(), "Supplier bill # entered", head.invoice.trim() || "Required to match the vendor bill"],
    [ready.length > 0 && ready.length === rows.length, "Every line has a product and quantity", `${ready.length} of ${rows.length} lines ready`],
    [rows.every((r) => !r.itemId || n(r.rate) > 0), "All lines priced", "Purchase price above zero"],
    [!batchMissing.length, "Batch and expiry for expiry-tracked products", batchMissing.length ? `${batchMissing.length} line${batchMissing.length > 1 ? "s" : ""} need a batch no. and expiry` : "Nothing missing"],
    [!over && (mode === "CREDIT" || paidNow > 0), "Payment within payable", over ? "Paid now exceeds the payable amount" : mode !== "CREDIT" && !paidNow ? "Enter the amount paid now" : `Balance ${grp(bal)}`],
  ];
  const payAcc = mode === "CASH" ? o?.cashAccounts.find((c) => c.id === cash)?.name : mode === "BANK" || mode === "CHEQUE" ? o?.bankAccounts.find((b) => b.id === bank)?.title : null;
  const jv: [string, number, number][] = [];
  if (T.netAmount) jv.push(["Stock in trade · " + (o?.warehouses.find((w) => w.id === head.warehouseId)?.name ?? "warehouse"), T.netAmount, 0]);
  if (T.taxAmount) jv.push(["Input sales tax", T.taxAmount, 0]);
  if (T.advanceTaxAmount) jv.push(["Advance tax u/s 236G", T.advanceTaxAmount, 0]);
  if (T.whtAmount) jv.push([`WHT payable u/s 153 — ${vendor?.name ?? ""}`, 0, T.whtAmount]);
  if (T.netPayableAmount) jv.push([`Trade creditors — ${vendor?.name ?? "supplier"}`, 0, T.netPayableAmount]);
  if (paidNow && !over) { jv.push([`Trade creditors — paid now`, paidNow, 0]); jv.push([payAcc ? `${payAcc}${mode === "CHEQUE" ? ` · cheque ${chq}` : ""}` : "Cash / Bank", 0, paidNow]); }
  const dr = r2(jv.reduce((s, l) => s + l[1], 0));
  const cr = r2(jv.reduce((s, l) => s + l[2], 0));

  // ---------------------------------------------------------------- save
  const validate = () => {
    const e: Record<string, string> = {};
    if (!head.vendorId) e.vendorId = "Choose the supplier";
    if (!head.invoice.trim()) e.vendorInvoiceNo = "Enter the supplier bill #";
    if (!head.warehouseId) e.warehouseId = "Choose the receiving warehouse";
    if (!rows.length) e.lines = "Add at least one line";
    calc.forEach((c, i) => {
      if (!c.r.itemId) e[`lines.${i}.itemId`] = "Choose a product";
      else if (!(c.baseQty + n(c.r.bonus) > 0)) e[`lines.${i}.qtyLoose`] = "Enter a quantity";
      if (n(c.r.brk) > c.baseQty + n(c.r.bonus)) e[`lines.${i}.breakageQty`] = "More than received";
      if (c.p?.trackExpiry && !c.r.batchNo.trim()) e[`lines.${i}.batchNo`] = "Batch no.";
      if (c.p?.trackExpiry && !c.r.expiry) e[`lines.${i}.expiryDate`] = "Expiry";
    });
    if (mode === "CASH" && !cash) e.cashAccountId = "Choose the cash account";
    if ((mode === "BANK" || mode === "CHEQUE") && !bank) e.bankAccountId = "Choose the bank account";
    if (mode === "CHEQUE" && !/^\d{4,10}$/.test(chq.trim())) e.chequeNo = "Cheque no.: 4 to 10 digits";
    if (mode !== "CREDIT" && !(paidNow > 0)) e.paidNowAmount = "Enter the amount paid now";
    if (over) e.paidNowAmount = "Paid now exceeds the payable amount";
    return e;
  };
  const stepOf = (k: string) => (k.startsWith("lines") ? 1 : ["cashAccountId", "bankAccountId", "chequeNo", "paidNowAmount", "advanceTaxAmount", "payMode"].includes(k) ? 2 : 0);
  const showErrs = (e: Record<string, string>, msg?: string) => {
    setErrs(e);
    const first = Object.keys(e)[0];
    if (first) { goStep(stepOf(first)); if (stepOf(first) === 0) setShut(false); }
    toast(msg ?? Object.values(e)[0] ?? "Please check the highlighted fields", { tone: "danger" });
  };
  const save = async (post: boolean) => {
    if (locked || busy) return;
    const e = validate();
    if (Object.keys(e).length) { showErrs(e); return; }
    setErrs({});
    setBusy(post ? "post" : "draft");
    try {
      const b = await createPurchaseVoucher({
        docDate: head.docDate, dueDate: head.due || null, vendorId: head.vendorId, branchId: head.branchId, warehouseId: head.warehouseId, vendorInvoiceNo: head.invoice.trim(),
        purchaserUserId: head.purchaser || null, costCentreId: head.costCentre || null, dealOnSupply: head.deal || null, retailPriceDiscountPct: n(head.retailPct),
        advanceTaxAmount: n(adv), payMode: mode, cashAccountId: mode === "CASH" ? cash : null, bankAccountId: mode === "BANK" || mode === "CHEQUE" ? bank : null,
        chequeNo: mode === "CHEQUE" ? chq.trim() : null, paidNowAmount: paidNow, remarks: notes.trim() || null, post,
        lines: calc.map((c) => ({
          itemId: c.r.itemId, upc: c.r.upc || null, qtyCtn: n(c.r.ctn), qtyLoose: n(c.r.loose), bonusQty: n(c.r.bonus), breakageQty: n(c.r.brk), rate: n(c.r.rate),
          salePrice: c.r.sale === "" ? null : n(c.r.sale), updateItemSalePrice: c.r.saleTouched && c.r.sale !== "" && n(c.r.sale) !== (c.p?.price ?? 0),
          discountPct: n(c.r.disc), taxCodeId: c.r.taxCodeId, taxRate: n(c.r.gst), whtSection: n(wht) > 0 ? whtSection : null, whtRate: n(wht),
          batchNo: c.p?.trackExpiry ? c.r.batchNo.trim() || null : null, expiryDate: c.p?.trackExpiry ? c.r.expiry || null : null, costCentreId: head.costCentre || null,
        })),
      });
      setSaved(b);
      toast(post ? `${b.docNo} posted · stock, A/P and GL updated${b.cheque ? ` · cheque ${b.chequeNo} issued` : ""}` : `Draft saved · ${b.docNo}`, { tone: "good" });
    } catch (err) {
      if (err instanceof ApiError) {
        const d = Object.fromEntries(Object.entries(err.details ?? {}).map(([k, v]) => [k, v[0] ?? err.message]));
        if (err.code === "BILL_DUPLICATE_INVOICE") d.vendorInvoiceNo = d.vendorInvoiceNo ?? "Already entered";
        if (err.code === "BATCH_REQUIRED") {
          const m = /line (\d+)/.exec(err.message);
          if (m) d[`lines.${Number(m[1]) - 1}.batchNo`] = "Batch no.";
        }
        if (Object.keys(d).length) showErrs(d, err.message);
        else toast(err.message, { tone: "danger" });
      } else toast(post ? "Could not post the voucher" : "Could not save the draft", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };
  const reset = () => {
    setSaved(null); setRows([]); setErrs({}); setNotes(""); setAdv("0"); setHead((h) => ({ ...h, invoice: "", deal: "" }));
    changeMode("CREDIT");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={() => { setError(null); setAttempt((a) => a + 1); }} />;
  if (!o) return <div className="stack"><Skeleton style={{ height: 90 }} /><Skeleton style={{ height: 420 }} /></div>;

  const err = (k: string) => errs[k];
  const state = saved?.status ?? "DRAFT";
  const posted = !!saved && saved.status !== "DRAFT";
  const wh = o.warehouses.find((w) => w.id === head.warehouseId);
  const typeWh = o.warehouses.filter((w) => (w.type === "SHOP") === (ptype === "SHOP"));
  const actBtns = () => (
    <>
      <button type="button" className={cn("btn secondary", busy === "draft" && "pd-busy")} disabled={locked || !!busy} onClick={() => save(false)}><FilePenLine />Save as Draft</button>
      {can.post && <button type="button" className={cn("btn primary", busy === "post" && "pd-busy")} disabled={locked || !!busy} onClick={() => save(true)}><Check /><span>{busy === "post" ? "Posting…" : "Save & Post"}</span></button>}
    </>
  );

  /** Rows of a "More information" table, or its loading / empty line. */
  const insightRows = (body: React.ReactNode[] | undefined, cols: number, empty: string) => {
    if (!focusRow) return <tr><td colSpan={cols} className="muted">Add a line to see its details</td></tr>;
    if (fi === "loading" || fi === undefined) return <tr><td colSpan={cols} className="muted">Loading…</td></tr>;
    if (fi === "error") return <tr><td colSpan={cols} className="muted">Couldn’t load this product’s details</td></tr>;
    return body?.length ? body : <tr><td colSpan={cols} className="muted">{empty}</td></tr>;
  };

  return (
    <div className={cn("pd-scr pd-pv", mode === "CHEQUE" && "pd-chq", locked && "pd-locked")}>
      <div className="page-head pd-head">
        <div className="pd-head-l">
          <span className="pd-head-ic"><ShoppingBasket /></span>
          <div>
            <nav className="pd-crumb"><Link href="/purchases/bills">Purchases</Link><ChevronRight /><Link href="/purchases/bills?channel=COUNTER">Purchase Voucher</Link><ChevronRight /><b>{saved ? saved.docNo : "New"}</b></nav>
            <h1>Create Purchase Voucher</h1>
            <p>Record the purchase, update inventory and settle the supplier in one flow.</p>
          </div>
        </div>
        <div className="head-actions">
          {actBtns()}
          <button type="button" className="btn secondary" onClick={() => window.print()}><Printer />Print</button>
          <Link className="btn ghost" href="/purchases/bills"><X />Close</Link>
        </div>
      </div>

      {saved && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="good" title={`${saved.docNo} ${saved.status === "DRAFT" ? "saved as a draft" : "posted"} · ${STATE_LABEL[saved.status] ?? saved.status}`} action={
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <Link className="btn secondary sm" href={`/purchases/bills/${saved.id}`}><FileText />Open bill</Link>
              <button type="button" className="btn primary sm" onClick={reset}><Plus />New voucher</button>
            </div>
          }>
            {saved.status === "DRAFT" ? "Finish and post it from Vendor Bills." : `Stock, the supplier ledger and the GL are updated${saved.balanceAmount > 0 ? ` · balance ${rs(saved.balanceAmount)}` : ""}${saved.cheque ? ` · cheque ${saved.chequeNo} issued (${saved.cheque.docNo})` : ""}.`}
          </Banner>
        </div>
      )}

      <div className="pd-pv-grid">
        <div className="pd-pv-main">
          <ol className="pd-stepper">
            {STEPS.map((s, i) => (
              <li key={s.t} className={cn(i === step.act && "active", i < step.act && "done")}>
                <button type="button" onClick={() => goStep(i)}><b>{i + 1}</b><span><strong>{s.t}</strong><small>{s.s}</small></span></button>
                {i < 3 && <i className="pd-conn"><em style={{ transform: `scaleX(${i < step.act ? 1 : i === step.act ? step.prog : 0})` }} /></i>}
              </li>
            ))}
          </ol>

          {/* Step 1 */}
          <div ref={secs[0]} className={cn("panel pd-card pd-collapsible", shut && "shut")}>
            <button type="button" className="pd-sec-h pd-toggle" aria-expanded={!shut} onClick={() => setShut((s) => !s)}>
              <span className="icon-tile"><Package /></span>
              <span className="pd-sec-t"><b>Voucher Information</b><small>Reference, supplier and terms</small></span>
              <ChevronUp className="pd-chev" />
            </button>
            <div className="pd-collapse"><div className="pd-collapse-in">
              <div className="pd-fgrid pd-pv-f1">
                {/* row 1: Ref. No. · Purchase Type · retail price */}
                <label className="pd-f"><span>Ref. No. <em>*</em></span>
                  <div className="pd-inp-btn"><input value={saved?.docNo ?? "PV-… (on save)"} readOnly />
                    <button type="button" className="btn secondary icon" aria-label="Numbering settings" title="Numbering"
                      onClick={() => toast("The number comes from the company's PV series (Purchase voucher numbering) when the voucher is saved.", { tone: "info" })}><Settings /></button>
                  </div>
                </label>
                <div className="pd-f"><span>Purchase Type <em>*</em></span>
                  <div className="pd-radio-pills">
                    {([["SHOP", Store, "Shop"], ["WAREHOUSE", Warehouse, "Warehouse"]] as const).map(([t, I, l]) => {
                      const has = o.warehouses.some((w) => (w.type === "SHOP") === (t === "SHOP"));
                      return (
                        <label key={t} className={cn(ptype === t && "on", !has && "off")} title={has ? undefined : `No active ${l.toLowerCase()} is set up (Inventory › Warehouses)`}>
                          <input type="radio" name="pd-pv-ptype" value={t} checked={ptype === t} disabled={locked || !has} onChange={() => pickType(t)} /><i /><span><I />{l}</span>
                        </label>
                      );
                    })}
                  </div>
                  {typeWh.length > 1 && (
                    <select className={cn("pd-wh-pick", err("warehouseId") && "pd-bad")} value={head.warehouseId} disabled={locked} aria-label="Receiving location"
                      onChange={(e) => { const w = o.warehouses.find((x) => x.id === e.target.value); setHead({ ...head, warehouseId: e.target.value, branchId: w?.branchId ?? head.branchId }); }}>
                      {typeWh.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.code}</option>)}
                    </select>
                  )}
                  {!o.warehouses.length && <small className="pd-hint" style={{ color: "var(--danger)" }}>No active warehouse or shop; set one up in Inventory › Warehouses.</small>}
                </div>
                <label className="pd-f"><span>Product Purchase on Retail Price</span>
                  <div className="pd-inp-ic r"><input type="number" min="0" max="100" value={head.retailPct} disabled={locked} onChange={(e) => setHead({ ...head, retailPct: e.target.value })} /><Info aria-label="Enter a retail-price discount % if the supplier invoices at MRP" /></div>
                </label>
                {/* row 2: deal · supplier (+) · supplier bill # */}
                <label className="pd-f"><span>Deal on Supply</span><input value={head.deal} maxLength={200} disabled={locked} placeholder="Enter deal or remarks (optional)…" onChange={(e) => setHead({ ...head, deal: e.target.value })} /></label>
                <div className="pd-f"><span>Supplier <em>*</em></span>
                  <div className="pd-inp-btn">
                    <div className="pd-inp-ic"><UserRound /><select value={head.vendorId} disabled={locked} aria-label="Supplier" className={cn(err("vendorId") && "pd-bad")} onChange={(e) => changeVendor(e.target.value)}>
                      {!o.vendors.length && <option value="">No active vendor</option>}
                      {o.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select></div>
                    <a className="btn secondary icon pd-plus" href="/vendors" target="_blank" rel="noreferrer" aria-label="Add supplier" title="Add a supplier (opens Vendors)"><Plus /></a>
                  </div>
                </div>
                <label className="pd-f"><span>Supplier Bill # <em>*</em></span><input value={head.invoice} maxLength={60} disabled={locked} className={cn(err("vendorInvoiceNo") && "pd-bad")} title={err("vendorInvoiceNo")} placeholder="e.g. HP-INV-45872" onChange={(e) => setHead({ ...head, invoice: e.target.value })} /></label>
                {/* row 3: purchaser · due date · if credit */}
                <label className="pd-f"><span>Purchaser</span><select value={head.purchaser} disabled={locked} onChange={(e) => setHead({ ...head, purchaser: e.target.value })}><option value="">Me</option>{o.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
                <label className="pd-f"><span>Due Date</span><div className="pd-inp-ic"><Calendar /><input type="date" value={head.due} min={head.docDate} disabled={locked} onChange={(e) => setHead({ ...head, due: e.target.value, dueTouched: true })} /></div></label>
                <div className="pd-f pd-credit"><span>If Credit</span>
                  <label className="switch"><input type="checkbox" checked={mode === "CREDIT"} disabled={locked} onChange={(e) => changeMode(e.target.checked ? "CREDIT" : "CASH")} /><i /><span>Yes — this is a credit purchase</span></label>
                </div>
                {/* row 4 (not in the template): posting date, branch, cost centre */}
                <label className="pd-f"><span>Date <em>*</em></span><div className="pd-inp-ic"><Calendar /><input type="date" value={head.docDate} disabled={locked} onChange={(e) => setHead({ ...head, docDate: e.target.value, due: head.dueTouched ? head.due : dueDateFor(e.target.value, vendor?.creditDays ?? 0) })} /></div></label>
                <label className="pd-f"><span>Branch</span><select value={head.branchId} disabled={locked} onChange={(e) => setHead({ ...head, branchId: e.target.value })}>{o.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
                <label className="pd-f"><span>Cost Centre</span><select value={head.costCentre} disabled={locked} onChange={(e) => setHead({ ...head, costCentre: e.target.value })}><option value="">None</option>{o.costCentres.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
              </div>
            </div></div>
          </div>

          {/* Step 2 */}
          <div ref={secs[1]} className="panel pd-card flushx">
            <div className="pd-sec-h">
              <span className="icon-tile"><Boxes /></span>
              <span className="pd-sec-t"><b>Purchase Items</b><small>Search by product name, UPC or scan a barcode — press Enter to add.</small></span>
              <div className="pd-sec-act">
                <label className={cn("pd-scan", hit && "hit")}>
                  <Search /><input ref={scanRef} value={q} disabled={locked} placeholder="Search product by name, UPC or scan barcode…" autoComplete="off"
                    onChange={(e) => { setQ(e.target.value); setSugOpen(true); }} onKeyDown={onScanKey} onBlur={() => setTimeout(() => setSugOpen(false), 120)} />
                  <span className="pd-laser" />
                  <div className={cn("pd-sug", sugOpen && matches.length > 0 && !/^\d{8,}$/.test(q.trim()) && "on")}>
                    {matches.map((p) => (
                      <button type="button" key={p.id} onMouseDown={(e) => { e.preventDefault(); addBy(p); }}><b>{p.name}</b><small>{p.upc ?? "—"} · {p.sku}</small><span>{rs(p.cost)}</span></button>
                    ))}
                  </div>
                </label>
                <button type="button" className="btn secondary icon" aria-label="Focus the scanner" title="Scan a barcode" disabled={locked} onClick={() => scanRef.current?.focus()}><ScanBarcode /></button>
                <button type="button" className="btn secondary" disabled title="CSV import comes later"><Upload />Import</button>
                <button type="button" className="btn primary" disabled={locked} onClick={() => { const r = blankRow(); setRows((x) => [...x, r]); setFocusKey(r.key); }}><Plus />Add Row</button>
              </div>
            </div>
            <div className="table-wrap pd-gridwrap">
              <table className="tbl lines pd-lines pd-pv-lines" data-plain="">
                <thead><tr>
                  <th className="pd-ck"><input type="checkbox" aria-label="Select all" disabled={locked} checked={rows.length > 0 && rows.every((r) => r.sel)} onChange={(e) => setRows(rows.map((r) => ({ ...r, sel: e.target.checked })))} /></th>
                  <th>#</th><th>UPC</th><th className="pd-prod">Product Name <em>*</em></th><th className="num">Pur. Price</th><th className="num">Sale Price</th><th className="num">Ctn</th><th className="num">Ps-Qty</th>
                  <th className="num">Bonus</th><th className="num">Brk</th><th className="num">T-Qty</th><th className="num">%GST</th><th className="num">%Disc</th><th>Batch / Expiry</th><th className="num">Cost</th><th className="num">Amount</th><th />
                </tr></thead>
                <tbody>
                  {!rows.length ? (
                    <tr className="pd-empty"><td colSpan={17}><div><span className="icon-well"><ScanBarcode /></span><b>No items yet</b><small>Scan a barcode, search above or press “Add Row”.</small>{errs.lines && <small style={{ color: "var(--danger)" }}>{errs.lines}</small>}</div></td></tr>
                  ) : calc.map((c, i) => {
                    const r = c.r;
                    const num = (k: keyof Row, cls: string, errKey?: string, step = "1") => (
                      <td className={cls}><input className={cn("num", errKey && err(`lines.${i}.${errKey}`) && "pd-bad")} title={errKey ? err(`lines.${i}.${errKey}`) : undefined} type="number" min="0" step={step} disabled={locked} value={String(r[k])} onChange={(e) => setRow(r.key, { [k]: e.target.value } as Partial<Row>)} /></td>
                    );
                    return (
                      <tr key={r.key} className={cn(r.sel && "selected", focusRow?.key === r.key && rows.length > 1 && "pd-focus")} onFocusCapture={() => setFocusKey(r.key)} onClick={() => setFocusKey(r.key)}>
                        <td className="pd-ck"><input type="checkbox" aria-label="Select line" checked={r.sel} disabled={locked} onChange={(e) => setRow(r.key, { sel: e.target.checked })} /></td>
                        <td className="pd-idx">{i + 1}</td>
                        <td className="pd-upc"><input value={r.upc} readOnly tabIndex={-1} /></td>
                        <td className="pd-prod"><select value={r.itemId} disabled={locked} className={cn(err(`lines.${i}.itemId`) && "pd-bad")} title={err(`lines.${i}.itemId`)} onChange={(e) => pickItem(r.key, e.target.value)}>
                          <option value="">Select product…</option>{o.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select></td>
                        {num("rate", "pd-sm", "rate", "0.01")}
                        <td className="pd-sm"><input className="num" type="number" min="0" step="0.01" disabled={locked} value={r.sale} title={r.saleTouched ? "Updates the product's sale price on posting" : undefined} onChange={(e) => setRow(r.key, { sale: e.target.value, saleTouched: true })} /></td>
                        {num("ctn", "pd-xs")}{num("loose", "pd-xs", "qtyLoose")}{num("bonus", "pd-xs")}{num("brk", "pd-xs", "breakageQty")}
                        <td className="num pd-out-c"><b>{grp(c.t, c.t % 1 ? 2 : 0)}</b></td>
                        {num("gst", "pd-xs", "taxRate", "0.5")}{num("disc", "pd-xs", "discountPct", "0.5")}
                        <td className="pd-sm2">{c.p?.trackExpiry ? (
                          <div style={{ display: "flex", gap: 4 }}>
                            <input placeholder="Batch" maxLength={60} disabled={locked} value={r.batchNo} className={cn(err(`lines.${i}.batchNo`) && "pd-bad")} title={err(`lines.${i}.batchNo`)} onChange={(e) => setRow(r.key, { batchNo: e.target.value })} style={{ width: 84 }} />
                            <input type="date" disabled={locked} value={r.expiry} className={cn(err(`lines.${i}.expiryDate`) && "pd-bad")} title={err(`lines.${i}.expiryDate`) ?? "Expiry"} onChange={(e) => setRow(r.key, { expiry: e.target.value })} style={{ width: 132 }} />
                          </div>
                        ) : <span className="muted small">—</span>}</td>
                        <td className="num pd-out-c">{grp(c.a.grossAmount)}</td>
                        <td className="num pd-out-c pd-amt"><b>{grp(c.a.totalAmount)}</b></td>
                        <td className="pd-del"><button type="button" className="pd-icb danger" aria-label="Delete line" disabled={locked} onClick={() => delRow(r.key)}><Trash2 /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pd-grid-foot">
              <span className="pill"><Layers />Total Items: <b>{rows.length}</b></span>
              <span className="spacer" />
              <button type="button" className="btn secondary sm" disabled={locked || !rows.length} onClick={clearAll}><Trash />Clear All</button>
              <button type="button" className="btn danger sm" disabled={locked || !rows.some((r) => r.sel)} onClick={removeSel}><Trash2 />{rows.some((r) => r.sel) ? `Remove Selected (${rows.filter((r) => r.sel).length})` : "Remove Selected"}</button>
            </div>
            <div className="pd-markup">
              <TrendingUp /><span>Sale Price is</span>
              <input type="number" value={markup} step="0.5" min="0" disabled={locked} onChange={(e) => applyMarkup(e.target.value)} /><span>% greater than Purchase Price</span>
              <Info className="pd-mu-i" aria-label="Type a markup — every sale price recomputes live" />
              <span className="spacer" /><small>{markupNote}</small>
            </div>
          </div>

          {/* More information & actions: the selected (or last) line's product */}
          <div className="panel pd-card">
            <div className="pd-sec-h">
              <span className="icon-tile lime"><Zap /></span>
              <span className="pd-sec-t"><b>More Information &amp; Actions</b><small>{focusRow && prod(focusRow.itemId) ? `${prod(focusRow.itemId)!.name} — price history, purchases and stock across locations.` : "Price history, stock across locations and quick actions for this purchase."}</small></span>
            </div>
            <div className="pd-more-grid">
              <div className="pd-mini">
                <div className="pd-mini-h"><span className="icon-well"><ChartColumn /></span><div><b>Previous Sale</b><small>Sale price changes{focus ? ` · now ${rs(focus.item.price)}` : ""}</small></div></div>
                <table className="pd-mt"><thead><tr><th>Date</th><th>Product</th><th className="num">Sale Price</th></tr></thead>
                  <tbody>{insightRows(focus?.priceLog.map((l, i) => <tr key={i}><td>{fd(l.at.slice(0, 10))}</td><td>{focus.item.name}</td><td className="num">{grp(l.newValue)}</td></tr>), 3, "No sale price changes yet")}</tbody>
                </table>
              </div>
              <div className="pd-mini">
                <div className="pd-mini-h"><span className="icon-well blue"><History /></span><div><b>History</b><small>Purchases of {focus?.item.name ?? "this product"}</small></div>
                  {vendor && <Link className="btn ghost sm" href={`/purchases/bills?vendor=${vendor.id}`}>View all</Link>}</div>
                <table className="pd-mt"><thead><tr><th>Date</th><th>Invoice #</th><th className="num">Amount</th></tr></thead>
                  <tbody>{insightRows(focus?.lastPurchases.map((h) => <tr key={h.billId + h.date + h.qty}><td>{fd(h.date)}</td><td><Link href={`/purchases/bills/${h.billId}`} title={h.vendor}>{h.docNo}</Link></td><td className="num">{grp(h.qty * h.rate)}</td></tr>), 3, "No posted purchases yet")}</tbody>
                </table>
              </div>
              <div className="pd-mini">
                <div className="pd-mini-h"><span className="icon-well teal"><Warehouse /></span><div><b>Available Stock</b><small>{focus ? focus.item.name : "Select a line to inspect"}</small></div></div>
                <table className="pd-mt"><thead><tr><th>Location</th><th className="num">Stock</th><th className="num">Reserved</th><th className="num">Avail.</th></tr></thead>
                  <tbody>{insightRows(focus?.stock.map((x) => <tr key={x.warehouse.id}><td>{x.warehouse.name}</td><td className="num">{grp(x.onHand, 0)}</td><td className="num">{grp(x.reserved, 0)}</td><td className="num"><b>{grp(x.available, 0)}</b></td></tr>), 4, "No stock on hand")}</tbody>
                </table>
              </div>
              <div className="pd-mini">
                <div className="pd-mini-h"><span className="icon-well yellow"><Zap /></span><div><b>Quick Actions</b><small>Common tasks and shortcuts</small></div></div>
                <div className="pd-qa">
                  <Link href="/purchases/grn"><Receipt />First Receipt</Link>
                  <Link href="/inventory/products/new"><Plus />New Product</Link>
                  <Link href="/cash/book"><WalletCards />Bulk Payment</Link>
                  <Link href="/cash/book"><Banknote />Cash Payment</Link>
                  <button type="button" disabled title="Price comparison comes with supplier price lists"><ChartNoAxesColumn />Price Comparison</button>
                  <Link href="/purchases/orders?status=OPEN"><Clock />Pending PO</Link>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div ref={secs[2]} className="panel pd-card">
            <div className="pd-sec-h">
              <span className="icon-tile blue"><HandCoins /></span>
              <span className="pd-sec-t"><b>Payments &amp; Tax</b><small>Pay now or keep on credit — withholding u/s 153 is deducted from the payable.</small></span>
              <span className={cn("badge dot", vendor?.atlStatus === "ACTIVE" ? "good" : "warn")}>{vendor?.atlStatus === "ACTIVE" ? "Filer · on ATL" : "Non-filer · double WHT"}</span>
            </div>
            <div className="pd-pay">
              <div className="pd-pay-l">
                <div className="pd-f"><span>Payment Mode</span>
                  <div className="pd-mode">
                    {MODES.map(({ m, icon: I, b, s }) => (
                      <button type="button" key={m} className={cn(mode === m && "on")} disabled={locked} onClick={() => changeMode(m)}><I /><b>{b}</b><small>{s}</small></button>
                    ))}
                  </div>
                </div>
                <div className="pd-fgrid c2">
                  <label className="pd-f"><span>{mode === "CREDIT" ? "Payable account" : mode === "CASH" ? "Cash account" : "Bank account"}</span>
                    {mode === "CREDIT" ? <select disabled><option>Trade creditors — {vendor?.name ?? "supplier"}</option></select>
                      : mode === "CASH" ? <select value={cash} disabled={locked} className={cn(err("cashAccountId") && "pd-bad")} onChange={(e) => setCash(e.target.value)}>{!o.cashAccounts.length && <option value="">No cash account</option>}{o.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}</select>
                        : <select value={bank} disabled={locked} className={cn(err("bankAccountId") && "pd-bad")} onChange={(e) => setBank(e.target.value)}>{!o.bankAccounts.length && <option value="">No bank account</option>}{o.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.title}{b.last4 ? ` · ${b.last4}` : ""}</option>)}</select>}
                  </label>
                  <label className="pd-f pd-chqno"><span>Cheque No.</span><input value={chq} disabled={locked} inputMode="numeric" className={cn(err("chequeNo") && "pd-bad")} title={err("chequeNo")} placeholder="e.g. 00458921" onChange={(e) => setChq(e.target.value)} /></label>
                  <div className="pd-f"><span className="pd-wht-l">WHT u/s
                    <select className="pd-wht-sec" value={whtSection} disabled={locked} aria-label="WHT section" title="Withholding section"
                      onChange={(e) => { setWhtSection(e.target.value); setWht(String(e.target.value === "EXEMPT" ? 0 : whtDefault(vendor?.atlStatus, e.target.value))); }}>
                      {o.whtSections.map((w) => <option key={w.code} value={w.code}>{sectionLabel(w.code)}</option>)}
                    </select></span>
                    <div className="pd-inp-ic r"><input type="number" value={wht} step="0.5" min="0" max="20" disabled={locked} aria-label="WHT deduction %" onChange={(e) => setWht(e.target.value)} /><b className="pd-suf">%</b></div>
                    <small className="pd-hint">{whtSection === "EXEMPT" ? "Exempt supplier" : vendor?.atlStatus === "ACTIVE" ? "Goods · filer rate" : "Goods · non-filer (ATL) rate"}</small>
                  </div>
                  <label className={cn("pd-f", (over || err("paidNowAmount")) && "pd-invalid")}><span>Amount paid now</span>
                    <div className="input-group"><span>Rs</span><input type="number" min="0" value={mode === "CREDIT" ? "0" : paid} disabled={locked || mode === "CREDIT"} className={cn((over || err("paidNowAmount")) && "pd-bad")} title={err("paidNowAmount")} onChange={(e) => setPaid(e.target.value)} /></div>
                    <div className="pd-quick">
                      {[["Full", 1], ["50%", 0.5]].map(([l, f]) => <button type="button" key={l} disabled={locked || mode === "CREDIT"} onClick={() => setPaid(r2(T.netPayableAmount * (f as number)).toFixed(2))}>{l}</button>)}
                      <button type="button" disabled={locked || mode === "CREDIT"} onClick={() => changeMode("CREDIT")}>None</button>
                    </div>
                  </label>
                </div>
              </div>
              <div className="pd-pay-r">
                <div className="pd-settle">
                  <div className="pd-settle-h"><span>Settlement</span><b>{rs(T.totalAmount)}</b></div>
                  <div className="pd-settle-bar">
                    <i className="p" style={{ width: `${(Math.min(paidNow, T.netPayableAmount) / (T.totalAmount || 1)) * 100}%` }} />
                    <i className="w" style={{ width: `${(T.whtAmount / (T.totalAmount || 1)) * 100}%` }} />
                    <i className="b" style={{ width: `${(bal / (T.totalAmount || 1)) * 100}%` }} />
                  </div>
                  <ul className="pd-settle-l">
                    <li><i className="p" />Paid now<b>{rs(Math.min(paidNow, T.netPayableAmount))}</b></li>
                    <li><i className="w" />WHT withheld<b>{rs(T.whtAmount)}</b></li>
                    <li><i className="b" />Balance payable<b>{rs(bal)}</b></li>
                  </ul>
                  <div className="pd-bal"><span>Balance payable to supplier</span><b className="num-big">{rs(bal)}</b><small>{bal > 0 ? `Due ${fd(head.due)} · ${days(head.docDate, head.due)} days` : "Fully settled on posting"}</small></div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div ref={secs[3]} className="panel pd-card">
            <div className="pd-sec-h">
              <span className="icon-tile"><ClipboardCheck /></span>
              <span className="pd-sec-t"><b>Review &amp; Post</b><small>Everything green? Post to update stock, the supplier ledger and the GL.</small></span>
            </div>
            <div className="pd-review">
              <ul className="pd-checks">
                {checks.map(([ok, b, s]) => <li key={b} className={ok ? "ok" : "bad"}><i /><div><b>{b}</b><small>{s}</small></div></li>)}
              </ul>
              <div className="pd-jv">
                <div className="pd-jv-h"><b>Journal preview</b><span className={cn("badge dot", Math.abs(dr - cr) < 0.01 ? "good" : "danger")}>{Math.abs(dr - cr) < 0.01 ? "Balanced" : `Out by ${grp(dr - cr)}`}</span></div>
                <table className="pd-mt pd-jv-t">
                  <thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
                  <tbody>
                    {jv.map((l, i) => <tr key={i}><td title={l[0]}>{l[0]}</td><td className="num dr">{l[1] ? grp(l[1]) : ""}</td><td className="num cr">{l[2] ? grp(l[2]) : ""}</td></tr>)}
                    <tr className="pd-jv-tot"><td>Total</td><td className="num">{grp(dr)}</td><td className="num">{grp(cr)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="pd-review-foot">
              <span className="muted small"><ShieldCheck /> Posting locks this voucher; corrections go through a void.</span>
              <span className="spacer" />
              <button type="button" className={cn("btn secondary", busy === "draft" && "pd-busy")} disabled={locked || !!busy} onClick={() => save(false)}><FilePenLine />Save as Draft</button>
              {can.post && (
                <div className="pd-post-row">
                  <button type="button" className={cn("btn primary lg", busy === "post" && "pd-busy")} disabled={locked || !!busy} onClick={() => save(true)}><Send /><span>{busy === "post" ? "Posting…" : "Save & Post"}</span></button>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="pd-pv-rail">
          <div className={cn("pd-ticket", posted && "posted")}>
            <div className="pd-tk-top">
              <span className="pd-tk-ic"><FileText /></span><b>PURCHASE VOUCHER</b>
              <span className={cn("pd-state", posted && "posted")}><i /><span>{STATE_LABEL[state] ?? state}</span></span>
            </div>
            <div className="pd-tk-ref"><strong>{saved?.docNo ?? "PV-… new"}</strong><span className="qr pd-qr" /></div>
            <dl className="pd-tk-dl">
              <div><dt>Supplier</dt><dd>{vendor?.name ?? "—"}</dd></div>
              <div><dt>Supplier Bill #</dt><dd>{head.invoice || "—"}</dd></div>
              <div><dt>Date</dt><dd>{fd(head.docDate)}</dd></div>
              <div><dt>Due Date</dt><dd>{fd(head.due)}</dd></div>
              <div><dt>Purchase Type</dt><dd title={wh?.name}>{ptype === "SHOP" ? <Store /> : <Warehouse />}{ptype === "SHOP" ? "Shop" : "Warehouse"}{typeWh.length > 1 && wh ? ` · ${wh.name}` : ""}</dd></div>
            </dl>
            <div className="pd-tk-total"><span>Total Amount</span><b>{rs(T.totalAmount)}</b></div>
            <div className="pd-stamp">{state === "PAID" ? "PAID" : "POSTED"}</div>
          </div>

          <div className="panel pd-rcard">
            <div className="pd-rc-h"><span className="icon-well"><ChartPie /></span><b>Totals &amp; Summary</b></div>
            <dl className="pd-sum">
              <div><dt>Total Items</dt><dd>{rows.length}</dd></div>
              <div><dt>Total Quantity</dt><dd>{grp(qtyTotal, qtyTotal % 1 ? 2 : 0)}</dd></div>
              <div><dt>Stock After Posting</dt><dd>{grp(onHandNow + qtyTotal, (onHandNow + qtyTotal) % 1 ? 2 : 0)} units</dd></div>
              <hr />
              <div><dt>Gross Amount</dt><dd>{rs(T.grossAmount)}</dd></div>
              <div><dt>Total Discount</dt><dd>{rs(T.discountAmount)}</dd></div>
              <div><dt>Sales Tax (GST)</dt><dd>{rs(T.taxAmount)}</dd></div>
              <div className="pd-adv"><dt>Advance Tax <small>u/s 236G</small></dt><dd><input type="number" min="0" value={adv} disabled={locked} aria-label="Advance tax" onChange={(e) => setAdv(e.target.value)} /></dd></div>
            </dl>
            <div className="pd-net"><span>Net Amount</span><b>{rs(T.totalAmount)}</b></div>
          </div>

          <div className="panel pd-rcard">
            <div className="pd-rc-h"><span className="icon-well violet"><Percent /></span><b>Tax Summary</b></div>
            <dl className="pd-sum">
              <div><dt>Taxable Amount</dt><dd>{rs(T.netAmount)}</dd></div>
              <div><dt>Input Sales Tax</dt><dd>{rs(T.taxAmount)}</dd></div>
              <div><dt>Advance Tax 236G</dt><dd>{rs(T.advanceTaxAmount)}</dd></div>
              <div><dt>WHT 153 withheld</dt><dd>{rs(T.whtAmount)}</dd></div>
              <hr />
              <div className="pd-strong"><dt>Total Tax</dt><dd>{rs(T.taxAmount + T.advanceTaxAmount + T.whtAmount)}</dd></div>
            </dl>
          </div>

          <div className="panel pd-rcard">
            <div className="pd-rc-h"><span className="icon-well yellow"><NotebookPen /></span><b>Notes <small className="muted">(optional)</small></b></div>
            <textarea rows={3} maxLength={300} value={notes} disabled={locked} placeholder="Add notes or remarks…" onChange={(e) => setNotes(e.target.value)} />
          </div>
        </aside>
      </div>
    </div>
  );
}
