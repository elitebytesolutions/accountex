"use client";

import { Building, ClipboardPen, Hourglass, Landmark, Laptop, LogOut, Plus, TrendingDown, UserCheck, UserX, Users, History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EXIT_PRIMARY_REASONS, EXIT_TYPES, OFFBOARDING_REASONS, type OffboardingBoard, type OffboardingDetail, type OffboardingOptions } from "@/shared";
import { Check as CheckBox, Field } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { initialsOf } from "@/features/auth/initials";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { clearItem, completeOffboarding, createOffboarding, getOffboarding, offboardingBoard, offboardingOptions, saveExitInterview, updateOffboarding, withdrawOffboarding } from "../lifecycle-api";
import { dmy, localToday, stamp } from "./attendance-ui";
import { OffboardingSettlementButton } from "./offboarding-settlement";

const LOOKUPS = ["ExitType", "OffboardingReasonCategory", "ClearanceArea", "PrimaryReason", "OffboardingStatus"];
const STATUS: Record<string, [string, string]> = { SERVING_NOTICE: ["Serving notice", "info"], RETENTION_TALK: ["Retention talk", "warn"], SETTLEMENT: ["Settlement", "warn"], CLOSED: ["Closed", "neutral"], WITHDRAWN: ["Withdrawn", "neutral"] };
const AREA_ICON: Record<string, typeof Laptop> = { IT: Laptop, ADMINISTRATION: Building, FINANCE: Landmark, LINE_MANAGER: Users, HR: UserCheck };
const AREA_NOTE: Record<string, string> = { IT: "Assets & access revocation", ADMINISTRATION: "ID card, keys, SIM, vehicle", FINANCE: "Loans, advances, claims", LINE_MANAGER: "Knowledge handover", HR: "Exit formalities" };
const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

type ResignForm = { employeeId: string; exitType: string; resignationDate: string; lastWorkingDay: string; noticeDaysRequired: string; reasonCategory: string; reasonDetail: string; isVoluntary: boolean };
type InterviewForm = { interviewDate: string; primaryReason: string; wouldRejoin: string; roleSatisfaction: string; managerSatisfaction: string; compensationFairness: string; wouldRecommend: string; valuedMost: string; shouldImprove: string; eligibleForRehire: boolean; isConfidential: boolean };

