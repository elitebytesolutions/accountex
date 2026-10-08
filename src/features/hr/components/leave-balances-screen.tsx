"use client";

import Link from "next/link";
import { CalendarSync, Download, RefreshCw, Scale, Search, SlidersHorizontal, TriangleAlert, Undo2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import type { CompOffClaim, LeaveAdjustmentItem, LeaveBalanceRow, LeaveBalanceView, LeaveFormOptions, YearEndView } from "@/shared";
import { Check as CheckBox, Field } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { initialsOf } from "@/features/auth/initials";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { addAdjustment, closeYear, compOffClaims, leaveAdjustments, leaveBalances, leaveOptions, reverseYear, runAccrual, yearEnd } from "../lifecycle-api";
import { dmy, fmtNum, localToday, monthLabel, stamp } from "./attendance-ui";
import { days, shortName } from "./leave-ui";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fyLabel = (y: string) => `${y.slice(0, 4)}-${String((Number(y.slice(2, 4)) + 1) % 100).padStart(2, "0")}`;
const yRange = (y: string) => `${MON[Number(y.slice(5, 7)) - 1]} ${y.slice(0, 4)} – ${MON[(Number(y.slice(5, 7)) + 10) % 12]} ${Number(y.slice(0, 4)) + 1}`;
const KIND: Record<string, string> = { MANUAL: "Manual", ACCRUAL: "Accrual", OPENING: "Opening", CARRY_FORWARD: "Carry forward", ENCASHMENT: "Encashment", LAPSE: "Lapse", COMP_OFF: "Comp-off" };
const n0 = (v: number | undefined) => (v ? days(v) : null);

type AdjustForm = { employeeId: string; leaveTypeId: string; kind: string; direction: string; days: string; effectiveDate: string; reason: string; overtimeClaimId: string };

/** Template app/hr/leave/balances (50-hr-core.html): balance grid, adjust modal (+ comp-off from approved overtime), year-end carry modal; accrual run and the adjustments trail added. */
export function LeaveBalancesScreen({ can }: { can: { edit: boolean; approve: boolean } }) {
  const toast = useToast();
  const [year, setYear] = useState<string | undefined>(undefined);
  const [dept, setDept] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaveBalanceView | null>(null);
  const [opts, setOpts] = useState<LeaveFormOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [adjust, setAdjust] = useState<AdjustForm | null>(null);
  const [claims, setClaims] = useState<CompOffClaim[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [ye, setYe] = useState<YearEndView | null>(null);
  const [yeOpen, setYeOpen] = useState(false);
  const [yeForm, setYeForm] = useState({ encashmentTarget: "NEXT_PAYROLL", emailStatements: true });
  const [trail, setTrail] = useState<{ row: LeaveBalanceRow; items: LeaveAdjustmentItem[] | null } | null>(null);
  const [accrue, setAccrue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    leaveBalances({ year, search: q, departmentId: dept, filter, page, pageSize: 50 })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load balances" }));
    return () => { cancelled = true; };
  }, [attempt, year, q, dept, filter, page]);
  useEffect(() => { leaveOptions().then(setOpts).catch(() => undefined); }, []);
  useEffect(() => {
    let cancelled = false;
    (adjust?.kind === "COMP_OFF" && adjust.employeeId ? compOffClaims(adjust.employeeId) : Promise.resolve([])).then((c) => !cancelled && setClaims(c)).catch(() => !cancelled && setClaims([]));
    return () => { cancelled = true; };
  }, [adjust?.kind, adjust?.employeeId]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const types = data?.types ?? [];
  const paid = types.filter((t) => t.isPaid).slice(0, 3);
  const run = async <T,>(work: () => Promise<T>, done: (r: T) => string, after?: (r: T) => void) => {
    setBusy(true); setErrs({});
    try { const r = await work(); toast(done(r), { tone: "good" }); after?.(r); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const openYearEnd = async () => { setYeOpen(true); setYe(null); try { setYe(await yearEnd()); } catch (e) { toast(apiMessage(e, "Could not load the year-end preview"), { tone: "danger" }); } };
  const openTrail = async (row: LeaveBalanceRow) => { setTrail({ row, items: null }); try { setTrail({ row, items: await leaveAdjustments({ employeeId: row.employee.id }) }); } catch { setTrail({ row, items: [] }); } };
  const newAdjust = (row?: LeaveBalanceRow) => { setErrs({}); setAdjust({ employeeId: row?.employee.id ?? "", leaveTypeId: types[0]?.id ?? "", kind: "MANUAL", direction: "CREDIT", days: "1", effectiveDate: localToday(), reason: "", overtimeClaimId: "" }); };
  const cell = (r: LeaveBalanceRow, id: string) => r.cells[id];
  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;
  const ys = data?.yearStart ?? "";

  return (
    <>
      <PageHead eyebrow={<><Link className="link" href="/hr/leave">HR / Leave</Link> / Balances</>} title="Leave Balances"
        description={`Entitlement, availed and remaining days per employee · as of ${data ? dmy(data.today) : "today"}.`}
        actions={<>
          {can.edit && <button className="btn secondary" type="button" onClick={() => newAdjust()}><SlidersHorizontal />Adjust balance</button>}
          {can.edit && <button className="btn secondary" type="button" onClick={() => setAccrue(localToday().slice(0, 7))}><RefreshCw />Run accrual</button>}
          <button className="btn secondary" type="button" disabled={!data} onClick={() => data && downloadCsv(`Leave_balances_${fyLabel(ys)}.csv`, [["Employee", "Code", ...types.flatMap((t) => [`${t.code} entitled`, `${t.code} taken`, `${t.code} balance`])], ...data.rows.map((r) => [r.employee.name, r.employee.code, ...types.flatMap((t) => { const c = cell(r, t.id); return [String(c ? c.entitled + c.carriedIn + c.adjusted : 0), String(c?.used ?? 0), String(c?.balance ?? 0)]; })])])}><Download />Export</button>
          {can.approve && <button className="btn primary" type="button" onClick={openYearEnd}><CalendarSync />Year-end carry forward</button>}
        </>} />

      <div className="panel flush">
        <div className="panel-head"><div><h3>Balances by employee</h3><p>{ys ? `Leave year ${fyLabel(ys)} · as of ${dmy(data!.today)}` : ""}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search employee…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
          <select aria-label="Leave year" value={ys} onChange={(e) => { setYear(e.target.value); setPage(1); }}>{(data?.years ?? []).map((y) => <option key={y} value={y}>Leave year {fyLabel(y)}</option>)}</select>
          <select aria-label="Department" value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}><option value="">All departments</option>{opts?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <div className="chips">{[["ALL", "All", null], ["LOW", "Low balance", data?.counts.low], ["NEGATIVE", "Negative", data?.counts.negative]].map(([c, l, n]) => <button key={c as string} type="button" className={filter === c ? "active" : ""} onClick={() => { setFilter(c as string); setPage(1); }}>{l}{n != null && <> <i>{n}</i></>}</button>)}</div>
          <span className="spacer" />
          <span className="small muted">E = entitled · T = taken · B = balance</span>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead>
            <tr><th rowSpan={2}>Employee</th>{paid.map((t) => <th key={t.id} colSpan={3} className="right">{shortName(t)} ({days(t.daysPerYear)})</th>)}<th className="num" rowSpan={2}>Unpaid taken</th><th className="num" rowSpan={2}>Carry-fwd in</th><th className="num" rowSpan={2}>Encashable</th></tr>
            <tr>{paid.map((t) => <Fragment key={t.id}><th className="num">E</th><th className="num">T</th><th className="num">B</th></Fragment>)}</tr>
          </thead>
          <tbody>
            {!data ? <tr><td colSpan={4 + paid.length * 3}><Skeleton style={{ height: 200 }} /></td></tr> : data.rows.length ? data.rows.map((r) => (
              <tr key={r.employee.id} style={{ cursor: "pointer" }} onClick={() => openTrail(r)}>
                <td><div className="cell-user"><span className="avatar sm">{initialsOf(r.employee.name)}</span><div><b>{r.employee.name}</b><small>{r.employee.code}{r.employee.joiningDate > ys ? " · pro-rata" : ""}</small></div></div></td>
                {paid.map((t) => { const c = cell(r, t.id); const ent = c ? c.entitled + c.carriedIn + c.adjusted : 0; return <Fragment key={t.id}>
                  <td className={`num${ent ? "" : " zero"}`}>{n0(ent) ?? "—"}</td><td className={`num${c?.used ? "" : " zero"}`}>{n0(c?.used) ?? "—"}</td>
                  <td className={`num${c && c.balance < 0 ? " neg" : ""}`}><b>{days(c?.balance ?? 0)}</b></td></Fragment>; })}
                <td className={`num${r.unpaidTaken ? "" : " zero"}`}>{n0(r.unpaidTaken) ?? "—"}</td><td className={`num${r.carriedIn ? "" : " zero"}`}>{n0(r.carriedIn) ?? "—"}</td><td className={`num${r.encashable ? "" : " zero"}`}>{n0(r.encashable) ?? "—"}</td>
              </tr>
            )) : <tr><td colSpan={4 + paid.length * 3}><EmptyState icon={<Scale />} title="No balances" description="Run the accrual or add opening balances to start the year." /></td></tr>}
          </tbody>
        </table></div>
        <div className="table-foot"><span>{data ? `Showing ${data.rows.length} of ${data.total}${types.filter((t) => t.accrualMethod === "MONTHLY").map((t) => ` · ${shortName(t)} accrues ${t.accrualAmount ?? Math.round((t.daysPerYear / 12) * 100) / 100} days / month`).join("")}; new joiners pro-rated` : ""}</span>
          {pages > 1 && <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>)}<button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button></div>}
        </div>
      </div>

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title="Adjust leave balance" subtitle="Manual credit / debit with audit trail."
        foot={<><button className="btn secondary" type="button" onClick={() => setAdjust(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={() => adjust && run(() => addAdjustment({ ...adjust, overtimeClaimId: adjust.overtimeClaimId || null }), (r) => `Balance adjusted — ${r.employee.name}, ${r.direction === "CREDIT" ? "+" : "−"}${days(r.days)} ${shortName(r.leaveType)}`, () => setAdjust(null))}>Save adjustment</button></>}>
        {adjust && <div className="form-grid">
          <Field label="Employee" required full error={errs.employeeId}><select value={adjust.employeeId} onChange={(e) => setAdjust({ ...adjust, employeeId: e.target.value, overtimeClaimId: "" })}><option value="">Select employee…</option>{opts?.employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.code}</option>)}</select></Field>
          <Field label="Leave type" error={errs.leaveTypeId}><select value={adjust.leaveTypeId} onChange={(e) => setAdjust({ ...adjust, leaveTypeId: e.target.value })}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Kind" error={errs.kind}><select value={adjust.kind} onChange={(e) => setAdjust({ ...adjust, kind: e.target.value, direction: e.target.value === "MANUAL" ? adjust.direction : "CREDIT" })}><option value="MANUAL">Manual</option><option value="OPENING">Opening balance</option><option value="COMP_OFF">Comp-off (approved overtime)</option></select></Field>
          <Field label="Adjustment" error={errs.direction}><select value={adjust.direction} disabled={adjust.kind !== "MANUAL"} onChange={(e) => setAdjust({ ...adjust, direction: e.target.value })}><option value="CREDIT">Credit (+)</option><option value="DEBIT">Debit (−)</option></select></Field>
          <Field label="Days" error={errs.days}><input type="number" min={0.25} step={0.5} value={adjust.days} onChange={(e) => setAdjust({ ...adjust, days: e.target.value })} /></Field>
          {adjust.kind === "COMP_OFF" && <Field label="Overtime claim" required full error={errs.overtimeClaimId} hint={adjust.employeeId && !claims.length ? "No approved comp-off overtime waiting to be credited" : undefined}>
            <select value={adjust.overtimeClaimId} onChange={(e) => { const c = claims.find((x) => x.id === e.target.value); setAdjust({ ...adjust, overtimeClaimId: e.target.value, days: c ? String(c.suggestedDays) : adjust.days, reason: c && !adjust.reason ? `Comp-off for ${dmy(c.dateFrom)} (${c.docNo})` : adjust.reason }); }}>
              <option value="">Select claim…</option>{claims.map((c) => <option key={c.id} value={c.id}>{c.docNo} · {dmy(c.dateFrom)} · {c.hours} h</option>)}
            </select></Field>}
          <Field label="Effective date" error={errs.effectiveDate}><input type="date" value={adjust.effectiveDate} onChange={(e) => setAdjust({ ...adjust, effectiveDate: e.target.value })} /></Field>
          <Field label="Reason" required full error={errs.reason}><textarea rows={2} maxLength={500} value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} /></Field>
        </div>}
      </Modal>

      <Modal open={!!accrue} onClose={() => setAccrue(null)} title="Run accrual" subtitle="Credits each leave type's accrual (monthly, quarterly, upfront) for the month. Running it twice never credits twice."
        foot={<><button className="btn secondary" type="button" onClick={() => setAccrue(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy || !accrue} onClick={() => accrue && run(() => runAccrual(accrue), (r) => `Accrual for ${monthLabel(accrue)}: ${r.credited} credit${r.credited === 1 ? "" : "s"}${r.skipped ? `, ${r.skipped} already done` : ""}`, () => setAccrue(null))}><RefreshCw />Run accrual</button></>}>
        <div className="form-grid"><Field label="Month" required full><input type="month" value={accrue ?? ""} onChange={(e) => setAccrue(e.target.value)} /></Field></div>
      </Modal>

      <Modal open={yeOpen} onClose={() => setYeOpen(false)} wide title="Year-end carry forward" subtitle={ye ? `Close leave year ${fyLabel(ye.closingYearStart)} and open ${fyLabel(ye.openingYearStart)} balances.` : "Loading…"}
        foot={<><button className="btn secondary" type="button" disabled={!ye} onClick={() => ye && downloadCsv(`Year_end_${fyLabel(ye.closingYearStart)}.csv`, [["Leave type", "Unused", "Rule", "Carried", "Encashed", "Lapsed", "Encash amount"], ...ye.rows.map((r) => [r.leaveType.name, String(r.unused), r.rule, String(r.carry), String(r.encash), String(r.lapse), String(r.amount)])])}>Download preview</button><span className="spacer" />
          <button className="btn secondary" type="button" onClick={() => setYeOpen(false)}>Cancel</button>
          <button className="btn primary" type="button" disabled={busy || !ye || !!ye.closed || !ye.rows.length} onClick={() => ye && run(() => closeYear(ye.closingYearStart, yeForm), (r) => `Carry forward completed for ${r.closed?.employeesCount ?? 0} employees`, setYe)}>Run carry forward</button></>}>
        {!ye ? <Skeleton style={{ height: 220 }} /> : <>
          {ye.closed ? <div className="banner info mb"><CalendarSync /><div><b>Leave year {fyLabel(ye.closingYearStart)} is closed</b><p>Closed {stamp(ye.closed.completedAt)}{ye.closed.completedBy ? ` by ${ye.closed.completedBy.name}` : ""}: {days(ye.closed.daysCarried)} carried, {days(ye.closed.daysEncashed)} encashed, {days(ye.closed.daysLapsed)} lapsed.</p></div></div>
            : <div className="banner warn mb"><TriangleAlert /><div><b>This posts to {ye.employees} employee ledger{ye.employees === 1 ? "" : "s"}</b><p>Encashment amounts are paid through payroll: add them to the run as one-time earnings (Run payroll › Inputs).</p></div></div>}
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Leave type</th><th className="num">Unused days</th><th>Rule</th><th className="num">Carried fwd</th><th className="num">Encashed</th><th className="num">Lapsed</th><th className="num">Encash amount (Rs)</th></tr></thead>
            <tbody>
              {ye.rows.length ? ye.rows.map((r) => <tr key={r.leaveType.id}><td><b>{shortName(r.leaveType)}</b></td><td className="num">{days(r.unused)}</td><td>{r.rule}</td><td className={`num${r.carry ? "" : " zero"}`}>{n0(r.carry) ?? "—"}</td><td className={`num${r.encash ? "" : " zero"}`}>{n0(r.encash) ?? "—"}</td><td className={`num${r.lapse ? "" : " zero"}`}>{n0(r.lapse) ?? "—"}</td><td className={`num${r.amount ? "" : " zero"}`}>{r.amount ? fmtNum(r.amount) : "—"}</td></tr>)
                : <tr><td colSpan={7}><EmptyState icon={<Scale />} title="Nothing to close" description={`No unused balances in ${fyLabel(ye.closingYearStart)} (${yRange(ye.closingYearStart)}).`} /></td></tr>}
              {!!ye.rows.length && <tr className="total"><td>Total</td><td className="num">{days(ye.totals.unused)}</td><td /><td className="num">{days(ye.totals.carry)}</td><td className="num">{days(ye.totals.encash)}</td><td className="num">{days(ye.totals.lapse)}</td><td className="num">{fmtNum(ye.totals.amount)}</td></tr>}
            </tbody>
          </table></div>
          <div className="form-grid mt">
            <Field label="Closing year"><select value={ye.closingYearStart} onChange={async (e) => { try { setYe(await yearEnd(e.target.value)); } catch (x) { toast(apiMessage(x, "Could not load"), { tone: "danger" }); } }}>{[...new Set([ye.closingYearStart, ...(data?.years ?? [])])].sort().reverse().map((y) => <option key={y} value={y}>{fyLabel(y)} ({yRange(y)})</option>)}</select></Field>
            <Field label="Post encashment to"><select value={yeForm.encashmentTarget} onChange={(e) => setYeForm({ ...yeForm, encashmentTarget: e.target.value })}><option value="NEXT_PAYROLL">Next regular payroll</option><option value="OFF_CYCLE">Separate off-cycle run</option></select></Field>
            <CheckBox full label="Email balance statement to each employee" checked={yeForm.emailStatements} onChange={(e) => setYeForm({ ...yeForm, emailStatements: e.target.checked })} />
          </div>
          {ye.closings.length > 0 && <>
            <div className="form-section"><h4>Closings</h4></div>
            <div className="list">{ye.closings.map((c) => (
              <div className="list-item" key={c.id}><div><b>{fyLabel(c.closingYearStart)}</b><small>{c.status === "DRAFT" ? "Draft" : `${stamp(c.completedAt)} · ${days(c.daysCarried)} carried · ${days(c.daysEncashed)} encashed · ${days(c.daysLapsed)} lapsed`}</small></div><span className="spacer" />
                <span className={`badge ${c.status === "COMPLETED" ? "good" : "neutral"}`}>{c.status === "COMPLETED" ? "Completed" : c.status === "REVERSED" ? "Reversed" : "Draft"}</span>
                {c.status === "COMPLETED" && <button className="btn ghost sm" type="button" disabled={busy} onClick={() => run(() => reverseYear(c.id, "Reversed from Leave Balances", c.rowVersion), () => `Year-end ${fyLabel(c.closingYearStart)} reversed`, setYe)}><Undo2 />Reverse</button>}
              </div>
            ))}</div>
          </>}
        </>}
      </Modal>

      <Drawer open={!!trail} onClose={() => setTrail(null)} title={trail ? `${trail.row.employee.name} · ${trail.row.employee.code}` : ""} subtitle={ys ? `Leave year ${fyLabel(ys)} · balances and adjustments trail` : ""}
        foot={<><span className="spacer" />{can.edit && trail && <button className="btn secondary" type="button" onClick={() => { const r = trail.row; setTrail(null); newAdjust(r); }}><SlidersHorizontal />Adjust</button>}<button className="btn secondary" type="button" onClick={() => setTrail(null)}>Close</button></>}>
        {trail && <>
          <div className="dl">{types.map((t) => { const c = trail.row.cells[t.id]; return c ? <div key={t.id}><span>{shortName(t)}</span><b>{days(c.balance)} balance · {days(c.available)} available (entitled {days(c.entitled)}, carried {days(c.carriedIn)}, adjusted {days(c.adjusted)}, used {days(c.used)}, booked {days(c.booked)}){c.carriedExpiresOn ? ` · carried days expire ${dmy(c.carriedExpiresOn)}` : ""}</b></div> : null; })}</div>
          <div className="form-section"><h4>Adjustments</h4></div>
          {!trail.items ? <Skeleton style={{ height: 120 }} /> : trail.items.length ? (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Date</th><th>Type</th><th>Kind</th><th className="num">Days</th><th>Reason</th><th>By</th></tr></thead>
              <tbody>{trail.items.map((a) => <tr key={a.id}><td className="nowrap">{dmy(a.effectiveDate)}</td><td>{shortName(a.leaveType)}</td><td>{KIND[a.kind] ?? a.kind}{a.overtimeClaim ? ` · ${a.overtimeClaim.docNo}` : ""}</td><td className={`num${a.direction === "DEBIT" ? " neg" : ""}`}>{a.direction === "DEBIT" ? "−" : "+"}{days(a.days)}</td><td>{a.reason}</td><td className="nowrap">{a.createdBy?.name ?? "system"}<small className="muted" style={{ display: "block" }}>{stamp(a.createdAt)}</small></td></tr>)}</tbody>
            </table></div>
          ) : <EmptyState icon={<Scale />} title="No adjustments" description="Accruals, carry forwards and manual adjustments appear here." />}
        </>}
      </Drawer>
    </>
  );
}
