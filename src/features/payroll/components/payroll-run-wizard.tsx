"use client";

import { CalendarDays, CalendarX, Fingerprint, HandCoins, Plane, Plus, RefreshCw, Timer, Trash2, TrendingUp, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { payrollMonthBounds, type PayrollRun, type RunOptions, type RunPreview } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dmy, localToday, monthLabel, Person, shiftMonth } from "@/features/hr/components/attendance-ui";
import { createPayrollRun, getPayrollRun, payrollRunOptions, payrollRunPreview, savePayrollAdjustments, calculatePayrollRun, syncPayrollInputs, updatePayrollRun } from "../run-api";
import { PAYROLL_STATUS } from "./payroll-overview-screen";
import { RunApproveStep, RunPostStep } from "./run-approve-post";
import { RunReviewStep } from "./run-review";
import { PayrollKpi, payrollError, payrollFieldErrors, payrollMoney, payrollRs, type PayrollRunCan } from "./run-ui";

const RUN_TONE: Record<string, "good" | "warn" | "danger" | "info" | "neutral"> = { DRAFT: "neutral", REVIEW: "info", AWAITING_APPROVAL: "warn", APPROVED: "good", POSTED: "info", PAID: "good", REJECTED: "danger", CANCELLED: "danger", REVERSED: "neutral" };
const STEP_NAMES = ["Period & Scope", "Inputs", "Review", "Approve", "Post & Pay"];
const stepOf = (status: string) => ({ DRAFT: 2, REVIEW: 3, AWAITING_APPROVAL: 4, APPROVED: 5, POSTED: 5, PAID: 5 } as Record<string, number>)[status] ?? 3;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodText = (from: string, to: string) => `${from.slice(8)}–${to.slice(8)} ${MON[Number(to.slice(5, 7)) - 1]} ${to.slice(0, 4)}`;
const stampText = (iso: string | null | undefined) => (iso ? `${dmy(iso.slice(0, 10))} ${iso.slice(11, 16)}` : "");

/**
 * Template app/hr/payroll/run (51-hr-pay-talent.html): the five-step payroll run. Without a run id it is step 1 of a
 * new run; with one, it opens at the step the run's status calls for.
 */
