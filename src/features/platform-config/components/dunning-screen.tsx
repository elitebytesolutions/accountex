"use client";

import { AlarmClock, BadgeCheck, CalendarClock, Check, Clock, History, Mail, MessageCircle, MessageSquareText, PartyPopper, Percent, Plus, ReceiptText, RefreshCw, Save, ShieldCheck, Sparkles, Trash2, Zap } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { DUNNING_OFFSETS, RETRY_METHOD_LABELS, RETRY_METHODS, type DunningPolicy, type DunningPolicyCreate, type RetryStep } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { activateDunningPolicy, createDunningPolicy, deleteDunningPolicy, listDunningPolicies, updateDunningPolicy } from "../api";
import { useLoad } from "./config-ui";

type Form = Omit<DunningPolicyCreate, "retrySchedule"> & { retrySchedule: RetryStep[] };
const MAX = 60;
const LIM = { grace: [1, 20], ro: [0, 20], sus: [5, 40] } as const;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** A new policy starts from the template's defaults (7 / 7 / 31, salary days 1 and 10, the template retry plan). */
const DEFAULTS = (): Form => ({
  name: "Standard policy", graceDays: 7, readOnlyDays: 7, suspendedDays: 31, archiveDays: 90, retryHour: 10, salaryRetryDays: [1, 10],
  retrySchedule: [
    { day: 1, method: "ORIGINAL", label: "Smart retry · 10:00" },
    { day: 3, method: "JAZZCASH", label: "Fallback to wallet" },
    { day: 5, method: "RAAST", label: "Raast request-to-pay" },
    { day: 7, method: "ORIGINAL", label: "Final retry before read-only" },
  ],
  emailEnabled: true, emailOffsets: [-3, 0, 3, 7, 14], smsEnabled: true, smsOffsets: [0, 1, 7], whatsappEnabled: false, whatsappOffsets: [0, 3],
  effectiveFrom: today(),
});
const toForm = (p: DunningPolicy): Form => ({
  name: p.name, graceDays: p.graceDays, readOnlyDays: p.readOnlyDays, suspendedDays: p.suspendedDays, archiveDays: p.archiveDays, retryHour: p.retryHour,
  salaryRetryDays: p.salaryRetryDays, retrySchedule: p.retrySchedule, emailEnabled: p.emailEnabled, emailOffsets: p.emailOffsets, smsEnabled: p.smsEnabled,
  smsOffsets: p.smsOffsets, whatsappEnabled: p.whatsappEnabled, whatsappOffsets: p.whatsappOffsets, effectiveFrom: p.effectiveFrom,
});

const CHANNELS = [
  { key: "email", name: "Email", icon: <Mail />, tile: "", en: "Your Accountex invoice INV-… of Rs 28,999 is unpaid. Pay in one tap →", ur: "آپ کی اکاؤنٹیکس انوائس 28,999 روپے واجب الادا ہے۔ ایک کلک میں ادائیگی کریں ←" },
  { key: "sms", name: "SMS", icon: <MessageSquareText />, tile: "blue", en: "Accountex: Rs 28,999 due. Pay via JazzCash/Easypaisa from the link in your account.", ur: "اکاؤنٹیکس: 28,999 روپے واجب الادا۔ جاز کیش/ایزی پیسہ سے ادا کریں۔" },
  { key: "whatsapp", name: "WhatsApp", icon: <MessageCircle />, tile: "lime", en: "Assalam-o-Alaikum! Your Accountex payment of Rs 28,999 is pending. Reply PAY for a Raast link.", ur: "السلام علیکم! آپ کی اکاؤنٹیکس ادائیگی 28,999 روپے زیر التوا ہے۔ راست لنک کے لیے PAY لکھیں۔" },
] as const;
const dayLabel = (d: number) => `D${d < 0 ? "−" + Math.abs(d) : d === 0 ? "0" : "+" + d}`;

/**
 * Super Admin › Billing › Dunning & Collections (template admin/dunning, 3A-admin-plus.html:61 + 9B-admin-plus.js 1004+).
 * Phase 38 builds the "Dunning policy" and "Reminder channels" panels (saved with Save policy) and, template-style,
 * the retry schedule and salary-day rows. KPIs, the collections queue and promises to pay come with dunning cases (Phase 41).
 */
