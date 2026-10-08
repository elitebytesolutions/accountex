"use client";

import type { ReactNode } from "react";
import type { EmpRef } from "@/shared";
import { initialsOf } from "@/features/auth/initials";
import { companyParts, companyTimeZone } from "@/lib/company-time";

/** Small shared bits of the Phase 30 attendance / roster / overtime screens. */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** HH:MM of an instant in the company's time zone (not the browser's). */
export const hhmm = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const p = companyParts(iso);
  return `${p.hour}:${p.minute}`;
};
/** "30 Sep 2026" */
export const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "—");
/** "Wed, 30 Sep 2026" */
export const dowDmy = (d: string) => `${DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]}, ${dmy(d)}`;
/** "01 Oct, 08:12" in the company's time zone. */
export const stamp = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const p = companyParts(iso);
  return `${p.day} ${MON[p.monthIndex]}, ${p.hour}:${p.minute}`;
};
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const shiftMonth = (m: string, by: number) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1)); return d.toISOString().slice(0, 7); };
/** Today (YYYY-MM-DD) in the company's time zone. */
export const localToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: companyTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const dowShort = (d: string) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]!;
export const minutes = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
export const fmtNum = (n: number, dec = 2) => n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const STATUS_TONE: Record<string, string> = {
  PRESENT: "good", LATE: "warn", WFH: "violet", ON_DUTY: "info", HALF_DAY: "violet", ABSENT: "danger", LEAVE: "info", HOLIDAY: "info", WEEKLY_OFF: "neutral",
  PENDING: "warn", APPROVED: "good", REJECTED: "danger", WITHDRAWN: "neutral", CANCELLED: "neutral", PUSHED: "info", REQUESTED: "warn", ACCEPTED: "info", DECLINED: "danger",
  CONFIRMED: "good", OPEN: "good", FILLED: "info",
};
export const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present", LATE: "Late", WFH: "Work from home", ON_DUTY: "On duty", HALF_DAY: "Half day", ABSENT: "Absent", LEAVE: "Leave", HOLIDAY: "Holiday", WEEKLY_OFF: "Weekly off",
  PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", WITHDRAWN: "Withdrawn", CANCELLED: "Cancelled", PUSHED: "Pushed to payroll", REQUESTED: "Requested",
  ACCEPTED: "Accepted", DECLINED: "Declined", CONFIRMED: "Confirmed", OPEN: "Open", FILLED: "Filled",
};
export const REQUEST_TYPE: Record<string, [string, string]> = {
  MISSED_PUNCH: ["Missed punch", "warn"], LATE_ARRIVAL: ["Late arrival", "neutral"], ON_DUTY: ["On duty", "info"], WFH: ["Work from home", "violet"], EARLY_LEAVING: ["Early leaving", "neutral"],
};
export const REJECT_REASONS: [string, string][] = [
  ["INSUFFICIENT_EVIDENCE", "Insufficient evidence"], ["EXCEEDED_MONTHLY_LIMIT", "Exceeded monthly limit"], ["DEVICE_LOGS_CONTRADICT", "Device logs contradict request"],
  ["NO_GPS_EVIDENCE", "No GPS evidence"], ["DUPLICATE", "Duplicate"], ["OTHER", "Other"],
];

export function StatusBadge({ status, dot = true, children }: { status: string; dot?: boolean; children?: ReactNode }) {
  return <span className={`badge ${STATUS_TONE[status] ?? "neutral"}${dot ? " dot" : ""}`}>{children ?? STATUS_LABEL[status] ?? status}</span>;
}

export function Person({ e, sub }: { e: Pick<EmpRef, "name" | "code"> & Partial<EmpRef>; sub?: ReactNode }) {
  return (
    <div className="cell-user"><span className="avatar sm">{initialsOf(e.name)}</span><div><b>{e.name}</b><small>{sub ?? e.code}</small></div></div>
  );
}

/** "Requested punch" text of a regularisation request. */
export const requestedPunch = (r: { requestedIn: string | null; requestedOut: string | null }) =>
  [r.requestedIn && `In ${r.requestedIn}`, r.requestedOut && `Out ${r.requestedOut}`].filter(Boolean).join(" · ") || "—";
