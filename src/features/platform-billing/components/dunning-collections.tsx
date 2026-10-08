"use client";

import { AlarmClock, BadgeCheck, Check, ChevronsUp, CircleSlash, Clock, Handshake, History, Mail, PartyPopper, Percent, RefreshCw, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AGE_BUCKETS, DUNNING_ATTEMPT_METHODS, PROMISE_SOURCES, type DunningCaseDetail, type DunningQueueRow, type LookupsResponse } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { labelOf } from "@/features/settings/use-lookups";
import { dunningCaseAction, getDunningCase, getDunningQueue, type CaseAction } from "../api";
import { fmtDate, Logo, LookupBadge, methodLabel, MethodPill, money, rs0, todayPk, useLoad } from "./billing-ui";

const STAGE_TONE: Record<string, string> = { GRACE: "info", READ_ONLY: "warn", SUSPENDED: "danger", COLLECTIONS: "neutral", PROMISE: "violet", RECOVERED: "good" };
const nextLabel = (iso: string | null) => {
  if (!iso) return "Manual only";
  const d = new Date(iso);
  const day = d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10) ? "Today" : d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
  return `${day} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};
const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;

/**
 * Dunning & Collections (template admin/dunning, 9B-admin-plus.js 1004–1200): KPIs, the collections queue by age
 * bucket (attempt dots, next retry, stage, Retry and Promise-to-pay), and the selected case's retry timeline. There is
 * no payment gateway: "Retry" records the result of a manual attempt. Template-style additions on the retry panel:
 * escalate, resolve, write off and the case history. `planFallback` is the active policy's plan (shown with no case).
 */
export function DunningCollections({ lookups, reloadKey, planFallback }: {
  lookups: LookupsResponse; reloadKey: number; planFallback: ReactNode;
}) {
  const { data, error, reload } = useLoad(getDunningQueue, "Could not load the collections queue", [reloadKey]);
  const [bucket, setBucket] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DunningCaseDetail | null>(null);
  const [act, setAct] = useState<{ action: CaseAction; c: DunningCaseDetail | DunningQueueRow } | null>(null);
  const [history, setHistory] = useState(false);
  const [detailKey, setDetailKey] = useState(0);

  const rows = data?.rows ?? [];
  const count = (b: string) => rows.filter((r) => r.ageBucket === b).length;
  const active = bucket ?? AGE_BUCKETS.find((b) => count(b.key) > 0)?.key ?? AGE_BUCKETS[0].key;
  const list = rows.filter((r) => r.ageBucket === active);
  const sel = list.find((r) => r.caseId === selId) ?? list[0] ?? null;
  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    getDunningCase(sel.caseId).then((d) => !cancelled && setDetail(d)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [sel?.caseId, sel?.attemptsCount, sel?.stage, detailKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = detail && sel && detail.caseId === sel.caseId ? detail : null;
  const k = data?.kpis;
  const done = () => { setAct(null); reload(); setDetailKey((n) => n + 1); };

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Recovered this month" icon={<BadgeCheck />} value={k ? rs0(k.recoveredMonthAmount) : "—"} sub={k ? `${k.recoveredMonthCount} case${k.recoveredMonthCount === 1 ? "" : "s"} recovered` : ""} up />
        <Kpi label="Recovery rate" icon={<Percent />} tone="teal" value={k ? (k.recoveryRate30dPct === null ? "—" : `${k.recoveryRate30dPct}%`) : "—"} sub="Recorded retries · 30 days" />
        <Kpi label="In dunning" icon={<AlarmClock />} tone="yellow" value={k ? `${k.inDunningCount} tenant${k.inDunningCount === 1 ? "" : "s"}` : "—"} sub={k ? `${rs0(k.inDunningAmount)} outstanding` : ""} />
        <Kpi label="Churn saved" icon={<ShieldCheck />} tone="violet" value={k ? rs0(k.churnSavedMrr) : "—"} sub="MRR kept by recoveries this month" />
      </div>

      <div className="split ap-dun-split">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Collections queue</h3><p>Click a row to see its retry plan</p></div>
            <div className="panel-actions"><div className="seg ap-buckets">
              {AGE_BUCKETS.map((b, i) => <button key={b.key} type="button" className={active === b.key ? "active" : undefined} onClick={() => setBucket(b.key)}>{b.label} <i className={cn("ap-bcount", i >= 2 && "hot")}>{count(b.key)}</i></button>)}
            </div></div>
          </div>
          {error ? <div style={{ padding: 16 }}><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div> : (
            <div className="table-wrap"><table className="tbl ap-dtbl" data-plain>
              <thead><tr><th>Tenant</th><th className="num">Amount</th><th>Method</th><th>Attempts · next retry</th><th>Stage</th><th /></tr></thead>
              <tbody>
                {!data ? Array.from({ length: 3 }, (_, r) => <tr key={r}>{Array.from({ length: 6 }, (_, c) => <td key={c}><Skeleton style={{ height: 10, width: "70%" }} /></td>)}</tr>) :
                  list.length === 0 ? (
                    <tr><td colSpan={6}><EmptyState icon={<PartyPopper />} title={rows.length ? "Bucket cleared" : "No failed payments"} description={rows.length ? `Nothing overdue in ${AGE_BUCKETS.find((b) => b.key === active)?.label}. Nice work.` : "Companies with overdue invoices appear here after the daily billing run (or Retry all due)."} /></td></tr>
                  ) : list.map((r) => {
                    const promise = r.stage === "PROMISE";
                    return (
                      <tr key={r.caseId} className={r.caseId === sel?.caseId ? "ap-sel" : undefined} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setSelId(r.caseId); }}>
                        <td><div className="cell-user"><Logo name={r.tenantName} /><div><b>{r.tenantName}</b><small>{r.docNo} · {r.daysOverdue} d overdue</small></div></div></td>
                        <td className="num"><b>{money(r.balance)}</b></td>
                        <td><MethodPill method={r.nextRetryMethod ?? r.paymentMethod} /></td>
                        <td><span className="ap-att">{Array.from({ length: Math.max(4, r.attemptsPlanned) }, (_, i) => <i key={i} className={i < r.attemptsCount ? "f" : undefined} />)}<small>{r.attemptsCount}/{Math.max(4, r.attemptsPlanned)}</small></span>
                          <small className={r.nextRetryAt && new Date(r.nextRetryAt) <= new Date() ? "ap-warn-t" : undefined}>{promise ? "Paused · promise" : r.retriesPaused ? "Paused" : nextLabel(r.nextRetryAt) + (r.nextRetryMethod ? ` · ${methodLabel(r.nextRetryMethod)}` : "")}</small></td>
                        <td><span className={`badge ${STAGE_TONE[r.stage] ?? "neutral"} dot`}>{promise && r.promiseDate ? `Promise · ${fmtDate(r.promiseDate).slice(0, 6)}` : labelOf(lookups, "DunningCaseStage", r.stage)}</span></td>
                        <td className="actions"><div className="row ap-nowrap">
                          <button type="button" className="btn secondary sm" onClick={() => setAct({ action: "attempt", c: r })}><RefreshCw />Retry</button>
                          <button type="button" className="icon-btn-sm" title="Promise to pay" aria-label="Promise to pay" onClick={() => setAct({ action: "promise", c: r })}><Handshake /></button>
                        </div></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table></div>
          )}
        </div>
        <div className="panel ap-rt-panel">
          {!sel ? (
            <>
              <div className="panel-head"><div><h3>Retry plan</h3><p>{data?.policy ? `${data.policy.name} · ${String(data.policy.retryHour).padStart(2, "0")}:00 PKT` : "No active policy"}</p></div></div>
              {planFallback}
            </>
          ) : (
            <>
              <div className="panel-head"><div><h3>{sel.tenantName}</h3><p>Rs {money(sel.balance)} · {sel.lastFailureReason ?? `${sel.docNo}, due ${fmtDate(sel.dueOn)}`}</p></div>
                <div className="panel-actions"><button type="button" className="icon-btn-sm" title="Case history" aria-label="Case history" onClick={() => setHistory(true)}><History /></button></div></div>
              <div className="ap-rt">
                {!shown ? <Skeleton style={{ height: 160 }} /> : shown.attempts.length === 0 ? <p className="muted small">The policy has no automatic retries: record a manual attempt with Retry.</p> :
                  shown.attempts.map((a, i) => {
                    const st = a.status === "FAILED" ? "fail" : a.status === "SUCCEEDED" ? "ok" : a.status === "SCHEDULED" ? "next" : "";
                    const first = shown.attempts.find((x) => x.status === "SCHEDULED")?.id === a.id;
                    return (
                      <div key={a.id} className={cn("ap-rt-step", st)} style={{ ["--i" as string]: i }}>
                        <span className="ap-rt-dot">{st === "fail" ? <X /> : st === "ok" ? <Check /> : a.status === "SCHEDULED" ? <Clock /> : <CircleSlash />}</span>
                        <div><b>Day {a.planDay} · {a.label}</b>
                          <small><Zap />{methodLabel(a.method)}{a.status === "FAILED" ? ` · declined${a.failureReason ? ` (${a.failureReason})` : ""}` : a.status === "SUCCEEDED" ? " · paid" : a.status === "SCHEDULED" ? (shown.retriesPaused ? " · paused" : first ? " · next up" : " · scheduled") : ` · ${labelOf(lookups, "DunningAttemptStatus", a.status).toLowerCase()}`}</small></div>
                      </div>
                    );
                  })}
              </div>
              <div className="ap-insight"><Sparkles /><div><b>{sel.stage === "PROMISE" ? "Promise to pay" : "Smart retry"}</b>
                <p>{sel.stage === "PROMISE" ? `${sel.tenantName} promised to pay${sel.promiseAmount ? ` Rs ${money(sel.promiseAmount)}` : ""} by ${fmtDate(sel.promiseDate)}. Retries ${sel.retriesPaused ? "are paused" : "continue"} until then.`
                  : data?.policy ? `Retries land at ${String(data.policy.retryHour).padStart(2, "0")}:00 on their day${data.policy.salaryRetryDays.length ? `, favouring salary-credit days (${data.policy.salaryRetryDays.map(ordinal).join(" and ")})` : ""}. No gateway is connected yet: record each attempt's result with Retry.` : "Record each attempt's result with Retry."}</p></div></div>
              <div className="row ap-mt" style={{ gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn secondary sm" disabled={sel.stage === "COLLECTIONS"} onClick={() => setAct({ action: "escalate", c: sel })}><ChevronsUp />Escalate</button>
                <button type="button" className="btn ghost sm" onClick={() => setAct({ action: "resolve", c: sel })}><Check />Resolve</button>
                <button type="button" className="btn ghost sm" onClick={() => setAct({ action: "write-off", c: sel })}><CircleSlash />Write off</button>
                <Link className="btn ghost sm" href={`/admin/tenants/${sel.tenantId}`}>Tenant 360</Link>
              </div>
            </>
          )}
        </div>
      </div>

      <CaseActionModal act={act} lookups={lookups} onClose={() => setAct(null)} onDone={done} />
      <Modal open={history && !!sel} onClose={() => setHistory(false)} title={`${sel?.tenantName ?? ""} · dunning case history`} subtitle={sel?.docNo ?? ""} wide>
        {sel && <AdminHistoryTab table="DunningCases" id={sel.caseId} reloadKey={detailKey} />}
      </Modal>
    </>
  );
}

