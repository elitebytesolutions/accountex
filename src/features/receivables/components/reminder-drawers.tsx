"use client";

import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { offsetLabel, REMINDER_PLACEHOLDERS, smsSegments, type ReminderRule, type ReminderTemplate } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { lookupOptions, type useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import {
  createReminderRule, createReminderTemplate, deleteReminderRule, deleteReminderTemplate, updateReminderRule, updateReminderTemplate,
} from "../api";

type Can = { edit: boolean; remove: boolean };
type Lookups = ReturnType<typeof useLookups>;

/** Added: the reminder rule's fields the template's cards don't show (offset, level, action, escalation, hold, run time). */
export function RuleDrawer({ rule, templates, users, lookups, can, onClose, onSaved }: {
  rule: ReminderRule | null;
  templates: ReminderTemplate[];
  users: { id: string; name: string }[];
  lookups: Lookups;
  can: Can;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Record<string, string | boolean>>(() => ({
    name: rule?.name ?? "30 days after due", offsetDays: String(rule?.offsetDays ?? 30), dunningLevel: rule?.dunningLevel ?? "LEVEL_2",
    sendWhatsapp: rule?.sendWhatsapp ?? false, sendSms: rule?.sendSms ?? false, sendEmail: rule?.sendEmail ?? true,
    templateId: rule?.template.id ?? templates.find((t) => t.isActive)?.id ?? "", action: rule?.action ?? "MESSAGE", attachStatement: rule?.attachStatement ?? true,
    escalate: rule?.escalate ?? false, escalateToUserId: rule?.escalateTo?.id ?? "", applyCreditHold: rule?.applyCreditHold ?? false, runTime: rule?.runTime ?? "09:00",
    isActive: rule?.isActive ?? true,
  }));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const s = (k: string) => String(f[k] ?? "");
  const b = (k: string) => Boolean(f[k]);
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const ro = !can.edit;
  const save = async () => {
    setBusy(true);
    setErrs({});
    try {
      if (rule) await updateReminderRule(rule.id, { ...f, rowVersion: rule.rowVersion }); else await createReminderRule(f);
      toast(rule ? `“${s("name")}” saved` : `Rule added: ${s("name")}`, { tone: "good" });
      onSaved();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the rule"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return (
    <>
      <Drawer open onClose={onClose} title={rule ? rule.name : "New reminder rule"} subtitle={rule ? `${offsetLabel(rule.offsetDays)} · ${rule.sentCount} sent` : "When it runs, on which channels and what else happens"}
        foot={history ? <button type="button" className="btn secondary" onClick={() => setHistory(false)}><Pencil />Back</button> : <>
          {rule && <button type="button" className="btn ghost" onClick={() => setHistory(true)}><History />History</button>}
          {rule && can.remove && <button type="button" className="btn ghost" onClick={() => setConfirm(true)}><Trash2 />Delete</button>}
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose}>{ro ? "Close" : "Cancel"}</button>
          {!ro && <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : rule ? "Save rule" : "Add rule"}</button>}
        </>}>
        {history && rule ? <HistoryTab schema="Sales" table="PaymentReminderRules" id={rule.id} /> : (
          <FormGrid>
            <Field label="Days from due date" required error={errs.offsetDays} hint="−3 = three days before; 0 = on the due date; 7 = a week after">
              <input inputMode="numeric" value={s("offsetDays")} disabled={ro} onChange={(e) => { set("offsetDays", e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && e.target.value !== "") set("name", offsetLabel(Math.trunc(n))); }} />
            </Field>
            <Field label="Rule name" required error={errs.name}><input value={s("name")} maxLength={80} disabled={ro} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Message" required error={errs.templateId}><select value={s("templateId")} disabled={ro} onChange={(e) => set("templateId", e.target.value)}><option value="">Choose…</option>{templates.filter((t) => t.isActive || t.id === s("templateId")).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Dunning level" error={errs.dunningLevel}><select value={s("dunningLevel")} disabled={ro} onChange={(e) => set("dunningLevel", e.target.value)}>{lookupOptions(lookups, "DunningLevel", s("dunningLevel")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Action" error={errs.action}><select value={s("action")} disabled={ro} onChange={(e) => set("action", e.target.value)}>{lookupOptions(lookups, "PaymentReminderRuleAction", s("action")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Runs at" error={errs.runTime}><input type="time" value={s("runTime")} disabled={ro} onChange={(e) => set("runTime", e.target.value)} /></Field>
            <Field label="Channels" full error={errs.sendEmail || errs.sendWhatsapp}>
              <div className="row" style={{ gap: 16 }}>
                <Check label="WhatsApp" checked={b("sendWhatsapp")} disabled={ro} onChange={(e) => set("sendWhatsapp", e.target.checked)} />
                <Check label="SMS" checked={b("sendSms")} disabled={ro} onChange={(e) => set("sendSms", e.target.checked)} />
                <Check label="Email" checked={b("sendEmail")} disabled={ro} onChange={(e) => set("sendEmail", e.target.checked)} />
              </div>
            </Field>
            <Check label="Attach the statement of account" checked={b("attachStatement")} disabled={ro} onChange={(e) => set("attachStatement", e.target.checked)} />
            <Check label="Put the account on credit hold" checked={b("applyCreditHold")} disabled={ro} onChange={(e) => set("applyCreditHold", e.target.checked)} />
            <Check label="Escalate to a colleague" checked={b("escalate")} disabled={ro} onChange={(e) => set("escalate", e.target.checked)} />
            {b("escalate") && <Field label="Escalate to" required error={errs.escalateToUserId}><select value={s("escalateToUserId")} disabled={ro} onChange={(e) => set("escalateToUserId", e.target.value)}><option value="">Choose…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>}
            <Check label="Active" checked={b("isActive")} disabled={ro} onChange={(e) => set("isActive", e.target.checked)} />
          </FormGrid>
        )}
      </Drawer>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Delete “${rule?.name}”?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!rule) return;
        setConfirm(false);
        try { await deleteReminderRule(rule.id, rule.rowVersion); toast(`“${rule.name}” deleted`, { tone: "danger" }); onSaved(); } catch (e) { toast(apiMessage(e, "Could not delete the rule"), { tone: "danger" }); }
      }}>Rules that have already sent reminders can only be paused.</ConfirmDialog>
    </>
  );
}

