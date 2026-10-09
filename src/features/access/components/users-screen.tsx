"use client";

import { Download, MailCheck, MapPin, Search, Send, Shield, ShieldOff, UserPlus, Users, UserSearch, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PendingInvite, Role, SignInLink, UserListItem } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { listInvites, resendInvite, revokeInvite } from "@/features/work/api";
import { LinkModal } from "@/features/work/components/link-modal";
import { initialsOf } from "@/features/auth/initials";
import { ApiError } from "@/lib/api/errors";
import { listBranches } from "@/features/settings/api";
import { listRoles, listUsers } from "../api";
import { avatarClass, RoleIcon, RolePill, StatusBadge, statusLabel, whenLabel } from "./access-ui";
import { UserDrawer } from "./user-drawer";
import { UserWizard } from "./user-wizard";

type Branch = { id: string; code: string; name: string };
type StatusFilter = "all" | "ACTIVE" | "SUSPENDED";

/** Template app/settings/users (9E-cash-users.js usersMount). */
export function UsersScreen({ me, myName, companyName, can }: { me: string; myName?: string; companyName: string; can: { create: boolean; edit: boolean; remove: boolean; export: boolean } }) {
  const toast = useToast();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [shownLink, setShownLink] = useState<{ link: SignInLink; name: string; phone: string | null } | null>(null);
  const [revoking, setRevoking] = useState<PendingInvite | null>(null);
  const [users, setUsers] = useState<UserListItem[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [role, setRole] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{ editId: string | null } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listUsers(), listRoles(), listBranches({ page: 1, pageSize: 100, sort: "code" }), listInvites().catch(() => [] as PendingInvite[])])
      .then(([u, r, b, inv]) => {
        if (cancelled) return;
        setUsers(u);
        setInvites(inv);
        setRoles(r.filter((x) => x.systemKey !== "EMPLOYEE"));
        setBranches(b.items.filter((x) => x.status === "ACTIVE"));
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load users" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const all = useMemo(() => users ?? [], [users]);
  const holds = (u: UserListItem, roleId: string) => u.roles.some((r) => r.id === roleId);
  const list = all.filter((u) => {
    const text = [u.name, u.email, u.jobTitle, u.department, ...u.roles.map((r) => r.name)].join(" ").toLowerCase();
    return (
      (role === "all" || holds(u, role)) &&
      (branch === "all" || u.branches.some((b) => b.id === branch)) &&
      (status === "all" || u.status === status) &&
      (!q || text.includes(q.trim().toLowerCase()))
    );
  });
  const filtered = role !== "all" || branch !== "all" || status !== "all" || !!q;
  const active = all.filter((u) => u.status === "ACTIVE");
  const counts = { all: all.length, ACTIVE: active.length, SUSPENDED: all.filter((u) => u.status === "SUSPENDED").length };

  const exportCsv = () => {
    const rows = [["Name", "Email", "Job title", "Roles", "Branches", "Status", "Last active"], ...list.map((u) => [u.name, u.email, u.jobTitle ?? "", u.roles.map((r) => r.name).join(" / "), u.branches.map((b) => b.code).join(" "), u.status, u.lastActiveAt ?? ""])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "users.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const afterSave = (id: string | null) => {
    setWizard(null);
    if (id) setFlash(id);
    setRole("all"); setStatus("all"); setBranch("all"); setQ("");
    reload();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Settings / Users</div>
          <h1>Users</h1>
          <p>Everyone who can sign in to {companyName}: their roles, branches, devices and security.</p>
        </div>
        <div className="cu-head-r">
          <span className="tagline">Right people, right access</span>
          <div className="head-actions">
            {can.export && <Button icon={<Download />} onClick={exportCsv} disabled={!users}>Export</Button>}
            {can.create && <Button variant="primary" icon={<UserPlus />} onClick={() => setWizard({ editId: null })}>Add User</Button>}
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState {...error} onRetry={reload} />
      ) : !users ? (
        <>
          <Skeleton style={{ height: 96, borderRadius: 18, marginBottom: 16 }} />
          <Skeleton style={{ height: 380, borderRadius: 18 }} />
        </>
      ) : (
        <>
          <div className="cu-ukpis">
            <div className="cu-uk"><span className="icon-tile"><Users /></span><div><small>Active users</small><b>{active.length}</b><em>{counts.SUSPENDED} suspended · {all.filter((u) => u.isExternal).length} external</em></div></div>
            <div className="cu-uk"><span className="icon-tile blue"><MailCheck /></span><div><small>Pending invites</small><b>{invites.filter((i) => i.status === "PENDING").length}</b><em>{invites.filter((i) => i.status === "EXPIRED").length ? `${invites.filter((i) => i.status === "EXPIRED").length} expired · resend them` : "Invitations expire after 7 days"}</em></div></div>
            <div className="cu-uk"><span className="cu-ring low" style={{ ["--p" as string]: 0 }}><svg viewBox="0 0 44 44"><circle r="18" cx="22" cy="22" /><circle className="v" r="18" cx="22" cy="22" pathLength="100" /></svg><Shield /></span><div><small>MFA coverage</small><b>0%</b><em>Two-step sign-in arrives in Phase 15</em></div></div>
            <div className="cu-uk"><span className="icon-tile violet"><UserPlus /></span><div><small>Total users</small><b>{all.length}</b><em>Seats and plans arrive with billing</em></div></div>
          </div>

          <div className="toolbar cu-utool">
            <label className="search-field"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or role…" /></label>
            <label className="cu-fsel"><MapPin /><select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch"><option value="all">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <span className="spacer" />
            <div className="cu-dirs">
              {(["all", "ACTIVE", "SUSPENDED"] as const).filter((k) => k === "all" || counts[k]).map((k) => (
                <button key={k} type="button" className={status === k ? "active" : undefined} onClick={() => setStatus(k)}>
                  {k === "all" ? "All" : statusLabel(k)}<em>{counts[k]}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="cu-rolechips">
            <span className="cu-catlbl"><Shield />Role</span>
            <button type="button" className={cn("cu-catchip", role === "all" && "on")} onClick={() => setRole("all")}>All roles<em>{all.length}</em></button>
            {roles.map((r) => ({ r, n: all.filter((u) => holds(u, r.id)).length })).filter((x) => x.n).map(({ r, n }) => (
              <button key={r.id} type="button" className={cn("cu-catchip", role === r.id && "on")} onClick={() => setRole(r.id)}>
                <RoleIcon name={r.icon} />{r.name.replace(" (read-only)", "")}<em>{n}</em>
              </button>
            ))}
          </div>

          <div className="panel flush cu-utable">
            <div className="panel-head">
              <div><h3>Team members</h3><p>{list.length} of {all.length} users{filtered ? " · filtered" : ""}</p></div>
              <span className="pill">Click a row for details</span>
            </div>
            <div className="table-wrap">
              <table className="tbl cu-ut">
                <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Branch access</th><th>MFA</th><th>Last active</th><th>Status</th></tr></thead>
                <tbody>
                  {list.length ? list.map((u, k) => (
                    <tr key={u.id} className={cn("cu-urow", u.status.toLowerCase(), "row-in", flash === u.id && "row-flash cu-new")} style={{ ["--ri" as string]: Math.min(k, 20), cursor: "pointer" }} tabIndex={0}
                      onClick={() => setOpenId(u.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(u.id)}>
                      <td>
                        <div className="cell-user">
                          <span className={cn("avatar sm", avatarClass(u.name))}>{initialsOf(u.name)}</span>
                          <div>
                            <b>{u.name}{u.id === me && <> <span className="cu-you">You</span></>}{u.isExternal && <> <span className="cu-ext">External</span></>}</b>
                            <small>{u.jobTitle ?? "—"}{u.isDefaultUser ? " · Company owner" : ""}</small>
                          </div>
                        </div>
                      </td>
                      <td className="cu-mail">{u.email}</td>
                      <td>{u.roles[0] ? <><RolePill role={u.roles[0]} />{u.roles.length > 1 && <span className="cu-bchip more">+{u.roles.length - 1}</span>}</> : <span className="muted">Employee only</span>}</td>
                      <td>
                        <div className="cu-bchips">
                          {branches.length > 0 && u.branches.length === branches.length ? <span className="cu-bchip all">All branches</span> : (
                            <>
                              {u.branches.slice(0, 2).map((b) => <span key={b.id} className="cu-bchip">{b.name}</span>)}
                              {u.branches.length > 2 && <span className="cu-bchip more">+{u.branches.length - 2}</span>}
                              {!u.branches.length && <span className="muted">None</span>}
                            </>
                          )}
                        </div>
                      </td>
                      <td>{u.mfaEnabled ? <span className="cu-mfa on"><Shield />On</span> : <span className="cu-mfa off"><ShieldOff />Off</span>}</td>
                      <td>{whenLabel(u.lastActiveAt)}<small>{u.lastDevice ?? "Not signed in yet"}</small></td>
                      <td><StatusBadge status={u.status} /></td>
                    </tr>
                  )) : (
                    <tr className="no-results"><td colSpan={7}><div className="empty-state"><span className="icon-well lg"><UserSearch /></span><h4>No users match</h4><p>Try another role, branch or status.</p></div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cu-ugrid">
            <div className="panel cu-invp">
              <div className="panel-head"><div><h3>Pending invites</h3><p>Invitations expire after 7 days</p></div><span className="badge info">{invites.length} pending</span></div>
              <div className="cu-invs">
                {invites.length ? invites.map((iv) => (
                  <div key={iv.id} className="cu-inv">
                    <span className={cn("avatar sm", avatarClass(iv.email))}>{initialsOf(iv.fullName ?? iv.email)}</span>
                    <div className="cu-inv-t"><b>{iv.email}</b><small>{[iv.role, `via ${iv.channels.map((c) => (c === "WHATSAPP" ? "WhatsApp" : "email")).join(" & ")}`, iv.invitedBy && `by ${iv.invitedBy.name}`, whenLabel(iv.sentAt)].filter(Boolean).join(" · ")}</small></div>
                    <span className={cn("badge", iv.status === "EXPIRED" ? "danger" : "warn")}>{iv.status === "EXPIRED" ? "Expired" : `Expires ${new Date(iv.expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`}</span>
                    {can.create && (
                      <div className="cu-inv-act">
                        <button type="button" className="btn ghost sm" title="Make a new link (the old one stops working)" onClick={() => void resendInvite(iv.id, iv.rowVersion).then((r) => { setShownLink({ link: r.link, name: iv.fullName ?? iv.email, phone: iv.phone }); reload(); }).catch((e: unknown) => toast(e instanceof ApiError ? e.message : "Could not resend", { tone: "danger" }))}><Send />Resend</button>
                        {can.edit && <button type="button" className="icon-btn-sm cu-x-btn" title="Revoke invite" aria-label="Revoke invite" onClick={() => setRevoking(iv)}><X /></button>}
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="empty-state cu-inv-empty"><span className="icon-well lg"><MailCheck /></span><h4>No pending invites</h4><p>{can.create ? "Use Add User and choose Invite: they set their own password from a one-time link." : "Everyone invited has joined."}</p></div>
                )}
              </div>
            </div>
            <div className="panel cu-post">
              <div className="panel-head"><div><h3>Security posture</h3><p>MFA adoption by role</p></div><span className="badge neutral"><Shield />MFA in Phase 15</span></div>
              <div className="cu-post-list">
                {roles.map((r) => ({ r, n: active.filter((u) => holds(u, r.id)).length })).filter((x) => x.n).map(({ r, n }, i) => (
                  <div key={r.id} className="cu-post-row" style={{ ["--i" as string]: i }}>
                    <RolePill role={r} small />
                    <div className="cu-post-bar"><i style={{ ["--w" as string]: "0%" }} className="part" /></div>
                    <b>0/{n}</b>
                  </div>
                ))}
              </div>
              <div className="cu-post-foot"><span>{active.length} active user{active.length === 1 ? "" : "s"} sign in with a password only until two-step sign-in arrives.</span></div>
            </div>
          </div>
        </>
      )}

      <UserDrawer
        userId={openId}
        me={me}
        can={can}
        onClose={() => setOpenId(null)}
        onEdit={(id) => { setOpenId(null); setWizard({ editId: id }); }}
        onChanged={reload}
        onLink={(link, name, phone) => setShownLink({ link, name, phone })}
      />
      <LinkModal link={shownLink?.link ?? null} name={shownLink?.name ?? ""} phone={shownLink?.phone ?? null} companyName={companyName} onClose={() => setShownLink(null)} />
      <ConfirmDialog open={!!revoking} onClose={() => setRevoking(null)} danger confirmLabel="Revoke invite" title={`Revoke the invitation for ${revoking?.email ?? ""}?`}
        onConfirm={() => revoking && void revokeInvite(revoking.id, revoking.rowVersion).then(() => { toast("Invitation revoked", { tone: "good" }); setRevoking(null); reload(); }).catch((e: unknown) => toast(e instanceof ApiError ? e.message : "Could not revoke", { tone: "danger" }))}>
        The link stops working and the invited account is removed.
      </ConfirmDialog>
      {wizard && (
        <UserWizard editId={wizard.editId} roles={roles} branches={branches} onClose={() => setWizard(null)} onSaved={afterSave} inviterName={myName} companyName={companyName}
          onInvited={(r) => setShownLink({ link: r.link, name: r.user.name, phone: r.user.phone })} />
      )}
    </>
  );
}
