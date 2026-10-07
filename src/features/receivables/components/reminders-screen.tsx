"use client";

import {
  BadgeCheck, BadgeDollarSign, BellRing, CheckCheck, ChevronLeft, FileText, Hourglass, Mail, MessageCircle, MessageSquareText, Mic, Paperclip, Pencil, Phone, Plus,
  Search, Send, ShieldCheck, Siren,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { offsetLabel, type ReminderPreview, type ReminderRule, type ReminderTemplate } from "@/shared";
import { cn } from "@/components/ui/cn";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { customerOptions, listCustomers } from "@/features/parties/api";
import { useLookups } from "@/features/settings/use-lookups";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { listReminderRules, listReminderTemplates, previewReminder, setReminderRuleActive, updateReminderRule } from "../api";
import { RuleDrawer, TemplatesDrawer } from "./reminder-drawers";

type Can = { edit: boolean; remove: boolean };
type Chan = "wa" | "sms" | "email";
const CH: Record<Chan, [React.ReactNode, string, "WHATSAPP" | "SMS" | "EMAIL", "sendWhatsapp" | "sendSms" | "sendEmail"]> = {
  wa: [<MessageCircle key="i" />, "WhatsApp", "WHATSAPP", "sendWhatsapp"], sms: [<MessageSquareText key="i" />, "SMS", "SMS", "sendSms"], email: [<Mail key="i" />, "Email", "EMAIL", "sendEmail"],
};
const offTxt = (n: number) => (n === 0 ? "Due" : `${n > 0 ? "+" : "−"}${Math.abs(n)}d`);
const offTone = (n: number) => (n < 0 ? "info" : n === 0 ? "warn" : n < 15 ? "orange" : "danger");
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
/** "09:00" → "9:00 AM". */
const time12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`; };

/**
 * Template app/receivables/reminders (4A-company-plus.html + 9A-company-plus.js §6): the reminder schedule and the live phone
 * preview. Overdue customers, the sent log, the KPIs and sending arrive with invoices and receivables (later phases).
 */
export function RemindersScreen({ can, hasCust }: { can: Can; hasCust: boolean }) {
  const toast = useToast();
  const lookups = useLookups(["DunningLevel", "PaymentReminderRuleAction"]);
  const [rules, setRules] = useState<ReminderRule[] | null>(null);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "ur">("en");
  const [chan, setChan] = useState<Chan>("wa");
  const [cust, setCust] = useState("");
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [ruleEdit, setRuleEdit] = useState<ReminderRule | "new" | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listReminderRules(), listReminderTemplates()])
      .then(([r, t]) => { if (!cancelled) { setRules(r); setTemplates(t); setError(null); setSel((s) => (s && r.some((x) => x.id === s) ? s : r.find((x) => x.offsetDays > 0)?.id ?? r[0]?.id ?? null)); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the reminder setup" }));
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    if (!hasCust) return;
    let cancelled = false;
    Promise.all([customerOptions(), listCustomers({ page: 1, pageSize: 50, sort: "name" })])
      .then(([o, c]) => { if (!cancelled) { setUsers(o.salesReps); setCustomers(c.items.map((x) => ({ id: x.id, name: x.name }))); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [hasCust]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const rule = rules?.find((r) => r.id === sel) ?? null;
  const avail = rule ? (Object.keys(CH) as Chan[]).filter((k) => rule[CH[k][3]]) : [];
  const shown: Chan = rule && !rule[CH[chan][3]] ? avail[0] ?? "wa" : chan;
  useEffect(() => {
    if (!rule) return;
    let cancelled = false;
    previewReminder(rule.template.id, { customerId: cust || null, language: lang, channel: CH[shown][2] })
      .then((p) => !cancelled && setPreview(p)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [rule, cust, lang, shown]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const patch = async (r: ReminderRule, body: Record<string, unknown>, done: string) => {
    setBusy(r.id);
    try { await updateReminderRule(r.id, { ...body, rowVersion: r.rowVersion }); toast(done, { tone: "good", ms: 1800 }); reload(); } catch (e) { toast(apiMessage(e, "Could not change the rule"), { tone: "danger" }); } finally { setBusy(null); }
  };
  const toggleChan = (r: ReminderRule, k: Chan) => {
    const on = !r[CH[k][3]];
    if (!on && avail.length <= 1 && r.action === "MESSAGE" && r.id === sel) { toast("Keep at least one channel on", { tone: "warn", ms: 1800 }); return; }
    if (!on && (["sendWhatsapp", "sendSms", "sendEmail"] as const).filter((c) => r[c]).length <= 1 && r.action === "MESSAGE") { toast("Keep at least one channel on", { tone: "warn", ms: 1800 }); return; }
    if (on) setChan(k);
    void patch(r, { [CH[k][3]]: on }, `${CH[k][1]} ${on ? "on" : "off"} for “${r.name}”`);
  };
  const toggleRule = async (r: ReminderRule, on: boolean) => {
    setBusy(r.id);
    try { await setReminderRuleActive(r.id, on, r.rowVersion); toast(`“${r.name}” ${on ? "enabled" : "paused"}`, { tone: on ? "good" : "info", ms: 1800 }); reload(); } catch (e) { toast(apiMessage(e, "Could not change the rule"), { tone: "danger" }); } finally { setBusy(null); }
  };
  const text = preview?.text ?? "";
  const tpl = rule ? templates.find((t) => t.id === rule.template.id) : undefined;
  const raw = tpl ? (lang === "ur" && tpl.bodyUr ? tpl.bodyUr : tpl.bodyEn) : "";
  /** The message with each filled placeholder highlighted (template `fill` wraps values in <mark>). */
  const body = raw ? raw.split(/(\{\w+\})/).map((part, i) => {
    const k = part.match(/^\{(\w+)\}$/)?.[1];
    return k && preview?.values[k] !== undefined ? (k === "company" ? <span key={i}>{preview.values[k]}</span> : <mark key={i}>{preview.values[k]}</mark>) : <span key={i}>{part}</span>;
  }) : text;
  const rtl = lang === "ur" ? { dir: "rtl" as const, lang: "ur" } : {};
  const v = preview?.values ?? {};
  const company = v.company ?? "";
  const sent = (rules ?? []).reduce((s, r) => s + r.sentCount, 0);

  return (
    <>
      <PageHead
        eyebrow={<><BellRing />Receivables / Payment Reminders</>}
        title="Payment Reminders"
        description="Polite, persistent and automatic. Nudge customers on WhatsApp, SMS and email before and after the due date, in English or Urdu."
        actions={<>
          <span className="tagline">get paid faster</span>
          <button className="btn secondary" type="button" disabled title="AR ageing arrives with receivables"><Hourglass />AR ageing</button>
          <button className="btn primary" type="button" disabled title="Sending starts once invoices exist (Phase 21)"><Send />Send due reminders</button>
        </>}
      />
      <div className="kpi-grid">
        <div className="kpi red"><div className="kpi-top"><span>Overdue receivables</span><span className="icon-well"><Hourglass /></span></div><strong>Rs 0</strong><small>Invoices arrive in Phase 21</small></div>
        <div className="kpi"><div className="kpi-top"><span>Reminders sent</span><span className="icon-well"><Send /></span></div><strong>{sent}</strong><small>{(rules ?? []).filter((r) => r.isActive).length} active rules</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Read rate on WhatsApp</span><span className="icon-well"><CheckCheck /></span></div><strong>—</strong><small>From delivery receipts once sending starts</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Paid within 3 days of reminder</span><span className="icon-well"><BadgeDollarSign /></span></div><strong>—</strong><small>Measured from receipts</small></div>
      </div>
      <div className="split cp-rm-split">
        <div className="panel cp-rm-sched">
          <div className="panel-head"><div><h3>Reminder schedule</h3><p>Runs every morning at {time12(rules?.[0]?.runTime ?? "09:00")}. Click a rule to preview it.</p></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost sm" type="button" onClick={() => setTplOpen(true)}><FileText />Messages</button>
              {can.edit && <button className="btn ghost sm" type="button" onClick={() => setRuleEdit("new")}><Plus />Add rule</button>}
            </div>
          </div>
          <div className="cp-rm-axis"><span>Before due</span><i /><span>Due date</span><i /><span>Overdue</span></div>
          <div className="cp-rules">
            {!rules ? <Skeleton style={{ height: 200 }} /> : rules.length ? rules.map((r, i) => (
              <div key={r.id} className={cn("cp-rule", r.id === sel && "on", !r.isActive && "off")} style={{ ["--i" as string]: i }} tabIndex={0} role="button"
                onClick={() => setSel(r.id)} onKeyDown={(e) => { if (e.key === "Enter") setSel(r.id); }}>
                <span className={cn("cp-rule-off", offTone(r.offsetDays))}>{offTxt(r.offsetDays)}</span>
                <div className="cp-rule-b">
                  <div className="cp-rule-h"><b>{r.name}</b><small>{r.sentCount} sent</small><span className="spacer" />
                    <button type="button" className="icon-btn-sm" aria-label={`Edit ${r.name}`} onClick={(e) => { e.stopPropagation(); setRuleEdit(r); }}><Pencil /></button>
                    <label className="switch" title="Enable rule" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={r.isActive} disabled={!can.edit || busy === r.id} onChange={(e) => void toggleRule(r, e.target.checked)} /><i /></label>
                  </div>
                  <div className="cp-rule-c">
                    {(Object.keys(CH) as Chan[]).map((k) => (
                      <button key={k} type="button" className={cn("cp-chtog", k, r[CH[k][3]] && "on")} title={CH[k][1]} disabled={!can.edit || busy === r.id}
                        onClick={(e) => { e.stopPropagation(); setSel(r.id); toggleChan(r, k); }}>{CH[k][0]}<span>{CH[k][1]}</span></button>
                    ))}
                    <select value={r.template.id} disabled={!can.edit || busy === r.id} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { setSel(r.id); void patch(r, { templateId: e.target.value }, `“${r.name}” now sends ${templates.find((t) => t.id === e.target.value)?.name}`); }}>
                      {templates.filter((t) => t.isActive || t.id === r.template.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  {(r.escalate || r.applyCreditHold) && (
                    <div className="cp-rule-esc"><Siren /><span>{r.escalate && r.escalateTo ? <>Escalate to <b>{r.escalateTo.name}</b></> : null}{r.escalate && r.applyCreditHold ? " and place account on credit hold" : r.applyCreditHold ? "Place account on credit hold" : ""}</span></div>
                  )}
                </div>
              </div>
            )) : <EmptyState title="No reminder rules" description={can.edit ? "Add a rule to start the schedule." : "Rules your team adds appear here."} />}
          </div>
          <div className="cp-rm-guard"><ShieldCheck /><span>Quiet hours 9 PM–9 AM and Fridays 12:30–2:30 PM. Customers who reply <b>PAID</b> are paused for 48h.</span></div>
        </div>

        <div className="panel cp-rm-prev">
          <div className="panel-head"><div><h3>Live preview</h3><p>{rule ? (rule.name === offsetLabel(rule.offsetDays) ? rule.name : `${rule.name} · ${offsetLabel(rule.offsetDays)}`) : "Choose a rule"}</p></div>
            <div className="seg"><button type="button" className={cn(lang === "en" && "active")} onClick={() => setLang("en")}>English</button><button type="button" className={cn(lang === "ur" && "active")} onClick={() => setLang("ur")}>اردو</button></div>
          </div>
          <div className="cp-rm-pctl">
            <div className="seg">{(Object.keys(CH) as Chan[]).map((k) => <button key={k} type="button" className={cn(shown === k && "active")} disabled={!rule?.[CH[k][3]]} onClick={() => setChan(k)}>{CH[k][0]}{CH[k][1]}</button>)}</div>
            <select value={cust} onChange={(e) => setCust(e.target.value)} aria-label="Preview for customer">
              <option value="">Sample customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className={cn("cp-phone", shown)}>
            <div className="cp-ph-notch" />
            <div className="cp-ph-scr">
              {!rule ? null : shown === "wa" ? (
                <>
                  <div className="cp-ph-bar wa"><span className="cp-ph-back"><ChevronLeft /></span><span className="avatar xs lime">{initials(company || "Co")}</span><div><b>{company} <BadgeCheck /></b><small>Business account</small></div><span className="spacer" /><Phone /></div>
                  <div className="cp-ph-chat"><span className="cp-ph-day">Today</span>
                    <div className="cp-bub in cp-pop" {...rtl}>
                      <div className="cp-pdf"><FileText /><div><b>{v.invoice}.pdf</b><small>1 page · PDF{rule.attachStatement ? " · statement attached" : ""}</small></div></div>
                      <p>{body}</p><span className="cp-bub-t">{time12(rule.runTime)} <i className="cp-ticks read"><CheckCheck /></i></span>
                    </div>
                    {rule.escalate && rule.escalateTo && <div className="cp-bub sys">Escalated to {rule.escalateTo.name}{rule.applyCreditHold ? " · credit hold applied" : ""}</div>}
                  </div>
                  <div className="cp-ph-in"><span>Message</span><Mic /></div>
                </>
              ) : shown === "sms" ? (
                <>
                  <div className="cp-ph-bar sms"><span className="cp-ph-back"><ChevronLeft /></span><div className="cp-center-t"><b>{(company || "COMPANY").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 11)}</b><small>Text message</small></div></div>
                  <div className="cp-ph-chat sms"><span className="cp-ph-day">Today {time12(rule.runTime)}</span><div className="cp-bub sms cp-pop" {...rtl}><p>{body}</p></div><small className="cp-sms-n">{preview?.segments ?? 1} SMS segment{(preview?.segments ?? 1) === 1 ? "" : "s"} · {text.length} chars</small></div>
                </>
              ) : (
                <>
                  <div className="cp-ph-bar mail"><span className="cp-ph-back"><ChevronLeft /></span><b>Inbox</b></div>
                  <div className="cp-mail cp-pop">
                    <div className="cp-mail-h"><span className="avatar sm lime">{initials(company || "Co")}</span><div><b>{company}</b><small>to {(v.customer ?? "customer").toLowerCase().replace(/[^a-z]+/g, ".")}@mail.pk</small></div></div>
                    <h5>{preview?.subject ?? (rule.offsetDays < 0 ? "Upcoming payment" : rule.offsetDays === 0 ? "Payment due today" : "Overdue")}</h5>
                    <p {...rtl}>{body}</p><div className="cp-mail-btn">Pay {v.amount} now</div>
                    <div className="cp-pdf"><Paperclip /><div><b>{v.invoice}.pdf</b><small>84 KB</small></div></div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="cp-rm-vars">{(["customer", "invoice", "amount", "due_date"] as const).map((k) => <span key={k}><code>{`{${k}}`}</code>{v[k] ?? ""}</span>)}</div>
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Overdue customers</h3><p>Send a reminder right now with the rule that matches their age</p></div><div className="panel-actions"><button className="btn secondary sm" type="button" disabled title="Sending starts once invoices exist"><Send />Send to all 0</button></div></div>
        <EmptyState icon={<Hourglass />} title="No overdue invoices" description={<>Customers with overdue invoices appear here once sales invoices exist (Phase 21). Meanwhile, see <Link href="/customers">Customers</Link>.</>} />
      </div>
      <div className="panel flush">
        <div className="panel-head"><div><h3>Sent log</h3><p>Delivery receipts from WhatsApp Business API, SMS gateway and email</p></div><div className="panel-actions"><label className="search-field cp-sf"><Search /><input placeholder="Search log…" disabled /></label></div></div>
        <EmptyState icon={<Send />} title="Nothing sent yet" description="Every reminder sent by the schedule or by hand is logged here with its delivery status." />
      </div>

      {ruleEdit && <RuleDrawer key={ruleEdit === "new" ? "new" : ruleEdit.id} rule={ruleEdit === "new" ? null : ruleEdit} templates={templates} users={users} lookups={lookups} can={can}
        onClose={() => setRuleEdit(null)} onSaved={() => { setRuleEdit(null); reload(); }} />}
      {tplOpen && <TemplatesDrawer templates={templates} can={can} onClose={() => setTplOpen(false)} onSaved={reload} />}
    </>
  );
}
