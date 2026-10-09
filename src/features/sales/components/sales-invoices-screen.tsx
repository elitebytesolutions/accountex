"use client";

import { AlertTriangle, CalendarDays, Download, Eye, Hourglass, MoreHorizontal, Pencil, Plus, ReceiptText, Search, SquareCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SalesDocOptions, SalesInvoiceList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { listInvoices, salesDocOptions } from "../api";

type Can = { create: boolean; edit: boolean; delete: boolean; post: boolean };
type Row = SalesInvoiceList["items"][number] & { awaitingApproval?: boolean };
const PAGE = 15;

const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, POSTED: { label: "Posted", tone: "info" }, PARTIALLY_PAID: { label: "Partially Paid", tone: "warn" },
  PAID: { label: "Paid", tone: "good" }, VOID: { label: "Void", tone: "danger" },
};
const FBR: Record<string, { label: string; tone: Tone }> = {
  POSTED: { label: "Posted", tone: "good" }, PENDING: { label: "Queued", tone: "warn" }, FAILED: { label: "Failed", tone: "danger" },
};
/** Chips: POSTED excludes overdue ones; OVERDUE is counted separately, so "All" is the sum of every count. */
const CHIPS = [
  { label: "All", status: "" }, { label: "Draft", status: "DRAFT" }, { label: "Posted", status: "POSTED" }, { label: "Partially Paid", status: "PARTIALLY_PAID" },
  { label: "Overdue", status: "OVERDUE" }, { label: "Paid", status: "PAID" }, { label: "Void", status: "VOID" },
];
const PERIODS: { key: string; label: string }[] = [
  { key: "all", label: "All dates" }, { key: "90d", label: "Last 90 days" }, { key: "month", label: "This month" }, { key: "last", label: "Last month" }, { key: "fy", label: "This financial year" },
];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const OPEN = ["POSTED", "PARTIALLY_PAID"];

/** from / to of a period choice (financial year runs July–June). */
function range(key: string): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (key === "90d") { const d = new Date(now); d.setDate(d.getDate() - 90); return { from: isoDay(d) }; }
  if (key === "month") return { from: isoDay(new Date(y, m, 1)) };
  if (key === "last") return { from: isoDay(new Date(y, m - 1, 1)), to: isoDay(new Date(y, m, 0)) };
  if (key === "fy") return { from: isoDay(new Date(m >= 6 ? y : y - 1, 6, 1)) };
  return {};
}
const daysLate = (due: string) => Math.max(0, Math.floor((Date.now() - new Date(`${due}T00:00:00`).getTime()) / 86_400_000));

function InvoiceStatus({ r }: { r: Row }) {
  if (r.overdue && OPEN.includes(r.status)) {
    const d = daysLate(r.dueDate);
    return <><Badge tone="danger" dot>Overdue</Badge><small className="muted">{d} day{d === 1 ? "" : "s"}{r.status === "PARTIALLY_PAID" ? " · part paid" : ""}</small></>;
  }
  const s = STATUS[r.status] ?? { label: r.status, tone: "neutral" as Tone };
  return <><Badge tone={s.tone} dot>{s.label}</Badge>{r.status === "DRAFT" && r.awaitingApproval && <small className="muted">Awaiting approval</small>}</>;
}

