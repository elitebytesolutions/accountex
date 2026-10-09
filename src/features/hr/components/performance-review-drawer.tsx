"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PERF_BANDS, PERF_DEFAULT_COMPETENCIES, type PerfFeedback, type PerfGoal, type PerfOneOnOne, type PerfReviewDetail } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, toneOf, type useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createPerfGoal, deletePerfGoal, getPerfReview, listOneOnOnes, listPerfFeedback, perfReviewStep, updatePerfGoal } from "../talent-ops-api";
import { tDm, tDmy, tNum, tLocalDate } from "./talent-ui";

type Lookups = ReturnType<typeof useLookups>;
type Can = { create: boolean; edit: boolean; remove: boolean };
type KrForm = { id?: string; title: string; weightPct: string; unit: string; startValue: string; targetValue: string; currentValue: string; progressPct: string };
type GoalForm = { goalKind: string; title: string; description: string; weightPct: string; progressPct: string; dropped: boolean; keyResults: KrForm[] };
const str = (v: number | null | undefined) => (v == null ? "" : String(v));
const blankKr = (): KrForm => ({ title: "", weightPct: "", unit: "", startValue: "", targetValue: "", currentValue: "", progressPct: "0" });
const goalForm = (g: PerfGoal | null): GoalForm => g ? {
  goalKind: g.goalKind, title: g.title, description: g.description ?? "", weightPct: String(g.weightPct), progressPct: String(g.progressPct), dropped: g.status === "DROPPED",
  keyResults: g.keyResults.map((k) => ({ id: k.id, title: k.title, weightPct: str(k.weightPct), unit: k.unit ?? "", startValue: str(k.startValue), targetValue: str(k.targetValue), currentValue: str(k.currentValue), progressPct: String(k.progressPct) })),
} : { goalKind: "KRA", title: "", description: "", weightPct: "20", progressPct: "0", dropped: false, keyResults: [] };
export const goalTone = (status: string) => (status === "AT_RISK" ? "danger" : status === "NEEDS_FOCUS" ? "warn" : "");

/** Goals & KRAs list (template panel): weighted lines with progress bars. */
export function PerfGoalLines({ goals, onPick }: { goals: PerfGoal[]; onPick?: (g: PerfGoal) => void }) {
  return (
    <div className="stack">
      {goals.map((g) => (
        <div key={g.id} style={onPick ? { cursor: "pointer" } : undefined} onClick={() => onPick?.(g)}>
          <div className="row small"><b>{g.title} ({g.weightPct}%)</b><span className="spacer" /><span>{g.status === "ACHIEVED" ? "Done" : g.status === "DROPPED" ? "Dropped" : `${g.progressPct}%`}</span></div>
          <div className={cn("progress", goalTone(g.status))}><i style={{ width: `${Math.min(100, g.progressPct)}%` }} /></div>
          <small className="muted">{g.keyResults.length ? `${g.keyResults.length} key result${g.keyResults.length === 1 ? "" : "s"} · ` : ""}{g.status.replace(/_/g, " ").toLowerCase()}</small>
        </div>
      ))}
    </div>
  );
}

