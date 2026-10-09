"use client";

import { CalendarCheck, CalendarPlus, Check as CheckIcon, Lock, LockOpen, RotateCcw, TriangleAlert, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PERIOD_MODULES, type FiscalPeriod, type FiscalYear, type PeriodModule, type ReopenRequest } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { IconWell, PageHead, Panel } from "@/components/ui/page";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { listApprovers, listUsers } from "@/features/access/api";
import { createFiscalYear, listFiscalYears, periodAction } from "../api";
import { decideReopen, listReopenRequests, recloseReopen, requestReopen } from "../period-close-api";
import { dateLabel, isoDay, Money } from "./finance-ui";

const MODULE_NAMES: Record<PeriodModule, string> = { GL: "General ledger", AR: "Receivables", AP: "Payables", INV: "Inventory", PAY: "Payroll" };
const STATUS: Record<string, { tone: Tone; label: string }> = { OPEN: { tone: "good", label: "Open" }, CLOSED: { tone: "neutral", label: "Closed" }, LOCKED: { tone: "violet", label: "Locked" } };
type Filter = "all" | "OPEN" | "CLOSED" | "LOCKED";
const REQ: Record<string, { tone: Tone; label: string }> = {
  PENDING: { tone: "warn", label: "Pending" }, APPROVED: { tone: "good", label: "Approved" }, REJECTED: { tone: "danger", label: "Rejected" },
  RECLOSED: { tone: "neutral", label: "Re-closed" }, CANCELLED: { tone: "neutral", label: "Withdrawn" },
};
/** Plain messages for the reopen error codes. */
const REOPEN_ERRORS: Record<string, string> = {
  REOPEN_SELF_APPROVAL: "You can’t decide your own reopen request — another approver must.",
  PERIOD_LOCKED_NEEDS_MFA: "A locked period needs multi-factor verification to reopen, which comes in a later phase.",
  REOPEN_PERIOD_NOT_CLOSED: "Only a closed period (or a closed module) can be reopened.",
  REOPEN_NOT_PENDING: "This request has already been decided.",
  REOPEN_NEEDS_REQUEST: "Reopening a closed period needs an approved reopen request.",
};
type ReopenForm = { p: FiscalPeriod; moduleCode: PeriodModule | ""; until: string; reason: string; approverUserId: string; autoReclose: boolean };
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

