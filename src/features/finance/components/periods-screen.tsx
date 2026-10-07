"use client";

import { CalendarCheck, CalendarPlus, Lock, LockOpen, TriangleAlert } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PERIOD_MODULES, type FiscalPeriod, type FiscalYear, type PeriodModule } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, FormGrid, Switch } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { IconWell, PageHead, Panel } from "@/components/ui/page";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { createFiscalYear, listFiscalYears, periodAction } from "../api";
import { dateLabel, isoDay, Money } from "./finance-ui";

const MODULE_NAMES: Record<PeriodModule, string> = { GL: "General ledger", AR: "Receivables", AP: "Payables", INV: "Inventory", PAY: "Payroll" };
const STATUS: Record<string, { tone: Tone; label: string }> = { OPEN: { tone: "good", label: "Open" }, CLOSED: { tone: "neutral", label: "Closed" }, LOCKED: { tone: "violet", label: "Locked" } };
type Filter = "all" | "OPEN" | "CLOSED" | "LOCKED";

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
export function PeriodsScreen({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [years, setYears] = useState<FiscalYear[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [yearId, setYearId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [p13, setP13] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<{ p: FiscalPeriod; modules: PeriodModule[] } | null>(null);
  const [reopening, setReopening] = useState<{ p: FiscalPeriod; modules: PeriodModule[] } | null>(null);
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
  const reload = () => setAttempt((n) => n + 1);

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
      toast(e instanceof ApiError ? e.message : "Could not update the period", { tone: "danger" });
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
        description="Control which months accept postings. Closed periods block new entries; locked periods cannot be reopened."
        actions={canManage && <Button icon={<CalendarPlus />} onClick={create} disabled={busy || !years}>New fiscal year</Button>}
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
                      {canManage && p.status !== "LOCKED" && closedModules(p).length > 0 && (
                        <button type="button" className="btn ghost sm" onClick={() => setReopening({ p, modules: closedModules(p) })}><LockOpen />Reopen</button>
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

      <Modal
        open={!!reopening}
        onClose={() => setReopening(null)}
        title={reopening ? `Reopen ${reopening.p.code}` : "Reopen period"}
        subtitle="Reopening is recorded in the period's history."
        foot={
          <>
            <button type="button" className="btn secondary" onClick={() => setReopening(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy || !reopening?.modules.length} onClick={() => reopening && run(`${reopening.p.code} reopened for ${reopening.modules.join(", ")}`, () => periodAction(reopening.p.id, "reopen", reopening.p.rowVersion, reopening.modules), () => setReopening(null))}>
              {busy ? "Reopening…" : "Reopen"}
            </button>
          </>
        }
      >
        {reopening && (
          <>
            <FormGrid>
              <span className="full small muted">Reopen for modules</span>
              {closedModules(reopening.p).map((m) => (
                <Check key={m} label={`${MODULE_NAMES[m]} (${m})`} checked={reopening.modules.includes(m)}
                  onChange={(e) => setReopening({ ...reopening, modules: e.target.checked ? [...reopening.modules, m] : reopening.modules.filter((x) => x !== m) })} />
              ))}
            </FormGrid>
            <div className="mt"><Banner tone="info" title="Locked periods">A locked period can’t be reopened.</Banner></div>
          </>
        )}
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
