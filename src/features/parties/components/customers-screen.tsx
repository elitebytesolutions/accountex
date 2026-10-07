"use client";

import { AlertTriangle, HandCoins, Plus, Search, ShieldAlert, Tags, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { partyInitials, type Customer, type CustomerGroup } from "@/shared";
import { cn } from "@/components/ui/cn";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import {
  createCustomerGroup, customerOptions, customerSummary, deleteCustomerGroup, listCustomerGroups, listCustomers, setCustomerGroupActive, updateCustomerGroup, type CustomerSummary,
} from "../api";
import { CustomerForm } from "./customer-form";
import { MasterDrawer } from "./master-drawer";

type Can = { create: boolean; edit: boolean; remove: boolean };
const LOOKUPS = ["CustomerStatus", "CustomerPaymentTerms"];
const PAGE = 10;
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_CHIPS = [["", "All"], ["ACTIVE", "Active"], ["ON_HOLD", "On Hold"], ["DISPUTED", "Disputed"], ["INACTIVE", "Inactive"]] as const;

/** Template app/customers (41-acc-trade.html): KPI tiles, filters, status chips and the server-paged customers table. */
export function CustomersScreen({ can }: { can: Can }) {
  const router = useRouter();
  const lookups = useLookups(LOOKUPS);
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState<{ message: string; reference?: string } | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState("");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(0);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [priceLists, setPriceLists] = useState<{ id: string; code: string; name: string; isDefault: boolean }[] | null>(null);

  // Search waits for a pause in typing.
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    const key = JSON.stringify([ page, q, status, group, city, sort , attempt]);
    listCustomers({ page, pageSize: PAGE, search: q, status, group, city, sort })
      .then((r) => { if (!cancelled) { setRows(r.items); setTotal(r.total); setError(undefined); setLoadedKey(key); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load customers" }))
    return () => { cancelled = true; };
  }, [page, q, status, group, city, sort, attempt]);
  useEffect(() => {
    if (!groupsOpen) return;
    let cancelled = false;
    customerOptions().then((o) => !cancelled && setPriceLists(o.priceLists)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [groupsOpen]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([customerSummary(), listCustomerGroups()]).then(([s, g]) => { if (!cancelled) { setSummary(s); setGroups(g); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const loading = !error && loadedKey !== JSON.stringify([ page, q, status, group, city, sort , attempt]);

  const count = (s: string) => (s ? summary?.byStatus[s] ?? 0 : summary?.total ?? 0);
  const active = summary?.byStatus.ACTIVE ?? 0;
  const onHold = summary?.byStatus.ON_HOLD ?? 0;
  const columns: Column<Customer>[] = [
    { key: "name", header: "Customer", sortable: true, render: (c) => (
      <div className="cell-user"><span className="avatar sm">{partyInitials(c.name)}</span><div><Link className="link" href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()}><b>{c.name}</b></Link><small>{c.code}{c.group ? ` · ${c.group.name}` : ""}</small></div></div>
    ) },
    { key: "ntn", header: "NTN", render: (c) => c.ntn ?? c.cnic ?? <span className="muted">—</span> },
    { key: "city", header: "City", sortable: true, render: (c) => c.city ?? <span className="muted">—</span> },
    { key: "terms", header: "Terms", render: (c) => labelOf(lookups, "CustomerPaymentTerms", c.paymentTerms) },
    { key: "creditLimit", header: "Credit Limit", num: true, sortable: true, render: (c) => c.creditLimit.toLocaleString("en-US") },
    { key: "util", header: "Utilisation", render: (c) => {
      const pct = c.creditLimit ? Math.round((c.balance / c.creditLimit) * 100) : 0;
      return <div><div className={cn("progress", pct > 100 ? "danger" : pct >= 80 ? "warn" : "")} style={{ width: 90 }}><i style={{ width: `${Math.min(100, pct)}%` }} /></div><small className="muted">{pct}%</small></div>;
    } },
    { key: "balance", header: "Balance (Rs)", num: true, render: (c) => amt(c.balance) },
    { key: "overdue", header: "Overdue", num: true, render: (c) => (c.overdue ? <span className="text-danger">{amt(c.overdue)}</span> : <span className="muted">—</span>) },
    { key: "status", header: "Status", render: (c) => <span className={cn("badge", toneOf(lookups, "CustomerStatus", c.status))}>{labelOf(lookups, "CustomerStatus", c.status)}</span> },
  ];

  return (
    <>
      <PageHead
        eyebrow="Receivables / Customers"
        title="Customers"
        description="Customer master with tax registration, credit limits and live receivable balances."
        actions={
          <>
            <button type="button" className="btn secondary" onClick={() => setGroupsOpen(true)}><Tags />Groups</button>
            {can.create && <button type="button" className="btn primary" onClick={() => setCreating((n) => n + 1)}><Plus />New Customer</button>}
          </>
        }
      />
      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Active Customers</span><span className="icon-well"><Users /></span></div><strong>{summary ? active : "…"}</strong>
          {summary?.newThisQuarter ? <small className="up">▲ {summary.newThisQuarter} new this quarter</small> : <small>{summary?.total ?? 0} in all</small>}</div>
        <div className="kpi blue"><div className="kpi-top"><span>Total Receivable</span><span className="icon-well"><HandCoins /></span></div><strong>{rs(0)}</strong><small>From sales invoices (Phase 23)</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Overdue</span><span className="icon-well"><AlertTriangle /></span></div><strong>{rs(0)}</strong><small>0 customers</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>On Credit Hold</span><span className="icon-well"><ShieldAlert /></span></div><strong>{summary ? onHold : "…"}</strong><small>{onHold ? summary?.onHold.join(", ") : "No customers on hold"}</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>All customers</h3><p>{summary ? `${summary.total} customers across ${summary.cities.length} ${summary.cities.length === 1 ? "city" : "cities"}` : "…"}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, NTN, code, phone…" aria-label="Search customers" /></label>
          <select value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} aria-label="City"><option value="">All cities</option>{summary?.cities.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }} aria-label="Group"><option value="">All groups</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <div className="chips">{STATUS_CHIPS.map(([v, l]) => <button key={l} type="button" className={cn(status === v && "active")} onClick={() => { setStatus(v); setPage(1); }}>{l} <i>{count(v)}</i></button>)}</div>
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} total={total} page={page} pageSize={PAGE} sort={sort} onSortChange={setSort} onPageChange={setPage}
          loading={loading} error={error} onRetry={reload} onRowClick={(c) => router.push(`/customers/${c.id}`)} />
      </div>

      {creating > 0 && <CustomerForm key={creating} open customer={null} onClose={() => setCreating(0)} onSaved={(c) => { setCreating(0); router.push(`/customers/${c.id}`); }} />}
      <MasterDrawer<CustomerGroup>
        open={groupsOpen} onClose={() => setGroupsOpen(false)} title="Customer groups" subtitle="Group customers for filters, reports and the price list they buy at." noun="group" can={can}
        table={{ schema: "Sales", name: "CustomerGroups" }}
        fields={[
          { key: "code", label: "Code", required: true, placeholder: "e.g. CORP", upper: true, value: (g) => g?.code ?? "" },
          { key: "name", label: "Name", required: true, placeholder: "e.g. Corporate", value: (g) => g?.name ?? "" },
          { key: "priceListId", label: "Price list", full: true, value: (g) => g?.priceList?.id ?? "",
            options: [{ value: "", label: "Company default" }, ...(priceLists ?? []).map((l) => ({ value: l.id, label: `${l.code} · ${l.name}${l.isDefault ? " (default)" : ""}` }))] },
          { key: "remarks", label: "Remarks", full: true, value: (g) => g?.remarks ?? "" },
        ]}
        columns={[
          { header: "Group", render: (g) => <><b>{g.name}</b><small>{g.code}</small></> },
          { header: "Price list", render: (g) => g.priceList?.name ?? <span className="muted">Company default</span> },
          { header: "Customers", num: true, render: (g) => g.customerCount },
        ]}
        load={listCustomerGroups} create={createCustomerGroup} update={updateCustomerGroup} setActive={setCustomerGroupActive} remove={deleteCustomerGroup} onChanged={reload}
      />
    </>
  );
}
