"use client";

import { ArrowRight, Clock, FileBadge, Inbox, Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MyHelpdesk as MyHelpdeskData } from "@/shared/self-service/helpdesk";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { myHelpdesk } from "../api";
import { deskIcon } from "./ess-ui";

const FILTERS = ["All", "Open", "In progress", "Resolved", "Closed"];
const LATER = "Tickets arrive with the helpdesk desk in Phase 34";
const hours = (h: number) => (Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`);

/** Template app/profile/helpdesk (9C-ess.js 11-helpdesk): desk cards, My tickets (Phase 34) and the "Quick answers" FAQ search. */
export function MyHelpdesk() {
  const [data, setData] = useState<MyHelpdeskData | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    myHelpdesk()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the helpdesk" }));
    return () => { cancelled = true; };
  }, [attempt]);

  const query = q.trim().toLowerCase();
  const hit = (f: MyHelpdeskData["faqs"][number]) => !query || `${f.category.name} ${f.question} ${f.answer} ${f.keywords.join(" ")}`.toLowerCase().includes(query);

  return (
    <>
      <PageHead eyebrow="My Profile / Helpdesk" title="Helpdesk"
        description={data?.categories.length ? `Ask ${data.categories.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " or $1")}. Every ticket has a response SLA, and you can follow it live.` : "Ask HR, Payroll, IT or Admin. Every ticket has a response SLA, and you can follow it live."}
        actions={<>
          <Link className="btn secondary" href="/profile/requests"><FileBadge />Letters &amp; requests</Link>
          <button className="btn primary" type="button" disabled title={LATER}><Plus />New ticket</button>
        </>} />

      {error ? <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} /> : (
        <>
          <div className="es-grid es-g4 es-hd-cats">
            {!data ? [0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 150 }} />) : data.categories.length ? data.categories.map((c, i) => {
              const { Icon, tone } = deskIcon(c.icon);
              return (
                <div key={c.id} className="es-card es-hd-cat es-in" style={{ ["--i" as string]: i }} title={LATER} aria-disabled>
                  <div className="es-row"><span className={`icon-tile ${tone}`}><Icon /></span><span className="spacer" style={{ flex: 1 }} /><span className="pill">0 open</span></div>
                  <div><b>{c.name}</b><small>{c.description ?? ""}</small></div>
                  <div className="es-hd-cat-foot"><span><Clock />Reply within {hours(c.slaHours)}</span><span className="es-link" style={{ opacity: 0.55 }}>Ask<ArrowRight /></span></div>
                </div>
              );
            }) : <div className="es-span"><EmptyState title="No helpdesk desks yet" description="HR sets up the desks (HR, Payroll, IT, Admin) in Helpdesk setup." /></div>}
          </div>

          <div className="es-grid es-main">
            <div className="es-card flush">
              <div className="es-head"><h3>My tickets</h3><span className="es-count">0</span><span className="es-label">active</span><span className="spacer" />
                <div className="chips es-hd-chips">{FILTERS.map((f, i) => <button key={f} type="button" className={i ? undefined : "active"} disabled={i > 0}>{f} <i>0</i></button>)}</div>
              </div>
              <div className="es-hd-list">
                <div className="es-empty"><span className="icon-tile lime"><Inbox /></span><b>No tickets yet</b><span>Raising and following tickets arrives with Phase 34. Until then, check the quick answers.</span></div>
              </div>
            </div>
            <div className="es-col">
              <div className="es-card es-hd-perf">
                <div className="es-head"><h3>Service levels</h3><span className="spacer" /><span className="pill"><Clock />Reply SLA</span></div>
                {!data ? <Skeleton style={{ height: 90 }} /> : (
                  <div className="es-hd-perf-list">
                    {data.categories.map((c) => <div key={c.id}><span>{c.name}</span><b>{hours(c.slaHours)}</b></div>)}
                    {!data.categories.length && <div><span>No desks yet</span><b>—</b></div>}
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
    </>
  );
}
