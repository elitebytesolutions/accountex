"use client";

import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, Hourglass, Plane, Plus, Scale, Settings2, Thermometer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LeaveFormOptions, LeaveOverview, LeaveRequestDetail } from "@/shared";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { initialsOf } from "@/features/auth/initials";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { getLeave, leaveOptions, leaveOverview } from "../lifecycle-api";
import { dowShort, monthLabel, shiftMonth } from "./attendance-ui";
import { ApplyOnBehalfModal, COLOUR_VAR, days, dm, LeaveBadge, LeaveDrawer, leaveRange, shortName, STAGE_LABEL, toneOf } from "./leave-ui";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const my = (d: string) => `${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const short = (n: string) => { const [a, b] = n.split(" "); return b ? `${a} ${b[0]}.` : a!; };
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Template app/hr/leave (50-hr-core.html): KPIs, leave calendar, who's out today, usage by type, pending approvals, apply on behalf. */
export function LeaveOverviewScreen({ can }: { can: { create: boolean; approve: boolean } }) {
  const toast = useToast();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [dept, setDept] = useState("");
  const [data, setData] = useState<LeaveOverview | null>(null);
  const [opts, setOpts] = useState<LeaveFormOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [apply, setApply] = useState(false);
  const [open, setOpen] = useState<LeaveRequestDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    leaveOverview({ month, departmentId: dept })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load leave" }));
    return () => { cancelled = true; };
  }, [attempt, month, dept]);
  useEffect(() => { leaveOptions().then(setOpts).catch(() => undefined); }, []);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const show = async (id: string) => { try { setOpen(await getLeave(id)); } catch (e) { toast(apiMessage(e, "Could not open the request"), { tone: "danger" }); } };
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const m = data?.month ?? "";
  const first = m ? `${m}-01` : "";
  const lead = first ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const dim = m ? new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate() : 0;
  const cells: { date: string; muted: boolean }[] = [];
  for (let i = lead; i > 0; i--) cells.push({ date: addDay(first, -i), muted: true });
  for (let d = 0; d < dim; d++) cells.push({ date: addDay(first, d), muted: false });
  while (cells.length % 7) cells.push({ date: addDay(cells.at(-1)!.date, 1), muted: true });
  const maxUse = Math.max(1, ...(data?.usage.map((u) => u.days) ?? [1]));
  const legend = [...new Map((data?.calendar ?? []).map((c) => [c.leaveType.id, c.leaveType])).values()];

  return (
    <>
      <PageHead eyebrow="HR / Leave" title="Leave Overview"
        description={data ? `Leave year ${my(data.yearStart)} – ${my(addDay(data.yearEnd, -1))} · ${data.typesCount} leave types · ${data.routeNote}.` : "Leave across the company."}
        actions={<>
          <Link className="btn secondary" href="/hr/leave/balances"><Scale />Balances</Link>
          <Link className="btn secondary" href="/hr/leave/policies"><Settings2 />Policies</Link>
          {can.create && <button className="btn primary" type="button" onClick={() => setApply(true)}><Plus />Apply on behalf</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi blue"><div className="kpi-top"><span>On leave today</span><span className="icon-well"><Plane /></span></div><strong>{data?.kpis.onLeaveToday ?? "—"}</strong><small>{data && data.kpis.workforce ? `${Math.round((data.kpis.onLeaveToday / data.kpis.workforce) * 1000) / 10}% of workforce` : ""}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Pending approvals</span><span className="icon-well"><Hourglass /></span></div><strong>{data?.kpis.pending ?? "—"}</strong><small>{data ? `${data.kpis.pendingHr} awaiting HR` : ""}</small></div>
        <div className="kpi"><div className="kpi-top"><span>Days taken (FY YTD)</span><span className="icon-well"><CalendarCheck /></span></div><strong>{data ? days(data.kpis.daysTaken).toLocaleString() : "—"}</strong><small>{data ? `Avg. ${data.kpis.avgPerEmployee} per employee` : ""}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Unplanned (sick + unpaid)</span><span className="icon-well"><Thermometer /></span></div><strong>{data?.kpis.unplannedPct != null ? `${data.kpis.unplannedPct}%` : "—"}</strong><small>Share of days taken</small></div>
      </div>

      <div className="split mb">
        <div className="panel">
          <div className="panel-head">
            <div><h3>Leave calendar — {m ? monthLabel(m) : ""}</h3><p>Approved and pending leave across the company</p></div>
            <div className="panel-actions">
              <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{opts?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <button className="btn secondary sm icon" type="button" aria-label="Previous month" disabled={!m} onClick={() => setMonth(shiftMonth(m, -1))}><ChevronLeft /></button>
              <button className="btn secondary sm icon" type="button" aria-label="Next month" disabled={!m} onClick={() => setMonth(shiftMonth(m, 1))}><ChevronRight /></button>
            </div>
          </div>
          {!data ? <Skeleton style={{ height: 420 }} /> : <>
            <div className="cal">
              <div className="cal-head">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}</div>
              {cells.map((c) => {
                const evs = c.muted ? [] : data.calendar.filter((x) => x.fromDate <= c.date && x.toDate >= c.date);
                return (
                  <div key={c.date} className={`cal-day${c.muted ? " muted" : ""}${c.date === data.today ? " today" : ""}`} title={dowShort(c.date)}>
                    <b>{Number(c.date.slice(8))}</b>
                    {evs.slice(0, 6).map((x) => <em key={x.id} className={`ev ${x.status === "PENDING" ? "warn" : toneOf(x.leaveType)}`} style={{ cursor: "pointer" }} onClick={() => show(x.id)}>{short(x.employee)}{x.status === "PENDING" ? " (pending)" : ""}</em>)}
                    {evs.length > 6 && <em className="ev">+{evs.length - 6}</em>}
                  </div>
                );
              })}
            </div>
            <div className="legend mt">{legend.map((t) => <span key={t.id}><i style={{ background: COLOUR_VAR[t.colour] ?? "var(--muted)" }} />{shortName(t)}</span>)}<span><i style={{ background: "var(--warn)" }} />Pending</span></div>
          </>}
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Who&apos;s out today</h3><p>{data ? `${dowShort(data.today)}, ${dm(data.today)} ${data.today.slice(0, 4)}` : ""}</p></div></div>
            {!data ? <Skeleton style={{ height: 160 }} /> : data.outToday.length ? (
              <div className="list">
                {data.outToday.slice(0, 7).map((o) => (
                  <div className="list-item" key={`${o.employee.id}${o.fromDate}`}><span className="avatar sm">{initialsOf(o.employee.name)}</span><div><b>{o.employee.name}</b><small>{[o.employee.department, o.employee.branch].filter(Boolean).join(" · ")} · {o.duration !== "FULL" ? `half day (${o.duration === "HALF_AM" ? "AM" : "PM"})` : o.toDate === data.today ? "today only" : `back ${dm(addDay(o.toDate, 1))}`}</small></div><span className="spacer" /><LeaveBadge t={o.leaveType} /></div>
                ))}
              </div>
            ) : <EmptyState icon={<Plane />} title="Nobody is out today" description="Approved leave covering today shows here." />}
            {data && data.outToday.length > 7 && <Link className="btn ghost sm mt" href="/hr/leave/requests">+{data.outToday.length - 7} more · view all</Link>}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Usage by leave type</h3><p>Days taken, FY YTD</p></div></div>
            {!data ? <Skeleton style={{ height: 160 }} /> : (
              <div className="stack">
                {data.usage.map((u) => (
                  <div key={u.leaveType.id}><div className="row small"><b>{shortName(u.leaveType)}</b><span className="spacer" />{days(u.days)} days</div><div className={`progress ${u.leaveType.category === "SICK" ? "warn" : u.leaveType.category === "UNPAID" ? "danger" : ""}`}><i style={{ width: `${Math.round((u.days / maxUse) * 100)}%` }} /></div></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Pending approvals</h3><p>Oldest first</p></div><div className="panel-actions"><Link className="btn ghost sm" href="/hr/leave/requests">All requests</Link></div></div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Employee</th><th>Type</th><th>From – To</th><th className="num">Days</th><th>Balance after</th><th>Stage</th><th /></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={7}><Skeleton style={{ height: 100 }} /></td></tr> : data.pending.length ? data.pending.map((p) => (
              <tr key={p.id}>
                <td><div className="cell-user"><span className="avatar sm">{initialsOf(p.employee.name)}</span><div><b>{p.employee.name}</b><small>{p.employee.code}{p.employee.department ? ` · ${p.employee.department}` : ""}</small></div></div></td>
                <td><LeaveBadge t={p.leaveType} /></td><td className="nowrap">{leaveRange(p)} {p.toDate.slice(0, 4)}</td><td className="num">{days(p.days)}</td>
                <td>{p.balanceOf && p.leaveType.isPaid ? `${days(p.balanceOf.available)} of ${days(p.balanceOf.entitled)}` : "—"}</td>
                <td><span className="badge warn dot" title={p.waitingOn ?? undefined}>{STAGE_LABEL[p.stage] ?? p.stage}</span></td>
                <td className="actions"><button className="btn primary sm" type="button" onClick={() => show(p.id)}>Review</button></td>
              </tr>
            )) : <tr><td colSpan={7}><EmptyState icon={<Hourglass />} title="Nothing waiting" description="Requests employees file from My Profile › Leave appear here until they are decided." /></td></tr>}
          </tbody>
        </table></div>
      </div>

      {apply && <ApplyOnBehalfModal open={apply} onClose={() => setApply(false)} options={opts} onDone={reload} />}
      <LeaveDrawer key={open?.id ?? "none"} open={open} onClose={() => setOpen(null)} onChanged={(r) => { setOpen(r); reload(); }} canCancel={can.approve} />
    </>
  );
}
