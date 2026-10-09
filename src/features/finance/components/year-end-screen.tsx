"use client";

import { AlertTriangle, CircleCheck, CircleX, History, Lock, Plus, RefreshCw, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Account, FiscalYear, YearEnd } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { listAccounts, listFiscalYears } from "../api";
import { addYearEndAdjustment, cancelYearEndRun, getYearEnd, postYearEndAdjustment, removeYearEndAdjustment, yearEndClose, yearEndDryRun } from "../period-close-api";
import { dateLabel, isoDay } from "./finance-ui";

const STEPS = ["Pre-close checklist", "Adjustments", "Closing entries", "Confirm & lock"] as const;
const ADJ: Record<string, { tone: Tone; label: string }> = {
  PROPOSED: { tone: "warn", label: "Proposed" }, AWAITING_INPUT: { tone: "neutral", label: "Awaiting input" }, POSTED: { tone: "good", label: "Posted" }, EXCLUDED: { tone: "neutral", label: "Excluded" },
};
const RUN: Record<string, { tone: Tone; label: string }> = {
  COMPLETED: { tone: "good", label: "Completed" }, DRAFT: { tone: "warn", label: "Draft" }, FAILED: { tone: "danger", label: "Failed" }, CANCELLED: { tone: "neutral", label: "Cancelled" },
};
const ERRORS: Record<string, string> = {
  YEAR_END_PERIODS_OPEN: "Fix the blocking checks first (open periods, draft vouchers, unposted adjustments).",
  YEAR_END_ALREADY_CLOSED: "This fiscal year is already closed.",
  YEAR_END_NOT_DRAFT: "This run has already happened.",
  POSTING_ROLE_UNMAPPED: "Map the Retained earnings default account first (Company Settings › Default accounts).",
  PERIOD_NOT_OPEN: "The year’s last period is closed, so the adjustment can’t post. Reopen it through a reopen request first.",
};
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

