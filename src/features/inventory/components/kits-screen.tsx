"use client";

import { Boxes, Hammer, Minus, PackageOpen, PackagePlus, Plus, Save, Search, Trash2, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KIT_ICONS, KIT_TONES, kitFigures, kitsBuildable, type Kit, type Product } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createKit, deleteKit, listKits, listProducts, updateKit } from "../products-api";
import { NamedIcon } from "./named-icon";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Comp = { itemId: string; sku: string; name: string; cost: number; price: number; ctn: number; uomCode: string; icon: string | null; onHand: number; qty: number };
type Draft = { id: string | null; code: string; rowVersion: number; name: string; icon: string; tone: string; sellingPrice: number; targetMarginPct: number; comps: Comp[]; inStock: number };
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number) => `${n < 0 ? "−" : ""}${fmt(Math.abs(n), 1)}%`;
const mTone = (m: number) => (m < 0 ? "bad" : m < 10 ? "low" : "ok");
const stockTone = (p: { onHand: number }, low = 0) => (p.onHand <= Math.max(1, Math.round(low / 4)) ? "red" : p.onHand <= low ? "amber" : "green");
const fromKit = (k: Kit): Draft => ({
  id: k.id, code: k.code, rowVersion: k.rowVersion, name: k.name, icon: k.icon, tone: k.tone, sellingPrice: k.sellingPrice, targetMarginPct: k.targetMarginPct, inStock: k.inStock,
  comps: k.components.map((c) => ({ itemId: c.product.id, sku: c.product.sku, name: c.product.name, cost: c.product.cost, price: c.product.price, ctn: c.product.ctn, uomCode: c.product.uomCode, icon: c.product.classIcon, onHand: c.onHand, qty: c.qtyPerKit })),
});
const blank = (): Draft => ({ id: null, code: "New", rowVersion: 0, name: "New Bundle", icon: "package-plus", tone: "green", sellingPrice: 0, targetMarginPct: 25, comps: [], inStock: 0 });

