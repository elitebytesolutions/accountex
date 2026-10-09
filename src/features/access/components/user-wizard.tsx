"use client";

import {
  ArrowLeft, ArrowRight, Building2, Check, Clock, Eye, EyeOff, IdCard, KeyRound, Link2, ListChecks, LockKeyhole, MailPlus, MapPin, Network,
  PencilLine, RefreshCw, Send, Shield, Smartphone, Timer, UserPlus, UserRound, Warehouse,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SESSION_TIMEOUTS, USER_MODULES, type Role, type UserDetail, type UserInviteResult } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { initialsOf } from "@/features/auth/initials";
import { ApiError } from "@/lib/api/errors";
import { inviteUser } from "@/features/work/api";
import { createUser, getUser, updateUser } from "../api";
import { avatarClass, generatePassword, passwordScore, RoleIcon, RolePill, rs } from "./access-ui";

type Branch = { id: string; code: string; name: string };
const STEPS: [string, ReactNode][] = [["Method", <Send key="m" />], ["Identity", <IdCard key="i" />], ["Role", <Shield key="r" />], ["Access", <MapPin key="a" />], ["Security", <LockKeyhole key="s" />], ["Review", <ListChecks key="v" />]];
const MODULE_LABEL: Record<string, string> = { FINANCE: "Finance", SALES: "Sales", PURCHASES: "Purchases", INVENTORY: "Inventory", HR: "HR", PAYROLL: "Payroll", REPORTS: "Reports", SETTINGS: "Settings" };
const SCOPES = [["OWN", "Own records", UserRound], ["BRANCH", "Their branches", MapPin], ["ALL", "All company", Building2]] as const;
const SCOPE_HINT: Record<string, string> = { OWN: "Sees only documents they created or are assigned to.", BRANCH: "Sees every document in the branches ticked above.", ALL: "Sees data across all branches and warehouses." };
const TIMEOUT_LABEL: Record<number, string> = { 15: "15 minutes", 30: "30 minutes", 60: "1 hour", 240: "4 hours", 480: "8 hours" };
const LIMIT_MAX = 5_000_000;

type W = {
  fullName: string; email: string; phone: string; department: string; jobTitle: string; isExternal: boolean; externalOrg: string;
  roleIds: string[]; branchIds: string[]; moduleAccess: string[]; approvalLimit: number; dataScope: string;
  ipRestricted: boolean; ipAllowlist: string; sessionTimeoutMin: number; loginHours: string; loginFrom: string; loginTo: string;
  password: string; mustChangePassword: boolean; showPassword: boolean;
  /** Phase 44: invite (one-time link) or create now (temporary password). */
  method: "invite" | "create"; chEmail: boolean; chWa: boolean;
};
const blank = (branches: Branch[]): W => ({
  fullName: "", email: "", phone: "", department: "", jobTitle: "", isExternal: false, externalOrg: "",
  roleIds: [], branchIds: branches.slice(0, 1).map((b) => b.id), moduleAccess: [...USER_MODULES], approvalLimit: 0, dataScope: "BRANCH",
  ipRestricted: false, ipAllowlist: "", sessionTimeoutMin: 60, loginHours: "ANY", loginFrom: "09:00", loginTo: "19:00",
  password: generatePassword(), mustChangePassword: true, showPassword: false,
  method: "invite", chEmail: true, chWa: false,
});
const fromUser = (u: UserDetail): W => ({
  fullName: u.name, email: u.email, phone: u.phone ?? "", department: u.department ?? "", jobTitle: u.jobTitle ?? "", isExternal: u.isExternal,
  externalOrg: u.externalOrg ?? "", roleIds: u.roles.map((r) => r.id), branchIds: u.branches.map((b) => b.id), moduleAccess: u.moduleAccess,
  approvalLimit: u.approvalLimit, dataScope: u.dataScope, ipRestricted: u.ipRestricted, ipAllowlist: u.ipAllowlist.join("\n"),
  sessionTimeoutMin: u.sessionTimeoutMin, loginHours: u.loginHours, loginFrom: u.loginFrom ?? "09:00", loginTo: u.loginTo ?? "19:00",
  password: "", mustChangePassword: false, showPassword: false,
  method: "create", chEmail: false, chWa: false,
});
/** Which wizard step owns a server field error. */
const STEP_OF: Record<string, number> = { temporaryPassword: 1, fullName: 2, email: 2, phone: 2, externalOrg: 2, roleIds: 3, branchIds: 4, ipAllowlist: 5, loginTo: 5 };

