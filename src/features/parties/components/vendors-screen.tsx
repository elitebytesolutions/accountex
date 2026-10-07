"use client";

import { AlertCircle, AlertTriangle, Plus, RefreshCw, Search, Tags, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { partyInitials, type Vendor, type VendorCategory } from "@/shared";
import { cn } from "@/components/ui/cn";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import {
  createVendorCategory, deleteVendorCategory, listVendorCategories, listVendors, setVendorCategoryActive, updateVendorCategory, vendorSummary, type VendorSummary,
} from "../api";
import { MasterDrawer } from "./master-drawer";
import { VendorForm } from "./vendor-form";

type Can = { create: boolean; edit: boolean; remove: boolean };
const LOOKUPS = ["VendorAtlStatus", "DefaultWhtSection"];
const PAGE = 10;
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CHIPS = [["", "All"], ["ACTIVE", "Active Taxpayer"], ["NOT_ON_ATL", "Not on ATL"], ["UNVERIFIED", "Unverified"]] as const;

/** Template app/vendors (41-acc-trade.html): KPI tiles, category filter, ATL chips and the server-paged vendors table. */
export function VendorsScreen({ can }: { can: Can }) {
  const router = useRouter();
  const lookups = useLookups(LOOKUPS);
  const [rows, setRows] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<VendorSummary | null>(null);
  const [categories, setCategories] = useState<VendorCategory[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState<{ message: string; reference?: string } | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [atl, setAtl] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(0);
  const [catsOpen, setCatsOpen] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    const key = JSON.stringify([ page, q, atl, category, sort , attempt]);
    listVendors({ page, pageSize: PAGE, search: q, atl, category, sort })
      .then((r) => { if (!cancelled) { setRows(r.items); setTotal(r.total); setError(undefined); setLoadedKey(key); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load vendors" }))
    return () => { cancelled = true; };
  }, [page, q, atl, category, sort, attempt]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([vendorSummary(), listVendorCategories()]).then(([s, c]) => { if (!cancelled) { setSummary(s); setCategories(c); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const loading = !error && loadedKey !== JSON.stringify([ page, q, atl, category, sort , attempt]);

  const count = (a: string) => (a ? summary?.byAtl[a] ?? 0 : summary?.total ?? 0);
  const notOnAtl = summary?.byAtl.NOT_ON_ATL ?? 0;
  const columns: Column<Vendor>[] = [
    { key: "name", header: "Vendor", sortable: true, render: (v) => (
      <div className="cell-user"><span className="avatar sm">{partyInitials(v.name)}</span><div><Link className="link" href={`/vendors/${v.id}`} onClick={(e) => e.stopPropagation()}><b>{v.name}</b></Link><small>{v.code}{v.status !== "ACTIVE" ? " · Inactive" : ""}</small></div></div>
    ) },
    { key: "category", header: "Category", render: (v) => v.category?.name ?? <span className="muted">—</span> },
    { key: "ntn", header: "NTN", render: (v) => v.ntn ?? v.cnic ?? <span className="muted">—</span> },
    { key: "city", header: "City", sortable: true, render: (v) => v.city ?? <span className="muted">—</span> },
    { key: "atl", header: "Filer status", render: (v) => <span className={cn("badge dot", toneOf(lookups, "VendorAtlStatus", v.atlStatus))}>{labelOf(lookups, "VendorAtlStatus", v.atlStatus)}</span> },
    { key: "wht", header: "WHT", render: (v) => labelOf(lookups, "DefaultWhtSection", v.defaultWhtSection).split(" — ")[0] },
    { key: "payable", header: "Payable (Rs)", num: true, render: (v) => amt(v.payable) },
    { key: "overdue", header: "Overdue", num: true, render: (v) => (v.overdue ? <span className="text-danger">{amt(v.overdue)}</span> : <span className="muted">—</span>) },
  ];

  return (
    <>
      <PageHead
        eyebrow="Payables / Vendors"
        title="Vendors"
        description="Supplier master with FBR filer status (ATL), WHT profile and payable balances."
        actions={
          <>
            <button type="button" className="btn secondary" disabled title="FBR active-taxpayer check arrives with the FBR integration (Phase 28)"><RefreshCw />Verify ATL</button>
            <button type="button" className="btn secondary" onClick={() => setCatsOpen(true)}><Tags />Categories</button>
            {can.create && <button type="button" className="btn primary" onClick={() => setCreating((n) => n + 1)}><Plus />New Vendor</button>}
          </>
        }
      />
      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Active Vendors</span><span className="icon-well"><Truck /></span></div><strong>{summary ? summary.active : "…"}</strong><small>{summary?.categories ?? 0} categories</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Total Payable</span><span className="icon-well"><Wallet /></span></div><strong>{rs(0)}</strong><small>From vendor bills (Phase 21)</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Overdue</span><span className="icon-well"><AlertTriangle /></span></div><strong>{rs(0)}</strong><small>0 vendors</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Not on ATL</span><span className="icon-well"><AlertCircle /></span></div><strong>{summary ? notOnAtl : "…"}</strong><small>WHT at double rate</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>All vendors</h3><p>{summary ? `${summary.total} vendors · WHT profiles applied on payment` : "…"}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor, NTN, category…" aria-label="Search vendors" /></label>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <div className="chips">{CHIPS.map(([v, l]) => <button key={l} type="button" className={cn(atl === v && "active")} onClick={() => { setAtl(v); setPage(1); }}>{l} <i>{count(v)}</i></button>)}</div>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(v) => v.id} total={total} page={page} pageSize={PAGE} sort={sort} onSortChange={setSort} onPageChange={setPage}
          loading={loading} error={error} onRetry={reload} onRowClick={(v) => router.push(`/vendors/${v.id}`)} />
      </div>

      {creating > 0 && <VendorForm key={creating} open vendor={null} onClose={() => setCreating(0)} onSaved={(v) => { setCreating(0); router.push(`/vendors/${v.id}`); }} />}
      <MasterDrawer<VendorCategory>
        open={catsOpen} onClose={() => setCatsOpen(false)} title="Vendor categories" subtitle="Group vendors for filters and purchase reports." noun="category" can={can}
        table={{ schema: "Purchases", name: "VendorCategories" }}
        fields={[
          { key: "name", label: "Name", required: true, placeholder: "e.g. Packaging", value: (c) => c?.name ?? "" },
          { key: "sortOrder", label: "Order", placeholder: "100", value: (c) => String(c?.sortOrder ?? 100) },
        ]}
        columns={[
          { header: "Category", render: (c) => <b>{c.name}</b> },
          { header: "Vendors", num: true, render: (c) => c.vendorCount },
          { header: "Order", num: true, render: (c) => c.sortOrder },
        ]}
        load={listVendorCategories} create={createVendorCategory} update={updateVendorCategory} setActive={setVendorCategoryActive} remove={deleteVendorCategory} onChanged={reload}
      />
    </>
  );
}
