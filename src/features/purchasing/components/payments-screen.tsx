"use client";

import { Ban, Check, Download, Eye, ListChecks, Pencil, Plus, Printer, Scroll, Search, Send, Split, Trash2, Undo2, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  allocateOldestFirst, allocationWht, type ApprovalDetail, type ApprovalStep, type OpenBill, type OpenItems, type PaymentRunResult, type PurchaseOptions, type VendorPayment,
  type VendorPaymentList,
} from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
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
  allocatePayment, approvePayment, createPayment, deletePayment, getPayment, listPayments, openItems, paymentAction, purchaseOptions, rejectPayment, reverseAllocation,
  runPayments, updatePayment, voidPayment,
} from "../api";

type Can = { view: boolean; create: boolean; edit: boolean; post: boolean };
type Routing = { workflow: { id: string; name: string }; steps: ApprovalStep[] } | null;
type Pick = { amount: string; whtRate: string; whtSection: string };
const PAGE = 10;
const METHODS: [string, string][] = [["IBFT", "IBFT / bank transfer"], ["CHEQUE", "Cheque"], ["PAY_ORDER", "Pay order"], ["CASH", "Cash"], ["ONLINE", "Online"]];
const METHOD_LABEL = Object.fromEntries(METHODS.map(([k, v]) => [k, v.split(" / ")[0]!]));
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, PENDING_APPROVAL: { label: "Pending approval", tone: "warn" }, POSTED: { label: "Posted", tone: "info" },
  PRESENTED: { label: "Presented", tone: "warn" }, CLEARED: { label: "Cleared", tone: "good" }, VOID: { label: "Void", tone: "danger" },
};
const CHIPS: { label: string; status: string; keys: string[] }[] = [
  { label: "All", status: "", keys: [] }, { label: "Draft", status: "DRAFT", keys: ["DRAFT"] }, { label: "Pending Approval", status: "PENDING_APPROVAL", keys: ["PENDING_APPROVAL"] },
  { label: "Posted", status: "POSTED", keys: ["POSTED"] }, { label: "Presented", status: "PRESENTED", keys: ["PRESENTED"] }, { label: "Cleared", status: "CLEARED", keys: ["CLEARED"] },
  { label: "Void", status: "VOID", keys: ["VOID"] },
];
const LIVE = ["POSTED", "PRESENTED", "CLEARED"];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (s: string) => { const x = Number(String(s).replace(/,/g, "")); return Number.isFinite(x) ? x : 0; };
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const fields = (e: unknown) => (e instanceof ApiError ? Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]) => [k, v[0] ?? ""])) : {});

function PayStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

function dueNote(b: OpenBill, today: string) {
  if (b.daysOverdue > 0) return <small style={{ color: "var(--danger)" }}>{b.daysOverdue} day{b.daysOverdue === 1 ? "" : "s"} overdue</small>;
  if (b.dueDate === today) return <small>Due today</small>;
  return null;
}

