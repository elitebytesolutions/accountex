"use client";

import { BadgeDollarSign, Ban, Check, CircleDashed, Download, Eye, HandCoins, Landmark, Scroll, Search, Split, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CustomerOpenItems, CustomerReceipt, CustomerReceiptList, ReceivablesOptions, SalesInvoice } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { getInvoice } from "@/features/sales/api";
import { ApiError } from "@/lib/api/errors";
import { allocateReceipt, createReceipt, getReceipt, listReceipts, openItems, receivablesOptions, voidReceipt } from "../completion-api";

type Can = { post: boolean; edit: boolean };
type Err = { message: string; fields: Record<string, string> };
const PAGE = 10;
const STATUS: Record<string, { label: string; tone: Tone }> = {
  UNALLOCATED: { label: "Unallocated", tone: "warn" }, PARTLY_ALLOCATED: { label: "Part allocated", tone: "info" }, ALLOCATED: { label: "Allocated", tone: "good" },
  BOUNCED: { label: "Bounced", tone: "danger" }, VOID: { label: "Void", tone: "neutral" },
};
const CHIPS: { label: string; status: string }[] = [
  { label: "All", status: "" }, { label: "Allocated", status: "ALLOCATED" }, { label: "Part allocated", status: "PARTLY_ALLOCATED" },
  { label: "Unallocated", status: "UNALLOCATED" }, { label: "Bounced", status: "BOUNCED" }, { label: "Void", status: "VOID" },
];
const LIVE = ["UNALLOCATED", "PARTLY_ALLOCATED", "ALLOCATED"];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (s: string) => { const x = Number(String(s).replace(/,/g, "")); return Number.isFinite(x) ? x : 0; };
const errOf = (e: unknown, fallback: string): Err => ({
  message: e instanceof ApiError ? e.message : fallback,
  fields: e instanceof ApiError ? Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]) => [k, v[0] ?? ""])) : {},
});

function ReceiptStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

function dueNote(i: CustomerOpenItems["invoices"][number]) {
  if (i.daysOverdue > 0) return <small style={{ color: "var(--danger)" }}>Overdue {i.daysOverdue} day{i.daysOverdue === 1 ? "" : "s"}</small>;
  return <small>Due {dateLabel(i.dueDate)}</small>;
}

/** Oldest-due first, up to `total`. */
function fifo(invoices: CustomerOpenItems["invoices"], total: number) {
  let left = r2(total);
  const out: Record<string, string> = {};
  for (const i of invoices) {
    if (left <= 0) break;
    const a = r2(Math.min(left, i.balanceAmount));
    if (a > 0) out[i.id] = amt(a);
    left = r2(left - a);
  }
  return out;
}

/**
 * Template app/receivables/receipts (41-acc-trade.html "Receipts & Allocation"): KPIs, recent receipts, the Receive Payment
 * panel (customer → open invoices with allocation, cash / bank / cheque / online, WHT deducted, bank charges) and the
 * allocate modal. A receipt is recorded and posted in one step; a cheque goes to Cheques in hand and is cleared in the
 * cheque register. `?id=` opens a receipt, `?invoice=` starts a receipt for that invoice.
 */
