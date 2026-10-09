"use client";

import {
  Boxes, Download, Eye, Filter, Landmark, MoreHorizontal, Package, Pencil, Plus, ScanBarcode, Search, ShieldAlert, Stamp, Trash2, TrendingDown, Upload, Wrench, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AssetOptions, FixedAsset, FixedAssetList } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Hl, Money, dateLabel, downloadCsv, isoDay } from "@/features/finance/components/finance-ui";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { assetOptions, deleteAsset, listAssets } from "../register-api";
import { ASSET_STATUS, AssetFormModal, AssetStatus, CapitaliseModal, categoryIcon } from "./asset-form";
import "./asset-register-screen.css";

type Can = { create: boolean; edit: boolean; delete: boolean; post: boolean; approve: boolean };
const PAGE = 12;
const STACK_COLORS = ["var(--primary)", "var(--mint)", "var(--blue)", "var(--lime)", "var(--violet)", "var(--warn)", "var(--info)"];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const millions = (n: number) => (n >= 1_000_000 ? `Rs ${(n / 1_000_000).toFixed(2)}M` : `Rs ${Math.round(n).toLocaleString("en-US")}`);
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${isoDay(new Date())}T00:00:00`).getTime()) / 86_400_000);

/** Fixed Assets › Register (template app/assets, 42-acc-reports.html). */
export function AssetRegisterScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const [options, setOptions] = useState<AssetOptions | null>(null);
  const [data, setData] = useState<FixedAssetList | null>(null);
  const [all, setAll] = useState<FixedAsset[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [form, setForm] = useState<FixedAsset | "new" | null>(null);
  const [capitalising, setCapitalising] = useState<FixedAsset | null>(null);
  const [removing, setRemoving] = useState<FixedAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    assetOptions().then((o) => !cancelled && setOptions(o)).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listAssets({ search: q, category, branch, status, page, pageSize: PAGE })
      .then((r) => { if (!cancelled) { setData(r); setError(null); setSelected(new Set()); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the asset register" }));
    return () => { cancelled = true; };
  }, [q, category, branch, status, page, attempt]);

  // Needs attention looks across the whole register, not just the visible page.
  useEffect(() => {
    let cancelled = false;
    listAssets({ pageSize: 500 }).then((r) => !cancelled && setAll(r.items)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [attempt]);

  const attention = useMemo(() => {
    if (!all) return null;
    const out: { key: string; tone: "yellow" | "red" | "blue"; icon: ReactNode; title: string; sub: string; href: string }[] = [];
    for (const a of all.filter((x) => x.status === "UNDER_REPAIR")) out.push({ key: `r${a.id}`, tone: "yellow", icon: <Wrench />, title: `${a.code} under repair`, sub: `${a.name} · ${a.branch.name}`, href: `/assets/${a.id}` });
    for (const a of all.filter((x) => x.status !== "DISPOSED" && x.insuranceExpiry && daysUntil(x.insuranceExpiry) <= 30)) {
      const d = daysUntil(a.insuranceExpiry!);
      out.push({ key: `i${a.id}`, tone: "red", icon: <ShieldAlert />, title: d < 0 ? "Insurance expired" : "Insurance expiring", sub: `${a.code} ${a.name} — ${a.insurer ?? "policy"} ${d < 0 ? "ended" : "ends"} ${dateLabel(a.insuranceExpiry)}`, href: `/assets/${a.id}` });
    }
    for (const a of all.filter((x) => x.status === "NEW")) out.push({ key: `n${a.id}`, tone: "blue", icon: <ScanBarcode />, title: `${a.code} not capitalised`, sub: `${a.name} · added ${dateLabel(a.createdAt)}`, href: `/assets/${a.id}` });
    return out;
  }, [all]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const k = data?.kpis;
  const catTotal = data ? Object.values(data.counts).reduce((s, n) => s + n, 0) : 0;
  const catName = (id: string) => data?.byCategory.find((c) => c.category.id === id)?.category.name ?? options?.categories.find((c) => c.id === id)?.name ?? "Category";
  const filtered = !!(q || category || branch || status);

  const rowMenu = (a: FixedAsset): MenuItem[] => {
    const out: MenuItem[] = [{ label: "Open", icon: <Eye />, onClick: () => router.push(`/assets/${a.id}`) }];
    if (can.edit && a.status !== "DISPOSED") out.push({ label: a.status === "NEW" ? "Edit" : "Edit details", icon: <Pencil />, onClick: () => setForm(a) });
    if (can.post && a.status === "NEW") out.push({ label: "Capitalise", icon: <Stamp />, onClick: () => setCapitalising(a) });
    if (can.delete && a.status === "NEW") out.push({ sep: true }, { label: "Delete", icon: <Trash2 />, danger: true, onClick: () => setRemoving(a) });
    return out;
  };
  const filterMenu = (anchor: HTMLElement) => setMenu({
    anchor,
    items: [
      ...Object.entries(ASSET_STATUS).map(([s, v]) => ({ label: status === s ? `✓ ${v.label}` : v.label, onClick: () => { setStatus(status === s ? "" : s); setPage(1); } })),
      { sep: true },
      { label: "Clear filters", icon: <X />, onClick: () => { setStatus(""); setCategory(""); setBranch(""); setSearch(""); setQ(""); setPage(1); } },
    ],
  });
  const exportCsv = () => {
    if (!items.length) { toast("Nothing to export", { tone: "warn" }); return; }
    downloadCsv(`fixed-assets-${isoDay(new Date())}.csv`, [
      ["Code", "Asset", "Description", "Category", "Location", "Custodian", "Acquired", "Cost", "Method", "Rate %", "Accumulated depreciation", "NBV", "Status", "Tag", "Serial"],
      ...items.map((a) => [a.code, a.name, a.description, a.category.name, a.branch.name, a.custodian?.name ?? null, a.acquisitionDate, a.cost, a.method, a.ratePct, a.accumulatedDepreciation, a.nbv,
        ASSET_STATUS[a.status]?.label ?? a.status, a.tagNo, a.serialNo]),
    ]);
    toast("Exported to Excel (CSV)", { tone: "good" });
  };
  const pageButtons = () => {
    const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
    const list = [...set].sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    list.forEach((p, i) => { if (i && p - list[i - 1]! > 1) out.push("…"); out.push(p); });
    return out;
  };
  const allChecked = items.length > 0 && items.every((a) => selected.has(a.id));
  const today = dateLabel(isoDay(new Date()));

  return (
    <>
      <PageHead
        eyebrow="Fixed Assets / Register"
        title="Fixed Asset Register"
        description={<>Cost, accumulated depreciation and net book value across branches · as at <span suppressHydrationWarning>{today}</span>.</>}
        actions={
          <>
            <Button icon={<Upload />} disabled title="Import arrives with data migration (Phase 35)">Import</Button>
            <Button icon={<Download />} onClick={exportCsv} disabled={!data}>Export</Button>
            <ButtonLink href="/assets/depreciation" icon={<TrendingDown />}>Run Depreciation</ButtonLink>
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => setForm("new")}>New Asset</Button>}
          </>
        }
      />

      {error && <ErrorState message={error.message} reference={error.reference} onRetry={reload} />}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-top"><span>Gross Cost</span><span className="icon-well"><Package /></span></div>
          <strong>{k ? <Money value={k.grossCost} dec={0} /> : <Skeleton style={{ height: 26, width: 140 }} />}</strong>
          <small className={cn(k && k.additionsFy > 0 && "up")}>{k ? <>{k.additionsFy > 0 && "▲ "}<Money value={k.additionsFy} dec={0} /> additions this FY</> : " "}</small>
        </div>
        <div className="kpi yellow">
          <div className="kpi-top"><span>Accumulated Depreciation</span><span className="icon-well"><TrendingDown /></span></div>
          <strong>{k ? <Money value={k.accumulated} dec={0} /> : <Skeleton style={{ height: 26, width: 140 }} />}</strong>
          <small>{k ? <><Money value={k.monthlyCharge} dec={0} /> charged per month</> : " "}</small>
        </div>
        <div className="kpi teal">
          <div className="kpi-top"><span>Net Book Value</span><span className="icon-well"><Landmark /></span></div>
          <strong>{k ? <Money value={k.nbv} dec={0} /> : <Skeleton style={{ height: 26, width: 140 }} />}</strong>
          <small>{k && k.grossCost > 0 ? `${((k.nbv / k.grossCost) * 100).toFixed(1)}% of gross cost` : " "}</small>
        </div>
        <div className="kpi blue">
          <div className="kpi-top"><span>Active Assets</span><span className="icon-well"><Boxes /></span></div>
          <strong>{k ? k.active : <Skeleton style={{ height: 26, width: 60 }} />}</strong>
          <small>{k ? `${k.branches} ${k.branches === 1 ? "branch" : "branches"} · ${k.fullyDepreciated} fully depreciated` : " "}</small>
        </div>
      </div>

      <div className="split mt">
        <div className="stack">
          <div className="panel flush">
            <div className="panel-head"><div><h3>Assets</h3><p>{k ? `${k.active} active · as at ` : "as at "}<span suppressHydrationWarning>{today}</span></p></div></div>
            <div className="toolbar">
              <label className="search-field"><Search /><input placeholder="Search code, name, serial or tag…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <div className="chips">
                <button type="button" className={cn(!category && "active")} onClick={() => { setCategory(""); setPage(1); }}>All <i>{catTotal}</i></button>
                {data && Object.entries(data.counts).sort((a, b) => catName(a[0]).localeCompare(catName(b[0]))).map(([id, n]) => (
                  <button type="button" key={id} className={cn(category === id && "active")} onClick={() => { setCategory(id); setPage(1); }}>{catName(id)} <i>{n}</i></button>
                ))}
              </div>
              <span className="spacer" />
              <select value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); }} aria-label="Branch">
                <option value="">All branches</option>
                {options?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button type="button" className={cn("btn secondary sm", status && "fa-filter-on")} onClick={(e) => filterMenu(e.currentTarget)}>
                <Filter />{status ? ASSET_STATUS[status]?.label ?? "Filters" : "Filters"}
              </button>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th><input type="checkbox" aria-label="Select all" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((a) => a.id)))} /></th>
                    <th>Code</th><th>Asset</th><th>Category</th><th>Location</th><th>Acquired</th><th className="num">Cost</th><th>Method</th><th className="num">Rate</th><th className="num">NBV</th><th>Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {!data && !error && Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={12}><Skeleton style={{ height: 18 }} /></td></tr>)}
                  {items.map((a) => (
                    <tr key={a.id} onDoubleClick={() => router.push(`/assets/${a.id}`)}>
                      <td><input type="checkbox" aria-label={`Select ${a.code}`} checked={selected.has(a.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} /></td>
                      <td><Link className="link" href={`/assets/${a.id}`}><Hl text={a.code} q={q} /></Link></td>
                      <td><Hl text={a.name} q={q} />{(a.registrationNo || a.description || a.serialNo || a.tagNo) && <small>{[a.registrationNo, a.description, a.serialNo && `Serial ${a.serialNo}`, a.tagNo && `Tag ${a.tagNo}`].filter(Boolean).join(" · ")}</small>}</td>
                      <td>{a.category.name}</td>
                      <td>{a.branch.name}</td>
                      <td>{dateLabel(a.acquisitionDate)}</td>
                      <td className="num">{amt(a.cost)}</td>
                      <td>{a.method === "NONE" ? <Badge tone="neutral">None</Badge> : a.method}</td>
                      <td className={cn("num", a.ratePct === null && "zero")}>{a.ratePct === null ? "—" : `${a.ratePct}%`}</td>
                      <td className={cn("num", a.nbv === 0 && "zero")}>{a.nbv === 0 ? "—" : amt(a.nbv)}</td>
                      <td><AssetStatus status={a.status} /></td>
                      <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Actions for ${a.code}`} onClick={(e) => setMenu({ anchor: e.currentTarget, items: rowMenu(a) })}><MoreHorizontal /></button></td>
                    </tr>
                  ))}
                  {data && !items.length && (
                    <tr><td colSpan={12}>
                      {filtered ? (
                        <EmptyState icon={<Search />} title="No assets match" description="Try another search, category, branch or status." action={<Button size="sm" onClick={() => { setSearch(""); setQ(""); setCategory(""); setBranch(""); setStatus(""); setPage(1); }}>Clear filters</Button>} />
                      ) : (
                        <EmptyState icon={<Boxes />} title="No fixed assets yet" description="Add vehicles, computers, furniture and other assets, then capitalise them to start depreciation." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => setForm("new")}>New Asset</Button>} />
                      )}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {data && total > 0 && (
              <div className="table-foot">
                <span>Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total}{selected.size > 0 && ` · ${selected.size} selected`}</span>
                {pages > 1 && (
                  <div className="pager">
                    <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
                    {pageButtons().map((p, i) => p === "…" ? <button type="button" key={`e${i}`} disabled>…</button> : (
                      <button type="button" key={p} className={cn(p === page && "active")} onClick={() => setPage(p)}>{p}</button>
                    ))}
                    <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Cost by category</h3><p>{k ? `Gross cost ${millions(k.grossCost)}` : "Loading…"}</p></div></div>
            {!data ? <Skeleton style={{ height: 140 }} /> : !data.byCategory.some((c) => c.cost > 0) ? (
              <p className="muted small">Capitalised assets appear here by category.</p>
            ) : (
              <>
                <div className="stackbar mb">
                  {data.byCategory.filter((c) => c.cost > 0).map((c, i) => <i key={c.category.id} title={`${c.category.name} ${millions(c.cost)}`} style={{ width: `${(c.cost / (k!.grossCost || 1)) * 100}%`, background: STACK_COLORS[i % STACK_COLORS.length] }} />)}
                </div>
                <div className="list">
                  {data.byCategory.filter((c) => c.cost > 0).map((c) => {
                    const { icon: Icon, tone } = categoryIcon(c.category.name);
                    const policy = options?.categories.find((x) => x.id === c.category.id);
                    const methodText = c.method === "NONE" ? "Not depreciated" : `${c.method}${policy?.defaultRatePct ? ` ${policy.defaultRatePct}%` : ""}`;
                    return (
                      <div className="list-item" key={c.category.id}>
                        <span className={cn("icon-well", tone)}><Icon /></span>
                        <div><b>{c.category.name}</b><small>NBV {Math.round(c.nbv).toLocaleString("en-US")} · {methodText}</small></div>
                        <span className="spacer" />
                        <b>{Math.round(c.cost).toLocaleString("en-US")}</b>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Needs attention</h3><p>{attention ? `${attention.length} ${attention.length === 1 ? "item" : "items"}` : "Checking…"}</p></div></div>
            {!attention ? <Skeleton style={{ height: 100 }} /> : !attention.length ? (
              <p className="muted small">Nothing needs attention — no assets under repair, awaiting capitalisation or with insurance due.</p>
            ) : (
              <div className="list fa-attention">
                {attention.slice(0, 6).map((x) => (
                  <Link className="list-item" key={x.key} href={x.href}>
                    <span className={cn("icon-well", x.tone)}>{x.icon}</span>
                    <div><b>{x.title}</b><small>{x.sub}</small></div>
                  </Link>
                ))}
                {attention.length > 6 && <p className="muted small">and {attention.length - 6} more</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
      <AssetFormModal
        open={!!form}
        asset={form && form !== "new" ? form : null}
        options={options}
        canPost={can.post}
        onClose={() => setForm(null)}
        onSaved={(a, capitalise) => { setForm(null); reload(); if (capitalise) setCapitalising(a); }}
      />
      <CapitaliseModal asset={capitalising} onClose={() => setCapitalising(null)} onDone={() => { setCapitalising(null); reload(); }} />
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.code ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!removing) return;
        setBusy(true);
        try {
          await deleteAsset(removing.id, removing.rowVersion);
          toast(`${removing.code} deleted`, { tone: "good" });
          reload();
        } catch (e) {
          toast(apiMessage(e, "Could not delete the asset"), { tone: "danger" });
        } finally {
          setBusy(false);
          setRemoving(null);
        }
      }}>{removing?.name} has not been capitalised, so it can be removed from the register.</ConfirmDialog>
    </>
  );
}
