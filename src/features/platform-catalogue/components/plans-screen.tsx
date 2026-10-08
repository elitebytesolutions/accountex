"use client";

import { Check, History, Pencil, Plus, Tags, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { SubscriptionPlan } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { listPlans } from "../api";
import { activePlans, fmtDate, MODULE_KEY_LABELS, moduleKeyLabel, PlanPill, rs } from "./catalogue-ui";
import { PlanModal } from "./plan-modal";

const LOOKUPS = ["SupportChannel"];

/** The card's bullet list, as in the template: users, storage, modules, support, SLA. */
function bullets(p: SubscriptionPlan, channel: string): string[] {
  const mods = p.features.filter((f) => f.inclusion === "INCLUDED").map((f) => moduleKeyLabel(f.moduleKey));
  return [
    p.userSeats ? `Up to ${p.userSeats} users` : "Unlimited users",
    p.storageGb ? `${p.storageGb} GB storage` : "Unlimited storage",
    mods.length ? (mods.length === Object.keys(MODULE_KEY_LABELS).length ? "All modules" : mods.slice(0, 3).join(", ") + (mods.length > 3 ? ` +${mods.length - 3} more` : "")) : "No modules yet",
    ...(p.extraSeatPrice ? [`Extra seats ${rs(p.extraSeatPrice)} / month`] : []),
    ...(p.supportChannel ? [`${channel} support${p.supportResponseHours ? ` (${p.supportResponseHours}h)` : ""}`] : []),
    ...(p.slaUptimePct ? [`${p.slaUptimePct}% SLA`] : []),
  ];
}

/**
 * Template admin/plans (30-entry-admin.html): plan cards with a Monthly / Annual toggle, the feature matrix and the
 * edit-plan modal, connected to /api/admin/plans. "Price history" lists retired plan versions.
 */
export function PlansScreen({ openNew }: { openNew?: boolean }) {
  const lookups = useAdminLookups(LOOKUPS);
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [annual, setAnnual] = useState(false);
  const [edit, setEdit] = useState<SubscriptionPlan | "new" | null>(openNew ? "new" : null);
  const [history, setHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPlans()
      .then((p) => { if (!cancelled) { setPlans(p); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load plans" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const live = plans ? activePlans(plans) : [];
  const retired = (plans ?? []).filter((p) => p.status === "RETIRED").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const keys = Object.keys(MODULE_KEY_LABELS).filter((k) => live.some((p) => p.features.some((f) => f.moduleKey === k)));
  const nextSort = Math.max(0, ...(plans ?? []).map((p) => p.sortOrder)) + 1;
  const price = (p: SubscriptionPlan) => {
    if (p.isCustomPrice) return <strong className="price">Custom</strong>;
    const v = annual ? p.priceAnnual : p.priceMonthly;
    return <strong className="price">{v === null ? "—" : rs(v)}<small>{annual ? "/yr" : "/mo"}</small></strong>;
  };

  return (
    <>
      <PageHead eyebrow="Billing / Plans & Pricing" title="Plans & pricing"
        description="Public price book for Accountex Cloud. Changes apply to new subscriptions; existing tenants are grandfathered."
        actions={<>
          <button className="btn secondary" type="button" onClick={() => setHistory(true)}><History />Price history</button>
          <button className="btn primary" type="button" onClick={() => setEdit("new")}><Plus />New plan</button>
        </>} />

      <div className="row mb">
        <div className="seg">
          <button type="button" className={cn(!annual && "active")} onClick={() => setAnnual(false)}>Monthly</button>
          <button type="button" className={cn(annual && "active")} onClick={() => setAnnual(true)}>Annual (2 months free)</button>
        </div>
        <span className="spacer" />
        <span className="small muted">Prices exclude provincial sales tax on services</span>
      </div>

      {!plans ? <Skeleton style={{ height: 260, marginBottom: 16 }} /> : !live.length ? (
        <div className="panel mb"><EmptyState icon={<Tags />} title="No plans on sale" description="Create a plan, or reactivate a retired one from Price history."
          action={<button className="btn primary sm" type="button" onClick={() => setEdit("new")}><Plus />New plan</button>} /></div>
      ) : (
        <div className="grid-4 mb">
          {live.map((p, i) => (
            <div key={p.id} className={cn("plan-card", i === 1 && "featured")}>
              <div className="row"><h3>{p.name}</h3><span className="spacer" /><span className="badge neutral">{p.subscribers} tenant{p.subscribers === 1 ? "" : "s"}</span></div>
              {price(p)}
              <p className="small muted">{p.tagline ?? (p.isPublic ? "" : "Private plan")}</p>
              <ul className="small">{bullets(p, labelOf(lookups, "SupportChannel", p.supportChannel)).map((b) => <li key={b}>{b}</li>)}</ul>
              <button className={cn("btn sm", i === 1 ? "primary" : "secondary")} type="button" onClick={() => setEdit(p)}><Pencil />Edit plan</button>
            </div>
          ))}
        </div>
      )}

      {plans && live.length > 0 && (
        <div className="panel flush">
          <div className="panel-head"><div><h3>Feature matrix</h3><p>What each plan includes</p></div></div>
          {!keys.length ? <EmptyState icon={<Tags />} title="No modules assigned" description="Open a plan to choose the modules it includes." /> : (
            <div className="table-wrap"><table className="tbl matrix">
              <thead><tr><th>Feature</th>{live.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <td><b>{moduleKeyLabel(k)}</b></td>
                    {live.map((p) => {
                      const f = p.features.find((x) => x.moduleKey === k);
                      if (f?.inclusion === "INCLUDED") return <td key={p.id}><Check size={16} /></td>;
                      if (f?.inclusion === "ADDON") return <td key={p.id} title={f.addonPrice !== null ? `${rs(f.addonPrice)} / month` : undefined}>Add-on</td>;
                      return <td key={p.id} className="muted"><X size={16} /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      <Drawer open={history} onClose={() => setHistory(false)} title="Price history" subtitle="Retired plans and earlier versions. Their subscribers keep these prices.">
        {!retired.length ? <EmptyState icon={<History />} title="No retired plans" description="When a price changes on a plan with subscribers, the old version appears here." /> : (
          <div className="timeline">
            {retired.map((p) => (
              <div key={p.id} className="tl-item">
                <span className="tl-dot" />
                <div>
                  <b><PlanPill plan={p} /> {p.code} · {rs(p.priceMonthly)} / month{p.priceAnnual !== null && ` · ${rs(p.priceAnnual)} / year`}</b>
                  <small>Retired {fmtDate(p.updatedAt)} · {p.subscribers} tenant{p.subscribers === 1 ? "" : "s"} still on it</small>
                  <p><button className="btn ghost sm" type="button" onClick={() => { setHistory(false); setEdit(p); }}><Pencil />Open</button></p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {edit && (
        <PlanModal plan={edit === "new" ? null : edit} nextSort={nextSort} lookups={lookups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      )}
    </>
  );
}
