"use client";

import { LifeBuoy, MessageSquare, Plus, Send, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TICKET_LOOKUPS, TICKET_OPEN_STATUSES, TICKET_PRIORITIES, TicketRaiseSchema, type MyTicketList, type TicketDetail } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, lookupOptions, toneOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { getMyTicket, listMyTickets, raiseTicket, rateMyTicket, replyMyTicket } from "../api";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const errorOf = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/**
 * Workspace › Help & support (Phase 42, template style; reached from the user menu). Raise a ticket to Accountex
 * support, follow the replies, answer, and rate the help once it is resolved. Company admins see every ticket of the
 * company; everyone else sees their own.
 */
export function HelpSupportScreen() {
  const toast = useToast();
  const lookups = useLookups(TICKET_LOOKUPS);
  const [list, setList] = useState<MyTicketList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [t, setT] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [raising, setRaising] = useState(false);
  const [rating, setRating] = useState({ stars: 0, comment: "" });
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    listMyTickets().then((l) => { if (!cancelled) { setList(l); setError(null); setSel((s) => s ?? l.items[0]?.id ?? null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load your tickets" }));
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    getMyTicket(sel).then((x) => !cancelled && setT(x)).catch((e: unknown) => !cancelled && toast(errorOf(e, "Could not open the ticket"), { tone: "danger" }));
    return () => { cancelled = true; };
  }, [sel, toast]);

  const send = async () => {
    if (!t || !reply.trim()) return;
    setBusy(true);
    try { setT(await replyMyTicket(t.id, reply.trim())); setReply(""); reload(); toast("Reply sent to Accountex support", { tone: "good" }); }
    catch (e) { toast(errorOf(e, "Could not send the reply"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const rate = async () => {
    if (!t || !rating.stars) { toast("Pick 1 to 5 stars", { tone: "warn" }); return; }
    setBusy(true);
    try { setT(await rateMyTicket(t.id, rating.stars, rating.comment)); setRating({ stars: 0, comment: "" }); reload(); toast("Thanks for rating our help", { tone: "good" }); }
    catch (e) { toast(errorOf(e, "Could not save the rating"), { tone: "danger" }); }
    finally { setBusy(false); }
  };

  const head = <PageHead eyebrow="Accountex support" title="Help & support" description="Ask the Accountex team for help. Replies arrive here; urgent issues are answered within 2 hours."
    actions={<button type="button" className="btn primary" onClick={() => setRaising(true)}><Plus />New ticket</button>} />;
  if (error) return <>{head}<ErrorState {...error} onRetry={reload} /></>;
  if (!list) return <>{head}<Skeleton style={{ height: 420, borderRadius: 18 }} /></>;

  return (
    <>
      {head}
      {!list.items.length ? (
        <div className="panel"><EmptyState icon={<LifeBuoy />} title="No tickets yet" description="Raise a ticket and the Accountex support team will reply here." action={<button type="button" className="btn primary sm" onClick={() => setRaising(true)}><Plus />New ticket</button>} /></div>
      ) : (
        <div className="split">
          <div className="panel flush">
            <div className="panel-head"><div><h3>{list.seesAll ? "Company tickets" : "My tickets"}</h3><p>{list.items.length} ticket{list.items.length === 1 ? "" : "s"}{list.seesAll ? " · everyone in the company" : ""}</p></div></div>
            <div className="list">
              {list.items.map((x) => (
                <button key={x.id} type="button" className={cn("list-item", sel === x.id && "active")} style={{ textAlign: "left", width: "100%", background: sel === x.id ? "var(--surface-2, rgba(0,0,0,.04))" : "none", border: 0, padding: "12px 16px" }} onClick={() => setSel(x.id)}>
                  <span className="icon-well"><MessageSquare /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row"><b>{x.subject}</b><span className="spacer" /><span className={`badge ${toneOf(lookups, "SupportTicketStatus", x.status)}`}>{labelOf(lookups, "SupportTicketStatus", x.status)}</span></div>
                    <small>{x.docNo} · {labelOf(lookups, "SupportTicketCategory", x.category)}{list.seesAll ? ` · ${x.requesterName}` : ""} · {when(x.lastMessageAt ?? x.openedAt)}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            {!t ? <Skeleton style={{ height: 320 }} /> : (
              <>
                <div className="panel-head"><div><h3>{t.docNo} · {t.subject}</h3><p>Opened {when(t.openedAt)} by {t.requesterName}</p></div></div>
                <div className="row mb" style={{ flexWrap: "wrap", gap: 6 }}>
                  <span className={`badge ${toneOf(lookups, "SupportTicketPriority", t.priority)}`}>{labelOf(lookups, "SupportTicketPriority", t.priority)}</span>
                  <span className={`badge ${toneOf(lookups, "SupportTicketStatus", t.status)}`}>{labelOf(lookups, "SupportTicketStatus", t.status)}</span>
                  <span className="badge neutral">{labelOf(lookups, "SupportTicketCategory", t.category)}</span>
                </div>
                <div className="stack">
                  {t.messages.map((m) => (
                    <div key={m.id} className="list-item">
                      <span className={cn("avatar sm", m.authorKind === "STAFF" && "c3")}>{m.authorKind === "STAFF" ? "AX" : initials(m.authorName)}</span>
                      <div><b>{m.authorKind === "STAFF" ? `${m.authorName} · Accountex support` : m.authorName}</b><small>{when(m.postedAt)}</small><p className="small" style={{ whiteSpace: "pre-wrap" }}>{m.body}</p></div>
                    </div>
                  ))}
                </div>
                {t.status === "RESOLVED" && (
                  <div className="banner good mt"><Star /><div><b>Was this resolved to your satisfaction?</b>
                    <div className="row mt" style={{ gap: 4 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="btn ghost sm" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating({ ...rating, stars: n })} style={{ color: n <= rating.stars ? "var(--warn, #d97706)" : undefined, padding: 4 }}><Star fill={n <= rating.stars ? "currentColor" : "none"} /></button>)}</div>
                    <input className="mt" value={rating.comment} maxLength={1000} placeholder="Anything we could do better? (optional)" style={{ width: "100%" }} onChange={(e) => setRating({ ...rating, comment: e.target.value })} />
                    <div className="row mt"><span className="spacer" /><button type="button" className="btn primary sm" disabled={busy || !rating.stars} onClick={rate}>Rate &amp; close</button></div>
                    <small className="muted">Not fixed? Reply below and the ticket reopens.</small>
                  </div></div>
                )}
                {t.csatRating !== null && <p className="small mt">You rated this {"★".repeat(t.csatRating)}{"☆".repeat(5 - t.csatRating)}{t.csatComment ? ` · “${t.csatComment}”` : ""}</p>}
                {t.status !== "CLOSED" ? (
                  <>
                    <label className="mt" style={{ display: "block" }}><textarea rows={3} value={reply} maxLength={5000} placeholder="Reply to Accountex support…" style={{ width: "100%" }} onChange={(e) => setReply(e.target.value)} /></label>
                    <div className="row mt"><small className="muted">{TICKET_OPEN_STATUSES.includes(t.status) ? "We usually reply within the SLA of the priority." : "Replying reopens the ticket."}</small><span className="spacer" /><button type="button" className="btn primary" disabled={busy || !reply.trim()} onClick={send}><Send />Send reply</button></div>
                  </>
                ) : <p className="muted small mt">This ticket is closed. Raise a new ticket if you need more help.</p>}
              </>
            )}
          </div>
        </div>
      )}
      {raising && <RaiseTicketModal lookups={lookups} onClose={() => setRaising(false)} onRaised={(id) => { setRaising(false); setSel(id); reload(); }} />}
    </>
  );
}

function RaiseTicketModal({ lookups, onClose, onRaised }: { lookups: ReturnType<typeof useLookups>; onClose: () => void; onRaised: (id: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ subject: "", category: "GENERAL", priority: "NORMAL", body: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const p = TicketRaiseSchema.safeParse(f);
    if (!p.success) { const e: Record<string, string> = {}; for (const i of p.error.issues) { const k = String(i.path[0]); if (!e[k]) e[k] = i.message; } setErrs(e); return; }
    setBusy(true);
    try { const t = await raiseTicket(f); toast(`${t.docNo} raised · Accountex support will reply here`, { tone: "good" }); onRaised(t.id); }
    catch (e) { toast(errorOf(e, "Could not raise the ticket"), { tone: "danger" }); if (e instanceof ApiError && e.details) setErrs(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""]))); }
    finally { setBusy(false); }
  };
  const err = (k: string) => errs[k] && <small className="hint text-danger">{errs[k]}</small>;
  return (
    <Modal open onClose={onClose} title="New support ticket" subtitle="Tell Accountex support what you need help with" wide
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={submit}><Send />{busy ? "Sending…" : "Raise ticket"}</button></>}>
      <div className="form-grid">
        <label className="full"><span>Subject *</span><input value={f.subject} maxLength={200} aria-invalid={!!errs.subject} placeholder="e.g. Bank reconciliation does not match the statement" onChange={(e) => setF({ ...f, subject: e.target.value })} />{err("subject")}</label>
        <label><span>Category</span><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{lookupOptions(lookups, "SupportTicketCategory", f.category).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
        <label><span>Priority</span><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{labelOf(lookups, "SupportTicketPriority", p)}</option>)}</select>
          <small className="hint">Urgent 2h · High 4h · Normal 8h · Low 24h first response</small></label>
        <label className="full"><span>Describe the problem *</span><textarea rows={6} value={f.body} maxLength={5000} aria-invalid={!!errs.body} placeholder="What happened, what you expected, and the document numbers involved…" onChange={(e) => setF({ ...f, body: e.target.value })} />{err("body")}</label>
      </div>
    </Modal>
  );
}
