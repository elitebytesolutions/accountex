"use client";

import { CheckCheck, History, Lock, MessageSquare, Paperclip, RotateCcw, Send, VenetianMask, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TICKET_CHANNELS, TICKET_OPEN_STATUSES, TICKET_PRIORITIES, TicketCreateSchema, slaMinutesLeft, type ConfigTenantOption, type LookupsResponse, type TicketDetail } from "@/shared";
import { Drawer, Modal } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { listConfigTenants } from "@/features/platform-config/api";
import { labelOf, lookupOptions } from "@/features/settings/use-lookups";
import { Avatar } from "@/features/platform-tenants/components/tenant-ui";
import { assignTicket, createTicket, getTicket, impersonateFromTicket, replyTicket, ticketAction, updateTicket } from "../api";
import { LookupBadge, dateTime, duration } from "./growth-ui";

/**
 * Template ticket drawer #adm-ticket: badges and SLA, requester / assignee / plan, the thread (internal notes in
 * italics), reply with "Internal note", Resolve and Send reply. Adds assignment, priority, reopen / close, support
 * access from the ticket (Phase 40 impersonation) and History. Attachments wait for an upload service.
 */
export function TicketDrawer({ id, staff, staffName, lookups, onClose, onChanged }: {
  id: string; staff: { id: string; name: string }[]; staffName: string; lookups: LookupsResponse; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [t, setT] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"thread" | "history">("thread");
  const [imp, setImp] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    let cancelled = false;
    getTicket(id).then((x) => !cancelled && setT(x)).catch((e: unknown) => { toast(adminErrorMessage(e, "Could not load the ticket"), { tone: "danger" }); closeRef.current(); });
    return () => { cancelled = true; };
  }, [id, toast]);

  const run = async (fn: () => Promise<TicketDetail>, ok: string) => {
    setBusy(true);
    try { setT(await fn()); onChanged(); toast(ok, { tone: "good" }); return true; }
    catch (e) { toast(adminErrorMessage(e, "Could not update the ticket"), { tone: "danger" }); return false; }
    finally { setBusy(false); }
  };
  const send = async (resolve: boolean) => {
    if (!t) return;
    if (!reply.trim()) {
      if (resolve) { await run(() => ticketAction(t.id, "resolve", t.rowVersion), `${t.docNo} resolved`); return; }
      toast("Write the reply first", { tone: "warn" }); return;
    }
    if (await run(() => replyTicket(t.id, { body: reply.trim(), isInternalNote: internal && !resolve, resolve }), resolve ? `${t.docNo} resolved` : internal ? "Internal note added" : "Reply sent")) {
      setReply(""); setInternal(false);
    }
  };

  const open = t ? TICKET_OPEN_STATUSES.includes(t.status) : false;
  const sla = t ? slaMinutesLeft(t) : null;
  return (
    <>
      <Drawer open onClose={onClose} title={t ? `${t.docNo} · ${t.subject}` : "Ticket"} subtitle={t ? `${t.tenantName} · opened ${dateTime(t.openedAt)}` : "Loading…"} wide
        foot={!t ? undefined : tab === "history" ? <button type="button" className="btn secondary" onClick={() => setTab("thread")}><MessageSquare />Back to thread</button> : (
          <>
            <button type="button" className="btn ghost" onClick={() => setTab("history")}><History />History</button>
            {t.status === "RESOLVED" && <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => ticketAction(t.id, "reopen", t.rowVersion), `${t.docNo} reopened`)}><RotateCcw />Reopen</button>}
            {t.status !== "CLOSED" && <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => ticketAction(t.id, "close", t.rowVersion), `${t.docNo} closed`)}><X />Close</button>}
            <span className="spacer" />
            {open && <button type="button" className="btn secondary" disabled={busy} onClick={() => send(true)}><CheckCheck />Resolve</button>}
            {t.status !== "CLOSED" && <button type="button" className="btn primary" disabled={busy} onClick={() => send(false)}><Send />{internal ? "Add note" : "Send reply"}</button>}
          </>
        )}>
        {!t ? <Skeleton style={{ height: 360, borderRadius: 14 }} /> : tab === "history" ? <AdminHistoryTab table="SupportTickets" id={t.id} /> : (
          <>
            <div className="row mb" style={{ flexWrap: "wrap", gap: 6 }}>
              <LookupBadge lookups={lookups} type="SupportTicketPriority" code={t.priority} />
              <LookupBadge lookups={lookups} type="SupportTicketStatus" code={t.status} />
              <span className="badge neutral">{labelOf(lookups, "SupportTicketCategory", t.category)}</span>
              <span className="spacer" />
              <small className={sla !== null && sla < 0 ? "text-danger" : "muted"}>
                {sla === null ? (t.firstResponseAt ? `First response ${dateTime(t.firstResponseAt)}` : "") : sla < 0 ? `SLA breached ${duration(sla)} ago` : `SLA ${duration(sla)} left`}
              </small>
            </div>
            <div className="dl mb">
              <div><span>Requester</span><b>{t.requesterName}{t.requesterRole ? ` · ${t.requesterRole}` : ""}</b></div>
              <div><span>Assignee</span><b>
                <select value={t.assigneeStaffId ?? ""} disabled={busy || t.status === "CLOSED"} onChange={(e) => run(() => assignTicket(t.id, e.target.value || null, t.rowVersion), e.target.value ? "Ticket assigned" : "Ticket unassigned")}>
                  <option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></b></div>
              <div><span>Plan</span><b>{t.planName ?? "—"}</b></div>
              <div><span>Priority</span><b>
                <select value={t.priority} disabled={busy || t.status === "CLOSED"} onChange={(e) => run(() => updateTicket(t.id, { priority: e.target.value, rowVersion: t.rowVersion }), "Priority changed · SLA recalculated")}>
                  {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{labelOf(lookups, "SupportTicketPriority", p)}</option>)}
                </select></b></div>
              <div><span>Channel</span><b>{labelOf(lookups, "SupportTicketChannel", t.channel)}</b></div>
              {t.csatRating !== null && <div><span>CSAT</span><b>{"★".repeat(t.csatRating)}{"☆".repeat(5 - t.csatRating)}{t.csatComment ? ` · ${t.csatComment}` : ""}</b></div>}
            </div>
            <div className="row mb">
              <button type="button" className="btn secondary sm" disabled={t.status === "CLOSED"} onClick={() => setImp(true)}><VenetianMask />Impersonate from ticket</button>
              {t.supportSessions.length > 0 && <small className="muted">{t.supportSessions.length} support session{t.supportSessions.length > 1 ? "s" : ""} · last {dateTime(t.supportSessions[0]!.startedAt)}</small>}
            </div>
            <div className="stack">
              {t.messages.map((m) => (
                <div key={m.id} className="list-item">
                  <Avatar name={m.authorName} size="sm" />
                  <div><b>{m.authorName}</b><small>{dateTime(m.postedAt)}{m.isInternalNote ? " · internal note" : ""}</small>
                    <p className="small" style={{ whiteSpace: "pre-wrap" }}>{m.isInternalNote ? <i>{m.body}</i> : m.body}</p></div>
                </div>
              ))}
            </div>
            {t.status !== "CLOSED" && <>
              <label className="mt" style={{ display: "block" }}><textarea rows={3} value={reply} maxLength={5000} placeholder={internal ? "Internal note (never shown to the company)…" : `Reply to ${t.requesterName}…`} style={{ width: "100%" }} onChange={(e) => setReply(e.target.value)} /></label>
              <div className="row mt"><label className="check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> <Lock style={{ width: 14, height: 14 }} />Internal note</label><span className="spacer" />
                <button type="button" className="btn ghost sm" disabled title="Attachments arrive with the upload service"><Paperclip />Attach</button></div>
            </>}
          </>
        )}
      </Drawer>
      {t && imp && <ImpersonateFromTicket ticket={t} staffName={staffName} onClose={() => setImp(false)} onStarted={() => { setImp(false); onChanged(); void getTicket(t.id).then(setT); }} />}
    </>
  );
}