export function DunningScreen() {
  const toast = useToast();
  const { data: policies, error, reload } = useLoad(listDunningPolicies, "Could not load dunning policies");
  const [selId, setSelId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [base, setBase] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<"en" | "ur">("en");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState(false);
  const [history, setHistory] = useState(false);

  const sel = policies?.find((p) => p.id === selId) ?? policies?.find((p) => p.isActive) ?? policies?.[0] ?? null;
  // Load the chosen policy into the form when it (or its saved version) changes.
  const loadedKey = sel ? `${sel.id}:${sel.rowVersion}` : policies ? "new" : "";
  const [shownKey, setShownKey] = useState("");
  if (loadedKey && loadedKey !== shownKey) {
    const f = sel ? toForm(sel) : DEFAULTS();
    setShownKey(loadedKey);
    setForm(f);
    setBase(JSON.stringify(f));
    setErrs({});
  }
  const dirty = form !== null && JSON.stringify(form) !== base;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    try {
      const p = sel ? await updateDunningPolicy(sel.id, { ...form, rowVersion: sel.rowVersion }) : await createDunningPolicy(form);
      toast(`Policy saved · ${p.graceDays} d grace → ${p.readOnlyDays} d read-only → suspend`, { tone: "good" });
      setSelId(p.id);
      reload();
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the policy"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const createNew = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const p = await createDunningPolicy({ ...form, name: newName.trim() || "New policy" });
      toast(`“${p.name}” created${p.isActive ? " and active" : " · activate it when ready"}`, { tone: "good" });
      setNewOpen(false);
      setSelId(p.id);
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not create the policy"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const p = await activateDunningPolicy(sel.id, sel.rowVersion);
      toast(`“${p.name}” is now the active policy`, { tone: "good" });
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not activate the policy"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      await deleteDunningPolicy(sel.id, sel.rowVersion);
      toast(`“${sel.name}” deleted`, { tone: "warn" });
      setRemoving(false);
      setSelId(null);
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not delete the policy"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead eyebrow="Billing / Dunning & Collections" title="Dunning & Collections"
        description="Failed payments, smart retries across JazzCash, Easypaisa, Raast and cards, and the grace to read-only to suspend policy."
        actions={<>
          <button type="button" className="btn secondary" disabled title="Platform invoices arrive with billing (Phase 41)"><ReceiptText />Platform invoices</button>
          <button type="button" className="btn primary" disabled title="Dunning cases arrive with billing (Phase 41)"><RefreshCw />Retry all due</button>
        </>} />

      <div className="kpi-grid">
        <Kpi label="Recovered this month" icon={<BadgeCheck />} />
        <Kpi label="Recovery rate" icon={<Percent />} tone="teal" />
        <Kpi label="In dunning" icon={<AlarmClock />} tone="yellow" />
        <Kpi label="Churn saved" icon={<ShieldCheck />} tone="violet" />
      </div>

      <div className="split ap-dun-split">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Collections queue</h3><p>Click a row to see its retry plan</p></div></div>
          <EmptyState icon={<PartyPopper />} title="No failed payments yet" description="Tenants whose payments fail appear here once platform billing and dunning cases go live (Phase 41)." />
        </div>
        <div className="panel ap-rt-panel">
          <div className="panel-head"><div><h3>Retry plan</h3><p>{form ? `${form.retrySchedule.length} scheduled retries · ${String(form.retryHour).padStart(2, "0")}:00 PKT` : "Loading…"}</p></div></div>
          <div className="ap-rt">
            {form?.retrySchedule.map((s, i) => (
              <div key={i} className="ap-rt-step next" style={{ ["--i" as string]: i }}>
                <span className="ap-rt-dot"><Clock /></span>
                <div><b>Day {s.day} · {s.label}</b><small><Zap />{RETRY_METHOD_LABELS[s.method]} · scheduled</small></div>
              </div>
            ))}
          </div>
          <div className="ap-insight"><Sparkles /><div><b>Smart retry</b>
            <p>Retries land at {form ? String(form.retryHour).padStart(2, "0") : "10"}:00 on salary-credit days ({form?.salaryRetryDays.length ? form.salaryRetryDays.map((d) => ordinal(d)).join(" and ") : "none set"}). Edit the steps in <b>Retry schedule</b> below.</p></div></div>
        </div>
      </div>

      {error && <ErrorState message={error.message} reference={error.reference} onRetry={reload} />}
      {!form ? (
        <div className="grid-2 ap-dun-bottom"><div className="panel"><Skeleton style={{ height: 160 }} /></div><div className="panel"><Skeleton style={{ height: 160 }} /></div></div>
      ) : (
        <>
          <div className="grid-2 ap-dun-bottom">
            <div className="panel">
              <div className="panel-head">
                <div><h3>Dunning policy</h3><p>Drag the handles or type days. Applies to new failures.</p></div>
                <div className="panel-actions">
                  <button type="button" className="btn primary sm" data-pol-save disabled={busy || (!!sel && !dirty)} onClick={save}><Save />{busy ? "Saving…" : sel ? "Save policy" : "Create policy"}</button>
                </div>
              </div>
              <PolicyTrack form={form} onChange={(g, r, s) => setForm((f) => (f ? { ...f, graceDays: g, readOnlyDays: r, suspendedDays: s } : f))} />
              <div className="form-grid c3 ap-mt">
                <DayInput label="Grace (days)" value={form.graceDays} lim={LIM.grace} onChange={(v) => set("graceDays", v)} error={errs.graceDays} />
                <DayInput label="Read-only (days)" value={form.readOnlyDays} lim={LIM.ro} onChange={(v) => set("readOnlyDays", v)} error={errs.readOnlyDays} />
                <DayInput label="Suspended before cancel" value={form.suspendedDays} lim={LIM.sus} onChange={(v) => set("suspendedDays", v)} error={errs.suspendedDays} />
              </div>
              <p className="ap-pol-say">
                <b>Day 1–{form.graceDays}</b> full access with reminders · {form.readOnlyDays > 0 && <><b>Day {form.graceDays + 1}–{form.graceDays + form.readOnlyDays}</b> read-only (view &amp; export only) · </>}
                <b>Day {form.graceDays + form.readOnlyDays + 1}</b> suspended · <b>Day {form.graceDays + form.readOnlyDays + form.suspendedDays + 1}</b> cancelled, data archived for {form.archiveDays} days.
              </p>
            </div>
            <div className="panel">
              <div className="panel-head">
                <div><h3>Reminder channels</h3><p>Who hears what, and when. Times in PKT.</p></div>
                <div className="panel-actions"><div className="seg">
                  <button type="button" className={lang === "en" ? "active" : undefined} onClick={() => setLang("en")}>English</button>
                  <button type="button" className={lang === "ur" ? "active" : undefined} onClick={() => setLang("ur")}>اردو</button>
                </div></div>
              </div>
              <div className="ap-chan">
                {CHANNELS.map((c) => {
                  const on = form[`${c.key}Enabled`];
                  const offs = form[`${c.key}Offsets`];
                  return (
                    <div key={c.key} className={cn("ap-chan-row", on && "on")}>
                      <span className={cn("icon-tile", c.tile)}>{c.icon}</span>
                      <div className="ap-chan-main">
                        <div className="row"><b>{c.name}</b><span className="spacer" />
                          <label className="switch"><input type="checkbox" checked={on} onChange={(e) => set(`${c.key}Enabled`, e.target.checked)} aria-label={`${c.name} reminders`} /><i /></label>
                        </div>
                        <p dir={lang === "ur" ? "rtl" : "ltr"} className={lang === "ur" ? "ap-ur" : undefined}>{c[lang]}</p>
                        <div className="ap-chipsel ap-days">
                          {DUNNING_OFFSETS.map((d) => (
                            <button key={d} type="button" className={offs.includes(d) ? "on" : undefined}
                              onClick={() => set(`${c.key}Offsets`, offs.includes(d) ? offs.filter((x) => x !== d) : [...offs, d].sort((a, b) => a - b))}>{dayLabel(d)}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Template-style addition: the retry schedule, salary days and the policy list (no template form exists). */}
          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <div><h3>Retry schedule</h3><p>Each retry runs at the retry hour on its day after the failure. Days must increase and fall before the cancel day.</p></div>
                <div className="panel-actions">
                  <button type="button" className="btn secondary sm" disabled={form.retrySchedule.length >= 10}
                    onClick={() => set("retrySchedule", [...form.retrySchedule, { day: (form.retrySchedule.at(-1)?.day ?? 0) + 1, method: "ORIGINAL", label: "Smart retry" }])}><Plus />Retry</button>
                </div>
              </div>
              {errs.retrySchedule && <p className="hint text-danger" role="alert">{errs.retrySchedule}</p>}
              {form.retrySchedule.length === 0 ? <p className="muted small">No automatic retries: only reminders are sent.</p> : (
                <div className="table-wrap" style={{ marginBottom: 16 }}><table className="tbl">
                  <thead><tr><th style={{ width: 90 }}>Day</th><th>Method</th><th>Step</th><th /></tr></thead>
                  <tbody>
                    {form.retrySchedule.map((s, i) => {
                      const upd = (patch: Partial<RetryStep>) => set("retrySchedule", form.retrySchedule.map((x, k) => (k === i ? { ...x, ...patch } : x)));
                      return (
                        <tr key={i}>
                          <td><input type="number" min={0} max={80} value={s.day} aria-label="Day" onChange={(e) => upd({ day: Number(e.target.value) })} /></td>
                          <td><select value={s.method} aria-label="Method" onChange={(e) => upd({ method: e.target.value as RetryStep["method"] })}>
                            {RETRY_METHODS.map((m) => <option key={m} value={m}>{RETRY_METHOD_LABELS[m]}</option>)}
                          </select></td>
                          <td><input value={s.label} maxLength={60} aria-label="Step" onChange={(e) => upd({ label: e.target.value })} /></td>
                          <td className="actions"><button type="button" className="icon-btn-sm" aria-label="Remove retry" onClick={() => set("retrySchedule", form.retrySchedule.filter((_, k) => k !== i))}><Trash2 /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
              <FormGrid>
                <Field label="Retry hour (PKT)" error={errs.retryHour}>
                  <select value={form.retryHour} onChange={(e) => set("retryHour", Number(e.target.value))}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </Field>
                <Field label="Archive after cancel (days)" error={errs.archiveDays}>
                  <input type="number" min={1} max={3650} value={form.archiveDays} onChange={(e) => set("archiveDays", Number(e.target.value))} />
                </Field>
              </FormGrid>
              <div className="ap-lbl ap-mt">Salary-credit retry days</div>
              <div className="ap-chipsel">
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <button key={d} type="button" className={form.salaryRetryDays.includes(d) ? "on" : undefined}
                    onClick={() => set("salaryRetryDays", form.salaryRetryDays.includes(d) ? form.salaryRetryDays.filter((x) => x !== d) : [...form.salaryRetryDays, d].sort((a, b) => a - b))}>{d}</button>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <div><h3>Policies</h3><p>One policy is active; dunning cases follow it.</p></div>
                <div className="panel-actions"><button type="button" className="btn secondary sm" disabled={!sel} onClick={() => { setNewName(""); setNewOpen(true); }}><Plus />New policy</button></div>
              </div>
              <div className="list">
                {(policies ?? []).map((p) => (
                  <button key={p.id} type="button" className={cn("list-item", p.id === sel?.id && "active")} onClick={() => setSelId(p.id)} style={{ width: "100%", textAlign: "left", borderTop: 0, borderLeft: 0, borderRight: 0, font: "inherit", cursor: "pointer", paddingInline: 10, background: p.id === sel?.id ? "var(--surface-2)" : "transparent", borderRadius: p.id === sel?.id ? 12 : 0 }}>
                    <span className="icon-well"><CalendarClock /></span>
                    <div><b>{p.name}</b><small>{p.graceDays} / {p.readOnlyDays} / {p.suspendedDays} days · from {p.effectiveFrom}{p.casesCount ? ` · ${p.casesCount} cases` : ""}</small></div>
                    <span className="spacer" />
                    {p.isActive ? <span className="badge good dot">Active</span> : <span className="badge neutral">Inactive</span>}
                  </button>
                ))}
                {policies?.length === 0 && <p className="muted small">No policy yet. Set the panels and press <b>Create policy</b>: the first policy becomes active.</p>}
              </div>
              <FormGrid>
                <Field label="Name" required error={errs.name}><input value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} /></Field>
                <Field label="Effective from" error={errs.effectiveFrom}><input type="date" value={form.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} /></Field>
              </FormGrid>
              {sel && (
                <div className="form-actions ap-mt">
                  <button type="button" className="btn ghost" onClick={() => setHistory(true)}><History />History</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => setRemoving(true)}><Trash2 />Delete</button>
                  <span className="spacer" />
                  {!sel.isActive && <button type="button" className="btn secondary" disabled={busy || dirty} title={dirty ? "Save your changes first" : undefined} onClick={activate}><Check />Activate</button>}
                  {dirty && <button type="button" className="btn ghost" onClick={() => { setForm(JSON.parse(base) as Form); setErrs({}); }}>Discard</button>}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New dunning policy" subtitle="Starts from the values on screen and stays inactive until you activate it."
        foot={<><button type="button" className="btn secondary" onClick={() => setNewOpen(false)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={createNew}><Plus />Create policy</button></>}>
        <FormGrid cols={1}><Field label="Name" required><input value={newName} maxLength={80} autoFocus placeholder="e.g. Ramzan grace policy" onChange={(e) => setNewName(e.target.value)} /></Field></FormGrid>
      </Modal>
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} onConfirm={remove} busy={busy} danger confirmLabel="Delete" title={`Delete “${sel?.name ?? ""}”?`}>
        Only an inactive policy that no dunning case follows can be deleted.
      </ConfirmDialog>
      <Modal open={history && !!sel} onClose={() => setHistory(false)} title={`${sel?.name ?? ""} · history`} wide>
        {sel && <AdminHistoryTab table="DunningPolicies" id={sel.id} reloadKey={sel.rowVersion} />}
      </Modal>
    </>
  );
}

const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;

function Kpi({ label, icon, tone }: { label: string; icon: ReactNode; tone?: string }) {
  return (
    <div className={cn("kpi", tone)}>
      <div className="kpi-top"><span>{label}</span><span className="icon-well">{icon}</span></div>
      <strong>—</strong><small>With dunning cases (Phase 41)</small>
    </div>
  );
}

function DayInput({ label, value, lim, onChange, error }: { label: string; value: number; lim: readonly [number, number]; onChange: (v: number) => void; error?: string }) {
  return (
    <Field label={label} error={error}>
      <input type="number" min={lim[0]} max={lim[1]} value={value} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) onChange(clamp(v, lim[0], lim[1])); }} />
    </Field>
  );
}

/** Template policy builder (.ap-pol): grace / read-only / suspended / cancel track with draggable, keyboard-movable handles. */
function PolicyTrack({ form, onChange }: { form: Form; onChange: (g: number, r: number, s: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<"grace" | "ro" | "sus" | null>(null);
  const g = form.graceDays, r = form.readOnlyDays, s = form.suspendedDays;
  const pct = (d: number) => (Math.min(d, MAX) / MAX) * 100;
  const segs = [
    { cls: "g", label: "Grace", left: 0, width: pct(g) },
    { cls: "r", label: "Read-only", left: pct(g), width: pct(g + r) - pct(g) },
    { cls: "s", label: "Suspended", left: pct(g + r), width: pct(g + r + s) - pct(g + r) },
    { cls: "c", label: "Cancel", left: pct(g + r + s), width: 100 - pct(g + r + s) },
  ];

  const moveTo = (h: "grace" | "ro" | "sus", day: number) => {
    if (h === "grace") onChange(clamp(day, ...LIM.grace), r, s);
    if (h === "ro") onChange(g, clamp(day - g, ...LIM.ro), s);
    if (h === "sus") onChange(g, r, clamp(day - g - r, ...LIM.sus));
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag || !track.current) return;
    const box = track.current.getBoundingClientRect();
    moveTo(drag, Math.round(clamp((e.clientX - box.left) / box.width, 0, 1) * MAX));
  };
  useEffect(() => {
    if (!drag) return;
    const up = () => setDrag(null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [drag]);
  const handles = [["grace", g, "Grace end"], ["ro", g + r, "Read-only end"], ["sus", g + r + s, "Suspension end"]] as const;

  return (
    <div className="ap-pol" onPointerMove={onMove}>
      <div className="ap-pol-track" ref={track}>
        {segs.map((x) => <div key={x.cls} className={`ap-pol-seg ${x.cls}`} style={{ left: `${x.left}%`, width: `${x.width}%` }}><span>{x.label}</span></div>)}
        {handles.map(([k, day, label]) => (
          <button key={k} type="button" className={cn("ap-pol-h", drag === k && "drag")} aria-label={label} data-d={`Day ${day}`} style={{ left: `${pct(day)}%` }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(k); }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const dv = e.key === "ArrowRight" ? 1 : -1;
              if (k === "grace") onChange(clamp(g + dv, ...LIM.grace), r, s);
              if (k === "ro") onChange(g, clamp(r + dv, ...LIM.ro), s);
              if (k === "sus") onChange(g, r, clamp(s + dv, ...LIM.sus));
            }} />
        ))}
      </div>
      <div className="ap-pol-axis">{[0, 10, 20, 30, 40, 50, 60].map((d) => <span key={d} style={{ left: `${(d / 60) * 100}%` }}>{d}</span>)}</div>
    </div>
  );
}
