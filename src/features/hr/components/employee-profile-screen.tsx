"use client";

import {
  AlertTriangle, ArrowLeft, ArrowRightLeft, BadgeCheck, CalendarDays, Clock, FileSignature, FileText, GraduationCap, IdCard, Image as ImageIcon, KeyRound, Laptop, Layers,
  LogOut, Pencil, Plane, RotateCcw, ShieldCheck, Upload, UserCog, Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatIban, type Employee, type EmployeeFormOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { employeeOptions, getEmployee } from "../api";
import { BankModal, DocumentsModal, EditEmployeeModal, LinkUserModal, PositionModal, StatusModal, StatutoryModal, type ModalKind } from "./employee-modals";
import { age, initials, tenure } from "./people-ui";

type Tab = "personal" | "job" | "salary" | "attendance" | "leave" | "documents" | "assets" | "timeline" | "history";
const TABS: [Tab, string][] = [["personal", "Personal"], ["job", "Job"], ["salary", "Salary"], ["attendance", "Attendance"], ["leave", "Leave"], ["documents", "Documents"], ["assets", "Assets"], ["timeline", "Timeline"], ["history", "History"]];
const DOC_ICON: Record<string, ReactNode> = { IDENTITY: <IdCard />, CONTRACT: <FileSignature />, EDUCATION: <GraduationCap />, BACKGROUND_CHECK: <ShieldCheck />, PHOTO: <ImageIcon /> };
const EVENT_DOT: Record<string, string> = { JOINED: "good", CONFIRMED: "", PROMOTED: "good", REHIRED: "good", EXITED: "danger", DEMOTED: "warn", STATUS_CHANGE: "warn" };
const v = (x: string | number | null | undefined) => (x === null || x === undefined || x === "" ? "—" : x);

/** Template app/hr/employees/view (50-hr-core.html): hero, KPIs and the profile tabs. Payroll, attendance, leave and assets wait for their phases. */
export function EmployeeProfileScreen({ id, can }: { id: string; can: { edit: boolean; remove: boolean } }) {
  const router = useRouter();
  const lookups = useLookups(["EmployeeStatus", "EmploymentType", "EmployeeGender", "MaritalStatus", "Religion", "BloodGroup", "GuardianRelation", "WeeklyOff", "WorkPattern", "PayGroup",
    "ExitType", "PositionChangeEventType", "EmployeeBankAccountPaymentMode", "EmployeeStatutoryDetailAtlStatus", "EmployeeStatutoryDetailSocialSecurityScheme", "EmployeeDocumentCategory", "EmployeeDocumentStatus"]);
  const [e, setE] = useState<Employee | null>(null);
  const [opts, setOpts] = useState<EmployeeFormOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("personal");
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [historyOf, setHistoryOf] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEmployee(id), employeeOptions()])
      .then(([x, o]) => { if (!cancelled) { setE(x); setOpts(o); setError(null); } })
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiError ? { message: err.message, reference: err.correlationId } : { message: "Could not load the employee" }));
    return () => { cancelled = true; };
  }, [id, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!e || !opts) return <Skeleton style={{ height: 480 }} />;

  const L = (type: string, code: string | null) => (code ? labelOf(lookups, type, code) : "—");
  const exited = e.status === "EXITED";
  const saved = (x: Employee | null) => {
    setModal(null);
    if (!x) { router.push("/hr/employees"); return; }
    setE(x);
    employeeOptions().then(setOpts).catch(() => undefined);
  };
  const primary = e.bankAccounts.find((b) => b.isPrimary && b.isActive) ?? e.bankAccounts[0];
  const pending = e.documents.filter((d) => d.status === "PENDING" || d.status === "MISSING");
  const historyTargets: [string, string, string][] = [
    ["Employees", e.id, "Employee record"],
    ...(e.statutory.id ? [["EmployeeStatutoryDetails", e.statutory.id, "Statutory details"] as [string, string, string]] : []),
    ...e.bankAccounts.map((b) => ["EmployeeBankAccounts", b.id, `Bank · ${b.bank?.name ?? L("EmployeeBankAccountPaymentMode", b.paymentMode)}`] as [string, string, string]),
    ...e.documents.map((d) => ["EmployeeDocuments", d.id, `Document · ${d.title}`] as [string, string, string]),
    ...e.history.map((h) => ["EmployeePositionHistory", h.id, `${L("PositionChangeEventType", h.eventType)} · ${dateLabel(h.effectiveDate)}`] as [string, string, string]),
  ];
  const target = historyTargets.find((t) => `${t[0]}:${t[1]}` === historyOf) ?? historyTargets[0]!;
  const eventTitle = (h: Employee["history"][number]) => {
    const t = L("PositionChangeEventType", h.eventType);
    if (h.eventType === "JOINED") return `Joined as ${v(h.to.designation)}`;
    if (h.eventType === "PROMOTED" || h.eventType === "DEMOTED" || h.eventType === "DESIGNATION_CHANGE") return `${t} to ${h.to.designation ?? h.to.grade ?? ""}`.trim();
    if (h.eventType === "STATUS_CHANGE" || h.eventType === "EXITED" || h.eventType === "REHIRED" || h.eventType === "CONFIRMED") return h.eventType === "STATUS_CHANGE" ? `Status: ${L("EmployeeStatus", h.to.status)}` : t;
    return t;
  };
  const eventNote = (h: Employee["history"][number]) => {
    const parts = (["department", "designation", "grade", "branch", "manager"] as const).filter((k) => h.from[k] || h.to[k]).map((k) => (h.eventType === "JOINED" ? h.to[k] : `${k} ${v(h.from[k])} → ${v(h.to[k])}`)).filter(Boolean);
    if (h.from.employmentType !== h.to.employmentType && h.to.employmentType) parts.push(`type ${L("EmploymentType", h.from.employmentType)} → ${L("EmploymentType", h.to.employmentType)}`);
    return [dateLabel(h.effectiveDate), ...parts, h.reason].filter(Boolean).join(" · ");
  };
  const dl = (rows: [string, ReactNode][]) => <div className="dl">{rows.map(([k, x]) => <div key={k}><span>{k}</span><b>{x}</b></div>)}</div>;
  const placeholder = (icon: ReactNode, title: string, text: string) => <div className="panel"><EmptyState icon={icon} title={title} description={text} /></div>;

  return (
    <>
      <PageHead eyebrow={<><Link className="link" href="/hr/employees">HR / Employees</Link> / {e.code}</>} title="Employee Profile"
        actions={<Link className="btn ghost" href="/hr/employees"><ArrowLeft />Back</Link>} />

      <div className="panel mb">
        <div className="profile-head">
          <span className="avatar xl">{initials(e.name)}</span>
          <div>
            <h2>{e.name}</h2>
            <p>{e.designation.title} · {e.department.name} · {e.branch.name}{e.manager && <> · reports to <Link className="link" href={`/hr/employees/${e.manager.id}`}>{e.manager.name}</Link></>}</p>
            <div className="row">
              <span className={cn("badge dot", toneOf(lookups, "EmployeeStatus", e.status))}>{L("EmployeeStatus", e.status)}</span>
              <span className="badge neutral">{e.code}</span><span className="badge info">{L("EmploymentType", e.employmentType)}</span>
              {e.grade && <span className="badge violet">Grade {e.grade.code}</span>}
              {e.shift && <span className="badge neutral">{e.shift.name} {e.shift.startTime}–{e.shift.endTime}</span>}
            </div>
          </div>
          <div className="head-actions">
            {can.edit && <button className="btn secondary" type="button" onClick={() => setModal("edit")}><Pencil />Edit</button>}
            {can.edit && !exited && <button className="btn secondary" type="button" onClick={() => setModal("position")}><ArrowRightLeft />Change position</button>}
            {can.edit && e.status === "PROBATION" && <button className="btn secondary" type="button" onClick={() => setModal("confirm")}><BadgeCheck />Confirm</button>}
            <button className="btn secondary" type="button" disabled title="HR letters arrive in a later phase"><FileText />Generate letter</button>
            {can.edit && (exited ? <button className="btn secondary" type="button" onClick={() => setModal("rejoin")}><RotateCcw />Rejoin</button>
              : <button className="btn danger" type="button" onClick={() => setModal("exit")}><LogOut />Offboard</button>)}
          </div>
        </div>
      </div>

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Tenure</span><span className="icon-well"><CalendarDays /></span></div><strong>{tenure(e.joiningDate, e.exitDate ?? undefined)}</strong><small>Joined {dateLabel(e.joiningDate)}{e.exitDate && ` · left ${dateLabel(e.exitDate)}`}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Gross Salary</span><span className="icon-well"><Wallet /></span></div><strong>—</strong><small>Set up in Payroll (Phase 12)</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Attendance</span><span className="icon-well"><Clock /></span></div><strong>—</strong><small>With attendance (biometric punches)</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Leave Balance</span><span className="icon-well"><Plane /></span></div><strong>—</strong><small>With leave requests &amp; balances</small></div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={cn(tab === k && "active")} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "personal" && (
        <div className="grid-2">
          <div className="panel">
            <div className="panel-head"><div><h3>Personal details</h3><p>As per NADRA CNIC</p></div>{can.edit && <div className="panel-actions"><button className="btn ghost sm" type="button" onClick={() => setModal("edit")}><Pencil />Edit</button></div>}</div>
            {dl([
              ["Full name", e.legalName ?? e.name], [`${L("GuardianRelation", e.guardianRelation)}'s name`, e.guardianName], ["CNIC", e.cnic], ["CNIC expiry", dateLabel(e.cnicExpiryDate)],
              ["Date of birth", `${dateLabel(e.dateOfBirth)} (${age(e.dateOfBirth)} yrs)`], ["Gender", L("EmployeeGender", e.gender)],
              ["Marital status", `${L("MaritalStatus", e.maritalStatus)}${e.childrenCount ? ` · ${e.childrenCount} child${e.childrenCount === 1 ? "" : "ren"}` : ""}`],
              ["Religion", L("Religion", e.religion)], ["Blood group", L("BloodGroup", e.bloodGroup)],
            ])}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Contact &amp; address</h3></div></div>
            {dl([["Work email", v(e.workEmail)], ["Personal email", v(e.personalEmail)], ["Mobile", e.mobile], ["Current address", v(e.currentAddress)], ["Permanent address", v(e.permanentAddress)], ["City", v(e.city)]])}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Emergency contact</h3></div></div>
            {dl([["Name", v(e.emergencyContactName)], ["Relationship", v(e.emergencyRelation)], ["Phone", v(e.emergencyPhone)],
              ["Alternate", e.emergencyAltName ? `${e.emergencyAltName}${e.emergencyAltRelation ? ` (${e.emergencyAltRelation})` : ""}${e.emergencyAltPhone ? ` · ${e.emergencyAltPhone}` : ""}` : "—"]])}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Bank &amp; statutory</h3><p>Salary disbursement account</p></div>
              {can.edit && <div className="panel-actions"><button className="btn ghost sm" type="button" onClick={() => setModal("bank")}>Bank</button><button className="btn ghost sm" type="button" onClick={() => setModal("statutory")}>Statutory</button></div>}</div>
            {dl([
              ["Bank", primary ? (primary.paymentMode === "BANK" ? `${primary.bank?.name ?? primary.bankName ?? "—"}${primary.branchName ? ` — ${primary.branchName}` : ""}` : L("EmployeeBankAccountPaymentMode", primary.paymentMode)) : "—"],
              ["Account title", v(primary?.accountTitle)], ["IBAN", primary?.iban ? formatIban(primary.iban) : "—"],
              ["EOBI No.", e.statutory.eobiApplicable ? v(e.statutory.eobiNo) : "Not applicable"],
              [`${e.statutory.socialSecurityScheme ? L("EmployeeStatutoryDetailSocialSecurityScheme", e.statutory.socialSecurityScheme) : "Social security"} No.`, e.statutory.socialSecurityApplicable ? v(e.statutory.socialSecurityNo) : "Not applicable"],
              ["NTN", v(e.statutory.ntn)],
              ["Tax status", <span key="atl" className={cn("badge", toneOf(lookups, "EmployeeStatutoryDetailAtlStatus", e.statutory.atlStatus))}>{L("EmployeeStatutoryDetailAtlStatus", e.statutory.atlStatus)}</span>],
            ])}
          </div>
        </div>
      )}

      {tab === "job" && (
        <div className="split">
          <div className="panel">
            <div className="panel-head"><div><h3>Employment</h3><p>Current position and organisation</p></div>
              {can.edit && !exited && <div className="panel-actions"><button className="btn ghost sm" type="button" onClick={() => setModal("status")}><UserCog />Change status</button></div>}</div>
            {dl([
              ["Designation", e.designation.title],
              ["Grade", e.grade ? `${e.grade.code} (${e.grade.name}) · band Rs ${e.grade.minSalary.toLocaleString("en-US")} – ${e.grade.maxSalary.toLocaleString("en-US")}` : "—"],
              ["Department", e.department.name], ["Cost centre", e.costCentre ? `${e.costCentre.code} ${e.costCentre.name}` : "—"],
              ["Reporting manager", e.manager ? <><Link className="link" href={`/hr/employees/${e.manager.id}`}>{e.manager.name}</Link> ({e.manager.designation})</> : "—"],
              ["Branch", e.branch.name], ["Shift", e.shift ? `${e.shift.name} ${e.shift.startTime} – ${e.shift.endTime} · ${e.shift.graceMinutes} min grace` : "—"],
              ["Weekly off", L("WeeklyOff", e.weeklyOff)], ["Employment type", `${L("EmploymentType", e.employmentType)} · ${L("WorkPattern", e.workPattern)}`],
              ["Date of joining", dateLabel(e.joiningDate)],
              ["Probation", e.probationMonths ? `${e.probationMonths} month${e.probationMonths === 1 ? "" : "s"} · ${e.confirmedOn ? `confirmed ${dateLabel(e.confirmedOn)}` : `due ${dateLabel(e.confirmationDueOn)}`}` : "None"],
              ["Notice period", `${e.noticeDays} days`], ["Biometric ID", v(e.biometricId)],
              ...(e.exitDate ? [["Exit", `${dateLabel(e.exitDate)} · ${L("ExitType", e.exitType)}`] as [string, ReactNode]] : []),
              ["ESS login", <span key="ess" className="row" style={{ gap: 8 }}>{e.appUser ? `${e.appUser.name} · ${e.appUser.email}` : "Not linked"}{can.edit && <button className="btn ghost sm" type="button" onClick={() => setModal("link")}><KeyRound />{e.appUser ? "Change" : "Link user"}</button>}</span>],
            ])}
          </div>
          <div className="stack">
            <div className="panel">
              <div className="panel-head"><div><h3>Position history</h3></div></div>
              {e.history.length ? <div className="timeline">{e.history.map((h) => <div key={h.id} className="tl-item"><span className={cn("tl-dot", EVENT_DOT[h.eventType])} /><div><b>{eventTitle(h)}</b><small>{eventNote(h)}</small></div></div>)}</div>
                : <p className="muted small">No position changes yet.</p>}
            </div>
            <div className="panel">
              <div className="panel-head"><div><h3>Direct reports</h3></div></div>
              {e.directReports.length ? <div className="list">{e.directReports.map((r) => <Link key={r.id} className="list-item" href={`/hr/employees/${r.id}`}><span className="avatar sm">{initials(r.name)}</span><div><b>{r.name}</b><small>{r.designation} · {r.code}</small></div></Link>)}</div>
                : <p className="muted small">No direct reports.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "salary" && placeholder(<Layers />, "Salary is set up in Payroll (Phase 12)", "Salary structure, employer contributions and payslips appear here once payroll setup is done.")}
      {tab === "attendance" && placeholder(<Clock />, "Attendance arrives with biometric punches", "The month grid and summary fill in once devices sync and attendance is processed.")}
      {tab === "leave" && placeholder(<Plane />, "Leave history and balances arrive with leave requests", "Leave types and their entitlements are set on Leave Policies.")}

      {tab === "documents" && (
        <div className="panel">
          <div className="panel-head"><div><h3>Documents</h3><p>{e.documents.length} item{e.documents.length === 1 ? "" : "s"} · {pending.length} pending</p></div>
            <div className="panel-actions">
              {can.edit && <button className="btn ghost sm" type="button" onClick={() => setModal("documents")}><Pencil />Checklist</button>}
              <button className="btn secondary sm" type="button" disabled title="Uploads arrive with file storage (Phase 35)"><Upload />Upload</button>
            </div></div>
          {e.documents.length ? (
            <div className="list">
              {e.documents.map((d) => (
                <div key={d.id} className="list-item">
                  <span className="icon-well">{d.status === "MISSING" ? <AlertTriangle /> : DOC_ICON[d.category] ?? <FileText />}</span>
                  <div><b>{d.title}</b><small>{[L("EmployeeDocumentCategory", d.category), d.isRequired && "required", d.dueOn && `due ${dateLabel(d.dueOn)}`, d.expiresOn && `expires ${dateLabel(d.expiresOn)}`].filter(Boolean).join(" · ")}</small></div>
                  <span className="spacer" /><span className={cn("badge", toneOf(lookups, "EmployeeDocumentStatus", d.status))}>{L("EmployeeDocumentStatus", d.status)}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={<FileText />} title="No documents tracked" description={can.edit ? "Add the documents this employee must provide." : "Documents HR tracks appear here."} />}
        </div>
      )}

      {tab === "assets" && placeholder(<Laptop />, "No assets assigned", "Assigning company assets (laptops, phones, cards) arrives with fixed assets and onboarding.")}

      {tab === "timeline" && (
        <div className="panel">
          <div className="panel-head"><div><h3>Activity timeline</h3><p>All HR events for this employee</p></div></div>
          {e.history.length ? <div className="timeline">{e.history.map((h) => <div key={h.id} className="tl-item"><span className={cn("tl-dot", EVENT_DOT[h.eventType])} /><div><b>{eventTitle(h)}</b><small>{eventNote(h)}</small></div></div>)}</div>
            : <EmptyState title="No events yet" />}
        </div>
      )}

      {tab === "history" && (
        <div className="panel">
          <div className="panel-head"><div><h3>Record history</h3><p>Who changed what, version by version</p></div>
            <div className="panel-actions"><select value={`${target[0]}:${target[1]}`} onChange={(x) => setHistoryOf(x.target.value)} aria-label="Record">{historyTargets.map(([t, i, l]) => <option key={i} value={`${t}:${i}`}>{l}</option>)}</select></div></div>
          <HistoryTab key={target[1]} schema="HumanResources" table={target[0]} id={target[1]} />
        </div>
      )}

      {modal === "edit" && <EditEmployeeModal e={e} opts={opts} lookups={lookups} onClose={() => setModal(null)} onSaved={saved} canDelete={can.remove} />}
      {modal === "position" && <PositionModal e={e} opts={opts} lookups={lookups} onClose={() => setModal(null)} onSaved={saved} />}
      {(modal === "confirm" || modal === "status" || modal === "exit" || modal === "rejoin") && <StatusModal kind={modal} e={e} opts={opts} lookups={lookups} onClose={() => setModal(null)} onSaved={saved} />}
      {modal === "link" && <LinkUserModal e={e} opts={opts} lookups={lookups} onClose={() => setModal(null)} onSaved={saved} />}
      {modal === "bank" && <BankModal e={e} opts={opts} lookups={lookups} onClose={() => setModal(null)} onSaved={saved} />}
      {modal === "statutory" && <StatutoryModal e={e} opts={opts} lookups={lookups} onClose={() => setModal(null)} onSaved={saved} />}
      {modal === "documents" && <DocumentsModal e={e} opts={opts} lookups={lookups} onClose={() => setModal(null)} onSaved={saved} />}
    </>
  );
}
