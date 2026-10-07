"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Hash, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { NumberingSeriesCreateSchema, type Branch, type DocumentType, type NumberingSeries, type NumberingSeriesCreate, type NumberingSeriesCreateFields } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, Select, Switch } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Panel } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { createSeries, deleteSeries, listBranches, listDocumentTypes, listNumberingSeries, updateSeries } from "../api";
import { labelOf, lookupOptions, useLookups } from "../use-lookups";

type Refs = { docTypes: DocumentType[]; branches: Branch[] };

/** Template app/settings › Numbering Series: the live preview is the number the next document will get. */
export function NumberingTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const lookups = useLookups(["ResetPolicy"]);
  const [rows, setRows] = useState<NumberingSeries[] | null>(null);
  const [refs, setRefs] = useState<Refs>({ docTypes: [], branches: [] });
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drawer, setDrawer] = useState<{ series: NumberingSeries | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listNumberingSeries(), listDocumentTypes(), listBranches({ page: 1, pageSize: 100, sort: "code" })])
      .then(([s, docTypes, branches]) => {
        if (cancelled) return;
        setRows(s);
        setRefs({ docTypes, branches: branches.items });
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load numbering series" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = () => setAttempt((n) => n + 1);

  return (
    <Panel
      flush
      title="Numbering Series"
      description="Tokens: {PREFIX} prefix, {YYYY} / {YY} year, {MM} month, {BR} branch code, {SEQ} or {SEQn} sequence"
      actions={canEdit && <Button size="sm" icon={<Plus />} onClick={() => setDrawer({ series: null })}>Add series</Button>}
    >
      {error ? (
        <div style={{ padding: 16 }}><ErrorState {...error} onRetry={reload} /></div>
      ) : !rows ? (
        <div style={{ padding: 16 }}><Skeleton style={{ height: 140 }} /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Hash />}
          title="No numbering series yet"
          description="Add a series for each document type you issue, e.g. JV-{YYYY}-{SEQ6} for journal vouchers."
          action={canEdit && <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setDrawer({ series: null })}>Add series</Button>}
        />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Document type</th><th>Pattern</th><th className="num">Padding</th><th className="num">Next number</th><th>Preview</th><th>Reset</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.docTypeName}</b><small>{s.branchCode ? `Branch ${s.branchCode}` : "All branches"}</small></td>
                  <td><code>{s.pattern.replace("{PREFIX}", s.prefix)}</code></td>
                  <td className="num">{s.padding}</td>
                  <td className="num">{s.nextValue}</td>
                  <td><code>{s.preview}</code></td>
                  <td>{labelOf(lookups, "ResetPolicy", s.resetPolicy)}</td>
                  <td>{s.isActive ? <Badge tone="good" dot>Active</Badge> : <Badge>Inactive</Badge>}</td>
                  <td className="actions">
                    <button type="button" className="icon-btn-sm" aria-label={`Edit ${s.docTypeName}`} onClick={() => setDrawer({ series: s })}><Pencil /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SeriesDrawer
        state={drawer}
        refs={refs}
        lookups={lookups}
        canEdit={canEdit}
        onClose={() => setDrawer(null)}
        onSaved={(message, s) => {
          toast(message, { tone: "good" });
          reload();
          setDrawer(s ? { series: s } : null);
        }}
      />
    </Panel>
  );
}

const blank: NumberingSeriesCreateFields = { docType: "", branchId: null, prefix: "", pattern: "{PREFIX}-{YYYY}-{SEQ}", padding: 6, startValue: 1, resetPolicy: "YEARLY", isActive: true };
const toFields = (s: NumberingSeries): NumberingSeriesCreateFields => ({
  docType: s.docType, branchId: s.branchId, prefix: s.prefix, pattern: s.pattern, padding: s.padding, startValue: s.startValue, resetPolicy: s.resetPolicy, isActive: s.isActive,
});

