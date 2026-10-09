"use client";

import { ArrowRight, Check, CircleCheck, CircleX, Clock, Download, FileSpreadsheet, Hash, ListX, RotateCcw, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { IMPORT_ENTITIES, type DataImport, type ImportEntity, type ImportError } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/form";
import { Banner, Skeleton } from "@/components/ui/states";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { importErrorsUrl } from "../api";
import { entLabel, fmtN, isEntity, statusLabel, STATUS_TONE, type MappedRow } from "./import-meta";

const SHOW_OK = 50, SHOW_BAD = 200, SHOW_CHIPS = 40;

/** Error tallies of a validated job: distinct bad rows and errors by row number. */
export function tally(job: DataImport | null, total: number) {
  const byRow = new Map<number, ImportError[]>();
  for (const e of job?.errors ?? []) byRow.set(e.rowNo, [...(byRow.get(e.rowNo) ?? []), e]);
  const bad = job ? Math.max(job.errorCount, byRow.size) : 0;
  return { byRow, bad, ok: Math.max(0, total - bad) };
}

/** Step 4 (template pValidate + paintRows): server-side validation summary, error chips and the inline-fix table. */
export function ValidatePane({ entity, mapped, rows, job, checking, error, skip, onSkip, onEdit, canExport, onRetry }: {
  entity: ImportEntity;
  mapped: string[];
  rows: MappedRow[];
  job: DataImport | null;
  checking: boolean;
  error: string | null;
  skip: boolean;
  onSkip: (v: boolean) => void;
  onEdit: (index: number, field: string, value: string) => void;
  canExport: boolean;
  onRetry: () => void;
}) {
  const fields = IMPORT_ENTITIES[entity].fields.filter((f) => mapped.includes(f.key));
  const { byRow, bad, ok } = useMemo(() => tally(job, rows.length), [job, rows.length]);
  const label = (fk: string | null) => IMPORT_ENTITIES[entity].fields.find((f) => f.key === fk)?.label ?? fk ?? "Row";
  const allErrors = useMemo(() => [...byRow.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, es]) => es), [byRow]);
  const visible = useMemo(() => {
    const set = new Set<number>([...byRow.keys()].sort((a, b) => a - b).slice(0, SHOW_BAD));
    for (let n = 1; n <= Math.min(rows.length, SHOW_OK); n++) set.add(n);
    return [...set].filter((n) => n <= rows.length).sort((a, b) => a - b);
  }, [byRow, rows.length]);

  const focusCell = (rowNo: number, fk: string | null) => {
    const el = document.querySelector<HTMLInputElement>(`.cp-im-tbl tr[data-row="${rowNo}"] td[data-fk="${fk}"] input`);
    if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => el.focus(), 250); }
  };

  if (error && !job) return <Banner tone="danger" title="Could not validate the file" action={<button type="button" className="btn sm secondary" onClick={onRetry}>Retry</button>}>{error}</Banner>;
  if (!job) {
    return (
      <>
        <div className="cp-pane-h"><h3>Review & fix</h3><p><span className="im-checking"><span className="cp-spin" />Checking {fmtN(rows.length)} rows against the {entLabel(entity).toLowerCase()} rules…</span></p></div>
        <Skeleton style={{ height: 88, marginBottom: 14 }} />
        <Skeleton style={{ height: 280 }} />
      </>
    );
  }

  return (
    <>
      <div className="cp-pane-h row">
        <div>
          <h3>Review & fix</h3>
          <p>{visible.length < rows.length ? `Showing ${fmtN(visible.length)} of ${fmtN(rows.length)} rows (every row with errors first). ` : `${fmtN(rows.length)} rows checked. `}Click any red cell to fix it in place.</p>
        </div>
        <span className="spacer" />
        {checking && <span className="im-checking"><span className="cp-spin" />Re-checking…</span>}
        {canExport && (bad > 0
          ? <a className="btn secondary sm" href={importErrorsUrl(job.id)} download><Download />Download errors</a>
          : <button type="button" className="btn secondary sm" disabled title="No errors to download"><Download />Download errors</button>)}
      </div>
      {error && <Banner tone="danger" title="Could not re-check the rows">{error}</Banner>}
      <div className="cp-val-sum im-two">
        <div className="cp-vs good"><span className="icon-well"><CircleCheck /></span><div><b>{fmtN(ok)}</b><small>Rows ready</small></div></div>
        <div className="cp-vs bad"><span className="icon-well"><CircleX /></span><div><b>{fmtN(bad)}</b><small>Rows with errors</small></div></div>
        <div className="cp-vs-bar">
          <div className="cp-vs-track"><i className="g" style={{ flex: ok }} /><i className="r" style={{ flex: bad * 6 }} /></div>
          <Switch label="Skip rows with errors" checked={skip} onChange={(e) => onSkip(e.target.checked)} />
        </div>
      </div>
      <div className="cp-errlist">
        {allErrors.length ? (
          <>
            <b><ListX />{fmtN(allErrors.length)} issue{allErrors.length > 1 ? "s" : ""} to fix</b>
            {allErrors.slice(0, SHOW_CHIPS).map((e, i) => (
              <button key={i} type="button" onClick={() => focusCell(e.rowNo, e.fieldKey)}>Row {e.rowNo}{e.fieldKey ? ` · ${label(e.fieldKey)}` : ""} · {e.message}</button>
            ))}
            {allErrors.length > SHOW_CHIPS && <span className="im-more">+{fmtN(allErrors.length - SHOW_CHIPS)} more in the error report</span>}
          </>
        ) : <b className="ok"><Sparkles />All clear. Every row passes validation.</b>}
      </div>
      <div className="table-wrap cp-im-tw">
        <table className="tbl compact cp-im-tbl" data-plain>
          <thead><tr><th>#</th>{fields.map((f) => <th key={f.key}>{f.label}{f.required ? " *" : ""}</th>)}<th>Status</th></tr></thead>
          <tbody>
            {visible.map((n) => {
              const r = rows[n - 1]!, errs = byRow.get(n) ?? [];
              return (
                <tr key={n} data-row={n} className={errs.length ? "cp-err-row" : undefined}>
                  <td className="muted">{n}</td>
                  {fields.map((f) => {
                    const er = errs.find((e) => e.fieldKey === f.key);
                    const v = r[f.key] ?? "";
                    if (!er) return <td key={f.key}>{v === "" ? <span className="zero">—</span> : v}</td>;
                    const commit = (el: HTMLInputElement) => { if (el.value.trim() !== v.trim()) onEdit(n - 1, f.key, el.value.trim()); };
                    return (
                      <td key={f.key} className="cp-bad" data-fk={f.key} title={er.message}>
                        <input key={v} className="cp-fix" defaultValue={v} placeholder={f.label} aria-label={er.message} disabled={checking}
                          onBlur={(e) => commit(e.currentTarget)} onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget)} />
                        <span className="im-why">{er.message}</span>
                      </td>
                    );
                  })}
                  <td>
                    {errs.length
                      ? <span className="badge danger" title={errs.filter((e) => !e.fieldKey || !mapped.includes(e.fieldKey)).map((e) => e.message).join("; ") || undefined}><CircleX />{errs.length} error{errs.length > 1 ? "s" : ""}</span>
                      : <span className="badge good"><Check />OK</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

const C = 2 * Math.PI * 52;
/** Template cp-ring (an SVG progress ring). */
const Ring = ({ pct }: { pct: number }) => (
  <svg className="cp-ring" viewBox="0 0 120 120" aria-hidden="true">
    <circle className="trk" cx="60" cy="60" r="52" />
    <circle className="val" cx="60" cy="60" r="52" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - pct / 100)).toFixed(1)} />
  </svg>
);

/** Step 5 while the server runs the import (template pImport): an indeterminate ring, counters and an elapsed timer. */
export function ImportingPane({ entity, total, willSkip, seconds }: { entity: ImportEntity; total: number; willSkip: number; seconds: number }) {
  const name = entLabel(entity).toLowerCase();
  return (
    <div className="cp-imp" aria-busy="true">
      <div className="cp-imp-ring">
        <div className="im-spin"><Ring pct={28} /></div>
        <div className="cp-su-pct"><b>{seconds}</b><span>s</span><small>Importing {name}</small></div>
      </div>
      <div className="cp-imp-c">
        <div className="cp-imp-ctr">
          <div><b>{fmtN(total)}</b><small>Rows sent</small></div>
          <div><b>{fmtN(total - willSkip)}</b><small>To create</small></div>
          <div><b>{fmtN(willSkip)}</b><small>Skipped</small></div>
          <div><b>{seconds}s</b><small>Elapsed</small></div>
        </div>
        <div className="progress lg lime im-indet"><i /></div>
        <div className="cp-imp-log">
          <div><span className="cp-spin" /><span>Creating {name} one row at a time, with the same checks, numbering and history as the {name} screen</span></div>
          <div><Clock /><span>Large files can take a minute. Keep this page open.</span></div>
        </div>
      </div>
    </div>
  );
}

/** Step 5 result (template cp-done), also used for a job opened from Import history. */
export function ResultPane({ job, canExport, onAgain, extra }: { job: DataImport; canExport: boolean; onAgain: () => void; extra?: ReactNode }) {
  const ent = isEntity(job.entity) ? IMPORT_ENTITIES[job.entity] : null;
  const name = entLabel(job.entity).toLowerCase();
  const done = job.status === "COMPLETED";
  const took = job.startedAt && job.finishedAt ? (new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000 : null;
  return (
    <div className="cp-done">
      <div className="cp-done-ic" style={done ? undefined : { background: "var(--surface-3)", color: "var(--muted)", boxShadow: "none" }}>{done ? <Check /> : <FileSpreadsheet />}</div>
      <h3>{done ? `${fmtN(job.rowsCreated)} ${name} imported` : `Import ${job.jobNo}`}</h3>
      <p>
        {done
          ? <>{fmtN(job.rowsCreated)} created, {fmtN(job.rowsSkipped)} skipped{job.rowsSkipped ? " (download the error rows to fix and re-import them)" : ""}. Job <b>{job.jobNo}</b>.</>
          : <>This import of {fmtN(job.totalRows)} {name} rows is <Badge tone={STATUS_TONE[job.status] ?? "neutral"}>{statusLabel(job.status)}</Badge>{job.errorCount ? `, ${fmtN(job.errorCount)} rows with errors` : ""}.</>}
      </p>
      <div className="cp-done-st">
        <span className="pill"><Hash />{job.jobNo}</span>
        {took !== null && <span className="pill"><Clock />Took {took.toFixed(1)}s</span>}
        {job.startedBy && <span className="pill"><User />By {job.startedBy.name}</span>}
        <span className="pill"><FileSpreadsheet />{job.fileName}</span>
        <span className="pill"><Clock />{dateLabel(job.finishedAt ?? job.createdAt)}</span>
      </div>
      {extra}
      <div className="row cp-center cp-wrap-row">
        <button type="button" className="btn secondary" onClick={onAgain}><RotateCcw />Import something else</button>
        {canExport && (done ? job.rowsSkipped > 0 : job.errorCount > 0) && <a className="btn ghost" href={importErrorsUrl(job.id)} download><Download />Error rows</a>}
        {ent && <Link className="btn primary" href={ent.route}>View {name}<ArrowRight /></Link>}
      </div>
    </div>
  );
}
