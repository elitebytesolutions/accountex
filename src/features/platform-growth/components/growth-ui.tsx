"use client";

import type { LookupsResponse } from "@/shared";
import { labelOf, toneOf } from "@/features/settings/use-lookups";

/** Shared bits of the Phase 42 screens. */
export const fmt = (n: number) => n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
export const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** "12 min ago" / "3 h ago" / "2 d ago" (template card times). */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** "1h 12m" from minutes. */
export function duration(min: number): string {
  const a = Math.abs(min);
  const h = Math.floor(a / 60), m = a % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** A lookup badge (label + tone). */
export function LookupBadge({ lookups, type, code, dot }: { lookups: LookupsResponse; type: string; code: string | null; dot?: boolean }) {
  if (!code) return null;
  return <span className={`badge ${toneOf(lookups, type, code)}${dot ? " dot" : ""}`}>{labelOf(lookups, type, code)}</span>;
}

export const CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Hyderabad", "Sargodha", "Gujranwala", "Gujrat", "Gilgit", "Gwadar"];
