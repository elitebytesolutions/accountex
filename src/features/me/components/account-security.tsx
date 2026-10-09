"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogOut, Monitor, Moon, QrCode, ShieldX, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ChangePasswordSchema, MyProfileUpdateSchema, NOTIFY_EVENTS, type ChangePassword, type MyPreferencesResponse, type MyProfile, type MyProfileUpdate, type MyProfileUpdateFields, type UserActivity, type UserSession } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormActions, FormGrid, Input, Select, Switch } from "@/components/ui/form";
import { Panel } from "@/components/ui/page";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { changeMyPassword, getMyActivity, getMyPreferences, getMyProfile, listMySessions, revokeMySession, saveMyPreferences, updateMyProfile } from "../api";
import { SupportAccessHistory } from "./support-access-history";

type Tab = "profile" | "security" | "prefs";
const VERB: Record<string, string> = { INSERT: "Created", UPDATE: "Updated", DELETE: "Deleted" };
const tableLabel = (t: string) => t.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const daysAgo = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);

/** Template app/profile/security: Profile · Security · Preferences tabs (own account only). */
export function AccountSecurity({ initialTab, mustChangePassword }: { initialTab: Tab; mustChangePassword: boolean }) {
  const [tab, setTab] = useState<Tab>(mustChangePassword ? "security" : initialTab);
  const select = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };
  return (
    <div className="mt">
      {mustChangePassword && (
        <div className="mb">
          <Banner tone="warn" title="Set a new password to continue">Your administrator gave you a temporary password. Choose your own to open the rest of Accountex.</Banner>
        </div>
      )}
      <div className="tabs" role="tablist">
        {([["profile", "Profile"], ["security", "Security"], ["prefs", "Preferences"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} disabled={mustChangePassword && k !== "security"} className={tab === k ? "active" : undefined} onClick={() => select(k)}>{l}</button>
        ))}
      </div>
      <div className="tab-pane active mt">
        {tab === "profile" ? <ProfileTab /> : tab === "security" ? <SecurityTab mustChange={mustChangePassword} /> : <PreferencesTab />}
      </div>
    </div>
  );
}

function ProfileTab() {
  const toast = useToast();
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [activity, setActivity] = useState<UserActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<MyProfileUpdateFields, unknown, MyProfileUpdate>({ resolver: zodResolver(MyProfileUpdateSchema) });

  useEffect(() => {
    Promise.all([getMyProfile(), getMyActivity()])
      .then(([p, a]) => { setProfile(p); setActivity(a); reset({ ...p, rowVersion: p.rowVersion }); })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Could not load your profile"));
  }, [reset]);

  const save = handleSubmit(async (data) => {
    try {
      const p = await updateMyProfile(data);
      setProfile(p);
      reset({ ...p, rowVersion: p.rowVersion });
      toast("Profile saved", { tone: "good" });
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.details) for (const [f, m] of Object.entries(e.details)) setFieldError(f as keyof MyProfileUpdateFields, { message: m[0] });
      toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
    }
  });

  if (error) return <ErrorState message={error} />;
  if (!profile) return <Skeleton style={{ height: 320, borderRadius: 18 }} />;
  return (
    <div className="split">
      <form onSubmit={save} noValidate>
        <Panel title="Personal details">
          <FormGrid>
            <Field label="First name" error={errors.firstName?.message}><Input {...register("firstName")} /></Field>
            <Field label="Last name" error={errors.lastName?.message}><Input {...register("lastName")} /></Field>
            <Field label="Display name" required error={errors.fullName?.message}><Input {...register("fullName")} aria-invalid={!!errors.fullName} /></Field>
            <Field label="Job title" error={errors.jobTitle?.message}><Input {...register("jobTitle")} /></Field>
            <Field label="Email" hint="Your administrator can change it"><Input value={profile.email} disabled readOnly /></Field>
            <Field label="Mobile" error={errors.phone?.message}><Input {...register("phone")} /></Field>
            <Field label="Default branch" error={errors.defaultBranchId?.message}>
              <Select {...register("defaultBranchId", { setValueAs: (v) => v || null })}>
                <option value="">—</option>
                {profile.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Linked employee"><Input value="Arrives with employees (Phase 11)" disabled readOnly /></Field>
          </FormGrid>
          <FormActions>
            <Button onClick={() => reset({ ...profile, rowVersion: profile.rowVersion })}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save profile"}</Button>
          </FormActions>
        </Panel>
      </form>
      <div className="stack">
        <Panel title="Access summary">
          <div className="dl">
            <div><span>Roles</span><b>{profile.roles.join(", ")}</b></div>
            <div><span>Branches</span><b>{profile.branches.map((b) => b.name).join(", ") || "None"}</b></div>
            <div><span>Approval limit</span><b>{profile.approvalLimit ? `Rs ${profile.approvalLimit.toLocaleString("en-PK")}` : "No approvals"}</b></div>
            <div><span>Last sign-in</span><b>{when(profile.lastLoginAt)}</b></div>
          </div>
        </Panel>
        <Panel title="Recent activity">
          {activity.length ? (
            <div className="timeline">
              {activity.map((a, i) => (
                <div key={`${a.occurredAt}${i}`} className="tl-item"><span className={cn("tl-dot", a.action === "INSERT" && "good")} /><div><b>{VERB[a.action] ?? a.action} {tableLabel(a.table)}</b><small>{when(a.occurredAt)}</small></div></div>
              ))}
            </div>
          ) : <p className="muted small">Nothing yet.</p>}
        </Panel>
      </div>
    </div>
  );
}

