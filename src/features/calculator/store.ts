/**
 * Shared calculator state (template 9K-calc.js `S`): today's tape, memory and settings,
 * persisted under the template's localStorage keys and shared by every mounted calculator.
 */
import { useSyncExternalStore } from "react";
import { clean, type Grouping, type TapeKind } from "./engine";

export type TapeLine = { id: number; e: string; r: number; k: TapeKind; t: string };
export type CalcSettings = { round: number; group: Grouping; rate: number };
export type CalcShared = { tape: TapeLine[]; mem: number; set: CalcSettings; gt: number };

const LS = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem(k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ }
  },
};
export const lsGet = LS.get;
export const lsSet = LS.set;

const dayKey = () => {
  const d = new Date();
  return "cx-tape-" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

const SERVER: CalcShared = { tape: [], mem: 0, set: { round: 0, group: "intl", rate: 18 }, gt: 0 };
let S: CalcShared | null = null;
let uid = Date.now() % 100000;
const subs = new Set<() => void>();

const grandTotal = (tape: TapeLine[]) => clean(tape.reduce((a, l) => a + (l.k === "total" ? 0 : +l.r || 0), 0));

function load(): CalcShared {
  if (S) return S;
  const t = LS.get<unknown>(dayKey(), []);
  const tape = Array.isArray(t) ? (t as TapeLine[]) : [];
  const saved = LS.get<Partial<CalcSettings>>("cx-set", {});
  const set: CalcSettings = { round: +(saved.round ?? 0) || 0, group: saved.group === "lakh" ? "lakh" : "intl", rate: isFinite(+(saved.rate ?? 18)) ? +(saved.rate ?? 18) : 18 };
  S = { tape, mem: +LS.get("cx-mem", 0) || 0, set, gt: grandTotal(tape) };
  return S;
}

function commit(next: Omit<CalcShared, "gt">, what: { tape?: boolean; mem?: boolean; set?: boolean }) {
  S = { ...next, gt: grandTotal(next.tape) };
  if (what.tape) LS.set(dayKey(), S.tape);
  if (what.mem) LS.set("cx-mem", S.mem);
  // Merge so extra keys already stored under cx-set (e.g. the template's `lang`) survive.
  if (what.set) LS.set("cx-set",{ ...LS.get<object>("cx-set", {}), ...S.set });
  subs.forEach((f) => f());
}

export const calcStore = {
  get: load,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  addTape(e: string, r: number, k: TapeKind) {
    const s = load(), now = new Date();
    const tape = [...s.tape, { id: ++uid, e, r: clean(r), k, t: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") }];
    if (tape.length > 200) tape.shift();
    commit({ ...s, tape }, { tape: true });
  },
  setTape(tape: TapeLine[]) { commit({ ...load(), tape }, { tape: true }); },
  setMem(mem: number) { commit({ ...load(), mem }, { mem: true }); },
  setSettings(p: Partial<CalcSettings>) { const s = load(); commit({ ...s, set: { ...s.set, ...p } }, { set: true }); },
};

export function useCalcShared(): CalcShared {
  return useSyncExternalStore(calcStore.subscribe, load, () => SERVER);
}
