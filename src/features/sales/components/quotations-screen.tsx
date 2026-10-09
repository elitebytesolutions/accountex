"use client";

import { ArrowRight, Ban, CircleCheck, CircleX, Clock, Copy, Download, Eye, FilePen, Filter, MoreHorizontal, Pencil, Plus, Repeat, Search, Send, Trash2, Trophy, User, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { baseQtyOf, docTotals, lineAmounts, type PriceMap, type Quotation, type QuotationList, type SalesDocOptions, type SalesLine } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  cancelQuotation, convertQuotation, createQuotation, deleteQuotation, getQuotation, listQuotations, priceListPrices, quotationAction, rejectQuotation,
  reviseQuotation, salesDocOptions, updateQuotation,
} from "../api";

// ================================================================ shared helpers (also used by the sales orders screen)
export const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
export const fmtQty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
export const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
export const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
export const fieldErrors = (e: unknown, fallback: string) =>
  e instanceof ApiError ? { message: e.message, fields: Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]) => [k, v[0] ?? ""])) } : { message: fallback, fields: {} as Record<string, string> };
export const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDay(d);
};
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000);

/** One editable line of a quotation / order: quantity is entered in loose units. */
export type EditLine = { key: string; id: string | null; itemId: string; qtyLoose: string; bonusQty: string; rate: string; discountPct: string; taxCodeId: string; taxRate: string };
let seq = 0;
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
export const editLines = (lines: SalesLine[] | undefined): EditLine[] => (lines ?? []).map((l) => ({
  key: l.id, id: l.id, itemId: l.item?.id ?? "", qtyLoose: String(l.baseQty), bonusQty: l.bonusQty ? String(l.bonusQty) : "", rate: String(l.rate),
  discountPct: l.discountPct ? String(l.discountPct) : "", taxCodeId: l.taxCode?.id ?? "", taxRate: l.taxRate ? String(l.taxRate) : "",
}));
export const linesPayload = (lines: EditLine[]) => lines.map((l) => ({
  id: l.id, itemId: l.itemId || null, qtyCtn: 0, qtyLoose: num(l.qtyLoose), bonusQty: num(l.bonusQty), rate: num(l.rate), discountPct: num(l.discountPct),
  taxCodeId: l.taxCodeId || null, taxRate: num(l.taxRate),
}));
export const linesCalc = (lines: EditLine[]) => lines.map((l) => lineAmounts({ baseQty: baseQtyOf(0, num(l.qtyLoose), 1), rate: num(l.rate), discountPct: num(l.discountPct), taxRate: num(l.taxRate) }));

/** The price list a document prices from: its own, else the customer's, else the default list. */
export const effectiveList = (o: SalesDocOptions, priceListId: string, customerId: string) =>
  priceListId || o.customers.find((c) => c.id === customerId)?.priceListId || o.priceLists.find((p) => p.isDefault)?.id || "";

