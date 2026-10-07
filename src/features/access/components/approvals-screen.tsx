"use client";

import {
  ArrowRight, CircleCheck, ClipboardList, FilePlus, FlaskConical, History, Plane, Plus, Receipt, ReceiptText, Send, ShieldAlert, Trash2,
  UserRound, WalletCards, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NUMERIC_CONDITION_FIELDS, type Delegation, type Workflow, type WorkflowDryRunResult, type WorkflowSave, type WorkflowSaveFields } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Input, Select, Switch } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Panel } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { initialsOf } from "@/features/auth/initials";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import {
  createDelegation, createWorkflow, deleteDelegation, deleteWorkflow, listApprovers, listDelegations, listWorkflows, testWorkflow, updateDelegation,
  updateWorkflow, workflowAction,
} from "../api";
import { rs } from "./access-ui";

const LOOKUPS = ["Subject", "ApprovalWorkflowConditionField", "ApprovalWorkflowConditionOperator", "OnComplete", "OnReject", "OnSlaBreach", "ApprovalMode"];
const SUBJECT_LOOK: Record<string, [LucideIcon, string]> = {
  VOUCHER: [ReceiptText, ""], VENDOR_PAYMENT: [Send, "blue"], VENDOR_BILL: [Receipt, "blue"], PURCHASE_ORDER: [ClipboardList, "yellow"],
  EXPENSE_CLAIM: [Receipt, "violet"], LEAVE_REQUEST: [Plane, "teal"], PAYROLL_RUN: [WalletCards, "violet"], CREDIT_OVERRIDE: [ShieldAlert, "red"],
};
const STATUS_TONE: Record<string, "good" | "neutral" | "warn"> = { ACTIVE: "good", DRAFT: "neutral", INACTIVE: "warn" };

type Step = WorkflowSave["steps"][number];
type Cond = { field: string; operator: string; text: string };
type Form = Omit<WorkflowSave, "conditions"> & { conditions: Cond[] };
type People = { roles: { id: string; name: string }[]; users: { id: string; name: string }[] };

const newStep = (people: People, n: number): Step => ({
  name: `Step ${n}`, approverType: "ROLE", approverRoleId: people.roles[0]?.id ?? null, approverUserId: null, appliesAboveAmount: null,
  slaHours: 8, onSlaBreach: "ESCALATE", approvalMode: "ANY", blockSelfApproval: true, allowDelegation: true, requireComment: false,
});
const blankForm = (): Form => ({
  name: "", subject: "VOUCHER", description: null, priority: 100, onComplete: "AUTO_POST", onReject: "RETURN_TO_PREPARER",
  notifyPreparer: true, notifyInApp: true, notifyEmail: true, notifyWhatsapp: false, steps: [], conditions: [],
});
const asText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : String(v));
const toForm = (w: Workflow): Form => ({
  name: w.name, subject: w.subject, description: w.description, priority: w.priority, onComplete: w.onComplete, onReject: w.onReject,
  notifyPreparer: w.notifyPreparer, notifyInApp: w.notifyInApp, notifyEmail: w.notifyEmail, notifyWhatsapp: w.notifyWhatsapp,
  steps: w.steps.map((s) => ({
    name: s.name, approverType: s.approverType, approverRoleId: s.approverRoleId, approverUserId: s.approverUserId, appliesAboveAmount: s.appliesAboveAmount,
    slaHours: s.slaHours, onSlaBreach: s.onSlaBreach, approvalMode: s.approvalMode, blockSelfApproval: s.blockSelfApproval,
    allowDelegation: s.allowDelegation, requireComment: s.requireComment,
  })),
  conditions: w.conditions.map((c) => ({ field: c.field, operator: c.operator, text: asText(c.value) })),
});
/** "500,000" / "JV, CPV" → the value the API stores for this field and operator. */
function parseValue(c: Cond): number | string | (number | string)[] {
  const numeric = (NUMERIC_CONDITION_FIELDS as readonly string[]).includes(c.field);
  const one = (s: string) => (numeric ? Number(s.replace(/[^\d.-]/g, "")) : s.trim().toUpperCase());
  const list = ["IN", "NOT_IN", "BETWEEN"].includes(c.operator);
  return list ? c.text.split(/[,;]|\s+to\s+/i).map((x) => x.trim()).filter(Boolean).map(one) : one(c.text);
}
const stepsLine = (w: Workflow) => (w.steps.length ? `${w.steps.length} step${w.steps.length === 1 ? "" : "s"} · ${w.steps.map((s) => s.approverLabel.replace("Role: ", "")).join(" → ")}` : "No steps yet");

