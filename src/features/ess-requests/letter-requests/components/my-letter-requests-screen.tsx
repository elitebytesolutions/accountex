"use client";

import {
  ArrowUpRight, Award, BadgeCheck, Banknote, Clock3, Download, FilePenLine, FileText, Inbox, Landmark, LifeBuoy, MessageSquareWarning, Pencil, Plane, Plus,
  QrCode, RotateCcw, Send, Sparkles, Undo2, UserCheck, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { LetterRequestItem, LetterRequestType, MyLetterRequests } from "@/shared/self-service/letter-request";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dmy } from "@/features/hr/components/attendance-ui";
import { EsTracker } from "@/features/hr/components/ess-bits";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createLetterRequest, letterPdfUrl, myLetterRequests, updateLetterRequest, withdrawLetterRequest } from "../api";

/** Template 10-requests.js TYPES: card icon, tile tone, blurb and typical turnaround per letter. */
const TYPES: { k: LetterRequestType; n: string; Icon: LucideIcon; tone: string; d: string; sla: string; addr: string }[] = [
  { k: "SALARY_CERTIFICATE", n: "Salary certificate", Icon: Banknote, tone: "green", d: "Gross & net salary on letterhead for banks, landlords and visas.", sla: "Same day", addr: "To whom it may concern" },
  { k: "EXPERIENCE", n: "Experience letter", Icon: Award, tone: "violet", d: "Confirms your role, tenure and responsibilities.", sla: "1 working day", addr: "To whom it may concern" },
  { k: "NOC_VISA", n: "NOC for visa", Icon: Plane, tone: "blue", d: "No-objection for travel abroad, with your travel dates.", sla: "1 working day", addr: "The Visa Officer" },
  { k: "BANK_LETTER", n: "Bank letter", Icon: Landmark, tone: "orange", d: "Account opening, credit card or loan letter addressed to your bank.", sla: "Same day", addr: "The Branch Manager" },
  { k: "EMPLOYMENT_VERIFICATION", n: "Employment verification", Icon: BadgeCheck, tone: "lime", d: "Confirms current employment for background checks and tenancy.", sla: "Within 4 hours", addr: "To whom it may concern" },
];
const typeOf = (k: string) => TYPES.find((t) => t.k === k) ?? TYPES[0]!;
const STEPS = ["Submitted", "HR review", "Signed", "Ready"];
const SALARY_TYPES = ["SALARY_CERTIFICATE", "BANK_LETTER", "EMPLOYMENT_VERIFICATION"];

type Form = {
  id: string | null; rowVersion: number; letterType: LetterRequestType; addressedTo: string; purpose: string; travelCountry: string; travelFrom: string; travelTill: string;
  includeSalary: boolean; responsibilities: string; outputFormat: "DIGITAL_PDF_QR" | "PRINTED_STAMPED"; language: "EN" | "UR";
};
const blank = (k: LetterRequestType): Form => ({
  id: null, rowVersion: 0, letterType: k, addressedTo: typeOf(k).addr, purpose: "", travelCountry: "", travelFrom: "", travelTill: "",
  includeSalary: k === "SALARY_CERTIFICATE" || k === "BANK_LETTER", responsibilities: "", outputFormat: "DIGITAL_PDF_QR", language: "EN",
});
const fromItem = (r: LetterRequestItem): Form => ({
  id: r.id, rowVersion: r.rowVersion, letterType: r.letterType as LetterRequestType, addressedTo: r.addressedTo, purpose: r.purpose, travelCountry: r.travelCountry ?? "",
  travelFrom: r.travelFrom ?? "", travelTill: r.travelTill ?? "", includeSalary: r.includeSalary, responsibilities: r.responsibilities ?? "",
  outputFormat: r.outputFormat as Form["outputFormat"], language: r.language as Form["language"],
});
/** Tracker position: submitted → waiting on HR (step 1) until the letter is ready (step 3). */
const trackAt = (r: LetterRequestItem) => (r.status === "COMPLETED" ? 3 : 1);
const trackState = (r: LetterRequestItem) => (r.status === "REJECTED" ? "rej" : r.status === "WITHDRAWN" ? "cancel" : "ok");
const BADGE: Record<string, [string, string]> = { OPEN: ["warn", "In review"], COMPLETED: ["good", "Ready"], REJECTED: ["danger", "Rejected"], WITHDRAWN: ["neutral", "Withdrawn"] };

