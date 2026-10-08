"use client";

import { FileDiff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import { ApiError } from "@/lib/api/errors";

/** Shared bits of the Phase 43 screens. */

/** Template diffLines(): line diff of two JSON documents (LCS). */
export function diffLines(a: string[], b: string[]): [string, string][] {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: [string, string][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { out.push([" ", a[i]!]); i++; j++; } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push(["-", a[i++]!]); else out.push(["+", b[j++]!]); }
  while (i < n) out.push(["-", a[i++]!]);
  while (j < m) out.push(["+", b[j++]!]);
  return out;
}

/** Sorted-key JSON lines (jsonb reorders keys, so both sides are normalised). */
const lines = (v: unknown) => JSON.stringify(sortKeys(v ?? {}), null, 2).split("\n");
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}

export function diffStats(before: unknown, after: unknown) {
  const d = diffLines(lines(before), lines(after));
  return { add: d.filter((x) => x[0] === "+").length, del: d.filter((x) => x[0] === "-").length };
}

/** The "targeting.json" before / after diff of a change request (template diffHtml()). */
export function Diff({ before, after }: { before: unknown; after: unknown }) {
  const d = diffLines(lines(before), lines(after));
  let ln = 0, rn = 0;
  return (
    <div className="ff-diff">
      <div className="ff-diff-h"><span><FileDiff />targeting.json</span><span><b className="add">+{d.filter((x) => x[0] === "+").length}</b><b className="del">−{d.filter((x) => x[0] === "-").length}</b></span></div>
      <div className="ff-diff-b">
        {d.map(([t, s], k) => {
          if (t !== "+") ln++;
          if (t !== "-") rn++;
          return <div key={k} className={cn("ff-dl", t === "+" && "add", t === "-" && "del")}><span className="n">{t === "+" ? "" : ln}</span><span className="n">{t === "-" ? "" : rn}</span><span className="m">{t === " " ? "" : t === "-" ? "−" : "+"}</span><code>{s}</code></div>;
        })}
      </div>
    </div>
  );
}

/** Loads with retry: { data, error, reload }. */
export function useLoad<T>(fn: () => Promise<T>, fallback: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fn()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, reload };
}

export const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "—");
export const fmtDay = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: iso.length === 10 ? "UTC" : "Asia/Karachi" }) : "—");
export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
