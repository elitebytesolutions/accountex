"use client";

import { ClipboardList, Lock, Play, Plus, Trash2, Vote } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PULSE_METRICS, type Poll, type PulseSurvey } from "@/shared/self-service/engagement";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { RecordModal } from "@/features/hr/components/record-modal";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  createPoll, createPulseSurvey, deletePoll, deletePulseSurvey, engagementOptions, listPolls, listPulseSurveys, movePoll, movePulseSurvey, updatePoll, updatePulseSurvey,
} from "../api";
import { dateTime, fromLocalInput, toLocalInput } from "./ess-ui";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Option = { id?: string; label: string };
type Question = { id?: string; questionText: string; lowLabel: string; highLabel: string; metricKey: string };
type PollForm = { question: string; departmentId: string; opensAt: string; closesAt: string; showResultsAfterVote: boolean; options: Option[] };
type SurveyForm = { title: string; periodFrom: string; periodTo: string; departmentId: string; isAnonymous: boolean; questions: Question[] };
const METRIC_LABELS: Record<string, string> = { WORKLOAD: "Workload", MANAGER_SUPPORT: "Manager support", ENPS: "eNPS", OTHER: "Other" };
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Errors for list rows come back as "options.1.label"; show the first one per list. */
const listError = (errs: Record<string, string>, key: string) => errs[key] ?? Object.entries(errs).find(([k]) => k.startsWith(`${key}.`))?.[1];

/**
 * Workforce › Employee engagement › Polls & surveys. No admin template exists, so this is template style (page head,
 * tabbed panel with tables, editor modals with option / question rows and History). Edited while DRAFT, then opened
 * and closed. Votes and responses (and their anonymity) arrive in Phase 34.
 */
