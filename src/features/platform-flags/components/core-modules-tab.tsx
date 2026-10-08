"use client";

import { Blocks, Check, Info, Lock, Minus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlatformModule, SubscriptionPlan } from "@/shared";
import { cn } from "@/components/ui/cn";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { listModules, listPlans } from "@/features/platform-catalogue/api";
import { activePlans, CatalogueIcon, PlanPill, plural } from "@/features/platform-catalogue/components/catalogue-ui";
import { ApiError } from "@/lib/api/errors";

/**
 * Template admin/features "Core modules" pane: the modules-by-plan table. It reads Phase 36's catalogue API
 * (/api/admin/modules, /api/admin/plans) and is edited on Plan Entitlements, where Phase 36 keeps the editable copy.
 */
export function CoreModulesTab() {
  const [data, setData] = useState<{ modules: PlatformModule[]; plans: SubscriptionPlan[] } | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listModules(), listPlans()])
      .then(([modules, plans]) => { if (!cancelled) { setData({ modules, plans }); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load modules" }));
    return () => { cancelled = true; };
  }, [attempt]);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!data) return <div className="panel"><Skeleton style={{ height: 160 }} /></div>;

  const plans = activePlans(data.plans);
  const minName = (id: string | null) => data.plans.find((p) => p.id === id)?.name ?? "—";
  return (
    <>
      <div className="banner ff-banner"><Info /><div><b>Core modules are global switches.</b> Turning one off hides it for every tenant on that plan. What each plan includes commercially lives in <Link className="link" href="/admin/entitlements">Plan Entitlements</Link>, where this table is edited.</div></div>
      <div className="panel flush">
        <div className="panel-head"><div><h3>Modules by plan</h3><p>{plural(data.modules.length, "module")} · changes are logged to the platform audit log</p></div>
          <div className="panel-actions"><Link className="btn secondary sm" href="/admin/entitlements">Edit in Plan Entitlements</Link></div></div>
        {!data.modules.length ? <EmptyState icon={<Blocks />} title="No modules yet" description="Modules added on Plan Entitlements appear here." /> : (
          <div className="table-wrap"><table className="tbl ff-modtbl">
            <thead><tr><th>Module</th><th>Key</th><th className="num">Tenants using</th><th>Minimum plan</th>{plans.map((p) => <th key={p.id} className="ff-c-plan"><PlanPill plan={p} /></th>)}<th>Enabled</th></tr></thead>
            <tbody>
              {data.modules.map((m) => (
                <tr key={m.id} className={cn(!m.isEnabled && "ff-modoff")}>
                  <td><div className="ff-modname"><span className="icon-well sm"><CatalogueIcon name={m.icon} /></span><b>{m.name}</b>{m.isCore && <span className="badge neutral"><Lock />Core</span>}</div></td>
                  <td><code className="ff-key">{m.key}</code></td>
                  <td className="num" title="Tenant usage arrives with usage metering (Phase 40)">—</td>
                  <td>{minName(m.minPlanId)}</td>
                  {plans.map((p) => <td key={p.id} className="ff-c-plan">{m.plans.find((x) => x.planId === p.id)?.isIncluded || m.isCore ? <Check className="text-good" /> : <Minus className="muted" />}</td>)}
                  <td><span className={cn("badge", m.isEnabled ? "good" : "neutral")}>{m.isEnabled ? "On" : "Off"}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
