"use client";

import {
  Activity, ArrowLeft, Archive, ArchiveRestore, BrushCleaning, Check, Clock, GitPullRequest, ChevronRight, CodeXml, Copy, FileDiff, Flag, GitBranch, History,
  Hourglass, Infinity as InfinityIcon, Link2, Link2Off, PencilLine, PencilRuler, Pin, Plus, Power, PowerOff, Rocket, Search, Timer, Trash2, Users, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FlagAuditEntry, FlagDefaultRuleInput, FlagDetail, FlagEnvironment, FlagEnvironmentState, FlagEvaluation, FlagPrerequisiteInput, FlagRuleInput, FlagServed,
} from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { listChangeRequests } from "@/features/platform-ops/api";
import { RequestChangeModal } from "@/features/platform-ops/components/request-change-modal";
import { SchedulePanel } from "@/features/platform-ops/components/schedule-panel";
import { ApiError } from "@/lib/api/errors";
import { evaluateFlag, flagAudit, flagServed, getFlag, moveFlagStage, restoreFlag, saveFlagEnvironment, toggleFlag } from "../api";
import { FlagEditModal } from "./flag-edit-modal";
import {
  Avatar, ENVS, EnvDot, KillConfirm, STAGES, TypeBadge, categoryLabel, envCss, envLabel, fmtDate, fmtDateTime, isKill, stageLabel, useFlagOptions, variationName,
} from "./flag-ui";
import { RuleBuilder } from "./rule-builder";

type Draft = {
  isOn: boolean;
  targets: { tenantId: string; variationIdx: number }[];
  rules: FlagRuleInput[];
  defaultRule: FlagDefaultRuleInput;
  prerequisites: FlagPrerequisiteInput[];
};
const STAGE_ICONS = [PencilRuler, CodeXml, Rocket, BrushCleaning, Archive];
const LOOKUPS = ["Province", "TenantIndustry"];

function draftOf(e: FlagEnvironmentState): Draft {
  const d = e.defaultRule;
  return {
    isOn: e.isOn,
    targets: e.targets.map((t) => ({ tenantId: t.tenantId, variationIdx: t.variationIdx })),
    rules: e.rules.map((r) => ({ attribute: r.attribute as FlagRuleInput["attribute"], operator: r.operator as FlagRuleInput["operator"], ruleValues: r.ruleValues, serveVariationIdx: r.serveVariationIdx })),
    defaultRule: d
      ? { defaultRule: d.defaultRule, defaultVariationIdx: d.defaultVariationIdx, rolloutPct: d.rolloutPct, rolloutVariationIdx: d.rolloutVariationIdx, rolloutRestVariationIdx: d.rolloutRestVariationIdx, offVariationIdx: d.offVariationIdx, bucketBy: d.bucketBy === "TENANT_ID" ? "TENANT_ID" : "TENANT_CODE" }
      : { defaultRule: "ROLLOUT", defaultVariationIdx: null, rolloutPct: 0, rolloutVariationIdx: 0, rolloutRestVariationIdx: 1, offVariationIdx: 1, bucketBy: "TENANT_CODE" },
    prerequisites: e.prerequisites.map((p) => (p.prerequisiteModuleId ? { prerequisiteModuleId: p.prerequisiteModuleId } : { prerequisiteFlagId: p.prerequisiteFlagId!, requiredVariationIdx: p.requiredVariationIdx ?? 0 })),
  };
}

/** Template diffLines(): line diff of two JSON documents (LCS). */
function diffLines(a: string[], b: string[]): [string, string][] {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: [string, string][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { out.push([" ", a[i]!]); i++; j++; } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push(["-", a[i++]!]); else out.push(["+", b[j++]!]); }
  while (i < n) out.push(["-", a[i++]!]);
  while (j < m) out.push(["+", b[j++]!]);
  return out;
}
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const d = diffLines(JSON.stringify(before ?? {}, null, 2).split("\n"), JSON.stringify(after ?? {}, null, 2).split("\n"));
  let ln = 0, rn = 0;
  return (
    <div className="ff-diff">
      <div className="ff-diff-h"><span><FileDiff />targeting.json</span><span><b className="add">+{d.filter((x) => x[0] === "+").length}</b><b className="del">−{d.filter((x) => x[0] === "-").length}</b></span></div>
      <div className="ff-diff-b">
        {d.map(([t, s], k) => {
          if (t !== "+") ln++;
          if (t !== "-") rn++;
          return <div key={k} className={cn("ff-dl", t === "+" && "add", t === "-" && "del")}><span className="n">{t === "+" ? "" : ln}</span><span className="n">{t === "-" ? "" : rn}</span><span className="m">{t === " " ? "" : t === "-" ? "−" : "+"}</span><code>{s}</code></div>;
        })}
      </div>
    </div>
  );
}

