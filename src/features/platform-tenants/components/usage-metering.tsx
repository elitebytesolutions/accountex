"use client";

import { ArrowRight, CircleAlert, CodeXml, Gauge, MessageSquareText, RefreshCw, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UsageMeter, UsageOverview, UsageRow } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { ApiError } from "@/lib/api/errors";
import { addUsageOverride, getUsage, refreshUsage } from "../api";
import { fmt, fmtDate, Meter, metricOf, short, TenantLogo, TenantPlanPill, USAGE_METRICS } from "./tenant-ui";

type LoadError = { message: string; reference?: string };

/** GET /api/admin/usage (optionally one company) with reload. */
export function useUsage(tenantId?: string) {
  const [data, setData] = useState<UsageOverview | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getUsage(tenantId)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load usage" }));
    return () => { cancelled = true; };
  }, [tenantId, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, reload };
}

/** One company's meters, keyed by meter code. */
export type TenantUsage = { tenantId: string; tenantCode: string; tenantName: string; planCode: string | null; byMeter: Record<string, UsageRow> };
export function pivotUsage(rows: UsageRow[]): TenantUsage[] {
  const map = new Map<string, TenantUsage>();
  for (const r of rows) {
    const t = map.get(r.tenantId) ?? { tenantId: r.tenantId, tenantCode: r.tenantCode, tenantName: r.tenantName, planCode: r.planCode, byMeter: {} };
    t.byMeter[r.meterCode] = r;
    map.set(r.tenantId, t);
  }
  return [...map.values()].sort((a, b) => a.tenantName.localeCompare(b.tenantName));
}
const pctOf = (r: UsageRow | undefined) => (r && r.limitValue ? (r.usedValue / r.limitValue) * 100 : 0);
const worst = (t: TenantUsage) => Math.max(0, ...USAGE_METRICS.map((m) => pctOf(t.byMeter[m.code])));
const planName = (code: string | null) => (code ? code.replace(/_V\d+$/, "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null);

/** Ask the server to capture today's snapshots (Platform.captureUsageSnapshots), then reload. */
export function RefreshUsageButton({ tenantId, onDone, small }: { tenantId?: string; onDone: () => void; small?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={cn("btn secondary", small && "sm")} disabled={busy} onClick={async () => {
      setBusy(true);
      try { const r = await refreshUsage(tenantId); toast(`Usage refreshed · ${fmt(r.captured)} meter readings captured`, { tone: "good" }); onDone(); }
      catch (e) { toast(adminErrorMessage(e, "Could not refresh usage"), { tone: "danger" }); }
      finally { setBusy(false); }
    }}>{busy ? <span className="ap-spin" /> : <RefreshCw />}{busy ? "Refreshing…" : "Refresh usage"}</button>
  );
}

const EXPIRY: [string, string][] = [["END_OF_CYCLE", "End of this cycle"], ["DAYS_30", "30 days"], ["DAYS_90", "90 days"], ["NEVER", "Never (contract)"]];
const BILL: [string, string][] = [["NO", "No · goodwill"], ["PLAN_RATE", "Yes · at plan overage rate"], ["CUSTOM", "Yes · custom price"]];

/** Template "Override limit" modal (9B 1271–1290): meter, current / new limit, expiry, overage billing, reason, before → after preview. */
export function OverrideModal({ target, meters, onClose, onDone }: {
  target: { usage: TenantUsage; meterCode?: string } | null;
  meters: UsageMeter[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({ meterCode: "USERS", limitValue: "", expiryMode: "END_OF_CYCLE", billOverage: "NO", customPrice: "", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<TenantUsage | null>(null);
  if ((target?.usage ?? null) !== openedFor) {
    setOpenedFor(target?.usage ?? null);
    if (target) {
      const u = target.usage;
      const hottest = USAGE_METRICS.reduce((b, m) => (pctOf(u.byMeter[m.code]) > pctOf(u.byMeter[b]) ? m.code : b), "USERS");
      setErrors({});
      setF({ meterCode: target.meterCode ?? (worst(u) >= 80 ? hottest : "USERS"), limitValue: "", expiryMode: "END_OF_CYCLE", billOverage: "NO", customPrice: "", reason: "" });
    }
  }
  const shown = meters.filter((m) => USAGE_METRICS.some((x) => x.code === m.code));
  const meter = meters.find((m) => m.code === f.meterCode);
  const row = target?.usage.byMeter[f.meterCode];
  const used = row?.usedValue ?? 0, cur = row?.limitValue ?? null;
  const next = Number(f.limitValue) || (cur ? Math.ceil(cur * 1.5) : 0);

  const save = async () => {
    if (!target || !meter) return;
    setBusy(true);
    try {
      await addUsageOverride({ tenantId: target.usage.tenantId, usageMeterId: meter.id, limitValue: f.limitValue, expiryMode: f.expiryMode, billOverage: f.billOverage, customPrice: f.billOverage === "CUSTOM" ? f.customPrice : null, reason: f.reason });
      toast(`${metricOf(f.meterCode).label} limit for ${target.usage.tenantCode.toUpperCase()} set to ${fmt(Number(f.limitValue))}`, { tone: "good" });
      onDone();
    } catch (e) {
      setErrors(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not apply the override"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  const e = (k: string) => (errors[k] ? <small className="hint text-danger" role="alert">{errors[k]}</small> : null);

  return (
    <Modal open={!!target} onClose={onClose} title="Override limit" subtitle={target ? `${target.usage.tenantName} · ${planName(target.usage.planCode) ?? "no"} plan` : ""}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || !meter} onClick={save}>{busy ? "Applying…" : <><SlidersHorizontal />Apply override</>}</button></>}>
      <div className="form-grid">
        <label className="full"><span>Meter</span><select value={f.meterCode} onChange={(ev) => setF({ ...f, meterCode: ev.target.value })}>{shown.map((m) => <option key={m.id} value={m.code}>{metricOf(m.code).label}</option>)}</select>{e("usageMeterId")}</label>
        <label><span>Current limit</span><input readOnly value={cur === null ? "No limit" : fmt(cur)} /></label>
        <label><span>New limit *</span><input type="number" min={1} value={f.limitValue} placeholder={cur ? fmt(Math.ceil(cur * 1.5)) : ""} onChange={(ev) => setF({ ...f, limitValue: ev.target.value })} aria-invalid={!!errors.limitValue} />{e("limitValue")}</label>
        <label><span>Expires</span><select value={f.expiryMode} onChange={(ev) => setF({ ...f, expiryMode: ev.target.value })}>{EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label><span>Bill overage</span><select value={f.billOverage} onChange={(ev) => setF({ ...f, billOverage: ev.target.value })}>{BILL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {f.billOverage === "CUSTOM" && <label><span>Custom price (Rs) *</span><input type="number" min={0} value={f.customPrice} onChange={(ev) => setF({ ...f, customPrice: ev.target.value })} aria-invalid={!!errors.customPrice} />{e("customPrice")}</label>}
        <label className="full"><span>Reason *</span><input value={f.reason} maxLength={300} placeholder="e.g. Year-end FBR filing spike, approved by the account manager" onChange={(ev) => setF({ ...f, reason: ev.target.value })} aria-invalid={!!errors.reason} />{e("reason")}</label>
      </div>
      <div className="ap-ovprev">
        <div><small>Now</small><Meter used={used} limit={cur} text={cur ? `${Math.round((used / cur) * 100)}%` : "No limit"} /></div>
        <ArrowRight />
        <div><small>After override</small><Meter used={used} limit={next || null} text={next ? `${Math.round((used / next) * 100)}%` : "—"} /></div>
      </div>
    </Modal>
  );
}

/** A meter cell of the per-tenant table (template `cell()`), with the override tag. */
function MeterCell({ t, code }: { t: TenantUsage; code: string }) {
  const r = t.byMeter[code];
  const m = metricOf(code);
  if (!r) return <td className="ap-mcell"><span className="muted">—</span></td>;
  return (
    <td className="ap-mcell">
      <Meter compact used={r.usedValue} limit={r.limitValue} title={`${t.tenantName} · ${r.limitValue ? `${Math.round(pctOf(r))}% of ${r.overrideLimitValue !== null ? "override " : ""}limit` : "no limit"}`}
        text={<>{short(r.usedValue)}{m.unit}<small> / {r.limitValue === null ? "∞" : short(r.limitValue)}</small></>} />
      {r.overrideLimitValue !== null && <span className="ap-ovtag" title={`Limit override active${r.overrideExpiresOn ? ` until ${fmtDate(r.overrideExpiresOn)}` : ""}`}><SlidersHorizontal /></span>}
    </td>
  );
}

/**
 * Admin › Usage & Quotas metering part (template 9B 1204–1316): KPIs, per-tenant meters with sort / filter and the
 * override modal, top consumers. `rulesPanel` is the Phase 39 alert rules panel, shown beside top consumers.
 */
export function UsageMetering({ rulesPanel }: { rulesPanel: ReactNode }) {
  const { data, error, reload } = useUsage();
  const [filter, setFilter] = useState<"all" | "near" | "over">("all");
  const [sortK, setSortK] = useState<string | null>(null);
  const [metric, setMetric] = useState("API_CALLS_MONTH");
  const [target, setTarget] = useState<{ usage: TenantUsage } | null>(null);

  const tenants = useMemo(() => pivotUsage(data?.rows ?? []), [data]);
  const sum = (code: string) => (data?.rows ?? []).filter((r) => r.meterCode === code).reduce((s, r) => s + r.usedValue, 0);
  let list = tenants.filter((t) => filter === "all" || (filter === "near" ? worst(t) >= 80 && worst(t) < 100 : worst(t) >= 100));
  if (sortK) list = [...list].sort((a, b) => pctOf(b.byMeter[sortK]) - pctOf(a.byMeter[sortK]));
  const top = [...tenants].filter((t) => t.byMeter[metric]).sort((a, b) => b.byMeter[metric]!.usedValue - a.byMeter[metric]!.usedValue).slice(0, 8);
  const topMax = top[0]?.byMeter[metric]?.usedValue || 1;
  const topTotal = sum(metric) || 1;
  const kpi = (label: string, value: ReactNode, sub: string, tone: string, Icon: React.ElementType) => (
    <div className={cn("kpi", tone)}><div className="kpi-top"><span>{label}</span><span className="icon-well"><Icon /></span></div><strong>{data ? value : "—"}</strong><small>{sub}</small></div>
  );

  return (
    <>
      <div className="kpi-grid">
        {kpi("Over quota", `${fmt(data?.kpis.over ?? 0)} tenants`, "Billing overage or upgrade pending", "red", CircleAlert)}
        {kpi("Near limit (≥80%)", `${fmt(data?.kpis.near ?? 0)} tenants`, "Upsell candidates this month", "yellow", Gauge)}
        {kpi("API calls MTD", short(sum("API_CALLS_MONTH")), "Latest snapshot · 0 until API metering ships", "blue", CodeXml)}
        {kpi("SMS sent MTD", fmt(sum("SMS_MONTH")), data?.kpis.lastSnapshot ? `Last snapshot ${fmtDate(data.kpis.lastSnapshot)}` : "No snapshot yet", "teal", MessageSquareText)}
      </div>
      <div className="panel flush">
        <div className="panel-head">
          <div><h3>Per-tenant meters</h3><p>Click a column header to sort by utilisation · <SlidersHorizontal style={{ width: 12, height: 12, verticalAlign: "middle" }} /> to override a limit</p></div>
          <div className="panel-actions">
            <div className="chips">
              {([["all", "All"], ["near", "Near limit"], ["over", "At / over limit"]] as const).map(([k, l]) => <button key={k} type="button" className={filter === k ? "active" : undefined} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
            <RefreshUsageButton small onDone={reload} />
          </div>
        </div>
        {error ? <div style={{ padding: 16 }}><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div> : !data ? <div style={{ padding: 16 }}><Skeleton style={{ height: 160 }} /></div> : tenants.length === 0 ? (
          <EmptyState icon={<Gauge />} title="No usage captured yet" description="Refresh usage to take today's snapshot of users, branches, invoices and storage for every company." action={<RefreshUsageButton onDone={reload} />} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl ap-mtbl">
                <thead><tr><th>Tenant</th>{USAGE_METRICS.map((m) => <th key={m.code} className={cn("ap-sortable", sortK === m.code && "sorted")} onClick={() => setSortK(sortK === m.code ? null : m.code)}><span><m.icon />{m.label}</span></th>)}<th /></tr></thead>
                <tbody>
                  {list.length === 0 ? <tr><td colSpan={8}><div className="empty-state"><h4>Nobody here</h4><p>No tenants in this filter.</p></div></td></tr> : list.map((t, i) => (
                    <tr key={t.tenantId} className="ap-row-in" style={{ ["--ri" as string]: i }}>
                      <td><div className="cell-user"><TenantLogo name={t.tenantName} /><div><Link className="link" href={`/admin/tenants/${t.tenantId}`}><b>{t.tenantName}</b></Link><small><TenantPlanPill code={t.planCode} name={planName(t.planCode)} /></small></div></div></td>
                      {USAGE_METRICS.map((m) => <MeterCell key={m.code} t={t} code={m.code} />)}
                      <td className="actions"><button type="button" className="icon-btn-sm" aria-label="Override limit" title="Override limit" onClick={() => setTarget({ usage: t })}><SlidersHorizontal /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="ap-mlegend"><span><i className="ok" />Under 80%</span><span><i className="hot" />80–99%</span><span><i className="full" />At limit</span><span><i className="over" />Over limit</span></span>
              <span>{list.length} of {tenants.length} tenants</span>
            </div>
          </>
        )}
      </div>
      <div className="grid-2 ap-use-bottom">
        <div className="panel">
          <div className="panel-head">
            <div><h3>Top consumers</h3><p>Latest snapshot · share of platform total</p></div>
            <div className="panel-actions"><div className="seg">{([["API_CALLS_MONTH", "API"], ["STORAGE_GB", "Storage"], ["SMS_MONTH", "SMS"], ["INVOICES_MONTH", "Invoices"]] as const).map(([k, l]) => <button key={k} type="button" className={metric === k ? "active" : undefined} onClick={() => setMetric(k)}>{l}</button>)}</div></div>
          </div>
          {!data ? <Skeleton style={{ height: 120 }} /> : top.length === 0 ? <EmptyState title="No usage yet" description="Refresh usage to capture today's meters." /> : (
            <div className="ap-top">
              {top.map((t, i) => {
                const r = t.byMeter[metric]!, p = pctOf(r);
                return (
                  <div key={t.tenantId} className="ap-top-row" style={{ ["--i" as string]: i }}>
                    <span className="ap-top-rank">{i + 1}</span><TenantLogo name={t.tenantName} size="xs" /><span className="ap-top-name">{t.tenantName}</span>
                    <div className="ap-top-bar"><i style={{ ["--w" as string]: `${(r.usedValue / topMax) * 100}%` }} className={p >= 100 ? "over" : p >= 80 ? "hot" : undefined} /></div>
                    <b>{short(r.usedValue)}{metricOf(metric).unit}</b><small>{((r.usedValue / topTotal) * 100).toFixed(1)}%</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {rulesPanel}
      </div>
      <OverrideModal target={target} meters={data?.meters ?? []} onClose={() => setTarget(null)} onDone={() => { setTarget(null); reload(); }} />
    </>
  );
}
