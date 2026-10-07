"use client";

import { Panel } from "@/components/ui/page";
import { Field, FormGrid, Input, Select, Switch } from "@/components/ui/form";
import { lookupOptions, useLookups } from "../use-lookups";
import { Locked, optional, SaveActions, useSectionForm, type Reg, type SectionProps } from "./section-form";

const TYPES = ["PayDayRule", "PayrollCutoff", "WorkingDaysBasis", "WorkingWeek", "AttendanceSource"];

/** Template app/settings › HR & Payroll. */
export function HrTab({ settings, onSaved, canEdit }: SectionProps) {
  const lookups = useLookups(TYPES);
  const locked = !canEdit || !settings.saved;
  const { register, submit, err, saving, form } = useSectionForm("hr", settings, onSaved);

  const lookupSelect = (name: keyof typeof settings & string, type: string, label: string, reg: Reg) => (
    <Field label={label} error={err(name)}>
      <Select {...reg(name)}>
        {lookupOptions(lookups, type, settings[name] as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
      </Select>
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate>
      <Locked locked={locked}>
        <div className="grid-2">
          <Panel title="Payroll" description="Monthly payroll cycle">
            <FormGrid>
              {lookupSelect("payDayRule", "PayDayRule", "Pay day", register)}
              {lookupSelect("payrollCutoff", "PayrollCutoff", "Payroll cut-off", register)}
              {lookupSelect("workingDaysBasis", "WorkingDaysBasis", "Working days basis", register)}
              <Field label="Salary disbursement bank">
                <Select disabled title="Bank accounts arrive in Phase 4"><option>Available in Phase 4</option></Select>
              </Field>
              <Field label="EOBI employer share" error={err("eobiEmployerAmount")}>
                <Input type="number" step="0.01" {...register("eobiEmployerAmount", optional)} placeholder="Rs / month" aria-invalid={!!err("eobiEmployerAmount")} />
              </Field>
              <Field label="Provident fund" error={err("pfRatePct")}>
                <Input type="number" step="0.01" {...register("pfRatePct", optional)} placeholder="% of basic" aria-invalid={!!err("pfRatePct")} />
              </Field>
            </FormGrid>
            <div className="stack mt">
              <Switch {...register("autoDeductSalaryTax")} label="Deduct income tax u/s 149 automatically" />
              <Switch {...register("publishPayslipsToEss")} label="Publish payslips to My Profile on payroll post" />
            </div>
          </Panel>
          <Panel title="Attendance & late policy" description="Company-wide defaults">
            <FormGrid>
              {lookupSelect("workingWeek", "WorkingWeek", "Working week", register)}
              <Field label="Grace period" error={err("graceMinutes")}>
                <Input type="number" {...register("graceMinutes")} placeholder="minutes" aria-invalid={!!err("graceMinutes")} />
              </Field>
              <Field label="Late marks = 1 leave" error={err("lateMarksPerLeave")}>
                <Input type="number" {...register("lateMarksPerLeave")} aria-invalid={!!err("lateMarksPerLeave")} />
              </Field>
              <Field label="Half day if hours below" error={err("halfDayBelowHours")}>
                <Input type="number" step="0.5" {...register("halfDayBelowHours")} aria-invalid={!!err("halfDayBelowHours")} />
              </Field>
              <Field label="Overtime rate" error={err("overtimeMultiplier")}>
                <Select {...register("overtimeMultiplier")}>
                  <option value={2}>2× hourly (Factories Act)</option>
                  <option value={1.5}>1.5× hourly</option>
                </Select>
              </Field>
              {lookupSelect("attendanceSource", "AttendanceSource", "Attendance source", register)}
            </FormGrid>
            <div className="stack mt">
              <Switch {...register("geofenceEssPunch")} label="Geo-fence self-service punches to the branch location" />
              <Switch {...register("allowOffsitePersonalPunch")} label="Allow punches from personal devices off-site" />
            </div>
          </Panel>
        </div>
      </Locked>
      <SaveActions label="Save HR & payroll settings" saving={saving} hidden={locked} onCancel={() => form.reset()} />
    </form>
  );
}
