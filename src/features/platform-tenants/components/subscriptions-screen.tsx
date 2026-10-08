"use client";

import { ArrowUpDown, Banknote, CalendarCheck, CalendarClock, CalendarPlus, Download, History, Repeat, Search, SearchX, TriangleAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Subscription, SubscriptionDetail, SubscriptionList } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { getSubscription, listSubscriptions, runRenewals } from "../api";
import { SubscriptionActionModal, type SubscriptionAction } from "./subscription-actions";
import { Avatar, daysTo, fmt, fmtDate, fmtDateTime, rs, StatusBadge } from "./tenant-ui";

type Chip = "all" | "MONTHLY" | "ANNUAL" | "PAST_DUE" | "TRIAL";
const LIVE = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"];
const MOVES: [string, string, string][] = [["NEW", "New business", "dr"], ["EXPANSION", "Expansion", "dr"], ["REACTIVATION", "Reactivation", "dr"], ["CONTRACTION", "Contraction", "cr"], ["CHURN", "Churn", "neg"]];
const signed = (n: number) => `${n >= 0 ? "+" : "−"} ${rs(Math.abs(n))}`;

/**
 * Admin › Billing › Subscriptions (template 30-entry-admin.html 513–588): KPIs, cycle / past-due / trial chips,
 * the subscriptions table with a row drawer (details, events, actions), "Trials expiring" and "MRR movement".
 */
