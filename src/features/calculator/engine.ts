/**
 * Business calculator engine — pure port of template/src/9K-calc.js
 * (number formatting, expression engine, amount in words, key logic).
 * No DOM, no storage: the store and the component own side effects.
 */

export type Grouping = "intl" | "lakh";

/* ---------------- number formatting ---------------- */
export const clean = (n: number) => Math.round(n * 1e8) / 1e8;

export function group(i: string, grp: Grouping): string {
  if (grp === "intl") return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (i.length <= 3) return i;
  return i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + i.slice(-3);
}

export function fmt(n: number, grp: Grouping, dec?: number): string {
  if (!isFinite(n)) return "Error";
  const neg = n < 0;
  n = Math.abs(n);
  let s = dec == null ? String(clean(n)) : n.toFixed(dec);
  if (/e/i.test(s)) s = n.toFixed(dec == null ? 8 : dec).replace(/\.?0+$/, "");
  const [i, d] = s.split(".");
  return (neg ? "−" : "") + group(i, grp) + (d ? "." + d : "");
}

/** Splits a formatted number into integer part and ".decimals" (rendered dimmer). */
export function splitDec(s: string): [string, string] {
  const k = s.indexOf(".");
  return k < 0 ? [s, ""] : [s.slice(0, k), s.slice(k)];
}

export function raw(n: number): string {
  let s = String(clean(n));
  if (/e/i.test(s)) s = clean(n).toFixed(8).replace(/\.?0+$/, "");
  return s;
}

export function parseNum(s: unknown): number {
  const v = parseFloat(String(s == null ? "" : s).replace(/[^\d.\-]/g, ""));
  return isFinite(v) ? v : 0;
}

/* ---------------- expression engine ---------------- */
// internal expression: digits, '.', unary '-', binary ops + − × ÷, postfix %
export function normalize(s: string): string {
  s = String(s).replace(/[,\s=]/g, "").replace(/[*xX]/g, "×").replace(/\//g, "÷").replace(/[–—−]/g, "-");
  return s.replace(/([\d.%])-/g, "$1−");
}

type Tok = { op: string; n?: undefined; pct?: undefined } | { n: number; pct: boolean; op?: undefined };

function tokenize(ex: string): Tok[] | null {
  const re = /(-?(?:\d+\.?\d*|\.\d+))(%?)|([+−×÷])/g;
  const out: Tok[] = [];
  let m: RegExpExecArray | null;
  let pos = 0;
  while ((m = re.exec(ex))) {
    if (m.index !== pos) return null;
    pos = re.lastIndex;
    if (m[3]) out.push({ op: m[3] });
    else out.push({ n: parseFloat(m[1]), pct: !!m[2] });
  }
  return pos === ex.length ? out : null;
}

export function evaluate(ex: string, lenient?: boolean): number | null {
  const t = tokenize(ex);
  if (!t || !t.length) return null;
  if (lenient) while (t.length && t[t.length - 1].op) t.pop();
  if (!t.length || t.length % 2 === 0) return null;
  for (let i = 0; i < t.length; i++) if ((i % 2 === 0) !== (t[i].n !== undefined)) return null;
  const num = (x: Tok) => (x.pct ? (x.n as number) / 100 : (x.n as number));
  let sum = 0, first = true, sign = "+", i = 0;
  while (i < t.length) {
    const f = [t[i]], ops: string[] = [];
    i++;
    while (i < t.length && (t[i].op === "×" || t[i].op === "÷")) { ops.push(t[i].op as string); f.push(t[i + 1]); i += 2; }
    let v: number;
    if (f.length === 1 && f[0].pct && !first) v = (sum * (f[0].n as number)) / 100; // a + b%  → a + a·b/100
    else {
      v = num(f[0]);
      for (let j = 0; j < ops.length; j++) {
        const x = num(f[j + 1]);
        if (ops[j] === "×") v *= x;
        else { if (x === 0) return NaN; v /= x; }
      }
    }
    sum = first ? v : sign === "+" ? sum + v : sum - v;
    first = false;
    if (i < t.length) { sign = t[i].op as string; i++; }
  }
  return sum;
}

export function pretty(ex: string, grp: Grouping): string {
  return String(ex)
    .replace(/(\d+)(\.\d*)?/g, (_m, a: string, b?: string) => group(a, grp) + (b || ""))
    .replace(/([+−×÷])/g, " $1 ")
    .replace(/-/g, "−")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- amount in words (English only) ---------------- */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n: number) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""));
