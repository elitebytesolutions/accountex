"use client";

import { Bell, ChevronRight, ClipboardCheck, Download, Grid3x3, Lock, MessageSquare, Play, Plus, Search, Settings, Star, Target, UserCheck, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CYCLE_STAGES, PERF_NINE_BOX, type PerfBoard, type PerfGoal, type PerformanceCycle } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, lookupOptions, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createPerformanceCycle, deletePerformanceCycle, listPerformanceCycles, performanceCycleAction, updatePerformanceCycle } from "../talent-api";
import { generateReviews, getPerfBoard, listPerfGoals } from "../talent-ops-api";
import { PerfGoalLines, PerfGoalModal, PerfReviewDrawer } from "./performance-review-drawer";
import { RecordModal } from "./record-modal";
import { TableFoot } from "./people-ui";
import { tInitials, tNum } from "./talent-ui";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = Record<string, string | boolean>;
const LOOKUPS = ["CycleType", "PerformanceCycleStage", "PerformanceCycleStatus", "PerformanceReviewStage", "PerformanceBand", "PotentialBand", "RatingLabel"];
const PAGE = 10;
const NINE_TONE: Record<string, string> = { ENIGMA: "warn", GROWTH_EMPLOYEE: "info", FUTURE_LEADER: "good", INCONSISTENT_PLAYER: "warn", CORE_PLAYER: "neutral", HIGH_PERFORMER: "good", RISK: "danger", EFFECTIVE_EMPLOYEE: "neutral", TRUSTED_PROFESSIONAL: "info" };
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
function heroLine(c: PerformanceCycle, eligible: number | null) {
  const parts = [`${eligible ? `${eligible} eligible employee${eligible === 1 ? "" : "s"}` : "Reviews not started yet"}${c.excludeProbation ? " (excludes staff on probation)" : ""}`];
  if (c.managerReviewDue) parts.push(`Manager review closes ${dm(c.managerReviewDue)}`);
  if (c.calibrationStart && c.calibrationEnd) parts.push(`Calibration ${c.calibrationStart.slice(5, 7) === c.calibrationEnd.slice(5, 7) ? `${c.calibrationStart.slice(8, 10)}–${dm(c.calibrationEnd)}` : `${dm(c.calibrationStart)} – ${dm(c.calibrationEnd)}`}`);
  if (c.incrementsEffectiveMonth) parts.push(`Increments effective ${MONTH[Number(c.incrementsEffectiveMonth.slice(5, 7)) - 1]} ${c.incrementsEffectiveMonth.slice(0, 4)} payroll`);
  return `${parts.join(" · ")}.`;
}

