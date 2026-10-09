"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { CashDayClose } from "@/shared";
import { useToast } from "@/components/ui/toast";
import { isoDay } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { cashDay, countCashDay, lockCashDay, reopenCashDay } from "../api";

/** Shared pieces of the Cash Book and Cash Ledger screens: formatting, dates and the daily cash count. */
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const grp = (n: number, dec = 0) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
/** "Rs 12,500" (no decimals), signed when asked. */
export const rs = (n: number, signed = false) => `${n < 0 ? "−" : signed && n > 0 ? "+" : ""}Rs ${grp(n)}`;
/** "+12.5k" / "−1.2M" for tight spots. */
export const compact = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "+";
  return a >= 1e6 ? `${s}${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}${(a / 1e3).toFixed(1)}k` : `${s}${grp(a)}`;
};
export const today = () => isoDay(new Date());
export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WDS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WDL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dow = (iso: string) => new Date(`${iso}T00:00:00`).getDay();
/** "07 Oct" */
export const dMon = (iso: string) => `${iso.slice(8)} ${MON[Number(iso.slice(5, 7)) - 1]}`;
export const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
export const errCode = (e: unknown) => (e instanceof ApiError ? e.code : null);

/** Slides a pill / segment thumb under the container's `button.active` (template moveThumb). */
export function useThumb(box: RefObject<HTMLElement | null>, thumbSelector: string, key: unknown) {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const t = el.querySelector<HTMLElement>(thumbSelector), b = el.querySelector<HTMLElement>("button.active");
      if (!t || !b) return;
      t.style.width = `${b.offsetWidth}px`;
      t.style.height = `${b.offsetHeight}px`;
      t.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop - (t.offsetTop || 0)}px)`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, thumbSelector, key]);
}

/** Notes counted one by one; coins (Rs 5, 2, 1) are entered as a rupee total and saved as Rs 1 × amount. */
export const NOTES = [5000, 1000, 500, 100, 50, 20, 10] as const;
export type Counts = Record<number, number> & { coins: number };
export const emptyCounts = (): Counts => ({ ...Object.fromEntries(NOTES.map((n) => [n, 0])), coins: 0 }) as Counts;
export const countedOf = (c: Counts) => NOTES.reduce((s, n) => s + n * (c[n] || 0), 0) + (c.coins || 0);
function countsFrom(d: CashDayClose | null): Counts {
  const c = emptyCounts();
  for (const x of d?.denominations ?? []) {
    if ((NOTES as readonly number[]).includes(x.noteValue)) c[x.noteValue] = x.qty;
    else c.coins += x.noteValue * x.qty;
  }
  return c;
}

/**
 * The cash count of one cash account and day: load, edit the denominations, save, lock (posting any variance) and
 * reopen. Locking saves the count first. A count beyond the account's tolerance needs cash approval (explained, not hidden).
 */
export function useCashDay(account: string, date: string, onChanged?: () => void) {
  const toast = useToast();
  const [day, setDay] = useState<CashDayClose | null>(null);
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((d: CashDayClose) => {
    setDay(d);
    // a fresh day starts from the books (exact notes), the way the template presets the drawer
    setCounts(d.id ? countsFrom(d) : greedy(d.bookBalance));
    setDirty(false);
    setError(null);
  }, []);
  const load = useCallback(async () => {
    if (!account || !date) return;
    try { apply(await cashDay(account, date)); } catch (e) { setError(errMsg(e, "Could not load the cash count")); }
  }, [account, date, apply]);
  useEffect(() => {
    if (!account || !date) return;
    let live = true;
    cashDay(account, date).then((d) => live && apply(d)).catch((e: unknown) => live && setError(errMsg(e, "Could not load the cash count")));
    return () => { live = false; };
  }, [account, date, apply]);

  const counted = countedOf(counts);
  const book = day?.bookBalance ?? 0;
  const variance = r2(counted - book);
  const locked = day?.status === "LOCKED";

  const setCount = (key: number | "coins", v: number) => {
    if (locked) return;
    setCounts((c) => ({ ...c, [key]: Math.max(0, Math.round(Number.isFinite(v) ? v : 0)) }));
    setDirty(true);
  };

  const denominations = useMemo(() => [
    ...NOTES.map((n) => ({ noteValue: n, qty: counts[n] || 0 })),
    { noteValue: 1, qty: counts.coins || 0 },
  ], [counts]);

  const save = async (quiet = false) => {
    setBusy(true);
    try {
      const d = await countCashDay({ cashAccountId: account, closeDate: date, denominations, remarks: day?.remarks ?? null, rowVersion: day?.rowVersion ?? null });
      setDay(d);
      setDirty(false);
      if (!quiet) toast(`Count saved · ${rs(countedOf(counts))}`, { tone: "good" });
      return d;
    } catch (e) {
      toast(errMsg(e, "Could not save the count"), { tone: "danger" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    const d = dirty || !day?.id ? await save(true) : day;
    if (!d?.id || d.rowVersion === null) return false;
    setBusy(true);
    try {
      const after = await lockCashDay(d.id, d.rowVersion);
      setDay(after);
      toast(`${WDL[dow(date)]} ${dMon(date)} closed · ${after.varianceAmount === 0 ? "balanced" : `${after.varianceAmount < 0 ? "short" : "over"} ${rs(Math.abs(after.varianceAmount))} posted to cash over / short`}`, { tone: "good" });
      onChanged?.();
      return true;
    } catch (e) {
      const msg = errCode(e) === "CASH_VARIANCE_APPROVAL"
        ? `${errMsg(e, "")} The count is saved; ask someone with cash approval to close the day.`
        : errMsg(e, "Could not close the day");
      toast(msg, { tone: errCode(e) === "CASH_VARIANCE_APPROVAL" ? "warn" : "danger", ms: 8000 });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!day?.id || day.rowVersion === null) return;
    setBusy(true);
    try {
      const after = await reopenCashDay(day.id, day.rowVersion);
      setDay(after);
      setCounts(countsFrom(after));
      toast(`${dMon(date)} reopened${day.varianceVoucher ? ` · ${day.varianceVoucher.docNo} reversed` : ""}`, { tone: "good" });
      onChanged?.();
    } catch (e) {
      toast(errMsg(e, "Could not reopen the day"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return { day, counts, setCount, counted, book, variance, locked, dirty, busy, error, save, lock, reopen, reload: load };
}

/** Fewest notes for an amount (whole rupees; the rest as coins). */
function greedy(amount: number): Counts {
  const c = emptyCounts();
  let left = Math.max(0, Math.round(amount));
  for (const n of NOTES) { c[n] = Math.floor(left / n); left -= c[n] * n; }
  c.coins = left;
  return c;
}