const three = (n: number) => {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? ONES[h] + " Hundred" : "", r ? two(r) : ""].filter(Boolean).join(" ");
};
function enLakh(n: number): string {
  if (!n) return "";
  const cr = Math.floor(n / 1e7), rest = n % 1e7, lk = Math.floor(rest / 1e5), th = Math.floor((rest % 1e5) / 1000), h = n % 1000;
  return [cr ? (cr >= 100 ? enLakh(cr) : two(cr)) + " Crore" : "", lk ? two(lk) + " Lakh" : "", th ? two(th) + " Thousand" : "", h ? three(h) : ""].filter(Boolean).join(" ");
}
function enIntl(n: number): string {
  if (!n) return "";
  const sc: [number, string][] = [[1e12, "Trillion"], [1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]];
  const out: string[] = [];
  for (const [v, w] of sc) { const q = Math.floor(n / v); if (q) { out.push(three(q % 1000) + " " + w); n %= v; } }
  if (n) out.push(three(n));
  return out.join(" ");
}
export function words(n: number, system: Grouping): string {
  n = +n || 0;
  const neg = n < 0;
  n = Math.abs(n);
  let rs = Math.floor(n + 1e-9), ps = Math.round((n - rs) * 100);
  if (ps === 100) { rs++; ps = 0; }
  const f = system === "intl" ? enIntl : enLakh;
  return "Rupees " + (neg ? "Minus " : "") + (rs ? f(rs) : "Zero") + (ps ? " and " + two(ps) + " Paisa" : "") + " Only";
}

/* ---------------- key logic (template mount() → press) ---------------- */
export type CalcState = { ex: string; done: boolean; res: number; label: string; fresh: boolean; err: string; note: string };
export const INITIAL: CalcState = { ex: "", done: false, res: 0, label: "", fresh: false, err: "", note: "" };

export type TapeKind = "calc" | "gst" | "units" | "total";
export type Env = { mem: number; gt: number; round: number; rate: number; grp: Grouping };
export type PressResult = {
  st: CalcState;
  tape?: { e: string; r: number; k: TapeKind }[];
  mem?: number;
  shake?: boolean;
  anim?: boolean;
  flash?: "m" | "gt";
  changed: boolean;
};

const isOp = (ch: string) => "+−×÷".includes(ch);
export const curNum = (ex: string) => { const m = ex.match(/-?[\d.]*%?$/); return m ? m[0] : ""; };
export function currentValue(st: CalcState): number {
  if (st.done) return st.res;
  const v = evaluate(st.ex, true);
  return v == null || !isFinite(v) ? 0 : v;
}

/** Applies one key to a copy of the state, returning the new state plus the side effects to perform. */
export function press(prev: CalcState, k: string, env: Env): PressResult {
  const st: CalcState = { ...prev, note: "" };
  const out: PressResult = { st, changed: true };
  const tape: NonNullable<PressResult["tape"]> = [];
  const fail = (): PressResult => ({ st: prev, shake: true, changed: false });

  const startFresh = () => {
    if (st.done) { st.ex = ""; st.done = false; st.label = ""; }
    if (st.fresh) { st.ex = st.ex.slice(0, st.ex.length - curNum(st.ex).length); st.fresh = false; }
  };
  const continueFromResult = () => {
    if (st.done) { st.ex = raw(st.res); st.done = false; st.label = ""; }
    st.fresh = false;
  };
  const insert = (v: number) => { Object.assign(st, insertValue(st, v)); };
  const equals = (): boolean => {
    if (st.done) { out.shake = true; return false; }
    const ex = st.ex.replace(/[+−×÷]$/, "");
    if (!ex || ex === "-") return false;
    const v = evaluate(ex, true);
    if (v == null) { out.shake = true; return false; }
    if (!isFinite(v)) { st.err = "Can’t divide by 0"; st.ex = ex; out.shake = true; return false; }
    const step = +env.round || 0;
    const r = step ? Math.round(v / step) * step : clean(v);
    st.ex = ex; st.res = clean(r); st.done = true; st.fresh = false; st.label = "";
    tape.push({ e: ex, r: st.res, k: "calc" });
    out.anim = true;
    return true;
  };
  const commitPending = () => { if (!st.done && /[+−×÷]|\d%/.test(st.ex.replace(/^-/, ""))) equals(); };

  if (st.err && k !== "c" && k !== "bs") { st.err = ""; st.ex = ""; }
  else if (st.err) { st.err = ""; st.ex = ""; return out; }

  if (/^\d$/.test(k)) {
    startFresh();
    const c = curNum(st.ex);
    if (c.endsWith("%")) return fail();
    if (c.replace(/\D/g, "").length >= 15) return fail();
    if (c === "0" || c === "-0") st.ex = st.ex.slice(0, -1) + k; else st.ex += k;
  } else if (k === ".") {
    startFresh();
    const c = curNum(st.ex);
    if (c.includes(".") || c.endsWith("%")) return { st: prev, changed: false };
    st.ex += c === "" || c === "-" ? "0." : ".";
  } else if (isOp(k)) {
    continueFromResult();
    if (st.ex === "" || st.ex === "-") { if (k === "−") { st.ex = "-"; return out; } st.ex = "0"; }
    const last = st.ex.slice(-1);
    if (isOp(last)) { if (k === "−" && (last === "×" || last === "÷")) st.ex += "-"; else st.ex = st.ex.slice(0, -1) + k; }
    else if (last === "-") st.ex = st.ex.slice(0, -1).replace(/[+−×÷]$/, "") + k;
    else { if (last === ".") st.ex = st.ex.slice(0, -1); st.ex += k; }
  } else if (k === "%") {
    continueFromResult();
    if (/[\d.]$/.test(st.ex)) st.ex = st.ex.replace(/\.$/, "") + "%"; else return fail();
  } else if (k === "neg") {
    continueFromResult();
    const c = curNum(st.ex);
    const base = st.ex.slice(0, st.ex.length - c.length);
    st.ex = base + (c.startsWith("-") ? c.slice(1) : "-" + c);
  } else if (k === "bs") {
    if (st.done) { st.ex = raw(st.res).slice(0, -1); st.done = false; st.label = ""; } else st.ex = st.ex.slice(0, -1);
    st.fresh = false;
  } else if (k === "c") {
    if (st.done || !st.ex) { st.ex = ""; st.done = false; st.label = ""; st.res = 0; }
    else { const c = curNum(st.ex); if (c && c.length < st.ex.length) st.ex = st.ex.slice(0, st.ex.length - c.length); else st.ex = ""; }
    st.fresh = false;
  } else if (k === "=") {
    equals();
    if (!out.anim && !st.err) out.changed = false;
  } else if (k === "mc") { out.mem = 0; out.flash = "m"; out.st = prev; }
  else if (k === "mr") { insert(env.mem); out.flash = "m"; }
  else if (k === "m+" || k === "m-") {
    commitPending();
    const v = currentValue(st);
    const mem = clean(env.mem + (k === "m+" ? v : -v));
    out.mem = mem; out.flash = "m";
    st.note = (k === "m+" ? "M+ " : "M− ") + fmt(v, env.grp) + "  ·  M = " + fmt(mem, env.grp);
    st.fresh = true;
    if (!st.done && st.ex) st.ex = raw(v);
  } else if (k === "gt") { insert(env.gt); out.flash = "gt"; }
  else if (k === "gst+" || k === "gst-") {
    const add = k === "gst+";
    commitPending();
    const v = currentValue(st), r = +env.rate || 0;
    if (!v) { out.shake = true; if (!tape.length) return { ...out, st: prev, changed: false }; }
    else {
      const nv = clean(add ? v * (1 + r / 100) : v / (1 + r / 100));
      const label = add ? `${fmt(v, env.grp)} + GST ${r}%` : `${fmt(v, env.grp)} − GST ${r}% (incl.)`;
      st.res = nv; st.done = true; st.label = label; st.ex = raw(nv); st.fresh = false; st.err = "";
      tape.push({ e: label, r: nv, k: "gst" });
      out.anim = true;
    }
  } else return { st: prev, changed: false };

  if (tape.length) out.tape = tape;
  return out;
}

