"use client";

import { AlertTriangle, BarChart3, Calculator, Check, History, Hourglass, MoreHorizontal, Plus, Search, Send, Settings2, Timer, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { overtimeAmount, rangeDays, roundOvertime, spanHours, type AttendanceOptions, type OvertimeClaim, type OvertimeClaimList, type OvertimePolicy, type OvertimeRate } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check as CheckBox, Field, FormGrid } from "@/components/ui/form";
import { Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createOvertimePolicy, deleteOvertimePolicy, listOvertimePolicies, overtimeGrades, setOvertimePolicyActive, updateOvertimePolicy } from "../api";
import { approveOvertime, attendanceOptions, cancelOvertime, listOvertimeClaims, logOvertime, overtimeRate, rejectOvertime } from "../attendance-api";
import { pushOvertime } from "@/features/payroll/pay-api";
import { fmtNum, localToday, monthLabel, Person, shiftMonth, StatusBadge } from "./attendance-ui";
import { RecordModal } from "./record-modal";

type Grade = { id: string; code: string; name: string };
type Can = { create: boolean; edit: boolean; remove: boolean; approve?: boolean; push?: boolean };
const x = (n: number) => `${Number.isInteger(n) ? n.toFixed(1) : n}×`;
const DAY_TYPE: Record<string, string> = { WEEKDAY: "Weekday", WEEKLY_OFF: "Weekly off", PUBLIC_HOLIDAY: "Public holiday" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const span = (c: OvertimeClaim) => {
  const dd = (d: string) => `${d.slice(8)} ${MON[Number(d.slice(5, 7)) - 1]}`;
  const dow = (d: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${d}T00:00:00Z`).getUTCDay()];
  return c.dateFrom === c.dateTo ? `${dd(c.dateFrom)}${c.dayType !== "WEEKDAY" ? ` (${dow(c.dateFrom)})` : ""}` : `${c.dateFrom.slice(8)}–${dd(c.dateTo)}`;
};
const blankLog = { employeeId: "", dateFrom: "", dayType: "WEEKDAY", timeFrom: "18:00", timeTo: "21:00", hourlyRate: "", reason: "", isCompOff: false };

/** Template app/hr/overtime (50-hr-core.html): claims (log, approve / reject / cancel), the policy panel and its modal; "Push to payroll" moves the month's approved claims into its open payroll run (Phase 32). */
export function OvertimeScreen({ can, initialId }: { can: Can; initialId?: string }) {
  const toast = useToast();
  const lookups = useLookups(["HourlyRateBasis", "Rounding"]);
  const [rows, setRows] = useState<OvertimePolicy[] | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<{ row: OvertimePolicy | null } | null>(null);
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // claims
  const [month, setMonth] = useState(localToday().slice(0, 7));
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [claims, setClaims] = useState<OvertimeClaimList | null>(null);
  const [opts, setOpts] = useState<AttendanceOptions | null>(null);
  const [log, setLog] = useState<typeof blankLog | null>(null);
  const [rateState, setRate] = useState<{ key: string; r: OvertimeRate } | null>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; c: OvertimeClaim } | null>(null);
  const [hist, setHist] = useState<OvertimeClaim | null>(null);
  const [rej, setRej] = useState<{ c: OvertimeClaim; reason: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listOvertimePolicies(), overtimeGrades()])
      .then(([r, g]) => { if (!cancelled) { setRows(r); setGrades(g); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load overtime" }));
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    listOvertimeClaims({ month, status, search: q, page, pageSize: 25 }).then((c) => !cancelled && setClaims(c)).catch(() => !cancelled && setClaims(null));
    return () => { cancelled = true; };
  }, [attempt, month, status, q, page]);
  useEffect(() => {
    if (!log?.employeeId || !log.dateFrom) return;
    let cancelled = false;
    const key = `${log.employeeId}|${log.dateFrom}`;
    overtimeRate(log.employeeId, log.dateFrom).then((r) => !cancelled && setRate({ key, r })).catch(() => undefined);
    return () => { cancelled = true; };
  }, [log?.employeeId, log?.dateFrom]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const rate = log && rateState?.key === `${log.employeeId}|${log.dateFrom}` ? rateState.r : null;
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const active = rows?.find((p) => p.isActive) ?? null;
  const open = (row: OvertimePolicy | null) => {
    setErrs({});
    setEdit({ row });
    setF({
      name: row?.name ?? (active ? "" : "Standard"), statuteNote: row?.statuteNote ?? "", weekdayMultiplier: String(row?.weekdayMultiplier ?? 1.5), weeklyOffMultiplier: String(row?.weeklyOffMultiplier ?? 2),
      holidayMultiplier: String(row?.holidayMultiplier ?? 2), hourlyRateBasis: row?.hourlyRateBasis ?? "GROSS_26_8", dailyCapHours: row?.dailyCapHours?.toString() ?? "", monthlyCapHours: row?.monthlyCapHours?.toString() ?? "",
      minMinutes: String(row?.minMinutes ?? 30), rounding: row?.rounding ?? "NEAREST_30", eligibleUpToGradeId: row?.eligibleUpToGrade?.id ?? "", requiresPreApproval: row?.requiresPreApproval ?? true,
      allowCompOff: row?.allowCompOff ?? true, effectiveFrom: row?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    });
  };
  const set = (k: string, v: string | boolean) => { setF((p) => ({ ...p, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setEdit(null); setLog(null); setRej(null); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => edit && run(() => (edit.row ? updateOvertimePolicy(edit.row.id, { ...f, rowVersion: edit.row.rowVersion }) : createOvertimePolicy(f)), "Overtime policy saved");
  const gradeLabel = (p: OvertimePolicy) => {
    if (!p.eligibleUpToGrade) return "All grades";
    const first = grades[0];
    return first && first.id !== p.eligibleUpToGrade.id ? `${first.code} to ${p.eligibleUpToGrade.code} only` : `${p.eligibleUpToGrade.code} only`;
  };
  const num = (k: string, props: Record<string, unknown> = {}) => <input inputMode="decimal" value={f[k] as string} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ""))} {...props} />;

  // log overtime estimate
  const setL = (k: keyof typeof blankLog, v: string | boolean) => { setLog((l) => (l ? { ...l, [k]: v } : l)); setErrs((e) => ({ ...e, [k]: "" })); };
  const pol = rate?.policy;
  const mult = !pol || !log ? 0 : log.dayType === "WEEKDAY" ? pol.weekdayMultiplier : log.dayType === "WEEKLY_OFF" ? pol.weeklyOffMultiplier : pol.holidayMultiplier;
  const hrs = log && log.timeFrom && log.timeTo ? roundOvertime(spanHours(log.timeFrom, log.timeTo) * (log.dateFrom ? rangeDays(log.dateFrom, log.dateFrom) : 1), pol?.rounding ?? null) : 0;
  const hourly = rate?.hourlyRate ?? (log?.hourlyRate ? Number(log.hourlyRate) : null);
  const k = claims?.kpis;
  const pages = claims ? Math.max(1, Math.ceil(claims.total / 25)) : 1;
  const all = claims ? Object.values(claims.counts).reduce((a, b) => a + b, 0) : 0;
  const maxDept = Math.max(1, ...(claims?.byDepartment.map((d) => d.hours) ?? [1]));
  const change = k && k.prevHours ? Math.round(((k.hours - k.prevHours) / k.prevHours) * 100) : null;

  return (
    <>
      <PageHead eyebrow="HR / Attendance" title="Overtime" description={`Overtime claims, approvals and payroll posting · ${monthLabel(month)} cycle.`}
        actions={<>
          <button className="btn secondary" type="button" disabled={!active && !can.create} onClick={() => (active ? open(active) : open(null))}><Settings2 />OT policy</button>
          <button className="btn secondary" type="button" disabled={!can.push || busy} title={can.push ? `Add ${monthLabel(month)}'s approved overtime to its open payroll run` : "Needs payroll edit rights"} onClick={async () => { setBusy(true); try { const r = await pushOvertime(month); toast(r.pushed ? `${r.pushed} approved claim${r.pushed === 1 ? "" : "s"} pushed into ${r.docNo}` : `No approved overtime left to push into ${r.docNo}`, { tone: r.pushed ? "good" : "info" }); reload(); } catch (e) { toast(apiMessage(e, "Could not push overtime to payroll"), { tone: "danger" }); } finally { setBusy(false); } }}><Send />Push to payroll</button>
          {can.create && <button className="btn primary" type="button" disabled={!active} title={active ? undefined : "Activate an overtime policy first"} onClick={() => { setErrs({}); setLog({ ...blankLog, dateFrom: localToday() }); if (!opts) void attendanceOptions().then(setOpts); }}><Plus />Log overtime</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>OT hours ({MON[Number(month.slice(5)) - 1]})</span><span className="icon-well"><Timer /></span></div><strong>{k ? `${fmtNum(k.hours, k.hours % 1 ? 1 : 0)} hrs` : "—"}</strong><small className={change !== null && change > 0 ? "down" : undefined}>{change !== null ? `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}% vs last month` : "Approved claims"}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>OT cost ({MON[Number(month.slice(5)) - 1]})</span><span className="icon-well"><Wallet /></span></div><strong>{k ? `Rs ${fmtNum(k.cost)}` : "—"}</strong><small>Paid with payroll</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Pending approval</span><span className="icon-well"><Hourglass /></span></div><strong>{k?.pendingCount ?? "—"}</strong><small>{k ? `${fmtNum(k.pendingHours, k.pendingHours % 1 ? 1 : 0)} hrs · Rs ${fmtNum(k.pendingAmount)}` : ""}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Over monthly cap</span><span className="icon-well"><AlertTriangle /></span></div><strong>{k?.overCap ?? 0}</strong><small>{active?.monthlyCapHours ? `Cap ${active.monthlyCapHours} hrs / employee` : "No monthly cap"}</small></div>
      </div>

      <div className="split">
        <div>
          <div className="panel flush">
            <div className="panel-head"><div><h3>Overtime claims</h3><p>{monthLabel(month)} · paid with payroll</p></div></div>
            <div className="toolbar">
              <label className="search-field"><Search /><input placeholder="Search employee or OT #…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
              <select value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} aria-label="Payroll month">{[0, -1, -2, -3, -4, -5].map((i) => { const m = shiftMonth(localToday().slice(0, 7), i); return <option key={m} value={m}>{monthLabel(m)}</option>; })}</select>
              <div className="chips">{[["ALL", "All", all], ["PENDING", "Pending", claims?.counts.PENDING ?? 0], ["APPROVED", "Approved", claims?.counts.APPROVED ?? 0], ["REJECTED", "Rejected", claims?.counts.REJECTED ?? 0]].map(([c, l, n]) => <button key={c} type="button" className={status === c ? "active" : ""} onClick={() => { setStatus(String(c)); setPage(1); }}>{l} <i>{n}</i></button>)}</div>
            </div>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>OT #</th><th>Employee</th><th>Date</th><th>Day type</th><th className="num">Hours</th><th>Rate</th><th className="num">Amount (Rs)</th><th>Approval</th><th /></tr></thead>
              <tbody>
                {!claims ? <tr><td colSpan={9}><Skeleton style={{ height: 100 }} /></td></tr> : claims.items.length ? claims.items.map((c) => (
                  <tr key={c.id} className={cn(c.id === initialId && "row-flash")}>
                    <td>{c.docNo}</td><td><Person e={c.employee} sub={[c.employee.department, c.employee.branch].filter(Boolean).join(" · ")} /></td><td className="nowrap">{span(c)}</td><td>{DAY_TYPE[c.dayType] ?? c.dayType}</td>
                    <td className="num">{fmtNum(c.hours, 1)}</td><td><span className={`badge ${c.multiplier >= 2 ? "violet" : "info"}`}>{x(c.multiplier)}</span></td>
                    <td className="num">{c.isCompOff ? <span className="badge neutral">Comp-off</span> : fmtNum(c.amount)}</td>
                    <td><StatusBadge status={c.status}>{c.status === "PENDING" ? `Pending${c.waitingOn ? ` — ${c.waitingOn.replace(/^[^—]*— /, "")}` : ""}` : c.status === "REJECTED" ? `Rejected — ${c.rejectionReason ?? ""}` : c.status === "APPROVED" ? `Approved${c.decidedBy ? ` — ${c.decidedBy.name}` : ""}` : undefined}</StatusBadge></td>
                    <td className="actions">
                      {c.status === "PENDING" && (c.canAct || (can.approve && !c.approval)) && <>
                        <button className="icon-btn-sm" type="button" title="Approve" aria-label={`Approve ${c.docNo}`} disabled={busy} onClick={() => run(() => approveOvertime(c.id), `${c.docNo} approved`)}><Check /></button>
                        <button className="icon-btn-sm" type="button" title="Reject" aria-label={`Reject ${c.docNo}`} onClick={() => setRej({ c, reason: "" })}><X /></button>
                      </>}
                      <button className="icon-btn-sm" type="button" aria-label={`More for ${c.docNo}`} onClick={(e) => setMenu({ el: e.currentTarget, c })}><MoreHorizontal /></button>
                    </td>
                  </tr>
                )) : <tr><td colSpan={9}><EmptyState icon={<Timer />} title="No overtime claims" description={active ? "Log overtime on behalf of an employee; it is priced with the active policy." : "Activate an overtime policy, then log overtime."} /></td></tr>}
              </tbody>
            </table></div>
            <div className="table-foot"><span>{claims ? `Showing ${claims.items.length} of ${claims.total} · amounts = hourly rate × hours × rate` : ""}</span>
              {pages > 1 && <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>)}<button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button></div>}</div>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Overtime policy</h3><p>{active?.statuteNote ?? (active ? active.name : "No active policy")}</p></div>
              <div className="panel-actions">{active && can.edit && <button className="btn ghost sm" type="button" onClick={() => open(active)}>Edit</button>}{!active && can.create && <button className="btn ghost sm" type="button" onClick={() => open(null)}><Plus />New</button>}</div></div>
            {!rows ? <Skeleton style={{ height: 200 }} /> : active ? (
              <div className="dl">
                <div><span>Weekday rate</span><b>{x(active.weekdayMultiplier)} hourly rate</b></div>
                <div><span>Weekly off / public holiday</span><b>{active.weeklyOffMultiplier === active.holidayMultiplier ? `${x(active.weeklyOffMultiplier)} hourly rate` : `${x(active.weeklyOffMultiplier)} / ${x(active.holidayMultiplier)}`}</b></div>
                <div><span>Hourly rate basis</span><b>{labelOf(lookups, "HourlyRateBasis", active.hourlyRateBasis).replace(/÷ (\d+) ÷ (\d+)/, "÷ $1 days ÷ $2 hrs")}</b></div>
                <div><span>Minimum to count</span><b>{active.minMinutes} min after shift end</b></div>
                <div><span>Daily cap</span><b>{active.dailyCapHours ? `${active.dailyCapHours} hrs` : "None"}</b></div>
                <div><span>Monthly cap</span><b>{active.monthlyCapHours ? `${active.monthlyCapHours} hrs` : "None"}</b></div>
                <div><span>Eligible grades</span><b>{gradeLabel(active)}</b></div>
                <div><span>Pre-approval</span><b>{active.requiresPreApproval ? "Required (ESS request)" : "Not required"}</b></div>
                <div><span>Effective from</span><b>{dateLabel(active.effectiveFrom)}</b></div>
              </div>
            ) : <EmptyState title="No active policy" description="Overtime can't be priced until one policy is active." />}
            {rows && rows.filter((p) => !p.isActive).length > 0 && (
              <div className="list mt">
                {rows.filter((p) => !p.isActive).map((p) => (
                  <button key={p.id} type="button" className="list-item" onClick={() => open(p)}><span className="icon-well"><Settings2 /></span><div><b>{p.name}</b><small>Inactive · from {dateLabel(p.effectiveFrom)}</small></div></button>
                ))}
              </div>
            )}
            {active && can.create && <button className="btn ghost sm mt" type="button" onClick={() => open(null)}><Plus />New policy (inactive until switched)</button>}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>OT hours by department</h3><p>{monthLabel(month)}</p></div></div>
            {claims?.byDepartment.length ? (
              <div className="bars">{claims.byDepartment.slice(0, 8).map((d) => <div key={d.department} className="bar" style={{ ["--h" as string]: `${Math.max(4, Math.round((d.hours / maxDept) * 100))}%` }} title={`${d.hours} hrs`}><i /><span>{d.department.slice(0, 3).toUpperCase()}</span></div>)}</div>
            ) : <EmptyState icon={<BarChart3 />} title="No overtime yet" description="Hours by department appear once claims are approved." />}
          </div>
        </div>
      </div>

      {menu && <Menu anchor={menu.el} onClose={() => setMenu(null)} items={[
        { label: "History", icon: <History />, onClick: () => { setHist(menu.c); setMenu(null); } },
        ...(can.create && ["PENDING", "APPROVED"].includes(menu.c.status) ? [{ label: "Cancel claim", danger: true, onClick: () => { const c = menu.c; setMenu(null); void run(() => cancelOvertime(c.id, c.rowVersion), `${c.docNo} cancelled`); } }] : []),
      ]} />}
      <Modal open={!!hist} onClose={() => setHist(null)} wide title={hist ? `${hist.docNo} · history` : ""}>{hist && <HistoryTab schema="HumanResources" table="OvertimeClaims" id={hist.id} />}</Modal>
      <Modal open={!!rej} onClose={() => setRej(null)} title="Reject overtime?" subtitle={rej ? `${rej.c.docNo} · ${rej.c.employee.name}` : ""}
        foot={<><button className="btn secondary" type="button" onClick={() => setRej(null)}>Cancel</button><button className="btn danger" type="button" disabled={busy} onClick={() => rej && run(() => rejectOvertime(rej.c.id, rej.reason), `${rej.c.docNo} rejected`)}>Reject</button></>}>
        {rej && <Field label="Reason" required full error={errs.reason}><input value={rej.reason} maxLength={300} placeholder="e.g. Not pre-approved" onChange={(e) => setRej({ ...rej, reason: e.target.value })} /></Field>}
      </Modal>

      <Modal open={!!log} onClose={() => setLog(null)} title="Log overtime" subtitle="On behalf of an employee"
        foot={<><button className="btn secondary" type="button" onClick={() => setLog(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={() => log && run(() => logOvertime({ ...log, hourlyRate: rate?.hourlyRate == null && log.hourlyRate ? Number(log.hourlyRate) : null, dateTo: null }), "Overtime logged and sent for approval")}>{busy ? "Submitting…" : "Submit"}</button></>}>
        {log && <>
          <div className="form-grid">
            <Field label="Employee" required full error={errs.employeeId}><select value={log.employeeId} onChange={(e) => setL("employeeId", e.target.value)}><option value="">Choose…</option>{opts?.employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.code}</option>)}</select></Field>
            <Field label="Date" required error={errs.dateFrom}><input type="date" value={log.dateFrom} onChange={(e) => setL("dateFrom", e.target.value)} /></Field>
            <Field label="Day type" error={errs.dayType}><select value={log.dayType} onChange={(e) => setL("dayType", e.target.value)}><option value="WEEKDAY">Weekday ({x(active?.weekdayMultiplier ?? 1.5)})</option><option value="WEEKLY_OFF">Weekly off ({x(active?.weeklyOffMultiplier ?? 2)})</option><option value="PUBLIC_HOLIDAY">Public holiday ({x(active?.holidayMultiplier ?? 2)})</option></select></Field>
            <Field label="From" error={errs.timeFrom}><input type="time" value={log.timeFrom} onChange={(e) => setL("timeFrom", e.target.value)} /></Field>
            <Field label="To" error={errs.timeTo ?? errs.hours}><input type="time" value={log.timeTo} onChange={(e) => setL("timeTo", e.target.value)} /></Field>
            {rate && rate.hourlyRate === null && <Field label="Hourly rate (Rs)" required full error={errs.hourlyRate} hint="No salary is on record for this employee"><input inputMode="decimal" value={log.hourlyRate} onChange={(e) => setL("hourlyRate", e.target.value.replace(/[^\d.]/g, ""))} /></Field>}
            <Field label="Reason" full error={errs.reason}><textarea rows={2} value={log.reason} maxLength={500} placeholder="e.g. Month-end dispatch to Metro Cash & Carry." onChange={(e) => setL("reason", e.target.value)} /></Field>
            <CheckBox full label="Grant compensatory off instead of payment" disabled={pol ? !pol.allowCompOff : false} checked={log.isCompOff} onChange={(e) => setL("isCompOff", e.target.checked)} />
          </div>
          <div className="banner info mt"><Calculator /><div><b>Estimated amount: Rs {hourly !== null && hrs ? fmtNum(overtimeAmount(hrs, hourly, mult || 1, log.isCompOff)) : "—"}</b>
            <p>{hrs ? `${hrs} hrs × Rs ${hourly !== null ? fmtNum(hourly) : "—"} × ${mult || "—"}` : "Choose the employee, date and times"}{log.isCompOff ? " · comp-off is not paid" : ""}{rate?.policy?.monthlyCapHours ? ` · ${rate.usedThisMonth} of ${rate.policy.monthlyCapHours} hrs used this month` : ""}</p></div></div>
        </>}
      </Modal>

      {edit && (
        <RecordModal open wide onClose={() => setEdit(null)} busy={busy} title={edit.row ? "Overtime policy" : "New overtime policy"} subtitle="Changes apply from the next payroll run."
          history={edit.row ? { schema: "HumanResources", table: "OvertimePolicies", id: edit.row.id } : null} active={edit.row?.isActive}
          canSave={edit.row ? can.edit : can.create} canToggle={can.edit} canDelete={can.remove} saveLabel="Save policy" onSave={save}
          onToggle={() => edit.row && run(() => setOvertimePolicyActive(edit.row!.id, !edit.row!.isActive, edit.row!.rowVersion), edit.row.isActive ? "Policy deactivated" : "Policy activated")}
          onDelete={async () => { if (edit.row) await run(() => deleteOvertimePolicy(edit.row!.id, edit.row!.rowVersion), "Policy deleted"); }}
          deleteNote="Only a policy no overtime claim uses can be deleted.">
          <FormGrid cols={3}>
            <Field label="Policy name" required error={errs.name}><input value={f.name as string} maxLength={60} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Statute" error={errs.statuteNote}><input value={f.statuteNote as string} maxLength={120} onChange={(e) => set("statuteNote", e.target.value)} /></Field>
            <Field label="Effective from" error={errs.effectiveFrom}><input type="date" value={f.effectiveFrom as string} onChange={(e) => set("effectiveFrom", e.target.value)} /></Field>
            <Field label="Weekday multiplier" error={errs.weekdayMultiplier}>{num("weekdayMultiplier")}</Field>
            <Field label="Weekly off multiplier" error={errs.weeklyOffMultiplier}>{num("weeklyOffMultiplier")}</Field>
            <Field label="Public holiday multiplier" error={errs.holidayMultiplier}>{num("holidayMultiplier")}</Field>
            <Field label="Hourly rate basis" error={errs.hourlyRateBasis}><select value={f.hourlyRateBasis as string} onChange={(e) => set("hourlyRateBasis", e.target.value)}>{lookupOptions(lookups, "HourlyRateBasis", f.hourlyRateBasis as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Daily cap (hrs)" error={errs.dailyCapHours}>{num("dailyCapHours", { placeholder: "None" })}</Field>
            <Field label="Monthly cap (hrs)" error={errs.monthlyCapHours}>{num("monthlyCapHours", { placeholder: "None" })}</Field>
            <Field label="Min. minutes to count" error={errs.minMinutes}>{num("minMinutes")}</Field>
            <Field label="Rounding" error={errs.rounding}><select value={f.rounding as string} onChange={(e) => set("rounding", e.target.value)}>{lookupOptions(lookups, "Rounding", f.rounding as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Eligible up to grade" error={errs.eligibleUpToGradeId}><select value={f.eligibleUpToGradeId as string} onChange={(e) => set("eligibleUpToGradeId", e.target.value)}><option value="">All</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.code} ({g.name})</option>)}</select></Field>
            <CheckBox full label="Require pre-approval via ESS" checked={f.requiresPreApproval as boolean} onChange={(e) => set("requiresPreApproval", e.target.checked)} />
            <CheckBox full label="Allow compensatory off as alternative" checked={f.allowCompOff as boolean} onChange={(e) => set("allowCompOff", e.target.checked)} />
          </FormGrid>
          {edit.row && !edit.row.isActive && active && <p className={cn("small muted mt")}>Only one policy can be active: deactivate “{active.name}” before activating this one.</p>}
        </RecordModal>
      )}
    </>
  );
}