/** Template line grid (`table.tbl.lines`) with the "Add item…" row; rates default from the price list. */
export function SalesLinesGrid({ o, lines, setLines, listId, fe, bonus, discount }: {
  o: SalesDocOptions; lines: EditLine[]; setLines: Dispatch<SetStateAction<EditLine[]>>; listId: string; fe: (k: string) => string | undefined; bonus?: boolean; discount?: boolean;
}) {
  const cache = useRef(new Map<string, Promise<PriceMap>>());
  const priceOf = async (itemId: string) => {
    const p = o.products.find((x) => x.id === itemId);
    if (!listId) return p?.price ?? 0;
    let m = cache.current.get(listId);
    if (!m) { m = priceListPrices(listId).catch(() => ({} as PriceMap)); cache.current.set(listId, m); }
    return (await m)[itemId] ?? p?.price ?? 0;
  };
  const productLine = async (itemId: string): Promise<Partial<EditLine>> => {
    const p = o.products.find((x) => x.id === itemId);
    const tc = p?.taxCodeId ? o.taxCodes.find((x) => x.id === p.taxCodeId) : null;
    return { itemId, rate: p ? String(await priceOf(itemId)) : "", taxCodeId: tc?.id ?? "", taxRate: p ? String(tc?.rate ?? p.gstRate) : "" };
  };
  const setLine = (key: string, patch: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = async (key: string, itemId: string) => setLine(key, itemId ? await productLine(itemId) : { itemId: "" });
  const add = async (itemId: string) => {
    if (!itemId) return;
    const key = `n${++seq}`;
    setLines((ls) => [...ls, { key, id: null, itemId, qtyLoose: "1", bonusQty: "", rate: "", discountPct: "", taxCodeId: "", taxRate: "" }]);
    setLine(key, await productLine(itemId));
  };
  const pickTax = (key: string, id: string) => setLine(key, { taxCodeId: id, taxRate: id ? String(o.taxCodes.find((x) => x.id === id)?.rate ?? 0) : "0" });
  const calc = linesCalc(lines);
  const cols = 6 + (bonus ? 1 : 0) + (discount ? 1 : 0);

  return (
    <div className="table-wrap mt"><table className="tbl lines">
      <thead><tr><th style={{ minWidth: 240 }}>Item</th><th className="num">Qty</th>{bonus && <th className="num">Bonus</th>}<th className="num">Rate</th>{discount && <th className="num">Disc %</th>}<th>Tax</th><th className="num">Amount</th><th /></tr></thead>
      <tbody>
        {lines.map((l, i) => {
          const p = o.products.find((x) => x.id === l.itemId);
          const bad = (f: string) => (fe(`lines.${i}.${f}`) ? { borderColor: "var(--danger)" } : undefined);
          const msg = fe(`lines.${i}.itemId`) ?? fe(`lines.${i}.qtyLoose`) ?? fe(`lines.${i}.rate`) ?? fe(`lines.${i}.taxCodeId`);
          return (
            <tr key={l.key}>
              <td>
                <select className="cell-input" style={bad("itemId")} value={l.itemId} onChange={(e) => pick(l.key, e.target.value)} aria-label={`Line ${i + 1} item`}>
                  <option value="">Choose product…</option>
                  {o.products.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}
                </select>
                {msg ? <small style={{ color: "var(--danger)" }}>{msg}</small> : p && <small className="muted">{p.unit ?? "units"}{p.ctn > 1 ? ` · ${p.ctn} per carton` : ""}</small>}
              </td>
              <td><input className="cell-input num" inputMode="decimal" style={{ width: 80, ...bad("qtyLoose") }} value={l.qtyLoose} onChange={(e) => setLine(l.key, { qtyLoose: e.target.value })} aria-label={`Line ${i + 1} quantity`} /></td>
              {bonus && <td><input className="cell-input num" inputMode="decimal" style={{ width: 64, ...bad("bonusQty") }} value={l.bonusQty} onChange={(e) => setLine(l.key, { bonusQty: e.target.value })} aria-label={`Line ${i + 1} bonus`} /></td>}
              <td><input className="cell-input num" inputMode="decimal" style={{ width: 110, ...bad("rate") }} value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} aria-label={`Line ${i + 1} rate`} /></td>
              {discount && <td><input className="cell-input num" inputMode="decimal" style={{ width: 60, ...bad("discountPct") }} value={l.discountPct} onChange={(e) => setLine(l.key, { discountPct: e.target.value })} aria-label={`Line ${i + 1} discount`} /></td>}
              <td>
                <select className="cell-input" style={bad("taxCodeId")} value={l.taxCodeId} onChange={(e) => pickTax(l.key, e.target.value)} aria-label={`Line ${i + 1} tax`}>
                  <option value="">No tax</option>{o.taxCodes.map((x) => <option key={x.id} value={x.id}>{x.name}{x.rate !== null ? ` ${x.rate}%` : ""}</option>)}
                </select>
              </td>
              <td className="num">{calc[i]!.netAmount ? amt(calc[i]!.netAmount) : "—"}</td>
              <td><button type="button" className="icon-btn-sm" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></button></td>
            </tr>
          );
        })}
        <tr>
          <td>
            <select className="cell-input" value="" onChange={(e) => add(e.target.value)} aria-label="Add item" style={fe("lines") ? { borderColor: "var(--danger)" } : undefined}>
              <option value="">Add item…</option>
              {o.products.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}
            </select>
            {fe("lines") && <small style={{ color: "var(--danger)" }}>{fe("lines")}</small>}
          </td>
          <td colSpan={cols - 3} /><td className="num zero">—</td><td />
        </tr>
      </tbody>
    </table></div>
  );
}

/** Template `.dl` totals under the line grid. */
export function DocTotalsBlock({ lines, label = "Total" }: { lines: EditLine[]; label?: string }) {
  const t = docTotals(linesCalc(lines));
  return (
    <div className="dl mt">
      <div><span>Subtotal</span><b>{rs(t.grossAmount)}</b></div>
      {t.discountAmount > 0 && <div><span>Discount</span><b>− {rs(t.discountAmount)}</b></div>}
      <div><span>GST</span><b>{rs(t.taxAmount)}</b></div>
      <div><span>{label}</span><b>Rs {amt(t.totalAmount)}</b></div>
    </div>
  );
}

/** Read-only lines of a saved document (drawer details). */
export function LinesTable({ lines, net, tax, extra }: { lines: SalesLine[]; net: number; tax: number; extra?: { head: string[]; cells: (l: SalesLine) => (string | number)[] } }) {
  const span = 4 + (extra?.head.length ?? 0);
  return (
    <div className="table-wrap mt"><table className="tbl">
      <thead><tr><th>Item</th><th className="num">{extra ? "Ordered" : "Qty"}</th>{extra?.head.map((h) => <th key={h} className="num">{h}</th>)}<th className="num">Rate</th><th>Tax</th><th className="num">Amount</th></tr></thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id}>
            <td><b>{l.item ? l.item.name : l.description}</b><small>{l.item?.sku ?? ""}{l.discountPct ? ` · ${l.discountPct}% off` : ""}</small></td>
            <td className="num">{fmtQty(l.baseQty)}{l.bonusQty ? <small>+{fmtQty(l.bonusQty)} bonus</small> : null}</td>
            {extra?.cells(l).map((c, i) => <td key={i} className="num">{c}</td>)}
            <td className="num">{amt(l.rate)}</td>
            <td>{l.taxCode ? `${l.taxCode.code} ${l.taxRate}%` : "—"}</td>
            <td className="num">{amt(l.taxableAmount)}</td>
          </tr>
        ))}
        <tr className="total"><td colSpan={span}>GST {amt(tax)}</td><td className="num">{amt(net)}</td></tr>
      </tbody>
    </table></div>
  );
}