/** Puts a value in place of the number being typed (MR, GT, tape line). */
export function insertValue(prev: CalcState, v: number): CalcState {
  const st: CalcState = { ...prev, err: "", note: "" };
  if (st.done || st.ex === "") { st.ex = raw(v); st.done = false; st.label = ""; }
  else { const c = curNum(st.ex); st.ex = st.ex.slice(0, st.ex.length - c.length) + raw(v); }
  st.fresh = true;
  return st;
}

/** A finished result shown with a custom label (GST pane, units, tape total). */
export const resultState = (v: number, label: string): CalcState => ({ ex: raw(clean(v)), done: true, res: clean(v), label, fresh: false, err: "", note: "" });

/** What the result line shows for a state (template render()). */
export function display(st: CalcState, grp: Grouping): { expr: string; text: string; value: number; prev: string } {
  if (st.err) return { expr: pretty(st.ex, grp) || " ", text: st.err, value: 0, prev: "" };
  if (st.done) {
    const s = fmt(st.res, grp);
    return { expr: st.note || (st.label || pretty(st.ex, grp)) + " =", text: s, value: st.res, prev: "" };
  }
  const expr = st.note || pretty(st.ex, grp) || " ";
  const c = curNum(st.ex);
  const hasOp = /[+−×÷]|\d%/.test(st.ex.replace(/^-/, ""));
  const pv = evaluate(st.ex, true);
  const prev = hasOp && pv != null && isFinite(pv) && /\d%?$/.test(st.ex) ? "≈ " + fmt(pv, grp) : "";
  if (c && c !== "-" && !st.fresh) {
    const neg = c.startsWith("-"), body = c.replace(/^-/, "").replace(/%$/, ""), pct = c.endsWith("%");
    const [i, d] = body.split(".");
    const s = (neg ? "−" : "") + group(i || "0", grp) + (d != null ? "." + d : "") + (pct ? "%" : "");
    return { expr, text: s, value: parseFloat(body) || 0, prev };
  }
  const v = pv == null || !isFinite(pv) ? 0 : pv;
  return { expr, text: fmt(v, grp), value: v, prev };
}

export const resFontSize = (len: number) => (len <= 10 ? "36px" : len <= 13 ? "30px" : len <= 16 ? "25px" : len <= 20 ? "21px" : "17px");