/** Template app/payables/payments (41-acc-trade.html "Payment Run"): bills to pay, payment details, recent payments, allocate on-account modal. */
export function PaymentsScreen({ can, userId }: { can: Can; userId: string }) {
  const toast = useToast();
  const params = useSearchParams();
  const today = isoDay(new Date());
  const [options, setOptions] = useState<PurchaseOptions | null>(null);
  const [items, setItems] = useState<OpenItems | null>(null);
  const [itemsErr, setItemsErr] = useState<{ message: string; reference?: string } | null>(null);
  const [n, setN] = useState(0);
  const reload = () => setN((x) => x + 1);
  const [openId, setOpenId] = useState<string | null>(() => params.get("payment"));
  const [alloc, setAlloc] = useState<{ paymentId: string | null } | null>(null);
  const [form, setForm] = useState<{ payment: VendorPayment | null } | null>(null);

  useEffect(() => {
    if (!can.view) return;
    purchaseOptions().then(setOptions).catch(() => undefined);
  }, [can.view]);
  useEffect(() => {
    if (!can.view) return;
    let cancelled = false;
    openItems().then((x) => { if (!cancelled) { setItems(x); setItemsErr(null); } })
      .catch((e: unknown) => !cancelled && setItemsErr(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load open bills" }));
    return () => { cancelled = true; };
  }, [n, can.view]);

  // approvers without vpay:view only see the payment they were sent to
  if (!can.view) {
    return (
      <>
        <PageHead eyebrow="Payables / Payments" title="Payment Run" description="Open the payment from your approvals inbox to review it." />
        {!openId && <EmptyState icon={<Send />} title="Nothing to show" description="You can open payments that are waiting for your approval from the Approvals inbox." />}
        <PaymentDrawer key={openId ?? "none"} id={openId} can={can} userId={userId} onClose={() => setOpenId(null)} onChanged={reload} onAllocate={() => undefined} onEdit={() => undefined} />
      </>
    );
  }

  if (itemsErr && !items) return <ErrorState message={itemsErr.message} reference={itemsErr.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Payables / Payments"
        title="Payment Run"
        description="Select approved bills, choose the paying bank and generate payments, cheques and WHT entries in one go."
        actions={
          <>
            <span title="Bank file formats come with integrations"><Button icon={<Download />} disabled>Bank upload file</Button></span>
            {can.edit && <Button variant="primary" icon={<Split />} onClick={() => setAlloc({ paymentId: null })}>Allocate on-account</Button>}
            {can.create && <Button icon={<Plus />} onClick={() => setForm({ payment: null })}>New payment</Button>}
            <ButtonLink icon={<Scroll />} href="/bank/cheque-register">Cheque register</ButtonLink>
          </>
        }
      />

      {items ? (
        <PaymentRun key={params.get("bills") ?? "run"} can={can} options={options} items={items} today={today} preselect={params.get("bills")?.split(",").filter(Boolean) ?? []}
          onDone={(r) => { reload(); if (r.payments.length === 1) setOpenId(r.payments[0]!.id); }} />
      ) : <Skeleton style={{ height: 420 }} />}

      <PaymentsList n={n} options={options} onOpen={setOpenId} />

      <PaymentDrawer key={`${openId ?? "none"}-${n}`} id={openId} can={can} userId={userId} onClose={() => setOpenId(null)} onChanged={reload}
        onAllocate={(id) => setAlloc({ paymentId: id })} onEdit={(p) => { setOpenId(null); setForm({ payment: p }); }} />
      {alloc && <AllocateModal paymentId={alloc.paymentId} items={items} today={today} onClose={() => setAlloc(null)} onDone={(msg) => { setAlloc(null); toast(msg, { tone: "good" }); reload(); }} />}
      {form && options && (
        <PaymentForm payment={form.payment} options={options} today={today} onClose={() => setForm(null)}
          onSaved={(p, msg) => { setForm(null); toast(msg, { tone: "good" }); reload(); setOpenId(p.id); }} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- payment run
function PaymentRun({ can, options: o, items, today, preselect, onDone }: { can: Can; options: PurchaseOptions | null; items: OpenItems; today: string; preselect: string[]; onDone: (r: PaymentRunResult) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [due, setDue] = useState<"BY" | "ALL" | "OVERDUE">("ALL");
  const [vendor, setVendor] = useState("");
  const pickFor = (b: OpenBill): Pick => ({ amount: amt(b.balanceAmount), whtRate: "", whtSection: b.whtSection ?? "153_1_A" });
  const [picks, setPicks] = useState<Record<string, Pick>>(() => Object.fromEntries(items.bills.filter((b) => preselect.includes(b.id)).map((b) => [b.id, pickFor(b)])));
  const [h, setH] = useState({ docDate: today, method: "IBFT", account: "", branchId: "", whtTreatment: "WITHHOLD_NOW" as "WITHHOLD_NOW" | "ALREADY_WITHHELD", remarks: "" });
  const [cheques, setCheques] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PaymentRunResult | null>(null);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  const bills = items.bills;
  const cash = h.method === "CASH";
  // defaults until the user picks: the first branch and the first bank / cash account
  const branchId = h.branchId || o?.branches[0]?.id || "";
  const account = h.account || (cash ? o?.cashAccounts[0]?.id : o?.bankAccounts[0]?.id) || "";

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return bills.filter((b) => (!vendor || b.vendor.id === vendor)
      && (due === "ALL" || (due === "OVERDUE" ? b.daysOverdue > 0 : b.dueDate <= today))
      && (!s || b.docNo.toLowerCase().includes(s) || b.vendorInvoiceNo.toLowerCase().includes(s) || b.vendor.name.toLowerCase().includes(s)));
  }, [bills, vendor, due, q, today]);
  const vendors = useMemo(() => [...new Map(bills.map((b) => [b.vendor.id, b.vendor])).values()].sort((a, b) => a.name.localeCompare(b.name)), [bills]);
  const selected = bills.filter((b) => picks[b.id]);
  const withhold = h.whtTreatment === "WITHHOLD_NOW";
  const line = (b: OpenBill) => {
    const p = picks[b.id]!;
    const gross = r2(Math.min(num(p.amount), b.balanceAmount));
    const rate = withhold ? num(p.whtRate) : 0;
    return { bill: b, gross, ...(rate > 0 ? allocationWht(gross, rate) : { amount: gross, whtAmount: 0 }) };
  };
  const lines = selected.map(line);
  const byVendor = [...lines.reduce((m, l) => m.set(l.bill.vendor.id, [...(m.get(l.bill.vendor.id) ?? []), l]), new Map<string, typeof lines>()).entries()];
  const tot = { gross: r2(lines.reduce((s, l) => s + l.gross, 0)), wht: r2(lines.reduce((s, l) => s + l.whtAmount, 0)), net: r2(lines.reduce((s, l) => s + l.amount, 0)), balance: r2(selected.reduce((s, b) => s + b.balanceAmount, 0)) };

  const toggle = (b: OpenBill, on: boolean) => setPicks((x) => { const y = { ...x }; if (on) y[b.id] = pickFor(b); else delete y[b.id]; return y; });
  const toggleAll = (on: boolean) => setPicks((x) => { const y = { ...x }; for (const b of shown) { if (on) y[b.id] = y[b.id] ?? pickFor(b); else delete y[b.id]; } return y; });
  const setPick = (id: string, patch: Partial<Pick>) => setPicks((x) => ({ ...x, [id]: { ...x[id]!, ...patch } }));
  const setMethod = (m: string) => setH((x) => ({ ...x, method: m, account: "" }));

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await runPayments({
        docDate: h.docDate, branchId, method: h.method, bankAccountId: cash ? null : account || null, cashAccountId: cash ? account || null : null,
        whtTreatment: h.whtTreatment, remarks: h.remarks || null, cheques: h.method === "CHEQUE" ? cheques : {},
        bills: lines.map((l) => ({ billId: l.bill.id, amount: l.gross, whtSection: withhold && num(picks[l.bill.id]!.whtRate) > 0 ? picks[l.bill.id]!.whtSection : null, whtRate: withhold ? num(picks[l.bill.id]!.whtRate) : 0 })),
      });
      setResult(r);
      if (r.payments.length) {
        toast(`${r.payments.length} payment${r.payments.length === 1 ? "" : "s"} created${r.failed.length ? ` · ${r.failed.length} failed` : ""}`, { tone: r.failed.length ? "warn" : "good" });
        setPicks({});
        setCheques({});
      } else toast("No payment was created", { tone: "danger" });
      onDone(r);
    } catch (e) {
      setErr({ message: errMsg(e, "Could not generate the payments"), fields: fields(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="split">
      <div className="panel flush">
        <div className="panel-head"><div><h3>Bills to pay</h3><p>Posted and unpaid · sorted by due date</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search bill # or vendor…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select value={due} aria-label="Due" onChange={(e) => setDue(e.target.value as typeof due)}>
            <option value="BY">Due by {dateLabel(today)}</option><option value="ALL">All due</option><option value="OVERDUE">Overdue only</option>
          </select>
          <select value={vendor} aria-label="Vendor" onChange={(e) => setVendor(e.target.value)}>
            <option value="">All vendors</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <span className="spacer" />
          <span className="pill"><ListChecks />{selected.length} of {bills.length} selected</span>
        </div>
        {!items ? <Skeleton style={{ height: 320 }} /> : !bills.length ? (
          <EmptyState icon={<Send />} title="Nothing to pay" description="No posted bill has an open balance." />
        ) : !shown.length ? (
          <EmptyState icon={<Search />} title="No bills match" description="Try another due filter, vendor or search." />
        ) : (
          <div className="table-wrap"><table className="tbl" data-plain>
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all" checked={shown.every((b) => picks[b.id])} onChange={(e) => toggleAll(e.target.checked)} /></th>
              <th>Bill #</th><th>Vendor</th><th>Due</th><th className="num">Bill amount</th><th className="num">WHT % now</th><th className="num">Pay now</th>
            </tr></thead>
            <tbody>
              {shown.map((b) => {
                const p = picks[b.id];
                const l = p ? line(b) : null;
                const bad = (k: string) => {
                  const i = lines.findIndex((x) => x.bill.id === b.id);
                  return i >= 0 && err?.fields[`bills.${i}.${k}`] ? { borderColor: "var(--danger)" } : undefined;
                };
                return (
                  <tr key={b.id} className={cn(p && "selected")}>
                    <td><input type="checkbox" aria-label={`Select ${b.docNo}`} checked={!!p} onChange={(e) => toggle(b, e.target.checked)} /></td>
                    <td><b><Link className="link" href={`/purchases/bills/${b.id}`}><Hl text={b.docNo} q={q.trim()} /></Link></b>{dueNote(b, today) ?? <small>{b.vendorInvoiceNo}</small>}{b.isDisputed && <small style={{ color: "var(--warn)" }}>Disputed</small>}</td>
                    <td style={{ whiteSpace: "normal", minWidth: 120 }}><Hl text={b.vendor.name} q={q.trim()} /></td>
                    <td>{dateLabel(b.dueDate)}</td>
                    <td className="num">{amt(b.balanceAmount)}{b.balanceAmount !== b.netPayableAmount && <small>of {amt(b.netPayableAmount)}</small>}</td>
                    <td className="num">
                      {p && withhold ? (
                        <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
                          <input className="cell-input num" style={{ width: 48, ...bad("whtRate") }} inputMode="decimal" placeholder="0" value={p.whtRate} onChange={(e) => setPick(b.id, { whtRate: e.target.value })} />
                          {num(p.whtRate) > 0 && (
                            <select className="cell-input" style={{ width: 120, ...bad("whtSection") }} value={p.whtSection} onChange={(e) => setPick(b.id, { whtSection: e.target.value })}>
                              {(o?.whtSections ?? []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                            </select>
                          )}
                        </div>
                      ) : <span className="zero">—</span>}
                    </td>
                    <td>
                      {p ? (
                        <>
                          <input className="cell-input num" style={{ width: 92, ...bad("amount") }} inputMode="decimal" value={p.amount} onChange={(e) => setPick(b.id, { amount: e.target.value })} />
                          {l && l.whtAmount > 0 && <small className="muted">net {amt(l.amount)} · WHT {amt(l.whtAmount)}</small>}
                        </>
                      ) : (
                        <input className="cell-input num" style={{ width: 92 }} inputMode="decimal" aria-label={`Pay now on ${b.docNo}`} value="0.00"
                          onChange={(e) => setPicks((x) => ({ ...x, [b.id]: { ...pickFor(b), amount: e.target.value.replace(/^0\.00/, "") } }))} />
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="total"><td colSpan={4}>Selected ({selected.length} bill{selected.length === 1 ? "" : "s"})</td><td className="num">{amt(tot.balance)}</td><td className="num">{amt(tot.wht)}</td><td className="num">{amt(tot.gross)}</td></tr>
            </tbody>
          </table></div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Payment details</h3><p>{byVendor.length ? `${byVendor.length} payment${byVendor.length === 1 ? "" : "s"} · one per vendor` : "Select bills to pay"}</p></div></div>
        {err && <Banner tone="danger" title="Not generated">{err.message}</Banner>}
        <FormGrid>
          <Field label="Payment date" error={err?.fields.docDate}><input type="date" value={h.docDate} onChange={(e) => setH({ ...h, docDate: e.target.value })} /></Field>
          <Field label="Method" error={err?.fields.method}>
            <select value={h.method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label="Pay from" full error={err?.fields.bankAccountId ?? err?.fields.cashAccountId}>
            <select value={account} onChange={(e) => setH({ ...h, account: e.target.value })}>
              <option value="">Choose…</option>
              {cash ? o?.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : o?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.title}{b.last4 ? ` — ${b.last4}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Branch" error={err?.fields.branchId}>
            <select value={branchId} onChange={(e) => setH({ ...h, branchId: e.target.value })}>{o?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </Field>
          <Field label="WHT treatment">
            <select value={h.whtTreatment} onChange={(e) => setH({ ...h, whtTreatment: e.target.value as typeof h.whtTreatment })}>
              <option value="WITHHOLD_NOW">Withhold now (rate per bill)</option><option value="ALREADY_WITHHELD">Already withheld at bill</option>
            </select>
          </Field>
        </FormGrid>
        {h.method === "CHEQUE" && (
          <>
            <div className="form-section mt"><h4>Cheque details</h4><p>One cheque per vendor · crossed &ldquo;A/C Payee only&rdquo;</p></div>
            {byVendor.length ? (
              <FormGrid>
                {byVendor.map(([vid, ls]) => (
                  <Field key={vid} label={`Cheque # · ${ls[0]!.bill.vendor.name}`} error={err?.fields[`cheques.${vid}`]}>
                    <input inputMode="numeric" placeholder="4–10 digits" value={cheques[vid] ?? ""} onChange={(e) => setCheques((c) => ({ ...c, [vid]: e.target.value }))} />
                  </Field>
                ))}
              </FormGrid>
            ) : <p className="muted">Select bills to enter their cheque numbers.</p>}
          </>
        )}
        {byVendor.length > 0 && (
          <div className="table-wrap mt"><table className="tbl">
            <thead><tr><th>Vendor</th><th className="num">Gross</th><th className="num">WHT</th><th className="num">Net paid</th></tr></thead>
            <tbody>{byVendor.map(([vid, ls]) => (
              <tr key={vid}><td><b>{ls[0]!.bill.vendor.name}</b><small>{ls.length} bill{ls.length === 1 ? "" : "s"}</small></td>
                <td className="num">{amt(r2(ls.reduce((s, l) => s + l.gross, 0)))}</td><td className="num">{amt(r2(ls.reduce((s, l) => s + l.whtAmount, 0)))}</td><td className="num">{amt(r2(ls.reduce((s, l) => s + l.amount, 0)))}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="dl mt">
          <div><span>Gross bills settled</span><b>{rs(tot.gross)}</b></div>
          <div><span>WHT withheld now (to deposit)</span><b>{rs(tot.wht)}</b></div>
          <div><span><strong>Total payment</strong></span><b className="dl-hero">Rs {amt(tot.net)}</b></div>
        </div>
        {tot.wht > 0 && <Banner tone="info" title={`WHT challan due 15 ${new Date(Date.parse(h.docDate) + 31 * 86_400_000).toLocaleString("en-GB", { month: "short", year: "numeric" })}`}>Rs {amt(tot.wht)} withheld under section 153 goes to WHT payable for the monthly deposit.</Banner>}
        <Field label="Remarks" full><input value={h.remarks} placeholder="Payment advice note (optional)" onChange={(e) => setH({ ...h, remarks: e.target.value })} /></Field>
        <div className="form-actions">
          <span title="Payment advices come with document printing"><Button icon={<Printer />} disabled>Print advices</Button></span>
          {can.create && <Button variant="primary" icon={<Send />} disabled={busy || !lines.length || !account} onClick={() => void generate()}>{busy ? "Generating…" : "Generate payments"}</Button>}
        </div>
        {result && (
          <div className="mt">
            {result.payments.length > 0 && (
              <div className="list">{result.payments.map((p) => (
                <div key={p.id} className="list-item"><div><b>{p.docNo} · {p.vendor.name}</b><small>Rs {amt(p.amount)}{p.whtAmount ? ` · WHT ${amt(p.whtAmount)}` : ""}{p.chequeNo ? ` · cheque ${p.chequeNo}` : ""}</small></div><PayStatus status={p.status} /></div>
              ))}</div>
            )}
            {result.failed.map((f) => <Banner key={f.vendor.id} tone="danger" title={`${f.vendor.name} not paid`}>{f.message}</Banner>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- payments list
function PaymentsList({ n, options, onOpen }: { n: number; options: PurchaseOptions | null; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VendorPaymentList | null>(null);
  const [err, setErr] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listPayments({ status, search, vendor, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setErr(null); } })
      .catch((e: unknown) => !cancelled && setErr(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load payments" }));
    return () => { cancelled = true; };
  }, [status, search, vendor, page, attempt, n]);
  const k = data?.kpis;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const count = (keys: string[]) => (data ? (keys.length ? keys : Object.keys(data.counts)).reduce((s, x) => s + (data.counts[x] ?? 0), 0) : 0);
  const filtered = !!(status || search || vendor);
  const exportCsv = () => downloadCsv(`vendor-payments-${isoDay(new Date())}.csv`, [
    ["Payment #", "Vendor", "Date", "Method", "Account", "Amount", "WHT", "Unallocated", "Status"],
    ...(data?.items ?? []).map((p) => [p.docNo, p.vendor.name, p.docDate, METHOD_LABEL[p.method] ?? p.method, p.bankAccount?.title ?? p.cashAccount?.name ?? "", p.amount, p.whtAmount, p.unallocatedAmount, STATUS[p.status]?.label ?? p.status]),
  ]);

  return (
    <div className="panel flush mt">
      <div className="panel-head">
        <div><h3>Recent payments</h3><p>{k ? `Paid this month ${rs(k.paidThisMonth)} · WHT ${rs(k.whtThisMonth)} · ${k.pendingApproval} pending approval · unpresented cheques ${rs(k.unpresentedCheques)} · on account ${rs(k.onAccount)}` : "Loading…"}</p></div>
        <Button size="sm" icon={<Download />} disabled={!data?.items.length} onClick={exportCsv}>Export</Button>
      </div>
      <div className="toolbar">
        <label className="search-field"><Search /><input placeholder="Search payment #, cheque, vendor…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
        <select value={vendor} aria-label="Vendor" onChange={(e) => { setVendor(e.target.value); setPage(1); }}>
          <option value="">All vendors</option>{options?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <div className="chips">
          {CHIPS.map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); }}>{c.label} <i>{count(c.keys)}</i></button>)}
        </div>
      </div>
      {err && !data ? <ErrorState message={err.message} reference={err.reference} onRetry={() => setAttempt((x) => x + 1)} /> : !data ? <Skeleton style={{ height: 260 }} /> : !data.items.length ? (
        <EmptyState icon={<Send />} title={filtered ? "No payments match" : "No vendor payments yet"} description={filtered ? "Try another status, vendor or search." : "Select bills above and generate payments."} />
      ) : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Payment #</th><th>Vendor</th><th>Date</th><th>Method</th><th>Bank</th><th>Against</th><th className="num">Amount (Rs)</th><th>Status</th><th /></tr></thead>
          <tbody>{data.items.map((p) => (
            <tr key={p.id}>
              <td><a className="link" href={`/payables/payments?payment=${p.id}`} onClick={(e) => { e.preventDefault(); onOpen(p.id); }}><Hl text={p.docNo} q={search} /></a>{p.paymentRunRef && <small>{p.paymentRunRef}</small>}</td>
              <td><Hl text={p.vendor.name} q={search} /></td>
              <td>{dateLabel(p.docDate)}</td>
              <td>{METHOD_LABEL[p.method] ?? p.method}{p.chequeNo ? <small>Cheque {p.chequeNo}</small> : null}</td>
              <td>{p.bankAccount?.title ?? p.cashAccount?.name ?? "—"}</td>
              <td>{p.allocatedAmount ? `${amt(p.allocatedAmount)} allocated` : "—"}{p.unallocatedAmount > 0 && p.status !== "VOID" && <small style={{ color: "var(--warn)" }}>{amt(p.unallocatedAmount)} on account</small>}</td>
              <td className="num">{amt(p.amount)}{p.whtAmount > 0 && <small>WHT {amt(p.whtAmount)}</small>}</td>
              <td><PayStatus status={p.status} /></td>
              <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Open ${p.docNo}`} onClick={() => onOpen(p.id)}><Eye /></button></td>
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

// ---------------------------------------------------------------- payment drawer
type Tab = "details" | "approval" | "history";
type Ask = { kind: "void" | "reject"; p: VendorPayment } | null;

function PaymentDrawer({ id, can, userId, onClose, onChanged, onAllocate, onEdit }: {
  id: string | null; can: Can; userId: string; onClose: () => void; onChanged: () => void; onAllocate: (id: string) => void; onEdit: (p: VendorPayment) => void;
}) {
  const toast = useToast();
  const [p, setP] = useState<VendorPayment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [del, setDel] = useState(false);
  const [m, setM] = useState(0);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPayment(id).then((x) => !cancelled && setP(x)).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the payment")));
    return () => { cancelled = true; };
  }, [id, m]);
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast(label, { tone: "good" });
      setM((x) => x + 1);
      onChanged();
    } catch (e) {
      toast(errMsg(e, "That didn’t work"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const ap = (p?.approval ?? null) as ApprovalDetail | null;
  const routing = (p?.routing ?? null) as Routing;
  const steps: ApprovalStep[] = ap?.steps ?? routing?.steps ?? [];
  const pending = p?.status === "PENDING_APPROVAL";
  const live = !!p && LIVE.includes(p.status);
  const mine = p?.createdBy?.id === userId;

  const actions = p ? (
    <>
      {p.status === "DRAFT" && can.edit && <Button disabled={busy} icon={<Pencil />} onClick={() => onEdit(p)}>Edit</Button>}
      {p.status === "DRAFT" && can.create && <Button disabled={busy} icon={<Trash2 />} onClick={() => setDel(true)}>Delete</Button>}
      {p.status === "DRAFT" && routing && can.create && <Button variant="primary" disabled={busy} icon={<Send />} onClick={() => run(`${p.docNo} submitted to ${routing.workflow.name}`, () => paymentAction(p.id, "submit", p.rowVersion))}>Submit for approval</Button>}
      {p.status === "DRAFT" && !routing && can.post && <Button variant="primary" disabled={busy} icon={<Check />} onClick={() => run(`${p.docNo} posted`, () => paymentAction(p.id, "post", p.rowVersion))}>Post</Button>}
      {pending && mine && can.create && <Button disabled={busy} icon={<Undo2 />} onClick={() => run(`${p.docNo} recalled to draft`, () => paymentAction(p.id, "recall", p.rowVersion))}>Recall</Button>}
      {pending && p.canAct && <Button disabled={busy} onClick={() => setAsk({ kind: "reject", p })}>Reject</Button>}
      {pending && p.canAct && <Button variant="primary" disabled={busy} onClick={() => run(`${p.docNo} approved`, () => approvePayment(p.id))}>Approve</Button>}
      {live && p.unallocatedAmount > 0 && can.edit && <Button variant="primary" disabled={busy} icon={<Split />} onClick={() => onAllocate(p.id)}>Allocate on-account</Button>}
      {(live || pending) && can.post && <Button variant="ghost" disabled={busy} icon={<Ban />} onClick={() => setAsk({ kind: "void", p })}>Void</Button>}
    </>
  ) : undefined;

  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={p ? p.docNo : "Payment"} subtitle={p ? `${p.vendor.name} · ${dateLabel(p.docDate)}` : undefined} foot={actions}>
        {err ? <ErrorState message={err} onRetry={() => { setErr(null); setM((x) => x + 1); }} /> : !p ? <Skeleton style={{ height: 420 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><PayStatus status={p.status} />{p.voidReason && <small className="muted">{p.voidReason}</small>}</div>
            <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "approval", label: "Approval" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <>
                <div className="dl mt">
                  <div><span>Vendor</span><b>{p.vendor.code} · {p.vendor.name}</b></div>
                  <div><span>Method</span><b>{METHOD_LABEL[p.method] ?? p.method}{p.chequeNo ? ` · cheque ${p.chequeNo}${p.isCrossed ? " (A/C payee)" : ""}` : ""}</b></div>
                  <div><span>Paid from</span><b>{p.bankAccount?.title ?? p.cashAccount?.name ?? "—"} · {p.branch.name}</b></div>
                  <div><span>Amount paid</span><b>Rs {amt(p.amount)}</b></div>
                  {p.whtAmount > 0 && <div><span>WHT withheld</span><b>Rs {amt(p.whtAmount)}{p.whtSection ? ` · ${p.whtSection.replace(/_/g, " ")} @ ${p.whtRate}%` : ""}</b></div>}
                  {p.bankChargesAmount > 0 && <div><span>Bank charges</span><b>Rs {amt(p.bankChargesAmount)}</b></div>}
                  <div><span>Allocated</span><b>Rs {amt(p.allocatedAmount)}{p.unallocatedAmount > 0 ? ` · Rs ${amt(p.unallocatedAmount)} on account` : ""}</b></div>
                  {p.cheque && <div><span>Cheque</span><b><Link className="link" href="/bank/cheque-register">{p.cheque.docNo}</Link> · {p.cheque.status.toLowerCase()}</b></div>}
                  {p.clearedOn && <div><span>Cleared</span><b>{dateLabel(p.clearedOn)}</b></div>}
                  {p.voucher && <div><span>Journal</span><b><Link className="link" href={`/accounting/vouchers/${p.voucher.id}`}>{p.voucher.docNo}</Link></b></div>}
                  {p.paymentRunRef && <div><span>Payment run</span><b>{p.paymentRunRef}</b></div>}
                  {p.approvedBy && <div><span>Approved</span><b>{p.approvedBy.name}{p.approvedAt ? ` · ${dateLabel(p.approvedAt.slice(0, 10))}` : ""}</b></div>}
                  {p.remarks && <div><span>Remarks</span><b>{p.remarks}</b></div>}
                </div>
                <div className="table-wrap mt"><table className="tbl">
                  <thead><tr><th>Bill</th><th>Date</th><th className="num">Paid</th><th className="num">WHT</th><th /></tr></thead>
                  <tbody>
                    {p.allocations.length ? p.allocations.map((a) => (
                      <tr key={a.id} style={a.isReversed ? { opacity: 0.55 } : undefined}>
                        <td><b><Link className="link" href={`/purchases/bills/${a.bill.id}`}>{a.bill.docNo}</Link></b><small>{a.bill.vendorInvoiceNo}{a.isReversed ? " · reversed" : ""}</small></td>
                        <td>{dateLabel(a.date)}</td>
                        <td className="num">{amt(a.amount)}</td>
                        <td className="num">{a.whtAmount ? amt(a.whtAmount) : "—"}</td>
                        <td className="actions">{live && !a.isReversed && can.edit && (
                          <button type="button" className="icon-btn-sm" title="Reverse this allocation" aria-label={`Reverse allocation to ${a.bill.docNo}`} disabled={busy}
                            onClick={() => run(`Allocation to ${a.bill.docNo} reversed`, () => reverseAllocation(a.id))}><Undo2 /></button>
                        )}</td>
                      </tr>
                    )) : <tr><td colSpan={5} className="muted">Not allocated to any bill — paid on account.</td></tr>}
                  </tbody>
                </table></div>
              </>
            )}
            {tab === "approval" && (
              <div className="mt">
                <p className="muted">{ap ? `${ap.workflow.name} · ${ap.status.toLowerCase()}` : routing ? `${routing.workflow.name} · submit to start` : "No approval workflow applies — a user with payment posting rights posts it directly."}</p>
                <div className="timeline">
                  <div className="tl-item"><span className="tl-dot good" /><div><b>Prepared — {p.createdBy?.name ?? "—"}</b><small>{dateLabel(p.createdAt.slice(0, 10))}</small></div></div>
                  {steps.map((s) => (
                    <div className="tl-item" key={s.stepNo}>
                      <span className={`tl-dot${s.state === "done" ? " good" : s.state === "current" ? " warn" : ""}`} />
                      <div>
                        <b>{s.name} — {s.approvers.length ? s.approvers.map((a) => a.name).join(", ") : "No approver"}</b>
                        <small>{s.state === "done" ? `Approved by ${s.actedBy.map((a) => a.name).join(", ")}` : s.state === "current" ? (pending ? (p.canAct ? "Awaiting your approval" : "Awaiting approval") : "First step") : s.state === "skipped" ? "Not required" : "Waiting"}</small>
                      </div>
                    </div>
                  ))}
                  {p.postedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Posted</b><small>{dateLabel(p.postedAt.slice(0, 10))}</small></div></div>}
                  {p.status === "VOID" && <div className="tl-item"><span className="tl-dot danger" /><div><b>Voided</b><small>{p.voidReason ?? ""}</small></div></div>}
                </div>
                {ap?.actions.filter((a) => a.reason || a.comment).map((a) => (
                  <div key={a.id} className="list-item"><div><b>{a.actor?.name ?? "—"} · {a.action.toLowerCase()}</b><small>{a.reason ?? a.comment}</small></div></div>
                ))}
              </div>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Purchases" table="VendorPayments" id={p.id} /></div>}
          </>
        )}
      </Drawer>
      <ReasonModal key={ask ? `${ask.kind}-${ask.p.id}` : "none"} ask={ask} onClose={() => setAsk(null)} onDone={(label) => { setAsk(null); toast(label, { tone: "good" }); setM((x) => x + 1); onChanged(); }} />
      <ConfirmDialog open={del && !!p} onClose={() => setDel(false)} danger busy={busy} title={`Delete ${p?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => p && run(`${p.docNo} deleted`, async () => { await deletePayment(p.id, p.rowVersion); setDel(false); onClose(); })}>
        The draft payment and its allocations are removed. Its number is not reused.
      </ConfirmDialog>
    </>
  );
}

function ReasonModal({ ask, onClose, onDone }: { ask: Ask; onClose: () => void; onDone: (label: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!ask) return;
    setBusy(true);
    setErr(null);
    try {
      if (ask.kind === "void") { const p = await voidPayment(ask.p.id, ask.p.rowVersion, reason.trim()); onDone(`${p.docNo} voided · bills reopened`); }
      else { const p = await rejectPayment(ask.p.id, reason.trim()); onDone(`${p.docNo} rejected · back to the preparer`); }
    } catch (e) {
      setErr(errMsg(e, "That didn’t work"));
    } finally {
      setBusy(false);
    }
  };
  const isVoid = ask?.kind === "void";
  return (
    <Modal open={!!ask} onClose={onClose} title={isVoid ? `Void ${ask?.p.docNo ?? ""}` : `Reject ${ask?.p.docNo ?? ""}`}
      subtitle={isVoid ? "The journal is reversed, its allocations are undone and an unpresented cheque is cancelled." : "The payment returns to its preparer as a draft."} foot={
        <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn danger" onClick={() => void go()} disabled={busy || reason.trim().length < 3}>{busy ? "Working…" : isVoid ? "Void payment" : "Reject"}</button></>
      }>
      <FormGrid cols={1}>
        <Field label="Reason" required error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isVoid ? "Why is this payment voided?" : "What should change?"} /></Field>
      </FormGrid>
    </Modal>
  );
}

// ---------------------------------------------------------------- allocate on-account (#po-pay-alloc)
function AllocateModal({ paymentId, items, today, onClose, onDone }: { paymentId: string | null; items: OpenItems | null; today: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [pid, setPid] = useState(paymentId ?? "");
  const [p, setP] = useState<VendorPayment | null>(null);
  const [bills, setBills] = useState<OpenBill[] | null>(null);
  const [rows, setRows] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const candidates = items?.payments ?? [];

  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    Promise.all([getPayment(pid), openItems()]).then(([x, oi]) => {
      if (cancelled) return;
      setP(x);
      setBills(oi.bills.filter((b) => b.vendor.id === x.vendor.id));
    }).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the payment")));
    return () => { cancelled = true; };
  }, [pid]);

  const avail = p?.unallocatedAmount ?? 0;
  const allocated = r2(Object.values(rows).reduce((s, v) => s + num(v), 0));
  const left = r2(avail - allocated);
  const fifo = () => {
    if (!bills) return;
    const a = allocateOldestFirst(bills.map((b) => ({ id: b.id, balance: b.balanceAmount, dueDate: b.dueDate })), avail);
    setRows(Object.fromEntries(a.map((x) => [x.id, amt(x.amount)])));
  };
  const apply = async () => {
    if (!p) return;
    setBusy(true);
    setErr(null);
    try {
      const allocations = Object.entries(rows).map(([billId, v]) => ({ billId, amount: num(v) })).filter((a) => a.amount > 0);
      const x = await allocatePayment(p.id, p.rowVersion, allocations);
      onDone(`${x.docNo} allocated — Rs ${amt(allocated)} settled against ${x.vendor.name} bills`);
    } catch (e) {
      setErr(errMsg(e, "Could not allocate the payment"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={p ? `Allocate ${p.docNo}` : "Allocate on-account"}
      subtitle={p ? `${p.vendor.name}${p.chequeNo ? ` · cheque ${p.chequeNo}` : ""} · paid on account ${dateLabel(p.docDate)}` : "Pick a payment with an unallocated balance"} foot={
        <>
          <Button variant="ghost" icon={<WandSparkles />} disabled={!bills?.length || !avail} onClick={fifo}>Auto-allocate (FIFO)</Button>
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy || !p || allocated <= 0 || left < 0} title={left < 0 ? "Allocated more than the payment’s unallocated amount" : ""} onClick={() => void apply()}><Check />{busy ? "Applying…" : "Apply allocation"}</button>
        </>
      }>
      <div data-po-alloc>
        {err && <Banner tone="danger" title="Not allocated">{err}</Banner>}
        <FormGrid cols={3}>
          {!paymentId ? (
            <Field label="Payment">
              <select value={pid} onChange={(e) => { setPid(e.target.value); setP(null); setBills(null); setRows({}); }}>
                <option value="">{candidates.length ? "Choose…" : "No payment has an on-account balance"}</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.docNo} · {c.vendor.name} · Rs {amt(c.unallocatedAmount)}</option>)}
              </select>
            </Field>
          ) : <Field label="Payment amount"><input readOnly value={p ? amt(p.amount) : ""} /></Field>}
          <Field label="Allocation date"><input type="date" readOnly value={today} /></Field>
          <Field label="WHT treatment" hint="WHT is only withheld when a payment is posted"><select disabled value="ALREADY"><option value="ALREADY">Already withheld</option></select></Field>
        </FormGrid>
        {!pid ? null : !bills ? <Skeleton style={{ height: 180 }} /> : !bills.length ? (
          <EmptyState icon={<Split />} title="No open bills" description="This vendor has no posted bill with a balance." />
        ) : (
          <div className="table-wrap mt"><table className="tbl lines" data-plain>
            <thead><tr><th /><th>Bill</th><th className="num">Open balance</th><th className="num">Allocate</th></tr></thead>
            <tbody>{bills.map((b) => {
              const on = rows[b.id] !== undefined;
              return (
                <tr key={b.id}>
                  <td><input type="checkbox" checked={on} aria-label={`Allocate to ${b.docNo}`} onChange={(e) => setRows((r) => { const y = { ...r }; if (e.target.checked) y[b.id] = amt(Math.min(b.balanceAmount, Math.max(0, left))); else delete y[b.id]; return y; })} /></td>
                  <td><b>{b.docNo}</b>{b.daysOverdue > 0 ? <small className="neg">Overdue {b.daysOverdue} day{b.daysOverdue === 1 ? "" : "s"}</small> : <small>Due {dateLabel(b.dueDate)}</small>}</td>
                  <td className="num">{amt(b.balanceAmount)}</td>
                  <td><input className="cell-input num" inputMode="decimal" disabled={!on} value={rows[b.id] ?? "0.00"} onChange={(e) => setRows((r) => ({ ...r, [b.id]: e.target.value }))} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <div className="po-alloc-sum mt">
          <div className={cn("progress", left < 0 && "danger")}><i style={{ width: `${Math.min(100, avail ? (allocated / avail) * 100 : 0)}%` }} /></div>
          <div className="dl">
            <div><span>Allocated</span><b>Rs {amt(allocated)}</b></div>
            <div><span>Left on account</span><b style={{ color: left < 0 ? "var(--danger)" : left > 0 ? "var(--warn)" : "var(--good)" }}>Rs {amt(left)}</b></div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- single payment (new / edit a draft)
function PaymentForm({ payment, options: o, today, onClose, onSaved }: { payment: VendorPayment | null; options: PurchaseOptions; today: string; onClose: () => void; onSaved: (p: VendorPayment, msg: string) => void }) {
  const [h, setH] = useState(() => ({
    vendorId: payment?.vendor.id ?? "", docDate: payment?.docDate ?? today, branchId: payment?.branch.id ?? o.branches[0]?.id ?? "", method: payment?.method ?? "IBFT",
    account: payment?.bankAccount?.id ?? payment?.cashAccount?.id ?? o.bankAccounts[0]?.id ?? "", chequeNo: payment?.chequeNo ?? "", amount: payment ? amt(payment.amount) : "",
    whtTreatment: (payment?.whtTreatment ?? "ALREADY_WITHHELD") as "ALREADY_WITHHELD" | "WITHHOLD_NOW", whtSection: payment?.whtSection ?? "153_1_A", whtRate: payment?.whtRate ? String(payment.whtRate) : "",
    bankCharges: payment?.bankChargesAmount ? String(payment.bankChargesAmount) : "", remarks: payment?.remarks ?? "",
  }));
  const [bills, setBills] = useState<OpenBill[] | null>(() => (payment ? null : []));
  const [rows, setRows] = useState<Record<string, string>>(() => Object.fromEntries((payment?.allocations ?? []).filter((a) => !a.isReversed).map((a) => [a.bill.id, amt(r2(a.amount + a.whtAmount))])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const cash = h.method === "CASH";
  const withhold = h.whtTreatment === "WITHHOLD_NOW" && num(h.whtRate) > 0;

  useEffect(() => {
    if (!h.vendorId) return;
    let cancelled = false;
    openItems(h.vendorId).then((x) => !cancelled && setBills(x.bills)).catch(() => !cancelled && setBills([]));
    return () => { cancelled = true; };
  }, [h.vendorId]);

  const alloc = Object.entries(rows).map(([billId, v]) => ({ billId, gross: num(v) })).filter((a) => a.gross > 0)
    .map((a) => ({ billId: a.billId, ...(withhold ? allocationWht(a.gross, num(h.whtRate)) : { amount: r2(a.gross), whtAmount: 0 }) }));
  const net = r2(alloc.reduce((s, a) => s + a.amount, 0));
  const wht = r2(alloc.reduce((s, a) => s + a.whtAmount, 0));
  const fe = (k: string) => err?.fields[k];
  const fifo = () => {
    if (!bills) return;
    const total = num(h.amount);
    const gross = withhold ? r2(total / (1 - num(h.whtRate) / 100)) : total;
    const a = allocateOldestFirst(bills.map((b) => ({ id: b.id, balance: b.balanceAmount, dueDate: b.dueDate })), gross);
    setRows(Object.fromEntries(a.map((x) => [x.id, amt(x.amount)])));
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    const body = {
      docDate: h.docDate, vendorId: h.vendorId, branchId: h.branchId, method: h.method, bankAccountId: cash ? null : h.account || null, cashAccountId: cash ? h.account || null : null,
      chequeNo: h.method === "CHEQUE" ? h.chequeNo || null : null, isCrossed: true, amount: num(h.amount) || net, whtTreatment: h.whtTreatment,
      whtSection: h.whtTreatment === "WITHHOLD_NOW" ? h.whtSection : null, whtRate: h.whtTreatment === "WITHHOLD_NOW" ? num(h.whtRate) : 0, bankChargesAmount: num(h.bankCharges),
      remarks: h.remarks || null, allocations: alloc, ...(payment && { rowVersion: payment.rowVersion }),
    };
    try {
      const p = payment ? await updatePayment(payment.id, body) : await createPayment(body);
      onSaved(p, `${p.docNo} saved as draft${p.routing ? " · submit it for approval" : " · post it from the drawer"}`);
    } catch (e) {
      setErr({ message: errMsg(e, "Could not save the payment"), fields: fields(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={payment ? `Edit ${payment.docNo}` : "New payment"} subtitle="Numbered on save · posted from the drawer, or routed for approval when a workflow applies" foot={
      <>
        <Button variant="ghost" icon={<WandSparkles />} disabled={!bills?.length || !num(h.amount)} onClick={fifo}>Allocate oldest first</Button>
        <span className="spacer" />
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={busy || !h.vendorId}>{busy ? "Saving…" : "Save draft"}</button>
      </>
    }>
      {err && <Banner tone="danger" title="Not saved">{err.message}</Banner>}
      <FormGrid cols={3}>
        <Field label="Vendor" required error={fe("vendorId")}>
          <select value={h.vendorId} disabled={!!payment} onChange={(e) => { setH({ ...h, vendorId: e.target.value }); setRows({}); setBills(e.target.value ? null : []); }}><option value="">Choose…</option>{o.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        </Field>
        <Field label="Payment date" required error={fe("docDate")}><input type="date" value={h.docDate} onChange={(e) => setH({ ...h, docDate: e.target.value })} /></Field>
        <Field label="Branch" required error={fe("branchId")}><select value={h.branchId} onChange={(e) => setH({ ...h, branchId: e.target.value })}>{o.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Method" error={fe("method")}>
          <select value={h.method} onChange={(e) => setH({ ...h, method: e.target.value, account: (e.target.value === "CASH" ? o.cashAccounts[0]?.id : o.bankAccounts[0]?.id) ?? "" })}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Pay from" error={fe("bankAccountId") ?? fe("cashAccountId")}>
          <select value={h.account} onChange={(e) => setH({ ...h, account: e.target.value })}>
            <option value="">Choose…</option>
            {cash ? o.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : o.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.title}{b.last4 ? ` — ${b.last4}` : ""}</option>)}
          </select>
        </Field>
        {h.method === "CHEQUE" ? <Field label="Cheque #" error={fe("chequeNo")}><input inputMode="numeric" value={h.chequeNo} onChange={(e) => setH({ ...h, chequeNo: e.target.value })} /></Field>
          : <Field label="Bank charges" error={fe("bankChargesAmount")}><input inputMode="decimal" value={h.bankCharges} onChange={(e) => setH({ ...h, bankCharges: e.target.value })} /></Field>}
        <Field label="Amount paid" required error={fe("amount") ?? fe("allocations")}><input inputMode="decimal" value={h.amount} placeholder={net ? amt(net) : "0.00"} onChange={(e) => setH({ ...h, amount: e.target.value })} /></Field>
        <Field label="WHT treatment">
          <select value={h.whtTreatment} onChange={(e) => setH({ ...h, whtTreatment: e.target.value as typeof h.whtTreatment })}><option value="ALREADY_WITHHELD">Already withheld at bill</option><option value="WITHHOLD_NOW">Withhold now</option></select>
        </Field>
        {h.whtTreatment === "WITHHOLD_NOW" ? (
          <Field label="WHT section · rate %" error={fe("whtSection")}>
            <div className="row" style={{ gap: 6 }}>
              <select value={h.whtSection} onChange={(e) => setH({ ...h, whtSection: e.target.value })}>{o.whtSections.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}</select>
              <input style={{ width: 70 }} inputMode="decimal" value={h.whtRate} placeholder="%" onChange={(e) => setH({ ...h, whtRate: e.target.value })} />
            </div>
          </Field>
        ) : <Field label="Remarks"><input value={h.remarks} onChange={(e) => setH({ ...h, remarks: e.target.value })} /></Field>}
      </FormGrid>
      {!h.vendorId ? <p className="muted mt">Choose the vendor to see their open bills.</p> : !bills ? <Skeleton style={{ height: 160 }} /> : !bills.length ? (
        <Banner tone="info" title="No open bills">The whole amount is paid on account; allocate it later.</Banner>
      ) : (
        <div className="table-wrap mt"><table className="tbl lines" data-plain>
          <thead><tr><th /><th>Bill</th><th className="num">Open balance</th><th className="num">Settle (gross)</th></tr></thead>
          <tbody>{bills.map((b, i) => {
            const on = rows[b.id] !== undefined;
            const bad = fe(`allocations.${i}.amount`) ? { borderColor: "var(--danger)" } : undefined;
            return (
              <tr key={b.id}>
                <td><input type="checkbox" checked={on} aria-label={`Settle ${b.docNo}`} onChange={(e) => setRows((r) => { const y = { ...r }; if (e.target.checked) y[b.id] = amt(b.balanceAmount); else delete y[b.id]; return y; })} /></td>
                <td><b>{b.docNo}</b>{b.daysOverdue > 0 ? <small className="neg">Overdue {b.daysOverdue} days</small> : <small>Due {dateLabel(b.dueDate)}</small>}</td>
                <td className="num">{amt(b.balanceAmount)}</td>
                <td><input className="cell-input num" style={bad} inputMode="decimal" disabled={!on} value={rows[b.id] ?? "0.00"} onChange={(e) => setRows((r) => ({ ...r, [b.id]: e.target.value }))} /></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      <div className="dl mt">
        <div><span>Cash paid to bills</span><b>Rs {amt(net)}</b></div>
        {wht > 0 && <div><span>WHT withheld</span><b>Rs {amt(wht)}</b></div>}
        <div><span>Left on account</span><b>Rs {amt(Math.max(0, r2((num(h.amount) || net) - net)))}</b></div>
      </div>
    </Modal>
  );
}
