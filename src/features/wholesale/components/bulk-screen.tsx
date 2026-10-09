"use client";

import {
  BadgeCheck, Calendar, Check, CircleDashed, Columns3, Copy, Eraser, Files, Grid3x3, Info, MousePointerClick, Package, ReceiptText, Route as RouteIcon,
  ShieldAlert, ShieldCheck, Smartphone, Sparkles, TriangleAlert, Truck, UserRound, Warehouse, Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { tierRate, type BulkRun, type BulkRunList, type StockMap, type WholesaleOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, isoDay, Money } from "@/features/finance/components/finance-ui";
import { customerCredit } from "@/features/sales/api";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createBulkRun, generateBulkRun, getBulkRun, listBulkRuns, previewBulkRun, warehouseStock, wholesaleOptions } from "../api";

export type BulkCan = { create: boolean; post: boolean };
type Shop = WholesaleOptions["shops"][number];
type Product = WholesaleOptions["products"][number];
type Mode = "MATRIX" | "SAME";
type Credit = { balance: number; limit: number; block: boolean; hold: boolean };
type Order = { shop: Shop; lines: { itemId: string; ctn: number }[]; amt: number; ctn: number; over: boolean };
type Gen = { run: BulkRun; phase: "preview" | "posting" | "done" };

const DEFAULT_COLS = 8;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const digits = (v: string) => Number(v.replace(/\D/g, "").slice(0, 3)) || 0;
const initials = (n: string) => n.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const dayShort = (d: string) => d.charAt(0) + d.slice(1, 3).toLowerCase();
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const vars = (o: Record<string, string | number>) => o as CSSProperties;

/** Over the limit the server enforces: the shop is on hold, or its limit blocks and balance + bill exceeds it. */
const overLimit = (c: Credit | undefined, amt: number) => !!c && (c.hold || (c.block && c.limit > 0 && c.balance + amt > c.limit));

/** Template crIcon(): green within limit, amber past 80 %, red over the limit (skipped on Generate). */
function CreditIcon({ c, amt }: { c: Credit; amt: number }) {
  if (c.hold) return <span className="ws2-cri bad" title="Customer on credit hold · will be skipped"><ShieldAlert /></span>;
  if (c.limit <= 0) return <span className="ws2-cri ok" title="No credit limit"><ShieldCheck /></span>;
  const used = c.balance + amt, pct = used / c.limit;
  if (pct > 1) return <span className="ws2-cri bad" title={`Over limit by Rs ${fmt(used - c.limit)}${c.block ? " · will be skipped" : ""}`}><ShieldAlert /></span>;
  if (pct > 0.8) return <span className="ws2-cri warn" title={`${Math.round(pct * 100)}% of limit used`}><TriangleAlert /></span>;
  return <span className="ws2-cri ok" title="Within limit"><ShieldCheck /></span>;
}

/**
 * Template app/wholesale/bulk (4D-wholesale.html, 9H-wholesale.js mountBulk): bill a whole route in one pass, either a
 * shops × products carton matrix or the same items to many shops. Generate saves a draft run, previews credit and stock
 * per shop, then posts one wholesale invoice per shop (over-limit / short shops are skipped). Additions: a product-column
 * picker (the route's usual products aren't known), a warehouse picker when the route has none, and the recent runs list.
 */
