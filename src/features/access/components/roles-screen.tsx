"use client";

import {
  BadgeCheck, BookCheck, Boxes, Check, Copy, Download, Eye, Gauge, Info, Landmark, Lock, PencilLine, Plus, Search, Settings, ShieldCheck,
  ShoppingCart, Trash2, TriangleAlert, Truck, UserRound, Users, WandSparkles, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  PERMISSION_ACTIONS, sodConflicts, type PermissionAction, type PermissionModule, type Role, type RoleDetail, type RoleLimits, type SodRule,
} from "@/shared";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { initialsOf } from "@/features/auth/initials";
import { ApiError } from "@/lib/api/errors";
import { createRole, deleteRole, getPermissionCatalogue, getRole, listRoles, listSodRules, updateRole } from "../api";
import { SodRulesPanel } from "./sod-rules-panel";
import { avatarClass, RoleIcon, rs } from "./access-ui";

const ACT: Record<PermissionAction, [string, LucideIcon]> = {
  VIEW: ["View", Eye], CREATE: ["Create", Plus], EDIT: ["Edit", PencilLine], APPROVE: ["Approve", BadgeCheck],
  POST: ["Post", BookCheck], DELETE: ["Delete", Trash2], EXPORT: ["Export", Download],
};
const GROUP: Record<string, [string, LucideIcon]> = {
  FINANCE: ["Finance", Landmark], SALES_PURCHASES: ["Sales & Purchases", ShoppingCart], INVENTORY: ["Inventory", Boxes],
  HR_PAYROLL: ["HR & Payroll", Users], DISTRIBUTION: ["Distribution", Truck], SYSTEM: ["System", Settings], PROFILE: ["My Profile", UserRound],
};
const BACKDATE = [[0, "Not allowed"], [3, "Up to 3 days"], [7, "Up to 7 days"], [30, "Up to 30 days"], [365, "Any open period"]] as const;
const SALARY = [["HIDDEN", "Hidden"], ["MASKED", "Masked (except own)"], ["FULL", "Full"]] as const;

type Draft = { permissions: Set<string>; branchRestricted: boolean; limits: RoleLimits };
const draftOf = (r: RoleDetail): Draft => ({ permissions: new Set(r.permissions), branchRestricted: r.branchRestricted, limits: { ...r.limits } });
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const changes = (d: Draft, r: RoleDetail) =>
  [...d.permissions].filter((p) => !r.permissions.includes(p)).length +
  r.permissions.filter((p) => !d.permissions.has(p)).length +
  Number(d.branchRestricted !== r.branchRestricted) +
  Number(JSON.stringify(d.limits) !== JSON.stringify(r.limits));

