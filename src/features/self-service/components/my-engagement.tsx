"use client";

import { ArrowRight, Circle, HeartHandshake, Sparkles, Vote } from "lucide-react";
import { useEffect, useState } from "react";
import type { MyEngagement as MyEngagementData } from "@/shared/self-service/engagement";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { myEngagement } from "../api";
import { shortDay } from "./ess-ui";

const FACES = ["😫", "😕", "😐", "🙂", "😄"];
const LATER = "Answering and voting arrive in Phase 34";

/**
 * Template app/profile/kudos (9C-ess.js 13-kudos): the "Weekly pulse" and "Poll" cards for the open surveys and polls.
 * Answers, votes and the kudos wall arrive in Phase 34, so the faces and options are shown but not yet clickable.
 */
export function MyEngagement() {
  const [data, setData] = useState<MyEngagementData | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    myEngagement()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load polls and surveys" }));
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <>
      <PageHead eyebrow="My Profile / Culture" title="Kudos & Pulse" description="Recognise great work, tell us how your week went, and vote in company polls."
        actions={<button className="btn primary" type="button" disabled title="Kudos arrive in Phase 34"><HeartHandshake />Give kudos</button>} />

      <div className="es-grid es-main">
        <div className="es-col">
          <div className="es-card es-kd-give">
            <div className="es-head"><span className="icon-tile lime"><HeartHandshake /></span><div><h3>Give kudos</h3><p>Say thanks in public. It takes 20 seconds and makes someone’s week.</p></div></div>
            <div className="es-empty"><span className="icon-tile lime"><Sparkles /></span><b>The recognition wall is on its way</b><span>Giving kudos, reactions and badges arrive with Phase 34.</span></div>
          </div>
        </div>
        <div className="es-col">
          {error ? <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} /> : !data ? <><Skeleton style={{ height: 200 }} /><Skeleton style={{ height: 200 }} /></> : (
            <>
              {data.surveys.length ? data.surveys.map((s) => {
                const i = Math.min(step[s.id] ?? 0, s.questions.length - 1), q = s.questions[i];
                return (
                  <div key={s.id} className="es-card es-kd-pulse">
                    <div className="es-head"><h3>{s.title}</h3><span className="spacer" />{s.isAnonymous && <span className="badge info">Anonymous</span>}</div>
                    {q ? (
                      <div className="es-kd-q">
                        <div className="es-kd-dots">
                          {s.questions.map((x, n) => <i key={x.id} className={n < i ? "done" : n === i ? "now" : undefined} />)}
                          <span>{i + 1} of {s.questions.length}</span>
                        </div>
                        <b>{q.questionText}</b>
                        <div className="es-kd-faces" role="radiogroup" aria-label={q.questionText}>
                          {FACES.map((f, n) => <button key={f} type="button" disabled title={LATER} aria-label={`${n + 1} of 5`} style={{ ["--i" as string]: n, cursor: "not-allowed" }}>{f}</button>)}
                        </div>
                        <div className="es-kd-scale"><span>{q.lowLabel}</span><span>{q.highLabel}</span></div>
                        {s.questions.length > 1 && <button type="button" className="es-link" style={{ marginTop: 10 }} onClick={() => setStep((st) => ({ ...st, [s.id]: (i + 1) % s.questions.length }))}>{i + 1 < s.questions.length ? "Next question" : "Back to the first"}<ArrowRight /></button>}
                      </div>
                    ) : null}
                    <div className="es-kd-pfoot"><span>{s.department ?? "Everyone"} · until {shortDay(s.periodTo)}</span><span>{LATER.replace("Answering and voting arrive", "Answers open")}</span></div>
                  </div>
                );
              }) : (
                <div className="es-card es-kd-pulse"><div className="es-head"><h3>Weekly pulse</h3></div><div className="es-empty"><b>No pulse survey open</b><span>HR opens one each week.</span></div></div>
              )}
              {data.polls.length ? data.polls.map((p) => (
                <div key={p.id} className="es-card">
                  <div className="es-head"><h3>Poll</h3><span className="spacer" /><span className="pill"><Vote />{p.department ?? "Everyone"}</span></div>
                  <b className="es-kd-pq">{p.question}</b>
                  <div className="es-kd-opts">
                    {p.options.map((o) => (
                      <button key={o.id} type="button" disabled title={LATER}><i className="es-kd-fill" style={{ ["--w" as string]: "0%" }} /><span className="es-kd-ol"><Circle />{o.label}</span><b /></button>
                    ))}
                  </div>
                  <div className="es-kd-pfoot"><span>Voting opens in Phase 34</span><span>Closes {shortDay(p.closesAt)}</span></div>
                </div>
              )) : (
                <div className="es-card"><div className="es-head"><h3>Poll</h3></div><div className="es-empty"><b>No poll open</b><span>Company polls appear here while they are open.</span></div></div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
