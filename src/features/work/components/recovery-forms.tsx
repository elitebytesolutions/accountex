"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Info, KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { SignInTokenInfo } from "@/shared";
import { Field, FormGrid } from "@/components/ui/form";
import { Banner, Skeleton } from "@/components/ui/states";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { forgotPassword, setPasswordWithToken, tokenInfo } from "../api";

/** Template login/forgot (30-entry-admin.html), right column: company code + work email → reset request. */
export function ForgotForm() {
  const [f, setF] = useState({ companyCode: "", email: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    setError(null);
    try {
      await forgotPassword(f.companyCode.trim(), f.email.trim());
      setSent(true);
    } catch (err) {
      setErrs(apiFieldErrors(err));
      setError(apiMessage(err, "Could not send the request"));
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <div>
        <Link className="link small" href="/login"><ArrowLeft />Back to sign in</Link>
        <span className="icon-well" style={{ marginTop: 24 }}><MailCheck /></span>
        <h2 style={{ marginTop: 14 }}>Request received</h2>
        <p className="muted">If {f.email} has an account at {f.companyCode}, your company administrator has been told and can send you a one-time link to choose a new password. Links are valid for 24 hours and work once.</p>
        <Link className="btn primary lg" href="/login" style={{ width: "100%", justifyContent: "center", marginTop: 18 }}>Back to sign in<ArrowRight /></Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate>
      <Link className="link small" href="/login"><ArrowLeft />Back to sign in</Link>
      <h2 style={{ marginTop: 18 }}>Forgot your password?</h2>
      <p className="muted">Enter your company code and work email. We&apos;ll ask your administrator to send you a reset link.</p>
      <FormGrid cols={1}>
        <Field label="Company code" required error={errs.companyCode}><input value={f.companyCode} autoComplete="organization" onChange={(e) => setF({ ...f, companyCode: e.target.value })} /></Field>
        <Field label="Work email" required error={errs.email}><input type="email" value={f.email} autoComplete="email" onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </FormGrid>
      {error && <div className="mt"><Banner tone="danger" title="Couldn't send the request">{error}</Banner></div>}
      <button type="submit" className="btn primary lg" disabled={busy || !f.companyCode || !f.email} style={{ width: "100%", justifyContent: "center", marginTop: 18 }}>
        {busy ? "Sending…" : "Send reset link"}<ArrowRight />
      </button>
      <div className="banner info mt"><Info /><div><b>Don&apos;t know your company code?</b><p>It&apos;s in the invitation your administrator sent, or ask them for it.</p></div></div>
      <p className="small muted mt">Remembered it? <Link className="link" href="/login">Sign in</Link></p>
    </form>
  );
}

/** The page a one-time link opens (invite or reset): no template, built in the auth-page style. */
export function ResetForm({ token }: { token: string }) {
  const NONE: SignInTokenInfo = { valid: false, purpose: null, email: null, fullName: null, companyName: null, companyCode: null };
  const [info, setInfo] = useState<SignInTokenInfo | null>(token ? null : NONE);
  const [f, setF] = useState({ password: "", confirm: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ companyCode: string; email: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    tokenInfo(token).then((i) => !cancelled && setInfo(i)).catch(() => !cancelled && setInfo({ valid: false, purpose: null, email: null, fullName: null, companyName: null, companyCode: null }));
    return () => { cancelled = true; };
  }, [token]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) { setErrs({ confirm: "The passwords don't match" }); return; }
    setBusy(true);
    setErrs({});
    setError(null);
    try {
      setDone(await setPasswordWithToken(token, f.password));
    } catch (err) {
      setErrs(apiFieldErrors(err));
      setError(apiMessage(err, "Could not set the password"));
    } finally {
      setBusy(false);
    }
  };
  if (!info) return <Skeleton style={{ height: 280 }} />;
  if (done) {
    return (
      <div>
        <span className="icon-well"><ShieldCheck /></span>
        <h2 style={{ marginTop: 14 }}>{info.purpose === "INVITE" ? "You're all set" : "Password changed"}</h2>
        <p className="muted">Sign in to <b>{info.companyName ?? done.companyCode}</b> with company code <b>{done.companyCode}</b> and {done.email}.{info.purpose === "INVITE" ? "" : " You were signed out of your other devices."}</p>
        <Link className="btn primary lg" href="/login" style={{ width: "100%", justifyContent: "center", marginTop: 18 }}>Sign in<ArrowRight /></Link>
      </div>
    );
  }
  if (!info.valid) {
    return (
      <div>
        <Link className="link small" href="/login"><ArrowLeft />Back to sign in</Link>
        <h2 style={{ marginTop: 18 }}>This link doesn&apos;t work any more</h2>
        <p className="muted">Links work once and expire (invitations after 7 days, password links after 24 hours). Ask your company administrator for a new one.</p>
        <Link className="btn secondary" href="/login/forgot">Request a new link</Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate>
      <span className="icon-well"><KeyRound /></span>
      <h2 style={{ marginTop: 14 }}>{info.purpose === "INVITE" ? `Welcome${info.fullName ? `, ${info.fullName.split(" ")[0]}` : ""}` : "Choose a new password"}</h2>
      <p className="muted">{info.purpose === "INVITE" ? `You've been invited to ${info.companyName ?? info.companyCode}. Choose a password to finish setting up your account.` : `For ${info.email} at ${info.companyName ?? info.companyCode}.`}</p>
      <FormGrid cols={1}>
        <Field label="Email"><input value={info.email ?? ""} readOnly /></Field>
        <Field label="New password" required error={errs.password} hint="At least 10 characters, with letters and numbers"><input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Confirm password" required error={errs.confirm}><input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
      </FormGrid>
      {error && <div className="mt"><Banner tone="danger" title="Couldn't set the password">{error}</Banner></div>}
      <button type="submit" className="btn primary lg" disabled={busy || !f.password} style={{ width: "100%", justifyContent: "center", marginTop: 18 }}>
        {busy ? "Saving…" : info.purpose === "INVITE" ? "Set password & continue" : "Change password"}<ArrowRight />
      </button>
    </form>
  );
}
