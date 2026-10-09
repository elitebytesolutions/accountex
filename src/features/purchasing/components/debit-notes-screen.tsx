"use client";

import { Banknote, Download, Eye, FileMinus2, Hourglass, Pencil, Plus, Search, Send, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { debitNoteLineAmounts, type DebitNote, type DebitNoteList, type OpenItems, type PurchaseOptions, type VendorBill, type VendorBillList } from "@/shared";
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
  applyDebitNote, createDebitNote, deleteDebitNote, getBill, getDebitNote, listBills, listDebitNotes, openItems, postDebitNote, purchaseOptions, refundDebitNote,
  reverseAllocation, updateDebitNote, voidDebitNote,
} from "../api";

type Can = { create: boolean; edit: boolean; post: boolean };
type Row = DebitNoteList["items"][number];
type BillRow = VendorBillList["items"][number];
const PAGE = 10;
const STATUSES = ["DRAFT", "OPEN", "APPLIED", "REFUNDED", "VOID"];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, OPEN: { label: "Open", tone: "info" }, APPLIED: { label: "Applied", tone: "good" },
  REFUNDED: { label: "Refunded", tone: "violet" }, VOID: { label: "Void", tone: "danger" },
};
const REASONS: Record<string, string> = { PURCHASE_RETURN: "Purchase return", PRICE_VARIANCE: "Price variance", SHORT_SUPPLY: "Short supply", QUALITY_REJECTION: "Quality rejection" };
const GOODS_LEAVE = ["PURCHASE_RETURN", "QUALITY_REJECTION"];
const SETTLEMENT: Record<string, string> = { ADJUST_AGAINST_BILL: "Adjust against bill", REQUEST_REFUND: "Request refund" };
const LIVE_BILL = ["POSTED", "PARTIALLY_PAID", "PAID"];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const n = (s: string) => (s.trim() === "" ? 0 : Number(s));
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

function DnStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