export function EngagementScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(["DraftOpenClosedStatus"]);
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [surveys, setSurveys] = useState<PulseSurvey[] | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"polls" | "surveys">("polls");
  const [pollEdit, setPollEdit] = useState<{ row: Poll | null; f: PollForm } | null>(null);
  const [surveyEdit, setSurveyEdit] = useState<{ row: PulseSurvey | null; f: SurveyForm } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPolls(), listPulseSurveys(), engagementOptions()])
      .then(([p, s, o]) => { if (!cancelled) { setPolls(p); setSurveys(s); setDepartments(o.departments); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load polls and surveys" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setPollEdit(null); setSurveyEdit(null); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };

  const openPoll = (row: Poll | null) => {
    setErrs({});
    const now = new Date(), week = new Date(Date.now() + 7 * 864e5);
    setPollEdit({ row, f: row
      ? { question: row.question, departmentId: row.department?.id ?? "", opensAt: toLocalInput(row.opensAt), closesAt: toLocalInput(row.closesAt), showResultsAfterVote: row.showResultsAfterVote, options: row.options.map((o) => ({ id: o.id, label: o.label })) }
      : { question: "", departmentId: "", opensAt: toLocalInput(now.toISOString()), closesAt: toLocalInput(week.toISOString()), showResultsAfterVote: true, options: [{ label: "" }, { label: "" }] } });
  };
  const openSurvey = (row: PulseSurvey | null) => {
    setErrs({});
    const today = new Date();
    setSurveyEdit({ row, f: row
      ? { title: row.title, periodFrom: row.periodFrom, periodTo: row.periodTo, departmentId: row.department?.id ?? "", isAnonymous: row.isAnonymous, questions: row.questions.map((q) => ({ id: q.id, questionText: q.questionText, lowLabel: q.lowLabel, highLabel: q.highLabel, metricKey: q.metricKey ?? "" })) }
      : { title: "Weekly pulse", periodFrom: iso(today), periodTo: iso(new Date(today.getTime() + 6 * 864e5)), departmentId: "", isAnonymous: true, questions: [{ questionText: "", lowLabel: "", highLabel: "", metricKey: "" }] } });
  };
  const setP = (patch: Partial<PollForm>) => setPollEdit((x) => (x ? { ...x, f: { ...x.f, ...patch } } : x));
  const setS = (patch: Partial<SurveyForm>) => setSurveyEdit((x) => (x ? { ...x, f: { ...x.f, ...patch } } : x));

  const savePoll = () => {
    if (!pollEdit) return;
    const { row, f } = pollEdit;
    const body = { ...f, opensAt: fromLocalInput(f.opensAt), closesAt: fromLocalInput(f.closesAt), options: f.options.map((o) => ({ ...(o.id && { id: o.id }), label: o.label })) };
    return run(() => (row ? updatePoll(row.id, { ...body, rowVersion: row.rowVersion }) : createPoll(body)), row ? "Poll saved" : "Poll created as a draft");
  };
  const saveSurvey = () => {
    if (!surveyEdit) return;
    const { row, f } = surveyEdit;
    const body = { ...f, questions: f.questions.map((q) => ({ ...(q.id && { id: q.id }), questionText: q.questionText, lowLabel: q.lowLabel, highLabel: q.highLabel, metricKey: q.metricKey })) };
    return run(() => (row ? updatePulseSurvey(row.id, { ...body, rowVersion: row.rowVersion }) : createPulseSurvey(body)), row ? "Survey saved" : "Survey created as a draft");
  };

  if (error) return <><PageHead eyebrow="Workforce / Employee engagement / Polls & surveys" title="Polls & surveys" /><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></>;
  const badge = (st: string) => <span className={cn("badge dot", toneOf(lookups, "DraftOpenClosedStatus", st))}>{labelOf(lookups, "DraftOpenClosedStatus", st)}</span>;
  const pRow = pollEdit?.row ?? null, pDraft = !pRow || pRow.status === "DRAFT";
  const sRow = surveyEdit?.row ?? null, sDraft = !sRow || sRow.status === "DRAFT";

  return (
    <>
      <PageHead eyebrow="Workforce / Employee engagement / Polls & surveys" title="Polls & surveys"
        description="Company polls and the weekly pulse employees answer on My Profile › Kudos & Pulse. Edit while draft, then open and close."
        actions={can.create && (tab === "polls"
          ? <button className="btn primary" type="button" onClick={() => openPoll(null)}><Plus />New poll</button>
          : <button className="btn primary" type="button" onClick={() => openSurvey(null)}><Plus />New pulse survey</button>)} />

      <div className="panel flush">
        <div className="panel-head" style={{ padding: "14px 16px 0" }}>
          <Tabs items={[{ key: "polls", label: "Polls", count: polls?.length }, { key: "surveys", label: "Pulse surveys", count: surveys?.length }]} active={tab} onChange={(k) => setTab(k)} />
        </div>
        {!polls || !surveys ? <div style={{ padding: 16 }}><Skeleton style={{ height: 220 }} /></div> : tab === "polls" ? (
          polls.length ? (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Question</th><th>Options</th><th>For</th><th>Opens</th><th>Closes</th><th className="num">Votes</th><th>Status</th></tr></thead>
              <tbody>{polls.map((p) => (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => openPoll(p)}>
                  <td><b>{p.question}</b></td>
                  <td className="small">{p.options.map((o) => o.label).join(" · ")}</td>
                  <td className="small">{p.department?.name ?? "Everyone"}</td>
                  <td className="small">{dateTime(p.opensAt)}</td>
                  <td className="small">{dateTime(p.closesAt)}</td>
                  <td className="num">{p.voteCount}</td>
                  <td>{badge(p.status)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <EmptyState icon={<Vote />} title="No polls yet" description={can.create ? "Ask the company a quick question." : "HR's polls appear here."} />
        ) : surveys.length ? (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Survey</th><th className="num">Questions</th><th>For</th><th>Period</th><th>Anonymous</th><th className="num">Responses</th><th>Status</th></tr></thead>
            <tbody>{surveys.map((sv) => (
              <tr key={sv.id} style={{ cursor: "pointer" }} onClick={() => openSurvey(sv)}>
                <td><b>{sv.title}</b><div className="small muted">{sv.questions.map((q) => q.metricKey ? METRIC_LABELS[q.metricKey] : null).filter(Boolean).join(" · ")}</div></td>
                <td className="num">{sv.questions.length}</td>
                <td className="small">{sv.department?.name ?? "Everyone"}</td>
                <td className="small">{sv.periodFrom} → {sv.periodTo}</td>
                <td>{sv.isAnonymous ? <span className="badge info">Anonymous</span> : <span className="badge neutral">Named</span>}</td>
                <td className="num">{sv.responseCount}</td>
                <td>{badge(sv.status)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState icon={<ClipboardList />} title="No pulse surveys yet" description={can.create ? "Set up the weekly pulse." : "HR's pulse surveys appear here."} />}
      </div>

      {pollEdit && (
        <RecordModal open onClose={() => setPollEdit(null)} busy={busy} wide title={pRow ? "Edit poll" : "New poll"}
          subtitle={pDraft ? "Saved as a draft; open it when it is ready." : `${labelOf(lookups, "DraftOpenClosedStatus", pRow!.status)} polls can't be changed.`}
          history={pRow ? { schema: "EmployeeSelfService", table: "Polls", id: pRow.id } : null}
          canSave={pDraft && (pRow ? can.edit : can.create)} canDelete={can.remove && pDraft} saveLabel={pRow ? "Save" : "Create draft"} onSave={savePoll}
          onDelete={async () => { if (pRow) await run(() => deletePoll(pRow.id, pRow.rowVersion), "Poll deleted"); }} deleteNote="Only draft polls nobody has voted in can be deleted.">
          <FormGrid>
            <Field label="Question" required full error={errs.question}><input value={pollEdit.f.question} maxLength={200} disabled={!pDraft} placeholder="Venue for the annual dinner (12 Dec)?" onChange={(e) => setP({ question: e.target.value })} /></Field>
            <Field label="Opens" required error={errs.opensAt}><input type="datetime-local" value={pollEdit.f.opensAt} disabled={!pDraft} onChange={(e) => setP({ opensAt: e.target.value })} /></Field>
            <Field label="Closes" required error={errs.closesAt}><input type="datetime-local" value={pollEdit.f.closesAt} disabled={!pDraft} onChange={(e) => setP({ closesAt: e.target.value })} /></Field>
            <Field label="Department" error={errs.departmentId}><select value={pollEdit.f.departmentId} disabled={!pDraft} onChange={(e) => setP({ departmentId: e.target.value })}><option value="">Everyone</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Created by" hint="Employees become selectable after Phase 11"><select disabled><option>after Phase 11</option></select></Field>
            <Check full label="Show results after voting" checked={pollEdit.f.showResultsAfterVote} disabled={!pDraft} onChange={(e) => setP({ showResultsAfterVote: e.target.checked })} />
            <div className="full">
              <div className="form-section"><h4>Options</h4><p>2 to 8, in this order</p></div>
              {pollEdit.f.options.map((o, i) => (
                <div key={o.id ?? `new-${i}`} className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <span className="badge neutral">{i + 1}</span>
                  <input style={{ flex: 1 }} value={o.label} maxLength={80} disabled={!pDraft} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} onChange={(e) => setP({ options: pollEdit.f.options.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)) })} />
                  {pDraft && pollEdit.f.options.length > 2 && <button type="button" className="icon-btn-sm" aria-label="Remove option" onClick={() => setP({ options: pollEdit.f.options.filter((_, n) => n !== i) })}><Trash2 /></button>}
                </div>
              ))}
              {listError(errs, "options") && <small className="hint text-danger" role="alert">{listError(errs, "options")}</small>}
              {pDraft && pollEdit.f.options.length < 8 && <button type="button" className="btn ghost sm" onClick={() => setP({ options: [...pollEdit.f.options, { label: "" }] })}><Plus />Add option</button>}
            </div>
            {pRow && can.edit && pRow.status !== "CLOSED" && (
              <div className="full row" style={{ gap: 8 }}>
                {pRow.status === "DRAFT" && <button type="button" className="btn primary sm" disabled={busy} onClick={() => run(() => movePoll(pRow.id, "open", pRow.rowVersion), "Poll opened")}><Play />Open poll</button>}
                {pRow.status === "OPEN" && <button type="button" className="btn secondary sm" disabled={busy} onClick={() => run(() => movePoll(pRow.id, "close", pRow.rowVersion), "Poll closed")}><Lock />Close poll</button>}
                {pRow.status === "DRAFT" && <span className="small muted">Open saves nothing: save your edits first.</span>}
              </div>
            )}
          </FormGrid>
        </RecordModal>
      )}

      {surveyEdit && (
        <RecordModal open onClose={() => setSurveyEdit(null)} busy={busy} xl title={sRow ? "Edit pulse survey" : "New pulse survey"}
          subtitle={sDraft ? "Saved as a draft; open it for its period when it is ready." : `${labelOf(lookups, "DraftOpenClosedStatus", sRow!.status)} surveys can't be changed.`}
          history={sRow ? { schema: "EmployeeSelfService", table: "PulseSurveys", id: sRow.id } : null}
          canSave={sDraft && (sRow ? can.edit : can.create)} canDelete={can.remove && sDraft} saveLabel={sRow ? "Save" : "Create draft"} onSave={saveSurvey}
          onDelete={async () => { if (sRow) await run(() => deletePulseSurvey(sRow.id, sRow.rowVersion), "Survey deleted"); }} deleteNote="Only draft surveys nobody has answered can be deleted.">
          <FormGrid cols={3}>
            <Field label="Title" required error={errs.title}><input value={surveyEdit.f.title} maxLength={120} disabled={!sDraft} onChange={(e) => setS({ title: e.target.value })} /></Field>
            <Field label="From" required error={errs.periodFrom}><input type="date" value={surveyEdit.f.periodFrom} disabled={!sDraft} onChange={(e) => setS({ periodFrom: e.target.value })} /></Field>
            <Field label="To" required error={errs.periodTo}><input type="date" value={surveyEdit.f.periodTo} min={surveyEdit.f.periodFrom} disabled={!sDraft} onChange={(e) => setS({ periodTo: e.target.value })} /></Field>
            <Field label="Department" error={errs.departmentId}><select value={surveyEdit.f.departmentId} disabled={!sDraft} onChange={(e) => setS({ departmentId: e.target.value })}><option value="">Everyone</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Check label="Anonymous (results never show who answered)" checked={surveyEdit.f.isAnonymous} disabled={!sDraft} onChange={(e) => setS({ isAnonymous: e.target.checked })} />
          </FormGrid>
          <div className="form-section mt"><h4>Questions</h4><p>Answered on a 1–5 face scale</p></div>
          {surveyEdit.f.questions.map((q, i) => {
            const upd = (patch: Partial<Question>) => setS({ questions: surveyEdit.f.questions.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
            return (
              <div key={q.id ?? `new-${i}`} className="card mb" style={{ padding: 12 }}>
                <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span className="badge neutral">{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <FormGrid cols={3}>
                      <Field label="Question" full><input value={q.questionText} maxLength={200} disabled={!sDraft} placeholder="How manageable was your workload this week?" onChange={(e) => upd({ questionText: e.target.value })} /></Field>
                      <Field label="1 means"><input value={q.lowLabel} maxLength={40} disabled={!sDraft} placeholder="Overwhelming" onChange={(e) => upd({ lowLabel: e.target.value })} /></Field>
                      <Field label="5 means"><input value={q.highLabel} maxLength={40} disabled={!sDraft} placeholder="Very manageable" onChange={(e) => upd({ highLabel: e.target.value })} /></Field>
                      <Field label="Measures"><select value={q.metricKey} disabled={!sDraft} onChange={(e) => upd({ metricKey: e.target.value })}><option value="">—</option>{PULSE_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}</select></Field>
                    </FormGrid>
                  </div>
                  {sDraft && surveyEdit.f.questions.length > 1 && <button type="button" className="icon-btn-sm" aria-label="Remove question" onClick={() => setS({ questions: surveyEdit.f.questions.filter((_, n) => n !== i) })}><Trash2 /></button>}
                </div>
              </div>
            );
          })}
          {listError(errs, "questions") && <small className="hint text-danger" role="alert">{listError(errs, "questions")}</small>}
          {sDraft && surveyEdit.f.questions.length < 10 && <button type="button" className="btn ghost sm" onClick={() => setS({ questions: [...surveyEdit.f.questions, { questionText: "", lowLabel: "", highLabel: "", metricKey: "" }] })}><Plus />Add question</button>}
          {sRow && can.edit && sRow.status !== "CLOSED" && (
            <div className="row mt" style={{ gap: 8 }}>
              {sRow.status === "DRAFT" && <button type="button" className="btn primary sm" disabled={busy} onClick={() => run(() => movePulseSurvey(sRow.id, "open", sRow.rowVersion), "Survey opened")}><Play />Open survey</button>}
              {sRow.status === "OPEN" && <button type="button" className="btn secondary sm" disabled={busy} onClick={() => run(() => movePulseSurvey(sRow.id, "close", sRow.rowVersion), "Survey closed")}><Lock />Close survey</button>}
            </div>
          )}
        </RecordModal>
      )}
    </>
  );
}
