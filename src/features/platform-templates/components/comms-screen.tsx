"use client";

import {
  BadgeCheck, ChevronLeft, CircleCheck, CreditCard, Hourglass, KeyRound, Mail, Megaphone, MessageCircle, MessageSquareText, PartyPopper, Plus, RadioTower,
  ReceiptText, Save, Send, Settings2, Wrench, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { COMM_CHANNELS, COMM_SAMPLE, COMM_VARIABLES, commSmsSegments, renderTemplate, type CommTemplate } from "@/shared";
import { Field, FormGrid, Check } from "@/components/ui/form";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { ApiError } from "@/lib/api/errors";
import { BroadcastModal } from "@/features/platform-growth/components/broadcast-modal";
import { DeliveryLog } from "@/features/platform-growth/components/delivery-log";
import { createCommTemplate, deleteCommTemplate, listCommTemplates, updateCommTemplate } from "../api";

export const COMM_ICONS: Record<string, LucideIcon> = {
  "party-popper": PartyPopper, hourglass: Hourglass, "receipt-text": ReceiptText, "credit-card": CreditCard, "key-round": KeyRound, wrench: Wrench, mail: Mail, megaphone: Megaphone,
};
const CH: Record<string, [string, LucideIcon]> = { EMAIL: ["Email", Mail], SMS: ["SMS", MessageSquareText], WHATSAPP: ["WhatsApp", MessageCircle] };
type Lang = "en" | "ur";
type Draft = { subjectEn: string; bodyEn: string; subjectUr: string; bodyUr: string };
const draftOf = (t: CommTemplate): Draft => ({ subjectEn: t.subjectEn, bodyEn: t.bodyEn, subjectUr: t.subjectUr ?? "", bodyUr: t.bodyUr ?? "" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Template preview text: {{variables}} filled with sample data and highlighted (`mark.ap-var`). */
function Filled({ text, lang, oneLine }: { text: string; lang: Lang; oneLine?: boolean }) {
  const html = esc(oneLine ? text.replace(/\n+/g, " ") : text).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (COMM_SAMPLE[lang][k] ? `<mark class="ap-var">${esc(COMM_SAMPLE[lang][k]!)}</mark>` : m)).replace(/\n/g, "<br>");
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Template admin/comms (9B-admin-plus.js): template list, English / Urdu editor with SMS segment count and
 * {{variable}} chips, live Email / SMS / WhatsApp preview. "Send a test" waits for email/SMS delivery (Phase 29); the
 * delivery log and Broadcast are Phase 42 (features/platform-growth).
 */
export function CommsScreen() {
  const toast = useToast();
  const [list, setList] = useState<CommTemplate[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<string>("EMAIL");
  const [focus, setFocus] = useState<"subject" | "body">("body");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<{ template: CommTemplate | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [broadcast, setBroadcast] = useState(false);
  const [sent, setSent] = useState(0);
  const subjRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    listCommTemplates()
      .then((l) => {
        if (cancelled) return;
        setList(l);
        setSel((s) => (s && l.some((x) => x.id === s) ? s : l[0]?.id ?? null));
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the templates" }));
    return () => { cancelled = true; };
  }, [attempt]);

  const t = list?.find((x) => x.id === sel) ?? null;
  const d = t ? drafts[t.id] ?? draftOf(t) : null;
  const dirty = !!t && !!d && JSON.stringify(d) !== JSON.stringify(draftOf(t));
  const ur = lang === "ur";
  const subject = d ? (ur ? d.subjectUr : d.subjectEn) : "";
  const body = d ? (ur ? d.bodyUr : d.bodyEn) : "";
  const plain = renderTemplate(body, COMM_SAMPLE[lang]);
  const segments = commSmsSegments(plain, ur);
  const edit = (field: "subject" | "body", value: string) => t && d && setDrafts((x) => ({ ...x, [t.id]: { ...d, [`${field}${ur ? "Ur" : "En"}`]: value } }));

  const insertVar = (v: string) => {
    const el = focus === "subject" ? subjRef.current : bodyRef.current;
    const cur = focus === "subject" ? subject : body;
    const tok = `{{${v}}}`;
    const s = el?.selectionStart ?? cur.length, e = el?.selectionEnd ?? cur.length;
    edit(focus, cur.slice(0, s) + tok + cur.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + tok.length, s + tok.length); });
  };

  const save = async () => {
    if (!t || !d) return;
    setBusy(true);
    try {
      const saved = await updateCommTemplate(t.id, { rowVersion: t.rowVersion, subjectEn: d.subjectEn, bodyEn: d.bodyEn, subjectUr: d.subjectUr || null, bodyUr: d.bodyUr || null });
      setList((l) => l?.map((x) => (x.id === saved.id ? saved : x)) ?? l);
      setDrafts((x) => { const n = { ...x }; delete n[t.id]; return n; });
      toast(`${t.name} saved · v${saved.version}`, { tone: "good" });
    } catch (e) {
      toast(adminErrorMessage(e, "Could not save the template"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const head = (
    <div className="page-head">
      <div><div className="eyebrow">Support / Communications</div><h1>Communications</h1><p>Lifecycle templates in English and Urdu across email, SMS and WhatsApp, with delivery tracking.</p></div>
      <div className="head-actions">
        <Link className="btn secondary" href="/admin/announcements"><Megaphone />Announcements</Link>
        <button type="button" className="btn primary" onClick={() => setBroadcast(true)}><RadioTower />Broadcast</button>
      </div>
    </div>
  );
  if (error) return <>{head}<ErrorState {...error} onRetry={reload} /></>;
  if (!list) return <>{head}<Skeleton style={{ height: 480, borderRadius: 18 }} /></>;

  const cta = ur ? "لاگ اِن کریں" : ({ WELCOME: "Open Accountex", TRIAL_ENDING: "Choose a plan", INVOICE: "View invoice", PAYMENT_FAILED: "Pay now", PASSWORD_RESET: "Reset password", MAINTENANCE: "View status" } as Record<string, string>)[t?.code ?? ""] ?? "Open Accountex";
  const dir = ur ? "rtl" : "ltr";

  return (
    <>
      {head}
      <div className="ap-comms">
        <div className="panel ap-tpl-list">
          <div className="panel-head"><div><h3>Templates</h3><p>{list.length} lifecycle message{list.length === 1 ? "" : "s"}</p></div><div className="panel-actions"><button type="button" className="btn ghost sm" aria-label="New template" onClick={() => setSettings({ template: null })}><Plus /></button></div></div>
          <div className="ap-tpls">
            {list.map((x) => {
              const Icon = COMM_ICONS[x.icon ?? ""] ?? Mail;
              return (
                <button key={x.id} type="button" className={cn("ap-tpl", x.id === sel && "on")} style={x.isActive ? undefined : { opacity: 0.55 }} onClick={() => { setSel(x.id); if (!x.channels.includes(view)) setView(x.channels[0] ?? "EMAIL"); if (lang === "ur" && !x.bodyUr && !drafts[x.id]) setLang("en"); }}>
                  <span className="icon-well"><Icon /></span>
                  <div>
                    <b>{x.name}{drafts[x.id] && " •"}</b>
                    <small>{x.sent30d.toLocaleString()} sent · 30 d{x.isActive ? "" : " · inactive"}</small>
                    <span className="ap-chs">{COMM_CHANNELS.map((c) => { const [l, I] = CH[c]!; return <i key={c} className={x.channels.includes(c) ? "on" : ""} title={`${l}${x.channels.includes(c) ? "" : " · off"}`}><I /></i>; })}</span>
                  </div>
                </button>
              );
            })}
            {!list.length && <EmptyState title="No templates yet" description="Create the welcome, trial, invoice and payment messages." action={<button type="button" className="btn primary sm" onClick={() => setSettings({ template: null })}><Plus />New template</button>} />}
          </div>
        </div>

        <div className="panel ap-editor">
          {!t || !d ? <EmptyState title="Pick a template" description="Choose a template on the left to edit it." /> : (
            <>
              <div className="ap-ed-head">
                <div><small>Editing</small><h3>{t.name} · {ur ? "Urdu" : "English"}</h3></div><span className="spacer" />
                <button type="button" className="btn ghost sm" onClick={() => setSettings({ template: t })}><Settings2 />Settings</button>
                <div className="seg ap-lang"><button type="button" className={!ur ? "active" : undefined} onClick={() => setLang("en")}>English</button><button type="button" lang="ur" className={ur ? "active" : undefined} onClick={() => setLang("ur")}>اردو</button></div>
              </div>
              <label className="field"><span>Subject</span><input ref={subjRef} dir={dir} className={cn(ur && "ap-ur")} value={subject} autoComplete="off" onFocus={() => setFocus("subject")} onChange={(e) => edit("subject", e.target.value)} /></label>
              <label className="field ap-mt"><span>Message <em className="ap-count">{plain.length.toLocaleString()} chars · {segments} SMS segment{segments > 1 ? "s" : ""}</em></span><textarea ref={bodyRef} dir={dir} className={cn(ur && "ap-ur")} rows={11} value={body} onFocus={() => setFocus("body")} onChange={(e) => edit("body", e.target.value)} /></label>
              {ur && !d.subjectUr !== !d.bodyUr && <small className="hint text-danger">Give both the Urdu subject and message, or leave both empty.</small>}
              <div className="ap-vars"><small>Insert variable at cursor</small><div className="ap-varlist">{COMM_VARIABLES.map((v) => <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v)}>{`{{${v}}}`}</button>)}</div></div>
              <div className="ap-ed-foot">
                <span className={cn("ap-saved", dirty && "dirty")}><CircleCheck />{dirty ? "Unsaved changes" : `Saved · v${t.version}`}</span><span className="spacer" />
                <button type="button" className="btn secondary" disabled title="Sending arrives with email / SMS delivery (Phase 29)"><Send />Send test</button>
                <button type="button" className="btn primary" disabled={busy || !dirty} onClick={save}><Save />{busy ? "Saving…" : "Save template"}</button>
              </div>
            </>
          )}
        </div>

        <div className="panel ap-preview">
          <div className="ap-pv-head"><b>Live preview</b><div className="seg">{COMM_CHANNELS.map((c) => { const [l, I] = CH[c]!; return <button key={c} type="button" className={view === c ? "active" : undefined} onClick={() => { setView(c); if (t && !t.channels.includes(c)) toast(`${t.name} is not sent by ${l} · previewing anyway`, { tone: "warn" }); }}><I />{l}</button>; })}</div></div>
          <div className="ap-pv-stage">
            {!t ? null : view === "EMAIL" ? (
              <div className="ap-mail">
                <div className="ap-mail-bar"><i /><i /><i /><span>Inbox · accounts@alnoor.com.pk</span></div>
                <div className="ap-mail-meta"><div><small>From</small><b>Accountex Cloud &lt;hello@accountex.pk&gt;</b></div><div><small>Subject</small><b dir={dir} className={cn(ur && "ap-ur")}><Filled text={subject} lang={lang} /></b></div></div>
                <div className="ap-mail-body" dir={dir}><div className="ap-mail-brand"><span className="sb-mark ap-mk"><BadgeCheck /></span><b>Accountex</b></div><p className={cn(ur && "ap-ur")}><Filled text={body} lang={lang} /></p><a className="ap-mail-cta">{cta}</a><small className="ap-mail-foot">Accountex Cloud · Lahore · <u>Unsubscribe</u></small></div>
              </div>
            ) : view === "SMS" ? (
              <div className="ap-phone"><div className="ap-phone-notch" /><div className="ap-phone-top"><ChevronLeft /><span className="avatar xs">AX</span><div><b>ACCOUNTEX</b><small>Text message</small></div></div>
                <div className="ap-phone-screen"><small className="ap-day">Today 10:42</small><div className={cn("ap-bubble sms", ur && "ap-ur")} dir={dir}><Filled text={body} lang={lang} oneLine /></div></div></div>
            ) : (
              <div className="ap-phone wa"><div className="ap-phone-notch" /><div className="ap-phone-top wa"><ChevronLeft /><span className="avatar xs">AX</span><div><b>Accountex Cloud <BadgeCheck className="ap-verified" /></b><small>Business account</small></div></div>
                <div className="ap-phone-screen wa"><small className="ap-day">Today</small><div className={cn("ap-bubble wa", ur && "ap-ur")} dir={dir}><b><Filled text={subject} lang={lang} /></b><br /><Filled text={body} lang={lang} /><span className="ap-time">10:42</span></div><div className="ap-wa-btns"><span>{cta}</span><span>{ur ? "مدد" : "Talk to support"}</span></div></div></div>
            )}
          </div>
        </div>
      </div>

      <DeliveryLog reloadKey={sent} />
      {broadcast && <BroadcastModal onClose={() => setBroadcast(false)} onSent={() => { setSent((n) => n + 1); reload(); }} />}

      {settings && (
        <TemplateSettings template={settings.template} onClose={() => setSettings(null)}
          onSaved={(id) => { setSettings(null); if (id) setSel(id); reload(); }} />
      )}
    </>
  );
}

/** Name, code, icon, channels and active flag (the template's list items), plus History and delete. */
function TemplateSettings({ template, onClose, onSaved }: { template: CommTemplate | null; onClose: () => void; onSaved: (id: string | null) => void }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    code: template?.code ?? "", name: template?.name ?? "", icon: template?.icon ?? "mail", channels: template?.channels ?? ["EMAIL"], isActive: template?.isActive ?? true,
    subjectEn: "", bodyEn: "",
  }));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const run = async (work: () => Promise<[string, string | null]>) => {
    setBusy(true);
    setErrs({});
    try { const [m, id] = await work(); toast(m, { tone: "good" }); onSaved(id); }
    catch (e) { setErrs(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not save the template"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const { subjectEn, bodyEn, ...meta } = f;
    if (!template) { const t = await createCommTemplate({ ...meta, subjectEn, bodyEn }); return [`${t.name} created`, t.id]; }
    const t = await updateCommTemplate(template.id, { ...meta, rowVersion: template.rowVersion });
    return [`${t.name} saved`, t.id];
  });

  return (
    <AdminRecordModal open wide onClose={onClose} busy={busy} title={template ? `Template settings — ${template.name}` : "New template"} subtitle="Channels it is sent by, and whether dunning and broadcasts can use it"
      history={template ? { table: "CommunicationTemplates", id: template.id } : null} saveLabel={template ? "Save" : "Create template"} onSave={save}
      onDelete={template ? async () => { await run(async () => { await deleteCommTemplate(template.id, template.rowVersion); return [`${template.name} deleted`, null]; }); } : undefined}
      deleteNote="Only a template no message or broadcast used can be deleted. Deactivate it instead.">
      <FormGrid cols={3}>
        <Field label="Name" required error={errs.name}><input value={f.name} maxLength={80} placeholder="Payment failed" onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Code" required error={errs.code}><input value={f.code} maxLength={40} placeholder="PAYMENT_FAILED" onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} /></Field>
        <Field label="Icon" error={errs.icon}><select value={f.icon} onChange={(e) => set("icon", e.target.value)}>{Object.keys(COMM_ICONS).map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
        <div className="field full">
          <span>Channels *</span>
          <div className="row ap-wrap ap-chk">{COMM_CHANNELS.map((c) => <Check key={c} label={CH[c]![0]} checked={f.channels.includes(c)} onChange={(e) => set("channels", e.target.checked ? [...f.channels, c] : f.channels.filter((x) => x !== c))} />)}</div>
          {errs.channels && <small className="hint text-danger">{errs.channels}</small>}
        </div>
        {!template && (
          <>
            <Field label="Subject (English)" required full error={errs.subjectEn}><input value={f.subjectEn} maxLength={200} placeholder="Payment failed for {{tenant_name}}" onChange={(e) => set("subjectEn", e.target.value)} /></Field>
            <label className="full"><span>Message (English) *</span><textarea rows={4} value={f.bodyEn} placeholder={"Hi {{owner_name}},\n\nWe could not collect {{amount}} …"} onChange={(e) => set("bodyEn", e.target.value)} />{errs.bodyEn && <small className="hint text-danger">{errs.bodyEn}</small>}</label>
          </>
        )}
        <Check label="Active (dunning and broadcasts can use it)" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} />
      </FormGrid>
    </AdminRecordModal>
  );
}