function SecurityTab({ mustChange }: { mustChange: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { register, handleSubmit, reset, control, setError, formState: { errors, isSubmitting } } = useForm<ChangePassword>({ resolver: zodResolver(ChangePasswordSchema) });
  const next = useWatch({ control, name: "newPassword" }) ?? "";
  const strength = Math.min(100, (next.length >= 10 ? 40 : next.length * 4) + (/\d/.test(next) ? 20 : 0) + (/[A-Za-z]/.test(next) ? 20 : 0) + (/[^A-Za-z0-9]/.test(next) ? 20 : 0));

  useEffect(() => {
    listMySessions().then(setSessions).catch(() => setSessions([]));
    getMyProfile().then(setProfile).catch(() => undefined);
  }, [attempt]);

  const change = handleSubmit(async (data) => {
    try {
      await changeMyPassword(data);
      reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast("Password updated · other sessions signed out", { tone: "good" });
      if (mustChange) {
        router.replace("/dashboard");
        router.refresh();
      } else setAttempt((n) => n + 1);
    } catch (e) {
      if (e instanceof ApiError && e.details) for (const [f, m] of Object.entries(e.details)) setError(f as keyof ChangePassword, { message: m[0] });
      toast(e instanceof ApiError ? e.message : "Could not change the password", { tone: "danger" });
    }
  });

  const revoke = async (id?: string) => {
    try {
      await revokeMySession(id);
      toast(id ? "Session revoked" : "All other sessions revoked", { tone: "good" });
      setAttempt((n) => n + 1);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not revoke", { tone: "danger" });
    }
  };
  const changedDays = daysAgo(profile?.passwordChangedAt ?? null);

  return (
    <>
      <div className="grid-2 mb">
        <form onSubmit={change} noValidate>
          <Panel title="Change password" description={changedDays === null ? "Set by your administrator" : changedDays === 0 ? "Last changed today" : `Last changed ${changedDays} day${changedDays === 1 ? "" : "s"} ago`}>
            <FormGrid cols={1}>
              <Field label="Current password" error={errors.currentPassword?.message}><Input type="password" autoComplete="current-password" {...register("currentPassword")} aria-invalid={!!errors.currentPassword} /></Field>
              <Field label="New password" error={errors.newPassword?.message}><Input type="password" autoComplete="new-password" {...register("newPassword")} aria-invalid={!!errors.newPassword} /></Field>
              <Field label="Confirm new password" error={errors.confirmPassword?.message}><Input type="password" autoComplete="new-password" {...register("confirmPassword")} aria-invalid={!!errors.confirmPassword} /></Field>
            </FormGrid>
            <div className={cn("progress mt", strength < 60 ? "warn" : "good")}><i style={{ width: `${strength}%` }} /></div>
            <p className="small muted">At least 10 characters with letters and numbers. Other devices are signed out when it changes.</p>
            <FormActions><Button type="submit" variant="primary" disabled={isSubmitting}>{isSubmitting ? "Updating…" : "Update password"}</Button></FormActions>
          </Panel>
        </form>
        <Panel title="Two-factor authentication" description="Authenticator app (TOTP)" actions={<Badge>Phase 15</Badge>}>
          <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
            <div style={{ width: 132, height: 132, flex: "none", border: "1px dashed var(--line-2)", borderRadius: 12, display: "grid", placeItems: "center", background: "var(--surface-2) var(--hatch)" }}><QrCode /></div>
            <div className="stack">
              <p className="small">Two-step sign-in with Google or Microsoft Authenticator arrives in Phase 15, together with password recovery by email.</p>
              <p className="small muted">Until then, keep your password private and sign out of devices you no longer use.</p>
            </div>
          </div>
        </Panel>
      </div>
      <Panel flush title="Active sessions" description="Devices currently signed in to your account" actions={sessions && sessions.length > 1 && <Button variant="danger" size="sm" icon={<ShieldX />} onClick={() => revoke()}>Revoke all others</Button>}>
        {!sessions ? <div style={{ padding: 16 }}><Skeleton style={{ height: 80 }} /></div> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Device</th><th>IP address</th><th>Signed in</th><th>Last active</th><th /></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.deviceLabel ?? "Browser"}</b>{s.current && <small>This device</small>}</td>
                    <td>{s.ipAddress ?? "—"}</td>
                    <td>{when(s.signedInAt)}</td>
                    <td>{s.current ? <Badge tone="good" dot>Now</Badge> : when(s.lastActiveAt)}</td>
                    <td className="actions">{!s.current && <Button variant="ghost" size="sm" icon={<LogOut />} onClick={() => revoke(s.id)}>Revoke</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <SupportAccessHistory />
    </>
  );
}

function PreferencesTab() {
  const toast = useToast();
  const lookups = useLookups(["EnUrLanguage", "DateFormat", "NumberFormat", "StartRoute"]);
  const [prefs, setPrefs] = useState<MyPreferencesResponse | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyPreferences().then(setPrefs).catch(() => toast("Could not load preferences", { tone: "danger" }));
  }, [toast]);

  if (!prefs) return <Skeleton style={{ height: 320, borderRadius: 18 }} />;
  const set = <K extends keyof MyPreferencesResponse>(k: K, v: MyPreferencesResponse[K]) => setPrefs({ ...prefs, [k]: v });
  const toggleEvent = (code: string) => set("notifyEvents", prefs.notifyEvents.includes(code) ? prefs.notifyEvents.filter((e) => e !== code) : [...prefs.notifyEvents, code]);
  const applyTheme = (theme: string) => {
    try {
      if (theme === "SYSTEM") localStorage.removeItem("fs-theme");
      else localStorage.setItem("fs-theme", theme.toLowerCase());
    } catch {}
    const dark = theme === "DARK" || (theme === "SYSTEM" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };

  const save = async () => {
    setSaving(true);
    try {
      const { saved, rowVersion, ...body } = prefs;
      const next = await saveMyPreferences({ ...body, ...(saved && { rowVersion }) });
      setPrefs(next);
      applyTheme(next.theme);
      toast("Preferences saved", { tone: "good" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };
  const opts = (type: string, current: string) => lookupOptions(lookups, type, current).map((o) => <option key={o.code} value={o.code}>{o.label}</option>);

  return (
    <div className="grid-2">
      <Panel title="Regional & display">
        <FormGrid>
          <Field label="Language"><Select value={prefs.language} onChange={(e) => set("language", e.target.value)}>{opts("EnUrLanguage", prefs.language)}</Select></Field>
          <Field label="Date format"><Select value={prefs.dateFormat} onChange={(e) => set("dateFormat", e.target.value)}>{opts("DateFormat", prefs.dateFormat)}</Select></Field>
          <Field label="Number format"><Select value={prefs.numberFormat} onChange={(e) => set("numberFormat", e.target.value)}>{opts("NumberFormat", prefs.numberFormat)}</Select></Field>
          <Field label="Start page"><Select value={prefs.startRoute} onChange={(e) => set("startRoute", e.target.value)}>{opts("StartRoute", prefs.startRoute)}</Select></Field>
        </FormGrid>
        <div className="form-section mt"><h4>Theme</h4></div>
        <div className="seg">
          {([["LIGHT", "Light", Sun], ["DARK", "Dark", Moon], ["SYSTEM", "System", Monitor]] as const).map(([k, l, Icon]) => (
            <button key={k} type="button" className={prefs.theme === k ? "active" : undefined} onClick={() => set("theme", k)}><Icon />{l}</button>
          ))}
        </div>
        <div className="stack mt">
          <Switch checked={prefs.compactTables} onChange={(e) => set("compactTables", e.target.checked)} label="Compact tables" />
          <Switch checked={prefs.showAccountCodes} onChange={(e) => set("showAccountCodes", e.target.checked)} label="Show account codes before names" />
        </div>
      </Panel>
      <Panel title="Notifications" description="Choose what reaches you and where">
        <div className="stack">
          {NOTIFY_EVENTS.map((e) => <Switch key={e.code} checked={prefs.notifyEvents.includes(e.code)} onChange={() => toggleEvent(e.code)} label={e.label} />)}
          <Switch checked={prefs.notifyWhatsapp} onChange={(e) => set("notifyWhatsapp", e.target.checked)} label="WhatsApp alerts" />
        </div>
        <p className="small muted mt">In-app notifications and per-event choices are set in the <a className="link" href="/notifications">Notification Centre</a> (Preferences). Email and WhatsApp delivery start when a provider is connected.</p>
        <FormActions><Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save preferences"}</Button></FormActions>
      </Panel>
    </div>
  );
}
