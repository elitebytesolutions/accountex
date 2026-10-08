"use client";

import Link from "next/link";
import { Check, CheckCheck, CircleCheck, CircleX, Download, Fingerprint, History, Hourglass, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { RegularisationDetail, RegularisationList } from "@/shared";
import { Check as CheckBox, Field } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { initialsOf } from "@/features/auth/initials";
import { ApiError } from "@/lib/api/errors";
import { approveRegularisation, approveRegularisations, getRegularisation, listRegularisation, rejectRegularisation } from "../attendance-api";
import { dmy, dowDmy, hhmm, Person, REJECT_REASONS, REQUEST_TYPE, requestedPunch, stamp, StatusBadge } from "./attendance-ui";

const CHIPS: [string, string][] = [["PENDING", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["ALL", "All"]];

/** Template app/hr/attendance/requests (50-hr-core.html): KPIs, chips, checkbox table, drawer with the approval flow, reject modal. */
export function RegularisationScreen({ can, initialId }: { can: { approve: boolean }; initialId?: string }) {
  const toast = useToast();
  const [status, setStatus] = useState("PENDING");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RegularisationList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<RegularisationDetail | null>(null);
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [comment, setComment] = useState("");
  const [reject, setReject] = useState<{ reason: string; comment: string; markAbsentIfUnresolved: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    listRegularisation({ status, type, search: q, page, pageSize: 25 })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load requests" }));
    return () => { cancelled = true; };
  }, [attempt, status, type, q, page]);
  const show = useCallback(async (id: string) => {
    try { setTab("detail"); setComment(""); setOpen(await getRegularisation(id)); } catch (e) { toast(apiMessage(e, "Could not open the request"), { tone: "danger" }); }
  }, [toast]);
  useEffect(() => { if (initialId) getRegularisation(initialId).then(setOpen).catch(() => undefined); }, [initialId]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const act = async (work: () => Promise<RegularisationDetail | unknown>, done: string) => {
    setBusy(true);
    try { const r = await work(); toast(done, { tone: "good" }); setReject(null); if (open && r && typeof r === "object" && "id" in r) setOpen(r as RegularisationDetail); reload(); }
    catch (e) { toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const pending = data?.items.filter((i) => i.status === "PENDING") ?? [];
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const approveSelected = async () => {
    setBusy(true);
    try {
      const r = await approveRegularisations([...sel]);
      toast(`${r.done.length} request${r.done.length === 1 ? "" : "s"} approved${r.failed.length ? ` · ${r.failed.length} not (${r.failed[0]!.message})` : ""}`, { tone: r.failed.length ? "warn" : "good" });
      setSel(new Set()); reload();
    } catch (e) { toast(apiMessage(e, "Could not approve"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const k = data?.kpis;
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;
  const allCount = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const steps = open?.approval?.steps ?? [];

  return (
    <>
      <PageHead eyebrow={<><Link className="link" href="/hr/attendance">HR / Attendance</Link> / Requests</>} title="Regularisation Requests"
        description="Missed punches, late-arrival justifications and on-duty claims submitted via My Profile."
        actions={<>
          <button className="btn secondary" type="button" disabled={!data} onClick={() => data && downloadCsv("Regularisation_requests.csv", [["Request", "Employee", "Type", "Date", "Requested", "Reason", "Submitted", "Status"], ...data.items.map((r) => [r.docNo, r.employee.name, REQUEST_TYPE[r.requestType]?.[0] ?? r.requestType, r.attDate, requestedPunch(r), r.reason, r.submittedAt.slice(0, 16).replace("T", " "), r.status])])}><Download />Export</button>
          {can.approve && <button className="btn primary" type="button" disabled={busy || !sel.size} onClick={approveSelected}><CheckCheck />Approve selected{sel.size ? ` (${sel.size})` : ""}</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi yellow"><div className="kpi-top"><span>Pending</span><span className="icon-well"><Hourglass /></span></div><strong>{k?.pending ?? "—"}</strong><small>{k ? `${k.pendingOld} older than 48 hrs` : ""}</small></div>
        <div className="kpi"><div className="kpi-top"><span>Approved (this month)</span><span className="icon-well"><CircleCheck /></span></div><strong>{k?.approvedMonth ?? "—"}</strong><small>{k?.avgTurnaroundHours != null ? `Avg. turnaround ${k.avgTurnaroundHours} hrs` : "No approvals yet"}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Rejected (this month)</span><span className="icon-well"><CircleX /></span></div><strong>{k?.rejectedMonth ?? "—"}</strong><small>With a recorded reason</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Top reason</span><span className="icon-well"><Fingerprint /></span></div><strong>{k?.topType ? REQUEST_TYPE[k.topType]?.[0] ?? k.topType : "—"}</strong><small>{k?.topTypePct != null ? `${k.topTypePct}% of requests` : ""}</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Requests</h3><p>Missed punches and time corrections</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search requests…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type"><option value="">All types</option>{Object.entries(REQUEST_TYPE).map(([c, [l]]) => <option key={c} value={c}>{l}</option>)}</select>
          <div className="chips">{CHIPS.map(([c, l]) => <button key={c} type="button" className={status === c ? "active" : ""} onClick={() => { setStatus(c); setPage(1); setSel(new Set()); }}>{l} <i>{c === "ALL" ? allCount : data?.counts[c] ?? 0}</i></button>)}</div>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th><input type="checkbox" aria-label="Select all pending" checked={!!pending.length && pending.every((p) => sel.has(p.id))} onChange={(e) => setSel(e.target.checked ? new Set(pending.map((p) => p.id)) : new Set())} /></th><th>Request</th><th>Employee</th><th>Type</th><th>Date</th><th>Requested punch</th><th>Reason</th><th>Submitted</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={10}><Skeleton style={{ height: 120 }} /></td></tr> : data.items.length ? data.items.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" aria-label={`Select ${r.docNo}`} disabled={r.status !== "PENDING"} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td><button type="button" className="link" onClick={() => show(r.id)}>{r.docNo}</button></td>
                <td><Person e={r.employee} sub={`${r.employee.code}${r.employee.branch ? ` · ${r.employee.branch}` : ""}`} /></td>
                <td><span className={`badge ${REQUEST_TYPE[r.requestType]?.[1] ?? "neutral"}`}>{REQUEST_TYPE[r.requestType]?.[0] ?? r.requestType}</span></td>
                <td className="nowrap">{dmy(r.attDate)}</td><td className="nowrap">{requestedPunch(r)}</td><td>{r.reason}</td><td className="nowrap">{stamp(r.submittedAt)}</td>
                <td><StatusBadge status={r.status} />{r.status === "PENDING" && r.waitingOn && <small className="muted" style={{ display: "block" }}>{r.waitingOn}</small>}</td>
                <td className="actions">{r.status === "PENDING" && <>
                  <button className="icon-btn-sm" type="button" title="Approve" aria-label={`Approve ${r.docNo}`} disabled={busy} onClick={() => act(() => approveRegularisation(r.id, null), `Request ${r.docNo} approved`)}><Check /></button>
                  <button className="icon-btn-sm" type="button" title="Reject" aria-label={`Reject ${r.docNo}`} onClick={async () => { await show(r.id); setReject({ reason: "INSUFFICIENT_EVIDENCE", comment: "", markAbsentIfUnresolved: false }); }}><X /></button>
                </>}</td>
              </tr>
            )) : <tr><td colSpan={10}><EmptyState icon={<Fingerprint />} title="No requests" description="Corrections employees file from My Profile › Attendance appear here." /></td></tr>}
          </tbody>
        </table></div>
        <div className="table-foot"><span>{data ? `Showing ${data.items.length} of ${data.total}` : ""}</span>
          {pages > 1 && <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>)}<button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button></div>}
        </div>
      </div>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.docNo ?? ""} subtitle={open ? `${REQUEST_TYPE[open.requestType]?.[0] ?? open.requestType} · submitted ${stamp(open.submittedAt)}` : ""}
        foot={open && (<>
          {open.status === "PENDING" && <button className="btn danger" type="button" disabled={busy} onClick={() => setReject({ reason: "INSUFFICIENT_EVIDENCE", comment: comment, markAbsentIfUnresolved: false })}>Reject</button>}
          <button className="btn ghost" type="button" onClick={() => setTab(tab === "detail" ? "history" : "detail")}><History />{tab === "detail" ? "History" : "Details"}</button>
          <span className="spacer" />
          <button className="btn secondary" type="button" onClick={() => setOpen(null)}>Close</button>
          {open.status === "PENDING" && <button className="btn primary" type="button" disabled={busy} onClick={() => act(() => approveRegularisation(open.id, comment || null), `Request ${open.docNo} approved${open.requestType === "MISSED_PUNCH" ? " — punch added" : ""}`)}>Approve</button>}
        </>)}>
        {open && (tab === "history" ? <HistoryTab schema="HumanResources" table="RegularisationRequests" id={open.id} /> : (
          <>
            <div className="row mb"><span className="avatar lg">{initialsOf(open.employee.name)}</span><div><b>{open.employee.name}</b><small className="muted" style={{ display: "block" }}>{[open.employee.designation, open.employee.code, open.employee.branch].filter(Boolean).join(" · ")}</small></div><span className="spacer" /><StatusBadge status={open.status} /></div>
            <div className="dl">
              <div><span>Date</span><b>{dowDmy(open.attDate)}</b></div>
              <div><span>Shift</span><b>{open.shift ? `${open.shift.name} ${open.shift.startTime} – ${open.shift.endTime}` : "—"}</b></div>
              <div><span>Recorded punches</span><b>{open.punches.length ? open.punches.map((p) => `${p.direction === "OUT" ? "Out" : "In"} ${hhmm(p.punchAt)}${p.device ? ` (${p.device})` : p.source === "MANUAL" ? " (manual)" : ""}`).join(" · ") : "None"}</b></div>
              <div><span>Requested</span><b>{requestedPunch(open)}</b></div>
              <div><span>Reason</span><b>{open.reason}</b></div>
              <div><span>Requests this month</span><b>{open.requestsThisMonth}</b></div>
              {open.rejectionReason && <div><span>Rejected because</span><b>{REJECT_REASONS.find(([c]) => c === open.rejectionReason)?.[1] ?? open.rejectionReason}{open.decisionComment ? ` — ${open.decisionComment}` : ""}</b></div>}
              {open.status === "APPROVED" && open.decisionComment && <div><span>Comment</span><b>{open.decisionComment}</b></div>}
            </div>
            <div className="form-section"><h4>Approval flow</h4></div>
            <div className="timeline">
              <div className="tl-item"><span className="tl-dot good" /><div><b>Submitted by {open.employee.name}</b><small>{stamp(open.submittedAt)} · via {open.channel === "ESS_MOBILE" ? "mobile" : open.channel === "HR" ? "HR" : "My Profile"}</small></div></div>
              {steps.length ? steps.map((s) => (
                <div className="tl-item" key={s.stepNo}><span className={`tl-dot ${s.state === "done" ? "good" : s.state === "current" ? "warn" : ""}`} /><div><b>{s.name}{s.approvers.length ? ` — ${s.approvers.map((a) => a.name).join(", ")}` : ""}</b>
                  <small>{s.state === "done" ? `Approved${s.actedBy[0] ? ` by ${s.actedBy[0].name} · ${stamp(s.actedBy[0].at)}` : ""}` : s.state === "current" ? (open.status === "PENDING" ? "Awaiting action" : STATUS_TONE_TEXT[open.status]) : s.state === "skipped" ? "Skipped — no approver" : "Final approval"}</small></div></div>
              )) : <div className="tl-item"><span className={`tl-dot ${open.status === "PENDING" ? "warn" : "good"}`} /><div><b>HR</b><small>{open.status === "PENDING" ? "Awaiting action" : `${open.status === "APPROVED" ? "Approved" : "Decided"}${open.decidedBy ? ` by ${open.decidedBy.name}` : ""}`}</small></div></div>}
            </div>
            {open.status === "PENDING" && <label className="full mt" style={{ display: "block" }}><span className="small muted">Comment</span><textarea rows={2} style={{ width: "100%" }} placeholder="Optional note to employee" value={comment} onChange={(e) => setComment(e.target.value)} /></label>}
          </>
        ))}
      </Drawer>

      <Modal open={!!reject && !!open} onClose={() => setReject(null)} title="Reject request?" subtitle="The employee sees the reason in My Profile."
        foot={<><button className="btn secondary" type="button" onClick={() => setReject(null)}>Cancel</button><button className="btn danger" type="button" disabled={busy} onClick={() => open && reject && act(() => rejectRegularisation(open.id, { ...reject, comment: reject.comment || null }), `Request ${open.docNo} rejected`)}>Reject</button></>}>
        {reject && <div className="form-grid">
          <Field label="Reason" required full><select value={reject.reason} onChange={(e) => setReject({ ...reject, reason: e.target.value })}>{REJECT_REASONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></Field>
          <Field label="Comment" full><textarea rows={3} value={reject.comment} maxLength={500} placeholder="e.g. Please attach a supporting document or CCTV reference." onChange={(e) => setReject({ ...reject, comment: e.target.value })} /></Field>
          <CheckBox full label="Mark day as absent if not resolved within 48 hrs" checked={reject.markAbsentIfUnresolved} onChange={(e) => setReject({ ...reject, markAbsentIfUnresolved: e.target.checked })} />
        </div>}
      </Modal>
    </>
  );
}

const STATUS_TONE_TEXT: Record<string, string> = { APPROVED: "Approved", REJECTED: "Rejected", WITHDRAWN: "Withdrawn by the employee" };