/** Added: the reminder messages (English + Urdu) with placeholder buttons and the SMS length. */
export function TemplatesDrawer({ templates, can, onClose, onSaved }: { templates: ReminderTemplate[]; can: Can; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<ReminderTemplate | "new" | null>(templates[0] ?? null);
  const blank = { code: "", name: "", emailSubject: "", bodyEn: "", bodyUr: "", isActive: true };
  const from = (t: ReminderTemplate | "new" | null) => (t && t !== "new" ? { code: t.code, name: t.name, emailSubject: t.emailSubject ?? "", bodyEn: t.bodyEn, bodyUr: t.bodyUr ?? "", isActive: t.isActive } : blank);
  const [f, setF] = useState<Record<string, string | boolean>>(() => from(sel));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [focus, setFocus] = useState<"bodyEn" | "bodyUr">("bodyEn");
  const enRef = useRef<HTMLTextAreaElement>(null);
  const urRef = useRef<HTMLTextAreaElement>(null);
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const ro = !can.edit;
  const pick = (t: ReminderTemplate | "new") => { setSel(t); setF(from(t)); setErrs({}); setHistory(false); };
  const insert = (ph: string) => {
    const el = (focus === "bodyEn" ? enRef : urRef).current, v = s(focus), token = `{${ph}}`;
    const at = el ? el.selectionStart : v.length;
    set(focus, v.slice(0, at) + token + v.slice(el ? el.selectionEnd : v.length));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  };
  const save = async () => {
    setBusy(true);
    setErrs({});
    try {
      const t = sel && sel !== "new" ? await updateReminderTemplate(sel.id, { ...f, rowVersion: sel.rowVersion }) : await createReminderTemplate(f);
      toast(`${t.name} saved`, { tone: "good" });
      setSel(t);
      onSaved();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the message"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const cur = sel && sel !== "new" ? sel : null;
  return (
    <>
      <Drawer open wide onClose={onClose} title="Reminder messages" subtitle="What customers receive, in English and Urdu"
        foot={history ? <button type="button" className="btn secondary" onClick={() => setHistory(false)}><Pencil />Back</button> : <>
          {cur && <button type="button" className="btn ghost" onClick={() => setHistory(true)}><History />History</button>}
          {cur && can.remove && <button type="button" className="btn ghost" onClick={() => setConfirm(true)}><Trash2 />Delete</button>}
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose}>Close</button>
          {!ro && sel && <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : cur ? "Save message" : "Create message"}</button>}
        </>}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {templates.map((t) => <button key={t.id} type="button" className={cn("btn sm", cur?.id === t.id ? "primary" : "secondary")} onClick={() => pick(t)}>{t.name}{!t.isActive && " (off)"}</button>)}
          {can.edit && <button type="button" className={cn("btn sm", sel === "new" ? "primary" : "ghost")} onClick={() => pick("new")}><Plus />New message</button>}
        </div>
        {history && cur ? <HistoryTab schema="Sales" table="PaymentReminderTemplates" id={cur.id} /> : sel ? (
          <FormGrid>
            <Field label="Code" required error={errs.code}><input value={s("code")} maxLength={30} disabled={ro} placeholder="FIRM_FOLLOW_UP" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Name" required error={errs.name}><input value={s("name")} maxLength={80} disabled={ro} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Email subject" full error={errs.emailSubject}><input value={s("emailSubject")} maxLength={150} disabled={ro} onChange={(e) => set("emailSubject", e.target.value)} /></Field>
            <Field label="Placeholders" full hint="Click to insert at the cursor">
              <div className="cp-rm-vars" style={{ margin: 0 }}>{REMINDER_PLACEHOLDERS.map((p) => <button key={p} type="button" className="btn ghost sm" disabled={ro} onClick={() => insert(p)}><code>{`{${p}}`}</code></button>)}</div>
            </Field>
            <Field label="English" required full error={errs.bodyEn} hint={`${s("bodyEn").length} characters · ${smsSegments(s("bodyEn"))} SMS`}>
              <textarea ref={enRef} rows={4} maxLength={1000} value={s("bodyEn")} disabled={ro} onFocus={() => setFocus("bodyEn")} onChange={(e) => set("bodyEn", e.target.value)} />
            </Field>
            <Field label="اردو (Urdu)" full error={errs.bodyUr} hint={s("bodyUr") ? `${s("bodyUr").length} characters · ${smsSegments(s("bodyUr"))} SMS` : "Optional; English is sent when empty"}>
              <textarea ref={urRef} rows={4} maxLength={1000} dir="rtl" lang="ur" value={s("bodyUr")} disabled={ro} onFocus={() => setFocus("bodyUr")} onChange={(e) => set("bodyUr", e.target.value)} />
            </Field>
            <Check label="Active" checked={Boolean(f.isActive)} disabled={ro} onChange={(e) => set("isActive", e.target.checked)} />
            {cur && <p className="muted">{cur.ruleCount ? `Used by ${cur.ruleCount} rule${cur.ruleCount === 1 ? "" : "s"}.` : "Not used by any rule."}</p>}
          </FormGrid>
        ) : <p className="muted">No messages yet.</p>}
      </Drawer>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${cur?.name}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!cur) return;
        setConfirm(false);
        try { await deleteReminderTemplate(cur.id, cur.rowVersion); toast(`${cur.name} deleted`, { tone: "danger" }); setSel(null); onSaved(); } catch (e) { toast(apiMessage(e, "Could not delete the message"), { tone: "danger" }); }
      }}>Messages used by a rule or already sent can only be deactivated.</ConfirmDialog>
    </>
  );
}
