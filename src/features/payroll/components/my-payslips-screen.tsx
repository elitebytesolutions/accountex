"use client";

import { ChevronDown, ChevronsDown, Download, Eye, FileBadge, FileText, Percent, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MyPayslips, Payslip, RunLineComponent } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { MONTHS } from "@/features/hr/components/attendance-ui";
import { ApiError } from "@/lib/api/errors";
import { myPayslip, myPayslips } from "../pay-api";
import { PayslipPaper } from "./payslip-paper";

const CERT_LATER = "Tax certificates arrive with the statutory payroll reports";
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const money = (v: number) => { const [w, f] = Math.abs(v).toFixed(2).split("."); return <>Rs {Number(w).toLocaleString("en-US")}<span className="dec">.{f}</span></>; };
const mon = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1]!;

function Lines({ items, total, neg }: { items: RunLineComponent[]; total: number; neg?: boolean }) {
  return <>{items.map((c) => (
    <div key={c.id} className="es-ps-li"><div><b>{c.label}</b><small>{c.basisText ?? ""}</small></div>
      <span className="es-ps-share"><i style={{ width: `${Math.max(3, total ? (c.amount / total) * 100 : 0).toFixed(1)}%` }} /></span>
      <b className={cn("es-ps-amt", neg && "neg")}>{neg ? "−" : ""}{c.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
  ))}</>;
}

/** My Profile › Payslips (template app/profile/payslips, 9C-ess.js:939–1092): own published payslips, breakdown, year to date. */
export function MyPayslipsScreen() {
  const [data, setData] = useState<MyPayslips | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ earn: true, ded: false });
  const [paper, setPaper] = useState(false);
  const [error, setError] = useState<{ message: string; reference?: string; noEmployee?: boolean } | null>(null);

  useEffect(() => {
    myPayslips().then((d) => { setData(d); setSel(d.items[0]?.id ?? null); })
      .catch((e: unknown) => setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId, noEmployee: e.code === "NO_EMPLOYEE_RECORD" } : { message: "Could not load your payslips" }));
  }, []);
  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    myPayslip(sel).then((p) => !cancelled && setSlip(p)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [sel]);

  // a user not linked to an employee record has no payroll data: an empty state, not an error (as My Leave)
  if (error?.noEmployee) return <><PageHead eyebrow="My Money / Payslips" title="My Payslips" description="Monthly payslips, year-to-date earnings and income tax certificates u/s 149." /><EmptyState title="No employee record" description="Your login is not linked to an employee record yet. Ask HR to link it on your employee profile." /></>;
  if (error) return <ErrorState message={error.message} reference={error.reference} />;
  const items = data?.items ?? [];
  const cur = slip && slip.id === sel ? slip : null;
  const s = items.find((x) => x.id === sel);
  const maxNet = Math.max(1, ...items.map((x) => x.netAmount));
  const ytd = data?.ytd;
  const basic = cur?.earnings.filter((c) => c.code === "BAS").reduce((a, c) => a + c.amount, 0) ?? 0;
  const pctOf = (v: number) => (cur && cur.grossAmount ? `${((v / cur.grossAmount) * 100).toFixed(2)}%` : "0%");
  const print = () => { setPaper(true); setTimeout(() => window.print(), 300); };

  return (
    <>
      <PageHead eyebrow="My Money / Payslips" title="My Payslips" description="Monthly payslips, year-to-date earnings and income tax certificates u/s 149."
        actions={<>
          <button className="btn secondary" type="button" disabled title={CERT_LATER}><FileBadge />Tax certificate</button>
          <button className="btn primary" type="button" disabled={!cur} onClick={print}><Download />Download PDF</button>
        </>} />
      {!data ? <Skeleton style={{ height: 420 }} /> : !items.length ? (
        <EmptyState icon={<FileText />} title="No payslips yet" description="Your payslip appears here once the month's payroll is posted and published." />
      ) : <>
        <div className="es-ps-chips es-scroll-x" role="tablist">
          {items.map((p) => <button key={p.id} type="button" role="tab" aria-selected={p.id === sel} className={p.id === sel ? "active" : ""} onClick={() => setSel(p.id)}><b>{mon(p.payrollMonth).slice(0, 3)}</b><small>{p.payrollMonth.slice(0, 4)}</small></button>)}
        </div>
        <div className="es-grid es-wide">
          <div className="es-col">
            <div className="es-card es-ps-hero">
              <div className="es-head"><h3>Net pay</h3><span className="pill">{s ? `${mon(s.payrollMonth)} ${s.payrollMonth.slice(0, 4)}` : ""}</span><span className="spacer" />
                {cur && <span className={`badge dot ${cur.payment.paidAt ? "good" : "info"}`}>{cur.payment.paidAt ? "Paid" : "Posted"}</span>}</div>
              <span className="es-label">{s ? `${s.run.docNo} · ${s.docNo}${cur?.payment.paidAt ? ` · paid ${dateLabel(cur.payment.paidAt)}` : ""}` : ""}</span>
              <b className="num-big es-ps-net">{s ? money(s.netAmount) : "—"}</b>
              {cur && <div className="es-row wrap"><span className="pill">Gross <b>Rs {n0(cur.grossAmount)}</b></span><span className="pill">Deductions <b>Rs {n0(cur.deductionAmount)}</b></span><span className="pill">Paid days <b>{cur.days.paidDays}/{cur.days.daysInMonth}</b></span></div>}
              {cur && <div className="es-ps-stack">
                <i style={{ ["--w" as string]: pctOf(basic), ["--c" as string]: "var(--es-forest)" }} title={`Basic Rs ${n0(basic)}`} />
                <i style={{ ["--w" as string]: pctOf(cur.grossAmount - basic), ["--c" as string]: "var(--mint)" }} title={`Allowances Rs ${n0(cur.grossAmount - basic)}`} />
                <i className="ded" style={{ ["--w" as string]: pctOf(cur.deductionAmount) }} title={`Deductions Rs ${n0(cur.deductionAmount)}`} />
              </div>}
              <div className="es-ps-legend"><span><i style={{ background: "var(--es-forest)" }} />Basic</span><span><i style={{ background: "var(--mint)" }} />Allowances &amp; overtime</span><span><i className="ded" />Deductions</span></div>
              <div className="es-row wrap es-ps-acts">
                <button className="btn secondary sm" type="button" disabled={!cur} onClick={() => setPaper(true)}><Eye />View payslip</button>
                <button className="btn primary sm" type="button" disabled={!cur} onClick={print}><Download />Download PDF</button>
              </div>
            </div>
            <div className="es-card es-ps-acc-card">
              <div className="es-head"><h3>Payslip breakdown</h3><span className="spacer" /><button className="es-link" type="button" onClick={() => setOpen({ earn: true, ded: true })}>Expand all<ChevronsDown /></button></div>
              {!cur ? <Skeleton style={{ height: 160 }} /> : <div>
                <div className={cn("es-ps-acc", open.earn && "open")}>
                  <button type="button" className="es-ps-acc-h" onClick={() => setOpen((o) => ({ ...o, earn: !o.earn }))}><span className="icon-tile green"><TrendingUp /></span><div><b>Earnings</b><small>{cur.earnings.length} components</small></div><span className="spacer" /><b className="es-ps-acc-sum">{money(cur.grossAmount)}</b><ChevronDown className="es-ps-chev" /></button>
                  <div className="es-ps-acc-b"><div><Lines items={cur.earnings} total={cur.grossAmount} /></div></div>
                </div>
                <div className={cn("es-ps-acc", open.ded && "open")}>
                  <button type="button" className="es-ps-acc-h" onClick={() => setOpen((o) => ({ ...o, ded: !o.ded }))}><span className="icon-tile red"><TrendingDown /></span><div><b>Deductions</b><small>{cur.deductions.map((d) => d.label.split(" ")[0]).slice(0, 4).join(", ")}</small></div><span className="spacer" /><b className="es-ps-acc-sum neg">−{money(cur.deductionAmount)}</b><ChevronDown className="es-ps-chev" /></button>
                  <div className="es-ps-acc-b"><div><Lines items={cur.deductions} total={cur.deductionAmount} neg /></div></div>
                </div>
                <div className="es-ps-netrow"><span>Net pay</span><b>{money(cur.netAmount)}</b></div>
              </div>}
            </div>
          </div>
          <div className="es-col">
            <div className="es-card">
              <div className="es-head"><h3>FY {cur?.tax.taxYear ?? ""} to date</h3><span className="spacer" /><span className="es-label">{ytd ? `${mon(ytd.from).slice(0, 3)} – ${mon(ytd.to).slice(0, 3)}` : ""}</span></div>
              <div className="es-ps-ytd">
                {([["Gross earnings", ytd?.gross ?? 0, <TrendingUp key="g" />, "green"], ["Net pay", ytd?.net ?? 0, <Wallet key="n" />, "lime"], ["Income tax u/s 149", ytd?.tax ?? 0, <Percent key="t" />, "orange"], ["Provident fund balance", cur?.payment.pfBalance ?? 0, <PiggyBank key="p" />, "blue"]] as const).map(([label, v, icon, tone]) => (
                  <div key={label} className="es-ps-ytd-r"><span className={`icon-tile ${tone}`}>{icon}</span><div><span className="es-label">{label}</span><b>{money(v)}</b>
                    {label === "Income tax u/s 149" && cur?.tax.annualTaxLiability ? <><div className="progress"><i style={{ width: `${Math.min(100, (v / cur.tax.annualTaxLiability) * 100).toFixed(1)}%` }} /></div><small>{Math.round((v / cur.tax.annualTaxLiability) * 100)}% of projected Rs {n0(cur.tax.annualTaxLiability)}</small></> : label === "Provident fund balance" ? <small>Employee + employer contributions</small> : null}</div></div>
                ))}
              </div>
            </div>
            <div className="es-card">
              <div className="es-head"><h3>Tax certificates</h3><span className="spacer" /><Link className="es-link" href="/profile/tax">Declarations</Link></div>
              <div className="es-ps-cert"><span className="icon-tile blue"><FileBadge /></span><div><b>FY {cur?.tax.taxYear ?? ""} · u/s 149</b><small>Issued after the tax year closes</small></div><span className="spacer" /><button className="btn secondary sm" type="button" disabled title={CERT_LATER}><Download />PDF</button></div>
            </div>
          </div>
        </div>
        <div className="es-card es-ps-chart-card">
          <div className="es-head"><div><h3>Net pay · last {items.length} month{items.length === 1 ? "" : "s"}</h3><p>Select a month to see its payslip.</p></div></div>
          <div className="es-ps-chart">
            {[...items].reverse().map((p, i) => (
              <button key={p.id} type="button" className={cn("es-ps-bar", p.id === sel && "sel")} style={{ ["--h" as string]: `${((p.netAmount / maxNet) * 100).toFixed(1)}%`, ["--i" as string]: i }} title={`${mon(p.payrollMonth)} · Rs ${n0(p.netAmount)}`} aria-label={mon(p.payrollMonth)} onClick={() => setSel(p.id)}><i /><span>{mon(p.payrollMonth)[0]}</span></button>
            ))}
          </div>
        </div>
      </>}
      <Modal open={paper && !!cur} onClose={() => setPaper(false)} xl title={cur ? `Payslip · ${mon(cur.payrollMonth)} ${cur.payrollMonth.slice(0, 4)}` : ""} subtitle={cur ? `${cur.run.docNo} · ${cur.employee.code}` : ""}
        foot={<><button className="btn secondary" type="button" onClick={() => setPaper(false)}>Close</button><button className="btn primary" type="button" onClick={() => window.print()}><Download />Print / save as PDF</button></>}>
        {cur && <PayslipPaper p={cur} />}
      </Modal>
    </>
  );
}
