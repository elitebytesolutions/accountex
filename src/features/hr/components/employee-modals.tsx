"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatIban, normaliseIban, POSITION_EVENTS, type Employee, type EmployeeFormOptions } from "@/shared";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { deleteEmployee, employeeAction, putEmployeePart, updateEmployee } from "../api";
import { RecordModal } from "./record-modal";

export type ModalKind = "edit" | "position" | "confirm" | "status" | "exit" | "rejoin" | "link" | "bank" | "statutory" | "documents";
type Lookups = ReturnType<typeof useLookups>;
type Props = { e: Employee; opts: EmployeeFormOptions; lookups: Lookups; onClose: () => void; onSaved: (e: Employee | null) => void; canDelete?: boolean };
const today = () => new Date().toISOString().slice(0, 10);
const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

/** Shared state for one modal form: values, field errors, busy, and a save that maps API errors to fields. */
function useForm<T extends Record<string, unknown>>(start: T, onSaved: Props["onSaved"]) {
  const toast = useToast();
  const [f, setF] = useState<T>(start);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof T & string, v: unknown) => { setF((x) => ({ ...x, [k]: v })); setErrs((x) => ({ ...x, [k]: "" })); };
  const run = async (work: () => Promise<Employee | null>, done: string) => {
    setBusy(true);
    setErrs({});
    try { const r = await work(); toast(done, { tone: "good" }); onSaved(r); } catch (err) { setErrs(apiFieldErrors(err)); toast(apiMessage(err, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return { f, set, setF, errs, busy, run };
}

function Shell({ title, subtitle, wide, busy, label, danger, onClose, onSave, children }: { title: string; subtitle?: string; wide?: boolean; busy: boolean; label: string; danger?: boolean; onClose: () => void; onSave: () => void; children: ReactNode }) {
  return (
    <Modal open onClose={onClose} title={title} subtitle={subtitle} wide={wide}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className={danger ? "btn danger" : "btn primary"} disabled={busy} onClick={onSave}>{busy ? "Saving…" : label}</button></>}>
      {children}
    </Modal>
  );
}

const opt = (lookups: Lookups, type: string, cur: string, empty?: string) => (
  <>{empty !== undefined && <option value="">{empty}</option>}{lookupOptions(lookups, type, cur).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</>
);

/** Template hrc-edit-emp: personal, contact and terms. Position fields change through "Change position". */
export function EditEmployeeModal({ e, opts, lookups, onClose, onSaved, canDelete }: Props) {
  const keys = ["firstName", "lastName", "legalName", "guardianName", "guardianRelation", "cnic", "cnicIssueDate", "cnicExpiryDate", "dateOfBirth", "gender", "maritalStatus", "childrenCount",
    "religion", "bloodGroup", "nationality", "mobile", "personalEmail", "workEmail", "currentAddress", "permanentAddress", "city", "emergencyContactName", "emergencyRelation", "emergencyPhone",
    "emergencyAltName", "emergencyAltRelation", "emergencyAltPhone", "weeklyOff", "payGroup", "workPattern", "probationMonths", "confirmationDueOn", "contractEndDate", "noticeDays", "biometricId", "joiningDate"] as const;
  const { f, set, errs, busy, run } = useForm<Record<string, unknown>>({
    ...Object.fromEntries(keys.map((k) => [k, s(e[k])])), costCentreId: e.costCentre?.id ?? "", shiftId: e.shift?.id ?? "",
    isBooker: e.isBooker, isSalesman: e.isSalesman, isDeliveryman: e.isDeliveryman, isSupervisor: e.isSupervisor,
  }, onSaved);
  const t = (k: string, props: Record<string, unknown> = {}) => <input value={f[k] as string} onChange={(x) => set(k, x.target.value)} {...props} />;
  const l = (k: string, type: string, empty?: string) => <select value={f[k] as string} onChange={(x) => set(k, x.target.value)}>{opt(lookups, type, f[k] as string, empty)}</select>;
  return (
    <RecordModal open onClose={onClose} wide title="Edit employee" subtitle={`${e.name} · ${e.code}`} busy={busy} canSave saveLabel="Save changes"
      history={{ schema: "HumanResources", table: "Employees", id: e.id }} canDelete={canDelete} deleteNote="Only an employee nothing else uses can be deleted (no reports, login, department or branch head). Otherwise use Offboard."
      onDelete={async () => run(async () => { await deleteEmployee(e.id, e.rowVersion); return null; }, `${e.name} deleted`)}
      onSave={() => run(() => updateEmployee(e.id, { ...f, rowVersion: e.rowVersion }), "Employee record updated")}>
      <div className="form-section"><h4>Identity</h4></div>
      <FormGrid cols={3}>
        <Field label="First name" required error={errs.firstName}>{t("firstName", { maxLength: 60 })}</Field>
        <Field label="Last name" required error={errs.lastName}>{t("lastName", { maxLength: 60 })}</Field>
        <Field label="Full legal name" error={errs.legalName}>{t("legalName", { maxLength: 120, placeholder: "As on CNIC, if different" })}</Field>
        <Field label="Father / husband name" required error={errs.guardianName}>{t("guardianName", { maxLength: 120 })}</Field>
        <Field label="Relation" error={errs.guardianRelation}>{l("guardianRelation", "GuardianRelation")}</Field>
        <Field label="CNIC" required error={errs.cnic}>{t("cnic", { placeholder: "35202-xxxxxxx-x" })}</Field>
        <Field label="CNIC issue date" error={errs.cnicIssueDate}>{t("cnicIssueDate", { type: "date" })}</Field>
        <Field label="CNIC expiry date" error={errs.cnicExpiryDate}>{t("cnicExpiryDate", { type: "date" })}</Field>
        <Field label="Date of birth" required error={errs.dateOfBirth}>{t("dateOfBirth", { type: "date" })}</Field>
        <Field label="Gender" required error={errs.gender}>{l("gender", "EmployeeGender")}</Field>
        <Field label="Marital status" error={errs.maritalStatus}>{l("maritalStatus", "MaritalStatus", "—")}</Field>
        <Field label="Children" error={errs.childrenCount}>{t("childrenCount", { type: "number", min: 0 })}</Field>
        <Field label="Religion" error={errs.religion}>{l("religion", "Religion", "—")}</Field>
        <Field label="Blood group" error={errs.bloodGroup}>{l("bloodGroup", "BloodGroup", "—")}</Field>
        <Field label="Nationality" error={errs.nationality}><select value={f.nationality as string} onChange={(x) => set("nationality", x.target.value)}><option value="PAKISTANI">Pakistani</option><option value="OTHER">Other</option></select></Field>
      </FormGrid>
      <div className="form-section"><h4>Contact &amp; emergency</h4></div>
      <FormGrid cols={3}>
        <Field label="Mobile" required error={errs.mobile}>{t("mobile")}</Field>
        <Field label="Personal email" error={errs.personalEmail}>{t("personalEmail", { type: "email" })}</Field>
        <Field label="Work email" error={errs.workEmail}>{t("workEmail", { type: "email" })}</Field>
        <Field label="Current address" full error={errs.currentAddress}>{t("currentAddress", { maxLength: 200 })}</Field>
        <Field label="Permanent address" full error={errs.permanentAddress}>{t("permanentAddress", { maxLength: 200 })}</Field>
        <Field label="City" error={errs.city}>{t("city", { maxLength: 60 })}</Field>
        <Field label="Emergency contact" error={errs.emergencyContactName}>{t("emergencyContactName", { maxLength: 80 })}</Field>
        <Field label="Relationship" error={errs.emergencyRelation}>{t("emergencyRelation", { maxLength: 40 })}</Field>
        <Field label="Emergency phone" error={errs.emergencyPhone}>{t("emergencyPhone")}</Field>
        <Field label="Alternate contact" error={errs.emergencyAltName}>{t("emergencyAltName", { maxLength: 80 })}</Field>
        <Field label="Alternate relation" error={errs.emergencyAltRelation}>{t("emergencyAltRelation", { maxLength: 40 })}</Field>
        <Field label="Alternate phone" error={errs.emergencyAltPhone}>{t("emergencyAltPhone")}</Field>
      </FormGrid>
      <div className="form-section"><h4>Terms</h4><p>Department, designation, grade, branch, manager and type change through “Change position”.</p></div>
      <FormGrid cols={3}>
        <Field label="Date of joining" required error={errs.joiningDate}>{t("joiningDate", { type: "date" })}</Field>
        <Field label="Cost centre" error={errs.costCentreId}><select value={f.costCentreId as string} onChange={(x) => set("costCentreId", x.target.value)}><option value="">—</option>{opts.costCentres.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select></Field>
        <Field label="Shift" error={errs.shiftId}><select value={f.shiftId as string} onChange={(x) => set("shiftId", x.target.value)}><option value="">—</option>{opts.shifts.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.startTime} – {x.endTime})</option>)}</select></Field>
        <Field label="Weekly off" error={errs.weeklyOff}>{l("weeklyOff", "WeeklyOff")}</Field>
        <Field label="Pay group" error={errs.payGroup}>{l("payGroup", "PayGroup")}</Field>
        <Field label="Work pattern" error={errs.workPattern}>{l("workPattern", "WorkPattern")}</Field>
        <Field label="Probation (months)" error={errs.probationMonths}>{t("probationMonths", { type: "number", min: 0, max: 24 })}</Field>
        <Field label="Confirmation due" error={errs.confirmationDueOn}>{t("confirmationDueOn", { type: "date" })}</Field>
        <Field label="Contract end" error={errs.contractEndDate}>{t("contractEndDate", { type: "date" })}</Field>
        <Field label="Notice period (days)" error={errs.noticeDays}>{t("noticeDays", { type: "number", min: 0, max: 365 })}</Field>
        <Field label="Biometric ID" error={errs.biometricId}>{t("biometricId", { maxLength: 30 })}</Field>
        <div className="full row" style={{ gap: 14, flexWrap: "wrap" }}>
          <span className="muted small">Field roles:</span>
          {([["isBooker", "Order booker"], ["isSalesman", "Salesman"], ["isDeliveryman", "Deliveryman"], ["isSupervisor", "Supervisor"]] as const).map(([k, lb]) => (
            <label key={k} className="check"><input type="checkbox" checked={f[k] as boolean} onChange={(x) => set(k, x.target.checked)} /> {lb}</label>
          ))}
        </div>
      </FormGrid>
    </RecordModal>
  );
}

/** Transfer / promote / any position change: written to position history. */
export function PositionModal({ e, opts, lookups, onClose, onSaved }: Props) {
  const { f, set, errs, busy, run } = useForm({
    eventType: "TRANSFER", effectiveDate: today(), departmentId: e.department.id, designationId: e.designation.id, gradeId: e.grade?.id ?? "",
    branchId: e.branch.id, reportingManagerId: e.manager?.id ?? "", employmentType: e.employmentType, reason: "",
  }, onSaved);
  const desigs = opts.designations.filter((d) => d.departmentId === f.departmentId);
  const managers = opts.managers.filter((m) => m.id !== e.id);
  return (
    <Shell title="Change position" subtitle={`${e.name} · kept in position history`} wide busy={busy} label="Save change" onClose={onClose}
      onSave={() => run(() => employeeAction(e.id, "position", { ...f, rowVersion: e.rowVersion }), "Position changed")}>
      <FormGrid cols={3}>
        <Field label="Change" required error={errs.eventType}><select value={f.eventType} onChange={(x) => set("eventType", x.target.value)}>{POSITION_EVENTS.map((t) => <option key={t} value={t}>{lookupOptions(lookups, "PositionChangeEventType", t).find((o) => o.code === t)?.label ?? t}</option>)}</select></Field>
        <Field label="Effective date" required error={errs.effectiveDate}><input type="date" value={f.effectiveDate} onChange={(x) => set("effectiveDate", x.target.value)} /></Field>
        <Field label="Employment type" error={errs.employmentType}><select value={f.employmentType} onChange={(x) => set("employmentType", x.target.value)}>{opt(lookups, "EmploymentType", f.employmentType)}</select></Field>
        <Field label="Department" required error={errs.departmentId}><select value={f.departmentId} onChange={(x) => { set("departmentId", x.target.value); set("designationId", ""); }}>{opts.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Designation" required error={errs.designationId}><select value={f.designationId} onChange={(x) => { set("designationId", x.target.value); const g = opts.designations.find((d) => d.id === x.target.value)?.gradeId; if (g) set("gradeId", g); }}><option value="">Choose…</option>{desigs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
        <Field label="Grade" error={errs.gradeId}><select value={f.gradeId} onChange={(x) => set("gradeId", x.target.value)}><option value="">—</option>{opts.grades.map((g) => <option key={g.id} value={g.id}>{g.code} ({g.name})</option>)}</select></Field>
        <Field label="Branch" required error={errs.branchId}><select value={f.branchId} onChange={(x) => set("branchId", x.target.value)}>{opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Reporting manager" error={errs.reportingManagerId}><select value={f.reportingManagerId} onChange={(x) => set("reportingManagerId", x.target.value)}><option value="">— None —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.designation}</option>)}</select></Field>
        <Field label="Reason for change" full error={errs.reason}><textarea rows={2} maxLength={300} placeholder="Shown in position history and the audit log" value={f.reason} onChange={(x) => set("reason", x.target.value)} /></Field>
      </FormGrid>
    </Shell>
  );
}

/** Confirm, change status, offboard (exit) or rejoin: one status event each, written to position history. */
export function StatusModal({ e, lookups, onClose, onSaved, kind }: Props & { kind: "confirm" | "status" | "exit" | "rejoin" }) {
  const { f, set, errs, busy, run } = useForm({ date: today(), status: e.status === "ACTIVE" ? "ON_LEAVE" : "ACTIVE", exitType: "RESIGNATION", reason: "" }, onSaved);
  const title = { confirm: "Confirm employment", status: "Change status", exit: "Offboard employee", rejoin: "Rejoin employee" }[kind];
  const save = () => {
    if (kind === "confirm") return run(() => employeeAction(e.id, "confirm", { confirmedOn: f.date, reason: f.reason, rowVersion: e.rowVersion }), `${e.name} confirmed`);
    if (kind === "status") return run(() => employeeAction(e.id, "status", { status: f.status, effectiveDate: f.date, reason: f.reason, rowVersion: e.rowVersion }), "Status changed");
    if (kind === "exit") return run(() => employeeAction(e.id, "exit", { exitDate: f.date, exitType: f.exitType, reason: f.reason, rowVersion: e.rowVersion }), `${e.name} offboarded`);
    return run(() => employeeAction(e.id, "rejoin", { effectiveDate: f.date, reason: f.reason, rowVersion: e.rowVersion }), `${e.name} rejoined`);
  };
  return (
    <Shell title={title} subtitle={kind === "exit" ? "Final settlement and clearance arrive in a later phase." : e.name} busy={busy} danger={kind === "exit"} onClose={onClose} onSave={save}
      label={{ confirm: "Confirm", status: "Change status", exit: "Offboard", rejoin: "Rejoin" }[kind]}>
      <FormGrid>
        {kind === "status" && <Field label="New status" required error={errs.status}><select value={f.status} onChange={(x) => set("status", x.target.value)}>{["ACTIVE", "ON_LEAVE", "NOTICE_PERIOD"].filter((c) => c !== e.status).map((c) => <option key={c} value={c}>{lookupOptions(lookups, "EmployeeStatus", c).find((o) => o.code === c)?.label ?? c}</option>)}</select></Field>}
        {kind === "exit" && <Field label="Exit type" required error={errs.exitType}><select value={f.exitType} onChange={(x) => set("exitType", x.target.value)}>{opt(lookups, "ExitType", f.exitType)}</select></Field>}
        <Field label={kind === "confirm" ? "Confirmed on" : kind === "exit" ? "Last working day" : "Effective date"} required error={errs.confirmedOn || errs.exitDate || errs.effectiveDate}>
          <input type="date" value={f.date} onChange={(x) => set("date", x.target.value)} />
        </Field>
        <Field label="Reason" full error={errs.reason}><textarea rows={2} maxLength={300} value={f.reason} onChange={(x) => set("reason", x.target.value)} /></Field>
      </FormGrid>
    </Shell>
  );
}

/** Link an existing app user (Settings › Users) to the employee, or unlink. */
export function LinkUserModal({ e, opts, onClose, onSaved }: Props) {
  const { f, set, errs, busy, run } = useForm({ userId: e.appUser?.id ?? "" }, onSaved);
  const users = [...(e.appUser ? [e.appUser] : []), ...opts.users];
  return (
    <Shell title="ESS login" subtitle="The user then sees this employee's data under My Profile." busy={busy} label={f.userId ? "Link user" : "Unlink"} onClose={onClose}
      onSave={() => run(() => employeeAction(e.id, "link-user", { userId: f.userId || null, rowVersion: e.rowVersion }), f.userId ? "User linked" : "User unlinked")}>
      <FormGrid cols={1}>
        <Field label="App user" error={errs.userId} hint="Only active users not linked to another employee are listed. Create logins in Settings › Users.">
          <select value={f.userId} onChange={(x) => set("userId", x.target.value)}><option value="">— No login —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select>
        </Field>
      </FormGrid>
    </Shell>
  );
}

type BankRow = { id?: string; paymentMode: string; bankId: string; branchName: string; accountTitle: string; iban: string; isPrimary: boolean; isActive: boolean; effectiveFrom: string };
/** The salary disbursement accounts (one primary). */
export function BankModal({ e, opts, lookups, onClose, onSaved }: Props) {
  const start: BankRow[] = e.bankAccounts.map((b) => ({ id: b.id, paymentMode: b.paymentMode, bankId: b.bank?.id ?? "", branchName: s(b.branchName), accountTitle: s(b.accountTitle), iban: b.iban ? formatIban(b.iban) : "", isPrimary: b.isPrimary, isActive: b.isActive, effectiveFrom: b.effectiveFrom }));
  const { f, setF, errs, busy, run } = useForm({ rows: start }, onSaved);
  const upd = (i: number, patch: Partial<BankRow>) => setF((x) => ({ rows: x.rows.map((r, j) => (j === i ? { ...r, ...patch } : patch.isPrimary ? { ...r, isPrimary: false } : r)) }));
  const err = (i: number, k: string) => errs[`accounts.${i}.${k}`];
  return (
    <Shell title="Bank accounts" subtitle="Salary is disbursed to the primary account via the bank advice file." wide busy={busy} label="Save accounts" onClose={onClose}
      onSave={() => run(() => putEmployeePart(e.id, "bank-accounts", { accounts: f.rows.map((r) => ({ ...r, iban: r.paymentMode === "BANK" ? normaliseIban(r.iban) : null })), rowVersion: e.rowVersion }), "Bank accounts saved")}>
      {errs.accounts && <p className="hint text-danger">{errs.accounts}</p>}
      {f.rows.map((r, i) => (
        <div key={r.id ?? `new${i}`} className="panel mb">
          <FormGrid cols={3}>
            <Field label="Payment mode" error={err(i, "paymentMode")}><select value={r.paymentMode} onChange={(x) => upd(i, { paymentMode: x.target.value })}>{opt(lookups, "EmployeeBankAccountPaymentMode", r.paymentMode)}</select></Field>
            {r.paymentMode === "BANK" && <>
              <Field label="Bank" required error={err(i, "bankId")}><select value={r.bankId} onChange={(x) => upd(i, { bankId: x.target.value })}><option value="">Choose…</option>{opts.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Branch" error={err(i, "branchName")}><input value={r.branchName} onChange={(x) => upd(i, { branchName: x.target.value })} /></Field>
              <Field label="Account title" required error={err(i, "accountTitle")}><input value={r.accountTitle} onChange={(x) => upd(i, { accountTitle: x.target.value })} /></Field>
              <Field label="IBAN" required error={err(i, "iban")}><input value={r.iban} placeholder="PK36 MEZN 0002 1401 0567 8421" onChange={(x) => upd(i, { iban: formatIban(normaliseIban(x.target.value).slice(0, 24)) })} /></Field>
            </>}
            <Field label="Effective from" error={err(i, "effectiveFrom")}><input type="date" value={r.effectiveFrom} onChange={(x) => upd(i, { effectiveFrom: x.target.value })} /></Field>
            <div className="full row" style={{ gap: 16 }}>
              <label className="check"><input type="radio" name="primary" checked={r.isPrimary} onChange={() => upd(i, { isPrimary: true })} /> Primary</label>
              <label className="check"><input type="checkbox" checked={r.isActive} onChange={(x) => upd(i, { isActive: x.target.checked })} /> Active</label>
              <span className="spacer" />
              <button type="button" className="btn ghost sm" onClick={() => setF((x) => ({ rows: x.rows.filter((_, j) => j !== i) }))}><Trash2 />Remove</button>
            </div>
          </FormGrid>
        </div>
      ))}
      <button type="button" className="btn secondary sm" onClick={() => setF((x) => ({ rows: [...x.rows, { paymentMode: "BANK", bankId: "", branchName: "", accountTitle: e.name, iban: "", isPrimary: !x.rows.some((r) => r.isPrimary), isActive: true, effectiveFrom: today() }] }))}><Plus />Add account</button>
    </Shell>
  );
}

/** EOBI, social security, NTN / ATL, PF, insurance and overtime eligibility. */
export function StatutoryModal({ e, lookups, onClose, onSaved }: Props) {
  const st = e.statutory;
  const { f, set, errs, busy, run } = useForm({
    eobiApplicable: st.eobiApplicable, eobiNo: s(st.eobiNo), eobiRegisteredOn: s(st.eobiRegisteredOn), socialSecurityApplicable: st.socialSecurityApplicable,
    socialSecurityScheme: s(st.socialSecurityScheme), socialSecurityNo: s(st.socialSecurityNo), ntn: s(st.ntn), atlStatus: st.atlStatus, pfApplicable: st.pfApplicable,
    pfFromDate: s(st.pfFromDate), groupInsurance: st.groupInsurance, overtimeEligible: st.overtimeEligible,
  }, onSaved);
  return (
    <Shell title="Statutory & benefits" subtitle={e.name} wide busy={busy} label="Save" onClose={onClose}
      onSave={() => run(() => putEmployeePart(e.id, "statutory", { ...f, rowVersion: e.rowVersion }), "Statutory details saved")}>
      <div className="stack mb">
        <Switch label="EOBI (5% employer / 1% employee)" checked={f.eobiApplicable} onChange={(x) => set("eobiApplicable", x.target.checked)} />
        <Switch label="PESSI / SESSI social security" checked={f.socialSecurityApplicable} onChange={(x) => set("socialSecurityApplicable", x.target.checked)} />
        <Switch label="Provident fund 8.33% (after confirmation)" checked={f.pfApplicable} onChange={(x) => set("pfApplicable", x.target.checked)} />
        <Switch label="Group life & health insurance" checked={f.groupInsurance} onChange={(x) => set("groupInsurance", x.target.checked)} />
        <Switch label="Overtime eligible" checked={f.overtimeEligible} onChange={(x) => set("overtimeEligible", x.target.checked)} />
      </div>
      <FormGrid cols={3}>
        <Field label="EOBI registration no." error={errs.eobiNo}><input value={f.eobiNo} onChange={(x) => set("eobiNo", x.target.value)} /></Field>
        <Field label="EOBI registered on" error={errs.eobiRegisteredOn}><input type="date" value={f.eobiRegisteredOn} onChange={(x) => set("eobiRegisteredOn", x.target.value)} /></Field>
        <Field label="Social security scheme" error={errs.socialSecurityScheme}><select value={f.socialSecurityScheme} onChange={(x) => set("socialSecurityScheme", x.target.value)}>{opt(lookups, "EmployeeStatutoryDetailSocialSecurityScheme", f.socialSecurityScheme, "—")}</select></Field>
        <Field label="Social security no." error={errs.socialSecurityNo}><input value={f.socialSecurityNo} onChange={(x) => set("socialSecurityNo", x.target.value)} /></Field>
        <Field label="NTN" error={errs.ntn}><input value={f.ntn} placeholder="3520277-1" onChange={(x) => set("ntn", x.target.value)} /></Field>
        <Field label="ATL status" error={errs.atlStatus}><select value={f.atlStatus} onChange={(x) => set("atlStatus", x.target.value)}>{opt(lookups, "EmployeeStatutoryDetailAtlStatus", f.atlStatus)}</select></Field>
        <Field label="PF from" error={errs.pfFromDate}><input type="date" value={f.pfFromDate} disabled={!f.pfApplicable} onChange={(x) => set("pfFromDate", x.target.value)} /></Field>
      </FormGrid>
    </Shell>
  );
}

type DocRow = { id?: string; category: string; title: string; isRequired: boolean; dueOn: string; expiresOn: string; status: string; remarks: string };
/** The document checklist. Uploads (and Verified / Signed statuses) arrive with file storage in Phase 35. */
export function DocumentsModal({ e, lookups, onClose, onSaved }: Props) {
  const start: DocRow[] = e.documents.map((d) => ({ id: d.id, category: d.category, title: d.title, isRequired: d.isRequired, dueOn: s(d.dueOn), expiresOn: s(d.expiresOn), status: d.status, remarks: s(d.remarks) }));
  const { f, setF, errs, busy, run } = useForm({ rows: start }, onSaved);
  const upd = (i: number, patch: Partial<DocRow>) => setF((x) => ({ rows: x.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const err = (i: number, k: string) => errs[`documents.${i}.${k}`];
  return (
    <Shell title="Document checklist" subtitle="Uploads arrive with file storage (Phase 35)." wide busy={busy} label="Save checklist" onClose={onClose}
      onSave={() => run(() => putEmployeePart(e.id, "documents", { documents: f.rows, rowVersion: e.rowVersion }), "Document checklist saved")}>
      <div className="table-wrap"><table className="tbl lines">
        <thead><tr><th>Category</th><th>Document</th><th>Required</th><th>Due</th><th>Expires</th><th>Status</th><th /></tr></thead>
        <tbody>
          {f.rows.map((r, i) => {
            const locked = r.status !== "PENDING" && r.status !== "MISSING";
            return (
              <tr key={r.id ?? `new${i}`}>
                <td><select className="cell-input" value={r.category} disabled={locked} onChange={(x) => upd(i, { category: x.target.value })}>{opt(lookups, "EmployeeDocumentCategory", r.category)}</select></td>
                <td><input className="cell-input" value={r.title} disabled={locked} onChange={(x) => upd(i, { title: x.target.value })} />{err(i, "title") && <small className="hint text-danger">{err(i, "title")}</small>}</td>
                <td><input type="checkbox" checked={r.isRequired} onChange={(x) => upd(i, { isRequired: x.target.checked })} aria-label="Required" /></td>
                <td><input className="cell-input" type="date" value={r.dueOn} onChange={(x) => upd(i, { dueOn: x.target.value })} /></td>
                <td><input className="cell-input" type="date" value={r.expiresOn} onChange={(x) => upd(i, { expiresOn: x.target.value })} /></td>
                <td>{locked ? <span className="badge good">{lookupOptions(lookups, "EmployeeDocumentStatus", r.status).find((o) => o.code === r.status)?.label}</span>
                  : <select className="cell-input" value={r.status} onChange={(x) => upd(i, { status: x.target.value })}><option value="PENDING">Pending</option><option value="MISSING">Missing</option></select>}</td>
                <td className="actions">{!locked && <button type="button" className="icon-btn-sm" aria-label="Remove" onClick={() => setF((x) => ({ rows: x.rows.filter((_, j) => j !== i) }))}><Trash2 /></button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <button type="button" className="btn secondary sm mt" onClick={() => setF((x) => ({ rows: [...x.rows, { category: "OTHER", title: "", isRequired: false, dueOn: "", expiresOn: "", status: "PENDING", remarks: "" }] }))}><Plus />Add document</button>
    </Shell>
  );
}
