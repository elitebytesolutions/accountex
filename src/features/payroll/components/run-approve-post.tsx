"use client";

import { Banknote, Check, CircleCheck, Eye, FileDown, Landmark, Printer, Send, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { PayrollRun, RunOptions } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { Banner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dmy, monthLabel } from "@/features/hr/components/attendance-ui";
import { ApiError } from "@/lib/api/errors";
import { approvePayrollRun, cancelPayrollRun, payPayrollRun, payrollBankAdviceUrl, postPayrollRun, rejectPayrollRun, reversePayrollRun, sendBackPayrollRun, setPayrollChecklist } from "../run-api";
import { payrollError, payrollMoney, payrollRs, type PayrollRunCan } from "./run-ui";

const when = (iso: string | null | undefined) => (iso ? `${dmy(iso.slice(0, 10))} ${iso.slice(11, 16)}` : "");
const METHOD: Record<string, string> = { BULK_UPLOAD: "Bulk salary upload", IBFT: "IBFT", CHEQUE: "Cheque", CASH: "Cash" };

// ---------------------------------------------------------------- step 4
/** Step 4: the approval trail (engine steps and actions), the approver's decision and the pre-posting checklist. */
export function RunApproveStep({ run, onRun, onBack, onNext }: { run: PayrollRun; onRun: (r: PayrollRun, next?: number) => void; onBack: () => void; onNext: () => void }) {
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const a = run.approval;
  const checklistOpen = ["REVIEW", "AWAITING_APPROVAL", "APPROVED"].includes(run.status);
  const done = run.checklist.filter((c) => c.isDone).length;

  const decide = async (what: "approve" | "reject" | "back") => {
    if (what !== "approve" && comment.trim().length < 3) { toast("Give a reason in the comment box", { tone: "warn" }); return; }
    setBusy(what);
    try {
      const r = what === "approve" ? await approvePayrollRun(run.id, comment.trim() || null) : what === "reject" ? await rejectPayrollRun(run.id, comment.trim()) : await sendBackPayrollRun(run.id, comment.trim());
      setComment("");
      toast(what === "approve" ? (r.status === "APPROVED" ? `${r.docNo} approved` : `Approved — waiting on ${r.waitingOn ?? "the next step"}`) : what === "reject" ? `${r.docNo} rejected` : "Sent back to HR for correction", { tone: what === "approve" ? "good" : "warn" });
      onRun(r, r.status === "APPROVED" ? 5 : what === "back" ? 3 : undefined);
    } catch (e) {
      toast(e instanceof ApiError && e.status === 403 ? `Not allowed: ${e.message}` : payrollError(e), { tone: "danger" });
    } finally { setBusy(null); }
  };
  const toggle = async (key: string, on: boolean) => {
    try { onRun(await setPayrollChecklist(run.id, key, on)); } catch (e) { toast(payrollError(e), { tone: "danger" }); }
  };

  const decisions = a?.actions.filter((x) => ["REJECT", "REQUEST_CHANGES", "CANCEL"].includes(x.action)) ?? [];
  return (
    <div className="wz-pane active">
      <div className="split">
        <div className="panel">
          <div className="panel-head"><div><h3>Approval Workflow</h3><p>{a ? `${a.workflow.name} · the preparer never approves (Settings → Approval Workflows)` : "No workflow applies: a user with payroll approval rights approves it"}</p></div><Link className="btn ghost sm" href="/settings/approvals">Configure</Link></div>
          <div className="timeline">
            <div className="tl-item"><span className={`tl-dot ${run.preparedAt ? "good" : ""}`} /><div><b>Prepared — {run.preparedBy?.name ?? run.createdBy?.name ?? "—"}</b><small>{run.preparedAt ? `${when(run.preparedAt)} · inputs frozen, ${run.employeeCount} employees calculated` : `Not submitted yet${run.calculatedAt ? ` · calculated ${when(run.calculatedAt)}` : ""}`}</small></div></div>
            {a?.steps.map((s) => {
              const act = a.actions.filter((x) => x.stepNo === s.stepNo && x.action === "APPROVE").at(-1);
              return (
                <div key={s.stepNo} className="tl-item">
                  <span className={`tl-dot ${s.state === "done" ? "good" : s.state === "current" ? "warn" : ""}`} />
                  <div><b>{s.name} — {s.actedBy.length ? s.actedBy.map((x) => x.name).join(", ") : s.approvers.map((x) => x.name).join(", ") || "no approver"}</b>
                    <small>{s.state === "done" && act ? `${when(act.actedAt)}${act.comment ? ` · "${act.comment}"` : ""}` : s.state === "current" ? "Awaiting decision" : s.state === "skipped" ? "Skipped — no approver" : "Waiting"}</small></div>
                </div>
              );
            })}
            {!a && run.status === "AWAITING_APPROVAL" && <div className="tl-item"><span className="tl-dot warn" /><div><b>Approval — payroll approver</b><small>Awaiting decision</small></div></div>}
            {decisions.map((x) => <div key={x.id} className="tl-item"><span className="tl-dot danger" /><div><b>{x.action === "REJECT" ? "Rejected" : x.action === "CANCEL" ? "Withdrawn" : "Sent back"} — {x.actor?.name ?? "—"}</b><small>{when(x.actedAt)}{x.reason ? ` · "${x.reason}"` : ""}</small></div></div>)}
            {run.approvedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Approved — {run.approvedBy?.name}</b><small>{when(run.approvedAt)} · attendance for {monthLabel(run.payrollMonth.slice(0, 7))} locked for payroll</small></div></div>}
          </div>
          {run.status === "AWAITING_APPROVAL" && (
            <>
              <div className="form-grid mt"><label className="full"><span>Approver comment</span><Textarea rows={3} placeholder="Add a note for the next approver (required to send back or reject)…" value={comment} onChange={(e) => setComment(e.target.value)} /></label></div>
              {run.can.approve
                ? <div className="row mt">
                    <button type="button" className="btn primary" disabled={!!busy} onClick={() => decide("approve")}><Check />{busy === "approve" ? "Approving…" : "Approve"}</button>
                    <button type="button" className="btn secondary" disabled={!!busy} onClick={() => decide("back")}><Undo2 />Send back</button>
                    <button type="button" className="btn danger" disabled={!!busy} onClick={() => decide("reject")}><X />Reject</button>
                  </div>
                : <p className="muted small mt">Waiting on {run.waitingOn ?? "an approver"}. {(run.preparedBy?.id ?? run.createdBy?.id) ? "The preparer can’t approve their own run." : ""}</p>}
            </>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Pre-posting Checklist</h3><p>{done} of {run.checklist.length} complete</p></div></div>
          <div className="progress mb"><i style={{ width: `${run.checklist.length ? (done / run.checklist.length) * 100 : 0}%` }} /></div>
          <div className="stack">
            {run.checklist.map((c) => (
              <label key={c.itemKey} className="check" title={c.doneBy ? `${c.doneBy.name} · ${when(c.doneAt)}` : undefined}>
                <input type="checkbox" checked={c.isDone} disabled={!checklistOpen} onChange={(e) => void toggle(c.itemKey, e.target.checked)} /> {c.label}
                {c.doneBy && <small className="muted"> · {c.doneBy.name}</small>}
              </label>
            ))}
            {!run.checklist.length && <p className="muted small">The checklist appears when the run is calculated.</p>}
          </div>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onBack}>Back</button>
        <button type="button" className="btn primary" disabled={!["APPROVED", "POSTED", "PAID", "REVERSED"].includes(run.status)} onClick={onNext}>Continue to post</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- step 5
/** Step 5: GL preview, post (accrual journal, payslips), pay by batch (bank / cash voucher), bank advice, cancel / reverse. */
export function RunPostStep({ run, opts, can, onRun, onBack }: { run: PayrollRun; opts: RunOptions; can: PayrollRunCan; onRun: (r: PayrollRun, next?: number) => void; onBack: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [publish, setPublish] = useState(run.publishToEss);
  const [reminders, setReminders] = useState(run.createDepositReminders);
  const defaultBank = opts.bankAccounts.find((b) => b.useForPayroll) ?? opts.bankAccounts[0];
  const [pay, setPay] = useState({ paymentMethod: defaultBank ? "IBFT" : "CASH", bankAccountId: defaultBank?.id ?? "", cashAccountId: opts.cashAccounts[0]?.id ?? "", valueDate: run.payDate, instructionRef: "", which: "ALL" });
  const [reason, setReason] = useState<{ kind: "cancel" | "reverse"; text: string } | null>(null);
  const dr = run.glPreview.reduce((s, l) => s + l.debit, 0);
  const cr = run.glPreview.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.abs(dr - cr) < 0.005;
  const unpaid = run.lines.filter((l) => !l.paid && !l.isOnHold && l.netAmount > 0);
  const modes = [...new Set(unpaid.map((l) => l.payMode))];
  const selected = unpaid.filter((l) => pay.which === "ALL" || l.payMode === pay.which);
  const byMode = (m: string) => run.lines.filter((l) => l.payMode === m && !l.isOnHold);

  const go = async (what: string, fn: () => Promise<PayrollRun>, msg: (r: PayrollRun) => string) => {
    setBusy(what);
    try { const r = await fn(); toast(msg(r), { tone: "good" }); onRun(r); return true; } catch (e) { toast(payrollError(e), { tone: "danger" }); return false; } finally { setBusy(null); }
  };
  const doPay = () => go("pay", () => payPayrollRun(run.id, {
    paymentMethod: pay.paymentMethod, bankAccountId: pay.paymentMethod === "CASH" ? null : pay.bankAccountId, cashAccountId: pay.paymentMethod === "CASH" ? pay.cashAccountId : null,
    valueDate: pay.valueDate, instructionRef: pay.instructionRef || null, fileFormat: "CSV", lineIds: selected.map((l) => l.id),
  }), (r) => `${selected.length} salar${selected.length === 1 ? "y" : "ies"} paid · ${r.batches.at(-1)?.voucher?.docNo ?? "voucher posted"}${r.status === "PAID" ? ` · ${r.docNo} paid` : ""}`);

  return (
    <div className="wz-pane active">
      <div className="split mb">
        <div className="panel flush">
          <div className="panel-head"><div><h3>GL Journal Preview</h3><p>{run.journal ? `${run.journal.docNo} · ` : ""}Dated {dmy(run.payDate)} · Narration: {run.narration ?? `Payroll ${monthLabel(run.payrollMonth.slice(0, 7))} (${run.docNo})`}</p></div><Badge tone={balanced ? "info" : "danger"}>{balanced ? "Balanced" : "Out of balance"}</Badge></div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Account</th><th>Cost centre</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
            <tbody>
              {run.glPreview.map((l) => (
                <tr key={`${l.account.id}-${l.debit ? "d" : "c"}`}>
                  <td style={{ whiteSpace: "normal" }}><b>{l.account.code}</b> {l.account.name}<small title={l.detail ?? undefined}>{l.particulars}</small></td><td>{l.debit ? "By department" : "—"}</td>
                  {l.debit ? <td className="num dr">{payrollMoney(l.debit, 2)}</td> : <td className="num zero">—</td>}
                  {l.credit ? <td className="num cr">{payrollMoney(l.credit, 2)}</td> : <td className="num zero">—</td>}
                </tr>
              ))}
              {!run.glPreview.length && <tr><td colSpan={4} className="muted">Calculate the run to preview its journal.</td></tr>}
              <tr className="total"><td colSpan={2}>Total</td><td className="num">{payrollMoney(dr, 2)}</td><td className="num">{payrollMoney(cr, 2)}</td></tr>
            </tbody>
          </table></div>
        </div>
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Salary Payments</h3><p>Net pay {payrollRs(run.netAmount, 2)}{unpaid.length && run.status === "POSTED" ? ` · ${unpaid.length} unpaid` : ""}</p></div></div>
            <div className="list">
              {run.batches.map((b) => (
                <div key={b.id} className="list-item"><span className="icon-well">{b.paymentMethod === "CASH" ? <Banknote /> : <Landmark />}</span>
                  <div style={{ minWidth: 0 }}><b>{METHOD[b.paymentMethod]}{b.status === "FAILED" ? " · reversed" : ""}</b><small>{b.employeeCount} employee{b.employeeCount === 1 ? "" : "s"} · {b.bankAccount?.name ?? "Cash"} · {b.voucher ? <Link className="link" href={`/accounting/vouchers/${b.voucher.id}`}>{b.voucher.docNo}</Link> : "no voucher"}{b.instructionRef ? ` · ref ${b.instructionRef}` : ""}</small></div>
                  <span className="spacer" /><b style={{ flex: "none", overflow: "visible" }}>{payrollMoney(b.totalAmount)}</b></div>
              ))}
              {!run.batches.length && ["BANK_TRANSFER", "CHEQUE", "CASH"].map((m) => byMode(m).length > 0 && (
                <div key={m} className="list-item"><span className="icon-well">{m === "CASH" ? <Banknote /> : <Landmark />}</span>
                  <div><b>{m === "BANK_TRANSFER" ? "Bank transfer" : m === "CHEQUE" ? "Cheque" : "Cash"}</b><small>{byMode(m).length} employee{byMode(m).length === 1 ? "" : "s"}{m === "BANK_TRANSFER" ? ` · ${byMode(m).filter((l) => !l.ibanMasked).length} without IBAN` : ""}</small></div>
                  <span className="spacer" /><b style={{ flex: "none", overflow: "visible" }}>{payrollMoney(byMode(m).reduce((s, l) => s + l.netAmount, 0))}</b></div>
              ))}
            </div>
            {run.status === "POSTED" && run.can.pay && (
              <div className="mt"><FormGrid>
                <Field label="Pay"><Select value={pay.which} onChange={(e) => setPay({ ...pay, which: e.target.value })}><option value="ALL">All unpaid ({unpaid.length})</option>{modes.map((m) => <option key={m} value={m}>{m === "BANK_TRANSFER" ? "Bank transfer" : m === "CHEQUE" ? "Cheque" : "Cash"} lines ({unpaid.filter((l) => l.payMode === m).length})</option>)}</Select></Field>
                <Field label="Method"><Select value={pay.paymentMethod} onChange={(e) => setPay({ ...pay, paymentMethod: e.target.value })}><option value="IBFT">IBFT</option><option value="BULK_UPLOAD">Bulk salary upload</option><option value="CHEQUE">Cheque</option><option value="CASH">Cash</option></Select></Field>
                {pay.paymentMethod === "CASH"
                  ? <Field label="Cash account"><Select value={pay.cashAccountId} onChange={(e) => setPay({ ...pay, cashAccountId: e.target.value })}>{opts.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                  : <Field label="Bank account"><Select value={pay.bankAccountId} onChange={(e) => setPay({ ...pay, bankAccountId: e.target.value })}><option value="">Choose…</option>{opts.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}{b.last4 ? ` — ${b.last4}` : ""}</option>)}</Select></Field>}
                <Field label="Value date"><Input type="date" value={pay.valueDate} onChange={(e) => setPay({ ...pay, valueDate: e.target.value })} /></Field>
                <Field label={pay.paymentMethod === "CHEQUE" ? "Cheque no." : "Reference"} full><Input value={pay.instructionRef} maxLength={60} onChange={(e) => setPay({ ...pay, instructionRef: e.target.value })} placeholder="Bank instruction or transfer reference" /></Field>
              </FormGrid></div>
            )}
            <div className="row mt">
              {run.status === "POSTED" && run.can.pay && <button type="button" className="btn primary sm" disabled={!!busy || !selected.length} onClick={() => void doPay()}><Send />{busy === "pay" ? "Paying…" : `Pay ${payrollRs(selected.reduce((s, l) => s + l.netAmount, 0))}`}</button>}
              {["POSTED", "PAID"].includes(run.status) && can.export && <a className="btn secondary sm" href={payrollBankAdviceUrl(run.id)} download><FileDown />Bank advice (CSV)</a>}
              {["POSTED", "PAID"].includes(run.status) && <Link className="btn ghost sm" href={`/hr/payroll/payslips?run=${run.id}`}><Printer />Payslips</Link>}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>After posting</h3></div></div>
            <div className="stack">
              <Switch disabled checked={false} readOnly label="Email payslips (PDF) — arrives with Phase 29" />
              <Switch checked={publish} disabled={run.status !== "APPROVED"} onChange={(e) => setPublish(e.target.checked)} label="Publish to Employee Self-Service" />
              <Switch disabled checked={false} readOnly label="SMS net-pay alert — arrives with Phase 29" />
              <Switch checked={reminders} disabled={run.status !== "APPROVED"} onChange={(e) => setReminders(e.target.checked)} label={`Create tax & EOBI deposit reminders (15 ${monthLabel(run.payrollMonth.slice(0, 7)).split(" ")[0]!.slice(0, 3) === "Dec" ? "Jan" : "next month"})`} />
            </div>
          </div>
        </div>
      </div>
      {run.status === "APPROVED" && <div className="mb"><Banner tone="good" title={`Approved by ${run.approvedBy?.name ?? "—"}`}>Posting creates the journal for {run.docNo}, marks {run.lines.reduce((s, l) => s + (l.loanAmount ? 1 : 0), 0)} loan installment(s) as recovered and generates {run.lines.length} payslips.</Banner></div>}
      {run.status === "POSTED" && <div className="mb"><Banner tone="info" title={`Posted · ${run.journal?.docNo ?? ""}`}>Pay the salaries batch by batch; the run is marked paid when every line is paid.</Banner></div>}
      {run.status === "PAID" && <div className="mb"><Banner tone="good" title={`Paid${run.paidAt ? ` ${dmy(run.paidAt.slice(0, 10))}` : ""}`}>{run.batches.length} payment batch{run.batches.length === 1 ? "" : "es"} · journal {run.journal?.docNo}.</Banner></div>}
      {run.status === "REVERSED" && run.reversalJournal && <div className="mb"><Banner tone="warn" title={`Reversed by ${run.reversalJournal.docNo}`}>Payment vouchers were reversed too; payslips are on hold.</Banner></div>}
      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onBack}>Back</button>
        {run.can.cancel && <button type="button" className="btn secondary" onClick={() => setReason({ kind: "cancel", text: "" })}><X />Cancel run</button>}
        {run.can.reverse && <button type="button" className="btn danger" onClick={() => setReason({ kind: "reverse", text: "" })}><Undo2 />Reverse</button>}
        {["POSTED", "PAID"].includes(run.status) && <Link className="btn secondary" href={`/hr/payroll/payslips?run=${run.id}`}><Eye />Payslips</Link>}
        {run.can.post && <button type="button" className="btn primary" disabled={!!busy || !balanced} onClick={() => void go("post", () => postPayrollRun(run.id, { publishToEss: publish, createDepositReminders: reminders }), (r) => `${r.docNo} posted · ${r.journal?.docNo ?? "journal"} created · ${r.lines.length} payslips`)}><CircleCheck />{busy === "post" ? "Posting…" : "Post to GL"}</button>}
      </div>
      <Modal open={!!reason} onClose={() => setReason(null)} title={reason?.kind === "reverse" ? `Reverse ${run.docNo}?` : `Cancel ${run.docNo}?`}
        subtitle={reason?.kind === "reverse" ? "Mirror journal dated the pay date; payment vouchers reversed; installments rescheduled; payslips put on hold." : "Overtime and attendance are released for a new run."}
        foot={<><button type="button" className="btn secondary" onClick={() => setReason(null)}>Keep</button>
          <button type="button" className="btn danger solid" disabled={!!busy || (reason?.text.trim().length ?? 0) < 3} onClick={async () => {
            if (!reason) return;
            const ok = await go(reason.kind, () => (reason.kind === "reverse" ? reversePayrollRun(run.id, reason.text.trim()) : cancelPayrollRun(run.id, reason.text.trim())), (r) => `${r.docNo} ${r.status.toLowerCase()}`);
            if (ok) setReason(null);
          }}>{busy ? "Working…" : reason?.kind === "reverse" ? "Reverse run" : "Cancel run"}</button></>}>
        <FormGrid cols={1}><Field label="Reason" required><Textarea rows={3} value={reason?.text ?? ""} onChange={(e) => reason && setReason({ ...reason, text: e.target.value })} /></Field></FormGrid>
      </Modal>
    </div>
  );
}