/** The year whose periods the table shows gets the primary outline (the template has a single highlighted year). */
const picked = (on: boolean): CSSProperties => ({ cursor: "pointer", ...(on ? { borderColor: "var(--primary)", boxShadow: "var(--ring)" } : {}) });
const closedModules = (p: FiscalPeriod) => PERIOD_MODULES.filter((m) => p.modules[m] && p.modules[m] !== "OPEN");
function modulesText(p: FiscalPeriod) {
  if (p.status === "LOCKED") return "All locked";
  const c = closedModules(p);
  if (!c.length) return "All open";
  if (c.length === PERIOD_MODULES.length) return "All closed";
  return `${c.join(", ")} closed`;
}
const nextYearStart = (years: FiscalYear[]) => {
  const last = [...years].sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
  if (!last) return null;
  const d = new Date(`${last.endDate}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d;
};

/** Template app/periods (42-acc-reports.html): fiscal year cards and the period table with close / lock / reopen. */
export function PeriodsScreen({ canManage, canRequest, userId }: { canManage: boolean; canRequest: boolean; userId: string }) {
  const toast = useToast();
  const [years, setYears] = useState<FiscalYear[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [yearId, setYearId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [p13, setP13] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<{ p: FiscalPeriod; modules: PeriodModule[] } | null>(null);
  const [reopening, setReopening] = useState<ReopenForm | null>(null);
  const [requests, setRequests] = useState<ReopenRequest[] | null>(null);
  const [approvers, setApprovers] = useState<{ id: string; name: string }[] | null>(null);
  const [deciding, setDeciding] = useState<{ r: ReopenRequest; action: "approve" | "reject" | "cancel" } | null>(null);
  const [comment, setComment] = useState("");
  const [locking, setLocking] = useState<FiscalPeriod | null>(null);
  const [history, setHistory] = useState<FiscalPeriod | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFiscalYears()
      .then((y) => {
        if (cancelled) return;
        setYears(y);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load fiscal years" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  useEffect(() => {
    let cancelled = false;
    listReopenRequests().then((r) => !cancelled && setRequests(r)).catch(() => !cancelled && setRequests([]));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const reload = () => setAttempt((n) => n + 1);

  /** Approver choices: the user list (or the workflow approver list); the requester can't approve their own request. */
  const openReopen = (p: FiscalPeriod) => {
    const closed = closedModules(p);
    setReopening({ p, moduleCode: closed.length === PERIOD_MODULES.length ? "" : closed[0] ?? "", until: plusDays(7), reason: "", approverUserId: "", autoReclose: true });
    if (approvers) return;
    listUsers()
      .then((u) => setApprovers(u.filter((x) => x.status === "ACTIVE" && x.id !== userId).map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => listApprovers().then((a) => setApprovers(a.users.filter((x) => x.id !== userId))).catch(() => setApprovers([])));
  };
  const reopenError = (e: unknown, fallback: string) => (e instanceof ApiError ? REOPEN_ERRORS[e.code] ?? e.message : fallback);

  const today = isoDay(new Date());
  const sorted = [...(years ?? [])].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const current = sorted.find((y) => y.startDate <= today && y.endDate >= today) ?? sorted[sorted.length - 1] ?? null;
  const year = sorted.find((y) => y.id === yearId) ?? current;
  const prev = current ? sorted.filter((y) => y.endDate < current.startDate).pop() : undefined;
  const next = current ? sorted.find((y) => y.startDate > current.endDate) : undefined;
  const newStart = years ? nextYearStart(years) : null;

  const run = async (label: string, fn: () => Promise<unknown>, done: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast(label, { tone: "good" });
      done();
      reload();
    } catch (e) {
      toast(reopenError(e, "Could not update the period"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    run(`FY created from ${dateLabel(newStart ? isoDay(newStart) : null)}`, () => createFiscalYear({ hasAdjustmentPeriod: p13 }), () => undefined);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const periods = year?.periods ?? [];
  const count = (s: Filter) => (s === "all" ? periods.length : periods.filter((p) => p.status === s).length);
  const shown = periods.filter((p) => filter === "all" || p.status === filter);
  const done = current ? current.periods.filter((p) => p.status !== "OPEN").length : 0;
  const pct = current?.periods.length ? Math.round((done / current.periods.length) * 100) : 0;
  const curPeriod = current?.periods.find((p) => p.startDate <= today && p.endDate >= today);
  const nextClose = current?.periods.find((p) => p.status === "OPEN" && p.endDate < today);

  return (
    <>
      <PageHead
        eyebrow="Period Close / Fiscal Periods"
        title="Fiscal Years & Periods"
        description="Control which months accept postings. Closed periods block new entries and reopen only on an approved request; locked periods can’t be reopened yet."
        actions={
          <>
            <Link className="btn secondary" href="/periods/close"><Lock />Year-end close</Link>
            {canManage && <Button icon={<CalendarPlus />} onClick={create} disabled={busy || !years}>New fiscal year</Button>}
          </>
        }
      />

      <div className="grid-3 mb">
        {!years && [0, 1, 2].map((i) => <div key={i} className="panel"><Skeleton style={{ height: 110 }} /></div>)}
        {years && prev && <YearCard y={prev} icon={<Lock />} onPick={() => setYearId(prev.id)} active={year?.id === prev.id} />}
        {years && current && (
          <div className="panel" onClick={() => setYearId(current.id)} style={picked(year?.id === current.id)}>
            <div className="row"><IconWell tone="teal"><CalendarCheck /></IconWell><div><h3 style={{ margin: 0 }}>{current.code}</h3><small className="muted">{dateLabel(current.startDate)} – {dateLabel(current.endDate)}</small></div><span className="spacer" /><Badge tone="good" dot>{current.startDate <= today ? "Open · Current" : "Open"}</Badge></div>
            <div className="mt"><div className="row small"><span>{done} of {current.periods.length} periods closed</span><span className="spacer" /><b>{pct}%</b></div><div className="progress"><i style={{ width: `${pct}%` }} /></div></div>
            <div className="dl mt">
              <div><span>Current period</span><b>{curPeriod?.code ?? "—"}</b></div>
              <div><span>Next close</span><b>{nextClose?.code ?? "Nothing due"}</b></div>
              <div><span>Adjustment period</span><b>{current.hasAdjustmentPeriod ? "P13 included" : "None"}</b></div>
            </div>
          </div>
        )}
        {years && (next ? <YearCard y={next} icon={<CalendarPlus />} onPick={() => setYearId(next.id)} active={year?.id === next.id} /> : (
          <div className="panel">
            <div className="row"><IconWell tone="blue"><CalendarPlus /></IconWell><div><h3 style={{ margin: 0 }}>{newStart ? `FY ${newStart.getFullYear()}-${String(newStart.getFullYear() + 1).slice(2)}` : "Next year"}</h3><small className="muted">{newStart ? `From ${dateLabel(isoDay(newStart))}` : "Not created"}</small></div><span className="spacer" /><Badge tone="info" dot>Not created</Badge></div>
            <p className="small muted mt">Monthly periods (12), with an optional 13th adjustment period for year-end entries.</p>
            {canManage && (
              <>
                <Switch label="Add adjustment period (P13)" checked={p13} onChange={(e) => setP13(e.target.checked)} />
                <div className="mt"><Button size="sm" icon={<CalendarPlus />} onClick={create} disabled={busy}>Create fiscal year</Button></div>
              </>
            )}
          </div>
        ))}
      </div>

      <Panel
        flush
        title={year ? `Periods — ${year.code}` : "Periods"}
        description="Posting control by month"
        actions={
          <div className="chips">
            {(["all", "OPEN", "CLOSED", "LOCKED"] as Filter[]).map((f) => (
              <button key={f} type="button" className={cn(filter === f && "active")} onClick={() => setFilter(f)}>{f === "all" ? "All" : STATUS[f]!.label} <i>{count(f)}</i></button>
            ))}
          </div>
        }
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Period</th><th>From</th><th>To</th><th className="num">Vouchers</th><th className="num">Drafts</th><th>Modules</th><th>Status</th><th>Closed by</th><th /></tr></thead>
            <tbody>
              {!years && <tr><td colSpan={9}><Skeleton style={{ height: 18 }} /></td></tr>}
              {years && !year && <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 28 }}>No fiscal year yet. Create one to start posting.</td></tr>}
              {shown.map((p) => {
                const isCurrent = p.startDate <= today && p.endDate >= today, future = p.startDate > today;
                return (
                  <tr key={p.id}>
                    <td>{future ? p.code : <b>{p.code}</b>}{isCurrent && <small>Current</small>}{p.isAdjustment && <small>Adjustment period</small>}</td>
                    <td>{dateLabel(p.startDate)}</td>
                    <td>{dateLabel(p.endDate)}</td>
                    <td className={cn("num", !p.voucherCount && "zero")}>{p.voucherCount ? p.voucherCount.toLocaleString("en-US") : "—"}</td>
                    <td className={cn("num", !p.draftCount && "zero", p.draftCount > 0 && p.endDate < today && "neg")}>{p.draftCount || "—"}</td>
                    <td className={cn("small", future && "muted")}>{future && p.status === "OPEN" && !closedModules(p).length ? "Future" : modulesText(p)}</td>
                    <td><Badge tone={STATUS[p.status]?.tone ?? "neutral"} dot>{STATUS[p.status]?.label ?? p.status}</Badge></td>
                    <td className={cn(!p.closedByName && "muted")}>{p.closedByName ?? "—"}{p.closedAt && <small>{dateLabel(p.closedAt)}</small>}</td>
                    <td className="actions">
                      {canRequest && p.status !== "LOCKED" && closedModules(p).length > 0 && (
                        <button type="button" className="btn ghost sm" onClick={() => openReopen(p)}><LockOpen />Reopen</button>
                      )}
                      {canRequest && p.status === "LOCKED" && (
                        <button type="button" className="btn ghost sm" disabled title="Needs MFA (later phase)"><LockOpen />Reopen</button>
                      )}
                      {canManage && p.status === "CLOSED" && <button type="button" className="btn ghost sm" onClick={() => setLocking(p)}><Lock />Lock</button>}
                      {canManage && p.status === "OPEN" && (
                        <button type="button" className="btn secondary sm" onClick={() => setClosing({ p, modules: PERIOD_MODULES.filter((m) => !closedModules(p).includes(m)) })}><Lock />Close</button>
                      )}
                      <button type="button" className="btn ghost sm" onClick={() => setHistory(p)}>History</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        title={closing ? `Close ${closing.p.code}?` : "Close period"}
        subtitle={closing ? `New postings dated ${dateLabel(closing.p.startDate)} – ${dateLabel(closing.p.endDate)} will be blocked for the chosen modules.` : undefined}
        foot={
          <>
            <button type="button" className="btn secondary" onClick={() => setClosing(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy || !closing?.modules.length} onClick={() => closing && run(`${closing.p.code} closed${closing.modules.length < PERIOD_MODULES.length ? ` for ${closing.modules.join(", ")}` : ""}`, () => periodAction(closing.p.id, "close", closing.p.rowVersion, closing.modules), () => setClosing(null))}>
              {busy ? "Closing…" : "Close period"}
            </button>
          </>
        }
      >
        {closing && (
          <>
            {closing.p.draftCount > 0 && <Banner tone="warn" title={`${closing.p.draftCount} draft vouchers in ${closing.p.code}`}>Post or move them first; a period with open vouchers can’t be closed.</Banner>}
            <FormGrid>
              <span className="full small muted">Close for modules (the period shows as Closed once all five are closed)</span>
              {PERIOD_MODULES.map((m) => {
                const already = closedModules(closing.p).includes(m);
                return (
                  <Check key={m} label={`${MODULE_NAMES[m]} (${m})${already ? " · already closed" : ""}`} disabled={already} checked={already || closing.modules.includes(m)}
                    onChange={(e) => setClosing({ ...closing, modules: e.target.checked ? [...closing.modules, m] : closing.modules.filter((x) => x !== m) })} />
                );
              })}
            </FormGrid>
          </>
        )}
      </Modal>

      <Panel
        flush
        title="Reopen requests"
        description="A closed period reopens only when someone with close approval accepts the request; it closes again automatically after the reopen window."
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Period</th><th>Module</th><th>Reopen until</th><th>Reason</th><th>Requested by</th><th>Approver</th><th>Status</th><th /></tr></thead>
            <tbody>
              {!requests && <tr><td colSpan={8}><Skeleton style={{ height: 18 }} /></td></tr>}
              {requests && !requests.length && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>No reopen requests yet.</td></tr>}
              {requests?.map((r) => {
                const mine = r.requestedBy?.id === userId;
                return (
                  <tr key={r.id}>
                    <td><b>{r.period.code}</b><small>{r.period.fiscalYear}</small></td>
                    <td>{r.moduleCode ? `${MODULE_NAMES[r.moduleCode as PeriodModule] ?? r.moduleCode} (${r.moduleCode})` : "Whole period"}</td>
                    <td>{dateLabel(r.reopenUntil)}{r.autoReclose && <small>Re-closes automatically</small>}</td>
                    <td className="small" style={{ maxWidth: 260 }}>{r.reason}</td>
                    <td>{r.requestedBy?.name ?? "—"}<small>{dateLabel(r.requestedAt)}</small></td>
                    <td>{r.approver?.name ?? "—"}{r.decidedAt && <small>{dateLabel(r.decidedAt)}</small>}</td>
                    <td><Badge tone={REQ[r.status]?.tone ?? "neutral"} dot>{REQ[r.status]?.label ?? r.status}</Badge></td>
                    <td className="actions">
                      {r.status === "PENDING" && canManage && !mine && (
                        <>
                          <button type="button" className="btn ghost sm" onClick={() => { setComment(""); setDeciding({ r, action: "reject" }); }}><X />Reject</button>
                          <button type="button" className="btn secondary sm" onClick={() => { setComment(""); setDeciding({ r, action: "approve" }); }}><CheckIcon />Approve</button>
                        </>
                      )}
                      {r.status === "PENDING" && mine && (
                        <>
                          <small className="muted" style={{ marginRight: 6 }}>Your request</small>
                          <button type="button" className="btn ghost sm" onClick={() => { setComment(""); setDeciding({ r, action: "cancel" }); }}><Undo2 />Withdraw</button>
                        </>
                      )}
                      {r.status === "APPROVED" && canManage && (
                        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(`${r.period.code} closed again`, () => recloseReopen(r.id), () => undefined)}><RotateCcw />Close again</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={!!reopening}
        onClose={() => setReopening(null)}
        title={reopening ? `Request to reopen ${reopening.p.code}` : "Reopen period"}
        subtitle="The period stays closed until another approver accepts the request."
        foot={
          <>
            <button type="button" className="btn secondary" onClick={() => setReopening(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy || !reopening || reopening.reason.trim().length < 5 || !reopening.approverUserId || !reopening.until}
              onClick={() => reopening && run(`Reopen request for ${reopening.p.code} sent`, () => requestReopen({
                fiscalPeriodId: reopening.p.id, moduleCode: reopening.moduleCode || null, reopenUntil: reopening.until, reason: reopening.reason.trim(),
                approverUserId: reopening.approverUserId, autoReclose: reopening.autoReclose,
              }), () => setReopening(null))}>
              {busy ? "Sending…" : "Send request"}
            </button>
          </>
        }
      >
        {reopening && (
          <>
            <FormGrid>
              <Field label="Period"><Input value={`${reopening.p.code} · ${dateLabel(reopening.p.startDate)} – ${dateLabel(reopening.p.endDate)}`} disabled /></Field>
              <Field label="Reopen until" required hint="Closes again automatically after this date">
                <Input type="date" min={plusDays(0)} value={reopening.until} onChange={(e) => setReopening({ ...reopening, until: e.target.value })} />
              </Field>
              <Field label="Module">
                <Select value={reopening.moduleCode} onChange={(e) => setReopening({ ...reopening, moduleCode: e.target.value as PeriodModule | "" })}>
                  {closedModules(reopening.p).length === PERIOD_MODULES.length && <option value="">Whole period (all modules)</option>}
                  {closedModules(reopening.p).map((m) => <option key={m} value={m}>{MODULE_NAMES[m]} ({m})</option>)}
                </Select>
              </Field>
              <Field label="Approver" required hint="Someone with close approval — not you">
                <Select value={reopening.approverUserId} onChange={(e) => setReopening({ ...reopening, approverUserId: e.target.value })} disabled={!approvers}>
                  <option value="">{approvers ? (approvers.length ? "Choose the approver" : "No approver available") : "Loading…"}</option>
                  {approvers?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
              <Field label="Reason" required full error={reopening.reason && reopening.reason.trim().length < 5 ? "At least 5 characters" : undefined}>
                <Textarea rows={3} value={reopening.reason} placeholder="e.g. Late supplier invoice for this month" onChange={(e) => setReopening({ ...reopening, reason: e.target.value })} />
              </Field>
            </FormGrid>
            <Check label="Re-close automatically when the window ends" checked={reopening.autoReclose} onChange={(e) => setReopening({ ...reopening, autoReclose: e.target.checked })} />
            <div className="mt"><Banner tone="info" title="Locked periods">A locked period needs multi-factor verification to reopen; that arrives in a later phase.</Banner></div>
          </>
        )}
      </Modal>

      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={deciding ? `${deciding.action === "approve" ? "Approve" : deciding.action === "reject" ? "Reject" : "Withdraw"} reopen of ${deciding.r.period.code}` : "Reopen request"}
        subtitle={deciding ? `${deciding.r.moduleCode ? `${deciding.r.moduleCode} only` : "Whole period"} · until ${dateLabel(deciding.r.reopenUntil)} · ${deciding.r.reason}` : undefined}
        foot={
          <>
            <button type="button" className="btn secondary" onClick={() => setDeciding(null)} disabled={busy}>Cancel</button>
            <button type="button" className={cn("btn", deciding?.action === "approve" ? "primary" : "danger")} disabled={busy}
              onClick={() => deciding && run(
                `${deciding.r.period.code} ${deciding.action === "approve" ? "reopened" : deciding.action === "reject" ? "request rejected" : "request withdrawn"}`,
                () => decideReopen(deciding.r.id, deciding.action, comment.trim() || null), () => setDeciding(null))}>
              {busy ? "Saving…" : deciding?.action === "approve" ? "Approve & reopen" : deciding?.action === "reject" ? "Reject" : "Withdraw"}
            </button>
          </>
        }
      >
        <Field label="Comment" full><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </Modal>

      <ConfirmDialog
        open={!!locking}
        onClose={() => setLocking(null)}
        title={locking ? `Lock ${locking.code}?` : "Lock period"}
        confirmLabel="Lock period"
        danger
        busy={busy}
        onConfirm={() => locking && run(`${locking.code} locked`, () => periodAction(locking.id, "lock", locking.rowVersion), () => setLocking(null))}
      >
        <span style={{ display: "flex", gap: 8 }}><TriangleAlert style={{ flex: "none", color: "var(--warn)" }} />Locking is permanent: the period can’t be reopened afterwards.</span>
      </ConfirmDialog>

      <Drawer open={!!history} onClose={() => setHistory(null)} title={history ? `${history.code} history` : "History"} subtitle="Every change to this period, with who made it">
        {history && <HistoryTab schema="Accounting" table="FiscalPeriods" id={history.id} />}
      </Drawer>
    </>
  );
}

function YearCard({ y, icon, onPick, active }: { y: FiscalYear; icon: ReactNode; onPick: () => void; active: boolean }) {
  const closed = y.status !== "OPEN";
  return (
    <div className="panel" onClick={onPick} style={picked(active)}>
      <div className="row">
        <IconWell tone={closed ? undefined : "blue"}>{icon}</IconWell>
        <div><h3 style={{ margin: 0 }}>{y.code}</h3><small className="muted">{dateLabel(y.startDate)} – {dateLabel(y.endDate)}</small></div>
        <span className="spacer" />
        <Badge tone={closed ? "neutral" : "info"} dot>{closed ? (y.isLocked ? "Closed · Locked" : "Closed") : "Open"}</Badge>
      </div>
      <div className="dl mt">
        <div><span>Periods</span><b>{y.periods.filter((p) => p.status !== "OPEN").length} of {y.periods.length} closed</b></div>
        {y.netProfitTransferred !== null && <div><span>Net profit transferred</span><b><Money value={y.netProfitTransferred} dec={0} /></b></div>}
        {y.closedAt && <div><span>Closed</span><b>{dateLabel(y.closedAt)}</b></div>}
        {y.auditorName && <div><span>Audited by</span><b>{y.auditorName}</b></div>}
      </div>
    </div>
  );
}
