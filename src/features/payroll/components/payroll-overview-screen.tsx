"use client";

import { ArrowRight, Coins, FileText, Layers, PlayCircle, ReceiptText, TrendingUp, Users, Wallet, Building2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { PayrollOverview, PayrollRunSummary } from "@/shared";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { dmy, monthLabel } from "@/features/hr/components/attendance-ui";
import { ApiError } from "@/lib/api/errors";
import { payrollOverview } from "../run-api";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : "−"}${Math.abs(((a - b) / b) * 100).toFixed(1)}%` : null);

/** "Rs 21,450,000.00" with the template's muted decimals. */
export function PayrollAmount({ value, rs = true }: { value: number; rs?: boolean }) {
  const [int, dec] = Math.abs(value).toFixed(2).split(".");
  return <>{value < 0 ? "−" : ""}{rs ? "Rs " : ""}{Number(int).toLocaleString("en-US")}<span className="dec">.{dec}</span></>;
}

export const PAYROLL_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "wait" }, REVIEW: { label: "In review", cls: "info" }, AWAITING_APPROVAL: { label: "Pending approval", cls: "wait" },
  APPROVED: { label: "Approved", cls: "ok" }, POSTED: { label: "Posted", cls: "info" }, PAID: { label: "Paid", cls: "ok" },
  REJECTED: { label: "Rejected", cls: "fail" }, CANCELLED: { label: "Cancelled", cls: "fail" }, REVERSED: { label: "Reversed", cls: "fail" },
};
export const PayrollRunStatus = ({ status }: { status: string }) => <span className={`fd-status ${PAYROLL_STATUS[status]?.cls ?? "wait"}`}>{PAYROLL_STATUS[status]?.label ?? status}</span>;

const STEPS = ["DRAFT", "REVIEW", "AWAITING_APPROVAL", "APPROVED", "POSTED", "PAID"];

/** Template app/hr/payroll (48-dash-stock.html): KPIs, 12-month cost, the open run, cost by department, breakdown, recent runs. */
export function PayrollOverviewScreen({ canRun }: { canRun: boolean }) {
  const [data, setData] = useState<PayrollOverview | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);

  const load = useCallback(() => {
    payrollOverview().then(setData).catch((e: unknown) => setError({ message: e instanceof ApiError ? e.message : "Something went wrong", reference: e instanceof ApiError ? e.correlationId : undefined }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const last = data?.last ?? null;
  const prev = data?.previous ?? null;
  const head = (
    <PageHead
      eyebrow="Workforce / Payroll" title="Payroll Overview"
      description={last ? `${monthLabel(last.payrollMonth.slice(0, 7))} run ${last.docNo} · ${last.employeeCount} employees${last.journal ? ` · posted via ${last.journal.docNo}` : ""}` : "No payroll has been posted yet."}
      actions={<>
        <Link className="btn secondary" href="/hr/payroll/payslips"><FileText />Payslips</Link>
        <Link className="btn secondary" href="/hr/payroll/structures"><Layers />Salary Structures</Link>
        {canRun && <Link className="btn primary" href="/hr/payroll/run"><PlayCircle />Run Payroll</Link>}
      </>}
    />
  );
  if (error) return <>{head}<ErrorState message={error.message} reference={error.reference} onRetry={() => { setError(null); load(); }} /></>;
  if (!data) return <>{head}<div className="fd-grid fd-r4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 150 }} />)}</div><Skeleton style={{ height: 380 }} /></>;

  const tax = last?.taxAmount ?? 0;
  const eobi = data.employeeEobi + data.employerEobi;
  const max = Math.max(1, ...data.monthly.map((m) => m.basic + m.allowances));
  const open = data.open;
  const deptTotal = data.byDepartment.reduce((s, d) => s + d.gross, 0);
  const tones = ["t-forest", "t-lime", "t-mint", "t-soft", "t-forest2", "t-lime2", "t-hatch", "t-hatch"];
  const ctc = last ? last.grossAmount + last.employerContributionAmount : 0;
  const share = (n: number) => (last?.grossAmount ? `${((n / last.grossAmount) * 100).toFixed(1)}%` : "0%");
  const otherDed = last ? Math.max(0, last.deductionAmount - last.taxAmount - last.eobiEmployeeAmount - last.pfEmployeeAmount - last.loanAmount) : 0;

  return (
    <>
      {head}
      <div className="fd-grid fd-r4">
        <Kpi i={0} title="Gross salary" side={last && <span className="fd-date">{short(last.payrollMonth)}</span>} value={last?.grossAmount ?? 0}
          pills={<>{prev && last && <span className="pill"><TrendingUp />vs {MON[Number(prev.payrollMonth.slice(5, 7)) - 1]} <b className={last.grossAmount >= prev.grossAmount ? "up" : "down"}>{pct(last.grossAmount, prev.grossAmount)}</b></span>}<span className="pill"><Users /><b>{last?.employeeCount ?? 0}</b> paid</span></>} />
        <Kpi i={1} title="Net pay" side={last && <span className={`fd-status ${last.status === "PAID" ? "ok" : "wait"}`}>{last.status === "PAID" && last.paidAt ? `Paid ${dmy(last.paidAt.slice(0, 10)).slice(0, 6)}` : PAYROLL_STATUS[last.status]?.label}</span>} value={last?.netAmount ?? 0}
          pills={<><span className="pill"><Wallet />Of gross <b className="up">{last?.grossAmount ? `${((last.netAmount / last.grossAmount) * 100).toFixed(1)}%` : "—"}</b></span><span className="pill"><Coins />Avg <b>Rs {last?.employeeCount ? Math.round(last.netAmount / last.employeeCount).toLocaleString("en-US") : 0}</b></span></>} />
        <Kpi i={2} title="Income tax u/s 149" side={last && <span className="fd-status wait">Due 15 {MON[Number(last.payrollMonth.slice(5, 7)) % 12]}</span>} value={tax}
          pills={<><span className="pill"><ReceiptText />Taxable <b>{data.taxable}</b></span>{prev && <span className="pill"><TrendingUp />vs {MON[Number(prev.payrollMonth.slice(5, 7)) - 1]} <b className={tax > prev.taxAmount ? "down" : "up"}>{tax >= prev.taxAmount ? "+" : "−"}Rs {Math.abs(tax - prev.taxAmount).toLocaleString("en-US")}</b></span>}</>} />
        <Kpi i={3} title="EOBI" side={<span className="fd-date">Employee + employer</span>} value={eobi}
          pills={<><span className="pill"><Users />Insured <b>{data.insured}</b></span><span className="pill"><Building2 />Employer <b>Rs {data.employerEobi.toLocaleString("en-US")}</b></span></>} />
      </div>

      <div className="fd-grid fd-r2">
        <article className="fd-card" style={{ ["--i" as string]: 4 }}>
          <div className="fd-head"><h3>Payroll cost · 12 months</h3><span className="spacer" />
            <div className="fd-legend"><span><i className="fd-k-a" />Salaries</span><span><i className="fd-k-b" />Allowances &amp; bonus</span></div>
          </div>
          <div className="pr-cost" role="img" aria-label="Payroll cost per month, salaries and allowances">
            {data.monthly.map((m, i) => {
              const total = m.basic + m.allowances;
              return (
                <div key={m.month} className={`pr-cost-col${i === data.monthly.length - 1 && total ? " hot" : ""}`} title={`${monthLabel(m.month)} · gross Rs ${m.gross.toLocaleString("en-US")} · net Rs ${m.net.toLocaleString("en-US")} · employer Rs ${m.employer.toLocaleString("en-US")}`}>
                  <div className="pr-cost-bar">
                    {m.allowances > 0 && <i className="b" style={{ height: `${(m.allowances / max) * 100}%` }} />}
                    {m.basic > 0 && <i className="a" style={{ height: `${(m.basic / max) * 100}%` }} />}
                  </div>
                  <small>{MON[Number(m.month.slice(5, 7)) - 1]}</small>
                </div>
              );
            })}
          </div>
        </article>
        <article className="fd-card" style={{ ["--i" as string]: 5 }}>
          <div className="fd-head"><h3>{open ? `${monthLabel(open.payrollMonth.slice(0, 7))} run` : `${monthLabel(data.nextMonth)} run`}</h3><span className="spacer" />{open ? <PayrollRunStatus status={open.status} /> : <span className="fd-status wait">Not started</span>}</div>
          <span className="fd-label">{open ? `${open.docNo} · pay date ${dmy(open.payDate)}` : "Start the month's run when attendance is closed"}</span>
          <ol className="fd-tl">
            {[
              ["Inputs — attendance, OT, leave, loans", open ? `Prepared by ${open.preparedBy ?? "HR"}` : "Attendance cut-off and approved overtime"],
              ["Review & variance check", "Calculated lines, flags vs last month"],
              ["Approval", "HR manager, then the financial accountant"],
              ["Post to GL", "Accrual journal, installments recovered, payslips"],
              ["Pay salaries", "Bank / cash vouchers and the bank advice"],
              ["Tax & EOBI deposit", "15th of the next month"],
            ].map(([t, s], i) => {
              const at = open ? STEPS.indexOf(open.status) : -1;
              const stepAt = [0, 1, 2, 3, 4, 5][i]!;
              const state = !open ? (i === 0 ? "now" : "") : at > stepAt || (open.status === "PAID" && i < 5) ? "done" : at === stepAt || (stepAt === 2 && open.status === "AWAITING_APPROVAL") ? "now" : "";
              return <li key={t} className={state}><b>{t}</b><small>{s}</small></li>;
            })}
          </ol>
          {open
            ? <Link className="btn primary fd-full" href={`/hr/payroll/runs/${open.id}`}><PlayCircle />Continue {open.docNo}</Link>
            : canRun && <Link className="btn primary fd-full" href="/hr/payroll/run"><PlayCircle />Start {monthLabel(data.nextMonth).split(" ")[0]} run</Link>}
        </article>
      </div>

      <div className="fd-grid fd-r2">
        <article className="fd-card" style={{ ["--i" as string]: 6 }}>
          <div className="fd-head"><h3>Cost by department</h3><span className="spacer" /><span className="fd-date">{last ? `${MON[Number(last.payrollMonth.slice(5, 7)) - 1]} · gross` : "No posted run"}</span></div>
          {data.byDepartment.length ? (
            <div className="pr-dept">
              {data.byDepartment.slice(0, 8).map((d, i) => (
                <div key={d.department} className={`fd-tile ${tones[i]}${i === 0 ? " big" : ""}`}>
                  <b>{deptTotal ? ((d.gross / deptTotal) * 100).toFixed(1) : 0}<small>%</small></b>
                  <span>{d.department} · {d.employees} head{d.employees === 1 ? "" : "s"}</span>
                  <div className="fd-tile-foot"><small>Rs {(d.gross / 1_000_000).toFixed(2)}M</small>{i === 0 && <small>avg {Math.round(d.gross / d.employees / 1000)}k</small>}</div>
                </div>
              ))}
            </div>
          ) : <p className="fd-label">Department costs appear once a run is posted.</p>}
        </article>
        <article className="fd-card" style={{ ["--i" as string]: 7 }}>
          <div className="fd-head"><h3>{last ? `${monthLabel(last.payrollMonth.slice(0, 7)).split(" ")[0]} breakdown` : "Breakdown"}</h3><span className="spacer" /><span className="fd-date">Gross → CTC</span></div>
          {last && (
            <div className="fd-hbar">
              <i style={{ ["--w" as string]: share(last.netAmount), ["--c" as string]: "var(--fd-forest)" }} title="Net pay" />
              <i style={{ ["--w" as string]: share(last.taxAmount), ["--c" as string]: "var(--fd-lime)" }} title="Income tax" />
              <i style={{ ["--w" as string]: share(last.pfEmployeeAmount), ["--c" as string]: "var(--fd-mint)" }} title="Provident Fund" />
              <i className="ded" style={{ ["--w" as string]: share(last.loanAmount + last.eobiEmployeeAmount + otherDed) }} title="Loans & EOBI" />
            </div>
          )}
          <div className="fd-dl">
            <div><span>Gross salary</span><b><PayrollAmount value={last?.grossAmount ?? 0} /></b></div>
            <div><span>Income tax u/s 149</span><b className="neg">(<PayrollAmount value={last?.taxAmount ?? 0} rs={false} />)</b></div>
            <div><span>EOBI employee</span><b className="neg">(<PayrollAmount value={last?.eobiEmployeeAmount ?? 0} rs={false} />)</b></div>
            <div><span>Provident Fund</span><b className="neg">(<PayrollAmount value={last?.pfEmployeeAmount ?? 0} rs={false} />)</b></div>
            <div><span>Loan &amp; advance recovery</span><b className="neg">(<PayrollAmount value={last?.loanAmount ?? 0} rs={false} />)</b></div>
            {otherDed > 0 && <div><span>Other deductions</span><b className="neg">(<PayrollAmount value={otherDed} rs={false} />)</b></div>}
            <div className="tot"><span>Net pay</span><b><PayrollAmount value={last?.netAmount ?? 0} /></b></div>
            <div><span>Employer EOBI · PESSI · PF</span><b><PayrollAmount value={last?.employerContributionAmount ?? 0} rs={false} /></b></div>
            <div className="tot"><span>Total cost to company</span><b><PayrollAmount value={ctc} /></b></div>
          </div>
        </article>
      </div>

      <article className="fd-card fd-flush" style={{ ["--i" as string]: 8 }}>
        <div className="fd-head fd-pad"><h3>Recent payroll runs</h3><span className="spacer" /><Link className="fd-link" href="/hr/payroll/payslips">All payslips <ArrowRight /></Link></div>
        <div className="table-wrap"><table className="tbl fd-tbl">
          <thead><tr><th>Run #</th><th>Period</th><th className="num">Employees</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net</th><th>Journal</th><th>Status</th></tr></thead>
          <tbody>
            {data.recent.length ? data.recent.map((r) => <RecentRow key={r.id} r={r} />) : <tr><td colSpan={8} className="muted">No payroll runs yet.</td></tr>}
          </tbody>
        </table></div>
      </article>
    </>
  );
}

function Kpi({ i, title, side, value, pills }: { i: number; title: string; side: ReactNode; value: number; pills: ReactNode }) {
  return (
    <article className="fd-card" style={{ ["--i" as string]: i }}>
      <div className="fd-head"><h3>{title}</h3><span className="spacer" />{side}</div>
      <b className="num-big fd-big"><PayrollAmount value={value} /></b>
      <div className="fd-pills">{pills}</div>
    </article>
  );
}

function RecentRow({ r }: { r: PayrollRunSummary }) {
  const note = r.paidAt ? `Paid ${dmy(r.paidAt.slice(0, 10))}` : r.runType === "REGULAR" ? r.postedAt ? `Posted ${dmy(r.postedAt.slice(0, 10))}` : "Regular" : r.runType === "OFF_CYCLE" ? "Off-cycle" : "Bonus only";
  return (
    <tr>
      <td><Link className="link" href={`/hr/payroll/runs/${r.id}`}>{r.docNo}</Link><small>{note}</small></td>
      <td>{monthLabel(r.payrollMonth.slice(0, 7))}</td>
      <td className="num">{r.employeeCount}</td>
      <td className="num fd-amt"><PayrollAmount value={r.grossAmount} rs={false} /></td>
      <td className="num cr">{r.deductionAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      <td className="num fd-amt"><PayrollAmount value={r.netAmount} rs={false} /></td>
      <td>{r.journal ? <Link className="link" href={`/accounting/vouchers/${r.journal.id}`}>{r.journal.docNo}</Link> : <span className="muted">—</span>}</td>
      <td><PayrollRunStatus status={r.status} /></td>
    </tr>
  );
}
