"use client";

import {
  Activity, Check, Copy, History, KeyRound, Laptop, LogOut, Pencil, RefreshCw, ShieldCheck, ShieldOff, ShieldX, Trash2, UserCheck, UserRound, UserX,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PERMISSION_ACTIONS, type PermissionModule, type UserActivity, type UserDetail, type UserSession } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { initialsOf } from "@/features/auth/initials";
import { ApiError } from "@/lib/api/errors";
import { getPermissionCatalogue, getRole, getUser, listUserActivity, listUserSessions, removeUser, resetUserPassword, revokeUserSessions, userAction } from "../api";
import { avatarClass, generatePassword, RolePill, rs, StatusBadge, whenLabel } from "./access-ui";

type Tab = "profile" | "perm" | "sess" | "act" | "hist";
type Confirm = "suspend" | "reactivate" | "remove" | "reset" | null;
const ACT_LETTER: Record<string, string> = { VIEW: "V", CREATE: "C", EDIT: "E", APPROVE: "A", POST: "P", DELETE: "D", EXPORT: "X" };
const MODULE_LABEL: Record<string, string> = {
  FINANCE: "Finance", SALES_PURCHASES: "Sales & Purchases", INVENTORY: "Inventory", HR_PAYROLL: "HR & Payroll",
  DISTRIBUTION: "Distribution", SYSTEM: "System", PROFILE: "My Profile",
};
const VERB: Record<string, string> = { INSERT: "Created", UPDATE: "Updated", DELETE: "Deleted" };
/** "UserSessions" → "user sessions" */
const tableLabel = (t: string) => t.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** Template user detail drawer (9E-cash-users.js openUser). */
export function UserDrawer({ userId, me, can, onClose, onEdit, onChanged }: {
  userId: string | null;
  me: string;
  can: { edit: boolean; remove: boolean };
  onClose: () => void;
  onEdit: (id: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [activity, setActivity] = useState<UserActivity[]>([]);
  const [effective, setEffective] = useState<{ module: string; rows: { label: string; actions: Record<string, boolean> }[] }[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [attempt, setAttempt] = useState(0);

  // A different user opens on the Profile tab with fresh data.
  const [prevId, setPrevId] = useState(userId);
  if (userId !== prevId) {
    setPrevId(userId);
    setTab("profile");
    setUser(null);
    setError(null);
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [u, s, a, catalogue] = await Promise.all([getUser(userId), listUserSessions(userId), listUserActivity(userId), getPermissionCatalogue()]);
        const roles = await Promise.all(u.roles.map((r) => getRole(r.id)));
        if (cancelled) return;
        const granted = new Set(roles.flatMap((r) => r.permissions));
        setUser(u);
        setSessions(s);
        setActivity(a);
        setEffective(effectiveOf(catalogue, granted));
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the user" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const refresh = () => {
    setAttempt((n) => n + 1);
    onChanged();
  };

  const run = async () => {
    if (!user || !confirm) return;
    setBusy(true);
    try {
      if (confirm === "remove") {
        await removeUser(user.id, user.rowVersion);
        toast(`${user.name} removed`, { tone: "good" });
        setConfirm(null);
        onChanged();
        onClose();
        return;
      }
      if (confirm === "reset") {
        await resetUserPassword(user.id, { temporaryPassword: tempPassword, rowVersion: user.rowVersion });
        toast(`Temporary password set · ${user.name} must change it at next sign-in`, { tone: "good" });
      } else {
        await userAction(user.id, confirm, user.rowVersion);
        toast(confirm === "suspend" ? `${user.name} suspended and signed out everywhere` : `${user.name} reactivated`, { tone: "good" });
      }
      setConfirm(null);
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong", { tone: "danger" });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (sessionId?: string) => {
    if (!user) return;
    try {
      await revokeUserSessions(user.id, sessionId);
      toast(sessionId ? "Device signed out" : `${user.name} signed out of all devices`, { tone: "good" });
      setSessions(await listUserSessions(user.id));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not sign out", { tone: "danger" });
    }
  };

  const self = user?.id === me;
  const locked = !!user?.isDefaultUser;
  const foot = user && can.edit && (
    <>
      {can.remove && !self && !locked && <Button variant="ghost" className="text-danger" icon={<Trash2 />} onClick={() => setConfirm("remove")}>Remove</Button>}
      {!self && <Button variant="ghost" icon={<KeyRound />} onClick={() => { setTempPassword(generatePassword()); setConfirm("reset"); }}>Reset password</Button>}
      <span className="spacer" />
      {!self && !locked && (
        user.status === "SUSPENDED"
          ? <Button icon={<UserCheck />} onClick={() => setConfirm("reactivate")}>Reactivate</Button>
          : <Button variant="danger" icon={<UserX />} onClick={() => setConfirm("suspend")}>Suspend</Button>
      )}
      <Button variant="primary" icon={<Pencil />} onClick={() => onEdit(user.id)}>Edit access</Button>
    </>
  );

  return (
    <Drawer open={!!userId} onClose={onClose} title="User details" subtitle={user?.email} wide className="cu-ud" foot={foot || undefined}>
      {error ? (
        <ErrorState {...error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !user ? (
        <><Skeleton style={{ height: 72 }} /><div className="mt"><Skeleton style={{ height: 240 }} /></div></>
      ) : (
        <>
          <div className="cu-ud-hero">
            <span className={cn("avatar lg", avatarClass(user.name))}>{initialsOf(user.name)}</span>
            <div>
              <h3>{user.name}{self && <> <span className="cu-you">You</span></>}</h3>
              <p>{user.jobTitle ?? "—"}{user.department ? ` · ${user.department}` : ""}</p>
              <div className="cu-ud-tags">
                {user.roles.map((r) => <RolePill key={r.id} role={r} />)}
                <StatusBadge status={user.status} />
                {user.mfaEnabled ? <span className="cu-mfa on"><ShieldCheck />MFA on</span> : <span className="cu-mfa off"><ShieldOff />MFA off</span>}
              </div>
            </div>
          </div>
          {locked && <div className="mb"><Banner tone="info" title="Company owner account">Created with the company: it holds every role and can&apos;t be suspended or removed.</Banner></div>}
          <div className="tabs cu-ud-tabs" role="tablist">
            {([["profile", "Profile", UserRound], ["perm", "Permissions", ShieldCheck], ["sess", "Sessions", Laptop], ["act", "Activity", Activity], ["hist", "History", History]] as const).map(([k, l, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "active" : undefined} onClick={() => setTab(k)}>
                <Icon />{l}{k === "sess" && <i>{sessions.length}</i>}
              </button>
            ))}
          </div>

          {tab === "profile" && (
            <div className="cu-ud-pane active">
              <div className="dl cu-ud-dl">
                <div><span>Email</span><b>{user.email}</b></div>
                <div><span>Phone</span><b>{user.phone ?? "—"}</b></div>
                <div><span>Employee</span><b>{user.isExternal ? `External · ${user.externalOrg ?? ""}` : "Linking to employees arrives in Phase 11"}</b></div>
                <div><span>Branches</span><b>{user.branches.map((b) => b.name).join(", ") || "None"}</b></div>
                <div><span>Approval limit</span><b>{user.approvalLimit ? rs(user.approvalLimit) : "No approvals"}</b></div>
                <div><span>Data scope</span><b>{{ OWN: "Own records", BRANCH: "Their branches", ALL: "All company" }[user.dataScope] ?? user.dataScope}</b></div>
                <div><span>Last sign-in</span><b>{whenLabel(user.lastLoginAt)}{user.lastLoginIp ? ` · ${user.lastLoginIp}` : ""}</b></div>
                <div><span>Member since</span><b>{new Date(user.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</b></div>
                <div><span>Session timeout</span><b>{user.sessionTimeoutMin < 60 ? `${user.sessionTimeoutMin} minutes` : `${user.sessionTimeoutMin / 60} hour${user.sessionTimeoutMin === 60 ? "" : "s"}`}</b></div>
                <div><span>Login hours</span><b>{user.loginHours === "ANY" ? "Anytime" : user.loginHours === "BUSINESS" ? "Mon–Sat, 09:00 – 19:00" : `Mon–Sat, ${user.loginFrom} – ${user.loginTo}`}</b></div>
                {user.ipRestricted && <div><span>Office networks</span><b>{user.ipAllowlist.join(", ")}</b></div>}
                {user.mustChangePassword && <div><span>Password</span><b>Must change at next sign-in</b></div>}
              </div>
            </div>
          )}

          {tab === "perm" && (
            <div className="cu-ud-pane active">
              <div className="banner info cu-ud-ban">
                <ShieldCheck />
                <div><b>Inherited from {user.roles.map((r) => r.name).join(" + ") || "Employee"}</b><p>Plus the Employee role every user holds (My Profile). No user-level overrides.</p></div>
              </div>
              {effective.length ? effective.map((g) => (
                <div key={g.module} className="cu-eff">
                  <h5>{MODULE_LABEL[g.module] ?? g.module}<em>{g.rows.length} modules</em></h5>
                  {g.rows.map((row) => (
                    <div key={row.label} className="cu-eff-row">
                      <span>{row.label}</span>
                      <div>{PERMISSION_ACTIONS.map((a) => (a in row.actions ? <i key={a} className={row.actions[a] ? "on" : undefined} title={a.toLowerCase()}>{ACT_LETTER[a]}</i> : null))}</div>
                    </div>
                  ))}
                </div>
              )) : <div className="empty-state"><h4>No permissions</h4></div>}
            </div>
          )}

          {tab === "sess" && (
            <div className="cu-ud-pane active">
              <div className="cu-sess">
                {sessions.length ? sessions.map((s) => (
                  <div key={s.id} className="cu-ses">
                    <span className="icon-well"><Laptop /></span>
                    <div><b>{s.deviceLabel ?? "Browser"}{s.current && <> <span className="badge good">Current</span></>}</b><small>IP {s.ipAddress ?? "—"} · signed in {whenLabel(s.signedInAt)} · active {whenLabel(s.lastActiveAt)}</small></div>
                    {can.edit && !s.current && <Button size="sm" icon={<LogOut />} onClick={() => revoke(s.id)}>Revoke</Button>}
                  </div>
                )) : <div className="empty-state"><h4>Not signed in anywhere</h4></div>}
              </div>
              {can.edit && sessions.length > 0 && <Button variant="ghost" size="sm" className="cu-ses-all" icon={<ShieldX />} onClick={() => revoke()}>Sign out of all devices</Button>}
            </div>
          )}

          {tab === "act" && (
            <div className="cu-ud-pane active">
              {activity.length ? (
                <ol className="cu-audit">
                  {activity.map((a, i) => (
                    <li key={`${a.occurredAt}${i}`} style={{ ["--i" as string]: i }}>
                      <span>{a.action === "INSERT" ? <Check /> : a.action === "DELETE" ? <Trash2 /> : <RefreshCw />}</span>
                      <div><b>{VERB[a.action] ?? a.action} {tableLabel(a.table)}</b><small>{whenLabel(a.occurredAt)}</small></div>
                    </li>
                  ))}
                </ol>
              ) : <div className="empty-state"><h4>No activity yet</h4><p>Changes this user makes show here.</p></div>}
            </div>
          )}

          {tab === "hist" && <div className="cu-ud-pane active"><HistoryTab schema="Company" table="Users" id={user.id} /></div>}

          <ConfirmDialog
            open={!!confirm}
            onClose={() => setConfirm(null)}
            onConfirm={run}
            busy={busy}
            danger={confirm === "suspend" || confirm === "remove"}
            title={{ suspend: `Suspend ${user.name}?`, reactivate: `Reactivate ${user.name}?`, remove: `Remove ${user.name}?`, reset: `Reset ${user.name}'s password?` }[confirm ?? "suspend"]}
            confirmLabel={{ suspend: "Suspend", reactivate: "Reactivate", remove: "Remove user", reset: "Set temporary password" }[confirm ?? "suspend"]}
          >
            {confirm === "suspend" && "They are signed out of every device and can't sign in until reactivated. Their history is kept."}
            {confirm === "reactivate" && "They can sign in again with their current password."}
            {confirm === "remove" && "They lose access for good and are signed out everywhere. Their name stays on everything they did."}
            {confirm === "reset" && (
              <>
                <p>They are signed out everywhere and must choose a new password at next sign-in. Share this temporary password with them securely:</p>
                <div className="cu-pwd" style={{ marginTop: 10 }}>
                  <input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} aria-label="Temporary password" spellCheck={false} />
                  <button type="button" className="icon-btn-sm" aria-label="Generate" onClick={() => setTempPassword(generatePassword())}><RefreshCw /></button>
                  <button type="button" className="icon-btn-sm" aria-label="Copy" onClick={() => navigator.clipboard?.writeText(tempPassword).then(() => toast("Copied", { tone: "info", ms: 1200 }))}><Copy /></button>
                </div>
              </>
            )}
          </ConfirmDialog>
        </>
      )}
    </Drawer>
  );
}

/** Effective grants per module, only resources the user can do something with. */
function effectiveOf(catalogue: PermissionModule[], granted: Set<string>) {
  return catalogue
    .map((m) => ({
      module: m.module,
      rows: m.resources
        .filter((r) => Object.values(r.actions).some((code) => granted.has(code)))
        .map((r) => ({ label: r.label, actions: Object.fromEntries(Object.entries(r.actions).map(([a, code]) => [a, granted.has(code)])) })),
    }))
    .filter((m) => m.rows.length);
}