/**
 * Template app/hr/performance (51-hr-pay-talent.html): the cycle hero and the 5-step stepper driven by the cycle's stage.
 * KPIs, the review table (search, department, stage chips), the Goals & KRAs panel of the picked employee and the 9-box
 * grid come from the cycle's reviews (Phase 33). Added in template style: the cycle settings modal, the cycle switcher /
 * list, Open / Advance stage / Close, Start reviews, the review drawer (manager review, calibration, sign-off, goals,
 * feedback, 1:1s, History) and the calibration board.
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
  const [board, setBoard] = useState<PerfBoard | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [stage, setStage] = useState("");
  const [page, setPage] = useState(1);
  const [focus, setFocus] = useState<{ employeeId: string; name: string; managerComment: string | null; manager: string | null; score: number | null; label: string | null } | null>(null);
  const [goals, setGoals] = useState<PerfGoal[] | null>(null);
  const [goalEdit, setGoalEdit] = useState<PerfGoal | "new" | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [calib, setCalib] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPerformanceCycles().then((r) => { if (!cancelled) { setRows(r.items); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load appraisal cycles" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const cycleId = picked ?? rows?.[0]?.id ?? null;
  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    if (!cycleId) return;
    let cancelled = false;
    getPerfBoard({ cycle: cycleId, search, departmentId: dept, stage, page, pageSize: PAGE }).then((b) => !cancelled && setBoard(b)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [cycleId, search, dept, stage, page, attempt]);
  useEffect(() => {
    if (!focus || !cycleId) return;
    let cancelled = false;
    listPerfGoals({ employeeId: focus.employeeId, cycleId }).then((g) => !cancelled && setGoals(g)).catch(() => !cancelled && setGoals([]));
    return () => { cancelled = true; };
  }, [focus, cycleId, attempt]);
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
  const kp = board?.cycle?.id === c?.id ? board?.kpis ?? null : null;
  const startReviews = async (cy: PerformanceCycle) => {
    setBusy(true);
    try { const r = await generateReviews(cy.id); toast(r.added ? `${r.added} review${r.added === 1 ? "" : "s"} started` : "Every eligible employee already has a review", { tone: "good" }); reload(); }
    catch (e) { toast(apiMessage(e, "Could not start reviews"), { tone: "danger" }); } finally { setBusy(false); }
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
          <button className="btn secondary" type="button" disabled title="A shared goal library is not part of this release; add goals per employee"><Target />Goal library</button>
          <button className="btn primary" type="button" disabled title="Reminders arrive with notifications (Phase 29)"><Bell />Remind managers</button>
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
            <p>{heroLine(c, board?.cycle?.id === c.id ? board.kpis.eligible : null)}</p>
          </div>
          <div className="hero-actions">
            {rows.length > 1 && <select aria-label="Cycle" value={c.id} onChange={(e) => setPicked(e.target.value)}>{rows.map((x) => <option key={x.id} value={x.id}>{x.name} · {labelOf(lookups, "PerformanceCycleStatus", x.status)}</option>)}</select>}
            <button className="btn secondary" type="button" disabled={!board?.reviews.length} onClick={() => exportRatings(board!, c.name)}><Download />Export ratings</button>
            {can.create && c.status === "ACTIVE" && <button className="btn secondary" type="button" disabled={busy} onClick={() => void startReviews(c)}><Users />Start reviews</button>}
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
            return <li key={st} className={cn(done && "done", active && "active")}><b>{i + 1}</b><span title={due ? `Due ${dmy(due)}` : undefined}>{STEP_LABEL[st]}{board?.cycle?.id === c?.id && board?.kpis.eligible && (done || active) ? ` · ${board.stageProgress[st] ?? 0}%` : due && i === at && c?.status !== "CLOSED" ? ` · ${dm(due)}` : ""}</span></li>;
          })}
        </ol>
      </div>

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Self Reviews</span><span className="icon-well"><UserCheck /></span></div><strong>{kp ? `${kp.selfSubmitted} / ${kp.eligible}` : "0 / 0"}</strong><small className={cn(!!kp?.eligible && "up")}>{kp?.eligible ? `${Math.round((kp.selfSubmitted / kp.eligible) * 100)}% submitted` : "Reviews not started"}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Manager Reviews</span><span className="icon-well"><ClipboardCheck /></span></div><strong>{kp ? `${kp.managerSubmitted} / ${kp.eligible}` : "0 / 0"}</strong><small>{kp?.eligible ? `${Math.round((kp.managerSubmitted / kp.eligible) * 100)}%` : ""}{c?.managerReviewDue ? `${kp?.eligible ? " · " : ""}Closes ${dmy(c.managerReviewDue)}` : kp?.eligible ? "" : "No due date set"}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Avg Rating (so far)</span><span className="icon-well"><Star /></span></div><strong>{kp?.avgRating != null ? kp.avgRating.toFixed(1) : "—"} / {c?.ratingScaleMax ?? 5}</strong><small>{kp?.previousAvg != null ? `Previous cycle: ${kp.previousAvg.toFixed(1)}` : kp?.avgRating != null ? "From manager and final ratings" : "No ratings yet"}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Goals On Track</span><span className="icon-well"><Target /></span></div><strong>{kp?.goalsTotal ? `${Math.round((kp.goalsOnTrack / kp.goalsTotal) * 100)}%` : "—"}</strong><small>{kp?.goalsTotal ? `${kp.goalsOnTrack} of ${kp.goalsTotal} KRAs` : "No goals set yet"}</small></div>
      </div>

      <div className="split mb">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Review cycle{c ? ` — ${c.name}` : ""}</h3><p>{board?.cycle ? `${board.kpis.eligible} review${board.kpis.eligible === 1 ? "" : "s"} in progress` : "No cycle"}</p></div></div>
          <div className="toolbar">
            <label className="search-field"><Search /><input placeholder="Search employee…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <select aria-label="Department" value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}><option value="">All departments</option>{board?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <span className="spacer" />
            <div className="chips">{([["", "All"], ["SELF_PENDING", "Self pending"], ["AWAITING_MANAGER", "Awaiting manager"], ["REVIEWED", "Reviewed"], ["CALIBRATED", "Calibrated"], ["SIGNED_OFF", "Signed off"]] as const).map(([v, l]) => <button key={l} type="button" className={cn(stage === v && "active")} onClick={() => { setStage(v); setPage(1); }}>{l}{v && board?.counts[v] ? <i>{board.counts[v]}</i> : null}</button>)}</div>
          </div>
          {!board ? <Skeleton style={{ height: 200 }} /> : !board.reviews.length ? (
            <EmptyState icon={<ClipboardCheck />} title={board.kpis.eligible ? "No review matches" : "No reviews yet"}
              description={board.kpis.eligible ? "Try another search, department or stage." : c?.status === "ACTIVE" ? "Start reviews to create one for each eligible employee." : "Open the cycle, then start reviews."}
              action={!board.kpis.eligible && can.create && c?.status === "ACTIVE" ? <button className="btn primary sm" type="button" disabled={busy} onClick={() => void startReviews(c)}><Users />Start reviews</button> : undefined} />
          ) : (<>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Employee</th><th>Manager</th><th className="num">Goals</th><th className="num">Self</th><th className="num">Manager</th><th>Stage</th></tr></thead>
              <tbody>{board.reviews.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} className={cn(focus?.employeeId === r.employee.id && "selected")}
                  onClick={() => { if (focus?.employeeId !== r.employee.id) setGoals(null); setFocus({ employeeId: r.employee.id, name: r.employee.name, managerComment: r.managerComment, manager: r.manager?.name ?? null, score: r.finalRating ?? r.managerRating, label: r.ratingLabel }); }}
                  onDoubleClick={() => setReview(r.id)}>
                  <td><div className="cell-user"><span className="avatar sm">{tInitials(r.employee.name)}</span><div><b>{r.employee.name}</b><small>{r.employee.designation ?? ""}</small></div></div></td>
                  <td>{r.manager?.name ?? "—"}</td>
                  <td className={cn("num", r.goalAchievementPct == null && "zero")}>{r.goalAchievementPct != null ? `${r.goalAchievementPct}%` : r.goals ? `${r.goals} set` : "—"}</td>
                  <td className={cn("num", r.selfRating == null && "zero")}>{tNum(r.selfRating)}</td>
                  <td className={cn("num", r.managerRating == null && "zero")}>{tNum(r.managerRating)}</td>
                  <td>{r.pipSuggested && r.stage !== "SELF_PENDING" ? <span className="badge danger">PIP suggested</span> : <span className={cn("badge", r.stage === "AWAITING_MANAGER" ? "warn" : ["REVIEWED", "CALIBRATED", "SIGNED_OFF"].includes(r.stage) ? "good" : "neutral")}>{labelOf(lookups, "PerformanceReviewStage", r.stage)}</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <TableFoot label={`Showing ${(page - 1) * PAGE + 1}–${(page - 1) * PAGE + board.reviews.length} of ${board.total} · double-click to open`} page={page} pages={Math.max(1, Math.ceil(board.total / PAGE))} go={setPage} />
          </>)}
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Goals &amp; KRAs{focus ? ` — ${focus.name}` : ""}</h3><p>{focus ? (focus.score != null ? `Weighted score ${focus.score.toFixed(1)}${focus.label ? ` · ${labelOf(lookups, "RatingLabel", focus.label)}` : ""}` : "Not rated yet") : "Pick an employee to see their goals"}</p></div>
            {focus && can.create && c?.status !== "CLOSED" && <div className="panel-actions"><button className="btn ghost sm" type="button" onClick={() => setGoalEdit("new")}><Plus />Goal</button></div>}</div>
          {!focus ? <EmptyState icon={<Target />} title="No employee picked" description="Click a review to see that employee's goals and KRAs." />
            : !goals ? <Skeleton style={{ height: 160 }} />
            : !goals.length ? <EmptyState icon={<Target />} title="No goals yet" description="Goals and KRAs are set during goal setting." />
            : <PerfGoalLines goals={goals} onPick={can.edit ? (g) => setGoalEdit(g) : undefined} />}
          {focus?.managerComment && <div className="banner info mt"><MessageSquare /><div><b>Manager comment</b><p>“{focus.managerComment}”{focus.manager ? ` — ${focus.manager}` : ""}</p></div></div>}
        </div>
      </div>

      <div className="panel mb">
        <div className="panel-head"><div><h3>9-Box Talent Grid</h3><p>Performance (x) vs potential (y){kp ? ` · ${kp.eligible} employees` : ""} · {board?.counts.CALIBRATED || board?.counts.SIGNED_OFF ? "calibrated where done" : "draft before calibration"}</p></div>
          <div className="panel-actions"><button className="btn ghost sm" type="button" disabled={!board?.cycle} onClick={() => setCalib(true)}>Open calibration</button></div></div>
        {!board?.nineBox.some((b) => b.count) ? <EmptyState icon={<Grid3x3 />} title="No ratings to plot" description="The grid fills in from manager review bands and calibration." /> : (
          <div className="grid-3">
            {PERF_NINE_BOX.map(([box, label, desc]) => {
              const b = board.nineBox.find((x) => x.box === box);
              return (
                <div key={box} className="card"><div className="row"><b>{label}</b><span className="spacer" /><span className={cn("badge", NINE_TONE[box])}>{b?.count ?? 0}</span></div>
                  <small className="muted">{b?.names.length ? `${b.names.join(", ")}${(b.count ?? 0) > b.names.length ? ` +${b.count - b.names.length}` : ""}` : desc}</small></div>
              );
            })}
          </div>
        )}
      </div>

      {review && <PerfReviewDrawer id={review} can={can} lookups={lookups} ratingMax={c?.ratingScaleMax ?? 5} onClose={() => setReview(null)} onChanged={reload} />}
      {goalEdit && focus && <PerfGoalModal goal={goalEdit === "new" ? null : goalEdit} employeeId={focus.employeeId} cycleId={cycleId} canDelete={can.remove} onClose={() => setGoalEdit(null)} onSaved={() => { setGoalEdit(null); reload(); }} />}
      {calib && board?.cycle && <CalibrationBoard cycleId={board.cycle.id} lookups={lookups} onOpen={(id) => { setCalib(false); setReview(id); }} onClose={() => setCalib(false)} />}

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

/** Ratings of the shown reviews as a CSV download. */
function exportRatings(b: PerfBoard, name: string) {
  const head = ["Employee", "Code", "Manager", "Stage", "Self", "Manager rating", "Final", "Label", "Performance", "Potential", "9-box", "Increment %"];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = b.reviews.map((r) => [r.employee.name, r.employee.code, r.manager?.name, r.stage, r.selfRating, r.managerRating, r.finalRating, r.ratingLabel, r.performanceBand, r.potentialBand, r.nineBox, r.incrementPctRecommended].map(cell).join(","));
  const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name} ratings.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

