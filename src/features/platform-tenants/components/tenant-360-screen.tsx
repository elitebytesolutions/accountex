"use client";

import {
  ArrowLeft, ArrowUpDown, CirclePause, CirclePlay, CreditCard, Download, Gauge, History, LayoutGrid, LogOut, Rocket, ShieldCheck, ToggleRight, UserX,
  Users, VenetianMask, Webhook,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ImpersonationSession, SubscriptionDetail, TenantDetail } from "@/shared";
import { Tabs } from "@/components/ui/tabs";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { endImpersonation, getSubscription, getTenant, listImpersonations, listSubscriptions, updateTenant } from "../api";
import { ImpersonateModal } from "./impersonate-modal";
import { SubscriptionActionModal, type SubscriptionAction } from "./subscription-actions";
import { ActivityTab, BillingTab, FlagsTab, IntegrationsTab, OverviewTab, UsageTab, UsersTab } from "./tenant-360-tabs";
import { TenantStatusDialog, type StatusAction } from "./tenant-status-dialog";
import { fmtDate, HealthRing, healthTone, StatusBadge, TenantLogo, TenantPlanPill } from "./tenant-ui";
import { useUsage } from "./usage-metering";

type TabKey = "ov" | "users" | "usage" | "billing" | "flags" | "int" | "act";
type LoadError = { message: string; reference?: string };
const LIVE_SUB = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"];
const errOf = (e: unknown, fallback: string): LoadError => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback });

/** mm:ss until an ISO time (template ap-imp-clock). */
function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.round((Date.parse(until) - now) / 1000));
  return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
}

/**
 * Admin › Tenants › Tenant 360 (template 3A:19, 9B 417–769): impersonation bar, profile panel with actions, tabs
 * Overview · Users · Usage · Billing · Feature flags · Integrations · Activity (Tenants history + support sessions).
 */
