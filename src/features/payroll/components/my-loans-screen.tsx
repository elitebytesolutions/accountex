"use client";

import { BookOpen, CalendarClock, Check, CircleAlert, CircleCheck, HandCoins, HeartPulse, List, Send, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { installmentOf, LOAN_POLICY, loanChecks, loanSchedule, type Loan, type LoanEligibility, type LoanList } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { EsRing } from "@/features/hr/components/ess-bits";
import { localToday, monthLabel, shiftMonth } from "@/features/hr/components/attendance-ui";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { myLoans, requestMyLoan } from "../pay-api";

type Kind = "SALARY_ADVANCE" | "LOAN" | "MEDICAL";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const TYPES: Record<Kind, { t: string; icon: typeof HandCoins; step: number; tenures: number[] }> = {
  SALARY_ADVANCE: { t: "Salary advance", icon: Wallet, step: 1000, tenures: [1, 2, 3] },
  LOAN: { t: "Staff loan", icon: HandCoins, step: 5000, tenures: [6, 12, 18, 24] },
  MEDICAL: { t: "Medical loan", icon: HeartPulse, step: 5000, tenures: [3, 6, 12, 24] },
};
const STATUS: Record<string, [string, string]> = {
  PENDING: ["Pending", "warn"], APPROVED: ["Approved", "info"], ACTIVE: ["Active", "good"], SETTLEMENT: ["In settlement", "warn"], CLOSED: ["Closed", "neutral"], REJECTED: ["Rejected", "danger"], WITHDRAWN: ["Withdrawn", "neutral"],
};
const POLICY = [
  `Salary advance up to ${LOAN_POLICY.SALARY_ADVANCE.limitPctOfBasic}% of basic, repaid within ${LOAN_POLICY.SALARY_ADVANCE.maxInstallments} months.`,
  `Staff loan up to ${LOAN_POLICY.LOAN.limitTimesGross} × gross salary after ${LOAN_POLICY.LOAN.minServiceMonths} months of service, repaid within ${LOAN_POLICY.LOAN.maxInstallments} months. One open loan at a time.`,
  `Medical loan up to ${LOAN_POLICY.MEDICAL.limitTimesGross} × gross salary, repaid within ${LOAN_POLICY.MEDICAL.maxInstallments} months.`,
  `All installments together can't exceed ${LOAN_POLICY.maxInstallmentPctOfGross}% of gross salary.`,
  "All facilities are interest-free and recovered through payroll.",
  "Outstanding balances are settled from final dues on separation.",
];

type Data = { items: Loan[]; kpis: LoanList["kpis"]; eligibility: LoanEligibility };

/** My Profile › Loans & Advances (template app/profile/loans, 9C-ess.js:1252–1411): own facilities, eligibility, request with live schedule. */
export function MyLoansScreen({ canRequest }: { canRequest: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string; noEmployee?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sched, setSched] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [req, setReq] = useState<{ type: Kind; amount: number; ten: number; purpose: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    myLoans().then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId, noEmployee: e.code === "NO_EMPLOYEE_RECORD" } : { message: "Could not load your loans" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const openRequest = useCallback((type: Kind) => {
    const lim = data?.eligibility.limits[type].limit ?? 0;
    const step = TYPES[type].step;
    setReq({ type, amount: Math.max(step, Math.min(lim, Math.round(lim / 2 / step) * step)), ten: TYPES[type].tenures[Math.min(1, TYPES[type].tenures.length - 1)]!, purpose: "" });
  }, [data]);

  // a user not linked to an employee record has no payroll data: an empty state, not an error (as My Leave)
  if (error?.noEmployee) return <><PageHead eyebrow="My Money / Loans & Advances" title="Loans & Advances" description="Interest-free staff loans and salary advances, recovered through monthly payroll." /><EmptyState title="No employee record" description="Your login is not linked to an employee record yet. Ask HR to link it on your employee profile." /></>;
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} />;
  const e = data?.eligibility;
  const items = data?.items ?? [];
  const active = items.find((l) => l.status === "ACTIVE" || l.status === "SETTLEMENT") ?? null;
  const outstanding = items.filter((l) => l.status === "ACTIVE" || l.status === "SETTLEMENT").reduce((a, l) => a + l.outstandingAmount, 0);
  const monthly = items.filter((l) => l.status === "ACTIVE").reduce((a, l) => a + l.installmentAmount, 0);
  const repaid = items.reduce((a, l) => a + l.recoveredAmount, 0);
  const paidCount = active ? active.installments.filter((i) => i.status === "RECOVERED" || i.status === "SETTLED").length : 0;
  const next = active?.installments.find((i) => i.status === "SCHEDULED") ?? null;
  const advance = e?.limits.SALARY_ADVANCE;
  const advChecks = e && advance ? loanChecks(e, "SALARY_ADVANCE", Math.max(1, advance.limit), LOAN_POLICY.SALARY_ADVANCE.maxInstallments) : [];

  // request sheet
  const T = req ? TYPES[req.type] : null;
  const lim = req && e ? e.limits[req.type].limit : 0;
  const checks = req && e ? loanChecks(e, req.type, req.amount, req.ten) : [];
  const ok = checks.length > 0 && checks.every((c) => c.ok);
  const emi = req ? installmentOf(req.amount, req.ten) : 0;
  const first = shiftMonth(localToday().slice(0, 7), 1);
  const preview = req ? loanSchedule(req.amount, req.ten, first) : [];
  const pct = e && e.gross ? ((e.runningInstallments + emi) / e.gross) * 100 : 0;
  const submit = async () => {
    if (!req) return;
    setBusy(true);
    try {
      const l = await requestMyLoan({ loanType: req.type, purpose: req.type === "MEDICAL" ? "MEDICAL" : req.type === "SALARY_ADVANCE" ? "SALARY" : "PERSONAL", purposeDetail: req.purpose || null, requestedAmount: req.amount, installmentCount: req.ten, firstDeductionMonth: first });
      toast(`${l.docNo} submitted${l.waitingOn ? ` · waiting on ${l.waitingOn}` : ""}`, { tone: "good" });
      setReq(null);
      setAttempt((n) => n + 1);
    } catch (err) { toast(apiMessage(err, "Could not submit the request"), { tone: "danger" }); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead eyebrow="My Money / Loans & Advances" title="Loans & Advances" description="Interest-free staff loans and salary advances, recovered through monthly payroll."
        actions={<>
          <button className="btn secondary" type="button" onClick={() => setPolicy(true)}><BookOpen />Loan policy</button>
          {canRequest && <button className="btn primary" type="button" disabled={!e} onClick={() => openRequest(advance?.eligible ? "SALARY_ADVANCE" : "LOAN")}><HandCoins />Request advance</button>}
        </>} />
      {!data ? <Skeleton style={{ height: 420 }} /> : <>
        <div className="es-grid es-g4 es-keep2 es-ln-kpis">
          {([["Outstanding", `Rs ${n0(outstanding)}`, `${items.filter((l) => l.status === "ACTIVE").length} active`, Wallet, "green"],
            ["Monthly deduction", `Rs ${n0(monthly)}`, next ? `Next: ${monthLabel(next.dueMonth.slice(0, 7))} payroll` : "Nothing scheduled", CalendarClock, "blue"],
            ["Eligible advance", `Rs ${n0(advance?.eligible ? advance.limit : 0)}`, `${LOAN_POLICY.SALARY_ADVANCE.limitPctOfBasic}% of basic salary`, Sparkles, "lime"],
            ["Repaid to date", `Rs ${n0(repaid)}`, active ? `${paidCount} of ${active.installments.length} instalments` : "All facilities", CircleCheck, "violet"]] as const).map(([label, value, sub, Icon, tone]) => (
            <div key={label} className="es-card es-ln-kpi"><div className="es-row"><span className="es-label">{label}</span><span className="spacer" /><span className={`icon-tile ${tone}`}><Icon /></span></div><b className="num-big">{value}</b><small>{sub}</small></div>
          ))}
        </div>
        <div className="es-grid es-wide">
          <div className="es-card es-ln-active">
            {active ? <>
              <div className="es-head"><span className="icon-tile green"><HandCoins /></span><div><h3>{TYPES[active.loanType as Kind]?.t ?? "Loan"}</h3><p>{active.docNo}{active.disbursementDate ? ` · disbursed ${dateLabel(active.disbursementDate)}` : ""} · interest-free</p></div><span className="spacer" /><span className="badge dot good">Active</span></div>
              <div className="es-ln-body">
                <EsRing className="es-ln-ring" size={168} stroke={3.2} tone="var(--es-forest)" pct={((active.approvedAmount ?? active.requestedAmount) ? (active.outstandingAmount / (active.approvedAmount ?? active.requestedAmount)) * 100 : 0)}
                  label={<span className="es-ln-ringv">Rs {n0(active.outstandingAmount)}</span>} sub={`outstanding of Rs ${n0(active.approvedAmount ?? active.requestedAmount)}`} />
                <div className="es-ln-facts">
                  <div><span className="es-label">Monthly EMI</span><b>Rs {n0(active.installmentAmount)}</b></div>
                  <div><span className="es-label">Next deduction</span><b>{next ? monthLabel(next.dueMonth.slice(0, 7)) : "—"}</b><small>{next ? "Payroll of that month" : "Fully recovered"}</small></div>
                  <div><span className="es-label">Instalments</span><b>{paidCount} <span className="es-muted">of {active.installments.length}</span></b><small>{active.installments.at(-1) ? `Ends ${monthLabel(active.installments.at(-1)!.dueMonth.slice(0, 7))}` : ""}</small></div>
                </div>
              </div>
              <div className="es-ln-dots" style={{ gridTemplateColumns: `repeat(${Math.max(1, active.installments.length)},minmax(0,1fr))` }}>
                {active.installments.map((i) => <i key={i.id} className={cn(i.status === "RECOVERED" || i.status === "SETTLED" ? "on" : i.id === next?.id ? "next" : "")} title={`Instalment ${i.installmentNo}${i.status === "RECOVERED" ? " · recovered" : ` · ${monthLabel(i.dueMonth.slice(0, 7))}`}`} />)}
              </div>
              <div className="es-row wrap"><button className={cn("btn secondary sm", sched && "active")} type="button" onClick={() => setSched(!sched)}><List />Repayment schedule</button></div>
              {sched && <div className="table-wrap"><table className="tbl" data-plain="">
                <thead><tr><th>#</th><th>Month</th><th>Payroll run</th><th className="num">Instalment</th><th className="num">Balance after</th><th>Status</th></tr></thead>
                <tbody>{active.installments.map((i) => <tr key={i.id}><td>{i.installmentNo}</td><td>{monthLabel(i.dueMonth.slice(0, 7))}</td><td>{i.payrollRun ?? "—"}</td><td className="num">{n0(i.amount)}</td><td className="num">{n0(i.balanceAfter)}</td><td><span className={`badge ${i.status === "RECOVERED" ? "good" : "neutral"}`}>{i.status === "RECOVERED" ? "Recovered" : "Scheduled"}</span></td></tr>)}</tbody>
              </table></div>}
            </> : <EmptyState icon={<HandCoins />} title="No active loan" description="Approved and disbursed loans and advances show their recovery here." />}
          </div>
          <div className="es-col">
            <div className="es-card es-ln-eligcard">
              <div className="es-head"><h3>Salary advance</h3><span className="spacer" />{advance?.eligible && <span className="pill"><ShieldCheck />Pre-approved</span>}</div>
              <span className="es-label">You can request up to</span>
              <b className="num-big">Rs {n0(advance?.eligible ? advance.limit : 0)}</b>
              <ul className="es-ln-checks">{advChecks.slice(0, 1).concat(advChecks.slice(3)).map((c) => <li key={c.label} className={c.ok ? "ok" : "bad"}><span>{c.ok ? <Check /> : <X />}</span><div><b>{c.label}</b><small>{c.detail}</small></div></li>)}</ul>
              {canRequest && <button className="btn primary" type="button" disabled={!advance?.eligible} onClick={() => openRequest("SALARY_ADVANCE")}><HandCoins />Request advance</button>}
            </div>
            <div className="es-card"><div className="es-head"><h3>How it works</h3></div><ol className="es-ln-how">
              <li><b>Request</b><span>Pick an amount and tenure. The instalment is calculated instantly.</span></li>
              <li><b>Approve</b><span>HR, then Finance.</span></li>
              <li><b>Disburse</b><span>Paid from the company bank or cash account.</span></li>
              <li><b>Recover</b><span>Deducted from payroll. No interest.</span></li>
            </ol></div>
          </div>
        </div>
        <div className="es-card"><div className="es-head"><h3>Requests &amp; history</h3><span className="spacer" /><span className="es-label">All loans and advances since joining</span></div>
          {items.length ? <div className="es-ln-hist">{items.map((l) => {
            const [st, tone] = STATUS[l.status] ?? [l.status, "neutral"];
            return <div key={l.id} className="es-ln-h"><span className="icon-tile green"><HandCoins /></span><div className="es-ln-h-main"><b>{l.docNo} · {TYPES[l.loanType as Kind]?.t ?? l.loanType}</b>
              <small>Rs {n0(l.approvedAmount ?? l.requestedAmount)} · {l.installmentCount} × Rs {n0(l.installmentAmount)} from {monthLabel(l.firstDeductionMonth.slice(0, 7))}{l.waitingOn ? ` · waiting on ${l.waitingOn}` : ""}{l.status === "REJECTED" && l.decisionComment ? ` · ${l.decisionComment}` : ""}</small></div>
              <span className={`badge ${tone} dot`}>{st}</span></div>;
          })}</div> : <EmptyState title="No requests yet" description="Your loan and advance requests appear here." />}
        </div>
      </>}

      <Modal open={policy} onClose={() => setPolicy(false)} title="Staff loan & advance policy" foot={<button className="btn primary" type="button" onClick={() => setPolicy(false)}>Got it</button>}>
        <ul className="es-tx-notes es-ln-policy">{POLICY.map((t) => <li key={t}><ShieldCheck /><span>{t}</span></li>)}</ul>
      </Modal>

      <Modal open={!!req} onClose={() => setReq(null)} wide title="Request an advance" subtitle="Interest-free · recovered from payroll · approved by HR, then Finance"
        foot={<><span className={cn("es-label es-ln-footnote", !ok && "bad")}>{ok ? <><CircleCheck />Eligible · first deduction {monthLabel(first)} payroll</> : <><CircleAlert />Fix the highlighted checks to continue</>}</span>
          <button className="btn secondary" type="button" onClick={() => setReq(null)}>Cancel</button><button className="btn primary" type="button" disabled={!ok || busy} onClick={submit}><Send />{busy ? "Submitting…" : "Submit request"}</button></>}>
        {req && T && e && <>
          <div className="es-opts es-ln-types">{(Object.keys(TYPES) as Kind[]).map((k) => { const I = TYPES[k].icon; return <button key={k} type="button" className={cn("es-opt", k === req.type && "on")} onClick={() => openRequest(k)}><I />{TYPES[k].t}</button>; })}</div>
          <div className="es-ln-amtbox">
            <div className="es-row"><div><span className="es-label">Amount</span><b className="es-ln-amt">Rs {n0(req.amount)}</b></div><span className="spacer" /><div className="es-ln-emibox"><span className="es-label">Monthly EMI</span><b>Rs {n0(emi)}</b></div></div>
            <input type="range" className="es-ln-range" aria-label="Amount" min={T.step} max={Math.max(T.step, lim)} step={T.step} value={req.amount} style={{ ["--f" as string]: `${lim > T.step ? ((req.amount - T.step) / (lim - T.step)) * 100 : 100}%` }} onChange={(ev) => setReq({ ...req, amount: Number(ev.target.value) })} />
            <div className="es-row es-ln-scale"><span>Rs {n0(T.step)}</span><span className="spacer" /><span>Max Rs {n0(lim)}</span></div>
            <div className="es-row wrap"><span className="es-label">Repay over</span><div className="seg">{T.tenures.map((t) => <button key={t} type="button" className={t === req.ten ? "active" : ""} onClick={() => setReq({ ...req, ten: t })}>{t} {t === 1 ? "month" : "months"}</button>)}</div></div>
          </div>
          <div className="es-ln-sheetgrid">
            <div><h4 className="es-cap">Eligibility</h4>
              <ul className="es-ln-checks">{checks.map((c) => <li key={c.label} className={c.ok ? "ok" : "bad"}><span>{c.ok ? <Check /> : <X />}</span><div><b>{c.label}</b><small>{c.detail}</small></div></li>)}</ul>
              <div className="es-ln-meter"><div className="es-row"><span className="es-label">Installments vs gross</span><span className="spacer" /><b>{pct.toFixed(1)}%</b></div>
                <div className="es-ln-meterbar"><i className={cn(pct > 30 ? "bad" : pct > 24 && "warn")} style={{ width: `${Math.min(100, (pct / 45) * 100)}%` }} /><em style={{ left: `${(30 / 45) * 100}%` }}>30% cap</em></div></div>
              <label className="es-field" style={{ marginTop: 14 }}><span>Purpose</span><textarea rows={2} maxLength={300} value={req.purpose} onChange={(ev) => setReq({ ...req, purpose: ev.target.value })} placeholder="e.g. Children's school admission fee" /></label>
            </div>
            <div><h4 className="es-cap">Repayment preview</h4>
              <div className="es-ln-prev"><table className="tbl" data-plain=""><thead><tr><th>Payroll</th><th className="num">Instalment</th><th className="num">Balance</th></tr></thead>
                <tbody>{preview.map((s) => <tr key={s.no}><td><b>{monthLabel(s.month)}</b><small>PR-{s.month}</small></td><td className="num">{s.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td><td className="num">{s.balanceAfter.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>)}</tbody></table></div>
            </div>
          </div>
        </>}
      </Modal>
    </>
  );
}
