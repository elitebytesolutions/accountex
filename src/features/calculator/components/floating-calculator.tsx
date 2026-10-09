"use client";

import "../calculator.css";
import {
  ArrowLeftRight, Calculator, ChevronDown, Circle, CircleDot, ClipboardCopy, Copy, CornerDownLeft, Gift, GripVertical,
  ListPlus, Maximize2, Minus, Package, Pencil, Printer, ReceiptText, ScrollText, Sigma, Tags, Trash2, X,
} from "lucide-react";
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type CSSProperties, type JSX, type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui/cn";
import { Menu } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import {
  INITIAL, clean, currentValue, display, fmt, insertValue, normalize, evaluate, parseNum, pretty, press as pressKey, raw,
  resFontSize, resultState, splitDec, words, type CalcState, type Grouping, type PressResult,
} from "../engine";
import { calcStore, lsGet, lsSet, useCalcShared, type TapeLine } from "../store";

type Props = { open: boolean; onClose: () => void; anchor?: HTMLElement | null };

/* ---------------- static markup data (template tpl()) ---------------- */
const KEYS: [string, string, string?][] = [
  ["mc", "MC", "fn mem"], ["mr", "MR", "fn mem"], ["m+", "M+", "fn mem"], ["m-", "M−", "fn mem"], ["gt", "GT", "fn mem"],
  ["c", "AC", "fn clr"], ["bs", "⌫", "fn"], ["neg", "±", "fn"], ["gst+", "+GST", "fn gst"], ["gst-", "−GST", "fn gst"],
  ["7", "7"], ["8", "8"], ["9", "9"], ["÷", "÷", "op"], ["=", "=", "eq"],
  ["4", "4"], ["5", "5"], ["6", "6"], ["×", "×", "op"],
  ["1", "1"], ["2", "2"], ["3", "3"], ["−", "−", "op"],
  ["0", "0"], [".", "."], ["%", "%", "op"], ["+", "+", "op"],
];
const TITLES: Record<string, string> = {
  mc: "Memory clear", mr: "Memory recall", "m+": "Add to memory", "m-": "Subtract from memory", gt: "Recall grand total (sum of today's tape)",
  c: "Clear entry / all clear (Esc)", bs: "Backspace", neg: "Change sign", "gst+": "Add GST at the selected rate (G)",
  "gst-": "Remove GST from an inclusive amount (Shift+G)", "=": "Equals (Enter)",
};
type Mode = "basic" | "gst" | "trade" | "units" | "words";
const MODES: [Mode, string][] = [["basic", "Basic"], ["gst", "GST"], ["trade", "Trade"], ["units", "Units"], ["words", "Words"]];
const RATES: [number, string][] = [[18, "Standard"], [17, "Reduced"], [16, "PRA / ICT services"], [15, "SRB / KPRA services"]];
const KEYMAP: Record<string, string> = {
  "+": "+", "-": "−", "*": "×", x: "×", X: "×", "/": "÷", "%": "%", ".": ".", ",": ".", Enter: "=", "=": "=",
  Backspace: "bs", Escape: "c", Delete: "c", g: "gst+", G: "gst-",
};

/* ---------------- small DOM helpers ---------------- */
const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Restarts a one-shot CSS animation class (template: remove, reflow, add). */
function kick(el: Element | null | undefined, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
const noopSubscribe = () => () => {};

/** Number with dimmed decimals (template decHTML / FS.tick output). */
function Num({ text, decClass = "cx-dec", suffix }: { text: string; decClass?: string; suffix?: string }) {
  const [i, d] = splitDec(text);
  return <>{i}{d && <span className={decClass}>{d}</span>}{suffix}</>;
}

/* ---------------- public component ---------------- */
export function FloatingCalculator({ open, onClose, anchor }: Props): JSX.Element | null {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true); // mount lazily on first open, then keep state while hidden (template hides, never destroys)
  if (!isClient || !mounted) return null;
  return createPortal(<FloatPanel open={open} onClose={onClose} anchor={anchor ?? null} />, document.body);
}

