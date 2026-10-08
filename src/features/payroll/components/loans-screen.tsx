"use client";

import { CircleCheck, Download, Eye, HandCoins, Inbox, Plus, Repeat, Search, TriangleAlert, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { installmentOf, loanChecks, loanSchedule, type Loan, type LoanEligibility, type LoanList, type RunOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { localToday, monthLabel, Person, shiftMonth } from "@/features/hr/components/attendance-ui";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { approveLoan, createLoan, disburseLoan, getLoan, listLoans, loanEligibility, rejectLoan, runOptions } from "../pay-api";

type Row = LoanList["items"][number];
type Can = { create: boolean; approve: boolean; post: boolean; export: boolean };
const n0 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("en-US"));
const STATUS: Record<string, [string, string]> = {
  PENDING: ["Pending approval", "warn"], APPROVED: ["Approved · to disburse", "info"], ACTIVE: ["Active", "good"], SETTLEMENT: ["In settlement", "warn"],
  CLOSED: ["Closed", "neutral"], REJECTED: ["Rejected", "danger"], WITHDRAWN: ["Withdrawn", "neutral"],
};
const TYPE: Record<string, [string, string]> = { LOAN: ["Loan", "info"], MEDICAL: ["Medical loan", "info"], SALARY_ADVANCE: ["Advance", "violet"] };
const shortMonth = (iso: string) => monthLabel(iso.slice(0, 7)).replace(/^(\w{3})\w*/, "$1");
const blank = { employeeId: "", loanType: "LOAN", purpose: "PERSONAL", requestedAmount: "", installmentCount: "6", firstDeductionMonth: shiftMonth(localToday().slice(0, 7), 1), remarks: "" };

/** Template app/hr/loans (51-hr-pay-talent.html:584–700): KPIs, list, review drawer (approve / reject / disburse), new loan with schedule preview. */
export function LoansScreen({ can, initialId }: { can: Can; initialId?: string }) {
  const toast = useToast();
  const lookups = useLookups(["LoanPurpose"]);
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LoanList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [opts, setOpts] = useState<RunOptions | null>(null);
  const [open, setOpen] = useState<Loan | null>(null);
  const [terms, setTerms] = useState({ approvedAmount: "", installmentCount: "", comment: "" });
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [disb, setDisb] = useState<{ date: string; source: string } | null>(null);
  const [form, setForm] = useState<typeof blank | null>(null);
  const [elig, setElig] = useState<LoanEligibility | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    listLoans({ status, type: type || undefined, search: q, page, pageSize: 25 })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load loans" }));
    return () => { cancelled = true; };
  }, [status, type, q, page, attempt]);
  useEffect(() => { runOptions().then(setOpts).catch(() => undefined); }, []);
  const view = useCallback(async (id: string) => {
    try {
      const l = await getLoan(id);
      setOpen(l);
      setTerms({ approvedAmount: String(l.approvedAmount ?? l.requestedAmount), installmentCount: String(l.installmentCount), comment: "" });
    } catch (e) { toast(apiMessage(e, "Could not open the loan"), { tone: "danger" }); }
  }, [toast]);
  useEffect(() => {
    if (!initialId) return;
    let cancelled = false;
    getLoan(initialId).then((x) => { if (!cancelled) { setOpen(x); setTerms({ approvedAmount: String(x.approvedAmount ?? x.requestedAmount), installmentCount: String(x.installmentCount), comment: "" }); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [initialId]);
  useEffect(() => {
    if (!form?.employeeId) return;
    let cancelled = false;
    loanEligibility(form.employeeId).then((e) => !cancelled && setElig(e)).catch(() => !cancelled && setElig(null));
    return () => { cancelled = true; };
  }, [form?.employeeId]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const k = data?.kpis;
  const all = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;
  const run = async (work: () => Promise<Loan | unknown>, done: string, after?: (l: Loan) => void) => {
    setBusy(true); setErrs({});
    try {
      const r = await work();
      toast(done, { tone: "good" });
      if (r && typeof r === "object" && "docNo" in r) after?.(r as Loan);
      reload();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const exportCsv = () => data && downloadCsv("loans-and-advances.csv", [["Loan #", "Employee code", "Employee", "Type", "Amount", "Installments", "Installment", "Recovered", "Outstanding", "Status"],
    ...data.items.map((l) => [l.docNo, l.employee.code, l.employee.name, TYPE[l.loanType]?.[0] ?? l.loanType, l.approvedAmount ?? l.requestedAmount, l.installmentCount, l.installmentAmount, l.recoveredAmount, l.outstandingAmount, STATUS[l.status]?.[0] ?? l.status])]);

  // new loan form
  const amt = Number(form?.requestedAmount || 0), cnt = Number(form?.installmentCount || 0);
  const checks = form && elig && amt > 0 && cnt > 0 ? loanChecks(elig, form.loanType as "LOAN", amt, cnt) : [];
  const sched = form && amt > 0 && cnt > 0 && cnt <= 60 ? loanSchedule(amt, cnt, form.firstDeductionMonth) : [];
  const setF = (key: keyof typeof blank, v: string) => { setForm((f) => (f ? { ...f, [key]: v } : f)); setErrs((e) => ({ ...e, [key]: "" })); };
  const employees = opts?.employees.filter((e) => e.hasSalary) ?? [];

  // review drawer
  const l = open;
  const actable = l && l.status === "PENDING" && (l.canAct || (can.approve && !l.approval));
  const approvedAmt = Number(terms.approvedAmount || 0), approvedCnt = Number(terms.installmentCount || 0);
  const steps = l?.approval?.steps ?? [];

  return (
    <>
      <PageHead eyebrow="Workforce / Payroll / Loans" title="Loans & Advances" description="Employee loans and salary advances, recovered automatically through payroll installments."
        actions={<>
          {can.export && <button className="btn secondary" type="button" disabled={!data?.items.length} onClick={exportCsv}><Download />Export</button>}
          {can.create && <button className="btn primary" type="button" onClick={() => { setErrs({}); setElig(null); setForm({ ...blank }); }}><Plus />New Loan / Advance</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Active Loans &amp; Advances</span><span className="icon-well"><HandCoins /></span></div><strong>{k ? k.active : "—"}</strong><small>{k ? `${k.activeLoans} loans · ${k.activeAdvances} advances` : ""}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Outstanding Balance</span><span className="icon-well"><Wallet /></span></div><strong>{k ? `Rs ${n0(k.outstanding)}` : "—"}</strong><small>Employee loans &amp; advances</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Monthly Recovery</span><span className="icon-well"><Repeat /></span></div><strong>{k ? `Rs ${n0(k.monthlyRecovery)}` : "—"}</strong><small>{k ? `Due by ${monthLabel(k.recoveryMonth)} payroll` : ""}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Pending Requests</span><span className="icon-well"><Inbox /></span></div><strong>{k ? k.pending : "—"}</strong><small>{k ? `Rs ${n0(k.pendingAmount)} requested` : ""}</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Loans &amp; advances</h3><p>{k ? `${k.active} active · installments deducted via payroll` : "Installments deducted via payroll"}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search employee or loan #…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type"><option value="">All types</option><option value="LOAN">Loan</option><option value="ADVANCE">Advance</option></select>
          <div className="chips">{[["ALL", "All", all], ["PENDING", "Pending", data?.counts.PENDING ?? 0], ["APPROVED", "To disburse", data?.counts.APPROVED ?? 0], ["ACTIVE", "Active", data?.counts.ACTIVE ?? 0], ["CLOSED", "Closed", data?.counts.CLOSED ?? 0]].map(([c, lb, n]) => (
            <button key={c} type="button" className={status === c ? "active" : ""} onClick={() => { setStatus(String(c)); setPage(1); }}>{lb} <i>{n}</i></button>
          ))}</div>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Loan #</th><th>Employee</th><th>Type</th><th className="num">Amount</th><th className="num">Installments</th><th className="num">Deducted</th><th className="num">Outstanding</th><th>Progress</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={10}><Skeleton style={{ height: 120 }} /></td></tr> : data.items.length ? data.items.map((r: Row) => {
              const amount = r.approvedAmount ?? r.requestedAmount;
              const pct = amount ? Math.round((r.recoveredAmount / amount) * 100) : 0;
              const [st, tone] = STATUS[r.status] ?? [r.status, "neutral"];
              const [tl, tt] = TYPE[r.loanType] ?? [r.loanType, "neutral"];
              return (
                <tr key={r.id} className={cn(r.id === initialId && "row-flash")} onClick={() => void view(r.id)} style={{ cursor: "pointer" }}>
                  <td><b>{r.docNo}</b><small>{r.disbursementDate ? `Disb. ${dateLabel(r.disbursementDate)}` : `Req. ${dateLabel(r.docDate)}`}</small></td>
                  <td><Person e={r.employee} sub={r.employee.department ?? r.employee.code} /></td>
                  <td><span className={`badge ${tt}`}>{tl}</span><small>{labelOf(lookups, "LoanPurpose", r.purpose)}</small></td>
                  <td className="num">{n0(amount)}</td>
                  <td className="num">{n0(r.installmentAmount)} × {r.installmentCount}</td>
                  <td className="num">{r.recoveredAmount ? n0(r.recoveredAmount) : <span className="zero">—</span>}</td>
                  <td className="num">{r.status === "ACTIVE" || r.status === "SETTLEMENT" ? n0(r.outstandingAmount) : <span className="zero">—</span>}</td>
                  <td style={{ minWidth: 110 }}><div className="progress"><i style={{ width: `${pct}%` }} /></div><small>{pct}%</small></td>
                  <td><span className={`badge ${tone} dot`}>{st}</span>{r.isWithinPolicy === false && <small className="down">Outside policy</small>}</td>
                  <td className="actions"><button className="icon-btn-sm" type="button" aria-label={`Open ${r.docNo}`} onClick={(e) => { e.stopPropagation(); void view(r.id); }}><Eye /></button></td>
                </tr>
              );
            }) : <tr><td colSpan={10}><EmptyState icon={<HandCoins />} title="No loans or advances" description="Requests from HR and from My Profile appear here for approval and disbursement." /></td></tr>}
          </tbody>
        </table></div>
        <div className="table-foot"><span>{data ? `Showing ${data.items.length} of ${data.total}` : ""}</span>
          {pages > 1 && <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>)}<button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button></div>}
        </div>
      </div>

      <Drawer open={!!l} onClose={() => setOpen(null)} wide title={l ? `${l.docNo} · ${TYPE[l.loanType]?.[0] ?? "Loan"} ${l.status === "PENDING" ? "request" : ""}` : ""}
        subtitle={l ? `${l.employee.name} · ${l.employee.code}${l.employee.designation ? ` · ${l.employee.designation}` : ""}` : ""}
        foot={l && <>
          {actable && <><button className="btn danger" type="button" disabled={busy} onClick={() => setRejecting("")}>Reject</button>
            <button className="btn primary" type="button" disabled={busy || approvedAmt <= 0 || approvedCnt < 1} onClick={() => run(() => approveLoan(l.id, { approvedAmount: approvedAmt, installmentCount: approvedCnt, comment: terms.comment || null }), `${l.docNo} approved`, setOpen)}>Approve</button></>}
          {l.status === "APPROVED" && can.post && <button className="btn primary" type="button" onClick={() => setDisb({ date: localToday(), source: "" })}><HandCoins />Disburse</button>}
          {!actable && !(l.status === "APPROVED" && can.post) && <button className="btn secondary" type="button" onClick={() => setOpen(null)}>Close</button>}
        </>}>
        {l && <>
          <div className="dl mb">
            <div><span>Type / purpose</span><b>{TYPE[l.loanType]?.[0] ?? l.loanType} — {labelOf(lookups, "LoanPurpose", l.purpose)}{l.purposeDetail ? ` (${l.purposeDetail})` : ""}</b></div>
            <div><span>Requested amount</span><b>Rs {n0(l.requestedAmount)}{l.requestChannel === "ESS" ? " · via My Profile" : ""}</b></div>
            {l.approvedAmount !== null && l.approvedAmount !== l.requestedAmount && <div><span>Approved amount</span><b>Rs {n0(l.approvedAmount)}</b></div>}
            <div><span>Installments</span><b>{l.installmentCount} × Rs {n0(l.installmentAmount)} from {monthLabel(l.firstDeductionMonth.slice(0, 7))}</b></div>
            <div><span>Gross salary</span><b>{l.grossSalarySnapshot !== null ? `Rs ${n0(l.grossSalarySnapshot)}` : "—"}</b></div>
            <div><span>Installment as % of gross</span><b>{l.installmentPctOfGross !== null ? `${l.installmentPctOfGross}% (limit 30%)` : "—"}</b></div>
            <div><span>Eligible limit</span><b>{l.eligibleLimitAmount !== null ? `Rs ${n0(l.eligibleLimitAmount)}` : "—"}</b></div>
            {l.disbursementDate && <div><span>Disbursed</span><b>{dateLabel(l.disbursementDate)}{l.disbursedFrom ? ` · ${l.disbursedFrom.name}` : ""}{l.disbursementVoucher ? ` · ${l.disbursementVoucher.docNo}` : ""}</b></div>}
            {["ACTIVE", "CLOSED", "SETTLEMENT"].includes(l.status) && <div><span>Recovered / outstanding</span><b>Rs {n0(l.recoveredAmount)} / Rs {n0(l.outstandingAmount)}</b></div>}
          </div>
          {l.isWithinPolicy !== null && (l.isWithinPolicy
            ? <div className="banner good mb"><CircleCheck /><div><b>Within policy</b><p>Amount, tenure and installment ratio comply with the staff loan policy.</p></div></div>
            : <div className="banner warn mb"><TriangleAlert /><div><b>Outside policy</b><p>Recorded by HR outside the staff loan policy; approvers should confirm the exception.</p></div></div>)}
          <h4>Approval trail</h4>
          <div className="timeline mb">
            <div className="tl-item"><span className="tl-dot good" /><div><b>Requested{l.requestChannel === "ESS" ? " via My Profile" : ` by ${l.createdBy?.name ?? "HR"}`}</b><small>{dateLabel(l.createdAt)}</small></div></div>
            {steps.map((s) => (
              <div key={s.stepNo} className="tl-item"><span className={cn("tl-dot", s.state === "done" && "good", s.state === "current" && "warn")} /><div><b>{s.name}{s.actedBy.length ? ` — ${s.actedBy.map((a) => a.name).join(", ")}` : s.approvers.length ? ` — ${s.approvers.map((a) => a.name).join(", ")}` : ""}</b><small>{s.state === "done" ? `Approved ${s.actedBy[0] ? dateLabel(s.actedBy[0].at) : ""}` : s.state === "current" ? "Awaiting decision" : s.state === "skipped" ? "Skipped" : "Waiting"}</small></div></div>
            ))}
            {l.status === "REJECTED" && <div className="tl-item"><span className="tl-dot danger" /><div><b>Rejected</b><small>{l.decisionComment ?? ""}</small></div></div>}
            {!steps.length && l.approvedBy && <div className="tl-item"><span className="tl-dot good" /><div><b>Approved — {l.approvedBy.name}</b><small>{dateLabel(l.approvedAt)}</small></div></div>}
            {(l.status === "APPROVED" || l.status === "PENDING") && <div className="tl-item"><span className="tl-dot" /><div><b>Disbursement</b><small>Bank or cash voucher, then recovery through payroll</small></div></div>}
          </div>
          {actable && <div className="form-grid">
            <Field label="Approved amount" error={errs.approvedAmount}><input inputMode="decimal" value={terms.approvedAmount} onChange={(e) => setTerms({ ...terms, approvedAmount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
            <Field label="Installments" error={errs.installmentCount} hint={approvedAmt > 0 && approvedCnt > 0 ? `${approvedCnt} × Rs ${n0(installmentOf(approvedAmt, approvedCnt))}` : undefined}><input inputMode="numeric" value={terms.installmentCount} onChange={(e) => setTerms({ ...terms, installmentCount: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Comment" full><textarea rows={2} value={terms.comment} maxLength={500} onChange={(e) => setTerms({ ...terms, comment: e.target.value })} /></Field>
          </div>}
          {l.installments.length > 0 && <>
            <h4 className="mt">Recovery schedule</h4>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>#</th><th>Payroll month</th><th className="num">Installment</th><th className="num">Balance after</th><th>Status</th></tr></thead>
              <tbody>{l.installments.map((i) => <tr key={i.id}><td>{i.installmentNo}</td><td>{monthLabel(i.dueMonth.slice(0, 7))}{i.payrollRun ? <small>{i.payrollRun}</small> : null}</td><td className="num">{n0(i.amount)}</td><td className="num">{i.balanceAfter ? n0(i.balanceAfter) : <span className="zero">—</span>}</td><td><span className={`badge ${i.status === "RECOVERED" || i.status === "SETTLED" ? "good" : "neutral"}`}>{i.status === "RECOVERED" ? "Recovered" : i.status === "SCHEDULED" ? "Scheduled" : i.status}</span></td></tr>)}</tbody>
            </table></div>
          </>}
          <h4 className="mt">History</h4>
          <HistoryTab schema="Payroll" table="LoansAndAdvances" id={l.id} />
        </>}
      </Drawer>

      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Reject request?" subtitle={l ? `${l.docNo} · ${l.employee.name}` : ""}
        foot={<><button className="btn secondary" type="button" onClick={() => setRejecting(null)}>Cancel</button><button className="btn danger" type="button" disabled={busy || (rejecting?.trim().length ?? 0) < 3} onClick={() => l && rejecting !== null && run(() => rejectLoan(l.id, rejecting), `${l.docNo} rejected`, (x) => { setOpen(x); setRejecting(null); })}>Reject</button></>}>
        <Field label="Reason" required full><input value={rejecting ?? ""} maxLength={500} placeholder="e.g. An advance is already running" onChange={(e) => setRejecting(e.target.value)} /></Field>
      </Modal>

      <Modal open={!!disb} onClose={() => setDisb(null)} title="Disburse" subtitle={l ? `${l.docNo} · Rs ${n0(l.approvedAmount ?? l.requestedAmount)} to ${l.employee.name}` : ""}
        foot={<><button className="btn secondary" type="button" onClick={() => setDisb(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy || !disb?.source || !disb.date} onClick={() => l && disb && run(() => disburseLoan(l.id, { disbursementDate: disb.date, bankAccountId: disb.source.startsWith("B:") ? disb.source.slice(2) : null, cashAccountId: disb.source.startsWith("C:") ? disb.source.slice(2) : null }), `${l.docNo} disbursed · voucher posted`, (x) => { setOpen(x); setDisb(null); })}>Disburse</button></>}>
        {disb && <div className="form-grid">
          <Field label="Disburse from" required full error={errs.bankAccountId ?? errs.cashAccountId}>
            <select value={disb.source} onChange={(e) => setDisb({ ...disb, source: e.target.value })}><option value="">Choose…</option>
              {opts?.bankAccounts.map((b) => <option key={b.id} value={`B:${b.id}`}>{b.name}{b.last4 ? ` — ${b.last4}` : ""} (bank)</option>)}
              {opts?.cashAccounts.map((c) => <option key={c.id} value={`C:${c.id}`}>{c.name} (cash)</option>)}
            </select>
          </Field>
          <Field label="Disbursement date" required error={errs.disbursementDate}><input type="date" value={disb.date} onChange={(e) => setDisb({ ...disb, date: e.target.value })} /></Field>
          <p className="small muted full">Posts a bank (BPV) or cash (CPV) payment voucher: Dr employee {l?.loanType === "SALARY_ADVANCE" ? "advances" : "loans"}, Cr the account chosen. The recovery schedule starts in {l ? monthLabel(l.firstDeductionMonth.slice(0, 7)) : ""} payroll.</p>
        </div>}
      </Modal>

      <Modal open={!!form} onClose={() => setForm(null)} wide title="New Loan / Advance" subtitle="Recovery is scheduled into payroll automatically"
        foot={<><button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy || !form?.employeeId || amt <= 0 || cnt < 1}
          onClick={() => form && run(() => createLoan({ ...form, requestedAmount: amt, installmentCount: cnt, remarks: form.remarks || null }), "Loan created and sent for approval", (x) => { setForm(null); void view(x.id); })}>Create &amp; submit</button></>}>
        {form && <>
          <div className="form-grid c3 mb">
            <Field label="Employee" required error={errs.employeeId}><select value={form.employeeId} onChange={(e) => setF("employeeId", e.target.value)}><option value="">Choose…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.code}</option>)}</select></Field>
            <Field label="Type" required error={errs.loanType}><select value={form.loanType} onChange={(e) => setF("loanType", e.target.value)}><option value="LOAN">Loan</option><option value="MEDICAL">Medical loan</option><option value="SALARY_ADVANCE">Salary advance</option></select></Field>
            <Field label="Purpose" error={errs.purpose}><select value={form.purpose} onChange={(e) => setF("purpose", e.target.value)}>{lookupOptions(lookups, "LoanPurpose", form.purpose).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Amount (Rs)" required error={errs.requestedAmount}><input inputMode="decimal" value={form.requestedAmount} onChange={(e) => setF("requestedAmount", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            <Field label="Installments" required error={errs.installmentCount}><input inputMode="numeric" value={form.installmentCount} onChange={(e) => setF("installmentCount", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="First deduction" error={errs.firstDeductionMonth}><select value={form.firstDeductionMonth} onChange={(e) => setF("firstDeductionMonth", e.target.value)}>{[0, 1, 2, 3].map((i) => { const m = shiftMonth(localToday().slice(0, 7), i); return <option key={m} value={m}>{monthLabel(m)}</option>; })}</select></Field>
            <Field label="Markup"><select disabled value="INTEREST_FREE"><option value="INTEREST_FREE">Interest-free</option></select></Field>
            <Field label="Remarks" full error={errs.remarks}><input value={form.remarks} maxLength={500} onChange={(e) => setF("remarks", e.target.value)} /></Field>
          </div>
          {checks.length > 0 && <ul className="es-ln-checks mb">{checks.map((c) => <li key={c.label} className={c.ok ? "ok" : "bad"}><span>{c.ok ? <CircleCheck /> : <TriangleAlert />}</span><div><b>{c.label}</b><small>{c.detail}</small></div></li>)}</ul>}
          {checks.some((c) => !c.ok) && <p className="small down mb">Outside the staff loan policy: HR may still record it; approvers see the exception.</p>}
          <h4>Installment schedule preview</h4>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>Payroll month</th><th className="num">Installment</th><th className="num">Balance after</th></tr></thead>
            <tbody>
              {sched.map((s) => <tr key={s.no}><td>{s.no}</td><td>{monthLabel(s.month)}</td><td className="num">{n0(s.amount)}</td><td className="num">{s.balanceAfter ? n0(s.balanceAfter) : <span className="zero">—</span>}</td></tr>)}
              {sched.length > 0 && <tr className="total"><td colSpan={2}>Total</td><td className="num">{n0(amt)}</td><td /></tr>}
              {!sched.length && <tr><td colSpan={4} className="muted small">Enter the amount and installments.</td></tr>}
            </tbody>
          </table></div>
          {elig && amt > 0 && cnt > 0 && <p className="small muted mt">Installment = {elig.gross ? ((installmentOf(amt, cnt) / elig.gross) * 100).toFixed(1) : "—"}% of gross (Rs {n0(elig.gross)}). Policy limit 30%. First recovery {shortMonth(`${form.firstDeductionMonth}-01`)} payroll.</p>}
        </>}
      </Modal>
    </>
  );
}
