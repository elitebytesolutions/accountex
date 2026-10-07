"use client";

import { Panel } from "@/components/ui/page";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { initialsOf } from "@/features/auth/initials";
import { lookupOptions, useLookups } from "../use-lookups";
import { Locked, SaveActions, useSectionForm, type SectionProps } from "./section-form";

const TYPES = ["Province", "CompanySettingIndustry", "LegalStructure"];

/** Template app/settings › Company Profile. Saving it the first time creates the settings row. */
export function ProfileTab({ settings, onSaved, canEdit }: SectionProps) {
  const lookups = useLookups(TYPES);
  const { register, submit, err, saving, form } = useSectionForm("profile", settings, onSaved);
  const legalName = form.watch("legalName") as string;

  return (
    <form onSubmit={submit} noValidate>
      <Panel title="Company Profile" description="Appears on invoices, payslips and statutory returns">
        <div className="row mb">
          <span className="avatar xl">{initialsOf(legalName || "Company") || "CO"}</span>
          <div>
            <b>Company logo</b>
            <p className="small muted">Logo upload isn&apos;t available yet; documents show the company initials until it is.</p>
          </div>
        </div>
        <Locked locked={!canEdit}>
          <FormGrid>
            <Field label="Legal name" required full error={err("legalName")}>
              <Input {...register("legalName")} aria-invalid={!!err("legalName")} placeholder="Company (Pvt) Ltd" />
            </Field>
            <Field label="Trading name" error={err("tradingName")}><Input {...register("tradingName")} /></Field>
            <Field label="Company registration (SECP)" error={err("secpRegNo")}><Input {...register("secpRegNo")} /></Field>
            <Field label="NTN" required error={err("ntn")}>
              <Input {...register("ntn")} aria-invalid={!!err("ntn")} placeholder="1234567-8" />
            </Field>
            <Field label="STRN" error={err("strn")}>
              <Input {...register("strn")} aria-invalid={!!err("strn")} placeholder="12-34-5678-901-23" />
            </Field>
            <Field label="Registered address" full error={err("registeredAddress")}><Textarea rows={2} {...register("registeredAddress")} /></Field>
            <Field label="City" error={err("city")}><Input {...register("city")} /></Field>
            <Field label="Province" error={err("province")}>
              <Select {...register("province")}>
                <option value="">—</option>
                {lookupOptions(lookups, "Province", settings.province).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Phone" error={err("phone")}><Input {...register("phone")} /></Field>
            <Field label="Email" error={err("email")}><Input type="email" {...register("email")} aria-invalid={!!err("email")} /></Field>
            <Field label="Website" error={err("website")}><Input {...register("website")} /></Field>
            <Field label="Industry" error={err("industry")}>
              <Select {...register("industry")}>
                <option value="">—</option>
                {lookupOptions(lookups, "CompanySettingIndustry", settings.industry).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Time zone" error={err("timezone")}>
              <Select {...register("timezone")}><option value="Asia/Karachi">(GMT+05:00) Asia/Karachi</option></Select>
            </Field>
            <Field label="Legal structure" error={err("legalStructure")}>
              <Select {...register("legalStructure")}>
                <option value="">—</option>
                {lookupOptions(lookups, "LegalStructure", settings.legalStructure).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </Select>
            </Field>
          </FormGrid>
        </Locked>
        <SaveActions label="Save profile" saving={saving} hidden={!canEdit} onCancel={() => form.reset()} />
      </Panel>
    </form>
  );
}
