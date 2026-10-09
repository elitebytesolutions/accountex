"use client";

import { Ban, Download, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EMPLOYEE_LETTER_KIND, EMPLOYEE_LETTER_TYPES, type EmployeeLetterItem, type EmployeeLetterOptions } from "@/shared";
import { Check as CheckBox, Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { attachmentUrl, employeeLetterOptions, employeeLetters, generateEmployeeLetter, voidEmployeeLetter } from "../exits-api";
import { localToday } from "./attendance-ui";

const TONE: Record<string, string> = { DRAFT: "neutral", ISSUED: "info", SIGNED: "good", VOID: "danger" };
const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

/** Employee view › Documents: the HR letters generated for the employee (PDF download, verification code, void). */
export function EmployeeLettersPanel({ employeeId, canEdit, refreshKey }: { employeeId: string; canEdit: boolean; refreshKey: number }) {
  const toast = useToast();
  const lookups = useLookups(["EmployeeLetterType"]);
  const [items, setItems] = useState<EmployeeLetterItem[] | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; letterNo: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    employeeLetters(employeeId).then((x) => !cancelled && setItems(x)).catch((e: unknown) => { if (!cancelled) { setItems([]); toast(apiMessage(e, "Could not load letters"), { tone: "danger" }); } });
    return () => { cancelled = true; };
  }, [employeeId, refreshKey, attempt, toast]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <div className="panel mt">
      <div className="panel-head"><div><h3>HR letters</h3><p>Generated from the HR letter templates · English PDF with a verification code</p></div></div>
      {!items ? <Skeleton style={{ height: 80 }} /> : items.length ? (
        <div className="list">{items.map((l) => (
          <div key={l.id} className="list-item">
            <span className="icon-well"><FileText /></span>
            <div><b>{labelOf(lookups, "EmployeeLetterType", l.letterType) || humanize(l.letterType)} — {l.letterNo}</b>
              <small>{[dateLabel(l.letterDate), l.addressedTo, l.signatory && `signed by ${l.signatory.name}`, l.verificationCode && `code ${l.verificationCode}`].filter(Boolean).join(" · ")}</small></div>
            <span className="spacer" /><span className={`badge ${TONE[l.status] ?? "neutral"}`}>{humanize(l.status)}</span>
            {l.pdf && <a className="icon-btn-sm" href={attachmentUrl(l.pdf.id)} target="_blank" rel="noreferrer" aria-label={`Download ${l.letterNo}`}><Download /></a>}
            {canEdit && l.status !== "VOID" && <button className="icon-btn-sm" type="button" aria-label={`Void ${l.letterNo}`} onClick={() => setVoiding({ id: l.id, letterNo: l.letterNo, reason: "" })}><Ban /></button>}
          </div>
        ))}</div>
      ) : <EmptyState icon={<FileText />} title="No letters yet" description={canEdit ? "Use Generate letter to issue a salary certificate, experience letter and more." : "Letters HR issues appear here."} />}
      <Modal open={!!voiding} onClose={() => setVoiding(null)} title={`Void ${voiding?.letterNo ?? ""}`} subtitle="The letter stays on record; verifying its code shows it as void."
        foot={<><button className="btn secondary" type="button" onClick={() => setVoiding(null)}>Cancel</button><button className="btn danger" type="button" disabled={busy || (voiding?.reason.trim().length ?? 0) < 3}
          onClick={async () => { if (!voiding) return; setBusy(true); try { await voidEmployeeLetter(voiding.id, voiding.reason); toast(`${voiding.letterNo} voided`, { tone: "good" }); setVoiding(null); reload(); } catch (e) { toast(apiMessage(e, "Could not void the letter"), { tone: "danger" }); } finally { setBusy(false); } }}>Void letter</button></>}>
        {voiding && <div className="form-grid"><Field label="Reason" required full><textarea rows={2} maxLength={300} value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} /></Field></div>}
      </Modal>
    </div>
  );
}

type Form = { letterType: string; docTemplateId: string; addressedTo: string; letterDate: string; signatoryEmployeeId: string; includeSalary: boolean };

/** Template modal #hrc-letter (50-hr-core.html): generate a letter from an HR letter template (English only). */
export function GenerateLetterModal({ open, employee, onClose, onGenerated }: { open: boolean; employee: { id: string; name: string; code: string }; onClose: () => void; onGenerated: () => void }) {
  const toast = useToast();
  const lookups = useLookups(["EmployeeLetterType"]);
  const [opts, setOpts] = useState<EmployeeLetterOptions | null>(null);
  const [form, setForm] = useState<Form>({ letterType: "SALARY_CERTIFICATE", docTemplateId: "", addressedTo: "", letterDate: localToday(), signatoryEmployeeId: "", includeSalary: true });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && !opts) employeeLetterOptions().then(setOpts).catch(() => setOpts({ templates: [], signatories: [] })); }, [open, opts]);
  const kind = EMPLOYEE_LETTER_KIND[form.letterType] ?? "OTHER";
  const templates = opts?.templates.filter((t) => t.letterKind === kind) ?? [];
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    setBusy(true); setErrs({});
    try {
      const l = await generateEmployeeLetter(employee.id, { ...form, docTemplateId: form.docTemplateId || null, addressedTo: form.addressedTo || null, signatoryEmployeeId: form.signatoryEmployeeId || null });
      toast(`${labelOf(lookups, "EmployeeLetterType", l.letterType) || humanize(l.letterType)} generated — ${l.letterNo}`, { tone: "good" });
      onGenerated(); onClose();
      if (l.pdf) window.open(attachmentUrl(l.pdf.id), "_blank", "noopener");
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not generate the letter"), { tone: "danger" }); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Generate letter" subtitle={`Merged from HR letter templates · ${employee.name} · ${employee.code}`}
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !opts || !templates.length} onClick={generate}><FileText />Generate PDF</button></>}>
      <div className="form-grid">
        <Field label="Letter" required full error={errs.letterType} hint={opts && !templates.length ? "No HR letter template for this letter yet — add one under Settings › Document templates." : undefined}>
          <select value={form.letterType} onChange={(e) => setForm((f) => ({ ...f, letterType: e.target.value, docTemplateId: "", includeSalary: e.target.value === "SALARY_CERTIFICATE" }))}>
            {EMPLOYEE_LETTER_TYPES.map((t) => <option key={t} value={t}>{labelOf(lookups, "EmployeeLetterType", t) || humanize(t)}</option>)}
          </select>
        </Field>
        {templates.length > 1 && <Field label="Template" full error={errs.docTemplateId}><select value={form.docTemplateId} onChange={(e) => set("docTemplateId", e.target.value)}><option value="">Default</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}</select></Field>}
        <Field label="Addressed to" error={errs.addressedTo}><input maxLength={200} placeholder="The Manager, Meezan Bank" value={form.addressedTo} onChange={(e) => set("addressedTo", e.target.value)} /></Field>
        <Field label="Letter date" required error={errs.letterDate}><input type="date" value={form.letterDate} onChange={(e) => set("letterDate", e.target.value)} /></Field>
        <Field label="Signatory" error={errs.signatoryEmployeeId}><select value={form.signatoryEmployeeId} onChange={(e) => set("signatoryEmployeeId", e.target.value)}><option value="">No named signatory</option>{opts?.signatories.filter((x) => x.id !== employee.id).map((x) => <option key={x.id} value={x.id}>{x.name}{x.designation ? ` — ${x.designation}` : ""}</option>)}</select></Field>
        <CheckBox full label="Include salary breakup" checked={form.includeSalary} onChange={(e) => set("includeSalary", e.target.checked)} />
      </div>
    </Modal>
  );
}
