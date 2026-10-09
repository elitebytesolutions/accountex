"use client";

import {
  ArrowRight, Award, Calendar, Check, Circle, CircleCheck, GraduationCap, HeartHandshake, Lightbulb, Rocket, Send, Sparkles, Users, Vote, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MyEngagement as MyEngagementData } from "@/shared/self-service/engagement";
import type { Colleague, KudosItem, KudosReaction, MyEngagementState, MyKudos, PollResult } from "@/shared/self-service/engagement-actions";
import { initialsOf } from "@/features/auth/initials";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { answerPulse, giveKudos, kudosColleagues, myEngagementState, myKudos, reactToKudos, votePoll } from "@/features/ess-requests/engagement/api";
import { myEngagement } from "../api";
import { ago, shortDay } from "./ess-ui";

const FACES = ["😫", "😕", "😐", "🙂", "😄"];
/** Badge lookup code → template medal (9C-ess.js 13-kudos BADGES). */
const BADGE: Record<string, { Icon: LucideIcon; tone: string; label: string }> = {
  CUSTOMER_HERO: { Icon: Award, tone: "lime", label: "Customer Hero" },
  TEAM_PLAYER: { Icon: Users, tone: "blue", label: "Team Player" },
  GO_GETTER: { Icon: Rocket, tone: "orange", label: "Go-Getter" },
  PROBLEM_SOLVER: { Icon: Lightbulb, tone: "violet", label: "Problem Solver" },
  MENTOR: { Icon: GraduationCap, tone: "green", label: "Mentor" },
};
const badgeOf = (code: string) => BADGE[code] ?? { Icon: Award, tone: "lime", label: code };
const RX: [KudosReaction, string][] = [["CLAP", "👏"], ["HEART", "❤️"], ["FIRE", "🔥"], ["PARTY", "🎉"]];
const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
type Err = { message: string; reference?: string } | null;
const toErr = (e: unknown, fallback: string): Err => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback });

function Av({ name, size = "sm" }: { name: string; size?: string }) {
  return <span className={`avatar ${size}`}>{initialsOf(name)}</span>;
}

/**
 * Template app/profile/kudos (9C-ess.js 13-kudos): give kudos with a colleague picker, the recognition wall with
 * reactions and filters, "Your recognition", the weekly pulse (one set of anonymous answers) and the live poll.
 */