/** Template Add / edit user wizard (9E-cash-users.js openWizard): six steps in a wide drawer. */
export function UserWizard({ editId, roles, branches, onClose, onSaved, onInvited, inviterName, companyName }: {
  editId: string | null;
  roles: Role[];
  branches: Branch[];
  onClose: () => void;
  onSaved: (id: string) => void;
  /** Phase 44: the invitation was created; the one-time link is shown once. */
  onInvited?: (r: UserInviteResult) => void;
  inviterName?: string;
  companyName?: string;
}) {
  const toast = useToast();
  const [w, setW] = useState<W | null>(editId ? null : blank(branches));
  const [rowVersion, setRowVersion] = useState(0);
  const [step, setStep] = useState(editId ? 2 : 1);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!editId) return;
    getUser(editId).then((u) => { setW(fromUser(u)); setRowVersion(u.rowVersion); }).catch(() => toast("Could not load the user", { tone: "danger" }));
  }, [editId, toast]);

  // Editing a field clears its error (and a password edit clears the server's temporaryPassword error).
  const clear = (k: string) => setErrs((e) => (k in e ? Object.fromEntries(Object.entries(e).filter(([f]) => f !== k)) : e));
  const set = <K extends keyof W>(k: K, v: W[K]) => { clear(k); setW((x) => (x ? { ...x, [k]: v } : x)); };
  const toggle = (k: "roleIds" | "branchIds" | "moduleAccess", v: string) => { clear(k); setW((x) => (x ? { ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] } : x)); };
  const close = () => { setOpen(false); setTimeout(onClose, 200); };

  const validate = (s: number): boolean => {
    if (!w) return false;
    const e: Record<string, string> = {};
    if (s === 1 && !editId && w.method === "create" && w.password.length < 10) e.password = "At least 10 characters with letters and numbers";
    if (s === 1 && !editId && w.method === "invite" && !w.chEmail && !w.chWa) e.channels = "Choose email or WhatsApp";
    if (s === 2) {
      if (w.fullName.trim().length < 2) e.fullName = "Name is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w.email.trim())) e.email = w.email ? "Enter a valid email" : "Email is required";
      if (w.isExternal && !w.externalOrg.trim()) e.externalOrg = "Organisation is required";
      if (!editId && w.method === "invite" && w.chWa && !w.phone.trim()) e.phone = "Mobile is needed for WhatsApp";
    }
    if (s === 3 && !w.roleIds.length) e.roleIds = "Choose at least one role";
    if (s === 4 && !w.branchIds.length) e.branchIds = "Pick at least one branch";
    if (s === 5) {
      if (w.ipRestricted && !w.ipAllowlist.trim()) e.ipAllowlist = "Add at least one office network";
      if (w.loginHours === "CUSTOM" && !(w.loginFrom < w.loginTo)) e.loginTo = "End time must be after start time";
    }
    setErrs(e);
    return !Object.keys(e).length;
  };

  const next = async () => {
    if (!w || !validate(step)) return;
    if (step < STEPS.length) return setStep(step + 1);
    setBusy(true);
    const body = {
      fullName: w.fullName.trim(), email: w.email.trim(), phone: w.phone || null, department: w.department || null, jobTitle: w.jobTitle || null,
      isExternal: w.isExternal, externalOrg: w.isExternal ? w.externalOrg : null, roleIds: w.roleIds, branchIds: w.branchIds, moduleAccess: w.moduleAccess as (typeof USER_MODULES)[number][],
      approvalLimit: w.approvalLimit, dataScope: w.dataScope, ipRestricted: w.ipRestricted,
      ipAllowlist: w.ipRestricted ? w.ipAllowlist.split(/[\s,]+/).filter(Boolean) : [], sessionTimeoutMin: w.sessionTimeoutMin,
      loginHours: w.loginHours, loginFrom: w.loginHours === "CUSTOM" ? w.loginFrom : null, loginTo: w.loginHours === "CUSTOM" ? w.loginTo : null,
    };
    try {
      if (!editId && w.method === "invite") {
        const r = await inviteUser({ ...body, channels: [...(w.chEmail ? ["EMAIL"] : []), ...(w.chWa ? ["WHATSAPP"] : [])] });
        toast(`${r.user.name} invited`, { tone: "good" });
        setOpen(false);
        setTimeout(() => { onInvited?.(r); onSaved(r.user.id); }, 200);
        return;
      }
      const saved = editId
        ? await updateUser(editId, { ...body, rowVersion })
        : await createUser({ ...body, temporaryPassword: w.password, mustChangePassword: w.mustChangePassword });
      toast(editId ? `${saved.name} updated` : `${saved.name} can sign in now with the temporary password`, { tone: "good" });
      setOpen(false);
      setTimeout(() => onSaved(saved.id), 200);
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        const fields = Object.entries(e.details).map(([f, m]) => [f === "temporaryPassword" ? "password" : f, m[0]!] as const);
        setErrs(Object.fromEntries(fields));
        const target = Math.min(...Object.keys(e.details).map((f) => STEP_OF[f] ?? STEPS.length));
        if (target < STEPS.length) setStep(target);
      } else if (e instanceof ApiError && (e.code === "DB_UNIQUE_VIOLATION" || e.code === "INVITE_PENDING_EXISTS")) {
        setErrs({ email: "This email already has access" });
        setStep(2);
      }
      toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => (errs[k] ? <small className="cu-err">{errs[k]}</small> : null);
  const score = w ? passwordScore(w.password) : 0;
  const pickedRoles = roles.filter((r) => w?.roleIds.includes(r.id));
  const fin = editId ? <><Check />Save changes</> : w?.method === "invite" ? <><Send />Send invite</> : <><UserPlus />Create user</>;

  return (
    <Drawer
      open={open}
      onClose={close}
      title={editId ? `Edit ${w?.fullName ?? "user"}` : "Add user"}
      subtitle={editId ? "Update role, access and security" : "Create their account in six quick steps"}
      wide
      className="cu-wzd"
      foot={
        <>
          <Button variant="ghost" icon={<ArrowLeft />} style={{ visibility: step === 1 || (editId && step === 2) ? "hidden" : undefined }} onClick={() => setStep(step - 1)}>Back</Button>
          <span className="spacer" />
          <span className="cu-wz-count">Step {step} of {STEPS.length}</span>
          <div className={cn("cu-wz-prog", busy && "on")}><i /></div>
          <Button variant={step === STEPS.length ? "lime" : "primary"} disabled={busy || !w} onClick={next}>
            {busy ? "Saving…" : step === STEPS.length ? fin : <>Continue<ArrowRight /></>}
          </Button>
        </>
      }
    >
      <div className="cu-wz">
        <ol className="cu-wz-steps">
          {STEPS.map(([label, icon], i) => (
            <li key={label} className={cn(i + 1 < step && "done", i + 1 === step && "cur")} onClick={() => i + 1 < step && (!editId || i > 0) && setStep(i + 1)}>
              <span>{icon}<b>{i + 1}</b></span><em>{label}</em>
            </li>
          ))}
          <i className="cu-wz-line"><i style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} /></i>
        </ol>
        <div className="cu-wz-body">
          {!w ? <Skeleton style={{ height: 260 }} /> : (
            <div className="cu-wz-pane">
              {step === 1 && (editId ? (
                <><h3 className="cu-wz-h">Existing account</h3><p className="cu-wz-p">This user already signs in with their own password. Use Reset password in their details to issue a new temporary one.</p></>
              ) : (
                <>
                  <h3 className="cu-wz-h">How should they get access?</h3>
                  <p className="cu-wz-p">They sign in with the company code and their work email.</p>
                  <div className="cu-mcards">
                    <button type="button" className={cn("cu-mcard", w.method === "invite" && "on")} onClick={() => set("method", "invite")}>
                      <span className="icon-tile blue"><MailPlus /></span><b>Invite by email / WhatsApp</b><small>They set their own password from a secure one-time link.</small>
                      <span className="cu-mcard-tags"><em>Recommended</em><em>Link valid 7 days</em></span><i className="cu-radio" />
                    </button>
                    <button type="button" className={cn("cu-mcard", w.method === "create" && "on")} onClick={() => set("method", "create")}>
                      <span className="icon-tile orange"><KeyRound /></span><b>Create account now</b><small>Set a temporary password and share it with them securely.</small>
                      <span className="cu-mcard-tags"><em>Instant access</em></span><i className="cu-radio" />
                    </button>
                  </div>
                  {w.method === "invite" ? (
                    <div className="cu-wz-box">
                      <span className="lbl">Send invite via</span>
                      <div className="cu-chan">
                        <label className="cu-chk"><input type="checkbox" checked={w.chEmail} onChange={(e) => set("chEmail", e.target.checked)} /><span><MailPlus />Email</span></label>
                        <label className="cu-chk"><input type="checkbox" checked={w.chWa} onChange={(e) => set("chWa", e.target.checked)} /><span><Smartphone />WhatsApp</span></label>
                      </div>
                      {err("channels")}
                      <div className="cu-bubble"><small>Preview</small><p><b>{inviterName ?? "You"}</b> invited you to join <b>{companyName ?? "the company"}</b> on Accountex as <b>{roles.find((r) => r.id === w.roleIds[0])?.name ?? "…"}</b>. Accept within 7 days: <u>one-time link</u></p></div>
                      <small className="muted">No email provider is connected yet: after sending you get the link to copy or share on WhatsApp.</small>
                    </div>
                  ) : (
                  <div className="cu-wz-box">
                    <span className="lbl">Temporary password</span>
                    <div className="cu-pwd">
                      <input type={w.showPassword ? "text" : "password"} value={w.password} onChange={(e) => set("password", e.target.value)} aria-label="Temporary password" spellCheck={false} />
                      <button type="button" className="icon-btn-sm" aria-label={w.showPassword ? "Hide" : "Show"} onClick={() => set("showPassword", !w.showPassword)}>{w.showPassword ? <EyeOff /> : <Eye />}</button>
                      <Button size="sm" icon={<RefreshCw />} onClick={() => set("password", generatePassword())}>Generate</Button>
                    </div>
                    <div className={cn("cu-meter", `s${score}`)}><i /><i /><i /><i /><span>{["Too weak", "Weak", "Fair", "Strong", "Very strong"][score]}</span></div>
                    {err("password")}
                    <label className="cu-chk inline"><input type="checkbox" checked={w.mustChangePassword} onChange={(e) => set("mustChangePassword", e.target.checked)} /><span>Require a new password at first sign-in</span></label>
                  </div>
                  )}
                </>
              ))}

              {step === 2 && (
                <>
                  <h3 className="cu-wz-h">Who is this user?</h3>
                  <p className="cu-wz-p">Linking an employee keeps HR, payroll and access in sync.</p>
                  <div className="seg cu-idseg">
                    <button type="button" disabled title="Employees arrive in Phase 11"><Link2 />Link existing employee</button>
                    <button type="button" className="active"><PencilLine />Enter manually</button>
                  </div>
                  <div className="form-grid cu-idform">
                    <label><span>Full name *</span><input value={w.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Sobia Khan" />{err("fullName")}</label>
                    <label><span>Work email *</span><input type="email" value={w.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" />{err("email")}</label>
                    <label><span>Mobile</span><input value={w.phone} onChange={(e) => set("phone", e.target.value)} placeholder="03xx-xxxxxxx" />{err("phone")}</label>
                    <label><span>Department</span><input value={w.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Finance" /></label>
                    <label className="full"><span>Job title</span><input value={w.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="e.g. Cashier" /></label>
                    <label className="check full"><input type="checkbox" checked={w.isExternal} onChange={(e) => set("isExternal", e.target.checked)} /> External user (auditor, consultant: not on payroll)</label>
                    {w.isExternal && <label className="full"><span>Organisation *</span><input value={w.externalOrg} onChange={(e) => set("externalOrg", e.target.value)} placeholder="e.g. Audit Partners & Co." />{err("externalOrg")}</label>}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h3 className="cu-wz-h">Choose roles</h3>
                  <p className="cu-wz-p">Roles bundle permissions; a user can hold several. Every user also has the Employee role for My Profile.</p>
                  <div className="cu-rcards">
                    {roles.map((r) => (
                      <button key={r.id} type="button" className={cn("cu-rcard", `t-${r.tone ?? "neutral"}`, w.roleIds.includes(r.id) && "on")} onClick={() => toggle("roleIds", r.id)}>
                        <span className="cu-rcard-ic"><RoleIcon name={r.icon} /></span><b>{r.name}</b>
                        <small>{r.userCount} user{r.userCount === 1 ? "" : "s"}</small><i className="cu-radio" />
                      </button>
                    ))}
                  </div>
                  {err("roleIds")}
                  {pickedRoles.length > 0 && (
                    <div className="cu-preview">
                      <div className="cu-pv-head"><span className={cn("cu-rcard-ic", `t-${pickedRoles[0]!.tone ?? "neutral"}`)}><RoleIcon name={pickedRoles[0]!.icon} /></span><div><b>{pickedRoles.map((r) => r.name).join(" + ")}</b><small>The first role you picked is the primary one.</small></div></div>
                      <ul>{pickedRoles.map((r, i) => <li key={r.id} className="y" style={{ ["--i" as string]: i }}><Check />{r.description ?? r.name}</li>)}</ul>
                    </div>
                  )}
                </>
              )}

              {step === 4 && (
                <>
                  <h3 className="cu-wz-h">Where and how much?</h3>
                  <p className="cu-wz-p">Limit access to branches, modules and approval amounts.</p>
                  <div className="cu-acc-grid">
                    <div className="cu-wz-box">
                      <span className="lbl">Branches <button type="button" className="cu-link" onClick={() => set("branchIds", branches.map((b) => b.id))}>Select all</button></span>
                      <div className="cu-tiles">{branches.map((b) => <label key={b.id} className="cu-tile"><input type="checkbox" checked={w.branchIds.includes(b.id)} onChange={() => toggle("branchIds", b.id)} /><span><MapPin />{b.name}</span></label>)}</div>
                      {err("branchIds")}
                    </div>
                    <div className="cu-wz-box">
                      <span className="lbl">Warehouses</span>
                      <div className="cu-tiles"><label className="cu-tile"><input type="checkbox" disabled /><span><Warehouse />Available in Phase 6</span></label></div>
                    </div>
                  </div>
                  <div className="cu-wz-box">
                    <span className="lbl">Modules <small>{w.moduleAccess.length} of {USER_MODULES.length} on</small></span>
                    <div className="cu-mods">{USER_MODULES.map((m) => <label key={m} className="switch cu-mod"><input type="checkbox" checked={w.moduleAccess.includes(m)} onChange={() => toggle("moduleAccess", m)} /><i /><span>{MODULE_LABEL[m]}</span></label>)}</div>
                  </div>
                  <div className="cu-wz-box">
                    <span className="lbl">Approval limit <small>Max single voucher this user may approve</small></span>
                    <div className="cu-slider">
                      <input type="range" min={0} max={LIMIT_MAX} step={25000} value={Math.min(w.approvalLimit, LIMIT_MAX)} onChange={(e) => set("approvalLimit", Number(e.target.value))} aria-label="Approval limit" style={{ ["--sp" as string]: `${(Math.min(w.approvalLimit, LIMIT_MAX) / LIMIT_MAX) * 100}%` }} />
                      <output style={{ left: `calc(${(Math.min(w.approvalLimit, LIMIT_MAX) / LIMIT_MAX) * 100}% + ${(0.5 - Math.min(w.approvalLimit, LIMIT_MAX) / LIMIT_MAX) * 20}px)` }}>{w.approvalLimit === 0 ? "No approvals" : w.approvalLimit >= LIMIT_MAX ? "Rs 5,000,000+" : rs(w.approvalLimit)}</output>
                    </div>
                    <div className="cu-slider-ticks"><span>None</span><span>Rs 1.25M</span><span>Rs 2.5M</span><span>Rs 3.75M</span><span>Rs 5M+</span></div>
                  </div>
                  <div className="cu-wz-box">
                    <span className="lbl">Data scope</span>
                    <div className="seg cu-scope">{SCOPES.map(([k, l, Icon]) => <button key={k} type="button" className={w.dataScope === k ? "active" : undefined} onClick={() => set("dataScope", k)}><Icon />{l}</button>)}</div>
                    <small className="cu-hint">{SCOPE_HINT[w.dataScope]}</small>
                  </div>
                </>
              )}

              {step === 5 && (
                <>
                  <h3 className="cu-wz-h">Security</h3>
                  <p className="cu-wz-p">Approvers should always use multi-factor sign-in once it is available.</p>
                  <div className="cu-sec">
                    <div className="cu-sec-row"><span className="icon-well"><Smartphone /></span><div><b>Require MFA</b><small>Authenticator app or SMS code: arrives in Phase 15.</small></div><label className="switch"><input type="checkbox" disabled /><i /></label></div>
                    <div className="cu-sec-row">
                      <span className="icon-well blue"><Network /></span>
                      <div><b>IP restriction</b><small>Only allow sign-in from office networks.</small>
                        {w.ipRestricted && <textarea rows={2} className="cu-ips" value={w.ipAllowlist} onChange={(e) => set("ipAllowlist", e.target.value)} placeholder="e.g. 39.32.0.0/16, one per line" />}
                        {err("ipAllowlist")}
                      </div>
                      <label className="switch"><input type="checkbox" checked={w.ipRestricted} onChange={(e) => set("ipRestricted", e.target.checked)} /><i /></label>
                    </div>
                    <div className="cu-sec-row">
                      <span className="icon-well yellow"><Timer /></span><div><b>Session timeout</b><small>Sign out after inactivity.</small></div>
                      <select className="cu-sel-sm" value={w.sessionTimeoutMin} onChange={(e) => set("sessionTimeoutMin", Number(e.target.value))}>{SESSION_TIMEOUTS.map((t) => <option key={t} value={t}>{TIMEOUT_LABEL[t]}</option>)}</select>
                    </div>
                    <div className="cu-sec-row">
                      <span className="icon-well violet"><Clock /></span>
                      <div><b>Login hours</b><small>{w.loginHours === "ANY" ? "Can sign in at any time." : w.loginHours === "BUSINESS" ? "Mon–Sat, 09:00 – 19:00 (company time zone)." : "Custom window, Mon–Sat."}</small>
                        {w.loginHours === "CUSTOM" && <div className="cu-hours"><input type="time" value={w.loginFrom} onChange={(e) => set("loginFrom", e.target.value)} aria-label="From" /><span>to</span><input type="time" value={w.loginTo} onChange={(e) => set("loginTo", e.target.value)} aria-label="To" /></div>}
                        {err("loginTo")}
                      </div>
                      <div className="seg cu-mini-seg">{([["ANY", "Anytime"], ["BUSINESS", "Business"], ["CUSTOM", "Custom"]] as const).map(([k, l]) => <button key={k} type="button" className={w.loginHours === k ? "active" : undefined} onClick={() => set("loginHours", k)}>{l}</button>)}</div>
                    </div>
                  </div>
                </>
              )}

              {step === 6 && (
                <>
                  <h3 className="cu-wz-h">Review &amp; {editId ? "save" : "create"}</h3>
                  <p className="cu-wz-p">Double-check everything: you can change it later.</p>
                  <div className="cu-rev-hero">
                    <span className={cn("avatar lg", avatarClass(w.fullName || "?"))}>{initialsOf(w.fullName || "?")}</span>
                    <div><b>{w.fullName}</b><small>{w.email}</small></div>
                    {pickedRoles[0] && <RolePill role={pickedRoles[0]} />}
                  </div>
                  <div className="cu-rev">
                    <div className="dl">
                      <Row k="Method" v={editId ? "Existing account" : w.method === "invite" ? `Invite by ${[w.chEmail && "email", w.chWa && "WhatsApp"].filter(Boolean).join(" and ")} · link valid 7 days` : `Temporary password${w.mustChangePassword ? " · must change at first sign-in" : ""}`} go={editId ? undefined : () => setStep(1)} />
                      <Row k="Identity" v={`${w.jobTitle || "—"} · ${w.department || "—"}${w.isExternal ? ` · ${w.externalOrg}` : ""}`} go={() => setStep(2)} />
                      <Row k="Roles" v={pickedRoles.map((r) => r.name).join(", ")} go={() => setStep(3)} />
                      <Row k="Branches" v={w.branchIds.length === branches.length ? "All branches" : branches.filter((b) => w.branchIds.includes(b.id)).map((b) => b.name).join(", ")} go={() => setStep(4)} />
                    </div>
                    <div className="dl">
                      <Row k="Approval limit" v={w.approvalLimit ? rs(w.approvalLimit) : "No approvals"} go={() => setStep(4)} />
                      <Row k="Data scope" v={SCOPES.find((s) => s[0] === w.dataScope)?.[1] ?? w.dataScope} go={() => setStep(4)} />
                      <Row k="IP restriction" v={w.ipRestricted ? w.ipAllowlist.split(/[\s,]+/).filter(Boolean).join(", ") : "Off"} go={() => setStep(5)} />
                      <Row k="Session · hours" v={`${TIMEOUT_LABEL[w.sessionTimeoutMin]} · ${w.loginHours === "ANY" ? "Anytime" : w.loginHours === "BUSINESS" ? "Business hours" : `${w.loginFrom}–${w.loginTo}`}`} go={() => setStep(5)} />
                    </div>
                  </div>
                  <div className="cu-next">
                    <b>What happens next</b>
                    <ul>
                      {editId ? (
                        <><li><RefreshCw />Changes apply at their next page load</li><li><ListChecks />Recorded in the user&apos;s history</li></>
                      ) : (
                        w.method === "invite" ? <><li><Send />You get a one-time link to copy or share on WhatsApp</li><li><UserRound />They open it within 7 days and choose their password</li><li><ListChecks />You are notified when they join</li></> : <><li><KeyRound />Share the temporary password with them securely</li><li><UserRound />They sign in with company code, email and that password{w.mustChangePassword ? ", then choose their own" : ""}</li><li><ListChecks />Recorded in the user&apos;s history</li></>
                      )}
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Row({ k, v, go }: { k: string; v: string; go?: () => void }) {
  return <div><span>{k}</span><b>{v || "—"}</b>{go && <button type="button" className="cu-link" onClick={go}>Edit</button>}</div>;
}
