"use client";

import { Pencil, Plus, Save, Search, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { marginPct, type PriceList, type PriceListRow } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog } from "@/components/ui/overlay";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { bulkPrices, priceListRows } from "../api";
import { MarginBar, Pager, dstr, fmt, mTone, today, type Can } from "./common";

const PAGE = 50;
const DOTS = ["green", "blue", "orange", "violet"];

/** Template `app/sales/price-lists` tab "Price lists": the lists (left) and the selected list's price grid with live margins (right). */
export function ListsTab({ lists, loading, cur, setCur, classes, can, onEdit, onNew, onChanged }: {
  lists: PriceList[];
  loading: boolean;
  cur: string | null;
  setCur: (id: string) => void;
  classes: { id: string; name: string }[];
  can: Can;
  onEdit: (l: PriceList) => void;
  onNew: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const list = lists.find((l) => l.id === cur) ?? null;
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [markup, setMarkup] = useState<string | null>(null);
  const [from, setFrom] = useState(today());
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const key = JSON.stringify([cur, page, cat, q, attempt]);
  useEffect(() => {
    if (!cur) return;
    let cancelled = false;
    priceListRows(cur, { page, pageSize: PAGE, search: q || undefined, class: cat || undefined })
      .then((r) => { if (!cancelled) { setRows(r.items); setTotal(r.total); setLoadedKey(key); } })
      .catch((e: unknown) => { if (!cancelled) { toast(apiMessage(e, "Could not load prices"), { tone: "danger" }); setLoadedKey(key); } });
    return () => { cancelled = true; };
  }, [cur, page, cat, q, attempt, key, toast]);

  const priceOf = (r: PriceListRow) => (dirty[r.product.id] !== undefined ? Number(dirty[r.product.id]) || 0 : r.price);
  const mk = markup ?? list?.markupPct?.toString() ?? "";
  const changed = Object.keys(dirty).length;
  const visible = rows.map((r) => priceOf(r)).filter((p): p is number => p !== null && p > 0);
  const pageAvg = visible.length ? rows.reduce((s, r) => { const p = priceOf(r); return p ? s + marginPct(p, r.cost) : s; }, 0) / visible.length : null;
  const avg = changed ? pageAvg : list?.avgMargin ?? null;
  const low = changed ? rows.filter((r) => { const p = priceOf(r); return p !== null && p > 0 && marginPct(p, r.cost) < 10; }).length : list?.lowCount ?? 0;

  const save = async () => {
    if (!list || !changed) return;
    setBusy(true);
    try {
      const r = await bulkPrices(list.id, { effectiveFrom: from, items: Object.entries(dirty).map(([itemId, v]) => ({ itemId, price: Number(v) || 0 })) });
      toast(`${list.name} price list saved · ${r.saved} price${r.saved === 1 ? "" : "s"} changed; effective ${from === today() ? "today" : `from ${dstr(from)}`}`, { tone: "good" });
      setDirty({});
      setAttempt((n) => n + 1);
      onChanged();
    } catch (e) { toast(apiMessage(e, "Could not save the prices"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const applyAll = async () => {
    if (!list) return;
    setConfirmAll(false);
    setBusy(true);
    try {
      const r = await bulkPrices(list.id, { effectiveFrom: from, markupPct: Number(mk) || 0 });
      toast(`${list.name}: cost + ${Number(mk) || 0}% applied to ${r.saved} products, rounded to Rs ${fmt(list.roundingTo, list.roundingTo % 1 ? 2 : 0)}`, { tone: "good" });
      setDirty({});
      setMarkup(null);
      setAttempt((n) => n + 1);
      onChanged();
    } catch (e) { toast(apiMessage(e, "Could not apply the markup"), { tone: "danger" }); } finally { setBusy(false); }
  };

  return (
    <div className="split-l cp-pl-split">
      <div className="panel cp-pl-lists">
        <div className="panel-head"><div><h3>Price lists</h3><p>Assigned by customer group</p></div>{can.approve && <button className="btn ghost sm icon" type="button" title="New list" aria-label="New price list" onClick={onNew}><Plus /></button>}</div>
        <div>
          {loading && !lists.length ? <Skeleton style={{ height: 160 }} /> : lists.length ? lists.map((l, i) => (
            <button key={l.id} type="button" className={cn("cp-pl-row", l.id === cur && "on")} onClick={() => { setCur(l.id); setDirty({}); setMarkup(null); setPage(1); }}>
              <span className={cn("cp-pl-dot", DOTS[i % DOTS.length])} />
              <div className="cp-pl-n">
                <b>{l.name}{l.isDefault && <> <span className="badge neutral">Default</span></>}{l.status !== "ACTIVE" && <> <span className="badge neutral">Inactive</span></>}</b>
                <small>{l.code} · {fmt(l.customerCount)} customer{l.customerCount === 1 ? "" : "s"}</small>
                <span className="cp-pl-g">{l.groups.map((g) => <em key={g.id}>{g.name}</em>)}</span>
              </div>
              <div className="cp-pl-m">
                <b>{l.markupPct === null ? "—" : `+${fmt(l.markupPct, l.markupPct % 1 ? 1 : 0)}%`}</b><small>markup on cost</small>
                {l.avgMargin !== null ? <span className={cn("badge", mTone(l.avgMargin))}>{l.avgMargin.toFixed(1)}% avg margin</span> : <span className="badge neutral">No prices yet</span>}
              </div>
            </button>
          )) : <EmptyState title="No price lists yet" description={can.approve ? "Create one for each channel: retail, wholesale, distributors, corporates." : "Lists your approvers create appear here."} />}
        </div>
        <div className="cp-pl-legend"><span><i className="good" />≥ 20% margin</span><span><i className="warn" />10–20%</span><span><i className="danger" />&lt; 10%</span></div>
      </div>

      <div className="panel flush cp-pl-ed">
        {list ? (
          <>
            <div className="panel-head">
              <div><h3>{list.name} prices <span className="badge neutral">{list.code}</span>{can.view && <button type="button" className="icon-btn-sm" aria-label="Edit list details" title="List details" style={{ marginLeft: 6 }} onClick={() => onEdit(list)}><Pencil /></button>}</h3>
                <p>{can.approve ? "Edit any price. Margin is recalculated on cost as you type." : "Prices in force today, with their margin on cost."}</p></div>
              <div className="cp-pl-stat"><div><b>{avg === null ? "—" : `${avg.toFixed(1)}%`}</b><small>Avg margin</small></div><div className={cn(low > 0 && "bad")}><b>{low}</b><small>Below 10%</small></div></div>
            </div>
            <div className="toolbar cp-pl-tools">
              <div className="chips">
                <button type="button" className={cn(!cat && "active")} onClick={() => { setCat(""); setPage(1); }}>All</button>
                {classes.map((c) => <button key={c.id} type="button" className={cn(cat === c.id && "active")} onClick={() => { setCat(c.id); setPage(1); }}>{c.name}</button>)}
              </div>
              <span className="spacer" />
              <label className="search-field cp-sf"><Search /><input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              {can.approve && <>
                <label className="cp-mk"><span>Markup on cost</span><input type="number" step="1" min="0" value={mk} onChange={(e) => setMarkup(e.target.value)} />%</label>
                <button className="btn secondary sm" type="button" disabled={busy || mk === ""} onClick={() => setConfirmAll(true)}><WandSparkles />Apply to all</button>
                <input type="date" aria-label="Prices effective from" title="Prices take effect from this date; earlier prices stay in the history" value={from} min={today()}
                  onChange={(e) => setFrom(e.target.value || today())} style={{ width: 150, height: 34, fontSize: 13 }} />
                <button className="btn primary sm" type="button" disabled={busy || !changed} onClick={save}><Save />{busy ? "Saving…" : changed ? `Save ${changed}` : "Save"}</button>
              </>}
            </div>
            <div className="table-wrap">
              <table className="tbl cp-pl-tbl"><thead><tr><th>Item</th><th className="num">Cost</th><th className="num">Retail</th><th className="num">List price</th><th className="num">Margin</th><th className="num">vs Retail</th></tr></thead>
                <tbody>
                  {loadedKey !== key && !rows.length ? <tr><td colSpan={6}><Skeleton style={{ height: 120 }} /></td></tr> : rows.length ? rows.map((r) => {
                    const p = priceOf(r);
                    const m = p !== null && p > 0 ? marginPct(p, r.cost) : null;
                    return (
                      <tr key={r.product.id} className={cn(dirty[r.product.id] !== undefined && "cp-dirty")}>
                        <td><b>{r.product.name}</b><small>{r.product.sku} · {r.product.uomCode}{r.product.companyName ? ` · ${r.product.companyName}` : ""}{r.next ? ` · Rs ${fmt(r.next.price, 2)} from ${dstr(r.next.effectiveFrom)}` : ""}</small></td>
                        <td className="num">{fmt(r.cost, 2)}</td>
                        <td className="num muted">{fmt(r.retail, 2)}</td>
                        <td className="num">{can.approve
                          ? <input className="cp-pin num" inputMode="decimal" aria-label={`${r.product.name} price`} placeholder="—" value={dirty[r.product.id] ?? (r.price === null ? "" : String(r.price))}
                              onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setDirty((d) => ({ ...d, [r.product.id]: v })); }} />
                          : p === null ? "—" : fmt(p, 2)}</td>
                        <td className="num"><MarginBar m={m} /></td>
                        <td className={cn("num cp-vsr", p !== null && r.retail > 0 && p < r.retail && "dr")}>{p !== null && r.retail > 0 ? `${(((p - r.retail) / r.retail) * 100).toFixed(1)}%` : "—"}</td>
                      </tr>
                    );
                  }) : <tr><td colSpan={6}><EmptyState title="No products" description={q || cat ? "Nothing matches the filter." : "Products from the catalogue appear here to be priced."} /></td></tr>}
                </tbody>
              </table>
            </div>
            <Pager page={page} pages={Math.ceil(total / PAGE)} go={(p) => { setPage(p); }} />
          </>
        ) : !loading && <EmptyState title="Choose a price list" description="Its prices and margins appear here." />}
      </div>

      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} title={`Reprice every product on ${list?.name}?`} confirmLabel="Apply to all" busy={busy} onConfirm={applyAll}>
        Every product with a purchase price gets cost + {Number(mk) || 0}%, rounded to Rs {fmt(list?.roundingTo ?? 1, (list?.roundingTo ?? 1) % 1 ? 2 : 0)}, effective {from === today() ? "today" : `from ${dstr(from)}`}. Unsaved edits are discarded.
      </ConfirmDialog>
    </div>
  );
}
