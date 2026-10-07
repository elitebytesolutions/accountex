"use client";

import { Download, Info, Pause, Play, Plus, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FILTER_OP_LABELS, FILTER_OPS, REPORT_SOURCES, REPORT_SOURCE_KEYS, resolveDateRange, type FilterOp, type ReportFilter, type ReportOptions, type ReportPreview,
  type ReportSource, type ReportSourceKey, type SavedReport, type SavedReportSummary,
} from "@/shared/reports/saved-report";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { RecordModal } from "@/features/hr/components/record-modal";
import { lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  createReportSchedule, createSavedReport, deleteReportSchedule, deleteSavedReport, getSavedReport, listSavedReports, previewReport, reportOptions,
  setSavedReportShares, updateReportSchedule, updateSavedReport,
} from "../api";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Def = {
  sourceEntity: ReportSourceKey; dateRange: string; dateFrom: string; dateTo: string; branchId: string; columns: string[]; filters: ReportFilter[];
  groupBy: string; sortField: string; sortDir: "ASC" | "DESC"; rowLimit: string; showTotals: boolean; chartType: "BAR" | "LINE" | "DONUT";
};
type SaveForm = {
  name: string; description: string; folder: string; visibility: string; isFavourite: boolean; roleIds: string[];
  schedule: boolean; frequency: string; dayOfWeek: string; dayOfMonth: string; runTime: string; format: string; recipients: string;
};
const SRC = REPORT_SOURCES as Record<string, ReportSource>;
const DOW = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const numeric = (t: string) => t === "number" || t === "money";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 2026-10-01 → 01 Oct 2026 (template date style); anything else is returned as is. */
const dmy = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? `${m[3]} ${MON[Number(m[2]) - 1]} ${m[1]}` : v; };
const fmt = (v: string | number | null, type: string) =>
  v === null ? "—" : type === "date" && typeof v === "string" ? dmy(v) : typeof v === "number" ? v.toLocaleString("en-US", type === "money" ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 }) : v;
const defaults = (source: ReportSourceKey, base?: Partial<Def>): Def => {
  const s = SRC[source]!;
  return {
    sourceEntity: source, dateRange: "THIS_QUARTER", dateFrom: "", dateTo: "", branchId: "", columns: [...s.defaultColumns], filters: [],
    groupBy: s.defaultGroupBy[0] ?? "", sortField: s.defaultSort, sortDir: "DESC", rowLimit: "8", showTotals: true, chartType: "BAR", ...base,
  };
};
const fromSaved = (r: SavedReport): Def => ({
  sourceEntity: (r.sourceEntity ?? "SALES_INVOICES") as ReportSourceKey, dateRange: r.dateRange, dateFrom: r.dateFrom ?? "", dateTo: r.dateTo ?? "", branchId: r.branchId ?? "",
  columns: r.columns.filter((c) => c.isVisible).map((c) => c.fieldKey), filters: r.filters, groupBy: r.groupBy[0] ?? "", sortField: r.sortField ?? "",
  sortDir: r.sortDir === "ASC" ? "ASC" : "DESC", rowLimit: r.rowLimit ? String(r.rowLimit) : "", showTotals: r.showTotals,
  chartType: (r.chartType as Def["chartType"]) ?? "BAR",
});
/** The request body of a definition (preview and save share it). Columns follow the source's field order. */
const queryOf = (d: Def) => {
  const s = SRC[d.sourceEntity]!;
  return {
    sourceEntity: d.sourceEntity, dateRange: d.dateRange, dateFrom: d.dateFrom, dateTo: d.dateTo, branchId: d.branchId,
    columns: s.fields.filter((f) => d.columns.includes(f.key)).map((f) => ({ fieldKey: f.key, isVisible: true, aggregate: "NONE" })),
    filters: d.filters.filter((f) => f.value.trim() !== ""), groupBy: d.groupBy ? [d.groupBy] : [], sortField: d.sortField, sortDir: d.sortDir,
    rowLimit: d.rowLimit ? Number(d.rowLimit) : null, showTotals: d.showTotals,
  };
};

/**
 * Template app/reports/studio (42-acc-reports.html): report selector, builder steps 1–4, Table / Chart preview and the
 * Save & schedule modal (#rpt-studio-save). The preview is live and read-only; export downloads the preview as CSV.
 * Schedules are stored now and sent from Phase 35.
 */
