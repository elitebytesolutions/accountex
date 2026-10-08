"use client";

import {
  ArrowLeft, ArrowRight, Check, CircleCheck, CircleDashed, Eye, EyeOff, Info, KeyRound, Lock, PanelRightOpen, Rocket, Save, TriangleAlert, X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TenantOnboardSchema, type CoaTemplate, type SubscriptionPlan, type TenantOnboardResult } from "@/shared";
import { cn } from "@/components/ui/cn";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { listPlans } from "@/features/platform-catalogue/api";
import { activePlans } from "@/features/platform-catalogue/components/catalogue-ui";
import { listCoaTemplates } from "@/features/platform-templates/api";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { onboardTenant } from "../api";
import { MODULES, moduleLabel, rs } from "./tenant-ui";

const STEPS = ["Company & Legal", "Plan & Modules", "Admin User", "Configuration", "Review & Provision"];
type W = {
  displayName: string; legalName: string; ntn: string; strn: string; secpRegNo: string; industry: string; city: string; province: string; address: string;
  phone: string; email: string; code: string;
  planId: string; billingCycle: "MONTHLY" | "ANNUAL"; startTrial: boolean; modules: string[];
  adminName: string; adminEmail: string; adminPassword: string; adminPasswordConfirm: string; adminDesignation: string; adminMobile: string; adminCnic: string; adminLanguage: "EN" | "UR";
  fiscalYearStartMonth: 7 | 1 | 4; timezone: string; numberFormat: "SOUTH_ASIAN" | "WESTERN"; dateFormat: string; dataResidency: "PK_LAHORE" | "AE_DUBAI"; coaTemplateId: string;
  seedTaxCodes: boolean; seedHrLists: boolean;
};
/** Phase 42: the wizard's values, for pre-filling (lead conversion). */
export type OnboardWizardValues = W;
const BLANK: W = {
  displayName: "", legalName: "", ntn: "", strn: "", secpRegNo: "", industry: "", city: "", province: "", address: "", phone: "", email: "", code: "",
  planId: "", billingCycle: "MONTHLY", startTrial: true, modules: [],
  adminName: "", adminEmail: "", adminPassword: "", adminPasswordConfirm: "", adminDesignation: "", adminMobile: "", adminCnic: "", adminLanguage: "EN",
  fiscalYearStartMonth: 7, timezone: "Asia/Karachi", numberFormat: "SOUTH_ASIAN", dateFormat: "DD MMM YYYY", dataResidency: "PK_LAHORE", coaTemplateId: "",
  seedTaxCodes: true, seedHrLists: true,
};
/** Which step owns a field (client and server errors jump there). */
const STEP_OF: Record<string, number> = {
  displayName: 0, legalName: 0, ntn: 0, strn: 0, secpRegNo: 0, industry: 0, city: 0, province: 0, address: 0, phone: 0, email: 0, code: 0,
  planId: 1, billingCycle: 1, startTrial: 1, modules: 1,
  adminName: 2, adminEmail: 2, adminPassword: 2, adminPasswordConfirm: 2, adminDesignation: 2, adminMobile: 2, adminCnic: 2, adminLanguage: 2,
  fiscalYearStartMonth: 3, timezone: 3, numberFormat: 3, dateFormat: 3, dataResidency: 3, coaTemplateId: 3, seedTaxCodes: 3, seedHrLists: 3,
};
const DRAFT_KEY = "ax-onboard-draft";
const CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Gujranwala", "Sialkot", "Peshawar", "Quetta", "Hyderabad", "Sukkur"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FY_LABEL: Record<number, string> = { 7: "July (Pakistan tax year)", 1: "January", 4: "April" };
const VOUCHER_TYPES: [string, string][] = [["Journal voucher", "JV"], ["Cash payment voucher", "CPV"], ["Cash receipt voucher", "CRV"], ["Bank payment voucher", "BPV"], ["Bank receipt voucher", "BRV"]];

