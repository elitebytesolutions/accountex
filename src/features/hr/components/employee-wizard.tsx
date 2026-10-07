"use client";

import { ArrowRight, Check, CircleCheck, FileSignature, FileText, GraduationCap, IdCard, Image as ImageIcon, Info, Layers, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatIban, normaliseIban, type EmployeeFormOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createEmployee, employeeOptions } from "../api";

const STEPS = ["Personal", "Job & Organisation", "Compensation", "Documents & Bank", "Review"];
/** The template's document checklist (uploads arrive with file storage, Phase 35). */
const DOCS = [
  { key: "cnic", category: "IDENTITY", title: "CNIC front & back", note: "Identity", required: true, icon: <IdCard /> },
  { key: "degree", category: "EDUCATION", title: "Highest degree", note: "Education", required: true, icon: <GraduationCap /> },
  { key: "exp", category: "EXPERIENCE", title: "Experience letters", note: "Optional", required: false, icon: <FileText /> },
  { key: "photo", category: "PHOTO", title: "Passport-size photo", note: "Used on ID card", required: false, icon: <ImageIcon /> },
  { key: "police", category: "BACKGROUND_CHECK", title: "Police character certificate", note: "Required within 30 days", required: true, icon: <ShieldCheck /> },
  { key: "offer", category: "CONTRACT", title: "Signed offer letter", note: "Contract", required: true, icon: <FileSignature /> },
];
/** Which step each field lives on (server errors jump there). */
const STEP_OF: Record<string, number> = {
  firstName: 0, lastName: 0, guardianName: 0, guardianRelation: 0, cnic: 0, cnicIssueDate: 0, cnicExpiryDate: 0, dateOfBirth: 0, gender: 0, maritalStatus: 0, religion: 0,
  bloodGroup: 0, nationality: 0, mobile: 0, personalEmail: 0, workEmail: 0, currentAddress: 0, city: 0, emergencyContactName: 0, emergencyPhone: 0,
  departmentId: 1, designationId: 1, gradeId: 1, reportingManagerId: 1, costCentreId: 1, branchId: 1, shiftId: 1, weeklyOff: 1, employmentType: 1, joiningDate: 1,
  probationMonths: 1, confirmationDueOn: 1, noticeDays: 1, biometricId: 1,
};
const today = () => new Date().toISOString().slice(0, 10);
const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const cnicMask = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 13); return [d.slice(0, 5), d.slice(5, 12), d.slice(12)].filter(Boolean).join("-"); };

type Form = Record<string, string>;
const START: Form = {
  firstName: "", lastName: "", guardianName: "", guardianRelation: "FATHER", cnic: "", cnicIssueDate: "", cnicExpiryDate: "", dateOfBirth: "", gender: "", maritalStatus: "",
  religion: "", bloodGroup: "", nationality: "PAKISTANI", mobile: "", personalEmail: "", workEmail: "", currentAddress: "", city: "", emergencyContactName: "", emergencyPhone: "",
  departmentId: "", designationId: "", gradeId: "", reportingManagerId: "", costCentreId: "", branchId: "", shiftId: "", weeklyOff: "SUNDAY", employmentType: "PERMANENT",
  joiningDate: today(), probationMonths: "3", confirmationDueOn: "", noticeDays: "30", biometricId: "",
  paymentMode: "BANK", bankId: "", branchName: "", accountTitle: "", iban: "", eobiNo: "", socialSecurityScheme: "", socialSecurityNo: "", ntn: "", atlStatus: "NON_FILER",
};

