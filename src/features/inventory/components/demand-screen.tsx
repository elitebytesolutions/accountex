"use client";

import { Boxes, ChevronRight, CircleCheck, ClipboardList, FilePlus, ShoppingCart, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ReorderSuggestion } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { reorderSuggestions } from "../products-api";

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const rowKey = (r: ReorderSuggestion) => `${r.product.id}|${r.warehouse?.id ?? ""}`;

/**
 * Template app/inventory/demand (4C-stock-ops.html + 9G-stock-ops.js §7), Reorder Suggestions tab only. The Demand of Goods
 * tab arrives in Phase 22; Send to demand / Create POs with purchase orders (Phase 19).
 */
export function DemandScreen() {
  const [rows, setRows] = useState<ReorderSuggestion[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [ctn, setCtn] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    reorderSuggestions()
      .then((r) => { if (!cancelled) { setRows(r); setSel(new Set(r.map(rowKey))); setCtn({}); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load reorder suggestions" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const cartons = (r: ReorderSuggestion) => ctn[rowKey(r)] ?? r.suggestCartons;
  const value = (r: ReorderSuggestion) => cartons(r) * Math.max(1, r.product.ctn) * r.product.cost;
  const groups = new Map<string, { name: string; code: string | null; preferred: boolean; rows: ReorderSuggestion[] }>();
  rows?.forEach((r) => {
    const k = r.supplier?.id ?? "";
    const g = groups.get(k) ?? { name: r.supplier?.name ?? "No preferred supplier", code: r.supplier?.code ?? null, preferred: !!r.supplier, rows: [] };
    g.rows.push(r);
    groups.set(k, g);
  });
  const chosen = rows?.filter((r) => sel?.has(rowKey(r))) ?? [];
  const toggle = (keys: string[], on: boolean) => setSel((s) => { const n = new Set(s); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); return n; });

  return (
    <div className="so-root">
      <div className="so-dm">
        <div className="so-dm-head">
          <div className="so-head">
            <span className="so-head-ico"><Boxes /></span>
            <div className="so-head-t"><div className="so-crumb">Inventory <ChevronRight /> <b>Demand &amp; Reorder</b></div><h1>Reorder Suggestions</h1><p>Items running low, grouped by preferred supplier</p></div>
            <div className="so-head-r">
              <span className="tagline so-tagline">Stock today · business tomorrow</span>
              <div className="so-dtabs r">
                <button type="button" disabled title="Demand of Goods arrives in Phase 22"><ShoppingCart />Demand of Goods</button>
                <button type="button" className="on"><Sparkles />Reorder Suggestions<em>{rows?.length ?? 0}</em></button><i />
              </div>
            </div>
          </div>
        </div>
        <div className="so-dm-pane">
          {!rows ? <Skeleton style={{ height: 220 }} /> : (
            <>
              <div className="so-ro-top">
                <div className="banner info"><Sparkles /><div><b>{rows.length ? `${rows.length} product${rows.length === 1 ? "" : "s"} need reordering` : "Nothing needs reordering"}</b>
                  <p>Below the low level, or less than the cover-alert days of cover at the current sales rate. Suggestions top up to the high level plus the lead and safety days of sales, in whole cartons. Set levels per warehouse on each product&apos;s Reorder settings.</p></div></div>
              </div>
              {rows.length ? (
                <div className="so-ro-grid">
                  {[...groups.entries()].map(([k, g], gi) => {
                    const keys = g.rows.map(rowKey);
                    const all = keys.every((x) => sel?.has(x));
                    return (
                      <div key={k} className="panel flush so-rog" style={{ ["--i" as string]: gi }}>
                        <div className="so-rog-h"><label className="so-ck"><input type="checkbox" checked={all} onChange={(e) => toggle(keys, e.target.checked)} aria-label={`Select ${g.name}`} /><span /></label>
                          <span className="so-rog-av" style={{ ["--c" as string]: "var(--primary)" }}>{initials(g.name)}</span><div><b>{g.name}</b><small>{g.rows.length} item{g.rows.length > 1 ? "s" : ""} · {g.preferred ? `preferred supplier${g.code ? ` · ${g.code}` : ""}` : "add a preferred supplier on the product"}</small></div>
                          <span className="spacer" /><b className="so-rog-v">Rs {fmt(g.rows.reduce((s, r) => s + value(r), 0))}</b></div>
                        <table className="tbl so-rot"><thead><tr><th /><th>Product</th><th className="num">On hand</th><th className="num">Low</th><th className="num">Avg / day</th><th>Cover</th><th className="num">Suggest CTN</th><th className="num">Value</th></tr></thead><tbody>
                          {g.rows.map((r) => {
                            const rk = rowKey(r);
                            const d = r.coverDays;
                            return (
                              <tr key={rk}>
                                <td><label className="so-ck"><input type="checkbox" checked={!!sel?.has(rk)} onChange={(e) => toggle([rk], e.target.checked)} aria-label={`Select ${r.product.sku}`} /><span /></label></td>
                                <td><b><Link href={`/inventory/products/${r.product.id}`} style={{ color: "inherit", textDecoration: "none" }}>{r.product.name}</Link></b><small>{r.product.sku}{r.warehouse ? ` · ${r.warehouse.name}` : ""}</small></td>
                                <td className={cn("num", r.onHand <= r.lowLevel && "neg")}>{fmt(r.onHand)}</td><td className="num">{fmt(r.lowLevel)}</td><td className="num">{fmt(r.avgDaily, r.avgDaily % 1 ? 1 : 0)}</td>
                                <td>{d === null ? <span className="so-cover r"><i style={{ width: "0%" }} />{r.onHand <= 0 ? "0 days" : "No sales yet"}</span> : <span className={cn("so-cover", d < 7 ? "r" : d < 14 ? "w" : "i")}><i style={{ width: `${Math.min(100, (d / 30) * 100)}%` }} />{d} days</span>}</td>
                                <td className="num"><input type="number" min={1} className="so-ro-ctn" value={cartons(r)} onChange={(e) => setCtn((c) => ({ ...c, [rk]: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))} aria-label={`Cartons of ${r.product.sku}`} /><small>{fmt(cartons(r) * Math.max(1, r.product.ctn))} {r.product.uomCode}</small></td>
                                <td className="num">{fmt(value(r))}</td>
                              </tr>
                            );
                          })}
                        </tbody></table>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="panel"><div className="so-empty"><CircleCheck /><b>Stock is healthy</b><span>Every product is above its low level.</span></div></div>}
              <div className="so-ro-foot"><div><b className="so-ro-n">{chosen.length}</b> items from <b>{new Set(chosen.map((r) => r.supplier?.id ?? "")).size}</b> suppliers selected · <b>Rs {fmt(chosen.reduce((s, r) => s + value(r), 0))}</b></div><span className="spacer" />
                <button className="btn secondary" type="button" disabled title="Demand of Goods arrives in Phase 22"><ClipboardList />Send to demand</button>
                <button className="btn primary" type="button" disabled title="Purchase orders arrive in Phase 19"><FilePlus />Create POs</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
