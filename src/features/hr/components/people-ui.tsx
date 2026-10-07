"use client";

import { cn } from "@/components/ui/cn";

/** Initials for the template's `.avatar` (two letters). */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const TONES = ["violet", "info", "good", "warn", "neutral"] as const;
/** A stable badge tone per department (the template colours departments, not by meaning). */
export const deptTone = (code: string) => TONES[[...code].reduce((s, c) => s + c.charCodeAt(0), 0) % TONES.length];

/** Years and months between two ISO dates ("5y 3m"). */
export function tenure(from: string, to = new Date().toISOString().slice(0, 10)) {
  const [y1, m1, d1] = from.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split("-").map(Number) as [number, number, number];
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) months = 0;
  return `${Math.floor(months / 12)}y ${months % 12}m`;
}

/** Age in whole years on today. */
export function age(dob: string) {
  const t = new Date();
  const [y, m, d] = dob.split("-").map(Number) as [number, number, number];
  return t.getFullYear() - y - (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d) ? 1 : 0);
}

/** Template `.table-foot` with `.pager` (numbered, with … gaps). */
export function TableFoot({ label, page, pages, go }: { label: string; page: number; pages: number; go: (p: number) => void }) {
  const nums = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1)
    : [1, ...(page > 3 ? [0] : []), ...[page - 1, page, page + 1].filter((p) => p > 1 && p < pages), ...(page < pages - 2 ? [0] : []), pages];
  return (
    <div className="table-foot">
      <span>{label}</span>
      {pages > 1 && (
        <div className="pager">
          <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page">‹</button>
          {nums.map((p, i) => p === 0 ? <button key={`gap${i}`} type="button" disabled>…</button> : <button key={p} type="button" className={cn(p === page && "active")} onClick={() => go(p)}>{p}</button>)}
          <button type="button" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Next page">›</button>
        </div>
      )}
    </div>
  );
}
