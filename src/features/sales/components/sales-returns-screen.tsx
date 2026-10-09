"use client";

import "./sales-voucher-screen.css";
import "./sales-returns-screen.css";
import {
  Box, ChartPie, Check, CircleAlert, ClipboardList, Coins, ExternalLink, Eraser, FileInput, FileSearch, History, Layers, MapPin, Package, Plus, ReceiptText, Search,
  ShieldAlert, Store, Tag, Trash2, Undo2, UserRound, Warehouse, X, CalendarDays, PackageCheck, Ban,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { docTotals, lineAmounts, type ReceivablesOptions, type ReturnableInvoice, type SalesInvoiceList, type SalesReturn, type SalesReturnList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  cancelReturn, createReturn, deleteReturn, getReturn, listReturns, postReturn, receivablesOptions, returnableInvoice, updateReturn,
} from "@/features/receivables/completion-api";
import { listInvoices } from "../api";

type Can = { create: boolean; edit: boolean; post: boolean; delete: boolean };
type InvRow = SalesInvoiceList["items"][number];
type Line = {
  key: number; invoiceLineId: string; itemId: string; batchId: string; rate: string; discountPct: string; taxRate: string; taxCodeId: string;
  sold: number | null; returnable: number | null; qty: string; reason: string; disposition: string;
};
type Head = { returnType: "AGAINST_INVOICE" | "WITHOUT_INVOICE"; docDate: string; invoiceId: string; customerId: string; warehouseId: string; remarks: string };

const PAGE = 10;
const LIVE_INV = ["POSTED", "PARTIALLY_PAID", "PAID"];
const STATUS: Record<string, { label: string; tone: Tone }> = { DRAFT: { label: "Draft", tone: "warn" }, POSTED: { label: "Posted", tone: "good" }, CANCELLED: { label: "Cancelled", tone: "danger" } };
const DISPO: { code: string; d: string; label: string; icon: React.ReactNode }[] = [
  { code: "RESTOCK", d: "Restock", label: "Restock", icon: <PackageCheck /> },
  { code: "QUARANTINE", d: "Quarantine", label: "Quarantine", icon: <ShieldAlert /> },
  { code: "WRITE_OFF", d: "Write-off", label: "Write-off", icon: <Ban /> },
];
let seq = 0;
const num = (s: string) => { const v = Number(String(s).replace(/[,\s]/g, "")); return Number.isFinite(v) && v > 0 ? v : 0; };
const grp = (v: number, dec = 2) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const qtyf = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const blankHead = (): Head => ({ returnType: "AGAINST_INVOICE", docDate: isoDay(new Date()), invoiceId: "", customerId: "", warehouseId: "", remarks: "" });

function SrStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

function linesFromInvoice(r: ReturnableInvoice, o: ReceivablesOptions, prev: SalesReturn | null): Line[] {
  return r.lines.map((l) => {
    const p = prev?.lines.find((x) => x.invoiceLineId === l.invoiceLineId);
    return {
      key: ++seq, invoiceLineId: l.invoiceLineId, itemId: l.item.id, batchId: l.batchId ?? "", rate: String(l.rate), discountPct: String(l.discountPct), taxRate: String(l.taxRate),
      taxCodeId: l.taxCodeId ?? "", sold: l.soldQty, returnable: l.returnableQty + (p ? p.qty : 0), qty: p ? String(p.qty) : "",
      reason: p?.reason ?? o.lookups.returnReasons[0]?.code ?? "", disposition: p?.disposition ?? "RESTOCK",
    };
  });
}

/**
 * Template app/sales/returns (43-sales-docs.html): a sales return against an invoice (qty ≤ sold − already returned) or
 * without one. Saved as a draft, then posted: goods back by disposition (restock / quarantine / write-off), COGS
 * reversed and a credit note raised (applied to the invoice or kept as customer credit). Previous returns below.
 */
export function SalesReturnsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const [o, setO] = useState<ReceivablesOptions | null>(null);
  const [loadErr, setLoadErr] = useState<{ message: string; reference?: string } | null>(null);
  const [invoices, setInvoices] = useState<InvRow[] | null>(null);
  const [h, setH] = useState<Head>(blankHead);
  const [invText, setInvText] = useState("");
  const [inv, setInv] = useState<ReturnableInvoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [doc, setDoc] = useState<SalesReturn | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const [ask, setAsk] = useState<"cancel" | "delete" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // previous returns
  const [list, setList] = useState<SalesReturnList | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);

  const set = (patch: Partial<Head>) => setH((x) => ({ ...x, ...patch }));
  const fe = (k: string) => err?.fields[k];
  const editable = !doc || doc.status === "DRAFT";
  const canWrite = doc ? can.edit || can.create : can.create;

  useEffect(() => {
    receivablesOptions().then(setO).catch((e: unknown) => setLoadErr(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the form" }));
    Promise.all(LIVE_INV.map((s) => listInvoices({ status: s, pageSize: 200 })))
      .then((ls) => setInvoices(ls.flatMap((l) => l.items).sort((a, b) => (a.docDate < b.docDate ? 1 : -1))))
      .catch(() => setInvoices([]));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listReturns({ status, search, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setList(l); setListErr(null); } })
      .catch((e: unknown) => !cancelled && setListErr(errMsg(e, "Could not load returns")));
    return () => { cancelled = true; };
  }, [status, search, page, attempt]);
  const reloadList = () => setAttempt((x) => x + 1);

  const loadInvoice = useCallback(async (invoiceId: string, prev: SalesReturn | null) => {
    if (!o) return;
    setBusy("invoice");
    setErr(null);
    try {
      const r = await returnableInvoice(invoiceId);
      setInv(r);
      setInvText(r.invoice.docNo);
      setH((x) => ({ ...x, invoiceId, customerId: r.invoice.customer.id, warehouseId: x.warehouseId || r.invoice.warehouse?.id || o.warehouses[0]?.id || "" }));
      setLines(linesFromInvoice(r, o, prev));
    } catch (e) {
      setErr({ message: errMsg(e, "Could not load the invoice"), fields: {} });
    } finally {
      setBusy(null);
    }
  }, [o]);

  const openDoc = useCallback(async (id: string) => {
    if (!o) return;
    try {
      const r = await getReturn(id);
      setDoc(r);
      setErr(null);
      setH({ returnType: r.invoice ? "AGAINST_INVOICE" : "WITHOUT_INVOICE", docDate: r.docDate, invoiceId: r.invoice?.id ?? "", customerId: r.customer.id, warehouseId: r.warehouse.id, remarks: r.remarks ?? "" });
      if (r.invoice && r.status === "DRAFT") await loadInvoice(r.invoice.id, r);
      else {
        setInv(null);
        setInvText(r.invoice?.docNo ?? "");
        setLines(r.lines.map((l) => ({
          key: ++seq, invoiceLineId: l.invoiceLineId ?? "", itemId: l.item?.id ?? "", batchId: l.batchId ?? "", rate: String(l.rate), discountPct: String(l.discountPct), taxRate: String(l.taxRate),
          taxCodeId: "", sold: l.soldQty, returnable: null, qty: String(l.qty), reason: l.reason, disposition: l.disposition,
        })));
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast(errMsg(e, "Could not open the return"), { tone: "danger" });
    }
  }, [o, loadInvoice, toast]);

  // ?id= opens a return, ?invoice= starts one against that invoice
  const boot = useRef(false);
  useEffect(() => {
    if (!o || boot.current) return;
    boot.current = true;
    const id = params.get("id");
    const invoice = params.get("invoice");
    void Promise.resolve().then(() => (id ? openDoc(id) : invoice ? loadInvoice(invoice, null) : undefined));
  }, [o, params, openDoc, loadInvoice]);

  const reset = () => { setDoc(null); setH(blankHead()); setInv(null); setInvText(""); setLines([]); setErr(null); };
  const pickInvoiceText = (text: string) => {
    setInvText(text);
    const m = invoices?.find((i) => i.docNo.toLowerCase() === text.trim().toLowerCase());
    if (m && m.id !== h.invoiceId) void loadInvoice(m.id, null);
  };
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addFreeLine = () => setLines((ls) => [...ls, {
    key: ++seq, invoiceLineId: "", itemId: "", batchId: "", rate: "", discountPct: "0", taxRate: "0", taxCodeId: "", sold: null, returnable: null, qty: "",
    reason: o?.lookups.returnReasons[0]?.code ?? "", disposition: "RESTOCK",
  }]);
  const pickProduct = (key: number, itemId: string) => {
    const p = o?.products.find((x) => x.id === itemId);
    setLine(key, { itemId, rate: p ? String(p.price) : "", taxRate: p ? String(p.gstRate) : "0", taxCodeId: p?.taxCodeId ?? "" });
  };

  const calc = useMemo(() => lines.map((l) => lineAmounts({ baseQty: num(l.qty), rate: num(l.rate), discountPct: num(l.discountPct), taxRate: num(l.taxRate) })), [lines]);
  const used = lines.map((l, i) => ({ l, a: calc[i]! })).filter((x) => num(x.l.qty) > 0 && !!x.l.itemId);
  const tot = docTotals(used.map((x) => x.a));
  const overQty = (l: Line) => l.returnable !== null && num(l.qty) > l.returnable;
  const badLines = lines.filter((l) => overQty(l) || !!fe(`lines.${l.key}.qty`)).length;
  const customer = o?.customers.find((c) => c.id === h.customerId);

  const save = async (post: boolean) => {
    if (!o) return;
    setBusy(post ? "post" : "save");
    setErr(null);
    const sent = used.map((x) => x.l);
    const body = {
      returnType: h.invoiceId ? "AGAINST_INVOICE" : "WITHOUT_INVOICE", docDate: h.docDate, customerId: h.customerId, invoiceId: h.invoiceId || null, warehouseId: h.warehouseId,
      remarks: h.remarks || null,
      lines: sent.map((l) => ({
        invoiceLineId: l.invoiceLineId || null, itemId: l.itemId, batchId: l.batchId || null, qty: num(l.qty), rate: num(l.rate), discountPct: num(l.discountPct),
        taxCodeId: l.taxCodeId || null, taxRate: num(l.taxRate), reason: l.reason, disposition: l.disposition,
      })),
      ...(doc && { rowVersion: doc.rowVersion }),
    };
    try {
      let saved = doc ? await updateReturn(doc.id, body) : await createReturn(body);
      let msg = `${saved.docNo} saved as draft`;
      if (post) {
        saved = await postReturn(saved.id, saved.rowVersion);
        msg = `${saved.docNo} posted · stock back in${saved.creditNote ? ` · credit note ${saved.creditNote.docNo}` : ""}`;
      }
      toast(msg, { tone: "good" });
      reloadList();
      await openDoc(saved.id);
    } catch (e) {
      if (e instanceof ApiError) {
        const fields: Record<string, string> = {};
        for (const [key, v] of Object.entries(e.details ?? {})) {
          const m = key.match(/^lines\.(\d+)\.(.+)$/);
          const at = m ? sent[Number(m[1])]?.key : undefined;
          fields[m && at !== undefined ? `lines.${at}.${m[2]}` : key] = v[0] ?? "";
        }
        setErr({ message: e.message, fields });
      } else setErr({ message: "Could not save the return", fields: {} });
    } finally {
      setBusy(null);
    }
  };

  if (loadErr) return <ErrorState message={loadErr.message} reference={loadErr.reference} onRetry={() => window.location.reload()} />;
  if (!o) return <Skeleton style={{ height: 520 }} />;

  const ready = editable && canWrite && !!h.customerId && !!h.warehouseId && used.length > 0 && !lines.some(overQty) && (h.returnType === "WITHOUT_INVOICE" || !!h.invoiceId);
  const listItems = list?.items ?? [];
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / PAGE));
  const pack = (itemId: string) => { const p = o.products.find((x) => x.id === itemId); return !p ? "—" : p.ctn > 1 ? `${p.ctn} × ${p.unit ?? "pcs"}` : p.unit ?? "Unit"; };

  return (
    <>
      <div className="sd-head">
        <span className="sd-head-ic"><Undo2 /></span>
        <div className="sd-head-t">
          <h1><span>Sales Return - {doc?.docNo ?? "New"}</span> <SrStatus status={doc?.status ?? "DRAFT"} /></h1>
          <p>{doc && doc.status !== "DRAFT" ? `${STATUS[doc.status]?.label ?? doc.status} ${dateLabel(doc.postedAt ?? doc.cancelledAt ?? doc.docDate)} · read only` : "Create a sales return against an invoice."}</p>
        </div>
        <div className="sd-head-btns">
          <button type="button" className="btn secondary" onClick={reset} disabled={!!busy}><X />{doc ? "Close" : "Cancel"}</button>
          {editable && <button type="button" className="btn secondary" disabled={!h.invoiceId || !!busy} onClick={() => h.invoiceId && loadInvoice(h.invoiceId, doc)}><FileInput />Apply From Invoice</button>}
          {editable && <button type="button" className="btn secondary" disabled={!lines.length || !!busy} onClick={() => setLines((ls) => (h.invoiceId ? ls.map((l) => ({ ...l, qty: "" })) : []))}><Eraser />Clear Rows</button>}
          {doc && <button type="button" className="btn secondary" onClick={() => setHistoryOpen(true)}><History />History</button>}
          {doc?.status === "DRAFT" && can.delete && <button type="button" className="btn secondary" disabled={!!busy} onClick={() => setAsk("delete")}><Trash2 />Delete</button>}
          {doc?.status === "POSTED" && can.post && <button type="button" className="btn secondary" disabled={!!busy} onClick={() => setAsk("cancel")}><Ban />Cancel Return</button>}
          {editable && canWrite && <button type="button" className="btn secondary" disabled={!ready || !!busy} onClick={() => save(false)}><Check /><span>{busy === "save" ? "Saving…" : "Save Return"}</span></button>}
          {editable && can.post && <button type="button" className="btn primary sd-progress-btn" disabled={!ready || !!busy} onClick={() => save(true)}><Check /><span>{busy === "post" ? "Posting…" : "Save & Post"}</span></button>}
        </div>
      </div>

      {err && <div className="mb"><Banner tone="danger" title="Not saved">{err.message}</Banner></div>}
      {doc?.creditNote && (
        <div className="mb"><Banner tone="info" title={`Credit note ${doc.creditNote.docNo}`}>
          {doc.creditNote.treatment === "APPLY_TO_INVOICE" ? "Applied to the invoice balance." : "Kept as customer credit."} <Link className="link" href={`/sales/credit-notes?id=${doc.creditNote.id}`}>Open the credit note</Link>
          {doc.journal && <> · journal <Link className="link" href={`/accounting/vouchers/${doc.journal.id}`}>{doc.journal.docNo}</Link></>}
        </Banner></div>
      )}

      <div className={cn("panel sd-card sd-sr-search", inv && "sd-loaded")}>
        <div className="sd-sr-sh">
          <span className="sd-card-ic soft"><FileSearch /></span>
          <div><b>Search Invoice</b><p>Load customer and items from a posted invoice{invoices?.[0] ? `. Try ${invoices[0].docNo}` : ""}.</p></div>
        </div>
        <label className="sd-sr-inv">
          <small>Invoice Number</small>
          <input className="cell-input" list="sd-sr-invlist" value={invText} autoComplete="off" disabled={!editable || h.returnType === "WITHOUT_INVOICE"} placeholder={invoices === null ? "Loading…" : "INV-…"} onChange={(e) => pickInvoiceText(e.target.value)} />
          {invText && editable && <button type="button" className="sd-x" aria-label="Clear" onClick={() => { setInvText(""); setInv(null); setLines([]); set({ invoiceId: "" }); }}><X /></button>}
        </label>
        <datalist id="sd-sr-invlist">{invoices?.map((i) => <option key={i.id} value={i.docNo}>{i.customer.name} · Rs {grp(i.netAmount, 0)}</option>)}</datalist>
        <div className="sd-sr-tile"><CalendarDays /><div><small>Invoice Date</small><b>{inv ? dateLabel(inv.invoice.docDate) : "—"}</b></div></div>
        <div className="sd-sr-tile"><UserRound /><div><small>Customer</small><b>{inv?.invoice.customer.name ?? "—"}</b></div></div>
        <div className="sd-sr-tile"><ReceiptText /><div><small>Invoice Balance</small><b>{inv ? `Rs ${grp(inv.invoice.balanceAmount)}` : "—"}</b></div></div>
        {h.invoiceId ? <Link className="btn secondary sd-sr-view" href={`/sales/invoices/${h.invoiceId}`}><span>View Invoice</span><ExternalLink /></Link> : <span className="btn secondary sd-sr-view" aria-disabled><span>View Invoice</span><ExternalLink /></span>}
      </div>

      <div className="sd-sr-cards">
        <div className="panel sd-card">
          <div className="sd-card-head"><span className="sd-card-ic soft"><ClipboardList /></span><div><h3>Return Information</h3><p className="sd-sub">Basic details for this sales return</p></div></div>
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="sd-form sd-two-eq">
              <label><span>Return Date</span><input type="date" value={h.docDate} onChange={(e) => set({ docDate: e.target.value })} /></label>
              <label><span>Return Type</span>
                <select value={h.returnType} onChange={(e) => { const t = e.target.value as Head["returnType"]; setInv(null); setInvText(""); setLines([]); set({ returnType: t, invoiceId: "" }); }}>
                  <option value="AGAINST_INVOICE">Against invoice</option><option value="WITHOUT_INVOICE">Without invoice</option>
                </select>
              </label>
              <label><span>Return #</span><input value={doc?.docNo ?? "Numbered on save"} readOnly /></label>
              <label><span>Invoice #</span><input value={inv?.invoice.docNo ?? doc?.invoice?.docNo ?? "—"} readOnly /></label>
              <label className="sd-span3 sd-remarks"><span>Remarks</span><textarea rows={2} maxLength={500} value={h.remarks} onChange={(e) => set({ remarks: e.target.value })} /><small>{h.remarks.length}/500</small></label>
            </div>
          </fieldset>
        </div>
        <div className="panel sd-card">
          <div className="sd-card-head"><span className="sd-card-ic soft"><UserRound /></span><h3>Customer Details</h3>{customer && <Link className="btn secondary sm sd-ml" href={`/customers/${customer.id}`}>View Customer<ExternalLink /></Link>}</div>
          <div className="sd-cust">
            <span className="sd-cust-av"><Store /></span>
            <div><b>{customer?.name ?? "—"}</b><p><MapPin /><span>{customer?.city ?? "—"}</span></p><p><Tag /><span>{customer ? `${customer.code} · ${customer.paymentTerms.replace(/_/g, " ")}` : "—"}</span></p></div>
          </div>
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="sd-form sd-two-eq sd-cust-team">
              <label><span><UserRound />Customer</span>
                <select value={h.customerId} disabled={h.returnType === "AGAINST_INVOICE"} onChange={(e) => set({ customerId: e.target.value })} style={fe("customerId") ? { borderColor: "var(--danger)" } : undefined}>
                  <option value="">Choose…</option>{o.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label><span><Warehouse />Return to warehouse</span>
                <select value={h.warehouseId} onChange={(e) => set({ warehouseId: e.target.value })} style={fe("warehouseId") ? { borderColor: "var(--danger)" } : undefined}>
                  <option value="">Choose…</option>{o.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
            </div>
          </fieldset>
          {(fe("customerId") || fe("warehouseId") || fe("invoiceId")) && <small style={{ color: "var(--danger)" }}>{fe("invoiceId") ?? fe("customerId") ?? fe("warehouseId")}</small>}
        </div>
        <div className="panel sd-card">
          <div className="sd-card-head"><span className="sd-card-ic soft"><ChartPie /></span><h3>Summary</h3></div>
          <div className="sd-sr-mini">
            <div><Box /><b>{new Set(used.map((x) => x.l.itemId)).size}</b><small>Total Items</small></div>
            <div><Layers /><b>{qtyf(used.reduce((s, x) => s + num(x.l.qty), 0))}</b><small>Total Quantity</small></div>
            <div><Tag /><b>Rs {grp(tot.discountAmount, 0)}</b><small>Total Discount</small></div>
          </div>
          <div className="sd-sr-total"><span><Coins /></span><div><b>Total Amount</b><small>Net return amount (incl. GST)</small></div><strong>Rs {grp(tot.totalAmount, 0)}<span className="dec">.{grp(tot.totalAmount).split(".")[1]}</span></strong></div>
        </div>
      </div>

      <div className="panel sd-card sd-items">
        <div className="sd-card-head"><span className="sd-card-ic soft"><Package /></span><div><h3>Return Items</h3><p className="sd-sub">Select items to return{h.invoiceId ? " from the invoice" : ""}. Quantity cannot exceed the quantity sold.</p></div>
          <div className="sd-tools">
            {badLines > 0 && <span className="pill" id="sd-sr-errs"><CircleAlert /><b>{badLines}</b> line{badLines === 1 ? "" : "s"} need{badLines === 1 ? "s" : ""} attention</span>}
            {editable && h.returnType === "WITHOUT_INVOICE" && <Button size="sm" icon={<Plus />} onClick={addFreeLine}>Add item</Button>}
          </div>
        </div>
        <div className="table-wrap sd-grid-wrap">
          <table className="tbl lines sd-grid sd-srgrid" data-plain>
            <thead><tr>
              <th className="sd-c-idx">#</th><th>Product Name</th><th>Pack</th><th>Batch</th><th className="num">Rate</th><th className="num">Sold</th><th className="num">Return Qty</th>
              <th className="num">% Disc</th><th className="num">Discount</th><th className="num">Amount</th><th>Reason</th><th>Disposition</th><th />
            </tr></thead>
            <tbody>
              {!lines.length ? (
                <tr className="sd-empty-row"><td colSpan={13}><div className="empty-state"><FileSearch /><b>{busy === "invoice" ? "Loading the invoice…" : h.returnType === "WITHOUT_INVOICE" ? "No items yet" : "Search an invoice"}</b><p>{h.returnType === "WITHOUT_INVOICE" ? "Add the returned items with “Add item”." : "Its items load here; enter the quantity coming back."}</p></div></td></tr>
              ) : lines.map((l, i) => {
                const a = calc[i]!;
                const p = o.products.find((x) => x.id === l.itemId);
                const over = overQty(l);
                const qErr = fe(`lines.${l.key}.qty`) ?? (over ? `Max ${qtyf(l.returnable ?? 0)}` : undefined);
                return (
                  <tr key={l.key} className={cn(qErr && "sd-has-err")}>
                    <td className="sd-c-idx">{i + 1}</td>
                    <td>
                      {l.invoiceLineId || !editable ? <><span className="sd-pn">{p?.name ?? "—"}</span><small>{p?.sku}</small></> : (
                        <select className="cell-input" value={l.itemId} onChange={(e) => pickProduct(l.key, e.target.value)}><option value="">Choose a product…</option>{o.products.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</select>
                      )}
                      {fe(`lines.${l.key}.itemId`) && <small style={{ color: "var(--danger)" }}>{fe(`lines.${l.key}.itemId`)}</small>}
                    </td>
                    <td><span className="sd-pack">{pack(l.itemId)}</span></td>
                    <td>{l.batchId ? <small>batch on invoice</small> : "—"}</td>
                    <td className="num">{l.invoiceLineId || !editable ? grp(num(l.rate)) : <input className="cell-input num" inputMode="decimal" style={{ width: 84 }} value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} />}</td>
                    <td className="num sd-sold">{l.sold !== null ? qtyf(l.sold) : "—"}{l.returnable !== null && l.sold !== null && l.returnable < l.sold ? <small>{qtyf(l.returnable)} left</small> : null}</td>
                    <td>
                      <input className="cell-input num" data-f="qty" inputMode="decimal" value={l.qty} placeholder="0" disabled={!editable} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                      {qErr && <small className="sd-errmsg">{qErr}</small>}
                    </td>
                    <td className="num">{grp(num(l.discountPct), 1)}</td>
                    <td className="num">{grp(a.discountAmount)}</td>
                    <td className="num sd-strong">{grp(a.totalAmount)}</td>
                    <td>
                      <select className="cell-input" data-f="reason" value={l.reason} disabled={!editable} onChange={(e) => setLine(l.key, { reason: e.target.value })}>
                        {o.lookups.returnReasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <span className="sd-dispo">
                        {DISPO.map((d) => <button key={d.code} type="button" data-d={d.d} title={d.label} aria-label={d.label} className={cn(l.disposition === d.code && "on")} disabled={!editable} onClick={() => setLine(l.key, { disposition: d.code })}>{d.icon}</button>)}
                      </span>
                    </td>
                    <td className="sd-c-del">{editable && <button type="button" className="sd-del" aria-label="Remove row" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={6} className="right">Total Quantity</td><td className="num">{qtyf(used.reduce((s, x) => s + num(x.l.qty), 0))}</td><td className="right">Discount</td><td className="num">{grp(tot.discountAmount)}</td><td className="num">{grp(tot.totalAmount)}</td><td colSpan={3} /></tr></tfoot>
          </table>
        </div>
      </div>

      <div className="panel flush sd-card">
        <div className="panel-head">
          <div className="sd-card-head sd-nomb"><span className="sd-card-ic soft"><History /></span><div><h3>Previous Sales Returns</h3><p className="sd-sub">View and manage all sales return documents{list ? ` · ${list.kpis.returnedMtdCount} posted this month (Rs ${grp(list.kpis.returnedMtd, 0)})` : ""}</p></div></div>
          <div className="panel-actions">
            <label className="search-field"><Search /><input placeholder="Search return #, remarks…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
            <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All Status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label} ({list?.counts[k] ?? 0})</option>)}
            </select>
          </div>
        </div>
        {listErr && !list ? <ErrorState message={listErr} onRetry={reloadList} /> : !list ? <Skeleton style={{ height: 220 }} /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>#</th><th>Return #</th><th>Invoice #</th><th>Date</th><th>Customer</th><th>Warehouse</th><th>Credit Note</th><th className="num">Items</th><th className="num">Amount (Rs)</th><th>Status</th><th /></tr></thead>
              <tbody>
                {!listItems.length ? (
                  <tr><td colSpan={11} className="muted" style={{ textAlign: "center", padding: 24 }}>{search || status ? "No returns match." : "No sales returns yet."}</td></tr>
                ) : listItems.map((r, i) => (
                  <tr key={r.id} className={cn(doc?.id === r.id && "selected")}>
                    <td>{(page - 1) * PAGE + i + 1}</td>
                    <td><a className="link" href={`/sales/returns?id=${r.id}`} onClick={(e) => { e.preventDefault(); void openDoc(r.id); }}><Hl text={r.docNo} q={search} /></a></td>
                    <td>{r.invoice ? <Link className="link" href={`/sales/invoices/${r.invoice.id}`}>{r.invoice.docNo}</Link> : "—"}</td>
                    <td>{dateLabel(r.docDate)}</td>
                    <td>{r.customer.name}</td>
                    <td>{r.warehouse.name}</td>
                    <td>{r.creditNote ? <Link className="link" href={`/sales/credit-notes?id=${r.creditNote.id}`}>{r.creditNote.docNo}</Link> : "—"}</td>
                    <td className="num">{r.totalItems}</td>
                    <td className="num">{grp(r.totalAmount)}</td>
                    <td><SrStatus status={r.status} /></td>
                    <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Open ${r.docNo}`} onClick={() => void openDoc(r.id)}><ExternalLink /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list && list.total > PAGE && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + listItems.length} of {list.total}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((x) => <button key={x} type="button" className={cn(x === page && "active")} onClick={() => setPage(x)}>{x}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {doc && ask === "cancel" && <CancelModal doc={doc} onClose={() => setAsk(null)} onDone={async (label) => { setAsk(null); toast(label, { tone: "good" }); reloadList(); await openDoc(doc.id); }} />}
      <ConfirmDialog open={ask === "delete" && !!doc} onClose={() => setAsk(null)} danger busy={!!busy} title={`Delete ${doc?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={async () => {
          if (!doc) return;
          try { await deleteReturn(doc.id, doc.rowVersion); toast(`${doc.docNo} deleted`, { tone: "good" }); setAsk(null); reset(); reloadList(); } catch (e) { toast(errMsg(e, "Could not delete"), { tone: "danger" }); }
        }}>
        The draft and its lines are removed. Its number is not reused.
      </ConfirmDialog>
      <Drawer open={historyOpen && !!doc} onClose={() => setHistoryOpen(false)} wide title={doc ? `${doc.docNo} · history` : "History"}>
        {doc && <HistoryTab schema="Sales" table="SalesReturns" id={doc.id} />}
      </Drawer>
    </>
  );
}

function CancelModal({ doc, onClose, onDone }: { doc: SalesReturn; onClose: () => void; onDone: (label: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { const d = await cancelReturn(doc.id, doc.rowVersion, reason.trim()); onDone(`${d.docNo} cancelled`); } catch (e) { setErr(errMsg(e, "That didn’t work")); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Cancel ${doc.docNo}`} subtitle="Stock movements, the journal and its credit note are reversed." foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn danger" onClick={go} disabled={busy || reason.trim().length < 3}>{busy ? "Working…" : "Cancel return"}</button></>
    }>
      <FormGrid cols={1}><Field label="Reason" required error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this return cancelled?" /></Field></FormGrid>
    </Modal>
  );
}