const EVENT_ICON: Record<string, [React.ElementType, string]> = {
  CREATED: [Flag, ""], TOGGLED: [Power, "good"], KILL_SWITCH: [Power, "danger"], TARGETING: [Check, "good"], LIFECYCLE: [PencilLine, "violet"], ARCHIVED: [Archive, "warn"], RESTORED: [ArchiveRestore, "good"],
};

/**
 * Template admin/features/view (9J-flags.js renderDetail): lifecycle stepper, environment tabs, targeting (on / off,
 * individual targets, rule builder, default rule with rollout slider and 100-bucket grid, off variation),
 * prerequisites, the audit log (FlagAuditLogs with diffs), About / Variations / Tenants served and the save bar.
 * Phase 43: Production saves become a change request; the Scheduled changes panel plans ramp steps. Evaluation
 * insights and code references (telemetry) are empty.
 */
export function FlagDetailScreen({ id, initialEnv }: { id: string; initialEnv?: string }) {
  const toast = useToast();
  const router = useRouter();
  const lookups = useAdminLookups(LOOKUPS);
  const [flag, setFlag] = useState<FlagDetail | null>(null);
  const [env, setEnv] = useState<FlagEnvironment>((ENVS.find((e) => e.code === initialEnv?.toUpperCase())?.code) ?? "PRODUCTION");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState("");
  const [audit, setAudit] = useState<FlagAuditEntry[]>([]);
  const [served, setServed] = useState<FlagServed | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState(false);
  const [history, setHistory] = useState(false);
  const [kill, setKill] = useState<boolean | null>(null);
  const [archiveAsk, setArchiveAsk] = useState(false);
  const [switchEnv, setSwitchEnv] = useState<FlagEnvironment | null>(null);
  const [tq, setTq] = useState<Record<number, string>>({});
  const [evalTenant, setEvalTenant] = useState("");
  const [evalResult, setEvalResult] = useState<FlagEvaluation | null>(null);
  const options = useFlagOptions(attempt);
  const [requestOpen, setRequestOpen] = useState(false);
  const [pendingCr, setPendingCr] = useState<{ id: string; docNo: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFlag(id), flagAudit(id), flagServed(id, env), listChangeRequests("PENDING", id).catch(() => null)])
      .then(([f, a, s, crs]) => {
        const pc = crs?.items.find((c) => c.environment === env);
        if (!cancelled) setPendingCr(pc ? { id: pc.id, docNo: pc.docNo } : null);
        if (cancelled) return;
        const e = f.environments.find((x) => x.environment === env) ?? f.environments[0]!;
        const d = draftOf(e);
        setFlag(f); setAudit(a); setServed(s); setDraft(d); setBase(JSON.stringify(d)); setError(null); setErrors({});
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the flag" }));
    return () => { cancelled = true; };
  }, [id, env, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const dirty = !!draft && JSON.stringify(draft) !== base;
  const tenants = useMemo(() => options?.tenants ?? [], [options]);
  const tenantOf = useCallback((tid: string) => tenants.find((t) => t.id === tid), [tenants]);
  const targetedIds = useMemo(() => new Set(draft?.targets.map((t) => t.tenantId)), [draft]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!flag || !draft) return <div className="stack"><Skeleton style={{ height: 80 }} /><Skeleton style={{ height: 320 }} /></div>;

  const state = flag.environments.find((x) => x.environment === env)!;
  const vars = flag.variations;
  const killSwitch = isKill(flag);
  const archived = flag.stage === "ARCHIVED";
  const stageIdx = STAGES.findIndex((s) => s.code === flag.stage);
  const onIdx = flag.flagType === "EXPERIMENT" ? 1 : 0;
  const d = draft.defaultRule;
  const servedOn = served?.rows.filter((r) => r.variationIdx === onIdx).length ?? 0;
  const counts = vars.map((v) => served?.rows.filter((r) => r.variationIdx === v.idx).length ?? 0);
  // tenants that reach the default rule (saved state): bucket grid "has" marks
  const reach = served?.rows.filter((r) => r.reason.kind === "ROLLOUT" || r.reason.kind === "DEFAULT") ?? [];
  const per = Array.from({ length: 100 }, (_, k) => reach.filter((r) => r.bucket === k).length);
  const inN = reach.filter((r) => r.bucket < (d.rolloutPct ?? 0)).length;
  const setD = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setDef = (p: Partial<FlagDefaultRuleInput>) => setDraft({ ...draft, defaultRule: { ...d, ...p } });

  const save = async () => {
    if (env === "PRODUCTION") { setRequestOpen(true); return; }
    setBusy(true);
    try {
      await saveFlagEnvironment(flag.id, env, { envRowVersion: state.rowVersion, isOn: draft.isOn, targets: draft.targets, rules: draft.rules, defaultRule: draft.defaultRule, prerequisites: draft.prerequisites });
      toast(`Saved to ${envLabel(env)}.`, { tone: "good" });
      reload();
    } catch (e) {
      setErrors(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the targeting"), { tone: "danger", ms: 6000 });
    } finally {
      setBusy(false);
    }
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, { tone: "good" }); reload(); }
    catch (e) { toast(adminErrorMessage(e, "Could not update the flag"), { tone: "danger" }); }
    finally { setBusy(false); setKill(null); setArchiveAsk(false); }
  };
  const goStage = (to: string) => {
    if (to === flag.stage || archived) return;
    if (to === "ARCHIVED") { setArchiveAsk(true); return; }
    void run(() => moveFlagStage(flag.id, to, flag.rowVersion), `${flag.key} moved to ${stageLabel(to)}`);
  };
  const changeEnv = (e: FlagEnvironment) => { if (e === env) return; if (dirty) setSwitchEnv(e); else { setEnv(e); setEvalResult(null); } };
  const addTarget = (variationIdx: number, tenantId: string) => {
    setD({ targets: [...draft.targets.filter((t) => t.tenantId !== tenantId), { tenantId, variationIdx }] });
    setTq({ ...tq, [variationIdx]: "" });
  };
  const preFlags = (options?.flags ?? []).filter((x) => x.id !== flag.id);

  return (
    <>
      <div className="page-head ff-dhead">
        <div>
          <div className="eyebrow"><Link className="link" href="/admin/features">Feature Flags</Link> / {categoryLabel(flag.category)}</div>
          <h1>{flag.name}</h1>
          <div className="ff-dkey">
            <code className="ff-key lg">{flag.key}</code>
            <button type="button" className="icon-btn-sm" aria-label="Copy key" onClick={() => { void navigator.clipboard?.writeText(flag.key).catch(() => undefined); toast(`Copied ${flag.key}`, { tone: "info", ms: 2200 }); }}><Copy /></button>
            <TypeBadge type={flag.flagType} />{flag.secondaryType && <TypeBadge type={flag.secondaryType} />}
            {flag.isTemporary ? <span className="pill"><Timer />Temporary</span> : <span className="pill"><InfinityIcon />Permanent</span>}
            {flag.staleReason && <span className="ff-stalei lg" title={flag.staleReason}><Hourglass />Stale</span>}
          </div>
        </div>
        <div className="head-actions">
          <select aria-label="Switch flag" value={flag.id} onChange={(e) => router.push(`/admin/features/${e.target.value}?env=${env}`)}>
            {[...preFlags.map((x) => ({ id: x.id, key: x.key })), { id: flag.id, key: flag.key }].sort((a, b) => a.key.localeCompare(b.key)).map((x) => <option key={x.id} value={x.id}>{x.key}</option>)}
          </select>
          <button type="button" className="btn secondary" onClick={() => setHistory(true)}><History />History</button>
          {!archived && <button type="button" className="btn secondary" onClick={() => setEdit(true)}><PencilLine />Edit details</button>}
          <Link className="btn secondary" href="/admin/features"><ArrowLeft />All flags</Link>
        </div>
      </div>

      {archived && <div className="banner warn ff-banner"><Archive /><div><b>This flag is archived.</b> It is no longer evaluated and serves its off variation. Restore it to change it.</div>
        <button type="button" className="btn sm secondary" disabled={busy} onClick={() => run(() => restoreFlag(flag.id, flag.rowVersion), `${flag.key} restored to Cleanup`)}><ArchiveRestore />Restore</button></div>}
      {pendingCr && <div className="banner warn ff-banner ff-pendbanner"><Clock /><div><b>{pendingCr.docNo} is waiting for approval in {envLabel(env)}.</b> Production changes apply once it is approved.</div>
        <Link className="btn sm secondary" href={`/admin/change-requests?open=${pendingCr.id}`}><GitPullRequest />Review</Link></div>}
      {!archived && flag.staleReason && <div className="banner warn ff-banner"><Hourglass /><div><b>This flag looks stale.</b> {flag.staleReason}</div>
        {flag.stage !== "CLEANUP" && <button type="button" className="btn sm secondary" onClick={() => goStage("CLEANUP")}>Move to Cleanup</button>}</div>}

      <div className="panel ff-lifecycle">
        <div className="ff-lc-h"><b>Lifecycle</b><small>Click a stage to move the flag (forward, or back one stage). Temporary flags should end in Archived.</small></div>
        <ol className="ff-stepper" style={{ ["--prog" as string]: stageIdx / (STAGES.length - 1) }}>
          {STAGES.map((s, i) => {
            const Icon = i < stageIdx ? Check : STAGE_ICONS[i]!;
            return <li key={s.code} className={cn(i < stageIdx && "done", i === stageIdx && "cur")}>
              <button type="button" disabled={busy || archived} aria-current={i === stageIdx ? "step" : undefined} onClick={() => goStage(s.code)}><span className="ff-sic"><Icon /></span><b>{s.label}</b><small>{s.hint}</small></button>
            </li>;
          })}
        </ol>
      </div>

      <div className="ff-envtabs" role="tablist">
        {ENVS.map((e) => {
          const x = flag.envs[e.code];
          return <button key={e.code} type="button" role="tab" aria-selected={e.code === env} className={cn(`e-${e.css}`, e.code === env && "active")} onClick={() => changeEnv(e.code)}>
            <span className={cn("ff-env-dot", `e-${e.css}`)} /><b>{e.label}</b><em className={cn(x.isOn && "on")}>{x.isOn ? (x.rolloutPct !== null ? `${x.rolloutPct}%` : "On") : "Off"}</em>
          </button>;
        })}
        <span className="spacer" />
        <span className="ff-servedpill"><Users /><b>{servedOn}</b> of {served?.total ?? 0} tenants get {variationName(vars, onIdx)}</span>
      </div>

      <div className="split ff-dsplit">
        <div className="ff-dmain">
          <div className={cn("panel ff-targeting", `e-${envCss(env)}`, !draft.isOn && "is-off")}>
            <div className="ff-tgt-h">
              <div><h3>Targeting <span className={cn("ff-envchip", `e-${envCss(env)}`)}><EnvDot env={env} />{envLabel(env)}</span></h3><p>Evaluated top to bottom: prerequisites, individual targets, rules, then the default rule.</p></div>
              <label className={cn("switch ff-bigsw ff-tgtsw", killSwitch && "kill")}>
                <input type="checkbox" checked={draft.isOn} disabled={archived || busy} onChange={(e) => (killSwitch ? setKill(e.target.checked) : setD({ isOn: e.target.checked }))} /><i /><span>{draft.isOn ? "On" : "Off"}</span>
              </label>
            </div>
            {!draft.isOn && <div className="ff-offnote"><PowerOff />Targeting is off. Every tenant gets the off variation.</div>}

            <section className="ff-sec">
              <div className="ff-sec-h"><span className="ff-secn">1</span><div><b>Individual targets</b><small>Always win over rules. Use them for pilots and exceptions.</small></div></div>
              {vars.map((v) => {
                const list = draft.targets.filter((t) => t.variationIdx === v.idx);
                const q = (tq[v.idx] ?? "").toLowerCase();
                const sugg = q ? tenants.filter((t) => !targetedIds.has(t.id) && `${t.name} ${t.code} ${t.city ?? ""}`.toLowerCase().includes(q)).slice(0, 6) : [];
                return (
                  <div key={v.idx} className="ff-trow">
                    <span className="ff-tvar"><span className={cn("ff-vsw", `v${v.idx % 4}`)} />{v.name}</span>
                    <div className="ff-tchips">
                      {list.map((t) => { const tn = tenantOf(t.tenantId); return <span key={t.tenantId} className="ff-tchip" title={tn ? `${tn.name} · ${tn.planCode ?? "no plan"} · ${tn.city ?? ""}` : t.tenantId}><Avatar name={tn?.name ?? "?"} /><b>{tn?.name ?? t.tenantId.slice(0, 8)}</b><button type="button" aria-label="Remove" onClick={() => setD({ targets: draft.targets.filter((x) => x.tenantId !== t.tenantId) })}><X /></button></span>; })}
                      <div className="ff-tadd"><Search /><input placeholder="Add tenant…" autoComplete="off" aria-label={`Add tenant to ${v.name}`} value={tq[v.idx] ?? ""}
                        onChange={(e) => setTq({ ...tq, [v.idx]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && sugg[0]) { e.preventDefault(); addTarget(v.idx, sugg[0].id); } if (e.key === "Escape") setTq({ ...tq, [v.idx]: "" }); }} />
                        {q && <div className="ff-tdrop">{sugg.length ? sugg.map((t, k) => <button key={t.id} type="button" className={cn(k === 0 && "hi")} onClick={() => addTarget(v.idx, t.id)}><Avatar name={t.name} /><span><b>{t.name}</b><small>{t.code} · {t.planCode ?? "no plan"} · {t.city ?? "—"}</small></span></button>) : <div className="ff-tnone">No matching tenants</div>}</div>}
                      </div>
                    </div>
                    <em className="ff-tcount">{list.length}</em>
                  </div>
                );
              })}
            </section>

            <section className="ff-sec">
              <div className="ff-sec-h"><span className="ff-secn">2</span><div><b>Rules</b><small>First match wins. Drag the handle to reorder.</small></div></div>
              <RuleBuilder rules={draft.rules} onChange={(rules) => setD({ rules })} variations={vars} options={options} lookups={lookups} errors={errors} />
            </section>

            <section className="ff-sec">
              <div className="ff-sec-h"><span className="ff-secn">3</span><div><b>Default rule</b><small>Everyone who did not match above.</small></div>
                <select className="ff-defsel" aria-label="Default rule" value={d.defaultRule === "ROLLOUT" ? "rollout" : String(d.defaultVariationIdx ?? 0)}
                  onChange={(e) => (e.target.value === "rollout" ? setDef({ defaultRule: "ROLLOUT", rolloutPct: d.rolloutPct ?? 0, defaultVariationIdx: null }) : setDef({ defaultRule: "VARIATION", defaultVariationIdx: Number(e.target.value) }))}>
                  <option value="rollout">Percentage rollout</option>{vars.map((v) => <option key={v.idx} value={v.idx}>Serve {v.name}</option>)}
                </select>
              </div>
              {d.defaultRule !== "ROLLOUT" ? (
                <div className="ff-fixed"><span className={cn("ff-vsw", `v${(d.defaultVariationIdx ?? 0) % 4}`)} />Everyone else gets <b>{variationName(vars, d.defaultVariationIdx)}</b></div>
              ) : (
                <div className="ff-rollout">
                  <div className="ff-rl-top">
                    <div className="ff-rl-big"><b>{d.rolloutPct ?? 0}</b><span>%</span></div>
                    <div className="ff-rl-split">
                      <span><span className={cn("ff-vsw", `v${d.rolloutVariationIdx % 4}`)} />
                        <select aria-label="Rollout variation" value={d.rolloutVariationIdx} onChange={(e) => { const v = Number(e.target.value); setDef({ rolloutVariationIdx: v, rolloutRestVariationIdx: v === d.rolloutRestVariationIdx ? (vars.find((x) => x.idx !== v)?.idx ?? 0) : d.rolloutRestVariationIdx }); }}>
                          {vars.map((v) => <option key={v.idx} value={v.idx}>{v.name}</option>)}</select> <b>{d.rolloutPct ?? 0}%</b></span>
                      <span><span className={cn("ff-vsw", `v${d.rolloutRestVariationIdx % 4}`)} />
                        <select aria-label="Everyone else" value={d.rolloutRestVariationIdx} onChange={(e) => setDef({ rolloutRestVariationIdx: Number(e.target.value) })}>
                          {vars.filter((v) => v.idx !== d.rolloutVariationIdx).map((v) => <option key={v.idx} value={v.idx}>{v.name}</option>)}</select> <b>{100 - (d.rolloutPct ?? 0)}%</b></span>
                    </div>
                    <div className="ff-rl-n"><b>{inN}</b><small>of {reach.length} tenants reaching this rule (saved targeting)</small></div>
                  </div>
                  <div className="ff-slider" style={{ ["--p" as string]: `${d.rolloutPct ?? 0}%` }}>
                    <input type="range" min={0} max={100} step={1} value={d.rolloutPct ?? 0} aria-label="Rollout percentage" onChange={(e) => setDef({ rolloutPct: Number(e.target.value) })} />
                    <div className="ff-ticks">{[0, 10, 25, 50, 75, 100].map((p) => <button key={p} type="button" style={{ left: `${p}%` }} onClick={() => setDef({ rolloutPct: p })}>{p}</button>)}</div>
                  </div>
                  <div className="ff-buckets" aria-hidden>{per.map((n, k) => <i key={k} className={cn(k < (d.rolloutPct ?? 0) && "on", n > 0 && "has")} style={{ ["--k" as string]: k }} title={`Bucket ${k} · ${n} tenant${n === 1 ? "" : "s"}`} />)}</div>
                  <p className="ff-sticky"><Pin /><span><b>Sticky by tenant {d.bucketBy === "TENANT_ID" ? "ID" : "code"}.</b> Each tenant hashes <code className="ff-key">{d.bucketBy === "TENANT_ID" ? "tenant.id" : "tenant.code"} + &quot;.{flag.key}&quot;</code> into one of 100 buckets. Raising the percentage only adds buckets, so nobody who already has {variationName(vars, d.rolloutVariationIdx)} loses it.
                    {" "}<select aria-label="Bucket by" value={d.bucketBy} onChange={(e) => setDef({ bucketBy: e.target.value === "TENANT_ID" ? "TENANT_ID" : "TENANT_CODE" })}><option value="TENANT_CODE">Bucket by tenant code</option><option value="TENANT_ID">Bucket by tenant ID</option></select></span></p>
                </div>
              )}
            </section>

            <section className="ff-sec ff-offsec">
              <div className="ff-sec-h"><span className="ff-secn"><PowerOff /></span><div><b>Off variation</b><small>Served when targeting is off or a prerequisite fails.</small></div>
                <select aria-label="Off variation" value={d.offVariationIdx} onChange={(e) => setDef({ offVariationIdx: Number(e.target.value) })}>{vars.map((v) => <option key={v.idx} value={v.idx}>{v.name}</option>)}</select>
              </div>
            </section>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Prerequisites</h3><p>This flag only evaluates when these flags serve the required variation (or the tenant has the module).</p></div>
              <div className="panel-actions" style={{ flexWrap: "nowrap", flex: "none" }}>
                <button type="button" className="btn ghost sm" disabled={!preFlags.length} onClick={() => { const c = preFlags.find((x) => !draft.prerequisites.some((p) => "prerequisiteFlagId" in p && p.prerequisiteFlagId === x.id)); if (c) setD({ prerequisites: [...draft.prerequisites, { prerequisiteFlagId: c.id, requiredVariationIdx: 0 }] }); }}><Plus />Add flag</button>
                <button type="button" className="btn ghost sm" disabled={!options?.modules.length} onClick={() => { const m = options?.modules.find((x) => !draft.prerequisites.some((p) => "prerequisiteModuleId" in p && p.prerequisiteModuleId === x.id)); if (m) setD({ prerequisites: [...draft.prerequisites, { prerequisiteModuleId: m.id }] }); }}><Plus />Add module</button>
              </div></div>
            {errors.prerequisites && <div className="banner danger ff-banner"><Link2Off /><div>{errors.prerequisites}</div></div>}
            {draft.prerequisites.length === 0 ? <div className="ff-rules-empty"><Link2Off />No prerequisites. This flag evaluates on its own.</div> : (
              <div className="ff-prelist">
                {draft.prerequisites.map((p, i) => {
                  const set = (np: FlagPrerequisiteInput) => setD({ prerequisites: draft.prerequisites.map((x, k) => (k === i ? np : x)) });
                  const err = errors[`prerequisites.${i}`] ?? errors[`prerequisites.${i}.requiredVariationIdx`];
                  if ("prerequisiteModuleId" in p) {
                    return <div key={i} className="ff-prerow" style={{ ["--i" as string]: i }}><span className="ff-ficon mod"><Link2 /></span>
                      <div className="ff-pre-k"><select aria-label="Prerequisite module" value={p.prerequisiteModuleId} onChange={(e) => set({ prerequisiteModuleId: e.target.value })}>{(options?.modules ?? []).map((m) => <option key={m.id} value={m.id}>{m.key}</option>)}</select><small>Platform module · enabled for the tenant&apos;s plan</small></div>
                      <span className="ff-then">must be</span><span className="ff-vchip">Enabled</span>
                      <button type="button" className="icon-btn-sm" aria-label="Remove prerequisite" onClick={() => setD({ prerequisites: draft.prerequisites.filter((_, k) => k !== i) })}><Trash2 /></button>
                      {err && <small className="hint text-danger">{err}</small>}</div>;
                  }
                  const pf = preFlags.find((x) => x.id === p.prerequisiteFlagId);
                  return <div key={i} className="ff-prerow" style={{ ["--i" as string]: i }}><span className="ff-ficon"><Link2 /></span>
                    <div className="ff-pre-k"><select aria-label="Prerequisite flag" value={p.prerequisiteFlagId} onChange={(e) => set({ prerequisiteFlagId: e.target.value, requiredVariationIdx: 0 })}>{preFlags.map((x) => <option key={x.id} value={x.id}>{x.key}</option>)}</select></div>
                    <span className="ff-then">must serve</span>
                    <select aria-label="Required variation" value={p.requiredVariationIdx} onChange={(e) => set({ ...p, requiredVariationIdx: Number(e.target.value) })}>{(pf?.variations ?? []).map((v) => <option key={v.idx} value={v.idx}>{v.name}</option>)}</select>
                    {pf && <span className="ff-prestate">{stageLabel(pf.stage)}</span>}
                    <button type="button" className="icon-btn-sm" aria-label="Remove prerequisite" onClick={() => setD({ prerequisites: draft.prerequisites.filter((_, k) => k !== i) })}><Trash2 /></button>
                    {err && <small className="hint text-danger">{err}</small>}</div>;
                })}
              </div>
            )}
          </div>

          <SchedulePanel key={`${flag.id}-${env}-${flag.rowVersion}`} flag={flag} env={env} />
          <div className="panel"><div className="panel-head"><div><h3>Evaluation insights</h3><p>Evaluations per day in {envLabel(env)}, last 14 days</p></div></div>
            <div className="empty-state ff-empty"><span className="icon-well lg"><Activity /></span><b>No evaluation telemetry yet</b><small>SDK evaluation counts are not collected yet.</small></div></div>

          <div className="panel flush">
            <div className="panel-head"><div><h3>Audit log</h3><p>Every change with a before / after diff</p></div></div>
            {audit.length === 0 ? <div className="ff-rules-empty"><History />No changes logged yet.</div> : (
              <div className="ff-audit">
                {audit.map((a, i) => {
                  const [Icon, tone] = EVENT_ICON[a.eventKind] ?? [PencilLine, ""];
                  return <div key={a.id} className="ff-arow" style={{ ["--i" as string]: i }}>
                    <span className={cn("ff-aic", tone)}><Icon /></span>
                    <div className="ff-amain">
                      <div className="ff-atop"><b>{a.summary}</b>{a.environment !== "ALL" && <span className={cn("ff-envchip sm", `e-${envCss(a.environment)}`)}><EnvDot env={a.environment} />{envLabel(a.environment)}</span>}{a.isEmergency && <span className="ff-via">emergency</span>}</div>
                      <small><Avatar name={a.staffName ?? "system"} /> {a.staffName ?? "system"} · {fmtDateTime(a.occurredAt)}</small>
                      <button type="button" className={cn("ff-atog", open[a.id] && "open")} aria-expanded={!!open[a.id]} onClick={() => setOpen({ ...open, [a.id]: !open[a.id] })}><ChevronRight />{open[a.id] ? "Hide diff" : "Show diff"}</button>
                      {open[a.id] && <div className="ff-adiff"><Diff before={a.beforeState} after={a.afterState} /></div>}
                    </div>
                  </div>;
                })}
              </div>
            )}
          </div>
        </div>

        <div className="ff-dside">
          <div className="panel ff-about"><div className="panel-head"><div><h3>About</h3></div></div>
            <p className="ff-desc">{flag.description || "No description yet."}</p>
            <div className="dl ff-dl2">
              <div><span>Owner</span><b><Avatar name={flag.ownerName ?? "?"} /> {flag.ownerName ?? "—"}</b></div>
              <div><span>Category</span><b>{categoryLabel(flag.category)}</b></div>
              <div><span>Created</span><b>{fmtDate(flag.createdAt)}</b></div>
              <div><span>Expiry</span><b>{flag.expiresOn ? fmtDate(flag.expiresOn) : "Never (permanent)"}</b></div>
              <div><span>Last evaluated</span><b>{flag.lastEvaluatedAt ? fmtDate(flag.lastEvaluatedAt) : "Never"}</b></div>
              <div><span>Tags</span><b>{flag.tags.length ? flag.tags.map((t) => <span key={t} className="ff-vchip">{t}</span>) : "—"}</b></div>
            </div>
          </div>
          <div className="panel"><div className="panel-head"><div><h3>Variations</h3><p>{flag.variationKind === "BOOLEAN" ? "Boolean" : "Multivariate"}</p></div></div>
            <div className="ff-vars">{vars.map((v, i) => <div key={v.idx} className="ff-var"><span className={cn("ff-vsw", `v${i % 4}`)} /><div><b>{v.name}</b><code>{v.value}</code></div><em>{counts[i]}<small>tenants</small></em></div>)}</div>
            <div className="ff-varbar">{vars.map((v, i) => <i key={v.idx} className={`v${i % 4}`} style={{ width: `${served?.total ? ((counts[i] ?? 0) / served.total) * 100 : 0}%` }} />)}</div>
          </div>
          <div className="panel"><div className="panel-head"><div><h3>Tenants served</h3><p>Live evaluation in {envLabel(env)} (saved targeting)</p></div><span className="ff-servedn"><b>{servedOn}</b>/{served?.total ?? 0}</span></div>
            <div className="ff-served">
              {(served?.rows ?? []).slice(0, 8).map((r) => <div key={r.tenantId} className="ff-srow"><Avatar name={r.name} size="sm" /><div><b>{r.name}</b><small>{r.planCode ?? "no plan"} · {r.city ?? "—"} · <span className="ff-why">{r.reason.label}</span></small></div><span className={cn("ff-vtag", `v${r.variationIdx % 4}`)}>{variationName(vars, r.variationIdx)}</span></div>)}
              {served && served.total === 0 && <div className="ff-rules-empty"><Users />No tenants yet.</div>}
            </div>
            <div className="form-grid c1" style={{ marginTop: 12 }}>
              <label><span>Evaluate for a tenant</span>
                <div className="row"><select value={evalTenant} onChange={(e) => setEvalTenant(e.target.value)} aria-label="Tenant"><option value="">Choose a tenant…</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}</select>
                  <button type="button" className="btn secondary sm" disabled={!evalTenant} onClick={() => evaluateFlag(flag.id, evalTenant, env).then(setEvalResult).catch((e: unknown) => toast(adminErrorMessage(e, "Could not evaluate"), { tone: "danger" }))}>Evaluate</button></div>
              </label>
              {evalResult && <p className="small"><b>{evalResult.tenant.name}</b> gets <b>{evalResult.variationName}</b> (<code className="ff-key">{evalResult.variationValue}</code>) · <span className="ff-why">{evalResult.reason.label}</span></p>}
            </div>
          </div>
          <div className="panel"><div className="panel-head"><div><h3>Code references</h3><p>Found by a repository scan</p></div></div>
            <div className="ff-rules-empty"><GitBranch />No code scan yet.</div></div>
        </div>
      </div>

      {dirty && !archived && (
        <div className="ff-savebar ff-sb-in">
          <span className="ff-sb-ic"><PencilLine /></span>
          <div><b>Unsaved changes</b><small>{env === "PRODUCTION" ? "Production is protected: saving opens a change request for a second approver" : `Applies to ${envLabel(env)} immediately`}</small></div>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={() => { setDraft(JSON.parse(base) as Draft); setErrors({}); toast("Changes discarded", { tone: "info", ms: 1800 }); }}>Discard</button>
          <button type="button" className={cn("btn", env === "PRODUCTION" ? "primary" : "lime")} disabled={busy} onClick={save}>{env === "PRODUCTION" ? <><GitPullRequest />Request change</> : <><Check />{busy ? "Saving…" : "Save changes"}</>}</button>
        </div>
      )}

      {requestOpen && <RequestChangeModal flag={flag} env={env} summary="Targeting change (diff on the request)"
        change={{ kind: "TARGETING", input: { envRowVersion: state.rowVersion, isOn: draft.isOn, targets: draft.targets, rules: draft.rules, defaultRule: draft.defaultRule, prerequisites: draft.prerequisites } }}
        onClose={() => setRequestOpen(false)} onDone={() => { setRequestOpen(false); reload(); }} />}
      {edit && <FlagEditModal flag={flag} options={options} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
      <Modal open={history} onClose={() => setHistory(false)} title="Flag history" subtitle={flag.key} wide>
        <AdminHistoryTab table="FeatureFlags" id={flag.id} reloadKey={attempt} labels={{ FlagEnvironments: "Environment", FlagVariations: "Variation", FlagRules: "Rule", FlagTargets: "Target", FlagPrerequisites: "Prerequisite", FlagDefaultRules: "Default rule" }} />
      </Modal>
      {kill !== null && <KillConfirm flagKey={flag.key} env={env} turnOn={kill} busy={busy} onClose={() => setKill(null)}
        onConfirm={(key) => void run(() => toggleFlag(flag.id, env, kill, key), kill ? `${flag.key} restored in ${envLabel(env)}` : `${flag.key} is OFF in ${envLabel(env)}`)} />}
      <ConfirmDialog open={archiveAsk} onClose={() => setArchiveAsk(false)} busy={busy} danger title={`Archive ${flag.key}?`} confirmLabel="Archive"
        onConfirm={() => run(() => moveFlagStage(flag.id, "ARCHIVED", flag.rowVersion), `${flag.key} archived`)}>
        Archived flags stop evaluating and SDKs fall back to their in-code default. Remove the code references first.
      </ConfirmDialog>
      <ConfirmDialog open={!!switchEnv} onClose={() => setSwitchEnv(null)} danger title="Discard unsaved changes?" confirmLabel="Discard"
        onConfirm={() => { if (switchEnv) { setEnv(switchEnv); setEvalResult(null); } setSwitchEnv(null); }}>
        You have unsaved targeting changes in {envLabel(env)}.
      </ConfirmDialog>
    </>
  );
}
