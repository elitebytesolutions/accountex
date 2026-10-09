"use client";

import { Search, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { SettlementList } from "@/shared";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { initialsOf } from "@/features/auth/initials";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { listSettlements } from "../settlement-api";

const CHIPS: [string, string][] = [["", "All"], ["DRAFT", "Draft"], ["PENDING_APPROVAL", "Pending approval"], ["APPROVED", "Approved"], ["PAID", "Paid"], ["CANCELLED", "Cancelled"]];
const TONE: Record<string, string> = { DRAFT: "neutral", PENDING_APPROVAL: "warn", APPROVED: "info", PAID: "good", CANCELLED: "danger" };
const money0 = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Final settlements register (Workforce › Payroll › Final Settlement). The template has only the settlement view
 * (app/hr/settlement); this list uses the template's table, chips and badges. Settlements start from an exit.
 */
export function SettlementsScreen() {
  const router = useRouter();
  const [data, setData] = useState<SettlementList | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listSettlements({ status, search }).then((d) => { if (!cancelled) { setData(d); setError(null); } })
        .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load settlements" }));
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [status, search, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHead eyebrow="Workforce / Payroll / Final Settlement" title="Final Settlements" description="Full & final settlements of exiting employees: computed, approved (JV) and paid (bank voucher)."
        actions={<Link className="btn secondary" href="/hr/offboarding"><UserX />Exits in progress</Link>} />
      <div className="panel flush">
        <div className="panel-head"><div><h3>Settlements</h3><p>{data ? `${total} settlement${total === 1 ? "" : "s"}` : ""}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search employee or FS no." value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <div className="chips">{CHIPS.map(([k, l]) => <button key={k} type="button" className={status === k ? "active" : ""} onClick={() => setStatus(k)}>{l} <i>{data ? (k ? data.counts[k] ?? 0 : total) : ""}</i></button>)}</div>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Settlement</th><th>Employee</th><th>Last day</th><th className="num">Earnings</th><th className="num">Deductions</th><th className="num">Net payable</th><th>Status</th></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={7}><Skeleton style={{ height: 120 }} /></td></tr> : data.items.length ? data.items.map((r) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/hr/settlements/${r.id}`)}>
                <td><Link className="link" href={`/hr/settlements/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.docNo}</Link><small>{dateLabel(r.docDate)}</small></td>
                <td><div className="cell-user"><span className="avatar sm">{initialsOf(r.employee.name)}</span><div><b>{r.employee.name}</b><small>{[r.employee.code, r.employee.designation].filter(Boolean).join(" · ")}</small></div></div></td>
                <td className="nowrap">{dateLabel(r.lastWorkingDay)}</td>
                <td className="num">{money0(r.earningsAmount)}</td><td className="num cr">{money0(r.deductionAmount)}</td><td className="num"><b>{money0(r.netAmount)}</b></td>
                <td><span className={`badge dot ${TONE[r.status] ?? "neutral"}`}>{CHIPS.find((c) => c[0] === r.status)?.[1] ?? r.status}</span></td>
              </tr>
            )) : <tr><td colSpan={7}><EmptyState icon={<UserX />} title="No final settlements" description="Start a settlement from an exit on Offboarding & Exits." /></td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