export function PayrollRunWizard({ runId, can }: { runId?: string; can: PayrollRunCan }) {
  const router = useRouter();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [opts, setOpts] = useState<RunOptions | null>(null);
  const [step, setStep] = useState(runId ? 0 : 1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([payrollRunOptions(), runId ? getPayrollRun(runId) : Promise.resolve(null)])
      .then(([o, r]) => { setOpts(o); if (r) { setRun(r); setStep(stepOf(r.status)); } })
      .catch((e: unknown) => setError(payrollError(e)));
  }, [runId]);
  useEffect(() => { load(); }, [load]);

  const onRun = (r: PayrollRun, next?: number) => { setRun(r); if (next) setStep(next); };
  const month = run?.payrollMonth.slice(0, 7);
  const title = month ? `Run Payroll — ${monthLabel(month)}` : "Run Payroll";
  const desc = run
    ? `${run.docNo} · Period ${periodText(run.periodFrom, run.periodTo)} · Pay date ${dmy(run.payDate)} · ${run.preparedBy ? `Prepared by ${run.preparedBy.name}` : `Draft saved by ${run.createdBy?.name ?? "—"}`}, ${stampText(run.preparedAt ?? run.createdAt)}`
    : "Choose the month and who the run covers.";
  const maxStep = run ? Math.max(stepOf(run.status), run.calculatedAt ? 3 : 2) : 1;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Workforce / Payroll / Run</div>
          <h1>{title}</h1>
          <p>{desc}</p>
        </div>
        <div className="head-actions">
          {run && <Badge tone={RUN_TONE[run.status] ?? "neutral"} dot>{PAYROLL_STATUS[run.status]?.label ?? run.status}</Badge>}
          <Link className="btn secondary" href="/hr/payroll"><X />Exit</Link>
        </div>
      </div>
      {error && <ErrorState message={error} onRetry={() => { setError(null); load(); }} />}
      {!error && (runId && (!run || !opts) ? <Skeleton style={{ height: 520 }} /> : (
        <div className="wizard">
          <ol className="steps">
            {STEP_NAMES.map((n, i) => {
              const s = i + 1;
              const reachable = s <= maxStep;
              return (
                <li key={n} className={cn(s === step && "active", s < step && "done")} onClick={() => reachable && setStep(s)} aria-current={s === step ? "step" : undefined} style={reachable ? undefined : { cursor: "default" }}>
                  <b>{s}</b><span>{n}</span>
                </li>
              );
            })}
          </ol>
          {run && ["REJECTED", "CANCELLED", "REVERSED"].includes(run.status) && (
            <div className="mb"><Banner tone={run.status === "REVERSED" ? "warn" : "danger"} title={`This run is ${run.status.toLowerCase()}`}>{run.remarks?.split("\n").at(-1) ?? "It can no longer change."} Start a new run for {monthLabel(run.payrollMonth.slice(0, 7))} from Run Payroll.</Banner></div>
          )}
          {step === 1 && opts && <PeriodStep run={run} opts={opts} can={can} onSaved={(r, isNew) => { if (isNew) router.replace(`/hr/payroll/runs/${r.id}`); else onRun(r, 2); }} />}
          {step === 2 && run && <InputsStep run={run} opts={opts!} onRun={onRun} onBack={() => setStep(1)} />}
          {step === 3 && run && <RunReviewStep run={run} onRun={onRun} onBack={() => setStep(2)} />}
          {step === 4 && run && <RunApproveStep run={run} onRun={onRun} onBack={() => setStep(3)} onNext={() => setStep(5)} />}
          {step === 5 && run && <RunPostStep run={run} opts={opts!} can={can} onRun={onRun} onBack={() => setStep(4)} />}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- step 1
function PeriodStep({ run, opts, can, onSaved }: { run: PayrollRun | null; opts: RunOptions; can: PayrollRunCan; onSaved: (r: PayrollRun, isNew: boolean) => void }) {
  const toast = useToast();
  const thisMonth = localToday().slice(0, 7);
  const editable = run ? can.edit && ["DRAFT", "REVIEW"].includes(run.status) : can.create;
  const [f, setF] = useState(() => {
    const m = run?.payrollMonth.slice(0, 7) ?? thisMonth;
    const b = payrollMonthBounds(m);
    return {
      runType: run?.runType ?? "REGULAR", month: m, periodFrom: run?.periodFrom ?? b.first, periodTo: run?.periodTo ?? b.last, payDate: run?.payDate ?? b.last,
      attendanceCutoffDate: run?.attendanceCutoffDate ?? `${m}-25`, payGroupId: run?.payGroup?.id ?? "", salaryPayableAccountId: run?.salaryPayableAccount.id ?? opts.defaultPayableAccountId ?? "",
      includeNoticePeriod: run?.includeNoticePeriod ?? true, includeExited: run?.includeExited ?? false,
      branchIds: run ? (run.branches.length ? run.branches.filter((x) => x.isIncluded).map((x) => x.branchId) : opts.branches.map((x) => x.id)) : opts.branches.map((x) => x.id),
    };
  });
  const [preview, setPreview] = useState<RunPreview | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    payrollRunPreview(f.month, f.payGroupId || null, f.runType).then((p) => { if (!off) setPreview(p); }).catch(() => { if (!off) setPreview(null); });
    return () => { off = true; };
  }, [f.month, f.payGroupId, f.runType]);

  const setMonth = (m: string) => { const b = payrollMonthBounds(m); setF({ ...f, month: m, periodFrom: b.first, periodTo: b.last, payDate: b.last, attendanceCutoffDate: `${m}-25` }); };
  const months = [-2, -1, 0, 1].map((i) => shiftMonth(thisMonth, i));
  const allBranches = f.branchIds.length === opts.branches.length;
  const existing = !run && preview?.existing;

  const save = async () => {
    if (!editable) { if (run) onSaved(run, false); return; }
    setBusy(true); setErrs({});
    try {
      const branchIds = allBranches ? [] : f.branchIds;
      if (run) {
        const r = await updatePayrollRun(run.id, { payDate: f.payDate, attendanceCutoffDate: f.attendanceCutoffDate || null, salaryPayableAccountId: f.salaryPayableAccountId, includeNoticePeriod: f.includeNoticePeriod, includeExited: f.includeExited, branchIds, rowVersion: run.rowVersion });
        onSaved(r, false);
      } else {
        const r = await createPayrollRun({ runType: f.runType, payrollMonth: f.month, periodFrom: f.periodFrom, periodTo: f.periodTo, payDate: f.payDate, attendanceCutoffDate: f.attendanceCutoffDate || null, payGroupId: f.payGroupId || null, salaryPayableAccountId: f.salaryPayableAccountId, includeNoticePeriod: f.includeNoticePeriod, includeExited: f.includeExited, branchIds });
        toast(`${r.docNo} created`, { tone: "good" });
        onSaved(r, true);
      }
    } catch (e) {
      setErrs(payrollFieldErrors(e));
      toast(payrollError(e), { tone: "danger" });
    } finally { setBusy(false); }
  };

  const count = (id: string) => preview?.byBranch.find((x) => x.branchId === id)?.employees ?? 0;
  return (
    <div className="wz-pane active">
      <div className="split">
        <div className="panel">
          <div className="form-section"><h4>Pay period</h4><p>Monthly payroll for the calendar month. Attendance cut-off is the 25th by default.</p></div>
          <div className="mb"><FormGrid cols={3}>
            <Field label="Payroll month" required><Select value={f.month} disabled={!!run} onChange={(e) => setMonth(e.target.value)}>{(months.includes(f.month) ? months : [f.month, ...months]).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select></Field>
            <Field label="Period from" error={errs.periodFrom}><Input type="date" value={f.periodFrom} disabled={!!run || !editable} onChange={(e) => setF({ ...f, periodFrom: e.target.value })} /></Field>
            <Field label="Period to" error={errs.periodTo}><Input type="date" value={f.periodTo} disabled={!!run || !editable} onChange={(e) => setF({ ...f, periodTo: e.target.value })} /></Field>
            <Field label="Pay date" required error={errs.payDate}><Input type="date" value={f.payDate} disabled={!editable} onChange={(e) => setF({ ...f, payDate: e.target.value })} /></Field>
            <Field label="Attendance cut-off" error={errs.attendanceCutoffDate}><Input type="date" value={f.attendanceCutoffDate} disabled={!editable} onChange={(e) => setF({ ...f, attendanceCutoffDate: e.target.value })} /></Field>
            <Field label="Run type"><Select value={f.runType} disabled={!!run} onChange={(e) => setF({ ...f, runType: e.target.value })}><option value="REGULAR">Regular</option><option value="OFF_CYCLE">Off-cycle</option><option value="BONUS_ONLY">Bonus only</option></Select></Field>
          </FormGrid></div>
          <div className="form-section"><h4>Scope</h4><p>Choose which employees this run covers.</p></div>
          <div className="mb"><FormGrid>
            <Field label="Pay group"><Select value={f.payGroupId} disabled={!!run} onChange={(e) => setF({ ...f, payGroupId: e.target.value })}><option value="">All pay groups</option>{opts.payGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
            <Field label="Salary payable account" error={errs.salaryPayableAccountId}><Select value={f.salaryPayableAccountId} disabled={!editable} onChange={(e) => setF({ ...f, salaryPayableAccountId: e.target.value })}><option value="">Choose…</option>{opts.payableAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</Select></Field>
            {opts.branches.map((b) => (
              <Check key={b.id} disabled={!editable} checked={f.branchIds.includes(b.id)} onChange={(e) => setF({ ...f, branchIds: e.target.checked ? [...f.branchIds, b.id] : f.branchIds.filter((x) => x !== b.id) })}
                label={<>{b.name} <span className="muted">({count(b.id)})</span></>} />
            ))}
            <Check disabled={!editable} checked={f.includeNoticePeriod} onChange={(e) => setF({ ...f, includeNoticePeriod: e.target.checked })} label="Include employees on notice period" />
            <Check disabled={!editable} checked={f.includeExited} onChange={(e) => setF({ ...f, includeExited: e.target.checked })} label={<span>Include employees exited in period <span className="muted">(handled in settlement)</span></span>} />
          </FormGrid></div>
        </div>
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Run Summary</h3><p>Based on current selection</p></div></div>
            {preview ? (
              <div className="dl">
                <div><span>Employees in scope</span><b>{preview.employees}</b></div>
                <div><span>New joiners (pro-rata)</span><b>{preview.newJoiners}</b></div>
                <div><span>Exits {f.includeExited ? "(included)" : "(excluded)"}</span><b>{preview.exits}</b></div>
                <div><span>On notice period</span><b>{preview.onNotice}</b></div>
                <div><span>Salary revisions effective</span><b>{preview.revisions}</b></div>
                <div><span>Working days</span><b>{preview.workingDays}</b></div>
                <div><span>Public holidays</span><b>{preview.publicHolidays}</b></div>
              </div>
            ) : <Skeleton style={{ height: 220 }} />}
          </div>
          {existing && <Banner tone="warn" title={`${existing.docNo} is already open`} action={<Link className="btn sm secondary" href={`/hr/payroll/runs/${existing.id}`}>Open it</Link>}>One regular run per month and pay group. Continue it, or cancel it first.</Banner>}
          {preview?.previous && <Banner tone={["POSTED", "PAID"].includes(preview.previous.status) ? "warn" : "info"} title={`Previous period: ${preview.previous.docNo}`}>{monthLabel(preview.previous.payrollMonth.slice(0, 7))} is {preview.previous.status.replace(/_/g, " ").toLowerCase()}.{["POSTED", "PAID"].includes(preview.previous.status) ? " Changes to it require a reversal." : ""}</Banner>}
        </div>
      </div>
      <div className="form-actions">
        <Link className="btn secondary" href="/hr/payroll">Cancel</Link>
        <button type="button" className="btn primary" onClick={save} disabled={busy || (!run && (!can.create || !!existing || !f.salaryPayableAccountId))}>{busy ? "Saving…" : run ? "Continue to inputs" : "Create run & continue"}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- step 2
type AdjRow = { key: string; id?: string; employeeId: string; componentId: string; amount: string; isTaxable: boolean; remarks: string; inputSource: string; quantity: number | null };
const fromRun = (run: PayrollRun): AdjRow[] => run.adjustments.map((a) => ({ key: a.id, id: a.id, employeeId: a.employee.id, componentId: a.component.id, amount: String(a.amount), isTaxable: a.isTaxable, remarks: a.remarks ?? "", inputSource: a.inputSource, quantity: a.quantity }));

function InputsStep({ run, opts, onRun, onBack }: { run: PayrollRun; opts: RunOptions; onRun: (r: PayrollRun, next?: number) => void; onBack: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<AdjRow[]>(() => fromRun(run));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const editable = run.can.edit;
  const inp = run.inputs;
  const comps = useMemo(() => {
    const list = [...opts.components];
    for (const a of run.adjustments) if (!list.some((c) => c.id === a.component.id)) list.push({ ...a.component, systemRole: null, taxable: a.isTaxable });
    return list;
  }, [opts.components, run.adjustments]);
  const compOf = (id: string) => comps.find((c) => c.id === id);
  const set = (key: string, patch: Partial<AdjRow>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); };
  const earnings = rows.filter((r) => compOf(r.componentId)?.componentType === "EARNING").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const deductions = rows.filter((r) => compOf(r.componentId)?.componentType === "DEDUCTION").reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const saveRows = async () => {
    const r = await savePayrollAdjustments(run.id, rows.filter((x) => x.employeeId && x.componentId && Number(x.amount) > 0).map((x) => ({
      ...(x.id && { id: x.id }), employeeId: x.employeeId, componentId: x.componentId, amount: Number(x.amount), isTaxable: x.isTaxable, remarks: x.remarks || null,
      quantity: x.quantity, inputSource: x.inputSource === "CSV_IMPORT" ? "CSV_IMPORT" : "MANUAL",
    })), run.rowVersion);
    setRows(fromRun(r)); setDirty(false);
    return r;
  };
  const act = async (what: string, fn: () => Promise<PayrollRun | void>, next?: number) => {
    setBusy(what);
    try { const r = await fn(); if (r) onRun(r, next); } catch (e) { toast(payrollError(e), { tone: "danger" }); } finally { setBusy(null); }
  };
  const importCsv = async (f: File) => {
    const text = await f.text();
    const lines = text.split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))).filter((l) => l.length >= 3 && l[0]);
    const add: AdjRow[] = [];
    let bad = 0;
    for (const [code, comp, amount, taxable, ...rest] of lines) {
      const e = opts.employees.find((x) => x.code.toLowerCase() === code!.toLowerCase());
      const c = comps.find((x) => x.code.toLowerCase() === comp!.toLowerCase() || x.name.toLowerCase() === comp!.toLowerCase());
      if (!e || !c || !(Number(amount) > 0)) { bad++; continue; }
      add.push({ key: `csv-${Math.random()}`, employeeId: e.id, componentId: c.id, amount: String(Number(amount)), isTaxable: !/^(n|no|false|0)$/i.test(taxable ?? ""), remarks: rest.join(", "), inputSource: "CSV_IMPORT", quantity: null });
    }
    setRows((rs) => [...rs, ...add]); setDirty(true);
    toast(`${f.name}: ${add.length} row${add.length === 1 ? "" : "s"} added${bad ? ` · ${bad} skipped (header or unknown code)` : ""}`, { tone: bad && !add.length ? "warn" : "good" });
  };

  return (
    <div className="wz-pane active">
      {!inp && (
        <>
          <div className="mb"><Banner tone="info" title="Inputs are frozen">They were taken when {run.docNo} was submitted; the figures below come from the calculated lines.</Banner></div>
          <div className="kpi-grid mb">
            <PayrollKpi tone="teal" label="Employees" icon={<Fingerprint />} value={run.lines.length} sub={<small>{run.lines.filter((l) => l.flags.includes("PRO_RATA")).length} paid pro-rata</small>} />
            <PayrollKpi tone="blue" label="Approved Overtime" icon={<Timer />} value={`${payrollMoney(run.lines.reduce((s, l) => s + l.overtimeHours, 0), 1)} hrs`} sub={<small>{run.lines.filter((l) => l.overtimeHours > 0).length} employees</small>} />
            <PayrollKpi tone="yellow" label="Unpaid Days" icon={<CalendarX />} value={`${payrollMoney(run.lines.reduce((s, l) => s + l.lwpDays, 0), 1)} days`} sub={<small>{run.lines.filter((l) => l.lwpDays > 0).length} employees · absences and leave without pay</small>} />
            <PayrollKpi tone="violet" label="Loan Installments" icon={<HandCoins />} value={payrollRs(run.loanAmount)} sub={<small>{run.lines.filter((l) => l.loanAmount > 0).length} employees</small>} />
          </div>
        </>
      )}
      {inp && (<>
      <div className="kpi-grid mb">
        <PayrollKpi tone="teal" label="Attendance Sync" icon={<Fingerprint />} value={`${inp?.attendance.withRegister ?? 0} / ${inp?.attendance.employees ?? 0}`} sub={<small>{inp?.attendance.missingPunches.length ?? 0} missing punches · {inp?.attendance.absentDays ?? 0} absent days</small>} />
        <PayrollKpi tone="blue" label="Approved Overtime" icon={<Timer />} value={`${payrollMoney(inp?.overtime.hours ?? 0, 1)} hrs`} sub={<small>Rs {payrollMoney(inp?.overtime.amount ?? 0)} · {inp?.overtime.employees ?? 0} employees</small>} />
        <PayrollKpi tone="yellow" label="Unpaid Leave" icon={<CalendarX />} value={`${payrollMoney(inp?.unpaidLeave.days ?? 0, 1)} days`} sub={<small>{inp?.unpaidLeave.employees ?? 0} employees · deducted pro-rata</small>} />
        <PayrollKpi tone="violet" label="Loan Installments" icon={<HandCoins />} value={payrollRs(inp?.loans.amount ?? 0)} sub={<small>{inp?.loans.loans ?? 0} active loans &amp; advances</small>} />
      </div>

      <div className="grid-2 mb">
        <div className="panel">
          <div className="panel-head"><div><h3>Input Sources</h3><p>Pulled automatically from HR modules</p></div>
            {editable && <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => act("sync", async () => { const r = await syncPayrollInputs(run.id); toast("Inputs re-synced", { tone: "good" }); setRows(fromRun(r)); return r; })}><RefreshCw />{busy === "sync" ? "Syncing…" : "Re-sync"}</button>}
          </div>
          <div className="list">
            <Source icon={<Fingerprint />} title="Attendance register" sub={`${inp?.attendance.withRegister ?? 0} of ${inp?.attendance.employees ?? 0} employees have register days · ${inp?.attendance.missingPunches.length ?? 0} missing punches`}
              badge={inp?.attendance.missingPunches.length ? <Badge tone="warn">{inp.attendance.missingPunches.length} issues</Badge> : <Badge tone="good">Ready</Badge>} />
            <Source icon={<Timer />} title="Overtime" sub={`${inp?.overtime.claims ?? 0} approved claims pushed${inp?.overtime.pending ? ` · ${inp.overtime.pending} still pending approval` : ""}`}
              badge={inp?.overtime.unpushed ? <Badge tone="info">{inp.overtime.unpushed} to sync</Badge> : inp?.overtime.pending ? <Badge tone="warn">{inp.overtime.pending} pending</Badge> : <Badge tone="good">Ready</Badge>} />
            <Source icon={<Plane />} title="Leave without pay" sub={`${inp?.unpaidLeave.employees ?? 0} employees · ${payrollMoney(inp?.unpaidLeave.days ?? 0, 1)} days`} badge={<Badge tone="good">Ready</Badge>} />
            <Source icon={<HandCoins />} title="Loans & advances" sub={`${inp?.loans.installments ?? 0} installments due${inp?.loans.pending ? ` · ${inp.loans.pending} requests awaiting approval or disbursement` : ""}`}
              badge={inp?.loans.pending ? <Badge tone="info">{inp.loans.pending} pending</Badge> : <Badge tone="good">Ready</Badge>} />
            <Source icon={<TrendingUp />} title="Salary revisions" sub={`${inp?.revisions ?? 0} revisions effective in the period`} badge={<Badge tone="good">Applied</Badge>} />
          </div>
          <div className="row mt">
            <Link className="btn secondary sm" href="/hr/attendance/register"><CalendarDays />Fix attendance</Link>
            <Link className="btn secondary sm" href="/hr/overtime"><Timer />Overtime</Link>
            <Link className="btn secondary sm" href="/hr/loans"><HandCoins />Loans</Link>
          </div>
        </div>
        <div className="panel flush">
          <div className="panel-head"><div><h3>Missing Punches</h3><p>Treated as present unless the register is corrected</p></div></div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Employee</th><th>Date</th><th>Treated as</th></tr></thead>
            <tbody>
              {inp?.attendance.missingPunches.length ? inp.attendance.missingPunches.map((m) => (
                <tr key={`${m.employee.id}-${m.date}`}><td><Person e={m.employee} sub={`${m.employee.code}${m.employee.department ? ` · ${m.employee.department}` : ""}`} /></td><td>{dmy(m.date).slice(0, 6)}</td><td>Present</td></tr>
              )) : <tr><td colSpan={3} className="muted">No missing punches in the period.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>

      </>)}
      <div className="panel flush mb">
        <div className="panel-head"><div><h3>Arrears, Bonuses &amp; One-time Adjustments</h3><p>Enter amounts for this run only. Approved overtime arrives here on its own.</p></div>
          {editable && <div className="panel-actions">
            <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
            <button type="button" className="btn secondary sm" onClick={() => file.current?.click()} title="CSV columns: employee code, component code, amount, taxable (yes/no), remarks"><Upload />Import CSV</button>
            <button type="button" className="btn secondary sm" onClick={() => { setRows((rs) => [...rs, { key: `new-${Math.random()}`, employeeId: "", componentId: "", amount: "", isTaxable: true, remarks: "", inputSource: "MANUAL", quantity: null }]); setDirty(true); }}><Plus />Add line</button>
          </div>}
        </div>
        <div className="table-wrap"><table className="tbl lines">
          <thead><tr><th>Employee</th><th>Component</th><th>Type</th><th className="num">Amount (Rs)</th><th>Taxable</th><th>Remarks</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const c = compOf(r.componentId);
              const auto = r.inputSource === "OVERTIME";
              return (
                <tr key={r.key}>
                  <td>{editable && !auto ? <select className="cell-input" value={r.employeeId} onChange={(e) => set(r.key, { employeeId: e.target.value })}><option value="">Choose…</option>{opts.employees.filter((e) => e.hasSalary || e.id === r.employeeId).map((e) => <option key={e.id} value={e.id}>{e.name} · {e.code}</option>)}</select>
                    : <Person e={opts.employees.find((e) => e.id === r.employeeId) ?? { name: "?", code: "?" }} />}</td>
                  <td>{editable && !auto ? <select className="cell-input" value={r.componentId} onChange={(e) => { const nc = compOf(e.target.value); set(r.key, { componentId: e.target.value, isTaxable: nc ? nc.componentType === "EARNING" && nc.taxable : r.isTaxable }); }}><option value="">Choose…</option>{comps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select> : <>{c?.name ?? "?"}{auto && <small className="muted"> · from overtime</small>}</>}</td>
                  <td>{c ? <Badge tone={c.componentType === "EARNING" ? "good" : "warn"}>{c.componentType === "EARNING" ? "Earning" : "Deduction"}</Badge> : "—"}</td>
                  <td>{editable ? <input className="cell-input num" inputMode="decimal" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value.replace(/[^0-9.]/g, "") })} /> : <span className="num">{payrollMoney(Number(r.amount))}</span>}</td>
                  <td><input type="checkbox" checked={r.isTaxable} disabled={!editable || c?.componentType !== "EARNING"} onChange={(e) => set(r.key, { isTaxable: e.target.checked })} aria-label="Taxable" /></td>
                  <td>{editable ? <input className="cell-input" value={r.remarks} onChange={(e) => set(r.key, { remarks: e.target.value })} /> : r.remarks}</td>
                  <td className="actions">{editable && <button type="button" className="icon-btn-sm" aria-label="Remove" onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); setDirty(true); }}><Trash2 /></button>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="muted">No adjustments for this run.</td></tr>}
            <tr className="total"><td colSpan={3}>Net one-time adjustments</td><td className="num">{payrollMoney(earnings - deductions)}</td><td colSpan={3}><span className="muted small">Earnings {payrollMoney(earnings)} · Deductions {payrollMoney(deductions)}</span></td></tr>
          </tbody>
        </table></div>
      </div>
      {dirty && <div className="mb"><Banner tone="info" title="Unsaved adjustments">Save them, or calculate: calculating saves them first.</Banner></div>}
      {run.calculatedAt === null && run.status === "DRAFT" && run.lines.length > 0 && <div className="mb"><Banner tone="warn" title="Inputs changed since the last calculation">Calculate again before submitting.</Banner></div>}
      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onBack}>Back</button>
        {editable && dirty && <button type="button" className="btn secondary" disabled={!!busy} onClick={() => act("save", saveRows)}>{busy === "save" ? "Saving…" : "Save adjustments"}</button>}
        {editable
          ? <button type="button" className="btn primary" disabled={!!busy} onClick={() => act("calc", async () => { if (dirty) await saveRows(); const r = await calculatePayrollRun(run.id); toast(`${r.docNo} calculated · ${r.employeeCount} employees`, { tone: "good" }); return r; }, 3)}>{busy === "calc" ? "Calculating…" : "Calculate & review"}</button>
          : <button type="button" className="btn primary" onClick={() => onRun(run, 3)}>Continue to review</button>}
      </div>
    </div>
  );
}

function Source({ icon, title, sub, badge }: { icon: ReactNode; title: string; sub: string; badge: ReactNode }) {
  return <div className="list-item"><span className="icon-well">{icon}</span><div><b>{title}</b><small>{sub}</small></div><span className="spacer" />{badge}</div>;
}
