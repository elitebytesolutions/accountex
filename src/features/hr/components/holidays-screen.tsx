"use client";

import {
  BookOpen, CalendarDays, CalendarSync, ChevronLeft, ChevronRight, Download, Flag, Gift, Info, Landmark, Moon, MoonStar, PartyPopper, Plus, Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Holiday, HrFormOptions, Shift } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, lookupOptions, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createHoliday, deleteHoliday, hrBranches, listHolidays, listShifts, setHolidayStatus, updateHoliday } from "../api";
import { RecordModal } from "./record-modal";

type Can = { create: boolean; edit: boolean; remove: boolean };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OFF_DAYS: Record<string, number[]> = { SUNDAY: [0], FRIDAY: [5], SATURDAY_SUNDAY: [6, 0], ROTATING: [] };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const fyOf = (s: string) => { const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)); return m >= 7 ? y : y - 1; };
const longDate = (s: string) => { const d = utc(s); return `${DOW[d.getUTCDay()]}, ${s.slice(8, 10)} ${MON[d.getUTCMonth()]} ${s.slice(0, 4)}`; };
const rangeText = (h: Holiday) => (h.fromDate === h.toDate ? longDate(h.fromDate) : `${DOW[utc(h.fromDate).getUTCDay()]} ${h.fromDate.slice(8, 10)} – ${DOW[utc(h.toDate).getUTCDay()]} ${h.toDate.slice(8, 10)} ${MON[utc(h.toDate).getUTCMonth()]} ${h.toDate.slice(0, 4)}`);
const evTone = (h: Holiday) => (h.holidayType === "OPTIONAL" ? "violet" : h.holidayType === "PUBLIC" ? "good" : "info");
function HolidayIcon({ h }: { h: Holiday }) {
  if (h.isMoonDependent) return h.status === "OBSERVED" ? <MoonStar /> : <Moon />;
  if (h.holidayType === "OPTIONAL") return h.name.toLowerCase().includes("christmas") ? <Gift /> : <Sparkles />;
  if (h.holidayType !== "PUBLIC") return <PartyPopper />;
  if (/iqbal/i.test(h.name)) return <BookOpen />;
  if (/quaid/i.test(h.name)) return <Landmark />;
  return <Flag />;
}

