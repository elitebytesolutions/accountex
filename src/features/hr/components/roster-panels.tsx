"use client";

import { ArrowLeftRight, CalendarClock, Check, ChevronLeft, ChevronRight, Copy, Hand, History, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { addDays, weekDays, weekStartOf, type AttendanceOptions, type OpenShiftItem, type RosterCell, type RosterShift, type RosterWeek, type SwapItem } from "@/shared";
import { Field } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { approveSwap, attendanceOptions, cancelOpenShift, decideOpenClaim, listOpenShifts, listSwaps, postOpenShift, publishRoster, rejectSwap, rosterWeek, saveRoster } from "../attendance-api";
import { dmy, dowShort, localToday, Person, stamp, StatusBadge } from "./attendance-ui";

/** WorkShiftColour → template roster badge tone (General green, Morning blue, Evening amber, Night violet). */
export const SHIFT_TONE: Record<string, string> = { TEAL: "good", GREEN: "good", BLUE: "info", AMBER: "warn", ORANGE: "warn", VIOLET: "violet", RED: "danger", GREY: "neutral" };
const h12 = (t: string) => String(Number(t.slice(0, 2)) % 12 || 12) + (t.slice(3, 5) !== "00" ? `:${t.slice(3, 5)}` : "");
export const shiftChip = (s: RosterShift | { code: string; startTime: string; endTime: string }) => `${s.code} ${h12(s.startTime)}–${h12(s.endTime)}`;
const range = (days: string[]) => `${dmy(days[0]!).slice(0, 6)} – ${dmy(days[6]!)}`;

export function RosterCellBadge({ cell, shifts }: { cell: { entryType: string; shiftId: string | null; isPublished?: boolean } | undefined; shifts: RosterShift[] }) {
  if (!cell) return <span className="muted">—</span>;
  const draft = cell.isPublished === false ? { style: { outline: "1px dashed var(--line-2)", outlineOffset: 2 }, title: "Draft — not published yet" } : {};
  if (cell.entryType === "OFF") return <span className="badge neutral" {...draft}>OFF</span>;
  if (cell.entryType === "LEAVE") return <span className="badge danger" {...draft}>LEAVE</span>;
  const s = shifts.find((x) => x.id === cell.shiftId);
  return <span className={`badge ${SHIFT_TONE[s?.colour ?? ""] ?? "info"}`} {...draft}>{s ? shiftChip(s) : "Shift"}</span>;
}

/** Template app/hr/shifts › Weekly roster: week navigation, department filter, copy last week, click a day to set it (draft until published). */
export function RosterPanel({ can, onWeek, refresh = 0 }: { can: { edit: boolean }; onWeek?: (w: RosterWeek | null, department: string) => void; refresh?: number }) {
  const toast = useToast();
  const [week, setWeek] = useState(weekStartOf(localToday()));
  const [department, setDepartment] = useState("");
  const [data, setData] = useState<RosterWeek | null>(null);
  const [opts, setOpts] = useState<AttendanceOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [menu, setMenu] = useState<{ el: HTMLElement; employeeId: string; date: string; cell?: RosterCell } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([rosterWeek({ week, department }), opts ? Promise.resolve(opts) : attendanceOptions()])
      .then(([d, o]) => { if (!cancelled) { setData(d); setOpts(o); setError(null); onWeek?.(d, department); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the roster" }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, week, department, refresh]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <div className="panel"><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div>;

  const save = async (entries: Record<string, unknown>[], republish: boolean, done: string) => {
    setBusy(true);
    try { await saveRoster(week, { entries, republish }); toast(done, { tone: "good" }); reload(); } catch (e) { toast(apiMessage(e, "Could not save the roster"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const copyLast = async () => {
    if (!data) return;
    const prev = await rosterWeek({ week: addDays(week, -7), department });
    const entries = prev.rows.flatMap((r) => Object.entries(r.cells).map(([d, c]) => ({ employeeId: r.employee.id, date: addDays(d, 7), entryType: c.entryType, shiftId: c.shiftId })))
      .filter((e) => data.rows.some((r) => r.employee.id === e.employeeId && !r.cells[e.date]));
    if (!entries.length) { toast("Nothing to copy: last week is empty or this week is already planned", { tone: "info" }); return; }
    await save(entries, false, `Last week's roster copied (${entries.length} days, draft)`);
  };
  const items = (): MenuItem[] => {
    if (!menu || !data) return [];
    const republish = !!menu.cell?.isPublished;
    const set = (entryType: string | null, shiftId: string | null = null) => { setMenu(null); void save([{ employeeId: menu.employeeId, date: menu.date, entryType, shiftId }], republish, republish ? "Day changed — republish the week" : "Roster day saved (draft)"); };
    return [
      ...data.shifts.map((s) => ({ label: `${s.name} (${shiftChip(s)})`, onClick: () => set("SHIFT", s.id) })),
      { label: "Off", onClick: () => set("OFF") }, { label: "Leave", onClick: () => set("LEAVE") },
      ...(menu.cell && !menu.cell.isPublished ? [{ sep: true } as const, { label: "Clear the day", danger: true, onClick: () => set(null) }] : []),
    ];
  };
  const days = data?.days ?? weekDays(week);
  const low = data && data.published + data.unpublished > 0 ? days.find((d) => data.rows.length && data.coverage[d]! < Math.ceil(data.rows.length / 2) && dowShort(d) !== "Sun") : null;
  const deptName = opts?.departments.find((d) => d.id === department)?.name ?? "All departments";

  return (
    <div className="panel flush">
      <div className="panel-head">
        <div><h3>Weekly roster</h3><p>{deptName} · {range(days)}{data?.unpublished ? ` · ${data.unpublished} draft day${data.unpublished === 1 ? "" : "s"}` : ""}</p></div>
        <div className="panel-actions">
          <button className="btn secondary sm icon" type="button" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft /></button>
          <button className="btn secondary sm icon" type="button" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><ChevronRight /></button>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department"><option value="">All departments</option>{opts?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          {can.edit && <button className="btn secondary sm" type="button" disabled={busy || !data} onClick={copyLast}><Copy />Copy last week</button>}
        </div>
      </div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Employee</th>{days.map((d) => <th key={d}>{dowShort(d)} {d.slice(8)}</th>)}<th className="num">Hrs</th></tr></thead>
        <tbody>
          {!data ? <tr><td colSpan={9}><Skeleton style={{ height: 140 }} /></td></tr> : data.rows.length ? data.rows.map((r) => (
            <tr key={r.employee.id}>
              <td><Person e={r.employee} sub={r.employee.designation ?? r.employee.code} /></td>
              {days.map((d) => (
                <td key={d}>{can.edit
                  ? <button type="button" className="link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} aria-label={`Set ${r.employee.name} on ${d}`} onClick={(e) => setMenu({ el: e.currentTarget, employeeId: r.employee.id, date: d, cell: r.cells[d] })}><RosterCellBadge cell={r.cells[d]} shifts={data.shifts} /></button>
                  : <RosterCellBadge cell={r.cells[d]} shifts={data.shifts} />}</td>
              ))}
              <td className="num">{r.hours}</td>
            </tr>
          )) : <tr><td colSpan={9}><EmptyState icon={<CalendarClock />} title="No employees" description="Employees of the department appear here to be rostered." /></td></tr>}
        </tbody>
      </table></div>
      <div className="table-foot"><div className="legend">{data?.shifts.map((s) => <span key={s.id}><i style={{ background: `var(--${SHIFT_TONE[s.colour] === "good" ? "primary" : SHIFT_TONE[s.colour] === "info" ? "blue" : SHIFT_TONE[s.colour] ?? "primary"})` }} />{s.name}</span>)}<span><i style={{ background: "var(--danger)" }} />Leave</span></div>
        <span className="small muted">{low ? `Coverage gap: ${dowShort(low)} ${low.slice(8)} (${data!.coverage[low]} on)` : data?.unpublished ? "Dashed days are drafts: publish the roster to show them in My Profile" : "All days published"}</span></div>
      {menu && <Menu anchor={menu.el} items={items()} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Swap requests for HR: the engine's current step decides who may approve (line manager, then HR). */
export function SwapsPanel({ can }: { can: { approve: boolean } }) {
  const toast = useToast();
  const [rows, setRows] = useState<SwapItem[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hist, setHist] = useState<SwapItem | null>(null);
  const [rej, setRej] = useState<{ s: SwapItem; reason: string } | null>(null);
  useEffect(() => { let c = false; listSwaps("ALL").then((r) => !c && setRows(r)).catch(() => !c && setRows([])); return () => { c = true; }; }, [attempt]);
  const run = async (w: () => Promise<unknown>, done: string) => { try { await w(); toast(done, { tone: "good" }); setRej(null); setAttempt((n) => n + 1); } catch (e) { toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); } };
  const live = rows?.filter((s) => ["REQUESTED", "ACCEPTED"].includes(s.status)).length ?? 0;
  return (
    <div className="panel flush mt">
      <div className="panel-head"><div><h3>Shift swaps</h3><p>{rows ? `${live} open · colleague accepts, then line manager and HR approve` : "Loading…"}</p></div></div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Swap</th><th>Requester</th><th>With</th><th>Date</th><th>Shifts</th><th>Reason</th><th>Status</th><th /></tr></thead>
        <tbody>
          {!rows ? <tr><td colSpan={8}><Skeleton style={{ height: 60 }} /></td></tr> : rows.length ? rows.slice(0, 20).map((s) => (
            <tr key={s.id}>
              <td><b>{s.docNo}</b><small>{stamp(s.createdAt)}</small></td><td><Person e={s.requester} /></td><td><Person e={s.counterpart} /></td><td className="nowrap">{dmy(s.swapDate)}</td>
              <td className="nowrap">{s.requesterShift ? shiftChip(s.requesterShift) : "—"} {s.swapMode === "SWAP" ? "⇄" : "→"} {s.counterpartShift ? shiftChip(s.counterpartShift) : "cover"}</td>
              <td>{s.reasonCategory.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}{s.reason ? <small>{s.reason}</small> : null}</td>
              <td><StatusBadge status={s.status} />{s.decisionReason && <small className="muted" style={{ display: "block" }}>{s.decisionReason}</small>}</td>
              <td className="actions">
                {s.status === "ACCEPTED" && (s.canAct || (can.approve && !s.approval)) && <>
                  <button className="icon-btn-sm" type="button" title="Approve" aria-label={`Approve ${s.docNo}`} onClick={() => run(() => approveSwap(s.id), `${s.docNo} approved · roster updated`)}><Check /></button>
                  <button className="icon-btn-sm" type="button" title="Reject" aria-label={`Reject ${s.docNo}`} onClick={() => setRej({ s, reason: "" })}><X /></button>
                </>}
                <button className="icon-btn-sm" type="button" title="History" aria-label={`History of ${s.docNo}`} onClick={() => setHist(s)}><History /></button>
              </td>
            </tr>
          )) : null}
        </tbody>
      </table></div>
      {/* below the table, not in a cell: a cell spans the scrolled table width and clips the text on a phone */}
      {rows && !rows.length && <EmptyState icon={<ArrowLeftRight />} title="No swap requests" description="Employees request swaps from My Profile › Shifts." />}
      <Modal open={!!hist} onClose={() => setHist(null)} title={hist ? `${hist.docNo} · history` : ""} wide>{hist && <HistoryTab schema="EmployeeSelfService" table="ShiftSwapRequests" id={hist.id} />}</Modal>
      <Modal open={!!rej} onClose={() => setRej(null)} title="Reject swap?" subtitle={rej ? `${rej.s.requester.name} ⇄ ${rej.s.counterpart.name} · ${dmy(rej.s.swapDate)}` : ""}
        foot={<><button className="btn secondary" type="button" onClick={() => setRej(null)}>Cancel</button><button className="btn danger" type="button" onClick={() => rej && run(() => rejectSwap(rej.s.id, rej.reason), `${rej.s.docNo} rejected`)}>Reject</button></>}>
        {rej && <Field label="Reason (shared with both)" required full><textarea rows={3} value={rej.reason} onChange={(e) => setRej({ ...rej, reason: e.target.value })} placeholder="e.g. Saturday dispatch is short-staffed; let's find another slot." /></Field>}
      </Modal>
    </div>
  );
}

const blankOpen = { shiftDate: "", shiftId: "", branchId: "", departmentId: "", title: "", perkText: "", allowanceAmount: "", overtimeMultiplier: "", slotsTotal: "1" };

/** Open shifts: HR posts extra shifts with slots; employees pick them up in My Profile; HR confirms (the roster follows). */
export function OpenShiftsPanel({ can }: { can: { edit: boolean } }) {
  const toast = useToast();
  const [rows, setRows] = useState<OpenShiftItem[] | null>(null);
  const [opts, setOpts] = useState<AttendanceOptions | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [f, setF] = useState<typeof blankOpen | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let c = false;
    Promise.all([listOpenShifts("ALL"), attendanceOptions()]).then(([r, o]) => { if (!c) { setRows(r); setOpts(o); } }).catch(() => !c && setRows([]));
    return () => { c = true; };
  }, [attempt]);
  const run = async (w: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await w(); toast(done, { tone: "good" }); setF(null); setAttempt((n) => n + 1); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof blankOpen, v: string) => { setF((x) => (x ? { ...x, [k]: v } : x)); setErrs((e) => ({ ...e, [k]: "" })); };
  return (
    <div className="panel flush mt">
      <div className="panel-head"><div><h3>Open shifts</h3><p>First come, first served · HR confirms each pick-up</p></div>
        <div className="panel-actions">{can.edit && <button className="btn ghost sm" type="button" onClick={() => { setErrs({}); setF({ ...blankOpen, shiftDate: addDays(localToday(), 1) }); }}><Plus />Post open shift</button>}</div></div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Shift</th><th>Date</th><th>Team</th><th>Perk</th><th className="num">Slots</th><th>Pick-ups</th><th>Status</th><th /></tr></thead>
        <tbody>
          {!rows ? <tr><td colSpan={8}><Skeleton style={{ height: 60 }} /></td></tr> : rows.length ? rows.slice(0, 20).map((o) => (
            <tr key={o.id}>
              <td><b>{o.title}</b><small>{o.code} · {shiftChip(o.shift)}</small></td><td className="nowrap">{dowShort(o.shiftDate)} {dmy(o.shiftDate)}</td>
              <td>{[o.department?.name, o.branch?.name].filter(Boolean).join(" · ") || "Everyone"}</td><td>{o.perkText ?? (o.allowanceAmount ? `+Rs ${o.allowanceAmount.toLocaleString("en-US")}` : "—")}</td>
              <td className="num">{o.slotsTaken} / {o.slotsTotal}</td>
              <td>{o.claims.length ? o.claims.map((c) => (
                <div key={c.id} className="row small" style={{ gap: 6 }}><span>{c.employee.name}</span><StatusBadge status={c.status} />
                  {can.edit && c.status === "REQUESTED" && <><button className="icon-btn-sm" type="button" title="Confirm" aria-label={`Confirm ${c.employee.name}`} disabled={busy} onClick={() => run(() => decideOpenClaim(c.id, "confirm"), `${c.employee.name} confirmed · roster updated`)}><Check /></button>
                    <button className="icon-btn-sm" type="button" title="Decline" aria-label={`Decline ${c.employee.name}`} disabled={busy} onClick={() => run(() => decideOpenClaim(c.id, "decline"), `${c.employee.name} declined`)}><X /></button></>}
                </div>)) : <span className="muted">None yet</span>}</td>
              <td><StatusBadge status={o.status} /></td>
              <td className="actions">{can.edit && ["OPEN", "FILLED"].includes(o.status) && <button className="btn ghost sm" type="button" disabled={busy} onClick={() => run(() => cancelOpenShift(o.id, o.rowVersion), `${o.code} cancelled`)}>Cancel</button>}</td>
            </tr>
          )) : null}
        </tbody>
      </table></div>
      {/* below the table, not in a cell: a cell spans the scrolled table width and clips the text on a phone */}
      {rows && !rows.length && <EmptyState icon={<Hand />} title="No open shifts" description="Post an extra shift with a perk; employees pick it up from My Profile › Shifts." />}
      <Modal open={!!f} onClose={() => setF(null)} title="Post open shift" subtitle="Offered to the team in My Profile › Shifts until the slots are taken." wide
        foot={<><button className="btn secondary" type="button" onClick={() => setF(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={() => f && run(() => postOpenShift({ ...f, allowanceAmount: f.allowanceAmount || null, overtimeMultiplier: f.overtimeMultiplier || null, branchId: f.branchId || null, departmentId: f.departmentId || null }), "Open shift posted")}>{busy ? "Posting…" : "Post shift"}</button></>}>
        {f && <div className="form-grid c3">
          <Field label="Title" required full error={errs.title}><input value={f.title} maxLength={120} placeholder="e.g. Quarterly stock count · Metro Thokar" onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Date" required error={errs.shiftDate}><input type="date" value={f.shiftDate} min={localToday()} onChange={(e) => set("shiftDate", e.target.value)} /></Field>
          <Field label="Shift" required error={errs.shiftId}><select value={f.shiftId} onChange={(e) => set("shiftId", e.target.value)}><option value="">Choose…</option>{opts?.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>)}</select></Field>
          <Field label="Slots" required error={errs.slotsTotal}><input type="number" min={1} max={100} value={f.slotsTotal} onChange={(e) => set("slotsTotal", e.target.value)} /></Field>
          <Field label="Department" error={errs.departmentId}><select value={f.departmentId} onChange={(e) => set("departmentId", e.target.value)}><option value="">Everyone</option>{opts?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Branch" error={errs.branchId}><select value={f.branchId} onChange={(e) => set("branchId", e.target.value)}><option value="">All branches</option>{opts?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Perk" error={errs.perkText}><input value={f.perkText} maxLength={120} placeholder="e.g. OT 1.5× · lunch provided" onChange={(e) => set("perkText", e.target.value)} /></Field>
          <Field label="Allowance (Rs)" error={errs.allowanceAmount}><input inputMode="decimal" value={f.allowanceAmount} onChange={(e) => set("allowanceAmount", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="OT multiplier" error={errs.overtimeMultiplier}><input inputMode="decimal" value={f.overtimeMultiplier} placeholder="—" onChange={(e) => set("overtimeMultiplier", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        </div>}
      </Modal>
    </div>
  );
}

/** Publishes the shown roster week (header "Publish roster"). */
export async function publishWeek(week: string, department: string) {
  return publishRoster(week, department || undefined);
}
