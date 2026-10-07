"use client";

import { useEffect, useState } from "react";
import type { Account, GlRef } from "@/shared";
import { listAccounts } from "@/features/finance/api";
import { ApiError } from "@/lib/api/errors";

/** Postable, active GL accounts for selects (empty when the user can't read the chart; the saved value still shows). */
export function usePostableAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    let cancelled = false;
    listAccounts()
      .then((a) => !cancelled && setAccounts(a.filter((x) => x.kind === "POSTABLE" && x.status === "ACTIVE")))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return accounts;
}

/** <option>s for a GL account select, keeping the saved account selectable even if it is not in the list. */
export function AccountOptions({ accounts, current, classes, empty = "Choose…" }: { accounts: Account[]; current?: GlRef | null; classes?: number[]; empty?: string | null }) {
  const list = accounts.filter((a) => !classes || classes.includes(a.accountClass));
  const extra = current && !list.some((a) => a.id === current.id) ? [current] : [];
  return (
    <>
      {empty !== null && <option value="">{empty}</option>}
      {[...extra, ...list].map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
    </>
  );
}

export const glLabel = (g: GlRef | null | undefined) => (g ? `${g.code} ${g.name}` : "—");

/** Field errors from an API error as { field: message }. */
export const apiFieldErrors = (e: unknown): Record<string, string> =>
  e instanceof ApiError && e.details ? Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])) : {};
export const apiMessage = (e: unknown, fallback: string) =>
  e instanceof ApiError ? (e.code === "DB_UNIQUE_VIOLATION" ? "That code or number is already used" : e.message) : fallback;

export const fmtAmount = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
