"use client";

import { AlertTriangle, Columns3, Inbox, List, Plus, Search, Smile, Timer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TICKET_LOOKUPS, TICKET_OPEN_STATUSES, slaMinutesLeft, type Ticket, type TicketBoard } from "@/shared";
import { cn } from "@/components/ui/cn";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { getTicketBoard } from "../api";
import { LookupBadge, ago, duration } from "./growth-ui";
import { NewTicketModal, TicketDrawer } from "./ticket-drawer";

const COLS: [string, string, (t: Ticket) => boolean][] = [
  ["NEW", "New", (t) => t.status === "NEW"],
  ["IN_PROGRESS", "In progress", (t) => t.status === "IN_PROGRESS"],
  ["WAITING_ON_CUSTOMER", "Waiting on customer", (t) => t.status === "WAITING_ON_CUSTOMER"],
  ["RESOLVED", "Resolved", (t) => t.status === "RESOLVED" || t.status === "CLOSED"],
];
const CHIPS: [string, string][] = [["", "All"], ["URGENT", "Urgent"], ["BILLING", "Billing"], ["PAYROLL", "Payroll"], ["TAX_FBR", "Tax / FBR"]];
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

/**
 * Template admin/support (30-entry-admin.html 750–824): Board / List, KPIs (open, first response, SLA breaches,
 * CSAT), agent filter and chips, a kanban by status, and the ticket drawer #adm-ticket.
 */
export function SupportScreen({ staffName }: { staffName: string }) {
  const lookups = useAdminLookups(TICKET_LOOKUPS);
  const [board, setBoard] = useState<TicketBoard | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState("");
  const [chip, setChip] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    getTicketBoard({ assigneeStaffId: agent || undefined })
      .then((b) => { if (!cancelled) { setBoard(b); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the tickets" }));
    return () => { cancelled = true; };
  }, [attempt, agent]);

  const head = (
    <div className="page-head">
      <div><div className="eyebrow">Support / Tickets</div><h1>Support tickets</h1><p>Customer issues across all tenants. SLA: Urgent 2h · High 4h · Normal 8h.</p></div>
      <div className="head-actions">
        <div className="seg"><button type="button" className={view === "board" ? "active" : undefined} onClick={() => setView("board")}><Columns3 />Board</button><button type="button" className={view === "list" ? "active" : undefined} onClick={() => setView("list")}><List />List</button></div>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}><Plus />New ticket</button>
      </div>
    </div>
  );
  if (error) return <>{head}<ErrorState {...error} onRetry={reload} /></>;
  if (!board) return <>{head}<Skeleton style={{ height: 110, borderRadius: 18 }} /><Skeleton style={{ height: 420, borderRadius: 18, marginTop: 16 }} /></>;

  const k = board.kpis;
  const s = q.trim().toLowerCase();
  const shown = board.items.filter((t) => (!s || `${t.docNo} ${t.subject} ${t.tenantName} ${t.requesterName}`.toLowerCase().includes(s))
    && (!chip || (chip === "URGENT" ? t.priority === "URGENT" : t.category === chip)));
  const urgentOpen = board.items.filter((t) => t.priority === "URGENT" && TICKET_OPEN_STATUSES.includes(t.status)).length;
  const sla = (t: Ticket) => {
    const m = slaMinutesLeft(t);
    return m === null ? null : m < 0 ? <small className="text-danger">SLA breached {duration(m)} ago</small> : <small className="muted">SLA {duration(m)} left</small>;
  };
  const card = (t: Ticket) => (
    <button key={t.id} type="button" className="kb-card" style={{ textAlign: "left", width: "100%" }} onClick={() => setOpen(t.id)}>
      <div className="row">{t.status === "RESOLVED" || t.status === "CLOSED" ? <LookupBadge lookups={lookups} type="SupportTicketStatus" code={t.status} /> : <LookupBadge lookups={lookups} type="SupportTicketPriority" code={t.priority} />}<span className="spacer" /><small className="muted">{t.docNo}</small></div>
      <b>{t.subject}</b>
      <small className="muted">{t.tenantName} · {t.status === "NEW" ? ago(t.openedAt) : t.csatRating ? stars(t.csatRating) : t.assigneeName ?? "Unassigned"}</small>
      {TICKET_OPEN_STATUSES.includes(t.status) && sla(t)}
    </button>
  );

  return (
    <>
      {head}
      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Open tickets</span><span className="icon-well"><Inbox /></span></div><strong>{k.openTickets}</strong><small>{k.unassignedOpen} unassigned</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>First response</span><span className="icon-well"><Timer /></span></div><strong>{k.avgFirstResponseMin === null ? "—" : `${Math.round(k.avgFirstResponseMin)} min`}</strong><small>Average, last 30 days{k.medianFirstResponseMin !== null ? ` · median ${Math.round(k.medianFirstResponseMin)} min` : ""}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>SLA breaches</span><span className="icon-well"><AlertTriangle /></span></div><strong>{k.slaBreaches30d}</strong><small className={k.breachingNow ? "down" : undefined}>{k.breachingNow} breaching now · 30 days</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>CSAT</span><span className="icon-well"><Smile /></span></div><strong>{k.csatAvg30d === null ? "—" : `${k.csatAvg30d.toFixed(1)} / 5`}</strong><small>{k.csatCount30d} rating{k.csatCount30d === 1 ? "" : "s"} (30d)</small></div>
      </div>

      <div className="toolbar">
        <label className={cn("search-field", q && "has-val")}><Search /><input value={q} placeholder="Search tickets…" onChange={(e) => setQ(e.target.value)} /></label>
        <select value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">All agents</option>{board.staff.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <div className="chips">{CHIPS.map(([c, l]) => <button key={c || "all"} type="button" className={chip === c ? "active" : undefined} onClick={() => setChip(c)}>{l}{c === "URGENT" && urgentOpen > 0 && <i>{urgentOpen}</i>}</button>)}</div>
      </div>

      {!board.items.length ? (
        <EmptyState icon={<Inbox />} title="No support tickets yet" description="Tickets raised by companies from Help & support, or logged here, appear on this board." action={<button type="button" className="btn primary sm" onClick={() => setCreating(true)}><Plus />New ticket</button>} />
      ) : view === "board" ? (
        <div className="kanban">
          {COLS.map(([key, label, test]) => {
            const list = shown.filter(test);
            return (
              <div key={key} className="kb-col">
                <div className="kb-col-head"><h4>{label}</h4><span className="badge neutral">{board.items.filter(test).length}</span></div>
                {list.map(card)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel flush">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Ticket</th><th>Subject</th><th>Company</th><th>Priority</th><th>Status</th><th>Category</th><th>Assignee</th><th>Opened</th><th>SLA</th></tr></thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => setOpen(t.id)}>
                    <td className="tnum"><b>{t.docNo}</b></td><td>{t.subject}</td><td>{t.tenantName}</td>
                    <td><LookupBadge lookups={lookups} type="SupportTicketPriority" code={t.priority} /></td>
                    <td><LookupBadge lookups={lookups} type="SupportTicketStatus" code={t.status} dot /></td>
                    <td>{labelOf(lookups, "SupportTicketCategory", t.category)}</td><td>{t.assigneeName ?? <span className="muted">Unassigned</span>}</td>
                    <td className="muted">{ago(t.openedAt)}</td><td>{sla(t) ?? (t.csatRating ? stars(t.csatRating) : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && <TicketDrawer id={open} staff={board.staff} staffName={staffName} lookups={lookups} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <NewTicketModal staff={board.staff} lookups={lookups} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); reload(); setOpen(id); }} />}
    </>
  );
}
