"use client";

import { CircleCheck, Star, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import type { TicketItem } from "@/shared/self-service/helpdesk-ticket";
import { Badge, type Tone } from "@/components/ui/badge";

export const STATUS_LABEL: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" };
const STATUS_TONE: Record<string, Tone> = { OPEN: "info", IN_PROGRESS: "warn", RESOLVED: "good", CLOSED: "neutral" };
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>;
export const isLive = (t: Pick<TicketItem, "status">) => t.status === "OPEN" || t.status === "IN_PROGRESS";

const H = 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
/** "1d 4h 05m left" / "3h 12m 09s left" / "Overdue 2h 10m" (template 11-helpdesk left()). */
function left(dueAt: string, now: number) {
  const ms = Date.parse(dueAt) - now, over = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const txt = d ? `${d}d ${h}h ${pad(m)}m` : `${h}h ${pad(m)}m ${pad(sec)}s`;
  return over ? `Overdue ${txt}` : `${txt} left`;
}
/** Elapsed share of the SLA window, 2–100 %. */
export const slaUsed = (t: Pick<TicketItem, "dueAt" | "slaHours">, now: number) => Math.min(100, Math.max(2, 100 - ((Date.parse(t.dueAt) - now) / (t.slaHours * H)) * 100));
const duration = (ms: number) => { const m = Math.round(ms / 60_000); return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`; };

/** One-second clock for the live SLA countdowns. */
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Template .es-hd-sla chip: live countdown (ok / warm < 24h / hot < 8h) or the met / missed result once resolved. */
export function SlaChip({ t, now }: { t: TicketItem; now: number }) {
  if (!isLive(t)) {
    const took = t.resolvedAt ? duration(Date.parse(t.resolvedAt) - Date.parse(t.openedAt)) : null;
    return <span className={`es-hd-sla ${t.slaMet === false ? "hot" : "met"}`}><CircleCheck />{t.slaMet === false ? "Missed SLA" : "Met SLA"}{took ? ` · ${took}` : ""}</span>;
  }
  const hrs = (Date.parse(t.dueAt) - now) / H;
  return <span className={`es-hd-sla ${hrs < 8 ? "hot" : hrs < 24 ? "warm" : ""}`}><Timer /><b>{left(t.dueAt, now)}</b></span>;
}

export const MiniStars = ({ n }: { n: number }) => (
  <span className="es-hd-stars-mini" aria-label={`${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={i <= n ? "on" : undefined} />)}</span>
);

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Today, 10:20" / "29 Sep, 16:10" */
export function when(iso: string, now = Date.now()) {
  const d = new Date(iso), today = new Date(now);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === today.toDateString() ? `Today, ${hm}` : `${pad(d.getDate())} ${MON[d.getMonth()]}, ${hm}`;
}
