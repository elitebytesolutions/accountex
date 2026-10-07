"use client";

import { ChartNoAxesColumnDecreasing, Download, Gift, Layers, List, Plus, Tags } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CustomerGroup, PriceList, PriceTier, Scheme, SchemeSummary } from "@/shared";
import { PageHead } from "@/components/ui/page";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { productOptions } from "@/features/inventory/products-api";
import { listCustomerGroups } from "@/features/parties/api";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { listPriceLists, listPriceTiers, listSchemes, priceListRows, schemeSummary } from "../api";
import { BreaksTab } from "./breaks-tab";
import { downloadCsv, today, type Can } from "./common";
import { ListsTab } from "./lists-tab";
import { PriceListDrawer } from "./price-list-drawer";
import { SchemeDrawer } from "./scheme-drawer";
import { SchemesTab } from "./schemes-tab";
import { TiersTab } from "./tiers-tab";

type Tab = "lists" | "schemes" | "breaks" | "tiers";

/**
 * Template app/sales/price-lists (4A-company-plus.html + 9A-company-plus.js §5): Price lists, Schemes, Quantity breaks,
 * plus the added Price tiers tab. Changes need quo:approve (tiers: pricetier:edit).
 */
export function PriceListsScreen({ can, hasCust, hasItem }: { can: Can; hasCust: boolean; hasItem: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("lists");
  const [lists, setLists] = useState<PriceList[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [summary, setSummary] = useState<SchemeSummary | null>(null);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [listEdit, setListEdit] = useState<PriceList | "new" | null>(null);
  const [schemeEdit, setSchemeEdit] = useState<Scheme | "new" | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPriceLists({ page: 1, pageSize: 100 }), listSchemes({ page: 1, pageSize: 100 }), schemeSummary(),
      can.tiersView ? listPriceTiers() : Promise.resolve([] as PriceTier[]),
    ])
      .then(([l, s, sum, t]) => {
        if (cancelled) return;
        setLists(l.items); setSchemes(s.items); setSummary(sum); setTiers(t); setError(null); setLoaded(attempt);
        setCur((c) => (c && l.items.some((x) => x.id === c) ? c : l.items[0]?.id ?? null));
      })
      .catch((e: unknown) => { if (!cancelled) { setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load price lists" }); setLoaded(attempt); } });
    return () => { cancelled = true; };
  }, [attempt, can.tiersView]);
  useEffect(() => {
    let cancelled = false;
    if (hasCust) listCustomerGroups().then((g) => !cancelled && setGroups(g.filter((x) => x.isActive))).catch(() => undefined);
    if (hasItem) productOptions().then((o) => !cancelled && setClasses(o.classes.map((c) => ({ id: c.id, name: c.name })))).catch(() => undefined);
    return () => { cancelled = true; };
  }, [hasCust, hasItem]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const loading = loaded !== attempt;

  /** Template Export: every list's prices in force today, one column per list. */
  const exportAll = async () => {
    setExporting(true);
    try {
      const prices = new Map<string, { sku: string; name: string; cost: number; byList: Record<string, number | null> }>();
      for (const l of lists) {
        for (let page = 1; ; page++) {
          const r = await priceListRows(l.id, { page, pageSize: 100 });
          for (const row of r.items) {
            const p = prices.get(row.product.id) ?? { sku: row.product.sku, name: row.product.name, cost: row.cost, byList: {} };
            p.byList[l.id] = row.price;
            prices.set(row.product.id, p);
          }
          if (page * 100 >= r.total) break;
        }
      }
      downloadCsv(`price_lists_${today()}.csv`, [["SKU", "Item", "Cost", ...lists.map((l) => l.name)], ...[...prices.values()].map((p) => [p.sku, p.name, p.cost, ...lists.map((l) => p.byList[l.id] ?? "")])]);
      toast(`All price lists exported to CSV`, { tone: "good" });
    } catch (e) { toast(apiMessage(e, "Could not export"), { tone: "danger" }); } finally { setExporting(false); }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const live = summary?.live ?? 0;

  return (
    <>
      <PageHead
        eyebrow={<><Tags />Sales / Price Lists &amp; Schemes</>}
        title="Price Lists & Schemes"
        description="Channel pricing for retail, wholesale, distributors and corporates, trade schemes and quantity-break slabs, all with live margin checks."
        actions={<>
          <button className="btn secondary" type="button" disabled={exporting || !lists.length} onClick={exportAll}><Download />{exporting ? "Exporting…" : "Export"}</button>
          {can.approve && <button className="btn primary" type="button" onClick={() => setSchemeEdit("new")}><Plus />New scheme</button>}
        </>}
      />
      <div className="cp-pl">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "lists"} className={tab === "lists" ? "active" : undefined} onClick={() => setTab("lists")}><List />Price lists</button>
          <button type="button" role="tab" aria-selected={tab === "schemes"} className={tab === "schemes" ? "active" : undefined} onClick={() => setTab("schemes")}><Gift />Schemes <span className="badge neutral">{live} live</span></button>
          <button type="button" role="tab" aria-selected={tab === "breaks"} className={tab === "breaks" ? "active" : undefined} onClick={() => setTab("breaks")}><ChartNoAxesColumnDecreasing />Quantity breaks</button>
          {can.tiersView && <button type="button" role="tab" aria-selected={tab === "tiers"} className={tab === "tiers" ? "active" : undefined} onClick={() => setTab("tiers")}><Layers />Price tiers</button>}
        </div>
        <div className="tab-pane active">
          {tab === "lists" && <ListsTab lists={lists} loading={loading} cur={cur} setCur={setCur} classes={classes} can={can} onEdit={(l) => setListEdit(l)} onNew={() => setListEdit("new")} onChanged={reload} />}
          {tab === "schemes" && <SchemesTab schemes={schemes} summary={summary} loading={loading} can={can} onOpen={(s) => setSchemeEdit(s)} onChanged={reload} />}
          {tab === "breaks" && (hasItem ? <BreaksTab lists={lists} can={can} /> : <ErrorState message="Quantity breaks need access to products (item:view)." />)}
          {tab === "tiers" && <TiersTab tiers={tiers} loading={loading} can={can} onChanged={reload} />}
        </div>
      </div>

      {listEdit && <PriceListDrawer key={listEdit === "new" ? "new" : listEdit.id} list={listEdit === "new" ? null : listEdit} lists={lists} can={can} onClose={() => setListEdit(null)}
        onSaved={(l) => { setListEdit(null); setCur(l.id); reload(); }} onDeleted={() => { setListEdit(null); setCur(null); reload(); }} />}
      {schemeEdit && <SchemeDrawer key={schemeEdit === "new" ? "new" : schemeEdit.id} scheme={schemeEdit === "new" ? null : schemeEdit} groups={groups}
        tiers={tiers.length ? tiers.map((t) => ({ code: t.code, name: t.name })) : [{ code: "RETAILER", name: "Retailer" }, { code: "WHOLESALER", name: "Wholesaler" }, { code: "DISTRIBUTOR", name: "Distributor" }]}
        can={can} onClose={() => setSchemeEdit(null)} onSaved={() => { setSchemeEdit(null); setTab("schemes"); reload(); }} />}
    </>
  );
}