/** Calibration board (template "Open calibration"): reviewed and calibrated reviews of the cycle, opened one by one. */
function CalibrationBoard({ cycleId, lookups, onOpen, onClose }: { cycleId: string; lookups: ReturnType<typeof useLookups>; onOpen: (id: string) => void; onClose: () => void }) {
  const [rows, setRows] = useState<PerfBoard["reviews"] | null>(null);
  useEffect(() => {
    Promise.all([getPerfBoard({ cycle: cycleId, stage: "REVIEWED", pageSize: 100 }), getPerfBoard({ cycle: cycleId, stage: "CALIBRATED", pageSize: 100 })])
      .then(([a, b]) => setRows([...a.reviews, ...b.reviews])).catch(() => setRows([]));
  }, [cycleId]);
  return (
    <Drawer open wide onClose={onClose} title="Calibration board" subtitle="Reviews with a manager rating, ready to calibrate or sign off">
      {!rows ? <Skeleton style={{ height: 200 }} /> : !rows.length ? <EmptyState icon={<Grid3x3 />} title="Nothing to calibrate" description="Reviews appear here once the manager review is submitted." /> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Employee</th><th className="num">Self</th><th className="num">Manager</th><th className="num">Final</th><th>Bands</th><th>Stage</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => onOpen(r.id)}>
              <td><b>{r.employee.name}</b><small>{r.employee.department ?? ""}</small></td><td className="num">{tNum(r.selfRating)}</td><td className="num">{tNum(r.managerRating)}</td><td className="num">{tNum(r.finalRating)}</td>
              <td>{r.performanceBand ? labelOf(lookups, "PerformanceBand", r.performanceBand) : "—"} / {r.potentialBand ? labelOf(lookups, "PotentialBand", r.potentialBand) : "—"}</td>
              <td><span className="badge neutral">{labelOf(lookups, "PerformanceReviewStage", r.stage)}</span></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Drawer>
  );
}
