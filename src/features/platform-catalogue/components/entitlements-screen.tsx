"use client";

import { ArrowRight, Check, Eye, Gauge, History, Info, Layers, Lock, Plus, Search, Tags, TrendingUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Addon, PlatformModule, SubscriptionPlan, UsageMeterOption } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Switch } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf } from "@/features/settings/use-lookups";
import { saveEntitlements } from "@/features/platform-ops/api";
import { EntitlementLogTab } from "@/features/platform-ops/components/entitlement-log-tab";
import { ApiError } from "@/lib/api/errors";
import { listAddons, listModules, listPlans, listUsageMeters, setModuleEnabled } from "../api";
import { AddonModal } from "./addon-modal";
import { activePlans, CatalogueIcon, GROUP_ICONS, PlanPill, plural, rs } from "./catalogue-ui";
import { ModuleModal } from "./module-modal";

const LOOKUPS = ["EntGroup", "ModuleKey", "PlatformModuleKind", "BillingUnit", "Availability"];
type Data = { plans: SubscriptionPlan[]; modules: PlatformModule[]; addons: Addon[]; meters: UsageMeterOption[] };
type Draft = {
  feat: Record<string, Record<string, boolean>>;
  min: Record<string, string | null>;
  lim: Record<string, Record<string, number | null>>;
  add: Record<string, number>;
};
type Change =
  | { kind: "feat"; moduleId: string; planId: string; from: boolean; to: boolean }
  | { kind: "min"; moduleId: string; from: string | null; to: string | null }
  | { kind: "lim"; planId: string; meterId: string; from: number | null; to: number | null }
  | { kind: "add"; addonId: string; from: number; to: number };

const draftOf = (d: Data, plans: SubscriptionPlan[]): Draft => ({
  feat: Object.fromEntries(d.modules.map((m) => [m.id, Object.fromEntries(plans.map((p) => [p.id, m.plans.find((x) => x.planId === p.id)?.isIncluded ?? false]))])),
  min: Object.fromEntries(d.modules.map((m) => [m.id, m.minPlanId])),
  lim: Object.fromEntries(plans.map((p) => [p.id, Object.fromEntries(d.meters.map((mt) => [mt.id, p.limits.find((l) => l.usageMeterId === mt.id)?.limitValue ?? null]))])),
  add: Object.fromEntries(d.addons.map((a) => [a.id, a.price])),
});
function changesOf(base: Draft, cur: Draft): Change[] {
  const out: Change[] = [];
  for (const [m, row] of Object.entries(cur.feat)) for (const [p, v] of Object.entries(row)) if (v !== base.feat[m]?.[p]) out.push({ kind: "feat", moduleId: m, planId: p, from: Boolean(base.feat[m]?.[p]), to: v });
  for (const [m, v] of Object.entries(cur.min)) if (v !== base.min[m]) out.push({ kind: "min", moduleId: m, from: base.min[m] ?? null, to: v });
  for (const [p, row] of Object.entries(cur.lim)) for (const [mt, v] of Object.entries(row)) if (v !== base.lim[p]?.[mt]) out.push({ kind: "lim", planId: p, meterId: mt, from: base.lim[p]?.[mt] ?? null, to: v });
  for (const [a, v] of Object.entries(cur.add)) if (v !== base.add[a]) out.push({ kind: "add", addonId: a, from: base.add[a] ?? 0, to: v });
  return out;
}
const limFmt = (v: number | null) => (v === null ? "∞" : v.toLocaleString("en-PK"));

/**
 * Template admin/entitlements (3B-flags.html, 9J-flags.js 1512+): plan cards, the feature matrix by group with Core
 * locks and the limits group, the add-ons panel, the save bar and the "Review changes" drawer. Rows are platform modules
 * (cells = PlatformModulePlans), limits are SubscriptionPlanLimits, add-on prices are Addons. The "Modules by plan" table
 * is the template's admin/features "Core modules" pane, placed here until Phase 39 builds /admin/features.
 * Phase 43: "Save entitlements" is one change set (POST /api/admin/entitlements/save) that writes EntitlementChangeLogs
 * rows with the drawer's three switches; the "Change log" tab lists past change sets.
 */
