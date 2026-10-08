"use client";

import {
  CircleAlert, CircleCheck, Copy, FileKey, Globe, KeyRound, LogOut, Network, Plus, ScrollText, Shield, ShieldCheck, Smartphone, Timer, Unlock, Upload, UserCog, X,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { AllowedIp, SecuritySettings, SecuritySettingsUpdate } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { PrivacyPanel } from "@/features/platform-ops/components/privacy-panel";
import { addAllowedIp, getSecuritySettings, listAllowedIps, removeAllowedIp, saveSecuritySettings } from "../api";
import { copyText, useLoad } from "./config-ui";

type Form = Omit<SecuritySettingsUpdate, "rowVersion">;
const toForm = (s: SecuritySettings): Form => ({
  ssoProvider: s.ssoProvider as Form["ssoProvider"], samlIdpSsoUrl: s.samlIdpSsoUrl, samlIdpEntityId: s.samlIdpEntityId, samlNameIdFormat: s.samlNameIdFormat as Form["samlNameIdFormat"],
  samlCertFilename: s.samlCertFilename, samlCertExpiresOn: s.samlCertExpiresOn, samlAcsUrl: s.samlAcsUrl, googleDomain: s.googleDomain, googleClientId: s.googleClientId,
  googleAllowedGroups: s.googleAllowedGroups, requireSso: s.requireSso, breakGlassSuperAdmin: s.breakGlassSuperAdmin, mfaEnforcement: s.mfaEnforcement as Form["mfaEnforcement"],
  mfaAllowWebauthn: s.mfaAllowWebauthn, mfaAllowTotp: s.mfaAllowTotp, mfaAllowSms: s.mfaAllowSms, ipAllowlistEnforced: s.ipAllowlistEnforced, pwMinLength: s.pwMinLength,
  pwRequireMixedCase: s.pwRequireMixedCase, pwRequireNumber: s.pwRequireNumber, pwRequireSymbol: s.pwRequireSymbol, pwBlockBreached: s.pwBlockBreached, pwBlockReuse: s.pwBlockReuse,
  pwRotationDays: s.pwRotationDays as Form["pwRotationDays"], lockoutAttempts: s.lockoutAttempts as Form["lockoutAttempts"], lockoutMinutes: s.lockoutMinutes as Form["lockoutMinutes"],
});
const LOCKOUTS = [[5, 15], [10, 30], [3, 60]] as const;
const MFA = [
  ["OPTIONAL", "Optional", "Staff choose for themselves", <Unlock key="u" />],
  ["ADMINS", "Required for admins", "Super Admin and Billing only", <UserCog key="a" />],
  ["EVERYONE", "Required for everyone", "All platform staff, no exceptions", <ShieldCheck key="e" />],
] as const;

/** Template ring() (9B-admin-plus.js): score arc with the number in the middle. */
function Ring({ score }: { score: number }) {
  const size = 84, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const t = score >= 75 ? "good" : score >= 50 ? "warn" : "danger";
  return (
    <span className={`ap-ring ${t}`} style={{ ["--sz" as string]: `${size}px` }}>
      <svg viewBox={`0 0 ${size} ${size}`}><circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="trk" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="arc" strokeDasharray={c.toFixed(2)} style={{ ["--c" as string]: c.toFixed(2), ["--off" as string]: (c * (1 - score / 100)).toFixed(2) }} /></svg>
      <b>{score}</b>
    </span>
  );
}

/**
 * Super Admin › System › Security & Privacy (template admin/security, 3A-admin-plus.html:131 + 9B-admin-plus.js 1788+).
 * Enforced now on the Super Admin sign-in: the IP allow-list, lockout and password policy. SSO and two-factor are stored
 * and switch on with Phase 29. Admin sessions have no backing table yet; privacy requests: PrivacyPanel (Phase 43).
 */
export function SecurityScreen() {
  const toast = useToast();
  const settings = useLoad(getSecuritySettings, "Could not load the security settings");
  const ips = useLoad(listAllowedIps, "Could not load the allow-list");
  const s = settings.data;
  const [form, setForm] = useState<Form | null>(null);
  const [shown, setShown] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pem, setPem] = useState<string | undefined>(undefined);
  const [cidr, setCidr] = useState("");
  const [label, setLabel] = useState("");
  const [ipErr, setIpErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const key = s ? String(s.rowVersion) : "";
  if (s && key !== shown) { setShown(key); setForm(toForm(s)); setErrs({}); setPem(undefined); }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form || !s) return;
    setBusy(true);
    setErrs({});
    try {
      await saveSecuritySettings({ ...form, ...(pem !== undefined && { samlCertPem: pem }), rowVersion: s.rowVersion });
      toast("Security policies saved", { tone: "good" });
      settings.reload();
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the policies"), { tone: "danger", ms: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const addIp = async () => {
    const v = cidr.trim();
    if (!v) { setIpErr("Enter a CIDR range"); return; }
    setBusy(true);
    try {
      const r = await addAllowedIp({ cidr: v, label: label.trim() || null });
      toast(`${r.cidr} added to the allow-list`, { tone: "good" });
      setCidr(""); setLabel(""); setIpErr("");
      ips.reload(); settings.reload();
    } catch (e) {
      setIpErr(adminFieldErrors(e).cidr ?? adminErrorMessage(e, "Could not add the range"));
    } finally {
      setBusy(false);
    }
  };
  const removeIp = async (r: AllowedIp) => {
    setBusy(true);
    try {
      await removeAllowedIp(r.id);
      toast(`${r.cidr} removed`, { tone: "warn" });
      ips.reload(); settings.reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not remove the range"), { tone: "danger", ms: 7000 });
    } finally {
      setBusy(false);
    }
  };
  const readPem = async (file: File | undefined) => {
    if (!file) return;
    const text = (await file.text()).trim();
    if (!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(text)) { toast("Choose a PEM certificate (-----BEGIN CERTIFICATE-----)", { tone: "warn" }); return; }
    setPem(text);
    set("samlCertFilename", file.name);
    toast(`${file.name} ready · press Save policies`, { tone: "info" });
  };

  if (settings.error) return <><Head busy onSave={save} /><ErrorState message={settings.error.message} reference={settings.error.reference} onRetry={settings.reload} /></>;
  if (!s || !form) return <><Head busy onSave={save} /><div className="panel"><Skeleton style={{ height: 200 }} /></div></>;

  const ranges = ips.data ?? [];
  const active = ranges.filter((r) => r.isActive);
  // Score from what is really configured (template: console security score).
  const checks = [
    { ok: form.ssoProvider !== "NONE", warn: false, label: form.ssoProvider === "NONE" ? "SSO not set up" : `SSO configured (${form.ssoProvider === "SAML" ? "SAML" : "Google"})`, icon: <ShieldCheck /> },
    { ok: form.mfaEnforcement !== "OPTIONAL", warn: true, label: form.mfaEnforcement === "OPTIONAL" ? "2FA optional" : "2FA required (from Phase 29)", icon: <Smartphone /> },
    { ok: form.ipAllowlistEnforced && active.length > 0, warn: true, label: form.ipAllowlistEnforced ? "IP allow-list on" : "IP allow-list off", icon: <Network /> },
    { ok: form.pwBlockBreached, warn: true, label: form.pwBlockBreached ? "Breached-password check" : "Breached passwords allowed", icon: <KeyRound /> },
    { ok: form.lockoutAttempts <= 5, warn: true, label: `Lock after ${form.lockoutAttempts} failed sign-ins`, icon: <Timer /> },
  ];
  const score = Math.round(40 + checks.filter((c) => c.ok).length * 12);
  const strength = Math.max(1, Math.min(5, Math.round((form.pwMinLength >= 14 ? 2 : form.pwMinLength >= 12 ? 1.5 : form.pwMinLength >= 10 ? 1 : 0.4)
    + (form.pwRequireMixedCase ? 0.6 : 0) + (form.pwRequireNumber ? 0.4 : 0) + (form.pwRequireSymbol ? 0.5 : 0) + (form.pwBlockBreached ? 1.2 : 0) + (form.pwBlockReuse ? 0.3 : 0))));
  const lockKey = `${form.lockoutAttempts}-${form.lockoutMinutes}`;
  const enforceRisk = form.ipAllowlistEnforced && active.length > 0 && !s.callerIpAllowed;

  return (
    <>
      <Head busy={busy} onSave={save} />
      <div className="panel ap-secscore">
        <Ring score={score} />
        <div className="ap-secscore-t"><small>Console security score</small><b>{score >= 85 ? "Strong" : score >= 65 ? "Good" : "Needs attention"} · {score} / 100</b>
          <p>From the policies below. SSO and two-factor are stored now and enforced once MFA arrives (Phase 29).</p></div>
        <div className="ap-seclist">{checks.map((c) => <span key={c.label} className={`ap-secitem ${c.ok ? "good" : c.warn ? "warn" : "danger"}`}>{c.icon}{c.label}</span>)}</div>
      </div>

      <div className="grid-2">
        <div className="panel ap-sso">
          <div className="panel-head"><div><h3>Single sign-on</h3><p>Staff sign in through your identity provider</p></div>
            <div className="panel-actions">{form.ssoProvider === "NONE" ? <span className="badge neutral">Not set up</span> : <span className="badge info dot">Stored · live with Phase 29</span>}</div></div>
          <div className="seg ap-mb">
            <button type="button" className={form.ssoProvider === "NONE" ? "active" : undefined} onClick={() => set("ssoProvider", "NONE")}>Off</button>
            <button type="button" className={form.ssoProvider === "SAML" ? "active" : undefined} onClick={() => set("ssoProvider", "SAML")}><Shield />SAML 2.0</button>
            <button type="button" className={form.ssoProvider === "GOOGLE" ? "active" : undefined} onClick={() => set("ssoProvider", "GOOGLE")}><Globe />Google Workspace</button>
          </div>
          {form.ssoProvider === "SAML" && (
            <div>
              <div className="form-grid">
                <Field label="IdP SSO URL" full required error={errs.samlIdpSsoUrl}><input value={form.samlIdpSsoUrl ?? ""} placeholder="https://company.okta.com/app/…/sso/saml" onChange={(e) => set("samlIdpSsoUrl", e.target.value || null)} /></Field>
                <Field label="IdP entity ID" required error={errs.samlIdpEntityId}><input value={form.samlIdpEntityId ?? ""} onChange={(e) => set("samlIdpEntityId", e.target.value || null)} /></Field>
                <Field label="Name ID format"><select value={form.samlNameIdFormat} onChange={(e) => set("samlNameIdFormat", e.target.value as Form["samlNameIdFormat"])}>
                  <option value="EMAIL">Email address</option><option value="PERSISTENT">Persistent</option></select></Field>
              </div>
              <div className="ap-cert"><span className="icon-tile"><FileKey /></span>
                <div><b>{form.samlCertFilename ?? "No certificate"}</b><small>{pem ? "New certificate · saved with the policies" : form.samlCertExpiresOn ? `X.509 · expires ${form.samlCertExpiresOn}` : "X.509 · PEM"}</small></div>
                <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()}><Upload />{form.samlCertFilename ? "Replace" : "Upload"}</button>
                <input ref={fileRef} type="file" accept=".pem,.crt,.cer" hidden onChange={(e) => void readPem(e.target.files?.[0])} />
              </div>
              <div className="form-grid">
                <Field label="Certificate expires" error={errs.samlCertExpiresOn}><input type="date" value={form.samlCertExpiresOn ?? ""} onChange={(e) => set("samlCertExpiresOn", e.target.value || null)} /></Field>
                <Field label="ACS URL" error={errs.samlAcsUrl}><input value={form.samlAcsUrl ?? ""} placeholder="https://console.example.com/sso/acs" onChange={(e) => set("samlAcsUrl", e.target.value || null)} /></Field>
              </div>
              {form.samlAcsUrl && <div className="ap-copyrow"><small>ACS URL</small><code className="code">{form.samlAcsUrl}</code>
                <button type="button" className="icon-btn-sm" aria-label="Copy" onClick={async () => toast((await copyText(form.samlAcsUrl!)) ? "ACS URL copied" : "Could not copy", { tone: "info" })}><Copy /></button></div>}
            </div>
          )}
          {form.ssoProvider === "GOOGLE" && (
            <div className="form-grid">
              <Field label="Workspace domain" required error={errs.googleDomain}><input value={form.googleDomain ?? ""} placeholder="example.com" onChange={(e) => set("googleDomain", e.target.value || null)} /></Field>
              <Field label="OAuth client ID" required error={errs.googleClientId}><input value={form.googleClientId ?? ""} onChange={(e) => set("googleClientId", e.target.value || null)} /></Field>
              <Field label="Allowed groups" full error={errs.googleAllowedGroups}><input value={form.googleAllowedGroups ?? ""} placeholder="platform-team@example.com" onChange={(e) => set("googleAllowedGroups", e.target.value || null)} /></Field>
            </div>
          )}
          <div className="ap-switches">
            <label className="switch"><input type="checkbox" checked={form.requireSso} onChange={(e) => set("requireSso", e.target.checked)} /><i /><span>Require SSO for all staff</span></label>
            <label className="switch"><input type="checkbox" checked={form.breakGlassSuperAdmin} onChange={(e) => set("breakGlassSuperAdmin", e.target.checked)} /><i /><span>Break-glass password login for Super Admin only</span></label>
          </div>
          <div className="form-actions ap-mt"><button type="button" className="btn secondary" disabled title="SSO sign-in turns on with Phase 29"><Shield />Test connection</button></div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>Two-factor enforcement</h3><p>Applies at next sign-in · turns on with MFA (Phase 29)</p></div></div>
          <div className="radio-cards ap-col">
            {MFA.map(([code, b, sub, icon]) => (
              <label key={code} className="radio-card"><input type="radio" name="tfa" checked={form.mfaEnforcement === code} onChange={() => set("mfaEnforcement", code)} />
                <span className="icon-well">{icon}</span><div><b>{b}</b><small>{sub}</small></div></label>
            ))}
          </div>
          <div className="ap-lbl ap-mt">Allowed methods</div>
          <div className="ap-methods">
            <label className="check"><input type="checkbox" checked={form.mfaAllowWebauthn} onChange={(e) => set("mfaAllowWebauthn", e.target.checked)} /> Hardware key (WebAuthn)</label>
            <label className="check"><input type="checkbox" checked={form.mfaAllowTotp} onChange={(e) => set("mfaAllowTotp", e.target.checked)} /> Authenticator app</label>
            <label className="check"><input type="checkbox" checked={form.mfaAllowSms} onChange={(e) => set("mfaAllowSms", e.target.checked)} /> SMS OTP <span className="badge warn">SIM-swap risk</span></label>
          </div>
          {errs.mfaAllowTotp && <small className="hint text-danger" role="alert">{errs.mfaAllowTotp}</small>}
          <div className="ap-cov"><div className="row"><b>Enrolment</b><span className="spacer" /><small>Tracked once MFA is live</small></div><div className="ap-bar"><i style={{ ["--w" as string]: "0%" }} /></div></div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><div><h3>IP allow-list</h3><p>Console access only from these networks</p></div>
            <div className="panel-actions"><label className="switch"><input type="checkbox" checked={form.ipAllowlistEnforced} onChange={(e) => set("ipAllowlistEnforced", e.target.checked)} /><i /><span>Enforce</span></label></div></div>
          <div className="ap-ipadd">
            <input value={cidr} placeholder="CIDR, e.g. 182.180.0.0/16" autoComplete="off" spellCheck={false} className={ipErr ? "ap-invalid" : undefined}
              onChange={(e) => { setCidr(e.target.value); setIpErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addIp(); } }} />
            <input value={label} placeholder="Label (optional)" maxLength={60} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addIp(); } }} />
            <button type="button" className="btn primary" disabled={busy} onClick={addIp}><Plus />Add</button>
          </div>
          <small className="ap-iperr">{ipErr}</small>
          <div className="ap-ips">
            {ranges.map((r) => (
              <span key={r.id} className={cn("ap-ip", !r.isActive && "ap-dim")}><Network /><code>{r.cidr}</code><small>{r.label}</small>
                <button type="button" aria-label={`Remove ${r.cidr}`} disabled={busy} onClick={() => void removeIp(r)}><X /></button></span>
            ))}
            {ranges.length === 0 && <small className="muted">No ranges yet. Add your office or VPN network first, then enforce.</small>}
          </div>
          {s.callerIpAllowed ? (
            <div className="banner good ap-mt ap-bn-sm"><CircleCheck /><div><b>Your IP {s.callerIp} is allowed</b><p>Matched “{s.callerMatch}”. You will not be locked out.</p></div></div>
          ) : (
            <div className={cn("banner ap-mt ap-bn-sm", enforceRisk ? "danger" : "info")}><CircleAlert /><div><b>Your IP {s.callerIp ?? "(unknown)"} is not on the list</b>
              <p>{form.ipAllowlistEnforced ? "Add it before enforcing: saving would be refused, so you can't lock yourself out." : "Add it before you turn on Enforce."}</p></div>
              {s.callerIp && <button type="button" className="btn sm secondary" onClick={() => { setCidr(`${s.callerIp}/32`); setLabel("My network"); }}>Use my IP</button>}</div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>Password policy</h3><p>Used for the Super Admin password (break-glass) and tenant-side owner accounts</p></div></div>
          <div className="ap-range-row"><span>Minimum length</span><input type="range" min={8} max={24} value={form.pwMinLength} onChange={(e) => set("pwMinLength", Number(e.target.value))} /><b>{form.pwMinLength}</b></div>
          <div className="ap-pwgrid">
            {([["pwRequireMixedCase", "Upper & lower case"], ["pwRequireNumber", "At least one number"], ["pwRequireSymbol", "At least one symbol"], ["pwBlockBreached", "Block breached passwords"], ["pwBlockReuse", "Block reusing the current password"]] as const).map(([k, l]) => (
              <label key={k} className="switch"><input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} /><i /><span>{l}</span></label>
            ))}
          </div>
          <div className="form-grid ap-mt">
            <Field label="Rotate every"><select value={form.pwRotationDays ?? ""} onChange={(e) => set("pwRotationDays", e.target.value ? (Number(e.target.value) as 90 | 180) : null)}>
              <option value="">Never (NIST)</option><option value="90">90 days</option><option value="180">180 days</option></select></Field>
            <Field label="Lock after failed attempts"><select value={lockKey} onChange={(e) => { const [a, m] = e.target.value.split("-").map(Number); setForm((f) => (f ? { ...f, lockoutAttempts: a as Form["lockoutAttempts"], lockoutMinutes: m as Form["lockoutMinutes"] } : f)); }}>
              {!LOCKOUTS.some(([a, m]) => `${a}-${m}` === lockKey) && <option value={lockKey}>{form.lockoutAttempts} attempts · {form.lockoutMinutes} min</option>}
              {LOCKOUTS.map(([a, m]) => <option key={`${a}-${m}`} value={`${a}-${m}`}>{a} attempts · {m === 60 ? "1 h" : `${m} min`}</option>)}
            </select></Field>
          </div>
          <div className="ap-pwstr"><div className="row"><small>Policy strength</small><span className="spacer" /><b>{["", "Weak", "Fair", "Good", "Strong", "Excellent"][strength]}</b></div>
            <div className="ap-segbar">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < strength ? `l${strength}` : undefined} />)}</div></div>
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Admin sessions</h3><p>Signed-in console sessions across all staff</p></div>
          <div className="panel-actions"><button type="button" className="btn danger sm" disabled title="Console sessions are not tracked yet"><LogOut />Revoke all others</button></div></div>
        <EmptyState icon={<ScrollText />} title="Sessions are not tracked yet" description="The console uses a signed cookie with no session table; per-device sessions and revoke arrive with platform staff sign-in." />
      </div>
      <PrivacyPanel />{/* Phase 43 */}
      {enforceRisk && <Banner tone="danger" title="Enforcing would lock you out">Your IP is outside the active ranges; the save will be refused until you add it.</Banner>}
    </>
  );
}

function Head({ busy, onSave }: { busy: boolean; onSave: () => void }) {
  return (
    <PageHead eyebrow="System / Security & Privacy" title="Security & Privacy" description="Console sign-in, two-factor, network allow-lists, sessions and tenant data requests."
      actions={<>
        <Link className="btn secondary" href="/admin/audit"><ScrollText />Audit log</Link>
        <button type="button" className="btn primary" disabled={busy} onClick={onSave}><ShieldCheck />{busy ? "Saving…" : "Save policies"}</button>
      </>} />
  );
}
