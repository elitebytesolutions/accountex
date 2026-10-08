"use client";

import { CalendarClock, Pencil, Plus, Send, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { shiftSpanHours, type Shift } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createShift, deleteShift, listShifts, makeShiftDefault, setShiftActive, updateShift } from "../api";
import { RecordModal } from "./record-modal";
import { OpenShiftsPanel, publishWeek, RosterPanel, SwapsPanel } from "./roster-panels";
import type { RosterWeek } from "@/shared";

type Can = { create: boolean; edit: boolean; remove: boolean };
const LOOKUPS = ["WorkShiftColour", "WeeklyOff", "Season"];
const COLOUR: Record<string, string> = { TEAL: "var(--primary)", GREEN: "var(--good)", BLUE: "var(--blue)", AMBER: "var(--warn)", ORANGE: "var(--orange)", VIOLET: "var(--violet)", RED: "var(--danger)", GREY: "var(--muted-2)" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const blank: Record<string, string | boolean> = {
  name: "", code: "", description: "", colour: "TEAL", startTime: "10:00", endTime: "19:00", graceMinutes: "15", breakStart: "14:00", breakEnd: "15:00",
  halfDayBelowHours: "4", lateMarksPerHalfDay: "3", weeklyOff: "SUNDAY", overtimeAfterMinutes: "30", fridayExtendedBreak: true, fridayBreakEnd: "",
  prayerBreakNote: "", isSeasonal: false, season: "", validFrom: "", validTo: "",
};
const fromShift = (s: Shift): Record<string, string | boolean> => ({
  name: s.name, code: s.code, description: s.description ?? "", colour: s.colour, startTime: s.startTime, endTime: s.endTime, graceMinutes: String(s.graceMinutes),
  breakStart: s.breakStart ?? "", breakEnd: s.breakEnd ?? "", halfDayBelowHours: s.halfDayBelowHours?.toString() ?? "", lateMarksPerHalfDay: s.lateMarksPerHalfDay?.toString() ?? "",
  weeklyOff: s.weeklyOff, overtimeAfterMinutes: String(s.overtimeAfterMinutes), fridayExtendedBreak: s.fridayExtendedBreak, fridayBreakEnd: s.fridayBreakEnd ?? "",
  prayerBreakNote: s.prayerBreakNote ?? "", isSeasonal: s.isSeasonal, season: s.season ?? "", validFrom: s.validFrom ?? "", validTo: s.validTo ?? "",
});

/** Template app/hr/shifts (50-hr-core.html): shift definitions and the "New shift" modal, the weekly roster (Phase 30) with swaps and open shifts. */
export function ShiftsScreen({ can, canDelete, canPublish = false }: { can: Can; canDelete: boolean; canPublish?: boolean }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [rows, setRows] = useState<Shift[] | null>(null);
  const assigned = rows?.reduce((n, x) => n + x.employees, 0) ?? 0;
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<Shift | "new" | null>(null);
  const [f, setF] = useState<Record<string, string | boolean>>(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<{ week: RosterWeek | null; department: string; n: number }>({ week: null, department: "", n: 0 });

  useEffect(() => {
    let cancelled = false;
    listShifts().then((r) => { if (!cancelled) { setRows(r); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load shifts" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const s = (k: string) => String(f[k] ?? "");
  const b = (k: string) => Boolean(f[k]);
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const open = (r: Shift | "new") => { setErrs({}); setF(r === "new" ? blank : fromShift(r)); setEdit(r); };
  const row = edit && edit !== "new" ? edit : null;
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setEdit(null); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the shift"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => {
    const body = { ...f, season: b("isSeasonal") ? s("season") : "", fridayBreakEnd: b("fridayExtendedBreak") ? s("fridayBreakEnd") : "" };
    return run(() => (row ? updateShift(row.id, { ...body, rowVersion: row.rowVersion }) : createShift(body)), row ? `${s("name")} saved` : "Shift created");
  };
  const brk = (x: Shift) => (x.breakStart ? `${x.breakStart} – ${x.breakEnd}${x.fridayExtendedBreak ? ` (Fri ${x.breakStart} – ${x.fridayBreakEnd ?? x.breakEnd})` : ""}` : x.prayerBreakNote ? `None (${x.prayerBreakNote})` : "None");
  const monthYear = (d: string | null) => (d ? `${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "");
  const span = s("startTime") && s("endTime") && s("startTime") !== s("endTime") ? shiftSpanHours(s("startTime"), s("endTime")) : null;

  return (
    <>
      <PageHead eyebrow="HR / Attendance" title="Shifts & Roster" description="Shift timings, grace rules and the weekly duty roster."
        actions={<>
          {canPublish && <button className="btn secondary" type="button" disabled={busy || !roster.week?.unpublished} title={roster.week?.unpublished ? undefined : "Nothing to publish this week"} onClick={() => roster.week && run(() => publishWeek(roster.week!.weekStart, roster.department), "Roster published to My Profile").then(() => setRoster((r) => ({ ...r, n: r.n + 1 })))}><Send />Publish roster</button>}
          {can.create && <button className="btn primary" type="button" onClick={() => open("new")}><Plus />New shift</button>}
        </>} />
      <div className="panel flush mb">
        <div className="panel-head"><div><h3>Shift definitions</h3><p>{rows ? `${rows.length} shift${rows.length === 1 ? "" : "s"} · ${assigned} employee${assigned === 1 ? "" : "s"} assigned` : "Loading…"}</p></div></div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Shift</th><th>Code</th><th>Timing</th><th className="num">Hours</th><th className="num">Grace (min)</th><th>Break</th><th>Half-day after</th><th>Weekly off</th><th className="num">Employees</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!rows ? <tr><td colSpan={11}><Skeleton style={{ height: 120 }} /></td></tr> : rows.length ? rows.map((x) => (
              <tr key={x.id} className={cn(x.status !== "ACTIVE" && "muted")}>
                <td><b><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: COLOUR[x.colour] ?? "var(--primary)", marginRight: 6 }} />{x.name}</b><small>{x.isDefault ? `Default${x.description ? ` — ${x.description.replace(/^Default — /, "")}` : ""}` : x.description ?? ""}</small></td>
                <td>{x.code}</td>
                <td className="nowrap">{x.startTime} – {x.endTime}{x.crossesMidnight && <> <span className="badge neutral">+1 day</span></>}</td>
                <td className="num">{x.scheduledHours.toFixed(1)}</td>
                <td className="num">{x.graceMinutes}</td>
                <td>{brk(x)}</td>
                <td>{x.halfDayBelowHours ? `${x.halfDayBelowHours} hrs` : "—"}</td>
                <td>{labelOf(lookups, "WeeklyOff", x.weeklyOff)}</td>
                <td className="num">{x.employees}</td>
                <td>{x.status !== "ACTIVE" ? <span className="badge neutral">Inactive</span> : x.isSeasonal ? <span className="badge neutral">Seasonal{x.validFrom ? ` · ${monthYear(x.validFrom)}` : ""}</span> : <span className="badge good">Active</span>}</td>
                <td className="actions"><button className="icon-btn-sm" type="button" aria-label={`Edit ${x.name}`} onClick={() => open(x)}><Pencil /></button></td>
              </tr>
            )) : <tr><td colSpan={11}><EmptyState icon={<CalendarClock />} title="No shifts yet" description={can.create ? "Add your first shift; it becomes the company default." : "Shifts HR adds appear here."} /></td></tr>}
          </tbody>
        </table></div>
      </div>

      <RosterPanel refresh={roster.n} can={{ edit: can.edit }} onWeek={(w, department) => setRoster((r) => ({ ...r, week: w, department }))} />
      <SwapsPanel can={{ approve: canPublish }} />
      <OpenShiftsPanel can={{ edit: can.edit }} />

      {edit && (
        <RecordModal open wide onClose={() => setEdit(null)} busy={busy} title={row ? `Edit ${row.name}` : "New shift"} subtitle="Grace, break and half-day rules drive late marks and payroll deductions."
          history={row ? { schema: "HumanResources", table: "WorkShifts", id: row.id } : null} active={row?.status === "ACTIVE"}
          canSave={row ? can.edit : can.create} canToggle={can.edit} canDelete={canDelete} saveLabel={row ? "Save" : "Create shift"}
          onSave={save} onToggle={() => row && run(() => setShiftActive(row.id, row.status !== "ACTIVE", row.rowVersion), `${row.name} ${row.status === "ACTIVE" ? "deactivated" : "activated"}`)}
          onDelete={async () => { if (row) await run(() => deleteShift(row.id, row.rowVersion), `${row.name} deleted`); }} deleteNote="Shifts used by employees, rosters or attendance can only be deactivated; the default shift can't be deleted.">
          <div className="form-grid c3">
            <Field label="Shift name" required error={errs.name}><input value={s("name")} maxLength={60} placeholder="e.g. Retail Counter" onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Code" required error={errs.code}><input value={s("code")} maxLength={6} placeholder="RTL" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Colour" error={errs.colour}><select value={s("colour")} onChange={(e) => set("colour", e.target.value)}>{lookupOptions(lookups, "WorkShiftColour", s("colour")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Start time" required error={errs.startTime}><input type="time" value={s("startTime")} onChange={(e) => set("startTime", e.target.value)} /></Field>
            <Field label="End time" required error={errs.endTime} hint={span !== null ? `${span} hrs${s("endTime") < s("startTime") ? " · crosses midnight" : ""}` : undefined}><input type="time" value={s("endTime")} onChange={(e) => set("endTime", e.target.value)} /></Field>
            <Field label="Grace (minutes)" error={errs.graceMinutes}><input type="number" min={0} max={240} value={s("graceMinutes")} onChange={(e) => set("graceMinutes", e.target.value)} /></Field>
            <Field label="Break start" error={errs.breakStart}><input type="time" value={s("breakStart")} onChange={(e) => set("breakStart", e.target.value)} /></Field>
            <Field label="Break end" error={errs.breakEnd}><input type="time" value={s("breakEnd")} onChange={(e) => set("breakEnd", e.target.value)} /></Field>
            <Field label="Half-day if worked less than (hrs)" error={errs.halfDayBelowHours}><input type="number" min={0.5} step={0.5} value={s("halfDayBelowHours")} onChange={(e) => set("halfDayBelowHours", e.target.value)} /></Field>
            <Field label="Late marks for ½-day deduction" error={errs.lateMarksPerHalfDay}><input type="number" min={1} value={s("lateMarksPerHalfDay")} onChange={(e) => set("lateMarksPerHalfDay", e.target.value)} /></Field>
            <Field label="Weekly off" error={errs.weeklyOff}><select value={s("weeklyOff")} onChange={(e) => set("weeklyOff", e.target.value)}>{lookupOptions(lookups, "WeeklyOff", s("weeklyOff")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Overtime starts after (min)" error={errs.overtimeAfterMinutes}><input type="number" min={0} value={s("overtimeAfterMinutes")} onChange={(e) => set("overtimeAfterMinutes", e.target.value)} /></Field>
            <Check full label="Extended Friday break for Jumu'ah prayer" checked={b("fridayExtendedBreak")} onChange={(e) => set("fridayExtendedBreak", e.target.checked)} />
            {b("fridayExtendedBreak") && <Field label="Friday break ends" error={errs.fridayBreakEnd}><input type="time" value={s("fridayBreakEnd")} onChange={(e) => set("fridayBreakEnd", e.target.value)} /></Field>}
            <Field label="Prayer break note" error={errs.prayerBreakNote}><input value={s("prayerBreakNote")} maxLength={120} placeholder="e.g. Zuhr 13:15 – 13:35" onChange={(e) => set("prayerBreakNote", e.target.value)} /></Field>
            <Field label="Description" error={errs.description}><input value={s("description")} maxLength={120} placeholder="e.g. Warehouse & dispatch" onChange={(e) => set("description", e.target.value)} /></Field>
            <Check full label="Seasonal shift (e.g. Ramzan timings)" checked={b("isSeasonal")} onChange={(e) => set("isSeasonal", e.target.checked)} />
            {b("isSeasonal") && <>
              <Field label="Season" required error={errs.season}><select value={s("season")} onChange={(e) => set("season", e.target.value)}><option value="">Choose…</option>{lookupOptions(lookups, "Season", s("season")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
              <Field label="From" error={errs.validFrom}><input type="date" value={s("validFrom")} onChange={(e) => set("validFrom", e.target.value)} /></Field>
              <Field label="To" error={errs.validTo}><input type="date" value={s("validTo")} onChange={(e) => set("validTo", e.target.value)} /></Field>
            </>}
            {row && !row.isDefault && can.edit && row.status === "ACTIVE" && (
              <div className="full"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(() => makeShiftDefault(row.id, row.rowVersion), `${row.name} is now the default shift`)}><Star />Make this the default shift</button></div>
            )}
          </div>
        </RecordModal>
      )}
    </>
  );
}