/** Template app/inventory/kits (4B-products.html + 9F-products.js §5): kit cards and the bill-of-materials builder with live costing. */
export function KitsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [kits, setKits] = useState<Kit[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [d, setD] = useState<Draft | null>(null);
  const [pick, setPick] = useState("");
  const [q, setQ] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listKits()
      .then((k) => { if (!cancelled) { setKits(k); setError(null); setD((cur) => { const keep = cur?.id ? k.find((x) => x.id === cur.id) : null; return keep ? fromKit(keep) : cur && !cur.id ? cur : k[0] ? fromKit(k[0]) : null; }); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load kits" }));
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listProducts({ page: 1, pageSize: 100, search: q || undefined, sort: "name" }).then((r) => !cancelled && setProducts(r.items.filter((p) => !p.isKit && p.status !== "INACTIVE"))).catch(() => undefined);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const fig = useMemo(() => (d ? kitFigures(d.comps.map((c) => ({ cost: c.cost, price: c.price, qty: c.qty })), d.sellingPrice, d.targetMarginPct) : null), [d]);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const edit = d && (d.id ? can.edit : can.create);
  const patch = (p: Partial<Draft>) => setD((x) => (x ? { ...x, ...p } : x));
  const setQty = (id: string, qty: number) => setD((x) => (x ? { ...x, comps: x.comps.map((c) => (c.itemId === id ? { ...c, qty: Math.max(1, qty) } : c)) } : x));
  const add = () => {
    const p = products.find((x) => x.id === pick);
    if (!p || !d) return;
    patch({ comps: [...d.comps, { itemId: p.id, sku: p.sku, name: p.name, cost: p.cost, price: p.price, ctn: p.ctn, uomCode: p.uom.code, icon: p.productClass?.icon ?? null, onHand: p.onHand, qty: 1 }] });
    setPick("");
  };
  const save = async () => {
    if (!d) return;
    setBusy(true);
    setErrs({});
    const body = { name: d.name, icon: d.icon, tone: d.tone, sellingPrice: d.sellingPrice, targetMarginPct: d.targetMarginPct, components: d.comps.map((c) => ({ itemId: c.itemId, qtyPerKit: c.qty })) };
    try {
      const k = d.id ? await updateKit(d.id, { ...body, rowVersion: d.rowVersion }) : await createKit(body);
      setD(fromKit(k));
      toast(`${k.code} · ${k.name} saved · cost Rs ${fmt(fig?.cost ?? 0, 2)}, price Rs ${fmt(k.sellingPrice, 2)}`, { tone: "good" });
      reload();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the kit"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const used = new Set(d?.comps.map((c) => c.itemId));

  return (
    <>
      <div className="pr-head">
        <span className="pr-cube"><PackagePlus /></span>
        <div className="pr-head-t"><h1>Kits &amp; Bundles</h1><p>Bundle products into gift hampers and starter packs, cost them live and assemble from stock.</p></div>
        <div className="pr-head-act"><span className="tagline pr-tag">Bundle more, sell more</span>{can.create && <button className="btn primary" type="button" onClick={() => { setErrs({}); setD(blank()); }}><Plus />New Kit</button>}</div>
      </div>
      <div className="pr-kit-layout">
        <div className="pr-kit-list">
          {!kits ? <Skeleton style={{ height: 160 }} /> : kits.map((k, i) => {
            const f = kitFigures(k.components.map((c) => ({ cost: c.product.cost, price: c.product.price, qty: c.qtyPerKit })), k.sellingPrice, k.targetMarginPct);
            const on = d?.id === k.id;
            return (
              <article key={k.id} className={cn("pr-kcard", on && "on")} style={{ ["--i" as string]: i }} tabIndex={0} role="button" aria-pressed={on}
                onClick={() => { setErrs({}); setD(fromKit(k)); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setErrs({}); setD(fromKit(k)); } }}>
                <div className="pr-kc-top"><span className={cn("icon-tile", k.tone)}><NamedIcon name={k.icon} /></span><div><b>{k.name}</b><small>{k.code} · {k.components.length} components{k.status !== "ACTIVE" ? ` · ${k.status === "DRAFT" ? "Draft" : "Inactive"}` : ""}</small></div><span className={cn("pr-mchip sm", mTone(f.margin))}><b>{pct(f.margin)}</b></span></div>
                <div className="pr-kc-comps">{k.components.slice(0, 4).map((c) => <span key={c.id} title={c.product.name}><span className="pr-tile xs"><NamedIcon name={c.product.classIcon ?? "package"} /></span><em>×{fmt(c.qtyPerKit)}</em></span>)}{k.components.length > 4 && <span className="pr-more">+{k.components.length - 4}</span>}</div>
                <div className="pr-kc-foot"><div><small>Cost</small><b>Rs {fmt(f.cost)}</b></div><div><small>Price</small><b>Rs {fmt(k.sellingPrice)}</b></div><div><small>In stock</small><b>{fmt(k.inStock)}</b></div><div><small>Can build</small><b>{fmt(kitsBuildable(k.components.map((c) => ({ onHand: c.onHand, qty: c.qtyPerKit }))))}</b></div></div>
              </article>
            );
          })}
          {can.create && <button className="pr-kcard pr-kadd" type="button" onClick={() => { setErrs({}); setD(blank()); }}><Plus /><span>New kit or bundle</span></button>}
        </div>

        <div className="pr-kit-builder">
          {d && fig ? (
            <div className="pr-card pr-kb">
              <div className="pr-kb-head">
                <span className={cn("icon-tile", d.tone)}><NamedIcon name={d.icon} /></span>
                <div className="pr-kb-name"><input value={d.name} readOnly={!edit} onChange={(e) => patch({ name: e.target.value })} aria-label="Kit name" />
                  <small>{d.id ? d.code : "Code on save"} · Bill of materials · {fmt(d.inStock)} assembled in stock</small>
                  {errs.name && <small className="pr-err">{errs.name}</small>}</div>
                <div className="pr-kb-acts">
                  {edit && <>
                    <select aria-label="Kit icon" style={{ width: "auto", minWidth: 0 }} value={d.icon} onChange={(e) => patch({ icon: e.target.value })}>{KIT_ICONS.map((x) => <option key={x} value={x}>{x.replace(/-/g, " ")}</option>)}</select>
                    <select aria-label="Kit colour" style={{ width: "auto", minWidth: 0 }} value={d.tone} onChange={(e) => patch({ tone: e.target.value })}>{KIT_TONES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                  </>}
                  {d.id && can.remove && <button className="btn secondary" type="button" onClick={() => setConfirm(true)}><Trash2 />Delete</button>}
                  <button className="btn secondary" type="button" disabled title="Assembly vouchers arrive with the stock phases"><PackageOpen />Disassemble</button>
                  <button className="btn primary" type="button" disabled title="Assembly vouchers arrive with the stock phases"><Hammer />Assemble</button>
                </div>
              </div>
              <div className="pr-kb-grid">
                <div className="pr-kb-comps">
                  <div className="pr-tw"><table className="tbl pr-kb-tbl"><thead><tr><th>Component</th><th>Qty per kit</th><th className="num">Unit cost</th><th className="num">Line cost</th><th className="num">On hand</th><th /></tr></thead><tbody>
                    {d.comps.length ? d.comps.map((c, i) => (
                      <tr key={c.itemId} style={{ ["--i" as string]: i }}>
                        <td><div className="pr-kcomp"><span className="pr-tile sm"><NamedIcon name={c.icon ?? "package"} /></span><div><b>{c.name}</b><small>{c.sku} · {c.ctn > 1 ? `CTN ${c.ctn} × ${c.uomCode}` : `Single ${c.uomCode}`}</small></div></div></td>
                        <td><div className="pr-step sm"><button type="button" disabled={!edit} onClick={() => setQty(c.itemId, c.qty - 1)} aria-label="Less"><Minus /></button><input type="number" min={1} value={c.qty} readOnly={!edit} onChange={(e) => setQty(c.itemId, Math.floor(Number(e.target.value) || 1))} aria-label="Quantity" /><button type="button" disabled={!edit} onClick={() => setQty(c.itemId, c.qty + 1)} aria-label="More"><Plus /></button></div></td>
                        <td className="num">{fmt(c.cost, 2)}</td><td className="num"><b>{fmt(c.cost * c.qty, 2)}</b></td>
                        <td className="num"><span className={cn("pr-stock", stockTone(c))}>{fmt(c.onHand)}</span><small>{fmt(Math.floor(c.onHand / c.qty))} kits</small></td>
                        <td>{edit && <button className="pr-iconbtn" type="button" aria-label="Remove component" onClick={() => patch({ comps: d.comps.filter((x) => x.itemId !== c.itemId) })}><Trash2 /></button>}</td>
                      </tr>
                    )) : <tr><td colSpan={6} className="pr-bp-empty">Add components below to start costing this kit.</td></tr>}
                  </tbody></table></div>
                  {errs.components && <p className="pr-err">{errs.components}</p>}
                  {edit && (
                    <div className="pr-kb-add">
                      <label className="pr-ctl"><Search /><input type="search" placeholder="Find a product…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a product" /></label>
                      <label className="pr-ctl"><select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add component"><option value="">Add a component…</option>{products.filter((p) => !used.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name} · Rs {fmt(p.cost)}</option>)}</select></label>
                      <button className="btn secondary" type="button" disabled={!pick} onClick={add}><Plus />Add</button>
                    </div>
                  )}
                </div>
                <aside className="pr-kb-roll">
                  <div className="pr-roll-row"><small>Total component cost</small><b className="pr-roll-big">Rs {fmt(fig.cost, 2)}</b></div>
                  <div className="pr-roll-row"><small>Bought separately (retail)</small><b>Rs {fmt(fig.retail)}</b></div>
                  <div className="pr-roll-sl"><div className="pr-roll-slh"><small>Target margin</small><b>{d.targetMarginPct}%</b></div><input type="range" min={5} max={50} step={1} value={d.targetMarginPct} disabled={!edit} onChange={(e) => patch({ targetMarginPct: Number(e.target.value) })} aria-label="Target margin" /></div>
                  <div className="pr-roll-sug"><div><small>Suggested price</small><b>Rs {fmt(fig.suggested)}</b></div>{edit && <button className="btn secondary sm" type="button" onClick={() => patch({ sellingPrice: fig.suggested })}><WandSparkles />Use</button>}</div>
                  <label className="pr-ff"><span>Kit selling price</span><div className="pr-inaff"><b>Rs</b><input type="number" min={0} value={d.sellingPrice} readOnly={!edit} onChange={(e) => patch({ sellingPrice: Math.max(0, Number(e.target.value) || 0) })} /></div>{errs.sellingPrice && <small className="pr-err">{errs.sellingPrice}</small>}</label>
                  <div className="pr-roll-m">
                    <span className={cn("pr-mchip", mTone(fig.margin))}><small>Margin</small><b>{pct(fig.margin)}</b><em>Rs {fmt(fig.marginAmount)} / kit</em></span>
                    <span className="pr-mchip info"><small>Customer saves</small><b>{pct(fig.saving)}</b><em>vs buying separately</em></span>
                  </div>
                  <div className="pr-roll-build"><Boxes /><span>Stock can build <b>{fmt(kitsBuildable(d.comps.map((c) => ({ onHand: c.onHand, qty: c.qty }))))}</b> more kits</span></div>
                  {edit && <button className="btn lime block" type="button" disabled={busy} onClick={save}><Save /><span>{busy ? "Saving…" : "Save kit"}</span></button>}
                  {fig.margin < 0 && <small className="pr-muted-p">Priced below cost: the kit saves as a draft product until the price covers the cost.</small>}
                </aside>
              </div>
            </div>
          ) : kits && (
            <div className="pr-card"><div className="pr-emptybox"><span><PackagePlus /></span><b>No kits yet</b><small>{can.create ? "Create a kit to bundle products and cost it live." : "Kits your team creates appear here."}</small></div></div>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${d?.code} · ${d?.name}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!d?.id) return;
        setConfirm(false);
        setBusy(true);
        try { await deleteKit(d.id, d.rowVersion); toast(`${d.name} deleted`, { tone: "danger" }); setD(null); reload(); } catch (e) { toast(apiMessage(e, "Could not delete the kit"), { tone: "danger" }); } finally { setBusy(false); }
      }}>The kit and the product it sells as are removed. Kits already used on documents can only be deactivated.</ConfirmDialog>
    </>
  );
}
