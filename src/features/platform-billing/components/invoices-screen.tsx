"use client";

import { AlertTriangle, CircleCheck, Clock, Download, Plus, ReceiptText, Repeat, Search, SearchX, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { InvoiceChip } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { listInvoices, runBilling } from "../api";
import { BILLING_LOOKUPS, fmtDate, InvoiceStatus, money, monthLabel, monthShort, rs0, todayPk, useLoad } from "./billing-ui";
import { InvoiceDrawer } from "./invoice-drawer";
import { InvoiceFormModal } from "./invoice-modals";

const CHIPS: [InvoiceChip, string][] = [["all", "All"], ["PAID", "Paid"], ["OPEN", "Open"], ["OVERDUE", "Overdue"], ["VOID", "Void"], ["DRAFT", "Draft"]];
const PAGE = 25;

/**
 * Super Admin › Billing › Platform Invoices (template admin/invoices, 30-entry-admin.html 589–636): KPIs of the month,
 * month select, status chips, the invoices table and its row drawer. "Manual invoice" creates a draft; "Run billing"
 * runs the daily billing job now (renewal invoices + dunning).
 */
export function InvoicesScreen() {
  const toast = useToast();
  const lookups = useAdminLookups(BILLING_LOOKUPS);
  const [month, setMonth] = useState("");
  const [chip, setChip] = useState<InvoiceChip>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, reload } = useLoad(
    () => listInvoices({ month: month || undefined, status: chip, search: search.trim() || undefined, page, pageSize: PAGE }),
    "Could not load invoices", [month, chip, search, page]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [running, setRunning] = useState(false);

  const k = data?.kpis;
  const kMonth = k ? monthShort(k.month).split(" ")[0] : "";
  const items = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const sum = (f: (i: (typeof items)[number]) => number) => items.reduce((s, i) => s + f(i), 0);
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const exportCsv = () => {
    const head = ["Invoice #", "Tenant", "Description", "Issued", "Due", "Subtotal", "Tax", "Total", "Paid", "Balance", "Status"];
    const rows = items.map((i) => [i.docNo ?? "Draft", i.tenantName, i.description, i.issuedOn, i.dueOn, i.netAmount, i.taxAmount, i.totalAmount, i.paidAmount, i.balanceAmount, i.overdue ? "OVERDUE" : i.status]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `platform-invoices-${month || todayPk().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${items.length} platform invoices exported`, { tone: "good" });
  };

  const run = async () => {
    setRunning(true);
    try {
      const r = await runBilling();
      toast(`Billing run · ${r.invoicesIssued} invoices issued, ${r.casesOpened} dunning cases opened, ${r.statusChanges.length} company status changes${r.errors.length ? `, ${r.errors.length} errors` : ""}`, { tone: r.errors.length ? "warn" : "good" });
      setConfirmRun(false);
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not run billing"), { tone: "danger" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHead eyebrow="Billing / Platform Invoices" title="Platform invoices" description="Invoices issued by Accountex to tenants, with provincial sales tax on services."
        actions={<>
          <button type="button" className="btn secondary" disabled={!items.length} onClick={exportCsv}><Download />Export</button>
          <button type="button" className="btn secondary" onClick={() => setConfirmRun(true)}><Repeat />Run billing</button>
          <button type="button" className="btn primary" onClick={() => setCreating(true)}><Plus />Manual invoice</button>
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Billed{kMonth ? ` (${kMonth})` : ""}</span><span className="icon-well"><ReceiptText /></span></div><strong>{k ? rs0(k.billed) : "—"}</strong><small>{k ? `incl. ${rs0(k.billedTax)} tax` : "Issued this month"}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Collected{kMonth ? ` (${kMonth})` : ""}</span><span className="icon-well"><CircleCheck /></span></div><strong>{k ? rs0(k.collected) : "—"}</strong><small className={k?.collectionRatePct ? "up" : undefined}>{k?.collectionRatePct !== null && k?.collectionRatePct !== undefined ? `${k.collectionRatePct}% collection rate` : "Nothing billed yet"}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Open</span><span className="icon-well"><Clock /></span></div><strong>{k ? rs0(k.openAmount) : "—"}</strong><small>{k ? `${k.openCount} invoice${k.openCount === 1 ? "" : "s"}` : "Awaiting payment"}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Overdue</span><span className="icon-well"><AlertTriangle /></span></div><strong>{k ? rs0(k.overdueAmount) : "—"}</strong><small className={k?.overdueCount ? "down" : undefined}>{k ? `${k.overdueCount} invoice${k.overdueCount === 1 ? "" : "s"} > 7 days` : "Past due by a week"}</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Invoices — {month ? monthLabel(month) : "all months"}</h3><p>{data ? `${data.counts.all} invoice${data.counts.all === 1 ? "" : "s"}${month && k ? ` · ${rs0(k.billed)} billed` : ""}` : "Loading…"}</p></div></div>
        <div className="toolbar">
          <label className={cn("search-field", search && "has-val")}><Search /><input value={search} placeholder="Invoice # or tenant…" onChange={(e) => filter(setSearch)(e.target.value)} /></label>
          <select value={month} aria-label="Month" onChange={(e) => filter(setMonth)(e.target.value)}>
            <option value="">All months</option>
            {[...new Set([todayPk().slice(0, 7), ...(data?.months ?? [])])].sort().reverse().map((m) => <option key={m} value={m}>{monthShort(m)}</option>)}
          </select>
          <div className="chips">
            {CHIPS.map(([c, l]) => <button key={c} type="button" className={chip === c ? "active" : undefined} onClick={() => filter(setChip)(c)}>{l} <i>{data?.counts[c] ?? "…"}</i></button>)}
          </div>
        </div>
        {error ? <div style={{ padding: 16 }}><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div> : (
          <>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Invoice #</th><th>Tenant</th><th>Description</th><th>Issued</th><th>Due</th><th className="num">Subtotal</th><th className="num">Tax</th><th className="num">Total (Rs)</th><th>Status</th><th /></tr></thead>
              <tbody>
                {!data ? Array.from({ length: 5 }, (_, r) => <tr key={r}>{Array.from({ length: 10 }, (_, c) => <td key={c}><Skeleton style={{ height: 10, width: "70%" }} /></td>)}</tr>) : items.map((i) => (
                  <tr key={i.id} style={{ cursor: "pointer" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setOpen(i.id); }}>
                    <td><b>{i.docNo ?? <span className="muted">Draft</span>}</b></td>
                    <td>{i.tenantName}</td>
                    <td>{i.description}</td>
                    <td>{fmtDate(i.issuedOn)}</td>
                    <td>{fmtDate(i.dueOn)}</td>
                    <td className="num">{money(i.netAmount)}</td>
                    <td className="num">{money(i.taxAmount)}</td>
                    <td className="num">{money(i.totalAmount)}</td>
                    <td><InvoiceStatus inv={i} lookups={lookups} /></td>
                    <td className="actions">
                      {i.docNo ? <Link className="icon-btn-sm" href={`/admin/invoices/${i.id}/print`} target="_blank" title="Download PDF" aria-label="Download PDF"><Download /></Link> : null}
                      <button type="button" className="icon-btn-sm" disabled title="Reminder emails arrive with email delivery (Phase 29)" aria-label="Send reminder"><Send /></button>
                    </td>
                  </tr>
                ))}
                {data && items.length > 0 && <tr className="total"><td colSpan={5}>Total (this page)</td><td className="num">{money(sum((i) => i.netAmount))}</td><td className="num">{money(sum((i) => i.taxAmount))}</td><td className="num">{money(sum((i) => i.totalAmount))}</td><td colSpan={2} /></tr>}
              </tbody>
            </table></div>
            {data && items.length === 0 && (data.counts.all === 0 && !search
              ? <EmptyState icon={<ReceiptText />} title="No platform invoices yet" description="Subscription invoices are generated by the daily billing run (or Run billing); add a one-off charge with Manual invoice."
                  action={<button type="button" className="btn primary sm" onClick={() => setCreating(true)}><Plus />Manual invoice</button>} />
              : <EmptyState icon={<SearchX />} tone="blue" title="No invoices match" description="Try another month or chip, or clear the search."
                  action={<button type="button" className="btn secondary sm" onClick={() => { setSearch(""); setMonth(""); setChip("all"); setPage(1); }}>Reset filters</button>} />)}
            {data && data.total > 0 && (
              <div className="table-foot"><span>Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, data.total)} of {data.total}</span>
                <div className="pager">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
                  {Array.from({ length: Math.min(pages, 7) }, (_, n) => n + 1).map((n) => <button key={n} type="button" className={n === page ? "active" : undefined} onClick={() => setPage(n)}>{n}</button>)}
                  <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <InvoiceDrawer id={open} lookups={lookups} onClose={() => setOpen(null)} onChanged={reload} />
      <InvoiceFormModal open={creating} invoice={null} lookups={lookups} onClose={() => setCreating(false)} onSaved={(d) => { setCreating(false); reload(); setOpen(d.id); }} />
      <ConfirmDialog open={confirmRun} onClose={() => setConfirmRun(false)} onConfirm={run} busy={running} title="Run billing now?" confirmLabel="Run billing">
        Bills every live paid subscription whose current period has no invoice yet, opens dunning cases for overdue invoices and moves overdue companies
        through the active dunning policy (past due → read-only → suspended). The same run happens automatically once a day.
      </ConfirmDialog>
    </>
  );
}
