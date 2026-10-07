"use client";

import { Panel } from "@/components/ui/page";
import { Check, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/components/ui/cn";
import { initialsOf } from "@/features/auth/initials";
import { lookupOptions, useLookups } from "../use-lookups";
import { Locked, SaveActions, useSectionForm, type SectionProps } from "./section-form";

/** Template swatches (15-polish.css `.po-sw`). */
const SWATCHES = [
  { cls: "g", name: "Green", hex: "#15803D" },
  { cls: "n", name: "Navy", hex: "#1E3A5F" },
  { cls: "t", name: "Teal", hex: "#0F766E" },
  { cls: "i", name: "Indigo", hex: "#4338CA" },
  { cls: "m", name: "Maroon", hex: "#9F1239" },
  { cls: "a", name: "Amber", hex: "#B45309" },
  { cls: "s", name: "Slate", hex: "#334155" },
];

/** Template app/settings › Branding, with the live invoice-header preview. */
export function BrandingTab({ settings, onSaved, canEdit }: SectionProps) {
  const lookups = useLookups(["DocumentFont", "PaperSize"]);
  const locked = !canEdit || !settings.saved;
  const { register, submit, err, saving, form } = useSectionForm("branding", settings, onSaved);
  const primary = (form.watch("brandPrimaryColour") as string) || settings.brandPrimaryColour;
  const valid = /^#[0-9A-Fa-f]{6}$/.test(primary);

  return (
    <div className="split-doc">
      <form onSubmit={submit} noValidate>
        <Panel title="Brand colours" description="Applied to printed documents and emails">
          <Locked locked={locked}>
            <div className="row mb">
              {SWATCHES.map((s) => (
                <button
                  key={s.hex}
                  type="button"
                  className={cn("po-sw", s.cls, primary.toUpperCase() === s.hex && "on")}
                  title={s.name}
                  aria-label={s.name}
                  onClick={() => form.setValue("brandPrimaryColour", s.hex, { shouldDirty: true, shouldValidate: true })}
                />
              ))}
            </div>
            <FormGrid>
              <Field label="Primary colour" error={err("brandPrimaryColour")}><Input {...register("brandPrimaryColour")} aria-invalid={!!err("brandPrimaryColour")} /></Field>
              <Field label="Accent colour" error={err("brandAccentColour")}><Input {...register("brandAccentColour")} aria-invalid={!!err("brandAccentColour")} /></Field>
              <Field label="Document font" error={err("documentFont")}>
                <Select {...register("documentFont")}>
                  {lookupOptions(lookups, "DocumentFont", settings.documentFont).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Paper size" error={err("paperSize")}>
                <Select {...register("paperSize")}>
                  {lookupOptions(lookups, "PaperSize", settings.paperSize).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Email footer" full error={err("emailFooter")}><Textarea rows={4} {...register("emailFooter")} /></Field>
              <Check full {...register("showPoweredBy")} label='Show "Powered by Accountex" in email footer' />
            </FormGrid>
          </Locked>
          <SaveActions label="Save branding" saving={saving} hidden={locked} onCancel={() => form.reset()} />
        </Panel>
      </form>
      <Panel title="Preview" description="Sales invoice header">
        <div className="paper">
          <div className="paper-head">
            <div className="row">
              <span className="avatar">{initialsOf(settings.legalName || "Company") || "CO"}</span>
              <div><b>{settings.legalName || "Your company"}</b><br /><small className="muted">NTN {settings.ntn || "—"}</small></div>
            </div>
            <div className="right"><b style={{ color: valid ? primary : "var(--primary)" }}>SALES TAX INVOICE</b><br /><small className="muted">INV-0001</small></div>
          </div>
          <div className="paper-meta">
            <div><span className="muted small">Bill to</span><br /><b>Customer name</b></div>
            <div className="right"><span className="muted small">Date</span><br /><b>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</b></div>
          </div>
          <div className="paper-totals"><div><span>Total incl. GST</span><b>Rs 0</b></div></div>
          <div className="paper-foot small muted">Thank you for your business.</div>
        </div>
      </Panel>
    </div>
  );
}
