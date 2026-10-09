"use client";

import Link from "next/link";
import { CalendarClock, Download, FileCheck, FileMinus, FileText, Landmark, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WhtChallan, WhtDeduction, WhtStatement, WhtSummary } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  cancelChallan, challanUnpaid, createChallan, createDeduction, deleteDeduction, fileStatement, listChallans, listDeductions, listStatements, prepareStatement,
  taxOptions, updateDeduction, whtSummary, type TaxOptions,
} from "../api";
import { CertificatesDrawer } from "./wht-certificates";
import { DIRECTION_LABEL, daysUntil, fmtDate, money, monthLabel, recentMonths, rs, sectionCode, sectionNature, today, WHT_LABEL, WHT_TONE } from "./tax-ui";

type Can = { create: boolean; edit: boolean; approve: boolean; post: boolean; export: boolean };
const STATEMENT_TONE: Record<string, "good" | "warn" | "neutral"> = { FILED: "good", IN_PREPARATION: "warn", REVISED: "neutral", NOT_PREPARED: "neutral" };
const SOURCE_HREF: Record<string, (id: string) => string> = {
  PAY: () => "/payables/payments", BILL: (id) => `/purchases/bills/${id}`, PV: (id) => `/purchases/bills/${id}`, RCPT: () => "/receivables/receipts",
  INV: (id) => `/sales/invoices/${id}`, SV: (id) => `/sales/invoices/${id}`, POS: (id) => `/sales/invoices/${id}`, WS: (id) => `/sales/invoices/${id}`,
};