export function SubscriptionsScreen() {
  const toast = useToast();
  const lookups = useAdminLookups(["SubscriptionStatus", "SubscriptionEventType"]);
  const [data, setData] = useState<SubscriptionList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [open, setOpen] = useState<Subscription | null>(null);
  const [action, setAction] = useState<{ action: SubscriptionAction; sub: Subscription } | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSubscriptions()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load subscriptions" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const plans = [...new Map(items.map((s) => [s.planCode.replace(/_V\d+$/, ""), s.planName])).entries()];
  const list = items.filter((s) =>
    (chip === "all" || (chip === "MONTHLY" || chip === "ANNUAL" ? s.billingCycle === chip : s.status === chip)) &&
    (!plan || s.planCode.replace(/_V\d+$/, "") === plan) &&
    (!q || `${s.tenantName} ${s.tenantCode}`.toLowerCase().includes(q.toLowerCase())));
  const live = items.filter((s) => LIVE.includes(s.status));
  const paying = live.filter((s) => s.status !== "TRIAL");
  const k = data?.kpis;
  const stake = live.filter((s) => { const d = daysTo(s.nextRenewalOn); return d !== null && d >= 0 && d <= 30; }).reduce((a, s) => a + s.amount, 0);
  const pastDueAmount = live.filter((s) => s.status === "PAST_DUE").reduce((a, s) => a + s.amount, 0);
  const net = (data?.movement ?? []).reduce((a, m) => a + m.amount, 0);
  const count = (c: Chip) => (c === "all" ? items.length : items.filter((s) => (c === "MONTHLY" || c === "ANNUAL" ? s.billingCycle === c : s.status === c)).length);

  const exportCsv = () => {
    const head = ["Company", "Code", "Plan", "Cycle", "Amount", "MRR", "Seats", "Next renewal", "Trial ends", "Payment method", "Status"];
    const rows = list.map((s) => [s.tenantName, s.tenantCode, s.planName, s.billingCycle, s.amount, s.mrrAmount, s.seats, s.nextRenewalOn, s.trialEndsOn, s.paymentMethod, s.status]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `subscriptions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${list.length} subscriptions exported`, { tone: "good" });
  };
  const run = async () => {
    setRunning(true);
    try {
      const r = await runRenewals();
      toast(`Renewals run · ${r.renewed} renewed, ${r.converted} trials converted, ${r.expired} expired`, { tone: "good" });
      setConfirmRun(false); reload();
    } catch (e) { toast(adminErrorMessage(e, "Could not run renewals"), { tone: "danger" }); }
    finally { setRunning(false); }
  };

  return (
    <>
      <PageHead eyebrow="Billing / Subscriptions" title="Subscriptions" description="Billing cycles, renewals and payment methods for every tenant."
        actions={<>
          <button type="button" className="btn secondary" disabled={!list.length} onClick={exportCsv}><Download />Export</button>
          <button type="button" className="btn primary" disabled={!data} onClick={() => setConfirmRun(true)}><Repeat />Run renewals</button>
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>MRR</span><span className="icon-well"><Banknote /></span></div><strong>{k ? rs(k.mrr) : "—"}</strong><small className={net > 0 ? "up" : net < 0 ? "down" : undefined}>{data ? `${net >= 0 ? "▲" : "▼"} ${rs(Math.abs(net))} net new (30 d)` : "Monthly recurring revenue"}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Annual contracts</span><span className="icon-well"><CalendarCheck /></span></div><strong>{k ? (paying.length ? `${Math.round((k.annualContracts / paying.length) * 100)}%` : "0%") : "—"}</strong><small>{k ? `${k.annualContracts} of ${paying.length} paying tenants` : "Share of paying tenants"}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Renewals in 30 days</span><span className="icon-well"><CalendarClock /></span></div><strong>{k ? fmt(k.renewals30d) : "—"}</strong><small>{k ? `${rs(stake)} at stake` : "Next renewal within 30 days"}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Past due</span><span className="icon-well"><TriangleAlert /></span></div><strong>{k ? rs(pastDueAmount) : "—"}</strong><small className={k?.pastDue ? "down" : undefined}>{k ? `${k.pastDue} subscription${k.pastDue === 1 ? "" : "s"}` : "Overdue subscriptions"}</small></div>
      </div>

      <div className="split">
        <div>
          <div className="panel flush">
            <div className="panel-head"><div><h3>Active subscriptions</h3><p>{data ? `${live.length} live · ${items.length} in all · monthly and annual cycles` : "Loading…"}</p></div></div>
            <div className="toolbar">
              <label className={cn("search-field", q && "has-val")}><Search /><input value={q} placeholder="Search tenant…" onChange={(e) => setQ(e.target.value)} /></label>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan"><option value="">All plans</option>{plans.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
              <div className="chips">
                {([["all", "All"], ["MONTHLY", "Monthly"], ["ANNUAL", "Annual"], ["PAST_DUE", "Past due"], ["TRIAL", "Trials"]] as const).map(([c, l]) => (
                  <button key={c} type="button" className={chip === c ? "active" : undefined} onClick={() => setChip(c)}>{l}{(c === "PAST_DUE" || c === "TRIAL") && data ? <> <i>{count(c)}</i></> : null}</button>
                ))}
              </div>
            </div>
            {error ? <div style={{ padding: 16 }}><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div> : (
              <>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Tenant</th><th>Plan</th><th>Cycle</th><th className="num">Amount (Rs)</th><th>Next renewal</th><th>Payment method</th><th>Status</th></tr></thead>
                    <tbody>
                      {!data ? Array.from({ length: 4 }, (_, i) => <tr key={i}>{Array.from({ length: 7 }, (_, j) => <td key={j}><Skeleton style={{ height: 10, width: "70%" }} /></td>)}</tr>) :
                        list.map((s) => (
                          <tr key={s.id} style={{ cursor: "pointer" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setOpen(s); }}>
                            <td><Link className="link" href={`/admin/tenants/${s.tenantId}`}>{s.tenantName}</Link><small>{s.tenantCode.toUpperCase()}</small></td>
                            <td>{s.planName}</td>
                            <td>{s.billingCycle === "ANNUAL" ? "Annual" : "Monthly"}</td>
                            <td className="num">{fmt(s.amount)}</td>
                            <td>{s.status === "TRIAL" ? <>{fmtDate(s.trialEndsOn)}<small className="ap-warn-t">Trial ends</small></> : fmtDate(s.nextRenewalOn)}</td>
                            <td>{s.paymentMethod ?? <span className="muted">Pending setup</span>}</td>
                            <td><StatusBadge lookups={lookups} type="SubscriptionStatus" code={s.status} />{s.cancelAtPeriodEnd && <small className="ap-warn-t">Cancels {fmtDate(s.currentPeriodEnd)}</small>}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {data && list.length === 0 && (items.length === 0
                  ? <EmptyState icon={<Repeat />} title="No subscriptions yet" description="Onboarding a tenant starts its subscription; existing companies get one from Tenant 360 › Start subscription." action={<Link className="btn primary sm" href="/admin/tenants">Open tenants</Link>} />
                  : <EmptyState icon={<SearchX />} tone="blue" title="No subscriptions match" description="Try another chip or clear the search." action={<button type="button" className="btn secondary sm" onClick={() => { setQ(""); setPlan(""); setChip("all"); }}>Reset filters</button>} />)}
                {data && list.length > 0 && <div className="table-foot"><span>Showing {list.length} of {items.length}</span><span>MRR shown <b className="tnum">{rs(list.filter((s) => LIVE.includes(s.status) && s.status !== "TRIAL").reduce((a, s) => a + s.mrrAmount, 0))}</b></span></div>}
              </>
            )}
          </div>
        </div>
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Trials expiring</h3><p>Next 14 days</p></div>{data && <span className="badge warn">{data.trialsExpiring.filter((s) => (daysTo(s.trialEndsOn) ?? 99) <= 7).length} this week</span>}</div>
            {!data ? <Skeleton style={{ height: 100 }} /> : data.trialsExpiring.length === 0 ? <p className="muted small">No trials end in the next 14 days.</p> : (
              <div className="list">
                {data.trialsExpiring.map((s) => {
                  const d = daysTo(s.trialEndsOn) ?? 0;
                  return (
                    <div key={s.id} className="list-item" style={{ cursor: "pointer" }} onClick={() => setOpen(s)}>
                      <Avatar name={s.tenantName} /><div><b>{s.tenantName}</b><small>{s.planName} trial{s.seats ? ` · ${s.seats} seats` : ""}</small></div><span className="spacer" />
                      <span className={cn("badge", d <= 3 ? "danger" : d <= 7 ? "warn" : "neutral")}>{d <= 0 ? "Today" : `${d} day${d === 1 ? "" : "s"}`}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" className="btn secondary sm mt" disabled title="Conversion reminders arrive with Communications (Phase 42)">Send conversion reminders</button>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>MRR movement — last 30 days</h3></div></div>
            {!data ? <Skeleton style={{ height: 100 }} /> : (
              <div className="dl">
                {MOVES.map(([m, l, cls]) => { const row = data.movement.find((x) => x.movement === m); return <div key={m}><span>{l}{row ? ` (${row.count})` : ""}</span><b className={cls}>{signed(row?.amount ?? 0)}</b></div>; })}
                <div><span>Net new MRR</span><b>{signed(net)}</b></div>
              </div>
            )}
          </div>
        </div>
      </div>

      <SubscriptionDrawer sub={open} lookups={lookups} onClose={() => setOpen(null)} onAction={(a, s) => setAction({ action: a, sub: s })} reloadKey={attempt} />
      <SubscriptionActionModal action={action?.action ?? null} sub={action?.sub ?? null} onClose={() => setAction(null)} onDone={(d) => { setAction(null); setOpen(d); reload(); }} />
      <ConfirmDialog open={confirmRun} onClose={() => setConfirmRun(false)} onConfirm={run} busy={running} title="Run renewals now?" confirmLabel="Run renewals">
        Renews every live subscription whose period has ended, converts trials that reached their end date and expires the ones set to cancel. Each change writes a subscription event.
      </ConfirmDialog>
    </>
  );
}

/** Template subscriptions row drawer: details, the event history, actions (change plan, extend trial, renew, cancel). */
function SubscriptionDrawer({ sub, lookups, onClose, onAction, reloadKey }: {
  sub: Subscription | null; lookups: ReturnType<typeof useAdminLookups>; onClose: () => void; onAction: (a: SubscriptionAction, s: SubscriptionDetail) => void; reloadKey: number;
}) {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"events" | "history">("events");
  const [last, setLast] = useState(sub);
  if (sub && sub !== last) { setLast(sub); setDetail(null); setError(null); setView("events"); }
  const s = sub ?? last;
  useEffect(() => {
    if (!sub) return;
    let cancelled = false;
    getSubscription(sub.id).then((d) => !cancelled && setDetail(d)).catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load the subscription"));
    return () => { cancelled = true; };
  }, [sub, reloadKey]);
  const live = s ? LIVE.includes(s.status) : false;
  return (
    <Drawer open={!!sub} onClose={onClose} title={s?.tenantName ?? ""} subtitle={s ? `${s.planName} · ${s.billingCycle === "ANNUAL" ? "Annual" : "Monthly"}` : ""} wide
      foot={s && detail && live ? <>
        <button type="button" className="btn secondary" onClick={() => onAction("plan", detail)}><ArrowUpDown />Change plan</button>
        {detail.status === "TRIAL" && <button type="button" className="btn secondary" onClick={() => onAction("trial", detail)}><CalendarPlus />Extend trial</button>}
        <button type="button" className="btn secondary" onClick={() => onAction("renew", detail)}><Repeat />Renew</button>
        <button type="button" className="btn danger" disabled={detail.cancelAtPeriodEnd} onClick={() => onAction("cancel", detail)}><XCircle />Cancel</button>
      </> : undefined}>
      {s && (
        <>
          <div className="dl">
            <div><span>Company</span><b><Link className="link" href={`/admin/tenants/${s.tenantId}`}>{s.tenantName}</Link> · {s.tenantCode.toUpperCase()}</b></div>
            <div><span>Status</span><b><StatusBadge lookups={lookups} type="SubscriptionStatus" code={s.status} /></b></div>
            <div><span>Amount</span><b>{rs(s.amount)} / {s.billingCycle === "ANNUAL" ? "year" : "month"} · MRR {rs(s.mrrAmount)}</b></div>
            <div><span>Seats</span><b>{s.seats ?? "Unlimited"}</b></div>
            <div><span>Started</span><b>{fmtDate(s.startsOn)}</b></div>
            {s.trialEndsOn && <div><span>Trial ends</span><b>{fmtDate(s.trialEndsOn)}</b></div>}
            <div><span>Current period</span><b>{fmtDate(s.currentPeriodStart)} – {fmtDate(s.currentPeriodEnd)}</b></div>
            <div><span>Next renewal</span><b>{fmtDate(s.nextRenewalOn)}{s.autoRenew ? " · auto-renew" : ""}</b></div>
            <div><span>Payment method</span><b>{s.paymentMethod ?? "Pending setup"}</b></div>
            {s.cancelledAt && <div><span>Cancelled</span><b>{fmtDate(s.cancelledAt)}{s.cancelReason ? ` · ${s.cancelReason}` : ""}</b></div>}
            {s.cancelAtPeriodEnd && !s.cancelledAt && <div><span>Cancellation</span><b>At period end{s.cancelReason ? ` · ${s.cancelReason}` : ""}</b></div>}
          </div>
          <div className="seg ap-mt">
            <button type="button" className={view === "events" ? "active" : undefined} onClick={() => setView("events")}>Events</button>
            <button type="button" className={view === "history" ? "active" : undefined} onClick={() => setView("history")}><History />Row history</button>
          </div>
          <div className="ap-mt">
            {view === "history" ? <AdminHistoryTab table="Subscriptions" id={s.id} reloadKey={reloadKey} /> : error ? <ErrorState message={error} /> : !detail ? <Skeleton style={{ height: 120 }} /> : detail.events.length === 0 ? <p className="muted small">No events yet.</p> : (
              <div className="timeline">
                {detail.events.map((ev) => (
                  <div key={ev.id} className="tl-item">
                    <span className={cn("tl-dot", ev.movement === "CHURN" ? "danger" : ev.movement === "CONTRACTION" ? "warn" : ["NEW", "EXPANSION", "REACTIVATION"].includes(ev.movement) ? "good" : "")} />
                    <div>
                      <b>{labelOf(lookups, "SubscriptionEventType", ev.eventType)}{ev.toPlan && ev.fromPlan !== ev.toPlan ? ` · ${ev.fromPlan ? `${ev.fromPlan} → ` : ""}${ev.toPlan}` : ""}</b>
                      <small>{fmtDate(ev.effectiveOn)} · MRR {fmt(ev.mrrBefore)} → {fmt(ev.mrrAfter)} ({ev.movement.toLowerCase()}){ev.trialDaysAdded ? ` · +${ev.trialDaysAdded} days` : ""} · {ev.staff ?? "system"} · {fmtDateTime(ev.occurredAt)}</small>
                      {ev.note && <p>{ev.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
