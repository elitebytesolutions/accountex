"use client";

import "./pos-screen.css";
import { Banknote, ChevronDown, History, Minus, MonitorSmartphone, Package, Pause, Plus, ScanBarcode, Search, ShoppingCart, Trash2, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PosHeldSale, PosSession, PosShiftList, PosShiftOpenInput, PosShiftReport, ReceivablesOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { closeShift, discardHeld, listShifts, openShift, posSale, posSession, receivablesOptions, shiftReport } from "@/features/receivables/completion-api";
import { CloseShift, HeldBills, hhmm, OpenShiftPanel, r2, rs, SaleReceipt, ShiftHistory, TenderPad, ZReport, type Payment } from "./pos-panels";

type Can = { report: boolean; supervise: boolean };
type Line = { itemId: string; qty: number; rate: number; discountPct: number };
type Product = ReceivablesOptions["products"][number];
const TONES = ["", "blue", "orange", "violet", "lime", "red"];
const tone = (s: string) => TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];

/** Line amounts as the server computes them (gross, line discount, tax at the product's GST rate), rounded per line. */
function amounts(l: Line, p: Product | undefined) {
  const gross = r2(l.qty * l.rate);
  const disc = r2((gross * l.discountPct) / 100);
  const net = r2(gross - disc);
  const tax = r2((net * (p?.gstRate ?? 0)) / 100);
  return { gross, disc, net, tax, total: r2(net + tax) };
}

/**
 * Template app/sales/pos (43-sales-docs.html "POS / Counter Sale" + 13-sales-docs.css .sd-pos): product tiles, the cart,
 * the tender pad and the close-shift count. Real data: a shift is opened on a counter with a float; a sale posts a POS
 * invoice with its payments (cash / card / wallets / credit, split allowed) in one step; bills can be held and resumed;
 * closing counts the drawer and gives the Z-report. Not built: product categories (no category on products), barcode
 * scanning beyond SKU match, and the FBR POS fee line (posted by the invoice when FBR reporting is on).
 */