/** Template app/purchases/debit-notes (41-acc-trade.html): KPIs, status chips, debit notes table, New Debit Note modal, detail drawer. */
export function DebitNotesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DebitNoteList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<PurchaseOptions | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => params.get("dn"));
  const [editor, setEditor] = useState<{ dn: DebitNote | null } | null>(null);

  useEffect(() => {
    purchaseOptions().then(setOptions).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listDebitNotes({ status, search, vendor, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load debit notes" }));
    return () => { cancelled = true; };
  }, [status, search, vendor, page, attempt]);
  const reload = () => setAttempt((x) => x + 1);

  const k = data?.kpis;
  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((s, x) => s + x, 0);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const filtered = !!(status || search || vendor);
  const items = data?.items ?? [];
  const pageTotals = items.reduce((s, d) => ({ net: s.net + d.netAmount, tax: s.tax + d.taxAmount, total: s.total + d.totalAmount }), { net: 0, tax: 0, total: 0 });
  const exportCsv = () => downloadCsv(`debit-notes-${isoDay(new Date())}.csv`, [
    ["Debit Note #", "Vendor", "Date", "Against bill", "Reason", "Value", "Tax", "Total", "Balance", "Status"],
    ...items.map((d) => [d.docNo, d.vendor.name, d.docDate, d.bill?.docNo ?? "", d.reasonNote ?? REASONS[d.reason] ?? d.reason, d.netAmount, d.taxAmount, d.totalAmount, d.balanceAmount, STATUS[d.status]?.label ?? d.status]),
  ]);
  const openEdit = async (id: string) => {
    try { setEditor({ dn: await getDebitNote(id) }); } catch (e) { toast(errMsg(e, "Could not load the debit note"), { tone: "danger" }); }
  };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Purchases / Debit Notes"
        title="Debit Notes"
        description="Purchase returns and claims raised on vendors. Input tax is reversed automatically."
        actions={
          <>
            <Button icon={<Download />} onClick={exportCsv} disabled={!items.length}>Export</Button>
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ dn: null })}>New Debit Note</Button>}
          </>
        }
      />

      <div className="kpi-grid c3 mb">
        <div className="kpi blue"><div className="kpi-top"><span>Open Claims</span><span className="icon-well"><Hourglass /></span></div><strong>{k ? rs(k.openAmount) : "—"}</strong><small>{k ? `Awaiting application or refund${k.drafts ? ` · ${k.drafts} draft${k.drafts === 1 ? "" : "s"}` : ""}` : " "}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Applied this month</span><span className="icon-well"><FileMinus2 /></span></div><strong>{k ? rs(k.appliedThisMonth) : "—"}</strong><small>Set off against vendor bills</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Refund due</span><span className="icon-well"><Banknote /></span></div><strong>{k ? rs(k.refundDue) : "—"}</strong><small>Notes waiting for the vendor&apos;s refund</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Debit notes</h3><p>Returns and price claims against vendors</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search DN #, bill, vendor…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <select value={vendor} onChange={(e) => { setVendor(e.target.value); setPage(1); }} aria-label="Vendor">
            <option value="">All vendors</option>
            {options?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div className="chips">
            <button type="button" className={cn(!status && "active")} onClick={() => { setStatus(""); setPage(1); }}>All <i>{all}</i></button>
            {STATUSES.map((s) => <button key={s} type="button" className={cn(status === s && "active")} onClick={() => { setStatus(s); setPage(1); }}>{STATUS[s]!.label} <i>{counts[s] ?? 0}</i></button>)}
          </div>
        </div>
        {!data ? <Skeleton style={{ height: 360 }} /> : !items.length ? (
          <EmptyState icon={<FileMinus2 />} title={filtered ? "No debit notes match" : "No debit notes yet"} description={filtered ? "Try another status, vendor or search." : "Raise a debit note against a posted bill for a price variance, short supply or rejected goods."}
            action={!filtered && can.create ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ dn: null })}>New Debit Note</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Debit Note #</th><th>Vendor</th><th>Date</th><th>Against Bill</th><th>Reason</th><th className="num">Value</th><th className="num">Tax</th><th className="num">Total (Rs)</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((d: Row) => (
                <tr key={d.id}>
                  <td><a className="link" href={`/purchases/debit-notes?dn=${d.id}`} onClick={(e) => { e.preventDefault(); setOpenId(d.id); }}><Hl text={d.docNo} q={search} /></a>{d.purchaseReturn && <small>from return {d.purchaseReturn.docNo}</small>}</td>
                  <td><div className="cell-user"><span className="avatar sm">{initials(d.vendor.name)}</span><div><b><Hl text={d.vendor.name} q={search} /></b><small>{d.vendor.code}</small></div></div></td>
                  <td>{dateLabel(d.docDate)}</td>
                  <td>{d.bill ? <Link className="link" href={`/purchases/bills/${d.bill.id}`}>{d.bill.docNo}</Link> : "—"}</td>
                  <td>{d.reasonNote ?? REASONS[d.reason] ?? d.reason}<small>{REASONS[d.reason] ?? d.reason} · {SETTLEMENT[d.settlement] ?? d.settlement}</small></td>
                  <td className="num">{amt(d.netAmount)}</td>
                  <td className="num">{amt(d.taxAmount)}</td>
                  <td className="num">{amt(d.totalAmount)}{d.status === "OPEN" && d.balanceAmount !== d.creditAmount ? <small>{amt(d.balanceAmount)} open</small> : null}</td>
                  <td><DnStatus status={d.status} /></td>
                  <td className="actions">
                    {d.status === "DRAFT" && !d.purchaseReturn && (can.create || can.edit) ? (
                      <button type="button" className="icon-btn-sm" aria-label={`Edit ${d.docNo}`} onClick={() => openEdit(d.id)}><Pencil /></button>
                    ) : (
                      <button type="button" className="icon-btn-sm" aria-label={`Open ${d.docNo}`} onClick={() => setOpenId(d.id)}><Eye /></button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="total"><td colSpan={5}>Total (this page)</td><td className="num">{amt(pageTotals.net)}</td><td className="num">{amt(pageTotals.tax)}</td><td className="num">{amt(pageTotals.total)}</td><td colSpan={2} /></tr>
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

      <DnDrawer key={openId ?? "none"} id={openId} can={can} options={options} onClose={() => setOpenId(null)} onEdit={(dn) => { setOpenId(null); setEditor({ dn }); }} onChanged={reload} />
      {editor && options && (
        <DnEditor dn={editor.dn} options={options} onClose={() => setEditor(null)} onSaved={(dn, msg) => { setEditor(null); toast(msg, { tone: "good" }); setOpenId(dn.id); reload(); }} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- editor
type Line = { billLineId: string; label: string; sub: string; billedQty: number; billRate: number; qty: string; rate: string; taxCodeId: string; taxRate: string; hasItem: boolean };
type Head = { vendorId: string; billId: string; docDate: string; reason: string; reasonNote: string; warehouseId: string; settlement: string; whtAmount: string; remarks: string };

function linesFor(bill: VendorBill, reason: string, dn: DebitNote | null): Line[] {
  return bill.lines.map((l) => {
    const prev = dn?.lines.find((x) => x.billLineId === l.id);
    const billed = l.baseQty + l.bonusQty;
    return {
      billLineId: l.id, label: l.item ? `${l.item.sku} · ${l.item.name}` : l.description ?? "Line", sub: l.item ? (l.batchNo ? `batch ${l.batchNo}` : "") : l.account ? `${l.account.code} ${l.account.name}` : "",
      billedQty: billed, billRate: l.rate, hasItem: !!l.item,
      qty: prev ? String(prev.returnQty) : "", rate: prev ? String(prev.rate) : reason === "PRICE_VARIANCE" ? "" : String(l.rate),
      taxCodeId: prev?.taxCode?.id ?? l.taxCode?.id ?? "", taxRate: String(prev?.taxRate ?? l.taxRate ?? 0),
    };
  });
}

function DnEditor({ dn, options: o, onClose, onSaved }: { dn: DebitNote | null; options: PurchaseOptions; onClose: () => void; onSaved: (dn: DebitNote, msg: string) => void }) {
  const [h, setH] = useState<Head>(() => ({
    vendorId: dn?.vendor.id ?? "", billId: dn?.bill?.id ?? "", docDate: dn?.docDate ?? isoDay(new Date()), reason: dn?.reason ?? "PRICE_VARIANCE",
    reasonNote: dn?.reasonNote ?? "", warehouseId: dn?.warehouse?.id ?? "", settlement: dn?.settlement ?? "ADJUST_AGAINST_BILL", whtAmount: dn?.whtAmount ? String(dn.whtAmount) : "", remarks: dn?.remarks ?? "",
  }));
  const [billsFor, setBillsFor] = useState<{ vendorId: string; items: BillRow[] } | null>(null);
  const [loaded, setLoaded] = useState<{ bill: VendorBill; lines: Line[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const set = (patch: Partial<Head>) => setH((x) => ({ ...x, ...patch }));
  const fe = (key: string) => err?.fields[key];

  // posted bills of the chosen vendor
  useEffect(() => {
    if (!h.vendorId) return;
    let cancelled = false;
    const vendorId = h.vendorId;
    Promise.all(LIVE_BILL.map((s) => listBills({ vendor: vendorId, status: s, pageSize: 200 })))
      .then((ls) => !cancelled && setBillsFor({ vendorId, items: ls.flatMap((l) => l.items).sort((a, b) => (a.docDate < b.docDate ? 1 : -1)) }))
      .catch(() => !cancelled && setBillsFor({ vendorId, items: [] }));
    return () => { cancelled = true; };
  }, [h.vendorId]);
  const bills = !h.vendorId ? [] : billsFor?.vendorId === h.vendorId ? billsFor.items : null;
  // the chosen bill's lines
  useEffect(() => {
    if (!h.billId) return;
    let cancelled = false;
    getBill(h.billId).then((b) => {
      if (cancelled) return;
      setLoaded({ bill: b, lines: linesFor(b, h.reason, dn && dn.bill?.id === b.id ? dn : null) });
      setH((x) => ({ ...x, warehouseId: x.warehouseId || b.warehouse?.id || "" }));
    }).catch((e: unknown) => !cancelled && setErr({ message: errMsg(e, "Could not load the bill"), fields: {} }));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.billId]);

  const bill = loaded && loaded.bill.id === h.billId ? loaded.bill : null;
  const lines = useMemo(() => (bill && loaded ? loaded.lines : []), [bill, loaded]);
  const setLines = (f: (ls: Line[]) => Line[]) => setLoaded((x) => (x ? { ...x, lines: f(x.lines) } : x));
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickTax = (i: number, id: string) => setLine(i, { taxCodeId: id, taxRate: id ? String(o.taxCodes.find((x) => x.id === id)?.rate ?? 0) : "0" });
  const salesTax = o.taxCodes.filter((t) => t.taxType === "SALES_TAX");
  const calc = useMemo(() => lines.map((l) => debitNoteLineAmounts({ returnQty: n(l.qty), rate: n(l.rate), taxRate: n(l.taxRate) })), [lines]);
  const used = lines.map((l, i) => ({ l, a: calc[i]!, i })).filter((x) => n(x.l.qty) > 0 && n(x.l.rate) > 0);
  const net = r2(used.reduce((s, x) => s + x.a.netAmount, 0));
  const tax = r2(used.reduce((s, x) => s + x.a.taxAmount, 0));
  const wht = n(h.whtAmount);
  const goods = GOODS_LEAVE.includes(h.reason);
  const overBill = !!bill && r2(net + tax) > bill.netPayableAmount;

  const pickReason = (reason: string) => {
    set({ reason });
    if (bill && !dn) setLines((ls) => ls.map((l) => (n(l.qty) > 0 ? l : { ...l, rate: reason === "PRICE_VARIANCE" ? "" : String(l.billRate) })));
  };

  const save = async (post: boolean) => {
    setBusy(true);
    setErr(null);
    // server line errors are keyed by the index of the lines actually sent
    const sent = used.map((x) => x.l);
    const body = {
      docDate: h.docDate, billId: h.billId, reason: h.reason, reasonNote: h.reasonNote || null, warehouseId: goods ? h.warehouseId || null : null, settlement: h.settlement,
      whtAmount: wht, remarks: h.remarks || null,
      lines: sent.map((l) => ({ billLineId: l.billLineId, billedQty: l.billedQty, returnQty: n(l.qty), rate: n(l.rate), taxCodeId: l.taxCodeId || null, taxRate: n(l.taxRate) })),
      ...(dn && { rowVersion: dn.rowVersion }),
    };
    try {
      let saved = dn ? await updateDebitNote(dn.id, body) : await createDebitNote(body);
      let msg = `${saved.docNo} saved as draft`;
      if (post) {
        saved = await postDebitNote(saved.id, saved.rowVersion);
        msg = `${saved.docNo} posted · ${saved.status === "APPLIED" ? "applied to the bill" : saved.settlement === "REQUEST_REFUND" ? "refund requested" : "open"}`;
      }
      onSaved(saved, msg);
    } catch (e) {
      if (e instanceof ApiError) {
        const fields: Record<string, string> = {};
        for (const [key, v] of Object.entries(e.details ?? {})) {
          const m = key.match(/^lines\.(\d+)\.(.+)$/);
          const at = m ? lines.indexOf(sent[Number(m[1])]!) : -1;
          fields[m && at >= 0 ? `lines.${at}.${m[2]}` : key] = v[0] ?? "";
        }
        setErr({ message: e.message, fields });
      } else setErr({ message: "Could not save the debit note", fields: {} });
    } finally {
      setBusy(false);
    }
  };

  const ready = !!h.billId && used.length > 0;
  return (
    <Modal open onClose={onClose} wide title={dn ? `Edit ${dn.docNo}` : "New Debit Note"} subtitle={dn ? `${dn.vendor.name} · draft` : "Numbered on save · input tax reversed on posting"} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn secondary" onClick={() => save(false)} disabled={busy || !ready}>Save draft</button>
        <button type="button" className="btn primary" onClick={() => save(true)} disabled={busy || !ready}>{busy ? "Saving…" : "Create debit note"}</button>
      </>
    }>
      {err && <Banner tone="danger" title="Not saved">{err.message}</Banner>}
      <FormGrid cols={3}>
        <Field label="Vendor" required error={fe("vendorId")}>
          <select value={h.vendorId} disabled={!!dn} onChange={(e) => set({ vendorId: e.target.value, billId: "", warehouseId: "" })}><option value="">Choose…</option>{o.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        </Field>
        <Field label="Against bill" required error={fe("billId")}>
          <select value={h.billId} disabled={!h.vendorId || bills === null} onChange={(e) => set({ billId: e.target.value })}>
            <option value="">{!h.vendorId ? "Pick the vendor first" : bills === null ? "Loading…" : bills.length ? "Choose…" : "No posted bills"}</option>
            {bills?.map((b) => <option key={b.id} value={b.id}>{b.docNo} · {b.vendorInvoiceNo} · {rs(b.netPayableAmount)}</option>)}
          </select>
        </Field>
        <Field label="Date" required error={fe("docDate")}><input type="date" value={h.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
        <Field label="Reason" required error={fe("reason")}>
          <select value={h.reason} onChange={(e) => pickReason(e.target.value)}>{Object.entries(REASONS).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        </Field>
        <Field label="Return from warehouse" error={fe("warehouseId")} hint={goods ? undefined : "Only when goods go back"}>
          <select value={h.warehouseId} disabled={!goods} onChange={(e) => set({ warehouseId: e.target.value })}><option value="">—</option>{o.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </Field>
        <Field label="Settlement" error={fe("settlement")}>
          <select value={h.settlement} onChange={(e) => set({ settlement: e.target.value })}>{Object.entries(SETTLEMENT).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        </Field>
      </FormGrid>
      <FormGrid cols={1}>
        <Field label="Reason note" error={fe("reasonNote")}><input value={h.reasonNote} placeholder="e.g. Short supply — 1,600 cartons" onChange={(e) => set({ reasonNote: e.target.value })} /></Field>
      </FormGrid>

      {!h.billId ? (
        <div className="mt"><EmptyState icon={<FileMinus2 />} title="Pick the bill" description="The note's lines come from the bill it is raised against." /></div>
      ) : !bill ? <Skeleton style={{ height: 140, marginTop: 16 }} /> : (
        <div className="table-wrap mt"><table className="tbl lines">
          <thead><tr><th>Item</th><th className="num">Billed qty</th><th className="num">{goods ? "Return qty" : "Qty"}</th><th className="num">{h.reason === "PRICE_VARIANCE" ? "Claim / unit" : "Rate"}</th><th>Tax</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const bad = (f: string) => (fe(`lines.${i}.${f}`) ? { borderColor: "var(--danger)" } : undefined);
              return (
                <tr key={l.billLineId}>
                  <td><b>{l.label}</b>{l.sub && <small>{l.sub}</small>}{fe(`lines.${i}.billLineId`) && <small style={{ color: "var(--danger)" }}>{fe(`lines.${i}.billLineId`)}</small>}</td>
                  <td className="num">{qty(l.billedQty)}<small>@ {amt(l.billRate)}</small></td>
                  <td><input className="cell-input num" inputMode="decimal" style={{ width: 80, ...bad("returnQty") }} title={fe(`lines.${i}.returnQty`)} value={l.qty} placeholder="0" onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
                  <td><input className="cell-input num" inputMode="decimal" style={{ width: 100, ...bad("rate") }} title={fe(`lines.${i}.rate`)} value={l.rate} placeholder="0.00" onChange={(e) => setLine(i, { rate: e.target.value })} /></td>
                  <td>
                    <select className="cell-input" value={l.taxCodeId} onChange={(e) => pickTax(i, e.target.value)}>
                      <option value="">No tax</option>{salesTax.map((x) => <option key={x.id} value={x.id}>{x.code}{x.rate !== null ? ` · ${x.rate}%` : ""}</option>)}
                    </select>
                  </td>
                  <td className="num">{calc[i]!.totalAmount ? amt(calc[i]!.totalAmount) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
      {fe("lines") && <small style={{ color: "var(--danger)" }}>{fe("lines")}</small>}
      <div className="dl mt">
        <div><span>Value</span><b>{rs(net)}</b></div>
        <div><span>Input GST reversed</span><b>{rs(tax)}</b></div>
        <div><span>WHT adjustment</span><b><input className="cell-input num" inputMode="decimal" style={{ width: 110, ...(fe("whtAmount") ? { borderColor: "var(--danger)" } : {}) }} title={fe("whtAmount")} placeholder="0.00" value={h.whtAmount} onChange={(e) => set({ whtAmount: e.target.value })} /></b></div>
        <div><span>Debit note total</span><b>Rs {amt(r2(net + tax))}{wht > 0 && <small className="muted"> · credit {amt(r2(net + tax - wht))}</small>}</b></div>
      </div>
      {overBill && <Banner tone="warn" title="More than the bill">The note ({rs(net + tax)}) is above bill {bill?.docNo} ({rs(bill?.netPayableAmount ?? 0)}); it won&apos;t save.</Banner>}
    </Modal>
  );
}

// ---------------------------------------------------------------- detail drawer
type Tab = "details" | "history";
type Ask = "void" | "apply" | "refund" | null;

function DnDrawer({ id, can, options, onClose, onEdit, onChanged }: { id: string | null; can: Can; options: PurchaseOptions | null; onClose: () => void; onEdit: (dn: DebitNote) => void; onChanged: () => void }) {
  const toast = useToast();
  const [dn, setDn] = useState<DebitNote | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [del, setDel] = useState(false);
  const [rev, setRev] = useState<DebitNote["applications"][number] | null>(null);
  const [n2, setN2] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getDebitNote(id).then((x) => !cancelled && setDn(x)).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the debit note")));
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
  const done = (label: string) => { setAsk(null); toast(label, { tone: "good" }); setN2((x) => x + 1); onChanged(); };

  const fromReturn = !!dn?.purchaseReturn;
  const actions = dn ? (
    <>
      {dn.status === "DRAFT" && !fromReturn && (can.create || can.edit) && <Button disabled={busy} icon={<Pencil />} onClick={() => onEdit(dn)}>Edit</Button>}
      {dn.status === "DRAFT" && !fromReturn && can.create && <Button disabled={busy} icon={<Trash2 />} onClick={() => setDel(true)}>Delete</Button>}
      {["OPEN", "APPLIED", "REFUNDED"].includes(dn.status) && !fromReturn && can.post && <Button disabled={busy} onClick={() => setAsk("void")}>Void</Button>}
      {dn.status === "OPEN" && can.post && <Button disabled={busy} icon={<Banknote />} onClick={() => setAsk("refund")}>Record refund</Button>}
      {dn.status === "OPEN" && can.post && <Button variant="primary" disabled={busy} icon={<Send />} onClick={() => setAsk("apply")}>Apply to bill</Button>}
      {dn.status === "DRAFT" && !fromReturn && can.post && <Button variant="primary" disabled={busy} onClick={() => run(`${dn.docNo} posted`, () => postDebitNote(dn.id, dn.rowVersion))}>Post</Button>}
    </>
  ) : undefined;

  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={dn ? dn.docNo : "Debit note"} subtitle={dn ? `${dn.vendor.name} · ${dateLabel(dn.docDate)}` : undefined} foot={actions}>
        {err ? <ErrorState message={err} onRetry={() => { setErr(null); setN2((x) => x + 1); }} /> : !dn ? <Skeleton style={{ height: 420 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><DnStatus status={dn.status} /><Badge tone="outline">{REASONS[dn.reason] ?? dn.reason}</Badge>{dn.voidReason && <small className="muted">{dn.voidReason}</small>}</div>
            {fromReturn && <Banner tone="info" title={`Raised by purchase return ${dn.purchaseReturn!.docNo}`}>This note settles the return; change it by cancelling the return. <Link className="link" href={`/purchases/returns?pr=${dn.purchaseReturn!.id}`}>Open the return</Link></Banner>}
            <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <>
                <div className="dl mt">
                  <div><span>Against bill</span><b>{dn.bill ? <Link className="link" href={`/purchases/bills/${dn.bill.id}`}>{dn.bill.docNo}</Link> : "—"}{dn.bill && <small className="muted"> · {dn.bill.vendorInvoiceNo} · balance {rs(dn.bill.balanceAmount)}</small>}</b></div>
                  <div><span>Settlement</span><b>{SETTLEMENT[dn.settlement] ?? dn.settlement}</b></div>
                  {dn.reasonNote && <div><span>Reason note</span><b>{dn.reasonNote}</b></div>}
                  {dn.warehouse && <div><span>Return from</span><b>{dn.warehouse.name}</b></div>}
                  <div><span>Journal</span><b>{dn.voucher ? <Link className="link" href={`/accounting/vouchers/${dn.voucher.id}`}>{dn.voucher.docNo}</Link> : fromReturn ? "Posted with the return" : "—"}</b></div>
                  {dn.remarks && <div><span>Remarks</span><b>{dn.remarks}</b></div>}
                </div>
                <div className="table-wrap mt"><table className="tbl">
                  <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th>Tax</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {dn.lines.map((l) => (
                      <tr key={l.id}>
                        <td><b>{l.item ? l.item.name : l.description ?? `Line ${l.lineNo}`}</b><small>{l.item ? l.item.sku : ""}{l.billedQty !== null ? `${l.item ? " · " : ""}billed ${qty(l.billedQty)}` : ""}</small></td>
                        <td className="num">{qty(l.returnQty)}</td>
                        <td className="num">{amt(l.rate)}</td>
                        <td>{l.taxCode ? `${l.taxCode.code} · ${l.taxRate}%` : "—"}</td>
                        <td className="num">{amt(l.totalAmount)}</td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={4}>Value {amt(dn.netAmount)} · tax {amt(dn.taxAmount)}</td><td className="num">{amt(dn.totalAmount)}</td></tr>
                  </tbody>
                </table></div>
                <div className="dl mt">
                  {dn.whtAmount > 0 && <div><span>WHT adjustment</span><b>− {rs(dn.whtAmount)}</b></div>}
                  <div><span>Credit</span><b>Rs {amt(dn.creditAmount)}</b></div>
                  <div><span>Applied</span><b>Rs {amt(dn.appliedAmount)}</b></div>
                  <div><span>Refunded</span><b>Rs {amt(dn.refundedAmount)}</b></div>
                  {dn.status !== "VOID" && <div><span>Open balance</span><b>Rs {amt(dn.balanceAmount)}</b></div>}
                </div>
                <div className="mt">
                  <small className="muted" style={{ display: "block", marginBottom: 6 }}>Applications</small>
                  {dn.applications.length ? (
                    <div className="list">
                      {dn.applications.map((a) => (
                        <div key={a.id} className="list-item">
                          <div><b><Link className="link" href={`/purchases/bills/${a.bill.id}`}>{a.bill.docNo}</Link> · Rs {amt(a.amount)}</b><small>{dateLabel(a.date)}{a.isReversed ? " · reversed" : ""}</small></div>
                          {a.isReversed ? <Badge tone="neutral">reversed</Badge> : can.post ? <Button size="sm" icon={<Undo2 />} disabled={busy} onClick={() => setRev(a)}>Reverse</Button> : <Badge tone="good">applied</Badge>}
                        </div>
                      ))}
                    </div>
                  ) : <small className="muted">{dn.status === "DRAFT" ? "Applied to the bill when posted (Adjust against bill)." : "Not applied to any bill."}</small>}
                </div>
              </>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Purchases" table="DebitNotes" id={dn.id} /></div>}
          </>
        )}
      </Drawer>
      {dn && ask === "void" && <VoidModal dn={dn} onClose={() => setAsk(null)} onDone={done} />}
      {dn && ask === "apply" && <ApplyModal dn={dn} onClose={() => setAsk(null)} onDone={done} />}
      {dn && ask === "refund" && options && <RefundModal dn={dn} options={options} onClose={() => setAsk(null)} onDone={done} />}
      <ConfirmDialog open={del && !!dn} onClose={() => setDel(false)} danger busy={busy} title={`Delete ${dn?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => dn && run(`${dn.docNo} deleted`, async () => { await deleteDebitNote(dn.id, dn.rowVersion); setDel(false); onClose(); })}>
        The draft and its lines are removed. Its number is not reused.
      </ConfirmDialog>
      <ConfirmDialog open={!!rev} onClose={() => setRev(null)} danger busy={busy} title={`Reverse the application to ${rev?.bill.docNo ?? ""}?`} confirmLabel="Reverse"
        onConfirm={() => rev && run(`Application to ${rev.bill.docNo} reversed`, async () => { await reverseAllocation(rev.id); setRev(null); })}>
        Rs {rev ? amt(rev.amount) : ""} goes back on the bill and the note&apos;s open balance.
      </ConfirmDialog>
    </>
  );
}

function VoidModal({ dn, onClose, onDone }: { dn: DebitNote; onClose: () => void; onDone: (label: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { const d = await voidDebitNote(dn.id, dn.rowVersion, reason.trim()); onDone(`${d.docNo} voided`); } catch (e) { setErr(errMsg(e, "That didn’t work")); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Void ${dn.docNo}`} subtitle="The journal is reversed and its applications to bills are undone." foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn danger" onClick={go} disabled={busy || reason.trim().length < 3}>{busy ? "Working…" : "Void note"}</button></>
    }>
      <FormGrid cols={1}><Field label="Reason" required error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this note voided?" /></Field></FormGrid>
    </Modal>
  );
}

function ApplyModal({ dn, onClose, onDone }: { dn: DebitNote; onClose: () => void; onDone: (label: string) => void }) {
  const [open, setOpen] = useState<OpenItems | null>(null);
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  useEffect(() => {
    openItems(dn.vendor.id).then(setOpen).catch((e: unknown) => setErr({ message: errMsg(e, "Could not load the vendor's open bills"), fields: {} }));
  }, [dn.vendor.id]);
  const bill = open?.bills.find((b) => b.id === billId);
  const max = bill ? Math.min(dn.balanceAmount, bill.balanceAmount) : dn.balanceAmount;
  const pick = (id: string) => {
    setBillId(id);
    const b = open?.bills.find((x) => x.id === id);
    setAmount(b ? String(r2(Math.min(dn.balanceAmount, b.balanceAmount))) : "");
  };
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { const d = await applyDebitNote(dn.id, { rowVersion: dn.rowVersion, billId, amount: n(amount) }); onDone(`${d.docNo}: Rs ${amt(n(amount))} applied to ${bill?.docNo ?? "the bill"}`); }
    catch (e) { setErr(e instanceof ApiError ? { message: e.message, fields: Object.fromEntries(Object.entries(e.details ?? {}).map(([key, v]) => [key, v[0] ?? ""])) } : { message: "That didn’t work", fields: {} }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Apply ${dn.docNo}`} subtitle={`Open balance Rs ${amt(dn.balanceAmount)} · set it off against an open bill of ${dn.vendor.name}`} foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn primary" onClick={go} disabled={busy || !billId || !(n(amount) > 0) || n(amount) > max + 0.001}>{busy ? "Applying…" : "Apply"}</button></>
    }>
      {err && <Banner tone="danger" title="Not applied">{err.message}</Banner>}
      <FormGrid>
        <Field label="Bill" required error={err?.fields.billId}>
          <select value={billId} disabled={!open} onChange={(e) => pick(e.target.value)}>
            <option value="">{!open ? "Loading…" : open.bills.length ? "Choose…" : "No open bills"}</option>
            {open?.bills.map((b) => <option key={b.id} value={b.id}>{b.docNo} · {b.vendorInvoiceNo} · due {dateLabel(b.dueDate)} · Rs {amt(b.balanceAmount)}</option>)}
          </select>
        </Field>
        <Field label="Amount" required error={err?.fields.amount} hint={`At most Rs ${amt(max)}`}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function RefundModal({ dn, options: o, onClose, onDone }: { dn: DebitNote; options: PurchaseOptions; onClose: () => void; onDone: (label: string) => void }) {
  const [date, setDate] = useState(isoDay(new Date()));
  const [amount, setAmount] = useState(String(dn.balanceAmount));
  const [account, setAccount] = useState(o.bankAccounts[0] ? `b:${o.bankAccounts[0].id}` : o.cashAccounts[0] ? `c:${o.cashAccounts[0].id}` : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    const [kind, accId] = account.split(":");
    try {
      const d = await refundDebitNote(dn.id, { rowVersion: dn.rowVersion, date, amount: n(amount), bankAccountId: kind === "b" ? accId : null, cashAccountId: kind === "c" ? accId : null });
      onDone(`${d.docNo}: refund of Rs ${amt(n(amount))} recorded`);
    } catch (e) {
      setErr(e instanceof ApiError ? { message: e.message, fields: Object.fromEntries(Object.entries(e.details ?? {}).map(([key, v]) => [key, v[0] ?? ""])) } : { message: "That didn’t work", fields: {} });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Record refund · ${dn.docNo}`} subtitle={`The vendor paid back part or all of the open Rs ${amt(dn.balanceAmount)}. Posts a bank / cash receipt.`} foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn primary" onClick={go} disabled={busy || !account || !(n(amount) > 0)}>{busy ? "Recording…" : "Record refund"}</button></>
    }>
      {err && <Banner tone="danger" title="Not recorded">{err.message}</Banner>}
      <FormGrid cols={3}>
        <Field label="Date" required error={err?.fields.date}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Amount" required error={err?.fields.amount} hint={`At most Rs ${amt(dn.balanceAmount)}`}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Received into" required error={err?.fields.bankAccountId ?? err?.fields.cashAccountId}>
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Choose…</option>
            {o.bankAccounts.length > 0 && <optgroup label="Bank">{o.bankAccounts.map((b) => <option key={b.id} value={`b:${b.id}`}>{b.title}{b.last4 ? ` ·${b.last4}` : ""}</option>)}</optgroup>}
            {o.cashAccounts.length > 0 && <optgroup label="Cash">{o.cashAccounts.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup>}
          </select>
        </Field>
      </FormGrid>
    </Modal>
  );
}
