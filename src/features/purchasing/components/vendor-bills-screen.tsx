"use client";

import { AlertTriangle, CalendarClock, Check, Download, FileMinus, MoreHorizontal, Plus, Receipt, ScanLine, Search, Send, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { VendorBillList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { approveBill, listBills } from "../api";

type Row = VendorBillList["items"][number];
type Can = { create: boolean; approve: boolean; post: boolean };
const PAGE = 15;

export const BILL_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, AWAITING_APPROVAL: { label: "Awaiting Approval", tone: "warn" }, APPROVED: { label: "Approved", tone: "info" },
  POSTED: { label: "Posted", tone: "info" }, PARTIALLY_PAID: { label: "Partially Paid", tone: "warn" }, PAID: { label: "Paid", tone: "good" }, VOID: { label: "Void", tone: "danger" },
};
const CHIPS: { label: string; status: string; count: (c: Record<string, number>) => number }[] = [
  { label: "All", status: "", count: (c) => Object.entries(c).filter(([k]) => k !== "OVERDUE" && k !== "DISPUTED").reduce((s, [, n]) => s + n, 0) },
  { label: "Draft", status: "DRAFT", count: (c) => c.DRAFT ?? 0 },
  { label: "Awaiting Approval", status: "AWAITING_APPROVAL", count: (c) => c.AWAITING_APPROVAL ?? 0 },
  { label: "Approved", status: "APPROVED", count: (c) => c.APPROVED ?? 0 },
  { label: "Posted", status: "POSTED", count: (c) => c.POSTED ?? 0 },
  { label: "Partially Paid", status: "PARTIALLY_PAID", count: (c) => c.PARTIALLY_PAID ?? 0 },
  { label: "Overdue", status: "OVERDUE", count: (c) => c.OVERDUE ?? 0 },
  { label: "Disputed", status: "DISPUTED", count: (c) => c.DISPUTED ?? 0 },
  { label: "Paid", status: "PAID", count: (c) => c.PAID ?? 0 },
];
const MATCHES: [string, string][] = [["MATCHED", "Matched"], ["QTY_VARIANCE", "Qty variance"], ["PRICE_VARIANCE", "Price variance"], ["NO_PO", "No PO"]];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** The three-way match badge (template: Matched ✓ · Qty variance −8% · Price variance +4% · No PO). */
export function MatchBadge({ status, pct }: { status: string; pct: number | null }) {
  const p = pct !== null && pct !== 0 ? ` ${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%` : "";
  if (status === "MATCHED") return <span className="badge good"><Check /> Matched</span>;
  if (status === "QTY_VARIANCE") return <span className="badge warn">Qty variance{p}</span>;
  if (status === "PRICE_VARIANCE") return <span className="badge danger">Price variance{p}</span>;
  return <span className="badge neutral">No PO</span>;
}

export function BillStatus({ b }: { b: Pick<Row, "status" | "overdueDays" | "isDisputed"> }) {
  if (b.overdueDays > 0) return <Badge tone="danger" dot>Overdue</Badge>;
  const s = BILL_STATUS[b.status] ?? { label: b.status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}{b.isDisputed ? " · disputed" : ""}</Badge>;
}

/** Template app/purchases/bills (41-acc-trade.html): KPIs, match / status filters, bills table. */
export function VendorBillsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [match, setMatch] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VendorBillList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listBills({ status, match, search, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load vendor bills" }));
    return () => { cancelled = true; };
  }, [status, match, search, page, attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const items = data?.items ?? [];
  const k = data?.kpis;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exportCsv = () => downloadCsv(`vendor-bills-${isoDay(new Date())}.csv`, [
    ["Bill #", "Type", "Vendor invoice", "Vendor", "PO", "Bill date", "Due", "Amount", "WHT", "Balance", "Match", "Status"],
    ...items.map((b) => [b.docNo, b.channel === "COUNTER" ? "Purchase voucher" : "Bill", b.vendorInvoiceNo, b.vendor.name, b.purchaseOrder?.docNo ?? "", b.docDate, b.dueDate, b.totalAmount, b.whtAmount, b.balanceAmount, b.matchStatus, BILL_STATUS[b.status]?.label ?? b.status]),
  ]);
  const approve = async (b: Row) => {
    setBusy(b.id);
    try {
      const x = await approveBill(b.id);
      toast(`${x.docNo} ${x.status === "AWAITING_APPROVAL" ? "approved · on to the next step" : x.status === "POSTED" ? "approved and posted" : "approved"}`, { tone: "good" });
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not approve the bill", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };
  const payable = items.filter((b) => selected.has(b.id) && ["POSTED", "PARTIALLY_PAID"].includes(b.status)).map((b) => b.id);
  const rowMenu = (b: Row, anchor: HTMLElement) => setMenu({
    anchor,
    items: [
      { label: "Open", onClick: () => router.push(`/purchases/bills/${b.id}`) },
      ...(b.purchaseOrder ? [{ label: `Open ${b.purchaseOrder.docNo}`, onClick: () => router.push(`/purchases/orders?po=${b.purchaseOrder!.id}`) }] : []),
      ...(b.voucher ? [{ label: `Journal ${b.voucher.docNo}`, onClick: () => router.push(`/accounting/vouchers/${b.voucher!.id}`) }] : []),
      { sep: true as const },
      { label: "Raise debit note", disabled: !["POSTED", "PARTIALLY_PAID", "PAID"].includes(b.status), onClick: () => router.push(`/purchases/debit-notes?bill=${b.id}`) },
      { label: "Pay", disabled: !["POSTED", "PARTIALLY_PAID"].includes(b.status), onClick: () => router.push(`/payables/payments?bills=${b.id}`) },
    ],
  });

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Purchases / Bills"
        title="Vendor Bills"
        description="Supplier invoices with input tax, withholding at source and 3-way match against PO and GRN."
        actions={
          <>
            <Button icon={<ScanLine />} disabled title="Bill scanning (OCR) arrives with document storage">Scan bill (OCR)</Button>
            <Button icon={<Download />} disabled={!items.length} onClick={exportCsv}>Export</Button>
            {can.create && <ButtonLink variant="primary" icon={<Plus />} href="/purchases/bills/new">New Bill</ButtonLink>}
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi blue"><div className="kpi-top"><span>Total Payable</span><span className="icon-well"><Wallet /></span></div><strong>{k ? rs(k.outstanding) : "—"}</strong><small>Net of WHT · {(data?.counts.POSTED ?? 0) + (data?.counts.PARTIALLY_PAID ?? 0)} open bills</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Overdue</span><span className="icon-well"><AlertTriangle /></span></div><strong>{k ? rs(k.overdue) : "—"}</strong><small className={cn(k && k.overdueCount > 0 && "down")}>{k ? `${k.overdueCount} bill${k.overdueCount === 1 ? "" : "s"} past due` : " "}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Due Next 7 Days</span><span className="icon-well"><CalendarClock /></span></div><strong>{k ? rs(k.dueThisWeek) : "—"}</strong><small>Balance falling due this week</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Awaiting Approval</span><span className="icon-well"><FileMinus /></span></div><strong>{k?.pendingApproval ?? "—"}</strong><small>{k ? `${k.disputed} disputed` : " "}</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Vendor bills</h3><p>{data ? `${data.total} bill${data.total === 1 ? "" : "s"} · select rows to pay in bulk` : "Loading…"}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search bill #, vendor ref, vendor…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <select value={match} aria-label="Match state" onChange={(e) => { setMatch(e.target.value); setPage(1); }}>
            <option value="">All match states</option>
            {MATCHES.map(([v, l]) => <option key={v} value={v}>{l}{data?.matchCounts[v] ? ` (${data.matchCounts[v]})` : ""}</option>)}
          </select>
          <div className="chips">
            {CHIPS.map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); setSelected(new Set()); }}>{c.label} <i>{data ? c.count(data.counts) : 0}</i></button>)}
          </div>
          <span className="spacer" />
          <Button size="sm" variant="primary" icon={<Send />} disabled={!payable.length} title={payable.length ? `Pay ${payable.length} selected bill${payable.length === 1 ? "" : "s"}` : "Select posted bills with a balance"}
            onClick={() => router.push(`/payables/payments?bills=${payable.join(",")}`)}>Pay selected</Button>
        </div>
        {!data ? <Skeleton style={{ height: 380 }} /> : !items.length ? (
          <EmptyState icon={<Receipt />} title={status || match || search ? "No bills match" : "No vendor bills yet"}
            description={status || match || search ? "Try another status, match state or search." : "Record a supplier invoice, or bill a goods receipt."}
            action={can.create && !status && !match && !search ? <ButtonLink variant="primary" icon={<Plus />} href="/purchases/bills/new">New Bill</ButtonLink> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all" checked={items.every((b) => selected.has(b.id))} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((b) => b.id)) : new Set())} /></th>
              <th>Bill #</th><th>Vendor</th><th>Bill Date</th><th>Due</th><th className="num">Amount (Rs)</th><th className="num">WHT</th><th className="num">Balance</th><th>3-way match</th><th>Status</th><th />
            </tr></thead>
            <tbody>
              {items.map((b) => {
                const open = ["POSTED", "PARTIALLY_PAID"].includes(b.status);
                return (
                  <tr key={b.id} className={cn(selected.has(b.id) && "selected")}>
                    <td><input type="checkbox" aria-label={`Select ${b.docNo}`} checked={selected.has(b.id)} onChange={() => toggle(b.id)} /></td>
                    <td><Link className="link" href={`/purchases/bills/${b.id}`}><Hl text={b.docNo} q={search} /></Link><small><Hl text={b.vendorInvoiceNo} q={search} />{b.channel === "COUNTER" ? " · purchase voucher" : ""}</small></td>
                    <td><div className="cell-user"><span className="avatar sm">{initials(b.vendor.name)}</span><div><b><Hl text={b.vendor.name} q={search} /></b><small>{b.purchaseOrder?.docNo ?? b.grn?.docNo ?? (b.channel === "COUNTER" ? "Counter purchase" : "No PO")}</small></div></div></td>
                    <td>{dateLabel(b.docDate)}</td>
                    <td>{dateLabel(b.dueDate)}{b.overdueDays > 0 && <small className="neg">{b.overdueDays} day{b.overdueDays === 1 ? "" : "s"} late</small>}</td>
                    <td className="num">{amt(b.totalAmount)}</td>
                    <td className={cn("num", !b.whtAmount && "zero")}>{b.whtAmount ? amt(b.whtAmount) : "—"}</td>
                    <td className={cn("num", !open || !b.balanceAmount ? "zero" : b.overdueDays > 0 && "neg")}>{open && b.balanceAmount ? amt(b.balanceAmount) : "—"}</td>
                    <td><MatchBadge status={b.matchStatus} pct={b.matchVariancePct} /></td>
                    <td><BillStatus b={b} /></td>
                    <td className="actions">
                      {b.status === "AWAITING_APPROVAL" ? (
                        <Button size="sm" variant="primary" disabled={busy === b.id} onClick={() => void approve(b)}>{busy === b.id ? "…" : "Approve"}</Button>
                      ) : (
                        <button type="button" className="icon-btn-sm" aria-label={`Actions for ${b.docNo}`} onClick={(e) => rowMenu(b, e.currentTarget)}><MoreHorizontal /></button>
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
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + items.length} of {data.total}{selected.size ? ` · ${selected.size} selected` : ""}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => <button key={p} type="button" className={cn(p === page && "active")} onClick={() => setPage(p)}>{p}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>
      <Menu anchor={menu?.anchor ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
    </>
  );
}
