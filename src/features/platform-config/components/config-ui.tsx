"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/errors";

/** Shared bits of the Phase 38 platform configuration screens. */

/** Template `logo()` (9B-admin-plus.js): coloured initials tile, colour picked from the name. */
const LOGO_T = ["g", "b", "v", "o", "i", "w"];
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export const initials = (name: string) => name.replace(/\(.*?\)|&/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export function Logo({ name, size }: { name: string; size?: "xs" | "lg" }) {
  return <span className={`ap-logo ${size ?? ""} t-${LOGO_T[hash(name) % LOGO_T.length]}`}>{initials(name)}</span>;
}

export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export function fmtBytes(n: number | null) {
  if (n === null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
export function fmtDuration(s: number | null) {
  if (s === null) return "—";
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export type LoadError = { message: string; reference?: string };
export const loadError = (e: unknown, fallback: string): LoadError => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback });

/** Loads data once and on `reload()`; `data` stays null until the first answer. */
export function useLoad<T>(load: () => Promise<T>, fallback: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (!cancelled) setError(loadError(e, fallback)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, setData, error, reload };
}

/** Copies text; resolves false when the clipboard is unavailable. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