export function PosScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [session, setSession] = useState<PosSession | null>(null);
  const [options, setOptions] = useState<ReceivablesOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [scan, setScan] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [heldId, setHeldId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openErr, setOpenErr] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<"pay" | "close" | "held" | "history" | null>(null);
  const [report, setReport] = useState<PosShiftReport | null | "loading">(null);
  const [shifts, setShifts] = useState<PosShiftList | null>(null);
  const [receipt, setReceipt] = useState<Parameters<typeof SaleReceipt>[0] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([posSession(), receivablesOptions()])
      .then(([s, o]) => {
        if (cancelled) return;
        setSession(s); setOptions(o); setError(null);
        setCustomerId((c) => c || s.walkInCustomerId || o.customers[0]?.id || "");
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the till" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const products = useMemo(() => options?.products ?? [], [options]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? products.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)) : products).slice(0, 120);
  }, [products, q]);
  const totals = useMemo(() => cart.reduce((t, l) => {
    const a = amounts(l, byId.get(l.itemId));
    return { gross: r2(t.gross + a.gross), disc: r2(t.disc + a.disc), tax: r2(t.tax + a.tax), total: r2(t.total + a.total) };
  }, { gross: 0, disc: 0, tax: 0, total: 0 }), [cart, byId]);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const shift = session?.shift ?? null;

  const add = useCallback((p: Product) => setCart((c) => {
    const i = c.findIndex((l) => l.itemId === p.id);
    return i >= 0 ? c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l)) : [...c, { itemId: p.id, qty: 1, rate: p.price, discountPct: 0 }];
  }), []);
  const setLine = (i: number, patch: Partial<Line>) => setCart((c) => c.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const clear = () => { setCart([]); setHeldId(null); };

  const sale = async (hold: boolean, payments: Payment[] = []) => {
    if (!shift || !cart.length) return;
    setBusy(true);
    try {
      const r = await posSale({ shiftId: shift.id, heldInvoiceId: heldId, customerId, hold, lines: cart, payments });
      if ("held" in r) {
        toast(`${r.invoice.docNo} held · ${rs(r.invoice.netAmount, 2)}`, { tone: "info" });
      } else {
        const cust = options?.customers.find((c) => c.id === customerId)?.name ?? "";
        setReceipt({
          docNo: r.invoice.docNo, total: r.invoice.netAmount, payments, change: r.change, customer: cust, onClose: () => setReceipt(null),
          lines: cart.map((l) => ({ name: byId.get(l.itemId)?.name ?? "Item", qty: l.qty, rate: l.rate, amount: amounts(l, byId.get(l.itemId)).total })),
        });
        setPanel(null);
      }
      clear();
      reload();
    } catch (e) { toast(apiMessage(e, "Could not complete the sale"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const doOpen = async (b: PosShiftOpenInput) => {
    setBusy(true); setOpenErr({});
    try { const s = await openShift(b); toast(`Shift open · ${s.counterName} · float ${rs(s.openingFloat)}`, { tone: "good" }); reload(); }
    catch (e) { setOpenErr(apiFieldErrors(e)); toast(apiMessage(e, "Could not open the shift"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const doClose = async (denominations: { denomination: number; noteCount: number }[]) => {
    if (!shift) return;
    setBusy(true);
    try {
      const r = await closeShift(shift.id, { rowVersion: shift.rowVersion, denominations });
      setPanel(null); setReport(r); clear(); reload();
      toast(`Shift closed · ${r.zReportNo ?? ""}`, { tone: "good" });
    } catch (e) { toast(apiMessage(e, "Could not close the shift"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const resume = (h: PosHeldSale) => {
    setCart(h.lines.map((l) => ({ ...l })));
    setHeldId(h.id);
    setCustomerId(h.customer.id);
    setPanel(null);
    toast(`${h.docNo} resumed`, { tone: "info", ms: 1600 });
  };
  const discard = async (h: PosHeldSale) => {
    try { await discardHeld(h.id); toast(`${h.docNo} discarded`, { tone: "info" }); if (heldId === h.id) clear(); reload(); } catch (e) { toast(apiMessage(e, "Could not discard"), { tone: "danger" }); }
  };
  const openReport = async (id: string) => {
    setReport("loading");
    try { setReport(await shiftReport(id)); } catch (e) { setReport(null); toast(apiMessage(e, "Could not load the report"), { tone: "danger" }); }
  };
  const openHistory = async () => {
    setPanel("history"); setShifts(null);
    try { setShifts(await listShifts({ page: 1, pageSize: 50 })); } catch (e) { toast(apiMessage(e, "Could not load shifts"), { tone: "danger" }); }
  };
  const onScan = () => {
    const s = scan.trim().toLowerCase();
    const p = products.find((x) => x.sku.toLowerCase() === s || x.barcode === scan.trim());
    if (p) { add(p); setScan(""); } else if (s) toast(`No product with code “${scan.trim()}”`, { tone: "warn", ms: 1800 });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (panel || receipt || !shift) return;
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F4" && cart.length) { e.preventDefault(); setPanel("pay"); }
      if (e.key === "F8" && cart.length) { e.preventDefault(); void sale(true); }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  });

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!session || !options) return <Skeleton style={{ height: 520 }} />;

  const branch = shift?.branch.name ?? options.branches[0]?.name ?? "";
  return (
    <>
      <div className="sd-pos-top">
        <span className="sd-head-ic sm"><MonitorSmartphone /></span>
        <div className="sd-pos-title"><h1>Counter Sale</h1><p>{branch}{shift ? ` · Cashier ${shift.cashier?.name ?? ""}` : " · No shift open"}</p></div>
        <button type="button" className={cn("sd-shift", !shift && "closed")} disabled={!shift} onClick={() => setPanel("close")} title={shift ? "Close shift" : undefined}>
          <i className="sd-live" /><span>{shift ? `Shift open since ${hhmm(shift.openedAt)} · ${shift.counterName}` : "Shift closed"}</span><ChevronDown />
        </button>
        <span className="spacer" />
        {shift && <span className="sd-keys sd-pos-keys"><kbd className="kbd">/</kbd> search <kbd className="kbd">F4</kbd> pay <kbd className="kbd">F8</kbd> hold</span>}
        {can.report && <button type="button" className="btn ghost sm" onClick={() => void openHistory()}><History />Shifts</button>}
        {shift && <button type="button" className="btn secondary sm" onClick={() => setPanel("held")}><History />Held <em className="sd-count">{session.held.length}</em></button>}
      </div>

      {!shift ? <OpenShiftPanel options={options} busy={busy} error={openErr} onOpen={(b) => void doOpen(b)} /> : (
        <>
          <div className="sd-keys pos-strip" style={{ gap: 16, margin: "-6px 0 12px", fontSize: 12.5 }}>
            <span>Cash <b>{rs(shift.cashSales)}</b></span><span>Card <b>{rs(shift.cardSales)}</b></span><span>Wallets <b>{rs(shift.walletSales)}</b></span>
            <span>Credit <b>{rs(shift.creditSales)}</b></span><span>Bills <b>{shift.billsCount}</b></span><span>Expected in drawer <b>{rs(shift.expectedCash)}</b></span>
          </div>
          <div className="sd-pos-body">
            <div className="sd-pos-left">
              <div className="sd-pos-bar">
                <label className="sd-find sd-grow"><Search /><input ref={searchRef} className="cell-input" placeholder="Search products…" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} /><kbd className="kbd">/</kbd></label>
                <label className="sd-find sd-scan"><ScanBarcode /><input className="cell-input" placeholder="Scan or type SKU + Enter" autoComplete="off" value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onScan(); }} /></label>
              </div>
              <div className="sd-cats"><button type="button" className="active"><Package />All items <em>{products.length}</em></button></div>
              <div className="sd-tiles">
                {shown.length ? shown.map((p) => {
                  const n = cart.find((l) => l.itemId === p.id)?.qty ?? 0;
                  return (
                    <button key={p.id} type="button" className={cn("sd-tile", n > 0 && "in")} onClick={() => add(p)}>
                      {n > 0 && <em className="sd-tile-n">{n}</em>}
                      <span className={cn("sd-tile-ic", tone(p.sku))}><Package /></span>
                      <b>{p.name}</b><small>{p.sku}{p.unit ? ` · ${p.unit}` : ""}</small>
                      <span className="sd-tile-f"><strong>{rs(p.price)}</strong>{p.gstRate > 0 && <span className="sd-sb">GST {p.gstRate}%</span>}</span>
                    </button>
                  );
                }) : <div className="sd-tiles-empty muted">No products match “{q}”.</div>}
              </div>
            </div>

            <aside className="sd-pos-cart">
              <div className="sd-cart-head">
                <div className="sd-cart-t"><span className="sd-cart-ic"><ShoppingCart /><em>{count}</em></span><div><b>Current sale</b><small>{heldId ? `Resumed ${session.held.find((h) => h.id === heldId)?.docNo ?? "held bill"}` : "New POS bill"}</small></div></div>
                <button type="button" className="btn ghost sm" disabled={!cart.length} onClick={clear}><Trash2 />Clear</button>
              </div>
              <label className="sd-cust-pick"><UserRound /><select aria-label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {options.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
              <div className="sd-cart-lines">
                {cart.length ? cart.map((l, i) => {
                  const p = byId.get(l.itemId);
                  const a = amounts(l, p);
                  return (
                    <div key={l.itemId} className="sd-cl">
                      <span className={cn("sd-cl-ic", tone(p?.sku ?? ""))}><Package /></span>
                      <div className="sd-cl-main"><b>{p?.name ?? "Item"}</b>
                        <small>@ <input className="cell-input" style={{ width: 70, height: 22, padding: "0 4px", borderRadius: 6, fontSize: 11.5, fontWeight: 700 }} type="number" min="0" value={l.rate} aria-label="Rate" onChange={(e) => setLine(i, { rate: Number(e.target.value) || 0 })} />
                          <span className="sd-cl-d">disc <input className="cell-input" type="number" min="0" max="100" value={l.discountPct} aria-label="Discount %" onChange={(e) => setLine(i, { discountPct: Math.min(100, Number(e.target.value) || 0) })} />%</span></small>
                      </div>
                      <button type="button" className="sd-cl-x" aria-label="Remove" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}><X /></button>
                      <div className="sd-qty">
                        <button type="button" aria-label="Less" onClick={() => (l.qty <= 1 ? setCart((c) => c.filter((_, j) => j !== i)) : setLine(i, { qty: l.qty - 1 }))}><Minus /></button>
                        <input className="cell-input" type="number" min="1" value={l.qty} aria-label="Qty" onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                        <button type="button" aria-label="More" onClick={() => setLine(i, { qty: l.qty + 1 })}><Plus /></button>
                      </div>
                      <b className="sd-cl-amt">{rs(a.total, 2)}</b>
                    </div>
                  );
                }) : <div className="sd-cart-empty"><ShoppingCart /><b>Cart is empty</b><small>Tap a product, search with / or scan a SKU to start a sale.</small></div>}
              </div>
              <div className="sd-cart-tot">
                <div><span>Subtotal</span><b>{rs(totals.gross, 2)}</b></div>
                <div><span>Line discounts</span><b>{rs(totals.disc, 2)}</b></div>
                <div><span>GST</span><b>{rs(totals.tax, 2)}</b></div>
                <div className="sd-cart-grand"><span>Total</span><b>{rs(totals.total, 2)}</b></div>
              </div>
              <div className="sd-cart-acts">
                <button type="button" className="btn secondary" disabled={!cart.length || busy} onClick={() => void sale(true)}><Pause />Hold <kbd className="kbd">F8</kbd></button>
                <button type="button" className="btn lime lg sd-paybig" disabled={!cart.length || busy} onClick={() => setPanel("pay")}><Banknote /><span>Pay <b>{rs(totals.total)}</b></span><kbd className="kbd">F4</kbd></button>
              </div>
            </aside>
          </div>
        </>
      )}

      {panel === "pay" && shift && <TenderPad total={totals.total} busy={busy} onClose={() => setPanel(null)} onComplete={(p) => void sale(false, p)} />}
      {panel === "close" && shift && <CloseShift shift={shift} held={session.held.length} busy={busy} onClose={() => setPanel(null)} onConfirm={(d) => void doClose(d)} />}
      {panel === "held" && <HeldBills held={session.held} onClose={() => setPanel(null)} onResume={resume} onDiscard={(h) => void discard(h)} />}
      {panel === "history" && <ShiftHistory list={shifts} onClose={() => setPanel(null)} onOpen={(id) => { setPanel(null); void openReport(id); }} />}
      {report && <ZReport report={report === "loading" ? null : report} onClose={() => setReport(null)} />}
      {receipt && <SaleReceipt {...receipt} />}
    </>
  );
}