/** Template app/hr/holidays (50-hr-core.html): KPIs, month calendar with weekly offs, the year's list and the add-holiday modal. */
export function HolidaysScreen({ can, canDelete }: { can: Can; canDelete: boolean }) {
  const toast = useToast();
  const lookups = useLookups(["HolidayType", "HolidayStatus", "WeeklyOff"]);
  const [all, setAll] = useState<Holiday[] | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [branches, setBranches] = useState<HrFormOptions["branches"]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [mode, setMode] = useState<"month" | "year">("month");
  const [branch, setBranch] = useState("");
  const [edit, setEdit] = useState<Holiday | "new" | null>(null);
  const [f, setF] = useState<Record<string, string | boolean | string[]>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listHolidays(), listShifts(), hrBranches()])
      .then(([h, s, b]) => { if (!cancelled) { setAll(h); setShifts(s); setBranches(b); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load holidays" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const today = todayIso();
  const holidays = useMemo(() => (all ?? []).filter((h) => !branch || h.appliesToAllBranches || h.branches.some((b) => b.id === branch)), [all, branch]);
  // The next day off for everyone: optional holidays are skipped, as in the template (Iqbal Day, not Diwali).
  const next = holidays.find((h) => h.toDate >= today && h.status !== "CANCELLED" && h.holidayType !== "OPTIONAL") ?? null;
  // The calendar opens on the month of the next holiday (the template shows the coming holiday month).
  const month = cursor ?? (next ? `${next.fromDate.slice(0, 7)}-01` : `${today.slice(0, 7)}-01`);
  const fy = fyOf(month);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const inFy = holidays.filter((h) => fyOf(h.fromDate) === fy);
  const live = inFy.filter((h) => h.status !== "CANCELLED");
  const pub = live.filter((h) => h.holidayType === "PUBLIC");
  const optional = live.filter((h) => h.holidayType === "OPTIONAL");
  const moon = live.filter((h) => h.isMoonDependent && h.status === "TENTATIVE");
  const def = shifts.find((s) => s.isDefault);
  const offs = OFF_DAYS[def?.weeklyOff ?? "SUNDAY"] ?? [0];
  const daysTo = next ? Math.round((utc(next.fromDate).getTime() - utc(today).getTime()) / 864e5) : null;
  const shift = (n: number) => { const d = utc(month); d.setUTCMonth(d.getUTCMonth() + n); setCursor(iso(d).slice(0, 7) + "-01"); };

  // Month grid (Mon-first) like the template's .cal.
  const first = utc(month), y = first.getUTCFullYear(), m = first.getUTCMonth();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(Date.UTC(y, m, 1 - lead + i)); return { iso: iso(d), day: d.getUTCDate(), out: d.getUTCMonth() !== m, dow: d.getUTCDay() }; });
  const weeks = cells.slice(35).every((c) => c.out) ? cells.slice(0, 35) : cells;
  const on = (d: string) => holidays.filter((h) => h.status !== "CANCELLED" && h.fromDate <= d && h.toDate >= d);

  const open = (h: Holiday | "new") => {
    setErrs({});
    setEdit(h);
    setF(h === "new"
      ? { name: "", fromDate: today, toDate: today, holidayType: "COMPANY", appliesToAllBranches: true, branchIds: [], isMoonDependent: false, hijriNote: "", eligibilityNote: "", status: "UPCOMING", notifyEss: true }
      : { name: h.name, fromDate: h.fromDate, toDate: h.toDate, holidayType: h.holidayType, appliesToAllBranches: h.appliesToAllBranches, branchIds: h.branches.map((b) => b.id), isMoonDependent: h.isMoonDependent, hijriNote: h.hijriNote ?? "", eligibilityNote: h.eligibilityNote ?? "", status: h.status, notifyEss: h.notifyEss });
  };
  const row = edit && edit !== "new" ? edit : null;
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean | string[]) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setEdit(null); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the holiday"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => {
    const body = { ...f, status: f.status === "TENTATIVE" && !f.isMoonDependent ? "UPCOMING" : f.status };
    return run(() => (row ? updateHoliday(row.id, { ...body, rowVersion: row.rowVersion }) : createHoliday(body)), row ? `${s("name")} saved` : "Holiday added");
  };
  const ids = (f.branchIds as string[] | undefined) ?? [];

  return (
    <>
      <PageHead eyebrow="HR / Attendance" title="Holiday Calendar" description={`Gazetted public holidays (Cabinet Division) plus company and optional holidays · FY ${fy}-${String(fy + 1).slice(2)}.`}
        actions={<>
          <button className="btn secondary" type="button" disabled title="Calendar subscriptions come with a later integrations phase"><CalendarSync />Subscribe (.ics)</button>
          <button className="btn secondary" type="button" disabled title="The FY 2026-27 gazette is already loaded; next year's import comes later"><Download />Import gazette</button>
          {can.create && <button className="btn primary" type="button" onClick={() => open("new")}><Plus />Add holiday</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Public holidays</span><span className="icon-well"><Flag /></span></div><strong>{pub.reduce((t, h) => t + h.days, 0)} days</strong><small>FY {fy}-{String(fy + 1).slice(2)} · {pub.length} occasions</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Next holiday</span><span className="icon-well"><CalendarDays /></span></div><strong>{next ? `${next.fromDate.slice(8, 10)} ${MON[Number(next.fromDate.slice(5, 7)) - 1]}` : "—"}</strong><small>{next ? `${next.name} · ${daysTo === 0 ? "today" : `in ${daysTo} day${daysTo === 1 ? "" : "s"}`}` : "None scheduled"}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Optional holidays</span><span className="icon-well"><Sparkles /></span></div><strong>{optional.length}</strong><small>{optional.map((h) => h.name).join(", ") || "None"}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Moon-dependent</span><span className="icon-well"><Moon /></span></div><strong>{moon.length}</strong><small>Tentative until Ruet-e-Hilal</small></div>
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <div><h3>{mode === "month" ? `${MONTH[m]} ${y}` : `FY ${fy}-${String(fy + 1).slice(2)}`}</h3><p>{branch ? `${branches.find((b) => b.id === branch)?.name}` : "Applies to all branches unless noted"}</p></div>
            <div className="panel-actions">
              <button className="btn secondary sm icon" type="button" aria-label="Previous" onClick={() => shift(mode === "month" ? -1 : -12)}><ChevronLeft /></button>
              <button className="btn secondary sm" type="button" onClick={() => setCursor(`${today.slice(0, 7)}-01`)}>Today</button>
              <button className="btn secondary sm icon" type="button" aria-label="Next" onClick={() => shift(mode === "month" ? 1 : 12)}><ChevronRight /></button>
              <div className="seg"><button type="button" className={cn(mode === "month" && "active")} onClick={() => setMode("month")}>Month</button><button type="button" className={cn(mode === "year" && "active")} onClick={() => setMode("year")}>Year</button></div>
            </div>
          </div>
          {!all ? <Skeleton style={{ height: 320 }} /> : mode === "month" ? (
            <div className="cal">
              <div className="cal-head"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
              {weeks.map((c) => {
                const hs = on(c.iso);
                return (
                  <div key={c.iso} className={cn("cal-day", c.out && "muted", c.iso === today && "today")}>
                    <b>{c.day}</b>
                    {!c.out && hs.map((h) => <em key={h.id} className={cn("ev", evTone(h))} title={h.name} style={{ cursor: "pointer" }} onClick={() => open(h)}>{h.name}{h.holidayType === "OPTIONAL" ? " (optional)" : ""}</em>)}
                    {!c.out && offs.includes(c.dow) && <em className="ev neutral">Weekly off</em>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid-4">
              {Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(fy, 6 + i, 1)); const key = iso(d).slice(0, 7); const hs = inFy.filter((h) => h.fromDate.slice(0, 7) === key && h.status !== "CANCELLED"); return (
                <button key={key} type="button" className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => { setCursor(`${key}-01`); setMode("month"); }}>
                  <b>{MONTH[d.getUTCMonth()]} {d.getUTCFullYear()}</b>
                  <div className="mt">{hs.length ? hs.map((h) => <div key={h.id} className="small"><span className={cn("badge", evTone(h))}>{h.fromDate.slice(8, 10)}</span> {h.name}</div>) : <span className="small muted">No holidays</span>}</div>
                </button>
              ); })}
            </div>
          )}
          <div className="legend mt"><span><i style={{ background: "var(--primary)" }} />Public holiday</span><span><i style={{ background: "var(--violet)" }} />Optional</span><span><i style={{ background: "var(--blue)" }} />Company event</span><span><i style={{ background: "var(--muted-2)" }} />Weekly off ({labelOf(lookups, "WeeklyOff", def?.weeklyOff ?? "SUNDAY")})</span></div>
        </div>

        <div className="panel flush">
          <div className="panel-head"><div><h3>Holidays {fy}-{String(fy + 1).slice(2)}</h3><p>Pakistan · Cabinet Division</p></div>
            <div className="panel-actions"><select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch"><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div></div>
          <div className="list" style={{ padding: "0 16px 14px" }}>
            {!all ? <Skeleton style={{ height: 240 }} /> : inFy.length ? inFy.map((h) => (
              <div key={h.id} className="list-item" style={{ cursor: "pointer" }} role="button" tabIndex={0} onClick={() => open(h)} onKeyDown={(e) => { if (e.key === "Enter") open(h); }}>
                <span className="icon-well"><HolidayIcon h={h} /></span>
                <div><b>{h.name}</b><small>{rangeText(h)} · {h.hijriNote ?? (h.eligibilityNote ? `optional (${h.eligibilityNote})` : `${h.days} day${h.days === 1 ? "" : "s"}`)}{!h.appliesToAllBranches && ` · ${h.branches.map((b) => b.name).join(", ")}`}</small></div>
                <span className="spacer" />
                <span className={cn("badge", h.holidayType === "OPTIONAL" && h.status === "UPCOMING" ? "violet" : toneOf(lookups, "HolidayStatus", h.status))}>{h.holidayType === "OPTIONAL" && h.status === "UPCOMING" ? "Optional" : labelOf(lookups, "HolidayStatus", h.status)}</span>
              </div>
            )) : <EmptyState title="No holidays this year" description={can.create ? "Add public, company or optional holidays." : "Holidays HR adds appear here."} />}
          </div>
        </div>
      </div>

      <div className="banner info mt"><Info /><div><b>Sandwich rule &amp; overtime</b><p>Holidays between two leave days count as leave (per leave policy). Staff working on a public holiday earn 2× overtime or a compensatory off.</p></div><button className="btn sm secondary" type="button" disabled title="Leave policies arrive in Phase 11">Leave policies</button></div>

      {edit && (
        <RecordModal open onClose={() => setEdit(null)} busy={busy} title={row ? row.name : "Add holiday"} subtitle="Will be excluded from working days in attendance & payroll."
          history={row ? { schema: "HumanResources", table: "Holidays", id: row.id } : null} canSave={row ? can.edit : can.create} canDelete={canDelete}
          saveLabel={row ? "Save" : "Add holiday"} onSave={save} onDelete={async () => { if (row) await run(() => deleteHoliday(row.id, row.rowVersion), `${row.name} deleted`); }}
          deleteNote="Holidays attendance already uses can only be cancelled.">
          <FormGrid>
            <Field label="Holiday name" required full error={errs.name}><input value={s("name")} maxLength={80} placeholder="e.g. Company Foundation Day" onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="From" required error={errs.fromDate}><input type="date" value={s("fromDate")} onChange={(e) => { set("fromDate", e.target.value); if (s("toDate") < e.target.value) set("toDate", e.target.value); }} /></Field>
            <Field label="To" error={errs.toDate}><input type="date" value={s("toDate")} min={s("fromDate")} onChange={(e) => set("toDate", e.target.value)} /></Field>
            <Field label="Type" error={errs.holidayType}><select value={s("holidayType")} onChange={(e) => set("holidayType", e.target.value)}>{lookupOptions(lookups, "HolidayType", s("holidayType")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Applies to" error={errs.branchIds}>
              <select value={f.appliesToAllBranches ? "" : "some"} onChange={(e) => set("appliesToAllBranches", e.target.value === "")}><option value="">All branches</option><option value="some">Selected branches</option></select>
            </Field>
            {!f.appliesToAllBranches && (
              <Field label="Branches" full error={errs.branchIds}>
                <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>{branches.map((b) => <Check key={b.id} label={b.name} checked={ids.includes(b.id)} onChange={(e) => set("branchIds", e.target.checked ? [...ids, b.id] : ids.filter((x) => x !== b.id))} />)}</div>
              </Field>
            )}
            <Check full label="Moon-sighting dependent (tentative)" checked={Boolean(f.isMoonDependent)} onChange={(e) => { set("isMoonDependent", e.target.checked); if (e.target.checked && s("status") === "UPCOMING") set("status", "TENTATIVE"); if (!e.target.checked && s("status") === "TENTATIVE") set("status", "UPCOMING"); }} />
            {Boolean(f.isMoonDependent) && <Field label="Hijri date" error={errs.hijriNote}><input value={s("hijriNote")} maxLength={80} placeholder="e.g. 1–3 Shawwal 1448" onChange={(e) => set("hijriNote", e.target.value)} /></Field>}
            <Field label="Who it is for" error={errs.eligibilityNote}><input value={s("eligibilityNote")} maxLength={120} placeholder="e.g. Christian staff (optional holidays)" onChange={(e) => set("eligibilityNote", e.target.value)} /></Field>
            <Field label="Status" error={errs.status}><select value={s("status")} onChange={(e) => set("status", e.target.value)}>{lookupOptions(lookups, "HolidayStatus", s("status")).filter((o) => o.code !== "TENTATIVE" || f.isMoonDependent).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Check label="Show on employees' calendars (ESS)" checked={Boolean(f.notifyEss)} onChange={(e) => set("notifyEss", e.target.checked)} />
            {row && row.status !== "OBSERVED" && can.edit && <div className="full"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(() => setHolidayStatus(row.id, "OBSERVED", row.rowVersion), `${row.name} marked observed`)}>Mark observed</button></div>}
          </FormGrid>
        </RecordModal>
      )}
    </>
  );
}