export function Tenant360Screen({ id, staffName, openImpersonate }: { id: string; staffName: string; openImpersonate?: boolean }) {
  const toast = useToast();
  const lookups = useAdminLookups(["TenantStatus", "Province", "TenantIndustry", "ContactRole", "SubscriptionEventType", "UserStatus", "SubscriptionStatus"]);
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [sub, setSub] = useState<SubscriptionDetail | null>(null);
  const [subLoaded, setSubLoaded] = useState(false);
  const [sessions, setSessions] = useState<ImpersonationSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState<LoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [subAttempt, setSubAttempt] = useState(0);
  const [sessAttempt, setSessAttempt] = useState(0);
  const [historyKey, setHistoryKey] = useState(0);
  const [tab, setTab] = useState<TabKey>("ov");
  const [imp, setImp] = useState<{ open: boolean; userId: string | null }>({ open: !!openImpersonate, userId: null });
  const [subAction, setSubAction] = useState<SubscriptionAction | null>(null);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [edit, setEdit] = useState(false);
  const usage = useUsage(id);

  useEffect(() => {
    let cancelled = false;
    getTenant(id).then((t) => { if (!cancelled) { setTenant(t); setError(null); } }).catch((e: unknown) => !cancelled && setError(errOf(e, "Could not load the company")));
    return () => { cancelled = true; };
  }, [id, attempt]);
  useEffect(() => {
    let cancelled = false;
    listSubscriptions()
      .then(async (l) => {
        const mine = l.items.filter((s) => s.tenantId === id).sort((a, b) => Number(LIVE_SUB.includes(b.status)) - Number(LIVE_SUB.includes(a.status)) || b.startsOn.localeCompare(a.startsOn))[0];
        const d = mine ? await getSubscription(mine.id) : null;
        if (!cancelled) { setSub(d); setSubLoaded(true); }
      })
      .catch((e: unknown) => { if (!cancelled) { setSubLoaded(true); toast(adminErrorMessage(e, "Could not load the subscription"), { tone: "danger" }); } });
    return () => { cancelled = true; };
  }, [id, subAttempt, toast]);
  useEffect(() => {
    let cancelled = false;
    listImpersonations({ tenantId: id }).then((s) => { if (!cancelled) { setSessions(s); setSessionsError(null); } }).catch((e: unknown) => !cancelled && setSessionsError(errOf(e, "Could not load support sessions")));
    return () => { cancelled = true; };
  }, [id, sessAttempt]);

  const reloadSessions = useCallback(() => setSessAttempt((n) => n + 1), []);
  const changed = (t: TenantDetail) => { setTenant(t); setHistoryKey((n) => n + 1); };
  const live = sessions?.find((s) => s.live) ?? null;
  const clock = useCountdown(live?.expiresAt ?? null);

  if (error) return <><PageHead eyebrow="Tenants / Tenant 360" title="Tenant 360" /><ErrorState message={error.message} reference={error.reference} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} /></>;
  if (!tenant) return <><PageHead eyebrow="Tenants / Tenant 360" title="Tenant 360" /><div className="stack"><Skeleton style={{ height: 180 }} /><Skeleton style={{ height: 40 }} /><Skeleton style={{ height: 320 }} /></div></>;

  const t = tenant;
  const canReactivate = ["SUSPENDED", "READ_ONLY"].includes(t.status);
  const activeUsers = t.users.filter((u) => u.status === "ACTIVE").length;
  const subAct = (a: SubscriptionAction) => { if (a !== "start" && !sub) return; setSubAction(a); };

  return (
    <>
      <PageHead
        eyebrow={<><Link className="link" href="/admin/tenants">Tenants</Link> / {t.code.toUpperCase()}</>}
        title="Tenant 360"
        description={`Health, people, usage, billing and audit for ${t.displayName}, all in one view.`}
        actions={<Link className="btn ghost" href="/admin/tenants"><ArrowLeft />All tenants</Link>} />

      {live && (
        <div className="ap-imp-bar">
          <span className="ap-pulse" /><VenetianMask />
          <div><b>Impersonating {live.targetUserLabel} at {t.displayName}</b><small>{live.isReadOnly ? "Read-only" : "Full access"} · {live.staff ?? "Super Admin"} · every action is recorded in the platform audit log</small></div>
          <span className="spacer" />
          <b className="ap-imp-clock tnum">{clock}</b>
          <button type="button" className="btn lime sm" onClick={async () => {
            try { await endImpersonation(live.id); toast("Impersonation ended · recorded in the audit log", { tone: "good" }); reloadSessions(); }
            catch (e) { toast(adminErrorMessage(e, "Could not end the session"), { tone: "danger" }); }
          }}><LogOut />End session</button>
        </div>
      )}

      <div className="panel ap-profile">
        <TenantLogo name={t.displayName} size="xl" />
        <div className="ap-profile-main">
          <h2>{t.displayName}</h2>
          <div className="row ap-wrap">
            <TenantPlanPill code={sub?.planCode ?? null} name={sub?.planName ?? null} />
            {sub && <span className="badge neutral">{sub.billingCycle === "ANNUAL" ? "Annual" : "Monthly"}</span>}
            <StatusBadge lookups={lookups} code={t.status} />
            {t.requireMfa && <span className="badge info"><ShieldCheck />MFA enforced</span>}
            {t.isBeta && <span className="badge violet">Beta</span>}
            {t.isInternal && <span className="badge neutral">Internal</span>}
          </div>
          <div className="ap-profile-meta">
            <div><small>Region</small><b>{[t.province ? labelOf(lookups, "Province", t.province) : null, t.city].filter(Boolean).join(" · ") || "—"}</b></div>
            <div><small>NTN</small><b className="tnum">{t.ntn ?? "—"}</b></div>
            <div><small>STRN</small><b className="tnum">{t.strn ?? "—"}</b></div>
            <div><small>Created</small><b>{fmtDate(t.createdAt)}</b></div>
            <div><small>Workspace</small><b>{t.subdomain}.accountex.pk</b></div>
            <div><small>Company code</small><b>{t.code.toUpperCase()}</b></div>
            {t.status === "SUSPENDED" && <div><small>Suspended</small><b>{fmtDate(t.suspendedAt)}{t.suspensionReason ? ` · ${t.suspensionReason}` : ""}</b></div>}
            {t.status === "CHURNED" && <div><small>Churned</small><b>{fmtDate(t.churnedAt)}{t.churnReason ? ` · ${t.churnReason}` : ""}</b></div>}
          </div>
        </div>
        <div className="ap-profile-health">
          <HealthRing score={t.healthScore} size={92} stroke={8} />
          <small>Health · {t.healthScore === null ? <b>Not scored</b> : <b className={`ap-${healthTone(t.healthScore) === "good" ? "good" : healthTone(t.healthScore) === "warn" ? "warn" : "danger"}-t`}>{t.healthScore >= 75 ? "Healthy" : t.healthScore >= 50 ? "Watch" : "At risk"}</b>}</small>
          <span className="pill"><Users />{activeUsers} active user{activeUsers === 1 ? "" : "s"}</span>
        </div>
        <div className="ap-profile-actions">
          <button type="button" className="btn primary" disabled={!["TRIAL", "ACTIVE", "PAST_DUE", "READ_ONLY"].includes(t.status)} onClick={() => setImp({ open: true, userId: null })}><VenetianMask />Impersonate</button>
          {sub ? <button type="button" className="btn secondary" onClick={() => subAct("plan")}><ArrowUpDown />Change plan</button>
            : subLoaded && <button type="button" className="btn secondary" onClick={() => subAct("start")}><Rocket />Start subscription</button>}
          <button type="button" className="btn secondary" disabled title="Tenant data export arrives in Phase 35"><Download />Export data</button>
          {t.status !== "CHURNED" && <button type="button" className="btn ghost" disabled={t.status === "PROVISIONING"} onClick={() => setStatusAction("churn")}><UserX />Churn</button>}
          {canReactivate
            ? <button type="button" className="btn secondary" style={{ marginLeft: "auto" }} onClick={() => setStatusAction("reactivate")}><CirclePlay /><span>Reactivate</span></button>
            : <button type="button" className="btn danger" disabled={!["TRIAL", "ACTIVE", "PAST_DUE"].includes(t.status)} onClick={() => setStatusAction("suspend")}><CirclePause /><span>Suspend</span></button>}
        </div>
      </div>

      <div className="ap-t360">
        <Tabs<TabKey> active={tab} onChange={setTab} items={[
          { key: "ov", label: "Overview", icon: <LayoutGrid /> },
          { key: "users", label: "Users", icon: <Users />, count: t.users.length },
          { key: "usage", label: "Usage", icon: <Gauge /> },
          { key: "billing", label: "Billing", icon: <CreditCard /> },
          { key: "flags", label: "Feature flags", icon: <ToggleRight /> },
          { key: "int", label: "Integrations", icon: <Webhook /> },
          { key: "act", label: "Activity", icon: <History /> },
        ]} />
        <div className="tab-pane active">
          {tab === "ov" && <OverviewTab tenant={t} sub={sub} usage={usage.data} lookups={lookups} onChanged={changed} onSubAction={subAct} onGoto={(k) => setTab(k as TabKey)} onEdit={() => setEdit(true)} />}
          {tab === "users" && <UsersTab tenant={t} sub={sub} lookups={lookups} onImpersonate={(userId) => setImp({ open: true, userId })} />}
          {tab === "usage" && <UsageTab tenant={t} usage={usage.data} error={usage.error} reload={usage.reload} />}
          {tab === "billing" && <BillingTab tenant={t} sub={sub} lookups={lookups} onAction={subAct} reloadKey={subAttempt} />}
          {tab === "flags" && <FlagsTab tenant={t} />}
          {tab === "int" && <IntegrationsTab tenant={t} />}
          {tab === "act" && <ActivityTab tenant={t} sessions={sessions} sessionsError={sessionsError} reloadSessions={reloadSessions} reloadKey={historyKey} />}
        </div>
      </div>

      <ImpersonateModal tenant={t} open={imp.open} presetUserId={imp.userId} staffName={staffName} onClose={() => setImp({ open: false, userId: null })}
        onStarted={() => { setImp({ open: false, userId: null }); reloadSessions(); }} />
      <SubscriptionActionModal action={subAction} sub={sub} tenant={{ id: t.id, name: t.displayName }} onClose={() => setSubAction(null)}
        onDone={(d) => { setSubAction(null); setSub(d); setSubAttempt((n) => n + 1); setAttempt((n) => n + 1); }} />
      <TenantStatusDialog action={statusAction} tenants={statusAction ? [{ id: t.id, displayName: t.displayName, code: t.code, status: t.status, rowVersion: t.rowVersion }] : []}
        onClose={() => setStatusAction(null)} onDone={() => { setStatusAction(null); setAttempt((n) => n + 1); setHistoryKey((n) => n + 1); reloadSessions(); }} />
      <EditDetailsModal open={edit} tenant={t} lookups={lookups} onClose={() => setEdit(false)} onSaved={(n) => { setEdit(false); changed(n); }} />
    </>
  );
}