export function ReportStudioScreen({ can, userId }: { can: Can; userId: string }) {
  const toast = useToast();
  const lookups = useLookups(["DateRange", "Folder"]);
  const [opts, setOpts] = useState<ReportOptions | null>(null);
  const [saved, setSaved] = useState<SavedReportSummary[]>([]);
  const [loadError, setLoadError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [current, setCurrent] = useState<SavedReport | null>(null);
  const [def, setDef] = useState<Def>(() => defaults("SALES_INVOICES"));
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [previewError, setPreviewError] = useState<{ message: string; reference?: string; code?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<"tbl" | "chart">("tbl");
  const [saveOpen, setSaveOpen] = useState(false);
  const [sf, setSf] = useState<SaveForm | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (d: Def) => {
    setRunning(true);
    try {
      setPreview(await previewReport(queryOf(d)));
      setPreviewError(null);
    } catch (e) {
      setPreview(null);
      setPreviewError(e instanceof ApiError ? { message: e.message, reference: e.correlationId, code: e.code } : { message: "Could not run the report" });
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([reportOptions(), listSavedReports()])
      .then(([o, list]) => {
        if (cancelled) return;
        setOpts(o);
        setSaved(list);
        setLoadError(null);
        // The studio opens on a ready report (template): the first source the user may preview, run straight away.
        const start = defaults((o.allowedSources.includes("SALES_INVOICES") ? "SALES_INVOICES" : o.allowedSources[0] ?? "SALES_INVOICES") as ReportSourceKey);
        setDef(start);
        if (o.allowedSources.includes(start.sourceEntity)) void run(start);
      })
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load Report Studio" }));
    return () => { cancelled = true; };
  }, [attempt, run]);

  const source = SRC[def.sourceEntity]!;
  const set = (patch: Partial<Def>) => setDef((d) => ({ ...d, ...patch }));
  const title = current?.name ?? `Untitled — ${source.label}${def.groupBy ? ` by ${source.fields.find((f) => f.key === def.groupBy)?.label.toLowerCase()}` : ""}`;
  const range = resolveDateRange(def.dateRange, def.dateFrom || null, def.dateTo || null, new Date().toISOString().slice(0, 10));
  const rangeText = source.dated ? (range.from || range.to ? `${range.from ? dmy(range.from) : "…"} – ${range.to ? dmy(range.to) : "…"}` : "All dates") : "All records";
  const allowed = (k: string) => !!opts?.allowedSources.includes(k);
  const canSaveDef = current ? current.canEdit : can.create;

  const pick = async (value: string) => {
    if (!value) {
      setCurrent(null);
      return;
    }
    try {
      const r = await getSavedReport(value);
      const d = fromSaved(r);
      setCurrent(r);
      setDef(d);
      if (allowed(d.sourceEntity)) void run(d);
    } catch (e) {
      toast(apiMessage(e, "Could not open the report"), { tone: "danger" });
    }
  };
  const changeSource = (k: ReportSourceKey) => { const d = defaults(k, { dateRange: def.dateRange, dateFrom: def.dateFrom, dateTo: def.dateTo }); setDef(d); setPreview(null); setPreviewError(null); if (allowed(k)) void run(d); };
  const reset = () => { const d = current ? fromSaved(current) : defaults(def.sourceEntity); setDef(d); toast("Reset to defaults", { tone: "info" }); };

  const exportCsv = () => {
    if (!preview) return;
    const esc = (v: string | number | null) => { const s = v === null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [preview.columns.map((c) => esc(c.label)).join(","), ...preview.rows.map((r) => r.map(esc).join(","))];
    if (preview.totals) lines.push(preview.totals.map((t, i) => (i === 0 && t === null ? "Total" : esc(t))).join(","));
    const url = URL.createObjectURL(new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "report"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported to CSV", { tone: "good" });
  };

  const openSave = () => {
    setErrs({});
    setSf({
      name: current?.name ?? title.replace(/^Untitled — /, ""), description: current?.description ?? "", folder: current?.folder ?? (def.sourceEntity === "PAYROLL_LINES" ? "PAYROLL" : def.sourceEntity === "SALES_INVOICES" || def.sourceEntity === "CUSTOMERS" ? "SALES" : "GENERAL"),
      visibility: current?.visibility ?? "PRIVATE", isFavourite: current?.isFavourite ?? true, roleIds: current?.shares.filter((s) => s.shareType === "ROLE").map((s) => s.roleId!) ?? [],
      schedule: false, frequency: "MONTHLY", dayOfWeek: "1", dayOfMonth: "3", runTime: "08:00", format: "XLSX", recipients: "",
    });
    setSaveOpen(true);
  };
  const setS = (patch: Partial<SaveForm>) => { setSf((x) => (x ? { ...x, ...patch } : x)); setErrs((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, ""])) })); };
  const schedulePayload = (f: SaveForm) => {
    const emails = f.recipients.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    return { frequency: f.frequency, dayOfWeek: f.frequency === "WEEKLY" ? Number(f.dayOfWeek) : null, dayOfMonth: f.frequency === "MONTHLY" || f.frequency === "QUARTERLY" ? Number(f.dayOfMonth) : null, runTime: f.runTime, format: f.format, recipientEmails: emails, recipientUserIds: [], onlyIfRows: false, status: "ACTIVE" };
  };
  const doSave = async () => {
    if (!sf) return;
    setBusy(true);
    setErrs({});
    try {
      const shares = sf.visibility === "SHARED" ? sf.roleIds.map((roleId) => ({ shareType: "ROLE", roleId, canEdit: false })) : [];
      const body = { ...queryOf(def), name: sf.name, description: sf.description, folder: sf.folder, isFavourite: sf.isFavourite, display: view === "chart" ? "CHART" : "TABLE", chartType: def.chartType, defaultFormat: sf.format === "CSV" ? "CSV" : sf.format === "PDF" ? "PDF" : "XLSX" };
      let r: SavedReport;
      if (current) {
        r = await updateSavedReport(current.id, { ...body, rowVersion: current.rowVersion });
        if (current.owner.id === userId) r = await setSavedReportShares(r.id, { rowVersion: r.rowVersion, visibility: sf.visibility, shares });
      } else {
        r = await createSavedReport({ ...body, visibility: sf.visibility, shares });
      }
      if (sf.schedule) r = await createReportSchedule(r.id, schedulePayload(sf));
      setCurrent(r);
      setSaved(await listSavedReports());
      setSaveOpen(false);
      toast(sf.schedule ? "Report saved and scheduled · delivery starts in Phase 35" : "Report saved", { tone: "good" });
    } catch (e) {
      const fe = apiFieldErrors(e);
      if (fe.recipientEmails === undefined && Object.keys(fe).some((k) => k.startsWith("recipientEmails"))) fe.recipientEmails = "Use email addresses";
      const dupName = e instanceof ApiError && e.code === "DB_UNIQUE_VIOLATION";
      if (dupName) fe.name = "You already have a report with this name";
      setErrs(fe);
      toast(dupName ? "You already have a report with this name" : apiMessage(e, "Could not save the report"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const scheduleAction = async (work: () => Promise<SavedReport>, done: string) => {
    setBusy(true);
    try { setCurrent(await work()); toast(done, { tone: "good" }); } catch (e) { toast(apiMessage(e, "Could not change the schedule"), { tone: "danger" }); } finally { setBusy(false); }
  };

  // Chart data: the first text column against the first number column.
  const chart = useMemo(() => {
    if (!preview) return null;
    const li = preview.columns.findIndex((c) => !numeric(c.type));
    const vi = preview.columns.findIndex((c) => numeric(c.type));
    if (vi < 0) return null;
    const items = preview.rows.slice(0, 12).map((r) => ({ label: li >= 0 ? String(r[li] ?? "—") : "", value: typeof r[vi] === "number" ? (r[vi] as number) : 0 }));
    return { items, max: Math.max(1, ...items.map((x) => Math.abs(x.value))), label: preview.columns[vi]!.label };
  }, [preview]);

  if (loadError) return <><PageHead eyebrow="Analytics / Report Studio" title="Report Studio" /><ErrorState message={loadError.message} reference={loadError.reference} onRetry={() => setAttempt((n) => n + 1)} /></>;

  const textFields = source.fields.filter((f) => !numeric(f.type));
  const sel = (k: string) => def.columns.includes(k);
  const filterDescr = def.filters.filter((f) => f.value.trim()).map((f) => `${source.fields.find((x) => x.key === f.field)?.label.toLowerCase()} ${FILTER_OP_LABELS[f.op]} ${f.value}`);
  const DONUT = ["var(--primary)", "var(--blue)", "var(--violet)", "var(--orange)", "var(--lime)", "var(--danger)"];

  return (
    <>
      <PageHead eyebrow="Analytics / Report Studio" title="Report Studio" description="Build custom reports from any data source — pick columns, filter, group and visualise, then save or schedule."
        actions={<>
          <select value={current?.id ?? ""} onChange={(e) => void pick(e.target.value)} aria-label="Report">
            <option value="">{current ? "New report…" : title}</option>
            {saved.map((r) => <option key={r.id} value={r.id}>{r.name}{r.owner.id !== userId ? ` · ${r.owner.name}` : ""}</option>)}
          </select>
          <button className="btn secondary" type="button" disabled={!preview?.rows.length} onClick={exportCsv}><Download />Export</button>
          {canSaveDef && <button className="btn primary" type="button" onClick={openSave} disabled={!allowed(def.sourceEntity) || !def.columns.length}><Save />Save &amp; schedule</button>}
        </>} />

      <div className="split-l">
        <div className="panel">
          <div className="form-section"><h4>1. Data source</h4></div>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <label><span>Source</span>
              <select value={def.sourceEntity} onChange={(e) => changeSource(e.target.value as ReportSourceKey)}>
                {REPORT_SOURCE_KEYS.map((k) => <option key={k} value={k} disabled={!!opts && !allowed(k)}>{SRC[k]!.label}{opts && !allowed(k) ? " (no access)" : ""}</option>)}
              </select>
            </label>
            {source.dated && (
              <label><span>Date range</span>
                <select value={def.dateRange} onChange={(e) => set({ dateRange: e.target.value })}>{lookupOptions(lookups, "DateRange", def.dateRange).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
              </label>
            )}
            {source.dated && def.dateRange === "CUSTOM" && <label><span>From</span><input type="date" value={def.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} /></label>}
            {source.dated && (def.dateRange === "CUSTOM" || def.dateRange === "AS_ON") && <label><span>{def.dateRange === "AS_ON" ? "As on" : "To"}</span><input type="date" value={def.dateTo} onChange={(e) => set({ dateTo: e.target.value })} /></label>}
            {source.branched && (
              <label><span>Branch</span><select value={def.branchId} onChange={(e) => set({ branchId: e.target.value })}><option value="">All branches</option>{opts?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            )}
          </div>

          <div className="form-section"><h4>2. Columns</h4><p>Click to toggle</p></div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {source.fields.map((f) => (
              <label key={f.key} className="ck"><input type="checkbox" checked={sel(f.key)} onChange={(e) => set({ columns: e.target.checked ? [...def.columns, f.key] : def.columns.filter((k) => k !== f.key) })} /><span>{f.label}</span></label>
            ))}
          </div>

          <div className="form-section"><h4>3. Filters</h4></div>
          <div className="stack">
            {def.filters.map((flt, i) => {
              const fld = source.fields.find((x) => x.key === flt.field);
              const ops = FILTER_OPS.filter((o) => (numeric(fld?.type ?? "") || fld?.type === "date" ? o !== "contains" : ["eq", "ne", "contains"].includes(o)));
              const upd = (patch: Partial<ReportFilter>) => set({ filters: def.filters.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="row small">
                  <select value={flt.field} aria-label="Field" onChange={(e) => { const t = source.fields.find((x) => x.key === e.target.value)?.type; upd({ field: e.target.value, op: numeric(t ?? "") ? "gte" : "eq", value: "" }); }}>{source.fields.filter((x) => !x.count).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
                  <select value={flt.op} aria-label="Condition" onChange={(e) => upd({ op: e.target.value as FilterOp })}>{ops.map((o) => <option key={o} value={o}>{FILTER_OP_LABELS[o]}</option>)}</select>
                  <input value={flt.value} type={fld?.type === "date" ? "date" : "text"} inputMode={numeric(fld?.type ?? "") ? "decimal" : undefined} style={{ width: 110 }} aria-label="Value" onChange={(e) => upd({ value: e.target.value })} />
                  <button type="button" className="icon-btn-sm" aria-label="Remove filter" onClick={() => set({ filters: def.filters.filter((_, n) => n !== i) })}><X /></button>
                </div>
              );
            })}
            {def.filters.length < 10 && <button type="button" className="btn ghost sm" onClick={() => { const f = textFields.find((x) => x.key === "status") ?? source.fields[0]!; set({ filters: [...def.filters, { field: f.key, op: numeric(f.type) ? "gte" : "eq", value: "" }] }); }}><Plus />Add filter</button>}
          </div>

          <div className="form-section"><h4>4. Group &amp; sort</h4></div>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <label><span>Group by</span><select value={def.groupBy} onChange={(e) => set({ groupBy: e.target.value })}><option value="">No grouping (detail rows)</option>{textFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
            <label><span>Sort by</span>
              <select value={`${def.sortField}|${def.sortDir}`} onChange={(e) => { const [k, d] = e.target.value.split("|"); set({ sortField: k ?? "", sortDir: d === "ASC" ? "ASC" : "DESC" }); }}>
                <option value="|DESC">Unsorted</option>
                {source.fields.filter((f) => sel(f.key) || f.key === def.groupBy).flatMap((f) => [
                  <option key={`${f.key}-d`} value={`${f.key}|DESC`}>{f.label} — {numeric(f.type) ? "descending" : "Z to A"}</option>,
                  <option key={`${f.key}-a`} value={`${f.key}|ASC`}>{f.label} — {numeric(f.type) ? "ascending" : "A to Z"}</option>,
                ])}
              </select>
            </label>
            <label><span>Limit</span><select value={def.rowLimit} onChange={(e) => set({ rowLimit: e.target.value })}><option value="8">Top 8</option><option value="20">Top 20</option><option value="100">Top 100</option><option value="">All rows (preview shows up to 1,000)</option></select></label>
            <label className="check"><input type="checkbox" checked={def.showTotals} onChange={(e) => set({ showTotals: e.target.checked })} /> Show totals row</label>
          </div>
          <div className="form-actions">
            <button className="btn secondary sm" type="button" onClick={reset}>Reset</button>
            <button className="btn primary sm" type="button" disabled={running || !allowed(def.sourceEntity) || !def.columns.length} onClick={() => void run(def).then(() => undefined)}><Play />{running ? "Running…" : "Run"}</button>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <div><h3>{title.replace(/^Untitled — /, "")}</h3><p>{[rangeText, ...filterDescr, def.rowLimit ? `top ${def.rowLimit}` : "all rows"].join(" · ")}</p></div>
              <div className="panel-actions"><div className="tabs"><button type="button" className={cn(view === "tbl" && "active")} onClick={() => setView("tbl")}>Table</button><button type="button" className={cn(view === "chart" && "active")} onClick={() => setView("chart")}>Chart</button></div></div>
            </div>
            {opts && !allowed(def.sourceEntity) ? (
              <Banner tone="warn" title="No access to this data source">You need {source.permission} to report on {source.label.toLowerCase()}.</Banner>
            ) : previewError ? (
              previewError.code === "REPORT_SOURCE_FORBIDDEN" ? <Banner tone="warn" title="No access to this data source">{previewError.message}</Banner>
                : previewError.code === "VALIDATION_FAILED" || previewError.code === "REPORT_FIELD_NOT_ALLOWED" ? <Banner tone="warn" title="Check the report">{previewError.message}</Banner>
                : <ErrorState message={previewError.message} reference={previewError.reference} onRetry={() => void run(def)} />
            ) : !preview || running ? <Skeleton style={{ height: 260 }} /> : !preview.rows.length ? (
              <EmptyState title="No rows" description={preview.pendingPhase ? `${source.label} are recorded from Phase ${preview.pendingPhase}; this report fills in then.` : "Nothing matches this range and these filters."} />
            ) : view === "tbl" ? (
              <div className="table-wrap"><table className="tbl">
                <thead><tr>{preview.columns.map((c) => <th key={c.key} className={cn(numeric(c.type) && "num")}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {preview.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={cn(numeric(preview.columns[j]!.type) && "num")}>{fmt(v, preview.columns[j]!.type)}</td>)}</tr>)}
                  {preview.totals && (
                    <tr className="total">{preview.totals.map((t, j) => <td key={j} className={cn(numeric(preview.columns[j]!.type) && "num")}>{j === 0 && t === null ? `Total — ${preview.rows.length} row${preview.rows.length === 1 ? "" : "s"}` : t === null ? "" : fmt(t, preview.columns[j]!.type)}</td>)}</tr>
                  )}
                </tbody>
              </table></div>
            ) : chart ? (
              <>
                <div className="row mb">
                  <div className="seg">{(["BAR", "LINE", "DONUT"] as const).map((t) => <button key={t} type="button" className={cn(def.chartType === t && "active")} onClick={() => set({ chartType: t })}>{t[0] + t.slice(1).toLowerCase()}</button>)}</div>
                  <span className="spacer" /><span className="small muted">{chart.label}</span>
                </div>
                {def.chartType === "BAR" ? (
                  <div className="bars">{chart.items.map((x, i) => <div key={i} className="bar" style={{ ["--h" as string]: `${Math.max(2, Math.round((Math.abs(x.value) / chart.max) * 100))}%` }} title={`${x.label}: ${fmt(x.value, "money")}`}><i /><span>{x.label.split(" ")[0]}</span></div>)}</div>
                ) : def.chartType === "LINE" ? (
                  <svg viewBox="0 0 400 160" style={{ width: "100%", height: 200 }} role="img" aria-label={chart.label}>
                    <polyline fill="none" stroke="var(--primary)" strokeWidth="2.5" points={chart.items.map((x, i) => `${chart.items.length > 1 ? (i / (chart.items.length - 1)) * 390 + 5 : 200},${150 - (Math.abs(x.value) / chart.max) * 140}`).join(" ")} />
                    {chart.items.map((x, i) => <circle key={i} r="3.5" fill="var(--primary)" cx={chart.items.length > 1 ? (i / (chart.items.length - 1)) * 390 + 5 : 200} cy={150 - (Math.abs(x.value) / chart.max) * 140}><title>{`${x.label}: ${fmt(x.value, "money")}`}</title></circle>)}
                  </svg>
                ) : (() => {
                  const total = chart.items.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
                  let at = 0;
                  const stops = chart.items.map((x, i) => { const from = at; at += (Math.abs(x.value) / total) * 100; return `${DONUT[i % DONUT.length]} ${from}% ${at}%`; });
                  return (
                    <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
                      <div style={{ width: 170, height: 170, borderRadius: "50%", background: `conic-gradient(${stops.join(", ")})`, WebkitMask: "radial-gradient(circle, transparent 52%, #000 53%)", mask: "radial-gradient(circle, transparent 52%, #000 53%)" }} role="img" aria-label={chart.label} />
                      <div className="legend" style={{ flexDirection: "column", alignItems: "flex-start" }}>{chart.items.map((x, i) => <span key={i}><i style={{ background: DONUT[i % DONUT.length] }} />{x.label} · {Math.round((Math.abs(x.value) / total) * 100)}%</span>)}</div>
                    </div>
                  );
                })()}
                <div className="legend"><span><i style={{ background: "var(--primary)" }} />{chart.label} · {rangeText}</span></div>
              </>
            ) : <EmptyState title="Nothing to chart" description="Add a number column (e.g. an amount) to see a chart." />}
            {preview?.truncated && <p className="small muted mt">Showing the first {preview.rows.length.toLocaleString()} rows. Narrow the filters, or save the report and export it in full once scheduled delivery arrives (Phase 35).</p>}
          </div>
          <div className="banner info"><Info /><div><b>Tip</b><p>Group by Branch and switch to Chart to compare your branches side by side.</p></div></div>
        </div>
      </div>

      {saveOpen && sf && (
        <RecordModal open onClose={() => setSaveOpen(false)} busy={busy} title="Save & schedule report" subtitle="Saved reports appear in the report selector above (favourites first in Reports Hub later)."
          history={current ? { schema: "Reports", table: "SavedReports", id: current.id } : null} canSave={canSaveDef} saveLabel="Save report" onSave={() => void doSave()}
          canDelete={can.remove && !!current && current.owner.id === userId}
          onDelete={async () => {
            if (!current) return;
            try { await deleteSavedReport(current.id, current.rowVersion); toast("Report deleted", { tone: "good" }); setSaveOpen(false); setCurrent(null); setSaved(await listSavedReports()); } catch (e) { toast(apiMessage(e, "Could not delete the report"), { tone: "danger" }); }
          }}
          deleteNote="The report and its schedules stop for everyone it is shared with.">
          <FormGrid>
            <Field label="Report name" required full error={errs.name}><input value={sf.name} maxLength={120} onChange={(e) => setS({ name: e.target.value })} /></Field>
            <Field label="Folder" error={errs.folder}><select value={sf.folder} onChange={(e) => setS({ folder: e.target.value })}>{lookupOptions(lookups, "Folder", sf.folder).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Visibility" error={errs.visibility}>
              <select value={sf.visibility} disabled={!!current && current.owner.id !== userId} onChange={(e) => setS({ visibility: e.target.value })}>
                <option value="PRIVATE">Only me</option><option value="SHARED">Selected roles</option><option value="EVERYONE">Everyone</option>
              </select>
            </Field>
            {sf.visibility === "SHARED" && (
              <Field label="Share with roles" full error={errs.shares}>
                <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>{opts?.roles.map((r) => <Check key={r.id} label={r.name} checked={sf.roleIds.includes(r.id)} disabled={!!current && current.owner.id !== userId} onChange={(e) => setS({ roleIds: e.target.checked ? [...sf.roleIds, r.id] : sf.roleIds.filter((x) => x !== r.id) })} />)}</div>
              </Field>
            )}
            <Check full label="Add to my favourites" checked={sf.isFavourite} onChange={(e) => setS({ isFavourite: e.target.checked })} />
            <Check full label="Email on a schedule" checked={sf.schedule} onChange={(e) => setS({ schedule: e.target.checked })} />
            {sf.schedule && <>
              <Field label="Frequency" error={errs.frequency}><select value={sf.frequency} onChange={(e) => setS({ frequency: e.target.value })}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option></select></Field>
              {sf.frequency === "WEEKLY" && <Field label="Day" error={errs.dayOfWeek}><select value={sf.dayOfWeek} onChange={(e) => setS({ dayOfWeek: e.target.value })}>{DOW.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></Field>}
              {(sf.frequency === "MONTHLY" || sf.frequency === "QUARTERLY") && <Field label="Day of month" error={errs.dayOfMonth}><input type="number" min={1} max={28} value={sf.dayOfMonth} onChange={(e) => setS({ dayOfMonth: e.target.value })} /></Field>}
              <Field label="At (PKT)" error={errs.runTime}><input type="time" value={sf.runTime} onChange={(e) => setS({ runTime: e.target.value })} /></Field>
              <Field label="Format" error={errs.format}><select value={sf.format} onChange={(e) => setS({ format: e.target.value })}><option value="XLSX">Excel (.xlsx)</option><option value="PDF">PDF</option><option value="CSV">CSV</option></select></Field>
              <Field label="Recipients" required full error={errs.recipientEmails} hint="Comma-separated email addresses"><input value={sf.recipients} placeholder="name@company.pk, finance@company.pk" onChange={(e) => setS({ recipients: e.target.value })} /></Field>
            </>}
            {current && current.schedules.length > 0 && (
              <div className="full">
                <div className="form-section"><h4>Schedules</h4><p><span className="badge warn">Delivery in Phase 35</span></p></div>
                {current.schedules.map((s) => (
                  <div key={s.id} className="list-item">
                    <div><b>{s.frequency[0] + s.frequency.slice(1).toLowerCase()}{s.dayOfWeek ? ` · ${DOW[s.dayOfWeek]}` : ""}{s.dayOfMonth ? ` · day ${s.dayOfMonth}` : ""} at {s.runTime} · {s.format}</b>
                      <small>{s.recipientEmails.join(", ")}{s.nextRunAt ? ` · next ${new Date(s.nextRunAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</small></div>
                    <span className="spacer" />
                    <span className={cn("badge dot", s.status === "ACTIVE" ? "good" : "warn")}>{s.status === "ACTIVE" ? "Active" : "Paused"}</span>
                    {current.canEdit && <>
                      <button type="button" className="icon-btn-sm" aria-label={s.status === "ACTIVE" ? "Pause" : "Resume"} disabled={busy} onClick={() => void scheduleAction(() => updateReportSchedule(current.id, s.id, { frequency: s.frequency, dayOfWeek: s.dayOfWeek, dayOfMonth: s.dayOfMonth, runTime: s.runTime, format: s.format, recipientEmails: s.recipientEmails, recipientUserIds: s.recipientUserIds, onlyIfRows: s.onlyIfRows, status: s.status === "ACTIVE" ? "PAUSED" : "ACTIVE", rowVersion: s.rowVersion }), s.status === "ACTIVE" ? "Schedule paused" : "Schedule resumed")}>{s.status === "ACTIVE" ? <Pause /> : <Play />}</button>
                      <button type="button" className="icon-btn-sm" aria-label="Delete schedule" disabled={busy} onClick={() => void scheduleAction(() => deleteReportSchedule(current.id, s.id, s.rowVersion), "Schedule deleted")}><Trash2 /></button>
                    </>}
                  </div>
                ))}
              </div>
            )}
          </FormGrid>
        </RecordModal>
      )}
    </>
  );
}
