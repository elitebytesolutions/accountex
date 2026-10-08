"use client";

import { BadgeCheck, BookCheck, Check, Download, Eye, History, Info, Lock, PencilLine, Plus, Settings, Trash2, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PERMISSION_ACTIONS, type AdminHistoryPage, type PermissionAction, type RoleGrantMatrix, type RoleGrantRole } from "@/shared";
import { Drawer } from "@/components/ui/overlay";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { roleGrantHistory, saveRoleGrants } from "../api";
import { LogTimeline, verbOf } from "./templates-ui";

const ACT: Record<PermissionAction, [string, LucideIcon]> = {
  VIEW: ["View", Eye], CREATE: ["Create", Plus], EDIT: ["Edit", PencilLine], APPROVE: ["Approve", BadgeCheck],
  POST: ["Post", BookCheck], DELETE: ["Delete", Trash2], EXPORT: ["Export", Download],
};
const GROUP: Record<string, string> = {
  FINANCE: "Finance", SALES_PURCHASES: "Sales & Purchases", INVENTORY: "Inventory", HR_PAYROLL: "HR & Payroll", DISTRIBUTION: "Distribution", SYSTEM: "System", PROFILE: "My Profile",
};

/**
 * Default grants of one system role: the permission matrix of Settings › Roles (same `cu-mx` table and toggles),
 * saved to Platform.SystemRoleGrants. Applies to companies created afterwards; existing companies keep their roles.
 */
export function RoleGrantsDrawer({ matrix, role, onClose, onSaved }: {
  matrix: RoleGrantMatrix;
  role: RoleGrantRole;
  onClose: () => void;
  onSaved: (r: RoleGrantRole) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => new Set(role.permissions));
  const [grp, setGrp] = useState(matrix.catalogue[0]?.module ?? "");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"matrix" | "history">("matrix");
  const [log, setLog] = useState<AdminHistoryPage | null>(null);
  const locked = role.locked;
  const has = (c: string | undefined) => !!c && (locked || draft.has(c));
  const was = (c: string | undefined) => !!c && role.permissions.includes(c);
  const changes = [...draft].filter((p) => !role.permissions.includes(p)).length + role.permissions.filter((p) => !draft.has(p)).length;
  const group = matrix.catalogue.find((m) => m.module === grp);
  const setCodes = (codes: string[], on: boolean) => setDraft((d) => { const n = new Set(d); codes.forEach((c) => (on ? n.add(c) : n.delete(c))); return n; });

  useEffect(() => {
    if (tab !== "history") return;
    let cancelled = false;
    roleGrantHistory(role.systemKey).then((p) => !cancelled && setLog(p)).catch(() => !cancelled && setLog({ items: [], total: 0 }));
    return () => { cancelled = true; };
  }, [tab, role.systemKey]);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveRoleGrants(role.systemKey, [...draft]);
      toast(`${role.label}: ${changes} change${changes === 1 ? "" : "s"} saved · new companies get ${saved.permissions.length} permissions`, { tone: "good" });
      onSaved(saved);
    } catch (e) {
      toast(adminErrorMessage(e, "Could not save the grants"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open wide onClose={onClose} title={`${role.label} · default permissions`} subtitle={`${locked ? matrix.catalogue.reduce((n, m) => n + m.resources.reduce((k, r) => k + Object.keys(r.actions).length, 0), 0) : draft.size} permissions for new companies`}
      foot={tab === "matrix" ? (
        <>
          <button type="button" className="btn ghost" onClick={() => setTab("history")}><History />History</button>
          <span className="spacer" />
          {changes > 0 && <span className="badge warn">{changes} unsaved</span>}
          <button type="button" className="btn secondary" onClick={onClose}>Close</button>
          {!locked && <button type="button" className="btn primary" disabled={busy || !changes} onClick={save}><Check />{busy ? "Saving…" : "Save grants"}</button>}
        </>
      ) : <button type="button" className="btn secondary" onClick={() => setTab("matrix")}><PencilLine />Back to the matrix</button>}>
      {tab === "history" ? (log ? (
        <LogTimeline items={log.items} total={log.total} empty="Grant changes for this role will appear here."
          describe={(h) => `${verbOf(h.action)} ${String(h.row?.permissionCode ?? "")}`} />
      ) : <Skeleton style={{ height: 160 }} />) : (
        <>
          <div className="banner info mb"><Info /><div><b>Affects new companies only</b><p>Companies that exist today keep their own roles; change those in each company&apos;s Settings › Roles.</p></div></div>
          {locked && <div className="banner info mb"><Lock /><div><b>Admin keeps every permission</b><p>The Admin role always has full access, so its grants can&apos;t be edited.</p></div></div>}
          <div className="seg mb" style={{ flexWrap: "wrap" }}>
            {matrix.catalogue.map((m) => <button key={m.module} type="button" className={grp === m.module ? "active" : undefined} onClick={() => setGrp(m.module)}><Settings />{GROUP[m.module] ?? m.module}</button>)}
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
                          <button type="button" className={cn("cu-mx-col", state)} disabled={state === "na" || locked} title={`Toggle ${label} for the whole group`} onClick={() => setCodes(codes, state !== "all")}>
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
                              <button type="button" className={cn("cu-ck", v && "on", !locked && v !== was(code) && "chg")} aria-pressed={v} aria-label={`${ACT[a][0]} ${r.label}`} disabled={locked} onClick={() => setCodes([code], !v)}>
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
        </>
      )}
    </Drawer>
  );
}
