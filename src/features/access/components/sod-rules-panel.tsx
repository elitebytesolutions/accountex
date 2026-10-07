"use client";

import { History, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import type { PermissionModule, SodRule } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Panel } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { createSodRule, deleteSodRule, setSodRuleActive, updateSodRule } from "../api";

type Form = { code: string; name: string; permissionA: string; permissionB: string; description: string; severity: "WARN" | "BLOCK"; ownerExempt: boolean };
const KIND: Record<string, string> = { CREATE_APPROVE: "Create & approve", CREATE_POST: "Create & post", PRIVILEGE_ESCALATION: "Privilege escalation", CUSTOM: "Custom" };

/**
 * Settings › Roles & Permissions › Segregation of duties. No template for managing rules (the roles screen only shows
 * conflicts): template-styled table + drawer (decided 2026-10-05). Rules feed the conflict banner and the role-save check.
 */
export function SodRulesPanel({ rules, catalogue, canEdit, onChanged }: { rules: SodRule[]; catalogue: PermissionModule[]; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState<SodRule | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [removing, setRemoving] = useState<SodRule | null>(null);

  const options = catalogue.flatMap((m) => m.resources.flatMap((r) => Object.entries(r.actions).map(([action, code]) => ({ code, label: `${r.label} · ${action.toLowerCase()}` }))));
  const label = (code: string) => options.find((o) => o.code === code)?.label ?? code;
  const row = edit && edit !== "new" ? edit : null;
  const open = (r: SodRule | "new") => {
    setEdit(r);
    setErrs({});
    setHistory(false);
    setForm(r === "new"
      ? { code: "", name: "", permissionA: "", permissionB: "", description: "", severity: "WARN", ownerExempt: true }
      : { code: r.code, name: r.name, permissionA: r.permissionA, permissionB: r.permissionB, description: r.description ?? "", severity: r.severity as Form["severity"], ownerExempt: r.ownerExempt });
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const fail = (e: unknown, fallback: string) => toast(e instanceof ApiError ? (e.code === "DB_UNIQUE_VIOLATION" ? "A rule for this pair already exists" : e.message) : fallback, { tone: "danger" });

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    try {
      const body = { ...form, description: form.description || null };
      const r = row ? await updateSodRule(row.id, { ...body, rowVersion: row.rowVersion }) : await createSodRule(body);
      toast(`Rule “${r.name}” saved`, { tone: "good" });
      setEdit(null);
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrs(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])));
      fail(e, "Could not save the rule");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (r: SodRule) => {
    try {
      await setSodRuleActive(r.id, !r.isActive, r.rowVersion);
      toast(`${r.name} ${r.isActive ? "deactivated" : "activated"}`, { tone: r.isActive ? "warn" : "good" });
      onChanged();
    } catch (e) {
      fail(e, "Could not update the rule");
    }
  };

  return (
    <>
      <Panel flush title="Segregation-of-duties rules" description="Pairs of permissions one person shouldn’t hold together. Warn rules show on the role; Block rules stop saving it. The Admin role is never blocked." actions={canEdit && <Button size="sm" icon={<Plus />} onClick={() => open("new")}>New rule</Button>}>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Rule</th><th>Kind</th><th>Permission A</th><th>Permission B</th><th>Severity</th><th>Admin exempt</th><th>Active</th><th /></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b><small>{r.code}</small></td>
                  <td>{KIND[r.kind] ?? r.kind}</td>
                  <td>{label(r.permissionA)}</td>
                  <td>{label(r.permissionB)}</td>
                  <td><Badge tone={r.severity === "BLOCK" ? "danger" : "warn"} dot>{r.severity === "BLOCK" ? "Block" : "Warn"}</Badge></td>
                  <td>{r.ownerExempt ? "Yes" : "No"}</td>
                  <td><label className="switch"><input type="checkbox" checked={r.isActive} disabled={!canEdit} onChange={() => toggle(r)} aria-label={`${r.name} active`} /><i /></label></td>
                  <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Edit ${r.name}`} onClick={() => open(r)}><Pencil /></button></td>
                </tr>
              ))}
              {!rules.length && <tr><td colSpan={8}><EmptyState icon={<ShieldAlert />} title="No rules" description="Add a pair of permissions that shouldn't sit with one person." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={row ? row.name : "New segregation-of-duties rule"} subtitle={row?.isStandard ? "Standard rule: severity and wording can change; the pair stays" : "Two permissions one person shouldn't hold together"} foot={
        <>
          {row && (
            <span className="row" style={{ marginRight: "auto", gap: 6 }}>
              <button type="button" className="btn ghost" onClick={() => setHistory((h) => !h)}><History />{history ? "Rule" : "History"}</button>
              {canEdit && !row.isStandard && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => setRemoving(row)}><Trash2 />Delete</button>}
            </span>
          )}
          <button type="button" className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
          {canEdit && !history && <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save rule"}</button>}
        </>
      }>
        {row && history ? <HistoryTab schema="Company" table="SegregationOfDutiesRules" id={row.id} /> : form && (
          <FormGrid>
            <Field label="Name" required full error={errs.name}><input value={form.name} autoFocus placeholder="e.g. Create & approve · Purchase orders" onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Code" required error={errs.code}><input value={form.code} disabled={row?.isStandard} placeholder="e.g. CREATE_APPROVE_PO" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Severity" error={errs.severity}>
              <select value={form.severity} onChange={(e) => set("severity", e.target.value as Form["severity"])}>
                <option value="WARN">Warn: show on the role</option>
                <option value="BLOCK">Block: refuse saving the role</option>
              </select>
            </Field>
            <Field label="Permission A" required error={errs.permissionA}>
              <select value={form.permissionA} disabled={row?.isStandard} onChange={(e) => set("permissionA", e.target.value)}><option value="">Choose…</option>{options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
            </Field>
            <Field label="Permission B" required error={errs.permissionB} hint="The one the role screen offers to remove">
              <select value={form.permissionB} disabled={row?.isStandard} onChange={(e) => set("permissionB", e.target.value)}><option value="">Choose…</option>{options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
            </Field>
            <Field label="Why it matters" full error={errs.description}><textarea rows={2} value={form.description} placeholder="Shown on the role when it conflicts" onChange={(e) => set("description", e.target.value)} /></Field>
            <Check label="The Admin role is exempt (no warning)" full checked={form.ownerExempt} onChange={(e) => set("ownerExempt", e.target.checked)} />
          </FormGrid>
        )}
      </Drawer>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete “${removing?.name ?? ""}”?`} confirmLabel="Delete" danger onConfirm={async () => {
        if (!removing) return;
        try {
          await deleteSodRule(removing.id, removing.rowVersion);
          toast("Rule deleted", { tone: "good" });
          setEdit(null);
          onChanged();
        } catch (e) {
          fail(e, "Could not delete the rule");
        } finally {
          setRemoving(null);
        }
      }}>Its code can’t be reused afterwards.</ConfirmDialog>
    </>
  );
}
