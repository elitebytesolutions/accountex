"use client";

import { ArrowRight, Clock, FileBadge, Inbox, Plus, Search, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MyHelpdesk as MyHelpdeskData } from "@/shared/self-service/helpdesk";
import type { TicketItem, TicketList } from "@/shared/self-service/helpdesk-ticket";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { listTickets } from "@/features/ess-requests/helpdesk-tickets/api";
import { RaiseTicket } from "@/features/ess-requests/helpdesk-tickets/components/raise-ticket";
import { MiniStars, SlaChip, StatusBadge, isLive, slaUsed, useNow, when } from "@/features/ess-requests/helpdesk-tickets/components/ticket-bits";
import { TicketDrawer } from "@/features/ess-requests/helpdesk-tickets/components/ticket-drawer";
import { Av } from "@/features/hr/components/ess-bits";
import { myHelpdesk } from "../api";
import { deskIcon } from "./ess-ui";

const FILTERS: [string, string][] = [["ALL", "All"], ["OPEN", "Open"], ["IN_PROGRESS", "In progress"], ["RESOLVED", "Resolved"], ["CLOSED", "Closed"]];
const hours = (h: number) => (Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`);
type Scope = "mine" | "assigned" | "all";

/** Template app/profile/helpdesk (9C-ess.js 11-helpdesk): desk cards, My tickets with live SLA countdowns + chat drawer, and the "Quick answers" FAQ search. Agents get Assigned / All tabs. */
export function MyHelpdesk({ canRaise }: { canRaise: boolean }) {
  const [data, setData] = useState<MyHelpdeskData | null>(null);
  const [tickets, setTickets] = useState<TicketList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("mine");
  const [filter, setFilter] = useState("ALL");
  const [raise, setRaise] = useState<{ desk: string | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mine, setMine] = useState<TicketList | null>(null);

  useEffect(() => {
    let cancelled = false;
    myHelpdesk()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the helpdesk" }));
    return () => { cancelled = true; };
  }, [attempt]);

  const reload = useCallback(() => {
    listTickets(scope, filter).then(setTickets).catch((e: unknown) => setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load your tickets" }));
    if (scope !== "mine") listTickets("mine").then(setMine).catch(() => undefined);
  }, [scope, filter]);
  useEffect(() => { reload(); }, [reload, attempt]);
  const own = scope === "mine" ? tickets : mine;

  const now = useNow(!!tickets?.items.some(isLive));
  const query = q.trim().toLowerCase();
  const hit = (f: MyHelpdeskData["faqs"][number]) => !query || `${f.category.name} ${f.question} ${f.answer} ${f.keywords.join(" ")}`.toLowerCase().includes(query);
  const counts = tickets?.counts ?? {};
  const all = Object.values(counts).reduce((n, c) => n + c, 0);
  const active = (counts.OPEN ?? 0) + (counts.IN_PROGRESS ?? 0);
  const rated = (own?.items ?? []).filter((t) => t.csatRating);
  const avgCsat = rated.length ? rated.reduce((n, t) => n + (t.csatRating ?? 0), 0) / rated.length : null;
  const noEmployee = tickets !== null && tickets.meId === null;

  const row = (t: TicketItem, i: number) => {
    const { Icon, tone } = deskIcon(t.category.icon);
    return (
      <article key={t.id} className="es-hd-tk es-in" style={{ ["--i" as string]: i }} tabIndex={0} role="button" onClick={() => setOpenId(t.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(t.id); } }}>
        <span className={`icon-tile ${tone}`}><Icon /></span>
        <div className="es-hd-tk-main">
          <div className="es-hd-tk-top"><small>{t.docNo} · {t.category.name}</small>{t.priority === "HIGH" && <span className="badge danger">High</span>}</div>
          <b>{t.subject}</b>
          <div className="es-hd-tk-meta">
            {scope !== "mine" ? <><Av name={t.employee.name} size="xs" /><span>{t.employee.name}</span></> : t.agent ? <><Av name={t.agent.name} size="xs" /><span>{t.agent.name}</span></> : <span>Unassigned</span>}
            <span className="es-hd-sep">·</span><span>{t.messageCount} message{t.messageCount === 1 ? "" : "s"}</span>
            <span className="es-hd-sep">·</span><span>Opened {when(t.openedAt, now)}</span>
          </div>
          {isLive(t) && <div className="es-hd-slabar"><i style={{ width: `${slaUsed(t, now)}%` }} /></div>}
        </div>
        <div className="es-hd-tk-side">
          <StatusBadge status={t.status} />
          <SlaChip t={t} now={now} />
          {t.status === "RESOLVED" && scope === "mine" ? <span className="es-hd-rate"><Star />Rate</span> : t.csatRating ? <MiniStars n={t.csatRating} /> : null}
        </div>
      </article>
    );
  };

  return (
    <>
      <PageHead eyebrow="My Profile / Helpdesk" title="Helpdesk"
        description={data?.categories.length ? `Ask ${data.categories.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " or $1")}. Every ticket has a response SLA, and you can follow it live.` : "Ask HR, Payroll, IT or Admin. Every ticket has a response SLA, and you can follow it live."}
        actions={<>
          <Link className="btn secondary" href="/profile/requests"><FileBadge />Letters &amp; requests</Link>
          {canRaise && <button className="btn primary" type="button" disabled={!data?.categories.length || noEmployee} title={noEmployee ? "Your user is not linked to an employee record" : undefined} onClick={() => setRaise({ desk: null })}><Plus />New ticket</button>}
        </>} />

      {error ? <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} /> : (
        <>
          <div className="es-grid es-g4 es-hd-cats">
            {!data ? [0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 150 }} />) : data.categories.length ? data.categories.map((c, i) => {
              const { Icon, tone } = deskIcon(c.icon);
              const open = own?.desks.find((d) => d.id === c.id)?.open ?? 0;
              const can = canRaise && !noEmployee;
              return (
                <button key={c.id} type="button" className="es-card es-hd-cat es-in" style={{ ["--i" as string]: i }} disabled={!can} onClick={() => setRaise({ desk: c.id })}>
                  <div className="es-row"><span className={`icon-tile ${tone}`}><Icon /></span><span className="spacer" style={{ flex: 1 }} /><span className="pill">{open} open</span></div>
                  <div><b>{c.name}</b><small>{c.description ?? ""}</small></div>
                  <div className="es-hd-cat-foot"><span><Clock />Reply within {hours(c.slaHours)}</span><span className="es-link">Ask<ArrowRight /></span></div>
                </button>
              );
            }) : <div className="es-span"><EmptyState title="No helpdesk desks yet" description="HR sets up the desks (HR, Payroll, IT, Admin) in Helpdesk setup." /></div>}
          </div>

          <div className="es-grid es-main">
            <div className="es-card flush">
              <div className="es-head">
                {tickets?.isAgent ? (
                  <div className="chips" role="tablist" aria-label="Tickets">
                    {([["mine", "My tickets"], ["assigned", "Assigned to me"], ...(tickets.isHr ? [["all", "All tickets"]] : [])] as [Scope, string][]).map(([k, l]) => (
                      <button key={k} type="button" role="tab" aria-selected={scope === k} className={scope === k ? "active" : undefined} onClick={() => { setScope(k); setTickets(null); }}>{l}</button>
                    ))}
                  </div>
                ) : <h3>My tickets</h3>}
                <span className="es-count">{active}</span><span className="es-label">active</span><span className="spacer" />
                <div className="chips es-hd-chips">{FILTERS.map(([k, l]) => <button key={k} type="button" className={filter === k ? "active" : undefined} onClick={() => setFilter(k)}>{l} <i>{k === "ALL" ? all : counts[k] ?? 0}</i></button>)}</div>
              </div>
              <div className="es-hd-list">
                {!tickets ? [0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 92 }} />) : noEmployee && scope !== "all" ? (
                  <div className="es-empty"><span className="icon-tile orange"><Inbox /></span><b>No employee record</b><span>Your user is not linked to an employee record, so you can’t raise tickets. Ask HR to link it.</span></div>
                ) : tickets.items.length ? tickets.items.map(row) : (
                  <div className="es-empty"><span className="icon-tile lime"><Inbox /></span><b>{filter === "ALL" ? (scope === "mine" ? "No tickets yet" : "Nothing here") : `No ${FILTERS.find((f) => f[0] === filter)![1].toLowerCase()} tickets`}</b><span>{scope === "mine" ? "Pick a desk above to ask a question. Check the quick answers first." : "Nice and quiet here."}</span></div>
                )}
              </div>
            </div>
            <div className="es-col">
              <div className="es-card es-hd-perf">
                <div className="es-head"><h3>Service levels</h3><span className="spacer" /><span className="pill"><Clock />Reply SLA</span></div>
                {!data ? <Skeleton style={{ height: 90 }} /> : (
                  <div className="es-hd-perf-list">
                    {data.categories.map((c) => <div key={c.id}><span>{c.name}</span><b>{hours(c.slaHours)}</b></div>)}
                    {!data.categories.length && <div><span>No desks yet</span><b>—</b></div>}
                    {avgCsat !== null && <div><span>Your average rating</span><b className="es-hd-gold">{avgCsat.toFixed(1)} / 5</b></div>}
                  </div>
                )}
              </div>
              <div className="es-card">
                <div className="es-head"><h3>Quick answers</h3><span className="spacer" /><Sparkles className="es-hd-spark" /></div>
                <label className="search-field es-hd-faqs" data-plain-search><Search /><input placeholder="Search answers…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search answers" /></label>
                <div className="es-hd-faq">
                  {!data ? <Skeleton style={{ height: 160 }} /> : data.faqs.length ? data.faqs.map((f) => (
                    <details key={`${f.id}-${query ? "q" : ""}`} style={hit(f) ? undefined : { display: "none" }} open={!!query && hit(f)}>
                      <summary><span className="badge neutral">{f.category.name}</span>{f.question}</summary>
                      <p>{f.answer}</p>
                    </details>
                  )) : <div className="es-empty"><b>No answers yet</b><span>HR publishes common answers here.</span></div>}
                  {data && data.faqs.length > 0 && !data.faqs.some(hit) && <div className="es-empty"><b>No answers match</b><span>Try another word.</span></div>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {data && raise && (
        <RaiseTicket key={raise.desk ?? "any"} open desks={data.categories} routing={own?.desks ?? []} faqs={data.faqs} initialDesk={raise?.desk ?? null} onClose={() => setRaise(null)}
          onRaised={(t) => { setRaise(null); setScope("mine"); setFilter("ALL"); reload(); setOpenId(t.id); }} />
      )}
      <TicketDrawer id={openId} meId={tickets?.meId ?? null} isHr={!!tickets?.isHr} onClose={() => setOpenId(null)} onChanged={reload} />
    </>
  );
}
