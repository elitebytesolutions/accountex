"use client";

import "./quick-entry-screen.css";
import {
  Bookmark, BookmarkPlus, Box, Boxes, CalendarDays, Check, ChevronDown, CornerDownRight, FileClock, FileText, Gift, Inbox, Keyboard, LayoutTemplate,
  ListChecks, MessageCircle, Package, Pause, Phone, Plus, Printer, Route, ShieldAlert, ShieldCheck, Store, Tag, Trash2, TriangleAlert, UserRound, Warehouse, Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  lineAmounts, schemeFree, termDays, tierRate, type CustomerCredit, type HeldBill, type OrderTemplate, type StockMap, type WholesaleInvoiceRef, type WholesaleOptions,
} from "@/shared";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { customerCredit } from "@/features/sales/api";
import {
  createTemplate, discardHeldBill, holdBill, listHeldBills, listTemplates, recallHeldBill, saveWholesaleBill, warehouseStock, wholesaleOptions,
} from "../api";
import { AddManyModal, CreditModal, PrintPaper, TemplateSheet, type CreditFacts, type Snapshot } from "./entry-dialogs";
import {
  FloatPop, grp, initials, num, pk, qtyStr, r2, RichMenu, rs, schemeFor, schemeLabel, TierChip, type Product, type Shop,
} from "./entry-shared";

type Can = { save: boolean; hold: boolean; discard: boolean; templates: boolean };
type Line = { key: number; itemId: string; q: string | null; ctn: string; pcs: string; rate: number; rateText: string | null; manual: boolean; disc: string; gst: string };
type Head = { docDate: string; customerId: string; routeId: string; salesmanId: string; warehouseId: string; tier: string };
type Field = "prod" | "ctn" | "pcs" | "rate" | "disc" | "gst";
type Ac = { el: HTMLInputElement; key: number; q: string; idx: number } | null;
type Sp = { el: HTMLInputElement; q: string; idx: number } | null;
type MenuKind = { kind: "tier" | "recall" | "tpl"; el: HTMLElement } | null;
type Ext = { id: string; name: string; code: string } | null;

const FIELDS: Field[] = ["prod", "ctn", "pcs", "rate", "disc", "gst"];
const SERVER_FIELD: Record<string, Field> = { itemId: "prod", qtyCtn: "ctn", qtyLoose: "pcs", rate: "rate", discountPct: "disc", taxRate: "gst" };
const BLOCKED = new Set(["CREDIT_LIMIT_EXCEEDED", "CUSTOMER_ON_HOLD"]);
let seq = 0;
const blank = (): Line => ({ key: ++seq, itemId: "", q: null, ctn: "", pcs: "", rate: 0, rateText: null, manual: false, disc: "", gst: "" });
const hhmm = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); };
const qtyText = (v: number) => (v ? String(v) : "");

/** PCS at or above the pack size rolls into cartons (template normalise). */
function roll(l: Line, p: Product | undefined): { line: Line; add: number } {
  const k = pk(p), pcs = Math.round(num(l.pcs));
  if (!p || k <= 1 || pcs < k) return { line: l, add: 0 };
  const add = Math.floor(pcs / k);
  return { line: { ...l, ctn: String(Math.round(num(l.ctn)) + add), pcs: qtyText(pcs - add * k) }, add };
}

/**
 * Template app/wholesale/entry (4D-wholesale.html + 9H-wholesale.js mountEntry): keyboard-first wholesale billing.
 * CTN × pack + PCS per line, tier pricing per piece, buy-X-get-Y schemes as free lines, live credit gauge; Save posts a
 * WS invoice, Hold parks the bill, Recall brings a parked bill back.
 */
