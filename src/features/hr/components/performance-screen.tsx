"use client";

import { Bell, ChevronRight, ClipboardCheck, Download, Grid3x3, Lock, Play, Plus, Settings, Star, Target, UserCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CYCLE_STAGES, type PerformanceCycle } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { ConfirmDialog } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, lookupOptions, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createPerformanceCycle, deletePerformanceCycle, listPerformanceCycles, performanceCycleAction, updatePerformanceCycle } from "../talent-api";
import { RecordModal } from "./record-modal";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = Record<string, string | boolean>;
const LOOKUPS = ["CycleType", "PerformanceCycleStage", "PerformanceCycleStatus"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STEP_LABEL: Record<string, string> = { GOAL_SETTING: "Goal setting", SELF_REVIEW: "Self review", MANAGER_REVIEW: "Manager review", CALIBRATION: "Calibration", SIGN_OFF: "Sign-off & letters" };
const STEP_DUE: Record<string, keyof PerformanceCycle> = { GOAL_SETTING: "goalSettingDue", SELF_REVIEW: "selfReviewDue", MANAGER_REVIEW: "managerReviewDue", CALIBRATION: "calibrationEnd", SIGN_OFF: "signOffDue" };
const dm = (d: string) => `${d.slice(8, 10)} ${MON[Number(d.slice(5, 7)) - 1]}`;
const dmy = (d: string) => `${dm(d)} ${d.slice(0, 4)}`;
const DATES = ["periodStart", "periodEnd", "goalSettingDue", "selfReviewDue", "managerReviewDue", "calibrationStart", "calibrationEnd", "signOffDue"] as const;
const blank = (): Form => ({ name: "", cycleType: "HALF_YEARLY", periodStart: "", periodEnd: "", goalSettingDue: "", selfReviewDue: "", managerReviewDue: "", calibrationStart: "", calibrationEnd: "", signOffDue: "", incrementsEffectiveMonth: "", excludeProbation: true, ratingScaleMax: "5" });
const fromCycle = (c: PerformanceCycle): Form => ({
  ...Object.fromEntries(DATES.map((k) => [k, c[k] ?? ""])), name: c.name, cycleType: c.cycleType, incrementsEffectiveMonth: c.incrementsEffectiveMonth?.slice(0, 7) ?? "",
  excludeProbation: c.excludeProbation, ratingScaleMax: String(c.ratingScaleMax),
});

/** The hero's second line, in the template's words: eligibility · manager review · calibration · increments. */
function heroLine(c: PerformanceCycle) {
  const parts = [`Eligible employees are counted once reviews start (Phase 33)${c.excludeProbation ? " · excludes staff on probation" : ""}`];
  if (c.managerReviewDue) parts.push(`Manager review closes ${dm(c.managerReviewDue)}`);
  if (c.calibrationStart && c.calibrationEnd) parts.push(`Calibration ${c.calibrationStart.slice(5, 7) === c.calibrationEnd.slice(5, 7) ? `${c.calibrationStart.slice(8, 10)}–${dm(c.calibrationEnd)}` : `${dm(c.calibrationStart)} – ${dm(c.calibrationEnd)}`}`);
  if (c.incrementsEffectiveMonth) parts.push(`Increments effective ${MONTH[Number(c.incrementsEffectiveMonth.slice(5, 7)) - 1]} ${c.incrementsEffectiveMonth.slice(0, 4)} payroll`);
  return `${parts.join(" · ")}.`;
}

/**
 * Template app/hr/performance (51-hr-pay-talent.html): the cycle hero and the 5-step stepper driven by the cycle's stage.
 * KPIs, the review table, goals and the 9-box grid stay empty until Phase 33. Added in template style: the cycle settings
 * modal, the cycle switcher / list and the Open, Advance stage and Close actions.
 */
export function PerformanceScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [rows, setRows] = useState<PerformanceCycle[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [edit, setEdit] = useState<PerformanceCycle | "new" | null>(null);
  const [f, setF] = useState<Form>(blank());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"open" | "advance" | "close" | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPerformanceCycles().then((r) => { if (!cancelled) { setRows(r.items); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load appraisal cycles" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const c = rows?.find((x) => x.id === picked) ?? rows?.[0] ?? null;
  const row = edit && edit !== "new" ? edit : null;
  const readOnly = row ? row.status === "CLOSED" || !can.edit : !can.create;
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const open = (x: PerformanceCycle | "new") => { setErrs({}); setF(x === "new" ? blank() : fromCycle(x)); setEdit(x); };
  const run = async (work: () => Promise<PerformanceCycle | void>, done: string) => {
    setBusy(true);
    setErrs({});
    try { const saved = await work(); toast(done, { tone: "good" }); if (saved) setPicked(saved.id); setEdit(null); reload(); }
    catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the cycle"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const save = () => run(() => (row ? updatePerformanceCycle(row.id, { ...f, rowVersion: row.rowVersion }) : createPerformanceCycle(f)), row ? `${s("name")} saved` : "Cycle created");
  const act = (a: "open" | "advance" | "close") => {
    setConfirm(null);
    if (!c) return;
    const next = CYCLE_STAGES[CYCLE_STAGES.indexOf(c.stage as (typeof CYCLE_STAGES)[number]) + 1];
    return run(() => performanceCycleAction(c.id, a, c.rowVersion), a === "open" ? `${c.name} is open` : a === "close" ? `${c.name} closed` : `Moved to ${STEP_LABEL[next ?? ""] ?? "the next stage"}`);
  };
  const at = c ? CYCLE_STAGES.indexOf(c.stage as (typeof CYCLE_STAGES)[number]) : -1;
  const statusWord = c ? (c.status === "ACTIVE" ? "Active cycle" : c.status === "DRAFT" ? "Draft cycle" : "Closed cycle") : "";
  const date = (k: (typeof DATES)[number], label: string, required = false) => (
    <Field label={label} required={required} error={errs[k]}><input type="date" value={s(k)} disabled={readOnly} onChange={(e) => set(k, e.target.value)} /></Field>
  );

  return (
    <>
      <PageHead eyebrow="Workforce / Talent / Performance" title="Performance Management" description="Appraisal cycles, goals & KRAs, ratings and calibration."
        actions={<>
          <button className="btn secondary" type="button" disabled title="The goal library arrives with goals & reviews (Phase 33)"><Target />Goal library</button>
          <button className="btn primary" type="button" disabled title="Reminders arrive with reviews (Phase 33)"><Bell />Remind managers</button>
        </>} />

      {!rows ? <Skeleton style={{ height: 140, marginBottom: 16 }} /> : !c ? (
        <div className="hero-band mb">
          <div><span className="hero-eyebrow">No appraisal cycle yet</span><h1>Set up your first appraisal cycle</h1><p>Define the review period, the stage due dates and when increments take effect. Open it when goal setting starts.</p></div>
          <div className="hero-actions">{can.create && <button className="btn secondary" type="button" onClick={() => open("new")}><Plus />New cycle</button>}</div>
        </div>
      ) : (
        <div className="hero-band mb">
          <div>
            <span className="hero-eyebrow">{statusWord} · {dm(c.periodStart)} – {dmy(c.periodEnd)}</span>
            <h1>{c.name}</h1>
            <p>{heroLine(c)}</p>
          </div>
          <div className="hero-actions">
            {rows.length > 1 && <select aria-label="Cycle" value={c.id} onChange={(e) => setPicked(e.target.value)}>{rows.map((x) => <option key={x.id} value={x.id}>{x.name} · {labelOf(lookups, "PerformanceCycleStatus", x.status)}</option>)}</select>}
            <button className="btn secondary" type="button" disabled title="Ratings come with reviews (Phase 33)"><Download />Export ratings</button>
            <button className="btn secondary" type="button" onClick={() => open(c)}><Settings />Cycle settings</button>
            {can.edit && c.status === "DRAFT" && <button className="btn secondary" type="button" disabled={busy} onClick={() => setConfirm("open")}><Play />Open cycle</button>}
            {can.edit && c.status === "ACTIVE" && at < CYCLE_STAGES.length - 1 && <button className="btn secondary" type="button" disabled={busy} onClick={() => setConfirm("advance")}><ChevronRight />Advance stage</button>}
            {can.edit && c.status === "ACTIVE" && <button className="btn secondary" type="button" disabled={busy} onClick={() => setConfirm("close")}><Lock />Close cycle</button>}
            {can.create && <button className="btn secondary" type="button" onClick={() => open("new")}><Plus />New cycle</button>}
          </div>
        </div>
      )}

      <div className="panel mb">
        <ol className="steps">
          {CYCLE_STAGES.map((st, i) => {
            const due = c?.[STEP_DUE[st]!] as string | null | undefined;
            const done = c ? c.status === "CLOSED" || (c.status === "ACTIVE" && i < at) : false;
            const active = c?.status === "ACTIVE" && i === at;
            return <li key={st} className={cn(done && "done", active && "active")}><b>{i + 1}</b><span title={due ? `Due ${dmy(due)}` : undefined}>{STEP_LABEL[st]}{due && i === at && c?.status !== "CLOSED" ? ` · ${dm(due)}` : ""}</span></li>;
          })}
        </ol>
      </div>

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Self Reviews</span><span className="icon-well"><UserCheck /></span></div><strong>0 / 0</strong><small>Reviews start in Phase 33</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Manager Reviews</span><span className="icon-well"><ClipboardCheck /></span></div><strong>0 / 0</strong><small>{c?.managerReviewDue ? `Closes ${dmy(c.managerReviewDue)}` : "No due date set"}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Avg Rating (so far)</span><span className="icon-well"><Star /></span></div><strong>— / {c?.ratingScaleMax ?? 5}</strong><small>No ratings yet</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Goals On Track</span><span className="icon-well"><Target /></span></div><strong>—</strong><small>Goals & KRAs arrive in Phase 33</small></div>
      </div>

      <div className="split mb">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Review cycle{c ? ` — ${c.name}` : ""}</h3><p>0 reviews in progress</p></div></div>
          <EmptyState icon={<ClipboardCheck />} title="No reviews yet" description="Each eligible employee gets a review once reviews start (Phase 33)." />
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Goals &amp; KRAs</h3><p>Pick an employee to see their goals</p></div></div>
          <EmptyState icon={<Target />} title="No goals yet" description="Goals and KRAs are set during goal setting (Phase 33)." />
        </div>
      </div>

      <div className="panel mb">
        <div className="panel-head"><div><h3>9-Box Talent Grid</h3><p>Performance (x) vs potential (y) · draft before calibration</p></div></div>
        <EmptyState icon={<Grid3x3 />} title="No ratings to plot" description="The grid fills in from manager ratings and calibration (Phase 33)." />
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Appraisal cycles</h3><p>{rows ? `${rows.length} cycle${rows.length === 1 ? "" : "s"} · one can be active at a time` : "Loading…"}</p></div>
          {can.create && <div className="panel-actions"><button className="btn secondary sm" type="button" onClick={() => open("new")}><Plus />New cycle</button></div>}</div>
        {!rows ? <Skeleton style={{ height: 120 }} /> : !rows.length ? (
          <EmptyState title="No cycles yet" description={can.create ? "Create the first appraisal cycle." : "Cycles HR sets up appear here."} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Cycle</th><th>Type</th><th>Period</th><th>Stage</th><th>Increments</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} style={{ cursor: "pointer" }} className={cn(x.id === c?.id && "selected")} onClick={() => setPicked(x.id)} onDoubleClick={() => open(x)}>
                  <td><b>{x.name}</b></td><td>{labelOf(lookups, "CycleType", x.cycleType)}</td><td>{dmy(x.periodStart)} – {dmy(x.periodEnd)}</td>
                  <td>{x.status === "ACTIVE" ? labelOf(lookups, "PerformanceCycleStage", x.stage) : "—"}</td>
                  <td>{x.incrementsEffectiveMonth ? `${MON[Number(x.incrementsEffectiveMonth.slice(5, 7)) - 1]} ${x.incrementsEffectiveMonth.slice(0, 4)}` : "—"}</td>
                  <td><span className={cn("badge", toneOf(lookups, "PerformanceCycleStatus", x.status))}>{labelOf(lookups, "PerformanceCycleStatus", x.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <ConfirmDialog open={confirm !== null} onClose={() => setConfirm(null)} busy={busy} onConfirm={() => confirm && act(confirm)}
        title={confirm === "open" ? `Open ${c?.name}?` : confirm === "close" ? `Close ${c?.name}?` : `Advance ${c?.name}?`}
        confirmLabel={confirm === "open" ? "Open cycle" : confirm === "close" ? "Close cycle" : "Advance stage"} danger={confirm === "close"}>
        {confirm === "open" ? "Goal setting starts. Only one cycle can be active at a time."
          : confirm === "close" ? "A closed cycle is read-only: its dates and stage can no longer change."
          : `The cycle moves from ${STEP_LABEL[c?.stage ?? ""] ?? ""} to ${STEP_LABEL[CYCLE_STAGES[at + 1] ?? ""] ?? ""}. Stages only move forward.`}
      </ConfirmDialog>

      {edit && (
        <RecordModal open wide onClose={() => setEdit(null)} busy={busy} title={row ? "Cycle settings" : "New appraisal cycle"}
          subtitle={row ? `${row.name} · ${labelOf(lookups, "PerformanceCycleStatus", row.status)}${row.status === "CLOSED" ? " · read-only" : ""}` : "Created as a draft; open it when goal setting starts."}
          history={row ? { schema: "HumanResources", table: "PerformanceCycles", id: row.id } : null}
          canSave={!readOnly} canDelete={can.remove && row?.status === "DRAFT"} saveLabel={row ? "Save settings" : "Create cycle"} onSave={save}
          onDelete={async () => { if (row) await run(() => deletePerformanceCycle(row.id, row.rowVersion), `${row.name} deleted`); }}
          deleteNote="Only a draft cycle nothing belongs to can be deleted.">
          <FormGrid>
            <Field label="Cycle name" required full error={errs.name}><input value={s("name")} maxLength={80} placeholder="e.g. FY 2026-27 H1 Appraisal" disabled={readOnly} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Cycle type" error={errs.cycleType}><select value={s("cycleType")} disabled={readOnly} onChange={(e) => set("cycleType", e.target.value)}>{lookupOptions(lookups, "CycleType", s("cycleType")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Rating scale (max)" error={errs.ratingScaleMax} hint="3 to 10 points"><input type="number" min={3} max={10} value={s("ratingScaleMax")} disabled={readOnly} onChange={(e) => set("ratingScaleMax", e.target.value)} /></Field>
            {date("periodStart", "Period from", true)}
            {date("periodEnd", "Period to", true)}
          </FormGrid>
          <div className="form-section"><h4>Stage due dates</h4></div>
          <FormGrid cols={3}>
            {date("goalSettingDue", "Goal setting due")}
            {date("selfReviewDue", "Self review due")}
            {date("managerReviewDue", "Manager review closes")}
            {date("calibrationStart", "Calibration from")}
            {date("calibrationEnd", "Calibration to")}
            {date("signOffDue", "Sign-off & letters due")}
          </FormGrid>
          <div className="form-section"><h4>Eligibility &amp; increments</h4></div>
          <FormGrid>
            <Field label="Increments effective (payroll month)" error={errs.incrementsEffectiveMonth}><input type="month" value={s("incrementsEffectiveMonth")} disabled={readOnly} onChange={(e) => set("incrementsEffectiveMonth", e.target.value)} /></Field>
            <Check label="Exclude employees on probation" checked={Boolean(f.excludeProbation)} disabled={readOnly} onChange={(e) => set("excludeProbation", e.target.checked)} />
          </FormGrid>
          {row?.status === "ACTIVE" && <p className="small muted mt">Stage: {labelOf(lookups, "PerformanceCycleStage", row.stage)}. Use Advance stage on the page to move on.</p>}
        </RecordModal>
      )}
    </>
  );
}
