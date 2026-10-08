"use client";

import { useState } from "react";
import type { LookupsResponse, SeedLeaveType, SeedListKind, SeedSalaryComponent, SeedTaxCode } from "@/shared";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { lookupOptions } from "@/features/settings/use-lookups";
import { createSeed, deleteSeed, updateSeed } from "../api";

type AnyRow = SeedLeaveType | SeedSalaryComponent | SeedTaxCode;
const TITLE: Record<SeedListKind, string> = { "leave-types": "leave type", "salary-components": "salary component", "tax-codes": "tax code" };
const TABLE: Record<SeedListKind, string> = { "leave-types": "TemplateLeaveTypes", "salary-components": "TemplateSalaryComponents", "tax-codes": "TemplateTaxCodes" };
const TEXT: Record<SeedListKind, string[]> = {
  "leave-types": ["seedVersion", "name", "daysPerYear", "accrualPerMonth", "carryForwardMax", "genderRestriction", "medicalCertAfterDays", "ruleNote", "sortOrder"],
  "salary-components": ["seedVersion", "name", "componentKind", "calcMethod", "pctOfBasic", "statutoryCode", "ruleNote", "sortOrder"],
  "tax-codes": ["seedVersion", "code", "description", "taxKind", "rate", "rateNote", "whtSection", "sortOrder"],
};
const FLAGS: Record<SeedListKind, string[]> = { "leave-types": ["isPaid", "onceInService"], "salary-components": ["isTaxable"], "tax-codes": ["isActive"] };
const DEFAULTS: Record<SeedListKind, Record<string, string | boolean>> = {
  "leave-types": { genderRestriction: "ANY", isPaid: true, onceInService: false, sortOrder: "0" },
  "salary-components": { componentKind: "EARNING", calcMethod: "FIXED", isTaxable: true, sortOrder: "0" },
  "tax-codes": { taxKind: "SALES_TAX", isActive: true, sortOrder: "0" },
};
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Row modal of a master seed list (template-style: the template's seed lists are read-only lists). */
export function SeedModal({ kind, row, seedVersion, lookups, onClose, onSaved }: {
  kind: SeedListKind;
  row: AnyRow | null;
  seedVersion: string;
  lookups: LookupsResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Record<string, string | boolean>>(() => row
    ? Object.fromEntries([...TEXT[kind].map((k) => [k, str((row as Record<string, unknown>)[k])]), ...FLAGS[kind].map((k) => [k, Boolean((row as Record<string, unknown>)[k])])])
    : { ...Object.fromEntries(TEXT[kind].map((k) => [k, ""])), ...DEFAULTS[kind], seedVersion });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const s = (k: string) => String(f[k] ?? "");
  const b = (k: string) => Boolean(f[k]);
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const sel = (k: string, type: string, optional = false) => (
    <select value={s(k)} onChange={(e) => set(k, e.target.value)}>
      {optional && <option value="">—</option>}
      {lookupOptions(lookups, type, s(k) || null).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
    </select>
  );
  const name = s(kind === "tax-codes" ? "code" : "name") || TITLE[kind];

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setErrs({});
    try { toast(await work(), { tone: "good" }); onSaved(); }
    catch (e) { setErrs(adminFieldErrors(e)); toast(adminErrorMessage(e, `Could not save the ${TITLE[kind]}`), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const body = { ...f };
    if (row) await updateSeed(kind, row.id, { ...body, rowVersion: row.rowVersion });
    else await createSeed(kind, body);
    return `${name} ${row ? "saved" : "added"}`;
  });

  return (
    <AdminRecordModal open wide onClose={onClose} busy={busy} title={row ? `Edit ${TITLE[kind]} — ${name}` : `New ${TITLE[kind]}`}
      subtitle="Copied into new companies at onboarding. Existing companies are not changed."
      history={row ? { table: TABLE[kind], id: row.id } : null} saveLabel={row ? "Save" : "Add"} onSave={save}
      onDelete={row ? async () => { await run(async () => { await deleteSeed(kind, row.id, row.rowVersion); return `${name} deleted`; }); } : undefined}
      deleteNote="Rows companies were seeded from can't be deleted.">
      <FormGrid cols={3}>
        <Field label="Seed version" required error={errs.seedVersion}><input value={s("seedVersion")} maxLength={20} placeholder="v2026.2" onChange={(e) => set("seedVersion", e.target.value)} /></Field>
        {kind === "tax-codes" ? (
          <>
            <Field label="Code" required error={errs.code}><input value={s("code")} maxLength={20} placeholder="GST-18" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Kind" required error={errs.taxKind}>{sel("taxKind", "TaxKind")}</Field>
            <Field label="Description" required full error={errs.description}><input value={s("description")} maxLength={200} placeholder="Sales tax standard rate" onChange={(e) => set("description", e.target.value)} /></Field>
            <Field label="Rate (%)" error={errs.rate}><input type="number" min={0} max={100} step="any" value={s("rate")} onChange={(e) => set("rate", e.target.value)} /></Field>
            <Field label="Rate note" error={errs.rateNote} hint="When the rate is a range, e.g. 0.5–1%"><input value={s("rateNote")} maxLength={40} onChange={(e) => set("rateNote", e.target.value)} /></Field>
            <Field label="WHT section" error={errs.whtSection}><input value={s("whtSection")} maxLength={40} placeholder="153(1)(a)" onChange={(e) => set("whtSection", e.target.value)} /></Field>
          </>
        ) : (
          <Field label="Name" required error={errs.name}><input value={s("name")} maxLength={60} onChange={(e) => set("name", e.target.value)} /></Field>
        )}
        {kind === "leave-types" && (
          <>
            <Field label="Days per year" required error={errs.daysPerYear}><input type="number" min={0} max={365} step="0.5" value={s("daysPerYear")} onChange={(e) => set("daysPerYear", e.target.value)} /></Field>
            <Field label="Accrual / month" error={errs.accrualPerMonth}><input type="number" min={0} step="any" value={s("accrualPerMonth")} onChange={(e) => set("accrualPerMonth", e.target.value)} /></Field>
            <Field label="Carry forward (max days)" error={errs.carryForwardMax}><input type="number" min={0} step="0.5" value={s("carryForwardMax")} onChange={(e) => set("carryForwardMax", e.target.value)} /></Field>
            <Field label="Gender" error={errs.genderRestriction}>{sel("genderRestriction", "GenderRestriction")}</Field>
            <Field label="Medical certificate after (days)" error={errs.medicalCertAfterDays}><input type="number" min={1} step={1} value={s("medicalCertAfterDays")} onChange={(e) => set("medicalCertAfterDays", e.target.value)} /></Field>
          </>
        )}
        {kind === "salary-components" && (
          <>
            <Field label="Kind" required error={errs.componentKind}>{sel("componentKind", "TemplateSalaryComponentKind")}</Field>
            <Field label="Calculation" required error={errs.calcMethod}>{sel("calcMethod", "TemplateSalaryComponentCalcMethod")}</Field>
            <Field label="% of basic" required={s("calcMethod") === "PCT_OF_BASIC"} error={errs.pctOfBasic}><input type="number" min={0} max={100} step="any" value={s("pctOfBasic")} onChange={(e) => set("pctOfBasic", e.target.value)} /></Field>
            <Field label="Statutory" error={errs.statutoryCode}>{sel("statutoryCode", "StatutoryCode", true)}</Field>
          </>
        )}
        <Field label="Sort order" error={errs.sortOrder}><input type="number" min={0} max={999} step={1} value={s("sortOrder")} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
        {kind !== "tax-codes" && <Field label="Rule note" full error={errs.ruleNote}><input value={s("ruleNote")} maxLength={200} placeholder="e.g. Medical certificate after 2 days" onChange={(e) => set("ruleNote", e.target.value)} /></Field>}
        {kind === "leave-types" && <><Check label="Paid leave" checked={b("isPaid")} onChange={(e) => set("isPaid", e.target.checked)} /><Check label="Once in service" checked={b("onceInService")} onChange={(e) => set("onceInService", e.target.checked)} /></>}
        {kind === "salary-components" && <Check label="Taxable" checked={b("isTaxable")} onChange={(e) => set("isTaxable", e.target.checked)} />}
        {kind === "tax-codes" && <Check label="Active" checked={b("isActive")} onChange={(e) => set("isActive", e.target.checked)} />}
      </FormGrid>
    </AdminRecordModal>
  );
}