/** Template app/profile/requests (6A-ess.html + 9C-ess.js 10-requests): letter type cards, the request sheet, my requests with trackers, issued letter PDF. */
export function MyLetterRequestsScreen({ can }: { can: { create: boolean } }) {
  const toast = useToast();
  const [data, setData] = useState<MyLetterRequests | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string; code?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [withdraw, setWithdraw] = useState<LetterRequestItem | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    myLetterRequests().then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId, code: e.code } : { message: "Could not load your letter requests" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const open = (k: LetterRequestType) => { setErrs({}); setForm(blank(k)); };

  const head = (
    <PageHead eyebrow="My Profile / Letters & Requests" title="Letters & Requests"
      description="Self-serve HR letters on company letterhead. HR signs them, usually within one working day, and each carries a verification code."
      actions={<>
        <Link className="btn secondary" href="/profile/helpdesk"><LifeBuoy />Ask HR</Link>
        {can.create && data && <button className="btn primary" type="button" onClick={() => open("SALARY_CERTIFICATE")}><Plus />New request</button>}
      </>} />
  );
  if (error?.code === "ESS_NO_EMPLOYEE_RECORD") return <>{head}<div className="es-card"><div className="es-empty"><span className="icon-tile"><Inbox /></span><b>No employee record</b><span>{error.message}</span></div></div></>;
  if (error) return <>{head}<ErrorState message={error.message} reference={error.reference} onRetry={reload} /></>;
  if (!data) return <>{head}<Skeleton style={{ height: 480 }} /></>;

  const pick = (k: LetterRequestType) => form && setForm({ ...form, letterType: k, addressedTo: form.addressedTo === typeOf(form.letterType).addr ? typeOf(k).addr : form.addressedTo, includeSalary: k === "SALARY_CERTIFICATE" || k === "BANK_LETTER" });
  const set = (patch: Partial<Form>) => { if (form) { setForm({ ...form, ...patch }); setErrs((x) => ({ ...x, ...Object.fromEntries(Object.keys(patch).map((k) => [k, ""])) })); } };

  const submit = async () => {
    if (!form) return;
    const local: Record<string, string> = {};
    if (!form.addressedTo.trim()) local.addressedTo = "Who is the letter addressed to?";
    if (!form.purpose.trim()) local.purpose = "Give the purpose";
    if (form.letterType === "NOC_VISA") {
      if (!form.travelCountry.trim()) local.travelCountry = "Country is needed for a visa NOC";
      if (!form.travelFrom || !form.travelTill) local.travelTill = "Travel dates are needed for a visa NOC";
    }
    if (Object.keys(local).length) { setErrs(local); return; }
    const body = {
      letterType: form.letterType, addressedTo: form.addressedTo, purpose: form.purpose, travelCountry: form.travelCountry || null, travelFrom: form.travelFrom || null,
      travelTill: form.travelTill || null, includeSalary: SALARY_TYPES.includes(form.letterType) ? form.includeSalary : false, responsibilities: form.responsibilities || null,
      outputFormat: form.outputFormat, language: form.language,
    };
    setBusy(true);
    try {
      const r = form.id ? await updateLetterRequest(form.id, { ...body, rowVersion: form.rowVersion }) : await createLetterRequest(body);
      toast(form.id ? `${r.docNo} updated` : `${typeOf(r.letterType).n} requested · ${r.docNo}`, { tone: "good" });
      setForm(null); setFresh(r.id); reload();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not submit the request"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const doWithdraw = async () => {
    const r = withdraw;
    if (!r) return;
    setWithdraw(null);
    try { await withdrawLetterRequest(r.id, r.rowVersion); toast("Request withdrawn", { tone: "info" }); reload(); }
    catch (e) { toast(apiMessage(e, "Could not withdraw the request"), { tone: "danger" }); }
  };

  const items = data.items;
  const issued = items.filter((r) => r.status === "COMPLETED").length;
  const openN = items.filter((r) => r.status === "OPEN").length;
  const t = form ? typeOf(form.letterType) : null;

  return (
    <>
      {head}
      <div className="es-rq-types">
        {TYPES.map((x, i) => (
          <button key={x.k} type="button" className="es-rq-type" disabled={!can.create} onClick={() => open(x.k)} style={{ ["--i" as string]: i } as CSSProperties}>
            <span className={`icon-tile ${x.tone}`}><x.Icon /></span>
            <b>{data.types.find((y) => y.code === x.k)?.label ?? x.n}</b><small>{x.d}</small>
            <span className="es-rq-sla"><Clock3 />{x.sla}</span><span className="es-rq-go"><ArrowUpRight /></span>
          </button>
        ))}
      </div>

      <div className="es-grid es-main">
        <div className="es-card">
          <div className="es-head"><h3>My requests</h3><span className="es-count">{items.length}</span><span className="spacer" /><span className="es-label">Tracked from submission to signed letter</span></div>
          <div className="es-rq-list">
            {items.length ? items.map((r, i) => {
              const x = typeOf(r.letterType), [tone, label] = BADGE[r.status] ?? ["neutral", r.status];
              const subs = [dmy(r.docDate), r.stage === "HR_REVIEW" ? "Being reviewed" : null, r.signedBy?.name ?? null, r.referenceNo];
              return (
                <div key={r.id} className={`es-rq-row es-in${fresh === r.id ? " fresh" : ""}`} style={{ ["--i" as string]: i } as CSSProperties}>
                  <div className="es-rq-rh"><span className={`icon-tile ${x.tone}`}><x.Icon /></span><div><b>{r.letterTypeLabel}</b><small>{r.docNo} · {dmy(r.docDate)} · {r.purpose}</small></div><span className="spacer" /><span className={`badge dot ${tone}`}>{label}</span></div>
                  <EsTracker steps={STEPS} at={trackAt(r)} state={trackState(r)} subs={subs} />
                  {r.status === "REJECTED" && <p className="es-rq-why"><MessageSquareWarning />{r.rejectedReason}</p>}
                  {r.status === "WITHDRAWN" && <p className="es-rq-why"><MessageSquareWarning />Withdrawn by you{r.withdrawnAt ? ` on ${dmy(r.withdrawnAt.slice(0, 10))}` : ""}</p>}
                  <div className="es-rq-acts">
                    {r.status === "COMPLETED" ? <>
                      {r.pdfAttachmentId && <a className="btn sm primary" href={letterPdfUrl(r.pdfAttachmentId)} target="_blank" rel="noreferrer"><FileText />View letter</a>}
                      {r.pdfAttachmentId && <a className="btn sm secondary" href={letterPdfUrl(r.pdfAttachmentId)} download={`${r.referenceNo ?? r.docNo}.pdf`}><Download />PDF</a>}
                      {r.verificationCode && <span className="pill"><QrCode />Verify code <b>{r.verificationCode}</b></span>}
                    </> : r.status !== "OPEN" ? (can.create && <button type="button" className="btn sm secondary" onClick={() => setForm({ ...fromItem(r), id: null, rowVersion: 0 })}><RotateCcw />Request again</button>)
                      : can.create && <>
                        {r.stage === "SUBMITTED" && <button type="button" className="btn sm secondary" onClick={() => { setErrs({}); setForm(fromItem(r)); }}><Pencil />Edit</button>}
                        <button type="button" className="btn sm ghost" onClick={() => setWithdraw(r)}><Undo2 />Withdraw</button>
                      </>}
                  </div>
                </div>
              );
            }) : <div className="es-empty"><span className="icon-tile"><FileText /></span><b>No letter requests yet</b><span>Pick a letter above. HR is notified as soon as you submit.</span></div>}
          </div>
        </div>
        <div className="es-col">
          <div className="es-card es-rq-how">
            <div className="es-head"><h3>How it works</h3></div>
            {([[FilePenLine, "Pick a letter & fill 2 fields", "Everything else comes from your HR record."], [UserCheck, "HR reviews", "HR checks the details and signs the letter."], [QrCode, "Download & share", "Each letter carries a code anyone can verify."]] as const).map(([Ic, b, s], i) => (
              <div key={b} className="es-rq-step"><span>{i + 1}</span><div><b>{b}</b><small>{s}</small></div><Ic /></div>
            ))}
          </div>
          <div className="es-card">
            <div className="es-head"><h3>My letters</h3></div>
            <div className="es-stats"><div className="es-stat"><span>Issued</span><b>{issued}</b><small>signed letters</small></div><div className="es-stat"><span>In progress</span><b>{openN}</b><small>with HR</small></div></div>
          </div>
        </div>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${t?.n.toLowerCase()} request` : `Request ${t?.k === "NOC_VISA" ? t.n : t?.n.toLowerCase()}`}
        subtitle={`Signed by HR · typical turnaround ${t?.sla.toLowerCase()}.`}
        foot={<><button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={submit}><Send />{busy ? "Submitting…" : form?.id ? "Save changes" : "Submit request"}</button></>}>
        {form && <>
          <div className="es-rq-pick">{TYPES.map((x) => <button key={x.k} type="button" className={`es-opt${x.k === form.letterType ? " on" : ""}`} onClick={() => pick(x.k)}><x.Icon />{x.n}</button>)}</div>
          <div className="form-grid es-rq-form">
            <label className="full"><span>Addressed to *</span><input value={form.addressedTo} maxLength={200} onChange={(e) => set({ addressedTo: e.target.value })} />{errs.addressedTo && <small className="es-down">{errs.addressedTo}</small>}</label>
            <label className="full"><span>Purpose *</span><input value={form.purpose} maxLength={200} placeholder="e.g. Car finance application" onChange={(e) => set({ purpose: e.target.value })} />{errs.purpose && <small className="es-down">{errs.purpose}</small>}</label>
            {form.letterType === "NOC_VISA" && <>
              <label><span>Country *</span><input value={form.travelCountry} maxLength={80} placeholder="e.g. Türkiye" onChange={(e) => set({ travelCountry: e.target.value })} />{errs.travelCountry && <small className="es-down">{errs.travelCountry}</small>}</label>
              <span />
              <label><span>Travel from *</span><input type="date" value={form.travelFrom} onChange={(e) => set({ travelFrom: e.target.value, travelTill: form.travelTill && form.travelTill < e.target.value ? e.target.value : form.travelTill })} />{errs.travelFrom && <small className="es-down">{errs.travelFrom}</small>}</label>
              <label><span>Travel till *</span><input type="date" value={form.travelTill} min={form.travelFrom || undefined} onChange={(e) => set({ travelTill: e.target.value })} />{errs.travelTill && <small className="es-down">{errs.travelTill}</small>}</label>
            </>}
            {SALARY_TYPES.includes(form.letterType) && <label className="full es-rq-sw"><span className="switch"><input type="checkbox" checked={form.includeSalary} onChange={(e) => set({ includeSalary: e.target.checked })} /><i /><span>Include salary breakdown</span></span><small className="es-hint">Basic, allowances and gross from your current salary record.</small></label>}
            {form.letterType === "EXPERIENCE" && <label className="full"><span>Key responsibilities to mention</span><textarea rows={3} maxLength={1000} value={form.responsibilities} onChange={(e) => set({ responsibilities: e.target.value })} /></label>}
          </div>
          <div className="es-rq-row2">
            <div className="es-field"><span>Format</span><div className="seg">{(["DIGITAL_PDF_QR", "PRINTED_STAMPED"] as const).map((f) => <button key={f} type="button" className={form.outputFormat === f ? "active" : ""} onClick={() => set({ outputFormat: f })}>{f === "DIGITAL_PDF_QR" ? "Digital PDF + code" : "Printed & stamped"}</button>)}</div></div>
            <div className="es-field"><span>Language</span><div className="seg">{(["EN", "UR"] as const).map((l) => <button key={l} type="button" className={form.language === l ? "active" : ""} onClick={() => set({ language: l })}>{l === "EN" ? "English" : "اردو Urdu"}</button>)}</div></div>
          </div>
          <div className="es-rq-prev"><Sparkles /><div><b>Auto-filled from your HR record</b><small>Your name, CNIC, designation, joining date{form.includeSalary ? " and salary" : ""} are filled in by HR when the letter is generated.</small></div></div>
        </>}
      </Modal>

      <ConfirmDialog open={!!withdraw} onClose={() => setWithdraw(null)} danger title={`Withdraw ${withdraw?.docNo ?? ""}?`} confirmLabel="Withdraw" onConfirm={doWithdraw}>
        HR will stop processing this request.
      </ConfirmDialog>
    </>
  );
}