/** Template app/periods/close (42-acc-reports.html): FY picker, dry run / final close, 4-step wizard, previous runs. */
export function YearEndScreen({ can }: { can: { post: boolean; approve: boolean } }) {
  const toast = useToast();
  const [years, setYears] = useState<FiscalYear[] | null>(null);
  const [fyId, setFyId] = useState<string>("");
  const [data, setData] = useState<YearEnd | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"dry" | "final">("dry");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [adj, setAdj] = useState<{ description: string; debitAccountId: string; creditAccountId: string; amount: string } | null>(null);
  const [ack, setAck] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [cancelling, setCancelling] = useState<{ id: string; rowVersion: number } | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFiscalYears()
      .then((y) => {
        if (cancelled) return;
        const sorted = [...y].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
        setYears(sorted);
        const today = isoDay(new Date());
        setFyId((cur) => cur || (sorted.find((x) => x.startDate <= today && x.endDate >= today) ?? sorted[0])?.id || "");
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load fiscal years" }));
    listAccounts().then((a) => !cancelled && setAccounts(a.filter((x) => x.kind === "POSTABLE" && x.status === "ACTIVE"))).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!fyId) return;
    let cancelled = false;
    getYearEnd(fyId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the year-end close" }));
    return () => {
      cancelled = true;
    };
  }, [fyId, attempt]);

  const reload = () => setAttempt((n) => n + 1);
  const act = async (label: string, fn: () => Promise<YearEnd>, done?: () => void) => {
    setBusy(true);
    try {
      setData(await fn());
      toast(label, { tone: "good" });
      done?.();
    } catch (e) {
      toast(e instanceof ApiError ? ERRORS[e.code] ?? e.message : "Something went wrong", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const y = data?.fiscalYear;
  const closed = y?.status === "CLOSED";
  const checks = data?.checklist ?? [];
  const blocks = checks.filter((c) => c.state === "block");
  const warns = checks.filter((c) => c.state === "warn");
  const passed = checks.filter((c) => c.state === "ok").length;
  const lines = data?.closingLines ?? [];
  const income = lines.filter((l) => l.debit > 0);
  const expense = lines.filter((l) => l.credit > 0);
  const net = data?.figures.netProfit ?? 0;
  const totalDr = income.reduce((s, l) => s + l.debit, 0) + (net < 0 ? -net : 0);
  const totalCr = expense.reduce((s, l) => s + l.credit, 0) + (net > 0 ? net : 0);
  const today = isoDay(new Date());

  return (
    <>
      <PageHead
        eyebrow="Period Close / Year-end"
        title="Year-end Close"
        description="Run checks, post adjustments, transfer profit & loss to retained earnings and lock the year."
        actions={
          <div className="row" style={{ gap: 10 }}>
            <Select value={fyId} onChange={(e) => { setFyId(e.target.value); setStep(0); setData(null); }} style={{ minWidth: 230 }}>
              {!years && <option>Loading…</option>}
              {years?.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.status === "CLOSED" ? `closed${f.closedAt ? ` ${dateLabel(f.closedAt)}` : ""}` : `open, ends ${dateLabel(f.endDate)}`}</option>)}
            </Select>
            <div className="seg">
              <button type="button" className={cn(mode === "dry" && "active")} onClick={() => setMode("dry")}>Dry run</button>
              <button type="button" className={cn(mode === "final" && "active")} onClick={() => setMode("final")}>Final close</button>
            </div>
          </div>
        }
      />

      {mode === "dry" && !closed && (
        <div className="mb"><Banner tone="info" title="Dry-run mode">Nothing is posted. Use it to rehearse the close and spot issues early{y && y.endDate > today ? `; the year ends ${dateLabel(y.endDate)}` : ""}.</Banner></div>
      )}
      {mode === "final" && !closed && (
        <div className="mb"><Banner tone="warn" title="Final close">Posts the closing entry, locks every period and closes {y?.code ?? "the year"}. Only someone with close approval can run it.</Banner></div>
      )}
      {closed && (
        <div className="mb"><Banner tone="good" title={`${y?.code} is closed`}>Closing entry {y?.closing?.docNo ?? "—"}; every period is locked. Cancelling the final close (below) reverses it.</Banner></div>
      )}

      <div className="wizard panel">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={cn(i === step && "active", i < step && "done")} onClick={() => setStep(i)}><b>{i + 1}</b><span>{s}</span></li>
          ))}
        </ol>

        {!data && <Skeleton style={{ height: 260 }} />}

        {data && step === 0 && (
          <div className="wz-pane active">
            <div className="form-section"><h4>Pre-close checklist</h4><p>{passed} of {checks.length} checks passed{warns.length ? ` · ${warns.length} warning${warns.length > 1 ? "s" : ""} (non-blocking)` : ""}{blocks.length ? ` · ${blocks.length} blocking` : ""}</p></div>
            <ul className="period-checks list">
              {checks.map((c) => (
                <li key={c.key} className={cn("list-item", c.state === "ok" ? "ok" : c.state === "warn" ? "warn" : "fail")}>
                  <span className={cn("icon-well", c.state === "warn" && "yellow")}>{c.state === "ok" ? <CircleCheck /> : c.state === "warn" ? <AlertTriangle /> : <CircleX />}</span>
                  <div><b>{c.label}</b><small>{c.detail}</small></div>
                  <span className="spacer" />
                  {c.state === "ok" ? <Badge tone="good">OK</Badge> : c.link ? <Link className="btn ghost sm" href={c.link}>Review</Link> : <Badge tone={c.state === "warn" ? "warn" : "danger"}>{c.state === "warn" ? "Warning" : "Blocking"}</Badge>}
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={() => { reload(); toast("Checks re-run", { tone: "good" }); }}><RefreshCw />Re-run checks</button>
              <button type="button" className="btn primary" onClick={() => setStep(1)}>Continue</button>
            </div>
          </div>
        )}

        {data && step === 1 && (
          <div className="wz-pane active">
            <div className="form-section"><h4>Year-end adjustments</h4><p>Entries posted as journal vouchers on {dateLabel(y?.endDate)} before the close (that period must be open).</p></div>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Adjustment</th><th>Debit</th><th>Credit</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
              <tbody>
                {!data.adjustments.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 22 }}>No adjustments. Add accruals, provisions or write-downs before closing.</td></tr>}
                {data.adjustments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.description}{a.journal && <small>{a.journal.docNo}</small>}</td>
                    <td>{a.debitAccount.code} {a.debitAccount.name}</td>
                    <td>{a.creditAccount.code} {a.creditAccount.name}</td>
                    <td className="num">{fmt(a.amount)}</td>
                    <td><Badge tone={ADJ[a.status]?.tone ?? "neutral"}>{ADJ[a.status]?.label ?? a.status}</Badge></td>
                    <td className="actions">
                      {a.status !== "POSTED" && can.post && !closed && (
                        <>
                          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => act("Adjustment removed", () => removeYearEndAdjustment(fyId, a.id))}><Trash2 />Remove</button>
                          <button type="button" className="btn secondary sm" disabled={busy} onClick={() => act("Adjustment posted", () => postYearEndAdjustment(fyId, a.id))}>Post</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {can.post && !closed && <div className="mt"><button type="button" className="btn ghost sm" onClick={() => setAdj({ description: "", debitAccountId: "", creditAccountId: "", amount: "" })}><Plus />Add adjustment</button></div>}
            <p className="small muted mt">Only posted adjustments count in the closing entries. Proposed ones block the final close until posted or removed.</p>
            <div className="form-actions"><button type="button" className="btn secondary" onClick={() => setStep(0)}>Back</button><button type="button" className="btn primary" onClick={() => setStep(2)}>Continue</button></div>
          </div>
        )}

        {data && step === 2 && (
          <div className="wz-pane active">
            <div className="form-section"><h4>Closing entries preview</h4><p>Transfer of income and expense balances to {data.figures.retainedEarningsAccount ? `${data.figures.retainedEarningsAccount.code} ${data.figures.retainedEarningsAccount.name}` : "retained earnings (not mapped)"}</p></div>
            <div className="table-wrap"><table className="tbl stmt">
              <thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
              <tbody>
                <tr className="sec"><td colSpan={3}>Close income accounts</td></tr>
                {!income.length && <tr><td className="ind1 muted" colSpan={3}>No income in the year</td></tr>}
                {income.map((l) => <tr key={l.account.id}><td className="ind1">{l.account.code} {l.account.name}</td><td className="num dr">{fmt(l.debit)}</td><td className="num zero">—</td></tr>)}
                <tr className="sec"><td colSpan={3}>Close expense accounts</td></tr>
                {!expense.length && <tr><td className="ind1 muted" colSpan={3}>No expenses in the year</td></tr>}
                {expense.map((l) => <tr key={l.account.id}><td className="ind1">{l.account.code} {l.account.name}</td><td className="num zero">—</td><td className="num cr">{fmt(l.credit)}</td></tr>)}
                <tr className="sec"><td colSpan={3}>Transfer to equity</td></tr>
                <tr>
                  <td className="ind1">{data.figures.retainedEarningsAccount?.code ?? ""} Retained earnings — net {net >= 0 ? "profit" : "loss"}</td>
                  <td className={cn("num", net < 0 ? "dr" : "zero")}>{net < 0 ? fmt(-net) : "—"}</td>
                  <td className={cn("num", net > 0 ? "cr" : "zero")}>{net > 0 ? fmt(net) : "—"}</td>
                </tr>
                <tr className="total"><td>Total</td><td className="num">{fmt(totalDr)}</td><td className="num">{fmt(totalCr)}</td></tr>
              </tbody>
            </table></div>
            <div className="grid-3 mt">
              <div className="panel"><small className="muted">Retained earnings — opening</small><h3>{rs(data.figures.retainedOpening)}</h3></div>
              <div className="panel"><small className="muted">Add: net {net >= 0 ? "profit" : "loss"}</small><h3 className={net >= 0 ? "dr" : "cr"}>{rs(net)}</h3></div>
              <div className="panel"><small className="muted">Retained earnings — after close</small><h3>{rs(data.figures.retainedClosing)}</h3></div>
            </div>
            <div className="form-actions"><button type="button" className="btn secondary" onClick={() => setStep(1)}>Back</button><button type="button" className="btn primary" onClick={() => setStep(3)}>Continue</button></div>
          </div>
        )}

        {data && step === 3 && (
          <div className="wz-pane active">
            <div className="form-section"><h4>Confirm &amp; lock</h4><p>Review the summary, then run the {mode === "dry" ? "dry run" : "final close"}.</p></div>
            <div className="grid-2">
              <div className="dl">
                <div><span>Fiscal year</span><b>{y?.code} ({dateLabel(y?.startDate)} – {dateLabel(y?.endDate)})</b></div>
                <div><span>Revenue</span><b>{rs(data.figures.revenue)}</b></div>
                <div><span>Net {net >= 0 ? "profit" : "loss"} transferred</span><b>{rs(net)}</b></div>
                <div><span>Closing journal</span><b>1 voucher · {lines.length + (net !== 0 ? 1 : 0)} lines</b></div>
                <div><span>Checks</span><b>{passed} passed · {warns.length} warnings · {blocks.length} blocking</b></div>
              </div>
              <div className="stack">
                <Check label={`Lock all ${data.periods.length} periods after closing`} checked readOnly disabled />
                <Check label="Carry balance sheet balances forward (automatic)" checked readOnly disabled />
                {warns.length > 0 && <Check label={`I acknowledge the ${warns.length} warning${warns.length > 1 ? "s" : ""}`} checked={ack} onChange={(e) => setAck(e.target.checked)} />}
              </div>
            </div>
            {blocks.length > 0 && mode === "final" && <div className="mt"><Banner tone="danger" title="Blocked">{blocks.map((b) => b.detail).join(" · ")}</Banner></div>}
            <div className="mt"><Banner tone="warn" title="Final close locks the year">It can only be undone by cancelling the run, which reverses the closing entry. In dry-run mode nothing is posted; the figures are saved as a dry run.</Banner></div>
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={() => setStep(2)}>Back</button>
              {mode === "dry" ? (
                <button type="button" className="btn primary" disabled={busy || !can.post || closed} onClick={() => act("Dry run saved — nothing posted", () => yearEndDryRun(fyId))}><Lock />Run dry-run close</button>
              ) : (
                <button type="button" className="btn primary" disabled={busy || !can.approve || closed || blocks.length > 0 || (warns.length > 0 && !ack)} onClick={() => setConfirmFinal(true)}><Lock />Run final close</button>
              )}
            </div>
            {mode === "final" && !can.approve && <p className="small muted mt">Only someone with close approval can run the final close.</p>}
          </div>
        )}
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Runs</h3><p>Dry runs and the final close of {y?.code ?? "this year"}</p></div><span className="spacer" />{data && data.runs[0] && <button type="button" className="btn ghost sm" onClick={() => setHistory(data.runs[0]!.id)}><History />History</button>}</div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Run</th><th>As at</th><th>Checks</th><th className="num">Net profit</th><th className="num">RE after</th><th>Closing JE</th><th>By</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={9}><Skeleton style={{ height: 18 }} /></td></tr>}
            {data && !data.runs.length && <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 22 }}>No runs yet.</td></tr>}
            {data?.runs.map((r) => (
              <tr key={r.id}>
                <td><b>{r.runMode === "FINAL" ? "Final close" : "Dry run"}</b></td>
                <td>{dateLabel(r.asAtDate)}</td>
                <td className="small">{r.checksPassed}/{r.checksTotal} passed{r.checksWarning ? ` · ${r.checksWarning} warn` : ""}</td>
                <td className="num">{r.netProfit === null ? "—" : fmt(r.netProfit)}</td>
                <td className="num">{r.retainedClosing === null ? "—" : fmt(r.retainedClosing)}</td>
                <td>{r.journal?.docNo ?? "—"}</td>
                <td>{r.runBy?.name ?? "—"}{r.runAt && <small>{dateLabel(r.runAt)}</small>}</td>
                <td><Badge tone={RUN[r.status]?.tone ?? "neutral"} dot>{RUN[r.status]?.label ?? r.status}</Badge></td>
                <td className="actions">
                  <button type="button" className="btn ghost sm" onClick={() => setHistory(r.id)}><History /></button>
                  {r.runMode === "FINAL" && r.status === "COMPLETED" && can.approve && (
                    <button type="button" className="btn ghost sm" onClick={() => { setReason(""); setCancelling({ id: r.id, rowVersion: r.rowVersion }); }}><Undo2 />Cancel close</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <Modal
        open={!!adj}
        onClose={() => setAdj(null)}
        title="Add year-end adjustment"
        subtitle={`Posts as a journal voucher dated ${dateLabel(y?.endDate)} when you choose Post.`}
        foot={
          <>
            <button type="button" className="btn secondary" onClick={() => setAdj(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy || !adj || adj.description.trim().length < 3 || !adj.debitAccountId || !adj.creditAccountId || adj.debitAccountId === adj.creditAccountId || !(Number(adj.amount) > 0)}
              onClick={() => adj && act("Adjustment added", () => addYearEndAdjustment(fyId, { description: adj.description.trim(), debitAccountId: adj.debitAccountId, creditAccountId: adj.creditAccountId, amount: Number(adj.amount) }), () => setAdj(null))}>
              {busy ? "Saving…" : "Add adjustment"}
            </button>
          </>
        }
      >
        {adj && (
          <FormGrid>
            <Field label="Description" required full><Input value={adj.description} placeholder="e.g. Provision for doubtful debts" onChange={(e) => setAdj({ ...adj, description: e.target.value })} /></Field>
            <Field label="Debit account" required>
              <Select value={adj.debitAccountId} onChange={(e) => setAdj({ ...adj, debitAccountId: e.target.value })}>
                <option value="">Choose an account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </Select>
            </Field>
            <Field label="Credit account" required error={adj.creditAccountId && adj.creditAccountId === adj.debitAccountId ? "Must differ from the debit account" : undefined}>
              <Select value={adj.creditAccountId} onChange={(e) => setAdj({ ...adj, creditAccountId: e.target.value })}>
                <option value="">Choose an account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount" required><Input type="number" min="0" step="0.01" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></Field>
          </FormGrid>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmFinal}
        onClose={() => setConfirmFinal(false)}
        title={`Close ${y?.code ?? "the year"}?`}
        confirmLabel="Run final close"
        danger
        busy={busy}
        onConfirm={() => act(`${y?.code} closed and locked`, () => yearEndClose(fyId, ack), () => setConfirmFinal(false))}
      >
        <span style={{ display: "flex", gap: 8 }}><AlertTriangle style={{ flex: "none", color: "var(--warn)" }} />Net {net >= 0 ? "profit" : "loss"} of {rs(net)} moves to retained earnings and all {data?.periods.length ?? 0} periods lock.</span>
      </ConfirmDialog>

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel the final close?"
        subtitle="The closing entry is reversed, the year reopens and its periods go back to closed."
        foot={
          <>
            <button type="button" className="btn secondary" onClick={() => setCancelling(null)} disabled={busy}>Keep it</button>
            <button type="button" className="btn danger" disabled={busy || reason.trim().length < 3}
              onClick={() => cancelling && act("Final close cancelled", () => cancelYearEndRun(cancelling.id, cancelling.rowVersion, reason.trim()), () => setCancelling(null))}>
              {busy ? "Cancelling…" : "Cancel close"}
            </button>
          </>
        }
      >
        <Field label="Reason" required full><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>

      <Drawer open={!!history} onClose={() => setHistory(null)} title="Year-end run history" subtitle="Every change to this run, with who made it">
        {history && <HistoryTab schema="Accounting" table="YearEndCloses" id={history} />}
      </Drawer>
    </>
  );
}
