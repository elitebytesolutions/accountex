"use client";

import { Info, Plus, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { breakFor, marginPct, slabError, type PriceList, type Product } from "@/shared";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { listProducts } from "@/features/inventory/products-api";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { breakItems, getBreaks, saveBreaks } from "../api";
import { MarginBar, fmt, type Can } from "./common";

type Slab = { minQty: string; maxQty: string; unitPrice: string };
const n = (v: string) => (v.trim() === "" ? null : Number(v));

/** Template `app/sales/price-lists` tab "Quantity breaks": slab builder, step chart and the "Try it" calculator. */
export function BreaksTab({ lists, can }: { lists: PriceList[]; can: Can }) {
  const toast = useToast();
  const [listId, setListId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [pq, setPq] = useState("");
  const [picked, setItem] = useState<Product | null>(null);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [loadedFor, setLoadedFor] = useState("");
  const [qty, setQty] = useState(60);
  const [busy, setBusy] = useState(false);
  const [withSlabs, setWithSlabs] = useState<{ id: string; sku: string; name: string; slabs: number }[]>([]);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => listProducts({ page: 1, pageSize: 100, search: pq.trim() || undefined, sort: "name" }).then((r) => !cancelled && setProducts(r.items)).catch(() => undefined), 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pq]);
  // Products with slabs for the chosen list come first; the builder opens on the first of them.
  useEffect(() => {
    let cancelled = false;
    breakItems(listId || null).then((w) => {
      if (cancelled) return;
      setWithSlabs(w);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [listId, saved]);
  const item = picked ?? (withSlabs[0] ? products.find((p) => p.id === withSlabs[0]!.id) : undefined) ?? products[0] ?? null;
  const key = `${listId}|${item?.id ?? ""}`;
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    getBreaks({ priceList: listId || null, product: item.id }).then((b) => {
      if (cancelled) return;
      setSlabs(b.length ? b.map((x) => ({ minQty: String(x.minQty), maxQty: x.maxQty === null ? "" : String(x.maxQty), unitPrice: String(x.unitPrice) })) : [{ minQty: "1", maxQty: "", unitPrice: String(item.price) }]);
      setLoadedFor(`${listId}|${item.id}`);
    }).catch((e: unknown) => !cancelled && toast(apiMessage(e, "Could not load the slabs"), { tone: "danger" }));
    return () => { cancelled = true; };
  }, [listId, item, toast]);

  const parsed = slabs.map((s) => ({ minQty: n(s.minQty) ?? 0, maxQty: n(s.maxQty), unitPrice: n(s.unitPrice) ?? 0 }));
  const err = slabError(parsed);
  const base = parsed[0]?.unitPrice ?? 0;
  const cost = item?.cost ?? 0;
  const hit = breakFor(parsed, qty);
  const unit = hit?.unitPrice ?? base;
  const tierIdx = hit ? parsed.indexOf(hit) : 0;
  const setSlab = (i: number, k: keyof Slab, v: string) => setSlabs((xs) => xs.map((x, j) => {
    if (j === i) return { ...x, [k]: v };
    if (k === "maxQty" && j === i + 1 && v.trim() !== "") return { ...x, minQty: String(Number(v) + 1) };
    return x;
  }));
  const addTier = () => setSlabs((xs) => {
    const last = xs[xs.length - 1];
    const lastMin = Number(last?.minQty || 1), mn = Math.max(lastMin * 2, lastMin + 10);
    return [...xs.slice(0, -1), ...(last ? [{ ...last, maxQty: String(mn - 1) }] : []), { minQty: String(mn), maxQty: "", unitPrice: String(Math.round(Number(last?.unitPrice || item?.price || 0) * 0.96)) }];
  });
  const removeTier = (i: number) => setSlabs((xs) => { const out = xs.filter((_, j) => j !== i); if (out.length) out[out.length - 1] = { ...out[out.length - 1]!, maxQty: "" }; return out; });
  const save = async () => {
    if (!item || err) return;
    setBusy(true);
    try {
      const r = await saveBreaks({ priceListId: listId || null, itemId: item.id, slabs: parsed });
      toast(`${r.length} quantity slab${r.length === 1 ? "" : "s"} saved for ${item.sku}`, { tone: "good" });
      setSaved((n) => n + 1);
    } catch (e) { toast(apiMessage(e, "Could not save the slabs"), { tone: "danger" }); } finally { setBusy(false); }
  };

  // Step chart (template qbChart).
  const W = 560, H = 230, pl = 46, pr = 14, pt = 16, pb = 30;
  const valid = parsed.filter((s) => s.minQty > 0);
  const maxQ = Math.max((valid[valid.length - 1]?.minQty ?? 1) * 1.5, qty * 1.1, 10);
  const maxP = Math.max(base, ...valid.map((s) => s.unitPrice), 1) * 1.04, minP = Math.min(cost * 0.98 || base, ...valid.map((s) => s.unitPrice)) * 0.98;
  const span = maxP - minP || 1;
  const x = (q: number) => pl + (q / maxQ) * (W - pl - pr), y = (p: number) => pt + (1 - (p - minP) / span) * (H - pt - pb);
  let d = "";
  valid.forEach((t, i) => { const x0 = x(t.minQty - (i === 0 ? 1 : 0)), x1 = x(i < valid.length - 1 ? valid[i + 1]!.minQty : maxQ); d += `${i ? "L" : "M"}${x0.toFixed(1)},${y(t.unitPrice).toFixed(1)} L${x1.toFixed(1)},${y(t.unitPrice).toFixed(1)} `; });
  const area = `${d}L${x(maxQ).toFixed(1)},${H - pb} L${x(0).toFixed(1)},${H - pb} Z`;
  const grid = Array.from({ length: 5 }, (_, i) => minP + (span * i) / 4);

  return (
    <div className="split cp-qb-split">
      <div className="panel">
        <div className="panel-head"><div><h3>Quantity-break builder</h3><p>Lower unit prices for bigger orders. Applies on top of the customer&apos;s price list.</p></div>
          <select value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Price list"><option value="">All price lists</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select>
        </div>
        <div className="row" style={{ gap: 8, padding: "0 0 12px" }}>
          <label className="search-field cp-sf" style={{ flex: "0 1 220px" }}><Search /><input placeholder="Find a product…" value={pq} onChange={(e) => setPq(e.target.value)} /></label>
          <select style={{ flex: 1 }} value={item?.id ?? ""} onChange={(e) => { const id = e.target.value; const p = products.find((x) => x.id === id); if (p) setItem(p); else { const w = withSlabs.find((x) => x.id === id); if (w) listProducts({ page: 1, pageSize: 5, search: w.sku }).then((r) => setItem(r.items.find((x) => x.id === id) ?? null)).catch(() => undefined); } }} aria-label="Product">
            {!item && <option value="">Choose a product…</option>}
            {item && !products.some((p) => p.id === item.id) && !withSlabs.some((w) => w.id === item.id) && <option value={item.id}>{item.sku} · {item.name}</option>}
            {withSlabs.length > 0 && <optgroup label="With slabs">{withSlabs.map((w) => <option key={`s${w.id}`} value={w.id}>{w.sku} · {w.name} ({w.slabs} tiers)</option>)}</optgroup>}
            <optgroup label="All products">{products.filter((p) => !withSlabs.some((w) => w.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</optgroup>
          </select>
        </div>
        {item ? (
          <>
            <div className="table-wrap"><table className="tbl lines cp-qb-tbl"><thead><tr><th>Tier</th><th>Min qty</th><th>Max qty</th><th>Unit price (Rs)</th><th className="num">Off base</th><th className="num">Margin</th><th /></tr></thead><tbody>
              {loadedFor === key && slabs.map((t, i) => {
                const p = parsed[i]!;
                return (
                  <tr key={i}>
                    <td><span className="cp-tier">T{i + 1}</span></td>
                    <td><input className="cp-qb-in num" type="number" min={1} value={t.minQty} disabled={!can.approve || i === 0} onChange={(e) => setSlab(i, "minQty", e.target.value)} /></td>
                    <td><input className="cp-qb-in num" type="number" min={1} value={t.maxQty} placeholder="and above" disabled={!can.approve} onChange={(e) => setSlab(i, "maxQty", e.target.value)} /></td>
                    <td><input className="cp-qb-in num" type="number" min={0} value={t.unitPrice} disabled={!can.approve} onChange={(e) => setSlab(i, "unitPrice", e.target.value)} /></td>
                    <td className="num"><span className={`badge ${p.unitPrice < base ? "good" : "neutral"}`}>{p.unitPrice < base && base ? `−${((1 - p.unitPrice / base) * 100).toFixed(1)}%` : "Base"}</span></td>
                    <td className="num"><MarginBar m={p.unitPrice > 0 ? marginPct(p.unitPrice, cost) : null} sm /></td>
                    <td>{i > 0 && can.approve && <button type="button" className="icon-btn-sm cp-qb-x" title="Remove tier" aria-label="Remove tier" onClick={() => removeTier(i)}><Trash2 /></button>}</td>
                  </tr>
                );
              })}
            </tbody></table></div>
            {err && <p style={{ color: "var(--danger)", margin: "8px 0 0" }}>{err}</p>}
            {can.approve && <div className="row cp-mt"><button type="button" className="btn ghost sm" onClick={addTier}><Plus />Add tier</button><span className="spacer" /><button type="button" className="btn primary sm" disabled={busy || !!err} onClick={save}><Save />{busy ? "Saving…" : "Save slabs"}</button></div>}
            <div className="cp-qb-chart">
              <svg viewBox={`0 0 ${W} ${H}`} className="cp-qb-svg" preserveAspectRatio="none">
                {grid.map((g, i) => <g key={i}><line x1={pl} x2={W - pr} y1={y(g)} y2={y(g)} className="gl" /><text x={pl - 8} y={y(g) + 4} className="ax" textAnchor="end">{fmt(g, span < 20 ? 1 : 0)}</text></g>)}
                {cost > 0 && <><line x1={pl} x2={W - pr} y1={y(cost)} y2={y(cost)} className="cost" /><text x={W - pr} y={y(cost) - 6} className="ax cost-t" textAnchor="end">Cost {fmt(cost)}</text></>}
                {d && <><path d={area} className="ar" /><path d={d} className="ln" /></>}
                {valid.map((t, i) => <g key={i}><circle cx={x(t.minQty)} cy={y(t.unitPrice)} r={4.5} className="pt" /><text x={x(t.minQty) + 6} y={y(t.unitPrice) - 8} className="tl">T{i + 1} · {fmt(t.unitPrice)}</text><text x={x(t.minQty)} y={H - 10} className="ax" textAnchor="middle">{fmt(t.minQty)}</text></g>)}
                <line x1={x(qty)} x2={x(qty)} y1={pt} y2={H - pb} className="you" /><circle cx={x(qty)} cy={y(unit)} r={6} className="you-pt" />
              </svg>
            </div>
          </>
        ) : <EmptyState title="No products yet" description="Products from the catalogue can get quantity slabs." />}
      </div>
      <div className="stack">
        <div className="panel cp-qb-calc">
          <div className="panel-head"><div><h3>Try it</h3><p>What would this order cost?</p></div></div>
          <label className="cp-qb-q"><span>Order quantity</span>
            <input type="range" min={1} max={300} value={Math.min(qty, 300)} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} />
          </label>
          <div className="cp-qb-res"><div><small>Unit price</small><b>Rs {fmt(unit)}</b></div><div><small>Order total</small><b>Rs {fmt(unit * qty)}</b></div></div>
          <p className="cp-qb-save">{base * qty > unit * qty ? <>Saves <b>Rs {fmt(base * qty - unit * qty)}</b> vs base price (T{tierIdx + 1})</> : `Base price applies (T1).${parsed[1] ? ` Next tier at ${fmt(parsed[1].minQty)} ${item?.uom.code ?? ""}.` : ""}`}</p>
        </div>
        <div className="banner info"><Info /><div><b>Stacking rules</b><p>Quantity breaks stack with schemes, but never take the line below cost. Applying them to documents comes with the sales phases.</p></div></div>
      </div>
    </div>
  );
}
