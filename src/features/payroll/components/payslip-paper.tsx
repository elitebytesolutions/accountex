"use client";

import type { Payslip, RunLineComponent } from "@/shared";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { monthLabel } from "@/features/hr/components/attendance-ui";

const n0 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("en-US"));
const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const days = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const PAY_MODE: Record<string, string> = { BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", CASH: "Cash" };

function Rows({ items, empty, total, label }: { items: RunLineComponent[]; empty: number; total: number; label: string }) {
  return (
    <>
      {items.map((c) => <tr key={c.id}><td>{c.label}{c.basisText ? <small className="muted"> · {c.basisText}</small> : null}</td><td className="num">{n2(c.amount)}</td></tr>)}
      {Array.from({ length: empty }, (_, i) => <tr key={`e${i}`}><td>&nbsp;</td><td /></tr>)}
      <tr className="total"><td>{label}</td><td className="num">{n2(total)}</td></tr>
    </>
  );
}

/** Template app/hr/payroll/payslip (51-hr-pay-talent.html:453–582): the printable salary slip. `.pay-print` is the only thing that prints. */
export function PayslipPaper({ p }: { p: Payslip }) {
  const rows = Math.max(p.earnings.length, p.deductions.length);
  const ytdFrom = p.ytd.from.slice(0, 7), ytdTo = p.ytd.to.slice(0, 7);
  const mon = (m: string) => monthLabel(m).replace(/^(\w{3})\w*/, "$1");
  return (
    <div className="paper pay-print">
      <div className="paper-head">
        <div>
          <h2>{p.company.legalName || p.company.name}</h2>
          <p className="small muted">{[p.company.address, p.company.ntn ? `NTN ${p.company.ntn}` : null].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="right">
          <h3>SALARY SLIP</h3>
          <p className="small">For the month of <b>{monthLabel(p.payrollMonth.slice(0, 7))}</b><br />Slip # {p.docNo}</p>
        </div>
      </div>

      <div className="paper-meta">
        <div className="dl">
          <div><span>Employee</span><b>{p.employee.name}</b></div>
          <div><span>Employee code</span><b>{p.employee.code}</b></div>
          <div><span>Designation</span><b>{p.employeeInfo.designation ?? "—"}</b></div>
          <div><span>Department</span><b>{p.employeeInfo.department ?? "—"}</b></div>
          <div><span>Grade</span><b>{p.employeeInfo.grade ?? "—"}</b></div>
        </div>
        <div className="dl">
          <div><span>CNIC</span><b>{p.employeeInfo.cnic ?? "—"}</b></div>
          <div><span>Branch</span><b>{p.employeeInfo.branch ?? "—"}</b></div>
          <div><span>Date of joining</span><b>{dateLabel(p.employeeInfo.joiningDate)}</b></div>
          <div><span>EOBI No.</span><b>{p.employeeInfo.eobiNo ?? "—"}</b></div>
          <div><span>Tax status</span><b>{p.employeeInfo.taxStatus === "FILER" ? "Filer (ATL)" : p.employeeInfo.taxStatus === "NON_FILER" ? "Non-filer" : "—"}</b></div>
        </div>
        <div className="dl">
          <div><span>Days in month</span><b>{p.days.daysInMonth}</b></div>
          <div><span>Paid days</span><b>{days(p.days.paidDays)}</b></div>
          <div><span>Leave taken</span><b>{days(p.days.leaveTakenDays)}</b></div>
          <div><span>Leave without pay</span><b>{days(p.days.lwpDays)}</b></div>
          <div><span>Overtime hrs</span><b>{days(p.days.overtimeHours)}</b></div>
        </div>
      </div>

      <div className="grid-2 mt">
        <table className="tbl">
          <thead><tr><th>Earnings</th><th className="num">Amount (Rs)</th></tr></thead>
          <tbody><Rows items={p.earnings} empty={rows - p.earnings.length} total={p.grossAmount} label="Gross Earnings" /></tbody>
        </table>
        <table className="tbl">
          <thead><tr><th>Deductions</th><th className="num">Amount (Rs)</th></tr></thead>
          <tbody><Rows items={p.deductions} empty={rows - p.deductions.length} total={p.deductionAmount} label="Total Deductions" /></tbody>
        </table>
      </div>

      <div className="paper-totals">
        <div><span>Gross Earnings</span><b>Rs {n0(p.grossAmount)}</b></div>
        <div><span>Total Deductions</span><b>(Rs {n0(p.deductionAmount)})</b></div>
        <div className="grand"><span>Net Pay</span><b>Rs {n2(p.netAmount)}</b></div>
      </div>
      <p className="small"><b>Amount in words:</b> {p.amountInWords}.</p>

      <div className="pay-slip-grid mt">
        <div>
          <h4>Year-to-Date ({mon(ytdFrom)} – {mon(ytdTo)})</h4>
          <div className="dl">
            <div><span>Gross earnings</span><b>{n0(p.ytd.gross)}</b></div>
            <div><span>Income tax</span><b>{n0(p.ytd.tax)}</b></div>
            <div><span>EOBI</span><b>{n0(p.ytd.eobi)}</b></div>
            <div><span>Provident Fund</span><b>{n0(p.ytd.pf)}</b></div>
            <div><span>Loan recovered</span><b>{n0(p.ytd.loanRecovered)}</b></div>
            <div><span>Net paid</span><b>{n0(p.ytd.net)}</b></div>
          </div>
        </div>
        <div>
          <h4>Tax Computation FY {p.tax.taxYear}</h4>
          <div className="dl">
            <div><span>Projected annual salary</span><b>{n0(p.tax.projectedAnnualSalary)}</b></div>
            <div><span>Less: exempt</span><b>({n0(p.tax.annualExemptAmount)})</b></div>
            <div><span>Taxable income</span><b>{n0(p.tax.annualTaxableIncome)}</b></div>
            <div><span>Slab</span><b>{p.tax.slab ?? "—"}</b></div>
            <div><span>Annual tax liability</span><b>{n0(p.tax.annualTaxLiability)}</b></div>
            <div><span>This month</span><b>{n0(p.tax.monthly)}</b></div>
          </div>
        </div>
        <div>
          <h4>Payment &amp; Balances</h4>
          <div className="dl">
            <div><span>Mode</span><b>{PAY_MODE[p.payment.payMode] ?? p.payment.payMode}</b></div>
            <div><span>Bank</span><b>{p.payment.bankName ?? "—"}</b></div>
            <div><span>IBAN</span><b>{p.payment.ibanMasked ?? "—"}</b></div>
            <div><span>Transfer ref</span><b>{p.payment.paymentRef ?? "—"}</b></div>
            <div><span>Loan outstanding</span><b>{n0(p.payment.loanOutstanding)}</b></div>
            <div><span>PF balance (emp + er)</span><b>{n0(p.payment.pfBalance)}</b></div>
          </div>
        </div>
      </div>

      <div className="paper-foot">
        <p className="small muted">This is a computer-generated payslip and does not require a signature.{p.status === "ON_HOLD" && p.holdReason ? ` On hold: ${p.holdReason}.` : ""} Generated on {dateLabel(p.generatedAt)}.</p>
      </div>
    </div>
  );
}