/** Template app/hr/employees/new (50-hr-core.html): the 5-step add-employee wizard. */
export function EmployeeWizard() {
  const router = useRouter();
  const toast = useToast();
  const lookups = useLookups(["EmployeeGender", "MaritalStatus", "Religion", "BloodGroup", "GuardianRelation", "EmploymentType", "WeeklyOff", "EmployeeBankAccountPaymentMode", "EmployeeStatutoryDetailAtlStatus", "EmployeeStatutoryDetailSocialSecurityScheme"]);
  const [opts, setOpts] = useState<EmployeeFormOptions | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; reference?: string } | null>(null);
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(START);
  const [flags, setFlags] = useState({ eobiApplicable: true, socialSecurityApplicable: true, pfApplicable: true, groupInsurance: true, overtimeEligible: false, isBooker: false, isSalesman: false, isDeliveryman: false, isSupervisor: false });
  const [docs, setDocs] = useState<Record<string, boolean>>(Object.fromEntries(DOCS.map((d) => [d.key, true])));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    employeeOptions().then(setOpts).catch((e: unknown) => setLoadError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the form" }));
  }, []);
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };

  // Defaults derived from the options (the company default shift, the head office), not stored until changed.
  const defaultShift = opts?.shifts.find((s) => s.isDefault);
  const v = (k: string) => f[k] || (k === "shiftId" ? defaultShift?.id ?? "" : k === "branchId" ? opts?.branches[0]?.id ?? "" : "");
  const designations = useMemo(() => (opts?.designations ?? []).filter((d) => d.departmentId === f.departmentId), [opts, f.departmentId]);
  const confirmation = f.confirmationDueOn || (Number(f.probationMonths) > 0 && f.joiningDate ? addMonths(f.joiningDate, Number(f.probationMonths)) : "");
  const bank = opts?.banks.find((b) => b.id === f.bankId);

  if (loadError) return <ErrorState message={loadError.message} reference={loadError.reference} />;
  if (!opts) return <Skeleton style={{ height: 420 }} />;

  const name = (id: string, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name ?? "—";
  const pickDesignation = (id: string) => { set("designationId", id); const d = opts.designations.find((x) => x.id === id); if (d?.gradeId) set("gradeId", d.gradeId); };

  /** Required fields per step, checked before Continue. */
  const missing = (s: number): Record<string, string> => {
    const need: Record<number, [string, string][]> = {
      0: [["firstName", "Enter the first name"], ["lastName", "Enter the last name"], ["guardianName", "Enter the father / husband name"], ["cnic", "Enter the CNIC"], ["dateOfBirth", "Enter the date of birth"], ["gender", "Choose the gender"], ["mobile", "Enter the mobile number"]],
      1: [["departmentId", "Choose the department"], ["designationId", "Choose the designation"], ["branchId", "Choose the branch"], ["employmentType", "Choose the type"], ["joiningDate", "Enter the joining date"]],
      3: f.paymentMode === "BANK" ? [["bankId", "Choose the bank"], ["accountTitle", "Enter the account title"], ["iban", "Enter the IBAN"]] : [],
    };
    const e = Object.fromEntries((need[s] ?? []).filter(([k]) => !v(k)).map(([k, m]) => [k, m]));
    if (s === 0 && f.cnic && !/^\d{5}-\d{7}-\d$/.test(f.cnic)) e.cnic = "Like 35202-1234567-1";
    if (s === 1 && f.dateOfBirth && f.joiningDate && f.dateOfBirth >= f.joiningDate) e.joiningDate = "Must be after the date of birth";
    if (s === 3 && f.iban && !/^PK\d{2}[A-Z]{4}[0-9A-Z]{16}$/.test(normaliseIban(f.iban))) e.iban = "Like PK36 MEZN 0002 1401 0567 8421";
    return e;
  };
  const next = () => { const e = missing(step); if (Object.keys(e).length) { setErrs(e); return; } setStep((s) => s + 1); };
  const goto = (s: number) => { if (s < step) setStep(s); else for (let i = step; i < s; i++) { const e = missing(i); if (Object.keys(e).length) { setErrs(e); setStep(i); return; } } setStep(s); };

  const pendingDocs = DOCS.filter((d) => docs[d.key]);
  const save = async () => {
    setBusy(true);
    setErrs({});
    const body = {
      ...Object.fromEntries(Object.keys(STEP_OF).map((k) => [k, v(k)])),
      confirmationDueOn: confirmation, isBooker: flags.isBooker, isSalesman: flags.isSalesman, isDeliveryman: flags.isDeliveryman, isSupervisor: flags.isSupervisor,
      statutory: {
        eobiApplicable: flags.eobiApplicable, eobiNo: f.eobiNo, socialSecurityApplicable: flags.socialSecurityApplicable, socialSecurityScheme: f.socialSecurityScheme,
        socialSecurityNo: f.socialSecurityNo, ntn: f.ntn, atlStatus: f.atlStatus, pfApplicable: flags.pfApplicable, groupInsurance: flags.groupInsurance, overtimeEligible: flags.overtimeEligible,
      },
      bankAccount: f.paymentMode === "BANK" ? { paymentMode: "BANK", bankId: f.bankId, branchName: f.branchName, accountTitle: f.accountTitle, iban: f.iban } : { paymentMode: f.paymentMode },
      documents: pendingDocs.map((d) => ({ category: d.category, title: d.title, isRequired: d.required, status: "PENDING", ...(d.key === "police" && { dueOn: addMonths(v("joiningDate"), 1) }) })),
    };
    try {
      const e = await createEmployee(body);
      toast(`Employee ${e.code} created`, { tone: "good" });
      router.push(`/hr/employees/${e.id}`);
    } catch (e) {
      const fe = apiFieldErrors(e);
      const flat = Object.fromEntries(Object.entries(fe).map(([k, m]) => [k.replace(/^(statutory|bankAccount)\./, ""), m]));
      setErrs(flat);
      const first = Object.keys(flat).map((k) => STEP_OF[k] ?? 3).sort()[0];
      if (first !== undefined) setStep(first);
      toast(apiMessage(e, "Could not create the employee"), { tone: "danger" });
    } finally { setBusy(false); }
  };

  const sel = (k: string, type: string, placeholder?: string) => (
    <select value={v(k)} onChange={(e) => set(k, e.target.value)}>{placeholder !== undefined && <option value="">{placeholder}</option>}{lookupOptions(lookups, type, v(k)).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
  );
  const inp = (k: string, props: Record<string, unknown> = {}) => <input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} />;
  const actions = (last?: ReactNode) => (
    <div className="form-actions">
      {step > 0 && <button type="button" className="btn secondary" onClick={() => setStep(step - 1)}>Back</button>}
      {last ?? <button type="button" className="btn primary" onClick={next}>{step === 3 ? "Review" : "Continue"}<ArrowRight /></button>}
    </div>
  );

  return (
    <>
      <PageHead eyebrow={<><Link className="link" href="/hr/employees">HR / Employees</Link> / New</>} title="Add Employee"
        description={<>Next code <b>{opts.nextCode ?? "—"}</b> · assigned when you create the employee.</>}
        actions={<Link className="btn secondary" href="/hr/employees">Cancel</Link>} />

      <div className="panel">
        <div className="wizard">
          <ol className="steps">
            {STEPS.map((s, i) => <li key={s} className={cn(i === step && "active", i < step && "done")} onClick={() => goto(i)}><b>{i < step ? <Check size={15} /> : i + 1}</b><span>{s}</span></li>)}
          </ol>

          {step === 0 && (
            <div className="wz-pane active">
              <div className="form-section"><h4>Identity</h4><p>Must match NADRA CNIC exactly — used for EOBI and FBR filing.</p></div>
              <FormGrid cols={3}>
                <Field label="First name" required error={errs.firstName}>{inp("firstName", { maxLength: 60 })}</Field>
                <Field label="Last name" required error={errs.lastName}>{inp("lastName", { maxLength: 60 })}</Field>
                <Field label="Father / husband name" required error={errs.guardianName}>
                  <div className="row" style={{ gap: 6 }}>{inp("guardianName", { maxLength: 120, style: { flex: 1 } })}<select style={{ width: 110 }} value={f.guardianRelation} onChange={(e) => set("guardianRelation", e.target.value)} aria-label="Relation">{lookupOptions(lookups, "GuardianRelation", f.guardianRelation).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></div>
                </Field>
                <Field label="CNIC" required error={errs.cnic}><input value={f.cnic} placeholder="35202-xxxxxxx-x" inputMode="numeric" onChange={(e) => set("cnic", cnicMask(e.target.value))} /></Field>
                <Field label="CNIC issue date" error={errs.cnicIssueDate}>{inp("cnicIssueDate", { type: "date" })}</Field>
                <Field label="CNIC expiry date" error={errs.cnicExpiryDate}>{inp("cnicExpiryDate", { type: "date" })}</Field>
                <Field label="Date of birth" required error={errs.dateOfBirth}>{inp("dateOfBirth", { type: "date", max: today() })}</Field>
                <Field label="Gender" required error={errs.gender}>{sel("gender", "EmployeeGender", "Choose…")}</Field>
                <Field label="Marital status" error={errs.maritalStatus}>{sel("maritalStatus", "MaritalStatus", "—")}</Field>
                <Field label="Religion" error={errs.religion}>{sel("religion", "Religion", "—")}</Field>
                <Field label="Blood group" error={errs.bloodGroup}>{sel("bloodGroup", "BloodGroup", "—")}</Field>
                <Field label="Nationality" error={errs.nationality}><select value={f.nationality} onChange={(e) => set("nationality", e.target.value)}><option value="PAKISTANI">Pakistani</option><option value="OTHER">Other</option></select></Field>
              </FormGrid>
              <div className="form-section"><h4>Contact</h4></div>
              <FormGrid cols={3}>
                <Field label="Mobile" required error={errs.mobile}>{inp("mobile", { placeholder: "+92 300 1234567", inputMode: "tel" })}</Field>
                <Field label="Personal email" error={errs.personalEmail}>{inp("personalEmail", { type: "email" })}</Field>
                <Field label="Work email" error={errs.workEmail}>{inp("workEmail", { type: "email" })}</Field>
                <Field label="Current address" full error={errs.currentAddress}>{inp("currentAddress", { maxLength: 200 })}</Field>
                <Field label="City" error={errs.city}>{inp("city", { maxLength: 60 })}</Field>
                <Field label="Emergency contact" error={errs.emergencyContactName}>{inp("emergencyContactName", { maxLength: 80, placeholder: "Name (relation)" })}</Field>
                <Field label="Emergency phone" error={errs.emergencyPhone}>{inp("emergencyPhone", { inputMode: "tel" })}</Field>
              </FormGrid>
              {actions()}
            </div>
          )}

          {step === 1 && (
            <div className="wz-pane active">
              <div className="form-section"><h4>Position</h4><p>Defines approvals, cost centre and payroll grouping.</p></div>
              {!opts.departments.length && <Banner tone="warn" title="No departments yet">Add departments and designations on <Link className="link" href="/hr/departments">Departments &amp; Designations</Link> first.</Banner>}
              <FormGrid cols={3}>
                <Field label="Employee code" hint="From the EMP numbering series"><input value={opts.nextCode ?? ""} readOnly /></Field>
                <Field label="Department" required error={errs.departmentId}><select value={f.departmentId} onChange={(e) => { set("departmentId", e.target.value); set("designationId", ""); }}><option value="">Choose…</option>{opts.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
                <Field label="Designation" required error={errs.designationId}><select value={f.designationId} disabled={!f.departmentId} onChange={(e) => pickDesignation(e.target.value)}><option value="">{f.departmentId ? (designations.length ? "Choose…" : "No designations in this department") : "Choose the department first"}</option>{designations.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
                <Field label="Grade" error={errs.gradeId}><select value={f.gradeId} onChange={(e) => set("gradeId", e.target.value)}><option value="">—</option>{opts.grades.map((g) => <option key={g.id} value={g.id}>{g.code} ({g.name})</option>)}</select></Field>
                <Field label="Reporting manager" error={errs.reportingManagerId}><select value={f.reportingManagerId} onChange={(e) => set("reportingManagerId", e.target.value)}><option value="">{opts.managers.length ? "— None —" : "No employees yet"}</option>{opts.managers.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.designation}</option>)}</select></Field>
                <Field label="Cost centre" error={errs.costCentreId}><select value={f.costCentreId} onChange={(e) => set("costCentreId", e.target.value)}><option value="">—</option>{opts.costCentres.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select></Field>
                <Field label="Branch" required error={errs.branchId}><select value={v("branchId")} onChange={(e) => set("branchId", e.target.value)}>{opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
                <Field label="Shift" error={errs.shiftId}><select value={v("shiftId")} onChange={(e) => set("shiftId", e.target.value)}><option value="">—</option>{opts.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime} – {s.endTime})</option>)}</select></Field>
                <Field label="Weekly off" error={errs.weeklyOff}>{sel("weeklyOff", "WeeklyOff")}</Field>
              </FormGrid>
              <div className="form-section"><h4>Employment terms</h4></div>
              <FormGrid cols={3}>
                <Field label="Employment type" required error={errs.employmentType}>{sel("employmentType", "EmploymentType")}</Field>
                <Field label="Date of joining" required error={errs.joiningDate}>{inp("joiningDate", { type: "date" })}</Field>
                <Field label="Probation (months)" error={errs.probationMonths}>{inp("probationMonths", { type: "number", min: 0, max: 24 })}</Field>
                <Field label="Confirmation due" error={errs.confirmationDueOn}><input type="date" value={confirmation} onChange={(e) => set("confirmationDueOn", e.target.value)} /></Field>
                <Field label="Notice period (days)" error={errs.noticeDays}>{inp("noticeDays", { type: "number", min: 0, max: 365 })}</Field>
                <Field label="Biometric enrolment ID" error={errs.biometricId}>{inp("biometricId", { maxLength: 30, placeholder: "e.g. ZK-LHR-0187" })}</Field>
                <div className="full row" style={{ gap: 14, flexWrap: "wrap" }}>
                  <span className="muted small">Field roles:</span>
                  {([["isBooker", "Order booker"], ["isSalesman", "Salesman"], ["isDeliveryman", "Deliveryman"], ["isSupervisor", "Supervisor"]] as const).map(([k, l]) => (
                    <label key={k} className="check"><input type="checkbox" checked={flags[k]} onChange={(e) => setFlags((x) => ({ ...x, [k]: e.target.checked }))} /> {l}</label>
                  ))}
                </div>
                <label className="check full" title="Logins are created in Settings › Users; link one on the employee profile."><input type="checkbox" disabled /> Create ESS login and send welcome email <small className="muted">— link an existing user on the profile instead</small></label>
                <label className="check full" title="Onboarding checklists arrive in a later phase."><input type="checkbox" disabled /> Start onboarding checklist (IT, admin, induction) <small className="muted">— with onboarding (later phase)</small></label>
              </FormGrid>
              {actions()}
            </div>
          )}

          {step === 2 && (
            <div className="wz-pane active">
              <div className="split">
                <div>
                  <div className="form-section"><h4>Salary structure</h4><p>Pre-filled from the grade template once payroll is set up.</p></div>
                  <div className="panel"><EmptyState icon={<Layers />} title="Set up in Payroll (Phase 12)" description="Salary components, structures and each employee's salary arrive with payroll setup. Add the salary on the employee profile then." /></div>
                </div>
                <div>
                  <div className="form-section"><h4>Statutory &amp; benefits</h4></div>
                  <div className="stack">
                    <Switch label="EOBI (5% employer / 1% employee)" checked={flags.eobiApplicable} onChange={(e) => setFlags((x) => ({ ...x, eobiApplicable: e.target.checked }))} />
                    <Switch label="PESSI / SESSI social security" checked={flags.socialSecurityApplicable} onChange={(e) => setFlags((x) => ({ ...x, socialSecurityApplicable: e.target.checked }))} />
                    <Switch label="Provident fund 8.33% (after confirmation)" checked={flags.pfApplicable} onChange={(e) => setFlags((x) => ({ ...x, pfApplicable: e.target.checked }))} />
                    <Switch label="Group life & health insurance" checked={flags.groupInsurance} onChange={(e) => setFlags((x) => ({ ...x, groupInsurance: e.target.checked }))} />
                    <Switch label="Overtime eligible" checked={flags.overtimeEligible} onChange={(e) => setFlags((x) => ({ ...x, overtimeEligible: e.target.checked }))} />
                  </div>
                  <div className="banner info mt"><Info /><div><b>Estimated tax u/s 149</b><p>Calculated from the salary and the FY tax slabs once payroll is set up (Phase 12).</p></div></div>
                </div>
              </div>
              {actions()}
            </div>
          )}

          {step === 3 && (
            <div className="wz-pane active">
              <div className="grid-2">
                <div>
                  <div className="form-section"><h4>Bank account</h4><p>Salary is disbursed via bank advice file.</p></div>
                  <FormGrid>
                    {f.paymentMode === "BANK" && <>
                      <Field label="Bank" required error={errs.bankId}><select value={f.bankId} onChange={(e) => set("bankId", e.target.value)}><option value="">Choose…</option>{opts.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
                      <Field label="Branch" error={errs.branchName}>{inp("branchName", { maxLength: 80 })}</Field>
                      <Field label="Account title" required error={errs.accountTitle}>{inp("accountTitle", { maxLength: 80, placeholder: [f.firstName, f.lastName].filter(Boolean).join(" ") })}</Field>
                      <Field label="IBAN" required error={errs.iban} hint={bank?.ibanBankCode ? `${bank.name} IBANs carry ${bank.ibanBankCode}` : undefined}><input value={f.iban} placeholder="PK36 MEZN 0002 1401 0567 8421" onChange={(e) => set("iban", formatIban(normaliseIban(e.target.value).slice(0, 24)))} /></Field>
                    </>}
                    <Field label="Payment mode" error={errs.paymentMode}>{sel("paymentMode", "EmployeeBankAccountPaymentMode")}</Field>
                  </FormGrid>
                  <div className="form-section"><h4>Statutory numbers</h4></div>
                  <FormGrid>
                    <Field label="EOBI registration no." error={errs.eobiNo}>{inp("eobiNo", { maxLength: 40 })}</Field>
                    <Field label="Social security scheme" error={errs.socialSecurityScheme}>{sel("socialSecurityScheme", "EmployeeStatutoryDetailSocialSecurityScheme", "—")}</Field>
                    <Field label="PESSI / SESSI no." error={errs.socialSecurityNo}>{inp("socialSecurityNo", { maxLength: 40, placeholder: "Assigned after registration" })}</Field>
                    <Field label="NTN" error={errs.ntn}>{inp("ntn", { maxLength: 9, placeholder: "3520277-1" })}</Field>
                    <Field label="ATL status" error={errs.atlStatus}>{sel("atlStatus", "EmployeeStatutoryDetailAtlStatus")}</Field>
                  </FormGrid>
                </div>
                <div>
                  <div className="form-section"><h4>Documents</h4><p>Tracked as a checklist; uploads arrive with file storage (Phase 35).</p></div>
                  <div className="list">
                    {DOCS.map((d) => (
                      <div key={d.key} className="list-item">
                        <span className="icon-well">{d.icon}</span><div><b>{d.title}</b><small>{d.note}</small></div><span className="spacer" />
                        <label className="check" title="Track this document"><input type="checkbox" checked={docs[d.key]} onChange={(e) => setDocs((x) => ({ ...x, [d.key]: e.target.checked }))} /> {docs[d.key] ? <span className="badge warn">Pending</span> : <span className="badge neutral">Not needed</span>}</label>
                        <button type="button" className="btn ghost sm" disabled title="Uploads arrive with file storage (Phase 35)"><Upload />Upload</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {actions()}
            </div>
          )}

          {step === 4 && (
            <div className="wz-pane active">
              <div className="banner good mb"><CircleCheck /><div><b>Ready to create</b><p>All mandatory fields complete.{pendingDocs.length ? ` ${pendingDocs.length} document${pendingDocs.length === 1 ? "" : "s"} pending — tracked on the profile.` : ""}</p></div></div>
              <div className="grid-3">
                <div className="panel"><div className="panel-head"><div><h3>Personal</h3></div></div>
                  <div className="dl"><div><span>Name</span><b>{f.firstName} {f.lastName}</b></div><div><span>CNIC</span><b>{f.cnic}</b></div><div><span>DOB</span><b>{dateLabel(f.dateOfBirth)}</b></div><div><span>Mobile</span><b>{f.mobile}</b></div></div></div>
                <div className="panel"><div className="panel-head"><div><h3>Job</h3></div></div>
                  <div className="dl">
                    <div><span>Code</span><b>{opts.nextCode ?? "—"}</b></div>
                    <div><span>Role</span><b>{opts.designations.find((d) => d.id === f.designationId)?.title ?? "—"}{f.gradeId && ` · ${opts.grades.find((g) => g.id === f.gradeId)?.code}`}</b></div>
                    <div><span>Department</span><b>{name(f.departmentId, opts.departments)} · {name(v("branchId"), opts.branches)}</b></div>
                    <div><span>Manager</span><b>{name(f.reportingManagerId, opts.managers)}</b></div>
                    <div><span>Joining</span><b>{dateLabel(f.joiningDate)} · {labelOf(lookups, "EmploymentType", f.employmentType)}</b></div>
                  </div></div>
                <div className="panel"><div className="panel-head"><div><h3>Pay &amp; bank</h3></div></div>
                  <div className="dl">
                    <div><span>Salary</span><b className="muted">Payroll (Phase 12)</b></div>
                    <div><span>Bank</span><b>{f.paymentMode === "BANK" ? `${bank?.name ?? "—"} · ${f.iban ? `…${normaliseIban(f.iban).slice(-4)}` : ""}` : labelOf(lookups, "EmployeeBankAccountPaymentMode", f.paymentMode)}</b></div>
                    <div><span>EOBI</span><b>{flags.eobiApplicable ? f.eobiNo || "Applicable" : "Not applicable"}</b></div>
                    <div><span>NTN</span><b>{f.ntn || "—"} ({labelOf(lookups, "EmployeeStatutoryDetailAtlStatus", f.atlStatus)})</b></div>
                  </div></div>
              </div>
              {actions(<button type="button" className="btn primary" disabled={busy} onClick={save}><Check />{busy ? "Creating…" : "Create employee"}</button>)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