export function QuickEntryScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const [o, setO] = useState<WholesaleOptions | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [head, setHead] = useState<Head | null>(null);
  const [lines, setLines] = useState<Line[]>(() => [blank()]);
  const [heldBillId, setHeldBillId] = useState<string | null>(null);
  const [ext, setExt] = useState<Ext>(null);
  const [credit, setCredit] = useState<CustomerCredit | null>(null);
  const [creditTick, setCreditTick] = useState(0);
  const [stock, setStock] = useState<StockMap | null>(null);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [mode, setMode] = useState<"pcs" | "ctn">("pcs");
  const [busy, setBusy] = useState<null | "save" | "print" | "hold" | "recall" | "tpl">(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [ac, setAc] = useState<Ac>(null);
  const [sp, setSp] = useState<Sp>(null);
  const [shopQ, setShopQ] = useState("");
  const [menu, setMenu] = useState<MenuKind>(null);
  const [tpls, setTpls] = useState<OrderTemplate[] | null>(null);
  const [many, setMany] = useState(false);
  const [tplSheet, setTplSheet] = useState(false);
  const [tplErr, setTplErr] = useState("");
  const [block, setBlock] = useState<{ message: string; facts: CreditFacts } | null>(null);
  const [printing, setPrinting] = useState<Snapshot | null>(null);
  const [last, setLast] = useState<{ ref: WholesaleInvoiceRef; snap: Snapshot } | null>(null);
  const gridRef = useRef<HTMLTableSectionElement>(null);
  const shopRef = useRef<HTMLInputElement>(null);
  const keysRef = useRef<{ save: () => void; f2: () => void } | null>(null);

  // ---------------------------------------------------------------- loading
  const refreshHeld = useCallback(() => { listHeldBills().then(setHeld).catch(() => undefined); }, []);
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const x = await wholesaleOptions();
      setO(x);
      setHead((h) => h ?? {
        docDate: isoDay(new Date()), customerId: "", routeId: "", salesmanId: x.me.employeeId ?? "", warehouseId: x.warehouses[0]?.id ?? "", tier: x.tiers[0]?.code ?? "",
      });
      refreshHeld();
    } catch (e) {
      setLoadError(e instanceof ApiError ? e : new ApiError(0, "NETWORK", "Couldn't reach the server"));
    }
  }, [refreshHeld]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the data once
    void load();
  }, [load]);

  const customerId = head?.customerId ?? "";
  useEffect(() => {
    if (!customerId) return;
    let off = false;
    customerCredit(customerId).then((c) => { if (!off) setCredit(c); }).catch(() => { if (!off) setCredit(null); });
    return () => { off = true; };
  }, [customerId, creditTick]);
  const warehouseId = head?.warehouseId ?? "";
  useEffect(() => {
    if (!warehouseId) return;
    let off = false;
    warehouseStock(warehouseId).then((m) => { if (!off) setStock(m); }).catch(() => { if (!off) setStock(null); });
    return () => { off = true; };
  }, [warehouseId, creditTick]);

  // ---------------------------------------------------------------- derived
  const products = useMemo(() => new Map(o?.products.map((p) => [p.id, p]) ?? []), [o]);
  const tier = o?.tiers.find((t) => t.code === head?.tier);
  const factor = tier?.rateFactor ?? 1;
  const shop = o?.shops.find((s) => s.customerId === customerId);
  const route = o?.routes.find((r) => r.id === head?.routeId);

  const calc = useMemo(() => lines.map((l) => {
    const p = products.get(l.itemId);
    if (!p || !o) return { l, p, tp: 0, a: lineAmounts({ baseQty: 0, rate: 0, discountPct: 0, taxRate: 0 }), sch: null, free: 0, sv: 0 };
    const tp = Math.round(num(l.ctn)) * pk(p) + Math.round(num(l.pcs));
    const a = lineAmounts({ baseQty: tp, rate: l.rate, discountPct: Math.min(100, num(l.disc)), taxRate: Math.min(100, num(l.gst)) });
    const sch = schemeFor(o, p.id);
    const free = schemeFree(tp, sch);
    return { l, p, tp, a, sch, free, sv: r2(free * l.rate) };
  }), [lines, products, o]);
  const billed = calc.filter((c) => c.p && c.tp > 0);
  const T = billed.reduce((t, c) => ({
    items: t.items + 1, ctn: t.ctn + Math.round(num(c.l.ctn)), pcs: t.pcs + Math.round(num(c.l.pcs)), gross: t.gross + c.a.grossAmount, sv: t.sv + c.sv,
    disc: t.disc + c.a.discountAmount, gst: t.gst + c.a.taxAmount, net: t.net + c.a.totalAmount,
  }), { items: 0, ctn: 0, pcs: 0, gross: 0, sv: 0, disc: 0, gst: 0, net: 0 });
  const net = r2(T.net);

  // ---------------------------------------------------------------- line editing
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const clearErr = (key: number, f: Field) => setErrs((e) => (e[`L${key}.${f}`] ? { ...e, [`L${key}.${f}`]: "" } : e));
  const focusCell = (key: number, f: Field) => setTimeout(() => {
    const el = gridRef.current?.querySelector<HTMLInputElement>(`tr[data-k="${key}"] [data-f="${f}"]`);
    if (!el) return;
    el.focus();
    el.select();
    el.closest("tr")?.scrollIntoView({ block: "nearest" });
  }, 0);
  const addRow = (focus = true) => {
    const r = blank();
    setLines((x) => [...x, r]);
    if (focus) focusCell(r.key, "prod");
    return r;
  };
  const fresh = (p: Product, ctn: number, pcs: number, f = factor): Omit<Line, "key"> => ({
    itemId: p.id, q: null, ctn: qtyText(ctn), pcs: qtyText(pcs), rate: tierRate(p, f), rateText: null, manual: false, disc: "", gst: String(p.taxRate ?? 0),
  });
  const pickProduct = (key: number, p: Product) => {
    setAc(null);
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...fresh(p, 0, 0), ctn: l.ctn || (l.pcs ? "" : "1"), pcs: l.pcs, disc: l.disc } : l)));
    clearErr(key, "prod");
    if (stock && (stock[p.id] ?? 0) <= 0) toast(`${p.name} is out of stock in this warehouse`, { tone: "warn" });
    focusCell(key, "ctn");
  };
  const delLine = (key: number, focusField?: Field) => {
    const prev = lines;
    const idx = lines.findIndex((l) => l.key === key);
    const gone = lines[idx];
    const left = lines.filter((l) => l.key !== key);
    const next = left.length ? left : [blank()];
    setLines(next);
    const t = next[Math.min(idx, next.length - 1)];
    if (focusField && t) focusCell(t.key, focusField);
    const p = gone && products.get(gone.itemId);
    if (p) toast(`Removed ${p.name}`, { action: { label: "Undo", onClick: () => setLines(prev) } });
  };
  const dupLine = (key: number, f: Field) => {
    const l = lines.find((x) => x.key === key);
    const p = l && products.get(l.itemId);
    if (!l || !p) return;
    const n = { ...l, key: ++seq, q: null, rateText: null };
    setLines((ls) => { const i = ls.findIndex((x) => x.key === key); return [...ls.slice(0, i + 1), n, ...ls.slice(i + 1)]; });
    focusCell(n.key, f === "prod" ? "ctn" : f);
    toast(`Line duplicated · ${p.name}`, { tone: "info", ms: 1600 });
  };
  const rollLine = (l: Line) => {
    const p = products.get(l.itemId);
    const { line, add } = roll(l, p);
    if (!add || !p) return;
    setLine(l.key, { ctn: line.ctn, pcs: line.pcs });
    toast(`${add * pk(p) + Math.round(num(line.pcs))} pcs rolled into ${add} ctn + ${Math.round(num(line.pcs))} pcs (pack of ${pk(p)})`, { tone: "info", ms: 2200 });
  };
  /** Merge quantities into the bill: the same product adds up, else a blank row is reused or a row appended (template mergeLines). */
  const mergeLines = (rows: { itemId: string; ctn: number; pcs: number }[]) => {
    const valid = rows.filter((r) => products.has(r.itemId) && r.ctn + r.pcs > 0);
    setLines((ls) => {
      const next = [...ls];
      for (const r of valid) {
        const p = products.get(r.itemId)!;
        const i = next.findIndex((x) => x.itemId === r.itemId);
        if (i >= 0) next[i] = roll({ ...next[i]!, ctn: qtyText(Math.round(num(next[i]!.ctn)) + r.ctn), pcs: qtyText(Math.round(num(next[i]!.pcs)) + r.pcs) }, p).line;
        else {
          const b = next.findIndex((x) => !x.itemId);
          const line = roll({ key: b >= 0 ? next[b]!.key : ++seq, ...fresh(p, r.ctn, r.pcs) }, p).line;
          if (b >= 0) next[b] = line; else next.push(line);
        }
      }
      if (!next.some((x) => !x.itemId)) next.push(blank());
      return next;
    });
    return valid.length;
  };
  const reprice = (f: number) => setLines((ls) => ls.map((l) => {
    const p = products.get(l.itemId);
    return p && !l.manual ? { ...l, rate: tierRate(p, f), rateText: null } : l;
  }));
  const clearAll = () => {
    const prev = lines;
    const had = lines.filter((l) => l.itemId).length;
    if (!had) return;
    setLines([blank()]);
    toast(`Cleared ${had} line${had === 1 ? "" : "s"}`, { tone: "warn", action: { label: "Undo", onClick: () => setLines(prev) } });
  };

  // ---------------------------------------------------------------- shop / tier / route
  const pickShop = (s: Shop) => {
    if (!o || !head) return;
    setSp(null);
    setShopQ("");
    const r = o.routes.find((x) => x.id === s.routeId);
    const t = o.tiers.find((x) => x.code === s.priceTier) ?? o.tiers[0];
    if (s.customerId !== head.customerId) setCredit(null);
    setHead({
      ...head, customerId: s.customerId, routeId: r?.id ?? "", salesmanId: r?.salesman?.id ?? head.salesmanId,
      warehouseId: r?.warehouseId && o.warehouses.some((w) => w.id === r.warehouseId) ? r.warehouseId : (head.warehouseId || o.warehouses[0]?.id || ""), tier: t?.code ?? head.tier,
    });
    setExt(null);
    if (t && t.code !== head.tier) reprice(t.rateFactor);
    setErrs((e) => ({ ...e, customerId: "", warehouseId: "" }));
    toast(`${s.name} · ${t?.name ?? "tier"} rates applied`, { tone: "info", ms: 2000 });
    const b = lines.find((l) => !l.itemId) ?? lines[0];
    if (b) focusCell(b.key, "prod");
  };
  const setTier = (code: string) => {
    const t = o?.tiers.find((x) => x.code === code);
    if (!t || !head || code === head.tier) return;
    setHead({ ...head, tier: code });
    reprice(t.rateFactor);
    toast(`Price tier set to ${t.name} for this bill`, { tone: "info" });
  };
  const setRoute = (id: string) => {
    if (!o || !head) return;
    const r = o.routes.find((x) => x.id === id);
    setHead({ ...head, routeId: id, salesmanId: r?.salesman?.id ?? head.salesmanId, warehouseId: r?.warehouseId && o.warehouses.some((w) => w.id === r.warehouseId) ? r.warehouseId : head.warehouseId });
  };

  // ---------------------------------------------------------------- autocomplete
  const acList = useMemo(() => {
    if (!ac || !o) return [];
    const q = ac.q.trim().toLowerCase();
    return o.products.filter((p) => !q || `${p.name} ${p.sku}`.toLowerCase().includes(q)).slice(0, 8);
  }, [ac, o]);
  const spList = useMemo(() => {
    if (!sp || !o) return [];
    const q = sp.q.trim().toLowerCase();
    return o.shops.filter((s) => !q || `${s.name} ${s.code} ${s.area ?? ""} ${s.city ?? ""}`.toLowerCase().includes(q)).slice(0, 9);
  }, [sp, o]);
  const closeAc = useCallback(() => setAc(null), []);
  const closeSp = useCallback(() => setSp(null), []);
  const listKey = <T,>(e: ReactKeyboardEvent<HTMLInputElement>, st: { idx: number } | null, list: T[], move: (idx: number) => void, choose: (x: T) => void, close: () => void) => {
    if (!st) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.length) move((st.idx + 1) % list.length); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); if (list.length) move((st.idx - 1 + list.length) % list.length); return true; }
    if ((e.key === "Enter" || (e.key === "Tab" && !e.shiftKey && e.currentTarget.value.trim())) && list.length) { e.preventDefault(); choose(list[st.idx] ?? list[0]!); return true; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return true; }
    return false;
  };

  // ---------------------------------------------------------------- grid keyboard
  const cellKey = (e: ReactKeyboardEvent<HTMLInputElement>, l: Line, f: Field) => {
    if (f === "prod") {
      if (ac && ac.el === e.currentTarget && listKey(e, ac, acList, (idx) => setAc({ ...ac, idx }), (p) => pickProduct(l.key, p), closeAc)) return;
      if (e.key === "ArrowDown" && !e.ctrlKey) { e.preventDefault(); setAc({ el: e.currentTarget, key: l.key, q: "", idx: 0 }); return; }
      if (e.key === "Enter" && !l.itemId) { e.preventDefault(); setAc({ el: e.currentTarget, key: l.key, q: e.currentTarget.value, idx: 0 }); return; }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) { e.preventDefault(); dupLine(l.key, f); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "Delete") { e.preventDefault(); delLine(l.key, f); return; }
    const idx = lines.findIndex((x) => x.key === l.key);
    if (f !== "prod" && (e.key === "ArrowDown" || e.key === "ArrowUp") && !e.altKey) {
      e.preventDefault();
      const t = lines[idx + (e.key === "ArrowDown" ? 1 : -1)];
      if (t) focusCell(t.key, f);
      return;
    }
    if ((e.key === "Enter" && !e.ctrlKey && !e.altKey) || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      if (f === "prod" && !l.itemId) return;
      const k = FIELDS.indexOf(f);
      if (k < FIELDS.length - 1) { focusCell(l.key, FIELDS[k + 1]!); return; }
      const nx = lines[idx + 1];
      if (nx) focusCell(nx.key, "prod");
      else addRow();
    }
  };

  // ---------------------------------------------------------------- body / errors
  const bodyOf = () => {
    if (!head) return null;
    const keep = calc.filter((c) => c.p && c.tp > 0);
    const e: Record<string, string> = {};
    if (!head.customerId) e.customerId = "Choose a shop";
    if (!head.warehouseId) e.warehouseId = "Choose the warehouse";
    if (!head.docDate) e.docDate = "Enter the date";
    if (!head.tier) e.priceTier = "Choose the price tier";
    if (!keep.length) e.lines = "Add at least one line with a quantity";
    return {
      keep, errors: e,
      body: {
        customerId: head.customerId, docDate: head.docDate, routeId: head.routeId || null, salesmanEmployeeId: head.salesmanId || null, warehouseId: head.warehouseId,
        branchId: route?.branchId ?? null, priceTier: head.tier, remarks: null, heldBillId,
        lines: keep.map((c) => ({
          itemId: c.l.itemId, qtyCtn: Math.round(num(c.l.ctn)), qtyLoose: Math.round(num(c.l.pcs)), bonusQty: c.free, schemeId: c.free > 0 ? c.sch?.id ?? null : null,
          rate: r2(c.l.rate), isManualRate: c.l.manual, discountPct: Math.min(100, num(c.l.disc)), taxRate: Math.min(100, num(c.l.gst)),
        })),
      },
    };
  };
  const creditFacts = (): CreditFacts => ({
    shop: shop?.name ?? ext?.name ?? "This shop", limit: credit ? credit.effectiveLimit || credit.creditLimit : shop?.creditLimit ?? 0, balance: credit?.balance ?? 0, bill: net,
    overdue: credit?.overdueAmount ?? 0, onHold: credit?.status === "ON_HOLD" || !!credit?.holdReason, holdReason: credit?.holdReason ?? null,
  });
  const handleErr = (err: unknown, keep: typeof calc) => {
    if (!(err instanceof ApiError)) { toast("Something went wrong — try again", { tone: "danger" }); return; }
    if (err.details) {
      setErrs(Object.fromEntries(Object.entries(err.details).map(([k, v]) => {
        const m = /^lines\.(\d+)\.(\w+)$/.exec(k);
        const c = m ? keep[Number(m[1])] : undefined;
        return [c && m ? `L${c.l.key}.${SERVER_FIELD[m[2]!] ?? "prod"}` : k, v[0] ?? ""];
      })));
    }
    if (BLOCKED.has(err.code)) { setBlock({ message: err.message, facts: creditFacts() }); return; }
    toast(err.message, { tone: "danger", ms: err.code === "STOCK_INSUFFICIENT" ? 7000 : 4200 });
  };
  const resetBill = () => {
    setLines([blank()]);
    setHeldBillId(null);
    setErrs({});
    setCreditTick((t) => t + 1);
  };
  const snapshot = (docNo: string | null): Snapshot => {
    const emp = o?.employees.find((x) => x.id === head?.salesmanId);
    const terms = shop?.paymentTerms ?? "";
    const days = terms ? termDays(terms) : 0;
    const due = head?.docDate && days ? isoDay(new Date(new Date(`${head.docDate}T00:00:00`).getTime() + days * 86_400_000)) : null;
    const branch = o?.branches.find((b) => b.id === route?.branchId);
    const wh = o?.warehouses.find((w) => w.id === head?.warehouseId);
    return {
      docNo, date: head?.docDate ?? isoDay(new Date()), dueDate: due, terms: terms.replace(/_/g, " "), company: branch?.name ?? "Accountex", companySub: wh ? `Dispatched from ${wh.name}` : "",
      shop: { name: shop?.name ?? ext?.name ?? "—", code: shop?.code ?? ext?.code ?? "", area: [shop?.area, shop?.city].filter(Boolean).join(", "), phone: shop?.phone ?? "" },
      route: route ? `${route.code} ${route.name}` : "", tier: tier?.name ?? "", factor, salesman: emp?.name ?? "",
      lines: billed.map((c) => ({
        key: c.l.key, name: c.p!.name, sku: c.p!.sku, pack: pk(c.p), ctn: Math.round(num(c.l.ctn)), pcs: Math.round(num(c.l.pcs)), tp: c.tp, rate: c.l.rate,
        disc: Math.min(100, num(c.l.disc)), gst: c.a.taxAmount, net: c.a.totalAmount, free: c.free, scheme: c.sch && c.free ? c.sch.name : null,
      })),
      tot: { gross: r2(T.gross), sv: r2(T.sv), disc: r2(T.disc), gst: r2(T.gst), net },
    };
  };

  // ---------------------------------------------------------------- save / hold / recall
  const save = async (print: boolean) => {
    if (busy || !can.save) return;
    const b = bodyOf();
    if (!b) return;
    setErrs(b.errors);
    if (Object.keys(b.errors).length) { toast(Object.values(b.errors)[0]!, { tone: "warn" }); if (b.errors.customerId) shopRef.current?.focus(); return; }
    setBusy(print ? "print" : "save");
    const snap = snapshot(null);
    try {
      const ref = await saveWholesaleBill(b.body);
      const done = { ...snap, docNo: ref.docNo };
      setLast({ ref, snap: done });
      toast(`${ref.docNo} posted · ${ref.customer} · ${rs(ref.netAmount)}`, { tone: "good", ms: 8000, action: { label: "View invoice", onClick: () => router.push(`/sales/invoices/${ref.id}`) } });
      if (print) setPrinting(done);
      resetBill();
      setTimeout(() => gridRef.current?.querySelector<HTMLInputElement>("[data-f=prod]")?.focus(), 60);
    } catch (err) {
      handleErr(err, b.keep);
    } finally {
      setBusy(null);
    }
  };
  const hold = async (reason: "MANUAL" | "CREDIT_BLOCK") => {
    if (busy || !can.hold) return;
    const b = bodyOf();
    if (!b) return;
    if (!lines.some((l) => l.itemId)) { toast("Nothing to hold: the bill is empty", { tone: "warn" }); return; }
    setErrs(b.errors);
    if (Object.keys(b.errors).length) { toast(Object.values(b.errors)[0]!, { tone: "warn" }); return; }
    setBusy("hold");
    try {
      await holdBill({ ...b.body, holdReason: reason });
      setBlock(null);
      toast(reason === "CREDIT_BLOCK" ? "Bill held for credit clearance · recall it any time" : "Bill parked · recall it any time", { tone: "info" });
      resetBill();
    } catch (err) {
      setBlock(null);
      handleErr(err, b.keep);
    } finally {
      setBusy(null);
      refreshHeld();
    }
  };
  const recall = async (h: HeldBill) => {
    if (busy || !o || !head) return;
    setMenu(null);
    const b = bodyOf();
    const swap = lines.some((l) => l.itemId);
    if (swap && (!b || Object.keys(b.errors).length)) { toast("Finish or clear the current bill before recalling another", { tone: "warn" }); return; }
    setBusy("recall");
    try {
      if (swap && b) await holdBill({ ...b.body, holdReason: "MANUAL" });
      const x = await recallHeldBill(h.id);
      const s = o.shops.find((v) => v.customerId === x.customerId);
      setHead({
        ...head, customerId: x.customerId, routeId: x.routeId ?? "", salesmanId: x.salesmanEmployeeId ?? "", warehouseId: x.warehouseId ?? head.warehouseId,
        tier: o.tiers.some((t) => t.code === x.priceTier) ? x.priceTier : head.tier,
      });
      if (x.customerId !== head.customerId) setCredit(null);
      setExt(s ? null : { id: x.customer.id, name: x.customer.name, code: x.customer.code });
      setLines([...x.lines.map((l): Line => ({
        key: ++seq, itemId: l.item.id, q: null, ctn: qtyText(l.qtyCtn), pcs: qtyText(l.qtyLoose), rate: l.rate, rateText: null, manual: l.isManualRate,
        disc: l.discountPct ? String(l.discountPct) : "", gst: String(l.taxRate ?? 0),
      })), blank()]);
      setHeldBillId(x.id);
      setErrs({});
      toast(`Recalled bill for ${x.customer.name}${swap ? " · the previous bill was parked" : ""}`, { tone: "good" });
    } catch (err) {
      handleErr(err, b?.keep ?? []);
    } finally {
      setBusy(null);
      refreshHeld();
    }
  };
  const discard = async (h: HeldBill) => {
    setMenu(null);
    try {
      await discardHeldBill(h.id);
      toast(`Held bill for ${h.customer.name} discarded`, { tone: "warn" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't discard the held bill", { tone: "danger" });
    } finally {
      refreshHeld();
    }
  };
  const openTemplates = (el: HTMLElement) => {
    if (menu?.kind === "tpl") { setMenu(null); return; }
    setTpls(null);
    setMenu({ kind: "tpl", el });
    listTemplates(customerId || null).then(setTpls).catch((e) => { setMenu(null); toast(e instanceof ApiError ? e.message : "Couldn't load templates", { tone: "danger" }); });
  };
  const applyTemplate = (t: OrderTemplate) => {
    setMenu(null);
    const n = mergeLines(t.lines.map((l) => ({ itemId: l.item.id, ctn: l.qtyCtn, pcs: l.qtyLoose })));
    toast(n ? `Template “${t.name}” applied · ${n} line${n === 1 ? "" : "s"}` : `Template “${t.name}” has no active products`, { tone: n ? "good" : "warn" });
  };
  const saveTemplate = async (v: { name: string; forShop: boolean; isShared: boolean }) => {
    if (v.name.length < 2) { setTplErr("Name the template"); return; }
    setBusy("tpl");
    try {
      await createTemplate({
        name: v.name, customerId: v.forShop ? customerId || null : null, isShared: v.isShared,
        lines: billed.map((c) => ({ itemId: c.l.itemId, qtyCtn: Math.round(num(c.l.ctn)), qtyLoose: Math.round(num(c.l.pcs)) })),
      });
      setTplSheet(false);
      toast(`Template “${v.name}” saved`, { tone: "good" });
    } catch (err) {
      if (err instanceof ApiError) setTplErr(err.details?.name?.[0] ?? err.message);
      else setTplErr("Something went wrong — try again");
    } finally {
      setBusy(null);
    }
  };

  // ---------------------------------------------------------------- section keys (Alt+S save, F2 product search, F3 shop search)
  useEffect(() => {
    keysRef.current = {
      save: () => void save(false),
      f2: () => {
        const tr = (document.activeElement as HTMLElement | null)?.closest?.("tr.ws2-line") as HTMLElement | null;
        const key = tr ? Number(tr.dataset.k) : lines.find((l) => !l.itemId)?.key;
        if (!key) { addRow(); return; }
        const inp = gridRef.current?.querySelector<HTMLInputElement>(`tr[data-k="${key}"] [data-f=prod]`);
        if (!inp) return;
        inp.focus(); inp.select();
        setAc({ el: inp, key, q: "", idx: 0 });
        inp.closest("tr")?.scrollIntoView({ block: "nearest" });
      },
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (document.querySelector(".overlay.open")) return;
      if (e.altKey && (e.key === "s" || e.key === "S")) { e.preventDefault(); keysRef.current?.save(); }
      else if (e.key === "F2") { e.preventDefault(); keysRef.current?.f2(); }
      else if (e.key === "F3") { e.preventDefault(); shopRef.current?.focus(); }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, []);

  // ---------------------------------------------------------------- states
  if (loadError) return <ErrorState message={loadError.message} reference={loadError.correlationId} onRetry={() => void load()} />;
  if (!o || !head) return <EntrySkeleton />;
  if (!o.routes.length || !o.shops.length) {
    return (
      <>
        <PageTop can={can} busy={null} onSave={() => undefined} disabled />
        <div className="panel">
          <EmptyState icon={<Route />} title={o.routes.length ? "No shops on a route yet" : "No routes yet"}
            description="Quick wholesale entry bills shops that belong to a route. Set up routes and assign shops to them first."
            action={<Link className="btn primary" href="/wholesale/routes"><Route />Set up routes</Link>} />
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------- credit gauge
  const limit = credit ? credit.effectiveLimit || credit.creditLimit : 0;
  const bal = credit?.balance ?? 0;
  const onHold = credit?.status === "ON_HOLD" || !!credit?.holdReason;
  const used = bal + net;
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const over = onHold || (limit > 0 && used > limit);
  const warn = !over && pct > 80;
  const pb = limit > 0 ? Math.min(100, (bal / limit) * 100) : 0;
  const pn = limit > 0 ? Math.max(0, Math.min(100 - pb, (net / limit) * 100)) : 0;
  const na = !customerId || !credit;
  const od = credit?.overdueAmount ?? 0;
  const lineErr = (key: number, f: Field) => errs[`L${key}.${f}`] || "";
  const shopName = shop?.name ?? ext?.name ?? null;
  const filled = lines.filter((l) => l.itemId).length;

  return (
    <>
      <PageTop can={can} busy={busy} onSave={(p) => void save(p)} />

      <div className="ws2-refs">
        <div className="ws2-ref"><span><FileText /></span><div>
          <small>Invoice No</small>
          <b className="ws2-auto" title="The invoice number is assigned when the bill is saved">WS-… on save</b>
          {last && <small className="ws2-last">Last <Link href={`/sales/invoices/${last.ref.id}`}>{last.ref.docNo}</Link><button type="button" title="Print last invoice" aria-label="Print last invoice" onClick={() => setPrinting(last.snap)}><Printer /></button></small>}
        </div></div>
        <div className="ws2-ref"><span><CalendarDays /></span><div><small>Date</small>
          <input type="date" className={cn("cell-input ws2-ref-in", errs.docDate && "ws2-bad-in")} value={head.docDate} aria-label="Invoice date" title={errs.docDate || undefined} onChange={(e) => setHead({ ...head, docDate: e.target.value })} />
        </div></div>
        <div className="ws2-ref"><span><Route /></span><div><small>Route</small>
          <select className="cell-input ws2-ref-in" value={head.routeId} aria-label="Route" onChange={(e) => setRoute(e.target.value)}>
            <option value="">No route</option>
            {o.routes.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
          </select>
        </div></div>
        <div className="ws2-ref"><span><UserRound /></span><div><small>Salesman / Booker</small>
          <select className="cell-input ws2-ref-in" value={head.salesmanId} aria-label="Salesman" onChange={(e) => setHead({ ...head, salesmanId: e.target.value })}>
            <option value="">—</option>
            {o.employees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div></div>
        <div className="ws2-ref"><span><Warehouse /></span><div><small>Warehouse</small>
          <select className={cn("cell-input ws2-ref-in", errs.warehouseId && "ws2-bad-in")} value={head.warehouseId} aria-label="Warehouse" title={errs.warehouseId || undefined}
            onChange={(e) => { setStock(null); setHead({ ...head, warehouseId: e.target.value }); setErrs((x) => ({ ...x, warehouseId: "" })); }}>
            <option value="">Choose…</option>
            {o.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div></div>
      </div>

      <div className="panel ws2-cust">
        <div className="ws2-cust-l">
          <label className={cn("ws2-find ws2-shopfind", errs.customerId && "ws2-bad-in")}>
            <Store />
            <input ref={shopRef} className="cell-input" value={shopQ} placeholder={shopName ? `${shopName} · search another shop…` : "Search shop by name, code or area…"} autoComplete="off" aria-label="Search shop"
              onChange={(e) => { setShopQ(e.target.value); setSp({ el: e.currentTarget, q: e.target.value, idx: 0 }); }}
              onFocus={(e) => setSp({ el: e.currentTarget, q: shopQ, idx: 0 })}
              onBlur={() => setTimeout(() => setSp(null), 140)}
              onKeyDown={(e) => {
                if (sp && listKey(e, sp, spList, (idx) => setSp({ ...sp, idx }), pickShop, closeSp)) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setSp({ el: e.currentTarget, q: shopQ, idx: 0 }); }
              }} />
            <kbd className="kbd">F3</kbd>
          </label>
          {errs.customerId && <small className="ws2-err">{errs.customerId}</small>}
          {shopName ? (
            <div className="ws2-shopcard">
              <span className="avatar lg">{initials(shopName)}</span>
              <div className="ws2-sc-main">
                <b>{shopName}</b>
                <small>{[shop?.code ?? ext?.code, shop?.area ?? shop?.city, route ? `${route.code} ${route.name}` : null].filter(Boolean).join(" · ")}</small>
                {shop?.phone && <small><Phone />{shop.phone}</small>}
              </div>
              {heldBillId && <span className="ws2-hold-tag" title="Saving this bill closes the held bill"><FileClock />Recalled</span>}
              <button type="button" className="ws2-tierbtn" title="Price tier: rates follow the shop category" onClick={(e) => setMenu(menu?.kind === "tier" ? null : { kind: "tier", el: e.currentTarget })}>
                <TierChip tier={tier} /><ChevronDown />
              </button>
            </div>
          ) : (
            <div className="ws2-shopcard-empty"><span className="avatar lg"><Store /></span><span>No shop selected · press <kbd className="kbd">F3</kbd> to search</span></div>
          )}
        </div>
        <div className={cn("ws2-credit", na && "ws2-na", warn && "warn", over && !na && "over")}>
          <div className="ws2-credit-top">
            <div className="ws2-cm"><small>Credit limit</small><b>{na ? "—" : limit > 0 ? rs(limit) : "None"}</b></div>
            <div className="ws2-cm"><small>Outstanding</small><b>{na ? "—" : rs(bal)}</b></div>
            <div className="ws2-cm"><small>This bill</small><b>{rs(net)}</b></div>
            <div className="ws2-cm ws2-cm-av"><small>Available</small><b>{na ? "—" : limit > 0 ? rs(limit - used) : "—"}</b></div>
            <div className="ws2-cm"><small>Overdue</small><b className={cn(od > 0 && "bad")}>{na ? "—" : od > 0 ? rs(od) : <span className="ws2-zero">None</span>}</b></div>
          </div>
          <div className="ws2-cbar"><i className="ws2-cb-bal" style={{ width: `${pb}%` }} /><i className="ws2-cb-bill" style={{ left: `${pb}%`, width: `${pn}%` }} /></div>
          <div className="ws2-credit-foot">
            <span className="ws2-cstate">
              {na ? <>{customerId ? "Loading credit…" : "Choose a shop"}</>
                : onHold ? <><ShieldAlert />On hold · blocked</>
                : over ? <><ShieldAlert />{credit?.blockOverLimit ? "Over limit · blocked" : "Over limit"}</>
                : warn ? <><TriangleAlert />Near limit</>
                : limit > 0 ? <><ShieldCheck />Within limit</> : <><ShieldCheck />No credit limit</>}
            </span>
            {!na && (
              <small>
                {onHold ? <>On hold{credit?.holdReason ? ` · ${credit.holdReason}` : ""}</>
                  : limit > 0 ? <>{Math.round(pct)}% of limit used{used > limit && <> · over by <b>{rs(used - limit)}</b></>}</>
                  : "No credit limit on file"}
              </small>
            )}
          </div>
        </div>
      </div>

      <div className="panel ws2-gridcard">
        <div className="ws2-gc-head">
          <span className="ws2-card-ic"><Boxes /></span>
          <div className="ws2-gc-t"><h3>Bill lines</h3><p>{errs.lines ? <span className="ws2-bad">{errs.lines}</span> : "CTN × pack + PCS = total pieces. Schemes add free lines automatically."}</p></div>
          <div className="ws2-tools">
            <button type="button" className="btn secondary sm" onClick={() => setMany(true)}><ListChecks />Add many</button>
            {can.templates && <button type="button" className="btn secondary sm" onClick={(e) => openTemplates(e.currentTarget)}><LayoutTemplate />Templates<ChevronDown /></button>}
            {can.hold && <>
              <span className="ws2-vsep" />
              <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => void hold("MANUAL")}><Pause />{busy === "hold" ? "Holding…" : "Hold"}</button>
              <button type="button" className="btn ghost sm" disabled={!!busy} onClick={(e) => { if (!held.length) { toast("No parked bills", { tone: "info" }); return; } setMenu(menu?.kind === "recall" ? null : { kind: "recall", el: e.currentTarget }); }}>
                <Inbox />{busy === "recall" ? "Recalling…" : "Recall"} <em className="ws2-count">{held.length}</em>
              </button>
            </>}
          </div>
        </div>
        <div className="ws2-gwrap">
          <table className="tbl ws2-grid" data-plain>
            <thead><tr>
              <th className="ws2-c-idx">#</th>
              <th className="ws2-c-prod">SKU / Product <i className="ws2-req">*</i></th>
              <th className="num ws2-c-q">CTN</th>
              <th className="num ws2-c-q">PCS</th>
              <th className="num ws2-c-tp">Total Pcs</th>
              <th className="num ws2-c-rate"><div className="ws2-rate-h"><span>Rate</span><span className="ws2-mini-seg">
                {(["ctn", "pcs"] as const).map((m) => <button key={m} type="button" className={cn(mode === m && "on")} onClick={() => { if (mode === m) return; setMode(m); setLines((ls) => ls.map((l) => ({ ...l, rateText: null }))); toast(`Rates now entered per ${m === "ctn" ? "carton" : "piece"}`, { tone: "info", ms: 1600 }); }}>{m.toUpperCase()}</button>)}
              </span></div></th>
              <th className="ws2-c-sch">Scheme</th>
              <th className="num ws2-c-d">Disc %</th>
              <th className="num ws2-c-d">GST %</th>
              <th className="num ws2-c-amt">Amount</th>
              <th className="ws2-c-del" />
            </tr></thead>
            <tbody ref={gridRef}>
              {calc.map(({ l, p, tp, a, sch, free }, i) => {
                const have = p && stock ? stock[p.id] ?? 0 : null;
                const need = tp + free;
                const short = have !== null && need > have;
                const rateShown = l.rateText ?? (p ? (mode === "ctn" ? l.rate * pk(p) : l.rate).toFixed(2) : "");
                return (
                  <Fragment key={l.key}>
                    <tr className="ws2-line" data-k={l.key}>
                      <td className="ws2-c-idx">{i + 1}</td>
                      <td className="ws2-c-prod">
                        <div className="ws2-prod">
                          <input className={cn("cell-input", lineErr(l.key, "prod") && "ws2-bad-in")} data-f="prod" value={l.q ?? p?.name ?? ""} placeholder="SKU or name…" autoComplete="off" aria-label={`Product line ${i + 1}`}
                            title={lineErr(l.key, "prod") || undefined}
                            onChange={(e) => { setLine(l.key, { q: e.target.value }); setAc({ el: e.currentTarget, key: l.key, q: e.target.value, idx: 0 }); }}
                            onFocus={(e) => e.currentTarget.select()}
                            onBlur={() => setTimeout(() => { setAc((x) => (x?.key === l.key ? null : x)); setLine(l.key, { q: null }); }, 140)}
                            onKeyDown={(e) => cellKey(e, l, "prod")} />
                          <button type="button" className="ws2-prod-dd" tabIndex={-1} aria-label="Browse products"
                            onMouseDown={(e) => { e.preventDefault(); const inp = e.currentTarget.parentElement?.querySelector("input"); if (inp) { inp.focus(); setAc({ el: inp, key: l.key, q: "", idx: 0 }); } }}><ChevronDown /></button>
                        </div>
                        <div className="ws2-meta">
                          {p ? <>
                            <code>{p.sku}</code><span className="ws2-pk">Ctn {pk(p)}</span>
                            {have !== null && <span className={cn("ws2-stock", short && "bad")} title={`${grp(have, 0)} pcs available`}>{short ? <TriangleAlert /> : <Box />}{short ? `Short ${qtyStr(p, need - have)}` : qtyStr(p, have)}</span>}
                            {l.manual && <span className="ws2-manual" title="Rate edited by hand">Manual rate</span>}
                          </> : <span className="ws2-meta-empty">Type to search · <kbd className="kbd">↓</kbd> browse</span>}
                        </div>
                      </td>
                      <td><input className={cn("cell-input num", lineErr(l.key, "ctn") && "ws2-bad-in")} data-f="ctn" inputMode="numeric" value={l.ctn} placeholder="0" aria-label="Cartons" title={lineErr(l.key, "ctn") || undefined}
                        onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setLine(l.key, { ctn: e.target.value.replace(/[^\d]/g, "") }); clearErr(l.key, "ctn"); }} onKeyDown={(e) => cellKey(e, l, "ctn")} /></td>
                      <td><input className={cn("cell-input num", lineErr(l.key, "pcs") && "ws2-bad-in")} data-f="pcs" inputMode="numeric" value={l.pcs} placeholder="0" aria-label="Pieces" title={lineErr(l.key, "pcs") || undefined}
                        onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setLine(l.key, { pcs: e.target.value.replace(/[^\d]/g, "") }); clearErr(l.key, "pcs"); }} onBlur={() => rollLine(l)} onKeyDown={(e) => cellKey(e, l, "pcs")} /></td>
                      <td className="num ws2-out ws2-tp">{tp ? grp(tp, 0) : "—"}</td>
                      <td><input className={cn("cell-input num", l.manual && "ws2-manual-in", lineErr(l.key, "rate") && "ws2-bad-in")} data-f="rate" inputMode="decimal" value={rateShown} aria-label={mode === "ctn" ? "Rate per carton" : "Rate per piece"} disabled={!p}
                        title={lineErr(l.key, "rate") || undefined} onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => { const v = num(e.target.value); setLine(l.key, { rateText: e.target.value, rate: p ? (mode === "ctn" ? v / pk(p) : v) : 0, manual: true }); clearErr(l.key, "rate"); }}
                        onBlur={() => setLine(l.key, { rateText: null })} onKeyDown={(e) => cellKey(e, l, "rate")} /></td>
                      <td data-o="sch">{sch && p ? <span className={cn("ws2-sch", free > 0 && "on")} title={`${sch.name}: buy ${sch.buyQty} get ${sch.freeQty} free`}><Gift />{schemeLabel(sch)}</span> : <span className="ws2-dash">—</span>}</td>
                      <td><input className={cn("cell-input num", lineErr(l.key, "disc") && "ws2-bad-in")} data-f="disc" inputMode="decimal" value={l.disc} placeholder="0" aria-label="Discount percent" title={lineErr(l.key, "disc") || undefined}
                        onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setLine(l.key, { disc: e.target.value }); clearErr(l.key, "disc"); }} onKeyDown={(e) => cellKey(e, l, "disc")} /></td>
                      <td><input className={cn("cell-input num", lineErr(l.key, "gst") && "ws2-bad-in")} data-f="gst" inputMode="decimal" value={l.gst} placeholder="0" aria-label="GST percent" title={lineErr(l.key, "gst") || undefined}
                        onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setLine(l.key, { gst: e.target.value }); clearErr(l.key, "gst"); }} onKeyDown={(e) => cellKey(e, l, "gst")} /></td>
                      <td className="num ws2-out ws2-strong">{grp(a.totalAmount)}</td>
                      <td className="ws2-c-del"><button type="button" className="ws2-del" tabIndex={-1} aria-label="Delete line" onClick={() => delLine(l.key)}><Trash2 /></button></td>
                    </tr>
                    {p && free > 0 && sch && (
                      <tr className="ws2-free ws2-free-in">
                        <td className="ws2-c-idx"><CornerDownRight /></td>
                        <td className="ws2-c-prod"><div className="ws2-free-n"><span className="ws2-gift"><Gift /></span><b>{p.name}</b><span className="ws2-free-tag">Free</span></div></td>
                        <td className="num">{Math.floor(free / pk(p)) || "—"}</td>
                        <td className="num">{free % pk(p) || "—"}</td>
                        <td className="num ws2-out">{grp(free, 0)}</td>
                        <td className="num ws2-out">0.00</td>
                        <td><span className="ws2-sch on sm" title={sch.name}>{schemeLabel(sch)}</span></td>
                        <td className="num ws2-out">—</td>
                        <td className="num ws2-out">—</td>
                        <td className="num ws2-out">0.00</td>
                        <td />
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ws2-gfoot">
          <button type="button" className="btn secondary sm ws2-addrow" onClick={() => addRow()}><Plus />Add row</button>
          <button type="button" className="ws2-linkbtn" onClick={clearAll}><Trash2 />Clear all</button>
          <span className="spacer" />
          <span className="ws2-keys"><kbd className="kbd">Enter</kbd> next <kbd className="kbd">F2</kbd> search <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">D</kbd> duplicate <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Del</kbd> delete{can.save && <> <kbd className="kbd">Alt</kbd>+<kbd className="kbd">S</kbd> save</>}</span>
        </div>
      </div>

      <div className="ws2-totbar">
        <div><small>Items</small><b>{T.items}</b></div>
        <div><small>CTN</small><b>{grp(T.ctn, 0)}</b></div>
        <div><small>PCS</small><b>{grp(T.pcs, 0)}</b></div>
        <div><small>Gross</small><b><Dec v={T.gross} /></b></div>
        <div className="ws2-t-sch"><small><Gift />Scheme value</small><b><Dec v={T.sv} /></b></div>
        <div><small>Discount</small><b><Dec v={T.disc} /></b></div>
        <div><small>GST</small><b><Dec v={T.gst} /></b></div>
        <div className="ws2-net"><small>Net payable</small><b>Rs <Dec v={net} /></b></div>
      </div>

      {ac && (
        <FloatPop anchor={ac.el} minW={560} className="ws2-ac" onClose={closeAc}>
          <div className="ws2-pop-h"><span>Products · {tier?.name ?? ""} rates</span><small><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> move <kbd className="kbd">Enter</kbd> pick <kbd className="kbd">Esc</kbd> close</small></div>
          {acList.length ? acList.map((p, i) => {
            const have = stock ? stock[p.id] ?? 0 : null;
            const rt = tierRate(p, factor);
            const s = schemeFor(o, p.id);
            return (
              <div key={p.id} data-i={i} className={cn("ws2-ac-row", i === ac.idx && "on")} onMouseEnter={() => setAc({ ...ac, idx: i })} onClick={() => pickProduct(ac.key, p)}>
                <span className="icon-well sm"><Package /></span>
                <div className="ws2-ac-main"><b><Hl text={p.name} q={ac.q.trim()} /></b><small><Hl text={p.sku} q={ac.q.trim()} /> · Ctn {pk(p)}{s && <> · <span className="ws2-sch sm"><Gift />{schemeLabel(s)}</span></>}</small></div>
                {have !== null && <span className={cn("ws2-ac-stock", have <= 0 && "out", have > 0 && have < pk(p) && "low")}>{have <= 0 ? "Out of stock" : qtyStr(p, have)}</span>}
                <div className="ws2-ac-price"><b>Rs {grp(rt)}<small>/pc</small></b><small>Rs {grp(rt * pk(p), 0)} /ctn</small></div>
              </div>
            );
          }) : <div className="ws2-pop-empty">No product matches “{ac.q.trim()}”.</div>}
        </FloatPop>
      )}

      {sp && (
        <FloatPop anchor={sp.el} minW={460} className="ws2-shoppop" onClose={closeSp}>
          <div className="ws2-pop-h"><span>Shops</span><small>{o.shops.length} on {o.routes.length} route{o.routes.length === 1 ? "" : "s"}</small></div>
          {spList.length ? spList.map((s, i) => {
            const r = o.routes.find((x) => x.id === s.routeId);
            const t = o.tiers.find((x) => x.code === s.priceTier);
            const mine = s.customerId === customerId && credit;
            const lim = mine ? limit : s.creditLimit;
            const p = mine && lim > 0 ? Math.min(100, (bal / lim) * 100) : 0;
            return (
              <div key={s.customerId} data-i={i} className={cn("ws2-sp-row", i === sp.idx && "on")} onMouseEnter={() => setSp({ ...sp, idx: i })} onClick={() => pickShop(s)}>
                <span className="avatar sm">{initials(s.name)}</span>
                <div className="ws2-ac-main"><b><Hl text={s.name} q={sp.q.trim()} /></b><small><Hl text={s.code} q={sp.q.trim()} />{s.area ? ` · ${s.area}` : ""}{r ? ` · ${r.code}` : ""}</small></div>
                <TierChip tier={t} />
                <div className={cn("ws2-sp-cr", s.status === "ON_HOLD" && "over", p > 100 ? "over" : p > 80 ? "warn" : "")}>
                  <small>{s.status === "ON_HOLD" ? "On hold" : lim > 0 ? `Limit ${grp(lim / 1000, 0)}k` : "No limit"}</small>
                  <i style={{ "--p": `${p}%` } as CSSProperties} />
                </div>
              </div>
            );
          }) : <div className="ws2-pop-empty">No shop matches “{sp.q.trim()}”.</div>}
        </FloatPop>
      )}

      {menu?.kind === "tier" && (
        <RichMenu anchor={menu.el} onClose={() => setMenu(null)}>
          {o.tiers.map((t) => (
            <button key={t.code} type="button" role="menuitem" onClick={() => { setMenu(null); setTier(t.code); }}>
              {t.code === head.tier ? <Check /> : <Tag />}{t.name} <small className="ws2-muted">×{t.rateFactor.toFixed(2)}</small>
            </button>
          ))}
        </RichMenu>
      )}
      {menu?.kind === "recall" && (
        <RichMenu anchor={menu.el} onClose={() => setMenu(null)}>
          {held.length ? held.map((h) => (
            <div key={h.id} className="ws2-mrow">
              <button type="button" role="menuitem" disabled={!!busy} onClick={() => void recall(h)}>
                <FileClock /><span className="ws2-mi"><b>{h.customer.name}</b><small>{h.lineCount} line{h.lineCount === 1 ? "" : "s"} · {rs(h.netAmount)} · parked {hhmm(h.heldAt)}{h.holdReason === "CREDIT_BLOCK" ? " · credit block" : ""}</small></span>
              </button>
              {can.discard && <button type="button" className="ws2-mdel" title="Discard held bill" aria-label={`Discard held bill for ${h.customer.name}`} onClick={() => void discard(h)}><Trash2 /></button>}
            </div>
          )) : <div className="ws2-menu-empty">No parked bills</div>}
        </RichMenu>
      )}
      {menu?.kind === "tpl" && (
        <RichMenu anchor={menu.el} onClose={() => setMenu(null)}>
          {tpls === null ? <div className="ws2-menu-empty">Loading templates…</div>
            : tpls.length ? tpls.map((t) => (
              <button key={t.id} type="button" role="menuitem" onClick={() => applyTemplate(t)}>
                <Bookmark /><span className="ws2-mi"><b>{t.name}</b><small>{t.lines.length} line{t.lines.length === 1 ? "" : "s"} · {t.lines.reduce((s, x) => s + x.qtyCtn, 0)} ctn{t.customer ? ` · ${t.customer.name}` : ""}</small></span>
              </button>
            )) : <div className="ws2-menu-empty">No templates yet{shopName ? ` for ${shopName}` : ""}</div>}
          <hr />
          <button type="button" role="menuitem" onClick={() => {
            setMenu(null);
            if (!billed.length) { toast("Add lines first, then save them as a template", { tone: "warn" }); return; }
            setTplErr("");
            setTplSheet(true);
          }}><BookmarkPlus />Save current as template…</button>
        </RichMenu>
      )}

      <AddManyModal open={many} o={o} factor={factor} tierName={tier?.name ?? ""} stock={stock} onClose={() => setMany(false)}
        onAdd={(rows) => { setMany(false); const n = mergeLines(rows); toast(`Added ${n} item${n === 1 ? "" : "s"} to the bill`, { tone: "good" }); }} />

      {tplSheet && (
        <TemplateSheet count={billed.length} shopName={shopName} busy={busy === "tpl"} error={tplErr} onClose={() => setTplSheet(false)} onSave={(v) => void saveTemplate(v)}
          chips={billed.map((c) => ({ key: c.l.key, name: c.p!.name, ctn: Math.round(num(c.l.ctn)), pcs: Math.round(num(c.l.pcs)) }))} />
      )}

      {block && (
        <CreditModal facts={block.facts} message={block.message} canHold={can.hold && filled > 0} holding={busy === "hold"} onHold={() => void hold("CREDIT_BLOCK")} onClose={() => setBlock(null)} />
      )}

      <Drawer open={!!printing} onClose={() => setPrinting(null)} title="Print preview" subtitle={printing ? `${printing.docNo ?? "Unsaved bill"} · A4 portrait` : undefined} wide className="ws2-print-drawer"
        foot={<><Button onClick={() => setPrinting(null)}>Close</Button><Button variant="primary" icon={<Printer />} onClick={() => window.print()}>Print</Button></>}>
        {printing && <PrintPaper s={printing} dateLabel={(d) => dateLabel(d)} />}
      </Drawer>
    </>
  );
}

/** Template page head with WhatsApp (not wired yet), Save & Print and Save (Alt+S). */
function PageTop({ can, busy, onSave, disabled }: { can: Can; busy: string | null; onSave: (print: boolean) => void; disabled?: boolean }) {
  return (
    <div className="ws2-head">
      <span className="ws2-head-ic"><Zap /></span>
      <div className="ws2-head-t">
        <div className="eyebrow">Wholesale / Bulk entry</div>
        <h1>Quick Wholesale Entry <span className="badge info"><Keyboard />Keyboard-first</span></h1>
        <p>Carton + piece entry with tier pricing, live schemes and credit control. Built for 40-line bills in under a minute.</p>
      </div>
      <div className="ws2-head-btns">
        <button type="button" className="btn secondary" disabled title="Sharing invoices on WhatsApp arrives in a later phase"><MessageCircle />WhatsApp</button>
        {can.save && <>
          <button type="button" className={cn("btn secondary ws2-progress-btn", busy === "print" && "ws2-busy")} disabled={disabled || !!busy} onClick={() => onSave(true)} style={{ "--ws2-ms": "2s" } as CSSProperties}>
            <Printer /><span>{busy === "print" ? "Saving…" : "Save & Print"}</span><em />
          </button>
          <button type="button" className={cn("btn primary ws2-progress-btn", busy === "save" && "ws2-busy")} disabled={disabled || !!busy} onClick={() => onSave(false)} style={{ "--ws2-ms": "2s" } as CSSProperties}>
            <Check /><span>{busy === "save" ? "Saving…" : "Save"}</span><kbd className="ws2-kbd-in">Alt S</kbd><em />
          </button>
        </>}
      </div>
    </div>
  );
}

function Dec({ v }: { v: number }) {
  const [i, d] = grp(v).split(".");
  return <>{v < 0 ? "−" : ""}{i}<span className="dec">.{d}</span></>;
}

function EntrySkeleton() {
  return (
    <div aria-busy>
      <Skeleton style={{ height: 64, marginBottom: 18 }} />
      <Skeleton style={{ height: 64, marginBottom: 14 }} />
      <Skeleton style={{ height: 120, marginBottom: 14 }} />
      <Skeleton style={{ height: 320, marginBottom: 14 }} />
      <Skeleton style={{ height: 64 }} />
    </div>
  );
}
