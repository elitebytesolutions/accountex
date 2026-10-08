"use client";

import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/errors";

/** What the signed-in user may do on payroll runs (from their permissions). */
export type PayrollRunCan = { create: boolean; edit: boolean; approve: boolean; post: boolean; export: boolean };

/** Small helpers shared by the payroll run wizard steps. */
export const payrollMoney = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const payrollRs = (n: number | null | undefined, dec = 0) => (n === null || n === undefined ? "—" : `Rs ${payrollMoney(n, dec)}`);
/** Amount cell: "—" (class zero) for nothing. */
export function PayrollNum({ value, dec = 0, className }: { value: number | null | undefined; dec?: number; className?: string }) {
  return value ? <td className={`num${className ? ` ${className}` : ""}`}>{payrollMoney(value, dec)}</td> : <td className="num zero">—</td>;
}
export const payrollError = (e: unknown, fallback = "Something went wrong") => (e instanceof ApiError ? e.message : fallback);
export const payrollFieldErrors = (e: unknown): Record<string, string> =>
  e instanceof ApiError && e.details ? Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? "Invalid"])) : {};
/** Change vs the previous run as "▲ 0.76% vs Sep". */
export function PayrollDelta({ now, before, label, invert }: { now: number; before: number | null | undefined; label: string; invert?: boolean }) {
  if (!before) return <small>{label === "" ? "" : "No previous run to compare"}</small>;
  const d = ((now - before) / before) * 100;
  const up = d >= 0;
  return <small className={(up !== !!invert) ? "up" : "down"}>{up ? "▲" : "▼"} {Math.abs(d).toFixed(2)}% vs {label}</small>;
}
export function PayrollKpi({ tone, label, icon, value, sub }: { tone?: string; label: string; icon: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`kpi${tone ? ` ${tone}` : ""}`}>
      <div className="kpi-top"><span>{label}</span><span className="icon-well">{icon}</span></div>
      <strong>{value}</strong>
      {sub}
    </div>
  );
}
