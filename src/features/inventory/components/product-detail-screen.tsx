"use client";

import {
  ArrowLeft, Boxes, ChevronDown, ChevronLeft, ChevronRight, PackageSearch, CalendarClock, CalendarDays, ChartLine, CircleCheck, ClipboardList, Coins, Copy, Gem, History, Layers, LayoutGrid, Lock, Pencil,
  Percent, Plus, Printer, ScanBarcode, Scissors, ScrollText, ShieldAlert, ShoppingCart, SlidersHorizontal, Trash2, Truck, Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { marginPct, packSplit, type Batch, type PriceLog, type ProductDetail, type ReorderRule } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  addProductChild, createBatch, listProducts, createReorderRule, deleteProductChild, deleteReorderRule, getProduct, listBatches, listReorderRules, productOptions, productPriceLog,
  updateProductChild, updateReorderRule, type ProductOptions,
} from "../products-api";
import { Bars, Label, toEan13 } from "./barcode";
import { NamedIcon } from "./named-icon";
import { ProductForm } from "./product-form";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Tab = "overview" | "card" | "price" | "suppliers" | "batches" | "barcodes" | "units" | "orders" | "history";
type Dlg =
  | { kind: "supplier"; id: string | null; rv: number; f: Record<string, string | boolean> }
  | { kind: "barcode"; id: string | null; rv: number; f: Record<string, string | boolean> }
  | { kind: "unit"; id: string | null; rv: number; f: Record<string, string | boolean> }
  | { kind: "batch"; f: Record<string, string> }
  | { kind: "rule"; id: string | null; rv: number; f: Record<string, string | boolean> };
const LOOKUPS = ["ProductStatus", "ProductPriceLogPriceField", "ProductPriceLogSource", "ProductBatchDisposition", "ProductBarcodeKind"];
const ATTR = { isShort: ["Short Item", Scissors, "warn"], trackExpiry: ["Expiry Required", CalendarClock, "info"], isPrecious: ["Precious", Gem, "violet"], isControlled: ["Controlled", ShieldAlert, "danger"] } as const;
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const rs = (n: number, d = 2) => `Rs ${fmt(n, d)}`;
const date = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(iso.length === 10 && { timeZone: "UTC" }) }) : "—");
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Template app/inventory/products/view (4B-products.html + 9F-products.js §2): hero, KPIs, tabs. Stock by location, Stock
 * Card and Open Orders fill from the stock / order phases; everything else is live. Units tab added (pack sizes).
 */
