"use client";

import { Briefcase, Clock, FileText, Handshake, Plus, Share2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  RECRUITMENT_CHANNELS, RECRUITMENT_NOTE_KINDS,
  type RecruitmentCandidate, type RecruitmentCandidateDetail, type RecruitmentOpening, type RecruitmentOpeningAction, type RecruitmentOpeningDetail,
  type RecruitmentOptions, type RecruitmentOverview,
} from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  candidateAction, createCandidate, createJobOpening, getCandidate, getJobOpening, getRecruitment, getRecruitmentOptions, hireCandidate, jobOpeningAction,
  listCandidates, updateCandidate, updateJobOpening,
} from "../talent-ops-api";
import { RecordModal } from "./record-modal";
import { Stars, tDm, tDmy, tFromLocal, tHuman, tLocalInput, tRs, tStamp, tToday, tLocalDate } from "./talent-ui";

type Can = { create: boolean; edit: boolean };
type Form = Record<string, string | boolean | string[]>;
const LOOKUPS = ["JobOpeningStatus", "CandidateStage", "CandidateSource", "OfferStatus", "HiringMode", "CandidateActivityType", "EmploymentType", "EmployeeGender"];
const CHIPS = [["OPEN", "Open", ["OPEN", "OFFER_STAGE"]], ["ON_HOLD", "On hold", ["ON_HOLD"]], ["CLOSED", "Closed", ["CLOSED"]], ["DRAFT", "Drafts & approvals", ["DRAFT", "PENDING_APPROVAL"]], ["CANCELLED", "Cancelled", ["CANCELLED"]]] as const;
const COLUMNS = [["APPLIED", "Applied"], ["SCREENING", "Screening"], ["INTERVIEW", "Interview"], ["OFFER", "Offer"], ["HIRED", "Hired"]] as const;
/** Template badge tones (#pay-candidate shows Interview as info; the openings table shows Offer stage as info). */
const CAND_TONE: Record<string, string> = { APPLIED: "neutral", SCREENING: "info", INTERVIEW: "info", OFFER: "warn", HIRED: "good", REJECTED: "danger" };
const OPENING_TONE: Record<string, string> = { OFFER_STAGE: "info", CLOSED: "neutral" };
const NEXT: Record<string, string> = { APPLIED: "SCREENING", SCREENING: "INTERVIEW", INTERVIEW: "OFFER" };
const CHANNEL_LABEL: Record<string, string> = { ROZEE: "Rozee.pk", LINKEDIN: "LinkedIn", CAREERS: "Careers page", REFERRAL: "Referral", WALK_IN: "Walk-in", AGENCY: "Agency" };
const s = (f: Form, k: string) => String(f[k] ?? "");
const blankOpening = (): Form => ({ title: "", designationId: "", departmentId: "", branchId: "", openings: "1", requisitionType: "NEW", replacesEmployeeId: "", hiringMode: "STANDARD", hiringManagerEmployeeId: "", priority: "NORMAL", salaryMin: "", salaryMax: "", jobDescription: "", postedChannels: [], targetHireDate: "" });
const fromOpening = (o: RecruitmentOpening): Form => ({
  title: o.title, designationId: o.designation?.id ?? "", departmentId: o.department.id, branchId: o.branch.id, openings: String(o.openings), requisitionType: o.requisitionType,
  replacesEmployeeId: o.replaces?.id ?? "", hiringMode: o.hiringMode, hiringManagerEmployeeId: o.hiringManager?.id ?? "", priority: o.priority,
  salaryMin: o.salaryMin == null ? "" : String(o.salaryMin), salaryMax: o.salaryMax == null ? "" : String(o.salaryMax), jobDescription: o.jobDescription ?? "",
  postedChannels: o.postedChannels, targetHireDate: o.targetHireDate ?? "",
});
const CAND_TEXT = ["fullName", "email", "phone", "cnic", "headline", "currentEmployer", "currentTitle", "experienceYears", "education", "source", "referredByEmployeeId", "appliedOn", "currentSalary", "expectedSalary", "noticeDays", "rating"] as const;
const blankCandidate = (): Form => ({ ...Object.fromEntries(CAND_TEXT.map((k) => [k, ""])), source: "CAREERS", nextInterviewAt: "" });
const fromCandidate = (c: RecruitmentCandidate): Form => ({ ...Object.fromEntries(CAND_TEXT.map((k) => [k, k === "referredByEmployeeId" ? c.referredBy?.id ?? "" : String((c as Record<string, unknown>)[k] ?? "")])), nextInterviewAt: tLocalInput(c.nextInterviewAt) });

/**
 * Template app/hr/recruitment (51-hr-pay-talent.html): KPIs, the openings table with status chips, the candidate kanban
 * (drag between stages) and the #pay-candidate drawer. Added in template style: the requisition form with its approval
 * actions, the candidate form, the offer salary prompt and the Hire dialog (employee + onboarding).
 */
