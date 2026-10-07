"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, type ReactNode } from "react";
import { useForm, type FieldValues, type Resolver, type UseFormRegister } from "react-hook-form";
import { SETTINGS_SECTIONS, settingsSectionBody, type CompanySettings, type SettingsSection } from "@/shared";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { saveSettingsSection } from "../api";

const SAVED_MESSAGE: Record<SettingsSection, string> = {
  profile: "Company profile updated",
  finance: "Finance settings saved",
  sales: "Sales & purchase settings saved",
  hr: "HR & payroll settings saved",
  tax: "Tax settings saved",
  branding: "Branding saved",
};

/** The section's fields from the settings row; nulls become "" so inputs stay controlled by the form. */
function sectionValues(section: SettingsSection, settings: CompanySettings) {
  const out: FieldValues = {};
  for (const key of Object.keys(SETTINGS_SECTIONS[section].shape)) {
    const v = settings[key as keyof CompanySettings];
    out[key] = v === null ? "" : v;
  }
  return out;
}

/**
 * One settings tab as a form: validates with the shared section schema, saves with the rowVersion that was read,
 * and shows server field errors next to their inputs.
 */
export function useSectionForm(section: SettingsSection, settings: CompanySettings, onSaved: (s: CompanySettings) => void) {
  const toast = useToast();
  const values = useMemo(() => sectionValues(section, settings), [section, settings]);
  const form = useForm<FieldValues>({
    resolver: zodResolver(settingsSectionBody(section)) as unknown as Resolver<FieldValues>,
    values,
  });

  const submit = form.handleSubmit(async (data) => {
    try {
      const saved = await saveSettingsSection(section, { ...data, ...(settings.saved && { rowVersion: settings.rowVersion }) });
      onSaved(saved);
      toast(SAVED_MESSAGE[section], { tone: "good" });
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        for (const [field, messages] of Object.entries(error.details)) form.setError(field, { message: messages[0] });
      }
      toast(error instanceof ApiError ? error.message : "Could not save", { tone: "danger" });
    }
  });

  const err = (name: string) => form.formState.errors[name]?.message as string | undefined;
  return { form, submit, err, register: form.register, saving: form.formState.isSubmitting };
}

/** register() options for an optional input whose empty value means "not set" (null), e.g. dates and amounts. */
export const optional = { setValueAs: (v: unknown) => (v === "" || v === undefined ? null : v) };
/** register() options for a yes/no <select>. */
export const yesNo = { setValueAs: (v: unknown) => v === true || v === "true" };

/** Disables every control while the user can't edit (no comp:edit, or the profile isn't saved yet). */
export function Locked({ locked, children }: { locked: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {children}
    </fieldset>
  );
}

export function SaveActions({ label, saving, hidden, extra, onCancel }: {
  label: string;
  saving: boolean;
  hidden?: boolean;
  extra?: ReactNode;
  /** Template "Cancel": puts back the saved values. */
  onCancel?: () => void;
}) {
  if (hidden) return null;
  return (
    <FormActions>
      {extra}
      {onCancel && <Button onClick={onCancel} disabled={saving}>Cancel</Button>}
      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? "Saving…" : label}
      </Button>
    </FormActions>
  );
}

export type SectionProps = {
  settings: CompanySettings;
  onSaved: (s: CompanySettings) => void;
  /** User holds comp:edit. */
  canEdit: boolean;
};

export type Reg = UseFormRegister<FieldValues>;
