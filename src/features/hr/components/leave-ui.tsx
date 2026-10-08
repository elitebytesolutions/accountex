"use client";

import { Check, History, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LEAVE_REJECT_REASONS, type LeaveFormOptions, type LeavePreview, type LeaveRequestDetail, type LeaveTypeRef } from "@/shared";
import { Check as CheckBox, Field } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { initialsOf } from "@/features/auth/initials";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { applyOnBehalf, approveLeave, cancelLeave, previewLeave, rejectLeave } from "../lifecycle-api";
import { dmy, localToday, stamp, StatusBadge } from "./attendance-ui";

/** Shared bits of the Phase 31 leave screens. */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dm = (d: string) => `${d.slice(8, 10)} ${MON[Number(d.slice(5, 7)) - 1]}`;
export const leaveRange = (r: { fromDate: string; toDate: string }) => (r.fromDate === r.toDate ? dm(r.fromDate) : `${dm(r.fromDate)} – ${dm(r.toDate)}`);
export const days = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}`;
export const COLOUR_TONE: Record<string, string> = { GREEN: "good", TEAL: "info", BLUE: "info", AMBER: "warn", VIOLET: "violet", RED: "danger", ORANGE: "warn", GREY: "neutral" };
export const COLOUR_VAR: Record<string, string> = { GREEN: "var(--primary)", TEAL: "var(--info)", BLUE: "var(--blue)", AMBER: "var(--warn)", VIOLET: "var(--violet)", RED: "var(--danger)", ORANGE: "var(--orange)", GREY: "var(--muted)" };
export const toneOf = (t: Pick<LeaveTypeRef, "colour">) => COLOUR_TONE[t.colour] ?? "neutral";
export const shortName = (t: Pick<LeaveTypeRef, "name">) => t.name.replace(/\s*\(.*\)$/, "");
export const LeaveBadge = ({ t }: { t: LeaveTypeRef }) => <span className={`badge ${toneOf(t)}`}>{shortName(t)}</span>;
export const STAGE_LABEL: Record<string, string> = { LINE_MANAGER: "Line manager", HR_REVIEW: "HR review", CEO: "CEO", COMPLETED: "Completed" };
export const REJECT_LABEL: Record<string, string> = {
  BUSINESS_CRITICAL_PERIOD: "Business-critical period (month/quarter end)", INSUFFICIENT_BALANCE: "Insufficient balance", TEAM_OVERLAP: "Too many team members on leave",
  SHORT_NOTICE: "Short notice", OTHER: "Other",
};
export const DURATION_LABEL: Record<string, string> = { FULL: "Full day(s)", HALF_AM: "Half day — AM", HALF_PM: "Half day — PM" };

/** The preview banner under an apply form (working days, holidays / weekly offs, balance, rule problems). */
export function PreviewBanner({ p }: { p: LeavePreview | null }) {
  if (!p) return null;
  const errs = Object.values(p.errors);
  const excluded = [p.weeklyOffDays.length ? `${p.weeklyOffDays.length} weekly off` : "", p.holidays.length ? p.holidays.map((h) => h.name).join(", ") : ""].filter(Boolean);
  return (
    <>
      <div className={`banner ${errs.length ? "danger" : "info"} mt`}>{errs.length ? <TriangleAlert /> : <Info />}<div>
        <b>{days(p.days)} working day{p.days === 1 ? "" : "s"}{p.balance ? ` · balance ${days(p.balance.available)} → ${days(p.balance.after)}` : ""}</b>
        <p>{errs.length ? errs.join(" · ") : excluded.length ? `Excludes ${excluded.join(" + ")}.` : "No holidays or sandwiched weekly off in range."}{p.clashes.length ? ` Also out: ${p.clashes.map((c) => c.name).join(", ")}.` : ""}</p>
      </div></div>
      {p.warnings.map((w) => <div key={w} className="banner warn mt"><TriangleAlert /><div><p>{w}</p></div></div>)}
    </>
  );
}

type ApplyForm = { employeeId: string; leaveTypeId: string; duration: string; fromDate: string; toDate: string; reason: string };
/** HR applies leave on someone's behalf (template hrc-leave-apply / hrc-leave-apply2): the approval chain is skipped. */
export function ApplyOnBehalfModal({ open, onClose, options, onDone, title = "Apply leave on behalf" }: { open: boolean; onClose: () => void; options: LeaveFormOptions | null; onDone: () => void; title?: string }) {
  const toast = useToast();
  const [f, setF] = useState<ApplyForm>({ employeeId: "", leaveTypeId: "", duration: "FULL", fromDate: localToday(), toDate: localToday(), reason: "" });
  const [preview, setP] = useState<LeavePreview | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const typeId = f.leaveTypeId || options?.types[0]?.id || "";
  const ready = open && !!f.employeeId && !!typeId && !!f.fromDate && !!f.toDate && f.toDate >= f.fromDate;
  const p = ready ? preview : null;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const t = setTimeout(() => previewLeave({ ...f, leaveTypeId: typeId, toDate: f.duration === "FULL" ? f.toDate : f.fromDate }).then((r) => !cancelled && setP(r)).catch(() => !cancelled && setP(null)), 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ready, f, typeId]);
  const set = (k: keyof ApplyForm, v: string) => { setF((x) => ({ ...x, [k]: v, ...(k === "fromDate" && x.toDate < v ? { toDate: v } : {}) })); setErrs((e) => ({ ...e, [k]: "" })); };
  const submit = async () => {
    setBusy(true);
    try {
      const r = await applyOnBehalf({ ...f, leaveTypeId: typeId, toDate: f.duration === "FULL" ? f.toDate : f.fromDate, reason: f.reason || null });
      toast(`Leave recorded for ${r.employee.name} (${r.docNo})`, { tone: "good" });
      onClose(); onDone();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not record the leave"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle="Approval chain is skipped when HR applies."
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !f.employeeId} onClick={submit}>{busy ? "Submitting…" : "Submit"}</button></>}>
      <div className="form-grid">
        <Field label="Employee" required full error={errs.employeeId}>
          <select value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)}><option value="">Select employee…</option>{options?.employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.code}</option>)}</select>
        </Field>
        <Field label="Leave type" required error={errs.leaveTypeId}>
          <select value={typeId} onChange={(e) => set("leaveTypeId", e.target.value)}>{options?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </Field>
        <Field label="Duration" error={errs.duration}>
          <select value={f.duration} onChange={(e) => set("duration", e.target.value)}>{Object.entries(DURATION_LABEL).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        </Field>
        <Field label="From" required error={errs.fromDate}><input type="date" value={f.fromDate} onChange={(e) => set("fromDate", e.target.value)} /></Field>
        <Field label="To" required error={errs.toDate}><input type="date" value={f.duration === "FULL" ? f.toDate : f.fromDate} min={f.fromDate} disabled={f.duration !== "FULL"} onChange={(e) => set("toDate", e.target.value)} /></Field>
        <Field label="Reason" full error={errs.reason}><textarea rows={2} maxLength={500} value={f.reason} onChange={(e) => set("reason", e.target.value)} /></Field>
      </div>
      <PreviewBanner p={p} />
    </Modal>
  );
}

/** The request drawer: details, balance, overlap, approval flow and History; approve / reject / cancel. Render it with key={request id}. */
export function LeaveDrawer({ open, onClose, onChanged, canCancel }: { open: LeaveRequestDetail | null; onClose: () => void; onChanged: (r: LeaveRequestDetail | null) => void; canCancel: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [comment, setComment] = useState("");
  const [reject, setReject] = useState<{ reason: string; comment: string; suggestAlternative: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<LeaveRequestDetail>, done: string) => {
    setBusy(true);
    try { const r = await work(); toast(done, { tone: "good" }); setReject(null); onChanged(r); } catch (e) { toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const r = open;
  const b = r?.balance;
  const steps = r?.approval?.steps ?? [];
  return (
    <>
      <Drawer open={!!r} onClose={onClose} title={r ? `${r.docNo} · ${r.employee.name}` : ""} subtitle={r ? `${r.leaveType.name} · submitted ${stamp(r.submittedAt)}` : ""}
        foot={r && (<>
          {r.status === "PENDING" && r.canAct && <button className="btn danger" type="button" disabled={busy} onClick={() => setReject({ reason: "BUSINESS_CRITICAL_PERIOD", comment, suggestAlternative: false })}><X />Reject</button>}
          {canCancel && (r.status === "PENDING" || r.status === "APPROVED") && <button className="btn ghost" type="button" disabled={busy} onClick={() => act(() => cancelLeave(r.id, r.rowVersion, "Cancelled by HR"), `${r.docNo} cancelled`)}>Cancel leave</button>}
          <button className="btn ghost" type="button" onClick={() => setTab(tab === "detail" ? "history" : "detail")}><History />{tab === "detail" ? "History" : "Details"}</button>
          <span className="spacer" />
          <button className="btn secondary" type="button" onClick={onClose}>Close</button>
          {r.status === "PENDING" && r.canAct && <button className="btn primary" type="button" disabled={busy} onClick={() => act(() => approveLeave(r.id, comment || null), `Leave approved — ${r.employee.name} notified`)}><Check />Approve</button>}
        </>)}>
        {r && (tab === "history" ? <HistoryTab schema="HumanResources" table="LeaveRequests" id={r.id} /> : (
          <>
            <div className="row mb"><span className="avatar lg">{initialsOf(r.employee.name)}</span><div><b>{r.employee.name}</b><small className="muted" style={{ display: "block" }}>{[r.employee.code, r.employee.department, r.employee.branch].filter(Boolean).join(" · ")}</small></div><span className="spacer" /><StatusBadge status={r.status} /></div>
            <div className="dl">
              <div><span>Period</span><b>{dmy(r.fromDate)}{r.toDate !== r.fromDate ? ` – ${dmy(r.toDate)}` : ""} ({days(r.days)} working day{r.days === 1 ? "" : "s"}{r.duration !== "FULL" ? `, ${DURATION_LABEL[r.duration]}` : ""})</b></div>
              <div><span>Type</span><b><LeaveBadge t={r.leaveType} /></b></div>
              {b && <div><span>Balance</span><b>{days(b.available + (r.status === "PENDING" ? r.days : 0))} → {days(b.available)} days available (used {days(b.used)}, booked {days(b.booked)})</b></div>}
              <div><span>Team overlap</span><b>{r.overlap.length ? r.overlap.map((o) => `${o.name} (${leaveRange(o)}${o.status === "PENDING" ? ", pending" : ""})`).join(", ") : "Nobody else in the department"}</b></div>
              {r.handover && <div><span>Handover</span><b>{r.handover.name}</b></div>}
              {r.contactDuringLeave && <div><span>Contact</span><b>{r.contactDuringLeave}</b></div>}
              <div><span>Reason</span><b>{r.reason ?? "—"}</b></div>
              <div><span>Channel</span><b>{r.appliedOnBehalf ? "Applied by HR on behalf" : r.channel === "ESS_MOBILE" ? "Mobile" : "My Profile"}</b></div>
              {r.rejectionReason && <div><span>Rejected because</span><b>{REJECT_LABEL[r.rejectionReason] ?? r.rejectionReason}{r.decisionComment ? ` — ${r.decisionComment}` : ""}{r.suggestAlternative ? " · alternative dates suggested" : ""}</b></div>}
              {r.status === "APPROVED" && r.decisionComment && <div><span>Comment</span><b>{r.decisionComment}</b></div>}
              {r.status === "CANCELLED" && <div><span>Cancelled</span><b>{stamp(r.cancelledAt)}{r.cancelReason ? ` — ${r.cancelReason}` : ""}</b></div>}
            </div>
            <div className="form-section"><h4>Approval flow</h4></div>
            <div className="timeline">
              <div className="tl-item"><span className="tl-dot good" /><div><b>{r.appliedOnBehalf ? "Recorded by HR" : `Submitted by ${r.employee.name}`}</b><small>{stamp(r.submittedAt)}</small></div></div>
              {steps.length ? steps.map((s) => (
                <div className="tl-item" key={s.stepNo}><span className={`tl-dot ${s.state === "done" ? "good" : s.state === "current" ? "warn" : ""}`} /><div><b>{s.name}{s.approvers.length ? ` — ${s.approvers.map((a) => a.name).join(", ")}` : ""}</b>
                  <small>{s.state === "done" ? `Approved${s.actedBy[0] ? ` by ${s.actedBy[0].name} · ${stamp(s.actedBy[0].at)}` : ""}` : s.state === "current" ? (r.status === "PENDING" ? "Awaiting action" : r.status === "REJECTED" ? "Rejected" : "Closed") : s.state === "skipped" ? "Skipped — no approver" : "Waiting"}</small></div></div>
              )) : <div className="tl-item"><span className={`tl-dot ${r.status === "PENDING" ? "warn" : "good"}`} /><div><b>{STAGE_LABEL[r.stage] ?? "HR"}</b><small>{r.status === "PENDING" ? "Awaiting action" : `${r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Rejected" : "Closed"}${r.decidedBy ? ` by ${r.decidedBy.name}` : ""}`}</small></div></div>}
            </div>
            {r.status === "PENDING" && r.canAct && <label className="full mt" style={{ display: "block" }}><span className="small muted">Comment (optional)</span><textarea rows={2} style={{ width: "100%" }} value={comment} onChange={(e) => setComment(e.target.value)} /></label>}
          </>
        ))}
      </Drawer>
      <Modal open={!!reject && !!r} onClose={() => setReject(null)} title="Reject leave" subtitle="The employee will be notified on ESS and email."
        foot={<><button className="btn secondary" type="button" onClick={() => setReject(null)}>Cancel</button><button className="btn danger" type="button" disabled={busy} onClick={() => r && reject && act(() => rejectLeave(r.id, { ...reject, comment: reject.comment || null }), "Leave rejected")}>Reject</button></>}>
        {reject && <div className="form-grid">
          <Field label="Reason" required full><select value={reject.reason} onChange={(e) => setReject({ ...reject, reason: e.target.value })}>{LEAVE_REJECT_REASONS.map((c) => <option key={c} value={c}>{REJECT_LABEL[c]}</option>)}</select></Field>
          <Field label="Comment" full><textarea rows={3} maxLength={500} value={reject.comment} onChange={(e) => setReject({ ...reject, comment: e.target.value })} /></Field>
          <CheckBox full label="Suggest alternative dates to employee" checked={reject.suggestAlternative} onChange={(e) => setReject({ ...reject, suggestAlternative: e.target.checked })} />
        </div>}
      </Modal>
    </>
  );
}
