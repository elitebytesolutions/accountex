"use client";

import {
  ArrowUpDown, Building2, CalendarPlus, CirclePause, CirclePlay, CreditCard, Download, Eye, HeartCrack, Hourglass, Layers, MoreHorizontal, PanelRightOpen,
  Plus, RotateCcw, Search, SearchX, Send, Users, VenetianMask, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TENANT_STATUSES, type Subscription, type SubscriptionPlan, type TenantList, type TenantListItem } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { listPlans } from "@/features/platform-catalogue/api";
import { activePlans } from "@/features/platform-catalogue/components/catalogue-ui";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { changeSubscriptionPlan, extendSubscriptionTrial, getSubscription, listTenants } from "../api";
import { SubscriptionActionModal, type SubscriptionAction } from "./subscription-actions";
import { TenantStatusDialog, type StatusAction } from "./tenant-status-dialog";
import { Avatar, daysTo, fmt, fmtDate, fmtDateTime, HealthRing, Meter, ModsCell, relDays, rs, StatusBadge, TenantLogo, TenantPlanPill } from "./tenant-ui";

const VIEWS = [
  { key: "all", label: "All", icon: Layers },
  { key: "risk", label: "At risk", icon: HeartCrack },
  { key: "trial", label: "Trials", icon: Hourglass },
  { key: "pastdue", label: "Past due", icon: CreditCard },
  { key: "suspended", label: "Suspended", icon: CirclePause },
] as const;
type Filters = { view: string; search: string; plan: string; status: string; province: string; city: string };
const NO_FILTERS: Filters = { view: "all", search: "", plan: "", status: "", province: "", city: "" };
const PAGE_SIZE = 25;
const LIVE = ["TRIAL", "ACTIVE", "PAST_DUE", "READ_ONLY"];

/** The renewal cell: trial end for a trial, else the renewal date with "in n d". */
function RenewalCell({ t }: { t: TenantListItem }) {
  if (t.subscriptionStatus === "TRIAL" && t.trialEndsOn) {
    return <>{fmtDate(t.trialEndsOn)}<small className="ap-warn-t">Trial ends {relDays(daysTo(t.trialEndsOn))}</small></>;
  }
  if (!t.renewalOn) return <span className="zero">—</span>;
  const d = daysTo(t.renewalOn);
  return <>{fmtDate(t.renewalOn)}<small className={d !== null && d < 0 ? "ap-danger-t" : undefined}>{relDays(d)}</small></>;
}

/**
 * Admin › Tenants › All Tenants (template 3A-admin-plus.html:4, 9B-admin-plus.js 202–416): five KPIs, portfolio
 * health / region strip, view chips, filters, the tenant table with bulk actions and a quick-view drawer.
 */
