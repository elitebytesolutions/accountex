"use client";

import { Check, CheckCheck, CircleX, Hourglass, Inbox, Mail, MessageCircle, MessageSquareText, Search, Send } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReminderDue, ReminderLog } from "@/shared";
import { EmptyState, Skeleton } from "@/components/ui/states";

const fmt = (n: number) => n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
const dstr = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
const dtime = (d: string) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" });
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const CHAN: Record<string, [React.ReactNode, string, string]> = {
  WHATSAPP: [<MessageCircle key="i" />, "WhatsApp", "wa"], SMS: [<MessageSquareText key="i" />, "SMS", "sm"], EMAIL: [<Mail key="i" />, "Email", "em"],
};

/** Overdue customers from the reminder queue, one row per customer (template cp-rm-over). */
export type OverdueCustomer = {
  id: string; name: string; contact: string | null; invoices: ReminderDue[]; balance: number; maxDays: number; rule: string | null; dunningLevel: string | null;
  channels: string[]; dueNow: boolean; lastAt: string | null; lastStatus: string | null;
};

export function groupDue(due: ReminderDue[]): OverdueCustomer[] {
  const m = new Map<string, OverdueCustomer>();
  for (const d of due) {
    const c = m.get(d.customer.id) ?? {
      id: d.customer.id, name: d.customer.name, contact: d.recipientMobile ?? d.recipientEmail, invoices: [], balance: 0, maxDays: 0, rule: null, dunningLevel: null,
      channels: [], dueNow: false, lastAt: null, lastStatus: null,
    };
    c.invoices.push(d);
    c.balance += d.balance;
    if (d.daysOverdue >= c.maxDays) { c.maxDays = d.daysOverdue; c.rule = d.rule?.name ?? c.rule; c.dunningLevel = d.dunningLevel ?? c.dunningLevel; }
    for (const ch of d.channels) if (!c.channels.includes(ch)) c.channels.push(ch);
    c.dueNow ||= d.isDueNow;
    if (d.lastReminderAt && (!c.lastAt || d.lastReminderAt > c.lastAt)) { c.lastAt = d.lastReminderAt; c.lastStatus = d.lastReminderStatus; }
    m.set(c.id, c);
  }
  return [...m.values()].sort((a, b) => b.maxDays - a.maxDays || b.balance - a.balance);
}

