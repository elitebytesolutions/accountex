"use client";

import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CircleCheck, Clock, FileCheck2, FileSpreadsheet, Info, Landmark, Printer, RefreshCw, Send, Trash2, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SalesTaxReturn, SalesTaxReturnDetail, SalesTaxReturnLine } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  annexUrl, deleteReturn, fileReturn, getReturn, listReturns, payReturn, prepareReturn, taxOptions, updateReturn, validateReturn, type TaxOptions,
} from "../api";
import { daysUntil, fmtDate, money, monthLabel, nextMonthDay, recentMonths, RETURN_LABEL, RETURN_TONE, rs, today } from "./tax-ui";

type Can = { create: boolean; edit: boolean; approve: boolean; post: boolean; export: boolean };
type Tab = "annc" | "anna" | "summ" | "hist";
const TOP = 8;
const docHref = (l: SalesTaxReturnLine) =>
  !l.document ? null
    : l.document.kind === "INVOICE" ? `/sales/invoices/${l.document.id}`
    : l.document.kind === "CREDIT_NOTE" ? "/sales/credit-notes"
    : l.document.kind === "BILL" ? `/purchases/bills/${l.document.id}` : "/purchases/debit-notes";

/** The largest `TOP` lines (shown in date order) and the rest grouped, as the template lists "Other … (n invoices)". */
function topAndRest(lines: SalesTaxReturnLine[], all: boolean) {
  if (all || lines.length <= TOP + 2) return { top: lines, rest: [] as SalesTaxReturnLine[] };
  const keep = new Set([...lines].sort((a, b) => Math.abs(b.valueExclTax) - Math.abs(a.valueExclTax)).slice(0, TOP).map((l) => l.id));
  return { top: lines.filter((l) => keep.has(l.id)), rest: lines.filter((l) => !keep.has(l.id)) };
}
const sum = (ls: SalesTaxReturnLine[], k: "valueExclTax" | "salesTax" | "furtherTax") => ls.reduce((s, l) => s + l[k], 0);

