"use client";

import {
  Activity, Archive, ArchiveRestore, Blocks, ClipboardCopy, Clock, CopyPlus, EllipsisVertical, ExternalLink, Flag, FlagOff, GitPullRequest,
  Hourglass, KeyRound, Layers, Link2, Lock, Plus, Power, Search, ShieldCheck, ToggleRight, Zap, Globe,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlagDetail, FlagEnvironment, FlagListItem, FlagSdkKey, FlagSummary } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { listChangeRequests } from "@/features/platform-ops/api";
import { RequestChangeModal } from "@/features/platform-ops/components/request-change-modal";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { ApiError } from "@/lib/api/errors";
import { archiveFlag, duplicateFlag, flagSummary, listFlags, listSdkKeys, restoreFlag, toggleFlag } from "../api";
import { CoreModulesTab } from "./core-modules-tab";
import {
  Avatar, CATEGORIES, ENVS, FLAG_TYPE_INFO, FlagIcon, KillConfirm, STAGES, StagePill, TypeBadge, categoryLabel, envLabel, fmtDate, isKill, useFlagOptions,
} from "./flag-ui";
import { NewFlagWizard } from "./new-flag-wizard";
import { SdkKeysTab, maskKey } from "./sdk-keys-tab";

type Tab = "flags" | "modules" | "sdk";
type Filter = { q: string; cat: string; type: string; stage: string; owner: string; stale: boolean };
const NO_FILTER: Filter = { q: "", cat: "", type: "", stage: "", owner: "", stale: false };

/**
 * Template admin/features (3B-flags.html, 9J-flags.js renderFeatures): KPIs, tabs Flags / Core modules / SDK keys,
 * environment switch, filters and chips, the flags table with the per-environment switch, row menu, kill-switch
 * confirm and the "New flag" wizard. Dev / Staging changes apply directly; Production toggles become change requests
 * (Phase 43) except kill switches (typed key, emergency path).
 */
