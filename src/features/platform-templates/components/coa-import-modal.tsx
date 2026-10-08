"use client";

import { CircleCheck, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { COA_CSV_COLUMNS, type CoaImportReport, type CoaTemplate } from "@/shared";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { importCoaCsv } from "../api";

/**
 * Template "Import from Excel": a CSV saved from Excel (`code, name, parentCode, level, class, nature, postable,
 * defaultRole`). The file is validated first (validation report by line); importing replaces the template's tree.
 */
export function CoaImportModal({ templates, initialId, onClose, onImported }: {
  templates: CoaTemplate[];
  initialId: string | null;
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const toast = useToast();
  const editable = templates.filter((t) => t.status !== "RETIRED");
  const [id, setId] = useState(initialId && editable.some((t) => t.id === initialId) ? initialId : editable[0]?.id ?? "");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [report, setReport] = useState<CoaImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const target = templates.find((t) => t.id === id);

  const check = async (text: string, dryRun: boolean) => {
    if (!target) return;
    setBusy(true);
    try {
      const r = await importCoaCsv(target.id, target.rowVersion, text, dryRun);
      setReport(r);
      if (r.saved) {
        toast(`${r.accounts} accounts imported into ${target.name}`, { tone: "good" });
        onImported(target.id);
      } else if (!r.valid) toast(`${r.issues.length} problem${r.issues.length === 1 ? "" : "s"} found · nothing imported`, { tone: "warn" });
    } catch (e) {
      toast(adminErrorMessage(e, "Could not read the file"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    setFile({ name: f.name, text });
    setReport(null);
    await check(text, true);
  };

  return (
    <Modal open wide onClose={onClose} title="Import from Excel" subtitle="Replace a template's account tree from a CSV file"
      foot={(
        <>
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose}>{report?.saved ? "Close" : "Cancel"}</button>
          {!report?.saved && <button type="button" className="btn primary" disabled={busy || !file || !report?.valid} onClick={() => file && check(file.text, false)}><Upload />{busy ? "Working…" : `Import ${report?.valid ? report.accounts : ""} accounts`}</button>}
        </>
      )}>
      <div className="form-grid c1">
        <label><span>Template</span>
          <select value={id} onChange={(e) => { setId(e.target.value); setReport(null); setFile(null); }}>
            {editable.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.version} ({t.accountCount} accounts)</option>)}
          </select>
        </label>
        <div className="field">
          <span>CSV file</span>
          <div className="row">
            <button type="button" className="btn secondary" disabled={!target} onClick={() => input.current?.click()}><FileSpreadsheet />{file ? "Choose another file" : "Choose file"}</button>
            <span className="small muted">{file?.name ?? `Columns: ${COA_CSV_COLUMNS.join(", ")}`}</span>
          </div>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {report && (
        <div className="mt">
          {report.valid ? (
            <div className="banner good"><CircleCheck /><div><b>{report.saved ? "Imported" : "File is valid"}</b><p>{report.accounts} accounts ({report.postable} postable). {report.saved ? "The tree was replaced." : `Importing replaces the ${target?.accountCount ?? 0} accounts of ${target?.name ?? "the template"}.`}</p></div></div>
          ) : (
            <>
              <div className="banner danger"><TriangleAlert /><div><b>Validation report: {report.issues.length} problem{report.issues.length === 1 ? "" : "s"}</b><p>Fix the file and choose it again. Nothing was imported.</p></div></div>
              <div className="table-wrap mt" style={{ maxHeight: 280, overflow: "auto" }}>
                <table className="tbl" data-plain><thead><tr><th style={{ width: 80 }}>Line</th><th>Problem</th></tr></thead>
                  <tbody>{report.issues.map((x, i) => <tr key={i}><td className="tnum">{x.line}</td><td>{x.message}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
