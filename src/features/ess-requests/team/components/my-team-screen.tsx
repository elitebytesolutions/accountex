"use client";

import { AlarmClock, Check, CheckCheck, CircleDashed, Inbox, LogIn, MapPin, PartyPopper, Phone, Plane, Radio, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { ApprovalItem } from "@/shared";
import type { MyTeam, TeamGroup } from "@/shared/self-service/my-team";
import type { TeamPolicyStatus } from "@/shared/self-service/policy-ack";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Av } from "@/features/hr/components/ess-bits";
import { ago } from "@/features/self-service/components/ess-ui";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { teamPolicyStatus } from "../../policy-acks/api";
import { decideApproval, myTeam, teamInbox } from "../api";
import { hrQueue, type DeckCard } from "./team-sources";

const GROUPS: { key: TeamGroup; label: string; tone: string; Icon: LucideIcon }[] = [
  { key: "IN", label: "In", tone: "good", Icon: LogIn },
  { key: "LATE", label: "Late", tone: "warn", Icon: AlarmClock },
  { key: "ON_LEAVE", label: "On leave", tone: "violet", Icon: Plane },
  { key: "NOT_CHECKED_IN", label: "Not checked in", tone: "danger", Icon: CircleDashed },
];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CAL_CLASS: Record<string, string> = { LEAVE: "lv", LEAVE_PENDING: "pend", SICK: "sick", TRAINING: "trn" };
const WEEKDAY = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");