/** Template app/sales/invoices (41-acc-trade.html): KPIs, branch / period / status filters, invoice register with FBR status. */
export function SalesInvoicesScreen({ can }: { can: Can }) {
  const router = useRouter();
  const [options, setOptions] = useState<SalesDocOptions | null>(null);
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [period, setPeriod] = useState("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SalesInvoiceList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const reload = () => setAttempt((n) => n + 1);

  useEffect(() => {
    salesDocOptions().then(setOptions).catch(() => setOptions(null));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listInvoices({ status, branch, search, ...range(period), page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load sales invoices" }));
    return () => { cancelled = true; };
  }, [status, branch, period, search, page, attempt]);

  const items = (data?.items ?? []) as Row[];
  const k = data?.kpis;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const filtered = !!(status || branch || period !== "all" || search);
  const reset = () => { setPage(1); setSelected(new Set()); };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const balanceOf = (r: Row) => (r.status === "VOID" ? 0 : r.balanceAmount);
  const chosen = items.filter((r) => selected.has(r.id));
  const exportCsv = (rows: Row[], name: string) => downloadCsv(`${name}-${isoDay(new Date())}.csv`, [
    ["Invoice #", "Channel", "Sales order", "Customer", "Date", "Due", "Amount", "GST", "Balance", "Status", "FBR status", "FBR invoice #"],
    ...rows.map((r) => [r.docNo, r.channel === "COUNTER" ? "Counter" : "Standard", r.salesOrder?.docNo ?? "", r.customer.name, r.docDate, r.dueDate, r.netAmount, r.taxAmount, balanceOf(r),
      r.overdue && OPEN.includes(r.status) ? "Overdue" : STATUS[r.status]?.label ?? r.status, FBR[r.fbrStatus]?.label ?? "", r.fbrInvoiceNo ?? ""]),
  ]);
  const rowMenu = (r: Row, anchor: HTMLElement) => setMenu({
    anchor,
    items: [
      { label: "Open", icon: <Eye />, onClick: () => router.push(`/sales/invoices/${r.id}`) },
      ...(r.salesOrder ? [{ label: `Open ${r.salesOrder.docNo}`, onClick: () => router.push(`/sales/orders?so=${r.salesOrder!.id}`) }] : []),
      ...(r.deliveryChallan ? [{ label: `Open ${r.deliveryChallan.docNo}`, onClick: () => router.push(`/sales/challans?dc=${r.deliveryChallan!.id}`) }] : []),
      ...(r.journal ? [{ label: `Journal ${r.journal.docNo}`, onClick: () => router.push(`/accounting/vouchers/${r.journal!.id}`) }] : []),
    ],
  });
  const total = items.reduce((t, r) => ({ net: t.net + (r.status === "VOID" ? 0 : r.netAmount), gst: t.gst + (r.status === "VOID" ? 0 : r.taxAmount), bal: t.bal + balanceOf(r) }), { net: 0, gst: 0, bal: 0 });
  const overduePct = k && k.outstanding > 0 ? (k.overdue / k.outstanding) * 100 : null;

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Sales / Invoices"
        title="Sales Invoices"
        description="All customer invoices with FBR integration status, collections and balances."
        actions={
          <>
            <Button icon={<Upload />} disabled title="Invoice import arrives with data imports">Import</Button>
            <Button icon={<Download />} disabled={!items.length} onClick={() => exportCsv(items, "sales-invoices")}>Export</Button>
            {can.create && <ButtonLink variant="primary" icon={<Plus />} href="/sales/invoices/new">New Invoice</ButtonLink>}
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Invoiced MTD</span><span className="icon-well"><ReceiptText /></span></div><strong>{k ? rs(k.invoicedMtd) : "—"}</strong><small>{k ? `${k.invoicedMtdCount} invoice${k.invoicedMtdCount === 1 ? "" : "s"} this month` : " "}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Outstanding</span><span className="icon-well"><Hourglass /></span></div><strong>{k ? rs(k.outstanding) : "—"}</strong><small>{k ? `Across ${k.openCount} open invoice${k.openCount === 1 ? "" : "s"}` : " "}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Overdue</span><span className="icon-well"><AlertTriangle /></span></div><strong>{k ? rs(k.overdue) : "—"}</strong><small className={cn(k && k.overdueCount > 0 && "down")}>{k ? `${k.overdueCount} invoice${k.overdueCount === 1 ? "" : "s"}${overduePct !== null ? ` · ${overduePct.toFixed(1)}% of receivables` : ""}` : " "}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Avg Days to Pay</span><span className="icon-well"><CalendarDays /></span></div><strong>—</strong><small>Measured once receipts are recorded</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>All invoices</h3><p>{data ? `${data.total} invoice${data.total === 1 ? "" : "s"}${options?.fbr.active ? ` · reported to ${options.fbr.authority ?? "FBR"}` : ""}` : "Loading…"}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search invoice #, customer, FBR #…" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} /></label>
          <select value={branch} aria-label="Branch" onChange={(e) => { setBranch(e.target.value); reset(); }}>
            <option value="">All branches</option>
            {options?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={period} aria-label="Period" onChange={(e) => { setPeriod(e.target.value); reset(); }}>
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div className="toolbar">
          <div className="chips">
            {CHIPS.map((c) => (
              <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); reset(); }}>
                {c.label} <i>{data ? (c.status ? data.counts[c.status] ?? 0 : Object.values(data.counts).reduce((s, n) => s + n, 0)) : 0}</i>
              </button>
            ))}
          </div>
        </div>
        {chosen.length > 0 && (
          <div className="banner info" style={{ margin: "0 14px 12px" }}><SquareCheck />
            <div><b>{chosen.length} invoice{chosen.length === 1 ? "" : "s"} selected</b><p>{rs(chosen.reduce((s, r) => s + (r.status === "VOID" ? 0 : r.netAmount), 0))} total · {rs(chosen.reduce((s, r) => s + balanceOf(r), 0))} balance due</p></div>
            <div className="row"><Button size="sm" icon={<Download />} onClick={() => exportCsv(chosen, "sales-invoices-selected")}>Export</Button></div>
          </div>
        )}
        {!data ? <Skeleton style={{ height: 380 }} /> : !items.length ? (
          <EmptyState icon={<ReceiptText />} title={filtered ? "No invoices match" : "No sales invoices yet"}
            description={filtered ? "Try another status, branch, period or search." : "Raise an invoice for a customer, or convert a delivered challan."}
            action={can.create && !filtered ? <ButtonLink variant="primary" icon={<Plus />} href="/sales/invoices/new">New Invoice</ButtonLink> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all" checked={items.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((r) => r.id)) : new Set())} /></th>
              <th>Invoice #</th><th>Customer</th><th>Date</th><th>Due</th><th className="num">Amount (Rs)</th><th className="num">GST</th><th className="num">Balance</th><th>Status</th><th>FBR</th><th />
            </tr></thead>
            <tbody>
              {items.map((r) => {
                const bal = balanceOf(r), late = r.overdue && OPEN.includes(r.status);
                const fbr = FBR[r.fbrStatus];
                return (
                  <tr key={r.id} className={cn(selected.has(r.id) && "selected")}>
                    <td><input type="checkbox" aria-label={`Select ${r.docNo}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td>
                      <Link className="link" href={`/sales/invoices/${r.id}`}><Hl text={r.docNo} q={search} /></Link>
                      <small>{r.salesOrder?.docNo ?? (r.fbrInvoiceNo ? <Hl text={r.fbrInvoiceNo} q={search} /> : "—")}{r.channel === "COUNTER" && <> · <span className="badge neutral">Counter</span></>}</small>
                    </td>
                    <td><div className="cell-user"><span className="avatar sm">{initials(r.customer.name)}</span><div><b><Hl text={r.customer.name} q={search} /></b><small>{r.customer.city ?? r.customer.code}</small></div></div></td>
                    <td>{dateLabel(r.docDate)}</td>
                    <td>{dateLabel(r.dueDate)}</td>
                    <td className="num">{amt(r.netAmount)}</td>
                    <td className={cn("num", !r.taxAmount && "zero")}>{r.taxAmount ? amt(r.taxAmount) : "—"}</td>
                    <td className={cn("num", !bal ? "zero" : late && "neg")}>{bal ? amt(bal) : "—"}</td>
                    <td><InvoiceStatus r={r} /></td>
                    <td>{fbr ? <span title={r.fbrStatus === "FAILED" ? r.fbrError ?? undefined : r.fbrInvoiceNo ?? undefined}><Badge tone={fbr.tone}>{fbr.label}</Badge></span> : <Badge tone="neutral">—</Badge>}</td>
                    <td className="actions">
                      {r.status === "DRAFT" && can.edit
                        ? <Link className="icon-btn-sm" href={`/sales/invoices/${r.id}`} aria-label={`Edit ${r.docNo}`}><Pencil /></Link>
                        : <Link className="icon-btn-sm" href={`/sales/invoices/${r.id}`} aria-label={`View ${r.docNo}`}><Eye /></Link>}
                      <button type="button" className="icon-btn-sm" aria-label={`Actions for ${r.docNo}`} onClick={(e) => rowMenu(r, e.currentTarget)}><MoreHorizontal /></button>
                    </td>
                  </tr>
                );
              })}
              <tr className="total"><td colSpan={5}>Page total ({items.length} invoice{items.length === 1 ? "" : "s"})</td><td className="num">{amt(total.net)}</td><td className="num">{amt(total.gst)}</td><td className="num">{amt(total.bal)}</td><td colSpan={3} /></tr>
            </tbody>
          </table></div>
        )}
        {data && data.total > 0 && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + items.length} of {data.total}{selected.size ? ` · ${selected.size} selected` : ""}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => { setPage((p) => p - 1); setSelected(new Set()); }}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => <button key={p} type="button" className={cn(p === page && "active")} onClick={() => { setPage(p); setSelected(new Set()); }}>{p}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => { setPage((p) => p + 1); setSelected(new Set()); }}>›</button>
            </div>
          </div>
        )}
      </div>
      <Menu anchor={menu?.anchor ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
    </>
  );
}