/** Support access from a ticket: the Phase 40 session, as the requester by default, linked to the ticket. */
function ImpersonateFromTicket({ ticket, staffName, onClose, onStarted }: { ticket: TicketDetail; staffName: string; onClose: () => void; onStarted: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ reason: `Investigating ${ticket.subject}`.slice(0, 200), mins: 30 as 30 | 60, ro: true });
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (f.reason.trim().length < 5) { toast("Add a reason before impersonating", { tone: "warn" }); return; }
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const r = await impersonateFromTicket(ticket.id, { reason: f.reason.trim(), timeLimitMinutes: f.mins, isReadOnly: f.ro });
      if (tab) tab.location.href = r.openUrl; else window.open(r.openUrl, "_blank");
      toast(`Signed in as ${r.session.targetUserLabel} for ${f.mins} min · linked to ${ticket.docNo}`, { tone: "info" });
      onStarted();
    } catch (e) {
      tab?.close();
      toast(adminErrorMessage(e, "Could not start the support session"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Impersonate from ticket" subtitle={`${ticket.docNo} · ${ticket.tenantName} · as ${ticket.requesterName}`}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={start}>{busy ? "Starting…" : <><VenetianMask />Start session</>}</button></>}>
      <div className="form-grid">
        <label className="full"><span>Reason *</span><textarea rows={3} value={f.reason} maxLength={440} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
      </div>
      <div className="ap-imp-opts">
        <div><div className="ap-lbl">Time limit</div><div className="seg">{([30, 60] as const).map((m) => <button key={m} type="button" className={f.mins === m ? "active" : undefined} onClick={() => setF({ ...f, mins: m })}>{m} min</button>)}</div></div>
        <label className="switch"><input type="checkbox" checked={f.ro} onChange={(e) => setF({ ...f, ro: e.target.checked })} /><i /><span>Read-only (block posting and deletes)</span></label>
      </div>
      <p className="muted small mt">The company sees a banner naming Accountex support ({staffName}) for the whole session, and the session is recorded on this ticket.</p>
    </Modal>
  );
}

/** "New ticket": the Super Admin logs an issue reported by phone, email, chat… for a company. */
export function NewTicketModal({ staff, lookups, onClose, onCreated }: {
  staff: { id: string; name: string }[]; lookups: LookupsResponse; onClose: () => void; onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [tenants, setTenants] = useState<ConfigTenantOption[]>([]);
  const [f, setF] = useState({ tenantId: "", subject: "", category: "GENERAL", priority: "NORMAL", channel: "PHONE", requesterName: "", requesterEmail: "", requesterRole: "", assigneeStaffId: "", body: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { void listConfigTenants().then(setTenants).catch(() => undefined); }, []);
  const set = (k: keyof typeof f, v: string) => { setErrs((e) => { const n = { ...e }; delete n[k]; return n; }); setF((x) => ({ ...x, [k]: v })); };
  const save = async () => {
    const body = { ...f, assigneeStaffId: f.assigneeStaffId || null };
    const p = TicketCreateSchema.safeParse(body);
    if (!p.success) { const e: Record<string, string> = {}; for (const i of p.error.issues) { const k = String(i.path[0]); if (!e[k]) e[k] = i.message; } setErrs(e); return; }
    setBusy(true);
    try { const t = await createTicket(body); toast(`${t.docNo} created for ${t.tenantName}`, { tone: "good" }); onCreated(t.id); }
    catch (e) { setErrs(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not create the ticket"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const err = (k: string) => errs[k] && <small className="hint text-danger">{errs[k]}</small>;
  return (
    <Modal open onClose={onClose} title="New ticket" subtitle="Log an issue a company reported by phone, email or chat" wide
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}><Send />{busy ? "Creating…" : "Create ticket"}</button></>}>
      <div className="form-grid">
        <label><span>Company *</span><select value={f.tenantId} aria-invalid={!!errs.tenantId} onChange={(e) => set("tenantId", e.target.value)}><option value="">Choose…</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code.toUpperCase()})</option>)}</select>{err("tenantId")}</label>
        <label><span>Channel</span><select value={f.channel} onChange={(e) => set("channel", e.target.value)}>{TICKET_CHANNELS.filter((c) => c !== "PORTAL").map((c) => <option key={c} value={c}>{labelOf(lookups, "SupportTicketChannel", c)}</option>)}</select></label>
        <label className="full"><span>Subject *</span><input value={f.subject} maxLength={200} aria-invalid={!!errs.subject} placeholder="e.g. FBR POS invoices not syncing" onChange={(e) => set("subject", e.target.value)} />{err("subject")}</label>
        <label><span>Category</span><select value={f.category} onChange={(e) => set("category", e.target.value)}>{lookupOptions(lookups, "SupportTicketCategory", f.category).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
        <label><span>Priority</span><select value={f.priority} onChange={(e) => set("priority", e.target.value)}>{TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{labelOf(lookups, "SupportTicketPriority", p)}</option>)}</select></label>
        <label><span>Reported by *</span><input value={f.requesterName} maxLength={120} aria-invalid={!!errs.requesterName} placeholder="e.g. Sana Javed" onChange={(e) => set("requesterName", e.target.value)} />{err("requesterName")}</label>
        <label><span>Their email</span><input type="email" value={f.requesterEmail} maxLength={160} aria-invalid={!!errs.requesterEmail} onChange={(e) => set("requesterEmail", e.target.value)} />{err("requesterEmail")}</label>
        <label><span>Their role</span><input value={f.requesterRole} maxLength={80} placeholder="e.g. Finance Manager" onChange={(e) => set("requesterRole", e.target.value)} /></label>
        <label><span>Assignee</span><select value={f.assigneeStaffId} onChange={(e) => set("assigneeStaffId", e.target.value)}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="full"><span>What happened *</span><textarea rows={4} value={f.body} maxLength={5000} aria-invalid={!!errs.body} onChange={(e) => set("body", e.target.value)} />{err("body")}</label>
      </div>
    </Modal>
  );
}
