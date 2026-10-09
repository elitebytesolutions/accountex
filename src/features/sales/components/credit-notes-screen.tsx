"use client";

import { CircleCheck, Download, Eye, FileMinus2, Pencil, Plus, Search, Trash2, Undo2, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { lineAmounts, type CreditNote, type CreditNoteList, type ReceivablesOptions, type ReturnableInvoice, type SalesInvoiceList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  cancelCreditNote, createCreditNote, deleteCreditNote, getCreditNote, listCreditNotes, postCreditNote, receivablesOptions, returnableInvoice, updateCreditNote,
} from "@/features/receivables/completion-api";
import { listInvoices } from "../api";

type Can = { create: boolean; edit: boolean; post: boolean; delete: boolean };
type Row = CreditNoteList["items"][number];
type InvRow = SalesInvoiceList["items"][number];
const PAGE = 10;
const STATUSES = ["DRAFT", "OPEN", "APPLIED", "CANCELLED"];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, PENDING_APPROVAL: { label: "Pending Approval", tone: "warn" }, OPEN: { label: "Open", tone: "info" },
  APPLIED: { label: "Applied", tone: "good" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const TREATMENT: Record<string, string> = { APPLY_TO_INVOICE: "Apply to invoice balance", KEEP_AS_CREDIT: "Keep as customer credit" };
const LIVE_INV = ["POSTED", "PARTIALLY_PAID", "PAID"];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

function CnStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

/** Template app/sales/credit-notes (41-acc-trade.html): KPIs, status chips, credit notes table, New Credit Note modal, detail drawer. */
export function CreditNotesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CreditNoteList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<ReceivablesOptions | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => params.get("id"));
  const [editor, setEditor] = useState<{ cn: CreditNote | null; invoiceId?: string } | null>(() => {
    const inv = params.get("invoice");
    return inv && can.create ? { cn: null, invoiceId: inv } : null;
  });

  useEffect(() => {
    receivablesOptions().then(setOptions).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listCreditNotes({ status, search, customer, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load credit notes" }));
    return () => { cancelled = true; };
  }, [status, search, customer, page, attempt]);
  const reload = () => setAttempt((x) => x + 1);

  const k = data?.kpis;
  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((s, x) => s + x, 0);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const filtered = !!(status || search || customer);
  const items = data?.items ?? [];
  const reasonLabel = (c: string) => options?.lookups.creditNoteReasons.find((x) => x.code === c)?.label ?? c.replace(/_/g, " ").toLowerCase().replace(/^./, (x) => x.toUpperCase());
  const pageTotals = items.reduce((s, d) => ({ value: s.value + d.valueAmount, tax: s.tax + d.taxAmount, total: s.total + d.totalAmount }), { value: 0, tax: 0, total: 0 });
  const exportCsv = () => downloadCsv(`credit-notes-${isoDay(new Date())}.csv`, [
    ["Credit Note #", "Customer", "Date", "Against invoice", "Reason", "Value", "GST", "Total", "Balance", "Status"],
    ...items.map((d) => [d.docNo, d.customer.name, d.docDate, d.invoice?.docNo ?? "", d.reasonNote ?? reasonLabel(d.reason), d.valueAmount, d.taxAmount, d.totalAmount, d.balanceAmount, STATUS[d.status]?.label ?? d.status]),
  ]);
  const openEdit = async (id: string) => {
    try { setEditor({ cn: await getCreditNote(id) }); } catch (e) { toast(errMsg(e, "Could not load the credit note"), { tone: "danger" }); }
  };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Sales / Credit Notes"
        title="Credit Notes"
        description="Returns, rate differences and adjustments issued against sales invoices. Output GST reversed in the Sales Tax Return."
        actions={
          <>
            <Button icon={<Download />} onClick={exportCsv} disabled={!items.length}>Export</Button>
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ cn: null })}>New Credit Note</Button>}
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi yellow"><div className="kpi-top"><span>Issued this month</span><span className="icon-well"><FileMinus2 /></span></div><strong>{k ? rs(k.issuedMtd) : "—"}</strong><small>{k ? `${k.issuedMtdCount} credit note${k.issuedMtdCount === 1 ? "" : "s"}` : " "}</small></div>
        <div className="kpi"><div className="kpi-top"><span>Applied to Invoices</span><span className="icon-well"><CircleCheck /></span></div><strong>{counts.APPLIED ?? 0}</strong><small>notes applied</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Open (Unapplied)</span><span className="icon-well"><Wallet /></span></div><strong>{k ? rs(k.openCredit) : "—"}</strong><small>Available to customers</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Drafts</span><span className="icon-well"><Undo2 /></span></div><strong>{counts.DRAFT ?? 0}</strong><small>waiting to be posted</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Credit notes</h3><p>{data ? `${all} credit note${all === 1 ? "" : "s"}` : "…"} · returns and price adjustments</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search CN #, invoice, customer…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <select value={customer} onChange={(e) => { setCustomer(e.target.value); setPage(1); }} aria-label="Customer">
            <option value="">All customers</option>
            {options?.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="chips">
            <button type="button" className={cn(!status && "active")} onClick={() => { setStatus(""); setPage(1); }}>All <i>{all}</i></button>
            {STATUSES.map((s) => <button key={s} type="button" className={cn(status === s && "active")} onClick={() => { setStatus(s); setPage(1); }}>{STATUS[s]!.label} <i>{counts[s] ?? 0}</i></button>)}
          </div>
        </div>
        {!data ? <Skeleton style={{ height: 360 }} /> : !items.length ? (
          <EmptyState icon={<FileMinus2 />} title={filtered ? "No credit notes match" : "No credit notes yet"} description={filtered ? "Try another status, customer or search." : "Issue a credit note for a rate difference, damaged goods or short supply. Sales returns raise theirs automatically."}
            action={!filtered && can.create ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ cn: null })}>New Credit Note</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Credit Note #</th><th>Customer</th><th>Date</th><th>Against Invoice</th><th>Reason</th><th className="num">Value</th><th className="num">GST</th><th className="num">Total (Rs)</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((d: Row) => (
                <tr key={d.id}>
                  <td><a className="link" href={`/sales/credit-notes?id=${d.id}`} onClick={(e) => { e.preventDefault(); setOpenId(d.id); }}><Hl text={d.docNo} q={search} /></a>{d.salesReturn && <small>from return {d.salesReturn.docNo}</small>}</td>
                  <td><div className="cell-user"><span className="avatar sm">{initials(d.customer.name)}</span><div><b><Hl text={d.customer.name} q={search} /></b><small>{d.customer.code}</small></div></div></td>
                  <td>{dateLabel(d.docDate)}</td>
                  <td>{d.invoice ? <Link className="link" href={`/sales/invoices/${d.invoice.id}`}>{d.invoice.docNo}</Link> : "—"}</td>
                  <td>{d.reasonNote ?? reasonLabel(d.reason)}<small>{TREATMENT[d.treatment] ?? d.treatment}</small></td>
                  <td className="num">{amt(d.valueAmount)}</td>
                  <td className="num">{amt(d.taxAmount)}</td>
                  <td className="num">{amt(d.totalAmount)}{d.status === "OPEN" && d.balanceAmount !== d.totalAmount ? <small>{amt(d.balanceAmount)} open</small> : null}</td>
                  <td><CnStatus status={d.status} /></td>
                  <td className="actions">
                    {d.status === "DRAFT" && !d.salesReturn && (can.create || can.edit) ? (
                      <button type="button" className="icon-btn-sm" aria-label={`Edit ${d.docNo}`} onClick={() => openEdit(d.id)}><Pencil /></button>
                    ) : (
                      <button type="button" className="icon-btn-sm" aria-label={`Open ${d.docNo}`} onClick={() => setOpenId(d.id)}><Eye /></button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="total"><td colSpan={5}>Total (this page)</td><td className="num">{amt(pageTotals.value)}</td><td className="num">{amt(pageTotals.tax)}</td><td className="num">{amt(pageTotals.total)}</td><td colSpan={2} /></tr>
            </tbody>
          </table></div>
        )}
        {data && data.total > 0 && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + items.length} of {data.total}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((x) => <button key={x} type="button" className={cn(x === page && "active")} onClick={() => setPage(x)}>{x}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      <CnDrawer key={openId ?? "none"} id={openId} can={can} reasonLabel={reasonLabel} onClose={() => setOpenId(null)} onEdit={(cn) => { setOpenId(null); setEditor({ cn }); }} onChanged={reload} />
      {editor && options && (
        <CnEditor cn={editor.cn} invoiceId={editor.invoiceId} options={options} onClose={() => setEditor(null)} onSaved={(cn, msg) => { setEditor(null); toast(msg, { tone: "good" }); setOpenId(cn.id); reload(); }} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- editor
type Line = { key: number; invoiceLineId: string; itemId: string; label: string; invoicedQty: number | null; qty: string; rate: string; taxRate: string; restock: boolean };
type Head = { customerId: string; invoiceId: string; docDate: string; reason: string; reasonNote: string; treatment: string; returnWarehouseId: string; narration: string };
let seq = 0;
const freeLine = (): Line => ({ key: ++seq, invoiceLineId: "", itemId: "", label: "", invoicedQty: null, qty: "", rate: "", taxRate: "0", restock: false });

function invoiceLines(r: ReturnableInvoice, cn: CreditNote | null): Line[] {
  return r.lines.map((l) => {
    const prev = cn?.lines.find((x) => x.invoiceLineId === l.invoiceLineId);
    return {
      key: ++seq, invoiceLineId: l.invoiceLineId, itemId: l.item.id, label: `${l.item.sku} · ${l.item.name}`, invoicedQty: l.soldQty,
      qty: prev ? String(prev.qty) : "", rate: prev ? String(prev.rate) : String(l.rate), taxRate: String(prev?.taxRate ?? l.taxRate), restock: prev?.restock ?? false,
    };
  });
}

function CnEditor({ cn, invoiceId, options: o, onClose, onSaved }: { cn: CreditNote | null; invoiceId?: string; options: ReceivablesOptions; onClose: () => void; onSaved: (cn: CreditNote, msg: string) => void }) {
  const [h, setH] = useState<Head>(() => ({
    customerId: cn?.customer.id ?? "", invoiceId: cn?.invoice?.id ?? invoiceId ?? "", docDate: cn?.docDate ?? isoDay(new Date()),
    reason: cn?.reason ?? o.lookups.creditNoteReasons.find((r) => r.code !== "SALES_RETURN")?.code ?? "", reasonNote: cn?.reasonNote ?? "",
    treatment: cn?.treatment ?? "APPLY_TO_INVOICE", returnWarehouseId: cn?.returnWarehouse?.id ?? "", narration: cn?.narration ?? "",
  }));
  const [invFor, setInvFor] = useState<{ customerId: string; items: InvRow[] } | null>(null);
  const [inv, setInv] = useState<ReturnableInvoice | null>(null);
  const [lines, setLines] = useState<Line[]>(() => (cn ? cn.lines.filter((l) => !l.invoiceLineId).map((l) => ({ key: ++seq, invoiceLineId: "", itemId: l.item?.id ?? "", label: l.description, invoicedQty: null, qty: l.qty ? String(l.qty) : "", rate: String(l.rate), taxRate: String(l.taxRate), restock: l.restock })) : []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const set = (patch: Partial<Head>) => setH((x) => ({ ...x, ...patch }));
  const fe = (key: string) => err?.fields[key];

  // invoices of the chosen customer
  useEffect(() => {
    if (!h.customerId) return;
    let cancelled = false;
    const customerId = h.customerId;
    Promise.all(LIVE_INV.map((s) => listInvoices({ customer: customerId, status: s, pageSize: 200 })))
      .then((ls) => !cancelled && setInvFor({ customerId, items: ls.flatMap((l) => l.items).sort((a, b) => (a.docDate < b.docDate ? 1 : -1)) }))
      .catch(() => !cancelled && setInvFor({ customerId, items: [] }));
    return () => { cancelled = true; };
  }, [h.customerId]);
  const invoices = !h.customerId ? [] : invFor?.customerId === h.customerId ? invFor.items : null;
  // the chosen invoice's lines (and, from ?invoice=, its customer)
  useEffect(() => {
    if (!h.invoiceId) return;
    let cancelled = false;
    returnableInvoice(h.invoiceId).then((r) => {
      if (cancelled) return;
      setInv(r);
      setH((x) => ({ ...x, customerId: x.customerId || r.invoice.customer.id, returnWarehouseId: x.returnWarehouseId || r.invoice.warehouse?.id || "" }));
      setLines((ls) => [...invoiceLines(r, cn && cn.invoice?.id === r.invoice.id ? cn : null), ...ls.filter((l) => !l.invoiceLineId)]);
    }).catch((e: unknown) => !cancelled && setErr({ message: errMsg(e, "Could not load the invoice"), fields: {} }));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.invoiceId]);

  const pickInvoice = (id: string) => {
    setLines((ls) => ls.filter((l) => !l.invoiceLineId));
    setInv(null);
    set({ invoiceId: id, treatment: id ? h.treatment : "KEEP_AS_CREDIT" });
  };
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const calc = useMemo(() => lines.map((l) => lineAmounts({ baseQty: n(l.qty) > 0 ? n(l.qty) : l.itemId ? 0 : 1, rate: n(l.rate), discountPct: 0, taxRate: n(l.taxRate) })), [lines]);
  const used = lines.map((l, i) => ({ l, a: calc[i]! })).filter((x) => n(x.l.rate) > 0 && (x.l.itemId ? n(x.l.qty) > 0 : !!x.l.label.trim()));
  const value = r2(used.reduce((s, x) => s + x.a.netAmount, 0));
  const tax = r2(used.reduce((s, x) => s + x.a.taxAmount, 0));
  const total = r2(value + tax);
  const restocks = used.some((x) => x.l.restock);
  const balance = inv && inv.invoice.id === h.invoiceId ? inv.invoice.balanceAmount : null;
  const over = h.treatment === "APPLY_TO_INVOICE" && balance !== null && total > balance;

  const save = async (post: boolean) => {
    setBusy(true);
    setErr(null);
    const sent = used.map((x) => x.l);
    const body = {
      docDate: h.docDate, customerId: h.customerId, invoiceId: h.invoiceId || null, reason: h.reason, reasonNote: h.reasonNote || null, treatment: h.treatment,
      returnWarehouseId: restocks ? h.returnWarehouseId || null : null, narration: h.narration || null,
      lines: sent.map((l) => ({ invoiceLineId: l.invoiceLineId || null, itemId: l.itemId || null, description: l.label || null, qty: n(l.qty), rate: n(l.rate), taxRate: n(l.taxRate), restock: l.restock })),
      ...(cn && { rowVersion: cn.rowVersion }),
    };
    try {
      let saved = cn ? await updateCreditNote(cn.id, body) : await createCreditNote(body);
      let msg = `${saved.docNo} saved as draft`;
      if (post) {
        saved = await postCreditNote(saved.id, saved.rowVersion);
        msg = `${saved.docNo} posted · ${saved.status === "APPLIED" ? "applied to the invoice" : "kept as customer credit"}`;
      }
      onSaved(saved, msg);
    } catch (e) {
      if (e instanceof ApiError) {
        const fields: Record<string, string> = {};
        for (const [key, v] of Object.entries(e.details ?? {})) {
          const m = key.match(/^lines\.(\d+)\.(.+)$/);
          const at = m ? sent[Number(m[1])]?.key : undefined;
          fields[m && at !== undefined ? `lines.${at}.${m[2]}` : key] = v[0] ?? "";
        }
        setErr({ message: e.message, fields });
      } else setErr({ message: "Could not save the credit note", fields: {} });
    } finally {
      setBusy(false);
    }
  };

  const ready = !!h.customerId && !!h.reason && used.length > 0 && (h.treatment !== "APPLY_TO_INVOICE" || !!h.invoiceId);
  return (
    <Modal open onClose={onClose} wide title={cn ? `Edit ${cn.docNo}` : "New Credit Note"} subtitle={cn ? `${cn.customer.name} · draft` : "Numbered on save · reverses revenue and output GST"} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn secondary" onClick={() => save(false)} disabled={busy || !ready}>Save draft</button>
        <button type="button" className="btn primary" onClick={() => save(true)} disabled={busy || !ready || over}>{busy ? "Saving…" : "Save & post"}</button>
      </>
    }>
      {err && <Banner tone="danger" title="Not saved">{err.message}</Banner>}
      <FormGrid cols={3}>
        <Field label="Customer" required error={fe("customerId")}>
          <select value={h.customerId} disabled={!!cn} onChange={(e) => { setLines([]); setInv(null); set({ customerId: e.target.value, invoiceId: "" }); }}><option value="">Choose…</option>{o.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label="Against invoice" required={h.treatment === "APPLY_TO_INVOICE"} error={fe("invoiceId")}>
          <select value={h.invoiceId} disabled={!h.customerId || invoices === null} onChange={(e) => pickInvoice(e.target.value)}>
            <option value="">{!h.customerId ? "Pick the customer first" : invoices === null ? "Loading…" : "No invoice"}</option>
            {invoices?.map((b) => <option key={b.id} value={b.id}>{b.docNo} · {rs(b.netAmount)}{b.balanceAmount !== b.netAmount ? ` · owes ${rs(b.balanceAmount)}` : ""}</option>)}
            {h.invoiceId && invoices && !invoices.some((b) => b.id === h.invoiceId) && inv && <option value={h.invoiceId}>{inv.invoice.docNo}</option>}
          </select>
        </Field>
        <Field label="Date" required error={fe("docDate")}><input type="date" value={h.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
        <Field label="Reason" required error={fe("reason")}>
          <select value={h.reason} onChange={(e) => set({ reason: e.target.value })}><option value="">Choose…</option>{o.lookups.creditNoteReasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>
        </Field>
        <Field label="Return to warehouse" error={fe("returnWarehouseId")} hint={restocks ? undefined : "Only when goods are restocked"}>
          <select value={h.returnWarehouseId} disabled={!restocks} onChange={(e) => set({ returnWarehouseId: e.target.value })}><option value="">—</option>{o.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </Field>
        <Field label="Treatment" error={fe("treatment")}>
          <select value={h.treatment} onChange={(e) => set({ treatment: e.target.value })}>{Object.entries(TREATMENT).map(([c, l]) => <option key={c} value={c} disabled={c === "APPLY_TO_INVOICE" && !h.invoiceId}>{l}</option>)}</select>
        </Field>
      </FormGrid>
      <FormGrid cols={1}>
        <Field label="Reason note" error={fe("reasonNote")}><input value={h.reasonNote} placeholder="e.g. Damaged goods (40 rolls)" onChange={(e) => set({ reasonNote: e.target.value })} /></Field>
      </FormGrid>

      {h.invoiceId && !inv ? <Skeleton style={{ height: 140, marginTop: 16 }} /> : (
        <div className="table-wrap mt"><table className="tbl lines">
          <thead><tr><th>{h.invoiceId ? "Item (from invoice)" : "Description"}</th><th className="num">Invoiced</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Tax %</th><th>Restock</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const bad = (f: string) => (fe(`lines.${l.key}.${f}`) ? { borderColor: "var(--danger)" } : undefined);
              return (
                <tr key={l.key}>
                  <td>{l.invoiceLineId ? <b>{l.label}</b> : <input className="cell-input" style={{ minWidth: 220, ...bad("description") }} value={l.label} placeholder="e.g. Rate difference" onChange={(e) => setLine(l.key, { label: e.target.value })} />}
                    {fe(`lines.${l.key}.qty`) && <small style={{ color: "var(--danger)" }}>{fe(`lines.${l.key}.qty`)}</small>}</td>
                  <td className="num">{l.invoicedQty !== null ? qty(l.invoicedQty) : "—"}</td>
                  <td><input className="cell-input num" inputMode="decimal" style={{ width: 80, ...bad("qty") }} value={l.qty} placeholder={l.itemId ? "0" : "1"} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></td>
                  <td><input className="cell-input num" inputMode="decimal" style={{ width: 100, ...bad("rate") }} value={l.rate} placeholder="0.00" onChange={(e) => setLine(l.key, { rate: e.target.value })} /></td>
                  <td><input className="cell-input num" inputMode="decimal" style={{ width: 64 }} value={l.taxRate} onChange={(e) => setLine(l.key, { taxRate: e.target.value })} /></td>
                  <td><input type="checkbox" disabled={!l.itemId} checked={l.restock} onChange={(e) => setLine(l.key, { restock: e.target.checked })} aria-label="Restock" /></td>
                  <td className="num">{calc[i]!.totalAmount && used.some((x) => x.l.key === l.key) ? amt(calc[i]!.totalAmount) : "—"}</td>
                  <td>{!l.invoiceLineId && <button type="button" className="icon-btn-sm" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><X /></button>}</td>
                </tr>
              );
            })}
            {!lines.length && <tr><td colSpan={8} className="muted">{h.customerId ? "Pick an invoice to credit its lines, or add an adjustment line." : "Pick the customer first."}</td></tr>}
          </tbody>
        </table></div>
      )}
      <div className="row mt" style={{ gap: 8 }}><Button size="sm" icon={<Plus />} disabled={!h.customerId} onClick={() => setLines((ls) => [...ls, freeLine()])}>Add adjustment line</Button></div>
      {fe("lines") && <small style={{ color: "var(--danger)" }}>{fe("lines")}</small>}
      <div className="grid-2 mt">
        <div className="form-grid"><label className="full"><span>Narration</span><textarea rows={3} value={h.narration} onChange={(e) => set({ narration: e.target.value })} /></label></div>
        <div className="dl">
          <div><span>Value</span><b>Rs {amt(value)}</b></div>
          <div><span>GST reversed</span><b>Rs {amt(tax)}</b></div>
          <div><span>Credit note total</span><b>Rs {amt(total)}</b></div>
          {balance !== null && h.treatment === "APPLY_TO_INVOICE" && <div><span>New invoice balance</span><b>Rs {amt(r2(balance - total))}</b></div>}
        </div>
      </div>
      {over && <Banner tone="warn" title="More than the invoice owes">The note ({rs(total)}) is above what {inv?.invoice.docNo} still owes ({rs(balance ?? 0)}). Keep it as customer credit, or reduce it.</Banner>}
    </Modal>
  );
}

// ---------------------------------------------------------------- detail drawer
type Tab = "details" | "history";

function CnDrawer({ id, can, reasonLabel, onClose, onEdit, onChanged }: { id: string | null; can: Can; reasonLabel: (c: string) => string; onClose: () => void; onEdit: (cn: CreditNote) => void; onChanged: () => void }) {
  const toast = useToast();
  const [cn, setCn] = useState<CreditNote | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [del, setDel] = useState(false);
  const [n2, setN2] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getCreditNote(id).then((x) => !cancelled && setCn(x)).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the credit note")));
    return () => { cancelled = true; };
  }, [id, n2]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast(label, { tone: "good" });
      setN2((x) => x + 1);
      onChanged();
    } catch (e) {
      toast(errMsg(e, "That didn’t work"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const fromReturn = !!cn?.salesReturn;
  const actions = cn ? (
    <>
      {cn.status === "DRAFT" && !fromReturn && (can.create || can.edit) && <Button disabled={busy} icon={<Pencil />} onClick={() => onEdit(cn)}>Edit</Button>}
      {cn.status === "DRAFT" && !fromReturn && can.delete && <Button disabled={busy} icon={<Trash2 />} onClick={() => setDel(true)}>Delete</Button>}
      {["OPEN", "APPLIED"].includes(cn.status) && !fromReturn && can.post && <Button disabled={busy} onClick={() => setCancelAsk(true)}>Cancel note</Button>}
      {cn.status === "DRAFT" && !fromReturn && can.post && <Button variant="primary" disabled={busy} onClick={() => run(`${cn.docNo} posted`, () => postCreditNote(cn.id, cn.rowVersion))}>Post</Button>}
    </>
  ) : undefined;

  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={cn ? cn.docNo : "Credit note"} subtitle={cn ? `${cn.customer.name} · ${dateLabel(cn.docDate)}` : undefined} foot={actions}>
        {err ? <ErrorState message={err} onRetry={() => { setErr(null); setN2((x) => x + 1); }} /> : !cn ? <Skeleton style={{ height: 420 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><CnStatus status={cn.status} /><Badge tone="outline">{reasonLabel(cn.reason)}</Badge>{cn.cancelReason && <small className="muted">{cn.cancelReason}</small>}</div>
            {fromReturn && <Banner tone="info" title={`Raised by sales return ${cn.salesReturn!.docNo}`}>This note settles the return; cancel the return to reverse it. <Link className="link" href={`/sales/returns?id=${cn.salesReturn!.id}`}>Open the return</Link></Banner>}
            <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <>
                <div className="dl mt">
                  <div><span>Against invoice</span><b>{cn.invoice ? <Link className="link" href={`/sales/invoices/${cn.invoice.id}`}>{cn.invoice.docNo}</Link> : "—"}</b></div>
                  <div><span>Treatment</span><b>{TREATMENT[cn.treatment] ?? cn.treatment}</b></div>
                  {cn.reasonNote && <div><span>Reason note</span><b>{cn.reasonNote}</b></div>}
                  {cn.returnWarehouse && <div><span>Return to</span><b>{cn.returnWarehouse.name}</b></div>}
                  <div><span>Journal</span><b>{cn.journal ? <Link className="link" href={`/accounting/vouchers/${cn.journal.id}`}>{cn.journal.docNo}</Link> : "—"}</b></div>
                  {cn.narration && <div><span>Narration</span><b>{cn.narration}</b></div>}
                </div>
                <div className="table-wrap mt"><table className="tbl">
                  <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Tax</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {cn.lines.map((l) => (
                      <tr key={l.id}>
                        <td><b>{l.item ? l.item.name : l.description || `Line ${l.lineNo}`}</b><small>{l.item ? l.item.sku : ""}{l.restock ? " · restocked" : ""}</small></td>
                        <td className="num">{l.qty ? qty(l.qty) : "—"}</td>
                        <td className="num">{amt(l.rate)}</td>
                        <td className="num">{l.taxRate}% · {amt(l.taxAmount)}</td>
                        <td className="num">{amt(l.totalAmount)}</td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={4}>Value {amt(cn.valueAmount)} · GST {amt(cn.taxAmount)}</td><td className="num">{amt(cn.totalAmount)}</td></tr>
                  </tbody>
                </table></div>
                <div className="dl mt">
                  <div><span>Total</span><b>Rs {amt(cn.totalAmount)}</b></div>
                  <div><span>Applied</span><b>Rs {amt(cn.appliedAmount)}</b></div>
                  {cn.status !== "CANCELLED" && <div><span>Open balance</span><b>Rs {amt(cn.balanceAmount)}</b></div>}
                </div>
              </>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Sales" table="CreditNotes" id={cn.id} /></div>}
          </>
        )}
      </Drawer>
      {cn && cancelAsk && <CancelModal cn={cn} onClose={() => setCancelAsk(false)} onDone={(label) => { setCancelAsk(false); toast(label, { tone: "good" }); setN2((x) => x + 1); onChanged(); }} />}
      <ConfirmDialog open={del && !!cn} onClose={() => setDel(false)} danger busy={busy} title={`Delete ${cn?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => cn && run(`${cn.docNo} deleted`, async () => { await deleteCreditNote(cn.id, cn.rowVersion); setDel(false); onClose(); })}>
        The draft and its lines are removed. Its number is not reused.
      </ConfirmDialog>
    </>
  );
}

function CancelModal({ cn, onClose, onDone }: { cn: CreditNote; onClose: () => void; onDone: (label: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { const d = await cancelCreditNote(cn.id, cn.rowVersion, reason.trim()); onDone(`${d.docNo} cancelled`); } catch (e) { setErr(errMsg(e, "That didn’t work")); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Cancel ${cn.docNo}`} subtitle="The journal is reversed and the invoice owes the amount again." foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn danger" onClick={go} disabled={busy || reason.trim().length < 3}>{busy ? "Working…" : "Cancel note"}</button></>
    }>
      <FormGrid cols={1}><Field label="Reason" required error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this note cancelled?" /></Field></FormGrid>
    </Modal>
  );
}