/** Template app/settings/roles (9E-cash-users.js rolesMount): role list, permission matrix, SoD checks, limits, save bar. */
export function RolesScreen({ can }: { can: { create: boolean; edit: boolean; remove: boolean } }) {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [catalogue, setCatalogue] = useState<PermissionModule[]>([]);
  const [sodRules, setSodRules] = useState<SodRule[]>([]);
  const [view, setView] = useState<"roles" | "sod">("roles");
  const [details, setDetails] = useState<Record<string, RoleDetail>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [grp, setGrp] = useState("FINANCE");
  const [q, setQ] = useState("");
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ mode: "new" | "dup" } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [history, setHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRoles(), getPermissionCatalogue(), listSodRules()])
      .then(([r, c, s]) => {
        if (cancelled) return;
        setRoles(r);
        setCatalogue(c);
        setSodRules(s);
        setSel((s) => (s && r.some((x) => x.id === s) ? s : r[0]?.id ?? null));
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load roles" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Load the selected role's grants once; edits live in a draft until saved.
  useEffect(() => {
    if (!sel || details[sel]) return;
    let cancelled = false;
    getRole(sel)
      .then((d) => {
        if (cancelled) return;
        setDetails((x) => ({ ...x, [d.id]: d }));
        setDrafts((x) => (x[d.id] ? x : { ...x, [d.id]: draftOf(d) }));
      })
      .catch(() => toast("Could not load the role", { tone: "danger" }));
    return () => {
      cancelled = true;
    };
  }, [sel, details, toast]);

  const role = roles?.find((r) => r.id === sel) ?? null;
  const detail = sel ? details[sel] : undefined;
  const draft = sel ? drafts[sel] : undefined;
  const locked = !can.edit || role?.systemKey === "ADMIN";
  const dirty = Object.entries(drafts).filter(([id, d]) => details[id] && changes(d, details[id]!) > 0);
  const dirtyCount = dirty.reduce((n, [id, d]) => n + changes(d, details[id]!), 0);
  const group = catalogue.find((m) => m.module === grp);
  const conflicts = draft && role?.systemKey !== "ADMIN" ? sodConflicts(draft.permissions, sodRules) : [];

  const edit = useCallback((fn: (d: Draft) => Draft) => {
    if (!sel) return;
    setDrafts((x) => (x[sel] ? { ...x, [sel]: fn(x[sel]) } : x));
  }, [sel]);
  const setCodes = (codes: string[], on: boolean) =>
    edit((d) => {
      const p = new Set(d.permissions);
      codes.forEach((c) => (on ? p.add(c) : p.delete(c)));
      return { ...d, permissions: p };
    });

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const [id, d] of dirty) {
        const r = details[id]!;
        const saved = await updateRole(id, {
          rowVersion: r.rowVersion,
          ...(!sameSet(d.permissions, new Set(r.permissions)) && { permissions: [...d.permissions] }),
          ...(d.branchRestricted !== r.branchRestricted && { branchRestricted: d.branchRestricted }),
          ...(JSON.stringify(d.limits) !== JSON.stringify(r.limits) && { limits: d.limits }),
        });
        setDetails((x) => ({ ...x, [id]: saved }));
        setDrafts((x) => ({ ...x, [id]: draftOf(saved) }));
      }
      toast(`Saved ${dirtyCount} change${dirtyCount === 1 ? "" : "s"} in ${dirty.map(([id]) => details[id]!.name).join(", ")}`, { tone: "good" });
      setAttempt((n) => n + 1);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };
  const discard = () => setDrafts(Object.fromEntries(Object.entries(details).map(([id, d]) => [id, draftOf(d)])));

  const remove = async () => {
    if (!detail) return;
    try {
      await deleteRole(detail.id, detail.rowVersion);
      toast(`${detail.name} deleted`, { tone: "good" });
      setRemoving(false);
      setSel(null);
      setAttempt((n) => n + 1);
    } catch (e) {
      setRemoving(false);
      toast(e instanceof ApiError ? e.message : "Could not delete", { tone: "danger" });
    }
  };

  const list = (roles ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const has = (code: string | undefined) => !!code && !!draft?.permissions.has(code);
  const was = (code: string | undefined) => !!code && !!detail?.permissions.includes(code);

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Settings / Roles &amp; Permissions</div><h1>Roles &amp; Permissions</h1><p>Control what each role can view, create, approve and post, with live segregation-of-duties checks.</p></div>
        <div className="cu-head-r">
          <span className="tagline">Trust, but verify</span>
          <div className="head-actions">
            {can.create && <Button icon={<Copy />} disabled={!role} onClick={() => setModal({ mode: "dup" })}>Duplicate role</Button>}
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => setModal({ mode: "new" })}>New role</Button>}
          </div>
        </div>
      </div>

      <Tabs items={[{ key: "roles", label: "Roles & permissions" }, { key: "sod", label: "Segregation of duties", count: sodRules.filter((r) => r.isActive).length }]} active={view} onChange={setView} />
      <div className="mt" />
      {view === "sod" ? <SodRulesPanel rules={sodRules} catalogue={catalogue} canEdit={can.edit} onChanged={() => setAttempt((n) => n + 1)} /> : error ? <ErrorState {...error} onRetry={() => setAttempt((n) => n + 1)} /> : !roles ? <Skeleton style={{ height: 520, borderRadius: 18 }} /> : (
        <div className="cu-ro">
          <aside className="panel cu-ro-list">
            <div className="cu-ro-lh"><h3>Roles</h3><span>{roles.length} roles · {roles.filter((r) => r.isSystem).length} system</span></div>
            <label className="search-field"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles…" /></label>
            <ul>
              {list.map((r, i) => {
                const d = drafts[r.id], det = details[r.id];
                return (
                  <li key={r.id} style={{ ["--i" as string]: i }}>
                    <button type="button" className={cn("cu-ro-item", `t-${r.tone ?? "neutral"}`, r.id === sel && "active")} onClick={() => setSel(r.id)}>
                      <span className="cu-rcard-ic"><RoleIcon name={r.icon} /></span>
                      <span className="cu-ro-it">
                        <b>{r.name}{d && det && changes(d, det) > 0 && <i className="cu-chg-dot" title="Unsaved changes" />}</b>
                        <small>{r.isSystem ? "System · " : "Custom · "}{(r.description ?? "").split(",")[0]!.split(".")[0]}</small>
                      </span>
                      <em>{r.userCount}</em>
                    </button>
                  </li>
                );
              })}
              {!list.length && <li className="cu-ro-none">No roles match</li>}
            </ul>
            <div className="cu-ro-note"><Info />System roles can be copied but not renamed or deleted.</div>
          </aside>

          <div className="cu-ro-main">
            {!role || !detail || !draft ? <Skeleton style={{ height: 420, borderRadius: 18 }} /> : (
              <>
                <div className="panel cu-ro-head">
                  <span className={cn("cu-ro-hic", `t-${role.tone ?? "neutral"}`)}><RoleIcon name={role.icon} /></span>
                  <div className="cu-ro-ht">
                    <h2>{role.name} {role.isSystem ? <span className="badge violet"><Lock />System</span> : <span className="badge lime">Custom</span>}</h2>
                    <p>{role.description ?? "—"}</p>
                    <div className="cu-ro-users">
                      <span className="avatar-stack">
                        {detail.users.slice(0, 5).map((u) => <span key={u.id} className={cn("avatar xs", avatarClass(u.name))} title={u.name}>{initialsOf(u.name)}</span>)}
                        {detail.users.length > 5 && <span className="avatar xs dark">+{detail.users.length - 5}</span>}
                      </span>
                      <a href="/settings/users">{detail.users.length ? `${detail.users.length} user${detail.users.length === 1 ? "" : "s"} with this role` : "No users yet: assign from Users"}</a>
                      <button type="button" className="cu-link" onClick={() => setHistory(true)}>History</button>
                      {can.remove && !role.isSystem && <button type="button" className="cu-link" onClick={() => setRemoving(true)}>Delete role</button>}
                    </div>
                  </div>
                  <div className="cu-ro-hs">
                    <label className="switch"><input type="checkbox" checked={draft.branchRestricted} disabled={locked} onChange={(e) => edit((d) => ({ ...d, branchRestricted: e.target.checked }))} /><i /><span>Branch-restricted</span></label>
                    <small>{draft.branchRestricted ? "Users only see their own branches" : "Users see every branch"}</small>
                  </div>
                </div>

                <div>
                  {role.systemKey === "ADMIN" ? (
                    <div className="banner info cu-sod"><Lock /><div><b>Admin keeps every permission</b><p>The Admin role always has full access and bypasses segregation-of-duties checks. Keep the number of admins small.</p></div></div>
                  ) : conflicts.length ? (
                    <div className="cu-sods">
                      {conflicts.map((c, i) => (
                        <div key={c.rule} className={cn("banner cu-sod", c.severity === "BLOCK" ? "danger" : "warn")} style={{ ["--i" as string]: i }}>
                          <TriangleAlert />
                          <div><b>{c.title}{c.severity === "BLOCK" && " · blocks saving"}</b><p>{c.detail}</p></div>
                          {!locked && <Button size="sm" icon={<WandSparkles />} onClick={() => setCodes([c.code], false)}>Remove {ACT[c.action as PermissionAction]?.[0] ?? c.code}</Button>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="banner good cu-sod ok"><ShieldCheck /><div><b>No segregation-of-duties conflicts</b><p>Nobody in this role can both raise and approve the same transaction.</p></div></div>
                  )}
                </div>

                <div className="panel flush cu-mxp">
                  <div className="panel-head">
                    <div><h3>Permission matrix</h3><p>Click a column header or module name to toggle it all. Changed cells are marked.</p></div>
                    <div className="seg">
                      {catalogue.map((m) => {
                        const [label, Icon] = GROUP[m.module] ?? [m.module, Settings];
                        return <button key={m.module} type="button" className={grp === m.module ? "active" : undefined} onClick={() => setGrp(m.module)}><Icon />{label}</button>;
                      })}
                    </div>
                  </div>
                  <div className="cu-mx-wrap">
                    {group && (
                      <table className={cn("cu-mx", locked && "locked")}>
                        <thead>
                          <tr>
                            <th className="cu-mx-mod">Module</th>
                            {PERMISSION_ACTIONS.map((a) => {
                              const codes = group.resources.map((r) => r.actions[a]).filter((c): c is string => !!c);
                              const on = codes.filter((c) => has(c)).length;
                              const state = !codes.length ? "na" : on === codes.length ? "all" : on ? "some" : "none";
                              const [label, Icon] = ACT[a];
                              return (
                                <th key={a}>
                                  <button type="button" className={cn("cu-mx-col", state)} disabled={state === "na" || locked} title={`Toggle ${label} for all ${GROUP[grp]?.[0] ?? grp} modules`} onClick={() => setCodes(codes, state !== "all")}>
                                    <Icon /><span>{label}</span><i className="cu-mx-cs" />
                                  </button>
                                </th>
                              );
                            })}
                            <th className="cu-mx-cnt">Granted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.resources.map((r) => {
                            const codes = Object.values(r.actions);
                            const on = codes.filter((c) => has(c)).length;
                            return (
                              <tr key={r.resource}>
                                <th className="cu-mx-mod">
                                  <button type="button" className="cu-mx-row" disabled={locked} title="Toggle the whole row" onClick={() => setCodes(codes, on !== codes.length)}>
                                    <b>{r.label}</b><small>{on === codes.length ? "Full access" : on ? `${on} of ${codes.length}` : "No access"}</small>
                                  </button>
                                </th>
                                {PERMISSION_ACTIONS.map((a) => {
                                  const code = r.actions[a];
                                  if (!code) return <td key={a}><span className="cu-na">—</span></td>;
                                  const v = has(code);
                                  return (
                                    <td key={a}>
                                      <button type="button" className={cn("cu-ck", v && "on", v !== was(code) && "chg")} aria-pressed={v} aria-label={`${ACT[a][0]} ${r.label}`} disabled={locked} onClick={() => setCodes([code], !v)}>
                                        <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4L18 8" /></svg>
                                      </button>
                                    </td>
                                  );
                                })}
                                <td className="cu-mx-cnt"><span className="cu-mx-meter"><i style={{ ["--w" as string]: `${(on / codes.length) * 100}%` }} /></span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="cu-mx-legend">
                    <span><i className="cu-ck on sm" />Granted</span><span><i className="cu-ck sm" />Not granted</span><span><i className="cu-na">—</i>Not applicable</span><span><i className="cu-chg-dot" />Unsaved change</span>
                  </div>
                </div>

                <div className="grid-2 cu-ro-bot">
                  <div className="panel">
                    <div className="panel-head"><div><h3>Data limits</h3><p>Caps applied on top of the matrix</p></div><span className="icon-well yellow"><Gauge /></span></div>
                    <div className="cu-lim">
                      <label className="cu-lim-row"><span>Max voucher amount</span>
                        <div className="cu-slider sm"><input type="range" min={0} max={10_000_000} step={50_000} value={Math.min(draft.limits.maxVoucherAmount, 10_000_000)} disabled={locked} aria-label="Max voucher amount" style={{ ["--sp" as string]: `${(Math.min(draft.limits.maxVoucherAmount, 10_000_000) / 10_000_000) * 100}%` }} onChange={(e) => edit((d) => ({ ...d, limits: { ...d.limits, maxVoucherAmount: Number(e.target.value) } }))} /></div>
                        <output>{draft.limits.maxVoucherAmount ? rs(draft.limits.maxVoucherAmount) : "No approvals"}</output>
                      </label>
                      <label className="cu-lim-row"><span>Max discount</span>
                        <div className="cu-slider sm"><input type="range" min={0} max={100} step={0.5} value={draft.limits.maxDiscountPct} disabled={locked} aria-label="Max discount" style={{ ["--sp" as string]: `${draft.limits.maxDiscountPct}%` }} onChange={(e) => edit((d) => ({ ...d, limits: { ...d.limits, maxDiscountPct: Number(e.target.value) } }))} /></div>
                        <output>{draft.limits.maxDiscountPct}%</output>
                      </label>
                      <label className="cu-lim-row"><span>Back-dated posting</span>
                        <select value={draft.limits.backdateDays} disabled={locked} onChange={(e) => edit((d) => ({ ...d, limits: { ...d.limits, backdateDays: Number(e.target.value) } }))}>{BACKDATE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                      </label>
                      <label className="cu-lim-row"><span>Salary visibility</span>
                        <select value={draft.limits.salaryVisibility} disabled={locked} onChange={(e) => edit((d) => ({ ...d, limits: { ...d.limits, salaryVisibility: e.target.value } }))}>{SALARY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                      </label>
                    </div>
                  </div>
                  <div className="panel">
                    <Coverage catalogue={catalogue} has={has} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className={cn("cu-savebar", dirtyCount > 0 && "on")} role="status">
        <span className="cu-sb-ic"><PencilLine /></span>
        <div><b>Unsaved changes</b><small>{dirtyCount} change{dirtyCount === 1 ? "" : "s"} in {dirty.map(([id]) => details[id]!.name).join(", ")}</small></div>
        <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>Discard</Button>
        <Button variant="lime" size="sm" icon={<Check />} onClick={saveAll} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>

      {modal && roles && (
        <RoleModal
          mode={modal.mode}
          roles={roles}
          base={modal.mode === "dup" ? sel : null}
          onClose={() => setModal(null)}
          onCreated={(r) => {
            setModal(null);
            setDetails((x) => ({ ...x, [r.id]: r }));
            setDrafts((x) => ({ ...x, [r.id]: draftOf(r) }));
            setSel(r.id);
            setAttempt((n) => n + 1);
          }}
        />
      )}
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} onConfirm={remove} danger title={`Delete ${detail?.name ?? "role"}?`} confirmLabel="Delete role">
        Only possible when no user holds it. Its history is kept.
      </ConfirmDialog>
      {detail && (
        <Drawer open={history} onClose={() => setHistory(false)} title={`${detail.name} history`} subtitle="Every change to the role, who made it and what changed" wide>
          <HistoryTab schema="Company" table="Roles" id={detail.id} />
        </Drawer>
      )}
    </>
  );
}

function Coverage({ catalogue, has }: { catalogue: PermissionModule[]; has: (code: string | undefined) => boolean }) {
  const counts = PERMISSION_ACTIONS.map((a) => {
    const codes = catalogue.flatMap((m) => m.resources.map((r) => r.actions[a]).filter((c): c is string => !!c));
    return [ACT[a][0], codes.filter((c) => has(c)).length, codes.length] as const;
  });
  const total = counts.reduce((s, c) => s + c[1], 0), all = counts.reduce((s, c) => s + c[2], 0);
  const resources = catalogue.reduce((n, m) => n + m.resources.length, 0);
  return (
    <>
      <div className="panel-head"><div><h3>Coverage</h3><p>Grants across all {resources} modules</p></div><b className="cu-cov">{all ? Math.round((total / all) * 100) : 0}%</b></div>
      <div className="cu-covs">
        {counts.map(([l, n, t], i) => (
          <div key={l} className="cu-cov-row" style={{ ["--i" as string]: i }}>
            <span>{l}</span><div className="cu-post-bar"><i style={{ ["--w" as string]: `${t ? (n / t) * 100 : 0}%` }} /></div><b>{n}/{t}</b>
          </div>
        ))}
      </div>
    </>
  );
}

/** Template "New role" / "Duplicate role" modal: name, description, copy permissions from. */
function RoleModal({ mode, roles, base, onClose, onCreated }: { mode: "new" | "dup"; roles: Role[]; base: string | null; onClose: () => void; onCreated: (r: RoleDetail) => void }) {
  const toast = useToast();
  const baseRole = roles.find((r) => r.id === base);
  const [name, setName] = useState(baseRole ? `${baseRole.name} (copy)` : "");
  const [description, setDescription] = useState(baseRole?.description ?? "");
  const [from, setFrom] = useState(base ?? roles.find((r) => r.systemKey === "EMPLOYEE")?.id ?? roles[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fromRole = roles.find((r) => r.id === from);

  const submit = async () => {
    if (name.trim().length < 2) return setErr("Give the role a unique name");
    setBusy(true);
    try {
      const r = await createRole({ name: name.trim(), description: description || null, copyFromRoleId: from || null, branchRestricted: fromRole?.branchRestricted ?? true });
      toast(`${r.name} created`, { tone: "good" });
      onCreated(r);
    } catch (e) {
      setErr(e instanceof ApiError && e.code === "DB_UNIQUE_VIOLATION" ? "Another role already has this name" : e instanceof ApiError ? e.message : "Could not create the role");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal cu-rmodal" role="dialog" aria-modal aria-label="New role">
        <div className="modal-head">
          <div><h2>{mode === "dup" ? "Duplicate role" : "New role"}</h2><p>Start from an existing role and adjust its permissions.</p></div>
          <button type="button" className="x" aria-label="Close" onClick={onClose}><X /></button>
        </div>
        <div className="form-grid c1">
          <label><span>Role name *</span><input value={name} maxLength={40} placeholder="e.g. Branch Accountant" onChange={(e) => { setName(e.target.value); setErr(null); }} autoFocus />{err && <small className="cu-err">{err}</small>}</label>
          <label><span>Description</span><textarea rows={2} value={description} placeholder="What is this role for?" onChange={(e) => setDescription(e.target.value)} /></label>
          <label><span>Copy permissions from</span><select value={from} onChange={(e) => setFrom(e.target.value)}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        </div>
        <div className="cu-rm-prev"><Copy /><span>Copies the permissions and data limits of <b>{fromRole?.name ?? "—"}</b> (saved version).</span></div>
        <div className="modal-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Plus />} disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create role"}</Button>
        </div>
      </div>
    </div>
  );
}
