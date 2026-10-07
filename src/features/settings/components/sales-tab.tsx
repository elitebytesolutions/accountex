"use client";

import { useEffect, useState } from "react";
import type { NumberingSeries } from "@/shared";
import { Panel } from "@/components/ui/page";
import { Check, Field, FormGrid, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { listNumberingSeries } from "../api";
import { lookupOptions, useLookups } from "../use-lookups";
import { Locked, optional, SaveActions, useSectionForm, type SectionProps } from "./section-form";

const termLabel = (d: number) => (d === 0 ? "Due on receipt" : `Net ${d}`);
/** Template choices, plus the saved value when it is something else. */
const terms = (choices: number[], current: number) => (choices.includes(current) ? choices : [current, ...choices]);

/** The company-wide series pattern of a document type, as shown in the template's read-only prefix fields. */
function useSeriesPrefix() {
  const [series, setSeries] = useState<NumberingSeries[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    listNumberingSeries()
      .then((s) => !cancelled && setSeries(s))
      .catch(() => !cancelled && setSeries([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return (docType: string) => {
    if (!series) return "…";
    const s = series.find((x) => x.docType === docType && !x.branchId);
    return s ? s.pattern.replace("{PREFIX}", s.prefix) : "Not set up";
  };
}

/** Template app/settings › Sales & Purchases. */
export function SalesTab({ settings, onSaved, canEdit }: SectionProps) {
  const lookups = useLookups(["CreditLimitAction"]);
  const prefixOf = useSeriesPrefix();
  const locked = !canEdit || !settings.saved;
  const { register, submit, err, saving, form } = useSectionForm("sales", settings, onSaved);

  return (
    <form onSubmit={submit} noValidate>
      <Locked locked={locked}>
        <div className="grid-2">
          <Panel title="Sales" description="Defaults for quotations, orders and invoices">
            <FormGrid>
              <Field label="Default payment terms" error={err("defaultCustomerTermsDays")}>
                <Select {...register("defaultCustomerTermsDays")}>
                  {terms([30, 15, 45, 0], settings.defaultCustomerTermsDays).map((d) => <option key={d} value={d}>{termLabel(d)}</option>)}
                </Select>
              </Field>
              <Field label="Invoice prefix">
                <Input value={prefixOf("INV")} readOnly disabled title="Set on the Numbering Series tab" />
              </Field>
              <Field label="Quotation validity (days)" error={err("quotationValidityDays")}>
                <Input type="number" {...register("quotationValidityDays")} aria-invalid={!!err("quotationValidityDays")} />
              </Field>
              <Field label="Default sales tax">
                <Select disabled title="Tax codes arrive in Phase 4"><option>Available in Phase 4</option></Select>
              </Field>
              <Field label="Invoice terms & conditions" full error={err("invoiceTerms")}>
                <Textarea rows={3} {...register("invoiceTerms")} />
              </Field>
            </FormGrid>
            <div className="form-section mt"><h4>Credit control</h4><p>Applied when a sales order or invoice exceeds limits</p></div>
            <FormGrid>
              <Field label="On credit limit breach" error={err("creditLimitAction")}>
                <Select {...register("creditLimitAction")}>
                  {lookupOptions(lookups, "CreditLimitAction", settings.creditLimitAction).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Overdue tolerance (days)" error={err("overdueToleranceDays")}>
                <Input type="number" {...register("overdueToleranceDays")} aria-invalid={!!err("overdueToleranceDays")} />
              </Field>
              <Check full {...register("blockOverdueOver90")} label="Block customers with invoices overdue more than 90 days" />
            </FormGrid>
          </Panel>
          <Panel title="Purchases" description="Defaults for POs and vendor bills">
            <FormGrid>
              <Field label="Default vendor terms" error={err("defaultVendorTermsDays")}>
                <Select {...register("defaultVendorTermsDays")}>
                  {terms([45, 30, 60], settings.defaultVendorTermsDays).map((d) => <option key={d} value={d}>{termLabel(d)}</option>)}
                </Select>
              </Field>
              <Field label="PO prefix">
                <Input value={prefixOf("PO")} readOnly disabled title="Set on the Numbering Series tab" />
              </Field>
              <Field label="3-way match tolerance" error={err("threeWayMatchTolerancePct")}>
                <Input type="number" step="0.01" {...register("threeWayMatchTolerancePct")} placeholder="%" aria-invalid={!!err("threeWayMatchTolerancePct")} />
              </Field>
              <Field label="Bill approval above" error={err("billApprovalThreshold")}>
                <Input type="number" step="0.01" {...register("billApprovalThreshold", optional)} placeholder="Rs, empty = no limit" aria-invalid={!!err("billApprovalThreshold")} />
              </Field>
            </FormGrid>
            <div className="stack mt">
              <Switch {...register("requireApprovedPoForBill")} label="Require approved PO before vendor bill" />
              <Switch {...register("autoDeductWht153")} label="Auto-deduct WHT u/s 153 on vendor payments" />
              <Switch {...register("allowPartialGrn")} label="Allow partial goods receipt" />
              <Switch {...register("warnDuplicateVendorInvoice")} label="Warn on duplicate vendor invoice number" />
            </div>
          </Panel>
        </div>
      </Locked>
      <SaveActions label="Save sales & purchase settings" saving={saving} hidden={locked} onCancel={() => form.reset()} />
    </form>
  );
}
