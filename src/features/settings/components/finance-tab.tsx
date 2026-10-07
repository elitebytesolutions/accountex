"use client";

import { Panel } from "@/components/ui/page";
import { MappingPanel } from "@/features/finance/components/mapping-panel";
import { Field, FormGrid, Input, Select, Switch } from "@/components/ui/form";
import { lookupOptions, useLookups } from "../use-lookups";
import { CurrenciesPanel, useCurrencies } from "./currencies-panel";
import { Locked, optional, SaveActions, useSectionForm, type SectionProps } from "./section-form";

const TYPES = ["NumberFormat", "FxRateSource"];
const FY_START = [
  { value: 7, label: "1 July" },
  { value: 1, label: "1 January" },
  { value: 4, label: "1 April" },
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "July–June" for a fiscal year starting in July. */
const fyRange = (start: number) => `${MONTHS[start - 1]}–${MONTHS[(start + 10) % 12]}`;

/** Template app/settings › Finance: fiscal & currency, plus the company's exchange rates and the default account mapping. */
export function FinanceTab({ settings, onSaved, canEdit }: SectionProps) {
  const lookups = useLookups(TYPES);
  const currencies = useCurrencies();
  const locked = !canEdit || !settings.saved;
  const { register, submit, err, saving, form } = useSectionForm("finance", settings, onSaved);

  return (
    <>
      <form onSubmit={submit} noValidate>
        <Panel className="mb" title="Fiscal & currency" description={`Fiscal year ${fyRange(settings.fyStartMonth)}`}>
          <Locked locked={locked}>
            <FormGrid cols={3}>
              <Field label="Fiscal year starts" error={err("fyStartMonth")}>
                <Select {...register("fyStartMonth")}>{FY_START.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select>
              </Field>
              <Field label="Base currency" error={err("baseCurrencyCode")}>
                <Select {...register("baseCurrencyCode")}>
                  {(currencies.items ?? [{ code: settings.baseCurrencyCode, name: "" }]).map((c) => (
                    <option key={c.code} value={c.code}>{c.code}{c.name && ` — ${c.name}`}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount decimal places" error={err("amountDecimals")}>
                <Select {...register("amountDecimals")}>{[2, 0, 3].map((d) => <option key={d} value={d}>{d}</option>)}</Select>
              </Field>
              <Field label="Number format" error={err("numberFormat")}>
                <Select {...register("numberFormat")}>
                  {lookupOptions(lookups, "NumberFormat", settings.numberFormat).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Lock date (no posting before)" error={err("booksLockDate")}>
                <Input type="date" {...register("booksLockDate", optional)} aria-invalid={!!err("booksLockDate")} />
              </Field>
              <Field label="Exchange rate source" error={err("fxRateSource")}>
                <Select {...register("fxRateSource")}>
                  {lookupOptions(lookups, "FxRateSource", settings.fxRateSource).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </Select>
              </Field>
            </FormGrid>
            <div className="stack mt">
              <Switch {...register("allowMultiCurrency")} label="Allow multi-currency transactions" />
              <Switch {...register("requireCostCentreOnExpense")} label="Require cost centre on expense lines" />
              <Switch {...register("allowFuturePeriodPosting")} label="Allow posting to future periods" />
            </div>
          </Locked>
          <SaveActions label="Save finance settings" saving={saving} hidden={locked} onCancel={() => form.reset()} />
        </Panel>
      </form>
      <MappingPanel canEdit={canEdit} />
      <CurrenciesPanel currencies={currencies} canEdit={canEdit} />
    </>
  );
}
