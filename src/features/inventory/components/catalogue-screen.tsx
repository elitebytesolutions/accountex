"use client";

import {
  ArrowUpDown, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, EllipsisVertical, Gem, LayoutGrid, List, MapPin, MousePointerClick, Package, PackageSearch,
  Percent, Plus, Power, PowerOff, Printer, RotateCcw, Scissors, Search, ShieldAlert, Trash2, X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { Product, ProductDetail } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { deleteProduct, getProduct, listProducts, productOptions, productSummary, setProductActive, setProductPrice, type ProductOptions, type ProductSummary } from "../products-api";
import { NamedIcon } from "./named-icon";
import { ProductForm } from "./product-form";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Tab = "all" | "company" | "cls" | "shelf" | "short" | "expiry" | "precious" | "controlled" | "stock";
const TABS: { k: Tab; l: string }[] = [
  { k: "all", l: "All" }, { k: "company", l: "By Company" }, { k: "cls", l: "By Class" }, { k: "shelf", l: "Shelf" }, { k: "short", l: "Short Items" },
  { k: "expiry", l: "Expiry Required" }, { k: "precious", l: "Precious" }, { k: "controlled", l: "Controlled" }, { k: "stock", l: "Stock List" },
];
const ATTR = {
  short: { l: "Short Item", Icon: Scissors, t: "warn" }, expiry: { l: "Expiry Required", Icon: CalendarClock, t: "info" },
  precious: { l: "Precious", Icon: Gem, t: "violet" }, controlled: { l: "Controlled", Icon: ShieldAlert, t: "danger" },
} as const;
const SORTS = [["name", "Name A – Z"], ["-name", "Name Z – A"], ["sku", "Product Code"], ["-price", "Retail: High to Low"], ["price", "Retail: Low to High"], ["-updatedAt", "Recently Updated"]] as const;
const SCOPES = [["", "All Products"], ["ACTIVE", "Active"], ["DRAFT", "Drafts"], ["INACTIVE", "Inactive"], ["LOW", "Low Stock"]] as const;
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const attrsOf = (p: Product) => (["short", "expiry", "precious", "controlled"] as const).filter((a) => (a === "short" ? p.isShort : a === "expiry" ? p.trackExpiry : a === "precious" ? p.isPrecious : p.isControlled));
const pack = (p: Product) => (p.ctn > 1 ? `CTN ${p.ctn} × ${p.uom.name}` : `Single ${p.uom.name}`);
const tone = (p: Product) => (p.onHand <= Math.max(1, Math.round(p.lowLevel / 4)) ? "red" : p.onHand <= p.lowLevel ? "amber" : "green");
const ctnSplit = (p: Product) => (p.ctn > 1 ? `${fmt(Math.floor(p.onHand / p.ctn))} CTN + ${fmt(p.onHand % p.ctn)} ${p.uom.code}` : `${fmt(p.onHand)} ${p.uom.code}`);

function Pager({ page, pages, go }: { page: number; pages: number; go: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== "…") nums.push("…");
  return (
    <div className="pr-pager">
      <button type="button" className="nav" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page"><ChevronLeft /></button>
      {nums.map((p, i) => (p === "…" ? <span key={`d${i}`} className="dots">…</span> : <button key={p} type="button" className={cn(p === page && "on")} onClick={() => go(p)}>{p}</button>))}
      <button type="button" className="nav" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Next page"><ChevronRight /></button>
    </div>
  );
}

/** Template app/inventory/items (4B-products.html + 9F-products.js §1): filters, scope tabs, detail / compact / grid views, inline price edit. */
export function CatalogueScreen({ can }: { can: Can }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [opts, setOpts] = useState<ProductOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [f, setF] = useState({ scope: "", company: "", cls: "", min: "", max: "", shelf: "", attr: "", q: "", view: "detail", sort: "name" });
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(15);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; field: "cost" | "price" | "wprice"; value: string } | null>(null);
  const [form, setForm] = useState<{ product: ProductDetail | null } | null>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; p: Product } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<unknown>; done: string } | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());

  useEffect(() => { const t = setTimeout(() => { setQ(f.q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [f.q]);
  const attrTab = (["short", "expiry", "precious", "controlled"] as const).find((a) => a === tab);
  const groupSort = tab === "company" ? "manufacturerId" : tab === "cls" ? "productClassId" : tab === "shelf" ? "defaultShelf" : null;
  const query = useMemo(() => ({
    page, pageSize: per, search: q, status: f.scope && f.scope !== "LOW" ? f.scope : undefined, low: f.scope === "LOW", company: f.company || undefined, class: f.cls || undefined,
    shelf: f.shelf || undefined, attr: attrTab ?? (f.attr || undefined), minStock: f.min === "" ? undefined : Number(f.min), maxStock: f.max === "" ? undefined : Number(f.max),
    sort: groupSort ?? f.sort,
  }), [page, per, q, f.scope, f.company, f.cls, f.shelf, f.attr, f.min, f.max, f.sort, attrTab, groupSort]);
  const key = JSON.stringify([query, attempt]);
  useEffect(() => {
    let cancelled = false;
    listProducts(query)
      .then((r) => { if (!cancelled) { setRows(r.items); setTotal(r.total); setError(null); setLoadedKey(key); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load products" }));
    return () => { cancelled = true; };
  }, [query, key]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([productSummary(), productOptions()]).then(([s, o]) => { if (!cancelled) { setSummary(s); setOpts(o); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const loading = !error && loadedKey !== key;

  const setFilter = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); if (k !== "q" && k !== "view") setPage(1); };
  const clear = () => { setF((x) => ({ ...x, scope: "", company: "", cls: "", min: "", max: "", shelf: "", attr: "", q: "" })); setTab("all"); setPage(1); };
  const pages = Math.max(1, Math.ceil(total / per));
  const stock = tab === "stock";
  const view = f.view;
  const coName = (id: string) => opts?.companies.find((c) => c.id === id)?.name ?? "—";
  const label = [
    f.scope && SCOPES.find(([v]) => v === f.scope)?.[1], f.company && coName(f.company), f.cls && opts?.classes.find((c) => c.id === f.cls)?.name,
    (f.min || f.max) && `Stock ${f.min || 0}–${f.max || "∞"}`, f.shelf && `Shelf ${f.shelf}`, f.attr && ATTR[f.attr as keyof typeof ATTR].l, f.q && `“${f.q}”`,
    tab !== "all" && TABS.find((t) => t.k === tab)?.l,
  ].filter(Boolean) as string[];
  const tabCount = (t: Tab) => (!summary ? 0 : t === "all" ? summary.total : t === "company" ? summary.companies : t === "cls" ? summary.classes : t === "shelf" ? summary.shelves.length : t === "stock" ? null : summary[t]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); toast(done, { tone: "good" }); reload(); } catch (e) { toast(apiMessage(e, "Could not update"), { tone: "danger" }); }
  };
  const savePrice = async (p: Product) => {
    if (!editing) return;
    const value = Number(editing.value);
    if (Number.isNaN(value) || value < 0) { toast("Enter a price of 0 or more", { tone: "danger" }); return; }
    if (value === p[editing.field]) { setEditing(null); return; }
    try {
      await setProductPrice(p.id, { field: editing.field === "cost" ? "COST" : editing.field === "price" ? "PRICE" : "WPRICE", value, rowVersion: p.rowVersion });
      toast(`${p.sku} ${editing.field === "cost" ? "purchase" : editing.field === "price" ? "retail" : "W."} price → ${fmt(value, 2)}`, { tone: "good" });
      setEditing(null);
      setFlash(new Set([p.id]));
      setTimeout(() => setFlash(new Set()), 2600);
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not change the price"), { tone: "danger" });
    }
  };
  const openEdit = async (id: string) => {
    try { setForm({ product: await getProduct(id) }); } catch (e) { toast(apiMessage(e, "Could not open the product"), { tone: "danger" }); }
  };
  const priceCell = (p: Product, field: "cost" | "price" | "wprice") => {
    const ed = editing?.id === p.id && editing.field === field;
    return (
      <td className="num pr-price" onDoubleClick={() => can.edit && setEditing({ id: p.id, field, value: String(p[field] ?? "") })} title={can.edit ? "Double-click to edit" : undefined}>
        {ed ? (
          <input className="pr-cellin" autoFocus inputMode="decimal" value={editing.value} aria-label="New price"
            onChange={(e) => setEditing({ ...editing, value: e.target.value })} onBlur={() => setEditing(null)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") void savePrice(p); if (e.key === "Escape") setEditing(null); }} />
        ) : p[field] === null ? "—" : fmt(p[field] as number, 2)}
      </td>
    );
  };
  const menuItems = (p: Product): MenuItem[] => [
    { label: "Open", onClick: () => router.push(`/inventory/products/${p.id}`) },
    ...(can.edit ? [{ label: "Edit", onClick: () => void openEdit(p.id) }] : []),
    ...(can.edit ? [{ label: "Print label", onClick: () => router.push(`/inventory/labels?ids=${p.id}`) }] : []),
    ...(can.edit ? [{ label: p.status === "ACTIVE" ? "Deactivate" : "Activate", onClick: () => void run(() => setProductActive(p.id, p.status !== "ACTIVE", p.rowVersion), `${p.sku} ${p.status === "ACTIVE" ? "deactivated" : "activated"}`) }] : []),
    ...(can.remove ? [{ sep: true as const }, { label: "Delete", danger: true, onClick: () => setConfirm({ title: `Delete ${p.sku} · ${p.name}?`, body: "Only products nothing uses can be deleted, and the code can't be used again. Otherwise deactivate it.", run: () => deleteProduct(p.id, p.rowVersion), done: `${p.sku} deleted` }) }] : []),
  ];
  const selected = rows.filter((r) => sel.has(r.id));
  const groupKey = (p: Product) => (tab === "company" ? p.company?.name ?? "No company" : tab === "cls" ? p.productClass?.name ?? "No class" : tab === "shelf" ? `Shelf ${p.defaultShelf ?? "—"}` : "");
  const cols = stock ? 11 : 15;

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  return (
    <>
      <div className="pr-head">
        <span className="pr-cube"><Package /></span>
        <div className="pr-head-t"><h1>All Products</h1><p>Manage your product inventory, pricing, classification and stock levels</p></div>
        <div className="pr-head-act">
          {can.create && <button className="btn primary lg" type="button" onClick={() => setForm({ product: null })}><Plus />New Product</button>}
        </div>
      </div>

      <div className="pr-filters">
        <label className="pr-f"><span>Product Scope</span><div className="pr-ctl"><select value={f.scope} onChange={(e) => setFilter("scope", e.target.value)} aria-label="Product scope">{SCOPES.map(([v, l]) => <option key={l} value={v}>{l}</option>)}</select><ChevronDown className="pr-chev" /></div></label>
        <label className="pr-f"><span>Company</span><div className="pr-ctl"><select value={f.company} onChange={(e) => setFilter("company", e.target.value)} aria-label="Company"><option value="">All Companies</option>{opts?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown className="pr-chev" /></div></label>
        <label className="pr-f"><span>Class</span><div className="pr-ctl"><select value={f.cls} onChange={(e) => setFilter("cls", e.target.value)} aria-label="Class"><option value="">All Classes</option>{opts?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown className="pr-chev" /></div></label>
        <div className="pr-f"><span>Stock Range</span><div className="pr-range"><div className="pr-ctl"><input type="number" min="0" placeholder="Min" value={f.min} onChange={(e) => setFilter("min", e.target.value)} aria-label="Minimum stock" /></div><em>–</em><div className="pr-ctl"><input type="number" min="0" placeholder="Max" value={f.max} onChange={(e) => setFilter("max", e.target.value)} aria-label="Maximum stock" /></div></div></div>
        <label className="pr-f"><span>Shelf</span><div className="pr-ctl"><select value={f.shelf} onChange={(e) => setFilter("shelf", e.target.value)} aria-label="Shelf"><option value="">All Shelves</option>{summary?.shelves.map((x) => <option key={x}>{x}</option>)}</select><ChevronDown className="pr-chev" /></div></label>
        <label className="pr-f"><span>Special Attributes</span><div className="pr-ctl"><select value={f.attr} onChange={(e) => setFilter("attr", e.target.value)} aria-label="Special attributes"><option value="">None</option>{Object.entries(ATTR).map(([k, a]) => <option key={k} value={k}>{a.l}</option>)}</select><ChevronDown className="pr-chev" /></div></label>
        <label className="pr-f pr-f-search"><span>Search by code, name or UPC</span><div className="pr-ctl"><Search /><input type="search" placeholder="Code, name or UPC…" value={f.q} onChange={(e) => setFilter("q", e.target.value)} aria-label="Search products" /></div></label>
        <label className="pr-f"><span>Product View</span><div className="pr-ctl">{view === "grid" ? <LayoutGrid /> : <List />}<select value={view} onChange={(e) => setFilter("view", e.target.value)} aria-label="Product view"><option value="detail">Detail</option><option value="compact">Compact</option><option value="grid">Grid</option></select><ChevronDown className="pr-chev" /></div></label>
        <label className="pr-f"><span>Sort By</span><div className="pr-ctl"><ArrowUpDown /><select value={f.sort} onChange={(e) => setFilter("sort", e.target.value)} aria-label="Sort by">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><ChevronDown className="pr-chev" /></div></label>
      </div>

      <div className="pr-tabsrow">
        <div className="pr-scopes" role="tablist" aria-label="Catalogue scope">
          {TABS.map((t) => <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={cn(tab === t.k && "on")} onClick={() => { setTab(t.k); setPage(1); }}>{t.l}{tabCount(t.k) !== null && <em> {fmt(tabCount(t.k) ?? 0)}</em>}</button>)}
        </div>
        <button className="btn secondary sm" type="button" onClick={clear}><RotateCcw />Clear Filters</button>
      </div>

      <div className="pr-status">
        <span>{total ? <>Showing <b>{(page - 1) * per + 1}–{(page - 1) * per + rows.length}</b> of <b>{fmt(total)}</b> products</> : "Showing 0 products"}</span>
        <span className={cn("pr-fchip", label.length > 0 && "on")}>Filtered: <b>{label.length ? label.join(" · ") : "All Products"}</b>{label.length > 0 && <button type="button" aria-label="Clear filters" onClick={clear}><X /></button>}</span>
        {selected.length > 0 && (
          <div className="pr-bulk">
            <b>{selected.length} selected</b>
            {can.edit && <button type="button" onClick={() => run(async () => { for (const p of selected) if (p.status !== "ACTIVE") await setProductActive(p.id, true, p.rowVersion); }, `${selected.length} activated`)}><Power />Activate</button>}
            {can.edit && <button type="button" onClick={() => run(async () => { for (const p of selected) if (p.status === "ACTIVE") await setProductActive(p.id, false, p.rowVersion); }, `${selected.length} deactivated`)}><PowerOff />Deactivate</button>}
            {can.remove && <button type="button" className="danger" onClick={() => setConfirm({ title: `Delete ${selected.length} products?`, body: "Only products nothing uses are deleted; the others stay (deactivate them instead).", run: async () => { for (const p of selected) await deleteProduct(p.id, p.rowVersion); setSel(new Set()); }, done: `${selected.length} deleted` })}><Trash2 />Delete</button>}
            {can.edit && <button type="button" onClick={() => router.push(`/inventory/labels?ids=${selected.map((p) => p.id).join(",")}`)}><Printer />Print labels</button>}
            <button type="button" disabled title="Bulk price updates arrive in Phase 22"><Percent />Bulk price update</button>
            <button type="button" className="pr-bulk-x" onClick={() => setSel(new Set())} aria-label="Clear selection"><X /></button>
          </div>
        )}
        {selected.length === 0 && can.edit && <span className="pr-hint"><MousePointerClick />Double-click a price to edit</span>}
      </div>

      <div className={cn("pr-tablecard", view === "compact" && "pr-compact")}>
        {view !== "grid" ? (
          <div className="pr-tablewrap">
            <table className="tbl pr-tbl">
              <thead>
                <tr>
                  <th className="pr-chk"><input type="checkbox" aria-label="Select all on page" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                  <th>Code</th><th>Product Name</th>
                  {stock ? <th>Pack</th> : <><th>UPC</th><th>Company</th><th>Class</th><th>Pack</th></>}
                  <th>Shelf</th><th className="num">High<br />Level</th><th className="num">Low<br />Level</th>
                  {stock ? <><th className="num">Cost /<br />Unit</th><th className="num">CTN + Loose</th><th className="num">Stock Value</th></> : <><th className="num">Purchase<br />Price</th><th className="num">Retail<br />Price</th><th className="num">W. Price</th></>}
                  <th className="pr-stc">Stock</th><th className="pr-act" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 5 }, (_, i) => <tr key={`s${i}`}><td colSpan={cols}><Skeleton style={{ height: 14 }} /></td></tr>)}
                {!loading && rows.map((p, i) => {
                  const g = groupKey(p), prev = i > 0 ? groupKey(rows[i - 1]!) : null;
                  return (
                    <Fragment key={p.id}>
                      {g && g !== prev && (
                        <tr className="pr-group"><td colSpan={cols}>
                          {tab === "company" ? <span className="pr-codot" style={{ ["--co" as string]: p.company?.brandColour ?? "var(--muted)" }} /> : tab === "cls" ? <NamedIcon name={p.productClass?.icon} /> : <MapPin />}
                          <b>{g}</b><small>· {rows.filter((r) => groupKey(r) === g).length} on this page</small>
                        </td></tr>
                      )}
                      <tr className={cn(sel.has(p.id) && "selected", p.status !== "ACTIVE" && "pr-muted", flash.has(p.id) && "pr-flash")} style={{ ["--i" as string]: i }} tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && router.push(`/inventory/products/${p.id}`)}>
                        <td className="pr-chk"><input type="checkbox" aria-label={`Select ${p.sku}`} checked={sel.has(p.id)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} /></td>
                        <td className="pr-code"><a className="link" href={`/inventory/products/${p.id}`} onClick={(e) => { e.preventDefault(); router.push(`/inventory/products/${p.id}`); }}>{p.sku}</a>{p.status !== "ACTIVE" && <i className={cn("pr-state", p.status.toLowerCase())}>{p.status === "DRAFT" ? "Draft" : "Inactive"}</i>}</td>
                        <td className="pr-name"><span>{p.name}</span>{attrsOf(p).map((a) => { const A = ATTR[a]; return <span key={a} className={cn("pr-adot", A.t)} title={A.l}><A.Icon /></span>; })}</td>
                        {stock ? <td>{pack(p)}</td> : <>
                          <td className="pr-mono">{p.upc ?? "—"}</td>
                          <td className="pr-coname">{p.company ? <><span className="pr-codot" style={{ ["--co" as string]: p.company.brandColour }} />{p.company.name}</> : "—"}</td>
                          <td className="pr-clsname">{p.productClass?.name ?? "—"}</td>
                          <td className="pr-pack">{pack(p)}</td>
                        </>}
                        <td><span className="pr-shelf">{p.defaultShelf ?? "—"}</span></td>
                        <td className="num">{fmt(p.highLevel)}</td><td className="num">{fmt(p.lowLevel)}</td>
                        {stock ? <><td className="num">{fmt(p.avgCost || p.cost, 2)}</td><td className="num pr-ctnq">{ctnSplit(p)}</td><td className="num"><b>Rs {fmt(p.stockValue)}</b></td></>
                          : <>{priceCell(p, "cost")}{priceCell(p, "price")}{priceCell(p, "wprice")}</>}
                        <td className="pr-stc"><span className={cn("pr-stock", tone(p))} title={ctnSplit(p)}>{fmt(p.onHand)}</span></td>
                        <td className="pr-act"><button className="pr-kebab" type="button" aria-label={`Actions for ${p.sku}`} onClick={(e) => setMenu({ el: e.currentTarget, p })}><EllipsisVertical /></button></td>
                      </tr>
                    </Fragment>
                  );
                })}
                {!loading && !rows.length && (
                  <tr className="pr-empty"><td colSpan={cols}>
                    <div className="pr-emptybox"><span><PackageSearch /></span><b>{summary?.total ? "No products match" : "No products yet"}</b><small>{summary?.total ? "Try widening the stock range or clearing a filter." : "Add your first product, or set up companies, classes and units first."}</small>
                      {summary?.total ? <button className="btn secondary sm" type="button" onClick={clear}><RotateCcw />Clear filters</button> : can.create && <button className="btn primary sm" type="button" onClick={() => setForm({ product: null })}><Plus />New Product</button>}</div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="pr-tiles">
            {rows.map((p, i) => {
              const lvl = Math.min(100, Math.round((p.onHand / Math.max(1, p.highLevel)) * 100));
              return (
                <article key={p.id} className={cn("pr-ptile-card", sel.has(p.id) && "selected", p.status !== "ACTIVE" && "pr-muted", flash.has(p.id) && "pr-flash")} style={{ ["--i" as string]: i, ["--co" as string]: p.company?.brandColour ?? "var(--primary)" }} tabIndex={0}
                  onClick={(e) => { if ((e.target as HTMLElement).closest("button,input,label")) return; router.push(`/inventory/products/${p.id}`); }}>
                  <div className="pr-pt-top"><span className="pr-tile"><NamedIcon name={p.productClass?.icon ?? "package"} /></span>
                    <label className="pr-pt-chk"><input type="checkbox" aria-label={`Select ${p.sku}`} checked={sel.has(p.id)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} /></label>
                    <button className="pr-kebab" type="button" aria-label="Actions" onClick={(e) => setMenu({ el: e.currentTarget, p })}><EllipsisVertical /></button></div>
                  <small className="pr-pt-code">{p.sku} · {p.company?.name ?? "—"}{p.status !== "ACTIVE" && <i className={cn("pr-state", p.status.toLowerCase())}>{p.status === "DRAFT" ? "Draft" : "Inactive"}</i>}</small>
                  <b className="pr-pt-name">{p.name}</b>
                  <div className="pr-pt-meta"><span>{pack(p)}</span><span>Shelf {p.defaultShelf ?? "—"}</span></div>
                  <div className="pr-pt-price"><b>Rs {fmt(p.price, 2)}</b><small>W. {p.wprice === null ? "—" : fmt(p.wprice, 2)}</small></div>
                  <div className="pr-pt-stock"><span className={cn("pr-lvl", tone(p))}><i style={{ width: `${lvl}%` }} /></span><span className={cn("pr-stock", tone(p))}>{fmt(p.onHand)}</span></div>
                </article>
              );
            })}
            {!loading && !rows.length && <div className="pr-emptybox tile"><span><PackageSearch /></span><b>{summary?.total ? "No products match" : "No products yet"}</b><small>Try clearing a filter.</small></div>}
          </div>
        )}
      </div>
      <div className="pr-foot">
        <label className="pr-per">Rows per page <div className="pr-ctl"><select value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }} aria-label="Rows per page">{[15, 30, 50].map((n) => <option key={n}>{n}</option>)}</select><ChevronDown className="pr-chev" /></div></label>
        <Pager page={Math.min(page, pages)} pages={pages} go={setPage} />
      </div>

      {menu && <Menu anchor={menu.el} onClose={() => setMenu(null)} items={menuItems(menu.p)} />}
      {form && <ProductForm key={form.product?.id ?? "new"} product={form.product} onClose={() => setForm(null)} onSaved={(p) => { setForm(null); setFlash(new Set([p.id])); setTimeout(() => setFlash(new Set()), 2600); reload(); }} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ""} confirmLabel="Delete" danger onConfirm={async () => {
        if (!confirm) return;
        const x = confirm;
        setConfirm(null);
        await run(x.run, x.done);
      }}>{confirm?.body}</ConfirmDialog>
    </>
  );
}