/** Reason prompt for reject / cancel / close; `optional` allows an empty reason. */
export function ReasonModal({ open, title, subtitle, label, confirm, optional, onClose, run }: {
  open: boolean; title: string; subtitle?: string; label: string; confirm: string; optional?: boolean; onClose: () => void; run: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { await run(reason.trim()); } catch (e) { setErr(errMsg(e, "That didn’t work")); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn danger" onClick={go} disabled={busy || (!optional && reason.trim().length < 3)}>{busy ? "Working…" : confirm}</button></>
    }>
      <FormGrid cols={1}>
        <Field label="Reason" required={!optional} error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={label} /></Field>
      </FormGrid>
    </Modal>
  );
}

// ================================================================ quotations
type Can = { create: boolean; edit: boolean; delete: boolean };
type Row = QuotationList["items"][number];
const PAGE = 10;
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, SENT: { label: "Sent", tone: "info" }, ACCEPTED: { label: "Accepted", tone: "good" }, CONVERTED: { label: "Converted", tone: "good" },
  REJECTED: { label: "Rejected", tone: "danger" }, CANCELLED: { label: "Cancelled", tone: "danger" }, EXPIRED: { label: "Expired", tone: "danger" },
};
const CHIPS = [
  { label: "All", status: "" }, { label: "Draft", status: "DRAFT" }, { label: "Sent", status: "SENT" }, { label: "Accepted", status: "ACCEPTED" }, { label: "Expired", status: "EXPIRED" },
];
const chipCount = (c: Record<string, number>, s: string) => (s ? c[s] ?? 0 : Object.entries(c).filter(([k]) => k !== "CONVERTED").reduce((t, [, n]) => t + n, 0));

function QtStatus({ q, today }: { q: Row; today: string }) {
  const s = STATUS[q.status] ?? { label: q.status, tone: "neutral" as Tone };
  const left = q.status === "SENT" ? daysBetween(today, q.validTill) : null;
  return (
    <>
      <Badge tone={s.tone} dot>{s.label}</Badge>
      {q.order ? <small className="muted">{q.order.docNo}</small>
        : left !== null && left <= 3 && <small style={{ color: "var(--warn)" }}>{left <= 0 ? "Expires today" : `Expires in ${left} day${left === 1 ? "" : "s"}`}</small>}
    </>
  );
}

type Ask = { kind: "reject" | "cancel"; q: Row } | null;