function Kpi({ label, icon, tone, value, sub, up }: { label: string; icon: ReactNode; tone?: string; value: string; sub: string; up?: boolean }) {
  return (
    <div className={cn("kpi", tone)}>
      <div className="kpi-top"><span>{label}</span><span className="icon-well">{icon}</span></div>
      <strong>{value}</strong><small className={up ? "up" : undefined}>{sub}</small>
    </div>
  );
}

const TITLES: Record<CaseAction, string> = { attempt: "Record retry", promise: "Promise to pay", resolve: "Resolve case", "write-off": "Write off", escalate: "Escalate now?" };

/** The case actions (Retry, Promise to pay, Resolve, Write off, Escalate). The case is re-read first for its row version. */
export function CaseActionModal({ act, lookups, onClose, onDone }: {
  act: { action: CaseAction; c: DunningCaseDetail | DunningQueueRow } | null; lookups: LookupsResponse; onClose: () => void; onDone: (d: DunningCaseDetail) => void;
}) {
  const toast = useToast();
  const [result, setResult] = useState<"SUCCEEDED" | "FAILED">("FAILED");
  const [method, setMethod] = useState<string>("CARD");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState("");
  const [source, setSource] = useState<string>("PHONE");
  const [pause, setPause] = useState(true);
  const [lift, setLift] = useState(false);
  const [remind, setRemind] = useState(true);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const key = act ? `${act.action}:${act.c.caseId}` : null;
  const [shown, setShown] = useState<string | null>(null);
  if (key !== shown) {
    setShown(key);
    if (act) {
      const c = act.c;
      setResult("FAILED"); setMethod(c.nextRetryMethod ?? (DUNNING_ATTEMPT_METHODS as readonly string[]).find((m) => m === c.paymentMethod) ?? "CARD");
      setAmount(String(c.balance)); setReason(""); setRef(""); setDate(c.promiseDate ?? todayPk()); setSource("PHONE"); setPause(true);
      setLift(["READ_ONLY", "SUSPENDED"].includes(c.stage)); setRemind(true); setErrs({});
    }
  }
  if (!act) return null;
  const c = act.c;
  const submit = async () => {
    setBusy(true);
    setErrs({});
    try {
      const fresh = await getDunningCase(c.caseId);
      const rv = fresh.rowVersion;
      const body = act.action === "attempt" ? { rowVersion: rv, result, method, amount: result === "SUCCEEDED" ? amount : null, failureReason: result === "FAILED" ? reason : null, paymentRef: ref || null }
        : act.action === "promise" ? { rowVersion: rv, promiseDate: date, promiseAmount: amount || null, promiseSource: source, promiseNote: reason || null, pauseRetries: pause, liftReadOnly: lift, remindOwner: remind }
          : act.action === "escalate" ? { rowVersion: rv } : { rowVersion: rv, reason };
      const d = await dunningCaseAction(c.caseId, act.action, body);
      toast(act.action === "attempt" ? (result === "SUCCEEDED" ? `${c.tenantName} paid Rs ${money(Number(amount))}${d.stage === "RECOVERED" ? " · access restored" : ""}` : `${c.tenantName}: declined · ${reason.toLowerCase()}`)
        : act.action === "promise" ? `Promise logged: ${c.tenantName} will pay on ${fmtDate(date)}`
          : act.action === "escalate" ? `${c.tenantName} moved to ${labelOf(lookups, "DunningCaseStage", d.stage).toLowerCase()}`
            : `Case ${act.action === "resolve" ? "resolved" : "written off"} · ${c.tenantName}`, { tone: act.action === "attempt" && result === "FAILED" ? "danger" : act.action === "escalate" || act.action === "write-off" ? "warn" : "good" });
      onDone(d);
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not update the case"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const icon = act.action === "promise" ? <Handshake /> : act.action === "attempt" ? <RefreshCw /> : act.action === "escalate" ? <ChevronsUp /> : act.action === "resolve" ? <Check /> : <CircleSlash />;
  return (
    <Modal open onClose={onClose} title={TITLES[act.action]} subtitle={`${c.tenantName} · ${c.docNo ?? ""} · Rs ${money(c.balance)}`}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
        <button type="button" className={cn("btn", act.action === "write-off" ? "danger solid" : "primary")} disabled={busy} onClick={submit}>{icon}{busy ? "Saving…" : act.action === "promise" ? "Log promise" : act.action === "attempt" ? "Record attempt" : act.action === "escalate" ? "Escalate" : TITLES[act.action]}</button></>}>
      {act.action === "attempt" && (
        <>
          <div className="seg"><button type="button" className={result === "FAILED" ? "active" : undefined} onClick={() => setResult("FAILED")}>Declined</button><button type="button" className={result === "SUCCEEDED" ? "active" : undefined} onClick={() => setResult("SUCCEEDED")}>Paid</button></div>
          <FormGrid>
            <Field label="Charged via" error={errs.method}><select value={method} onChange={(e) => setMethod(e.target.value)}>{DUNNING_ATTEMPT_METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}</select></Field>
            {result === "SUCCEEDED"
              ? <Field label="Amount collected (Rs)" error={errs.amount}><input className="num" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              : <Field label="Decline reason" required error={errs.failureReason}><input value={reason} maxLength={200} placeholder="e.g. Insufficient wallet balance" onChange={(e) => setReason(e.target.value)} /></Field>}
            <Field label="Reference" error={errs.paymentRef} full><input value={ref} maxLength={80} placeholder="Gateway / bank reference" onChange={(e) => setRef(e.target.value)} /></Field>
          </FormGrid>
        </>
      )}
      {act.action === "promise" && (
        <>
          <div className="form-grid">
            <Field label="Promised date" required error={errs.promiseDate}><input type="date" value={date} min={todayPk()} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Amount (Rs)" error={errs.promiseAmount}><input className="num" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Logged from" full error={errs.promiseSource}><select value={source} onChange={(e) => setSource(e.target.value)}>{PROMISE_SOURCES.map((s) => <option key={s} value={s}>{labelOf(lookups, "PromiseSource", s)}</option>)}</select></Field>
            <Field label="Note" full error={errs.promiseNote}><textarea rows={2} value={reason} maxLength={300} placeholder="e.g. Cheque from HBL to be deposited Monday" onChange={(e) => setReason(e.target.value)} /></Field>
          </div>
          <div className="ap-switches">
            <Switch label="Pause automatic retries until the promised date" checked={pause} onChange={(e) => setPause(e.target.checked)} />
            <Switch label="Lift read-only mode meanwhile" checked={lift} onChange={(e) => setLift(e.target.checked)} />
            <Switch label={<>Remind owner one day before (SMS) <Mail style={{ width: 13, height: 13, verticalAlign: "-2px" }} /></>} checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          </div>
          <p className="small muted ap-mt">Reminders are recorded on the case; SMS delivery arrives with messaging (Phase 29).</p>
        </>
      )}
      {act.action === "escalate" && <p>Moves the case one stage on now ({labelOf(lookups, "DunningCaseStage", c.stage)} → next) and sets the company&apos;s access to match. A suspended company is signed out everywhere.</p>}
      {(act.action === "resolve" || act.action === "write-off") && (
        <>
          <p className="small">{act.action === "resolve" ? "Closes the case without collecting (settled outside Accountex, disputed or waived). The invoice stays open and the company's access is restored." : "Writes the balance off: the invoice becomes uncollectible and the company's access is restored. Archive or churn the company by hand if needed."}</p>
          <FormGrid cols={1}><Field label="Reason" required error={errs.reason} hint="Saved as a note on the company"><textarea rows={2} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field></FormGrid>
        </>
      )}
      {act.action !== "escalate" && <LookupBadge lookups={lookups} type="DunningCaseStage" code={c.stage} />}
    </Modal>
  );
}
