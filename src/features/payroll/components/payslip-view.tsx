"use client";

import { ArrowLeft, Download, Printer, Send, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Payslip } from "@/shared";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { dateTime } from "@/features/self-service/components/ess-ui";
import { monthLabel } from "@/features/hr/components/attendance-ui";
import { ApiError } from "@/lib/api/errors";
import { getPayslip } from "../pay-api";
import { PayslipPaper } from "./payslip-paper";

/** Template app/hr/payroll/payslip (51-hr-pay-talent.html:453–582). Printing records printedAt; the PDF is the browser's "Save as PDF". */
export function PayslipView({ id, autoPrint }: { id: string; autoPrint?: boolean }) {
  const [p, setP] = useState<Payslip | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPayslip(id, !!autoPrint)
      .then((x) => { if (!cancelled) setP(x); })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the payslip" }));
    return () => { cancelled = true; };
  }, [id, autoPrint]);
  useEffect(() => {
    if (p && autoPrint && !printed.current) { printed.current = true; setTimeout(() => window.print(), 300); }
  }, [p, autoPrint]);

  if (error) return <ErrorState message={error.message} reference={error.reference} />;
  if (!p) return <Skeleton style={{ height: 600 }} />;
  const print = () => { void getPayslip(id, true).catch(() => undefined); window.print(); };
  return (
    <>
      <div className="no-print">
        <PageHead eyebrow="Workforce / Payroll / Payslips" title={`Payslip — ${p.employee.name}`}
          description={`${monthLabel(p.payrollMonth.slice(0, 7))} · ${p.run.docNo}${p.viewedAt ? ` · Viewed by employee ${dateTime(p.viewedAt)}` : p.publishedToEssAt ? " · Published to My Profile" : ""}`}
          actions={<>
            <Link className="btn ghost" href={`/hr/payroll/payslips?run=${p.run.id}`}><ArrowLeft />All payslips</Link>
            <Link className="btn ghost" href={`/hr/employees/${p.employee.id}`}><UserRound />Profile</Link>
            <button className="btn secondary" type="button" disabled title="Emailing payslips arrives with Phase 29"><Send />Email</button>
            <button className="btn secondary" type="button" onClick={print} title="Choose “Save as PDF” in the print dialog"><Download />PDF</button>
            <button className="btn primary" type="button" onClick={print}><Printer />Print</button>
          </>} />
      </div>
      <PayslipPaper p={p} />
    </>
  );
}
