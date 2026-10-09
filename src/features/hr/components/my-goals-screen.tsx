"use client";

import { ArrowDown, CalendarClock, Check, CircleCheck, ClipboardPen, Lock, MessageSquarePlus, MoveHorizontal, Plus, Send, Smile, Star, Target, TrendingUp, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { MyGoals, PerfGoal, PerfOneOnOne, PerfReviewItem } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  addMyOneOnOne, answerMyFeedback, createMyGoal, getMyGoals, giveMyFeedback, myGoalCheckIn, requestMyFeedback, setMyActionItems, submitMyManagerReview, submitMySelfReview,
} from "../talent-ops-api";
import { Av, EsRing, EsTracker } from "./ess-bits";
import { tDm, tDmy, tToday, tLocalDate } from "./talent-ui";

const STAR_WORD = ["", "Needs work", "Developing", "Solid", "Strong", "Role model"];
const ICONS = [TrendingUp, Users, Smile, Target, Star];
const STEP_OF: Record<string, number> = { SELF_PENDING: 1, AWAITING_MANAGER: 2, REVIEWED: 3, CALIBRATED: 4, SIGNED_OFF: 5 };
const status = (p: number, expected: number): [string, string] => (p >= 100 ? ["Achieved", "good"] : p - expected >= -15 ? ["On track", "good"] : p - expected >= -30 ? ["Needs focus", "warn"] : ["At risk", "danger"]);
const ovLabel = (v: number) => (v < 2 ? "Below expectations" : v < 3 ? "Partially meets" : v < 3.5 ? "Meets expectations" : v < 4.5 ? "Exceeds expectations" : "Outstanding");
/** The template's compact rupees: "Rs 11.5M of Rs 18M". */
const rsShort = (n: number) => (Math.abs(n) >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 100) / 10}K` : n.toLocaleString("en-PK", { maximumFractionDigits: 0 }));
const krValue = (k: PerfGoal["keyResults"][number], p: number) => {
  if (k.targetValue == null) return "Progress checked in by you";
  const start = k.startValue ?? 0;
  const cur = start + ((k.targetValue - start) * p) / 100;
  const f = (n: number) => (k.unit === "PKR" ? `Rs ${rsShort(n)}` : `${Math.round(n * 10) / 10}${k.unit === "PERCENT" ? "%" : ""}`);
  return `${f(cur)} of ${f(k.targetValue)}`;
};

/**
 * Template app/profile/goals (6A-ess.html + 9C-ess.js 12-goals): progress hero with the weighted OKR ring and check-in
 * save, the 5-step review tracker, objectives with key-result sliders, 1:1 notes with action items, feedback received,
 * the competency self-assessment and the 1:1 / request-feedback sheets. Added in the same style: feedback requests to
 * answer, the manager-review queue for people who review others, and adding an own goal. Own data only.
 */
export function MyGoalsScreen({ can }: { can: { edit: boolean } }) {
  const toast = useToast();
  const [data, setData] = useState<MyGoals | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [stars, setStars] = useState<Record<string, number>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [overall, setOverall] = useState(3.5);
  const [achievements, setAchievements] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"note" | "ask" | "goal" | "give" | null>(null);
  const [answer, setAnswer] = useState<MyGoals["feedbackToGive"][number] | null>(null);
  const [team, setTeam] = useState<PerfReviewItem | null>(null);
  const [glow, setGlow] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getMyGoals().then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load your goals" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!data) return <Skeleton style={{ height: 480 }} />;

  const mgr = data.manager?.name ?? "your manager";
  const review = data.review;
  const goals = data.goals.filter((g) => g.status !== "DROPPED");
  const krP = (g: PerfGoal, k: PerfGoal["keyResults"][number]) => progress[`${g.id}:${k.id}`] ?? k.progressPct;
  const goalP = (g: PerfGoal) => {
    if (!g.keyResults.length) return progress[`${g.id}:`] ?? g.progressPct;
    const w = g.keyResults.reduce((t, k) => t + (k.weightPct ?? 1), 0);
    return Math.round(g.keyResults.reduce((t, k) => t + krP(g, k) * (k.weightPct ?? 1), 0) / w);
  };
  const totalW = goals.reduce((t, g) => t + g.weightPct, 0);
  const all = totalW ? Math.round(goals.reduce((t, g) => t + goalP(g) * g.weightPct, 0) / totalW) : 0;
  const dirty = Object.keys(progress).length > 0;
  const krCount = goals.reduce((t, g) => t + g.keyResults.length, 0);
  const selfDue = data.cycle?.selfReviewDue;
  const daysLeft = selfDue ? Math.round((Date.parse(selfDue) - Date.parse(tToday())) / 86_400_000) : null;
  const selfOpen = review?.stage === "SELF_PENDING";
  const at = review ? STEP_OF[review.stage] ?? 1 : 0;
  const rated = data.competencies.filter((c) => stars[c.competency]).length;
  const mySelf = review?.competencies.filter((c) => c.raterRole === "SELF") ?? [];
  const run = async <T,>(key: string, work: () => Promise<T>, done: string, after?: (r: T) => void) => {
    setBusy(key);
    try { const r = await work(); toast(done, { tone: "good" }); after?.(r); return true; } catch (e) { toast(apiMessage(e, "Could not save that"), { tone: "danger" }); return false; } finally { setBusy(null); }
  };
  const saveCheckIn = () => run("save", () => myGoalCheckIn(Object.entries(progress).map(([key, p]) => { const [goalId, keyResultId] = key.split(":"); return { goalId: goalId!, keyResultId: keyResultId || null, progressPct: p }; })),
    `Check-in saved${data.manager ? ` · ${mgr} can see it` : ""}`, (r) => { setData(r); setProgress({}); });
  const submitSelf = () => {
    if (!review) return;
    const miss = data.competencies.length - rated;
    if (miss > 0) { toast(`Rate ${miss} more competenc${miss > 1 ? "ies" : "y"} to submit`, { tone: "warn" }); return; }
    return run("submit", () => submitMySelfReview(review.id, {
      selfRating: overall, selfComment: achievements, rowVersion: review.rowVersion,
      competencies: data.competencies.map((c) => ({ competency: c.competency, competencyDescription: c.description, rating: stars[c.competency], evidence: evidence[c.competency] ?? "" })),
    }), `Self-assessment submitted to ${mgr}`, (r) => setData(r));
  };
  const toReview = () => { formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setGlow(false); requestAnimationFrame(() => setGlow(true)); };
  const toggleAction = (m: PerfOneOnOne, i: number) => run(`act-${m.id}`, () => setMyActionItems(m.id, m.actionItems.map((a, j) => (j === i ? { ...a, done: !a.done } : a)), m.rowVersion), m.actionItems[i]!.done ? "Action reopened" : "Action done", (r) => setData(r));

  return (
    <>
      <PageHead eyebrow="My Profile / Growth" title="Goals & Reviews"
        description={`${data.cycle ? `${data.cycle.name} objectives` : "Your objectives"}, your self-assessment and 1:1 notes${data.manager ? ` with ${mgr}` : ""}.`}
        actions={<>
          {can.edit && <button className="btn secondary" type="button" onClick={() => setSheet("note")}><MessageSquarePlus />Add 1:1 note</button>}
          <button className="btn primary" type="button" disabled={!review} onClick={toReview}><ClipboardPen />Self-assessment</button>
        </>} />

      <div className="es-grid es-gl-top">
        <div className="es-card night es-gl-hero">
          <div className="es-gl-hero-l">
            <EsRing pct={all} size={120} stroke={3.4} tone="var(--lime)" label={<span>{all}%</span>} sub={data.cycle ? "Progress" : "No cycle"} className="es-gl-big" />
            <div>
              <span className="es-gl-eye">{data.cycle ? `${data.cycle.name} · ${tDm(data.cycle.periodStart)} – ${tDmy(data.cycle.periodEnd)}` : "No active appraisal cycle"}</span>
              <h2>{!goals.length ? `No goals yet, ${data.employee.name.split(" ")[0]}.` : all >= data.expectedPct ? `You’re ahead of plan, ${data.employee.name.split(" ")[0]}.` : `A little behind plan, ${data.employee.name.split(" ")[0]}.`}</h2>
              <p>{data.cycle ? `Expected progress today is ${data.expectedPct}%. Your weighted score ${all >= data.expectedPct ? "leads it" : "trails it"} by ${Math.abs(all - data.expectedPct)} points.` : "Goals and reviews start when HR opens an appraisal cycle."}</p>
              <div className="es-row wrap">
                <span className="es-gl-chip"><Target />{goals.length} objective{goals.length === 1 ? "" : "s"} · {krCount} key result{krCount === 1 ? "" : "s"}</span>
                {selfDue && <span className="es-gl-chip"><CalendarClock />Self-review due {tDm(selfDue)}{daysLeft != null && daysLeft >= 0 ? ` · ${daysLeft} days` : ""}</span>}
              </div>
            </div>
          </div>
          <div className={cn("es-gl-save", dirty && "on")}><span>Unsaved check-in</span><button className="btn lime sm" type="button" disabled={busy === "save"} onClick={() => void saveCheckIn()}><Check />{busy === "save" ? "Saving…" : "Save check-in"}</button></div>
        </div>
        <div className="es-card es-gl-cycle">
          <div className="es-head"><h3>{data.cycle ? (/\breview\b/i.test(data.cycle.name) ? data.cycle.name : `${data.cycle.name} review`) : "Review cycle"}</h3><span className="spacer" />
            <span className={cn("badge dot", !review ? "neutral" : review.stage === "SELF_PENDING" ? "warn" : review.stage === "SIGNED_OFF" ? "good" : "info")}>{!review ? "Not started" : review.stage === "SELF_PENDING" ? "Self-assessment" : review.stage === "AWAITING_MANAGER" ? "With manager" : review.stage === "SIGNED_OFF" ? "Signed off" : "Calibration"}</span></div>
          <EsTracker steps={["Goals set", "Self-review", "Manager", "Calibration", "Sign-off"]} at={at} subs={[goals.length ? `${goals.length} goals` : "—", review?.selfSubmittedAt ? `Sent ${tDm(tLocalDate(review.selfSubmittedAt))}` : selfDue ? `Due ${tDm(selfDue)}` : null, data.manager?.name ?? null, data.cycle?.calibrationStart ? `HR · ${tDm(data.cycle.calibrationStart)}` : "HR", data.cycle?.signOffDue ? tDm(data.cycle.signOffDue) : null]} />
          {data.manager && <div className="es-gl-mgr"><Av name={data.manager.name} /><div><b>{data.manager.name}</b><small>{data.manager.designation ?? "Manager"} · reviews after you submit</small></div><span className="spacer" />{selfOpen && <button className="btn secondary sm" type="button" onClick={toReview}>Start<ArrowDown /></button>}</div>}
        </div>
      </div>

      <div className="es-grid es-wide">
        <div className="es-col">
          <div className="es-head es-gl-sh"><h3>Objectives &amp; key results</h3><span className="spacer" />
            {can.edit && data.cycle && <button className="es-link" type="button" onClick={() => setSheet("goal")}>Add goal<Plus /></button>}
            {goals.length > 0 && <span className="es-label"><MoveHorizontal /> Drag a slider to update progress</span>}</div>
          {!goals.length ? <div className="es-card"><div className="es-empty"><span className="icon-tile"><Target /></span><b>No objectives yet</b><span>{data.cycle ? "Add your objectives, or HR and your manager set them during goal setting." : "Objectives are set once an appraisal cycle opens."}</span></div></div>
            : goals.map((g, i) => {
              const p = goalP(g), st = status(p, data.expectedPct), Ic = ICONS[i % ICONS.length]!;
              return (
                <div key={g.id} className="es-card es-gl-obj">
                  <div className="es-gl-ohead"><EsRing pct={p} size={64} stroke={4} className="es-gl-oring" />
                    <div className="es-gl-otitle"><small><Ic style={{ width: 12, height: 12 }} /> Objective {i + 1} · weight {g.weightPct}%</small><b>{g.title}</b>
                      <div className="es-row wrap"><span className={cn("badge dot", st[1])}>{st[0]}</span><span className="es-label">{g.keyResults.length} key result{g.keyResults.length === 1 ? "" : "s"} · owner {data.employee.name}</span></div></div></div>
                  <div className="es-gl-krs">
                    {(g.keyResults.length ? g.keyResults : [null]).map((k) => {
                      const key = `${g.id}:${k?.id ?? ""}`, v = k ? krP(g, k) : goalP(g);
                      return (
                        <div key={key} className={cn("es-gl-kr", v >= 100 && "done")}>
                          <div className="es-gl-kr-top"><b>{k?.title ?? g.title}</b><span className="es-gl-kr-p">{v}%</span></div>
                          <input type="range" min={0} max={100} value={v} disabled={!can.edit || review?.stage === "SIGNED_OFF"} style={{ "--v": `${v}%` } as CSSProperties} aria-label={`${k?.title ?? g.title} progress`}
                            onChange={(e) => setProgress({ ...progress, [key]: Number(e.target.value) })} />
                          <small>{k ? krValue(k, v) : `${v}% of the goal`}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="es-col">
          {data.teamReviews.length > 0 && (
            <div className="es-card"><div className="es-head"><h3>Reviews waiting for you</h3><span className="es-count">{data.teamReviews.length}</span></div>
              {data.teamReviews.map((r) => <div key={r.id} className="es-gl-mgr"><Av name={r.employee.name} /><div><b>{r.employee.name}</b><small>{r.employee.designation ?? ""} · self {r.selfRating?.toFixed(1) ?? "—"}</small></div><span className="spacer" />{can.edit && <button className="btn secondary sm" type="button" onClick={() => setTeam(r)}>Review</button>}</div>)}
            </div>
          )}
          <div className="es-card"><div className="es-head"><h3>1:1 notes</h3><span className="spacer" />{can.edit && <button className="es-link" type="button" onClick={() => setSheet("note")}>Add note<Plus /></button>}</div>
            {!data.oneOnOnes.length ? <p className="es-label">No 1:1 notes yet.</p> : (
              <ol className="es-gl-tl">{data.oneOnOnes.map((m, i) => (
                <li key={m.id} className="es-gl-note es-in" style={{ "--i": i } as CSSProperties}><span className="es-gl-dot" /><div className="es-gl-note-b">
                  <div className="es-row wrap"><b>{m.topic}</b><span className="spacer" /><small>{tDmy(m.meetingDate)} · with {m.employee.id === data.employee.id ? m.manager.name : m.employee.name}</small></div>
                  {m.notes && <p>{m.notes}</p>}
                  {m.actionItems.length > 0 && <div className="es-gl-acts">{m.actionItems.map((a, j) => <label key={j} className={cn("es-gl-act", a.done && "done")}><input type="checkbox" checked={a.done} disabled={!can.edit || busy === `act-${m.id}`} onChange={() => void toggleAction(m, j)} /><span>{a.text}</span></label>)}</div>}
                </div></li>
              ))}</ol>
            )}
          </div>
          <div className="es-card"><div className="es-head"><h3>Feedback received</h3><span className="es-count">{data.feedbackReceived.length}</span><span className="spacer" />{can.edit && <button className="es-link" type="button" onClick={() => setSheet("ask")}>Request<Send /></button>}</div>
            {!data.feedbackReceived.length ? <p className="es-label">No feedback yet. Ask up to three colleagues.</p> : data.feedbackReceived.map((f) => (
              <figure key={f.id} className="es-gl-fb"><blockquote>“{f.body}”</blockquote><figcaption><Av name={f.from.name} size="xs" /><b>{f.from.name}</b><small>{f.relationship ? `${f.relationship.charAt(0)}${f.relationship.slice(1).toLowerCase().replace(/_/g, " ")} · ` : ""}{f.givenAt ? tDm(tLocalDate(f.givenAt)) : ""}</small><span className="spacer" /><span className={cn("badge", f.tag === "GROWTH" ? "info" : "good")}>{f.tag === "GROWTH" ? "Growth" : "Strength"}</span></figcaption></figure>
            ))}
          </div>
          {(data.feedbackToGive.length > 0 || can.edit) && (
            <div className="es-card"><div className="es-head"><h3>Feedback to give</h3><span className="es-count">{data.feedbackToGive.length}</span><span className="spacer" />{can.edit && <button className="es-link" type="button" onClick={() => setSheet("give")}>Give<Send /></button>}</div>
              {!data.feedbackToGive.length ? <p className="es-label">No one is waiting for your feedback.</p> : data.feedbackToGive.map((f) => (
                <div key={f.id} className="es-gl-mgr"><Av name={f.to.name} /><div><b>{f.to.name}</b><small>asked {f.requestedAt ? tDm(tLocalDate(f.requestedAt)) : ""}</small></div><span className="spacer" />{can.edit && <button className="btn secondary sm" type="button" onClick={() => setAnswer(f)}>Answer</button>}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div ref={formRef} className={cn("es-card es-gl-form", glow && "es-gl-glow", review && !selfOpen && "es-gl-sent")} onAnimationEnd={() => setGlow(false)}>
        <div className="es-head"><div><h3>{data.cycle ? `${data.cycle.name} self-assessment` : "Self-assessment"}</h3><p>Rate yourself honestly against each competency. {data.manager ? `${data.manager.name.split(" ")[0]} sees this after you submit.` : "HR sees this after you submit."}</p></div><span className="spacer" />
          <div className="es-gl-meter"><span><b>{selfOpen ? rated : mySelf.length}</b>/{data.competencies.length} rated</span><div className="progress"><i style={{ width: `${((selfOpen ? rated : mySelf.length) / Math.max(1, data.competencies.length)) * 100}%` }} /></div></div></div>
        {!review ? <p className="es-label">Your review opens when HR starts reviews for the cycle.</p> : <>
          <div className="es-gl-comps">
            {data.competencies.map((c) => {
              const done = selfOpen ? stars[c.competency] ?? 0 : mySelf.find((x) => x.competency === c.competency)?.rating ?? 0;
              return (
                <div key={c.competency} className={cn("es-gl-comp", done > 0 && "rated")}>
                  <div className="es-gl-comp-l"><b>{c.competency}</b><small>{c.description}</small></div>
                  <div className="es-gl-stars" role="radiogroup" aria-label={c.competency}>
                    {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" disabled={!selfOpen || !can.edit} className={cn(n <= done && "on")} aria-label={`${n} of 5`} onClick={() => setStars({ ...stars, [c.competency]: n })}><Star /></button>)}
                    <span className="es-gl-sl">{done ? STAR_WORD[done] : "Not rated"}</span>
                  </div>
                  <textarea rows={1} placeholder="Evidence or example (optional)" aria-label={`${c.competency} comment`} disabled={!selfOpen || !can.edit}
                    value={selfOpen ? evidence[c.competency] ?? "" : mySelf.find((x) => x.competency === c.competency)?.evidence ?? ""} onChange={(e) => setEvidence({ ...evidence, [c.competency]: e.target.value })} />
                </div>
              );
            })}
          </div>
          <div className="es-grid es-g2 es-gl-bottom">
            <div className="es-field"><span>Overall self-rating <b className="es-gl-ov">{(selfOpen ? overall : review.selfRating ?? 0).toFixed(1)}</b> <small className="es-label">{ovLabel(selfOpen ? overall : review.selfRating ?? 0)}</small></span>
              <input type="range" min={1} max={5} step={0.5} value={selfOpen ? overall : review.selfRating ?? 1} disabled={!selfOpen || !can.edit} style={{ "--v": `${(((selfOpen ? overall : review.selfRating ?? 1) - 1) / 4) * 100}%` } as CSSProperties} onChange={(e) => setOverall(Number(e.target.value))} />
              <div className="es-gl-scale"><span>Below</span><span>Meets</span><span>Exceeds</span><span>Outstanding</span></div></div>
            <label className="es-field"><span>Key achievements this period</span><textarea rows={3} disabled={!selfOpen || !can.edit} value={selfOpen ? achievements : review.selfComment ?? ""} onChange={(e) => setAchievements(e.target.value)} /></label>
          </div>
          <div className="es-row wrap es-gl-foot">
            {selfOpen ? <>
              <span className="es-label"><Lock /> Private until submitted</span><span className="spacer" />
              {can.edit && <button className="btn primary" type="button" disabled={busy === "submit"} onClick={() => void submitSelf()}><Send />{busy === "submit" ? "Submitting…" : `Submit to ${data.manager?.name.split(" ")[0] ?? "HR"}`}</button>}
            </> : <span className="es-gl-sentmsg"><CircleCheck />Submitted on {review.selfSubmittedAt ? tDmy(tLocalDate(review.selfSubmittedAt)) : "—"}{review.stage === "AWAITING_MANAGER" ? ` · awaiting ${mgr}` : review.finalRating != null ? ` · final rating ${review.finalRating.toFixed(1)}` : ""}</span>}
          </div>
        </>}
      </div>

      {sheet === "note" && <NoteSheet data={data} onClose={() => setSheet(null)} onSaved={(r) => { setData(r); setSheet(null); }} />}
      {sheet === "ask" && <AskSheet data={data} onClose={() => setSheet(null)} onSaved={(r) => { setData(r); setSheet(null); }} />}
      {sheet === "give" && <GiveSheet data={data} onClose={() => setSheet(null)} onSaved={(r) => { setData(r); setSheet(null); }} />}
      {sheet === "goal" && <GoalSheet onClose={() => setSheet(null)} onSaved={() => { setSheet(null); reload(); }} />}
      {answer && <AnswerSheet f={answer} onClose={() => setAnswer(null)} onSaved={(r) => { setData(r); setAnswer(null); }} />}
      {team && <TeamReviewSheet r={team} competencies={data.competencies} onClose={() => setTeam(null)} onSaved={(r) => { setData(r); setTeam(null); }} />}
    </>
  );
}

function useSave() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const save = async <T,>(work: () => Promise<T>, done: string, after: (r: T) => void) => {
    setBusy(true); setErrs({});
    try { const r = await work(); toast(done, { tone: "good" }); after(r); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save that"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return { busy, errs, save };
}
type SheetProps = { data: MyGoals; onClose: () => void; onSaved: (r: MyGoals) => void };

/** The template's "New 1:1 note" sheet. */
function NoteSheet({ data, onClose, onSaved }: SheetProps) {
  const { busy, errs, save } = useSave();
  const people = [...(data.manager ? [data.manager] : []), ...data.colleagues.filter((c) => c.id !== data.manager?.id)];
  const [f, setF] = useState({ topic: "", meetingDate: tToday(), withEmployeeId: people[0]?.id ?? "", notes: "", actions: "" });
  return (
    <Drawer open onClose={onClose} className="es-sheet-host" title="New 1:1 note" subtitle={`Shared with ${people.find((p) => p.id === f.withEmployeeId)?.name ?? "them"}. Action items show for both of you.`}
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !f.topic.trim() || !f.withEmployeeId}
        onClick={() => void save(() => addMyOneOnOne({ withEmployeeId: f.withEmployeeId, meetingDate: f.meetingDate, topic: f.topic, notes: f.notes, actionItems: f.actions.split("\n").map((x) => x.trim()).filter(Boolean).map((text) => ({ text, done: false })) }), "1:1 note added", onSaved)}><Check />Add note</button></>}>
      <FormGrid>
        <Field label="Topic" required full error={errs.topic}><input value={f.topic} maxLength={160} placeholder="e.g. October route plan" onChange={(e) => setF({ ...f, topic: e.target.value })} /></Field>
        <Field label="Date" error={errs.meetingDate}><input type="date" value={f.meetingDate} onChange={(e) => setF({ ...f, meetingDate: e.target.value })} /></Field>
        <Field label="With" error={errs.withEmployeeId}><select value={f.withEmployeeId} onChange={(e) => setF({ ...f, withEmployeeId: e.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Notes" full error={errs.notes}><textarea rows={4} placeholder="What did you discuss?" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <Field label="Action items (one per line)" full error={errs.actionItems}><textarea rows={3} value={f.actions} onChange={(e) => setF({ ...f, actions: e.target.value })} /></Field>
      </FormGrid>
    </Drawer>
  );
}

/** The template's "Request feedback" sheet: up to 3 colleagues. */
function AskSheet({ data, onClose, onSaved }: SheetProps) {
  const { busy, save } = useSave();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const list = data.colleagues.filter((c) => !picked.includes(c.id) && (!q || c.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 6);
  return (
    <Drawer open onClose={onClose} className="es-sheet-host" title="Request feedback" subtitle="Pick up to 3 colleagues. They answer from their own Goals & Reviews."
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !picked.length} onClick={() => void save(() => requestMyFeedback(picked), `Feedback requested from ${picked.length} colleague${picked.length > 1 ? "s" : ""}`, onSaved)}><Send />Send requests</button></>}>
      <label className="es-field"><span>Colleague</span><input value={q} placeholder="Start typing a name…" disabled={picked.length >= 3} onChange={(e) => setQ(e.target.value)} /></label>
      {q && <div className="list mt">{list.map((c) => <button key={c.id} type="button" className="list-item" onClick={() => { setPicked([...picked, c.id]); setQ(""); }}><Av name={c.name} size="xs" /><div><b>{c.name}</b><small>{[c.designation, c.department].filter(Boolean).join(" · ")}</small></div></button>)}</div>}
      <div className="es-files" style={{ marginTop: 10 }}>{picked.map((id) => { const c = data.colleagues.find((x) => x.id === id)!; return <span key={id} className="es-file"><Av name={c.name} size="xs" /><b>{c.name}</b><button type="button" className="es-file-x" aria-label="Remove" onClick={() => setPicked(picked.filter((p) => p !== id))}>×</button></span>; })}</div>
    </Drawer>
  );
}

function GiveSheet({ data, onClose, onSaved }: SheetProps) {
  const { busy, errs, save } = useSave();
  const [f, setF] = useState({ toEmployeeId: "", tag: "STRENGTH", body: "" });
  return (
    <Drawer open onClose={onClose} className="es-sheet-host" title="Give feedback" subtitle="It shows on their Goals & Reviews."
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !f.toEmployeeId || f.body.trim().length < 5} onClick={() => void save(() => giveMyFeedback(f), "Feedback sent", onSaved)}><Send />Send</button></>}>
      <FormGrid>
        <Field label="For" required full error={errs.toEmployeeId}><select value={f.toEmployeeId} onChange={(e) => setF({ ...f, toEmployeeId: e.target.value })}><option value="">Choose…</option>{data.colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Kind" error={errs.tag}><select value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}><option value="STRENGTH">Strength</option><option value="GROWTH">Growth</option></select></Field>
        <Field label="Feedback" required full error={errs.body}><textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      </FormGrid>
    </Drawer>
  );
}

function AnswerSheet({ f, onClose, onSaved }: { f: MyGoals["feedbackToGive"][number]; onClose: () => void; onSaved: (r: MyGoals) => void }) {
  const { busy, errs, save } = useSave();
  const [x, setX] = useState({ tag: "STRENGTH", body: "" });
  return (
    <Drawer open onClose={onClose} className="es-sheet-host" title={`Feedback for ${f.to.name}`} subtitle={`Requested ${f.requestedAt ? tDmy(tLocalDate(f.requestedAt)) : ""}`}
      foot={<><button className="btn ghost" type="button" disabled={busy} onClick={() => void save(() => answerMyFeedback(f.id, { decline: true, rowVersion: f.rowVersion }), "Request declined", onSaved)}>Decline</button><span className="spacer" />
        <button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !x.body.trim()} onClick={() => void save(() => answerMyFeedback(f.id, { ...x, rowVersion: f.rowVersion }), "Feedback sent", onSaved)}><Send />Send</button></>}>
      <FormGrid>
        <Field label="Kind" error={errs.tag}><select value={x.tag} onChange={(e) => setX({ ...x, tag: e.target.value })}><option value="STRENGTH">Strength</option><option value="GROWTH">Growth</option></select></Field>
        <Field label="Feedback" required full error={errs.body}><textarea rows={5} value={x.body} onChange={(e) => setX({ ...x, body: e.target.value })} /></Field>
      </FormGrid>
    </Drawer>
  );
}

function GoalSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { busy, errs, save } = useSave();
  const [f, setF] = useState({ goalKind: "OKR", title: "", weightPct: "20", krs: "" });
  return (
    <Drawer open onClose={onClose} className="es-sheet-host" title="Add an objective" subtitle="Your manager and HR see it; progress follows the key results."
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || f.title.trim().length < 2}
        onClick={() => void save(() => createMyGoal({ goalKind: f.goalKind, title: f.title, weightPct: f.weightPct, keyResults: f.krs.split("\n").map((t) => t.trim()).filter(Boolean).map((title) => ({ title, progressPct: 0 })) }), "Objective added", () => onSaved())}><Plus />Add</button></>}>
      <FormGrid>
        <Field label="Objective" required full error={errs.title}><input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Kind" error={errs.goalKind}><select value={f.goalKind} onChange={(e) => setF({ ...f, goalKind: e.target.value })}><option value="OKR">OKR</option><option value="KRA">KRA</option></select></Field>
        <Field label="Weight (%)" required error={errs.weightPct}><input type="number" min={1} max={100} value={f.weightPct} onChange={(e) => setF({ ...f, weightPct: e.target.value })} /></Field>
        <Field label="Key results (one per line)" full error={errs.keyResults}><textarea rows={4} value={f.krs} onChange={(e) => setF({ ...f, krs: e.target.value })} /></Field>
      </FormGrid>
    </Drawer>
  );
}

/** A manager reviews a direct report (their review waits for the manager). */
function TeamReviewSheet({ r, competencies, onClose, onSaved }: { r: PerfReviewItem; competencies: MyGoals["competencies"]; onClose: () => void; onSaved: (x: MyGoals) => void }) {
  const { busy, errs, save } = useSave();
  const [f, setF] = useState<{ managerRating: string; managerComment: string; performanceBand: string; potentialBand: string; ratings: Record<string, string> }>({ managerRating: "3", managerComment: "", performanceBand: "", potentialBand: "", ratings: {} });
  return (
    <Drawer open onClose={onClose} className="es-sheet-host" title={`Review ${r.employee.name}`} subtitle={`Self rating ${r.selfRating?.toFixed(1) ?? "—"}${r.selfComment ? ` · “${r.selfComment}”` : ""}`}
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy}
        onClick={() => void save(() => submitMyManagerReview(r.id, { managerRating: f.managerRating, managerComment: f.managerComment, performanceBand: f.performanceBand || null, potentialBand: f.potentialBand || null, rowVersion: r.rowVersion, competencies: Object.entries(f.ratings).filter(([, v]) => v).map(([competency, rating]) => ({ competency, rating })) }), `Review of ${r.employee.name} submitted`, onSaved)}><Send />Submit review</button></>}>
      <FormGrid>
        <Field label="Overall rating (1–5)" required error={errs.managerRating}><input type="number" min={1} max={5} step={0.1} value={f.managerRating} onChange={(e) => setF({ ...f, managerRating: e.target.value })} /></Field>
        <Field label="Performance" error={errs.performanceBand}><select value={f.performanceBand} onChange={(e) => setF({ ...f, performanceBand: e.target.value })}><option value="">—</option><option value="LOW">Low</option><option value="MODERATE">Moderate</option><option value="HIGH">High</option></select></Field>
        <Field label="Potential" error={errs.potentialBand}><select value={f.potentialBand} onChange={(e) => setF({ ...f, potentialBand: e.target.value })}><option value="">—</option><option value="LOW">Low</option><option value="MODERATE">Moderate</option><option value="HIGH">High</option></select></Field>
        {competencies.map((c) => <Field key={c.competency} label={c.competency}><select value={f.ratings[c.competency] ?? ""} onChange={(e) => setF({ ...f, ratings: { ...f.ratings, [c.competency]: e.target.value } })}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>)}
        <Field label="Comment" full error={errs.managerComment}><textarea rows={3} value={f.managerComment} onChange={(e) => setF({ ...f, managerComment: e.target.value })} /></Field>
      </FormGrid>
    </Drawer>
  );
}
