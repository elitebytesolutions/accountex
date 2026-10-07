"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type Can = { view: boolean; approve: boolean; remove: boolean; tiersView: boolean; tiersEdit: boolean };
export const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const today = () => new Date().toISOString().slice(0, 10);
/** Template margin bands: ≥ 20% good, 10–20% warn, < 10% danger. */
export const mTone = (m: number) => (m >= 20 ? "good" : m >= 10 ? "warn" : "danger");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "01 Oct 2026" (the template's dstr; fixed month names, since en-GB now prints "Sept"). */
export const dstr = (iso: string | null) => (iso ? `${iso.slice(8, 10)} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—");
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Template `.cp-mg`: margin with a bar scaled to 45%. */
export function MarginBar({ m, sm }: { m: number | null; sm?: boolean }) {
  if (m === null) return <span className="muted">—</span>;
  return (
    <span className={cn("cp-mg", mTone(m), sm && "sm")}>
      {!sm && <span className="t"><i style={{ width: `${(clamp(m, 0, 45) / 45) * 100}%` }} /></span>}
      <b>{m.toFixed(1)}%</b>
    </span>
  );
}

export function Pager({ page, pages, go }: { page: number; pages: number; go: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="row cp-mt" style={{ justifyContent: "flex-end", gap: 8, padding: "0 16px 14px" }}>
      <button type="button" className="btn ghost sm icon" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page"><ChevronLeft /></button>
      <span className="muted small">Page {page} of {pages}</span>
      <button type="button" className="btn ghost sm icon" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Next page"><ChevronRight /></button>
    </div>
  );
}

/** CSV download (template `download(csv(...))`). */
export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