export function ProductDetailScreen({ id, can }: { id: string; can: Can }) {
  const router = useRouter();
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [p, setP] = useState<ProductDetail | null>(null);
  const [log, setLog] = useState<PriceLog[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [rules, setRules] = useState<ReorderRule[]>([]);
  const [opts, setOpts] = useState<ProductOptions | null>(null);
  const [siblings, setSiblings] = useState<{ id: string; sku: string; name: string }[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(0);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<unknown>; done: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProduct(id), productPriceLog(id), listBatches({ page: 1, pageSize: 100, product: id }), listReorderRules(id), productOptions()])
      .then(([x, l, b, r, o]) => { if (!cancelled) { setP(x); setLog(l); setBatches(b.items); setRules(r); setOpts(o); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the product" }));
    return () => { cancelled = true; };
  }, [id, attempt]);
  useEffect(() => {
    let cancelled = false;
    listProducts({ page: 1, pageSize: 100, sort: "sku" }).then((r) => !cancelled && setSiblings(r.items.map((x) => ({ id: x.id, sku: x.sku, name: x.name })))).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const run = async (work: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); after?.(); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!p) return <div className="pr-card"><Skeleton style={{ height: 200 }} /></div>;

  const loose = p.uom.code;
  const daily = 0;
  const cover = daily > 0 ? Math.floor(p.onHand / daily) : null;
  const covT = !p.onHand ? "danger" : cover !== null && cover < 10 ? "danger" : cover !== null && cover < 25 ? "warn" : "good";
  const top = p.highLevel * 1.15 || 1, pos = Math.min(100, (p.onHand / top) * 100), lowP = (p.lowLevel / top) * 100, highP = (p.highLevel / top) * 100;
  const st = p.onHand <= p.lowLevel ? ["danger", "Reorder now", `Below the low level by ${fmt(p.lowLevel - p.onHand)} ${loose}`] : p.onHand > p.highLevel ? ["violet", "Overstock", `${fmt(p.onHand - p.highLevel)} ${loose} above the high level`] : ["good", "Healthy", "Between low and high levels"];
  const rq = Math.max(0, p.highLevel - p.onHand), rqC = Math.ceil(rq / Math.max(1, p.ctn));
  const piece = p.barcodes.find((b) => b.kind === "PIECE" && b.isPrimary)?.barcode ?? p.upc;
  const carton = p.barcodes.find((b) => b.kind === "CARTON" && b.isPrimary)?.barcode ?? null;
  const setF = (k: string, v: string | boolean) => setDlg((d) => (d ? ({ ...d, f: { ...d.f, [k]: v } } as Dlg) : d));
  const fs = (k: string) => String(dlg?.f[k] ?? "");
  const fb = (k: string) => Boolean(dlg?.f[k]);
  const tabs: [Tab, string, React.ReactNode, number?][] = [
    ["overview", "Overview", <LayoutGrid key="i" />], ["card", "Stock Card", <ScrollText key="i" />], ["price", "Price History", <ChartLine key="i" />, log.length],
    ["suppliers", "Suppliers", <Truck key="i" />, p.suppliers.length], ["batches", "Batches & Expiry", <CalendarClock key="i" />, batches.length],
    ["barcodes", "Barcodes & Labels", <ScanBarcode key="i" />, p.barcodes.length], ["units", "Units", <Layers key="i" />, p.units.length],
    ["orders", "Open Orders", <ClipboardList key="i" />], ["history", "Activity", <History key="i" />],
  ];
  const saveDlg = () => {
    if (!dlg) return;
    const f = dlg.f;
    if (dlg.kind === "batch") return run(() => createBatch({ ...f, itemId: p.id }), `Batch ${f.batchNo} added`, () => setDlg(null));
    if (dlg.kind === "rule") return run(() => (dlg.id ? updateReorderRule(dlg.id, { ...f, rowVersion: dlg.rv }) : createReorderRule({ ...f, itemId: p.id })), "Reorder rule saved", () => setDlg(null));
    const kind = dlg.kind === "supplier" ? "suppliers" : dlg.kind === "barcode" ? "barcodes" : "units";
    const body = dlg.kind === "unit" && dlg.id ? { factor: f.factor, isPurchaseDefault: f.isPurchaseDefault, isSalesDefault: f.isSalesDefault } : f;
    return run(() => (dlg.id ? updateProductChild(kind, dlg.id, { ...body, rowVersion: dlg.rv }) : addProductChild(p.id, kind, body)), "Saved", () => setDlg(null));
  };
  const later = (icon: React.ReactNode, title: string, phase: string) => <div className="pr-emptybox"><span>{icon}</span><b>{title}</b><small>Appears here once {phase}.</small></div>;

  return (
    <>
      <div className="pr-pd-top">
        <Link className="pr-back" href="/inventory/items"><ArrowLeft />Product Catalogue</Link>
        <span className="spacer" />
        {(() => {
          const list = siblings.some((x) => x.id === p.id) ? siblings : [{ id: p.id, sku: p.sku, name: p.name }, ...siblings];
          const at = list.findIndex((x) => x.id === p.id);
          const go = (i: number) => { const x = list[i]; if (x) router.push(`/inventory/products/${x.id}`); };
          return (
            <div className="pr-switch">
              <button className="btn secondary icon sm" type="button" disabled={at <= 0} onClick={() => go(at - 1)} aria-label="Previous product"><ChevronLeft /></button>
              <div className="pr-ctl pr-switch-sel"><PackageSearch /><select value={p.id} onChange={(e) => go(list.findIndex((x) => x.id === e.target.value))} aria-label="Switch product">{list.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</select><ChevronDown className="pr-chev" /></div>
              <button className="btn secondary icon sm" type="button" disabled={at < 0 || at >= list.length - 1} onClick={() => go(at + 1)} aria-label="Next product"><ChevronRight /></button>
            </div>
          );
        })()}
      </div>
      <div className="pr-pd-body">
        <div className="pr-pd-hero" style={{ ["--co" as string]: p.company?.brandColour ?? "var(--primary)" }}>
          <span className="pr-tile xl" style={{ ["--co" as string]: p.company?.brandColour ?? "var(--primary)" }}><NamedIcon name={p.productClass?.icon ?? "package"} /></span>
          <div className="pr-pd-ht">
            <small>{[p.sku, p.upc ? `UPC ${p.upc}` : null, p.company?.name].filter(Boolean).join(" · ")}</small>
            <h1>{p.name}</h1>
            <div className="pr-pd-badges">
              <span className={cn("badge dot", toneOf(lookups, "ProductStatus", p.status))}>{labelOf(lookups, "ProductStatus", p.status)}</span>
              {p.productClass && <span className="badge outline"><NamedIcon name={p.productClass.icon} />{p.productClass.name}{p.subclass ? ` · ${p.subclass.name}` : ""}</span>}
              {p.isKit && <span className="badge lime">Kit</span>}
              {(Object.keys(ATTR) as (keyof typeof ATTR)[]).filter((k) => p[k]).map((k) => { const [l, I, t] = ATTR[k]; return <span key={k} className={cn("badge", t)}><I />{l}</span>; })}
            </div>
          </div>
          <div className="pr-pd-act">
            {can.edit && <button className="btn secondary" type="button" onClick={() => setEditing((n) => n + 1)}><Pencil />Edit</button>}
            {can.edit && <button className="btn secondary" type="button" onClick={() => router.push(`/inventory/labels?ids=${p.id}`)}><Printer />Print label</button>}
            <button className="btn secondary" type="button" disabled title="Stock adjustments arrive with the stock phases"><SlidersHorizontal />Adjust stock</button>
            <button className="btn primary" type="button" disabled title="Purchase orders arrive in Phase 19"><ShoppingCart />Create PO</button>
          </div>
        </div>

        <div className="pr-pd-kpis">
          <div className="pr-kpi" style={{ ["--i" as string]: 0 }}><span className="pr-kpi-ic"><Boxes /></span><div><small>On hand</small><b>{packSplit(p.onHand, p.ctn, "CTN", loose)}</b><em>{fmt(p.onHand)} {loose} in total</em></div></div>
          <div className="pr-kpi" style={{ ["--i" as string]: 1 }}><span className="pr-kpi-ic blue"><CircleCheck /></span><div><small>Available</small><b>{fmt(p.onHand)}</b><em>{packSplit(p.onHand, p.ctn, "CTN", loose)}</em></div></div>
          <div className="pr-kpi" style={{ ["--i" as string]: 2 }}><span className="pr-kpi-ic orange"><Lock /></span><div><small>Reserved</small><b>0</b><em>Sales orders arrive in Phase 21</em></div></div>
          <div className="pr-kpi" style={{ ["--i" as string]: 3 }}><span className="pr-kpi-ic violet"><Coins /></span><div><small>Stock value</small><b>{rs(p.stockValue, 0)}</b><em>At weighted average cost</em></div></div>
          <div className={cn("pr-kpi", covT)} style={{ ["--i" as string]: 4 }}><span className="pr-kpi-ic"><CalendarDays /></span><div><small>Days of cover</small><b>{p.onHand ? (cover === null ? "—" : `${cover} days`) : "Out of stock"}</b><em>Sales rate known after the first sales</em><span className="pr-cover"><i style={{ width: `${Math.min(100, ((cover ?? 0) / 60) * 100)}%` }} /></span></div></div>
        </div>

        <div className="pr-card pr-pd-tabs">
          <div className="tabs pr-tabs" role="tablist">
            {tabs.map(([k, l, ic, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={cn(tab === k && "active")} onClick={() => setTab(k)}>{ic}{l}{n ? <i>{n}</i> : null}</button>)}
          </div>
          <div className="pr-pd-pane">
            {tab === "overview" && (
              <div className="pr-ov">
                <div className="pr-sub-card pr-ov-loc"><div className="pr-sub-h"><b>Stock by location</b><small>{fmt(p.onHand)} {loose}</small></div>
                  <div className="pr-emptybox"><span><Warehouse /></span><b>No stock yet</b><small>Stock per warehouse shows here once goods are received (Phase 20).</small></div>
                </div>
                <div className="pr-sub-card"><div className="pr-sub-h"><b>Reorder settings</b><span className={cn("badge dot", st[0])}>{st[1]}</span></div>
                  <div className="pr-meter"><div className="pr-meter-track"><span className="pr-meter-low" style={{ width: `${lowP}%` }} /><span className="pr-meter-ok" style={{ left: `${lowP}%`, width: `${highP - lowP}%` }} /><i className={cn("pr-meter-pin", st[0])} style={{ left: `${pos}%` }}><em>{fmt(p.onHand)}</em></i></div>
                    <div className="pr-meter-lbl"><span style={{ left: `${lowP}%` }}>Low {fmt(p.lowLevel)}</span><span style={{ left: `${highP}%` }}>High {fmt(p.highLevel)}</span></div></div>
                  <p className="pr-muted-p">{st[2]}.</p>
                  <dl className="pr-dl">
                    <div><dt>Low level</dt><dd>{fmt(p.lowLevel)}</dd></div><div><dt>High level</dt><dd>{fmt(p.highLevel)}</dd></div>
                    <div><dt>Suggested order</dt><dd>{rq ? <>{fmt(rqC)} CTN <small>({fmt(rqC * Math.max(1, p.ctn))} {loose})</small></> : "—"}</dd></div>
                    <div><dt>Lead time</dt><dd>{p.leadDays ?? 14} days</dd></div><div><dt>Shelf</dt><dd><span className="pr-shelf">{p.defaultShelf ?? "—"}</span></dd></div>
                    <div><dt>Pack</dt><dd>{p.ctn > 1 ? `CTN ${p.ctn} × ${p.uom.name}` : `Single ${p.uom.name}`}</dd></div>
                  </dl>
                  <div className="pr-sub-h" style={{ marginTop: 12 }}><b>Warehouse rules</b>{can.create && <button type="button" className="btn ghost sm" onClick={() => { setErrs({}); setDlg({ kind: "rule", id: null, rv: 0, f: { warehouseId: "", lowLevel: String(p.lowLevel), highLevel: String(p.highLevel), leadDays: String(p.leadDays ?? 14), safetyDays: "14", coverAlertDays: "21", isActive: true } }); }}><Plus />Rule</button>}</div>
                  {rules.length ? (
                    <table className="pr-mini"><thead><tr><th>Warehouse</th><th className="num">Low</th><th className="num">High</th><th className="num">Lead</th><th /></tr></thead><tbody>
                      {rules.map((r) => (
                        <tr key={r.id} className={cn(!r.isActive && "pr-muted")}><td>{r.warehouse?.name ?? "All warehouses"}</td><td className="num">{fmt(r.lowLevel)}</td><td className="num">{fmt(r.highLevel)}</td><td className="num">{r.leadDays}d</td>
                          <td className="actions">{can.edit && <button type="button" className="icon-btn-sm" aria-label="Edit rule" onClick={() => { setErrs({}); setDlg({ kind: "rule", id: r.id, rv: r.rowVersion, f: { warehouseId: r.warehouse?.id ?? "", lowLevel: String(r.lowLevel), highLevel: String(r.highLevel), leadDays: String(r.leadDays), safetyDays: String(r.safetyDays), coverAlertDays: String(r.coverAlertDays), isActive: r.isActive } }); }}><Pencil /></button>}
                            {can.remove && <button type="button" className="icon-btn-sm" aria-label="Delete rule" onClick={() => setConfirm({ title: "Delete this reorder rule?", body: "The product's own low / high levels apply again.", run: () => deleteReorderRule(r.id, r.rowVersion), done: "Rule deleted" })}><Trash2 /></button>}</td></tr>
                      ))}
                    </tbody></table>
                  ) : <p className="pr-muted-p">No warehouse rules: the levels above apply to all warehouses.</p>}
                </div>
                <div className="pr-sub-card"><div className="pr-sub-h"><b>Pricing</b><span className={cn("pr-mchip sm", marginPct(p.price, p.cost) < 10 ? "low" : "ok")}><b>{marginPct(p.price, p.cost)}% margin</b></span></div>
                  <div className="pr-pgrid">
                    <div><small>Purchase</small><b>{rs(p.cost)}</b><em>CTN {rs(p.cost * p.ctn, 0)}</em></div>
                    <div><small>W. price</small><b>{p.wprice === null ? "—" : rs(p.wprice)}</b><em>{p.wprice ? `${marginPct(p.wprice, p.cost)}% margin` : "Not set"}</em></div>
                    <div className="hi"><small>Retail</small><b>{rs(p.price)}</b><em>CTN {rs(p.price * p.ctn, 0)}</em></div>
                  </div>
                  <div className="pr-scheme none"><Percent /><span>GST {p.gstRate}%{p.taxCode ? ` (${p.taxCode.code})` : ""} · Fin. discount {fmt(p.finDiscPct, 1)}%{p.hsCode ? ` · HS ${p.hsCode}` : ""}</span></div>
                  <p className="pr-muted-p">Price tiers and schemes arrive with pricing (Phase 9).</p>
                </div>
              </div>
            )}

            {tab === "card" && later(<ScrollText />, "No stock movements yet", "goods are received, sold or adjusted (Phases 20–22)")}
            {tab === "orders" && later(<ClipboardList />, "No open orders", "sales and purchase orders exist (Phases 19–21)")}
            {tab === "history" && <HistoryTab schema="Inventory" table="Products" id={p.id} />}

            {tab === "price" && (
              log.length ? (
                <div className="pr-tw"><table className="tbl"><thead><tr><th>When</th><th>Price</th><th className="num">Old</th><th className="num">New</th><th className="num">Change</th><th>Source</th><th>By</th></tr></thead><tbody>
                  {log.map((l) => {
                    const d = l.oldValue === null ? null : l.newValue - l.oldValue;
                    return (
                      <tr key={l.id}><td>{date(l.changedAt)}</td><td>{labelOf(lookups, "ProductPriceLogPriceField", l.priceField)}</td><td className="num">{l.oldValue === null ? "—" : fmt(l.oldValue, 2)}</td><td className="num"><b>{fmt(l.newValue, 2)}</b></td>
                        <td className={cn("num", d !== null && (d >= 0 ? "pr-up" : "pr-down"))}>{d === null ? "first price" : `${d >= 0 ? "+" : "−"}${fmt(Math.abs(d), 2)}`}</td>
                        <td>{labelOf(lookups, "ProductPriceLogSource", l.source)}</td><td>{l.changedBy ?? "system"}</td></tr>
                    );
                  })}
                </tbody></table></div>
              ) : later(<ChartLine />, "No price changes yet", "prices are changed")
            )}

            {tab === "suppliers" && (
              <>
                {can.edit && <div className="pr-pane-head"><span className="spacer" /><button className="btn secondary sm" type="button" onClick={() => { setErrs({}); setDlg({ kind: "supplier", id: null, rv: 0, f: { vendorId: "", vendorItemCode: "", lastPrice: "", leadDays: "", sharePct: "", isPreferred: false } }); }}><Plus />Add supplier</button></div>}
                {p.suppliers.length ? (
                  <div className="pr-tw"><table className="tbl"><thead><tr><th>Supplier</th><th>Their code</th><th className="num">Last price</th><th className="num">vs current</th><th>Lead time</th><th>Share of buying</th><th /></tr></thead><tbody>
                    {p.suppliers.map((s) => (
                      <tr key={s.id}><td><div className="pr-sup"><span className="avatar sm">{s.vendor.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><div><b>{s.vendor.name}</b><small>{s.vendor.code}{s.isPreferred ? " · Preferred" : ""}</small></div></div></td>
                        <td className="pr-mono">{s.vendorItemCode ?? "—"}</td><td className="num">{s.lastPrice === null ? "—" : fmt(s.lastPrice, 2)}</td>
                        <td className={cn("num", s.lastPrice !== null && (s.lastPrice <= p.cost ? "pr-up" : "pr-down"))}>{s.lastPrice === null ? "—" : `${s.lastPrice >= p.cost ? "+" : "−"}${fmt(Math.abs(s.lastPrice - p.cost), 2)}`}</td>
                        <td>{s.leadDays === null ? "—" : `${s.leadDays} days`}</td><td>{s.sharePct === null ? "—" : <div className="pr-share"><i style={{ width: `${s.sharePct}%` }} /><span>{s.sharePct}%</span></div>}</td>
                        <td className="actions">{can.edit && <>
                          <button type="button" className="icon-btn-sm" aria-label={`Edit ${s.vendor.name}`} onClick={() => { setErrs({}); setDlg({ kind: "supplier", id: s.id, rv: s.rowVersion, f: { vendorId: s.vendor.id, vendorItemCode: s.vendorItemCode ?? "", lastPrice: s.lastPrice?.toString() ?? "", leadDays: s.leadDays?.toString() ?? "", sharePct: s.sharePct?.toString() ?? "", isPreferred: s.isPreferred } }); }}><Pencil /></button>
                          <button type="button" className="icon-btn-sm" aria-label={`Remove ${s.vendor.name}`} onClick={() => setConfirm({ title: `Remove ${s.vendor.name}?`, body: "The vendor no longer shows as a supplier of this product.", run: () => deleteProductChild("suppliers", s.id, s.rowVersion), done: "Supplier removed" })}><Trash2 /></button>
                        </>}</td></tr>
                    ))}
                  </tbody></table></div>
                ) : later(<Truck />, "No suppliers yet", "you add the vendors you buy it from")}
              </>
            )}

            {tab === "batches" && (
              <>
                <div className="pr-pane-head"><div className="pr-fefo"><Layers /><span><b>FEFO</b> · first-expiry, first-out picking order</span></div><span className="spacer" />
                  {can.create && <button className="btn secondary sm" type="button" onClick={() => { setErrs({}); setDlg({ kind: "batch", f: { batchNo: "", expiryDate: "", mfgDate: "", unitCost: String(p.cost), notes: "" } }); }}><Plus />Add batch</button>}</div>
                {batches.length ? (
                  <div className="pr-tw"><table className="tbl"><thead><tr><th>#</th><th>Batch</th><th>Expiry</th><th>Days left</th><th className="num">Qty</th><th className="num">Cost</th><th>Status</th></tr></thead><tbody>
                    {[...batches].sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999")).map((b, i) => {
                      const days = b.expiryDate ? Math.round((Date.parse(`${b.expiryDate}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 864e5) : null;
                      const t = days === null ? "good" : days <= 30 ? "danger" : days <= 120 ? "warn" : "good";
                      return (
                        <tr key={b.id} className={cn(i === 0 && "pr-next")}><td>{i === 0 ? <span className="badge lime">Pick next</span> : i + 1}</td><td className="pr-mono">{b.batchNo}</td><td>{date(b.expiryDate)}</td>
                          <td>{days === null ? "—" : <><div className={cn("pr-days", t)}><i style={{ width: `${Math.max(4, Math.min(100, (days / 365) * 100))}%` }} /></div><b className={`pr-dl-${t}`}>{days < 0 ? "Expired" : `${days} days`}</b></>}</td>
                          <td className="num">{fmt(b.onHand)}</td><td className="num">{b.unitCost === null ? "—" : fmt(b.unitCost, 2)}</td>
                          <td><span className={cn("badge", toneOf(lookups, "ProductBatchDisposition", b.disposition))}>{labelOf(lookups, "ProductBatchDisposition", b.disposition)}</span></td></tr>
                      );
                    })}
                  </tbody></table></div>
                ) : <div className="pr-emptybox"><span><CalendarClock /></span><b>{p.trackExpiry ? "No batches yet" : "Not expiry-tracked"}</b><small>{p.trackExpiry ? "Batches come in with goods received (Phase 20), or add one by hand." : "Turn on “Required Expiry” to capture batch and expiry on every purchase voucher."}</small></div>}
              </>
            )}

            {tab === "barcodes" && (
              <>
                <div className="pr-bcgrid">
                  {([["Piece", piece, `EAN-13 · 1 ${loose}`], ["Carton", carton, `Outer · 1 CTN = ${p.ctn} ${loose}`]] as const).map(([k, code, sub], i) => (
                    <div key={k} className="pr-sub-card pr-bccard" style={{ ["--i" as string]: i }}><div className="pr-sub-h"><b>{k} barcode</b><small>{sub}</small></div>
                      {code ? <div className="pr-bcbig"><Bars code={code} /><span className="pr-bcdig">{toEan13(code)}</span></div> : <p className="pr-muted-p">No {k.toLowerCase()} barcode yet.</p>}
                      <div className="pr-bcfoot">{code && <button className="btn ghost sm" type="button" onClick={() => { void navigator.clipboard?.writeText(code); toast("Copied", { tone: "good" }); }}><Copy />Copy</button>}{code && can.edit && <button className="btn ghost sm" type="button" onClick={() => router.push(`/inventory/labels?ids=${p.id}`)}><Printer />Print</button>}</div>
                    </div>
                  ))}
                  <div className="pr-sub-card"><div className="pr-sub-h"><b>Shelf label preview</b><small>Thermal 2×1&quot;</small></div>
                    <div className="pr-lbstage-sm"><Label tpl="thermal" o={{ price: true, company: true, urdu: !!p.nameUrdu, batch: false, ctn: false }}
                      item={{ sku: p.sku, name: p.name, nameUrdu: p.nameUrdu, company: p.company?.name ?? null, price: p.price, ctn: p.ctn, piece, carton }} /></div>
                    <div className="pr-bcfoot"><span className="spacer" />{can.edit && <button className="btn secondary sm" type="button" onClick={() => router.push(`/inventory/labels?ids=${p.id}`)}><Printer />Print labels</button>}</div>
                  </div>
                </div>
                <div className="pr-pane-head" style={{ marginTop: 14 }}><b>All barcodes</b><span className="spacer" />{can.edit && <button className="btn secondary sm" type="button" onClick={() => { setErrs({}); setDlg({ kind: "barcode", id: null, rv: 0, f: { barcode: "", kind: "PIECE", qtyPerScan: "1", isPrimary: false } }); }}><Plus />Add barcode</button>}</div>
                {p.barcodes.length > 0 && (
                  <div className="pr-tw"><table className="tbl"><thead><tr><th>Barcode</th><th>Kind</th><th className="num">Qty per scan</th><th>Primary</th><th /></tr></thead><tbody>
                    {p.barcodes.map((b) => (
                      <tr key={b.id}><td className="pr-mono">{b.barcode}</td><td>{labelOf(lookups, "ProductBarcodeKind", b.kind)}</td><td className="num">{fmt(b.qtyPerScan)}</td><td>{b.isPrimary ? <span className="badge good">Primary</span> : "—"}</td>
                        <td className="actions">{can.edit && <>
                          <button type="button" className="icon-btn-sm" aria-label={`Edit ${b.barcode}`} onClick={() => { setErrs({}); setDlg({ kind: "barcode", id: b.id, rv: b.rowVersion, f: { barcode: b.barcode, kind: b.kind, qtyPerScan: String(b.qtyPerScan), isPrimary: b.isPrimary } }); }}><Pencil /></button>
                          <button type="button" className="icon-btn-sm" aria-label={`Remove ${b.barcode}`} onClick={() => setConfirm({ title: `Remove ${b.barcode}?`, body: "Scanning this code will no longer find the product.", run: () => deleteProductChild("barcodes", b.id, b.rowVersion), done: "Barcode removed" })}><Trash2 /></button>
                        </>}</td></tr>
                    ))}
                  </tbody></table></div>
                )}
              </>
            )}

            {tab === "units" && (
              <>
                <div className="pr-pane-head"><span className="pr-muted-p">The base unit ({p.uom.name}) is 1; packs hold that many base units.</span><span className="spacer" />{can.edit && <button className="btn secondary sm" type="button" onClick={() => { setErrs({}); setDlg({ kind: "unit", id: null, rv: 0, f: { uomId: "", factor: String(p.ctn > 1 ? p.ctn : ""), isPurchaseDefault: false, isSalesDefault: false } }); }}><Plus />Add pack size</button>}</div>
                <div className="pr-tw"><table className="tbl"><thead><tr><th>Unit</th><th className="num">Base units</th><th>Purchase default</th><th>Sales default</th><th /></tr></thead><tbody>
                  {p.units.map((u) => (
                    <tr key={u.id}><td><b>{u.uom.code}</b> {u.uom.name}{u.isBase && <span className="badge neutral" style={{ marginLeft: 6 }}>Base</span>}</td><td className="num">{fmt(u.factor, 3).replace(/\.?0+$/, "")}</td>
                      <td>{u.isPurchaseDefault ? "Yes" : "—"}</td><td>{u.isSalesDefault ? "Yes" : "—"}</td>
                      <td className="actions">{can.edit && <>
                        <button type="button" className="icon-btn-sm" aria-label={`Edit ${u.uom.code}`} onClick={() => { setErrs({}); setDlg({ kind: "unit", id: u.id, rv: u.rowVersion, f: { uomId: u.uom.id, factor: String(u.factor), isPurchaseDefault: u.isPurchaseDefault, isSalesDefault: u.isSalesDefault } }); }}><Pencil /></button>
                        {!u.isBase && <button type="button" className="icon-btn-sm" aria-label={`Remove ${u.uom.code}`} onClick={() => setConfirm({ title: `Remove the ${u.uom.code} pack?`, body: "Only pack sizes no document uses can be removed.", run: () => deleteProductChild("units", u.id, u.rowVersion), done: "Pack size removed" })}><Trash2 /></button>}
                      </>}</td></tr>
                  ))}
                </tbody></table></div>
              </>
            )}
          </div>
        </div>
      </div>

      {editing > 0 && <ProductForm key={editing} product={p} onClose={() => setEditing(0)} onSaved={() => { setEditing(0); reload(); }} />}

      <Modal open={!!dlg} onClose={() => setDlg(null)} title={!dlg ? "" : dlg.kind === "supplier" ? (dlg.id ? "Edit supplier" : "Add supplier") : dlg.kind === "barcode" ? (dlg.id ? "Edit barcode" : "Add barcode") : dlg.kind === "unit" ? (dlg.id ? "Edit pack size" : "Add pack size") : dlg.kind === "batch" ? "Add batch" : dlg.id ? "Edit reorder rule" : "Add reorder rule"}
        subtitle={`${p.sku} · ${p.name}`}
        foot={<><button type="button" className="btn secondary" onClick={() => setDlg(null)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={saveDlg}>{busy ? "Saving…" : "Save"}</button></>}>
        {dlg?.kind === "supplier" && (
          <FormGrid>
            <Field label="Vendor" required full error={errs.vendorId}><select value={fs("vendorId")} disabled={!!dlg.id} onChange={(e) => setF("vendorId", e.target.value)}><option value="">Choose…</option>{opts?.vendors.map((v) => <option key={v.id} value={v.id}>{v.code} · {v.name}</option>)}</select></Field>
            <Field label="Their item code" error={errs.vendorItemCode}><input value={fs("vendorItemCode")} onChange={(e) => setF("vendorItemCode", e.target.value)} /></Field>
            <Field label="Last price" error={errs.lastPrice}><input inputMode="decimal" value={fs("lastPrice")} onChange={(e) => setF("lastPrice", e.target.value)} /></Field>
            <Field label="Lead time (days)" error={errs.leadDays}><input inputMode="numeric" value={fs("leadDays")} onChange={(e) => setF("leadDays", e.target.value)} /></Field>
            <Field label="Share of buying (%)" error={errs.sharePct}><input inputMode="decimal" value={fs("sharePct")} onChange={(e) => setF("sharePct", e.target.value)} /></Field>
            <Check label="Preferred supplier (reorder suggestions group by it)" full checked={fb("isPreferred")} onChange={(e) => setF("isPreferred", e.target.checked)} />
          </FormGrid>
        )}
        {dlg?.kind === "barcode" && (
          <FormGrid>
            <Field label="Barcode" required error={errs.barcode}><input inputMode="numeric" maxLength={14} value={fs("barcode")} onChange={(e) => setF("barcode", e.target.value)} /></Field>
            <Field label="Kind" error={errs.kind}><select value={fs("kind")} onChange={(e) => { setF("kind", e.target.value); setF("qtyPerScan", e.target.value === "CARTON" ? String(p.ctn) : "1"); }}><option value="PIECE">Piece</option><option value="CARTON">Carton</option></select></Field>
            <Field label="Qty per scan" error={errs.qtyPerScan} hint={`Base units (${loose}) one scan adds`}><input inputMode="decimal" value={fs("qtyPerScan")} onChange={(e) => setF("qtyPerScan", e.target.value)} /></Field>
            <Check label="Primary for its kind (printed on labels)" checked={fb("isPrimary")} onChange={(e) => setF("isPrimary", e.target.checked)} />
          </FormGrid>
        )}
        {dlg?.kind === "unit" && (
          <FormGrid>
            <Field label="Unit" required error={errs.uomId}><select value={fs("uomId")} disabled={!!dlg.id} onChange={(e) => setF("uomId", e.target.value)}><option value="">Choose…</option>{opts?.units.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}</select></Field>
            <Field label={`Base units (${loose}) per pack`} required error={errs.factor}><input inputMode="decimal" value={fs("factor")} onChange={(e) => setF("factor", e.target.value)} /></Field>
            <Check label="Default when buying" checked={fb("isPurchaseDefault")} onChange={(e) => setF("isPurchaseDefault", e.target.checked)} />
            <Check label="Default when selling" checked={fb("isSalesDefault")} onChange={(e) => setF("isSalesDefault", e.target.checked)} />
          </FormGrid>
        )}
        {dlg?.kind === "batch" && (
          <FormGrid>
            <Field label="Batch number" required error={errs.batchNo}><input value={fs("batchNo")} maxLength={40} onChange={(e) => setF("batchNo", e.target.value)} /></Field>
            <Field label="Unit cost" error={errs.unitCost}><input inputMode="decimal" value={fs("unitCost")} onChange={(e) => setF("unitCost", e.target.value)} /></Field>
            <Field label="Manufactured" error={errs.mfgDate}><input type="date" value={fs("mfgDate")} onChange={(e) => setF("mfgDate", e.target.value)} /></Field>
            <Field label="Expiry" error={errs.expiryDate}><input type="date" value={fs("expiryDate")} onChange={(e) => setF("expiryDate", e.target.value)} /></Field>
            <Field label="Notes" full error={errs.notes}><input value={fs("notes")} onChange={(e) => setF("notes", e.target.value)} /></Field>
          </FormGrid>
        )}
        {dlg?.kind === "rule" && (
          <FormGrid>
            <Field label="Warehouse" full error={errs.warehouseId}><select value={fs("warehouseId")} onChange={(e) => setF("warehouseId", e.target.value)}><option value="">All warehouses</option>{opts?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></Field>
            <Field label={`Low level (${loose})`} required error={errs.lowLevel}><input inputMode="decimal" value={fs("lowLevel")} onChange={(e) => setF("lowLevel", e.target.value)} /></Field>
            <Field label={`High level (${loose})`} required error={errs.highLevel}><input inputMode="decimal" value={fs("highLevel")} onChange={(e) => setF("highLevel", e.target.value)} /></Field>
            <Field label="Lead time (days)" error={errs.leadDays}><input inputMode="numeric" value={fs("leadDays")} onChange={(e) => setF("leadDays", e.target.value)} /></Field>
            <Field label="Safety days" error={errs.safetyDays}><input inputMode="numeric" value={fs("safetyDays")} onChange={(e) => setF("safetyDays", e.target.value)} /></Field>
            <Field label="Alert below (days of cover)" error={errs.coverAlertDays}><input inputMode="numeric" value={fs("coverAlertDays")} onChange={(e) => setF("coverAlertDays", e.target.value)} /></Field>
            <Check label="Active" checked={fb("isActive")} onChange={(e) => setF("isActive", e.target.checked)} />
          </FormGrid>
        )}
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ""} confirmLabel="Remove" danger busy={busy} onConfirm={async () => {
        if (!confirm) return;
        const x = confirm;
        setConfirm(null);
        await run(x.run, x.done);
      }}>{confirm?.body}</ConfirmDialog>

    </>
  );
}