export function OverdueCustomersPanel({ rows, canSend, busy, onSend, onSendAll }: {
  rows: OverdueCustomer[] | null; canSend: boolean; busy: string | null; onSend: (customerId: string) => void; onSendAll: () => void;
}) {
  const dueNow = rows?.filter((r) => r.dueNow).length ?? 0;
  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Overdue customers</h3><p>Send a reminder right now with the rule that matches their age</p></div>
        <div className="panel-actions">
          <button className="btn secondary sm" type="button" disabled={!canSend || !dueNow || !!busy} title={canSend ? "Queue every reminder that is due now" : "You can't send reminders"} onClick={onSendAll}>
            <Send />Send to all {dueNow}
          </button>
        </div>
      </div>
      {!rows ? <div style={{ padding: 16 }}><Skeleton style={{ height: 160 }} /></div> : rows.length ? (
        <div className="table-wrap">
          <table className="tbl cp-rm-over" data-plain>
            <thead><tr><th>Customer</th><th>Invoice</th><th>Overdue</th><th className="num">Amount (Rs)</th><th>Rule</th><th>Last reminder</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const first = r.invoices[0]!;
                return (
                  <tr key={r.id}>
                    <td><div className="cell-user"><span className="avatar sm">{initials(r.name)}</span><div><b>{r.name}</b><small>{r.contact ?? "No mobile / email"}</small></div></div></td>
                    <td><Link className="link" href={`/sales/invoices/${first.invoice.id}`}>{first.invoice.docNo}</Link>
                      <small>{r.invoices.length > 1 ? `+${r.invoices.length - 1} more · ` : ""}Due {dstr(first.invoice.dueDate)}</small></td>
                    <td><span className={`badge ${r.maxDays >= 15 ? "danger" : r.maxDays >= 7 ? "warn" : "info"}`}>{r.maxDays} days</span></td>
                    <td className="num"><b>{fmt(r.balance)}</b></td>
                    <td><small className="cp-rmuted">{r.rule ?? "No rule yet"}{r.dunningLevel ? ` · ${r.dunningLevel.toLowerCase()}` : ""}</small>
                      <div className="row" style={{ gap: 4, marginTop: 4 }}>{r.channels.map((c) => <span key={c} className={`cp-ch ${CHAN[c]?.[2] ?? "dr"}`} title={CHAN[c]?.[1] ?? c}>{CHAN[c]?.[0]}</span>)}</div></td>
                    <td className="cp-last">{r.lastAt ? <>{dtime(r.lastAt)}{r.lastStatus ? <small>{r.lastStatus === "QUEUED" ? "In outbox" : r.lastStatus.toLowerCase()}</small> : null}</> : "Never"}</td>
                    <td className="actions">
                      <button className="btn secondary sm cp-send" type="button" disabled={!canSend || !!busy} onClick={() => onSend(r.id)}>
                        {busy === r.id ? <span className="cp-spin" /> : <Send />}{busy === r.id ? "Queuing" : "Send now"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon={<Hourglass />} title="No overdue invoices" description="Customers with posted invoices past their due date appear here." />}
    </div>
  );
}

const status = (s: string) => {
  if (s === "QUEUED") return <span className="badge info dot" title="Recorded in the outbox; sent once a provider is connected"><Inbox />In outbox</span>;
  if (s === "READ") return <span className="cp-dst read"><CheckCheck />Read</span>;
  if (s === "DELIVERED") return <span className="cp-dst dlv"><CheckCheck />Delivered</span>;
  if (s === "SENT") return <span className="cp-dst snt"><Check />Sent</span>;
  return <span className="cp-dst fail"><CircleX />Failed</span>;
};

export function SentLogPanel({ rows }: { rows: ReminderLog[] | null }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return !rows ? null : t ? rows.filter((l) => [l.customer.name, l.invoice?.docNo, l.rule, l.template, l.recipient, l.channel].some((x) => x?.toLowerCase().includes(t))) : rows;
  }, [rows, q]);
  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Sent log</h3><p>Every reminder queued by the schedule or by hand, with its delivery status</p></div>
        <div className="panel-actions"><label className="search-field cp-sf"><Search /><input placeholder="Search log…" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      </div>
      {!shown ? <div style={{ padding: 16 }}><Skeleton style={{ height: 140 }} /></div> : shown.length ? (
        <div className="table-wrap">
          <table className="tbl cp-rm-log">
            <thead><tr><th>Time</th><th>Customer</th><th>Invoice</th><th>Channel</th><th>Recipient</th><th>Rule</th><th className="num">Amount (Rs)</th><th>Overdue</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id}>
                  <td>{dtime(l.sentAt)}<small>{l.triggerMode === "AUTO" ? "Schedule" : l.sentBy?.name ?? "By hand"}</small></td>
                  <td><b>{l.customer.name}</b></td>
                  <td>{l.invoice ? <Link className="link" href={`/sales/invoices/${l.invoice.id}`}>{l.invoice.docNo}</Link> : "—"}</td>
                  <td><span className={`cp-ch ${CHAN[l.channel]?.[2] ?? "dr"}`}>{CHAN[l.channel]?.[0]}</span>{CHAN[l.channel]?.[1] ?? l.channel}</td>
                  <td><small>{l.recipient ?? "—"}</small></td>
                  <td>{l.rule ?? "—"}{l.template ? <small>{l.template}</small> : null}</td>
                  <td className="num">{fmt(l.amount)}</td>
                  <td>{l.daysOverdue} days</td>
                  <td>{status(l.status)}{l.message && l.status === "FAILED" ? <small>{l.message}</small> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon={<Send />} title={q ? "No matching reminders" : "Nothing sent yet"} description={q ? "Try another search." : "Every reminder queued by the schedule or by hand is logged here with its delivery status."} />}
    </div>
  );
}
