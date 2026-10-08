"use client";

import Link from "next/link";
import { Check, CheckCheck, Download, MoreHorizontal, Plane, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LeaveFormOptions, LeaveRequestDetail, LeaveRequestList } from "@/shared";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { initialsOf } from "@/features/auth/initials";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { approveLeaves, getLeave, leaveOptions, listLeave } from "../lifecycle-api";
import { localToday, monthLabel, shiftMonth, StatusBadge } from "./attendance-ui";
import { ApplyOnBehalfModal, days, LeaveBadge, LeaveDrawer, leaveRange } from "./leave-ui";

const CHIPS: [string, string][] = [["ALL", "All"], ["PENDING", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["CANCELLED", "Cancelled"]];

/** Template app/hr/leave/requests (50-hr-core.html): filters, chips, checkbox table, approve / reject modals, new request. `?request=<id>` opens one. */
export function LeaveRequestsScreen({ can, initialId }: { can: { create: boolean; approve: boolean }; initialId?: string }) {
  const toast = useToast();
  const thisMonth = localToday().slice(0, 7);
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("");
  const [dept, setDept] = useState("");
  const [period, setPeriod] = useState("YEAR");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaveRequestList | null>(null);
  const [opts, setOpts] = useState<LeaveFormOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<LeaveRequestDetail | null>(null);
  const [apply, setApply] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    listLeave({ status, leaveTypeId: type, departmentId: dept, period, search: q, page, pageSize: 25 })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load leave requests" }));
    return () => { cancelled = true; };
  }, [attempt, status, type, dept, period, q, page]);
  useEffect(() => { leaveOptions().then(setOpts).catch(() => undefined); }, []);
  useEffect(() => { if (initialId) getLeave(initialId).then(setOpen).catch(() => undefined); }, [initialId]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const show = async (id: string) => { try { setOpen(await getLeave(id)); } catch (e) { toast(apiMessage(e, "Could not open the request"), { tone: "danger" }); } };
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const pending = data?.items.filter((i) => i.status === "PENDING") ?? [];
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const approveSelected = async () => {
    setBusy(true);
    try {
      const r = await approveLeaves([...sel]);
      toast(`${r.done.length} request${r.done.length === 1 ? "" : "s"} approved${r.failed.length ? ` · ${r.failed.length} not (${r.failed[0]!.message})` : ""}`, { tone: r.failed.length ? "warn" : "good" });
      setSel(new Set()); reload();
    } catch (e) { toast(apiMessage(e, "Could not approve"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;
  const allCount = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const fy = data ? `FY ${data.yearStart.slice(0, 4)}-${String(Number(data.yearStart.slice(2, 4)) + 1).padStart(2, "0")}` : "this leave year";
  const reset = () => { setPage(1); setSel(new Set()); };

  return (
    <>
      <PageHead eyebrow={<><Link className="link" href="/hr/leave">HR / Leave</Link> / Requests</>} title="Leave Requests" description={`All leave applications from ESS and HR · ${fy}.`}
        actions={<>
          <button className="btn secondary" type="button" disabled={!data} onClick={() => data && downloadCsv("Leave_requests.csv", [["Request", "Employee", "Code", "Type", "From", "To", "Days", "Reason", "Status", "Stage"], ...data.items.map((r) => [r.docNo, r.employee.name, r.employee.code, r.leaveType.name, r.fromDate, r.toDate, String(r.days), r.reason ?? "", r.status, r.stage])])}><Download />Export</button>
          {can.approve && sel.size > 0 && <button className="btn secondary" type="button" disabled={busy} onClick={approveSelected}><CheckCheck />Approve selected ({sel.size})</button>}
          {can.create && <button className="btn primary" type="button" onClick={() => setApply(true)}><Plus />New request</button>}
        </>} />

      <div className="panel flush">
        <div className="panel-head"><div><h3>Leave requests</h3><p>{fy}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search employee, LV number…" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} /></label>
          <select aria-label="Leave type" value={type} onChange={(e) => { setType(e.target.value); reset(); }}><option value="">All leave types</option>{opts?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select aria-label="Department" value={dept} onChange={(e) => { setDept(e.target.value); reset(); }}><option value="">All departments</option>{opts?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select aria-label="Period" value={period} onChange={(e) => { setPeriod(e.target.value); reset(); }}>
            {[thisMonth, shiftMonth(thisMonth, -1), shiftMonth(thisMonth, 1)].map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            <option value="YEAR">{fy}</option><option value="ALL">All time</option>
          </select>
          <div className="chips">{CHIPS.map(([c, l]) => <button key={c} type="button" className={status === c ? "active" : ""} onClick={() => { setStatus(c); reset(); }}>{l} <i>{c === "ALL" ? allCount : data?.counts[c] ?? 0}</i></button>)}</div>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th><input type="checkbox" aria-label="Select all pending" checked={!!pending.length && pending.every((p) => sel.has(p.id))} onChange={(e) => setSel(e.target.checked ? new Set(pending.map((p) => p.id)) : new Set())} /></th><th>Request #</th><th>Employee</th><th>Type</th><th>From – To</th><th className="num">Days</th><th>Reason</th><th>Status</th><th>Approver</th><th /></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={10}><Skeleton style={{ height: 160 }} /></td></tr> : data.items.length ? data.items.map((r) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => show(r.id)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.docNo}`} disabled={r.status !== "PENDING"} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="nowrap">{r.docNo}</td>
                <td><div className="cell-user"><span className="avatar sm">{initialsOf(r.employee.name)}</span><div><b>{r.employee.name}</b><small>{r.employee.code}{r.employee.department ? ` · ${r.employee.department}` : ""}</small></div></div></td>
                <td><LeaveBadge t={r.leaveType} /></td><td className="nowrap">{leaveRange(r)}</td><td className="num">{days(r.days)}</td><td>{r.reason ?? "—"}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.status === "PENDING" ? (r.waitingOn?.split(" — ")[1] ?? r.waitingOn ?? "HR") : r.appliedOnBehalf ? "HR (on behalf)" : r.decidedBy?.name ?? "—"}</td>
                <td className="actions" onClick={(e) => e.stopPropagation()}>{r.status === "PENDING" ? <>
                  <button className="icon-btn-sm" type="button" title="Approve" aria-label={`Approve ${r.docNo}`} onClick={() => show(r.id)}><Check /></button>
                  <button className="icon-btn-sm" type="button" title="Reject" aria-label={`Reject ${r.docNo}`} onClick={() => show(r.id)}><X /></button>
                </> : <button className="icon-btn-sm" type="button" aria-label={`Open ${r.docNo}`} onClick={() => show(r.id)}><MoreHorizontal /></button>}</td>
              </tr>
            )) : <tr><td colSpan={10}><EmptyState icon={<Plane />} title="No leave requests" description="Requests filed from My Profile › Leave, or by HR on behalf, appear here." /></td></tr>}
          </tbody>
        </table></div>
        <div className="table-foot"><span>{data ? `Showing ${data.items.length ? (page - 1) * 25 + 1 : 0}–${(page - 1) * 25 + data.items.length} of ${data.total}` : ""}</span>
          {pages > 1 && <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>)}<button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button></div>}
        </div>
      </div>

      {apply && <ApplyOnBehalfModal open={apply} onClose={() => setApply(false)} options={opts} onDone={reload} title="New leave request" />}
      <LeaveDrawer key={open?.id ?? "none"} open={open} onClose={() => setOpen(null)} onChanged={(r) => { setOpen(r); reload(); }} canCancel={can.approve} />
    </>
  );
}
