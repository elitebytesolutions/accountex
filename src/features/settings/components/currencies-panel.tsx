"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ExchangeRateCreateSchema, type Currency, type ExchangeRate, type ExchangeRateCreate, type ExchangeRateCreateFields } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, FormActions, FormGrid, Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Panel } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { addRate, deleteRate, listCurrencies, listRates, updateRate } from "../api";
import { labelOf, lookupOptions, useLookups } from "../use-lookups";

type LoadError = { message: string; reference?: string };
const toLoadError = (e: unknown): LoadError => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load" });
const fmtRate = (n: number) => n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

/** Currencies with the company's latest rates; shared by the base-currency select and the panel. */
export function useCurrencies() {
  const [items, setItems] = useState<Currency[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    listCurrencies()
      .then((c) => !cancelled && (setItems(c), setError(null)))
      .catch((e: unknown) => !cancelled && setError(toLoadError(e)));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { items, error, reload };
}

/** Finance › Currencies & exchange rates (PKR per unit of each foreign currency). */
export function CurrenciesPanel({ currencies, canEdit }: { currencies: ReturnType<typeof useCurrencies>; canEdit: boolean }) {
  const [open, setOpen] = useState<Currency | null>(null);
  const lookups = useLookups(["ExchangeRateSource"]);
  const base = currencies.items?.find((c) => c.isBase)?.code ?? "PKR";

  return (
    <Panel flush title="Currencies & exchange rates" description={`Rates are ${base} per one unit of the foreign currency`}>
      {currencies.error ? (
        <div style={{ padding: 16 }}><ErrorState {...currencies.error} onRetry={currencies.reload} /></div>
      ) : !currencies.items ? (
        <div style={{ padding: 16 }}><Skeleton style={{ height: 120 }} /></div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Code</th><th>Currency</th><th className="num">Latest rate</th><th>Rate date</th><th>Source</th><th /></tr>
            </thead>
            <tbody>
              {currencies.items.map((c) => (
                <tr key={c.code}>
                  <td><b>{c.code}</b></td>
                  <td><b>{c.name}</b><small>{c.symbol}</small></td>
                  <td className="num">{c.isBase ? "1.00" : c.latestRate === null ? <span className="muted">—</span> : fmtRate(c.latestRate)}</td>
                  <td>{c.isBase ? <Badge tone="good">Base currency</Badge> : (c.latestRateDate ?? <span className="muted">No rate yet</span>)}</td>
                  <td>{c.latestSource ? labelOf(lookups, "ExchangeRateSource", c.latestSource) : <span className="muted">—</span>}</td>
                  <td className="actions">
                    {!c.isBase && <Button size="sm" variant="ghost" onClick={() => setOpen(c)}>Rates</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RatesDrawer currency={open} onClose={() => setOpen(null)} canEdit={canEdit} onChanged={currencies.reload} sources={lookups} base={base} />
    </Panel>
  );
}

function RatesDrawer({ currency, onClose, canEdit, onChanged, sources, base }: {
  currency: Currency | null;
  onClose: () => void;
  canEdit: boolean;
  onChanged: () => void;
  sources: ReturnType<typeof useLookups>;
  base: string;
}) {
  const toast = useToast();
  const code = currency?.code;
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<{ items: ExchangeRate[]; total: number } | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<ExchangeRate | null>(null);
  const [removing, setRemoving] = useState<ExchangeRate | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyOf, setHistoryOf] = useState<ExchangeRate | null>(null);

  // A different currency starts on page 1 with nothing selected.
  const [prevCode, setPrevCode] = useState(code);
  if (code !== prevCode) {
    setPrevCode(code);
    setPage(1);
    setRows(null);
    setEditing(null);
    setHistoryOf(null);
  }

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    listRates(code, page, 10)
      .then((r) => !cancelled && (setRows(r), setError(null)))
      .catch((e: unknown) => !cancelled && setError(toLoadError(e)));
    return () => {
      cancelled = true;
    };
  }, [code, page, attempt]);

  const today = new Date().toISOString().slice(0, 10);
  const blank: ExchangeRateCreateFields = { rateDate: today, rate: "" as unknown as number, source: "MANUAL" };
  const { register, handleSubmit, reset, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<ExchangeRateCreateFields, unknown, ExchangeRateCreate>({
    resolver: zodResolver(ExchangeRateCreateSchema),
    values: editing ? { rateDate: editing.rateDate, rate: editing.rate, source: editing.source } : blank,
  });

  const refresh = () => {
    setAttempt((n) => n + 1);
    onChanged();
  };

  const onSubmit = handleSubmit(async (data) => {
    if (!code) return;
    try {
      if (editing) await updateRate(code, editing.id, { ...data, rowVersion: editing.rowVersion });
      else await addRate(code, data);
      toast(editing ? "Exchange rate updated" : "Exchange rate added", { tone: "good" });
      setEditing(null);
      reset(blank);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        for (const [f, m] of Object.entries(e.details)) setFieldError(f as keyof ExchangeRateCreateFields, { message: m[0] });
      }
      toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
    }
  });

  const confirmDelete = async () => {
    if (!code || !removing) return;
    setBusy(true);
    try {
      await deleteRate(code, removing.id, removing.rowVersion);
      toast("Exchange rate deleted", { tone: "good" });
      if (editing?.id === removing.id) setEditing(null);
      setRemoving(null);
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not delete", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<ExchangeRate>[] = [
    { key: "rateDate", header: "Date", render: (r) => <b>{r.rateDate}</b> },
    { key: "rate", header: `${base} per ${code ?? ""}`, num: true, render: (r) => fmtRate(r.rate) },
    { key: "source", header: "Source", render: (r) => labelOf(sources, "ExchangeRateSource", r.source) },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <span className="actions">
          <button type="button" className="icon-btn-sm" aria-label="History" onClick={() => setHistoryOf(historyOf?.id === r.id ? null : r)}><History /></button>
          {canEdit && <button type="button" className="icon-btn-sm" aria-label="Edit" onClick={() => setEditing(r)}><Pencil /></button>}
          {canEdit && <button type="button" className="icon-btn-sm" aria-label="Delete" onClick={() => setRemoving(r)}><Trash2 /></button>}
        </span>
      ),
    },
  ];

  return (
    <Drawer open={!!currency} onClose={onClose} title={currency ? `${currency.code} exchange rates` : ""} subtitle={currency?.name} wide>
      {canEdit && (
        <form onSubmit={onSubmit} noValidate className="mb">
          <div className="form-section"><h4>{editing ? `Edit rate of ${editing.rateDate}` : "Add a rate"}</h4></div>
          <FormGrid cols={3}>
            <Field label="Date" required error={errors.rateDate?.message}><Input type="date" {...register("rateDate")} aria-invalid={!!errors.rateDate} /></Field>
            <Field label={`Rate (${base})`} required error={errors.rate?.message}><Input inputMode="decimal" {...register("rate")} aria-invalid={!!errors.rate} placeholder="280.50" /></Field>
            <Field label="Source" error={errors.source?.message}>
              <Select {...register("source")}>
                {lookupOptions(sources, "ExchangeRateSource", editing?.source).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </Select>
            </Field>
          </FormGrid>
          <FormActions>
            {editing && <Button onClick={() => setEditing(null)}>Cancel</Button>}
            <Button type="submit" variant="primary" icon={editing ? undefined : <Plus />} disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : editing ? "Save rate" : "Add rate"}
            </Button>
          </FormActions>
        </form>
      )}
      <div className="panel flush">
        <DataTable
          columns={columns}
          rows={rows?.items ?? []}
          rowKey={(r) => r.id}
          total={rows?.total ?? 0}
          page={page}
          pageSize={10}
          onPageChange={setPage}
          loading={!rows && !error}
          error={error ?? undefined}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
      {historyOf && (
        <div className="mt">
          <div className="form-section"><h4>History of the {historyOf.rateDate} rate</h4></div>
          <HistoryTab schema="Company" table="ExchangeRates" id={historyOf.id} />
        </div>
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={confirmDelete}
        busy={busy}
        danger
        title="Delete exchange rate?"
        confirmLabel="Delete"
      >
        The {code} rate of {removing?.rateDate} will be removed. Its history is kept.
      </ConfirmDialog>
    </Drawer>
  );
}