/** Template app/tax/sales-tax (42-acc-reports.html): monthly sales tax return with Annex-C / Annex-A, validation and filing. */
export function SalesTaxScreen({ can, initialPeriod }: { can: Can; initialPeriod: string | null }) {
  const toast = useToast();
  const [period, setPeriod] = useState(() => initialPeriod ?? recentMonths(2)[1]!);
  const [returns, setReturns] = useState<SalesTaxReturn[] | null>(null);
  const [detail, setDetail] = useState<SalesTaxReturnDetail | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("annc");
  const [allC, setAllC] = useState(false);
  const [allA, setAllA] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "iris" | "file" | "pay" | "delete">(null);
  const [options, setOptions] = useState<TaxOptions | null>(null);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const loading = loadedKey !== `${period}|${attempt}`;

  useEffect(() => {
    let cancelled = false;
    taxOptions().then((o) => !cancelled && setOptions(o)).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listReturns({ authority: "FBR", pageSize: 36 })
      .then(async (list) => {
        const mine = list.items.find((r) => r.periodMonth === period) ?? null;
        const d = mine ? await getReturn(mine.id) : null;
        if (!cancelled) { setReturns(list.items); setDetail(d); setError(null); }
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the sales tax return" }))
      .finally(() => !cancelled && setLoadedKey(`${period}|${attempt}`));
    return () => { cancelled = true; };
  }, [period, attempt]);

  const months = useMemo(() => {
    const set = new Set([...recentMonths(13), ...(returns ?? []).map((r) => r.periodMonth)]);
    return [...set].sort().reverse();
  }, [returns]);
  const statusOf = (m: string) => returns?.find((r) => r.periodMonth === m)?.status;
  const prev = useMemo(() => (returns ?? []).filter((r) => r.periodMonth < period && ["FILED", "PAID"].includes(r.status)).sort((a, b) => b.periodMonth.localeCompare(a.periodMonth))[0] ?? null, [returns, period]);
  const history = useMemo(() => (returns ?? []).filter((r) => ["FILED", "PAID"].includes(r.status)).slice(0, 6), [returns]);

  const run = async (fn: () => Promise<SalesTaxReturnDetail | void>, ok: string) => {
    setBusy(true);
    try {
      const d = await fn();
      if (d) setDetail(d);
      toast(ok, { tone: "good" });
      setDialog(null);
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not complete that"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const draft = detail && ["DRAFT", "VALIDATED"].includes(detail.status);
  const annexC = detail?.lines.filter((l) => l.annex === "C") ?? [];
  const annexA = detail?.lines.filter((l) => l.annex === "A") ?? [];
  const toggleMatch = (line: SalesTaxReturnLine) => {
    if (!detail || !draft || !can.edit) return;
    const unmatched = annexA.filter((l) => (l.id === line.id ? l.matchStatus !== "UNMATCHED" : l.matchStatus === "UNMATCHED")).map((l) => l.id);
    void run(() => updateReturn(detail.id, { unmatchedLineIds: unmatched, rowVersion: detail.rowVersion }), line.matchStatus === "UNMATCHED" ? "Marked as matched" : "Marked as unmatched — input flagged");
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const due = detail?.dueDate ?? null;
  const days = due ? daysUntil(due) : null;
  const unmatched = detail?.checks.find((c) => c.key === "unmatched");
  const unmatchedLines = annexA.filter((l) => l.matchStatus === "UNMATCHED");
  const ftLines = annexC.filter((l) => l.furtherTax > 0);
  const capPct = detail && detail.totalOutputTax > 0 ? (detail.admissibleInputTax / detail.totalOutputTax) * 100 : 0;
  const netVsPrev = detail && prev && prev.netPayable > 0 ? ((detail.netPayable - prev.netPayable) / prev.netPayable) * 100 : null;

  return (
    <>
      <PageHead
        eyebrow="Tax & Compliance / Sales Tax Return"
        title={`Sales Tax Return — ${monthLabel(period, true)}`}
        description={`Monthly return under the Sales Tax Act 1990 · STRN ${detail?.strn ?? options?.strn ?? "—"} · due ${fmtDate(detail?.dueDate ?? nextMonthDay(period, 18))}.`}
        actions={
          <>
            <select value={period} onChange={(e) => { setPeriod(e.target.value); setAllA(false); setAllC(false); }} aria-label="Period">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}{statusOf(m) && statusOf(m) !== "DRAFT" ? ` (${RETURN_LABEL[statusOf(m)!]?.toLowerCase()})` : ""}</option>)}
            </select>
            <Button icon={<Printer />} onClick={() => window.print()} disabled={!detail}>Print</Button>
            {can.export && <Button variant="primary" icon={<FileSpreadsheet />} disabled={!detail} onClick={() => setDialog("iris")}>Export for FBR IRIS</Button>}
          </>
        }
      />

      {loading && !detail ? <Skeleton style={{ height: 420 }} /> : !detail ? (
        <div className="panel mt">
          <EmptyState
            icon={<FileSpreadsheet />}
            title={`No return for ${monthLabel(period, true)} yet`}
            description="Prepare builds Annex-C from posted sales invoices and credit notes, and Annex-A from posted vendor bills and debit notes of the month."
            action={can.create ? <Button variant="primary" icon={<RefreshCw />} disabled={busy} onClick={() => void run(() => prepareReturn(period), `${monthLabel(period)} return prepared`)}>{busy ? "Preparing…" : "Prepare return"}</Button> : undefined}
          />
        </div>
      ) : (
        <>
          <div className="row mt" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className="muted small" style={{ marginRight: "auto" }}>{detail.docNo} · {detail.annexCCount} sales / {detail.annexACount} purchase documents</span>
            {draft && can.create && <Button size="sm" icon={<RefreshCw />} disabled={busy} onClick={() => void run(() => prepareReturn(period), "Return refreshed from posted documents")}>Refresh</Button>}
            {draft && can.edit && <Button size="sm" icon={<Trash2 />} disabled={busy} onClick={() => setDialog("delete")}>Delete draft</Button>}
            {detail.status === "DRAFT" && can.approve && <Button size="sm" icon={<FileCheck2 />} disabled={busy} onClick={() => void run(() => validateReturn(detail.id, detail.rowVersion), "Return validated")}>Validate</Button>}
            {detail.status === "VALIDATED" && can.post && <Button size="sm" variant="primary" icon={<Send />} disabled={busy} onClick={() => setDialog("file")}>Mark as filed</Button>}
            {detail.status === "FILED" && can.post && detail.netPayable > 0 && <Button size="sm" variant="primary" icon={<Wallet />} disabled={busy} onClick={() => setDialog("pay")}>Record payment</Button>}
          </div>

          <div className="kpi-grid mt">
            <div className="kpi"><div className="kpi-top"><span>Output tax (Annex-C)</span><span className="icon-well"><ArrowUpRight /></span></div><strong>{rs(detail.totalOutputTax)}</strong><small>GST {Math.round(detail.outputTax).toLocaleString("en-US")} + further tax {Math.round(detail.furtherTax).toLocaleString("en-US")}</small></div>
            <div className="kpi teal"><div className="kpi-top"><span>Input tax (Annex-A)</span><span className="icon-well"><ArrowDownLeft /></span></div><strong>{rs(detail.admissibleInputTax)}</strong><small>Admissible after {Math.round(detail.inputCapPct)}% cap check</small></div>
            <div className="kpi yellow"><div className="kpi-top"><span>Net sales tax payable</span><span className="icon-well"><Landmark /></span></div><strong>{detail.netPayable < 0 ? `(${rs(-detail.netPayable)})` : rs(detail.netPayable)}</strong><small className={netVsPrev !== null && netVsPrev > 0 ? "down" : undefined}>{netVsPrev !== null ? `${netVsPrev >= 0 ? "▲" : "▼"} ${Math.abs(netVsPrev).toFixed(1)}% vs ${monthLabel(prev!.periodMonth).slice(0, 3)} (${rs(prev!.netPayable)})` : detail.netPayable < 0 ? "Excess input carried forward" : "No earlier filed return"}</small></div>
            <div className="kpi blue"><div className="kpi-top"><span>Return status</span><span className="icon-well"><Clock /></span></div><strong>{RETURN_LABEL[detail.status] ?? detail.status}</strong><small>{detail.status === "PAID" ? `Paid ${fmtDate(detail.paidOn)}` : detail.status === "FILED" ? `Filed ${fmtDate(detail.filedOn)}` : days === null ? "" : days >= 0 ? `${days} days to due date` : `${-days} days overdue`}</small></div>
          </div>

          {unmatched && !unmatched.ok && (
            <div className="banner warn mt"><AlertTriangle /><div><b>{unmatchedLines.length} purchase invoice{unmatchedLines.length === 1 ? "" : "s"} not matched with supplier&apos;s Annex-C</b><p>{unmatchedLines[0] ? `${unmatchedLines[0].party ?? "—"} ${unmatchedLines[0].document?.no ?? ""} (input tax Rs ${money(unmatchedLines[0].salesTax)})${unmatchedLines.length > 1 ? ` and ${unmatchedLines.length - 1} more` : ""} is not yet declared by the supplier.` : ""} Input will be inadmissible if unmatched at filing{detail.excludeUnmatchedInput ? " (excluded now)" : ""}.</p></div></div>
          )}
          {ftLines.length > 0 && (
            <div className="banner info mt"><Info /><div><b>Further tax applied on {ftLines.length} invoice{ftLines.length === 1 ? "" : "s"} to unregistered buyers</b><p>Rs {money(sum(ftLines, "furtherTax"))} on Rs {money(sum(ftLines, "valueExclTax"))}.</p></div></div>
          )}

          <div className="split mt">
            <div className="panel">
              <div className="tabs" role="tablist">
                {([["annc", "Annex-C · Sales"], ["anna", "Annex-A · Purchases"], ["summ", "Return summary"], ["hist", "History"]] as [Tab, string][]).map(([k, l]) => (
                  <button key={k} type="button" className={tab === k ? "active" : undefined} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>
              <div className="tab-pane active">
              {tab === "annc" && <AnnexC lines={annexC} all={allC} onAll={() => setAllC(true)} />}
              {tab === "anna" && <AnnexA lines={annexA} all={allA} onAll={() => setAllA(true)} canToggle={!!draft && can.edit && !busy} onToggle={toggleMatch} />}
              {tab === "summ" && (
                <>
                  <div className="table-wrap"><table className="tbl stmt">
                    <tbody>
                      <tr className="sec"><td colSpan={2}>Output tax</td></tr>
                      <tr><td className="ind1">Sales tax on taxable supplies (Annex-C)</td><td className="num">{money(detail.outputTax)}</td></tr>
                      <tr><td className="ind1">Further tax on supplies to unregistered persons</td><td className={detail.furtherTax ? "num" : "num zero"}>{detail.furtherTax ? money(detail.furtherTax) : "—"}</td></tr>
                      <tr className="sub"><td>Total output tax</td><td className="num">{money(detail.totalOutputTax)}</td></tr>
                      <tr className="sec"><td colSpan={2}>Input tax</td></tr>
                      <tr><td className="ind1">Input tax on purchases &amp; imports (Annex-A)</td><td className="num">{money(detail.inputTax)}</td></tr>
                      <tr><td className="ind1">Inadmissible input u/s 8 / 8B</td><td className={detail.inadmissibleInput ? "num" : "num zero"}>{detail.inadmissibleInput ? `(${money(detail.inadmissibleInput)})` : "—"}</td></tr>
                      <tr className="sub"><td>Admissible input tax</td><td className="num">{money(detail.admissibleInputTax)}</td></tr>
                      <tr><td className="ind1">Carry-forward from previous period</td><td className={detail.carryForwardIn ? "num" : "num zero"}>{detail.carryForwardIn ? money(detail.carryForwardIn) : "—"}</td></tr>
                      <tr className="total"><td>{detail.netPayable < 0 ? "Excess input to carry forward" : "Net sales tax payable"}</td><td className="num">{money(Math.abs(detail.netPayable))}</td></tr>
                    </tbody>
                  </table></div>
                  <p className="small muted mt">Section 8B check: input claimed is {capPct.toFixed(1)}% of output tax — {capPct <= detail.inputCapPct + 0.0001 ? `within the ${Math.round(detail.inputCapPct)}% limit` : `above the ${Math.round(detail.inputCapPct)}% limit`}.</p>
                  {detail.paymentJournal && <p className="small muted">Paid {fmtDate(detail.paidOn)} · CPR {detail.cprNo} · {detail.paidFrom?.name} · voucher {detail.paymentJournal.docNo}</p>}
                </>
              )}
              {tab === "hist" && <HistoryTab schema="Tax" table="SalesTaxReturns" id={detail.id} />}
              </div>
            </div>

            <div className="stack">
              <div className="panel">
                <div className="panel-head"><div><h3>Validation</h3><p>Pre-filing checks</p></div></div>
                <div className="list">
                  {detail.checks.map((c) => (
                    <div key={c.key} className="list-item">
                      <span className={c.ok ? "icon-well" : "icon-well yellow"}>{c.ok ? <CircleCheck /> : <AlertTriangle />}</span>
                      <div><b>{c.title}</b><small>{c.detail}{c.key === "fbr" && <> · <Link className="link" href="/tax/fbr">view log</Link></>}</small></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><div><h3>Filing history</h3></div></div>
                {history.length === 0 ? <p className="small muted">No filed returns yet.</p> : (
                  <div className="table-wrap"><table className="tbl">
                    <thead><tr><th>Period</th><th className="num">Paid</th><th>CPR</th></tr></thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} style={{ cursor: "pointer" }} onClick={() => setPeriod(h.periodMonth)}>
                          <td>{monthLabel(h.periodMonth)}<small>Filed {fmtDate(h.filedOn).slice(0, 6)}</small></td>
                          <td className="num">{h.paidAmount !== null ? money(h.paidAmount) : <span className="muted">—</span>}</td>
                          <td className="small">{h.cprNo ?? <Badge tone={RETURN_TONE[h.status]}>{RETURN_LABEL[h.status]}</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </div>
            </div>
          </div>

          <IrisModal open={dialog === "iris"} onClose={() => setDialog(null)} detail={detail} canEdit={!!draft && can.edit} onExclude={(v) => updateReturn(detail.id, { excludeUnmatchedInput: v, rowVersion: detail.rowVersion }).then((d) => { setDetail(d); return d; })} />
          <ConfirmDialog open={dialog === "file"} onClose={() => setDialog(null)} busy={busy} confirmLabel="Mark as filed" title={`File the ${monthLabel(detail.periodMonth)} return?`}
            onConfirm={() => void run(() => fileReturn(detail.id, detail.rowVersion), "Return marked as filed — the month is locked")}>
            Record that this return was submitted on FBR IRIS. Sales invoices, credit notes, vendor bills and debit notes dated in {monthLabel(detail.periodMonth, true)} can no longer be posted or voided.
          </ConfirmDialog>
          <ConfirmDialog open={dialog === "delete"} onClose={() => setDialog(null)} busy={busy} danger confirmLabel="Delete draft" title="Delete this draft return?"
            onConfirm={() => void run(async () => { await deleteReturn(detail.id, detail.rowVersion); setDetail(null); }, "Draft return deleted")}>
            The prepared annexes are removed. You can prepare the month again at any time.
          </ConfirmDialog>
          <PayModal open={dialog === "pay"} onClose={() => setDialog(null)} detail={detail} options={options} onPaid={(d) => { setDetail(d); setDialog(null); reload(); toast(`Payment recorded — ${d.paymentJournal?.docNo ?? "BPV"} posted`, { tone: "good" }); }} />
        </>
      )}
    </>
  );
}

function AnnexC({ lines, all, onAll }: { lines: SalesTaxReturnLine[]; all: boolean; onAll: () => void }) {
  if (!lines.length) return <EmptyState icon={<FileSpreadsheet />} title="No taxable sales this month" description="Posted sales invoices with sales tax appear here." />;
  const { top, rest } = topAndRest(lines, all);
  const reg = rest.filter((l) => l.isRegistered);
  const unreg = rest.filter((l) => !l.isRegistered);
  return (
    <div className="table-wrap"><table className="tbl">
      <thead><tr><th>Buyer</th><th>NTN / CNIC</th><th>Invoice</th><th>Date</th><th className="num">Value excl. tax</th><th className="num">Sales tax</th><th className="num">Further tax</th></tr></thead>
      <tbody>
        {top.map((l) => {
          const href = docHref(l);
          return (
            <tr key={l.id}>
              <td>{l.party ?? "—"}{!l.isRegistered && <> <Badge tone="warn">Unregistered</Badge></>}</td>
              <td>{l.partyNtnCnic ?? <span className="muted">—</span>}</td>
              <td>{href ? <Link className="link" href={href}>{l.document?.no}</Link> : l.document?.no}</td>
              <td>{fmtDate(l.documentDate)}</td>
              <td className="num">{money(l.valueExclTax)}</td>
              <td className="num">{money(l.salesTax)}</td>
              <td className={l.furtherTax ? "num" : "num zero"}>{l.furtherTax ? money(l.furtherTax) : "—"}</td>
            </tr>
          );
        })}
        {[["registered", reg], ["unregistered", unreg]].map(([k, g]) => (g as SalesTaxReturnLine[]).length > 0 && (
          <tr key={k as string}>
            <td className="muted"><button type="button" className="link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }} onClick={onAll}>Other {k as string} buyers ({(g as SalesTaxReturnLine[]).length} invoices)</button></td><td /><td /><td />
            <td className="num">{money(sum(g as SalesTaxReturnLine[], "valueExclTax"))}</td><td className="num">{money(sum(g as SalesTaxReturnLine[], "salesTax"))}</td>
            <td className={sum(g as SalesTaxReturnLine[], "furtherTax") ? "num" : "num zero"}>{sum(g as SalesTaxReturnLine[], "furtherTax") ? money(sum(g as SalesTaxReturnLine[], "furtherTax")) : "—"}</td>
          </tr>
        ))}
        <tr className="total"><td colSpan={4}>Total Annex-C ({lines.length} invoices)</td><td className="num">{money(sum(lines, "valueExclTax"))}</td><td className="num">{money(sum(lines, "salesTax"))}</td><td className="num">{money(sum(lines, "furtherTax"))}</td></tr>
      </tbody>
    </table></div>
  );
}

function AnnexA({ lines, all, onAll, canToggle, onToggle }: { lines: SalesTaxReturnLine[]; all: boolean; onAll: () => void; canToggle: boolean; onToggle: (l: SalesTaxReturnLine) => void }) {
  if (!lines.length) return <EmptyState icon={<FileSpreadsheet />} title="No input tax this month" description="Posted vendor bills with sales tax appear here." />;
  const { top, rest } = topAndRest(lines, all);
  return (
    <div className="table-wrap"><table className="tbl">
      <thead><tr><th>Supplier</th><th>STRN</th><th>Document</th><th>Date</th><th className="num">Value excl. tax</th><th className="num">Input tax</th><th>Match</th></tr></thead>
      <tbody>
        {top.map((l) => {
          const href = docHref(l);
          const badge = <Badge tone={l.matchStatus === "UNMATCHED" ? "warn" : "good"}>{l.matchStatus === "UNMATCHED" ? "Unmatched" : "Matched"}</Badge>;
          return (
            <tr key={l.id}>
              <td>{l.party ?? "—"}</td>
              <td>{l.partyStrn ?? <span className="muted">—</span>}</td>
              <td>{href ? <Link className="link" href={href}>{l.document?.no}</Link> : l.document?.no}</td>
              <td>{fmtDate(l.documentDate)}</td>
              <td className="num">{money(l.valueExclTax)}</td>
              <td className="num">{money(l.salesTax)}</td>
              <td>{canToggle ? <button type="button" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} title={l.matchStatus === "UNMATCHED" ? "Mark as matched" : "Mark as not declared by the supplier"} onClick={() => onToggle(l)}>{badge}</button> : badge}</td>
            </tr>
          );
        })}
        {rest.length > 0 && (
          <tr>
            <td className="muted"><button type="button" className="link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }} onClick={onAll}>Other suppliers ({rest.length} documents)</button></td><td /><td /><td />
            <td className="num">{money(sum(rest, "valueExclTax"))}</td><td className="num">{money(sum(rest, "salesTax"))}</td>
            <td><Badge tone={rest.some((l) => l.matchStatus === "UNMATCHED") ? "warn" : "good"}>{rest.some((l) => l.matchStatus === "UNMATCHED") ? "Mixed" : "Matched"}</Badge></td>
          </tr>
        )}
        <tr className="total"><td colSpan={4}>Total Annex-A ({lines.length} documents)</td><td className="num">{money(sum(lines, "valueExclTax"))}</td><td className="num">{money(sum(lines, "salesTax"))}</td><td /></tr>
      </tbody>
    </table></div>
  );
}

/** Template modal rpt-iris-export: IRIS CSV per annex (Annex-H stock is quarterly and not built yet). */
function IrisModal({ open, onClose, detail, canEdit, onExclude }: { open: boolean; onClose: () => void; detail: SalesTaxReturnDetail; canEdit: boolean; onExclude: (v: boolean) => Promise<SalesTaxReturnDetail> }) {
  const toast = useToast();
  const [a, setA] = useState(true);
  const [c, setC] = useState(true);
  const [busy, setBusy] = useState(false);
  const unm = detail.lines.filter((l) => l.annex === "A" && l.matchStatus === "UNMATCHED");
  const download = async () => {
    setBusy(true);
    try {
      for (const [on, k] of [[c, "c"], [a, "a"]] as [boolean, "a" | "c"][]) {
        if (!on) continue;
        const link = document.createElement("a");
        link.href = annexUrl(detail.id, k);
        link.download = "";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      toast("IRIS files downloaded", { tone: "good" });
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Export for FBR IRIS" subtitle="Generates Annex files in the IRIS upload format."
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || (!a && !c)} onClick={() => void download()}>Download files</button></>}>
      <div className="form-grid">
        <Check full label={`Annex-A — Purchases (${detail.annexACount} rows)`} checked={a} onChange={(e) => setA(e.target.checked)} />
        <Check full label={`Annex-C — Sales (${detail.annexCCount} rows)`} checked={c} onChange={(e) => setC(e.target.checked)} />
        <Check full label="Annex-H — Stock (quarterly, not available yet)" checked={false} disabled onChange={() => undefined} />
        <label><span>Format</span><select disabled><option>IRIS CSV (UTF-8)</option></select></label>
        <label><span>Exclude unmatched input</span>
          <select value={detail.excludeUnmatchedInput ? "yes" : "no"} disabled={!canEdit}
            onChange={(e) => void onExclude(e.target.value === "yes").catch((err: unknown) => toast(apiMessage(err, "Could not change it"), { tone: "danger" }))}>
            <option value="no">No — include and flag</option><option value="yes">Yes</option>
          </select>
        </label>
      </div>
      {unm.length > 0 && (
        <div className="banner warn mt"><AlertTriangle /><div><b>{unm.length} warning{unm.length === 1 ? "" : "s"}</b><p>Unmatched input of Rs {money(sum(unm, "salesTax"))} will be {detail.excludeUnmatchedInput ? "left out" : "included"}.</p></div></div>
      )}
    </Modal>
  );
}

function PayModal({ open, onClose, detail, options, onPaid }: { open: boolean; onClose: () => void; detail: SalesTaxReturnDetail; options: TaxOptions | null; onPaid: (d: SalesTaxReturnDetail) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ cprNo: "", paidOn: today(), bankAccountId: "", paidAmount: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) { setF({ cprNo: "", paidOn: today(), bankAccountId: options?.bankAccounts[0]?.id ?? "", paidAmount: detail.netPayable.toFixed(2) }); setErrs({}); }
  }
  const save = async () => {
    setBusy(true);
    setErrs({});
    try {
      onPaid(await payReturn(detail.id, { ...f, paidAmount: Number(f.paidAmount.replace(/,/g, "")), rowVersion: detail.rowVersion }));
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not record the payment"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record sales tax payment" subtitle={`CPR for ${monthLabel(detail.periodMonth, true)} · net payable Rs ${money(detail.netPayable)}`}
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save payment"}</button></>}>
      <FormGrid>
        <Field label="CPR number" required error={errs.cprNo}><input value={f.cprNo} placeholder="ST2026…" onChange={(e) => setF({ ...f, cprNo: e.target.value })} /></Field>
        <Field label="Payment date" required error={errs.paidOn}><input type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></Field>
        <Field label="Paid from" required error={errs.bankAccountId}>
          <select value={f.bankAccountId} onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}>
            <option value="">Choose…</option>
            {options?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Amount" required error={errs.paidAmount}><input inputMode="decimal" value={f.paidAmount} onChange={(e) => setF({ ...f, paidAmount: e.target.value })} /></Field>
      </FormGrid>
      <p className="small muted mt">Posts a bank payment voucher: Dr output tax {money(detail.outputTax)} + further tax {money(detail.furtherTax)}, Cr input tax {money(detail.admissibleInputTax + detail.carryForwardIn)}, Cr bank.</p>
    </Modal>
  );
}