function SeriesDrawer({ state, refs, lookups, canEdit, onClose, onSaved }: {
  state: { series: NumberingSeries | null } | null;
  refs: Refs;
  lookups: ReturnType<typeof useLookups>;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (message: string, s: NumberingSeries | null) => void;
}) {
  const toast = useToast();
  const series = state?.series ?? null;
  const [tab, setTab] = useState<"details" | "history">("details");
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);

  const [prevId, setPrevId] = useState(series?.id);
  if (series?.id !== prevId) {
    setPrevId(series?.id);
    setTab("details");
  }

  const { register, handleSubmit, setValue, setError, formState: { errors, isSubmitting } } = useForm<NumberingSeriesCreateFields, unknown, NumberingSeriesCreate>({
    // Editing: locked (disabled) fields are left out of the submit, so they stay unchanged.
    resolver: zodResolver(series ? (NumberingSeriesCreateSchema.partial() as unknown as typeof NumberingSeriesCreateSchema) : NumberingSeriesCreateSchema),
    values: series ? toFields(series) : blank,
  });

  const modules = useMemo(() => {
    const by = new Map<string, DocumentType[]>();
    for (const d of refs.docTypes) by.set(d.module, [...(by.get(d.module) ?? []), d]);
    return [...by];
  }, [refs.docTypes]);

  /** A new series starts from the document type's defaults. */
  const pickDocType = (code: string) => {
    const d = refs.docTypes.find((x) => x.code === code);
    if (!d || series) return;
    setValue("prefix", d.defaultPrefix);
    setValue("pattern", d.defaultPattern);
    setValue("padding", d.defaultPadding);
    setValue("resetPolicy", d.defaultResetPolicy);
  };

  const save = handleSubmit(async (data) => {
    try {
      const saved = series ? await updateSeries(series.id, { ...data, rowVersion: series.rowVersion }) : await createSeries(data);
      onSaved(series ? "Numbering series updated" : `Series added · next number ${saved.preview}`, saved);
    } catch (e) {
      if (e instanceof ApiError && e.details) for (const [f, m] of Object.entries(e.details)) setError(f as keyof NumberingSeriesCreateFields, { message: m[0] });
      if (e instanceof ApiError && e.code === "DB_UNIQUE_VIOLATION") setError("docType", { message: "This document type already has a series for that branch" });
      toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
    }
  });

  const remove = async () => {
    if (!series) return;
    setBusy(true);
    try {
      await deleteSeries(series.id, series.rowVersion);
      setRemoving(false);
      onSaved("Numbering series deleted", null);
    } catch (e) {
      setRemoving(false);
      toast(e instanceof ApiError ? e.message : "Could not delete", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const locked = !!series?.inUse;
  const editable = canEdit && tab === "details";
  const foot = editable && (
    <>
      {series && !series.inUse && (
        <Button size="sm" variant="ghost" className="text-danger" style={{ marginRight: "auto" }} onClick={() => setRemoving(true)}>Delete</Button>
      )}
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={save} disabled={isSubmitting}>{isSubmitting ? "Saving…" : series ? "Save series" : "Add series"}</Button>
    </>
  );

  return (
    <Drawer
      open={!!state}
      onClose={onClose}
      title={series ? series.docTypeName : "Add numbering series"}
      subtitle={series ? `Next number ${series.preview}` : "Choose a document type; its defaults fill in"}
      foot={foot || undefined}
    >
      {series && <Tabs items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />}
      {tab === "history" && series ? (
        <div className="mt"><HistoryTab schema="Company" table="NumberingSeries" id={series.id} /></div>
      ) : (
        <form onSubmit={save} noValidate className={series ? "mt" : undefined}>
          {locked && (
            <div className="mb">
              <Banner tone="info" title="Numbers already issued">The format is locked so existing document numbers stay unique. You can still deactivate the series.</Banner>
            </div>
          )}
          <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <FormGrid>
              <Field label="Document type" required full error={errors.docType?.message}>
                <Select {...register("docType", { onChange: (e) => pickDocType(e.target.value) })} disabled={locked || !!series} aria-invalid={!!errors.docType}>
                  <option value="">Choose…</option>
                  {modules.map(([module, docs]) => (
                    <optgroup key={module} label={module}>
                      {docs.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Branch" full error={errors.branchId?.message} hint="A branch series wins over the all-branches one for that branch">
                <Select {...register("branchId", { setValueAs: (v) => v || null })} disabled={locked || !!series}>
                  <option value="">All branches</option>
                  {refs.branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </Select>
              </Field>
              <Field label="Prefix" required error={errors.prefix?.message}><Input {...register("prefix")} disabled={locked} aria-invalid={!!errors.prefix} style={{ textTransform: "uppercase" }} /></Field>
              <Field label="Pattern" required error={errors.pattern?.message}><Input {...register("pattern")} disabled={locked} aria-invalid={!!errors.pattern} /></Field>
              <Field label="Padding" error={errors.padding?.message} hint="Digits in {SEQ}"><Input type="number" {...register("padding")} disabled={locked} aria-invalid={!!errors.padding} /></Field>
              <Field label="Start at" error={errors.startValue?.message}><Input type="number" {...register("startValue")} disabled={locked} aria-invalid={!!errors.startValue} /></Field>
              <Field label="Reset numbering" error={errors.resetPolicy?.message}>
                <Select {...register("resetPolicy")} disabled={locked}>
                  {lookupOptions(lookups, "ResetPolicy", series?.resetPolicy).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </Select>
              </Field>
              <div className="full"><Switch {...register("isActive")} label="Active" /></div>
            </FormGrid>
          </fieldset>
          <button type="submit" hidden />
        </form>
      )}
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} onConfirm={remove} busy={busy} danger title="Delete numbering series?" confirmLabel="Delete">
        No numbers were issued from this series yet. Its history is kept.
      </ConfirmDialog>
    </Drawer>
  );
}
