"use client";

import { CalendarX, Check, Eye, Handshake, Package, PackageOpen, TriangleAlert, Weight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LoadSheet, LoadSheetList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const nice = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}`;
};
export const niceShort = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]}`;
};
export const dayOf = (iso: string) => DOW[new Date(`${iso.slice(0, 10)}T00:00:00`).getDay()];
export const fmt = (n: number, d = 0) => n.toLocaleString("en-PK", { minimumFractionDigits: d, maximumFractionDigits: d });
export const money = (n: number) => `Rs ${fmt(Math.round(n))}`;
export const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(a >= 1e6 ? 1 : 2)} L`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
};

/** LOADING → "Loading" etc.; tones as the template's STATUS_TONE. */
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  LOADING: { label: "Loading", tone: "warn" },
  SCHEDULED: { label: "Scheduled", tone: "neutral" },
  DISPATCHED: { label: "Dispatched", tone: "info" },
  SETTLED: { label: "Settled", tone: "good" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};
export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function DsEmpty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return <div className="ds-empty">{icon}<b>{title}</b>{children && <small>{children}</small>}</div>;
}

/** Template van-capacity panel: SVG van filling with the load, carton meter, stats and the action buttons. */
export function CapacityPanel({ plate, vanLabel, capCtn, ctnEq, invoices, shops, skus, value, actions }: {
  plate: string; vanLabel: string; capCtn: number; ctnEq: number; invoices: number; shops: number; skus: number | null; value: number; actions: ReactNode;
}) {
  const pc = capCtn ? (ctnEq / capCtn) * 100 : 0;
  const state = pc > 100 ? "over" : pc >= 85 ? "warn" : "";
  return (
    <div className={cn("panel ds-capacity", state)}>
      <div className="panel-head"><div><h3>Van capacity</h3><p>{vanLabel}</p></div>
        <Badge tone={pc > 100 ? "danger" : pc >= 85 ? "warn" : "good"}>{pc > 100 ? "Over capacity" : pc >= 85 ? "Nearly full" : "Fits"}</Badge></div>
      <div className="ds-van-wrap">
        <svg className="ds-van" viewBox="0 0 250 118" aria-hidden="true">
          <defs><clipPath id="ds-van-clip"><rect x="8" y="12" width="156" height="70" rx="9" /></clipPath></defs>
          <rect className="ds-van-box" x="8" y="12" width="156" height="70" rx="9" />
          <g clipPath="url(#ds-van-clip)"><rect className="ds-van-fill" x="8" y="12" width="156" height="70" style={{ transform: `scaleX(${Math.min(1, pc / 100)})` }} />
            <g className="ds-van-crates">{Array.from({ length: 9 }, (_, i) => <line key={i} x1={8 + (i + 1) * 15.6} y1="12" x2={8 + (i + 1) * 15.6} y2="82" />)}<line x1="8" y1="47" x2="164" y2="47" /></g></g>
          <path className="ds-van-cab" d="M168 30 h40 q8 0 13 7 l17 22 q4 5 4 12 v11 h-74 z" />
          <path className="ds-van-win" d="M176 37 h28 q4 0 7 4 l12 16 h-47 z" />
          <rect className="ds-van-chassis" x="6" y="82" width="238" height="8" rx="4" />
          <g className="ds-wheel"><circle cx="48" cy="94" r="14" /><circle className="hub" cx="48" cy="94" r="5" /></g>
          <g className="ds-wheel"><circle cx="203" cy="94" r="14" /><circle className="hub" cx="203" cy="94" r="5" /></g>
          <text className="ds-van-plate" x="225" y="80" textAnchor="middle">{plate}</text>
        </svg>
        <div className="ds-van-pct"><b>{Math.round(pc)}%</b><small>of carton space</small></div>
      </div>
      <div className={cn("ds-meter", state)}>
        <div className="ds-meter-top"><span><Package />Cartons</span><b>{fmt(Math.round(ctnEq))} <small>/ {fmt(capCtn)}</small></b></div>
        <div className="ds-track"><i style={{ width: `${Math.min(100, pc)}%` }} /><em style={{ width: pc > 100 ? `${Math.min(40, pc - 100)}%` : "0%" }} /></div>
      </div>
      <div className="ds-meter">
        <div className="ds-meter-top"><span><Weight />Weight (kg)</span><b>— <small>not tracked</small></b></div>
        <div className="ds-track"><i style={{ width: 0 }} /><em /></div>
      </div>
      {pc > 100 && (
        <div className="ds-over"><TriangleAlert /><div><b>Over capacity</b><small>{(ctnEq - capCtn).toFixed(1)} cartons over {plate}. Drop an invoice or switch to a bigger van.</small></div></div>
      )}
      <div className="ds-capstats">
        <div><small>Invoices</small><b>{invoices}</b></div><div><small>Shops</small><b>{shops}</b></div>
        <div><small>SKU lines</small><b>{skus ?? "—"}</b></div><div><small>Value</small><b>Rs {compact(value)}</b></div>
      </div>
      <div className="ds-capactions ds-ls-print-hide">{actions}</div>
    </div>
  );
}

/** Consolidated load list (pick list) of a saved run. */
export function LoadList({ sheet, picked, onPick, onPickAll }: { sheet: LoadSheet | null; picked: Set<string>; onPick: (id: string, on: boolean) => void; onPickAll: () => void }) {
  const lines = sheet?.lines ?? [];
  const k = lines.filter((l) => picked.has(l.id)).length;
  const t = lines.reduce((a, l) => ({ c: a.c + l.qtyCtn, p: a.p + l.qtyLoose, pcs: a.pcs + l.baseQty, val: a.val + l.value }), { c: 0, p: 0, pcs: 0, val: 0 });
  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Consolidated load list</h3><p>Every SKU across the selected invoices, broken into cartons and loose pieces for the store keeper.</p></div>
        <div className="panel-actions ds-pickprog ds-ls-print-hide">
          <div className="ds-pickbar"><i style={{ width: lines.length ? `${(k / lines.length) * 100}%` : "0%" }} /></div>
          <span className="small muted">{k} of {lines.length} picked</span>
          <button type="button" className="btn secondary sm" onClick={onPickAll} disabled={!lines.length}>Mark all picked</button>
        </div></div>
      <div className="table-wrap"><table className="tbl ds-tbl ds-loadtbl" data-plain>
        <thead><tr><th style={{ width: 44 }}>✓</th><th>SKU</th><th>Product</th><th className="num">CTN</th><th className="num">PCS</th><th className="num">Total pcs</th><th className="num">Weight</th><th className="num">Value</th></tr></thead>
        <tbody>
          {!lines.length ? (
            <tr><td colSpan={8}><DsEmpty icon={<PackageOpen />} title="Nothing to load yet">{sheet ? "This run has no lines." : "Tick invoices in the run builder and save the run: the pick list builds from their lines."}</DsEmpty></td></tr>
          ) : lines.map((l, i) => (
            <tr key={l.id} className={cn("ds-rowin", picked.has(l.id) && "ds-picked")} style={{ ["--i" as string]: i }}>
              <td><label className="ds-check"><input type="checkbox" checked={picked.has(l.id)} onChange={(e) => onPick(l.id, e.target.checked)} aria-label={`Picked ${l.item.sku}`} /><span><Check /></span></label></td>
              <td><span className="ds-sku">{l.item.sku}</span></td>
              <td><b>{l.item.name}</b><small>{fmt(l.ctnEquiv, 1)} ctn equivalent</small></td>
              <td className="num"><b>{fmt(l.qtyCtn)}</b></td><td className="num">{l.qtyLoose ? fmt(l.qtyLoose) : <span className="zero">—</span>}</td>
              <td className="num">{fmt(l.baseQty)}</td><td className="num"><span className="zero">—</span></td><td className="num">{money(l.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td /><td colSpan={2}>Total · {lines.length} SKUs</td><td className="num">{fmt(t.c)}</td><td className="num">{fmt(t.p)}</td><td className="num">{fmt(t.pcs)}</td><td className="num">—</td><td className="num">{money(t.val)}</td></tr></tfoot>
      </table></div>
    </div>
  );
}

const RUN_TABS = [
  { key: "LOADING", label: "Loading" }, { key: "SCHEDULED", label: "Scheduled" }, { key: "DISPATCHED", label: "Dispatched" }, { key: "SETTLED", label: "Settled" }, { key: "CANCELLED", label: "Cancelled" },
];

/** Runs table with status tabs (template "Runs" panel). */
export function RunsPanel({ tab, onTab, list, loading, currentId, onOpen }: { tab: string; onTab: (t: string) => void; list: LoadSheetList | null; loading: boolean; currentId: string | null; onOpen: (id: string) => void }) {
  const rows = list?.items ?? [];
  return (
    <div className="panel flush ds-ls-print-hide">
      <div className="panel-head"><div><h3>Runs</h3><p>Every van trip with its load, departure and settlement status.</p></div>
        <div className="seg">{RUN_TABS.map((t) => (
          <button key={t.key} type="button" className={cn(tab === t.key && "active")} onClick={() => onTab(t.key)}>{t.label}{list?.counts[t.key] ? ` · ${list.counts[t.key]}` : ""}</button>
        ))}</div></div>
      <div className="table-wrap"><table className="tbl ds-tbl" data-plain>
        <thead><tr><th>Run</th><th>Route</th><th>Van · Driver</th><th>Date</th><th>Departs</th><th className="num">Invoices</th><th className="num">CTN</th><th className="num">Value</th><th>Status</th><th /></tr></thead>
        <tbody>
          {loading && !rows.length ? (
            <tr><td colSpan={10}><div className="skeleton" style={{ height: 80 }} /></td></tr>
          ) : !rows.length ? (
            <tr><td colSpan={10}><DsEmpty icon={<CalendarX />} title="No runs here">Runs show up as you schedule and dispatch them.</DsEmpty></td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id} className={cn("ds-rowin", r.id === currentId && "on")} style={{ ["--i" as string]: i }}>
              <td><b>{r.docNo}</b><small>{r.status === "LOADING" ? "Draft in builder" : r.gatePassNo ? `Gate pass ${r.gatePassNo}` : "Load sheet"}</small></td>
              <td><span className="ds-rt">{r.route.code}</span> {r.route.name}</td>
              <td><b>{r.vehicle.regNo}</b><small>{r.driver?.name ?? "—"}</small></td>
              <td>{nice(r.docDate)}<small>{dayOf(r.docDate)}</small></td><td>{r.departureTime}</td>
              <td className="num">{r.invoiceCount}</td><td className="num">{r.totalCtnEquiv ? r.totalCtnEquiv.toFixed(0) : "—"}</td>
              <td className="num">{r.totalValue ? money(r.totalValue) : <span className="zero">—</span>}</td>
              <td><StatusPill status={r.status} /></td>
              <td className="actions">
                {r.status === "DISPATCHED" && r.settlement
                  ? <Link className="btn secondary sm" href={`/wholesale/settlement?id=${r.settlement.id}`}><Handshake />Settle</Link>
                  : <button type="button" className="btn ghost sm" onClick={() => onOpen(r.id)}><Eye />{r.status === "LOADING" ? "Builder" : "View"}</button>}
              </td>
            </tr>
          ))}
        </tbody></table></div>
    </div>
  );
}