export function RecruitmentScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [data, setData] = useState<RecruitmentOverview | null>(null);
  const [opts, setOpts] = useState<RecruitmentOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chip, setChip] = useState<(typeof CHIPS)[number][0]>("OPEN");
  const [pipeline, setPipeline] = useState<string>("");
  const [cands, setCands] = useState<RecruitmentCandidate[] | null>(null);
  const [opening, setOpening] = useState<RecruitmentOpeningDetail | "new" | null>(null);
  const [openingTab, setOpeningTab] = useState<"form" | "history">("form");
  const [of, setOf] = useState<Form>(blankOpening());
  const [cand, setCand] = useState<RecruitmentCandidateDetail | null>(null);
  const [candTab, setCandTab] = useState<"detail" | "history">("detail");
  const [candForm, setCandForm] = useState<{ row: RecruitmentCandidate | null; f: Form } | null>(null);
  const [note, setNote] = useState<Form>({ activityType: "NOTE", summary: "", notes: "", rating: "", scorePct: "", scheduledAt: "" });
  const [offer, setOffer] = useState<{ c: RecruitmentCandidate; salary: string } | null>(null);
  const [reject, setReject] = useState<{ reason: string; declined: boolean } | null>(null);
  const [hire, setHire] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRecruitment().then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load recruitment" }));
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => { getRecruitmentOptions().then(setOpts).catch(() => undefined); }, []);
  const live = useMemo(() => data?.openings.filter((o) => ["OPEN", "OFFER_STAGE", "ON_HOLD"].includes(o.status)) ?? [], [data]);
  const pipelineId = pipeline || live[0]?.id || "";
  useEffect(() => {
    if (!pipelineId) return;
    let cancelled = false;
    listCandidates({ openingId: pipelineId }).then((r) => !cancelled && setCands(r)).catch(() => !cancelled && setCands([]));
    return () => { cancelled = true; };
  }, [pipelineId, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const chipDef = CHIPS.find((c) => c[0] === chip)!;
  const rows = data?.openings.filter((o) => (chipDef[2] as readonly string[]).includes(o.status)) ?? [];
  const count = (c: (typeof CHIPS)[number]) => (c[2] as readonly string[]).reduce((t, st) => t + (data?.counts[st] ?? 0), 0);
  const current = live.find((o) => o.id === pipelineId) ?? null;
  const emps = opts?.employees ?? [];
  const work = async <T,>(fn: () => Promise<T>, done: string, after?: (r: T) => void) => {
    setBusy(true); setErrs({});
    try { const r = await fn(); toast(done, { tone: "good" }); after?.(r); reload(); return r; }
    catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); return null; }
    finally { setBusy(false); }
  };

  // ---------------------------------------------------------------- requisitions
  const showOpening = async (id: string) => { try { setErrs({}); setOpeningTab("form"); const o = await getJobOpening(id); setOf(fromOpening(o)); setOpening(o); } catch (e) { toast(apiMessage(e, "Could not open the requisition"), { tone: "danger" }); } };
  const newOpening = () => { setErrs({}); setOpeningTab("form"); setOf(blankOpening()); setOpening("new"); };
  const openingRow = opening && opening !== "new" ? opening : null;
  const openingEditable = openingRow ? openingRow.status === "DRAFT" && can.edit : can.create;
  const setO = (k: string, v: string | string[]) => { setOf((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const saveOpening = () => {
    const body = { ...of };
    return work(() => (openingRow ? updateJobOpening(openingRow.id, { ...body, rowVersion: openingRow.rowVersion }) : createJobOpening(body)),
      openingRow ? `${s(of, "title")} saved` : "Job requisition draft created", (o) => { setOpening(o); setOf(fromOpening(o)); });
  };
  const act = (a: RecruitmentOpeningAction, done: string, extra: Record<string, unknown> = {}) => openingRow && work(() => jobOpeningAction(openingRow.id, a, { rowVersion: openingRow.rowVersion, ...extra }), done, (o) => { setOpening(o); setOf(fromOpening(o)); });

  // ---------------------------------------------------------------- candidates
  const showCandidate = async (id: string) => { try { setCandTab("detail"); setCand(await getCandidate(id)); } catch (e) { toast(apiMessage(e, "Could not open the candidate"), { tone: "danger" }); } };
  const move = (c: RecruitmentCandidate, toStage: string, offeredSalary?: string) => {
    if (toStage === "OFFER" && !offeredSalary && c.offeredSalary == null) { setOffer({ c, salary: c.expectedSalary ? String(c.expectedSalary) : "" }); return; }
    if (toStage === "HIRED") { openHire(c); return; }
    return work(() => candidateAction(c.id, "move", { toStage, rowVersion: c.rowVersion, ...(offeredSalary && { offeredSalary }) }), `${c.fullName} moved to ${tHuman(toStage)}`, (r) => { if (cand?.id === c.id) setCand(r); setOffer(null); });
  };
  const onDrop = (e: DragEvent, stage: string) => {
    e.preventDefault();
    const c = cands?.find((x) => x.id === e.dataTransfer.getData("text/plain"));
    if (!c || c.stage === stage || !can.edit) return;
    if (c.stage === "HIRED" || c.stage === "REJECTED") { toast(`${c.fullName} is already ${c.stage.toLowerCase()}`, { tone: "warn" }); return; }
    if (stage === "HIRED" && c.stage !== "OFFER") { toast("Move the candidate to Offer before hiring", { tone: "warn" }); return; }
    void move(c, stage);
  };
  const saveCandidate = () => {
    if (!candForm) return;
    const body: Record<string, unknown> = { ...candForm.f, nextInterviewAt: tFromLocal(s(candForm.f, "nextInterviewAt")) };
    if (candForm.row) return work(() => updateCandidate(candForm.row!.id, { ...body, rowVersion: candForm.row!.rowVersion }), `${s(candForm.f, "fullName")} saved`, (r) => { setCandForm(null); if (cand) setCand(r); });
    return work(() => createCandidate({ ...body, jobRequisitionId: pipelineId }), `${s(candForm.f, "fullName")} added to the pipeline`, () => setCandForm(null));
  };
  const addNote = () => cand && work(() => candidateAction(cand.id, "activities", { ...note, scheduledAt: tFromLocal(s(note, "scheduledAt")) }), "Activity added", (r) => { setCand(r); setNote({ activityType: "NOTE", summary: "", notes: "", rating: "", scorePct: "", scheduledAt: "" }); });
  const openHire = async (c: RecruitmentCandidate) => {
    const full = cand?.id === c.id ? cand : await getCandidate(c.id);
    const [first, ...rest] = full.fullName.split(/\s+/);
    const o = data?.openings.find((x) => x.id === full.opening.id);
    setErrs({});
    setCand(full);
    setHire({
      firstName: first ?? "", lastName: rest.join(" "), guardianName: "", cnic: full.cnic ?? "", dateOfBirth: "", gender: "", mobile: full.phone ?? "", personalEmail: full.email ?? "",
      joiningDate: tToday(), designationId: o?.designation?.id ?? "", gradeId: "", reportingManagerId: o?.hiringManager?.id ?? "", employmentType: "PERMANENT", probationMonths: "3",
      offeredSalary: full.offeredSalary == null ? "" : String(full.offeredSalary), templateId: opts?.templates.find((t) => t.isDefault)?.id ?? "", buddyEmployeeId: "",
    });
  };
  const doHire = () => cand && hire && work(() => hireCandidate(cand.id, { ...hire, rowVersion: cand.rowVersion }), `${cand.fullName} hired`, (r) => {
    setHire(null); setCand(r.candidate);
    toast(`Employee ${r.employee.code} created · onboarding ${r.onboarding.docNo} started`, { tone: "good" });
  });

  const k = data?.kpis;
  const desigs = opts?.designations.filter((d) => !s(of, "departmentId") || d.departmentId === s(of, "departmentId")) ?? [];
  const nextStage = cand ? NEXT[cand.stage] : undefined;

  return (
    <>
      <PageHead eyebrow="Workforce / Talent / Recruitment" title="Recruitment"
        description="Open positions, applicant pipeline and offers — posted on Rozee.pk, LinkedIn and the careers page."
        actions={<>
          <button className="btn secondary" type="button" disabled title="A public careers page is not part of this release"><Share2 />Careers page</button>
          {can.create && <button className="btn primary" type="button" onClick={newOpening}><Plus />New Job Opening</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Open Positions</span><span className="icon-well"><Briefcase /></span></div><strong>{k ? k.openPositions : "—"}</strong><small>{k ? `${k.vacancies} vacanc${k.vacancies === 1 ? "y" : "ies"} · ${k.branches} branch${k.branches === 1 ? "" : "es"}` : "Loading…"}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Active Applicants</span><span className="icon-well"><Users /></span></div><strong>{k ? k.activeApplicants : "—"}</strong><small className={cn(k && k.appliedThisWeek > 0 && "up")}>{k ? `▲ ${k.appliedThisWeek} this week` : ""}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Avg Time to Hire</span><span className="icon-well"><Clock /></span></div><strong>{k?.avgTimeToHire != null ? `${k.avgTimeToHire} days` : "—"}</strong><small>{k?.avgTimeToHire != null ? "Posting to hire, this FY" : "No hires this FY yet"}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Offer Acceptance</span><span className="icon-well"><Handshake /></span></div><strong>{k?.offersMade ? `${Math.round((k.offersAccepted / k.offersMade) * 100)}%` : "—"}</strong><small>{k ? `${k.offersAccepted} of ${k.offersMade} offers this FY` : ""}</small></div>
      </div>

      <div className="panel flush mb">
        <div className="panel-head"><div><h3>Job Openings</h3><p>Stage counts across the hiring funnel</p></div>
          <div className="panel-actions"><div className="chips">{CHIPS.map((c) => <button key={c[0]} type="button" className={cn(chip === c[0] && "active")} onClick={() => setChip(c[0])}>{c[1]} <i>{count(c)}</i></button>)}</div></div></div>
        {!data ? <Skeleton style={{ height: 200 }} /> : !rows.length ? (
          <EmptyState icon={<Briefcase />} title={data.openings.length ? "No openings here" : "No job openings yet"}
            description={data.openings.length ? "Try another status." : can.create ? "Raise a requisition; once approved it opens for candidates." : "Requisitions HR raises appear here."}
            action={!data.openings.length && can.create ? <button className="btn primary sm" type="button" onClick={newOpening}><Plus />New Job Opening</button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Position</th><th>Department</th><th>Location</th><th className="num">Openings</th><th className="num">Applicants</th><th className="num">Screening</th><th className="num">Interview</th><th className="num">Offer</th><th>Hiring manager</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((o) => {
                const sub = o.requisitionType === "REPLACEMENT" ? `Replacement · ${o.replaces?.name ?? "?"}` : o.hiringMode !== "STANDARD" ? labelOf(lookups, "HiringMode", o.hiringMode) : o.postedOn ? `Posted ${tDm(o.postedOn)}` : "Not posted yet";
                const z = (v: number) => <td className={cn("num", !v && "zero")}>{v || "—"}</td>;
                return (
                  <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => void showOpening(o.id)}>
                    <td><b>{o.title}</b><small>{o.docNo} · {sub}</small></td><td>{o.department.name}</td><td>{o.branch.name}</td><td className="num">{o.openings}</td>
                    {z(o.counts.total)}{z(o.counts.screening)}{z(o.counts.interview)}{z(o.counts.offer)}
                    <td>{o.hiringManager?.name ?? "—"}</td>
                    <td>{o.priority === "URGENT" && ["OPEN", "OFFER_STAGE"].includes(o.status) ? <span className="badge warn dot">Urgent</span> : <span className={cn("badge dot", OPENING_TONE[o.status] ?? toneOf(lookups, "JobOpeningStatus", o.status))}>{labelOf(lookups, "JobOpeningStatus", o.status)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Candidate Pipeline{current ? ` · ${current.title} (${current.branch.name})` : ""}</h3><p>{can.edit ? "Drag candidates between stages" : "Candidates by stage"}</p></div>
          <div className="panel-actions">
            {live.length > 0 && <select aria-label="Opening" value={pipelineId} onChange={(e) => setPipeline(e.target.value)}>{live.map((o) => <option key={o.id} value={o.id}>{o.title} — {o.branch.name}</option>)}</select>}
            {can.create && current && current.status !== "ON_HOLD" && <button className="btn secondary sm" type="button" onClick={() => { setErrs({}); setCandForm({ row: null, f: blankCandidate() }); }}><UserPlus />Add candidate</button>}
          </div></div>
        {!current ? <EmptyState icon={<Users />} title="No open requisition" description="Candidates are tracked against an open job requisition." /> : !cands ? <Skeleton style={{ height: 220 }} /> : (
          <div className="kanban">
            {COLUMNS.map(([stage, label]) => {
              const list = cands.filter((c) => c.stage === stage);
              return (
                <div key={stage} className="kb-col" onDragOver={(e) => can.edit && e.preventDefault()} onDrop={(e) => onDrop(e, stage)}>
                  <div className="kb-col-head"><h4>{label}</h4><span className="badge neutral">{list.length}</span></div>
                  {list.map((c) => (
                    <div key={c.id} className="kb-card" draggable={can.edit && stage !== "HIRED"} onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)} onClick={() => void showCandidate(c.id)} style={{ cursor: "pointer" }}>
                      <b>{c.fullName}</b>
                      <small>{stage === "OFFER" ? `Offered ${tRs(c.offeredSalary)} gross` : stage === "HIRED" ? `Joined · ${c.hiredEmployee?.code ?? ""}` : c.headline ?? ([c.experienceYears != null ? `${c.experienceYears} yrs` : null, c.currentEmployer].filter(Boolean).join(" · ") || "—")}</small>
                      <div className="row small"><Stars value={c.rating} /><span className="spacer" />
                        {stage === "OFFER" ? <span className={cn("badge", toneOf(lookups, "OfferStatus", c.offerStatus))}>{c.offerStatus === "AWAITING" ? "Awaiting reply" : labelOf(lookups, "OfferStatus", c.offerStatus)}</span>
                          : stage === "HIRED" ? (c.onboarding ? <a className="badge good" href={`/hr/onboarding?onboarding=${c.onboarding.id}`} onClick={(e) => e.stopPropagation()}>Onboarding</a> : <span className="badge good">Hired</span>)
                          : <span className="badge neutral">{CHANNEL_LABEL[c.source] ?? c.source}</span>}</div>
                      {c.nextInterviewAt && stage === "INTERVIEW" && <small className="muted">Panel: {tStamp(c.nextInterviewAt)}</small>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- requisition */}
      {opening && (
        <Modal open wide onClose={() => setOpening(null)} title={openingRow ? `${openingRow.title}` : "New job requisition"}
          subtitle={openingRow ? `${openingRow.docNo} · ${labelOf(lookups, "JobOpeningStatus", openingRow.status)}${openingRow.waitingOn ? ` · waiting on ${openingRow.waitingOn}` : ""}` : "Saved as a draft; submit it for approval to open the position."}
          foot={<>
            {openingRow && openingRow.status === "DRAFT" && can.create && <button className="btn secondary" type="button" disabled={busy} onClick={() => act("submit", "Submitted for approval")}>Submit for approval</button>}
            {openingRow?.canApprove && <><button className="btn secondary" type="button" disabled={busy} onClick={() => act("return", "Returned to draft")}>Return</button><button className="btn primary" type="button" disabled={busy} onClick={() => act("approve", "Approved · open for candidates")}>Approve</button></>}
            {openingRow && can.edit && ["OPEN", "OFFER_STAGE"].includes(openingRow.status) && <><button className="btn secondary" type="button" disabled={busy} onClick={() => act("open", "Posting updated", { channels: of.postedChannels })}>Update posting</button><button className="btn secondary" type="button" disabled={busy} onClick={() => act("hold", "Put on hold")}>Hold</button><button className="btn secondary" type="button" disabled={busy} onClick={() => act("close", "Requisition closed")}>Close</button></>}
            {openingRow && can.edit && openingRow.status === "ON_HOLD" && <><button className="btn primary" type="button" disabled={busy} onClick={() => act("open", "Re-opened")}>Re-open</button><button className="btn secondary" type="button" disabled={busy} onClick={() => act("close", "Requisition closed")}>Close</button></>}
            {openingRow && can.edit && !["CLOSED", "CANCELLED"].includes(openingRow.status) && <button className="btn ghost" type="button" disabled={busy} onClick={() => act("cancel", "Requisition cancelled")}>Cancel requisition</button>}
            <span className="spacer" />
            <button className="btn secondary" type="button" onClick={() => setOpening(null)}>Close</button>
            {openingEditable && openingTab === "form" && <button className="btn primary" type="button" disabled={busy} onClick={() => void saveOpening()}>{openingRow ? "Save draft" : "Create draft"}</button>}
          </>}>
          {openingRow && <div className="tabs mb"><button type="button" className={cn(openingTab === "form" && "active")} onClick={() => setOpeningTab("form")}>Requisition</button><button type="button" className={cn(openingTab === "history" && "active")} onClick={() => setOpeningTab("history")}>History</button></div>}
          {openingTab === "history" && openingRow ? <HistoryTab schema="HumanResources" table="JobOpenings" id={openingRow.id} /> : <>
            <FormGrid>
              <Field label="Position title" required full error={errs.title}><input value={s(of, "title")} maxLength={120} disabled={!openingEditable} placeholder="e.g. Sales Executive" onChange={(e) => setO("title", e.target.value)} /></Field>
              <Field label="Department" required error={errs.departmentId}><select value={s(of, "departmentId")} disabled={!openingEditable} onChange={(e) => setO("departmentId", e.target.value)}><option value="">Choose…</option>{opts?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Designation" error={errs.designationId}><select value={s(of, "designationId")} disabled={!openingEditable} onChange={(e) => setO("designationId", e.target.value)}><option value="">—</option>{desigs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
              <Field label="Location" required error={errs.branchId}><select value={s(of, "branchId")} disabled={!openingEditable} onChange={(e) => setO("branchId", e.target.value)}><option value="">Choose…</option>{opts?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Openings" error={errs.openings}><input type="number" min={1} value={s(of, "openings")} disabled={!openingEditable} onChange={(e) => setO("openings", e.target.value)} /></Field>
              <Field label="Requisition type" error={errs.requisitionType}><select value={s(of, "requisitionType")} disabled={!openingEditable} onChange={(e) => setO("requisitionType", e.target.value)}><option value="NEW">New position</option><option value="REPLACEMENT">Replacement</option></select></Field>
              {s(of, "requisitionType") === "REPLACEMENT" && <Field label="Replaces" required error={errs.replacesEmployeeId}><select value={s(of, "replacesEmployeeId")} disabled={!openingEditable} onChange={(e) => setO("replacesEmployeeId", e.target.value)}><option value="">Choose…</option>{emps.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.code}</option>)}</select></Field>}
              <Field label="Hiring mode" error={errs.hiringMode}><select value={s(of, "hiringMode")} disabled={!openingEditable} onChange={(e) => setO("hiringMode", e.target.value)}>{(lookups.HiringMode ?? [{ code: "STANDARD", label: "Standard" }]).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
              <Field label="Hiring manager" error={errs.hiringManagerEmployeeId}><select value={s(of, "hiringManagerEmployeeId")} disabled={!openingEditable} onChange={(e) => setO("hiringManagerEmployeeId", e.target.value)}><option value="">—</option>{emps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="Priority" error={errs.priority}><select value={s(of, "priority")} disabled={!openingEditable} onChange={(e) => setO("priority", e.target.value)}><option value="NORMAL">Normal</option><option value="URGENT">Urgent</option></select></Field>
              <Field label="Salary from (Rs)" error={errs.salaryMin}><input type="number" min={0} value={s(of, "salaryMin")} disabled={!openingEditable} onChange={(e) => setO("salaryMin", e.target.value)} /></Field>
              <Field label="Salary to (Rs)" error={errs.salaryMax}><input type="number" min={0} value={s(of, "salaryMax")} disabled={!openingEditable} onChange={(e) => setO("salaryMax", e.target.value)} /></Field>
              <Field label="Target hire date" error={errs.targetHireDate}><input type="date" value={s(of, "targetHireDate")} disabled={!openingEditable} onChange={(e) => setO("targetHireDate", e.target.value)} /></Field>
              <Field label="Job description" full error={errs.jobDescription}><textarea rows={3} maxLength={4000} value={s(of, "jobDescription")} disabled={!openingEditable} onChange={(e) => setO("jobDescription", e.target.value)} /></Field>
            </FormGrid>
            <div className="form-section"><h4>Posted on</h4></div>
            <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
              {RECRUITMENT_CHANNELS.map((ch) => {
                const on = (of.postedChannels as string[]).includes(ch);
                const editable = openingEditable || (!!openingRow && can.edit && ["OPEN", "OFFER_STAGE"].includes(openingRow.status));
                return <Check key={ch} label={CHANNEL_LABEL[ch]} checked={on} disabled={!editable} onChange={() => setO("postedChannels", on ? (of.postedChannels as string[]).filter((x) => x !== ch) : [...(of.postedChannels as string[]), ch])} />;
              })}
            </div>
            {openingRow?.approval && <p className="small muted mt">Approval: {tHuman(openingRow.approval.status)}{openingRow.waitingOn ? ` · ${openingRow.waitingOn}` : ""}</p>}
          </>}
        </Modal>
      )}

      {/* ---------------------------------------------------------------- candidate drawer (#pay-candidate) */}
      {cand && !hire && (
        <Drawer open onClose={() => setCand(null)} title={cand.fullName}
          subtitle={`${cand.opening.title} · Applied ${tDm(cand.appliedOn)} via ${CHANNEL_LABEL[cand.source] ?? cand.source}`}
          foot={<>
            {can.edit && !["HIRED", "REJECTED"].includes(cand.stage) && <button className="btn danger" type="button" disabled={busy} onClick={() => setReject({ reason: "", declined: false })}>Reject</button>}
            <button className="btn secondary" type="button" disabled title="CV upload arrives with file storage"><FileText />CV</button>
            {can.edit && !["HIRED", "REJECTED"].includes(cand.stage) && <button className="btn secondary" type="button" onClick={() => { setErrs({}); setCandForm({ row: cand, f: fromCandidate(cand) }); }}>Edit</button>}
            {can.edit && nextStage && <button className="btn primary" type="button" disabled={busy} onClick={() => void move(cand, nextStage)}>Move to {tHuman(nextStage)}</button>}
            {can.create && cand.stage === "OFFER" && <button className="btn primary" type="button" disabled={busy} onClick={() => void openHire(cand)}>Hire</button>}
          </>}>
          <div className="tabs mb"><button type="button" className={cn(candTab === "detail" && "active")} onClick={() => setCandTab("detail")}>Candidate</button><button type="button" className={cn(candTab === "history" && "active")} onClick={() => setCandTab("history")}>History</button></div>
          {candTab === "history" ? <HistoryTab schema="HumanResources" table="Candidates" id={cand.id} /> : <>
            <div className="row mb"><span className={cn("badge", CAND_TONE[cand.stage] ?? toneOf(lookups, "CandidateStage", cand.stage))}>{labelOf(lookups, "CandidateStage", cand.stage)}</span><Stars value={cand.rating} />{cand.avgScore != null && <span className="muted small">{cand.avgScore} / 5 from {cand.reviewers} reviewer{cand.reviewers === 1 ? "" : "s"}</span>}</div>
            <div className="dl mb">
              <div><span>Email</span><b>{cand.email ?? "—"}</b></div>
              <div><span>Phone</span><b>{cand.phone ?? "—"}</b></div>
              <div><span>Current employer</span><b>{[cand.currentEmployer, cand.currentTitle].filter(Boolean).join(" — ") || "—"}</b></div>
              <div><span>Experience</span><b>{cand.experienceYears != null ? `${cand.experienceYears} years` : "—"}</b></div>
              <div><span>Current / expected salary</span><b>{tRs(cand.currentSalary)} / {tRs(cand.expectedSalary)}</b></div>
              <div><span>Notice period</span><b>{cand.noticeDays != null ? `${cand.noticeDays} days` : "—"}</b></div>
              <div><span>Education</span><b>{cand.education ?? "—"}</b></div>
              {cand.offeredSalary != null && <div><span>Offer</span><b>{tRs(cand.offeredSalary)} · {labelOf(lookups, "OfferStatus", cand.offerStatus)}{cand.offerSentOn ? ` · sent ${tDm(cand.offerSentOn)}` : ""}</b></div>}
              {cand.hiredEmployee && <div><span>Employee</span><b><a href={`/hr/employees/${cand.hiredEmployee.id}`}>{cand.hiredEmployee.code} · {cand.hiredEmployee.name}</a>{cand.onboarding ? ` · onboarding ${cand.onboarding.docNo}` : ""}</b></div>}
              {cand.rejectionReason && <div><span>Rejection reason</span><b>{cand.rejectionReason}</b></div>}
            </div>
            <h4>Activity</h4>
            {!cand.activities.length ? <p className="small muted mb">No activity yet.</p> : (
              <div className="timeline mb">
                {cand.activities.map((a) => (
                  <div key={a.id} className="tl-item"><span className={cn("tl-dot", a.scheduledAt && new Date(a.scheduledAt) > new Date() ? "warn" : a.activityType === "REJECTION" ? "danger" : "good")} />
                    <div><b>{a.summary ?? labelOf(lookups, "CandidateActivityType", a.activityType)}{a.scorePct != null ? ` — ${a.scorePct}%` : ""}{a.by ? ` — ${a.by.name}` : ""}</b>
                      <small>{a.scheduledAt ? tStamp(a.scheduledAt) : tDm(tLocalDate(a.occurredAt))}{a.panelNote ? ` · ${a.panelNote}` : ""}{a.notes ? ` · “${a.notes}”` : ""}{a.createdBy && !a.by ? ` · ${a.createdBy.name}` : ""}</small></div></div>
                ))}
              </div>
            )}
            {can.edit && !["HIRED", "REJECTED"].includes(cand.stage) && (
              <FormGrid>
                <Field label="Activity" error={errs.activityType}><select value={s(note, "activityType")} onChange={(e) => setNote({ ...note, activityType: e.target.value })}>{RECRUITMENT_NOTE_KINDS.map((t) => <option key={t} value={t}>{labelOf(lookups, "CandidateActivityType", t)}</option>)}</select></Field>
                <Field label="Rating (1–5)" error={errs.rating}><input type="number" min={1} max={5} value={s(note, "rating")} onChange={(e) => setNote({ ...note, rating: e.target.value })} /></Field>
                <Field label="Summary" required error={errs.summary}><input value={s(note, "summary")} maxLength={200} placeholder="e.g. Phone screen — strong FMCG network" onChange={(e) => setNote({ ...note, summary: e.target.value })} /></Field>
                <Field label="Scheduled for" error={errs.scheduledAt}><input type="datetime-local" value={s(note, "scheduledAt")} onChange={(e) => setNote({ ...note, scheduledAt: e.target.value })} /></Field>
                <Field label="Add note" full error={errs.notes}><textarea rows={2} placeholder="Interview feedback…" value={s(note, "notes")} onChange={(e) => setNote({ ...note, notes: e.target.value })} /></Field>
                <div className="full"><button className="btn secondary sm" type="button" disabled={busy || !s(note, "summary")} onClick={() => void addNote()}><Plus />Add activity</button></div>
              </FormGrid>
            )}
          </>}
        </Drawer>
      )}

      {/* ---------------------------------------------------------------- candidate form */}
      {candForm && (
        <RecordModal open wide onClose={() => setCandForm(null)} busy={busy} title={candForm.row ? candForm.row.fullName : "Add candidate"}
          subtitle={candForm.row ? "Contact and profile details" : `${current?.title ?? ""} · ${current?.branch.name ?? ""}`}
          canSave saveLabel={candForm.row ? "Save candidate" : "Add candidate"} onSave={() => void saveCandidate()}>
          <FormGrid>
            {([["fullName", "Full name", "text", true], ["email", "Email", "email", false], ["phone", "Phone", "tel", false], ["cnic", "CNIC", "text", false], ["headline", "Headline", "text", false], ["currentEmployer", "Current employer", "text", false], ["currentTitle", "Current title", "text", false], ["experienceYears", "Experience (years)", "number", false], ["education", "Education", "text", false], ["currentSalary", "Current salary (Rs)", "number", false], ["expectedSalary", "Expected salary (Rs)", "number", false], ["noticeDays", "Notice period (days)", "number", false], ["rating", "Rating (1–5)", "number", false], ["appliedOn", "Applied on", "date", false]] as const).map(([key, label, type, req]) => (
              <Field key={key} label={label} required={req} error={errs[key]}><input type={type} value={s(candForm.f, key)} placeholder={key === "cnic" ? "35202-1234567-1" : undefined} onChange={(e) => setCandForm({ ...candForm, f: { ...candForm.f, [key]: e.target.value } })} /></Field>
            ))}
            <Field label="Source" error={errs.source}><select value={s(candForm.f, "source")} onChange={(e) => setCandForm({ ...candForm, f: { ...candForm.f, source: e.target.value } })}>{RECRUITMENT_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select></Field>
            {s(candForm.f, "source") === "REFERRAL" && <Field label="Referred by" required error={errs.referredByEmployeeId}><select value={s(candForm.f, "referredByEmployeeId")} onChange={(e) => setCandForm({ ...candForm, f: { ...candForm.f, referredByEmployeeId: e.target.value } })}><option value="">Choose…</option>{emps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
            <Field label="Next interview" error={errs.nextInterviewAt}><input type="datetime-local" value={s(candForm.f, "nextInterviewAt")} onChange={(e) => setCandForm({ ...candForm, f: { ...candForm.f, nextInterviewAt: e.target.value } })} /></Field>
          </FormGrid>
        </RecordModal>
      )}

      {/* ---------------------------------------------------------------- offer salary / reject */}
      {offer && (
        <Modal open onClose={() => setOffer(null)} title={`Offer to ${offer.c.fullName}`} subtitle="The offered gross monthly salary goes on the offer."
          foot={<><button className="btn secondary" type="button" onClick={() => setOffer(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy || !offer.salary} onClick={() => void move(offer.c, "OFFER", offer.salary)}>Move to Offer</button></>}>
          <FormGrid><Field label="Offered salary (Rs / month)" required full error={errs.offeredSalary}><input type="number" min={1} value={offer.salary} onChange={(e) => setOffer({ ...offer, salary: e.target.value })} /></Field></FormGrid>
        </Modal>
      )}
      {cand && reject && (
        <Modal open onClose={() => setReject(null)} title={`Reject ${cand.fullName}?`} subtitle="The candidate leaves the pipeline. This can't be undone."
          foot={<><button className="btn secondary" type="button" onClick={() => setReject(null)}>Cancel</button><button className="btn danger solid" type="button" disabled={busy} onClick={() => void work(() => candidateAction(cand.id, "reject", { ...reject, rowVersion: cand.rowVersion }), "Candidate rejected", (r) => { setCand(r); setReject(null); })}>Reject</button></>}>
          <FormGrid>
            <Field label="Reason" full error={errs.reason}><textarea rows={2} maxLength={500} value={reject.reason} onChange={(e) => setReject({ ...reject, reason: e.target.value })} /></Field>
            {cand.stage === "OFFER" && <Check full label="The candidate declined the offer" checked={reject.declined} onChange={(e) => setReject({ ...reject, declined: e.target.checked })} />}
          </FormGrid>
        </Modal>
      )}

      {/* ---------------------------------------------------------------- hire */}
      {cand && hire && (
        <Modal open wide onClose={() => setHire(null)} title={`Hire ${cand.fullName}`} subtitle={`${cand.opening.title} · creates the employee and starts their onboarding in one step`}
          foot={<><button className="btn secondary" type="button" onClick={() => setHire(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={() => void doHire()}><UserPlus />Hire &amp; start onboarding</button></>}>
          <FormGrid>
            {([["firstName", "First name", "text"], ["lastName", "Last name", "text"], ["guardianName", "Father / husband name", "text"], ["cnic", "CNIC", "text"], ["dateOfBirth", "Date of birth", "date"], ["mobile", "Mobile", "tel"], ["personalEmail", "Personal email", "email"], ["joiningDate", "Joining date", "date"]] as const).map(([key, label, type]) => (
              <Field key={key} label={label} required={key !== "personalEmail"} error={errs[key]}><input type={type} value={s(hire, key)} onChange={(e) => setHire({ ...hire, [key]: e.target.value })} /></Field>
            ))}
            <Field label="Gender" required error={errs.gender}><select value={s(hire, "gender")} onChange={(e) => setHire({ ...hire, gender: e.target.value })}><option value="">Choose…</option>{(lookups.EmployeeGender ?? [{ code: "MALE", label: "Male" }, { code: "FEMALE", label: "Female" }]).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Designation" required error={errs.designationId}><select value={s(hire, "designationId")} onChange={(e) => setHire({ ...hire, designationId: e.target.value })}><option value="">Choose…</option>{opts?.designations.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
            <Field label="Grade" error={errs.gradeId}><select value={s(hire, "gradeId")} onChange={(e) => setHire({ ...hire, gradeId: e.target.value })}><option value="">—</option>{opts?.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
            <Field label="Reports to" error={errs.reportingManagerId}><select value={s(hire, "reportingManagerId")} onChange={(e) => setHire({ ...hire, reportingManagerId: e.target.value })}><option value="">—</option>{emps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="Employment type" required error={errs.employmentType}><select value={s(hire, "employmentType")} onChange={(e) => setHire({ ...hire, employmentType: e.target.value })}>{(lookups.EmploymentType ?? [{ code: "PERMANENT", label: "Permanent" }]).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Probation (months)" error={errs.probationMonths}><input type="number" min={0} max={24} value={s(hire, "probationMonths")} onChange={(e) => setHire({ ...hire, probationMonths: e.target.value })} /></Field>
            <Field label="Salary (Rs / month)" required error={errs.offeredSalary} hint="The accepted offer; set up the salary structure in Payroll"><input type="number" min={1} value={s(hire, "offeredSalary")} onChange={(e) => setHire({ ...hire, offeredSalary: e.target.value })} /></Field>
            <Field label="Onboarding template" error={errs.templateId}><select value={s(hire, "templateId")} onChange={(e) => setHire({ ...hire, templateId: e.target.value })}><option value="">Default new-joiner template</option>{opts?.templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}</select></Field>
            <Field label="Buddy" error={errs.buddyEmployeeId}><select value={s(hire, "buddyEmployeeId")} onChange={(e) => setHire({ ...hire, buddyEmployeeId: e.target.value })}><option value="">—</option>{emps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          </FormGrid>
          <p className="small muted mt">Department and location come from the requisition {cand.opening.docNo} ({data?.openings.find((o) => o.id === cand.opening.id)?.department.name ?? "—"}, {data?.openings.find((o) => o.id === cand.opening.id)?.branch.name ?? "—"}). {tDmy(s(hire, "joiningDate"))} is the joining date.</p>
        </Modal>
      )}
    </>
  );
}