/** Template app/tax/wht (42-acc-reports.html): deductions by section, challans (CPR), statements and certificates. */
export function WhtScreen({ can, initialPeriod }: { can: Can; initialPeriod: string | null }) {
  const toast = useToast();
  const [period, setPeriod] = useState(() => initialPeriod ?? recentMonths(2)[1]!);
  const [summary, setSummary] = useState<WhtSummary | null>(null);
  const [challans, setChallans] = useState<WhtChallan[] | null>(null);
  const [statements, setStatements] = useState<WhtStatement[] | null>(null);
  const [options, setOptions] = useState<TaxOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [section, setSection] = useState<{ direction: string; whtSection: string } | null>(null);
  const [dialog, setDialog] = useState<null | "challan" | "deduction" | "certs" | "prepare">(null);
  const [filing, setFiling] = useState<WhtStatement | null>(null);
  const [cancelling, setCancelling] = useState<WhtChallan | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([whtSummary(period), listChallans(), listStatements(), taxOptions()])
      .then(([s, c, st, o]) => { if (!cancelled) { setSummary(s); setChallans(c); setStatements(st); setOptions(o); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load withholding tax" }));
    return () => { cancelled = true; };
  }, [period, attempt]);

  const labels = options?.sections ?? [];
  const quarterChallans = useMemo(() => {
    if (!summary || !challans) return [];
    return challans.filter((c) => c.status !== "CANCELLED").slice(0, 8);
  }, [summary, challans]);
  const exportCsv = () => {
    if (!summary) return;
    const rows = [["Section", "Nature", "Transactions", "Taxable amount", "Rate", "Tax", "Unpaid"], ...summary.sections.map((s) => [sectionCode(s.whtSection), sectionNature(s.whtSection, labels), s.transactions, s.taxableAmount.toFixed(2), s.rate ?? "", s.taxAmount.toFixed(2), s.unpaid.toFixed(2)])];
    const blob = new Blob([`﻿${rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n")}`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `WHT_${period.slice(0, 7)}_by_section.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const days = summary ? daysUntil(summary.dueDate) : null;

  return (
    <>
      <PageHead
        eyebrow="Tax & Compliance / Withholding Tax"
        title="Withholding Tax Statements"
        description={`Income tax deducted and collected under the Income Tax Ordinance 2001 · NTN ${options?.ntn ?? "—"}.`}
        actions={
          <>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
              {recentMonths(13).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <Button icon={<FileText />} onClick={() => setDialog("certs")}>Deduction certificates</Button>
            {can.post && <Button variant="primary" icon={<Plus />} onClick={() => setDialog("challan")}>Record challan</Button>}
          </>
        }
      />

      {!summary || !challans || !statements ? <Skeleton style={{ height: 420 }} /> : (
        <>
          <div className="kpi-grid">
            <div className="kpi"><div className="kpi-top"><span>Deducted — {monthLabel(period)}</span><span className="icon-well"><FileMinus /></span></div><strong>{rs(summary.deducted)}</strong><small>{summary.transactions} transaction{summary.transactions === 1 ? "" : "s"}</small></div>
            <div className="kpi yellow"><div className="kpi-top"><span>Due to FBR by {fmtDate(summary.dueDate).slice(0, 6)}</span><span className="icon-well"><CalendarClock /></span></div><strong>{rs(summary.unpaid)}</strong><small>{summary.unpaid === 0 ? "Nothing unpaid" : days !== null && days >= 0 ? `${days} days remaining` : `${-(days ?? 0)} days overdue`}</small></div>
            <div className="kpi teal"><div className="kpi-top"><span>Deposited {summary.quarterLabel.split(" ")[0]} to date</span><span className="icon-well"><Landmark /></span></div><strong>{rs(summary.depositedQuarter)}</strong><small>Paid challans this quarter</small></div>
            <div className="kpi blue"><div className="kpi-top"><span>{summary.quarterLabel.split(" ")[0]} statement u/s 165</span><span className="icon-well"><FileCheck /></span></div><strong>{summary.statement?.status === "FILED" ? "Filed" : `Due ${fmtDate(summary.statement?.dueDate).slice(0, 6)}`}</strong><small>{summary.statement?.status === "IN_PREPARATION" ? "In preparation" : summary.statement?.status === "FILED" ? summary.statement.label : "Not prepared yet"}</small></div>
          </div>

          <div className="panel flush mt">
            <div className="panel-head">
              <div><h3>Deductions by section — {monthLabel(period, true)}</h3><p>Tax deducted at payment and collected on sales{summary.suffered ? ` · Rs ${money(summary.suffered)} withheld from us by customers` : ""}</p></div>
              <div className="panel-actions">
                {can.create && <button type="button" className="btn ghost sm" onClick={() => setDialog("deduction")}><Plus />Add deduction</button>}
                <button type="button" className="btn ghost sm" onClick={exportCsv} disabled={!summary.sections.length}><Download />Export</button>
              </div>
            </div>
            {summary.sections.length === 0 ? (
              <EmptyState icon={<FileMinus />} title={`No withholding tax in ${monthLabel(period, true)}`} description="Vendor payments and purchase vouchers that withhold tax, and invoices with advance tax, are registered here when they are posted." />
            ) : (
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Section</th><th>Nature</th><th className="num">Transactions</th><th className="num">Taxable amount</th><th className="num">Rate</th><th className="num">Tax deducted</th><th>Status</th></tr></thead>
                <tbody>
                  {summary.sections.map((s) => (
                    <tr key={`${s.direction}${s.whtSection}`} style={{ cursor: "pointer" }} onClick={() => setSection(s)}>
                      <td><b>{sectionCode(s.whtSection)}</b></td>
                      <td>{sectionNature(s.whtSection, labels)}{s.direction === "COLLECTED" && <span className="muted"> · collected</span>}</td>
                      <td className="num">{s.transactions}</td>
                      <td className="num">{money(s.taxableAmount)}</td>
                      <td className="num">{s.rate === null ? "Mixed" : `${s.rate}%`}</td>
                      <td className="num">{money(s.taxAmount)}</td>
                      <td><Badge tone={WHT_TONE[s.status]}>{WHT_LABEL[s.status]}</Badge></td>
                    </tr>
                  ))}
                  <tr className="total"><td colSpan={2}>Total {monthLabel(period, true)}</td><td className="num">{summary.transactions}</td><td className="num">{money(summary.sections.reduce((a, s) => a + s.taxableAmount, 0))}</td><td /><td className="num">{money(summary.deducted)}</td><td /></tr>
                </tbody>
              </table></div>
            )}
          </div>

          <div className="grid-2 mt">
            <div className="panel flush">
              <div className="panel-head"><div><h3>Challans (CPR)</h3><p>Payments to FBR via e-Payment</p></div></div>
              {quarterChallans.length === 0 ? <EmptyState icon={<Landmark />} title="No challans yet" description="Record the CPR when you deposit a month's deductions." /> : (
                <div className="table-wrap"><table className="tbl">
                  <thead><tr><th>CPR number</th><th>Period</th><th>Paid on</th><th>Bank</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {quarterChallans.map((c) => (
                      <tr key={c.id} style={can.post && c.status === "PAID" ? { cursor: "pointer" } : undefined} title={can.post && c.status === "PAID" ? "Cancel this challan" : undefined} onClick={() => can.post && c.status === "PAID" && setCancelling(c)}>
                        <td><b>{c.cprNo}</b><small>{c.sections.map(sectionCode).join(" · ")}{c.journal ? ` · ${c.journal.docNo}` : ""}</small></td>
                        <td>{monthLabel(c.periodMonth)}</td>
                        <td>{fmtDate(c.paymentDate)}</td>
                        <td>{c.bankAccount?.name ?? "—"}</td>
                        <td className="num">{money(c.amount)}</td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={4}>Deposited {summary.quarterLabel.split(" ")[0]} to date</td><td className="num">{money(summary.depositedQuarter)}</td></tr>
                  </tbody>
                </table></div>
              )}
            </div>
            <div className="panel flush">
              <div className="panel-head">
                <div><h3>Quarterly statements u/s 165</h3><p>Filed on IRIS</p></div>
                {can.create && <div className="panel-actions"><button type="button" className="btn ghost sm" onClick={() => setDialog("prepare")}><Plus />Prepare</button></div>}
              </div>
              {statements.length === 0 ? <EmptyState icon={<FileCheck />} title="No statements yet" description="Prepare totals the deductions of a quarter (u/s 165) or fiscal year (u/s 149 salary)." /> : (
                <div className="table-wrap"><table className="tbl">
                  <thead><tr><th>Quarter</th><th>Due date</th><th className="num">Tax</th><th>Status</th></tr></thead>
                  <tbody>
                    {statements.map((s) => (
                      <tr key={s.id}>
                        <td><b>{s.label}</b><small>{monthLabel(s.periodFrom)}–{monthLabel(s.periodTo)}</small></td>
                        <td>{fmtDate(s.dueDate)}</td>
                        <td className="num">{money(s.taxAmount)}</td>
                        <td>
                          {s.status === "IN_PREPARATION" && can.post
                            ? <button type="button" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} title="Mark as filed" onClick={() => setFiling(s)}><Badge tone="warn" dot>In preparation</Badge></button>
                            : <Badge tone={STATEMENT_TONE[s.status] ?? "neutral"} dot>{s.status === "FILED" ? `Filed ${fmtDate(s.filedOn).slice(0, 6)}` : s.status === "IN_PREPARATION" ? "In preparation" : "Revised"}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          </div>
        </>
      )}

      <SectionDrawer open={!!section} onClose={() => setSection(null)} period={period} section={section} labels={labels} can={can} options={options} onChanged={reload} />
      <ChallanModal open={dialog === "challan"} onClose={() => setDialog(null)} period={period} summary={summary} options={options} onDone={(c) => { setDialog(null); reload(); toast(`Challan recorded and ${c.journal?.docNo ?? "BPV"} created`, { tone: "good" }); }} />
      <DeductionModal open={dialog === "deduction"} onClose={() => setDialog(null)} options={options} editing={null} onDone={() => { setDialog(null); reload(); toast("Deduction added", { tone: "good" }); }} />
      <PrepareStatementModal open={dialog === "prepare"} onClose={() => setDialog(null)} period={period} onDone={(s) => { setDialog(null); reload(); toast(`${s.label} prepared — Rs ${money(s.taxAmount)}`, { tone: "good" }); }} />
      <FileStatementModal statement={filing} onClose={() => setFiling(null)} onDone={() => { setFiling(null); reload(); toast("Statement marked as filed", { tone: "good" }); }} />
      <CertificatesDrawer open={dialog === "certs"} onClose={() => setDialog(null)} period={period} options={options} can={can} />
      <ConfirmDialog open={!!cancelling} onClose={() => setCancelling(null)} busy={busy} danger confirmLabel="Cancel challan" title={`Cancel challan ${cancelling?.cprNo ?? ""}?`}
        onConfirm={() => {
          if (!cancelling) return;
          setBusy(true);
          cancelChallan(cancelling.id, cancelling.rowVersion, "Cancelled from Withholding Tax")
            .then(() => { toast("Challan cancelled — its voucher is reversed and the deductions are unpaid again", { tone: "good" }); setCancelling(null); reload(); })
            .catch((e: unknown) => toast(apiMessage(e, "Could not cancel the challan"), { tone: "danger" }))
            .finally(() => setBusy(false));
        }}>
        The bank payment voucher is reversed and its deductions go back to unpaid. A challan with issued certificates can&apos;t be cancelled.
      </ConfirmDialog>
    </>
  );
}

/** The deductions of one section in the month; a manual one can be edited or deleted; each shows its history. */
function SectionDrawer({ open, onClose, period, section, labels, can, options, onChanged }: {
  open: boolean; onClose: () => void; period: string; section: { direction: string; whtSection: string } | null; labels: { code: string; label: string }[];
  can: Can; options: TaxOptions | null; onChanged: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<WhtDeduction[] | null>(null);
  const [selected, setSelected] = useState<WhtDeduction | null>(null);
  const [editing, setEditing] = useState<WhtDeduction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open || !section) return;
    let cancelled = false;
    listDeductions({ period, section: section.whtSection, direction: section.direction, pageSize: 200 })
      .then((r) => !cancelled && setRows(r.items))
      .catch(() => !cancelled && setRows([]));
    return () => { cancelled = true; };
  }, [open, period, section, attempt]);
  const [seen, setSeen] = useState(open);
  if (seen !== open) { setSeen(open); setSelected(null); setRows(null); }
  const refresh = () => { setAttempt((n) => n + 1); onChanged(); };

  return (
    <Drawer open={open} onClose={onClose} wide title={section ? `${sectionCode(section.whtSection)} · ${sectionNature(section.whtSection, labels)}` : ""} subtitle={`${section ? DIRECTION_LABEL[section.direction] : ""} · ${monthLabel(period, true)}`}>
      {!rows ? <Skeleton style={{ height: 200 }} /> : !rows.length ? <EmptyState title="No deductions" /> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Date</th><th>Party</th><th>Source</th><th className="num">Taxable</th><th className="num">Tax</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className={selected?.id === d.id ? "selected" : undefined} style={{ cursor: "pointer" }} onClick={() => setSelected(d)}>
                <td>{fmtDate(d.deductionDate)}</td>
                <td>{d.party}<small>{d.partyNtnCnic ?? ""}{d.isAtl === false ? " · non-ATL" : ""}</small></td>
                <td>{d.source ? (SOURCE_HREF[d.source.type] ? <Link className="link" href={SOURCE_HREF[d.source.type]!(d.source.id)} onClick={(e) => e.stopPropagation()}>{d.source.docNo ?? d.source.type}</Link> : d.source.docNo) : <span className="muted">Entered by hand</span>}</td>
                <td className="num">{money(d.taxableAmount)}</td>
                <td className="num">{money(d.taxAmount)}</td>
                <td><Badge tone={WHT_TONE[d.status] ?? "neutral"}>{WHT_LABEL[d.status] ?? d.status}</Badge>{d.challan && <small>CPR {d.challan.cprNo}</small>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {selected && (
        <div className="mt">
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <h4 style={{ margin: 0 }}>{selected.party} · Rs {money(selected.taxAmount)}</h4>
            <span className="spacer" style={{ flex: 1 }} />
            {!selected.source && selected.status === "UNPAID" && !selected.certificate && can.edit && (
              <>
                <button type="button" className="btn ghost sm" onClick={() => setEditing(selected)}>Edit</button>
                <button type="button" className="btn ghost sm" onClick={() => setDeleting(true)}>Delete</button>
              </>
            )}
          </div>
          <HistoryTab schema="Tax" table="WhtDeductions" id={selected.id} />
        </div>
      )}
      <DeductionModal open={!!editing} onClose={() => setEditing(null)} options={options} editing={editing} onDone={() => { setEditing(null); setSelected(null); refresh(); toast("Deduction updated", { tone: "good" }); }} />
      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} danger confirmLabel="Delete" title="Delete this deduction?"
        onConfirm={() => selected && void deleteDeduction(selected.id, selected.rowVersion)
          .then(() => { setDeleting(false); setSelected(null); refresh(); toast("Deduction deleted", { tone: "good" }); })
          .catch((e: unknown) => toast(apiMessage(e, "Could not delete it"), { tone: "danger" }))}>
        Only deductions entered by hand and not yet paid can be deleted.
      </ConfirmDialog>
    </Drawer>
  );
}

/** Template modal rpt-wht-challan: period, sections, CPR, date, bank and amount (= the sections' unpaid total). */
function ChallanModal({ open, onClose, period, summary, options, onDone }: {
  open: boolean; onClose: () => void; period: string; summary: WhtSummary | null; options: TaxOptions | null; onDone: (c: WhtChallan) => void;
}) {
  const toast = useToast();
  const unpaidSections = (summary?.sections ?? []).filter((s) => s.unpaid > 0);
  const [f, setF] = useState({ sections: [] as string[], cprNo: "", paymentDate: today(), bankAccountId: "", amount: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      const secs = unpaidSections.filter((s) => !s.whtSection.startsWith("149")).map((s) => s.whtSection);
      setF({ sections: secs, cprNo: "", paymentDate: today(), bankAccountId: options?.bankAccounts[0]?.id ?? "", amount: "" });
      setErrs({});
    }
  }
  useEffect(() => {
    if (!open || !f.sections.length) return;
    let cancelled = false;
    challanUnpaid(period, f.sections).then((r) => !cancelled && setF((x) => ({ ...x, amount: r.amount.toFixed(2) }))).catch(() => undefined);
    return () => { cancelled = true; };
  }, [open, period, f.sections]);
  const toggle = (s: string) => setF((x) => ({ ...x, sections: x.sections.includes(s) ? x.sections.filter((y) => y !== s) : [...x.sections, s], amount: "" }));
  const save = async () => {
    setBusy(true);
    setErrs({});
    try {
      onDone(await createChallan({ periodMonth: period, sections: f.sections, cprNo: f.cprNo, paymentDate: f.paymentDate, bankAccountId: f.bankAccountId, amount: Number(f.amount.replace(/,/g, "")), post: true }));
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not record the challan"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record WHT challan" subtitle="Link a CPR to the deductions it settles."
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy || !f.sections.length}>{busy ? "Saving…" : "Save challan"}</button></>}>
      {unpaidSections.length === 0 ? <EmptyState title={`Nothing unpaid for ${monthLabel(period, true)}`} description="Choose another period at the top of the page." /> : (
        <FormGrid>
          <Field label="Period"><select disabled><option>{monthLabel(period)}</option></select></Field>
          <Field label="Sections" required error={errs.sections}>
            <div className="stack" style={{ gap: 4 }}>
              {unpaidSections.map((s) => (
                <label key={s.whtSection} className="check"><input type="checkbox" checked={f.sections.includes(s.whtSection)} onChange={() => toggle(s.whtSection)} /> {sectionCode(s.whtSection)} (Rs {money(s.unpaid)})</label>
              ))}
            </div>
          </Field>
          <Field label="CPR number" required error={errs.cprNo}><input value={f.cprNo} placeholder="IT2026…" onChange={(e) => setF({ ...f, cprNo: e.target.value })} /></Field>
          <Field label="Payment date" required error={errs.paymentDate}><input type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} /></Field>
          <Field label="Paid from" required error={errs.bankAccountId}>
            <select value={f.bankAccountId} onChange={(e) => setF({ ...f, bankAccountId: e.target.value })}>
              <option value="">Choose…</option>
              {options?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Amount" required error={errs.amount} hint="The unpaid total of the chosen sections"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        </FormGrid>
      )}
    </Modal>
  );
}

/** A deduction entered by hand (e.g. rent u/s 155): direction, party, section and amounts. */
function DeductionModal({ open, onClose, options, editing, onDone }: { open: boolean; onClose: () => void; options: TaxOptions | null; editing: WhtDeduction | null; onDone: () => void }) {
  const toast = useToast();
  const blank = { direction: "DEDUCTED", deductionDate: today(), whtSection: "", partyKind: "VENDOR", partyId: "", partyName: "", partyNtnCnic: "", taxableAmount: "", taxRate: "", taxAmount: "" };
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setErrs({});
      setF(editing ? {
        direction: editing.direction, deductionDate: editing.deductionDate, whtSection: editing.whtSection,
        partyKind: editing.vendor ? "VENDOR" : editing.employee ? "EMPLOYEE" : editing.customer ? "CUSTOMER" : "NAME",
        partyId: editing.vendor?.id ?? editing.employee?.id ?? editing.customer?.id ?? "", partyName: editing.party, partyNtnCnic: editing.partyNtnCnic ?? "",
        taxableAmount: String(editing.taxableAmount), taxRate: editing.taxRate === null ? "" : String(editing.taxRate), taxAmount: String(editing.taxAmount),
      } : { ...blank, whtSection: options?.sections[0]?.code ?? "" });
    }
  }
  const set = (k: keyof typeof blank, v: string) => setF((x) => {
    const n = { ...x, [k]: v };
    if (k === "direction") n.partyKind = v === "DEDUCTED" ? "VENDOR" : "CUSTOMER";
    if ((k === "taxableAmount" || k === "taxRate") && n.taxableAmount && n.taxRate) n.taxAmount = (Number(n.taxableAmount) * Number(n.taxRate) / 100).toFixed(2);
    return n;
  });
  const pick = (id: string) => {
    const list = f.partyKind === "VENDOR" ? options?.vendors : f.partyKind === "CUSTOMER" ? options?.customers : options?.employees;
    const p = list?.find((x) => x.id === id);
    setF((x) => ({ ...x, partyId: id, partyName: p?.name ?? x.partyName, partyNtnCnic: (p && "ntnCnic" in p ? (p.ntnCnic as string | null) : null) ?? x.partyNtnCnic }));
  };
  const save = async () => {
    setBusy(true);
    setErrs({});
    const body = {
      direction: f.direction, deductionDate: f.deductionDate, whtSection: f.whtSection,
      vendorId: f.partyKind === "VENDOR" ? f.partyId || null : null, employeeId: f.partyKind === "EMPLOYEE" ? f.partyId || null : null,
      customerId: f.partyKind === "CUSTOMER" ? f.partyId || null : null, partyName: f.partyName, partyNtnCnic: f.partyNtnCnic || null,
      taxableAmount: Number(f.taxableAmount || 0), taxRate: f.taxRate === "" ? null : Number(f.taxRate), taxAmount: Number(f.taxAmount || 0),
    };
    try {
      if (editing) await updateDeduction(editing.id, { ...body, rowVersion: editing.rowVersion });
      else await createDeduction(body);
      onDone();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the deduction"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const parties = f.partyKind === "VENDOR" ? options?.vendors : f.partyKind === "CUSTOMER" ? options?.customers : f.partyKind === "EMPLOYEE" ? options?.employees : null;
  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit deduction" : "Add deduction"} subtitle="Tax withheld outside a posted document (e.g. rent u/s 155)."
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save"}</button></>}>
      <FormGrid>
        <Field label="Type" required>
          <select value={f.direction} onChange={(e) => set("direction", e.target.value)}>
            <option value="DEDUCTED">Deducted by us</option><option value="COLLECTED">Collected by us</option><option value="SUFFERED">Withheld from us</option>
          </select>
        </Field>
        <Field label="Date" required error={errs.deductionDate}><input type="date" value={f.deductionDate} onChange={(e) => set("deductionDate", e.target.value)} /></Field>
        <Field label="Section" required error={errs.whtSection}>
          <select value={f.whtSection} onChange={(e) => set("whtSection", e.target.value)}>
            {options?.sections.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Party from">
          <select value={f.partyKind} onChange={(e) => setF({ ...f, partyKind: e.target.value, partyId: "" })}>
            {f.direction === "DEDUCTED" ? <><option value="VENDOR">Vendors</option><option value="EMPLOYEE">Employees</option></> : <option value="CUSTOMER">Customers</option>}
            <option value="NAME">Other (name only)</option>
          </select>
        </Field>
        {parties && (
          <Field label="Party" error={errs.vendorId ?? errs.customerId}>
            <select value={f.partyId} onChange={(e) => pick(e.target.value)}>
              <option value="">Choose…</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Party name" required error={errs.partyName}><input value={f.partyName} onChange={(e) => set("partyName", e.target.value)} /></Field>
        <Field label="NTN / CNIC" error={errs.partyNtnCnic}><input value={f.partyNtnCnic} onChange={(e) => set("partyNtnCnic", e.target.value)} /></Field>
        <Field label="Taxable amount" required error={errs.taxableAmount}><input inputMode="decimal" value={f.taxableAmount} onChange={(e) => set("taxableAmount", e.target.value)} /></Field>
        <Field label="Rate %" error={errs.taxRate}><input inputMode="decimal" value={f.taxRate} onChange={(e) => set("taxRate", e.target.value)} /></Field>
        <Field label="Tax amount" required error={errs.taxAmount}><input inputMode="decimal" value={f.taxAmount} onChange={(e) => set("taxAmount", e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function PrepareStatementModal({ open, onClose, period, onDone }: { open: boolean; onClose: () => void; period: string; onDone: (s: WhtStatement) => void }) {
  const toast = useToast();
  const [type, setType] = useState("QUARTERLY_165");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      onDone(await prepareStatement(type, period));
    } catch (e) {
      toast(apiMessage(e, "Could not prepare the statement"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Prepare WHT statement" subtitle={`For the quarter / fiscal year containing ${monthLabel(period, true)}`}
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{busy ? "Preparing…" : "Prepare"}</button></>}>
      <FormGrid cols={1}>
        <Field label="Statement">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="QUARTERLY_165">Quarterly statement u/s 165</option>
            <option value="ANNUAL_149">Annual statement u/s 149 (salary)</option>
            <option value="ANNUAL_165">Annual statement u/s 165</option>
          </select>
        </Field>
      </FormGrid>
      <p className="small muted mt">Totals the tax deducted and collected in the period. Preparing again refreshes the total until it is filed.</p>
    </Modal>
  );
}

function FileStatementModal({ statement, onClose, onDone }: { statement: WhtStatement | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ filedOn: today(), irisReference: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!statement) return;
    setBusy(true);
    setErrs({});
    try {
      await fileStatement(statement.id, { ...f, rowVersion: statement.rowVersion });
      onDone();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not file the statement"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!statement} onClose={onClose} title="Mark statement as filed" subtitle={statement ? `${statement.label} · Rs ${money(statement.taxAmount)}` : ""}
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Mark as filed"}</button></>}>
      <FormGrid>
        <Field label="Filed on" required error={errs.filedOn}><input type="date" value={f.filedOn} onChange={(e) => setF({ ...f, filedOn: e.target.value })} /></Field>
        <Field label="IRIS reference" required error={errs.irisReference}><input value={f.irisReference} onChange={(e) => setF({ ...f, irisReference: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}