/** The first fiscal year a company starting today gets for a start month. */
function firstFiscalYear(month: number) {
  const now = new Date();
  const y = now.getMonth() + 1 >= month ? now.getFullYear() : now.getFullYear() - 1;
  const start = new Date(y, month - 1, 1), end = new Date(y + (month === 1 ? 0 : 1), month - 1, 0);
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `FY ${month === 1 ? y : `${y}-${String(y + 1).slice(2)}`} (${d(start)} – ${d(end)})`;
}
const passwordScore = (p: string) => [p.length >= 10, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p), p.length >= 14].filter(Boolean).length;
const bodyOf = (w: W) => ({ ...w, coaTemplateId: w.coaTemplateId || null, industry: w.industry || null, province: w.province || null });
const omitPasswords = (w: W) => ({ ...w, adminPassword: "", adminPasswordConfirm: "" });

/**
 * Admin › Tenants › Onboard Tenant (template 30-entry-admin.html 190–408, wizardGo in 99-app.js): five steps, then
 * POST /api/admin/tenants provisions the company in one transaction (Platform.provisionTenant → status, owner contact,
 * modules, subscription, seed lists). The Admin User step adds Password + confirm (template-style, plan Q40-2).
 */
export function OnboardWizard({ initial, submit, eyebrow }: {
  /** Phase 42: pre-filled values (converting a lead). */
  initial?: Partial<W>;
  /** Phase 42: replaces POST /api/admin/tenants (e.g. POST /api/admin/leads/:id/convert, which onboards and links the lead). */
  submit?: (body: ReturnType<typeof bodyOf>) => Promise<TenantOnboardResult>;
  eyebrow?: string;
} = {}) {
  const toast = useToast();
  const lookups = useAdminLookups(["TenantIndustry", "Province"]);
  const [w, setW] = useState<W>(() => ({ ...BLANK, ...initial }));
  const [step, setStep] = useState(0);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [coa, setCoa] = useState<CoaTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TenantOnboardResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPlans(), listCoaTemplates()])
      .then(([p, c]) => {
        if (cancelled) return;
        const usable = c.filter((t) => t.status === "DEFAULT" || t.status === "PUBLISHED");
        setPlans(activePlans(p));
        setCoa(usable);
        setLoadError(null);
        setW((x) => (x.coaTemplateId ? x : { ...x, coaTemplateId: usable.find((t) => t.status === "DEFAULT")?.id ?? "" }));
      })
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load plans and templates" }));
    return () => { cancelled = true; };
  }, [attempt]);

  // offer a saved draft once (passwords are never stored)
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch { /* storage blocked */ }
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as Partial<W>;
      toast(`A saved draft for ${draft.displayName || "a new company"} is available`, { tone: "info", ms: 8000, action: { label: "Restore", onClick: () => setW((x) => ({ ...x, ...draft, adminPassword: "", adminPasswordConfirm: "" })) } });
    } catch { /* ignore a broken draft */ }
  }, [toast]);

  const set = <K extends keyof W>(k: K, v: W[K]) => { setErrs((e) => (k in e ? Object.fromEntries(Object.entries(e).filter(([f]) => f !== k)) : e)); setW((x) => ({ ...x, [k]: v })); };
  const plan = plans?.find((p) => p.id === w.planId);
  const inclusion = (key: string) => plan?.features.find((f) => f.moduleKey === key);
  const choosePlan = (p: SubscriptionPlan) => {
    set("planId", p.id);
    setW((x) => ({ ...x, planId: p.id, modules: p.features.filter((f) => f.inclusion === "INCLUDED").map((f) => f.moduleKey) }));
  };
  const toggleModule = (key: string, on: boolean) => setW((x) => ({ ...x, modules: on ? [...new Set([...x.modules, key])] : x.modules.filter((m) => m !== key) }));

  const body = () => bodyOf(w);
  /** Client check with the shared schema: errors of steps up to `upTo`. */
  const check = (upTo: number) => {
    const r = TenantOnboardSchema.safeParse(body());
    const e: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) { const f = String(i.path[0] ?? ""); if ((STEP_OF[f] ?? 4) <= upTo && !e[f]) e[f] = i.message; }
    setErrs(e);
    const first = Math.min(...Object.keys(e).map((f) => STEP_OF[f] ?? 4));
    if (Object.keys(e).length && first < step) setStep(first);
    return Object.keys(e).length === 0;
  };
  const go = (to: number) => { if (to > step && !check(Math.min(to - 1, 3))) { toast("Fix the highlighted fields first", { tone: "warn" }); return; } setStep(Math.max(0, Math.min(4, to))); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const provision = async () => {
    if (!check(3)) { toast("Fix the highlighted fields first", { tone: "warn" }); return; }
    setBusy(true);
    try {
      const r = await (submit ?? onboardTenant)(body());
      setResult(r);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
      toast(`${r.tenant.displayName} provisioned · ${r.tenant.code.toUpperCase()} can sign in now`, { tone: "good" });
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        const fields = Object.fromEntries(Object.entries(e.details).map(([f, m]) => [f, m[0] ?? ""]));
        setErrs(fields);
        const first = Math.min(...Object.keys(fields).map((f) => STEP_OF[f] ?? 4));
        if (first < 4) setStep(first);
      } else if (e instanceof ApiError && /code|subdomain/i.test(e.message) && e.status === 409) {
        setErrs({ code: e.message }); setStep(0);
      }
      toast(adminErrorMessage(e, "Could not provision the company"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  const saveDraft = () => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(omitPasswords(w))); toast("Draft saved on this browser (passwords are not saved)", { tone: "good" }); }
    catch { toast("Could not save the draft in this browser", { tone: "warn" }); }
  };

  const e = (k: string) => (errs[k] ? <small className="hint text-danger" role="alert">{errs[k]}</small> : null);
  const inp = (k: keyof W, label: string, o: { req?: boolean; ph?: string; type?: string; full?: boolean; max?: number } = {}) => (
    <label className={cn(o.full && "full")}>
      <span>{label}{o.req && " *"}</span>
      <input type={o.type ?? "text"} value={String(w[k])} placeholder={o.ph} maxLength={o.max} aria-invalid={!!errs[k]} onChange={(ev) => set(k, ev.target.value as W[typeof k])} />
      {e(k)}
    </label>
  );
  const code = w.code.trim().toLowerCase();
  const codeOk = /^[a-z][a-z0-9]{3,9}$/.test(code);
  const score = passwordScore(w.adminPassword);
  const coaName = coa?.find((t) => t.id === w.coaTemplateId);
  const priceLine = (p: SubscriptionPlan) => (p.isCustomPrice ? "Custom" : w.billingCycle === "ANNUAL" && p.priceAnnual !== null ? `${rs(p.priceAnnual)} / year` : `${rs(p.priceMonthly)} / month`);
  const included = plan ? plan.features.filter((f) => f.inclusion === "INCLUDED").map((f) => moduleLabel(f.moduleKey)) : [];

  const moduleList = (group: "finance" | "hr") => (
    <div className="list">
      {MODULES.filter((m) => m.group === group).map((m) => {
        const f = inclusion(m.key);
        const locked = !plan || !f || f.inclusion === "NOT_AVAILABLE";
        const on = w.modules.includes(m.key);
        return (
          <div key={m.key} className="list-item">
            <span className="icon-well"><m.icon /></span>
            <div><b>{m.label}</b><small>{m.sub}{f?.inclusion === "ADDON" ? ` · add-on${f.addonPrice !== null ? ` ${rs(f.addonPrice)}` : ""}` : ""}</small></div>
            <span className="spacer" />
            {locked && plan && <span className="badge violet"><Lock />Upgrade</span>}
            <label className="switch"><input type="checkbox" checked={on} disabled={locked || m.key === "ACC"} aria-label={m.label} onChange={(ev) => toggleModule(m.key, ev.target.checked)} /><i /></label>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <PageHead eyebrow={eyebrow ?? "Tenants / Onboard Tenant"} title="Onboard a new tenant" description="Create the organisation, choose a plan, set up the first admin and provision an isolated workspace."
        actions={<>
          <button type="button" className="btn secondary" onClick={saveDraft} disabled={!!result}><Save />Save draft</button>
          <Link className="btn ghost" href="/admin/tenants"><X />Cancel</Link>
        </>} />
      {loadError && <ErrorState message={loadError.message} reference={loadError.reference} onRetry={() => { setLoadError(null); setAttempt((n) => n + 1); }} />}

      <div className="wizard" data-step={step}>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={cn(i === step && "active", i < step && "done")} onClick={() => !result && go(i)}>
              <b>{i < step ? <Check style={{ width: 15, height: 15 }} /> : i + 1}</b><span>{s}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="wz-pane active">
            <div className="split">
              <div className="panel">
                <div className="form-section"><h4>Company identity</h4><p>As registered with SECP and FBR.</p></div>
                <div className="form-grid">
                  {inp("displayName", "Display name", { req: true, ph: "e.g. Al-Noor Enterprises", max: 120 })}
                  {inp("legalName", "Legal name", { req: true, ph: "e.g. Al-Noor Enterprises (Pvt) Ltd", max: 200 })}
                  {inp("ntn", "NTN", { ph: "1234567-8" })}
                  {inp("strn", "STRN", { max: 20 })}
                  {inp("secpRegNo", "SECP registration #", { max: 30 })}
                  <label><span>Industry</span><select value={w.industry} onChange={(ev) => set("industry", ev.target.value)}><option value="">Choose…</option>{(lookups.TenantIndustry ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>{e("industry")}</label>
                  <label><span>Country</span><select value="PK" disabled><option value="PK">Pakistan</option></select></label>
                  <label><span>Province</span><select value={w.province} onChange={(ev) => set("province", ev.target.value)}><option value="">Choose…</option>{(lookups.Province ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>{e("province")}</label>
                  <label><span>City</span><input list="ax-cities" value={w.city} maxLength={60} onChange={(ev) => set("city", ev.target.value)} />{e("city")}</label>
                  <datalist id="ax-cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
                  <label className="full"><span>Registered address</span><textarea rows={2} value={w.address} maxLength={300} onChange={(ev) => set("address", ev.target.value)} />{e("address")}</label>
                  {inp("phone", "Phone", { ph: "+92 42 3587 4410", max: 30 })}
                  {inp("email", "Company email", { type: "email", ph: "accounts@company.pk" })}
                </div>
                <div className="form-section mt"><h4>Workspace address</h4><p>Company code is permanent and used for sign-in and the subdomain.</p></div>
                <div className="form-grid">
                  <label><span>Company code *</span><input value={w.code} maxLength={10} style={{ textTransform: "uppercase", fontWeight: 600 }} aria-invalid={!!errs.code} onChange={(ev) => set("code", ev.target.value.replace(/\s/g, ""))} />{errs.code ? e("code") : <small className="muted">4–10 letters or digits, starting with a letter; unique across Accountex</small>}</label>
                  <label><span>Subdomain preview</span><input readOnly value={code ? `${code}.accountex.pk` : ""} />{code && <small style={{ color: codeOk ? "var(--primary)" : "var(--danger)" }}>{codeOk ? "✓ Valid format · uniqueness is checked when provisioning" : "Not a valid code yet"}</small>}</label>
                </div>
              </div>
              <div className="stack">
                <div className="panel">
                  <div className="panel-head"><div><h3>Tax registration</h3><p>Format check (FBR Active Taxpayer List lookup is not connected)</p></div></div>
                  <div className="list">
                    {([["NTN", w.ntn, /^\d{7}-?\d$/], ["STRN", w.strn, /^[\d-]{6,20}$/]] as const).map(([l, v, re]) => (
                      <div key={l} className="list-item">
                        <span className="icon-well">{v ? (re.test(v.trim()) ? <CircleCheck /> : <TriangleAlert />) : <CircleDashed />}</span>
                        <div><b>{l} {v || "—"}</b><small>{l === "NTN" ? "Income tax" : "Sales tax"}</small></div><span className="spacer" />
                        <span className={cn("badge", !v ? "neutral" : re.test(v.trim()) ? "good" : "warn")}>{!v ? "Not given" : re.test(v.trim()) ? "Format OK" : "Check format"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="banner info"><Info /><div><b>Tip</b><p>Branches can be added by the company admin after provisioning; a head office is created automatically.</p></div></div>
              </div>
            </div>
            <div className="form-actions"><Link className="btn secondary" href="/admin/tenants">Cancel</Link><button type="button" className="btn primary" onClick={() => go(1)}>Continue<ArrowRight /></button></div>
          </div>
        )}

        {step === 1 && (
          <div className="wz-pane active">
            <div className="form-section"><h4>Choose a plan</h4><p>Prices exclude provincial sales tax on services. Billed monthly or annually.</p></div>
            {!plans ? <Skeleton style={{ height: 180 }} /> : plans.length === 0 ? <p className="muted">No active plans. Create one in Plans &amp; Pricing first.</p> : (
              <div className="grid-4 mb">
                {plans.map((p) => {
                  const on = p.id === w.planId;
                  return (
                    <div key={p.id} className={cn("plan-card", on && "featured")}>
                      {on && <span className="badge good">Selected</span>}
                      <h3>{p.name}</h3>
                      <strong className="price">{p.isCustomPrice ? "Custom" : <>{rs(p.priceMonthly)}<small>/mo</small></>}</strong>
                      <p className="small muted">{p.userSeats ? `Up to ${p.userSeats} users` : "Unlimited users"}{p.storageGb ? ` · ${p.storageGb} GB` : ""}</p>
                      <ul className="small">{p.features.filter((f) => f.inclusion === "INCLUDED").sort((x, y) => MODULES.findIndex((m) => m.key === x.moduleKey) - MODULES.findIndex((m) => m.key === y.moduleKey)).slice(0, 4).map((f) => <li key={f.moduleKey}>{moduleLabel(f.moduleKey)}</li>)}</ul>
                      <button type="button" className={cn("btn sm", on ? "primary" : "secondary")} onClick={() => choosePlan(p)}>{on ? <><Check />Selected</> : "Select"}</button>
                    </div>
                  );
                })}
              </div>
            )}
            {e("planId")}
            <div className="grid-2">
              <div className="panel">
                <div className="panel-head"><div><h3>Finance modules</h3><p>{plan ? `Included in ${plan.name} unless marked add-on` : "Choose a plan to see what it includes"}</p></div></div>
                {moduleList("finance")}
              </div>
              <div className="panel">
                <div className="panel-head"><div><h3>HR modules</h3><p>Payroll, attendance and self-service</p></div></div>
                {moduleList("hr")}
                <div className="form-grid mt">
                  <label><span>Billing cycle</span><select value={w.billingCycle} onChange={(ev) => set("billingCycle", ev.target.value as W["billingCycle"])}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual{plan?.priceAnnual ? ` (save ${rs(plan.priceMonthly * 12 - plan.priceAnnual)})` : ""}</option></select></label>
                  <label><span>Start with trial</span><select value={w.startTrial ? "1" : "0"} onChange={(ev) => set("startTrial", ev.target.value === "1")}><option value="0">No — bill immediately</option><option value="1">{plan ? `${plan.trialDays}-day trial` : "Trial (plan's trial days)"}</option></select></label>
                </div>
              </div>
            </div>
            <div className="form-actions"><button type="button" className="btn secondary" onClick={() => go(0)}><ArrowLeft />Back</button><button type="button" className="btn primary" onClick={() => go(2)}>Continue<ArrowRight /></button></div>
          </div>
        )}

        {step === 2 && (
          <div className="wz-pane active">
            <div className="split">
              <div className="panel">
                <div className="form-section"><h4>First administrator</h4><p>This person becomes the company&apos;s default user: every role, always active, and can invite others.</p></div>
                <div className="form-grid">
                  {inp("adminName", "Full name", { req: true, max: 120 })}
                  {inp("adminDesignation", "Designation", { max: 80 })}
                  {inp("adminEmail", "Work email", { req: true, type: "email" })}
                  {inp("adminMobile", "Mobile", { ph: "+92 300 1234567", max: 30 })}
                  {inp("adminCnic", "CNIC", { ph: "35202-1234567-1" })}
                  <label><span>Language</span><select value={w.adminLanguage} onChange={(ev) => set("adminLanguage", ev.target.value as W["adminLanguage"])}><option value="EN">English</option><option value="UR">Urdu</option></select></label>
                </div>
                <div className="form-section mt"><h4>Password</h4><p>At least 10 characters with letters and numbers. Share it with the admin securely.</p></div>
                <div className="form-grid">
                  <label><span>Password *</span>
                    <div className="row" style={{ gap: 6 }}>
                      <input type={showPw ? "text" : "password"} autoComplete="new-password" value={w.adminPassword} aria-invalid={!!errs.adminPassword} onChange={(ev) => set("adminPassword", ev.target.value)} style={{ flex: 1 }} />
                      <button type="button" className="icon-btn-sm" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw(!showPw)}>{showPw ? <EyeOff /> : <Eye />}</button>
                    </div>
                    {errs.adminPassword ? e("adminPassword") : w.adminPassword && <div className="ap-pwstr" data-s={score}><div className="ap-bar thin"><i style={{ ["--w" as string]: `${(score / 5) * 100}%` }} /></div><small className="muted">{["Too weak", "Weak", "Fair", "Good", "Strong", "Very strong"][score]}</small></div>}
                  </label>
                  <label><span>Confirm password *</span><input type={showPw ? "text" : "password"} autoComplete="new-password" value={w.adminPasswordConfirm} aria-invalid={!!errs.adminPasswordConfirm} onChange={(ev) => set("adminPasswordConfirm", ev.target.value)} />{e("adminPasswordConfirm")}</label>
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><div><h3>Sign-in preview</h3><p>What the admin uses on the sign-in page</p></div></div>
                <div className="paper" style={{ padding: 18 }}>
                  <div className="row"><span className="brandmark"><KeyRound /></span><b>Accountex</b></div>
                  <h3 className="mt">Welcome to Accountex, {w.adminName.split(" ")[0] || "…"}</h3>
                  <p className="small">The workspace for <b>{w.legalName || "your company"}</b> is ready. Sign in with company code <b>{code.toUpperCase() || "CODE"}</b>, <b>{w.adminEmail || "your email"}</b> and the password you were given.</p>
                  <p className="small muted mt">No email is sent by provisioning: pass these details on yourself.</p>
                </div>
              </div>
            </div>
            <div className="form-actions"><button type="button" className="btn secondary" onClick={() => go(1)}><ArrowLeft />Back</button><button type="button" className="btn primary" onClick={() => go(3)}>Continue<ArrowRight /></button></div>
          </div>
        )}

        {step === 3 && (
          <div className="wz-pane active">
            <div className="grid-2">
              <div className="panel">
                <div className="form-section"><h4>Financial setup</h4><p>Defaults for the company&apos;s books.</p></div>
                <div className="form-grid">
                  <label><span>Fiscal year starts</span><select value={w.fiscalYearStartMonth} onChange={(ev) => set("fiscalYearStartMonth", Number(ev.target.value) as W["fiscalYearStartMonth"])}>{[7, 1, 4].map((m) => <option key={m} value={m}>{FY_LABEL[m]}</option>)}</select></label>
                  <label><span>First fiscal year</span><input readOnly value={firstFiscalYear(w.fiscalYearStartMonth)} /></label>
                  <label><span>Base currency</span><select disabled value="PKR"><option value="PKR">PKR — Pakistani Rupee</option></select></label>
                  <label><span>Timezone</span><select value={w.timezone} onChange={(ev) => set("timezone", ev.target.value)}><option value="Asia/Karachi">Asia/Karachi (PKT, UTC+05:00)</option><option value="Asia/Dubai">Asia/Dubai (GST, UTC+04:00)</option></select></label>
                  <label><span>Number format</span><select value={w.numberFormat} onChange={(ev) => set("numberFormat", ev.target.value as W["numberFormat"])}><option value="SOUTH_ASIAN">12,45,000.00 (South Asian)</option><option value="WESTERN">1,245,000.00 (Western)</option></select></label>
                  <label><span>Date format</span><select value={w.dateFormat} onChange={(ev) => set("dateFormat", ev.target.value)}><option>DD MMM YYYY</option><option>DD/MM/YYYY</option></select></label>
                  <label className="full"><span>Chart of accounts template</span>
                    <select value={w.coaTemplateId} onChange={(ev) => set("coaTemplateId", ev.target.value)}>
                      <option value="">None — start with the base chart</option>
                      {(coa ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} — {t.accountCount} accounts{t.status === "DEFAULT" ? " (default)" : ""}</option>)}
                    </select>{e("coaTemplateId")}
                  </label>
                  <label className="full"><span>Data residency</span><select value={w.dataResidency} onChange={(ev) => set("dataResidency", ev.target.value as W["dataResidency"])}><option value="PK_LAHORE">Pakistan — Lahore region (primary) + Karachi DR</option><option value="AE_DUBAI">UAE — Dubai region</option></select></label>
                </div>
                <div className="stack mt">
                  <label className="check"><input type="checkbox" checked={w.seedTaxCodes} onChange={(ev) => set("seedTaxCodes", ev.target.checked)} /> Seed Pakistani tax codes from the Tax Master (sales tax, withholding)</label>
                  <label className="check"><input type="checkbox" checked={w.seedHrLists} onChange={(ev) => set("seedHrLists", ev.target.checked)} /> Seed leave types &amp; salary components</label>
                </div>
              </div>
              <div className="panel flush">
                <div className="panel-head"><div><h3>Workspace defaults</h3><p>Created for every company at provisioning</p></div></div>
                <div className="table-wrap"><table className="tbl">
                  <thead><tr><th>Document</th><th>Prefix</th></tr></thead>
                  <tbody>{VOUCHER_TYPES.map(([d, p]) => <tr key={p}><td>{d}</td><td><b>{p}</b></td></tr>)}</tbody>
                </table></div>
                <div style={{ padding: "12px 18px" }} className="muted small">Also: head office branch, the first fiscal year ({MONTHS[w.fiscalYearStartMonth - 1]} start), system roles and the default user holding every role.</div>
              </div>
            </div>
            <div className="form-actions"><button type="button" className="btn secondary" onClick={() => go(2)}><ArrowLeft />Back</button><button type="button" className="btn primary" onClick={() => go(4)}>Review<ArrowRight /></button></div>
          </div>
        )}

        {step === 4 && (
          <div className="wz-pane active">
            <div className="split">
              <div className="panel">
                <div className="panel-head"><div><h3>Review</h3><p>{result ? "Provisioned with these details" : "Check everything before provisioning"}</p></div></div>
                <div className="dl">
                  <div><span>Legal name</span><b>{w.legalName || "—"}</b></div>
                  <div><span>Company code / URL</span><b>{code.toUpperCase() || "—"} · {code || "…"}.accountex.pk</b></div>
                  <div><span>NTN / STRN</span><b>{w.ntn || "—"} · {w.strn || "—"}</b></div>
                  <div><span>Industry / City</span><b>{w.industry ? labelOf(lookups, "TenantIndustry", w.industry) : "—"} · {w.city || "—"}</b></div>
                  <div><span>Plan</span><b>{plan ? `${plan.name} — ${w.billingCycle === "ANNUAL" ? "Annual" : "Monthly"} · ${priceLine(plan)}${w.startTrial ? ` · ${plan.trialDays}-day trial` : ""}` : "—"}</b></div>
                  <div><span>Modules</span><b>{w.modules.length ? w.modules.map(moduleLabel).join(", ") : included.join(", ") || "—"}</b></div>
                  <div><span>Company admin</span><b>{w.adminName || "—"} · {w.adminEmail || "—"}</b></div>
                  <div><span>Fiscal year</span><b>{MONTHS[w.fiscalYearStartMonth - 1]} start · {firstFiscalYear(w.fiscalYearStartMonth)}</b></div>
                  <div><span>Currency / Timezone</span><b>PKR · {w.timezone}</b></div>
                  <div><span>COA template</span><b>{coaName ? `${coaName.name} — ${coaName.accountCount} accounts` : "None"}</b></div>
                  <div><span>Seed lists</span><b>{[w.seedTaxCodes && "Tax codes", w.seedHrLists && "Leave types & salary components"].filter(Boolean).join(", ") || "None"}</b></div>
                  <div><span>Data residency</span><b>{w.dataResidency === "PK_LAHORE" ? "Pakistan — Lahore + Karachi DR" : "UAE — Dubai"}</b></div>
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><div><h3>Provisioning checklist</h3><p>{result ? `Done · seed version ${result.seeds.seedVersion ?? "—"}` : "Company setup runs in one transaction; seed lists are copied right after"}</p></div></div>
                <div className="timeline">
                  {(result ? result.steps : [
                    "Check the company code, plan and COA template", "Provision the company, system roles and default user", "Set the fiscal year and company details",
                    "Add the owner contact and enable modules", "Start the subscription or trial", "Copy the seed lists (tax codes, leave types, salary components)",
                  ]).map((s, i) => <div key={i} className="tl-item"><span className={cn("tl-dot", result && "good")} /><div><b>{s}</b></div></div>)}
                </div>
                {result && (
                  <>
                    <div className="dl ap-mt">
                      <div><span>Tax codes copied</span><b>{result.seeds.taxCodes}</b></div>
                      <div><span>Leave types copied</span><b>{result.seeds.leaveTypes}</b></div>
                      <div><span>Salary components copied</span><b>{result.seeds.salaryComponents}</b></div>
                    </div>
                    {result.seeds.skipped.length > 0 && (
                      <div className="banner warn ap-mt"><TriangleAlert /><div><b>{result.seeds.skipped.length} seed rows skipped</b>
                        <p>{result.seeds.skipped.slice(0, 6).map((s) => `${s.list}: ${s.name} (${s.reason})`).join(" · ")}{result.seeds.skipped.length > 6 ? " …" : ""}</p></div></div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="form-actions">
              {!result && <button type="button" className="btn secondary" onClick={() => go(3)}><ArrowLeft />Back</button>}
              {result ? (
                <>
                  <button type="button" className="btn secondary" onClick={() => { setResult(null); setW(BLANK); setStep(0); }}>Onboard another</button>
                  <Link className="btn primary" href={`/admin/tenants/${result.tenant.id}`}><PanelRightOpen />Open Tenant 360</Link>
                </>
              ) : (
                <button type="button" className="btn primary" disabled={busy || !plans} onClick={provision}>{busy ? <><span className="ap-spin" />Provisioning…</> : <><Rocket />Provision tenant</>}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