const inboxCard = (a: ApprovalItem): DeckCard => ({
  key: `apr:${a.id}`, label: a.workflow.name, Icon: Inbox, tone: "blue", docLabel: a.docLabel, who: a.requestedBy.name, title: a.title ?? a.docLabel,
  sub: a.currentStepDueAt ? `Step ${a.currentStepNo ?? 1} · due ${new Date(a.currentStepDueAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : null,
  rows: [["Requested", ago(a.requestedAt)], ...(a.amount ? [["Amount", `${a.currencyCode} ${a.amount.toLocaleString("en-US")}`] as [string, string]] : [])],
  at: a.requestedAt,
  approve: () => decideApproval(a.id, "approve", null),
  reject: (reason) => decideApproval(a.id, "reject", reason),
  reasons: ["Needs more detail", "Not within policy", "Discuss with me first"],
});

/** Template app/profile/team (6A-ess.html + 9C-ess.js): team today, the swipe approvals deck with reject reasons, decided today, team calendar. */
export function MyTeamScreen({ can }: { can: { hr: boolean } }) {
  const toast = useToast();
  const [team, setTeam] = useState<MyTeam | null>(null);
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [policies, setPolicies] = useState<TeamPolicyStatus | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<{ card: DeckCard; ok: boolean; why: string }[]>([]);
  const [reject, setReject] = useState<{ card: DeckCard; reason: string } | null>(null);
  const [bulk, setBulk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([myTeam(), teamInbox(), can.hr ? hrQueue() : Promise.resolve({ cards: [] }), teamPolicyStatus().catch(() => null)])
      .then(([t, inbox, hr, pol]) => {
        if (cancelled) return;
        setTeam(t);
        setCards([...inbox.items.filter((i) => i.canAct).map(inboxCard), ...hr.cards].sort((a, b) => a.at.localeCompare(b.at)));
        setPolicies(pol);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load your team" }));
    return () => { cancelled = true; };
  }, [attempt, can.hr]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const decide = async (card: DeckCard, ok: boolean, why: string) => {
    setBusy(true);
    try {
      await (ok ? card.approve() : card.reject(why));
      setCards((cs) => (cs ?? []).filter((c) => c.key !== card.key));
      setDone((d) => [{ card, ok, why }, ...d]);
      toast(`${ok ? "Approved" : "Rejected"} · ${card.who.split(" ")[0]}’s ${card.label.toLowerCase()}`, { tone: ok ? "good" : "danger" });
      return true;
    } catch (e) {
      toast(apiMessage(e, "Could not record the decision"), { tone: "danger" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const approveAll = async () => {
    setBulk(false);
    for (const c of cards ?? []) await decide(c, true, "Approved");
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!team || !cards) return <Skeleton style={{ height: 520 }} />;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">My Profile / My Team</div>
          <h1>My Team</h1>
          <p>{team.members.length ? `${team.members.length} ${team.members.length === 1 ? "person reports" : "people report"} to you.` : "Nobody reports to you yet."} Swipe right to approve, left to reject (or use ← →).</p>
        </div>
        <div className="head-actions">
          <a className="btn secondary" href="/profile/shifts"><Plane />Team roster</a>
          <button className="btn primary" type="button" disabled={!cards.length || busy} onClick={() => setBulk(true)}><CheckCheck />Approve all</button>
        </div>
      </div>

      <div className="es-grid es-wide">
        <TeamToday team={team} />
        <div className="es-card es-tm-inbox">
          <div className="es-head">
            <h3>Approvals</h3><span className="es-count">{cards.length}</span><span className="es-label">waiting</span><span className="spacer" />
            <button type="button" className="es-link" disabled={!cards.length || busy} onClick={() => setBulk(true)}><CheckCheck />Approve all</button>
          </div>
          <div className="progress es-tm-progress"><i style={{ width: `${done.length + cards.length ? (done.length / (done.length + cards.length)) * 100 : 0}%` }} /></div>
          <Deck cards={cards} busy={busy} onApprove={(c) => decide(c, true, "Approved")} onReject={(c) => setReject({ card: c, reason: c.reasons[0] ?? "" })} />
          <div className={`es-tm-zero${cards.length ? "" : " on"}`}><span className="icon-tile lime"><PartyPopper /></span><b>Inbox zero</b><span>All requests handled.</span></div>
          <div className="es-tm-donewrap">
            <span className="es-cap">Decided today</span>
            <div>
              {done.length ? done.map((d, i) => (
                <div key={d.card.key} className="es-tm-di es-in" style={{ "--i": i } as CSSProperties}>
                  <Av name={d.card.who} size="sm" />
                  <div><b>{d.card.who} · {d.card.title}</b><small>{d.ok ? "Approved just now" : `“${d.why}”`}</small></div>
                  <span className={`badge dot ${d.ok ? "good" : "danger"}`}>{d.ok ? "Approved" : "Rejected"}</span>
                </div>
              )) : <p className="es-label es-tm-dempty">Decisions you make today appear here.</p>}
            </div>
          </div>
                  </div>
      </div>

      <div className="es-grid es-wide">
        <TeamCalendar team={team} />
        <TeamPolicies rows={policies} />
      </div>

      <Modal open={!!reject} onClose={() => setReject(null)} title={reject ? `Reject ${reject.card.label.toLowerCase()}?` : ""} subtitle={reject ? `${reject.card.who} · ${reject.card.title}. They’ll see your reason.` : undefined}
        foot={<><button className="btn secondary" type="button" onClick={() => setReject(null)}>Keep it</button>
          <button className="btn danger" type="button" disabled={busy || !reject?.reason.trim()} onClick={async () => { if (reject && (await decide(reject.card, false, reject.reason.trim()))) setReject(null); }}><X />Reject request</button></>}>
        {reject ? (
          <>
            <div className="es-opts es-tm-reasons">
              {reject.card.reasons.map((r) => <button key={r} type="button" className={`es-opt${reject.reason.startsWith(r) ? " on" : ""}`} onClick={() => setReject({ ...reject, reason: r })}>{r}</button>)}
            </div>
            <label className="es-field" style={{ marginTop: 14 }}><span>Message to {reject.card.who.split(" ")[0]}</span>
              <textarea rows={3} value={reject.reason} maxLength={500} onChange={(e) => setReject({ ...reject, reason: e.target.value })} /></label>
          </>
        ) : null}
      </Modal>
      <ConfirmDialog open={bulk} onClose={() => setBulk(false)} onConfirm={approveAll} title={`Approve all ${cards.length} requests?`} confirmLabel={`Approve ${cards.length}`} busy={busy}>
        {cards.map((c) => <div key={c.key}>{c.who.split(" ")[0]} · {c.title}</div>)}
      </ConfirmDialog>
    </>
  );
}

function TeamToday({ team }: { team: MyTeam }) {
  const inNow = team.members.filter((m) => m.group === "IN" || m.group === "LATE").length;
  return (
    <div className="es-card es-tm-today">
      <div className="es-head">
        <h3>Team today</h3><span className="es-label">{new Date(`${team.today}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}</span><span className="spacer" />
        <span className="pill"><Radio />Live <b className="up">{inNow} of {team.members.length} in</b></span>
      </div>
      {!team.me ? <div className="es-empty"><span className="icon-tile"><Inbox /></span><b>No employee record</b><span>Your user is not linked to an employee, so there is no team to show.</span></div> : (
        <>
          <div className="es-tm-groups">
            {GROUPS.map((g) => {
              const xs = team.members.filter((m) => m.group === g.key);
              return (
                <div key={g.key} className={`es-tm-g ${g.tone}`}>
                  <div className="es-row"><span className="es-tm-gic"><g.Icon /></span><span className="es-label">{g.label}</span></div>
                  <b>{xs.length}</b>
                  <div className="avatar-stack">{xs.length ? xs.map((x) => <Av key={x.employeeId} name={x.name} size="sm" />) : <span className="es-tm-none">{g.key === "ON_LEAVE" ? "Nobody today" : "—"}</span>}</div>
                </div>
              );
            })}
          </div>
          <div className="es-tm-people">
            {team.members.length ? team.members.map((m, i) => {
              const g = GROUPS.find((x) => x.key === m.group);
              return (
                <div key={m.employeeId} className="es-tm-p es-in" style={{ "--i": i } as CSSProperties}>
                  <Av name={m.name} size="" />
                  <div className="es-tm-pn"><b>{m.name}</b><small>{m.designation ?? m.code}</small></div>
                  <div className="es-tm-pt">
                    <span className={`badge dot ${g?.tone ?? "neutral"}`}>{m.group === "OFF" ? "Day off" : m.group === "NOT_CHECKED_IN" ? "Not in" : m.group === "ON_LEAVE" ? "On leave" : `${g?.label} ${clock(m.checkInAt)}`}</span>
                    <small><MapPin />{m.locationLabel ?? (m.presence ? `${m.presence.status.replace("_", " ").toLowerCase()}${m.presence.message ? ` · ${m.presence.message}` : ""}` : "—")}</small>
                  </div>
                  {m.mobile ? <a className="icon-btn-sm" href={`tel:${m.mobile}`} aria-label={`Call ${m.name}`} title={`Call ${m.mobile}`}><Phone /></a> : <span />}
                </div>
              );
            }) : <p className="es-label">Nobody reports to you yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** The approvals deck: drag the top card right to approve, left to reject; ← → keys and the buttons do the same. */
function Deck({ cards, busy, onApprove, onReject }: { cards: DeckCard[]; busy: boolean; onApprove: (c: DeckCard) => Promise<boolean>; onReject: (c: DeckCard) => void }) {
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const top = cards[0];
  const act = useCallback((dir: 1 | -1) => { if (!top || busy) return; if (dir > 0) void onApprove(top); else onReject(top); }, [top, busy, onApprove, onReject]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]") || document.querySelector(".overlay.open")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); act(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); act(-1); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [act]);
  const down = (e: ReactPointerEvent<HTMLElement>) => { if ((e.target as HTMLElement).closest("button")) return; drag.current = { x: e.clientX, id: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e: ReactPointerEvent<HTMLElement>) => { if (drag.current?.id === e.pointerId) setDx(e.clientX - drag.current.x); };
  const up = () => { if (!drag.current) return; drag.current = null; const d = dx; setDx(0); if (d > 110) act(1); else if (d < -110) act(-1); };

  return (
    <div className="es-tm-deck">
      {cards.slice(0, 4).map((c, k) => (
        <article key={c.key} className={`es-tm-card${k === 0 ? " top" : ""}`} aria-hidden={k ? "true" : "false"} tabIndex={-1}
          style={{ "--k": Math.min(k, 3), zIndex: 10 - k, ...(k === 0 && dx ? { transform: `translateX(${dx}px) rotate(${dx / 24}deg)`, transition: "none" } : null) } as CSSProperties}
          onPointerDown={k === 0 ? down : undefined} onPointerMove={k === 0 ? move : undefined} onPointerUp={k === 0 ? up : undefined} onPointerCancel={k === 0 ? up : undefined}>
          <span className="es-tm-stamp ok" style={k === 0 ? { opacity: Math.max(0, Math.min(1, dx / 110)) } : undefined}>Approve</span>
          <span className="es-tm-stamp no" style={k === 0 ? { opacity: Math.max(0, Math.min(1, -dx / 110)) } : undefined}>Reject</span>
          <div className="es-tm-ch"><span className={`icon-tile ${c.tone}`}><c.Icon /></span><div><span className="es-cap">{c.label}</span><small>{c.docLabel} · {ago(c.at)}</small></div><span className="spacer" /><span className="badge dot warn">Pending</span></div>
          <div className="es-tm-who"><Av name={c.who} size="lg" /><div><b>{c.who}</b></div></div>
          <h3 className="es-tm-title">{c.title}</h3>
          {c.sub ? <p className="es-tm-sub">{c.sub}</p> : null}
          <div className="es-tm-rows">{c.rows.map(([k2, v]) => <div key={k2}><span>{k2}</span><b>{v}</b></div>)}</div>
          <div className="es-tm-btns">
            <button type="button" className="es-tm-no" aria-label="Reject" disabled={busy} onClick={() => act(-1)}><X /><span>Reject</span></button>
            <span className="es-tm-hint"><span className="es-kbd">←</span> drag <span className="es-kbd">→</span></span>
            <button type="button" className="es-tm-ok" aria-label="Approve" disabled={busy} onClick={() => act(1)}><Check /><span>Approve</span></button>
          </div>
        </article>
      ))}
    </div>
  );
}

function TeamCalendar({ team }: { team: MyTeam }) {
  const [y, m] = team.month.split("-").map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, i + 1)));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const byKey = new Map(team.calendar.entries.map((e) => [`${e.employeeId}:${e.date}`, e]));
  const off = (weeklyOff: string | null, d: Date) => (weeklyOff ?? "SUNDAY").split(",").includes(WEEKDAY[d.getUTCDay()]!);
  const leaveDays = team.calendar.entries.filter((e) => e.kind !== "TRAINING").length;
  return (
    <div className="es-card">
      <div className="es-head"><h3>Team calendar · {MON[m - 1]} {y}</h3><span className="spacer" /><span className="pill"><Plane />{leaveDays} leave day{leaveDays === 1 ? "" : "s"} planned</span></div>
      {team.calendar.people.length ? (
        <>
          <div className="es-scroll-x">
            <div className="es-tm-cal" style={{ "--n": n } as CSSProperties}>
              <div className="es-tm-cn" />
              {days.map((d) => <div key={iso(d)} className={`es-tm-ch2${d.getUTCDay() === 0 ? " we" : ""}${iso(d) === team.today ? " today" : ""}`}><small>{DOW[d.getUTCDay()]}</small><b>{d.getUTCDate()}</b></div>)}
              {team.calendar.people.map((p) => (
                <FragmentRow key={p.employeeId} name={p.employeeId === team.me?.id ? "You" : p.name.split(" ")[0]!} full={p.name}>
                  {days.map((d) => {
                    const e = byKey.get(`${p.employeeId}:${iso(d)}`);
                    return <div key={iso(d)} className={`es-tm-cc${off(p.weeklyOff, d) ? " we" : ""}${e ? ` ${CAL_CLASS[e.kind]}` : ""}${iso(d) === team.today ? " today" : ""}`} title={e ? `${p.name.split(" ")[0]} · ${e.label ?? e.kind}${e.kind === "LEAVE_PENDING" ? " · pending" : ""}` : undefined} />;
                  })}
                </FragmentRow>
              ))}
            </div>
          </div>
          <div className="es-tm-leg"><span><i className="lv" />Annual</span><span><i className="pend" />Pending</span><span><i className="sick" />Sick</span><span><i className="trn" />Training</span><span><i className="we" />Weekend</span></div>
        </>
      ) : <p className="es-label">No team members to show.</p>}
    </div>
  );
}

function FragmentRow({ name, full, children }: { name: string; full: string; children: React.ReactNode }) {
  return <><div className="es-tm-cn"><Av name={full} size="xs" /><span>{name}</span></div>{children}</>;
}


/** Policy acknowledgements of my direct reports (Phase 34): who still has to read and sign which published policy. */
function TeamPolicies({ rows }: { rows: TeamPolicyStatus | null }) {
  const missing = (rows ?? []).reduce((n, r) => n + r.missing.length, 0);
  return (
    <div className="es-card">
      <div className="es-head"><h3>Policy acknowledgements</h3><span className="spacer" /><span className={`badge dot ${missing ? "warn" : "good"}`}>{missing ? `${missing} outstanding` : "All signed"}</span></div>
      {!rows ? <p className="es-label">Policy status is not available.</p> : !rows.length ? <p className="es-label">Nobody reports to you yet.</p> : (
        <div className="es-tm-st">
          {rows.map((r) => (
            <div key={r.employee.id} className="es-tm-sr">
              <Av name={r.employee.name} size="sm" />
              <div className="es-tm-sn"><b>{r.employee.name.split(" ")[0]}</b><small>{r.employee.designation ?? r.employee.code}</small></div>
              <div className="es-tm-bar" title={r.missing.map((m) => `${m.title} v${m.version}`).join(", ") || "All signed"}>
                <span>Signed</span>
                <div className={`progress${r.acknowledged < r.required ? " warn" : ""}`}><i style={{ width: `${r.required ? (r.acknowledged / r.required) * 100 : 100}%` }} /></div>
                <em>{r.acknowledged}/{r.required}</em>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
