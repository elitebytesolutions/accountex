"use client";

import { Archive, BadgeCheck, Send } from "lucide-react";
import { useState } from "react";
import type { CoaTemplate } from "@/shared";
import { Field, FormGrid } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { createCoaTemplate, deleteCoaTemplate, setCoaTemplateStatus, updateCoaTemplate } from "../api";
import { COA_ICONS } from "./templates-ui";

const FIELDS = ["code", "name", "industry", "version", "description", "icon"] as const;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * COA template details (template "New template" / card "Edit"): name, code, industry, version, description, icon,
 * plus Publish / Retire / Set default. A new template starts as a draft, blank or as a copy of another template.
 */
export function CoaTemplateModal({ template, templates, onClose, onSaved }: {
  template: CoaTemplate | null;
  templates: CoaTemplate[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Record<string, string>>(() => template
    ? Object.fromEntries(FIELDS.map((k) => [k, str(template[k])]))
    : { code: "", name: "", industry: "", version: `v${new Date().getFullYear()}.1`, description: "", icon: "list-tree", copyFromId: templates.find((t) => t.status === "DEFAULT")?.id ?? "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const s = (k: string) => f[k] ?? "";
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const readOnly = template?.status === "RETIRED";

  const run = async (work: () => Promise<[string, string]>) => {
    setBusy(true);
    setErrs({});
    try { const [msg, id] = await work(); toast(msg, { tone: "good" }); onSaved(id); }
    catch (e) { setErrs(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not save the template"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const body = Object.fromEntries(FIELDS.map((k) => [k, s(k)]));
    if (!template) {
      const t = await createCoaTemplate({ ...body, copyFromId: s("copyFromId") || null });
      return [`${t.name} created as a draft`, t.id];
    }
    const t = await updateCoaTemplate(template.id, { ...body, ...(template.status !== "DRAFT" && { code: undefined }), rowVersion: template.rowVersion });
    return [`${t.name} saved`, t.id];
  });
  const status = (action: "publish" | "retire" | "default", done: string) =>
    run(async () => { const t = await setCoaTemplateStatus(template!.id, action, template!.rowVersion); return [`${t.name} ${done}`, t.id]; });

  return (
    <AdminRecordModal open wide onClose={onClose} busy={busy || readOnly} title={template ? `Edit template — ${template.name}` : "New template"}
      subtitle={template ? `${template.accountCount} accounts · ${template.tenantCount} tenants` : "Starts as a draft; tenants see it once published."}
      history={template ? { table: "ChartOfAccountsTemplates", id: template.id } : null} historyLabels={{ ChartOfAccountsTemplateAccounts: "Account" }}
      saveLabel={template ? "Save template" : "Create draft"} onSave={save}
      onDelete={template?.status === "DRAFT" ? async () => { await run(async () => { await deleteCoaTemplate(template.id, template.rowVersion); return [`${template.name} deleted`, ""]; }); } : undefined}
      deleteNote="Only a draft no tenant uses can be deleted. Retire a published template instead."
      extra={template && (
        <>
          {(template.status === "DRAFT" || template.status === "RETIRED") && <button type="button" className="btn secondary" disabled={busy} onClick={() => status("publish", "published")}><Send />Publish</button>}
          {(template.status === "DRAFT" || template.status === "PUBLISHED") && <button type="button" className="btn secondary" disabled={busy} onClick={() => status("default", "is now the default")}><BadgeCheck />Set default</button>}
          {(template.status === "DRAFT" || template.status === "PUBLISHED") && <button type="button" className="btn ghost" disabled={busy} onClick={() => status("retire", "retired")}><Archive />Retire</button>}
        </>
      )}>
      {readOnly && <div className="banner warn mb"><Archive /><div><b>Retired</b><p>Tenants no longer see this template. Publish it again to edit it.</p></div></div>}
      <FormGrid cols={3}>
        <Field label="Name" required error={errs.name}><input value={s("name")} maxLength={120} placeholder="e.g. Trading & Distribution" disabled={readOnly} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Code" required error={errs.code} hint={template && template.status !== "DRAFT" ? "Fixed once published" : undefined}>
          <input value={s("code")} maxLength={40} placeholder="e.g. PK_SERVICES" disabled={readOnly || (!!template && template.status !== "DRAFT")} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} />
        </Field>
        <Field label="Version" required error={errs.version}><input value={s("version")} maxLength={20} placeholder="v2026.2" disabled={readOnly} onChange={(e) => set("version", e.target.value)} /></Field>
        <Field label="Industry" error={errs.industry}><input value={s("industry")} maxLength={60} placeholder="e.g. SERVICES" disabled={readOnly} onChange={(e) => set("industry", e.target.value)} /></Field>
        <Field label="Icon" error={errs.icon}>
          <select value={s("icon")} disabled={readOnly} onChange={(e) => set("icon", e.target.value)}>{Object.keys(COA_ICONS).map((k) => <option key={k} value={k}>{k}</option>)}</select>
        </Field>
        {!template && (
          <Field label="Start from" hint="Copies the accounts as a draft">
            <select value={s("copyFromId")} onChange={(e) => set("copyFromId", e.target.value)}>
              <option value="">Blank template</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.accountCount} accounts)</option>)}
            </select>
          </Field>
        )}
        <label className="full"><span>Description</span><textarea rows={3} maxLength={400} value={s("description")} disabled={readOnly} placeholder="What makes this chart different" onChange={(e) => set("description", e.target.value)} />{errs.description && <small className="hint text-danger">{errs.description}</small>}</label>
      </FormGrid>
    </AdminRecordModal>
  );
}