function FloatPanel({ open, onClose, anchor }: { open: boolean; onClose: () => void; anchor: HTMLElement | null }) {
  const toast = useToast();
  const shared = useCalcShared();
  const grp = shared.set.group;

  const flRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const resRef = useRef<HTMLOutputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const modesRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLElement>(null);

  /* -------- calculator state -------- */
  const [st, setSt] = useState<CalcState>(INITIAL);
  const stRef = useRef<CalcState>(INITIAL);
  const [animText, setAnimText] = useState<string | null>(null);
  const rafRef = useRef(0);
  const [mode, setModeState] = useState<Mode>("basic");
  const [min, setMin] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tapeMin, setTapeMin] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [roundAnchor, setRoundAnchor] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  const focusRoot = useCallback(() => rootRef.current?.focus({ preventScroll: true }), []);
  const shake = () => kick(rootRef.current, "cx-shake");
  const flashInd = (k: "m" | "gt") => kick(rootRef.current?.querySelector(`[data-ind="${k}"]`), "cx-blip");

  function animateTo(from: number, v: number) {
    kick(resRef.current, "cx-roll");
    cancelAnimationFrame(rafRef.current);
    if (reduceMotion() || from === v || !isFinite(from)) { setAnimText(null); return; }
    const g = calcStore.get().set.group;
    const dur = 340, dp = (raw(v).split(".")[1] || "").length;
    let t0 = -1;
    const step = (now: number) => {
      if (t0 < 0) t0 = now;
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      if (p < 1) { setAnimText(fmt(from + (v - from) * e, g, Math.min(dp, 8))); rafRef.current = requestAnimationFrame(step); }
      else setAnimText(null);
    };
    rafRef.current = requestAnimationFrame(step);
  }
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /** Sets a new calculator state; `anim` rolls the result from what was shown. */
  function commitState(next: CalcState, anim?: boolean) {
    const from = display(stRef.current, calcStore.get().set.group).value;
    stRef.current = next;
    setSt(next);
    if (anim) animateTo(from, next.res);
    else { cancelAnimationFrame(rafRef.current); setAnimText(null); }
  }

  function press(k: string) {
    const s = calcStore.get();
    const r: PressResult = pressKey(stRef.current, k, { mem: s.mem, gt: s.gt, round: s.set.round, rate: s.set.rate, grp: s.set.group });
    r.tape?.forEach((l) => calcStore.addTape(l.e, l.r, l.k));
    if (r.mem !== undefined) calcStore.setMem(r.mem);
    if (r.changed) commitState(r.st, r.anim);
    if (r.flash) flashInd(r.flash);
    if (r.shake) shake();
  }

  function animKey(k: string) {
    const b = rootRef.current?.querySelector<HTMLElement>(`.cx-k[data-k="${CSS.escape(k)}"]`);
    if (!b) return;
    kick(b, "cx-press");
    const t = b as HTMLElement & { _t?: number };
    clearTimeout(t._t);
    t._t = window.setTimeout(() => b.classList.remove("cx-press"), 160);
  }

  /* -------- clipboard / print -------- */
  function copyText(t: string, label?: string) {
    const ok = () => toast((label || "Copied") + " · " + (t.length > 46 ? t.slice(0, 44) + "…" : t), { tone: "good" });
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch { /* ignore */ }
      ok();
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fallback);
      else fallback();
    } catch { fallback(); }
  }
  function copyResult() {
    const v = currentValue(stRef.current);
    copyText(raw(v), "Copied " + fmt(v, calcStore.get().set.group));
    setCopied(true);
    setTimeout(() => setCopied(false), 900);
  }
  const lineExpr = (l: TapeLine, g: Grouping) => (l.k === "calc" ? pretty(l.e, g) : l.e);
  function printTape() {
    const s = calcStore.get();
    if (!s.tape.length) { toast("The tape is empty", { tone: "info" }); return; }
    const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    const g = s.set.group;
    const rows = s.tape.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(lineExpr(l, g))}</td><td style="text-align:right">${esc(fmt(l.r, g))}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Calculator tape</title><style>body{font:13px/1.5 'Courier New',monospace;padding:24px;color:#111}h1{font-size:15px;margin:0 0 2px}p{margin:0 0 14px;color:#555}table{border-collapse:collapse;width:100%;max-width:520px}td{padding:4px 6px;border-bottom:1px dashed #bbb}tfoot td{border-top:2px solid #111;font-weight:bold;border-bottom:0}</style></head><body><h1>Calculator tape</h1><p>${esc(new Date().toLocaleString())}</p><table><tbody>${rows}</tbody><tfoot><tr><td></td><td>Grand total</td><td style="text-align:right">${esc(fmt(s.gt, g))}</td></tr></tfoot></table></body></html>`;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.appendChild(f);
    try {
      const d = f.contentDocument as Document;
      d.open(); d.write(html); d.close();
      setTimeout(() => {
        try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { /* ignore */ }
        setTimeout(() => f.remove(), 1500);
      }, 60);
    } catch { f.remove(); }
  }

  /* -------- mode panes: inputs -------- */
  // GST
  const [gAmt, setGAmt] = useState("");
  const [gTouched, setGTouched] = useState(false);
  const [gDir, setGDir] = useState<"add" | "rem">("add");
  const [gFt, setGFt] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [custText, setCustText] = useState(() => String(calcStore.get().set.rate));
  // Trade
  const [lp, setLp] = useState("1,000");
  const [chain, setChain] = useState("10+5");
  const [mm, setMm] = useState<"price" | "margin" | "markup">("price");
  const [cost, setCost] = useState("800");
  const [v2, setV2] = useState("1,000");
  const [sr, setSr] = useState("150");
  const [sb, setSb] = useState("10");
  const [sf, setSf] = useState("1");
  // Units (static-free: pack size and unit price are typed in, no product list)
  const [pack, setPack] = useState("12");
  const [uPrice, setUPrice] = useState("100");
  const [ctn, setCtn] = useState("2");
  const [pcs, setPcs] = useState("5");
  const [totText, setTotText] = useState<string | null>(null);
  // Words
  const [wAmt, setWAmt] = useState("");
  const [wTouched, setWTouched] = useState(false);

  const rate = shared.set.rate;
  const isCust = !RATES.some(([x]) => x === +rate);
  const gst = (() => {
    const amt = parseNum(gAmt), r = +rate || 0, ft = gFt ? 4 : 0, add = gDir !== "rem";
    const net = add ? amt : amt / (1 + (r + ft) / 100), tax = (net * r) / 100, fur = (net * ft) / 100, gross = add ? net + tax + fur : amt;
    return { net, tax, fur, gross, r, ft, add, amt };
  })();
  const trade = (() => {
    const l = parseNum(lp);
    const ds = String(chain).split(/[+,\s]+/).map(parseFloat).filter((x) => isFinite(x));
    const f = ds.reduce((a, d) => a * (1 - d / 100), 1), eff = (1 - f) * 100;
    const c = parseNum(cost), v = parseNum(v2);
    const price = mm === "price" ? v : mm === "margin" ? (v < 100 ? c / (1 - v / 100) : 0) : c * (1 + v / 100);
    const profit = price - c, margin = price ? (profit / price) * 100 : 0, markup = c ? (profit / c) * 100 : 0;
    const r = parseNum(sr), b = parseNum(sb), fr = parseNum(sf);
    const su = b + fr > 0 ? (r * b) / (b + fr) : 0, sd = b + fr > 0 ? (fr / (b + fr)) * 100 : 0;
    return { net: l * f, eff, price, profit, margin, markup, su, sd, cost: c };
  })();
  const packN = Math.max(1, Math.round(parseNum(pack)) || 1);
  const unitPrice = parseNum(uPrice);
  const tot = Math.max(0, Math.round(parseNum(ctn) * packN + parseNum(pcs)));
  const uc = Math.floor(tot / packN), up = tot % packN;
  const unitsLabel = `${uc} ctn ${up} pcs × ${fmt(unitPrice, grp, 2)}`;
  const wVal = parseNum(wAmt);
  const wordsText = words(wVal, grp);

  function setMode(m: Mode) {
    setModeState(m);
    const v = currentValue(stRef.current), g = calcStore.get().set.group;
    if (m === "gst" && !gTouched) setGAmt(v ? fmt(v, g).replace(/−/g, "-") : "10,000");
    if (m === "words" && !wTouched) setWAmt(v ? raw(v) : "1234567");
  }
  function changeMm(next: "price" | "margin" | "markup") {
    const pr = trade.price || 0, c = trade.cost;
    setV2(next === "price" ? fmt(pr, grp, 2) : next === "margin" ? (pr ? (((pr - c) / pr) * 100).toFixed(2) : "20") : c ? (((pr - c) / c) * 100).toFixed(2) : "25");
    setMm(next);
  }
  function gstAction(use: boolean) {
    const g = gst;
    if (!g.amt) { shake(); return; }
    const label = g.add ? `${fmt(g.amt, grp)} + GST ${g.r}%${g.ft ? " + FT 4%" : ""}` : `${fmt(g.amt, grp)} − GST ${g.r}%${g.ft ? " + FT 4%" : ""} (incl.) → net`;
    const val = g.add ? g.gross : g.net;
    calcStore.addTape(label, val, "gst");
    if (use) { setModeState("basic"); commitState(resultState(val, label), true); }
    else toast("Added to tape", { tone: "good" });
  }
  function unitsUse() {
    const val = tot * unitPrice;
    calcStore.addTape(unitsLabel, val, "units");
    setModeState("basic");
    commitState(resultState(val, unitsLabel), true);
  }
  function onTotChange(v: string) {
    setTotText(v);
    const t = Math.max(0, Math.round(parseNum(v)));
    setCtn(String(Math.floor(t / packN)));
    setPcs(String(t % packN));
  }

  /* -------- tape -------- */
  function tapeAction(act: "t-total" | "t-copy" | "t-print" | "t-clear") {
    const s = calcStore.get(), g = s.set.group;
    if (act === "t-total") {
      if (!s.tape.length) { toast("The tape is empty", { tone: "info" }); return; }
      const n = s.tape.filter((l) => l.k !== "total").length;
      calcStore.addTape(`Σ Total of ${n} line${n === 1 ? "" : "s"}`, s.gt, "total");
      commitState(resultState(s.gt, "Σ Tape total"), true);
    } else if (act === "t-copy") {
      if (!s.tape.length) { toast("The tape is empty", { tone: "info" }); return; }
      copyText(s.tape.map((l, i) => `${i + 1}. ${lineExpr(l, g)} = ${fmt(l.r, g)}`).join("\n") + `\nGT = ${fmt(s.gt, g)}`, "Tape copied");
    } else if (act === "t-print") printTape();
    else {
      if (!s.tape.length) return;
      const old = s.tape.slice();
      calcStore.setTape([]);
      toast("Tape cleared (" + old.length + " lines)", { tone: "info", action: { label: "Undo", onClick: () => calcStore.setTape(old) } });
    }
  }
  function tapeUse(l: TapeLine, li: HTMLElement | null) {
    commitState(insertValue(stRef.current, l.r));
    kick(li, "cx-pick");
    setModeState("basic");
  }
  function tapeDelete(id: number, li: HTMLElement | null) {
    li?.classList.add("cx-out");
    setTimeout(() => {
      const tape = calcStore.get().tape.slice(), i = tape.findIndex((x) => x.id === id);
      if (i < 0) return;
      const [rm] = tape.splice(i, 1);
      calcStore.setTape(tape);
      toast("Line deleted", {
        tone: "info",
        action: { label: "Undo", onClick: () => { const t = calcStore.get().tape.slice(); t.splice(i, 0, rm); calcStore.setTape(t); } },
      });
    }, reduceMotion() ? 0 : 220);
  }
  function saveEdit(id: number, text: string) {
    setEditing(null);
    const tape = calcStore.get().tape, idx = tape.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const ex = normalize(text), v = evaluate(ex, true);
    if (v != null && isFinite(v)) {
      const l = { ...tape[idx], e: ex.replace(/[+−×÷]$/, ""), k: "calc" as const, r: clean(v) };
      calcStore.setTape(tape.map((x, i) => (i === idx ? l : x)));
      toast("Line " + (idx + 1) + " recalculated = " + fmt(l.r, calcStore.get().set.group), { tone: "good" });
    } else if (text.trim()) toast("That expression can’t be evaluated", { tone: "warn" });
  }
  // New tape line: flash it and scroll to it (template renderTape `grew`).
  const tapeLen = useRef(shared.tape.length);
  useEffect(() => {
    const grew = shared.tape.length > tapeLen.current;
    tapeLen.current = shared.tape.length;
    const list = listRef.current;
    if (!grew || !list) return;
    kick(list.querySelector(".cx-tl:last-child"), "cx-new");
    list.scrollTop = list.scrollHeight;
  }, [shared.tape.length]);

  /* -------- keyboard (template root keydown) -------- */
  /** Closes the panel, handing focus back to the anchor if it was inside. */
  function requestClose() {
    const fl = flRef.current;
    if (fl && fl.contains(document.activeElement) && anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
    onClose();
  }
  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.classList?.contains("cx-tedit")) return; // the edit input handles its own keys
    if (t.closest?.("input,select,textarea")) {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); t.blur(); focusRoot(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "c") {
      const sel = window.getSelection && String(window.getSelection());
      if (!sel) { e.preventDefault(); e.stopPropagation(); copyResult(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (roundAnchor) return; // let the round menu's own Escape handler close it
      e.stopPropagation();
      const s = stRef.current;
      // Template: Esc = clear (AC). Here: Esc clears while there is something to clear, then closes the panel.
      if (s.ex || s.done || s.err) { if (mode !== "basic") setMode("basic"); animKey("c"); press("c"); }
      else requestClose();
      return;
    }
    const k = /^\d$/.test(e.key) ? e.key : KEYMAP[e.key];
    if (!k) return;
    if (mode !== "basic") setMode("basic");
    e.preventDefault(); e.stopPropagation();
    animKey(k); press(k);
  }
  const onKeyRef = useRef(onKey);
  useLayoutEffect(() => { onKeyRef.current = onKey; });

  const closeRef = useRef(requestClose);
  useLayoutEffect(() => { closeRef.current = requestClose; });

  useEffect(() => {
    if (!open) return;
    const fl = flRef.current;
    // Keys inside the panel; native listener so stopPropagation keeps them from page shortcuts on document.
    const inPanel = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).classList?.contains("cx-tedit")) return; // tape line editor owns its keys
      onKeyRef.current(e);
      if (!e.defaultPrevented && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
    };
    // Keys typed while nothing has focus (e.g. after clicking blank page space) still reach the calculator.
    const onDoc = (e: KeyboardEvent) => { if (e.target === document.body || e.target === document.documentElement) onKeyRef.current(e); };
    fl?.addEventListener("keydown", inPanel);
    document.addEventListener("keydown", onDoc);
    return () => { fl?.removeEventListener("keydown", inPanel); document.removeEventListener("keydown", onDoc); };
  }, [open]);

  /* -------- floating popover: position, drag, minimise -------- */
  const place = useCallback((x: number, y: number) => {
    const fl = flRef.current, head = headRef.current;
    if (!fl) return;
    const w = fl.offsetWidth, h = (head?.offsetHeight ?? 40) + 8;
    x = Math.max(8, Math.min(innerWidth - w - 8, x));
    y = Math.max(8, Math.min(innerHeight - h, y));
    fl.style.left = x + "px";
    fl.style.top = y + "px";
  }, []);

  const layoutInk = useCallback(() => {
    const b = modesRef.current?.querySelector<HTMLElement>("button.active"), ink = inkRef.current;
    if (b && ink && b.offsetWidth) { ink.style.width = b.offsetWidth + "px"; ink.style.transform = `translateX(${b.offsetLeft - 3}px)`; }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const fl = flRef.current;
    if (!fl) return;
    const saved = lsGet<unknown>("cx-float-pos", null), w = fl.offsetWidth;
    if (innerWidth < 560) place(8, 72);
    else if (anchor && anchor.isConnected && anchor.offsetParent !== null) { const r = anchor.getBoundingClientRect(); place(r.right - w, r.bottom + 10); }
    else if (Array.isArray(saved)) place(+saved[0] || 0, +saved[1] || 0);
    else place(innerWidth - w - 24, Math.max(72, innerHeight - fl.offsetHeight - 24));
    kick(fl, "cx-enter");
    layoutInk();
    focusRoot();
    // Only on the open transition; the anchor is read once like FS.calc.open(anchor).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => { layoutInk(); }, [mode, min, layoutInk]);

  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => layoutInk());
    ro.observe(root);
    const onResize = () => { const fl = flRef.current; if (fl) place(parseFloat(fl.style.left) || 0, parseFloat(fl.style.top) || 0); };
    addEventListener("resize", onResize);
    return () => { ro.disconnect(); removeEventListener("resize", onResize); };
  }, [open, layoutInk, place]);

  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null);
  function onHeadDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button") || e.button !== 0 || !flRef.current) return;
    const r = flRef.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    e.preventDefault();
  }
  function onHeadMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (d && e.pointerId === d.id) place(e.clientX - d.dx, e.clientY - d.dy);
  }
  function onHeadEnd(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* */ }
    const fl = flRef.current;
    if (fl) lsSet("cx-float-pos", [parseFloat(fl.style.left), parseFloat(fl.style.top)]);
  }
  function toggleMin() {
    const m = !min;
    setMin(m);
    if (!m) requestAnimationFrame(() => { const fl = flRef.current; if (fl) place(parseFloat(fl.style.left) || 0, parseFloat(fl.style.top) || 0); layoutInk(); focusRoot(); });
  }

  /* -------- render -------- */
  const d = display(st, grp);
  const resText = animText ?? d.text;
  const g = (v: number, dec = 2, suffix?: string) => <Num text={fmt(isFinite(v) ? v : 0, grp, dec)} decClass="dec" suffix={suffix} />;
  const seg = <T extends string>(value: T, opts: [T, ReactNode][], onPick: (v: T) => void, sm?: boolean) => (
    <div className={cn("cx-seg2", sm && "sm")}>
      {opts.map(([v, l]) => (
        <button key={v} type="button" className={cn(value === v && "active")} onClick={() => onPick(v)}>{l}</button>
      ))}
    </div>
  );

  return (
    <div
      ref={flRef}
      className={cn("cx-float", min && "cx-min", dragging && "cx-dragging")}
      hidden={!open}
      role="dialog"
      aria-label="Calculator"
    >
      <div
        ref={headRef}
        className="cx-fhead"
        title="Drag to move"
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadEnd}
        onPointerCancel={onHeadEnd}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button")) toggleMin(); }}
      >
        <GripVertical className="cx-grip" />
        <span className="cx-ftitle"><Calculator />Calculator</span>
        <kbd>C</kbd>
        <span className="cx-sp" />
        <button type="button" className="cx-mini cx-icon" title={min ? "Restore" : "Minimise"} aria-label={min ? "Restore" : "Minimise"} onClick={toggleMin}>
          {min ? <Maximize2 /> : <Minus />}
        </button>
        <button type="button" className="cx-mini cx-icon" title="Close" aria-label="Close calculator" onClick={requestClose}><X /></button>
      </div>

      <div className="cx-fbody">
        <div
          ref={rootRef}
          className={cn("cx cx-in-float", st.err && "cx-err", tapeMin && "cx-tape-min")}
          tabIndex={0}
          aria-label="Calculator"
          onPointerDown={(e) => {
            const t = e.target as HTMLElement;
            const b = t.closest<HTMLElement>(".cx-k");
            if (b?.dataset.k) animKey(b.dataset.k);
            if (!t.closest("input,select,textarea,button")) setTimeout(focusRoot, 0);
          }}
        >
          {/* display */}
          <div className="cx-display">
            <div className="cx-dtop">
              <span className={cn("cx-ind", shared.mem !== 0 && "on")} data-ind="m" title={"Memory: " + fmt(shared.mem, grp)}>M</span>
              <span className={cn("cx-ind", shared.tape.length > 0 && "on")} data-ind="gt" title={"Grand total: " + fmt(shared.gt, grp)}>GT</span>
              <span className="cx-ind on" data-ind="grp" title="Digit grouping">{grp === "intl" ? "INTL" : "LAKH"}</span>
              <span className="cx-sp" />
              <button type="button" className="cx-mini" title="Round result" onClick={(e) => setRoundAnchor(roundAnchor ? null : e.currentTarget)}>
                <span>Round: {shared.set.round ? shared.set.round : "none"}</span><ChevronDown />
              </button>
              <button type="button" className={cn("cx-mini cx-icon", copied && "cx-ok")} title="Copy result (Ctrl+C)" aria-label="Copy result" onClick={copyResult}><Copy /></button>
            </div>
            <div className="cx-expr">{d.expr}</div>
            <div className="cx-resrow">
              <span className="cx-prev">{d.prev}</span>
              <output ref={resRef} className="cx-res" aria-live="polite" style={{ "--cx-fs": resFontSize(resText.length) } as CSSProperties}>
                {st.err ? resText : <Num text={resText} />}
              </output>
            </div>
          </div>

          {/* mode tabs */}
          <div className="cx-modes" role="tablist" ref={modesRef}>
            {MODES.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} className={cn(mode === k && "active")} onClick={() => setMode(k)}>{l}</button>
            ))}
            <i className="cx-modes-ink" ref={inkRef} />
          </div>

          <div className="cx-panes">
            {mode === "basic" && (
              <div className="cx-pane active">
                <div className="cx-keys">
                  {KEYS.map(([k, l, c]) => (
                    <button
                      key={k}
                      type="button"
                      tabIndex={-1}
                      className={cn("cx-k", c || "dg")}
                      data-k={k}
                      title={TITLES[k]}
                      onClick={() => { press(k); focusRoot(); }}
                    >
                      {k === "gst+" || k === "gst-" ? <>{l}<small>{rate}%</small></> : k === "c" ? (st.ex && !st.done ? "C" : "AC") : l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === "gst" && (
              <div className="cx-pane active">
                <label className="cx-f"><span>Amount</span>
                  <input inputMode="decimal" autoComplete="off" value={gAmt} onChange={(e) => { setGTouched(true); setGAmt(e.target.value); }} />
                </label>
                <div className="cx-f"><span>Rate</span>
                  <div className="cx-chips">
                    {RATES.map(([r, t]) => (
                      <button key={r} type="button" className={cn("cx-chip", !custOpen && +rate === r && "active")} title={t} onClick={() => { setCustOpen(false); calcStore.setSettings({ rate: r }); }}>{r}%</button>
                    ))}
                    <button type="button" className={cn("cx-chip", (custOpen || isCust) && "active")} onClick={() => { setCustOpen(true); if (isCust) setCustText(String(rate)); }}>Custom</button>
                    {(custOpen || isCust) && (
                      <input
                        className="cx-cust"
                        inputMode="decimal"
                        placeholder="%"
                        aria-label="Custom GST rate"
                        autoFocus={custOpen}
                        onFocus={(e) => e.currentTarget.select()}
                        value={custText}
                        onChange={(e) => {
                          setCustText(e.target.value);
                          const v = parseFloat(e.target.value);
                          if (isFinite(v) && v >= 0 && v < 100) calcStore.setSettings({ rate: v });
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="cx-line">
                  {seg(gDir, [["add", <>+GST <small>exclusive</small></>], ["rem", <>−GST <small>inclusive</small></>]], setGDir)}
                </div>
                <label className="switch cx-sw">
                  <input type="checkbox" checked={gFt} onChange={(e) => setGFt(e.target.checked)} /><i />
                  <span>Further tax 4% <small>unregistered buyer</small></span>
                </label>
                <div className="cx-tiles c4">
                  <div><small>Net</small><b>{g(gst.net)}</b></div>
                  <div><small>GST {gst.r}%</small><b>{g(gst.tax)}</b></div>
                  <div className={cn(!gst.ft && "cx-off")}><small>Further 4%</small><b>{g(gst.fur)}</b></div>
                  <div className="hl"><small>Gross</small><b>{g(gst.gross)}</b></div>
                </div>
                <div className="cx-acts">
                  <button type="button" className="btn sm secondary" onClick={() => gstAction(false)}><ListPlus />Add to tape</button>
                  <button type="button" className="btn sm primary" onClick={() => gstAction(true)}><CornerDownLeft />Use gross</button>
                </div>
              </div>
            )}

            {mode === "trade" && (
              <div className="cx-pane active">
                <div className="cx-card">
                  <h5><Tags />Chained discount</h5>
                  <div className="cx-grid2">
                    <label className="cx-f"><span>List price</span><input inputMode="decimal" value={lp} onChange={(e) => setLp(e.target.value)} /></label>
                    <label className="cx-f"><span>Discounts</span><input value={chain} placeholder="10+5+2" onChange={(e) => setChain(e.target.value)} /></label>
                  </div>
                  <div className="cx-res2"><span>Effective <b>{g(trade.eff, 2, "%")}</b></span><span>Net <b>{g(trade.net)}</b></span></div>
                </div>
                <div className="cx-card">
                  <h5><ArrowLeftRight />Margin &amp; markup</h5>
                  {seg(mm, [["price", "Cost & price"], ["margin", "Cost & margin %"], ["markup", "Cost & markup %"]], changeMm, true)}
                  <div className="cx-grid2">
                    <label className="cx-f"><span>Cost</span><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
                    <label className="cx-f"><span>{mm === "price" ? "Selling price" : mm === "margin" ? "Margin %" : "Markup %"}</span><input inputMode="decimal" value={v2} onChange={(e) => setV2(e.target.value)} /></label>
                  </div>
                  <div className="cx-res2 c4">
                    <span>Price <b>{g(trade.price)}</b></span><span>Profit <b>{g(trade.profit)}</b></span>
                    <span>Margin <b>{g(trade.margin, 2, "%")}</b></span><span>Markup <b>{g(trade.markup, 2, "%")}</b></span>
                  </div>
                </div>
                <div className="cx-card">
                  <h5><Gift />Scheme effective price</h5>
                  <div className="cx-grid3">
                    <label className="cx-f"><span>Rate</span><input inputMode="decimal" value={sr} onChange={(e) => setSr(e.target.value)} /></label>
                    <label className="cx-f"><span>Buy</span><input inputMode="numeric" value={sb} onChange={(e) => setSb(e.target.value)} /></label>
                    <label className="cx-f"><span>Free</span><input inputMode="numeric" value={sf} onChange={(e) => setSf(e.target.value)} /></label>
                  </div>
                  <div className="cx-res2"><span>Effective unit <b>{g(trade.su)}</b></span><span>Discount <b>{g(trade.sd, 2, "%")}</b></span></div>
                </div>
              </div>
            )}

            {mode === "units" && (
              <div className="cx-pane active">
                <div className="cx-grid2">
                  <label className="cx-f"><span>Pcs per carton</span><input inputMode="numeric" value={pack} onChange={(e) => setPack(e.target.value)} /></label>
                  <label className="cx-f"><span>Unit price</span><input inputMode="decimal" value={uPrice} onChange={(e) => setUPrice(e.target.value)} /></label>
                </div>
                <div className="cx-pack"><Package /><span>1 carton = <b>{packN}</b> Pcs</span></div>
                <div className="cx-grid3">
                  <label className="cx-f"><span>Cartons</span><input inputMode="numeric" value={ctn} onChange={(e) => setCtn(e.target.value)} /></label>
                  <label className="cx-f"><span>Pieces</span><input inputMode="numeric" value={pcs} onChange={(e) => setPcs(e.target.value)} /></label>
                  <label className="cx-f"><span>Total pcs</span>
                    <input inputMode="numeric" value={totText ?? String(tot)} onFocus={() => setTotText(String(tot))} onBlur={() => setTotText(null)} onChange={(e) => onTotChange(e.target.value)} />
                  </label>
                </div>
                <div className="cx-tiles c3">
                  <div><small>Total pieces</small><b>{g(tot, 0)}</b></div>
                  <div><small>Unit price / Pcs</small><b>{g(unitPrice)}</b></div>
                  <div className="hl"><small>Value</small><b>{g(tot * unitPrice)}</b></div>
                </div>
                <div className="cx-acts">
                  <span className="cx-note">{`${uc} ctn ${up} pcs = ${fmt(tot, grp)} pcs`}</span>
                  <button type="button" className="btn sm primary" onClick={unitsUse}><CornerDownLeft />Use value</button>
                </div>
              </div>
            )}

            {mode === "words" && (
              <div className="cx-pane active">
                <label className="cx-f"><span>Amount (PKR)</span>
                  <input inputMode="decimal" autoComplete="off" value={wAmt} onChange={(e) => { setWTouched(true); setWAmt(e.target.value); }} />
                </label>
                <div className="cx-line">
                  {seg<Grouping>(grp, [["lakh", "12,34,567"], ["intl", "1,234,567"]], (v) => calcStore.setSettings({ group: v }), true)}
                </div>
                <div className="cx-words">
                  <div className="cx-wnum">Rs <Num text={fmt(wVal, grp, 2)} /></div>
                  <p key={wordsText} className="cx-fade" lang="en" dir="ltr">{wordsText}</p>
                </div>
                <div className="cx-acts">
                  <span className="cx-note">Cheque-ready wording</span>
                  <button type="button" className="btn sm secondary" onClick={() => copyText(wordsText, "Copied words")}><Copy />Copy</button>
                </div>
              </div>
            )}
          </div>

          {/* tape */}
          <div className="cx-tape">
            <div className="cx-thead">
              <button type="button" className="cx-ttl" aria-expanded={!tapeMin} onClick={() => setTapeMin(!tapeMin)}>
                <ScrollText />Tape <em>{shared.tape.length}</em><ChevronDown className="cx-chev" />
              </button>
              <span className="cx-gt" title="Grand total of today's tape">Σ <b>{fmt(shared.gt, grp, 2)}</b></span>
              <span className="cx-tacts">
                <button type="button" className="cx-mini cx-icon" title="Re-total tape" aria-label="Re-total tape" onClick={() => tapeAction("t-total")}><Sigma /></button>
                <button type="button" className="cx-mini cx-icon" title="Copy tape" aria-label="Copy tape" onClick={() => tapeAction("t-copy")}><ClipboardCopy /></button>
                <button type="button" className="cx-mini cx-icon" title="Print tape" aria-label="Print tape" onClick={() => tapeAction("t-print")}><Printer /></button>
                <button type="button" className="cx-mini cx-icon" title="Clear tape" aria-label="Clear tape" onClick={() => tapeAction("t-clear")}><Trash2 /></button>
              </span>
            </div>
            <ol className="cx-tlist" ref={listRef}>
              {!shared.tape.length ? (
                <li className="cx-tempty"><ReceiptText />No calculations yet today. Results you total with = land here.</li>
              ) : (
                shared.tape.map((l, i) => (
                  <li key={l.id} className={cn("cx-tl", l.k === "total" && "cx-tot")}>
                    <span className="cx-tn">{i + 1}</span>
                    {editing === l.id ? (
                      <input
                        className="cx-tedit"
                        aria-label="Edit expression"
                        defaultValue={lineExpr(l, grp)}
                        autoFocus
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={(e) => { if (editing === l.id) saveEdit(l.id, e.currentTarget.value); }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") { e.preventDefault(); saveEdit(l.id, e.currentTarget.value); }
                          if (e.key === "Escape") { e.preventDefault(); setEditing(null); focusRoot(); }
                        }}
                      />
                    ) : (
                      <button type="button" className="cx-tline" title="Use this result" onClick={(e) => tapeUse(l, e.currentTarget.closest("li"))}>
                        <span className="cx-te">{lineExpr(l, grp)}</span>
                        <b className="cx-tr"><Num text={fmt(l.r, grp)} /></b>
                      </button>
                    )}
                    <span className="cx-tx">
                      <button type="button" className="cx-mini cx-icon" title="Edit" aria-label="Edit line" onClick={() => setEditing(l.id)}><Pencil /></button>
                      <button type="button" className="cx-mini cx-icon" title="Delete" aria-label="Delete line" onClick={(e) => tapeDelete(l.id, e.currentTarget.closest("li"))}><X /></button>
                    </span>
                  </li>
                ))
              )}
            </ol>
          </div>
        </div>
      </div>

      {open && roundAnchor && (
        <Menu
          anchor={roundAnchor}
          onClose={() => setRoundAnchor(null)}
          items={([["none", 0], ["Nearest 1", 1], ["Nearest 5", 5], ["Nearest 10", 10]] as [string, number][]).map(([l, v]) => ({
            label: (shared.set.round === v ? "✓ " : "") + (v ? l : "No rounding"),
            icon: v ? <CircleDot /> : <Circle />,
            onClick: () => {
              calcStore.setSettings({ round: v });
              toast(v ? "Results round to nearest " + v : "Rounding off", { tone: "info" });
            },
          }))}
        />
      )}
    </div>
  );
}