/** Template app/hr/offboarding (51-hr-pay-talent.html): KPIs, exits in progress, exit reasons, clearance by department, record resignation and exit interview modals; added: the exit drawer with clearance, completion and History. */
export function OffboardingScreen({ can }: { can: { edit: boolean } }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const lbl = (t: string, c: string) => labelOf(lookups, t, c) || humanize(c);
  const [data, setData] = useState<OffboardingBoard | null>(null);
  const [opts, setOpts] = useState<OffboardingOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<OffboardingDetail | null>(null);
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [resign, setResign] = useState<ResignForm | null>(null);
  const [interview, setInterview] = useState<InterviewForm | null>(null);
  const [confirm, setConfirm] = useState<"complete" | "withdraw" | null>(null);
  const [waive, setWaive] = useState<{ id: string; area: string; remarks: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    offboardingBoard("ALL").then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load exits" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const show = async (id: string) => { try { setTab("detail"); setOpen(await getOffboarding(id)); } catch (e) { toast(apiMessage(e, "Could not open the exit"), { tone: "danger" }); } };
  const run = async (work: () => Promise<OffboardingDetail>, done: string, after?: () => void) => {
    setBusy(true); setErrs({});
    try { const r = await work(); toast(done, { tone: "good" }); setOpen(r); after?.(); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const newResign = async () => {
    setErrs({});
    if (!opts) setOpts(await offboardingOptions().catch(() => null));
    setResign({ employeeId: "", exitType: "RESIGNATION", resignationDate: localToday(), lastWorkingDay: "", noticeDaysRequired: "", reasonCategory: "BETTER_OPPORTUNITY", reasonDetail: "", isVoluntary: true });
  };
  const openInterview = async (id?: string) => {
    const o = id ? await getOffboarding(id) : open;
    if (!o) { toast("Open an exit first", { tone: "info" }); return; }
    setOpen(o); setErrs({});
    const i = o.interview;
    setInterview({
      interviewDate: i?.interviewDate ?? localToday(), primaryReason: i?.primaryReason ?? ((EXIT_PRIMARY_REASONS as readonly string[]).includes(o.reasonCategory) ? o.reasonCategory : "OTHER"),
      wouldRejoin: i?.wouldRejoin ?? "YES", roleSatisfaction: String(i?.roleSatisfaction ?? 4), managerSatisfaction: String(i?.managerSatisfaction ?? 4), compensationFairness: String(i?.compensationFairness ?? 3),
      wouldRecommend: i?.wouldRecommend === false ? "NO" : "YES", valuedMost: i?.valuedMost ?? "", shouldImprove: i?.shouldImprove ?? "", eligibleForRehire: i?.eligibleForRehire ?? true, isConfidential: i?.isConfidential ?? false,
    });
  };
  const inProgress = data?.items.filter((i) => i.status !== "WITHDRAWN" && (i.status !== "CLOSED" || i.closedAt! >= `${data.fyStart}`)) ?? [];
  const maxReason = Math.max(1, ...(data?.reasons.map((r) => r.count) ?? [1]));
  const k = data?.kpis;
  const emp = opts?.employees.find((e) => e.id === resign?.employeeId);
  const o = open;
  const isOpen = !!o && ["SERVING_NOTICE", "RETENTION_TALK", "SETTLEMENT"].includes(o.status);
  const pending = o?.clearance.filter((c) => c.status === "PENDING").length ?? 0;

  return (
    <>
      <PageHead eyebrow="Workforce / Talent / Offboarding" title="Offboarding & Exits" description="Resignations, notice periods, clearance and exit interviews leading to final settlement."
        actions={<>
          {can.edit && <button className="btn secondary" type="button" onClick={() => openInterview()}><ClipboardPen />Exit interview</button>}
          {can.edit && <button className="btn primary" type="button" onClick={newResign}><Plus />Record resignation</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Exits in FY {data ? `${data.fyStart.slice(0, 4)}-${String(Number(data.fyStart.slice(2, 4)) + 1).padStart(2, "0")}` : ""}</span><span className="icon-well"><LogOut /></span></div><strong>{k?.exitsFy ?? "—"}</strong><small>{k ? `${k.voluntaryFy} voluntary` : ""}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Serving Notice</span><span className="icon-well"><Hourglass /></span></div><strong>{k?.servingNotice ?? "—"}</strong><small>{k?.lastDaysNote ?? "Nobody serving notice"}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Annualised Attrition</span><span className="icon-well"><TrendingDown /></span></div><strong>{k?.attritionPct != null ? `${k.attritionPct}%` : "—"}</strong><small>Exits this FY, annualised</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Pending Settlements</span><span className="icon-well"><UserX /></span></div><strong>{k?.pendingSettlements ?? "—"}</strong><small>Exits at the final settlement stage</small></div>
      </div>

      <div className="panel flush mb">
        <div className="panel-head"><div><h3>Exits in progress</h3><p>Clearance and final settlement</p></div></div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Employee</th><th>Department</th><th>Resignation</th><th>Last day</th><th>Notice</th><th>Reason</th><th>Clearance</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={9}><Skeleton style={{ height: 140 }} /></td></tr> : inProgress.length ? inProgress.map((r) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => show(r.id)}>
                <td><div className="cell-user"><span className="avatar sm">{initialsOf(r.employee.name)}</span><div><b>{r.employee.name}</b><small>{r.employee.code}{r.employee.designation ? ` · ${r.employee.designation}` : ""}</small></div></div></td>
                <td>{r.employee.department ?? "—"}</td><td className="nowrap">{r.resignationDate ? dmy(r.resignationDate) : "—"}</td><td className="nowrap">{dmy(r.lastWorkingDay)}</td>
                <td className="nowrap">{r.exitType === "TERMINATION" ? "Terminated" : r.noticeWaived ? "Waived" : r.noticeDaysServed != null ? `${r.noticeDaysServed} / ${r.noticeDaysRequired} days` : `${r.noticeDaysRequired} days`}</td>
                <td>{lbl("OffboardingReasonCategory", r.reasonCategory)}</td>
                <td><div className="progress"><i style={{ width: `${r.clearanceTotal ? Math.round((r.clearanceDone / r.clearanceTotal) * 100) : 0}%` }} /></div><small>{r.clearanceDone} / {r.clearanceTotal}</small></td>
                <td><span className={`badge ${STATUS[r.status]?.[1] ?? "neutral"} dot`}>{STATUS[r.status]?.[0] ?? r.status}</span></td>
                <td className="actions" onClick={(e) => e.stopPropagation()}>{r.status === "CLOSED" ? <button className="btn sm secondary" type="button" onClick={() => show(r.id)}>View</button> : !r.hasInterview && can.edit ? <button className="btn sm secondary" type="button" onClick={() => openInterview(r.id)}>Interview</button> : <button className="btn sm secondary" type="button" onClick={() => show(r.id)}>Open</button>}</td>
              </tr>
            )) : <tr><td colSpan={9}><EmptyState icon={<LogOut />} title="No exits in progress" description="Record a resignation to start clearance and the exit interview." /></td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><div><h3>Exit Reasons · last 12 months</h3><p>{data ? `${data.reasons.reduce((n, r) => n + r.count, 0)} exits` : ""}</p></div></div>
          {!data ? <Skeleton style={{ height: 140 }} /> : data.reasons.length ? <div className="stack">{data.reasons.map((r) => (
            <div key={r.reason}><div className="row small"><span>{lbl("OffboardingReasonCategory", r.reason)}</span><span className="spacer" /><b>{r.count}</b></div><div className={`progress ${r.reason === "MISCONDUCT" ? "danger" : ""}`}><i style={{ width: `${Math.round((r.count / maxReason) * 100)}%` }} /></div></div>
          ))}</div> : <EmptyState icon={<TrendingDown />} title="No exits yet" description="Reasons appear as exits are recorded." />}
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Clearance by Department</h3><p>Open exit cases</p></div></div>
          {!data ? <Skeleton style={{ height: 140 }} /> : data.clearanceByArea.length ? <div className="list">{data.clearanceByArea.map((c) => { const Ic = AREA_ICON[c.area] ?? Users; return (
            <div className="list-item" key={c.area}><span className="icon-well"><Ic /></span><div><b>{lbl("ClearanceArea", c.area)}</b><small>{AREA_NOTE[c.area] ?? ""}</small></div><span className="spacer" />{c.pending ? <span className="badge warn">{c.pending} pending</span> : <span className="badge good">{c.cleared} cleared</span>}</div>
          ); })}</div> : <EmptyState icon={<Users />} title="No open clearance" description="Clearance items of open exits appear here." />}
        </div>
      </div>

      <Drawer open={!!o} onClose={() => setOpen(null)} title={o ? `${o.docNo} · ${o.employee.name}` : ""} subtitle={o ? `${lbl("ExitType", o.exitType)} · last day ${dmy(o.lastWorkingDay)}` : ""}
        foot={o && (<>
          <button className="btn ghost" type="button" onClick={() => setTab(tab === "detail" ? "history" : "detail")}><History />{tab === "detail" ? "History" : "Details"}</button>
          {isOpen && can.edit && <button className="btn ghost" type="button" disabled={busy} onClick={() => setConfirm("withdraw")}>Withdraw</button>}
          <span className="spacer" />
          <OffboardingSettlementButton key={o.id} offboardingId={o.id} canCreate={can.edit} isOpen={isOpen} />
          {isOpen && can.edit && <button className="btn secondary" type="button" onClick={() => openInterview()}><ClipboardPen />{o.interview ? "Edit interview" : "Exit interview"}</button>}
          {isOpen && can.edit && <button className="btn primary" type="button" disabled={busy || pending > 0} title={pending ? "Clear or waive every clearance item first" : undefined} onClick={() => setConfirm("complete")}>Complete exit</button>}
        </>)}>
        {o && (tab === "history" ? <HistoryTab schema="HumanResources" table="Offboardings" id={o.id} /> : <>
          <div className="row mb"><span className="avatar lg">{initialsOf(o.employee.name)}</span><div><b>{o.employee.name}</b><small className="muted" style={{ display: "block" }}>{[o.employee.code, o.employee.designation, o.employee.department].filter(Boolean).join(" · ")}</small></div><span className="spacer" /><span className={`badge ${STATUS[o.status]?.[1] ?? "neutral"} dot`}>{STATUS[o.status]?.[0] ?? o.status}</span></div>
          <div className="dl">
            <div><span>Exit type</span><b>{lbl("ExitType", o.exitType)}{o.isVoluntary ? " · voluntary" : " · involuntary"}</b></div>
            {o.resignationDate && <div><span>Resignation</span><b>{dmy(o.resignationDate)}</b></div>}
            <div><span>Last working day</span><b>{dmy(o.lastWorkingDay)}</b></div>
            <div><span>Notice</span><b>{o.noticeWaived ? "Waived" : `${o.noticeDaysServed ?? "—"} / ${o.noticeDaysRequired} days`}</b></div>
            <div><span>Reason</span><b>{lbl("OffboardingReasonCategory", o.reasonCategory)}{o.reasonDetail ? ` — ${o.reasonDetail}` : ""}</b></div>
            <div><span>Login</span><b>{o.appUser ? `${o.appUser.email} · ${humanize(o.appUser.status)}${o.appUser.isDefault ? " · the company's default user (stays active: completing is refused)" : isOpen ? " · suspended on completion" : ""}` : "No app login"}</b></div>
            {o.closedAt && <div><span>Closed</span><b>{stamp(o.closedAt)}</b></div>}
            {o.remarks && <div><span>Remarks</span><b style={{ whiteSpace: "pre-line" }}>{o.remarks}</b></div>}
          </div>
          {isOpen && can.edit && <div className="row mt" style={{ gap: 8 }}>
            <span className="small muted">Stage</span>
            <select aria-label="Stage" value={o.status} disabled={busy} onChange={(e) => run(() => updateOffboarding(o.id, { status: e.target.value, rowVersion: o.rowVersion }), "Exit updated")}>{["SERVING_NOTICE", "RETENTION_TALK", "SETTLEMENT"].map((s) => <option key={s} value={s}>{STATUS[s]![0]}</option>)}</select>
          </div>}
          <div className="form-section"><h4>Clearance ({o.clearance.filter((c) => c.status !== "PENDING").length} / {o.clearance.length})</h4></div>
          <div className="list">{o.clearance.map((c) => { const Ic = AREA_ICON[c.clearanceArea] ?? Users; return (
            <div className="list-item" key={c.id}><span className="icon-well"><Ic /></span><div><b>{lbl("ClearanceArea", c.clearanceArea)}</b><small>{c.description}{c.owner ? ` · ${c.owner.name}` : ""}{c.status !== "PENDING" ? ` · ${c.status === "WAIVED" ? "waived" : "cleared"}${c.clearedBy ? ` by ${c.clearedBy.name}` : ""} ${stamp(c.clearedAt)}${c.remarks ? ` — ${c.remarks}` : ""}` : ""}</small></div><span className="spacer" />
              {c.status === "PENDING" ? (isOpen && can.edit ? <>
                <button className="btn sm secondary" type="button" disabled={busy} onClick={() => run(() => clearItem(o.id, c.id, "clear", null), `${lbl("ClearanceArea", c.clearanceArea)} cleared`)}>Clear</button>
                <button className="btn sm ghost" type="button" disabled={busy} onClick={() => setWaive({ id: c.id, area: c.clearanceArea, remarks: "" })}>Waive</button>
              </> : <span className="badge warn">Pending</span>) : <span className={`badge ${c.status === "CLEARED" ? "good" : "neutral"}`}>{c.status === "CLEARED" ? "Cleared" : "Waived"}</span>}
            </div>
          ); })}</div>
          <div className="form-section"><h4>Exit interview</h4></div>
          {o.interview ? <div className="dl">
            <div><span>Date</span><b>{dmy(o.interview.interviewDate)}{o.interview.conductedBy ? ` · ${o.interview.conductedBy.name}` : ""}</b></div>
            <div><span>Primary reason</span><b>{lbl("PrimaryReason", o.interview.primaryReason)}</b></div>
            <div><span>Scores</span><b>Role {o.interview.roleSatisfaction ?? "—"} · Manager {o.interview.managerSatisfaction ?? "—"} · Pay {o.interview.compensationFairness ?? "—"} (of 5)</b></div>
            <div><span>Would rejoin</span><b>{o.interview.wouldRejoin ? humanize(o.interview.wouldRejoin) : "—"}{o.interview.eligibleForRehire ? " · eligible for rehire" : " · not eligible for rehire"}</b></div>
            {o.interview.valuedMost && <div><span>Valued most</span><b>{o.interview.valuedMost}</b></div>}
            {o.interview.shouldImprove && <div><span>Should improve</span><b>{o.interview.shouldImprove}</b></div>}
          </div> : <p className="small muted">Not recorded yet.</p>}
        </>)}
      </Drawer>

      <Modal open={!!resign} onClose={() => setResign(null)} title="Record resignation" subtitle="Creates the exit with the IT, Administration, Finance and line-manager clearance items."
        foot={<><button className="btn secondary" type="button" onClick={() => setResign(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={() => resign && run(() => createOffboarding({ ...resign, noticeDaysRequired: resign.noticeDaysRequired || undefined, resignationDate: resign.resignationDate || null, reasonDetail: resign.reasonDetail || null }), "Resignation recorded", () => setResign(null))}>Record</button></>}>
        {resign && <div className="form-grid">
          <Field label="Employee" required full error={errs.employeeId}><select value={resign.employeeId} onChange={(e) => { const x = opts?.employees.find((y) => y.id === e.target.value); setResign({ ...resign, employeeId: e.target.value, noticeDaysRequired: x ? String(x.noticeDays) : "" }); }}><option value="">Select employee…</option>{opts?.employees.filter((x) => !x.hasOpen).map((x) => <option key={x.id} value={x.id}>{x.name} — {x.code}</option>)}</select></Field>
          <Field label="Exit type" required error={errs.exitType}><select value={resign.exitType} onChange={(e) => setResign({ ...resign, exitType: e.target.value, isVoluntary: e.target.value === "RESIGNATION" || e.target.value === "RETIREMENT" })}>{EXIT_TYPES.map((t) => <option key={t} value={t}>{lbl("ExitType", t)}</option>)}</select></Field>
          <Field label="Resignation date" required={resign.exitType === "RESIGNATION"} error={errs.resignationDate}><input type="date" value={resign.resignationDate} onChange={(e) => setResign({ ...resign, resignationDate: e.target.value })} /></Field>
          <Field label="Last working day" required error={errs.lastWorkingDay}><input type="date" value={resign.lastWorkingDay} min={resign.resignationDate || undefined} onChange={(e) => setResign({ ...resign, lastWorkingDay: e.target.value })} /></Field>
          <Field label="Notice (days)" error={errs.noticeDaysRequired} hint={emp ? `Contract notice: ${emp.noticeDays} days` : undefined}><input type="number" min={0} max={365} value={resign.noticeDaysRequired} onChange={(e) => setResign({ ...resign, noticeDaysRequired: e.target.value })} /></Field>
          <Field label="Reason" required error={errs.reasonCategory}><select value={resign.reasonCategory} onChange={(e) => setResign({ ...resign, reasonCategory: e.target.value })}>{OFFBOARDING_REASONS.map((r) => <option key={r} value={r}>{lbl("OffboardingReasonCategory", r)}</option>)}</select></Field>
          <Field label="Details" full error={errs.reasonDetail}><textarea rows={2} maxLength={300} value={resign.reasonDetail} onChange={(e) => setResign({ ...resign, reasonDetail: e.target.value })} /></Field>
          <CheckBox full label="Voluntary exit" checked={resign.isVoluntary} onChange={(e) => setResign({ ...resign, isVoluntary: e.target.checked })} />
        </div>}
      </Modal>

      <Modal open={!!interview && !!o} onClose={() => setInterview(null)} wide title="Exit Interview" subtitle={o ? `${o.employee.name}${o.employee.designation ? ` · ${o.employee.designation}` : ""} · Last day ${dmy(o.lastWorkingDay)}` : ""}
        foot={<><button className="btn secondary" type="button" onClick={() => setInterview(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={() => o && interview && run(() => saveExitInterview(o.id, { ...interview, wouldRecommend: interview.wouldRecommend === "YES", valuedMost: interview.valuedMost || null, shouldImprove: interview.shouldImprove || null, rowVersion: o.rowVersion }), "Exit interview saved", () => setInterview(null))}>Save interview</button></>}>
        {interview && <div className="form-grid">
          <Field label="Interview date" error={errs.interviewDate}><input type="date" value={interview.interviewDate} onChange={(e) => setInterview({ ...interview, interviewDate: e.target.value })} /></Field>
          <Field label="Primary reason" error={errs.primaryReason}><select value={interview.primaryReason} onChange={(e) => setInterview({ ...interview, primaryReason: e.target.value })}>{EXIT_PRIMARY_REASONS.map((r) => <option key={r} value={r}>{lbl("PrimaryReason", r)}</option>)}</select></Field>
          <Field label="Would you rejoin?"><select value={interview.wouldRejoin} onChange={(e) => setInterview({ ...interview, wouldRejoin: e.target.value })}><option value="YES">Yes</option><option value="MAYBE">Maybe</option><option value="NO">No</option></select></Field>
          <Field label="Satisfaction with role (1–5)"><select value={interview.roleSatisfaction} onChange={(e) => setInterview({ ...interview, roleSatisfaction: e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label="Satisfaction with manager (1–5)"><select value={interview.managerSatisfaction} onChange={(e) => setInterview({ ...interview, managerSatisfaction: e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label="Compensation fairness (1–5)"><select value={interview.compensationFairness} onChange={(e) => setInterview({ ...interview, compensationFairness: e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label="Recommend us to friends?"><select value={interview.wouldRecommend} onChange={(e) => setInterview({ ...interview, wouldRecommend: e.target.value })}><option value="YES">Yes</option><option value="NO">No</option></select></Field>
          <Field label="What did you value most?" full><textarea rows={2} maxLength={1000} value={interview.valuedMost} onChange={(e) => setInterview({ ...interview, valuedMost: e.target.value })} /></Field>
          <Field label="What should we improve?" full><textarea rows={2} maxLength={1000} value={interview.shouldImprove} onChange={(e) => setInterview({ ...interview, shouldImprove: e.target.value })} /></Field>
          <CheckBox label="Eligible for rehire" checked={interview.eligibleForRehire} onChange={(e) => setInterview({ ...interview, eligibleForRehire: e.target.checked })} />
          <CheckBox label="Confidential — HR only" checked={interview.isConfidential} onChange={(e) => setInterview({ ...interview, isConfidential: e.target.checked })} />
        </div>}
      </Modal>

      <Modal open={!!waive && !!o} onClose={() => setWaive(null)} title={`Waive ${waive ? lbl("ClearanceArea", waive.area) : ""} clearance`} subtitle="A waived item counts as done; the reason stays on the record."
        foot={<><button className="btn secondary" type="button" onClick={() => setWaive(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy || !waive?.remarks.trim()} onClick={() => o && waive && run(() => clearItem(o.id, waive.id, "waive", waive.remarks), `${lbl("ClearanceArea", waive.area)} waived`, () => setWaive(null))}>Waive</button></>}>
        {waive && <div className="form-grid"><Field label="Reason" required full error={errs.remarks}><textarea rows={2} maxLength={300} value={waive.remarks} onChange={(e) => setWaive({ ...waive, remarks: e.target.value })} /></Field></div>}
      </Modal>

      <ConfirmDialog open={!!confirm && !!o} onClose={() => setConfirm(null)} busy={busy} danger={confirm === "withdraw"}
        title={confirm === "complete" ? `Complete ${o?.employee.name}'s exit?` : "Withdraw this exit?"} confirmLabel={confirm === "complete" ? "Complete exit" : "Withdraw"}
        onConfirm={async () => { const c = confirm; setConfirm(null); if (o && c === "complete") await run(() => completeOffboarding(o.id, o.rowVersion), `${o.employee.name} marked exited${o.appUser ? " · login suspended" : ""}`); if (o && c === "withdraw") await run(() => withdrawOffboarding(o.id, o.rowVersion, "Withdrawn by HR"), "Exit withdrawn"); }}>
        {confirm === "complete" ? `The employee is marked exited on ${o ? dmy(o.lastWorkingDay) : ""}${o?.appUser ? " and their login is suspended (signed out everywhere)" : ""}. The final settlement must be approved first.` : "The employee stays on the payroll; clearance and the interview are kept for the record."}
      </ConfirmDialog>
    </>
  );
}