export function BulkScreen({ can }: { can: BulkCan }) {
  const toast = useToast();
  const [opt, setOpt] = useState<WholesaleOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [routeId, setRouteId] = useState("");
  const [docDate, setDocDate] = useState(() => isoDay(new Date()));
  const [whPick, setWhPick] = useState("");
  const [mode, setMode] = useState<Mode>("MATRIX");
  const [swap, setSwap] = useState(0);
  const [cols, setCols] = useState<string[] | null>(null);
  const [q, setQ] = useState<Record<string, Record<string, number>>>({});
  const [sameItems, setSameItems] = useState<Record<string, number>>({});
  const [sameShops, setSameShops] = useState<string[]>([]);
  const [credit, setCredit] = useState<Record<string, Credit>>({});
  const [creditTick, setCreditTick] = useState(0);
  const [stock, setStock] = useState<{ wh: string; map: StockMap } | null>(null);
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const [colOpen, setColOpen] = useState(false);
  const [colQ, setColQ] = useState("");
  const [itemQ, setItemQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<Gen | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [runs, setRuns] = useState<BulkRunList | null>(null);
  const [runsErr, setRunsErr] = useState<string | null>(null);
  const [runsTick, setRunsTick] = useState(0);
  const mxRef = useRef<HTMLTableElement>(null);
  const colRef = useRef<HTMLSpanElement>(null);

  // ---------------------------------------------------------------- loading
  useEffect(() => {
    let cancelled = false;
    wholesaleOptions().then((o) => {
      if (cancelled) return;
      setOpt(o); setError(null);
      setRouteId((cur) => (cur && o.routes.some((r) => r.id === cur) ? cur : o.routes[0]?.id ?? ""));
      setCols((cur) => cur?.filter((id) => o.products.some((p) => p.id === id)) ?? o.products.slice(0, DEFAULT_COLS).map((p) => p.id));
    }).catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load bulk invoicing" }));
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    listBulkRuns({ pageSize: 8 }).then((r) => { if (!cancelled) { setRuns(r); setRunsErr(null); } })
      .catch((e: unknown) => !cancelled && setRunsErr(apiMessage(e, "Could not load recent runs")));
    return () => { cancelled = true; };
  }, [runsTick]);

  const route = opt?.routes.find((r) => r.id === routeId) ?? null;
  const shops = useMemo(() => (opt && routeId ? opt.shops.filter((s) => s.routeId === routeId) : []), [opt, routeId]);
  const warehouseId = route?.warehouseId ?? whPick;

  // Credit position of the route's shops (balance vs effective limit) for the matrix icons and headroom.
  useEffect(() => {
    if (!shops.length) return;
    let cancelled = false;
    Promise.allSettled(shops.map((s) => customerCredit(s.customerId))).then((res) => {
      if (cancelled) return;
      const next: Record<string, Credit> = {};
      res.forEach((r) => {
        if (r.status === "fulfilled") next[r.value.customerId] = { balance: r.value.balance, limit: r.value.effectiveLimit, block: r.value.blockOverLimit, hold: r.value.status === "ON_HOLD" };
      });
      setCredit((cur) => ({ ...cur, ...next }));
    });
    return () => { cancelled = true; };
  }, [shops, creditTick]);

  useEffect(() => {
    if (!warehouseId) return;
    let cancelled = false;
    warehouseStock(warehouseId).then((map) => !cancelled && setStock({ wh: warehouseId, map })).catch(() => undefined);
    return () => { cancelled = true; };
  }, [warehouseId, creditTick]);

  useEffect(() => {
    if (!colOpen) return;
    const off = (e: MouseEvent) => { if (colRef.current && !colRef.current.contains(e.target as Node)) setColOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [colOpen]);

  // ---------------------------------------------------------------- derived
  const byId = useMemo(() => new Map((opt?.products ?? []).map((p) => [p.id, p])), [opt]);
  const colProducts = useMemo(() => (cols ?? []).map((id) => byId.get(id)).filter((p): p is Product => !!p), [cols, byId]);
  const factor = useCallback((tier: string) => opt?.tiers.find((t) => t.code === tier)?.rateFactor ?? 1, [opt]);
  const tierName = useCallback((tier: string) => opt?.tiers.find((t) => t.code === tier)?.name ?? tier.charAt(0) + tier.slice(1).toLowerCase(), [opt]);
  const ctnAmt = useCallback((p: Product, ctn: number, shop: Shop) => ctn * p.ctn * tierRate(p, factor(shop.priceTier)) * (1 + p.taxRate / 100), [factor]);
  const stockMap = stock && stock.wh === warehouseId ? stock.map : null;

  const orders = useMemo<Order[]>(() => {
    const out: Order[] = [];
    for (const s of shops) {
      let lines: { itemId: string; ctn: number }[];
      if (mode === "MATRIX") {
        const row = q[s.customerId] ?? {};
        lines = colProducts.filter((p) => (row[p.id] ?? 0) > 0).map((p) => ({ itemId: p.id, ctn: row[p.id]! }));
      } else {
        if (!sameShops.includes(s.customerId)) continue;
        lines = Object.entries(sameItems).filter(([id, v]) => v > 0 && byId.has(id)).map(([itemId, ctn]) => ({ itemId, ctn }));
      }
      if (!lines.length) continue;
      const amt = lines.reduce((a, l) => a + ctnAmt(byId.get(l.itemId)!, l.ctn, s), 0);
      out.push({ shop: s, lines, amt, ctn: lines.reduce((a, l) => a + l.ctn, 0), over: overLimit(credit[s.customerId], amt) });
    }
    return out;
  }, [shops, mode, q, colProducts, sameShops, sameItems, byId, ctnAmt, credit]);

  const totals = useMemo(() => ({
    n: orders.length, ctn: orders.reduce((a, o) => a + o.ctn, 0), value: orders.reduce((a, o) => a + o.amt, 0), warn: orders.filter((o) => o.over).length,
  }), [orders]);

  // ---------------------------------------------------------------- actions
  const setCell = (shopId: string, itemId: string, v: number) => setQ((cur) => ({ ...cur, [shopId]: { ...cur[shopId], [itemId]: v } }));

  const onMxKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const i = e.target as HTMLInputElement;
    if (!i.classList?.contains("ws2-mx-in")) return;
    const r = Number(i.dataset.r), c = Number(i.dataset.c);
    const mv = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [e.shiftKey ? -1 : 1, 0] } as Record<string, [number, number]>)[e.key];
    if (!mv) return;
    e.preventDefault();
    mxRef.current?.querySelector<HTMLInputElement>(`.ws2-mx-in[data-r="${r + mv[0]}"][data-c="${c + mv[1]}"]`)?.focus();
  };

  const clearMatrix = () => {
    const prev = q;
    setQ((cur) => { const next = { ...cur }; shops.forEach((s) => delete next[s.customerId]); return next; });
    toast("Matrix cleared", { tone: "warn", action: { label: "Undo", onClick: () => setQ(prev) } });
  };

  const switchMode = (m: Mode) => { if (m === mode) return; setMode(m); setSwap((n) => n + 1); };

  const cellError = (e: unknown, cells: { customerId: string; itemId: string }[]) => {
    if (e instanceof ApiError && e.details) {
      for (const [k, msgs] of Object.entries(e.details)) {
        const m = /^cells\.(\d+)\./.exec(k);
        const cell = m ? cells[Number(m[1])] : undefined;
        if (cell) {
          const shop = shops.find((s) => s.customerId === cell.customerId)?.name ?? "A shop";
          const item = byId.get(cell.itemId)?.name ?? "a product";
          return `${shop} · ${item}: ${msgs[0] ?? e.message}`;
        }
      }
    }
    return apiMessage(e, "Could not prepare the invoices");
  };

  const generate = async () => {
    if (!route || !orders.length) return;
    const cells = orders.flatMap((o) => o.lines.map((l) => ({ customerId: o.shop.customerId, itemId: l.itemId, qtyCtn: l.ctn })));
    setBusy(true);
    try {
      const run = await createBulkRun({ routeId: route.id, docDate, warehouseId: warehouseId || null, mode, cells });
      const pv = await previewBulkRun(run.id);
      setGen({ run: pv, phase: "preview" });
      setGenOpen(true);
      setRunsTick((n) => n + 1);
    } catch (e) {
      toast(cellError(e, cells), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!gen) return;
    const { run } = gen;
    setGen({ run, phase: "posting" });
    try {
      const done = await generateBulkRun(run.id);
      setGen({ run: { ...done, preview: run.preview }, phase: "done" });
      const billed = new Set(done.invoices.map((i) => i.customerId));
      if (done.mode === "SAME") setSameShops((cur) => cur.filter((id) => !billed.has(id)));
      else setQ((cur) => { const next = { ...cur }; billed.forEach((id) => delete next[id]); return next; });
      setCreditTick((n) => n + 1);
      setRunsTick((n) => n + 1);
      toast(`${plural(done.invoiceCount, "invoice")} posted · Rs ${fmt(done.invoicedValue)}${done.skippedCount ? ` · ${done.skippedCount} skipped` : ""}`, { tone: done.skippedCount ? "warn" : "good" });
    } catch (e) {
      setGen({ run, phase: "preview" });
      toast(apiMessage(e, "Could not post the invoices"), { tone: "danger" });
    }
  };

  const openRun = async (id: string, status: string) => {
    try {
      const r = status === "DRAFT" ? await previewBulkRun(id) : await getBulkRun(id);
      setGen({ run: r, phase: r.status === "DRAFT" ? "preview" : "done" });
      setGenOpen(true);
    } catch (e) {
      toast(apiMessage(e, "Could not open the run"), { tone: "danger" });
    }
  };

  // ---------------------------------------------------------------- render
  const head = (
    <div className="ws2-head">
      <span className="ws2-head-ic"><Grid3x3 /></span>
      <div className="ws2-head-t">
        <div className="eyebrow">Wholesale / Bulk invoicing</div>
        <h1>Bulk Invoicing</h1>
        <p>Bill a whole route in one pass: fill a shops × products matrix or push the same items to many shops.</p>
      </div>
      <div className="ws2-head-btns"><span className="tagline">a whole route, one go</span></div>
    </div>
  );

  if (error) return <>{head}<ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} /></>;
  if (!opt || !cols) {
    return (
      <div aria-busy>
        {head}
        <Skeleton style={{ height: 72, marginBottom: 14, borderRadius: 18 }} />
        <Skeleton style={{ height: 420, marginBottom: 14, borderRadius: 18 }} />
        <Skeleton style={{ height: 64, borderRadius: 20 }} />
      </div>
    );
  }
  if (!opt.routes.length) {
    return (
      <>
        {head}
        <div className="panel">
          <EmptyState
            icon={<RouteIcon />}
            title="No routes yet"
            description="Bulk invoicing bills the shops on a route. Set up a route and assign its shops first."
            action={<ButtonLink variant="primary" href="/wholesale/routes" icon={<RouteIcon />}>Routes &amp; salesmen</ButtonLink>}
          />
        </div>
      </>
    );
  }

  const whName = opt.warehouses.find((w) => w.id === route?.warehouseId)?.name;
  const noShops = (
    <EmptyState
      icon={<UserRound />}
      title="No shops on this route"
      description="Assign shops to the route to bill them here."
      action={<ButtonLink variant="secondary" href="/wholesale/routes" icon={<RouteIcon />}>Assign shops</ButtonLink>}
    />
  );
  const canGenerate = can.create && can.post;

  // matrix row totals and the tint scale
  let max = 1;
  for (const s of shops) for (const p of colProducts) max = Math.max(max, q[s.customerId]?.[p.id] ?? 0);
  const colTot = colProducts.map(() => 0);
  const rows = shops.map((s) => {
    const row = q[s.customerId] ?? {};
    let rq = 0, ra = 0;
    colProducts.forEach((p, c) => { const v = row[p.id] ?? 0; rq += v; ra += ctnAmt(p, v, s); colTot[c] = (colTot[c] ?? 0) + v; });
    return { s, row, rq, ra };
  });
  const gq = rows.reduce((a, x) => a + x.rq, 0), ga = rows.reduce((a, x) => a + x.ra, 0);

  const routeSel = sameShops.filter((id) => shops.some((s) => s.customerId === id));
  const allSel = shops.length > 0 && routeSel.length === shops.length;
  const itemList = opt.products
    .filter((p) => !itemQ || `${p.sku} ${p.name}`.toLowerCase().includes(itemQ.toLowerCase()))
    .map((p) => ({ p, st: stockMap?.[p.id] ?? null }))
    .sort((a, b) => Number((b.st ?? 1) > 0) - Number((a.st ?? 1) > 0));

  return (
    <>
      {head}

      <div className="panel ws2-bk-bar">
        <label className="ws2-fld">
          <span>Route</span>
          <select value={routeId} onChange={(e) => { setRouteId(e.target.value); setFocus(null); }}>
            {opt.routes.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
          </select>
        </label>
        <label className="ws2-fld"><span>Invoice date</span><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></label>
        {route && !route.warehouseId && (
          <label className="ws2-fld">
            <span>Warehouse</span>
            <select value={whPick} onChange={(e) => setWhPick(e.target.value)}>
              <option value="">Choose…</option>
              {opt.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
            </select>
          </label>
        )}
        {route && (
          <div className="ws2-bk-route">
            <span className="pill"><Calendar />{route.days.length ? route.days.map(dayShort).join(" · ") : "No visit days"}</span>
            <span className="pill"><UserRound />{route.salesman?.name ?? "No salesman"}</span>
            {whName && <span className="pill" title="Goods leave from this warehouse"><Truck />{whName}</span>}
          </div>
        )}
        <span className="spacer" />
        <div className="seg">
          <button type="button" className={cn(mode === "MATRIX" && "active")} onClick={() => switchMode("MATRIX")}><Grid3x3 />Matrix</button>
          <button type="button" className={cn(mode === "SAME" && "active")} onClick={() => switchMode("SAME")}><Copy />Same items to many shops</button>
        </div>
      </div>

      {mode === "MATRIX" ? (
        <div key={`m${swap}`} className={cn("panel flush ws2-bk-main", swap > 0 && "ws2-swap")}>
          <div className="ws2-bk-head">
            <div><h3>Shops × products <small>(CTN)</small></h3><p>Arrow keys move, Enter goes down, type to overwrite. Cells tint with quantity.</p></div>
            <span className="spacer" />
            <span className="ws2-colpick-wrap" ref={colRef}>
              <Button size="sm" variant="secondary" icon={<Columns3 />} onClick={() => setColOpen((o) => !o)} aria-expanded={colOpen}>Columns ({colProducts.length})</Button>
              {colOpen && (
                <div className="ws2-colpick" role="dialog" aria-label="Product columns">
                  <input className="cell-input" style={{ width: "100%", height: 34 }} placeholder="Search products…" value={colQ} onChange={(e) => setColQ(e.target.value)} autoFocus />
                  <div className="ws2-colpick-list">
                    {opt.products.filter((p) => !colQ || `${p.sku} ${p.name}`.toLowerCase().includes(colQ.toLowerCase())).map((p) => (
                      <label key={p.id}>
                        <input
                          type="checkbox"
                          checked={cols.includes(p.id)}
                          onChange={(e) => setCols((cur) => (e.target.checked ? [...(cur ?? []), p.id] : (cur ?? []).filter((x) => x !== p.id)))}
                        />
                        <span className="ws2-ac-main"><b>{p.name}</b><small>{p.sku} · {p.ctn}/ctn</small></span>
                      </label>
                    ))}
                  </div>
                  <div className="ws2-colpick-foot">
                    <span>{colProducts.length} of {opt.products.length} shown</span>
                    <button type="button" className="btn ghost sm" onClick={() => setCols(opt.products.slice(0, DEFAULT_COLS).map((p) => p.id))}>Reset</button>
                  </div>
                </div>
              )}
            </span>
            <Button size="sm" variant="secondary" icon={<Sparkles />} disabled title="Needs order history — not available yet">Fill from last orders</Button>
            <Button size="sm" variant="ghost" icon={<Eraser />} onClick={clearMatrix} disabled={!rows.some((r) => r.rq > 0)}>Clear</Button>
          </div>
          {!shops.length ? noShops : !colProducts.length ? (
            <EmptyState
              icon={<Package />}
              title={opt.products.length ? "No product columns" : "No active products"}
              description={opt.products.length ? "Choose the products to bill from Columns." : "Add products to bill them here."}
              action={opt.products.length ? undefined : <ButtonLink variant="secondary" href="/inventory/products">Products</ButtonLink>}
            />
          ) : (
            <div className="ws2-mx-wrap">
              <table className="ws2-mx" ref={mxRef} onKeyDown={onMxKey}>
                <thead>
                  <tr>
                    <th className="ws2-mx-shop">Shop <small>{shops.length} on {route?.code}</small></th>
                    {colProducts.map((p, c) => (
                      <th key={p.id} className={cn("ws2-mx-sku", focus?.c === c && "ws2-mx-col")} title={p.name}>
                        <b>{p.name.split(" ").slice(0, 2).join(" ")}</b><small>{p.sku} · {p.ctn}/ctn</small>
                      </th>
                    ))}
                    <th className="ws2-mx-tot">Qty</th>
                    <th className="ws2-mx-tot ws2-mx-amt">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ s, row, rq, ra }, r) => {
                    const c = credit[s.customerId];
                    const showCr = !!c && (ra > 0 || c.hold || (c.limit > 0 && c.balance > c.limit));
                    return (
                      <tr key={s.customerId} className={cn(focus?.r === r && "ws2-mx-row", ra > 0 && overLimit(c, ra) && "ws2-mx-over")} style={vars({ "--i": Math.min(r, 30) })}>
                        <th className="ws2-mx-shop">
                          <div><span className="ws2-mx-sn" title={s.name}>{s.name}</span><small>{s.code} · {tierName(s.priceTier)}</small></div>
                          <span data-cr="">{showCr && <CreditIcon c={c} amt={ra} />}</span>
                        </th>
                        {colProducts.map((p, ci) => {
                          const v = row[p.id] ?? 0;
                          return (
                            <td key={p.id} className={v > 0 ? "has" : undefined} style={vars({ "--h": (v / max).toFixed(3) })}>
                              <input
                                className="cell-input ws2-mx-in"
                                data-r={r}
                                data-c={ci}
                                inputMode="numeric"
                                value={v || ""}
                                onChange={(e) => setCell(s.customerId, p.id, digits(e.target.value))}
                                onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.select(), 0); setFocus({ r, c: ci }); }}
                                onBlur={() => setFocus(null)}
                                aria-label={`${s.name} ${p.name} cartons`}
                              />
                            </td>
                          );
                        })}
                        <td className="ws2-mx-tot">{rq ? fmt(rq) : "—"}</td>
                        <td className="ws2-mx-tot ws2-mx-amt">{ra ? fmt(ra) : <span className="ws2-dash">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th className="ws2-mx-shop">Total</th>
                    {colTot.map((t, c) => <td key={colProducts[c]!.id}>{t ? fmt(t) : "—"}</td>)}
                    <td className="ws2-mx-tot">{fmt(gq)}</td>
                    <td className="ws2-mx-tot ws2-mx-amt">Rs {fmt(ga)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div key={`s${swap}`} className={cn("ws2-same", swap > 0 && "ws2-swap")}>
          <div className="panel ws2-same-items">
            <div className="ws2-bk-head ws2-nopad"><div><h3>1 · Items &amp; quantity</h3><p>CTN per shop. Leave blank to skip.</p></div></div>
            <input className="cell-input ws2-search" placeholder="Search products…" value={itemQ} onChange={(e) => setItemQ(e.target.value)} aria-label="Search products" />
            <div className="ws2-same-list">
              {itemList.length ? itemList.map(({ p, st }, i) => {
                const v = sameItems[p.id] ?? 0;
                return (
                  <label key={p.id} className={cn("ws2-si", v > 0 && "on")} style={vars({ "--i": Math.min(i, 20) })}>
                    <span className="icon-well sm"><Package /></span>
                    <div className="ws2-ac-main">
                      <b>{p.name}</b>
                      <small>{p.sku} · {p.ctn}/ctn · Rs {fmt((p.wprice > 0 ? p.wprice : p.price) * p.ctn)}/ctn{st !== null && ` · ${st > 0 ? `${fmt(Math.floor(st / (p.ctn || 1)))} ctn in stock` : "out of stock"}`}</small>
                    </div>
                    <input
                      className="cell-input num"
                      inputMode="numeric"
                      placeholder="0"
                      value={v || ""}
                      onChange={(e) => { const n = digits(e.target.value); setSameItems((cur) => ({ ...cur, [p.id]: n })); }}
                      aria-label={`${p.name} cartons`}
                    />
                  </label>
                );
              }) : <div className="ws2-paste-empty"><Package /><b>No products found</b></div>}
            </div>
          </div>
          <div className="panel ws2-same-shops">
            <div className="ws2-bk-head ws2-nopad">
              <div><h3>2 · Shops on route</h3><p>{routeSel.length ? `${routeSel.length} of ${shops.length} shops selected` : "Tick the shops to bill."}</p></div>
              <span className="spacer" />
              <label className="ws2-chk">
                <input
                  type="checkbox"
                  checked={allSel}
                  ref={(el) => { if (el) el.indeterminate = !allSel && routeSel.length > 0; }}
                  disabled={!shops.length}
                  onChange={(e) => {
                    const ids = shops.map((s) => s.customerId);
                    setSameShops((cur) => (e.target.checked ? [...new Set([...cur, ...ids])] : cur.filter((id) => !ids.includes(id))));
                  }}
                />
                <span>Select all</span>
              </label>
            </div>
            {!shops.length ? noShops : (
              <div className="ws2-same-shoplist">
                {shops.map((s, i) => {
                  const on = sameShops.includes(s.customerId);
                  const c = credit[s.customerId];
                  const headroom = c && c.limit > 0 ? c.limit - c.balance : null;
                  return (
                    <label key={s.customerId} className={cn("ws2-ss", on && "on")} style={vars({ "--i": Math.min(i, 20) })}>
                      <input type="checkbox" checked={on} onChange={(e) => setSameShops((cur) => (e.target.checked ? [...cur, s.customerId] : cur.filter((x) => x !== s.customerId)))} />
                      <span className="avatar sm">{initials(s.name)}</span>
                      <div className="ws2-ac-main"><b>{s.name}</b><small>{s.code}{s.area ? ` · ${s.area}` : ""}</small></div>
                      <span className={`ws2-tier t-${s.priceTier.toLowerCase()}`}>{tierName(s.priceTier)}</span>
                      {c && (
                        c.hold ? <span className="ws2-head-room bad">Hold<small>credit</small></span>
                          : headroom === null ? <span className="ws2-head-room">—<small>no limit</small></span>
                            : <span className={cn("ws2-head-room", headroom < 0 ? "bad" : headroom < c.limit * 0.2 && "warn")}>{headroom < 0 ? "Over" : `Rs ${fmt(headroom / 1000)}k`}<small>{headroom < 0 ? "limit" : "headroom"}</small></span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className="panel ws2-same-prev">
            <div className="ws2-bk-head ws2-nopad"><div><h3>3 · Preview</h3><p>Per-shop totals with tier pricing and GST.</p></div></div>
            {orders.length ? (
              <table className="tbl ws2-sp-tbl">
                <thead><tr><th>Shop</th><th>Tier</th><th className="num">Lines</th><th className="num">CTN</th><th className="num">Amount</th><th>Credit</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.shop.customerId} className={o.over ? "ws2-mx-over" : undefined}>
                      <td><b>{o.shop.name}</b><small>{o.shop.code}</small></td>
                      <td><span className={`ws2-tier t-${o.shop.priceTier.toLowerCase()}`}>{tierName(o.shop.priceTier)}</span></td>
                      <td className="num">{o.lines.length}</td>
                      <td className="num">{o.ctn}</td>
                      <td className="num"><b>{fmt(o.amt)}</b></td>
                      <td>{o.over ? <Badge tone="danger"><ShieldAlert />Over limit</Badge> : <Badge tone="good"><ShieldCheck />OK</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="ws2-paste-empty"><MousePointerClick /><b>Nothing to preview yet</b><small>Set item quantities and tick shops.</small></div>
            )}
          </div>
        </div>
      )}

      <div className="ws2-genbar">
        <div><small>Shops billed</small><b>{fmt(totals.n)}</b></div>
        <div><small>Cartons</small><b>{fmt(totals.ctn)}</b></div>
        <div><small>Credit warnings</small><b className={totals.warn ? "bad" : undefined}>{fmt(totals.warn)}</b></div>
        <div className="ws2-genbar-v"><small>Total value</small><b>Rs {fmt(totals.value)}</b></div>
        <Button
          variant="lime"
          size="lg"
          icon={busy ? <span className="ws2-spin" /> : <Files />}
          disabled={!totals.n || !canGenerate || busy || !warehouseId}
          title={!canGenerate ? "You don't have permission to generate and post invoices" : !warehouseId ? "Choose the warehouse first" : undefined}
          onClick={generate}
        >
          <span>{busy ? "Checking credit & stock…" : `Generate ${plural(totals.n, "invoice")}`}</span>
        </Button>
      </div>

      <RecentRuns runs={runs} error={runsErr} onRetry={() => setRunsTick((n) => n + 1)} onOpen={openRun} />

      {gen && (
        <GenModal
          open={genOpen}
          gen={gen}
          canPost={can.post}
          shopName={(id) => opt.shops.find((s) => s.customerId === id)?.name ?? "Shop"}
          onClose={() => { if (gen.phase !== "posting") setGenOpen(false); }}
          onPost={post}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- generate modal (#ws2-m-gen)
function GenModal({ open, gen, canPost, shopName, onClose, onPost }: {
  open: boolean; gen: Gen; canPost: boolean; shopName: (id: string) => string; onClose: () => void; onPost: () => void;
}) {
  const { run, phase } = gen;
  const per = new Map<string, { lines: number; ctn: number; amount: number }>();
  for (const c of run.cells) {
    const x = per.get(c.customerId) ?? { lines: 0, ctn: 0, amount: 0 };
    per.set(c.customerId, { lines: x.lines + 1, ctn: x.ctn + c.qtyCtn, amount: x.amount + c.amount });
  }
  const preview = run.preview ?? [];
  const postable = preview.filter((p) => p.willSkip !== "OVER_CREDIT_LIMIT").length;
  const ids = preview.length ? preview.map((p) => p.customerId) : [...new Set([...run.invoices.map((i) => i.customerId), ...run.skipped.map((s) => s.customerId), ...per.keys()])];
  const name = (id: string) => preview.find((p) => p.customerId === id)?.name ?? run.invoices.find((i) => i.customerId === id)?.customer ?? run.skipped.find((s) => s.customerId === id)?.customer ?? shopName(id);
  const sub = `${run.route.code} · ${run.route.name} · ${dateLabel(run.docDate)}`;
  const title = phase === "done" ? `${plural(run.invoiceCount, "invoice")} generated` : phase === "posting" ? `Generating ${plural(postable, "invoice")}…` : `Ready to post ${plural(postable, "invoice")}`;
  const width = phase === "done" ? "100%" : phase === "posting" ? "85%" : "0%";

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={title}
      subtitle={phase === "preview" ? `${sub} · credit and stock checked per shop` : phase === "posting" ? "Posting each invoice with stock and credit checks." : sub}
      foot={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={phase === "posting"}>Close</button>
          {phase === "done" ? (
            <ButtonLink variant="primary" href={`/wholesale/load-sheet?route=${run.route.id}&date=${run.docDate}`} icon={<Truck />}>Build load sheet</ButtonLink>
          ) : (
            <Button variant="lime" icon={phase === "posting" ? <span className="ws2-spin" /> : <Files />} onClick={onPost} disabled={phase === "posting" || !postable || !canPost || run.status !== "DRAFT"} title={canPost ? undefined : "You don't have permission to post invoices"}>
              {phase === "posting" ? "Posting…" : `Post ${plural(postable, "invoice")}`}
            </Button>
          )}
        </>
      }
    >
      <div className="ws2-gen-prog"><i style={{ width, transition: phase === "posting" ? "width 4s cubic-bezier(.1,.6,.3,1)" : undefined }} /></div>
      <div className="ws2-gen-list">
        {ids.map((id, i) => {
          const p = per.get(id);
          const pv = preview.find((x) => x.customerId === id);
          const inv = run.invoices.find((x) => x.customerId === id);
          const sk = run.skipped.find((x) => x.customerId === id);
          const amount = inv?.amount ?? sk?.billAmount ?? pv?.amount ?? p?.amount ?? 0;
          let cls = "", icon = <CircleDashed />, note: ReactNode = "Queued";
          if (phase === "done") {
            if (inv) { cls = "done"; icon = <Check />; note = <Link href={`/sales/invoices/${inv.id}`}><code className="ws2-code">{inv.docNo}</code></Link>; }
            else if (sk) { cls = "skip"; icon = <ShieldAlert />; note = `Skipped · ${sk.reason}`; }
          } else if (phase === "posting") {
            cls = pv?.willSkip === "OVER_CREDIT_LIMIT" ? "skip" : "run";
            icon = cls === "skip" ? <ShieldAlert /> : <span className="ws2-spin" />;
            note = cls === "skip" ? "Skipping · over limit" : "Posting…";
          } else if (pv?.willSkip === "OVER_CREDIT_LIMIT") {
            cls = "skip"; icon = <ShieldAlert />; note = `Will skip · over limit by Rs ${fmt(pv.overBy)}`;
          } else if (pv?.willSkip === "OUT_OF_STOCK") {
            cls = "warn"; icon = <TriangleAlert />; note = `Short · ${pv.short.map((s) => `${s.sku} ${fmt(s.have)}/${fmt(s.need)}`).join(", ")}`;
          } else if (pv) {
            note = "Ready";
          }
          return (
            <div key={id} className={cn("ws2-gen-row", cls)} style={vars({ "--i": Math.min(i, 30) })}>
              <span className="ws2-gen-st">{icon}</span>
              <div><b>{name(id)}</b><small>{plural(pv?.lines ?? p?.lines ?? 0, "line")} · {fmt(pv?.ctn ?? p?.ctn ?? 0)} ctn</small></div>
              <span className="ws2-gen-no">{note}</span>
              <b className="ws2-gen-amt">Rs {fmt(amount)}</b>
            </div>
          );
        })}
      </div>
      {phase === "done" && (
        <div className="ws2-gen-sum">
          <div className="ws2-gs-hero">
            <span className="ws2-gs-ic"><BadgeCheck /></span>
            <div><small>Invoices</small><b>{run.invoiceCount}</b></div>
            <div><small>Total value</small><b><Money value={run.invoicedValue} dec={0} /></b></div>
            <div><small>Skipped</small><b className={run.skippedCount ? "bad" : undefined}>{run.skippedCount}</b></div>
          </div>
          {run.firstInvoiceNo && <p className="ws2-gs-range">{run.firstInvoiceNo}{run.lastInvoiceNo && run.lastInvoiceNo !== run.firstInvoiceNo ? ` → ${run.lastInvoiceNo}` : ""}</p>}
          {run.skipped.length > 0 && (
            <div className="ws2-gs-skip">
              <Info />
              <span>{run.skipped.map((s) => s.customer).join(", ")} skipped. Collect payment, raise the limit or restock, then bill them from Quick Entry.</span>
            </div>
          )}
          <div className="ws2-gs-links">
            <Link href="/wholesale/entry"><Zap />Quick Entry</Link>
            <Link href="/wholesale/bookings"><Smartphone />Order bookings</Link>
            <Link href="/sales/invoices"><ReceiptText />Sales invoices</Link>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- recent runs (addition)
const RUN_TONE = (r: { status: string; skippedCount: number }): Tone => (r.status === "DRAFT" ? "info" : r.skippedCount ? "warn" : "good");
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

function RecentRuns({ runs, error, onRetry, onOpen }: { runs: BulkRunList | null; error: string | null; onRetry: () => void; onOpen: (id: string, status: string) => void }) {
  return (
    <div className="panel flush ws2-runs">
      <div className="ws2-bk-head"><div><h3>Recent runs</h3><p>Open a run to see its invoices and skipped shops; a draft can still be posted.</p></div></div>
      {error ? <div style={{ padding: "0 18px 18px" }}><ErrorState message={error} onRetry={onRetry} /></div>
        : !runs ? <div style={{ padding: "0 18px 18px" }}><Skeleton style={{ height: 120 }} /></div>
          : !runs.items.length ? <EmptyState icon={<Warehouse />} title="No bulk runs yet" description="Runs you generate appear here." />
            : (
              <table className="tbl">
                <thead><tr><th>Date</th><th>Route</th><th>Mode</th><th className="num">Shops</th><th className="num">Invoices</th><th className="num">Value</th><th className="num">Skipped</th><th>Status</th></tr></thead>
                <tbody>
                  {runs.items.map((r) => (
                    <tr key={r.id} onClick={() => onOpen(r.id, r.status)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(r.id, r.status)}>
                      <td>{dateLabel(r.docDate)}</td>
                      <td><b>{r.route.code}</b> · {r.route.name}</td>
                      <td>{r.mode === "SAME" ? "Same items" : "Matrix"}</td>
                      <td className="num">{r.shopsSelected}</td>
                      <td className="num">{r.invoiceCount}</td>
                      <td className="num"><Money value={r.status === "DRAFT" ? r.totalValue : r.invoicedValue} dec={0} /></td>
                      <td className="num">{r.skippedCount || "—"}</td>
                      <td><Badge tone={RUN_TONE(r)}>{label(r.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
    </div>
  );
}