/** Template app/sales/quotations (41-acc-trade.html): KPIs, filters, quotations table, New Quotation and Convert modals, detail drawer. */
export function QuotationsScreen({ can, userId }: { can: Can; userId: string }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [rep, setRep] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QuotationList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<SalesDocOptions | null>(null);
  const [optErr, setOptErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => params.get("qt"));
  const [editor, setEditor] = useState<{ q: Quotation | null } | null>(null);
  const [convert, setConvert] = useState<Row | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [rev, setRev] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const today = isoDay(new Date());

  useEffect(() => {
    salesDocOptions().then(setOptions).catch((e: unknown) => setOptErr(errMsg(e, "Could not load customers and products")));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listQuotations({ status, search, customer, salesRep: rep, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); setSelected(new Set()); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load quotations" }));
    return () => { cancelled = true; };
  }, [status, search, customer, rep, page, attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const k = data?.kpis;
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const all = data ? chipCount(data.counts, "") : 0;
  const filtered = !!(status || search || customer || rep);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exportCsv = () => {
    const rows = selected.size ? items.filter((x) => selected.has(x.id)) : items;
    downloadCsv(`quotations-${today}.csv`, [
      ["Quotation #", "Subject", "Customer", "City", "Date", "Valid till", "Sales rep", "Amount", "Status", "Sales order"],
      ...rows.map((x) => [x.docNo, x.subject ?? "", x.customer.name, x.customer.city ?? "", x.docDate, x.validTill, x.salesRep?.name ?? "", x.netAmount, STATUS[x.status]?.label ?? x.status, x.order?.docNo ?? ""]),
    ]);
  };
  const openEdit = async (id: string) => {
    try { setEditor({ q: await getQuotation(id) }); } catch (e) { toast(errMsg(e, "Could not load the quotation"), { tone: "danger" }); }
  };
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast(label, { tone: "good" }); setRev((n) => n + 1); reload(); } catch (e) { toast(errMsg(e, "That didn’t work"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const revise = async (x: { id: string; docNo: string }) => {
    setBusy(true);
    try {
      const r = await reviseQuotation(x.id);
      toast(`${x.docNo} revised as ${r.docNo}`, { tone: "good" });
      reload();
      setOpenId(null);
      setEditor({ q: r });
    } catch (e) { toast(errMsg(e, "Could not revise the quotation"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const remindHref = (x: Row) => {
    const email = options?.customers.find((c) => c.id === x.customer.id)?.email;
    return email ? `mailto:${email}?subject=${encodeURIComponent(`Reminder: quotation ${x.docNo} valid till ${dateLabel(x.validTill)}`)}` : null;
  };
  const draftMenu = (x: Row): MenuItem[] => [
    { label: "Open", icon: <Eye />, onClick: () => setOpenId(x.id) },
    ...(can.edit ? [{ label: "Send to customer", icon: <Send />, onClick: () => act(`${x.docNo} sent`, () => quotationAction(x.id, "send", x.rowVersion)) }] : []),
    ...(can.edit ? [{ label: "Cancel quotation", icon: <Ban />, onClick: () => setAsk({ kind: "cancel", q: x }) }] : []),
    ...(can.delete ? [{ sep: true } as const, { label: "Delete draft", icon: <Trash2 />, danger: true, onClick: () => setDel(x) }] : []),
  ];
  const filterMenu = (anchor: HTMLElement) => setMenu({
    anchor, items: [
      { label: rep === userId ? "Assigned to me ✓" : "Assigned to me", icon: <User />, onClick: () => { setRep(rep === userId ? "" : userId); setPage(1); } },
      { label: "Rejected", icon: <CircleX />, onClick: () => { setStatus("REJECTED"); setPage(1); } },
      { label: "Cancelled", icon: <Ban />, onClick: () => { setStatus("CANCELLED"); setPage(1); } },
      { label: "Converted to orders", icon: <CircleCheck />, onClick: () => { setStatus("CONVERTED"); setPage(1); } },
      { sep: true },
      { label: "Clear filters", icon: <X />, onClick: () => { setStatus(""); setCustomer(""); setRep(""); setQ(""); setPage(1); } },
    ],
  });
  const extraFilter = (status && !CHIPS.some((c) => c.status === status)) || (rep && rep === userId);

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Sales / Quotations"
        title="Quotations"
        description="Price offers sent to customers. Accepted quotations convert to sales orders in one click."
        actions={
          <>
            <Button icon={<Download />} onClick={exportCsv} disabled={!items.length}>{selected.size ? `Export (${selected.size})` : "Export"}</Button>
            {can.create && <Button variant="primary" icon={<Plus />} disabled={!options} onClick={() => setEditor({ q: null })}>New Quotation</Button>}
          </>
        }
      />
      {optErr && <Banner tone="warn" title="Some lists didn’t load">{optErr} — creating and converting quotations is unavailable until you reload.</Banner>}

      <div className="kpi-grid mb">
        <div className="kpi blue"><div className="kpi-top"><span>Open Quotations</span><span className="icon-well"><FilePen /></span></div><strong>{k ? rs(k.openAmount) : "—"}</strong><small>{k ? `${k.open} quote${k.open === 1 ? "" : "s"} awaiting response` : " "}</small></div>
        <div className="kpi"><div className="kpi-top"><span>Win Rate</span><span className="icon-well"><Trophy /></span></div><strong>{k ? (k.winRate === null ? "—" : `${k.winRate}%`) : "—"}</strong><small>Accepted of decided quotations</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Converted This Month</span><span className="icon-well"><Repeat /></span></div><strong>{k ? rs(k.convertedMonthAmount) : "—"}</strong><small className="up">{k ? `${k.convertedMonth} quotation${k.convertedMonth === 1 ? "" : "s"} → orders` : " "}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Expiring in 7 Days</span><span className="icon-well"><Clock /></span></div><strong>{k?.expiringSoon ?? "—"}</strong><small className={cn(!!k?.expiringSoon && "down")}>{k ? `${rs(k.expiringAmount)} at risk` : " "}</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>All quotations</h3><p>{data ? `${all} quotation${all === 1 ? "" : "s"}` : "Loading…"}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search quote #, customer…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <select value={customer} onChange={(e) => { setCustomer(e.target.value); setPage(1); }} aria-label="Customer">
            <option value="">All customers</option>
            {options?.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={rep} onChange={(e) => { setRep(e.target.value); setPage(1); }} aria-label="Sales rep">
            <option value="">All sales reps</option>
            {options?.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <div className="chips">
            {CHIPS.map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); }}>{c.label} <i>{data ? chipCount(data.counts, c.status) : 0}</i></button>)}
          </div>
          <span className="spacer" />
          <Button size="sm" icon={<Filter />} className={cn(extraFilter && "active")} onClick={(e) => filterMenu(e.currentTarget)}>{extraFilter ? `Filters · ${STATUS[status]?.label ?? "Mine"}` : "Filters"}</Button>
        </div>
        {!data ? <Skeleton style={{ height: 420 }} /> : !items.length ? (
          <EmptyState icon={<FilePen />} title={filtered ? "No quotations match" : "No quotations yet"} description={filtered ? "Try another status, customer, sales rep or search." : "Send a customer a price offer; once accepted it converts to a sales order."}
            action={!filtered && can.create && options ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ q: null })}>New Quotation</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all" checked={items.every((x) => selected.has(x.id))} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((x) => x.id)) : new Set())} /></th>
              <th>Quotation #</th><th>Customer</th><th>Date</th><th>Valid Till</th><th>Sales Rep</th><th className="num">Amount (Rs)</th><th>Status</th><th />
            </tr></thead>
            <tbody>
              {items.map((x) => {
                const remind = x.status === "SENT" && daysBetween(today, x.validTill) <= 2 ? remindHref(x) : null;
                return (
                  <tr key={x.id}>
                    <td><input type="checkbox" aria-label={`Select ${x.docNo}`} checked={selected.has(x.id)} onChange={() => toggle(x.id)} /></td>
                    <td><a className="link" href={`/sales/quotations?qt=${x.id}`} onClick={(e) => { e.preventDefault(); setOpenId(x.id); }}><Hl text={x.docNo} q={search} /></a><small>{x.subject ? <Hl text={x.subject} q={search} /> : x.revisionOf ? `Revision of ${x.revisionOf.docNo}` : "—"}</small></td>
                    <td><div className="cell-user"><span className="avatar sm">{initials(x.customer.name)}</span><div><b><Hl text={x.customer.name} q={search} /></b><small>{x.customer.city ?? x.customer.code}</small></div></div></td>
                    <td>{dateLabel(x.docDate)}</td>
                    <td>{dateLabel(x.validTill)}</td>
                    <td>{x.salesRep?.name ?? "—"}</td>
                    <td className="num">{amt(x.netAmount)}</td>
                    <td><QtStatus q={x} today={today} /></td>
                    <td className="actions">
                      {x.status === "DRAFT" ? (
                        <>
                          {can.edit && <button type="button" className="icon-btn-sm" aria-label={`Edit ${x.docNo}`} disabled={!options} onClick={() => openEdit(x.id)}><Pencil /></button>}
                          <button type="button" className="icon-btn-sm" aria-label={`More actions for ${x.docNo}`} disabled={busy} onClick={(e) => setMenu({ anchor: e.currentTarget, items: draftMenu(x) })}><MoreHorizontal /></button>
                        </>
                      ) : x.order ? (
                        <ButtonLink size="sm" variant="ghost" icon={<ArrowRight />} href={`/sales/orders?so=${x.order.id}`}>View SO</ButtonLink>
                      ) : remind ? (
                        <a className="btn secondary sm" href={remind}><Send />Remind</a>
                      ) : x.status === "SENT" && can.create ? (
                        <Button size="sm" icon={<Repeat />} disabled={!options} onClick={() => setConvert(x)}>Convert</Button>
                      ) : x.status === "ACCEPTED" && can.create ? (
                        <Button size="sm" variant="primary" icon={<Repeat />} disabled={!options} onClick={() => setConvert(x)}>Convert to SO</Button>
                      ) : ["EXPIRED", "REJECTED", "CANCELLED"].includes(x.status) && can.create ? (
                        <Button size="sm" variant="ghost" icon={<Copy />} disabled={busy || !options} onClick={() => revise(x)}>Revise</Button>
                      ) : (
                        <button type="button" className="icon-btn-sm" aria-label={`Open ${x.docNo}`} onClick={() => setOpenId(x.id)}><Eye /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        {data && data.total > 0 && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + items.length} of {data.total}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => Math.min(Math.max(1, page - 2), Math.max(1, pages - 4)) + i).map((x) => <button key={x} type="button" className={cn(x === page && "active")} onClick={() => setPage(x)}>{x}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}
      <QuotationDrawer key={`${openId ?? "none"}-${rev}`} id={openId} can={can} options={options} onClose={() => setOpenId(null)} onEdit={(x) => { setOpenId(null); setEditor({ q: x }); }}
        onConvert={(x) => setConvert(x)} onRevise={revise} onAsk={(a) => setAsk(a)} onDelete={(x) => setDel(x)} onChanged={reload} />
      {editor && options && (
        <QuotationEditor q={editor.q} options={options} canSend={can.edit} onClose={() => setEditor(null)} onSaved={(x, msg) => { setEditor(null); toast(msg, { tone: "good" }); setOpenId(x.id); reload(); }} />
      )}
      {convert && options && (
        <ConvertModal row={convert} options={options} onClose={() => setConvert(null)} onDone={(docNo, soNo, soId) => {
          setConvert(null);
          setOpenId(null);
          toast(`${soNo ?? "Sales order"} created from ${docNo}`, { tone: "good", ms: 8000, action: { label: "View SO", onClick: () => router.push(`/sales/orders?so=${soId}`) } });
          reload();
        }} />
      )}
      <ReasonModal key={ask ? `${ask.kind}-${ask.q.id}` : "none"} open={!!ask} title={ask?.kind === "reject" ? `Reject ${ask.q.docNo}` : `Cancel ${ask?.q.docNo ?? ""}`}
        subtitle={ask?.kind === "reject" ? "Record that the customer declined this offer." : "The quotation is withdrawn and can no longer be converted."}
        label={ask?.kind === "reject" ? "Why did the customer decline?" : "Why is this quotation cancelled?"} confirm={ask?.kind === "reject" ? "Reject" : "Cancel quotation"}
        onClose={() => setAsk(null)}
        run={async (reason) => {
          if (!ask) return;
          const r = ask.kind === "reject" ? await rejectQuotation(ask.q.id, ask.q.rowVersion, reason) : await cancelQuotation(ask.q.id, ask.q.rowVersion, reason);
          setAsk(null);
          setRev((n) => n + 1);
          toast(`${r.docNo} ${ask.kind === "reject" ? "rejected" : "cancelled"}`, { tone: "good" });
          setAttempt((n) => n + 1);
        }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger busy={busy} title={`Delete ${del?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => del && act(`${del.docNo} deleted`, async () => { await deleteQuotation(del.id, del.rowVersion); setDel(null); setOpenId(null); })}>
        The draft and its lines are removed. Its number is not reused.
      </ConfirmDialog>
    </>
  );
}

// ---------------------------------------------------------------- editor
type Head = { customerId: string; docDate: string; validTill: string; subject: string; salesRepUserId: string; branchId: string; priceListId: string; remarks: string; terms: string };

function QuotationEditor({ q, options: o, canSend, onClose, onSaved }: { q: Quotation | null; options: SalesDocOptions; canSend: boolean; onClose: () => void; onSaved: (q: Quotation, msg: string) => void }) {
  const [h, setH] = useState<Head>(() => {
    const d = isoDay(new Date());
    return {
      customerId: q?.customer.id ?? "", docDate: q?.docDate ?? d, validTill: q?.validTill ?? plusDays(d, 30), subject: q?.subject ?? "", salesRepUserId: q?.salesRep?.id ?? "",
      branchId: q?.branch?.id ?? "", priceListId: q?.priceList?.id ?? "", remarks: q?.remarks ?? "", terms: q?.terms ?? "",
    };
  });
  const [lines, setLines] = useState<EditLine[]>(() => editLines(q?.lines));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const set = (patch: Partial<Head>) => setH((x) => ({ ...x, ...patch }));
  const fe = (k: string) => err?.fields[k];
  const listId = effectiveList(o, h.priceListId, h.customerId);
  const cust = o.customers.find((c) => c.id === h.customerId);
  const custList = cust?.priceListId ? o.priceLists.find((p) => p.id === cust.priceListId) : o.priceLists.find((p) => p.isDefault);

  const pickCustomer = (id: string) => {
    const c = o.customers.find((x) => x.id === id);
    set({ customerId: id, ...(c?.salesRepUserId && !h.salesRepUserId && { salesRepUserId: c.salesRepUserId }), ...(c?.branchId && !h.branchId && { branchId: c.branchId }) });
  };

  const save = async (send: boolean) => {
    setBusy(true);
    setErr(null);
    const body = {
      customerId: h.customerId, docDate: h.docDate, validTill: h.validTill, subject: h.subject || null, salesRepUserId: h.salesRepUserId || null, branchId: h.branchId || null,
      priceListId: h.priceListId || null, remarks: h.remarks || null, terms: h.terms || null, lines: linesPayload(lines), ...(q && { rowVersion: q.rowVersion }),
    };
    try {
      let saved = q ? await updateQuotation(q.id, body) : await createQuotation(body);
      let msg = `${saved.docNo} saved as draft`;
      if (send) {
        try {
          saved = await quotationAction(saved.id, "send", saved.rowVersion);
          msg = `Quotation ${saved.docNo} sent`;
        } catch (e) {
          msg = `${saved.docNo} saved as draft — not sent: ${errMsg(e, "send failed")}`;
        }
      }
      onSaved(saved, msg);
    } catch (e) {
      setErr(fieldErrors(e, "Could not save the quotation"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={q ? `Edit ${q.docNo}` : "New Quotation"} subtitle={q ? `${q.customer.name} · draft` : "Auto-numbered on save"} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn secondary" onClick={() => save(false)} disabled={busy}>Save draft</button>
        {canSend && <button type="button" className="btn primary" onClick={() => save(true)} disabled={busy}>{busy ? "Saving…" : "Save & send"}</button>}
      </>
    }>
      {err && <Banner tone="danger" title="Not saved">{err.message}</Banner>}
      <FormGrid cols={3}>
        <Field label="Customer" required error={fe("customerId")}>
          <select value={h.customerId} onChange={(e) => pickCustomer(e.target.value)}><option value="">Choose…</option>{o.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label="Quote date" required error={fe("docDate")}><input type="date" value={h.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
        <Field label="Valid till" required error={fe("validTill")}><input type="date" value={h.validTill} onChange={(e) => set({ validTill: e.target.value })} /></Field>
        <Field label="Sales rep" error={fe("salesRepUserId")}>
          <select value={h.salesRepUserId} onChange={(e) => set({ salesRepUserId: e.target.value })}><option value="">—</option>{o.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </Field>
        <Field label="Branch" error={fe("branchId")}>
          <select value={h.branchId} onChange={(e) => set({ branchId: e.target.value })}><option value="">—</option>{o.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </Field>
        <Field label="Price list" error={fe("priceListId")} hint="New lines are priced from this list">
          <select value={h.priceListId} onChange={(e) => set({ priceListId: e.target.value })}>
            <option value="">{custList ? `Customer default · ${custList.name}` : "Product prices"}</option>
            {o.priceLists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </FormGrid>
      <FormGrid cols={1}>
        <Field label="Subject" error={fe("subject")}><input value={h.subject} maxLength={200} placeholder="e.g. Q4 supply of packaging material" onChange={(e) => set({ subject: e.target.value })} /></Field>
      </FormGrid>
      <SalesLinesGrid o={o} lines={lines} setLines={setLines} listId={listId} fe={fe} />
      <DocTotalsBlock lines={lines} />
      <FormGrid>
        <Field label="Remarks" error={fe("remarks")}><textarea rows={2} value={h.remarks} onChange={(e) => set({ remarks: e.target.value })} /></Field>
        <Field label="Terms & conditions" error={fe("terms")}><textarea rows={2} value={h.terms} onChange={(e) => set({ terms: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}

// ---------------------------------------------------------------- convert to sales order
function ConvertModal({ row, options: o, onClose, onDone }: { row: Row; options: SalesDocOptions; onClose: () => void; onDone: (docNo: string, soNo: string | null, soId: string) => void }) {
  const d = isoDay(new Date());
  const [full, setFull] = useState<Quotation | null>(null);
  const [f, setF] = useState(() => ({
    docDate: d, expectedDeliveryDate: "", customerPoRef: "", reserveStock: true,
    warehouseId: (row.branch && o.warehouses.find((w) => w.branchId === row.branch!.id)?.id) || o.warehouses[0]?.id || "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const fe = (k: string) => err?.fields[k];
  useEffect(() => {
    getQuotation(row.id).then(setFull).catch(() => undefined);
  }, [row.id]);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await convertQuotation(row.id, { rowVersion: full?.rowVersion ?? row.rowVersion, docDate: f.docDate, expectedDeliveryDate: f.expectedDeliveryDate || null, warehouseId: f.warehouseId, customerPoRef: f.customerPoRef || null, reserveStock: f.reserveStock });
      onDone(row.docNo, r.quotation.order?.docNo ?? null, r.orderId);
    } catch (e) {
      setErr(fieldErrors(e, "Could not create the sales order"));
    } finally {
      setBusy(false);
    }
  };
  const n = full?.lines.length;
  const rates = [...new Set(full?.lines.map((l) => l.taxRate) ?? [])];
  return (
    <Modal open onClose={onClose} title="Convert to Sales Order" subtitle={`${row.docNo} · ${row.customer.name}`} foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={go} disabled={busy}>{busy ? "Creating…" : "Create Sales Order"}</button></>
    }>
      {err ? <div className="mb"><Banner tone="danger" title="Not converted">{err.message}</Banner></div> : (
        <div className="mb"><Banner tone="info" title={n === undefined ? "All lines will be copied" : `All ${n} line${n === 1 ? "" : "s"} will be copied`}>
          Prices are locked at quotation rates.{rates.length === 1 && rates[0] ? ` GST ${rates[0]}% applied per line.` : " Tax is applied per line."}{row.status === "SENT" ? " The quotation is marked accepted." : ""}
        </Banner></div>
      )}
      <FormGrid>
        <Field label="Order date" required error={fe("docDate")}><input type="date" value={f.docDate} onChange={(e) => setF({ ...f, docDate: e.target.value })} /></Field>
        <Field label="Expected delivery" error={fe("expectedDeliveryDate")}><input type="date" value={f.expectedDeliveryDate} onChange={(e) => setF({ ...f, expectedDeliveryDate: e.target.value })} /></Field>
        <Field label="Ship from warehouse" required error={fe("warehouseId")}>
          <select value={f.warehouseId} onChange={(e) => setF({ ...f, warehouseId: e.target.value })}><option value="">Choose…</option>{o.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </Field>
        <Field label="Customer PO reference" error={fe("customerPoRef")}><input value={f.customerPoRef} maxLength={60} onChange={(e) => setF({ ...f, customerPoRef: e.target.value })} /></Field>
        <Check full label="Reserve stock on confirmation" checked={f.reserveStock} onChange={(e) => setF({ ...f, reserveStock: e.target.checked })} />
      </FormGrid>
      <div className="dl mt">
        <div><span>Order value (excl. GST)</span><b>{rs(row.netAmount - row.taxAmount)}</b></div>
        <div><span>GST</span><b>{rs(row.taxAmount)}</b></div>
        <div><span>Order total</span><b>{rs(row.netAmount)}</b></div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- detail drawer
type Tab = "details" | "history";

function QuotationDrawer({ id, can, options, onClose, onEdit, onConvert, onRevise, onAsk, onDelete, onChanged }: {
  id: string | null; can: Can; options: SalesDocOptions | null; onClose: () => void; onEdit: (q: Quotation) => void; onConvert: (q: Row) => void; onRevise: (q: Quotation) => void;
  onAsk: (a: Ask) => void; onDelete: (q: Row) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [q, setQt] = useState<Quotation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [n2, setN2] = useState(0);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getQuotation(id).then((x) => !cancelled && setQt(x)).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the quotation")));
    return () => { cancelled = true; };
  }, [id, n2]);
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast(label, { tone: "good" }); setN2((x) => x + 1); onChanged(); } catch (e) { toast(errMsg(e, "That didn’t work"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const s = q ? STATUS[q.status] ?? { label: q.status, tone: "neutral" as Tone } : null;
  const open = !!q && ["SENT", "ACCEPTED"].includes(q.status) && !q.order;

  const actions = q ? (
    <>
      {q.status === "DRAFT" && can.edit && <Button disabled={busy || !options} icon={<Pencil />} onClick={() => onEdit(q)}>Edit</Button>}
      {q.status === "DRAFT" && can.delete && <Button disabled={busy} icon={<Trash2 />} onClick={() => onDelete(q)}>Delete</Button>}
      {(q.status === "DRAFT" || open) && can.edit && <Button disabled={busy} onClick={() => onAsk({ kind: "cancel", q })}>Cancel</Button>}
      {q.status === "SENT" && can.edit && <Button disabled={busy} onClick={() => onAsk({ kind: "reject", q })}>Reject</Button>}
      {q.status !== "DRAFT" && !q.order && can.create && <Button disabled={busy || !options} icon={<Copy />} onClick={() => onRevise(q)}>Revise</Button>}
      {q.status === "SENT" && can.edit && <Button disabled={busy} icon={<CircleCheck />} onClick={() => run(`${q.docNo} accepted`, () => quotationAction(q.id, "accept", q.rowVersion))}>Accept</Button>}
      {q.status === "DRAFT" && can.edit && <Button variant="primary" disabled={busy} icon={<Send />} onClick={() => run(`${q.docNo} sent`, () => quotationAction(q.id, "send", q.rowVersion))}>Send</Button>}
      {open && can.create && <Button variant="primary" disabled={busy || !options} icon={<Repeat />} onClick={() => onConvert(q)}>Convert to SO</Button>}
      {q.order && <ButtonLink variant="primary" icon={<ArrowRight />} href={`/sales/orders?so=${q.order.id}`}>View {q.order.docNo}</ButtonLink>}
    </>
  ) : undefined;

  return (
    <Drawer open={!!id} onClose={onClose} wide title={q ? q.docNo : "Quotation"} subtitle={q ? `${q.customer.name} · ${dateLabel(q.docDate)}` : undefined} foot={actions}>
      {err ? <ErrorState message={err} onRetry={() => { setErr(null); setN2((x) => x + 1); }} /> : !q ? <Skeleton style={{ height: 420 }} /> : (
        <>
          <div className="row mb" style={{ gap: 8 }}><Badge tone={s!.tone} dot>{s!.label}</Badge>{q.subject && <small className="muted">{q.subject}</small>}</div>
          <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
          {tab === "details" && (
            <>
              <div className="dl mt">
                <div><span>Customer</span><b>{q.customer.code} · {q.customer.name}{q.customer.city ? `, ${q.customer.city}` : ""}</b></div>
                <div><span>Quote date</span><b>{dateLabel(q.docDate)}</b></div>
                <div><span>Valid till</span><b>{dateLabel(q.validTill)}</b></div>
                <div><span>Sales rep</span><b>{q.salesRep?.name ?? "—"}</b></div>
                {q.branch && <div><span>Branch</span><b>{q.branch.name}</b></div>}
                {q.priceList && <div><span>Price list</span><b>{q.priceList.name}</b></div>}
                {q.revisionOf && <div><span>Revision of</span><b><Link className="link" href={`/sales/quotations?qt=${q.revisionOf.id}`}>{q.revisionOf.docNo}</Link></b></div>}
                {q.sentAt && <div><span>Sent</span><b>{dateLabel(q.sentAt)}</b></div>}
                {q.acceptedAt && <div><span>Accepted</span><b>{dateLabel(q.acceptedAt)}</b></div>}
                {q.order && <div><span>Sales order</span><b><Link className="link" href={`/sales/orders?so=${q.order.id}`}>{q.order.docNo}</Link></b></div>}
                <div><span>Prepared by</span><b>{q.createdBy?.name ?? "—"} · {dateLabel(q.createdAt)}</b></div>
                {q.remarks && <div><span>Remarks</span><b>{q.remarks}</b></div>}
                {q.terms && <div><span>Terms</span><b>{q.terms}</b></div>}
              </div>
              <LinesTable lines={q.lines} net={q.netAmount} tax={q.taxAmount} />
            </>
          )}
          {tab === "history" && <div className="mt"><HistoryTab schema="Sales" table="Quotations" id={q.id} /></div>}
        </>
      )}
    </Drawer>
  );
}