export function ReceiptsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const [options, setOptions] = useState<ReceivablesOptions | null>(null);
  const [optErr, setOptErr] = useState<{ message: string; reference?: string } | null>(null);
  const [n, setN] = useState(0);
  const reload = () => setN((x) => x + 1);
  const [openId, setOpenId] = useState<string | null>(() => params.get("id"));
  const [alloc, setAlloc] = useState<CustomerReceipt | null>(null);
  const [pickAlloc, setPickAlloc] = useState(false);
  const [list, setList] = useState<CustomerReceiptList | null>(null);

  useEffect(() => {
    let off = false;
    receivablesOptions().then((o) => !off && setOptions(o))
      .catch((e: unknown) => !off && setOptErr(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the receipt options" }));
    return () => { off = true; };
  }, [n]);

  if (optErr && !options) return <ErrorState message={optErr.message} reference={optErr.reference} onRetry={reload} />;
  const k = list?.kpis;
  const bounced = list?.counts.BOUNCED ?? 0;
  const exportCsv = () => downloadCsv(`customer-receipts-${isoDay(new Date())}.csv`, [
    ["Receipt #", "Customer", "Date", "Method", "Reference", "Received", "WHT", "Bank charges", "Allocated", "Unallocated", "Status"],
    ...(list?.items ?? []).map((r) => [r.docNo, r.customer.name, r.docDate, r.method, r.reference ?? "", r.amountReceived, r.whtAmount, r.bankCharges, r.allocatedAmount, r.unallocatedAmount, STATUS[r.status]?.label ?? r.status]),
  ]);

  return (
    <>
      <PageHead
        eyebrow="Receivables / Receipts"
        title="Receipts & Allocation"
        description="Record customer payments, capture WHT deducted at source and allocate against open invoices."
        actions={
          <>
            <Button icon={<Download />} disabled={!list?.items.length} onClick={exportCsv}>Export</Button>
            <ButtonLink icon={<Scroll />} href="/bank/cheque-register">Cheques</ButtonLink>
            {can.edit && <Button variant="primary" icon={<Split />} onClick={() => setPickAlloc(true)}>Allocate advance</Button>}
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Collected (this month)</span><span className="icon-well"><BadgeDollarSign /></span></div><strong>{k ? rs(k.receivedMtd) : "—"}</strong><small>{k ? `${k.receivedMtdCount} receipt${k.receivedMtdCount === 1 ? "" : "s"}` : " "}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Cheques in Hand</span><span className="icon-well"><Landmark /></span></div><strong>{k ? rs(k.chequesInHand) : "—"}</strong><small>{k ? `${k.chequesInHandCount} to clear in the register` : " "}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Unallocated Cash</span><span className="icon-well"><CircleDashed /></span></div><strong>{k ? rs(k.unallocated) : "—"}</strong><small>{list ? `${(list.counts.UNALLOCATED ?? 0) + (list.counts.PARTLY_ALLOCATED ?? 0)} receipt(s) to allocate` : " "}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Bounced Cheques</span><span className="icon-well"><Ban /></span></div><strong>{list ? bounced : "—"}</strong><small className={bounced ? "down" : undefined}>{bounced ? "Invoices re-opened" : "None"}</small></div>
      </div>

      <div className="split">
        <ReceiptsList n={n} options={options} onOpen={setOpenId} onLoaded={setList} />
        {can.post ? (
          options ? <ReceiveForm key={params.get("invoice") ?? "new"} options={options} invoiceId={params.get("invoice")}
            onSaved={(r) => { toast(`${r.docNo} recorded${r.cheque ? " · cheque in hand" : ""}`, { tone: "good" }); reload(); setOpenId(r.id); }} /> : <Skeleton style={{ height: 480 }} />
        ) : (
          <div className="panel"><EmptyState icon={<HandCoins />} title="Receipts are read-only for you" description="Recording customer receipts needs the receipt posting permission." /></div>
        )}
      </div>

      <ReceiptDrawer key={`${openId ?? "none"}-${n}`} id={openId} can={can} onClose={() => setOpenId(null)} onChanged={reload} onAllocate={setAlloc} />
      {alloc && <AllocateModal receipt={alloc} onClose={() => setAlloc(null)} onDone={(r) => { setAlloc(null); toast(`${r.docNo} allocated`, { tone: "good" }); reload(); }} />}
      {pickAlloc && <PickReceiptModal items={list?.items.filter((r) => LIVE.includes(r.status) && r.unallocatedAmount > 0) ?? []} onClose={() => setPickAlloc(false)}
        onPick={async (id) => { setPickAlloc(false); try { setAlloc(await getReceipt(id)); } catch (e) { toast(errOf(e, "Could not load the receipt").message, { tone: "danger" }); } }} />}
    </>
  );
}

// ---------------------------------------------------------------- receive payment panel
function ReceiveForm({ options: o, invoiceId, onSaved }: { options: ReceivablesOptions; invoiceId: string | null; onSaved: (r: CustomerReceipt) => void }) {
  const today = isoDay(new Date());
  const [h, setH] = useState({ customerId: "", docDate: today, method: "IBFT", bankAccountId: "", cashAccountId: "", reference: "", amount: "", wht: "", whtSection: "", charges: "", memo: "" });
  const [items, setItems] = useState<CustomerOpenItems | null>(null);
  const [rows, setRows] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err | null>(null);
  const [inv, setInv] = useState<SalesInvoice | null>(null);

  // ?invoice=: that invoice's customer, its balance received and allocated
  useEffect(() => {
    if (!invoiceId) return;
    let off = false;
    getInvoice(invoiceId).then((x) => {
      if (off) return;
      setInv(x);
      setH((v) => ({ ...v, customerId: x.customer.id, amount: amt(x.balanceAmount) }));
      setRows({ [x.id]: amt(x.balanceAmount) });
    }).catch(() => undefined);
    return () => { off = true; };
  }, [invoiceId]);

  useEffect(() => {
    if (!h.customerId) return;
    let off = false;
    openItems(h.customerId).then((x) => !off && setItems(x)).catch(() => !off && setItems(null));
    return () => { off = true; };
  }, [h.customerId]);

  const method = h.method;
  const needsCash = method === "CASH";
  const needsBank = method === "IBFT" || method === "RAAST";
  const settled = r2(num(h.amount) + num(h.wht) + num(h.charges));
  const allocated = r2(Object.values(rows).reduce((s, v) => s + num(v), 0));
  const left = r2(settled - allocated);
  const methods = o.lookups.receiptMethods.length ? o.lookups.receiptMethods : [{ code: "IBFT", label: "Bank transfer" }, { code: "CHEQUE", label: "Cheque" }, { code: "CASH", label: "Cash" }];
  const invoices = items?.invoices ?? [];
  const toggle = (id: string, bal: number, on: boolean) => setRows((x) => { const y = { ...x }; if (on) y[id] = amt(Math.max(0, Math.min(bal, left > 0 ? left : bal))); else delete y[id]; return y; });

  const setCustomer = (id: string) => { setH({ ...h, customerId: id }); setItems(null); setRows({}); setInv(null); };
  const clear = () => { setRows({}); setErr(null); };
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const allocations = Object.entries(rows).map(([invoiceId, v]) => ({ invoiceId, amount: num(v) })).filter((a) => a.amount > 0);
      const r = await createReceipt({
        docDate: h.docDate, customerId: h.customerId, method, bankAccountId: needsCash ? null : h.bankAccountId || null, cashAccountId: needsCash ? h.cashAccountId || null : null,
        reference: h.reference || null, amountReceived: num(h.amount), whtAmount: num(h.wht), whtSection: num(h.wht) > 0 ? h.whtSection || null : null,
        bankCharges: num(h.charges), memo: h.memo || null, allocations,
      });
      setH((v) => ({ ...v, reference: "", amount: "", wht: "", whtSection: "", charges: "", memo: "" }));
      setRows({});
      setItems(null);
      if (h.customerId) openItems(h.customerId).then(setItems).catch(() => undefined);
      onSaved(r);
    } catch (e) {
      const x = errOf(e, "Could not record the receipt");
      if (e instanceof ApiError && (e.code === "ALLOCATION_EXCEEDS_RECEIPT" || e.code === "ALLOCATION_EXCEEDS_BALANCE")) x.fields.allocations = e.message;
      setErr(x);
    } finally {
      setBusy(false);
    }
  };
  const allocErr = err?.fields.allocations ?? Object.entries(err?.fields ?? {}).find(([k2]) => k2.startsWith("allocations."))?.[1];

  return (
    <div className="panel" data-po-alloc>
      <div className="panel-head"><div><h3>Receive Payment</h3><p>{inv ? `Against ${inv.docNo}` : "Number given on save"}</p></div><Badge tone="info">New</Badge></div>
      {err && <Banner tone="danger" title="Not recorded">{err.message}</Banner>}
      <div className="po-rc">
        <div className="po-rc-l">
          <FormGrid>
            <Field label="Customer" required full error={err?.fields.customerId}>
              <select value={h.customerId} onChange={(e) => setCustomer(e.target.value)}>
                <option value="">Choose a customer…</option>
                {o.customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ""}</option>)}
              </select>
            </Field>
            <Field label="Date" error={err?.fields.docDate}><input type="date" value={h.docDate} onChange={(e) => setH({ ...h, docDate: e.target.value })} /></Field>
            <Field label="Amount received" required error={err?.fields.amountReceived}><input inputMode="decimal" data-amt value={h.amount} placeholder="0.00" onChange={(e) => setH({ ...h, amount: e.target.value })} /></Field>
            <Field label="Method" full error={err?.fields.method}><span hidden /></Field>
          </FormGrid>
          <div className="seg mb" role="group" aria-label="Method">
            {methods.map((m) => <button key={m.code} type="button" className={cn(method === m.code && "active")} onClick={() => setH({ ...h, method: m.code })}>{m.label}</button>)}
          </div>
          <FormGrid>
            {needsCash ? (
              <Field label="Cash account" required error={err?.fields.cashAccountId}>
                <select value={h.cashAccountId} onChange={(e) => setH({ ...h, cashAccountId: e.target.value })}>
                  <option value="">Choose…</option>{o.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label={method === "CHEQUE" ? "Deposit to (optional)" : "Deposit to"} required={needsBank} error={err?.fields.bankAccountId}>
                <select value={h.bankAccountId} onChange={(e) => setH({ ...h, bankAccountId: e.target.value })}>
                  <option value="">{needsBank ? "Choose…" : method === "CHEQUE" ? "Decide when depositing" : "Card / wallet clearing"}</option>
                  {o.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.title}{b.last4 ? ` — ${b.last4}` : ""}</option>)}
                </select>
              </Field>
            )}
            <Field label={method === "CHEQUE" ? "Cheque #" : "Reference"} required={method === "CHEQUE"} error={err?.fields.reference}>
              <input value={h.reference} inputMode={method === "CHEQUE" ? "numeric" : undefined} placeholder={method === "CHEQUE" ? "4–10 digits" : "IBFT / slip reference"} onChange={(e) => setH({ ...h, reference: e.target.value })} />
            </Field>
            <Field label="WHT deducted" error={err?.fields.whtAmount}><input inputMode="decimal" value={h.wht} placeholder="0.00" onChange={(e) => setH({ ...h, wht: e.target.value })} /></Field>
            <Field label="Bank charges" error={err?.fields.bankCharges}><input inputMode="decimal" value={h.charges} placeholder="0.00" onChange={(e) => setH({ ...h, charges: e.target.value })} /></Field>
            {num(h.wht) > 0 && <Field label="WHT section" error={err?.fields.whtSection}><input value={h.whtSection} placeholder="e.g. 153(1)(a)" onChange={(e) => setH({ ...h, whtSection: e.target.value })} /></Field>}
            <Field label="Memo" full><input value={h.memo} placeholder="Optional note" onChange={(e) => setH({ ...h, memo: e.target.value })} /></Field>
          </FormGrid>
          {method === "CHEQUE" && <Banner tone="info" title="Cheque goes to Cheques in hand">It is recorded in the cheque register as in hand. Deposit and clear it there to move the money to the bank; a bounce re-opens the invoices.</Banner>}
        </div>
        <div className="po-rc-r">
          <h4 className="mt">Allocate to open invoices</h4>
          {!h.customerId ? <p className="muted">Choose a customer to see their open invoices.</p> : items?.customer.id !== h.customerId ? <Skeleton style={{ height: 160 }} /> : !invoices.length ? (
            <p className="muted">No open invoices — the receipt stays unallocated as a customer advance.</p>
          ) : (
            <div className="table-wrap"><table className="tbl lines" data-plain>
              <thead><tr><th /><th>Invoice</th><th className="num">Due</th><th className="num">Allocate</th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td><input type="checkbox" aria-label={`Allocate to ${i.docNo}`} checked={i.id in rows} onChange={(e) => toggle(i.id, i.balanceAmount, e.target.checked)} /></td>
                    <td><b><Link className="link" href={`/sales/invoices/${i.id}`}>{i.docNo}</Link></b>{dueNote(i)}</td>
                    <td className="num">{amt(i.balanceAmount)}</td>
                    <td><input className="cell-input num" inputMode="decimal" aria-label={`Amount for ${i.docNo}`} value={rows[i.id] ?? "0.00"}
                      onChange={(e) => setRows((x) => ({ ...x, [i.id]: e.target.value }))} /></td>
                  </tr>
                ))}
                {items?.credits.map((c) => (
                  <tr key={c.id}><td /><td><b>{c.docNo}</b><small>Open credit · use from the credit note</small></td><td className="num cr">−{amt(c.balanceAmount)}</td><td className="num zero">—</td></tr>
                ))}
              </tbody>
            </table></div>
          )}
          {allocErr && <p className="hint" style={{ color: "var(--danger)" }}>{allocErr}</p>}
          <div className="dl mt">
            <div><span>Allocated</span><b>{rs(allocated)}</b></div>
            <div><span>Unallocated (customer advance)</span><b style={{ color: left < 0 ? "var(--danger)" : left > 0 ? "var(--warn)" : undefined }}>{left < 0 ? `Over by ${rs(-left)}` : rs(left)}</b></div>
          </div>
          <div className="row mt"><Button size="sm" variant="ghost" icon={<WandSparkles />} disabled={!invoices.length || settled <= 0} onClick={() => setRows(fifo(invoices, settled))}>Auto allocate (oldest first)</Button></div>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={clear} disabled={busy}>Clear</button>
        <button type="button" className="btn primary" disabled={busy || !h.customerId || num(h.amount) <= 0 || left < 0} onClick={() => void save()}><Check />{busy ? "Saving…" : "Save & allocate"}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- receipts list