export function TenantsScreen() {
  const toast = useToast();
  const router = useRouter();
  const lookups = useAdminLookups(["TenantStatus", "Province"]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TenantList | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [quick, setQuick] = useState<TenantListItem | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; t: TenantListItem } | null>(null);
  const [subAction, setSubAction] = useState<{ action: SubscriptionAction; sub: Subscription } | null>(null);
  const [statusAction, setStatusAction] = useState<{ action: StatusAction; tenants: TenantListItem[] } | null>(null);
  const [bulk, setBulk] = useState<"trial" | "plan" | null>(null);

  // search is debounced into the filters
  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => (f.search === search.trim() ? f : { ...f, search: search.trim() })); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const key = JSON.stringify([filters, page, attempt]);
    listTenants({ ...filters, page, pageSize: PAGE_SIZE })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load tenants" }))
      .finally(() => !cancelled && setLoadedFor(key));
    return () => { cancelled = true; };
  }, [filters, page, attempt]);
  const loading = loadedFor !== JSON.stringify([filters, page, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    listPlans().then((p) => setPlans(activePlans(p))).catch(() => undefined);
  }, []);

  const set = (patch: Partial<Filters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); setSel(new Set()); };
  const reset = () => { setSearch(""); setFilters(NO_FILTERS); setPage(1); setSel(new Set()); };
  const items = useMemo(() => data?.items ?? [], [data]);
  const chosen = items.filter((t) => sel.has(t.id));
  const allOn = items.length > 0 && items.every((t) => sel.has(t.id));
  const someOn = !allOn && items.some((t) => sel.has(t.id));
  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  const k = data?.kpis;
  const scored = items.filter((t) => t.healthScore !== null);
  const healthy = scored.filter((t) => t.healthScore! >= 75).length, watch = scored.filter((t) => t.healthScore! >= 50 && t.healthScore! < 75).length, risk = scored.filter((t) => t.healthScore! < 50).length;
  const cities = [...new Set(items.map((t) => t.city).filter((c): c is string => !!c)), ...(filters.city ? [filters.city] : [])].sort();
  const viewCount: Record<string, number | undefined> = { all: data ? data.regions.reduce((s, r) => s + r.count, 0) : undefined, risk: k?.atRisk, trial: k?.trial, pastdue: k?.pastDue };
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const exportCsv = () => {
    const head = ["Code", "Company", "Legal name", "City", "Province", "Plan", "Cycle", "Status", "Health", "MRR", "Seats in use", "Seats", "Modules", "Renewal", "Trial ends", "Owner", "Owner email"];
    const rows = items.map((t) => [t.code, t.displayName, t.legalName, t.city, t.province, t.planName, t.billingCycle, t.status, t.healthScore, t.mrr, t.seatsInUse, t.seats, t.moduleKeys.join(" "), t.renewalOn, t.trialEndsOn, t.ownerContactName, t.ownerContactEmail]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${items.length} tenants exported to ${a.download}`, { tone: "good" });
  };

  const openSub = async (t: TenantListItem, action: SubscriptionAction) => {
    if (!t.subscriptionId) { toast(`${t.displayName} has no subscription · start one from Tenant 360`, { tone: "warn" }); return; }
    try { setSubAction({ action, sub: await getSubscription(t.subscriptionId) }); }
    catch (e) { toast(adminErrorMessage(e, "Could not load the subscription"), { tone: "danger" }); }
  };
  const rowMenu = (t: TenantListItem): MenuItem[] => [
    { label: "Open Tenant 360", icon: <PanelRightOpen />, onClick: () => router.push(`/admin/tenants/${t.id}`) },
    { label: "Quick view", icon: <Eye />, onClick: () => setQuick(t) },
    { label: "Change plan", icon: <ArrowUpDown />, disabled: !t.subscriptionId, onClick: () => void openSub(t, "plan") },
    { label: "Extend trial", icon: <CalendarPlus />, disabled: t.subscriptionStatus !== "TRIAL", onClick: () => void openSub(t, "trial") },
    { label: "Send notice (Phase 42)", icon: <Send />, disabled: true, onClick: () => undefined },
    { sep: true },
    ["SUSPENDED", "READ_ONLY"].includes(t.status)
      ? { label: "Reactivate", icon: <CirclePlay />, onClick: () => setStatusAction({ action: "reactivate", tenants: [t] }) }
      : { label: "Suspend", icon: <CirclePause />, danger: true, disabled: !LIVE.includes(t.status), onClick: () => setStatusAction({ action: "suspend", tenants: [t] }) },
  ];

  return (
    <>
      <PageHead eyebrow="Tenants / All Tenants" title="All Tenants" description="Every organisation on Accountex Cloud: lifecycle, health, revenue and seats in one place."
        actions={<>
          {k && <span className="tagline">{fmt(k.live + k.trial)} businesses trust us</span>}
          <button type="button" className="btn secondary" disabled={!items.length} onClick={exportCsv}><Download />Export CSV</button>
          <Link className="btn primary" href="/admin/tenants/new"><Plus />Onboard tenant</Link>
        </>} />

      <div className="kpi-grid c5">
        {[
          ["Live tenants", k ? fmt(k.live) : "—", k ? `${rs(k.mrr)} MRR` : "Active, past due and read-only", "", Building2],
          ["In trial", k ? fmt(k.trial) : "—", "Converting at trial end", "yellow", Hourglass],
          ["At risk", k ? fmt(k.atRisk) : "—", "Health score under 50", "red", HeartCrack],
          ["Past due", k ? fmt(k.pastDue) : "—", "Tenants with an overdue balance", "violet", CreditCard],
          ["Seats in use", k ? fmt(k.seatsInUse) : "—", k ? `of ${fmt(k.seats)} seats subscribed` : "Across all subscriptions", "teal", Users],
        ].map(([label, value, sub, tone, Icon]) => {
          const I = Icon as React.ElementType;
          return <div key={label as string} className={cn("kpi", tone as string)}><div className="kpi-top"><span>{label as string}</span><span className="icon-well"><I /></span></div><strong>{value as string}</strong><small>{sub as string}</small></div>;
        })}
      </div>

      <div className="panel ap-strip">
        <div className="ap-strip-h"><b>Portfolio health</b><small>Weighted score from logins, adoption, invoicing, payments, tickets and NPS</small></div>
        <div className="ap-strip-bar">
          {scored.length ? (
            <div className="stackbar ap-hbar">
              <i style={{ width: `${(healthy / scored.length) * 100}%`, background: "var(--good)" }} title={`Healthy · ${healthy}`} />
              <i style={{ width: `${(watch / scored.length) * 100}%`, background: "var(--warn)" }} title={`Watch · ${watch}`} />
              <i style={{ width: `${(risk / scored.length) * 100}%`, background: "var(--danger)" }} title={`At risk · ${risk}`} />
            </div>
          ) : <div className="stackbar ap-hbar"><i style={{ width: "100%", background: "var(--surface-3)" }} title="No health scores yet" /></div>}
          <div className="legend">
            <span><i style={{ background: "var(--good)" }} />Healthy 75+ <b>{healthy}</b></span>
            <span><i style={{ background: "var(--warn)" }} />Watch 50–74 <b>{watch}</b></span>
            <span><i style={{ background: "var(--danger)" }} />At risk &lt;50 <b>{risk}</b></span>
            {items.length > scored.length && <span><i style={{ background: "var(--surface-3)" }} />Not scored <b>{items.length - scored.length}</b></span>}
          </div>
        </div>
        <div className="ap-strip-regions">
          {(data?.regions ?? []).slice(0, 5).map((r) => <div key={r.province ?? "none"}><small>{r.province ? labelOf(lookups, "Province", r.province) : "Not set"}</small><b>{r.count}</b></div>)}
        </div>
      </div>

      <div className="ap-views chips" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" className={filters.view === v.key ? "active" : undefined} onClick={() => set({ view: v.key })}>
            <v.icon className="ap-vic" />{v.label}{viewCount[v.key] !== undefined && <> <i>{viewCount[v.key]}</i></>}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <label className={cn("search-field", search && "has-val")}><Search /><input value={search} placeholder="Search name, code or owner email…" onChange={(e) => setSearch(e.target.value)} /></label>
        <select value={filters.plan} onChange={(e) => set({ plan: e.target.value })} aria-label="Plan"><option value="">All plans</option>{plans.map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}</select>
        <select value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status"><option value="">All statuses</option>{TENANT_STATUSES.map((s) => <option key={s} value={s}>{labelOf(lookups, "TenantStatus", s)}</option>)}</select>
        <select value={filters.province} onChange={(e) => set({ province: e.target.value, city: "" })} aria-label="Region"><option value="">All regions</option>{(lookups.Province ?? []).map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select>
        <select value={filters.city} onChange={(e) => set({ city: e.target.value })} aria-label="City"><option value="">All cities</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <span className="spacer" />
        <button type="button" className="btn ghost sm" onClick={reset}><RotateCcw />Reset</button>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Tenants</h3><p>{data ? `${fmt(data.total)} shown` : "Loading…"} · click a row for a quick view, tick rows for bulk actions</p></div></div>
        {error ? <div style={{ padding: 16 }}><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div> : (
          <div className="table-wrap">
            <table className="tbl ap-ttbl">
              <thead><tr>
                <th className="th-check"><input type="checkbox" aria-label="Select all" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn; }} onChange={(e) => setSel(e.target.checked ? new Set(items.map((t) => t.id)) : new Set())} /></th>
                <th>Tenant</th><th>Plan</th><th>Health</th><th className="num">MRR (Rs)</th><th>Seats</th><th>Modules</th><th>Status</th><th>Renewal</th><th />
              </tr></thead>
              <tbody>
                {loading && !data ? Array.from({ length: 5 }, (_, i) => <tr key={i}>{Array.from({ length: 10 }, (_, j) => <td key={j}><Skeleton style={{ height: 10, width: "70%" }} /></td>)}</tr>) :
                  items.length === 0 ? (
                    <tr className="no-results"><td colSpan={10}><EmptyState icon={<SearchX />} title="No tenants match" description="Try another view or clear the filters." action={<button type="button" className="btn secondary sm" onClick={reset}>Reset filters</button>} /></td></tr>
                  ) : items.map((t, i) => (
                    <tr key={t.id} className={cn("ap-row-in", sel.has(t.id) && "selected")} style={{ ["--ri" as string]: Math.min(i, 16), cursor: "pointer", opacity: loading ? 0.6 : undefined }}
                      onClick={(e) => { if (!(e.target as HTMLElement).closest("input,a,button")) setQuick(t); }}>
                      <td className="th-check"><input type="checkbox" checked={sel.has(t.id)} aria-label={`Select ${t.displayName}`} onChange={(e) => toggle(t.id, e.target.checked)} /></td>
                      <td><div className="cell-user"><TenantLogo name={t.displayName} /><div><b>{t.displayName}</b><small>{t.code.toUpperCase()}{t.city ? ` · ${t.city}` : ""}</small></div></div></td>
                      <td><TenantPlanPill code={t.planCode} name={t.planName} /></td>
                      <td><HealthRing score={t.healthScore} /></td>
                      <td className="num">{t.mrr ? fmt(t.mrr) : <span className="zero">—</span>}</td>
                      <td>{t.seats ? <Meter compact used={t.seatsInUse ?? 0} limit={t.seats} text={`${fmt(t.seatsInUse ?? 0)}/${fmt(t.seats)}`} /> : <span className="zero">{t.seatsInUse ? `${t.seatsInUse} users` : "—"}</span>}</td>
                      <td><ModsCell keys={t.moduleKeys} /></td>
                      <td><StatusBadge lookups={lookups} code={t.status} /></td>
                      <td><RenewalCell t={t} /></td>
                      <td className="actions"><button type="button" className="icon-btn-sm" aria-label="More actions" onClick={(e) => setMenu({ anchor: e.currentTarget, t })}><MoreHorizontal /></button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-foot">
          <span>View MRR <b className="tnum">{rs(items.reduce((s, t) => s + t.mrr, 0))}</b></span>
          {pages > 1 && (
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
              {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1).map((n) => <button key={n} type="button" className={n === page ? "active" : undefined} onClick={() => setPage(n)}>{n}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
            </div>
          )}
        </div>
      </div>

      {/* template #ap-tbulk: own bulk bar */}
      <div className={cn("bulkbar ap-bulk", sel.size > 0 && "on")} role="toolbar" aria-label="Bulk actions">
        <b><i>{sel.size}</i>selected</b>
        <button type="button" onClick={() => setBulk("trial")}><CalendarPlus />Extend trial</button>
        <button type="button" onClick={() => setBulk("plan")}><ArrowUpDown />Change plan</button>
        <button type="button" disabled title="Arrives with Communications (Phase 42)"><Send />Send notice</button>
        <button type="button" className="danger" onClick={() => setStatusAction({ action: "suspend", tenants: chosen })}><CirclePause />Suspend</button>
        <button type="button" aria-label="Clear selection" onClick={() => setSel(new Set())}><X /></button>
      </div>

      {menu && <Menu anchor={menu.anchor} items={rowMenu(menu.t)} onClose={() => setMenu(null)} />}
      <QuickView t={quick} lookups={lookups} onClose={() => setQuick(null)} />
      <SubscriptionActionModal action={subAction?.action ?? null} sub={subAction?.sub ?? null} onClose={() => setSubAction(null)} onDone={() => { setSubAction(null); reload(); }} />
      <TenantStatusDialog action={statusAction?.action ?? null} tenants={statusAction?.tenants ?? []} onClose={() => setStatusAction(null)}
        onDone={() => { setStatusAction(null); setSel(new Set()); reload(); }} />
      <BulkSubscriptionModal mode={bulk} tenants={chosen} plans={plans} onClose={() => setBulk(null)} onDone={() => { setBulk(null); setSel(new Set()); reload(); }} />
    </>
  );
}

/** Template quick view drawer (9B quickView). Health factors are not tracked yet, so only the score is shown. */
function QuickView({ t, lookups, onClose }: { t: TenantListItem | null; lookups: ReturnType<typeof useAdminLookups>; onClose: () => void }) {
  const router = useRouter();
  const [last, setLast] = useState(t);
  if (t && t !== last) setLast(t);
  const q = t ?? last;
  return (
    <Drawer open={!!t} onClose={onClose} title={q?.displayName ?? ""} subtitle={q ? `${q.code.toUpperCase()}${q.city ? ` · ${q.city}` : ""}${q.province ? `, ${labelOf(lookups, "Province", q.province)}` : ""}` : ""} className="ap-drawer"
      foot={q && <>
        <button type="button" className="btn secondary" onClick={() => router.push(`/admin/tenants/${q.id}?impersonate=1`)}><VenetianMask />Impersonate</button>
        <Link className="btn primary" href={`/admin/tenants/${q.id}`}><PanelRightOpen />Open Tenant 360</Link>
      </>}>
      {q && (
        <div className="ap-qv">
          <div className="ap-qv-top"><TenantLogo name={q.displayName} size="lg" /><div className="ap-qv-meta"><TenantPlanPill code={q.planCode} name={q.planName} /> <StatusBadge lookups={lookups} code={q.status} /><small>Customer since {fmtDate(q.createdAt)}{q.ownerContactName ? ` · owner ${q.ownerContactName}` : ""}</small></div><HealthRing score={q.healthScore} size={72} stroke={7} /></div>
          <div className="ap-qv-stats">
            <div><small>MRR</small><b>{q.mrr ? rs(q.mrr) : "—"}</b></div>
            <div><small>Seats</small><b>{fmt(q.seatsInUse ?? 0)} / {q.seats ? fmt(q.seats) : "—"}</b></div>
            <div><small>{q.subscriptionStatus === "TRIAL" ? "Trial ends" : "Renewal"}</small><b>{fmtDate(q.subscriptionStatus === "TRIAL" ? q.trialEndsOn : q.renewalOn)}</b></div>
          </div>
          <h4 className="ap-h4">Health breakdown</h4>
          <p className="muted small">{q.healthScore === null ? "No health score yet: scoring (logins, adoption, invoicing, payments, tickets, NPS) arrives with SaaS analytics." : `Score ${q.healthScore}/100 · ${q.healthBucket ?? ""}`}</p>
          <h4 className="ap-h4">Modules</h4>
          <ModsCell keys={q.moduleKeys} />
          <h4 className="ap-h4">Contacts</h4>
          {q.ownerContactName ? (
            <div className="list"><div className="list-item"><Avatar name={q.ownerContactName} /><div><b>{q.ownerContactName}</b><small>Owner · {q.ownerContactEmail}</small></div></div></div>
          ) : <p className="muted small">No owner contact recorded.</p>}
          <h4 className="ap-h4">Last activity</h4>
          <div className="timeline">
            <div className="tl-item"><span className={cn("tl-dot", q.lastActiveAt && "good")} /><div><b>{q.lastActiveAt ? "Signed in" : "No sign-in recorded"}</b><small>{fmtDateTime(q.lastActiveAt)}</small></div></div>
            <div className="tl-item"><span className="tl-dot info" /><div><b>Company created</b><small>{fmtDateTime(q.createdAt)}</small></div></div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/** Bulk "Extend trial" / "Change plan" (template 9B extendTrial / changePlan for the selected rows). */
function BulkSubscriptionModal({ mode, tenants, plans, onClose, onDone }: {
  mode: "trial" | "plan" | null; tenants: TenantListItem[]; plans: SubscriptionPlan[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const eligible = tenants.filter((t) => (mode === "trial" ? t.subscriptionStatus === "TRIAL" : !!t.subscriptionId) && t.subscriptionId);
  const run = async () => {
    setBusy(true);
    const results = await Promise.allSettled(eligible.map(async (t) => {
      const s = await getSubscription(t.subscriptionId!);
      return mode === "trial" ? extendSubscriptionTrial(s.id, s.rowVersion, days) : changeSubscriptionPlan(s.id, { rowVersion: s.rowVersion, planId });
    }));
    setBusy(false);
    const ok = results.filter((r) => r.status === "fulfilled").length, failed = results.length - ok, skipped = tenants.length - eligible.length;
    const first = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    toast(
      `${ok} ${mode === "trial" ? `trial${ok === 1 ? "" : "s"} extended by ${days} days` : `tenant${ok === 1 ? "" : "s"} moved to ${plans.find((p) => p.id === planId)?.name ?? "the plan"}`}${skipped ? ` · ${skipped} skipped (${mode === "trial" ? "not on trial" : "no subscription"})` : ""}${failed ? ` · ${failed} failed: ${adminErrorMessage(first?.reason, "error")}` : ""}`,
      { tone: failed ? "warn" : ok ? "good" : "warn" },
    );
    onDone();
  };
  return (
    <Modal open={!!mode} onClose={onClose} title={mode === "trial" ? "Extend trial" : "Change plan"} subtitle={`${tenants.length} tenant${tenants.length === 1 ? "" : "s"} selected${mode === "plan" ? " · applied from today" : ""}`} wide={mode === "plan"}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || !eligible.length || (mode === "plan" && !planId)} onClick={run}>{busy ? "Working…" : mode === "trial" ? <><CalendarPlus />Extend</> : "Apply plan"}</button></>}>
      {mode === "trial" && (
        <>
          <div className="ap-lbl">Extend by</div>
          <div className="seg ap-mb">{([7, 14, 30] as const).map((d) => <button key={d} type="button" className={days === d ? "active" : undefined} onClick={() => setDays(d)}>{d} days</button>)}</div>
        </>
      )}
      {mode === "plan" && (
        <div className="radio-cards ap-plans">
          {plans.map((p) => <label key={p.id} className="radio-card"><input type="radio" name="bulk-plan" checked={planId === p.id} onChange={() => setPlanId(p.id)} /><div><b>{p.name}</b><small>{p.isCustomPrice ? "Custom pricing" : `${rs(p.priceMonthly)} / month`} · {p.userSeats ? `up to ${p.userSeats}` : "unlimited"} users</small></div></label>)}
        </div>
      )}
      <div className="ap-chiplist ap-mt">
        {tenants.map((t) => <span key={t.id} className="pill"><TenantLogo name={t.displayName} size="xs" />{t.displayName}{!eligible.includes(t) && <em className="ap-muted-t"> · {mode === "trial" ? "not on trial" : "no subscription"}</em>}</span>)}
      </div>
    </Modal>
  );
}