export function FeaturesScreen({ openNew }: { openNew?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("flags");
  const [env, setEnv] = useState<FlagEnvironment>("PRODUCTION");
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [flags, setFlags] = useState<FlagListItem[] | null>(null);
  const [archived, setArchived] = useState<FlagListItem[]>([]);
  const [summary, setSummary] = useState<FlagSummary | null>(null);
  const [serverKey, setServerKey] = useState<FlagSdkKey[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [wizard, setWizard] = useState(!!openNew);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; flag: FlagListItem } | null>(null);
  const [kill, setKill] = useState<{ flag: FlagListItem; want: boolean } | null>(null);
  const [request, setRequest] = useState<{ flag: FlagListItem; want: boolean } | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [confirmArchive, setConfirmArchive] = useState<FlagListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const options = useFlagOptions(attempt);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listFlags(), listFlags({ stage: "ARCHIVED" }), flagSummary(), listSdkKeys().catch(() => []), listChangeRequests("PENDING").catch(() => null)])
      .then(([live, arch, s, keys, crs]) => { if (!cancelled) { setFlags(live); setArchived(arch); setSummary(s); setServerKey(keys); setPending(new Set((crs?.items ?? []).map((c) => `${c.flagId}|${c.environment}`))); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load flags" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const all = useMemo(() => [...(flags ?? []), ...archived], [flags, archived]);
  const owners = useMemo(() => [...new Map(all.map((f) => [f.ownerStaffId, f.ownerName ?? "—"])).entries()], [all]);
  const rows = useMemo(() => {
    const q = filter.q.toLowerCase();
    return all.filter((f) => (filter.stage ? f.stage === filter.stage : f.stage !== "ARCHIVED")
      && (!filter.cat || f.category === filter.cat) && (!filter.type || f.flagType === filter.type || f.secondaryType === filter.type)
      && (!filter.owner || f.ownerStaffId === filter.owner) && (!filter.stale || !!f.staleReason)
      && (!q || `${f.key} ${f.name} ${f.description ?? ""} ${f.tags.join(" ")}`.toLowerCase().includes(q)));
  }, [all, filter]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const live = flags ?? [];
  const killFlags = live.filter(isKill);
  const kpis: { k: string; label: string; icon: React.ReactNode; tone: string; well: string; v: number; sub: string; onClick?: () => void }[] = [
    { k: "total", label: "Total flags", icon: <Flag />, tone: "", well: "", v: summary?.totalFlags ?? 0, sub: `${summary?.temporaryFlags ?? 0} temporary · ${summary?.permanentFlags ?? 0} permanent` },
    { k: "prod", label: "Active in Production", icon: <Activity />, tone: "", well: "", v: summary?.activeInProduction ?? 0, sub: `of ${summary?.totalFlags ?? 0} serving in Production` },
    { k: "stale", label: "Stale flags", icon: <Hourglass />, tone: "warn", well: "yellow", v: summary?.staleFlags ?? 0, sub: "Ready to clean up", onClick: () => setFilter((f) => ({ ...f, stale: !f.stale })) },
    { k: "pending", label: "Pending approvals", icon: <GitPullRequest />, tone: "violet", well: "violet", v: summary?.pendingApprovals ?? 0, sub: "Need a second approver", onClick: () => router.push("/admin/change-requests") },
    { k: "kill", label: "Kill switches", icon: <Power />, tone: "danger", well: "red", v: summary?.killSwitches ?? 0, sub: killFlags.every((f) => f.envs.PRODUCTION.isOn) ? "All armed · traffic flowing" : "A kill switch is OFF", onClick: () => setFilter((f) => ({ ...f, type: f.type === "KILL" ? "" : "KILL" })) },
  ];

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, { tone: "good" }); reload(); }
    catch (e) { toast(adminErrorMessage(e, "Could not update the flag"), { tone: "danger" }); }
    finally { setBusy(false); setKill(null); setConfirmArchive(null); }
  };
  const requestToggle = (f: FlagListItem, want: boolean) => {
    if (f.stage === "ARCHIVED") { toast("Restore the flag before changing it", { tone: "warn" }); return; }
    if (isKill(f)) setKill({ flag: f, want });
    else if (env === "PRODUCTION") {
      if (pending.has(`${f.id}|PRODUCTION`)) { toast(`${f.key} already has a pending change request in Production`, { tone: "warn" }); return; }
      setRequest({ flag: f, want });
    }
    else void act(() => toggleFlag(f.id, env, want), `${f.key} ${want ? "ON" : "OFF"} in ${envLabel(env)}`);
  };
  const menuItems = (f: FlagListItem): MenuItem[] => [
    { label: "Open", icon: <ExternalLink />, onClick: () => router.push(`/admin/features/${f.id}?env=${env}`) },
    { label: "Duplicate", icon: <CopyPlus />, onClick: () => void act(() => duplicateFlag(f.id), `Duplicated ${f.key} (off everywhere)`) },
    { label: "Copy key", icon: <ClipboardCopy />, onClick: () => { void navigator.clipboard?.writeText(f.key).catch(() => undefined); toast(`Copied ${f.key}`, { tone: "info", ms: 2200 }); } },
    { sep: true },
    f.stage === "ARCHIVED"
      ? { label: "Restore", icon: <ArchiveRestore />, onClick: () => void act(() => restoreFlag(f.id, f.rowVersion), `${f.key} restored to Cleanup`) }
      : { label: "Archive", icon: <Archive />, danger: true, onClick: () => setConfirmArchive(f) },
  ];
  const activeServer = serverKey.find((k) => k.environment === env && k.kind === "SERVER" && k.status === "ACTIVE");
  const serving = live.filter((f) => f.envs[env].isOn).length;

  return (
    <>
      <PageHead eyebrow="Billing / Feature Management" title="Feature Flags"
        description="Release, kill-switch, ops, experiment and entitlement flags across Dev, Staging and Production."
        actions={<>
          <span className="tagline">ship dark, light it up slowly</span>
          <Link className="btn secondary" href="/admin/change-requests"><GitPullRequest />Change requests{summary?.pendingApprovals ? <span className="badge warn">{summary.pendingApprovals}</span> : null}</Link>
          <button type="button" className="btn primary" onClick={() => setWizard(true)}><Plus />New flag</button>
        </>} />

      <div className="kpi-grid c5 ff-kpis">
        {kpis.map((k) => (
          <div key={k.k} className={cn("kpi ff-kpi", k.tone)} tabIndex={0} role={k.onClick ? "button" : undefined} onClick={k.onClick} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && k.onClick?.()}>
            <div className="kpi-top"><span>{k.label}</span><span className={cn("icon-well", k.well)}>{k.icon}</span></div>
            <strong>{summary ? k.v.toLocaleString() : "…"}</strong><small>{k.sub}</small>
          </div>
        ))}
      </div>

      <div className="tabs ff-tabs" role="tablist">
        <button type="button" role="tab" className={cn(tab === "flags" && "active")} onClick={() => setTab("flags")}><Flag />Flags <i>{live.length}</i></button>
        <button type="button" role="tab" className={cn(tab === "modules" && "active")} onClick={() => setTab("modules")}><Blocks />Core modules</button>
        <button type="button" role="tab" className={cn(tab === "sdk" && "active")} onClick={() => setTab("sdk")}><KeyRound />SDK keys</button>
      </div>

      {tab === "modules" && <div className="ff-pane-in"><CoreModulesTab /></div>}
      {tab === "sdk" && <div className="ff-pane-in"><SdkKeysTab /></div>}
      {tab === "flags" && (
        <div className="panel flush ff-flagpanel" data-env={env.toLowerCase()}>
          <div className="ff-envbar">
            <div className="ff-envsw" role="radiogroup" aria-label="Environment">
              {ENVS.map((e) => (
                <button key={e.code} type="button" role="radio" aria-checked={env === e.code} className={cn(`e-${e.css}`, env === e.code && "active")} onClick={() => setEnv(e.code)}>
                  <span className={cn("ff-env-dot", `e-${e.css}`)} />{e.label}
                </button>
              ))}
            </div>
            <div className="ff-envmeta">
              <span className="pill"><ToggleRight /><b>{serving}</b>&nbsp;of {live.length} serving</span>
              <span className="pill ff-keypill" title="Server-side SDK key"><KeyRound /><code>{activeServer ? maskKey(activeServer) : "No server key"}</code></span>
              {env === "PRODUCTION" ? <span className="pill ff-lock"><Lock />Kill switches need the key</span> : <span className="pill"><Zap />Changes apply instantly</span>}
            </div>
          </div>
          <div className="ff-filters">
            <div className="ff-frow">
              <label className="search-field ff-search"><Search /><input placeholder="Search key, name, tag…" aria-label="Search flags" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} /></label>
              <select aria-label="Type" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
                <option value="">All types</option>{Object.entries(FLAG_TYPE_INFO).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
              <select aria-label="Owner" value={filter.owner} onChange={(e) => setFilter({ ...filter, owner: e.target.value })}>
                <option value="">All owners</option>{owners.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
              <label className="switch ff-stale-sw"><input type="checkbox" checked={filter.stale} onChange={(e) => setFilter({ ...filter, stale: e.target.checked })} /><i /><span>Stale only</span></label>
            </div>
            <div className="ff-frow">
              <div className="ff-chiprow">
                <button type="button" className={cn(!filter.cat && "active")} onClick={() => setFilter({ ...filter, cat: "" })}>All</button>
                {CATEGORIES.map((c) => <button key={c.code} type="button" className={cn(filter.cat === c.code && "active")} onClick={() => setFilter({ ...filter, cat: c.code })}><c.icon />{c.label}</button>)}
              </div>
              <span className="ff-sep" />
              <div className="ff-chiprow ff-stagechips">
                <button type="button" className={cn(!filter.stage && "active")} onClick={() => setFilter({ ...filter, stage: "" })}>Live</button>
                {STAGES.map((s) => <button key={s.code} type="button" className={cn(filter.stage === s.code && "active")} onClick={() => setFilter({ ...filter, stage: s.code })}><span className={cn("ff-sdot", `s-${s.code.toLowerCase()}`)} />{s.label}</button>)}
              </div>
            </div>
          </div>
          {env === "PRODUCTION" && <div className="ff-prodnote"><ShieldCheck /><span><b>Production is protected.</b> Toggling a flag here opens a change request for a second approver. Kill switches skip the queue: type the key, and the flip is logged as an emergency change.</span></div>}
          <div className="table-wrap ff-twrap">
            <table className="tbl ff-tbl">
              <thead><tr><th>Flag</th><th>Type</th><th>Lifecycle</th><th title="Dev · Staging · Production">Envs</th><th>Rollout</th><th>Prerequisites</th><th>Owner</th><th>Last evaluated</th><th className="ff-c-sw">{envLabel(env)}</th><th /></tr></thead>
              <tbody>
                {!flags ? [0, 1, 2].map((i) => <tr key={i}><td colSpan={10}><Skeleton style={{ height: 28 }} /></td></tr>) : rows.length === 0 ? (
                  <tr className="ff-emptyrow"><td colSpan={10}><div className="empty-state ff-empty"><span className="icon-well lg"><FlagOff /></span><b>{all.length ? "No flags match" : "No flags yet"}</b>
                    <small>{all.length ? "Try clearing a filter or the search." : "Create the first flag. It starts OFF in every environment."}</small>
                    {all.length ? <button type="button" className="btn secondary sm" onClick={() => setFilter(NO_FILTER)}>Clear filters</button> : <button type="button" className="btn primary sm" onClick={() => setWizard(true)}><Plus />New flag</button>}
                  </div></td></tr>
                ) : rows.map((f, i) => {
                  const e = f.envs[env];
                  return (
                    <tr key={f.id} className={cn(f.staleReason && "is-stale", f.stage === "ARCHIVED" && "is-arch")} style={{ ["--ri" as string]: i }} tabIndex={0}
                      onClick={(ev) => !(ev.target as HTMLElement).closest("label, button, a, input, select") && router.push(`/admin/features/${f.id}?env=${env}`)}
                      onKeyDown={(ev) => ev.key === "Enter" && ev.target === ev.currentTarget && router.push(`/admin/features/${f.id}?env=${env}`)}>
                      <td className="ff-c-flag"><div className="ff-flagcell"><FlagIcon type={f.flagType} /><div>
                        <div className="ff-keyline"><code className="ff-key">{f.key}</code>{f.staleReason && <span className="ff-stalei" title={f.staleReason}><Hourglass />Stale</span>}</div>
                        <b>{f.name}</b><small>{f.description}</small></div></div></td>
                      <td><TypeBadge type={f.flagType} sm />{f.secondaryType && <TypeBadge type={f.secondaryType} sm />}<small className="ff-cat">{categoryLabel(f.category)}</small></td>
                      <td><StagePill stage={f.stage} /></td>
                      <td><div className="ff-envdots">{ENVS.map((x) => <span key={x.code} className={cn("ff-ed", f.envs[x.code].isOn && "on", x.code === env && "cur", `e-${x.css}`)} title={`${x.label}: ${f.envs[x.code].isOn ? "serving" : "off"}${f.envs[x.code].isOn && f.envs[x.code].rolloutPct !== null ? ` · ${f.envs[x.code].rolloutPct}%` : ""}`}>{x.short}</span>)}</div></td>
                      <td>{e.rolloutPct === null ? (
                        <div className={cn("ff-roll na", !e.isOn && "off")}><span className="ff-rtag">{f.flagType === "ENTITLEMENT" ? <Layers /> : <Globe />}{e.targets ? `${e.targets} tenants` : e.rules ? "By rule" : "Global"}</span></div>
                      ) : (
                        <div className={cn("ff-roll", !e.isOn && "off")}><div className="ff-mbar"><i style={{ ["--w" as string]: `${e.isOn ? e.rolloutPct : 0}%` }} /></div><em>{e.isOn ? `${e.rolloutPct}%` : "Off"}</em></div>
                      )}</td>
                      <td><div className="ff-pres">{e.prerequisites.length ? e.prerequisites.map((k) => <span key={k} className="ff-pre" title={`Requires ${k}`}><Link2 />{k}</span>) : <span className="ff-none">—</span>}</div></td>
                      <td><Avatar name={f.ownerName ?? "?"} size="sm" /></td>
                      <td><span className="ff-eval cold">{f.lastEvaluatedAt ? fmtDate(f.lastEvaluatedAt) : "never"}<small>no telemetry yet</small></span></td>
                      <td className="ff-c-sw">
                        <label className={cn("switch ff-bigsw", isKill(f) && "kill")}><input type="checkbox" checked={e.isOn} disabled={busy || f.stage === "ARCHIVED"} aria-label={`${f.key} in ${envLabel(env)}`}
                          onChange={(ev) => requestToggle(f, ev.target.checked)} /><i /></label>
                        {pending.has(`${f.id}|${env}`) && <span className="badge warn ff-pendb" title="Change request pending approval"><Clock />Pending</span>}
                      </td>
                      <td><button type="button" className="icon-btn-sm" aria-label={`Actions for ${f.key}`} onClick={(ev) => setMenu({ anchor: ev.currentTarget, flag: f })}><EllipsisVertical /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="ff-tfoot"><span>Showing <b>{rows.length}</b> of {live.length} flags{filter.stage === "ARCHIVED" ? " (archived)" : ""}</span>
            <span className="ff-legend"><span><i className="ff-ed on" />Serving</span><span><i className="ff-ed" />Off</span><span><Clock />Pending approval</span><span><Hourglass />Stale</span></span></div>
        </div>
      )}

      {menu && <Menu anchor={menu.anchor} items={menuItems(menu.flag)} onClose={() => setMenu(null)} />}
      {kill && <KillConfirm flagKey={kill.flag.key} env={env} turnOn={kill.want} busy={busy} onClose={() => setKill(null)}
        onConfirm={(key) => void act(() => toggleFlag(kill.flag.id, env, kill.want, key), kill.want ? `${kill.flag.key} restored in ${envLabel(env)}` : `${kill.flag.key} is OFF in ${envLabel(env)}`)} />}
      {request && <RequestChangeModal flag={request.flag} env="PRODUCTION" change={{ kind: "TOGGLE", isOn: request.want }} summary={`Turn targeting ${request.want ? "ON" : "OFF"}`}
        onClose={() => setRequest(null)} onDone={() => { setRequest(null); reload(); }} />}
      <ConfirmDialog open={!!confirmArchive} onClose={() => setConfirmArchive(null)} busy={busy} danger title={confirmArchive ? `Archive ${confirmArchive.key}?` : ""} confirmLabel="Archive flag"
        onConfirm={() => confirmArchive && void act(() => archiveFlag(confirmArchive.id, confirmArchive.rowVersion), `${confirmArchive.key} archived`)}>
        {confirmArchive?.envs.PRODUCTION.isOn ? "It still serves in Production. Archiving stops evaluations, so remove the code references first." : "Archived flags stop evaluating and are hidden from the list. You can restore them later."}
      </ConfirmDialog>
      {wizard && <NewFlagWizard options={options} existingKeys={all.map((f) => f.key)} onClose={() => setWizard(false)}
        onCreated={(f: FlagDetail) => { setWizard(false); setFilter(NO_FILTER); reload(); toast(`Flag ${f.key} created · OFF in all environments`, { tone: "good", ms: 6000, action: { label: "Set up targeting", onClick: () => router.push(`/admin/features/${f.id}?env=DEV`) } }); }} />}
    </>
  );
}
