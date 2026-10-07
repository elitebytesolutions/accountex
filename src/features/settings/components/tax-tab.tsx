"use client";

import { Panel } from "@/components/ui/page";
import { Field, FormGrid, Input, Select, Switch } from "@/components/ui/form";
import { lookupOptions, useLookups } from "../use-lookups";
import { Locked, optional, SaveActions, useSectionForm, yesNo, type SectionProps } from "./section-form";

const TYPES = ["SalesTaxReturnPeriod", "ProvincialTaxAuthority"];

/**
 * Template app/settings › Tax. The ATL banner, withholding rows and tax-code links arrive with tax codes and FBR
 * integration (Phases 4–5); the STRN is edited on the Profile tab.
 */
export function TaxTab({ settings, onSaved, canEdit }: SectionProps) {
  const lookups = useLookups(TYPES);
  const locked = !canEdit || !settings.saved;
  const { register, submit, err, saving, form } = useSectionForm("tax", settings, onSaved);

  return (
    <form onSubmit={submit} noValidate>
      <Locked locked={locked}>
        <Panel className="mb" title="Sales tax registration">
          <FormGrid cols={3}>
            <Field label="GST registered" error={err("gstRegistered")}>
              <Select {...register("gstRegistered", yesNo)}>
                <option value="true">Yes — Federal (FBR)</option>
                <option value="false">No</option>
              </Select>
            </Field>
            <Field label="STRN">
              <Input value={settings.strn ?? ""} readOnly disabled placeholder="—" title="Edit on the Company Profile tab" />
            </Field>
            <Field label="Return period" error={err("salesTaxReturnPeriod")}>
              <Select {...register("salesTaxReturnPeriod")}>
                {lookupOptions(lookups, "SalesTaxReturnPeriod", settings.salesTaxReturnPeriod).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Standard rate (%)" error={err("standardGstRatePct")}>
              <Input type="number" step="0.01" {...register("standardGstRatePct")} aria-invalid={!!err("standardGstRatePct")} />
            </Field>
            <Field label="Further tax (unregistered buyers)" error={err("furtherTaxRatePct")}>
              <Input type="number" step="0.01" {...register("furtherTaxRatePct")} placeholder="%" aria-invalid={!!err("furtherTaxRatePct")} />
            </Field>
            <Field label="Provincial services tax" error={err("provincialTaxAuthority")}>
              <Select {...register("provincialTaxAuthority")}>
                <option value="">—</option>
                {lookupOptions(lookups, "ProvincialTaxAuthority", settings.provincialTaxAuthority).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Provincial services rate (%)" error={err("provincialServicesRatePct")}>
              <Input type="number" step="0.01" {...register("provincialServicesRatePct", optional)} aria-invalid={!!err("provincialServicesRatePct")} />
            </Field>
          </FormGrid>
        </Panel>
        <Panel title="FBR POS & withholding defaults">
          <div className="stack">
            <Switch {...register("fbrRealtimeReporting")} label="Report invoices to FBR POS / Digital Invoicing in real time" />
            <Switch {...register("printFbrQr")} label="Print FBR invoice number & QR on sales invoices" />
          </div>
          <p className="small muted mt">Withholding rates and the WHT payable account are set up with tax codes (Phase 4).</p>
          <SaveActions label="Save tax settings" saving={saving} hidden={locked} onCancel={() => form.reset()} />
        </Panel>
      </Locked>
    </form>
  );
}
