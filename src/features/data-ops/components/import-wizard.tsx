"use client";

import {
  ArrowLeft, ArrowRight, Check, CloudUpload, Database, Download, FileSpreadsheet, FileText, FileUp, GripVertical, History, Lightbulb, Trash2, Upload, WandSparkles, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { autoMap, IMPORT_ENTITIES, IMPORT_ENTITY_KEYS, parseCsvText, type DataImport, type ImportEntity } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Menu } from "@/components/ui/menu";
import { Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { cancelImport, getImport, listImports, runImport, startImport, validateImport } from "../api";
import { COMING_LATER, downloadTemplate, ENT_UI, entLabel, fileSize, fmtN, isEntity, statusLabel, STATUS_TONE, type ImportCan, type MappedRow } from "./import-meta";
import { ImportingPane, ResultPane, tally, ValidatePane } from "./import-review";
import "./import-wizard.css";

const STEPS = ["Choose data", "Upload file", "Map columns", "Validate", "Import"];
const MAX_BYTES = 10 * 1024 * 1024, MAX_ROWS = 20000;
type Csv = { name: string; size: number; headers: string[]; rows: string[][] };
const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Template app/import (4A-company-plus.html + dataImport() in 9A-company-plus.js): the 5-step import wizard. */
export function ImportWizard({ can }: { can: ImportCan }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [ent, setEnt] = useState<ImportEntity | null>(null);
  const [csv, setCsv] = useState<Csv | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<MappedRow[]>([]);
  const [skip, setSkip] = useState(true);
  // server job: started once per (entity, file, mapping), then validated / run
  const [jobId, setJobId] = useState<string | null>(null);
  const jobKey = useRef("");
  const [job, setJob] = useState<DataImport | null>(null);
  const [checking, setChecking] = useState(false);
  const [valError, setValError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [runError, setRunError] = useState<{ code: string; message: string } | null>(null);
  const [result, setResult] = useState<DataImport | null>(null);
  const [seconds, setSeconds] = useState(0);
  // header actions
  const [tplAnchor, setTplAnchor] = useState<HTMLElement | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const closeTpl = useCallback(() => setTplAnchor(null), []);

  useEffect(() => {
    if (!importing) return;
    const t0 = Date.now();
    const t = setInterval(() => setSeconds(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [importing]);

  const reset = () => {
    setStep(0); setEnt(null); setCsv(null); setMap({}); setRows([]); setSkip(true); setJobId(null); jobKey.current = ""; setJob(null);
    setValError(null); setRunError(null); setResult(null); setImporting(false);
  };
  const entities = IMPORT_ENTITY_KEYS.filter((k) => can.create && can[ENT_UI[k].can]);
  const fields = ent ? IMPORT_ENTITIES[ent].fields : [];
  const required = fields.filter((f) => f.required);
  const requiredDone = required.filter((f) => map[f.key]).length;
  const { bad, ok } = tally(job, rows.length);

  // ------------------------------------------------------------ validate (step 4)
  const validate = async (data: MappedRow[]) => {
    if (!ent || !csv) return;
    setChecking(true);
    setValError(null);
    try {
      const key = JSON.stringify([ent, csv.name, csv.size, map]);
      let id = jobId;
      if (!id || jobKey.current !== key) {
        if (id) cancelImport(id).catch(() => {});
        const j = await startImport({ entity: ent, fileName: csv.name, fileSizeBytes: csv.size, sourceSystem: "EXCEL", columnMap: map, totalRows: data.length });
        id = j.id;
        setJobId(id);
        jobKey.current = key;
      }
      setJob(await validateImport(id, data));
    } catch (e) {
      if (e instanceof ApiError && e.code === "IMPORT_NOT_OPEN") { setJobId(null); jobKey.current = ""; }
      const msg = errText(e, "Could not validate the file");
      setValError(msg);
      toast(msg, { tone: "danger" });
    } finally { setChecking(false); }
  };
  const toValidate = () => {
    if (!csv) return;
    const idx = Object.fromEntries(Object.entries(map).map(([fk, h]) => [fk, csv.headers.indexOf(h)]));
    const data = csv.rows.map((r) => Object.fromEntries(Object.entries(idx).map(([fk, i]) => [fk, (r[i] ?? "").trim()])));
    setRows(data);
    setJob(null);
    setStep(3);
    void validate(data);
  };
  const editCell = (index: number, field: string, value: string) => {
    const data = rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    setRows(data);
    void validate(data);
  };

  // ------------------------------------------------------------ import (step 5)
  const doImport = async () => {
    if (!jobId) return;
    setStep(4);
    setRunError(null);
    setSeconds(0);
    setImporting(true);
    try {
      const j = await runImport(jobId, rows, skip);
      setResult(j);
      toast(`${fmtN(j.rowsCreated)} ${entLabel(j.entity).toLowerCase()} imported`, { tone: "good" });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "ERROR";
      if (code === "IMPORT_NOT_OPEN") { setJobId(null); jobKey.current = ""; }
      const message = errText(e, "The import did not finish");
      setRunError({ code, message });
      toast(message, { tone: "danger" });
    } finally { setImporting(false); }
  };

  const canNext = () => {
    if (!can.create) return false;
    if (step === 0) return !!ent;
    if (step === 1) return !!csv;
    if (step === 2) return requiredDone === required.length;
    if (step === 3) return !!job && !checking && ok > 0 && (skip || bad === 0);
    return false;
  };
  const next = () => {
    if (!canNext()) return;
    if (step === 2) toValidate();
    else if (step === 3) void doImport();
    else setStep(step + 1);
  };
  const back = () => { if (step === 3) setValError(null); setStep(Math.max(0, step - 1)); };
  const openJob = async (id: string) => {
    try {
      const j = await getImport(id);
      setHistOpen(false);
      reset();
      if (isEntity(j.entity)) setEnt(j.entity);
      setResult(j);
      setStep(4);
    } catch (e) { toast(errText(e, "Could not open the import"), { tone: "danger" }); }
  };

  const nextLabel = step === 3 ? `Import ${fmtN(ok)} rows` : ["Continue", "Continue to mapping", "Validate data"][step];
  const meta = (() => {
    if (step === 2 && ent) {
      return <>{Object.keys(map).length}/{fields.length} fields mapped · <b className={requiredDone === required.length ? "cp-okc" : "cp-badc"}>{requiredDone}/{required.length} required</b></>;
    }
    if (step === 3 && job) {
      if (checking) return <>Checking…</>;
      if (!bad) return <b className="cp-okc">Ready to import</b>;
      return skip ? <>{fmtN(bad)} error rows will be skipped</> : <b className="cp-badc">Fix {fmtN(bad)} rows or turn on “Skip rows with errors”</b>;
    }
    return ent ? <>{ENT_UI[ent].icon}{IMPORT_ENTITIES[ent].label}{csv ? ` · ${csv.name}` : ""}</> : <>Step {step + 1} of 5</>;
  })();
  const finished = step === 4 && (!!result || importing);

  return (
    <>
      <PageHead
        eyebrow={<><FileUp />Settings / Data Import</>}
        title="Data Import"
        description="Bring customers, vendors and items in from Excel, Tally, QuickBooks or Peachtree exports (saved as CSV)."
        actions={
          <>
            <button type="button" className="btn secondary" onClick={() => setHistOpen(true)}><History />Import history</button>
            <button type="button" className="btn secondary" onClick={(e) => setTplAnchor(tplAnchor ? null : e.currentTarget)}><Download />Download templates</button>
          </>
        }
      />
      <Menu
        anchor={tplAnchor}
        onClose={closeTpl}
        items={IMPORT_ENTITY_KEYS.map((k) => ({ label: `${IMPORT_ENTITIES[k].label} template (.csv)`, icon: <FileText />, onClick: () => { downloadTemplate(k); toast(`${IMPORT_ENTITIES[k].label} template downloaded`, { tone: "good", ms: 2000 }); } }))}
      />

      {!can.create && (
        <Banner tone="warn" title="You can view the import history only">You need the backup &amp; import create permission (bak:create) to import data. Ask your administrator.</Banner>
      )}

      <div className="wizard cp-wz">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={cn(i === step && !(finished && result) && "active", (i < step || (finished && !!result)) && "done")}
              onClick={() => { if (i < step && step < 4) { if (step === 3) setValError(null); setStep(i); } }}>
              <b>{i < step || (finished && result) ? <Check size={15} /> : i + 1}</b><span>{s}</span>
            </li>
          ))}
        </ol>

        <div className="cp-wz-pane cp-pane-in" key={step}>
          {step === 0 && (
            <ChoosePane value={ent} allowed={entities} onPick={(k) => { if (k !== ent) { setEnt(k); setCsv(null); setMap({}); } }} />
          )}
          {step === 1 && ent && <UploadPane entity={ent} csv={csv} onFile={(c) => { setCsv(c); setMap({}); }} onRemove={() => { setCsv(null); setMap({}); }} />}
          {step === 2 && ent && csv && <MapPane entity={ent} csv={csv} map={map} setMap={setMap} />}
          {step === 3 && ent && (
            <ValidatePane entity={ent} mapped={Object.keys(map)} rows={rows} job={job} checking={checking} error={valError} skip={skip} onSkip={setSkip}
              onEdit={editCell} canExport={can.export} onRetry={() => void validate(rows)} />
          )}
          {step === 4 && importing && ent && <ImportingPane entity={ent} total={rows.length} willSkip={skip ? bad : 0} seconds={seconds} />}
          {step === 4 && !importing && result && <ResultPane job={result} canExport={can.export} onAgain={reset} />}
          {step === 4 && !importing && !result && runError && (
            <Banner tone="danger" title={runError.code === "PERMISSION_DENIED" ? "Permission needed" : "The import did not run"}
              action={<button type="button" className="btn sm secondary" onClick={() => { setRunError(null); setStep(3); if (runError.code === "IMPORT_NOT_OPEN" || runError.code === "IMPORT_NOT_VALIDATED") void validate(rows); }}>Back to review</button>}>
              {runError.message}
            </Banner>
          )}
        </div>

        {!finished && !(step === 4 && runError) && (
          <div className="cp-wz-foot">
            <button type="button" className="btn secondary" style={{ visibility: step === 0 ? "hidden" : undefined }} onClick={back}><ArrowLeft />Back</button>
            <span className="cp-wz-meta">{meta}</span>
            <span className="spacer" />
            <button type="button" className="btn primary" disabled={!canNext()} onClick={next}>{nextLabel}{step === 3 ? <Upload /> : <ArrowRight />}</button>
          </div>
        )}
      </div>

      <HistoryDrawer open={histOpen} onClose={() => setHistOpen(false)} onOpenJob={(id) => void openJob(id)} />
    </>
  );
}

// ------------------------------------------------------------------ step 1: choose data
function ChoosePane({ value, allowed, onPick }: { value: ImportEntity | null; allowed: ImportEntity[]; onPick: (k: ImportEntity) => void }) {
  let i = 0;
  return (
    <>
      <div className="cp-pane-h"><h3>What would you like to import?</h3><p>Pick one data type. You can run the wizard again for the others.</p></div>
      <div className="cp-im-ents">
        {IMPORT_ENTITY_KEYS.map((k) => {
          const e = IMPORT_ENTITIES[k], ui = ENT_UI[k], ok = allowed.includes(k);
          return (
            <button key={k} type="button" className={cn("cp-im-ent", value === k && "on", !ok && "off")} style={{ ["--i" as string]: i++ }} disabled={!ok}
              title={ok ? undefined : `You need ${e.permission} to import ${e.label.toLowerCase()}`} onClick={() => onPick(k)}>
              <span className={`icon-tile ${ui.tile}`}>{ui.icon}</span>
              <b>{e.label}</b>
              <small>{ui.desc}</small>
              <span className="cp-im-ent-f">{e.fields.length} fields · {e.fields.filter((f) => f.required).length} required</span>
              {ok ? <span className="cp-im-tick"><Check /></span> : <span className="im-soon"><Badge tone="neutral">No access</Badge></span>}
            </button>
          );
        })}
        {COMING_LATER.map((c) => (
          <button key={c.key} type="button" className="cp-im-ent off" style={{ ["--i" as string]: i++ }} disabled title="Not available yet">
            <span className={`icon-tile ${c.tile}`}>{c.icon}</span>
            <b>{c.label}</b>
            <small>{c.desc}</small>
            <span className="cp-im-ent-f">Not available in this release</span>
            <span className="im-soon"><Badge tone="outline">Coming later</Badge></span>
          </button>
        ))}
      </div>
      <div className="banner info cp-mt">
        <Lightbulb />
        <div><b>Coming from Tally, QuickBooks or Peachtree?</b><p>Export to CSV first: save the master list from Excel as CSV. Accountex recognises common column names and maps them automatically.</p></div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ step 2: upload
function UploadPane({ entity, csv, onFile, onRemove }: { entity: ImportEntity; csv: Csv | null; onFile: (c: Csv) => void; onRemove: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const label = IMPORT_ENTITIES[entity].label.toLowerCase();

  const read = async (f: File) => {
    if (!/\.csv$/i.test(f.name)) { toast(/\.xlsx?$/i.test(f.name) ? "Excel files aren't read yet: in Excel use File › Save as › CSV, then upload the .csv" : "Upload a .csv file", { tone: "danger" }); return; }
    if (f.size > MAX_BYTES) { toast("The file is larger than 10 MB", { tone: "danger" }); return; }
    setReading(true);
    try {
      const { headers, rows } = parseCsvText(await f.text());
      if (!headers.some(Boolean)) { toast("The file is empty: the first row should hold column headings", { tone: "danger" }); return; }
      if (!rows.length) { toast("The file has headings but no data rows", { tone: "danger" }); return; }
      if (rows.length > MAX_ROWS) { toast(`At most ${fmtN(MAX_ROWS)} rows per import: split the file`, { tone: "danger" }); return; }
      onFile({ name: f.name, size: f.size, headers, rows });
      toast(`${f.name} read, ${fmtN(rows.length)} rows found`, { tone: "good", ms: 2400 });
    } catch { toast("Could not read the file", { tone: "danger" }); } finally { setReading(false); if (input.current) input.current.value = ""; }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !csv) void read(f); };
  const browse = () => { if (!csv && !reading) input.current?.click(); };

  return (
    <>
      <div className="cp-pane-h"><h3>Upload your {label} file</h3><p>CSV, up to 10 MB. The first row should hold column headings. Working in Excel? Use Save as › CSV.</p></div>
      <div className={cn("cp-drop", csv && "has done", over && "over")} tabIndex={0} role="button" aria-label="Upload a CSV file"
        onClick={browse} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !csv) { e.preventDefault(); browse(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!csv) setOver(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }} onDrop={onDrop}>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} />
        <div className="cp-drop-idle">
          <span className="cp-drop-ic">{reading ? <span className="cp-spin" style={{ width: 26, height: 26 }} /> : <CloudUpload />}</span>
          <b>{reading ? "Reading the file…" : "Drag & drop your file here"}</b>
          <small>or <u>browse your computer</u></small>
          <div className="row cp-center cp-mt8"><span className="pill"><FileText />.csv</span></div>
        </div>
        {csv && (
          <div className="cp-drop-file">
            <span className="icon-tile green"><FileSpreadsheet /></span>
            <div className="cp-fc-t">
              <b>{csv.name}</b>
              <small>{fileSize(csv.size)} · {fmtN(csv.rows.length)} rows · {csv.headers.length} columns detected</small>
              <div className="progress lime"><i style={{ width: "100%", transform: "none" }} /></div>
            </div>
            <span className="badge good"><Check />Ready</span>
            <button type="button" className="btn ghost sm icon" title="Remove" aria-label="Remove file" onClick={(e) => { e.stopPropagation(); onRemove(); }}><Trash2 /></button>
          </div>
        )}
      </div>
      <div className="row cp-center cp-mt">
        <span className="muted small">No file handy?</span>
        <button type="button" className="btn ghost sm" onClick={() => downloadTemplate(entity)}><Download />Download {label} template</button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ step 3: map columns
function MapPane({ entity, csv, map, setMap }: { entity: ImportEntity; csv: Csv; map: Record<string, string>; setMap: (m: Record<string, string>) => void }) {
  const toast = useToast();
  const fields = IMPORT_ENTITIES[entity].fields;
  const [picked, setPicked] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [snap, setSnap] = useState<{ fk: string; n: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const used = new Set(Object.values(map));
  const sample = (i: number) => csv.rows.find((r) => (r[i] ?? "").trim())?.[i]?.trim() || "(blank)";

  const assign = (fk: string, si: number) => {
    const h = csv.headers[si]!;
    const nextMap = Object.fromEntries(Object.entries(map).filter(([, v]) => v !== h));
    nextMap[fk] = h;
    setMap(nextMap);
    setSnap((s) => ({ fk, n: (s?.n ?? 0) + 1 }));
  };
  const runAuto = () => {
    const guess = autoMap(entity, csv.headers);
    const nextMap = { ...map };
    const taken = new Set(Object.values(nextMap));
    for (const [fk, h] of Object.entries(guess)) if (!nextMap[fk] && !taken.has(h)) { nextMap[fk] = h; taken.add(h); }
    const added = Object.keys(nextMap).length - Object.keys(map).length;
    if (!added) { toast("No more columns matched a field by name: drag them onto the fields by hand", { tone: "info" }); return; }
    setMap(nextMap);
    setAuto(true);
    const ignored = csv.headers.filter((h) => h && !taken.has(h));
    toast(`${Object.keys(nextMap).length} columns mapped${ignored.length ? `, "${ignored.slice(0, 4).join('", "')}"${ignored.length > 4 ? ` and ${ignored.length - 4} more` : ""} will be ignored` : ""}`, { tone: "good" });
  };

  return (
    <>
      <div className="cp-pane-h row">
        <div><h3>Map your columns to Accountex fields</h3><p>Drag a column from your file onto a field (or click a column, then a field), or let Accountex auto-map them by name.</p></div>
        <span className="spacer" />
        <button type="button" className="btn lime" onClick={runAuto}>{auto ? <Check /> : <WandSparkles />}{auto ? "Mapped" : "Auto-map"}</button>
      </div>
      <div className={cn("cp-map", dragging && "cp-dragging")}>
        <div className="cp-map-src">
          <h5><FileSpreadsheet />Your file <small>{csv.name}</small></h5>
          {csv.headers.map((h, i) => (
            <div key={i} className={cn("cp-chip-src", used.has(h) && "used", picked === i && "picked")} draggable role="button" tabIndex={0}
              onClick={() => setPicked(picked === i ? null : i)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setPicked(picked === i ? null : i))}
              onDragStart={(e) => { e.dataTransfer.setData("text/cp-si", String(i)); e.dataTransfer.effectAllowed = "move"; setDragging(true); }}
              onDragEnd={() => { setDragging(false); setOver(null); }}>
              <span className="cp-grip"><GripVertical /></span><b>{h || `Column ${i + 1}`}</b><small>{sample(i)}</small>
            </div>
          ))}
        </div>
        <div className="cp-map-mid"><ArrowRight /></div>
        <div className="cp-map-dst">
          <h5><Database />Accountex fields <small>{fields.filter((f) => f.required).length} required</small></h5>
          {fields.map((f) => {
            const m = map[f.key];
            return (
              <div key={f.key} className={cn("cp-slot", m && "filled", over === f.key && "over", snap?.fk === f.key && "cp-snap")} data-fk={f.key}
                onClick={() => { if (picked !== null) { assign(f.key, picked); setPicked(null); } }}
                onDragOver={(e) => { e.preventDefault(); setOver(f.key); }} onDragLeave={() => setOver((o) => (o === f.key ? null : o))}
                onDrop={(e) => { e.preventDefault(); setOver(null); setDragging(false); const si = e.dataTransfer.getData("text/cp-si"); if (si !== "") assign(f.key, Number(si)); }}>
                <span className="cp-slot-l"><b>{f.label}{f.required && <em>*</em>}</b><small>{f.required ? "Required" : "Optional"}</small></span>
                <span className="cp-slot-v" key={snap?.fk === f.key ? snap.n : 0}>
                  {m ? (
                    <span className="cp-mapped">
                      <b>{m}</b>
                      <button type="button" className="cp-unmap" title="Unmap" aria-label={`Unmap ${f.label}`} style={{ marginLeft: "auto" }}
                        onClick={(e) => { e.stopPropagation(); const n = { ...map }; delete n[f.key]; setMap(n); setAuto(false); }}><X /></button>
                    </span>
                  ) : <span className="cp-slot-ph">Drop a column here</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ import history drawer
function HistoryDrawer({ open, onClose, onOpenJob }: { open: boolean; onClose: () => void; onOpenJob: (id: string) => void }) {
  const [list, setList] = useState<DataImport[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Each opening (or Retry) shows the skeleton again and reloads; reset during render, fetch in the effect.
  const [seen, setSeen] = useState({ open, attempt });
  if (seen.open !== open || seen.attempt !== attempt) {
    setSeen({ open, attempt });
    if (open) { setList(null); setError(null); }
  }
  useEffect(() => {
    if (!open) return;
    let live = true;
    listImports()
      .then((l) => live && setList(l))
      .catch((e: unknown) => live && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the import history" }));
    return () => { live = false; };
  }, [open, attempt]);
  const load = () => setAttempt((a) => a + 1);

  return (
    <Drawer open={open} onClose={onClose} title="Import history" subtitle="Every import job, newest first · click one to see its result" className="im-hist">
      {error ? <ErrorState message={error.message} reference={error.reference} onRetry={load} />
        : !list ? <><Skeleton style={{ height: 54, marginBottom: 10 }} /><Skeleton style={{ height: 54, marginBottom: 10 }} /><Skeleton style={{ height: 54 }} /></>
          : !list.length ? <EmptyState icon={<History />} title="No imports yet" description="Imports you run appear here with their results." />
            : (
              <div className="timeline">
                {list.map((j) => {
                  const tone = STATUS_TONE[j.status] ?? "neutral";
                  const dot = j.status === "COMPLETED" ? (j.rowsSkipped ? "warn" : "good") : tone === "danger" ? "danger" : tone === "info" ? "info" : "";
                  return (
                    <div key={j.id} className="tl-item" role="button" tabIndex={0} onClick={() => onOpenJob(j.id)} onKeyDown={(e) => e.key === "Enter" && onOpenJob(j.id)}>
                      <span className={cn("tl-dot", dot)} />
                      <div>
                        <b>{entLabel(j.entity)} · {fmtN(j.totalRows)} rows</b>
                        <small>{dateLabel(j.finishedAt ?? j.createdAt)} · {j.jobNo} · {j.fileName}</small>
                        <small>{fmtN(j.rowsCreated)} created · {fmtN(j.rowsSkipped)} skipped{j.startedBy ? ` · by ${j.startedBy.name}` : ""}</small>
                        <Badge tone={tone}>{statusLabel(j.status)}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
    </Drawer>
  );
}