/** Goal add / edit (KRA or OKR with key results). */
export function PerfGoalModal({ goal, employeeId, cycleId, busy, onClose, onSaved, canDelete }: {
  goal: PerfGoal | null; employeeId: string; cycleId: string | null; busy?: boolean; onClose: () => void; onSaved: () => void; canDelete?: boolean;
}) {
  const toast = useToast();
  const [f, setF] = useState<GoalForm>(goalForm(goal));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const setKr = (i: number, k: keyof KrForm, v: string) => setF({ ...f, keyResults: f.keyResults.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const save = async () => {
    setSaving(true); setErrs({});
    const body = { ...f, cycleId, keyResults: f.keyResults.map((k) => ({ ...k, progressPct: k.progressPct || "0" })) };
    try {
      if (goal) await updatePerfGoal(goal.id, { ...body, rowVersion: goal.rowVersion }); else await createPerfGoal({ ...body, employeeId });
      toast(goal ? "Goal saved" : "Goal added", { tone: "good" }); onSaved();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the goal"), { tone: "danger" }); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!goal) return;
    setSaving(true);
    try { await deletePerfGoal(goal.id, goal.rowVersion); toast("Goal deleted", { tone: "good" }); onSaved(); } catch (e) { toast(apiMessage(e, "Could not delete the goal"), { tone: "danger" }); } finally { setSaving(false); }
  };
  return (
    <Modal open wide onClose={onClose} title={goal ? goal.title : "New goal"} subtitle="Progress and status follow the key results."
      foot={<>
        {goal && canDelete && <button className="btn ghost" type="button" disabled={saving || busy} onClick={() => void remove()}><Trash2 />Delete</button>}
        <span className="spacer" /><button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={saving || busy} onClick={() => void save()}>{goal ? "Save goal" : "Add goal"}</button>
      </>}>
      <FormGrid>
        <Field label="Goal" required full error={errs.title}><input value={f.title} maxLength={200} placeholder="e.g. Achieve Rs 18M H1 sales" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Kind" error={errs.goalKind}><select value={f.goalKind} onChange={(e) => setF({ ...f, goalKind: e.target.value })}><option value="KRA">KRA</option><option value="OKR">OKR</option></select></Field>
        <Field label="Weight (%)" required error={errs.weightPct}><input type="number" min={1} max={100} value={f.weightPct} onChange={(e) => setF({ ...f, weightPct: e.target.value })} /></Field>
        {!f.keyResults.length && <Field label="Progress (%)" error={errs.progressPct}><input type="number" min={0} max={100} value={f.progressPct} onChange={(e) => setF({ ...f, progressPct: e.target.value })} /></Field>}
        <Field label="Description" full error={errs.description}><textarea rows={2} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {goal && <Check full label="Dropped (no longer counts)" checked={f.dropped} onChange={(e) => setF({ ...f, dropped: e.target.checked })} />}
      </FormGrid>
      <div className="form-section row"><h4>Key results</h4><span className="spacer" /><button className="btn ghost sm" type="button" disabled={f.keyResults.length >= 10} onClick={() => setF({ ...f, keyResults: [...f.keyResults, blankKr()] })}><Plus />Add key result</button></div>
      {!f.keyResults.length ? <p className="small muted">No key results: progress is set on the goal itself.</p> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Key result</th><th className="num">Weight</th><th className="num">Start</th><th className="num">Target</th><th className="num">Current</th><th className="num">Progress %</th><th /></tr></thead>
          <tbody>{f.keyResults.map((k, i) => (
            <tr key={k.id ?? i}>
              <td><input value={k.title} aria-label="Key result" maxLength={200} onChange={(e) => setKr(i, "title", e.target.value)} />{errs[`keyResults.${i}.title`] && <small className="neg">{errs[`keyResults.${i}.title`]}</small>}</td>
              {(["weightPct", "startValue", "targetValue", "currentValue", "progressPct"] as const).map((c) => <td key={c} className="num"><input type="number" style={{ width: 90 }} aria-label={c} value={k[c]} onChange={(e) => setKr(i, c, e.target.value)} /></td>)}
              <td><button className="btn ghost sm" type="button" aria-label="Remove" onClick={() => setF({ ...f, keyResults: f.keyResults.filter((_, j) => j !== i) })}><Trash2 /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="small muted mt">With a target, progress comes from start → current → target; otherwise from the percent you enter.</p>
    </Modal>
  );
}

type ManagerForm = { managerRating: string; managerComment: string; performanceBand: string; potentialBand: string; pipSuggested: boolean; ratings: Record<string, string> };
type CalForm = { finalRating: string; performanceBand: string; potentialBand: string; pipSuggested: boolean; incrementPctRecommended: string; ratingLabel: string };

/** One review: goals, ratings, competencies, feedback, 1:1s, and the stage actions HR takes (manager review, calibrate, sign-off). */
export function PerfReviewDrawer({ id, can, lookups, ratingMax, onClose, onChanged }: { id: string; can: Can; lookups: Lookups; ratingMax: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [r, setR] = useState<PerfReviewDetail | null>(null);
  const [fb, setFb] = useState<PerfFeedback[]>([]);
  const [meet, setMeet] = useState<PerfOneOnOne[]>([]);
  const [tab, setTab] = useState<"review" | "history">("review");
  const [goal, setGoal] = useState<PerfGoal | "new" | null>(null);
  const [mgr, setMgr] = useState<ManagerForm | null>(null);
  const [cal, setCal] = useState<CalForm | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getPerfReview(id).then(async (x) => {
      if (cancelled) return;
      setR(x);
      const [f, m] = await Promise.all([listPerfFeedback(x.employee.id), listOneOnOnes(x.employee.id)]);
      if (!cancelled) { setFb(f); setMeet(m); }
    }).catch((e: unknown) => toast(apiMessage(e, "Could not open the review"), { tone: "danger" }));
    return () => { cancelled = true; };
  }, [id, attempt, toast]);
  const refresh = () => { setAttempt((n) => n + 1); onChanged(); };
  const step = async (s: "manager" | "calibrate" | "sign-off", body: Record<string, unknown>, done: string) => {
    if (!r) return;
    setBusy(true); setErrs({});
    try { setR(await perfReviewStep(r.id, s, { ...body, rowVersion: r.rowVersion })); toast(done, { tone: "good" }); setMgr(null); setCal(null); onChanged(); }
    catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the review"), { tone: "danger" }); } finally { setBusy(false); }
  };
  if (!r) return null;
  const selfComps = r.competencies.filter((c) => c.raterRole === "SELF");
  const mgrComps = r.competencies.filter((c) => c.raterRole === "MANAGER");
  const comps = [...new Set([...PERF_DEFAULT_COMPETENCIES.map((c) => c[0] as string), ...r.competencies.map((c) => c.competency)])];
  const bandSel = (v: string, set: (x: string) => void, label: string, err?: string) => (
    <Field label={label} error={err}><select value={v} onChange={(e) => set(e.target.value)}><option value="">—</option>{PERF_BANDS.map((b) => <option key={b} value={b}>{labelOf(lookups, "PerformanceBand", b)}</option>)}</select></Field>
  );
  return (
    <>
      <Drawer open wide onClose={onClose} title={r.employee.name} subtitle={`${r.employee.designation ?? ""}${r.manager ? ` · reviewed by ${r.manager.name}` : ""}`}
        foot={<>
          {can.edit && r.stage === "AWAITING_MANAGER" && <button className="btn primary" type="button" onClick={() => setMgr({ managerRating: str(r.managerRating) || "3", managerComment: r.managerComment ?? "", performanceBand: r.performanceBand ?? "", potentialBand: r.potentialBand ?? "", pipSuggested: r.pipSuggested, ratings: {} })}>Manager review</button>}
          {can.edit && ["REVIEWED", "CALIBRATED"].includes(r.stage) && <button className="btn secondary" type="button" onClick={() => setCal({ finalRating: str(r.finalRating ?? r.managerRating), performanceBand: r.performanceBand ?? "", potentialBand: r.potentialBand ?? "", pipSuggested: r.pipSuggested, incrementPctRecommended: str(r.incrementPctRecommended), ratingLabel: r.ratingLabel ?? "" })}>Calibrate</button>}
          {can.edit && r.stage === "CALIBRATED" && <button className="btn primary" type="button" disabled={busy} onClick={() => void step("sign-off", {}, "Review signed off")}>Sign off</button>}
        </>}>
        <div className="tabs mb"><button type="button" className={cn(tab === "review" && "active")} onClick={() => setTab("review")}>Review</button><button type="button" className={cn(tab === "history" && "active")} onClick={() => setTab("history")}>History</button></div>
        {tab === "history" ? <HistoryTab schema="HumanResources" table="PerformanceReviews" id={r.id} /> : <>
          <div className="row mb"><span className={cn("badge", toneOf(lookups, "PerformanceReviewStage", r.stage))}>{labelOf(lookups, "PerformanceReviewStage", r.stage)}</span>{r.pipSuggested && <span className="badge danger">PIP suggested</span>}{r.nineBox && <span className="badge info">{r.nineBox.replace(/_/g, " ").toLowerCase()}</span>}</div>
          <div className="dl mb">
            <div><span>Self rating</span><b>{tNum(r.selfRating)} / {ratingMax}{r.selfSubmittedAt ? ` · ${tDm(tLocalDate(r.selfSubmittedAt))}` : ""}</b></div>
            <div><span>Manager rating</span><b>{tNum(r.managerRating)} / {ratingMax}{r.managerSubmittedAt ? ` · ${tDm(tLocalDate(r.managerSubmittedAt))}` : ""}</b></div>
            <div><span>Final rating</span><b>{tNum(r.finalRating)}{r.ratingLabel ? ` · ${labelOf(lookups, "RatingLabel", r.ratingLabel)}` : ""}</b></div>
            <div><span>Goal achievement</span><b>{r.goalAchievementPct != null ? `${r.goalAchievementPct}%` : "—"}</b></div>
            <div><span>Performance / potential</span><b>{r.performanceBand ? labelOf(lookups, "PerformanceBand", r.performanceBand) : "—"} / {r.potentialBand ? labelOf(lookups, "PotentialBand", r.potentialBand) : "—"}</b></div>
            <div><span>Increment recommended</span><b>{r.incrementPctRecommended != null ? `${r.incrementPctRecommended}%` : "—"}</b></div>
          </div>
          {r.selfComment && <div className="banner info"><div><b>Self assessment</b><p>“{r.selfComment}”</p></div></div>}
          {r.managerComment && <div className="banner info"><div><b>Manager comment</b><p>“{r.managerComment}” — {r.manager?.name ?? "Manager"}</p></div></div>}
          <div className="row mb"><h4>Goals &amp; KRAs</h4><span className="spacer" />{can.create && r.stage !== "SIGNED_OFF" && <button className="btn ghost sm" type="button" onClick={() => setGoal("new")}><Plus />Add goal</button>}</div>
          {r.goalsList.length ? <PerfGoalLines goals={r.goalsList} onPick={can.edit ? (g) => setGoal(g) : undefined} /> : <p className="small muted mb">No goals set for this cycle.</p>}
          {(selfComps.length > 0 || mgrComps.length > 0) && <>
            <h4 className="mt">Competencies</h4>
            <div className="table-wrap"><table className="tbl"><thead><tr><th>Competency</th><th className="num">Self</th><th className="num">Manager</th></tr></thead>
              <tbody>{comps.filter((c) => r.competencies.some((x) => x.competency === c)).map((c) => <tr key={c}><td>{c}</td><td className="num">{selfComps.find((x) => x.competency === c)?.rating ?? "—"}</td><td className="num">{mgrComps.find((x) => x.competency === c)?.rating ?? "—"}</td></tr>)}</tbody></table></div>
          </>}
          <h4 className="mt">Feedback</h4>
          {!fb.length ? <p className="small muted">No feedback yet.</p> : fb.map((f) => <div key={f.id} className="small mb"><b>{f.from.name}</b> · {f.status === "GIVEN" ? <>{f.tag ? `${f.tag.toLowerCase()} · ` : ""}“{f.body}”</> : <span className="muted">{f.status.toLowerCase()}</span>}</div>)}
          <h4 className="mt">1:1 meetings</h4>
          {!meet.length ? <p className="small muted">No 1:1s recorded.</p> : meet.slice(0, 5).map((m) => <div key={m.id} className="small mb"><b>{m.topic}</b> · {tDmy(m.meetingDate)} · {m.employee.name} with {m.manager.name}{m.actionItems.length ? ` · ${m.actionItems.filter((a) => a.done).length}/${m.actionItems.length} actions done` : ""}</div>)}
        </>}
      </Drawer>

      {goal && <PerfGoalModal goal={goal === "new" ? null : goal} employeeId={r.employee.id} cycleId={r.cycleId} canDelete={can.remove} onClose={() => setGoal(null)} onSaved={() => { setGoal(null); refresh(); }} />}

      {mgr && (
        <Modal open wide onClose={() => setMgr(null)} title={`Manager review · ${r.employee.name}`} subtitle="Submitting moves the review to Reviewed; calibration follows."
          foot={<><button className="btn secondary" type="button" onClick={() => setMgr(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy}
            onClick={() => void step("manager", { managerRating: mgr.managerRating, managerComment: mgr.managerComment, performanceBand: mgr.performanceBand || null, potentialBand: mgr.potentialBand || null, pipSuggested: mgr.pipSuggested, competencies: Object.entries(mgr.ratings).filter(([, v]) => v).map(([competency, rating]) => ({ competency, rating })) }, "Manager review submitted")}>Submit review</button></>}>
          <FormGrid>
            <Field label={`Overall rating (1–${Math.min(5, ratingMax)})`} required error={errs.managerRating}><input type="number" min={1} max={5} step={0.1} value={mgr.managerRating} onChange={(e) => setMgr({ ...mgr, managerRating: e.target.value })} /></Field>
            {bandSel(mgr.performanceBand, (v) => setMgr({ ...mgr, performanceBand: v }), "Performance band")}
            {bandSel(mgr.potentialBand, (v) => setMgr({ ...mgr, potentialBand: v }), "Potential band")}
            <Check label="Suggest a PIP" checked={mgr.pipSuggested} onChange={(e) => setMgr({ ...mgr, pipSuggested: e.target.checked })} />
            <Field label="Comment" full error={errs.managerComment}><textarea rows={3} maxLength={4000} value={mgr.managerComment} onChange={(e) => setMgr({ ...mgr, managerComment: e.target.value })} /></Field>
            {comps.map((c) => <Field key={c} label={`${c}${selfComps.find((x) => x.competency === c) ? ` (self ${selfComps.find((x) => x.competency === c)!.rating})` : ""}`}><select value={mgr.ratings[c] ?? ""} onChange={(e) => setMgr({ ...mgr, ratings: { ...mgr.ratings, [c]: e.target.value } })}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>)}
          </FormGrid>
        </Modal>
      )}

      {cal && (
        <Modal open onClose={() => setCal(null)} title={`Calibrate · ${r.employee.name}`} subtitle="The final rating and the 9-box bands; sign-off locks them."
          foot={<><button className="btn secondary" type="button" onClick={() => setCal(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={() => void step("calibrate", cal, "Review calibrated")}>Save calibration</button></>}>
          <FormGrid>
            <Field label="Final rating (1–5)" required error={errs.finalRating}><input type="number" min={1} max={5} step={0.1} value={cal.finalRating} onChange={(e) => setCal({ ...cal, finalRating: e.target.value })} /></Field>
            <Field label="Rating label" error={errs.ratingLabel} hint="Blank: from the final rating"><select value={cal.ratingLabel} onChange={(e) => setCal({ ...cal, ratingLabel: e.target.value })}><option value="">Automatic</option>{(lookups.RatingLabel ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            {bandSel(cal.performanceBand, (v) => setCal({ ...cal, performanceBand: v }), "Performance band", errs.performanceBand)}
            {bandSel(cal.potentialBand, (v) => setCal({ ...cal, potentialBand: v }), "Potential band", errs.potentialBand)}
            <Field label="Increment recommended (%)" error={errs.incrementPctRecommended}><input type="number" min={0} max={100} step={0.5} value={cal.incrementPctRecommended} onChange={(e) => setCal({ ...cal, incrementPctRecommended: e.target.value })} /></Field>
            <Check label="PIP suggested" checked={cal.pipSuggested} onChange={(e) => setCal({ ...cal, pipSuggested: e.target.checked })} />
          </FormGrid>
        </Modal>
      )}
    </>
  );
}
