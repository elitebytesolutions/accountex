"use client";

import { CalendarClock, CalendarPlus, CalendarX, Check, CircleCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FlagDetail, FlagEnvironment, FlagScheduleStep } from "@/shared";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { getFlagSchedule, saveFlagSchedule } from "../api";
import { fmtDay } from "./ops-ui";

type Row = { id?: string; stepDate: string; rolloutPct: number; status: string; docNo: string | null; crId: string | null };
const todayPk = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const STATUS: Record<string, [string, string]> = { PLANNED: ["info", "Planned"], REQUESTED: ["warn", "Requested"], APPLIED: ["good", "Applied"], CANCELLED: ["neutral", "Cancelled"] };

/**
 * Template flag detail "Scheduled changes" (9J-flags.js 1132–1296): a ramp plan; each PLANNED step opens a change
 * request on its date (hourly ops job). Only for percentage rollouts.
 */
export function SchedulePanel({ flag, env }: { flag: FlagDetail; env: FlagEnvironment }) {
  const toast = useToast();
  const state = flag.environments.find((e) => e.environment === env);
  const eligible = flag.flagType !== "ENTITLEMENT" && state?.defaultRule?.defaultRule === "ROLLOUT" && flag.stage !== "ARCHIVED";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [base, setBase] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    getFlagSchedule(flag.id, env).then((steps: FlagScheduleStep[]) => {
      if (cancelled) return;
      const r = steps.map((s) => ({ id: s.id, stepDate: s.stepDate, rolloutPct: s.rolloutPct, status: s.status, docNo: s.changeRequestDocNo, crId: s.changeRequestId }));
      setRows(r); setBase(JSON.stringify(r)); setErrors({});
    }).catch(() => !cancelled && setRows([]));
    return () => { cancelled = true; };
  }, [flag.id, env, eligible, attempt]);

  const head = (
    <div className="panel-head"><div><h3>Scheduled changes</h3><p>A ramp plan. Each step opens a change request automatically on its date.</p></div>
      {eligible && <button type="button" className="btn ghost sm" onClick={() => {
        const list = rows ?? [];
        const last = list[list.length - 1];
        const from = last && last.stepDate > todayPk() ? last.stepDate : todayPk();
        const pct = Math.min(100, Math.max((last?.rolloutPct ?? state?.defaultRule?.rolloutPct ?? 0) + 25, 10));
        setRows([...list, { stepDate: addDays(from, 7), rolloutPct: pct, status: "PLANNED", docNo: null, crId: null }]);
      }}><CalendarPlus />Add step</button>}</div>
  );
  if (!eligible) return <div className="panel">{head}<div className="ff-rules-empty"><CalendarX />{flag.stage === "ARCHIVED" ? "This flag is archived. Restore it to plan a ramp." : "Scheduled ramps are for percentage rollouts. This flag is plan or switch based."}</div></div>;
  if (!rows) return <div className="panel">{head}</div>;

  const steps = [...rows].sort((a, b) => a.stepDate.localeCompare(b.stepDate));
  const today = todayPk();
  const nextI = steps.findIndex((s) => s.status === "PLANNED" && s.stepDate > today);
  const dirty = JSON.stringify(rows) !== base;
  const set = (i: number, p: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const save = async () => {
    setBusy(true);
    try {
      const planned = rows.filter((r) => r.status === "PLANNED" || !r.id);
      await saveFlagSchedule(flag.id, env, planned.map((r) => ({ ...(r.id ? { id: r.id } : {}), stepDate: r.stepDate, rolloutPct: r.rolloutPct })));
      toast("Ramp plan saved. Each step opens a change request on its date.", { tone: "good" });
      setAttempt((n) => n + 1);
    } catch (e) {
      const f = adminFieldErrors(e);
      setErrors(f);
      toast(adminErrorMessage(e, "Could not save the ramp"), { tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <div className="panel">{head}
      {steps.length > 0 && (
        <div className="ff-ramp">
          {steps.map((s, i) => {
            const done = s.status === "APPLIED";
            return <div key={s.id ?? `n${i}`} className={cn("ff-rstep", done && "done", i === nextI && "next")} style={{ ["--i" as string]: i }}>
              <span className="ff-rdot">{done ? <Check /> : `${s.rolloutPct}%`}</span><b>{s.rolloutPct}%</b><small>{fmtDay(s.stepDate)}</small>
              {i === nextI ? <em>in {Math.round((Date.parse(s.stepDate) - Date.parse(today)) / 864e5)} days</em> : done ? <em>applied</em> : s.status === "REQUESTED" ? <em>requested</em> : null}
            </div>;
          })}
        </div>
      )}
      <div className="ff-steps">
        {rows.length === 0 ? <div className="ff-rules-empty"><CalendarPlus />No ramp planned. Add steps to automate the rollout.</div> : rows.map((s, i) => {
          const locked = s.status !== "PLANNED" && !!s.id;
          const [tone, label] = STATUS[s.status] ?? ["info", s.status];
          const pi = rows.filter((r) => r.status === "PLANNED" || !r.id).indexOf(s);
          const err = pi < 0 ? undefined : (errors[`steps.${pi}.stepDate`] ?? errors[`steps.${pi}.rolloutPct`]);
          return (
            <div key={s.id ?? `n${i}`} className={cn("ff-steprow", locked && "done")}>
              {locked ? <CircleCheck /> : <CalendarClock />}
              <input type="date" value={s.stepDate} disabled={locked} min={addDays(today, 1)} aria-label="Step date" onChange={(e) => set(i, { stepDate: e.target.value })} />
              <span>set rollout to</span>
              <div className="ff-pctin"><input type="number" min={0} max={100} value={s.rolloutPct} disabled={locked} aria-label="Step percent" onChange={(e) => set(i, { rolloutPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /><span>%</span></div>
              <span className="spacer" />
              {err && <small className="hint text-danger">{err}</small>}
              {s.crId && <Link className="link small" href={`/admin/change-requests?open=${s.crId}`}>{s.docNo}</Link>}
              {locked ? <span className={cn("badge", tone)}>{label}</span> : <button type="button" className="icon-btn-sm" aria-label="Remove step" onClick={() => setRows(rows.filter((_, k) => k !== i))}><X /></button>}
            </div>
          );
        })}
      </div>
      {dirty && <div className="form-actions"><button type="button" className="btn ghost sm" onClick={() => { setRows(JSON.parse(base) as Row[]); setErrors({}); }}>Discard</button>
        <button type="button" className="btn primary sm" disabled={busy} onClick={save}><Check />{busy ? "Saving…" : "Save ramp"}</button></div>}
    </div>
  );
}