/** Edit the company record (PATCH /api/admin/tenants/:id) with its platform history. */
function EditDetailsModal({ open, tenant, lookups, onClose, onSaved }: { open: boolean; tenant: TenantDetail; lookups: ReturnType<typeof useAdminLookups>; onClose: () => void; onSaved: (t: TenantDetail) => void }) {
  const toast = useToast();
  const pick = (t: TenantDetail) => ({
    displayName: t.displayName, legalName: t.legalName, ntn: t.ntn ?? "", strn: t.strn ?? "", secpRegNo: t.secpRegNo ?? "", industry: t.industry ?? "", city: t.city ?? "",
    province: t.province ?? "", address: t.address ?? "", phone: t.phone ?? "", email: t.email ?? "", isBeta: t.isBeta, isInternal: t.isInternal, requireMfa: t.requireMfa,
  });
  const [f, setF] = useState(() => pick(tenant));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) { setF(pick(tenant)); setErrors({}); } }
  const save = async () => {
    setBusy(true);
    try {
      const t = await updateTenant(tenant.id, { ...f, industry: f.industry || null, province: f.province || null, city: f.city || null, strn: f.strn || null, secpRegNo: f.secpRegNo || null, address: f.address || null, phone: f.phone || null, rowVersion: tenant.rowVersion });
      toast("Company details saved", { tone: "good" }); onSaved(t);
    } catch (e) { setErrors(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not save the details"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const e = (k: string) => (errors[k] ? <small className="hint text-danger" role="alert">{errors[k]}</small> : null);
  const txt = (k: keyof typeof f, label: string, full?: boolean) => (
    <label className={full ? "full" : undefined}><span>{label}</span><input value={String(f[k])} aria-invalid={!!errors[k]} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} />{e(k)}</label>
  );
  return (
    <AdminRecordModal open={open} onClose={onClose} title="Edit company details" subtitle={tenant.code.toUpperCase()} wide history={{ table: "Tenants", id: tenant.id }}
      historyLabels={{ TenantContacts: "Contact", TenantModules: "Module", TenantNotes: "Note" }} busy={busy} saveLabel="Save details" onSave={save}>
      <div className="form-grid">
        {txt("displayName", "Display name *")}
        {txt("legalName", "Legal name *")}
        {txt("ntn", "NTN")}
        {txt("strn", "STRN")}
        {txt("secpRegNo", "SECP registration #")}
        <label><span>Industry</span><select value={f.industry} onChange={(ev) => setF({ ...f, industry: ev.target.value })}><option value="">—</option>{(lookups.TenantIndustry ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
        <label><span>Province</span><select value={f.province} onChange={(ev) => setF({ ...f, province: ev.target.value })}><option value="">—</option>{(lookups.Province ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
        {txt("city", "City")}
        {txt("address", "Registered address", true)}
        {txt("phone", "Phone")}
        {txt("email", "Company email")}
      </div>
      <div className="ap-switches ap-mt">
        <label className="switch"><input type="checkbox" checked={f.requireMfa} onChange={(ev) => setF({ ...f, requireMfa: ev.target.checked })} /><i /><span>Require MFA for all users</span></label>
        <label className="switch"><input type="checkbox" checked={f.isBeta} onChange={(ev) => setF({ ...f, isBeta: ev.target.checked })} /><i /><span>Beta programme</span></label>
        <label className="switch"><input type="checkbox" checked={f.isInternal} onChange={(ev) => setF({ ...f, isInternal: ev.target.checked })} /><i /><span>Internal company (staff or test account)</span></label>
      </div>
    </AdminRecordModal>
  );
}