function ReceiptsList({ n, options, onOpen, onLoaded }: { n: number; options: ReceivablesOptions | null; onOpen: (id: string) => void; onLoaded: (l: CustomerReceiptList) => void }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomerReceiptList | null>(null);
  const [err, setErr] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let off = false;
    listReceipts({ status, search, customer, page, pageSize: PAGE })
      .then((l) => { if (!off) { setData(l); setErr(null); onLoaded(l); } })
      .catch((e: unknown) => !off && setErr(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load receipts" }));
    return () => { off = true; };
    // onLoaded is a state setter from the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, customer, page, attempt, n]);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const count = (s: string) => (data ? (s ? data.counts[s] ?? 0 : Object.values(data.counts).reduce((a, b) => a + b, 0)) : 0);
  const filtered = !!(status || search || customer);
  const methodLabel = useMemo(() => Object.fromEntries((options?.lookups.receiptMethods ?? []).map((m) => [m.code, m.label])), [options]);

  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Recent receipts</h3><p>Newest first</p></div></div>
      <div className="toolbar">
        <label className="search-field"><Search /><input placeholder="Search receipt, cheque #, reference…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
        <select value={customer} aria-label="Customer" onChange={(e) => { setCustomer(e.target.value); setPage(1); }}>
          <option value="">All customers</option>{options?.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="chips">
          {CHIPS.map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); }}>{c.label} <i>{count(c.status)}</i></button>)}
        </div>
      </div>
      {err && !data ? <ErrorState message={err.message} reference={err.reference} onRetry={() => setAttempt((x) => x + 1)} /> : !data ? <Skeleton style={{ height: 300 }} /> : !data.items.length ? (
        <EmptyState icon={<HandCoins />} title={filtered ? "No receipts match" : "No customer receipts yet"} description={filtered ? "Try another status, customer or search." : "Record the first payment with Receive Payment."} />
      ) : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Receipt #</th><th>Customer</th><th>Date</th><th>Method</th><th className="num">Received</th><th className="num">WHT</th><th>Status</th><th /></tr></thead>
          <tbody>{data.items.map((r) => (
            <tr key={r.id}>
              <td><a className="link" href={`/receivables/receipts?id=${r.id}`} onClick={(e) => { e.preventDefault(); onOpen(r.id); }}><Hl text={r.docNo} q={search} /></a>
                {r.unallocatedAmount > 0 && LIVE.includes(r.status) ? <small style={{ color: "var(--warn)" }}>{amt(r.unallocatedAmount)} unallocated</small> : r.posShiftId ? <small>POS</small> : null}</td>
              <td><div className="cell-user"><span className="avatar sm">{r.customer.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span><div><b>{r.customer.name}</b><small>{r.bankAccount?.title ?? r.cashAccount?.name ?? (r.method === "CHEQUE" ? "Cheques in hand" : "—")}</small></div></div></td>
              <td>{dateLabel(r.docDate)}</td>
              <td>{methodLabel[r.method] ?? r.method}{r.method === "CHEQUE" && r.reference ? ` #${r.reference}` : ""}</td>
              <td className="num">{amt(r.amountReceived)}</td>
              <td className={cn("num", !r.whtAmount && "zero")}>{r.whtAmount ? amt(r.whtAmount) : "—"}</td>
              <td><ReceiptStatus status={r.status} /></td>
              <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Open ${r.docNo}`} onClick={() => onOpen(r.id)}><Eye /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {data && data.total > 0 && (
        <div className="table-foot">
          <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + data.items.length} of {data.total}</span>
          <div className="pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹</button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((x) => <button key={x} type="button" className={cn(x === page && "active")} onClick={() => setPage(x)}>{x}</button>)}
            <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- receipt drawer
type Tab = "details" | "history";

function ReceiptDrawer({ id, can, onClose, onChanged, onAllocate }: { id: string | null; can: Can; onClose: () => void; onChanged: () => void; onAllocate: (r: CustomerReceipt) => void }) {
  const toast = useToast();
  const [r, setR] = useState<CustomerReceipt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [voiding, setVoiding] = useState(false);
  const [m, setM] = useState(0);
  useEffect(() => {
    if (!id) return;
    let off = false;
    getReceipt(id).then((x) => !off && setR(x)).catch((e: unknown) => !off && setErr(errOf(e, "Could not load the receipt").message));
    return () => { off = true; };
  }, [id, m]);
  const live = !!r && LIVE.includes(r.status);

  const actions = r ? (
    <>
      {live && can.edit && <Button variant="primary" icon={<Split />} onClick={() => onAllocate(r)}>Reallocate</Button>}
      {r.status !== "VOID" && can.post && <Button variant="ghost" icon={<Ban />} onClick={() => setVoiding(true)}>Void</Button>}
    </>
  ) : undefined;

  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={r ? r.docNo : "Receipt"} subtitle={r ? `${r.customer.name} · ${dateLabel(r.docDate)}` : undefined} foot={actions}>
        {err ? <ErrorState message={err} onRetry={() => { setErr(null); setM((x) => x + 1); }} /> : !r ? <Skeleton style={{ height: 420 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><ReceiptStatus status={r.status} />{(r.voidReason ?? r.bounceReason) && <small className="muted">{r.voidReason ?? r.bounceReason}</small>}</div>
            <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <>
                <div className="dl mt">
                  <div><span>Customer</span><b>{r.customer.code} · {r.customer.name}</b></div>
                  <div><span>Method</span><b>{r.method}{r.reference ? ` · ${r.method === "CHEQUE" ? "cheque " : ""}${r.reference}` : ""}</b></div>
                  <div><span>Received into</span><b>{r.cashAccount?.name ?? r.bankAccount?.title ?? (r.method === "CHEQUE" ? "Cheques in hand" : "Clearing account")}</b></div>
                  <div><span>Amount received</span><b>Rs {amt(r.amountReceived)}</b></div>
                  {r.whtAmount > 0 && <div><span>WHT deducted by customer</span><b>Rs {amt(r.whtAmount)}{r.whtSection ? ` · ${r.whtSection}` : ""}</b></div>}
                  {r.bankCharges > 0 && <div><span>Bank charges</span><b>Rs {amt(r.bankCharges)}</b></div>}
                  <div><span>Settles</span><b>Rs {amt(r.settledAmount)}</b></div>
                  <div><span>Allocated</span><b>Rs {amt(r.allocatedAmount)}{r.unallocatedAmount > 0 ? ` · Rs ${amt(r.unallocatedAmount)} unallocated` : ""}</b></div>
                  {r.cheque && <div><span>Cheque</span><b><Link className="link" href="/bank/cheque-register">{r.cheque.docNo}</Link> · {r.cheque.status.replace(/_/g, " ").toLowerCase()}</b></div>}
                  {r.journal && <div><span>Journal</span><b><Link className="link" href={`/accounting/vouchers/${r.journal.id}`}>{r.journal.docNo}</Link></b></div>}
                  {r.bouncedAt && <div><span>Bounced</span><b>{dateLabel(r.bouncedAt.slice(0, 10))}</b></div>}
                  {r.voidedAt && <div><span>Voided</span><b>{dateLabel(r.voidedAt.slice(0, 10))}</b></div>}
                  {r.memo && <div><span>Memo</span><b>{r.memo}</b></div>}
                  {r.createdBy && <div><span>Recorded by</span><b>{r.createdBy.name}</b></div>}
                </div>
                {r.cheque?.status === "IN_HAND" && <Banner tone="info" title="Cheque in hand">Deposit and clear it in the cheque register to move the money to the bank.</Banner>}
                <div className="table-wrap mt"><table className="tbl">
                  <thead><tr><th>Applied to</th><th>Date</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {r.allocations.length ? r.allocations.map((a) => (
                      <tr key={a.id}>
                        <td><b>{a.invoice ? <Link className="link" href={`/sales/invoices/${a.invoice.id}`}>{a.invoice.docNo}</Link> : a.creditNote?.docNo ?? "—"}</b>{a.isAutoFifo && <small>Auto (oldest first)</small>}</td>
                        <td>{dateLabel(a.date)}</td>
                        <td className="num">{amt(a.amount)}</td>
                      </tr>
                    )) : <tr><td colSpan={3} className="muted">Not allocated — held as a customer advance.</td></tr>}
                  </tbody>
                </table></div>
              </>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Sales" table="CustomerReceipts" id={r.id} /></div>}
          </>
        )}
      </Drawer>
      {voiding && r && <VoidModal receipt={r} onClose={() => setVoiding(false)} onDone={(x) => { setVoiding(false); toast(`${x.docNo} voided · invoices re-opened`, { tone: "good" }); setM((v) => v + 1); onChanged(); }} />}
    </>
  );
}

function VoidModal({ receipt, onClose, onDone }: { receipt: CustomerReceipt; onClose: () => void; onDone: (r: CustomerReceipt) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      onDone(await voidReceipt(receipt.id, receipt.rowVersion, reason.trim()));
    } catch (e) {
      setErr(errOf(e, "Could not void the receipt").message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Void ${receipt.docNo}`}
      subtitle={receipt.cheque ? "The journal is reversed, allocations are removed and the cheque is cancelled in the register." : "The journal is reversed and its allocations are removed."}
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn danger" onClick={() => void go()} disabled={busy || reason.trim().length < 3}>{busy ? "Working…" : "Void receipt"}</button></>}>
      <FormGrid cols={1}>
        <Field label="Reason" required error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this receipt voided?" /></Field>
      </FormGrid>
    </Modal>
  );
}

function PickReceiptModal({ items, onClose, onPick }: { items: CustomerReceiptList["items"]; onClose: () => void; onPick: (id: string) => void }) {
  const [id, setId] = useState("");
  return (
    <Modal open onClose={onClose} title="Allocate an advance" subtitle="Receipts on this page with an unallocated balance"
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!id} onClick={() => onPick(id)}><Split />Continue</button></>}>
      {!items.length ? <EmptyState icon={<Split />} title="Nothing to allocate" description="No receipt on this page has an unallocated balance. Filter by Unallocated to find older ones." /> : (
        <FormGrid cols={1}>
          <Field label="Receipt">
            <select value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Choose…</option>
              {items.map((r) => <option key={r.id} value={r.id}>{r.docNo} · {r.customer.name} · Rs {amt(r.unallocatedAmount)}</option>)}
            </select>
          </Field>
        </FormGrid>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- allocate / reallocate (#po-rcpt-alloc)
function AllocateModal({ receipt: r, onClose, onDone }: { receipt: CustomerReceipt; onClose: () => void; onDone: (r: CustomerReceipt) => void }) {
  const [items, setItems] = useState<CustomerOpenItems | null>(null);
  const held = useMemo(() => Object.fromEntries(r.allocations.filter((a) => a.invoice).map((a) => [a.invoice!.id, a.amount])), [r]);
  const [rows, setRows] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(held).map(([k, v]) => [k, amt(v)])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    openItems(r.customer.id).then((x) => !off && setItems(x)).catch((e: unknown) => !off && setErr(errOf(e, "Could not load open invoices").message));
    return () => { off = true; };
  }, [r.customer.id]);

  // invoices this receipt already settles may be fully paid: add them back with what it holds on them
  const invoices = useMemo(() => {
    const open = (items?.invoices ?? []).map((i) => ({ ...i, balanceAmount: r2(i.balanceAmount + (held[i.id] ?? 0)) }));
    const extra = r.allocations.filter((a) => a.invoice && !open.some((i) => i.id === a.invoice!.id))
      .map((a) => ({ id: a.invoice!.id, docNo: a.invoice!.docNo, docDate: a.date, dueDate: a.date, netAmount: a.amount, balanceAmount: a.amount, daysOverdue: 0 }));
    return [...extra, ...open];
  }, [items, held, r.allocations]);
  const allocated = r2(Object.values(rows).reduce((s, v) => s + num(v), 0));
  const left = r2(r.settledAmount - allocated);
  const pct = r.settledAmount ? Math.min(100, Math.round((allocated / r.settledAmount) * 100)) : 0;
  const apply = async () => {
    setBusy(true);
    setErr(null);
    try {
      const allocations = Object.entries(rows).map(([invoiceId, v]) => ({ invoiceId, amount: num(v) })).filter((a) => a.amount > 0);
      onDone(await allocateReceipt(r.id, r.rowVersion, allocations));
    } catch (e) {
      setErr(errOf(e, "Could not allocate the receipt").message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={`Allocate ${r.docNo}`} subtitle={`${r.customer.name} · received ${dateLabel(r.docDate)}`} foot={
      <>
        <Button variant="ghost" icon={<WandSparkles />} disabled={!invoices.length} onClick={() => setRows(fifo(invoices, r.settledAmount))}>Auto allocate (oldest first)</Button>
        <span className="spacer" />
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy || left < 0} title={left < 0 ? "Allocated more than the receipt settles" : ""} onClick={() => void apply()}><Check />{busy ? "Applying…" : "Apply allocation"}</button>
      </>
    }>
      <div data-po-alloc>
        {err && <Banner tone="danger" title="Not allocated">{err}</Banner>}
        <FormGrid cols={3}>
          <Field label="Receipt amount"><input readOnly value={amt(r.settledAmount)} /></Field>
          <Field label="Allocation date"><input type="date" readOnly value={isoDay(new Date())} /></Field>
          <Field label="WHT certificate"><select disabled value={r.whtAmount > 0 ? "NY" : "NA"}><option value="NA">Not applicable</option><option value="NY">Not yet received</option></select></Field>
        </FormGrid>
        {!items && !err ? <Skeleton style={{ height: 180 }} /> : !invoices.length ? (
          <EmptyState icon={<Split />} title="No open invoices" description="This customer has no posted invoice with a balance." />
        ) : (
          <div className="table-wrap mt"><table className="tbl lines" data-plain>
            <thead><tr><th /><th>Document</th><th className="num">Open balance</th><th className="num">Allocate</th></tr></thead>
            <tbody>{invoices.map((i) => (
              <tr key={i.id}>
                <td><input type="checkbox" aria-label={`Allocate to ${i.docNo}`} checked={i.id in rows}
                  onChange={(e) => setRows((x) => { const y = { ...x }; if (e.target.checked) y[i.id] = amt(Math.max(0, Math.min(i.balanceAmount, left))); else delete y[i.id]; return y; })} /></td>
                <td><b>{i.docNo}</b>{i.daysOverdue > 0 ? <small className="neg">Overdue {i.daysOverdue} days</small> : <small>Due {dateLabel(i.dueDate)}</small>}</td>
                <td className="num">{amt(i.balanceAmount)}</td>
                <td><input className="cell-input num" inputMode="decimal" value={rows[i.id] ?? "0.00"} onChange={(e) => setRows((x) => ({ ...x, [i.id]: e.target.value }))} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="po-alloc-sum mt">
          <div className="progress"><i style={{ width: `${pct}%` }} /></div>
          <div className="dl">
            <div><span>Allocated</span><b>{rs(allocated)}</b></div>
            <div><span>Left as customer advance</span><b style={{ color: left < 0 ? "var(--danger)" : "var(--warn)" }}>{left < 0 ? `Over by ${rs(-left)}` : rs(left)}</b></div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
