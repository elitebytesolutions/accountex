"use client";

import { CheckCheck, Heart, Lock, RotateCcw, Send, Star, UserCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TicketAgentOption, TicketDetail } from "@/shared/self-service/helpdesk-ticket";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { Av } from "@/features/hr/components/ess-bits";
import { deskIcon } from "@/features/self-service/components/ess-ui";
import { assignTicket, getTicket, rateTicket, reopenTicket, resolveTicket, sendTicketMessage, ticketAgents } from "../api";
import { SlaChip, StatusBadge, slaUsed, useNow, when } from "./ticket-bits";

const RATING = ["", "Poor", "Could be better", "Okay", "Good", "Excellent!"];
const PRIORITY: Record<string, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High" };

/** Template 11-helpdesk openTicket(): desk head, SLA bar, chat thread, compose box; CSAT for a resolved ticket, agent tools for HR / the desk. */
export function TicketDrawer({ id, meId, isHr, onClose, onChanged }: {
  id: string | null;
  /** The signed-in user's employee id (own bubbles on the right). */
  meId: string | null;
  isHr: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [t, setT] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [reason, setReason] = useState("");
  const [reopening, setReopening] = useState(false);
  const [agents, setAgents] = useState<TicketAgentOption[] | null>(null);
  const [agentId, setAgentId] = useState("");
  const chat = useRef<HTMLDivElement>(null);
  const now = useNow(!!t && (t.status === "OPEN" || t.status === "IN_PROGRESS"));

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getTicket(id)
      .then((d) => { if (!cancelled) { setT(d); setError(null); setStars(0); setReopening(false); setReason(""); setAgentId(d.agent?.id ?? ""); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the ticket" }));
    return () => { cancelled = true; };
  }, [id, attempt]);

  useEffect(() => {
    if (isHr && id && !agents) ticketAgents().then(setAgents).catch(() => setAgents([]));
  }, [isHr, id, agents]);

  useEffect(() => { chat.current?.scrollTo({ top: chat.current.scrollHeight }); }, [t?.messages.length]);

  const run = async (key: string, work: () => Promise<TicketDetail>, done?: string) => {
    setBusy(key);
    try {
      const d = await work();
      setT(d); setAgentId(d.agent?.id ?? "");
      onChanged();
      if (done) toast(done, { tone: "good" });
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong", { tone: "danger" });
      if (e instanceof ApiError && e.status === 409) setAttempt((n) => n + 1);
      return false;
    } finally { setBusy(null); }
  };

  const send = async () => {
    const body = text.trim();
    if (!t || !body) return;
    if (await run("send", () => sendTicketMessage(t.id, body))) setText("");
  };

  const desk = t ? deskIcon(t.category.icon) : null;
  return (
    <Drawer open={!!id} onClose={onClose} title={t?.subject ?? "Ticket"} subtitle={t?.docNo} className="es-hd-drawer es-sheet-host" wide>
      {error && t?.id !== id ? <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} /> : !t || t.id !== id || !desk ? <Skeleton style={{ height: 320 }} /> : (
        <>
          <div className="es-hd-dhead">
            <span className={`icon-tile ${desk.tone}`}><desk.Icon /></span>
            <div><b>{t.category.name} desk</b><small>{t.agent ? `Assigned to ${t.agent.name}` : "Not assigned yet"} · Priority {PRIORITY[t.priority] ?? t.priority}{t.can.agent && t.employee.id !== meId ? ` · Raised by ${t.employee.name}` : ""}</small></div>
            <span className="spacer" />
            <StatusBadge status={t.status} />
          </div>
          <div className="es-hd-dsla">
            <SlaChip t={t} now={now} />
            {(t.status === "OPEN" || t.status === "IN_PROGRESS") && <div className="es-hd-slabar"><i style={{ width: `${slaUsed(t, now)}%` }} /></div>}
            <small>Response SLA {t.slaHours}h · opened {when(t.openedAt)}{t.reopenedCount ? ` · reopened ${t.reopenedCount}×` : ""}</small>
          </div>

          <div className="es-hd-chat" ref={chat}>
            {t.messages.map((m) => {
              const mine = !!meId && m.author?.id === meId;
              const who = m.authorRole === "SYSTEM" ? "System" : mine ? "You" : m.author?.name ?? "—";
              return (
                <div key={m.id} className={`es-hd-msg ${mine ? "me" : "them"}`}>
                  {!mine && <Av name={m.author?.name ?? "System"} />}
                  <div><div className="es-hd-bub">{m.body}</div><small>{who}{m.authorRole === "AGENT" && !mine ? " · agent" : ""} · {when(m.sentAt)}</small></div>
                </div>
              );
            })}
          </div>

          {t.can.rate && !reopening && (
            <div className="es-hd-csat">
              <div><b>How did {t.agent?.name.split(" ")[0] ?? "the desk"} do?</b><small>Rate the resolution of {t.docNo}. Rating closes the ticket.</small></div>
              <div className="es-hd-stars" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={n <= stars ? "on pop" : undefined} style={{ ["--i" as string]: n }} aria-label={`${n} stars`} aria-checked={n === stars} role="radio" onClick={() => setStars(n)}><Star /></button>
                ))}
              </div>
              <span className="es-hd-csat-l">{stars ? RATING[stars] : "Tap a star"}</span>
              <button className="btn primary sm" type="button" disabled={!stars || !!busy} onClick={() => run("rate", () => rateTicket(t.id, t.rowVersion, stars, null), `Thanks for rating ${stars}/5`)}>{busy === "rate" ? "Sending…" : "Submit rating"}</button>
              <button className="es-link" type="button" onClick={() => setReopening(true)}>Not solved? Reopen<RotateCcw /></button>
            </div>
          )}
          {t.can.reopen && reopening && (
            <div className="es-hd-csat">
              <div><b>Reopen {t.docNo}</b><small>Tell the desk what is still wrong. The SLA clock keeps its original due time.</small></div>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What is still not working?" aria-label="Reason" style={{ flex: "1 1 100%" }} />
              <button className="btn secondary sm" type="button" onClick={() => setReopening(false)}>Back</button>
              <button className="btn primary sm" type="button" disabled={reason.trim().length < 3 || !!busy} onClick={() => run("reopen", () => reopenTicket(t.id, t.rowVersion, reason.trim()), `${t.docNo} reopened`)}><RotateCcw />Reopen</button>
            </div>
          )}
          {t.status === "CLOSED" && (
            <div className="es-hd-closed"><Lock />This ticket is closed.{t.csatRating ? <> Rated {t.csatRating}/5 <Heart style={{ width: 14, height: 14 }} /></> : null}</div>
          )}

          {t.can.reply && (
            <form className="es-hd-compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <div className="es-hd-crow">
                <textarea rows={1} value={text} placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)" aria-label="Reply"
                  onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`; }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
                <button className="btn primary sm" type="submit" disabled={!text.trim() || !!busy}><Send />{busy === "send" ? "Sending…" : "Send"}</button>
              </div>
            </form>
          )}

          {t.can.agent && (t.status === "OPEN" || t.status === "IN_PROGRESS") && (
            <div className="es-hd-csat">
              <div><b>Agent tools</b><small>{t.employee.name} ({t.employee.code}){t.contactValue ? ` · ${t.contactChannel === "EMAIL" ? "Email" : "WhatsApp"} ${t.contactValue}` : ""}</small></div>
              {isHr && agents && (
                <Field label="Assign to">
                  <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Agent">
                    <option value="">Choose…</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                  </Select>
                </Field>
              )}
              {isHr && agents && <button className="btn secondary sm" type="button" disabled={!agentId || agentId === t.agent?.id || !!busy} onClick={() => run("assign", () => assignTicket(t.id, agentId, t.rowVersion), "Ticket reassigned")}><UserCog />Assign</button>}
              <span style={{ flex: 1 }} />
              <button className="btn primary sm" type="button" disabled={!!busy} onClick={() => run("resolve", () => resolveTicket(t.id, t.rowVersion, text.trim() || null).then((d) => { setText(""); return d; }), `${t.docNo} resolved`)}><CheckCheck />{busy === "resolve" ? "Resolving…" : text.trim() ? "Send & resolve" : "Resolve"}</button>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