/** Template app/settings/approvals: workflow cards, builder with steps and conditions, step settings, notifications. */
export function ApprovalsScreen({ can }: { can: { create: boolean; edit: boolean; remove: boolean } }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [people, setPeople] = useState<People>({ roles: [], users: [] });
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [stepIx, setStepIx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "deactivate" | null>(null);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listWorkflows(), listApprovers()])
      .then(([w, p]) => {
        if (cancelled) return;
        setWorkflows(w);
        setPeople(p);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load workflows" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const current = workflows?.find((w) => w.id === sel) ?? null;
  const open = useCallback((w: Workflow | "new") => {
    setSel(w === "new" ? "new" : w.id);
    setForm(w === "new" ? blankForm() : toForm(w));
    setStepIx(0);
  }, []);
  // Open the first workflow once loaded.
  if (workflows?.length && sel === null) open(workflows[0]!);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setStep = (i: number, patch: Partial<Step>) => setForm((f) => (f ? { ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : f));
  const setCond = (i: number, patch: Partial<Cond>) => setForm((f) => (f ? { ...f, conditions: f.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : f));

  const save = async (publish: boolean) => {
    if (!form) return;
    setBusy(true);
    try {
      const body: WorkflowSaveFields = { ...form, conditions: form.conditions.map((c) => ({ field: c.field, operator: c.operator, value: parseValue(c) })) };
      let saved = current ? await updateWorkflow(current.id, { ...body, rowVersion: current.rowVersion }) : await createWorkflow(body);
      if (publish && saved.status !== "ACTIVE") saved = await workflowAction(saved.id, "publish", saved.rowVersion);
      toast(publish ? `${saved.name} published` : `${saved.name} saved${saved.status === "DRAFT" ? " as draft" : ""}`, { tone: "good" });
      setWorkflows((ws) => (ws ? [...ws.filter((w) => w.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)) : ws));
      setSel(saved.id);
      setForm(toForm(saved));
    } catch (e) {
      toast(e instanceof ApiError ? (e.details ? `${e.message}: ${Object.entries(e.details).map(([k, v]) => `${k} ${v[0]}`).join("; ")}` : e.message) : "Could not save", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const act = async () => {
    if (!current || !confirm) return;
    setBusy(true);
    try {
      if (confirm === "delete") {
        await deleteWorkflow(current.id, current.rowVersion);
        toast(`${current.name} deleted`, { tone: "good" });
        setSel(null);
        setForm(null);
      } else {
        const w = await workflowAction(current.id, "deactivate", current.rowVersion);
        toast(`${w.name} deactivated`, { tone: "good" });
      }
      setConfirm(null);
      setAttempt((n) => n + 1);
    } catch (e) {
      setConfirm(null);
      toast(e instanceof ApiError ? e.message : "Could not update", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const step = form?.steps[stepIx];
  const editable = can.edit || (sel === "new" && can.create);
  const fieldLabel = (f: string) => labelOf(lookups, "ApprovalWorkflowConditionField", f);

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Settings / Approval Workflows</div><h1>Approval Workflows</h1><p>Multi-level approval chains with amount thresholds, escalation and delegation.</p></div>
        <div className="head-actions">
          {current && <Button icon={<History />} onClick={() => setHistory(true)}>History</Button>}
          {can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New workflow</Button>}
        </div>
      </div>

      {error ? <ErrorState {...error} onRetry={() => setAttempt((n) => n + 1)} /> : !workflows ? <Skeleton style={{ height: 420, borderRadius: 18 }} /> : (
        <>
          {workflows.length > 0 || sel === "new" ? (
            <div className="card-grid mb">
              {workflows.map((w) => {
                const [Icon, tone] = SUBJECT_LOOK[w.subject] ?? [FilePlus, ""];
                return (
                  <button key={w.id} type="button" className="card" style={{ textAlign: "left", outline: w.id === sel ? "2px solid var(--primary)" : undefined }} onClick={() => open(w)}>
                    <div className="row"><span className={cn("icon-well", tone)}><Icon /></span><div><b>{w.name}</b><small className="muted" style={{ display: "block" }}>{labelOf(lookups, "Subject", w.subject)}</small></div><span className="spacer" /><Badge tone={STATUS_TONE[w.status] ?? "neutral"} dot={w.status === "ACTIVE"}>{w.status === "ACTIVE" ? "Active" : w.status === "DRAFT" ? "Draft" : "Inactive"}</Badge></div>
                    <p className="small muted mt">{stepsLine(w)}</p>
                    <div className="row small mt"><span className="badge neutral">{w.publishedAt ? `v${w.version}` : "Not published"}</span><span className="muted">Approval requests arrive with transactions</span></div>
                  </button>
                );
              })}
              {sel === "new" && <div className="card" style={{ outline: "2px solid var(--primary)" }}><div className="row"><span className="icon-well"><Plus /></span><div><b>New workflow</b><small className="muted" style={{ display: "block" }}>Draft</small></div></div><p className="small muted mt">Fill in the builder below and save.</p></div>}
            </div>
          ) : (
            <Panel><EmptyState icon={<FilePlus />} title="No approval workflows yet" description="Route vouchers, payments, leave and payroll through approvers: steps run in sequence, with amount thresholds and SLAs." action={can.create && <Button variant="primary" size="sm" icon={<Plus />} onClick={() => open("new")}>New workflow</Button>} /></Panel>
          )}

          {form && (
            <div className="split">
              <div className="panel">
                <div className="panel-head">
                  <div><h3>Workflow builder{form.name ? ` — ${form.name}` : ""}</h3><p>Steps run in sequence. {labelOf(lookups, "OnReject", form.onReject)} on any rejection.</p></div>
                  <div className="panel-actions">
                    {current && <Button size="sm" icon={<FlaskConical />} onClick={() => setTesting(true)}>Test</Button>}
                    {editable && <Button size="sm" icon={<Plus />} onClick={() => { set("steps", [...form.steps, newStep(people, form.steps.length + 1)]); setStepIx(form.steps.length); }}>Add step</Button>}
                  </div>
                </div>
                <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                  <FormGrid>
                    <Field label="Workflow name" required><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Vouchers over Rs 500,000" /></Field>
                    <Field label="Applies to" required><Select value={form.subject} onChange={(e) => set("subject", e.target.value)}>{lookupOptions(lookups, "Subject", form.subject).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</Select></Field>
                    <Field label="When approved"><Select value={form.onComplete} onChange={(e) => set("onComplete", e.target.value)}>{lookupOptions(lookups, "OnComplete", form.onComplete).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</Select></Field>
                    <Field label="When rejected"><Select value={form.onReject} onChange={(e) => set("onReject", e.target.value)}>{lookupOptions(lookups, "OnReject", form.onReject).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</Select></Field>
                  </FormGrid>
                </fieldset>

                <div className="row mt" style={{ flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
                  <div className="card" style={{ minWidth: 150, flex: 1 }}>
                    <span className="badge neutral">Trigger</span>
                    <div className="row mt"><span className="icon-well"><FilePlus /></span><div><b>{labelOf(lookups, "Subject", form.subject)} submitted</b><small className="muted" style={{ display: "block" }}>{form.conditions.length ? form.conditions.map((c) => `${fieldLabel(c.field)} ${labelOf(lookups, "ApprovalWorkflowConditionOperator", c.operator)} ${c.text}`).join(" · ") : "Every document"}</small></div></div>
                  </div>
                  {form.steps.map((s, i) => (
                    <div key={i} className="row" style={{ gap: 12, flex: 1, minWidth: 190 }}>
                      <div className="row muted"><ArrowRight /></div>
                      <button type="button" className="card" style={{ minWidth: 150, flex: 1, textAlign: "left", outline: i === stepIx ? "2px solid var(--primary)" : undefined }} onClick={() => setStepIx(i)}>
                        <span className={cn("badge", i === form.steps.length - 1 && form.steps.length > 1 ? "violet" : "info")}>Step {i + 1}</span>
                        <div className="row mt">
                          <span className="avatar sm">{s.approverType === "LINE_MANAGER" ? <UserRound /> : initialsOf((s.approverType === "USER" ? people.users.find((u) => u.id === s.approverUserId)?.name : people.roles.find((r) => r.id === s.approverRoleId)?.name) ?? "?")}</span>
                          <div><b>{s.name}</b><small className="muted" style={{ display: "block" }}>{s.appliesAboveAmount ? `if > ${rs(Number(s.appliesAboveAmount))} · ` : ""}SLA {s.slaHours} h</small></div>
                        </div>
                      </button>
                    </div>
                  ))}
                  <div className="row muted"><ArrowRight /></div>
                  <div className="card" style={{ minWidth: 150, flex: 1 }}>
                    <span className="badge good">Outcome</span>
                    <div className="row mt"><span className="icon-well"><CircleCheck /></span><div><b>{labelOf(lookups, "OnComplete", form.onComplete)}</b><small className="muted" style={{ display: "block" }}>{form.notifyPreparer ? "Notify preparer" : "No notice to preparer"}</small></div></div>
                  </div>
                </div>

                <div className="form-section mt"><h4>Conditions</h4><p>All conditions must be true for this workflow to apply</p></div>
                <div className="table-wrap">
                  <table className="tbl lines">
                    <thead><tr><th>Field</th><th>Operator</th><th>Value</th><th /></tr></thead>
                    <tbody>
                      {form.conditions.map((c, i) => (
                        <tr key={i}>
                          <td><select className="cell-input" value={c.field} disabled={!editable} onChange={(e) => setCond(i, { field: e.target.value })}>{lookupOptions(lookups, "ApprovalWorkflowConditionField", c.field).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></td>
                          <td><select className="cell-input" value={c.operator} disabled={!editable} onChange={(e) => setCond(i, { operator: e.target.value })}>{lookupOptions(lookups, "ApprovalWorkflowConditionOperator", c.operator).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></td>
                          <td><input className="cell-input" value={c.text} disabled={!editable} placeholder={["IN", "NOT_IN"].includes(c.operator) ? "JV, CPV, BPV" : c.operator === "BETWEEN" ? "100000, 500000" : "500000"} onChange={(e) => setCond(i, { text: e.target.value })} /></td>
                          <td className="actions">{editable && <button type="button" className="icon-btn-sm" aria-label="Remove condition" onClick={() => set("conditions", form.conditions.filter((_, j) => j !== i))}><Trash2 /></button>}</td>
                        </tr>
                      ))}
                      {!form.conditions.length && <tr><td colSpan={4} className="muted">No conditions: every {labelOf(lookups, "Subject", form.subject).toLowerCase()} goes through this workflow.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {editable && <Button variant="ghost" size="sm" className="mt" icon={<Plus />} onClick={() => set("conditions", [...form.conditions, { field: "AMOUNT", operator: "GT", text: "" }])}>Add condition</Button>}
              </div>

              <div className="stack">
                <div className="panel">
                  <div className="panel-head"><div><h3>{step ? `Step ${stepIx + 1} settings` : "Step settings"}</h3><p>{step?.name ?? "Add a step to configure it"}</p></div>{step && editable && <button type="button" className="icon-btn-sm" aria-label="Remove step" onClick={() => { set("steps", form.steps.filter((_, j) => j !== stepIx)); setStepIx(Math.max(0, stepIx - 1)); }}><Trash2 /></button>}</div>
                  {step ? (
                    <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                      <div className="form-grid">
                        <label className="full"><span>Step name</span><input value={step.name} onChange={(e) => setStep(stepIx, { name: e.target.value })} /></label>
                        <label className="full"><span>Approver</span>
                          <select
                            value={step.approverType === "ROLE" ? `ROLE:${step.approverRoleId}` : step.approverType === "USER" ? `USER:${step.approverUserId}` : "LINE_MANAGER"}
                            onChange={(e) => {
                              const [t, id] = e.target.value.split(":") as ["ROLE" | "USER" | "LINE_MANAGER", string | undefined];
                              setStep(stepIx, { approverType: t, approverRoleId: t === "ROLE" ? id! : null, approverUserId: t === "USER" ? id! : null });
                            }}
                          >
                            <optgroup label="Role">{people.roles.map((r) => <option key={r.id} value={`ROLE:${r.id}`}>Role: {r.name}</option>)}</optgroup>
                            <optgroup label="Specific user">{people.users.map((u) => <option key={u.id} value={`USER:${u.id}`}>{u.name}</option>)}</optgroup>
                            <option value="LINE_MANAGER">Preparer&apos;s line manager</option>
                          </select>
                        </label>
                        <label><span>SLA (hours)</span><input type="number" min={1} value={step.slaHours} onChange={(e) => setStep(stepIx, { slaHours: Number(e.target.value) })} /></label>
                        <label><span>On SLA breach</span><select value={step.onSlaBreach} onChange={(e) => setStep(stepIx, { onSlaBreach: e.target.value })}>{lookupOptions(lookups, "OnSlaBreach", step.onSlaBreach).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
                        <label><span>Applies above (Rs)</span><input type="number" min={0} value={step.appliesAboveAmount ?? ""} placeholder="Always" onChange={(e) => setStep(stepIx, { appliesAboveAmount: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                        <label><span>Approval mode</span><select value={step.approvalMode} onChange={(e) => setStep(stepIx, { approvalMode: e.target.value })}>{lookupOptions(lookups, "ApprovalMode", step.approvalMode).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
                      </div>
                      <div className="stack mt">
                        <Switch checked={step.blockSelfApproval} onChange={(e) => setStep(stepIx, { blockSelfApproval: e.target.checked })} label="Preparer cannot approve own document" />
                        <Switch checked={step.allowDelegation} onChange={(e) => setStep(stepIx, { allowDelegation: e.target.checked })} label="Allow delegation when on leave" />
                        <Switch checked={step.requireComment} onChange={(e) => setStep(stepIx, { requireComment: e.target.checked })} label="Require comment on approval" />
                      </div>
                    </fieldset>
                  ) : <p className="muted small">Steps decide who approves, in which order and how fast.</p>}
                </div>
                <div className="panel">
                  <div className="panel-head"><div><h3>Notifications</h3></div></div>
                  <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                    <div className="stack">
                      <label className="check"><input type="checkbox" checked={form.notifyInApp} onChange={(e) => set("notifyInApp", e.target.checked)} /> In-app notification</label>
                      <label className="check"><input type="checkbox" checked={form.notifyEmail} onChange={(e) => set("notifyEmail", e.target.checked)} /> Email</label>
                      <label className="check"><input type="checkbox" checked={form.notifyWhatsapp} onChange={(e) => set("notifyWhatsapp", e.target.checked)} /> WhatsApp Business</label>
                      <label className="check"><input type="checkbox" checked={form.notifyPreparer} onChange={(e) => set("notifyPreparer", e.target.checked)} /> Notify the preparer of the outcome</label>
                    </div>
                  </fieldset>
                  {editable && (
                    <div className="form-actions">
                      {current?.status === "DRAFT" && can.remove && <Button variant="ghost" className="text-danger" onClick={() => setConfirm("delete")}>Delete</Button>}
                      {current?.status === "ACTIVE" && <Button variant="ghost" onClick={() => setConfirm("deactivate")}>Deactivate</Button>}
                      <Button onClick={() => (current ? setForm(toForm(current)) : open("new"))} disabled={busy}>Discard</Button>
                      {current?.status !== "ACTIVE" && <Button onClick={() => save(false)} disabled={busy}>Save draft</Button>}
                      <Button variant="primary" onClick={() => save(true)} disabled={busy}>{busy ? "Saving…" : current?.status === "ACTIVE" ? "Save workflow" : "Publish workflow"}</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Delegations people={people} canEdit={can.edit} />
        </>
      )}

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={act} busy={busy} danger title={confirm === "delete" ? `Delete ${current?.name}?` : `Deactivate ${current?.name}?`} confirmLabel={confirm === "delete" ? "Delete" : "Deactivate"}>
        {confirm === "delete" ? "Drafts can be deleted; their history is kept." : "Documents stop routing through it. You can publish it again later."}
      </ConfirmDialog>
      {current && <TestDrawer open={testing} onClose={() => setTesting(false)} workflow={current} fieldLabel={fieldLabel} />}
      {current && (
        <Drawer open={history} onClose={() => setHistory(false)} title={`${current.name} history`} subtitle="Every saved change, who made it and what changed" wide>
          <HistoryTab schema="Company" table="ApprovalWorkflows" id={current.id} />
        </Drawer>
      )}
    </>
  );
}

/** Dry-run: which steps a sample document would go through. */
function TestDrawer({ open, onClose, workflow, fieldLabel }: { open: boolean; onClose: () => void; workflow: Workflow; fieldLabel: (f: string) => string }) {
  const fields = [...new Set(["AMOUNT", ...workflow.conditions.map((c) => c.field)])];
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<WorkflowDryRunResult | null>(null);
  const toast = useToast();
  const run = async () => {
    try {
      const v = Object.fromEntries(Object.entries(values).filter(([, x]) => x !== "").map(([k, x]) => [k, (NUMERIC_CONDITION_FIELDS as readonly string[]).includes(k) ? Number(x) : x]));
      setResult(await testWorkflow(workflow.id, v));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not test", { tone: "danger" });
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={`Test ${workflow.name}`} subtitle="Try a sample document against the saved conditions and steps" foot={<Button variant="primary" icon={<FlaskConical />} onClick={run}>Run test</Button>}>
      <FormGrid cols={1}>
        {fields.map((f) => <Field key={f} label={fieldLabel(f)}><Input value={values[f] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} inputMode={(NUMERIC_CONDITION_FIELDS as readonly string[]).includes(f) ? "decimal" : undefined} /></Field>)}
      </FormGrid>
      {result && (
        <div className="mt">
          <div className={cn("banner", result.matches ? "good" : "warn")}><CircleCheck /><div><b>{result.matches ? "This workflow applies" : "This workflow does not apply"}</b><p>{result.conditions.map((c) => `${c.passed ? "✓" : "✗"} ${c.reason}`).join(" · ") || "No conditions: it applies to every document."}</p></div></div>
          <ol className="cu-audit mt">
            {result.steps.map((s) => <li key={s.stepNo}><span>{s.applies ? <CircleCheck /> : <ArrowRight />}</span><div><b>Step {s.stepNo}: {s.name}</b><small>{s.approverLabel} · {s.applies ? "approves this document" : "skipped"}</small></div></li>)}
          </ol>
        </div>
      )}
    </Drawer>
  );
}

/** Approval delegations: who approves for whom while they are away. */
function Delegations({ people, canEdit }: { people: People; canEdit: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Delegation[] | null>(null);
  const [edit, setEdit] = useState<Delegation | "new" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ fromUserId: "", toUserId: "", startsOn: today, endsOn: today, reason: "", isActive: true });
  const [errs, setErrs] = useState<Record<string, string[]>>({});

  useEffect(() => {
    listDelegations().then(setRows).catch(() => setRows([]));
  }, [attempt]);

  const openForm = (d: Delegation | "new") => {
    setEdit(d);
    setErrs({});
    setF(d === "new" ? { fromUserId: people.users[0]?.id ?? "", toUserId: people.users[1]?.id ?? "", startsOn: today, endsOn: today, reason: "", isActive: true } : { fromUserId: d.fromUserId, toUserId: d.toUserId, startsOn: d.startsOn, endsOn: d.endsOn, reason: d.reason ?? "", isActive: d.isActive });
  };
  const save = async () => {
    try {
      const body = { ...f, reason: f.reason || null };
      if (edit === "new") await createDelegation(body);
      else if (edit) await updateDelegation(edit.id, { ...body, rowVersion: edit.rowVersion });
      toast("Delegation saved", { tone: "good" });
      setEdit(null);
      setAttempt((n) => n + 1);
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrs(e.details);
      toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
    }
  };
  const remove = async (d: Delegation) => {
    try {
      await deleteDelegation(d.id, d.rowVersion);
      toast("Delegation removed", { tone: "good" });
      setAttempt((n) => n + 1);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not remove", { tone: "danger" });
    }
  };

  return (
    <Panel flush className="mt" title="Delegations" description="Who approves on someone's behalf while they are away" actions={canEdit && <Button size="sm" icon={<Plus />} onClick={() => openForm("new")}>Add delegation</Button>}>
      {!rows ? <div style={{ padding: 16 }}><Skeleton style={{ height: 60 }} /></div> : rows.length ? (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Away</th><th>Approves instead</th><th>Period</th><th>Reason</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.fromUserName}</b></td><td>{d.toUserName}</td><td>{d.startsOn} → {d.endsOn}</td><td>{d.reason ?? <span className="muted">—</span>}</td>
                  <td>{d.isActive ? <Badge tone="good" dot>Active</Badge> : <Badge>Off</Badge>}</td>
                  <td className="actions">{canEdit && <><Button size="sm" variant="ghost" onClick={() => openForm(d)}>Edit</Button><button type="button" className="icon-btn-sm" aria-label="Remove" onClick={() => remove(d)}><Trash2 /></button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon={<UserRound />} title="No delegations" description="Add one when an approver goes on leave." />}
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "Add delegation" : "Edit delegation"} foot={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        <FormGrid>
          <Field label="Away" required full error={errs.fromUserId?.[0]}><Select value={f.fromUserId} onChange={(e) => setF({ ...f, fromUserId: e.target.value })}>{people.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Approves instead" required full error={errs.toUserId?.[0]}><Select value={f.toUserId} onChange={(e) => setF({ ...f, toUserId: e.target.value })}>{people.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="From" required error={errs.startsOn?.[0]}><Input type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></Field>
          <Field label="To" required error={errs.endsOn?.[0]}><Input type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></Field>
          <Field label="Reason" full><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Annual leave" /></Field>
          <div className="full"><Switch checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label="Active" /></div>
        </FormGrid>
      </Drawer>
    </Panel>
  );
}