export function MyEngagement() {
  const toast = useToast();
  const [k, setK] = useState<MyKudos | null>(null);
  const [kErr, setKErr] = useState<Err>(null);
  const [eng, setEng] = useState<MyEngagementData | null>(null);
  const [state, setState] = useState<MyEngagementState | null>(null);
  const [eErr, setEErr] = useState<Err>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("all");
  const giveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    myKudos().then((d) => { if (!cancelled) { setK(d); setKErr(null); } }).catch((e: unknown) => !cancelled && setKErr(toErr(e, "Could not load kudos")));
    Promise.all([myEngagement(), myEngagementState()])
      .then(([d, s]) => { if (!cancelled) { setEng(d); setState(s); setEErr(null); } })
      .catch((e: unknown) => !cancelled && setEErr(toErr(e, "Could not load polls and surveys")));
    return () => { cancelled = true; };
  }, [attempt]);

  const replace = (item: KudosItem) => setK((d) => d && { ...d, wall: d.wall.map((x) => (x.id === item.id ? item : x)) });
  const react = async (item: KudosItem, r: KudosReaction) => {
    try { replace(await reactToKudos(item.id, r)); } catch (e) { toast(errText(e, "Could not react"), { tone: "danger" }); }
  };

  const wall = (k?.wall ?? []).filter((x) => filter === "all" || (filter === "me" ? x.to.id === k?.me.id : filter === "by" ? x.from.id === k?.me.id : x.badge === filter));

  return (
    <>
      <PageHead eyebrow="My Profile / Culture" title="Kudos & Pulse" description="Recognise great work, tell us how your week went, and vote in company polls."
        actions={<button className="btn primary" type="button" onClick={() => giveRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}><HeartHandshake />Give kudos</button>} />

      <div className="es-grid es-main">
        <div className="es-col">
          <div className="es-card es-kd-give" ref={giveRef}>
            <div className="es-head"><span className="icon-tile lime"><HeartHandshake /></span><div><h3>Give kudos</h3><p>Say thanks in public. It takes 20 seconds and makes someone’s week.</p></div></div>
            <GiveKudos onSent={(item) => { setK((d) => d && { ...d, wall: [item, ...d.wall], given: d.given + 1, points: d.points + 5 }); setFilter((f) => (f === "all" || f === "by" || f === item.badge ? f : "all")); }} />
          </div>

          <div className="es-head es-kd-wh"><h3>Recognition wall</h3><span className="spacer" />
            <div className="chips es-kd-chips">
              {[["all", "Everyone"], ["me", "For me"], ["by", "By me"], ...Object.entries(BADGE).map(([c, b]) => [c, b.label])].map(([c, l]) => (
                <button key={c} type="button" className={filter === c ? "active" : ""} onClick={() => setFilter(c!)}>{l}</button>
              ))}
            </div>
          </div>
          {kErr ? <ErrorState message={kErr.message} reference={kErr.reference} onRetry={() => setAttempt((n) => n + 1)} /> : !k ? <div className="es-kd-wall"><Skeleton style={{ height: 190 }} /><Skeleton style={{ height: 190 }} /></div> : (
            <div className="es-kd-wall">
              {wall.length ? wall.map((x, i) => {
                const b = badgeOf(x.badge), toMe = x.to.id === k.me.id, byMe = x.from.id === k.me.id;
                return (
                  <article key={x.id} className={`es-kd-card t-${b.tone} es-in`} style={{ ["--i" as string]: i }}>
                    <div className="es-kd-badge"><span className="es-kd-medal"><b.Icon /></span><b>{b.label}</b><span className="spacer" /><small>{ago(x.givenAt)}</small></div>
                    <div className="es-kd-who"><Av name={x.from.name} /><ArrowRight className="es-kd-arr" /><Av name={x.to.name} /><div><b>{toMe ? "You" : x.to.name}</b><small>from {byMe ? "you" : x.from.name}</small></div></div>
                    <p>{x.message}</p>
                    <div className="es-kd-rx">
                      {RX.map(([r, e]) => {
                        const on = x.mine.includes(r);
                        return <button key={r} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => react(x, r)}><span>{e}</span><b>{x.reactions[r]}</b></button>;
                      })}
                      <span className="spacer" />
                    </div>
                  </article>
                );
              }) : <div className="es-empty es-span"><span className="icon-tile lime"><Sparkles /></span><b>No kudos here yet</b><span>Be the first to recognise someone.</span></div>}
            </div>
          )}
        </div>

        <div className="es-col">
          <div className="es-card es-kd-me">
            <div className="es-head"><h3>Your recognition</h3><span className="spacer" /><span className="pill"><Calendar />{new Date().getFullYear()}</span></div>
            {!k ? <Skeleton style={{ height: 90 }} /> : (
              <>
                <div className="es-stats">
                  <div className="es-stat"><span>Received</span><b>{k.received.length}</b></div>
                  <div className="es-stat"><span>Given</span><b>{k.given}</b></div>
                  <div className="es-stat"><span>Points</span><b>{k.points.toLocaleString("en-PK")}</b></div>
                </div>
                <div className="es-kd-earned">
                  {Object.entries(BADGE).map(([c, b]) => {
                    const n = k.earned[c] ?? 0;
                    return <span key={c} className={`es-kd-eb t-${b.tone}${n ? "" : " off"}`} title={`${b.label} × ${n}`}><b.Icon />{n ? <em>{n}</em> : null}</span>;
                  })}
                </div>
              </>
            )}
          </div>

          {eErr ? <ErrorState message={eErr.message} reference={eErr.reference} onRetry={() => setAttempt((n) => n + 1)} /> : !eng || !state ? <><Skeleton style={{ height: 200 }} /><Skeleton style={{ height: 200 }} /></> : (
            <>
              {eng.surveys.length ? eng.surveys.map((s) => (
                <Pulse key={s.id} survey={s} done={state.answeredSurveyIds.includes(s.id)} onDone={() => setState((st) => st && { ...st, answeredSurveyIds: [...st.answeredSurveyIds, s.id] })} />
              )) : (
                <div className="es-card es-kd-pulse"><div className="es-head"><h3>Weekly pulse</h3></div><div className="es-empty"><b>No pulse survey open</b><span>HR opens one each week.</span></div></div>
              )}
              {eng.polls.length ? eng.polls.map((p) => {
                const v = state.votes.find((x) => x.pollId === p.id);
                return <Poll key={p.id} poll={p} vote={v ?? null} onVoted={(optionId, results) => setState((st) => st && { ...st, votes: [...st.votes.filter((x) => x.pollId !== p.id), { pollId: p.id, optionId, results }] })} />;
              }) : (
                <div className="es-card"><div className="es-head"><h3>Poll</h3></div><div className="es-empty"><b>No poll open</b><span>Company polls appear here while they are open.</span></div></div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** The give-kudos form: colleague autocomplete, badge picker, 8–280 character message, share toggle. */
function GiveKudos({ onSent }: { onSent: (k: KudosItem) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [to, setTo] = useState<Colleague | null>(null);
  const [list, setList] = useState<Colleague[]>([]);
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState("CUSTOMER_HERO");
  const [message, setMessage] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);

  const search = useCallback((s: string) => { kudosColleagues(s || undefined).then(setList).catch(() => setList([])); }, []);
  useEffect(() => {
    if (to) return;
    const t = setTimeout(() => search(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q, to, search]);

  const send = async () => {
    if (!to) { toast("Pick a colleague from the list", { tone: "warn" }); return; }
    if (message.trim().length < 8) { toast("Add a short message (why it mattered)", { tone: "warn" }); return; }
    setBusy(true);
    try {
      const k = await giveKudos({ toEmployeeId: to.id, badge, message: message.trim(), shareOnWall: share });
      onSent(k);
      toast(`${to.name} got your ${badgeOf(badge).label} kudos`, { tone: "good" });
      setTo(null); setQ(""); setMessage("");
    } catch (e) { toast(errText(e, "Could not send kudos"), { tone: "danger" }); } finally { setBusy(false); }
  };

  return (
    <div className="es-kd-form">
      <label className={`es-field es-kd-to es-ac${to ? " picked" : ""}`}>
        <span>To</span>
        <input value={to ? to.name : q} placeholder="Search a colleague… e.g. Hira" autoComplete="off"
          onChange={(e) => { setTo(null); setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
        <div className={`es-ac-list${open && !to ? " on" : ""}`}>
          {list.length ? list.map((c) => (
            <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setTo(c); setOpen(false); }}>
              <Av name={c.name} size="xs" /><span><b>{c.name}</b><small>{[c.designation, c.department, c.branch].filter(Boolean).join(" · ") || c.code}</small></span>
            </button>
          )) : <div className="es-ac-none">No colleague found</div>}
        </div>
      </label>
      <div className="es-field"><span>Badge</span>
        <div className="es-kd-bpick">
          {Object.entries(BADGE).map(([c, b]) => <button key={c} type="button" className={`es-kd-bp t-${b.tone}${badge === c ? " on" : ""}`} onClick={() => setBadge(c)}><b.Icon />{b.label}</button>)}
        </div>
      </div>
      <label className="es-field es-kd-msg"><span>Message <small className="es-label">{message.length}/280</small></span>
        <textarea rows={3} maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What did they do, and why did it matter?" />
      </label>
      <div className="es-row wrap es-kd-send">
        <label className="switch"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /><i /><span>Share on company wall</span></label>
        <span className="spacer" /><span className="es-label">+20 points to them</span>
        <button className="btn primary" type="button" disabled={busy} onClick={send}><Send />{busy ? "Sending…" : "Send kudos"}</button>
      </div>
    </div>
  );
}

type SurveyCard = MyEngagementData["surveys"][number];
/** Weekly pulse: one face per question, sent together after the last answer; then the thanks state. */
function Pulse({ survey, done, onDone }: { survey: SurveyCard; done: boolean; onDone: () => void }) {
  const toast = useToast();
  const [scores, setScores] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const i = scores.length, q = survey.questions[i];

  const pick = async (v: number) => {
    const next = [...scores, v];
    setScores(next);
    if (next.length < survey.questions.length) return;
    setBusy(true);
    try { await answerPulse(survey.id, survey.questions.map((x, n) => ({ questionId: x.id, score: next[n]! }))); onDone(); }
    catch (e) { toast(errText(e, "Could not send your answers"), { tone: "danger" }); setScores([]); }
    finally { setBusy(false); }
  };

  return (
    <div className="es-card es-kd-pulse">
      <div className="es-head"><h3>{survey.title}</h3><span className="spacer" />{survey.isAnonymous && <span className="badge info">Anonymous</span>}</div>
      {done ? (
        <div className="es-kd-thanks"><span className="es-kd-thx-ic"><Check /></span><b>Thanks for answering!</b><small>{survey.isAnonymous ? "Your answers are anonymous." : "Your answers were recorded."} The survey runs until {shortDay(survey.periodTo)}.</small></div>
      ) : q ? (
        <div className="es-kd-q es-kd-qin" key={q.id}>
          <div className="es-kd-dots">{survey.questions.map((x, n) => <i key={x.id} className={n < i ? "done" : n === i ? "now" : undefined} />)}<span>{i + 1} of {survey.questions.length}</span></div>
          <b>{q.questionText}</b>
          <div className="es-kd-faces" role="radiogroup" aria-label={q.questionText}>
            {FACES.map((f, n) => <button key={f} type="button" disabled={busy} aria-label={`${n + 1} of 5`} style={{ ["--i" as string]: n }} onClick={() => pick(n + 1)}>{f}</button>)}
          </div>
          <div className="es-kd-scale"><span>{q.lowLabel}</span><span>{q.highLabel}</span></div>
        </div>
      ) : <div className="es-kd-thanks"><b>Sending…</b></div>}
      {!done && <div className="es-kd-pfoot"><span>{survey.department ?? "Everyone"} · until {shortDay(survey.periodTo)}</span>{i > 0 && !busy && <button type="button" className="es-link" onClick={() => setScores([])}>Start again<ArrowRight /></button>}</div>}
    </div>
  );
}

type PollCard = MyEngagementData["polls"][number];
/** Live poll: one vote, then the result bars (when the poll shows results after voting). */
function Poll({ poll, vote, onVoted }: { poll: PollCard; vote: { optionId: string; results: PollResult | null } | null; onVoted: (optionId: string, r: PollResult | null) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const r = vote?.results ?? null;
  const pct = (id: string) => (r && r.total ? Math.round(((r.options.find((o) => o.optionId === id)?.votes ?? 0) / r.total) * 100) : 0);
  const cast = async (optionId: string) => {
    setBusy(true);
    try {
      const x = await votePoll(poll.id, optionId);
      onVoted(optionId, x.results);
      toast(`Vote recorded · ${poll.options.find((o) => o.id === optionId)?.label ?? ""}`, { tone: "good" });
    } catch (e) { toast(errText(e, "Could not record your vote"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return (
    <div className="es-card">
      <div className="es-head"><h3>Poll</h3><span className="spacer" /><span className="pill"><Vote />{poll.department ?? "Everyone"}</span></div>
      <b className="es-kd-pq">{poll.question}</b>
      <div className={`es-kd-opts${vote ? " voted" : ""}`}>
        {poll.options.map((o) => {
          const mine = vote?.optionId === o.id;
          return (
            <button key={o.id} type="button" className={mine ? "mine" : ""} disabled={!!vote || busy} onClick={() => cast(o.id)}>
              <i className="es-kd-fill" style={{ ["--w" as string]: `${r ? pct(o.id) : 0}%` }} />
              <span className="es-kd-ol">{mine ? <CircleCheck /> : <Circle />}{o.label}</span><b>{r ? `${pct(o.id)}%` : ""}</b>
            </button>
          );
        })}
      </div>
      <div className="es-kd-pfoot"><span>{vote ? (r ? <><b>{r.total}</b> votes</> : "Thanks, your vote is in") : "One vote per person"}</span><span>Closes {shortDay(poll.closesAt)}</span></div>
    </div>
  );
}
