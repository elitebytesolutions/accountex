"use client";

import { ArrowRight, CalendarPlus, Info, Repeat, Rocket, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { Subscription, SubscriptionDetail, SubscriptionPlan } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { listPlans } from "@/features/platform-catalogue/api";
import { activePlans } from "@/features/platform-catalogue/components/catalogue-ui";
import { cancelSubscription, changeSubscriptionPlan, createSubscription, extendSubscriptionTrial, renewSubscription } from "../api";
import { fmtDate, rs } from "./tenant-ui";

export type SubscriptionAction = "plan" | "cancel" | "renew" | "trial" | "start";

/** Monthly equivalent of a plan price (annual / 12), as MRR is counted. */
export const monthlyOf = (p: Pick<SubscriptionPlan, "priceMonthly" | "priceAnnual">, cycle: string) =>
  cycle === "ANNUAL" && p.priceAnnual !== null ? Math.round((p.priceAnnual / 12) * 100) / 100 : p.priceMonthly;
const priceOf = (p: SubscriptionPlan, cycle: string) => (p.isCustomPrice ? "Custom pricing" : cycle === "ANNUAL" && p.priceAnnual !== null ? `${rs(p.priceAnnual)} / year` : `${rs(p.priceMonthly)} / mo`);
const err = (e: Record<string, string>, k: string) => (e[k] ? <small className="hint text-danger" role="alert">{e[k]}</small> : null);

/**
 * The subscription modals (template 9B changePlan / extendTrial, 30-entry-admin subscriptions drawer actions):
 * change plan, cancel, renew, extend trial, and "Start subscription" for a company without one. Each call writes a
 * SubscriptionEvent with the MRR movement on the server.
 */
export function SubscriptionActionModal({ action, sub, tenant, onClose, onDone }: {
  action: SubscriptionAction | null;
  sub: Subscription | null;
  /** For "start": the company the subscription is for. */
  tenant?: { id: string; name: string } | null;
  onClose: () => void;
  onDone: (s: SubscriptionDetail) => void;
}) {
  const toast = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [f, setF] = useState({ planId: "", billingCycle: "MONTHLY", seats: "", note: "", reason: "", atPeriodEnd: true, days: 7 as 7 | 14 | 30, startTrial: false, paymentMethod: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Reset the form whenever a modal opens (adjusted during render, no effect).
  const key = action ? `${action}:${sub?.id ?? tenant?.id ?? ""}` : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (key) {
      setErrors({});
      setF({ planId: sub?.planId ?? "", billingCycle: sub?.billingCycle ?? "MONTHLY", seats: sub?.seats ? String(sub.seats) : "", note: "", reason: "", atPeriodEnd: true, days: 7, startTrial: false, paymentMethod: sub?.paymentMethod ?? "" });
    }
  }

  const needPlans = action === "plan" || action === "start";
  useEffect(() => {
    if (!needPlans || plans) return;
    let cancelled = false;
    listPlans().then((p) => !cancelled && setPlans(activePlans(p))).catch(() => !cancelled && setPlans([]));
    return () => { cancelled = true; };
  }, [needPlans, plans]);

  const run = async () => {
    setBusy(true);
    try {
      let done: SubscriptionDetail;
      const seats = f.seats ? Number(f.seats) : undefined;
      if (action === "start") done = await createSubscription({ tenantId: tenant?.id, planId: f.planId, billingCycle: f.billingCycle, seats, startTrial: f.startTrial, paymentMethod: f.paymentMethod || null });
      else if (!sub) return;
      else if (action === "plan") done = await changeSubscriptionPlan(sub.id, { rowVersion: sub.rowVersion, planId: f.planId, billingCycle: f.billingCycle, seats, note: f.note || undefined });
      else if (action === "cancel") done = await cancelSubscription(sub.id, { rowVersion: sub.rowVersion, reason: f.reason, atPeriodEnd: f.atPeriodEnd });
      else if (action === "renew") done = await renewSubscription(sub.id, { rowVersion: sub.rowVersion, note: f.note || undefined });
      else done = await extendSubscriptionTrial(sub.id, sub.rowVersion, f.days);
      toast(
        action === "start" ? `Subscription started on ${done.planName}` : action === "plan" ? `Plan changed to ${done.planName} · ${done.billingCycle.toLowerCase()}` : action === "cancel" ? (f.atPeriodEnd ? `Cancels on ${fmtDate(done.currentPeriodEnd)}` : "Subscription cancelled") : action === "renew" ? `Renewed to ${fmtDate(done.currentPeriodEnd)}` : `Trial extended by ${f.days} days · ends ${fmtDate(done.trialEndsOn)}`,
        { tone: action === "cancel" ? "warn" : "good" },
      );
      onDone(done);
    } catch (e) {
      setErrors(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not update the subscription"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const plan = plans?.find((p) => p.id === f.planId);
  const before = sub?.mrrAmount ?? 0;
  const after = plan ? monthlyOf(plan, f.billingCycle) : null;
  const titles: Record<SubscriptionAction, [string, string]> = {
    start: ["Start subscription", tenant ? `${tenant.name} · no live subscription` : ""],
    plan: ["Change plan", sub ? `${sub.tenantName} · currently ${sub.planName} ${sub.billingCycle.toLowerCase()}` : ""],
    cancel: ["Cancel subscription", sub ? `${sub.tenantName} · ${sub.planName}` : ""],
    renew: ["Renew subscription", sub ? `${sub.tenantName} · period ends ${fmtDate(sub.currentPeriodEnd)}` : ""],
    trial: ["Extend trial", sub ? `${sub.tenantName} · trial ends ${fmtDate(sub.trialEndsOn)}` : ""],
  };
  const [title, subtitle] = action ? titles[action] : ["", ""];
  const okLabel = action === "start" ? <><Rocket />Start subscription</> : action === "plan" ? <>Confirm change</> : action === "cancel" ? <><XCircle />Cancel subscription</> : action === "renew" ? <><Repeat />Renew</> : <><CalendarPlus />Extend</>;

  return (
    <Modal open={!!action} onClose={onClose} title={title} subtitle={subtitle} wide={needPlans}
      foot={<>
        <button type="button" className="btn secondary" onClick={onClose}>Close</button>
        <button type="button" className={cn("btn", action === "cancel" ? "danger solid" : "primary")} disabled={busy || (needPlans && !f.planId)} onClick={run}>{busy ? "Working…" : okLabel}</button>
      </>}>
      {needPlans && (
        <>
          {!plans ? <Skeleton style={{ height: 120 }} /> : plans.length === 0 ? <p className="muted">No active plans. Create one in Plans &amp; Pricing first.</p> : (
            <div className="radio-cards ap-plans">
              {plans.map((p) => (
                <label key={p.id} className="radio-card">
                  <input type="radio" name="plan" value={p.id} checked={f.planId === p.id} onChange={() => setF({ ...f, planId: p.id })} />
                  <div><b>{p.name}{sub?.planId === p.id ? " · current" : ""}</b><small>{priceOf(p, f.billingCycle)} · {p.userSeats ? `up to ${p.userSeats}` : "unlimited"} users</small></div>
                </label>
              ))}
            </div>
          )}
          {err(errors, "planId")}
          <div className="form-grid ap-mt">
            <label><span>Billing cycle</span><select value={f.billingCycle} onChange={(e) => setF({ ...f, billingCycle: e.target.value })}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></label>
            <label><span>Seats</span><input type="number" min={1} value={f.seats} placeholder={plan?.userSeats ? `Plan default ${plan.userSeats}` : "Plan default"} onChange={(e) => setF({ ...f, seats: e.target.value })} aria-invalid={!!errors.seats} />{err(errors, "seats")}</label>
            {action === "start" ? (
              <>
                <label><span>Payment method</span><input value={f.paymentMethod} maxLength={40} placeholder="e.g. Meezan direct debit" onChange={(e) => setF({ ...f, paymentMethod: e.target.value })} /></label>
                <label className="switch" style={{ alignSelf: "end" }}><input type="checkbox" checked={f.startTrial} onChange={(e) => setF({ ...f, startTrial: e.target.checked })} /><i /><span>Start with the plan&apos;s trial{plan ? ` (${plan.trialDays} days)` : ""}</span></label>
              </>
            ) : (
              <label className="full"><span>Internal note</span><input value={f.note} maxLength={300} placeholder="e.g. Upgrade agreed with the CFO" onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
            )}
          </div>
          {after !== null && (
            <div className="ap-prorate ap-mt">
              <div><small>MRR now</small><b>{rs(before)}</b></div>
              <div><small>MRR after</small><b>{plan?.isCustomPrice ? "Custom" : rs(f.startTrial ? 0 : after)}</b></div>
              <div><small>Movement</small><b className={after > before ? "ap-good-t" : after < before ? "ap-danger-t" : undefined}>{after === before ? "No change" : `${after > before ? "+" : "−"} ${rs(Math.abs(after - before))}`}</b></div>
            </div>
          )}
          <div className="banner info ap-mt"><Info /><div><b>MRR is the monthly equivalent</b><p>Annual prices count as one twelfth a month; a trial earns no MRR until it converts. Every change is written to the subscription&apos;s event history.</p></div></div>
        </>
      )}
      {action === "cancel" && (
        <div className="form-grid c1">
          <label><span>Reason *</span><textarea rows={3} value={f.reason} maxLength={300} placeholder="Why is the subscription ending?" onChange={(e) => setF({ ...f, reason: e.target.value })} aria-invalid={!!errors.reason} />{err(errors, "reason")}</label>
          <label className="switch"><input type="checkbox" checked={f.atPeriodEnd} onChange={(e) => setF({ ...f, atPeriodEnd: e.target.checked })} /><i /><span>Cancel at period end{sub ? ` (${fmtDate(sub.currentPeriodEnd)})` : ""} instead of now</span></label>
        </div>
      )}
      {action === "renew" && (
        <div className="form-grid c1">
          <p className="muted">Starts the next {sub?.billingCycle === "ANNUAL" ? "year" : "month"} now: the current period end moves forward one cycle.</p>
          <label><span>Internal note</span><input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
      )}
      {action === "trial" && (
        <>
          <div className="ap-lbl">Extend by</div>
          <div className="seg ap-mb">
            {([7, 14, 30] as const).map((d) => <button key={d} type="button" className={f.days === d ? "active" : undefined} onClick={() => setF({ ...f, days: d })}>{d} days</button>)}
          </div>
          {sub?.trialEndsOn && <p className="muted small">Trial ends {fmtDate(sub.trialEndsOn)} <ArrowRight style={{ width: 12, height: 12, verticalAlign: "middle" }} /> {fmtDate(new Date(Date.parse(`${sub.trialEndsOn.slice(0, 10)}T00:00:00Z`) + f.days * 864e5).toISOString())}</p>}
          {err(errors, "days")}
        </>
      )}
    </Modal>
  );
}
