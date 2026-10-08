"use client";

import {
  ArrowRight, ArrowUpDown, CalendarPlus, Gauge, History, KeyRound, LogOut, MoreHorizontal, Pencil, Plus, Repeat, Rocket, Search, ShieldCheck,
  SlidersHorizontal, UserPlus, UserSearch, VenetianMask, Webhook, XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ImpersonationSession, LookupsResponse, SubscriptionDetail, TenantDetail, UsageOverview } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { labelOf } from "@/features/settings/use-lookups";
import { addTenantContact, addTenantNote, endImpersonation, revokeUsageOverride, setTenantModules } from "../api";
import type { SubscriptionAction } from "./subscription-actions";
import { asList, Avatar, daysTo, fmt, fmtDate, fmtDateTime, Meter, meterTone, MODULES, relDays, rs, short, StatusBadge, USAGE_METRICS } from "./tenant-ui";
import { OverrideModal, pivotUsage, RefreshUsageButton, type TenantUsage } from "./usage-metering";
import { TenantDunningPanel, TenantInvoicesPanel } from "@/features/platform-billing/components/tenant-billing";

type LoadError = { message: string; reference?: string };

/** Template `.ap-subcard`: the subscription summary (or a "Start subscription" call to action). */
export function SubscriptionCard({ sub, tenant, onAction, seatsUsed }: { sub: SubscriptionDetail | null; tenant: TenantDetail; onAction: (a: SubscriptionAction) => void; seatsUsed: number }) {
  if (!sub) {
    return (
      <div className="panel ap-subcard">
        <div className="ap-subcard-top"><span className="icon-tile lime"><Repeat /></span><div><small>Subscription</small><b>No live subscription</b></div></div>
        <p className="muted small">{tenant.displayName} is not billed yet. Start a subscription (or a trial) on one of the active plans.</p>
        <button type="button" className="btn primary sm" onClick={() => onAction("start")}><Rocket />Start subscription</button>
      </div>
    );
  }
  const annual = sub.billingCycle === "ANNUAL";
  const renewIn = daysTo(sub.nextRenewalOn);
  return (
    <div className="panel ap-subcard">
      <div className="ap-subcard-top"><span className="icon-tile lime"><Repeat /></span><div><small>Subscription</small><b>{sub.planName} · {annual ? "Annual" : "Monthly"}</b></div>
        <span className={cn("badge dot", sub.status === "ACTIVE" ? "good" : sub.status === "TRIAL" ? "info" : sub.status === "PAST_DUE" ? "danger" : "neutral")}>{sub.cancelAtPeriodEnd ? "Cancels at period end" : sub.autoRenew ? "Auto-renew" : sub.status.replace("_", " ").toLowerCase()}</span></div>
      <div className="ap-subcard-price"><b className="num-big">{rs(sub.amount)}</b><small>/ {annual ? "year" : "month"} · MRR {rs(sub.mrrAmount)}{sub.status === "TRIAL" ? " (trial: 0 until it converts)" : ""}</small></div>
      <div className="dl">
        {sub.status === "TRIAL" && <div><span>Trial ends</span><b>{fmtDate(sub.trialEndsOn)} · {relDays(daysTo(sub.trialEndsOn))}</b></div>}
        <div><span>Next renewal</span><b>{sub.nextRenewalOn ? `${fmtDate(sub.nextRenewalOn)} · ${relDays(renewIn)}` : "—"}</b></div>
        <div><span>Current period</span><b>{fmtDate(sub.currentPeriodStart)} – {fmtDate(sub.currentPeriodEnd)}</b></div>
        <div><span>Seats</span><b>{fmt(seatsUsed)} of {sub.seats ? fmt(sub.seats) : "unlimited"}</b></div>
        <div><span>Payment</span><b>{sub.paymentMethod ?? "Not set up"}</b></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Overview
export function OverviewTab({ tenant, sub, usage, lookups, onChanged, onSubAction, onGoto, onEdit }: {
  tenant: TenantDetail; sub: SubscriptionDetail | null; usage: UsageOverview | null; lookups: LookupsResponse;
  onChanged: (t: TenantDetail) => void; onSubAction: (a: SubscriptionAction) => void; onGoto: (tab: string) => void; onEdit: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [mods, setMods] = useState<Record<string, boolean> | null>(null);
  const [contact, setContact] = useState(false);
  const current = useMemo(() => Object.fromEntries(MODULES.map((m) => [m.key, tenant.modules.some((x) => x.moduleKey === m.key && x.enabled)])), [tenant.modules]);
  const shown = mods ?? current;
  const dirty = !!mods && MODULES.some((m) => mods[m.key] !== current[m.key]);
  const rows = usage?.rows ?? [];

  const addNote = async () => {
    if (note.trim().length < 2) { toast("Write the note first", { tone: "warn" }); return; }
    setBusy("note");
    try { onChanged(await addTenantNote(tenant.id, note.trim())); setNote(""); toast("Note added", { tone: "good" }); }
    catch (e) { toast(adminErrorMessage(e, "Could not add the note"), { tone: "danger" }); }
    finally { setBusy(null); }
  };
  const saveModules = async () => {
    if (!mods) return;
    setBusy("mods");
    try {
      const t = await setTenantModules(tenant.id, tenant.rowVersion, MODULES.filter((m) => mods[m.key] || tenant.modules.some((x) => x.moduleKey === m.key)).map((m) => ({ moduleKey: m.key, enabled: !!mods[m.key] })));
      onChanged(t); setMods(null); toast("Modules saved · they apply at the users' next page load", { tone: "good" });
    } catch (e) { toast(adminErrorMessage(e, "Could not save the modules"), { tone: "danger" }); }
    finally { setBusy(null); }
  };

  return (
    <div className="split ap-split-wide">
      <div className="stack">
        <div className="panel">
          <div className="panel-head"><div><h3>Company details</h3><p>As registered with SECP and FBR</p></div><div className="panel-actions"><button type="button" className="btn ghost sm" onClick={onEdit}><Pencil />Edit</button></div></div>
          <div className="dl">
            <div><span>Legal name</span><b>{tenant.legalName}</b></div>
            <div><span>NTN / STRN</span><b>{tenant.ntn ?? "—"} · {tenant.strn ?? "—"}</b></div>
            <div><span>SECP registration</span><b>{tenant.secpRegNo ?? "—"}</b></div>
            <div><span>Industry</span><b>{tenant.industry ? labelOf(lookups, "TenantIndustry", tenant.industry) : "—"}</b></div>
            <div><span>Address</span><b>{tenant.address ?? "—"}</b></div>
            <div><span>Phone / email</span><b>{tenant.phone ?? "—"} · {tenant.email ?? "—"}</b></div>
            <div><span>Fiscal year / currency</span><b>Starts {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][tenant.fiscalYearStartMonth - 1]} · {tenant.baseCurrency} · {tenant.timezone}</b></div>
            <div><span>COA template</span><b>{tenant.coaTemplateName ?? "—"}</b></div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Usage this cycle</h3><p>{rows.length ? `Snapshot of ${fmtDate(rows[0]!.snapshotDate)}${sub ? ` · against ${sub.planName} limits` : ""}` : "No usage captured yet"}</p></div>
            <div className="panel-actions"><button type="button" className="btn ghost sm" onClick={() => onGoto("usage")}>All meters<ArrowRight /></button></div></div>
          {!usage ? <Skeleton style={{ height: 80 }} /> : rows.length === 0 ? <p className="muted small">Refresh usage on the Usage tab to take today&apos;s snapshot.</p> : (
            <div className="ap-ov-meters">
              {USAGE_METRICS.slice(0, 4).map((m) => {
                const r = rows.find((x) => x.meterCode === m.code);
                return <Meter key={m.code} used={r?.usedValue ?? 0} limit={r?.limitValue ?? null} label={<><m.icon />{m.label}</>} text={r ? `${short(r.usedValue)}${m.unit} / ${r.limitValue === null ? "∞" : `${short(r.limitValue)}${m.unit}`}` : "—"} />;
              })}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Modules</h3><p>Toggles apply to every user of {tenant.code.toUpperCase()}</p></div>
            <div className="panel-actions">
              {dirty && <button type="button" className="btn ghost sm" onClick={() => setMods(null)}>Undo</button>}
              <button type="button" className="btn primary sm" disabled={!dirty || busy === "mods"} onClick={saveModules}>{busy === "mods" ? "Saving…" : "Save modules"}</button>
            </div></div>
          <div className="ap-flags">
            {MODULES.map((m) => {
              const row = tenant.modules.find((x) => x.moduleKey === m.key);
              return (
                <label key={m.key} className="ap-flag">
                  <span className="icon-well"><m.icon /></span>
                  <div><b>{m.label}</b><small>{row ? `${row.source === "PLAN" ? "Included in plan" : row.source === "TRIAL" ? "Trial" : "Override"} · since ${fmtDate(row.enabledAt)}` : "Not on this company"}</small></div>
                  <span className="switch"><input type="checkbox" checked={!!shown[m.key]} onChange={(e) => setMods({ ...shown, [m.key]: e.target.checked })} /><i /></span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
      <div className="stack">
        <SubscriptionCard sub={sub} tenant={tenant} onAction={onSubAction} seatsUsed={tenant.users.filter((u) => u.status === "ACTIVE").length} />
        <div className="panel">
          <div className="panel-head"><div><h3>Contacts</h3><p>Owner, billing and technical contacts</p></div><div className="panel-actions"><button type="button" className="btn secondary sm" onClick={() => setContact(true)}><UserPlus />Add</button></div></div>
          {tenant.contacts.length === 0 ? <p className="muted small">No contacts yet.</p> : (
            <div className="list">
              {tenant.contacts.map((c) => (
                <div key={c.id} className="list-item"><Avatar name={c.fullName} /><div><b>{c.fullName}{c.isPrimary && <span className="badge good" style={{ marginLeft: 6 }}>Primary</span>}</b><small>{labelOf(lookups, "ContactRole", c.contactRole)}{c.designation ? ` · ${c.designation}` : ""} · {c.email}{c.mobile ? ` · ${c.mobile}` : ""}</small></div></div>
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Notes</h3><p>Visible to platform staff only</p></div></div>
          <div className="ap-note-add"><textarea rows={2} value={note} maxLength={2000} placeholder="Add a note… e.g. CFO asked about Business plan in Q3" onChange={(e) => setNote(e.target.value)} /><button type="button" className="btn primary sm" disabled={busy === "note"} onClick={addNote}><Plus />Add</button></div>
          <div className="ap-notes">
            {tenant.notes.length === 0 ? <p className="muted small">No notes yet.</p> : tenant.notes.map((n) => (
              <div key={n.id} className="ap-note"><Avatar name={n.author ?? "Super Admin"} size="xs" /><div><p>{n.body}</p><small>{n.author ?? "Super Admin"} · {fmtDateTime(n.createdAt)}</small></div></div>
            ))}
          </div>
        </div>
      </div>
      <ContactModal open={contact} tenant={tenant} onClose={() => setContact(false)} onSaved={(t) => { setContact(false); onChanged(t); }} />
    </div>
  );
}

function ContactModal({ open, tenant, onClose, onSaved }: { open: boolean; tenant: TenantDetail; onClose: () => void; onSaved: (t: TenantDetail) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ contactRole: "BILLING", fullName: "", designation: "", email: "", mobile: "", language: "EN" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const t = await addTenantContact(tenant.id, { ...f, designation: f.designation || null, mobile: f.mobile || null }); toast(`${f.fullName} added`, { tone: "good" }); setF({ contactRole: "BILLING", fullName: "", designation: "", email: "", mobile: "", language: "EN" }); setErrors({}); onSaved(t); }
    catch (e) { setErrors(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not add the contact"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const e = (k: string) => (errors[k] ? <small className="hint text-danger" role="alert">{errors[k]}</small> : null);
  return (
    <Modal open={open} onClose={onClose} title="Add contact" subtitle={tenant.displayName}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Add contact"}</button></>}>
      <div className="form-grid">
        <label><span>Role</span><select value={f.contactRole} onChange={(ev) => setF({ ...f, contactRole: ev.target.value })}>{["OWNER", "BILLING", "TECHNICAL", "OTHER"].map((r) => <option key={r} value={r}>{r[0] + r.slice(1).toLowerCase()}</option>)}</select>{e("contactRole")}</label>
        <label><span>Full name *</span><input value={f.fullName} maxLength={120} aria-invalid={!!errors.fullName} onChange={(ev) => setF({ ...f, fullName: ev.target.value })} />{e("fullName")}</label>
        <label><span>Email *</span><input type="email" value={f.email} aria-invalid={!!errors.email} onChange={(ev) => setF({ ...f, email: ev.target.value })} />{e("email")}</label>
        <label><span>Mobile</span><input value={f.mobile} maxLength={30} onChange={(ev) => setF({ ...f, mobile: ev.target.value })} /></label>
        <label><span>Designation</span><input value={f.designation} maxLength={80} onChange={(ev) => setF({ ...f, designation: ev.target.value })} /></label>
        <label><span>Language</span><select value={f.language} onChange={(ev) => setF({ ...f, language: ev.target.value })}><option value="EN">English</option><option value="UR">Urdu</option></select></label>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------- Users
export function UsersTab({ tenant, sub, lookups, onImpersonate }: { tenant: TenantDetail; sub: SubscriptionDetail | null; lookups: LookupsResponse; onImpersonate: (userId: string) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [menu, setMenu] = useState<{ anchor: HTMLElement; id: string } | null>(null);
  const users = tenant.users.map((u) => ({ ...u, roleList: asList(u.roles) }));
  const roles = [...new Set(users.flatMap((u) => u.roleList))].sort();
  const list = users.filter((u) => (!role || u.roleList.includes(role)) && (!q || `${u.fullName} ${u.email} ${u.roleList.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const used = users.filter((u) => u.status === "ACTIVE").length;
  return (
    <div className="panel flush">
      <div className="toolbar ap-utools">
        <label className={cn("search-field", q && "has-val")}><Search /><input value={q} placeholder="Search users, roles or emails…" onChange={(e) => setQ(e.target.value)} /></label>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role"><option value="">All roles</option>{roles.map((r) => <option key={r}>{r}</option>)}</select>
        <span className="spacer" />
        {sub?.seats ? <span className="ap-seatline"><Meter compact used={used} limit={sub.seats} text={`${used} / ${fmt(sub.seats)} seats`} /></span> : <span className="muted small">{used} active users</span>}
      </div>
      <div className="table-wrap">
        <table className="tbl ap-utbl">
          <thead><tr><th>User</th><th>Roles</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
          <tbody>
            {list.length === 0 ? <tr><td colSpan={5}><EmptyState icon={<UserSearch />} title="No users found" description={q ? `Nobody matches “${q}”.` : "This company has no users."} /></td></tr> : list.map((u) => (
              <tr key={u.id} className={u.status !== "ACTIVE" ? "ap-dim" : undefined}>
                <td><div className="cell-user"><Avatar name={u.fullName} /><div><b>{u.fullName}{u.isDefault && <span className="badge violet" style={{ marginLeft: 6 }}><KeyRound />Default user</span>}</b><small>{u.email}</small></div></div></td>
                <td>{u.roleList.length ? <>{u.roleList.slice(0, 3).join(", ")}{u.roleList.length > 3 && <small>+{u.roleList.length - 3} more</small>}</> : "—"}</td>
                <td><StatusBadge lookups={lookups} type="UserStatus" code={u.status} /></td>
                <td>{fmtDateTime(u.lastLoginAt)}</td>
                <td className="actions"><button type="button" className="icon-btn-sm" aria-label="User actions" onClick={(e) => setMenu({ anchor: e.currentTarget, id: u.id })}><MoreHorizontal /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {menu && <Menu anchor={menu.anchor} onClose={() => setMenu(null)} items={[
        { label: "Impersonate this user", icon: <VenetianMask />, onClick: () => { const u = users.find((x) => x.id === menu.id); if (u?.status === "ACTIVE") onImpersonate(menu.id); else toast(`${u?.fullName ?? "This user"} is not active`, { tone: "warn" }); } },
      ]} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Usage
export function UsageTab({ tenant, usage, error, reload }: { tenant: TenantDetail; usage: UsageOverview | null; error: LoadError | null; reload: () => void }) {
  const toast = useToast();
  const [target, setTarget] = useState<{ usage: TenantUsage; meterCode?: string } | null>(null);
  const [revoke, setRevoke] = useState<UsageOverview["overrides"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = useMemo(() => pivotUsage(usage?.rows ?? [])[0] ?? null, [usage]);
  const tu: TenantUsage = mine ?? { tenantId: tenant.id, tenantCode: tenant.code, tenantName: tenant.displayName, planCode: null, byMeter: {} };
  const hot = USAGE_METRICS.filter((m) => { const r = tu.byMeter[m.code]; return r?.limitValue && r.usedValue / r.limitValue >= 0.8; });
  const live = (usage?.overrides ?? []).filter((o) => !o.revokedAt);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!usage) return <Skeleton style={{ height: 240 }} />;
  return (
    <>
      {hot.length > 0 && (
        <div className="banner warn"><Gauge /><div><b>{hot.length} meter{hot.length === 1 ? "" : "s"} above 80%</b><p>{hot.map((m) => m.label).join(", ")} {hot.length === 1 ? "is" : "are"} close to the plan limit. Upselling or a limit override lifts {hot.length === 1 ? "it" : "them"}.</p></div><Link className="btn secondary sm" href="/admin/usage">Usage &amp; Quotas</Link></div>
      )}
      <div className="row ap-wrap" style={{ justifyContent: "flex-end", gap: 8, margin: "0 0 12px" }}>
        <span className="muted small" style={{ marginRight: "auto" }}>{mine ? `Snapshot of ${fmtDate(Object.values(tu.byMeter)[0]?.snapshotDate ?? null)}` : "No snapshot yet for this company"}</span>
        <RefreshUsageButton tenantId={tenant.id} onDone={reload} small />
        <button type="button" className="btn primary sm" disabled={!usage.meters.length} onClick={() => setTarget({ usage: tu })}><SlidersHorizontal />Override limit</button>
      </div>
      {!mine ? <EmptyState icon={<Gauge />} title="No usage captured yet" description="Refresh usage to take today's snapshot of users, branches, invoices and storage." action={<RefreshUsageButton tenantId={tenant.id} onDone={reload} />} /> : (
        <div className="grid-3 ap-ugrid">
          {USAGE_METRICS.map((m, i) => {
            const r = tu.byMeter[m.code];
            const pct = r?.limitValue ? (r.usedValue / r.limitValue) * 100 : 0;
            return (
              <div key={m.code} className={cn("panel ap-ucard", meterTone(pct))} style={{ ["--i" as string]: i }}>
                <div className="ap-ucard-h"><span className={cn("icon-tile", pct >= 100 ? "red" : pct >= 80 ? "orange" : undefined)}><m.icon /></span>
                  <div><b>{m.label}</b><small>{!r ? "Not captured" : r.limitValue === null ? "No plan limit" : pct >= 100 ? "Limit reached" : pct >= 80 ? "Approaching limit" : "Within plan"}{r?.overrideLimitValue !== null && r?.overrideLimitValue !== undefined ? " · override" : ""}</small></div>
                  <em>{r?.limitValue ? `${Math.round(pct)}%` : "—"}</em></div>
                <div className="ap-ucard-n"><b>{short(r?.usedValue ?? 0)}{m.unit}</b><span>of {r?.limitValue === null || !r ? "∞" : `${short(r.limitValue)}${m.unit}`}</span></div>
                <Meter used={r?.usedValue ?? 0} limit={r?.limitValue ?? null} text="" />
                <button type="button" className="btn ghost sm ap-mt" onClick={() => setTarget({ usage: tu, meterCode: m.code })}><SlidersHorizontal />Override</button>
              </div>
            );
          })}
        </div>
      )}
      <div className="panel flush ap-mt">
        <div className="panel-head"><div><h3>Limit overrides</h3><p>One live override per meter · revoked overrides stay in the history</p></div></div>
        {(usage.overrides ?? []).length === 0 ? <EmptyState icon={<SlidersHorizontal />} title="No overrides" description="Plan limits apply to every meter." /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Meter</th><th className="num">Previous</th><th className="num">New limit</th><th>Expires</th><th>Overage</th><th>Reason</th><th>By</th><th>Status</th><th /></tr></thead>
            <tbody>{usage.overrides.map((o) => (
              <tr key={o.id}>
                <td><b>{o.meterName}</b></td>
                <td className="num">{o.previousLimit === null ? "—" : fmt(o.previousLimit)}</td>
                <td className="num"><b>{fmt(o.limitValue)}</b></td>
                <td>{o.expiresOn ? fmtDate(o.expiresOn) : "Never"}</td>
                <td>{o.billOverage === "NO" ? "Goodwill" : o.billOverage === "CUSTOM" ? `Custom ${rs(o.customPrice)}` : "Plan rate"}</td>
                <td>{o.reason}</td>
                <td>{o.appliedBy ?? "—"}<small>{fmtDate(o.createdAt)}</small></td>
                <td>{o.revokedAt ? <span className="badge neutral dot">Revoked</span> : <span className="badge good dot">Live</span>}</td>
                <td className="actions">{!o.revokedAt && <button type="button" className="btn ghost sm" onClick={() => setRevoke(o)}>Revoke</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {live.length > 0 && <div className="table-foot"><span>{live.length} live override{live.length === 1 ? "" : "s"}</span></div>}
      </div>
      <OverrideModal target={target} meters={usage.meters} onClose={() => setTarget(null)} onDone={() => { setTarget(null); reload(); }} />
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} title="Revoke this override?" confirmLabel="Revoke" danger busy={busy}
        onConfirm={async () => {
          if (!revoke) return;
          setBusy(true);
          try { await revokeUsageOverride(revoke.id, revoke.rowVersion); toast(`${revoke.meterName} back to the plan limit`, { tone: "warn" }); setRevoke(null); reload(); }
          catch (e) { toast(adminErrorMessage(e, "Could not revoke the override"), { tone: "danger" }); }
          finally { setBusy(false); }
        }}>
        {revoke && <>{revoke.meterName} goes back to {revoke.previousLimit === null ? "the plan limit" : fmt(revoke.previousLimit)} for {tenant.displayName}.</>}
      </ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------------------------------------- Billing
const MOVE_TONE: Record<string, string> = { NEW: "good", EXPANSION: "good", REACTIVATION: "good", CONTRACTION: "warn", CHURN: "danger", NONE: "neutral" };
export function BillingTab({ tenant, sub, lookups, onAction, reloadKey }: { tenant: TenantDetail; sub: SubscriptionDetail | null; lookups: LookupsResponse; onAction: (a: SubscriptionAction) => void; reloadKey: number }) {
  const [history, setHistory] = useState(false);
  const [billingKey, setBillingKey] = useState(0);
  return (
    <div className="split ap-split-wide">
      <div className="stack">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Subscription events</h3><p>Every change with its MRR movement (append-only)</p></div>
            {sub && <div className="panel-actions"><button type="button" className="btn ghost sm" onClick={() => setHistory(true)}><History />Row history</button></div>}</div>
          {!sub ? <EmptyState icon={<Repeat />} title="No subscription" description="Start one to bill this company." action={<button type="button" className="btn primary sm" onClick={() => onAction("start")}><Rocket />Start subscription</button>} /> : sub.events.length === 0 ? <EmptyState title="No events yet" /> : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Date</th><th>Event</th><th>Plan</th><th className="num">MRR before</th><th className="num">MRR after</th><th>Movement</th><th>By</th></tr></thead>
              <tbody>{sub.events.map((ev) => (
                <tr key={ev.id}>
                  <td>{fmtDate(ev.effectiveOn)}<small>{fmtDateTime(ev.occurredAt)}</small></td>
                  <td><b>{labelOf(lookups, "SubscriptionEventType", ev.eventType)}</b>{(ev.note || ev.trialDaysAdded) && <small>{ev.trialDaysAdded ? `+${ev.trialDaysAdded} days` : ""}{ev.note ? `${ev.trialDaysAdded ? " · " : ""}${ev.note}` : ""}</small>}</td>
                  <td>{ev.fromPlan && ev.toPlan && ev.fromPlan !== ev.toPlan ? `${ev.fromPlan} → ${ev.toPlan}` : ev.toPlan ?? ev.fromPlan ?? "—"}{ev.toSeats !== null && ev.toSeats !== ev.fromSeats && <small>{ev.fromSeats ?? "—"} → {ev.toSeats} seats</small>}</td>
                  <td className="num">{fmt(ev.mrrBefore)}</td>
                  <td className="num">{fmt(ev.mrrAfter)}</td>
                  <td><span className={`badge ${MOVE_TONE[ev.movement] ?? "neutral"}`}>{ev.movement.toLowerCase()}</span></td>
                  <td>{ev.staff ?? "system"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
        {/* Phase 41: the company's platform invoices (row drawer, payments) */}
        <TenantInvoicesPanel tenantId={tenant.id} tenantCode={tenant.code} lookups={lookups} hasSubscription={!!sub && sub.status !== "TRIAL"} onChanged={() => setBillingKey((n) => n + 1)} />
      </div>
      <div className="stack">
        <SubscriptionCard sub={sub} tenant={tenant} onAction={onAction} seatsUsed={tenant.users.filter((u) => u.status === "ACTIVE").length} />
        {sub && (
          <div className="panel">
            <div className="panel-head"><div><h3>Actions</h3><p>Each writes a subscription event</p></div></div>
            <div className="stack">
              <button type="button" className="btn secondary" onClick={() => onAction("plan")}><ArrowUpDown />Change plan</button>
              {sub.status === "TRIAL" && <button type="button" className="btn secondary" onClick={() => onAction("trial")}><CalendarPlus />Extend trial</button>}
              <button type="button" className="btn secondary" onClick={() => onAction("renew")}><Repeat />Renew now</button>
              <button type="button" className="btn danger" disabled={sub.cancelAtPeriodEnd} onClick={() => onAction("cancel")}><XCircle />{sub.cancelAtPeriodEnd ? "Cancellation scheduled" : "Cancel subscription"}</button>
            </div>
          </div>
        )}
        {/* Phase 41: dunning state (policy, stage track, open case) */}
        <TenantDunningPanel tenantId={tenant.id} reloadKey={`${reloadKey}:${billingKey}`} />
      </div>
      {sub && (
        <Modal open={history} onClose={() => setHistory(false)} title="Subscription history" subtitle={`${sub.planName} · ${tenant.displayName}`} wide>
          <AdminHistoryTab table="Subscriptions" id={sub.id} reloadKey={reloadKey} />
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Flags, Integrations
export function FlagsTab({ tenant }: { tenant: TenantDetail }) {
  return (
    <div className="grid-2">
      <div className="panel">
        <div className="panel-head"><div><h3>Modules</h3><p>Read-only here · edit them on the Overview tab</p></div><div className="panel-actions"><Link className="btn ghost sm" href="/admin/features">Global rollout<ArrowRight /></Link></div></div>
        <div className="ap-flags">
          {MODULES.map((m) => {
            const on = tenant.modules.some((x) => x.moduleKey === m.key && x.enabled);
            return <label key={m.key} className="ap-flag locked"><span className="icon-well"><m.icon /></span><div><b>{m.label}</b><small>{on ? "Enabled" : "Off"}</small></div><span className="switch"><input type="checkbox" checked={on} disabled readOnly /><i /></span></label>;
          })}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Beta &amp; rollouts</h3><p>Early access features for this company</p></div></div>
        <div className="list"><div className="list-item"><span className="icon-well violet"><ShieldCheck /></span><div><b>Beta programme</b><small>{tenant.isBeta ? "This company is in the beta programme" : "Not in the beta programme"}</small></div><span className="spacer" /><span className={cn("badge", tenant.isBeta ? "violet" : "neutral")}>{tenant.isBeta ? "Beta" : "Off"}</span></div></div>
        <EmptyState title="Targeted with segments" description="Feature flags reach a company through segments and rules. Manage them in Feature Flags." action={<Link className="btn secondary sm" href="/admin/features">Open Feature Flags<ArrowRight /></Link>} />
      </div>
    </div>
  );
}
export function IntegrationsTab({ tenant }: { tenant: TenantDetail }) {
  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>API keys &amp; webhooks</h3><p>Masked by default. Revealing a key is logged.</p></div><div className="panel-actions"><Link className="btn secondary sm" href="/admin/integrations"><Webhook />API &amp; Webhooks</Link></div></div>
      <EmptyState icon={<Webhook />} title={`No API keys for ${tenant.code.toUpperCase()}`} description="Company API keys and webhooks are managed on the platform API & Webhooks page." action={<Link className="btn secondary sm" href="/admin/integrations">Open API &amp; Webhooks<ArrowRight /></Link>} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Activity
export function ActivityTab({ tenant, sessions, sessionsError, reloadSessions, reloadKey }: { tenant: TenantDetail; sessions: ImpersonationSession[] | null; sessionsError: LoadError | null; reloadSessions: () => void; reloadKey: number }) {
  const toast = useToast();
  const [ending, setEnding] = useState<string | null>(null);
  const end = async (s: ImpersonationSession) => {
    setEnding(s.id);
    try { await endImpersonation(s.id); toast("Support session ended · recorded in the audit log", { tone: "good" }); reloadSessions(); }
    catch (e) { toast(adminErrorMessage(e, "Could not end the session"), { tone: "danger" }); }
    finally { setEnding(null); }
  };
  return (
    <div className="stack">
      <div className="panel flush">
        <div className="panel-head"><div><h3>Support sessions</h3><p>Impersonation at {tenant.displayName}: time-boxed, with a reason; the company sees the same list</p></div></div>
        {sessionsError ? <div style={{ padding: 16 }}><ErrorState message={sessionsError.message} reference={sessionsError.reference} onRetry={reloadSessions} /></div> : !sessions ? <div style={{ padding: 16 }}><Skeleton style={{ height: 60 }} /></div> : sessions.length === 0 ? <EmptyState icon={<VenetianMask />} title="No support sessions" description="Sessions started with Impersonate appear here." /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Started</th><th>Staff</th><th>Signed in as</th><th>Reason</th><th>Limit</th><th>Mode</th><th>Status</th><th /></tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id}>
                <td>{fmtDateTime(s.startedAt)}</td><td>{s.staff ?? "—"}</td><td>{s.targetUserLabel}</td><td>{s.reason}</td><td>{s.timeLimitMinutes} min</td>
                <td>{s.isReadOnly ? <span className="badge info">Read-only</span> : <span className="badge warn">Full access</span>}</td>
                <td>{s.live ? <span className="badge danger dot">Live · until {new Date(s.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span> : <span className="badge neutral dot">Ended{s.endedAt ? ` ${fmtDateTime(s.endedAt)}` : ""}{s.endReason ? ` · ${s.endReason.toLowerCase().replace(/_/g, " ")}` : ""}</span>}</td>
                <td className="actions">{s.live && <button type="button" className="btn ghost sm" disabled={ending === s.id} onClick={() => end(s)}><LogOut />End</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Activity &amp; audit</h3><p>Every change to the company record, its contacts, modules and notes</p></div></div>
        <AdminHistoryTab table="Tenants" id={tenant.id} reloadKey={reloadKey} labels={{ TenantContacts: "Contact", TenantModules: "Module", TenantNotes: "Note", TenantAddons: "Add-on" }} />
      </div>
    </div>
  );
}