export function EntitlementsScreen() {
  const toast = useToast();
  const lookups = useAdminLookups(LOOKUPS);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [base, setBase] = useState<Draft | null>(null);
  const [cur, setCur] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editModule, setEditModule] = useState<PlatformModule | "new" | null>(null);
  const [editAddon, setEditAddon] = useState<Addon | "new" | null>(null);
  const [turnOff, setTurnOff] = useState<PlatformModule | null>(null);
  const [view, setView] = useState<"matrix" | "log">("matrix");
  const [opts, setOpts] = useState({ grandfather: false, email: true, changelog: false });
  const [logKey, setLogKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPlans(), listModules(), listAddons(), listUsageMeters()])
      .then(([plans, modules, addons, meters]) => {
        if (cancelled) return;
        const d = { plans, modules, addons, meters };
        const draft = draftOf(d, activePlans(plans));
        setData(d); setBase(draft); setCur(draft); setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load entitlements" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const plans = useMemo(() => (data ? activePlans(data.plans) : []), [data]);
  const changes = useMemo(() => (base && cur ? changesOf(base, cur) : []), [base, cur]);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const planOf = (id: string | null) => plans.find((p) => p.id === id) ?? data?.plans.find((p) => p.id === id);
  const moduleOf = (id: string) => data?.modules.find((m) => m.id === id);
  const addonOf = (id: string) => data?.addons.find((a) => a.id === id);
  const meterOf = (id: string) => data?.meters.find((m) => m.id === id);
  const featCount = (planId: string) => (cur ? Object.values(cur.feat).filter((r) => r[planId]).length : 0);
  const impact = (c: Change): { tone: "good" | "danger" | "warn"; tenants: number; text: string } => {
    if (c.kind === "add") {
      const a = addonOf(c.addonId);
      return { tone: c.to > c.from ? "warn" : "good", tenants: a?.activeTenants ?? 0, text: `${a?.activeTenants ?? 0} active subscriptions ${c.to > c.from ? "pay" : "save"} ${rs(Math.abs(c.to - c.from))} at next renewal` };
    }
    if (c.kind === "min") {
      const m = moduleOf(c.moduleId);
      return { tone: "warn", tenants: 0, text: `${m?.name ?? "Module"} now starts at ${planOf(c.to)?.name ?? "no minimum"}` };
    }
    const p = planOf(c.planId);
    const n = p?.subscribers ?? 0;
    if (c.kind === "feat") return { tone: c.to ? "good" : "danger", tenants: n, text: `${n} ${p?.name ?? ""} tenants ${c.to ? "gain" : "lose"} ${moduleOf(c.moduleId)?.name ?? "this module"}` };
    const lower = c.to !== null && (c.from === null || c.to < c.from);
    return { tone: lower ? "warn" : "good", tenants: n, text: lower ? `${n} ${p?.name ?? ""} tenants get a lower limit` : `${n} ${p?.name ?? ""} tenants get more headroom` };
  };
  const affected = changes.reduce((t, c) => t + impact(c).tenants, 0);
  const losing = changes.some((c) => impact(c).tone === "danger");

  const toggle = (moduleId: string, planId: string) => setCur((d) => d && ({ ...d, feat: { ...d.feat, [moduleId]: { ...d.feat[moduleId], [planId]: !d.feat[moduleId]?.[planId] } } }));
  const setMin = (moduleId: string, planId: string) => setCur((d) => {
    if (!d) return d;
    const min = plans.find((p) => p.id === planId);
    const row = min ? Object.fromEntries(plans.map((p) => [p.id, p.sortOrder >= min.sortOrder])) : d.feat[moduleId]!;
    return { ...d, min: { ...d.min, [moduleId]: planId || null }, feat: { ...d.feat, [moduleId]: row } };
  });
  const setLim = (planId: string, meterId: string, v: string) => setCur((d) => d && ({ ...d, lim: { ...d.lim, [planId]: { ...d.lim[planId], [meterId]: v === "" ? null : Math.max(0, Number(v)) } } }));
  const setPrice = (addonId: string, v: string) => setCur((d) => d && ({ ...d, add: { ...d.add, [addonId]: Math.max(0, Number(v) || 0) } }));

  /** Phase 43: one change set in one transaction: module cells / minimum plans, plan limits, add-on prices + the log rows. */
  async function saveAll() {
    if (!data || !cur) return;
    setBusy(true);
    try {
      const modIds = [...new Set(changes.filter((c) => c.kind === "feat" || c.kind === "min").map((c) => (c as { moduleId: string }).moduleId))];
      const planIds = [...new Set(changes.filter((c) => c.kind === "lim").map((c) => (c as { planId: string }).planId))];
      const r = await saveEntitlements({
        grandfatherUntilRenewal: opts.grandfather, emailOwners: opts.email, postChangelog: opts.changelog,
        modules: modIds.map((id) => {
          const m = moduleOf(id)!;
          return { moduleId: id, rowVersion: m.rowVersion, ...(cur.min[id] !== m.minPlanId ? { minPlanId: cur.min[id] ?? null } : {}), plans: plans.map((p) => ({ planId: p.id, isIncluded: Boolean(cur.feat[id]?.[p.id]) })) };
        }),
        limits: planIds.map((id) => {
          const p = planOf(id)!;
          return {
            planId: id, rowVersion: p.rowVersion,
            limits: data.meters
              .filter((mt) => cur.lim[id]?.[mt.id] !== null || p.limits.some((l) => l.usageMeterId === mt.id))
              .map((mt) => ({ usageMeterId: mt.id, limitValue: cur.lim[id]?.[mt.id] ?? null, overagePrice: p.limits.find((l) => l.usageMeterId === mt.id)?.overagePrice ?? null })),
          };
        }),
        addons: changes.flatMap((c) => (c.kind === "add" ? [{ addonId: c.addonId, rowVersion: addonOf(c.addonId)!.rowVersion, price: c.to }] : [])),
      });
      toast(`Entitlements saved · ${plural(r.changes || changes.length, "change")} · ${r.tenantsAffected} tenants affected${opts.grandfather ? " (grandfathered)" : ""}`, { tone: "good" });
      setReview(false);
      setLogKey((n) => n + 1);
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not save the entitlements"), { tone: "danger" });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function setEnabled(m: PlatformModule, on: boolean) {
    try {
      await setModuleEnabled(m.id, on, m.rowVersion);
      toast(`${m.name} ${on ? "enabled" : "disabled"} for all tenants`, { tone: on ? "good" : "warn" });
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not change the module"), { tone: "danger" });
    }
  }

  const ql = q.trim().toLowerCase();
  const groups = data && cur
    ? [...new Set(data.modules.map((m) => m.entGroup))]
      .sort((a, b) => (lookups.EntGroup?.findIndex((x) => x.code === a) ?? 0) - (lookups.EntGroup?.findIndex((x) => x.code === b) ?? 0))
      .map((g) => ({ g, rows: data.modules.filter((m) => m.entGroup === g && (!ql || m.name.toLowerCase().includes(ql) || m.key.includes(ql))) }))
      .filter((x) => x.rows.length)
    : [];
  const cols = plans.length + 2;

  return (
    <>
      <PageHead eyebrow="Feature Management / Plan Entitlements" title="Plan Entitlements"
        description="What each plan includes: modules, features and limits. These are kept separate from release flags, so a rollout never changes what a customer has paid for."
        actions={<>
          <Link className="btn secondary" href="/admin/plans"><Tags />Plans &amp; pricing</Link>
          <button className="btn primary" type="button" disabled={!changes.length} onClick={() => { setOpts({ grandfather: losing, email: true, changelog: false }); setReview(true); }}><Eye />Review changes</button>
        </>} />

      <div className="tabs" role="tablist">
        <button type="button" role="tab" className={cn(view === "matrix" && "active")} onClick={() => setView("matrix")}><Layers />Entitlements</button>
        <button type="button" role="tab" className={cn(view === "log" && "active")} onClick={() => setView("log")}><History />Change log</button>
      </div>
      {view === "log" && <EntitlementLogTab reloadKey={logKey} />}
      {view === "log" ? null : !data || !cur ? <Skeleton style={{ height: 320 }} /> : (
        <>
          <div className="ff-plancards">
            {plans.map((p, i) => (
              <div key={p.id} className={cn("ff-plancard", p.code && `p-${p.code.replace(/_V\d+$/, "").toLowerCase()}`)} style={{ ["--i" as string]: i }}>
                <div className="ff-pc-top"><PlanPill plan={p} /><small>{p.subscribers} tenants</small></div>
                <b className="ff-pc-price">{p.isCustomPrice ? "Custom" : rs(p.priceMonthly)}{!p.isCustomPrice && <small>/ month</small>}</b>
                <div className="ff-pc-meta"><span><b>{featCount(p.id)}</b> features</span><span><b>{p.userSeats ?? "∞"}</b> users</span></div>
              </div>
            ))}
          </div>

          <div className="panel flush ff-entpanel">
            <div className="panel-head">
              <div><h3>Feature matrix</h3><p>Toggling a cell changes what that plan includes. Core modules are locked on.</p></div>
              <div className="panel-actions">
                <label className="search-field ff-search sm"><Search /><input placeholder="Filter features…" aria-label="Filter features" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                <button className="btn secondary sm" type="button" onClick={() => setEditModule("new")}><Plus />New module</button>
              </div>
            </div>
            <div className="table-wrap"><table className="tbl ff-enttbl">
              <thead><tr><th>Feature</th><th>Key</th>{plans.map((p) => <th key={p.id} className="ff-c-plan"><PlanPill plan={p} /></th>)}</tr></thead>
              <tbody>
                {!data.modules.length && (
                  <tr><td colSpan={cols}><EmptyState icon={<Layers />} title="No modules yet" description="Add the modules and features plans can include; each becomes a row here."
                    action={<button className="btn primary sm" type="button" onClick={() => setEditModule("new")}><Plus />New module</button>} /></td></tr>
                )}
                {groups.map(({ g, rows }) => {
                  const GIcon = GROUP_ICONS[g] ?? Layers;
                  return [
                    <tr key={`g-${g}`} className="ff-grp"><td colSpan={cols}><span><GIcon />{labelOf(lookups, "EntGroup", g)}</span><em>{rows.length}</em></td></tr>,
                    ...rows.map((m) => (
                      <tr key={m.id}>
                        <td><button type="button" className="link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => setEditModule(m)}><b>{m.name}</b></button>{m.isCore && <span className="badge neutral ff-core"><Lock />Core</span>}</td>
                        <td><code className="ff-key muted">{m.key}</code></td>
                        {plans.map((p) => {
                          const on = Boolean(cur.feat[m.id]?.[p.id]);
                          return (
                            <td key={p.id} className={cn("ff-c-plan", on !== Boolean(base!.feat[m.id]?.[p.id]) && "ff-chg")}>
                              <button type="button" className={cn("ff-chk", on && "on")} aria-pressed={on} aria-label={`${m.name} on ${p.name}`} disabled={m.isCore && on} onClick={() => toggle(m.id, p.id)}><Check /></button>
                            </td>
                          );
                        })}
                      </tr>
                    )),
                  ];
                })}
                <tr className="ff-grp"><td colSpan={cols}><span><Gauge />Limits</span><em>Blank = unlimited</em></td></tr>
                {!data.meters.length ? (
                  <tr><td colSpan={cols} className="muted small">Usage meters (users, branches, invoices, storage, API calls) arrive with usage metering (Phase 40); limits are set here once they exist.</td></tr>
                ) : data.meters.filter((mt) => !ql || mt.name.toLowerCase().includes(ql)).map((mt) => (
                  <tr key={mt.id}>
                    <td><span className="ff-limn"><CatalogueIcon name={mt.icon} /><b>{mt.name}</b></span></td>
                    <td><code className="ff-key muted">limit.{mt.code.toLowerCase()}</code></td>
                    {plans.map((p) => {
                      const v = cur.lim[p.id]?.[mt.id] ?? null;
                      return (
                        <td key={p.id} className={cn("ff-c-plan", v !== (base!.lim[p.id]?.[mt.id] ?? null) && "ff-chg")}>
                          <input className="ff-limin" type="number" min={0} placeholder="∞" value={v === null ? "" : v} aria-label={`${mt.name} on ${p.name}`} onChange={(e) => setLim(p.id, mt.id, e.target.value)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div><h3>Add-ons</h3><p>Sold on top of a plan. Prices in PKR, excluding sales tax.</p></div>
              <div className="panel-actions"><button className="btn secondary sm" type="button" onClick={() => setEditAddon("new")}><Plus />New add-on</button></div>
            </div>
            {!data.addons.length ? <EmptyState icon={<Plus />} title="No add-ons yet" description="Add-ons such as POS terminals or WhatsApp messaging are priced here." /> : (
              <div className="ff-addons">
                {data.addons.map((a, i) => (
                  <div key={a.id} className={cn("ff-addon", cur.add[a.id] !== base!.add[a.id] && "ff-chg")} style={{ ["--i" as string]: i }}>
                    <div className="ff-ad-h">
                      <span className="icon-tile"><CatalogueIcon name={a.icon} /></span>
                      <div><button type="button" style={{ display: "block", background: "none", border: 0, padding: 0, textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer" }} onClick={() => setEditAddon(a)}><b>{a.name}</b></button><small>{a.activeTenants} active{a.isActive ? "" : " · inactive"}</small></div>
                    </div>
                    <label className="ff-price"><span>Rs</span><input type="number" min={0} step={50} value={cur.add[a.id] ?? 0} aria-label={`${a.name} price`} onChange={(e) => setPrice(a.id, e.target.value)} /></label>
                    <small className="ff-unit">per {labelOf(lookups, "BillingUnit", a.billingUnit).toLowerCase()}{a.usagePrice !== null && ` + ${rs(a.usagePrice)} / ${a.usageUnit}`}</small>
                    <div className="ff-adplans">
                      {plans.map((p) => {
                        const av = a.plans.find((x) => x.planId === p.id)?.availability ?? "AVAILABLE";
                        return <span key={p.id} className={cn(av === "AVAILABLE" && "on")} title={`${labelOf(lookups, "Availability", av)} on ${p.name}`}>{p.name[0]}</span>;
                      })}
                      {a.note && <em>{a.note}</em>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel flush">
            <div className="panel-head"><div><h3>Modules by plan</h3><p>{plural(data.modules.length, "module")} · changes are logged to the platform audit log</p></div></div>
            <div className="banner info ff-banner" style={{ margin: "0 16px 16px" }}><Info /><div><b>Modules are global switches.</b> Turning one off hides it for every tenant on every plan. What each plan includes commercially is the matrix above.</div></div>
            {!data.modules.length ? <EmptyState icon={<Layers />} title="No modules yet" description="Modules you add appear here with their minimum plan." /> : (
              <div className="table-wrap"><table className="tbl ff-modtbl">
                <thead><tr><th>Module</th><th>Key</th><th className="num">Tenants using</th><th>Minimum plan</th>{plans.map((p) => <th key={p.id} className="ff-c-plan"><PlanPill plan={p} /></th>)}<th>Enabled</th></tr></thead>
                <tbody>
                  {data.modules.map((m) => (
                    <tr key={m.id} className={cn(!m.isEnabled && "ff-modoff")}>
                      <td><div className="ff-modname"><span className="icon-well sm"><CatalogueIcon name={m.icon} /></span><b>{m.name}</b>{m.isCore && <span className="badge neutral"><Lock />Core</span>}</div></td>
                      <td><code className="ff-key">{m.key}</code></td>
                      <td className="num" title="Tenant usage arrives with usage metering (Phase 40)">—</td>
                      <td>
                        <select value={cur.min[m.id] ?? ""} disabled={m.isCore} aria-label={`Minimum plan for ${m.name}`} onChange={(e) => setMin(m.id, e.target.value)}>
                          <option value="">—</option>
                          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      {plans.map((p) => (
                        <td key={p.id} className={cn("ff-c-plan", Boolean(cur.feat[m.id]?.[p.id]) !== Boolean(base!.feat[m.id]?.[p.id]) && "ff-chg")}>
                          <Switch className="ff-smsw" checked={Boolean(cur.feat[m.id]?.[p.id])} disabled={m.isCore && Boolean(cur.feat[m.id]?.[p.id])} aria-label={`${m.name} on ${p.name}`} onChange={() => toggle(m.id, p.id)} />
                        </td>
                      ))}
                      <td><Switch checked={m.isEnabled} disabled={m.isCore} aria-label={`${m.name} enabled`} onChange={(e) => (e.target.checked ? setEnabled(m, true) : setTurnOff(m))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          {changes.length > 0 && (
            <div className="ff-savebar ff-sb-in">
              <span className="ff-sb-ic"><Layers /></span>
              <div><b>{plural(changes.length, "change")}</b><small><b>{affected}</b> tenants affected</small></div>
              <span className="spacer" />
              <button className="btn ghost" type="button" onClick={() => { setCur(base); toast("Changes discarded", { tone: "info", ms: 1800 }); }}>Discard</button>
              <button className="btn primary" type="button" onClick={() => { setOpts({ grandfather: losing, email: true, changelog: false }); setReview(true); }}><Eye />Preview impact</button>
            </div>
          )}
        </>
      )}

      <Drawer open={review} onClose={() => setReview(false)} className="ff-drawer" title="Review entitlement changes" subtitle={`${plural(changes.length, "change")} across ${new Set(changes.map((c) => ("planId" in c ? c.planId : "x"))).size} plan(s)`}
        foot={<><button className="btn secondary" type="button" onClick={() => setReview(false)}>Back to editing</button><button className="btn primary" type="button" disabled={busy || !changes.length} onClick={saveAll}><Check />{busy ? "Saving…" : "Save entitlements"}</button></>}>
        <div className="ff-impact">
          <div className={cn("ff-imp-hero", losing && "danger")}>
            <div><small>Tenants affected</small><b>{affected}</b></div>
            <p>{losing ? "Some tenants lose access. Existing subscriptions keep what they pay for until renewal." : "Everyone affected gains something. No one loses access."}</p>
          </div>
          <div className="ff-implist">
            {changes.map((c, i) => {
              const im = impact(c);
              const label = c.kind === "add" ? `${addonOf(c.addonId)?.name} price` : c.kind === "lim" ? meterOf(c.meterId)?.name : moduleOf(c.moduleId)?.name;
              const from = c.kind === "feat" ? (c.from ? "Included" : "—") : c.kind === "lim" ? limFmt(c.from) : c.kind === "add" ? rs(c.from) : planOf(c.from)?.name ?? "—";
              const to = c.kind === "feat" ? (c.to ? "Included" : "Removed") : c.kind === "lim" ? limFmt(c.to) : c.kind === "add" ? rs(c.to) : planOf(c.to)?.name ?? "—";
              const plan = "planId" in c ? planOf(c.planId) : undefined;
              return (
                <div key={i} className={cn("ff-imp", im.tone)}>
                  <span className="ff-imp-ic">{im.tone === "good" ? <TrendingUp /> : im.tone === "danger" ? <TriangleAlert /> : <Info />}</span>
                  <div>
                    <div className="ff-imp-top"><b>{label}</b>{plan && <PlanPill plan={plan} />}</div>
                    <div className="ff-imp-ch"><s>{from}</s><ArrowRight /><b>{to}</b></div>
                    <small>{im.text}</small>
                  </div>
                  <b className="ff-imp-n">{im.tenants}</b>
                </div>
              );
            })}
          </div>
          <div className="ff-impopts">
            <Switch label="Grandfather existing tenants until renewal" checked={opts.grandfather} onChange={(e) => setOpts({ ...opts, grandfather: e.target.checked })} />
            <Switch label="Email affected tenant owners" checked={opts.email} onChange={(e) => setOpts({ ...opts, email: e.target.checked })} />
            <Switch label="Post to the in-app changelog" checked={opts.changelog} onChange={(e) => setOpts({ ...opts, changelog: e.target.checked })} />
          </div>
        </div>
      </Drawer>

      <ConfirmDialog open={!!turnOff} onClose={() => setTurnOff(null)} title={`Turn off ${turnOff?.name ?? ""}?`} confirmLabel="Turn off" danger
        onConfirm={() => { const m = turnOff; setTurnOff(null); if (m) void setEnabled(m, false); }}>
        {turnOff?.name} disappears for every tenant using it. Data is kept and comes back when you switch it on.
      </ConfirmDialog>

      {editModule && data && (
        <ModuleModal mod={editModule === "new" ? null : editModule} plans={plans} lookups={lookups} onClose={() => setEditModule(null)} onSaved={() => { setEditModule(null); reload(); }} />
      )}
      {editAddon && data && (
        <AddonModal addon={editAddon === "new" ? null : editAddon} plans={plans} modules={data.modules} lookups={lookups} onClose={() => setEditAddon(null)} onSaved={() => { setEditAddon(null); reload(); }} />
      )}
    </>
  );
}
