"use client";

import { ArrowLeft, CheckCircle2, FileDown, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DATE_FORMATS, parseCsv, parseStatement, type BankingOptions, type ImportResult, type StatementLayout } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { bankingOptions, importStatement } from "../api";
import { amt, errMsg } from "./bank-ui";

type Cols = StatementLayout["columns"];
type Mode = "amount" | "split";
const DELIMS: { v: StatementLayout["delimiter"]; l: string }[] = [{ v: ",", l: "Comma ," }, { v: ";", l: "Semicolon ;" }, { v: "\t", l: "Tab" }, { v: "|", l: "Pipe |" }];

/** Guesses the delimiter and the columns from the header row (date, narration, reference, debit / credit or amount, balance). */
function guess(text: string): StatementLayout & { recognised: boolean } {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const delimiter = ([",", ";", "\t", "|"] as const).map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const head = parseCsv(first, delimiter)[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const find = (re: RegExp) => { const i = head.findIndex((h) => re.test(h)); return i < 0 ? null : i; };
  const date = find(/^(txn |transaction |posting |book )?date$|^date/);
  const valueDate = find(/value/);
  const debit = find(/debit|withdraw|dr\b|paid out/);
  const credit = find(/credit|deposit|cr\b|paid in/);
  const amount = debit !== null && credit !== null ? null : find(/amount/);
  const isHeader = date !== null || find(/desc|narr|particular|detail/) !== null;
  return {
    recognised: date !== null && (amount !== null || (debit !== null && credit !== null)),
    delimiter, headerRows: isHeader ? 1 : 0, dateFormat: "DD/MM/YYYY",
    columns: {
      date: date ?? 0, valueDate: valueDate !== date ? valueDate : null, description: find(/desc|narr|particular|detail|remark/) ?? 1,
      reference: find(/ref|cheque|chq|instrument/), amount: amount ?? (debit === null ? 2 : null), debit: amount === null ? debit : null,
      credit: amount === null ? credit : null, balance: find(/balance/),
    },
  };
}

/** Template acc-import-statement: bank account, format, statement file; then the CSV column mapping, a preview and the import. */
export function StatementImportModal({ open, onClose, onImported, bankAccountId, options: given }: {
  open: boolean; onClose: () => void; onImported: (r: ImportResult) => void; bankAccountId?: string | null; options?: BankingOptions | null;
}) {
  const [loaded, setLoaded] = useState<BankingOptions | null>(null);
  const options = given ?? loaded;
  const [bank, setBank] = useState("");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [layout, setLayout] = useState<StatementLayout | null>(null);
  const [mode, setMode] = useState<Mode>("amount");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [wasOpen, setWasOpen] = useState(false);

  useEffect(() => {
    if (open && !given && !loaded) bankingOptions().then(setLoaded).catch(() => undefined);
  }, [open, given, loaded]);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFile(null); setLayout(null); setResult(null); setError(null); setBusy(false);
      setBank(bankAccountId ?? "");
    }
  }
  const accounts = useMemo(() => options?.bankAccounts.filter((b) => b.status === "ACTIVE") ?? [], [options]);
  const bankId = bank || accounts[0]?.id || "";
  const account = accounts.find((b) => b.id === bankId) ?? null;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) return setError("Only CSV statements can be imported for now; Excel and MT940 come later.");
    if (f.size > 4_000_000) return setError("The file is larger than 4 MB.");
    const text = await f.text();
    // a file whose header names its columns is mapped from that header (keeping the account's date format);
    // otherwise the mapping saved for the account is used
    const saved = account?.statementLayout ?? null;
    const { recognised, ...guessed } = guess(text);
    const l: StatementLayout = recognised || !saved ? { ...guessed, dateFormat: saved?.dateFormat ?? guessed.dateFormat } : saved;
    setError(null);
    setFile({ name: f.name, text });
    setLayout(l);
    setMode(l.columns.amount !== null ? "amount" : "split");
  };

  const rows = useMemo(() => (file && layout ? parseCsv(file.text, layout.delimiter) : []), [file, layout]);
  const width = Math.max(0, ...rows.slice(0, 20).map((r) => r.length));
  const header = layout && layout.headerRows > 0 ? rows[layout.headerRows - 1] ?? [] : [];
  const colName = (i: number) => (header[i]?.trim() ? `${i + 1} · ${header[i]!.trim()}` : `Column ${i + 1}`);
  const parsed = useMemo(() => (layout ? parseStatement(rows, layout) : { lines: [], errors: [] }), [rows, layout]);
  const setCols = (c: Partial<Cols>) => setLayout((l) => (l ? { ...l, columns: { ...l.columns, ...c } } : l));
  const switchMode = (m: Mode) => {
    setMode(m);
    if (!layout) return;
    const c = layout.columns;
    setCols(m === "amount" ? { amount: c.amount ?? c.debit ?? 2, debit: null, credit: null } : { amount: null, debit: c.debit ?? c.amount ?? 2, credit: c.credit ?? Math.min((c.amount ?? 2) + 1, Math.max(width - 1, 0)) });
  };
  const totals = parsed.lines.reduce((s, l) => ({ in: s.in + Math.max(Number(l.amount), 0), out: s.out + Math.max(-Number(l.amount), 0) }), { in: 0, out: 0 });

  const doImport = async () => {
    if (!layout || !file || !account) return;
    setBusy(true);
    setError(null);
    try {
      const r = await importStatement({ bankAccountId: account.id, fileName: file.name, layout, lines: parsed.lines });
      setResult(r);
      onImported(r);
    } catch (e) {
      setError(errMsg(e, "Could not import the statement"));
    } finally {
      setBusy(false);
    }
  };

  const colSelect = (label: string, value: number | null, onChange: (v: number | null) => void, optional?: boolean) => (
    <Field label={label} required={!optional}>
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
        {optional && <option value="">(none)</option>}
        {Array.from({ length: Math.max(width, 1) }, (_, i) => <option key={i} value={i}>{colName(i)}</option>)}
      </Select>
    </Field>
  );

  const step = result ? "done" : layout ? "map" : "pick";
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide={step === "map"}
      title="Import bank statement"
      subtitle={step === "map" ? `${file?.name} · map the columns once; they are remembered for this account` : "CSV from your bank portal · Excel and MT940 come later"}
      foot={
        step === "done" ? <Button variant="primary" onClick={onClose}>Done</Button>
          : step === "map" ? (
            <>
              <Button icon={<ArrowLeft />} onClick={() => { setLayout(null); setFile(null); }} disabled={busy}>Back</Button>
              <span className="spacer" />
              <Button onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant="primary" icon={<UploadCloud />} onClick={doImport} disabled={busy || !parsed.lines.length}>{busy ? "Importing…" : `Import & match ${parsed.lines.length} line${parsed.lines.length === 1 ? "" : "s"}`}</Button>
            </>
          ) : <Button onClick={onClose}>Cancel</Button>
      }
    >
      {step === "pick" && (
        <>
          <FormGrid>
            <Field label="Bank account" required full>
              <Select value={bankId} onChange={(e) => setBank(e.target.value)}>
                {!accounts.length && <option value="">No active bank accounts</option>}
                {accounts.map((b) => <option key={b.id} value={b.id}>{b.bankName ? `${b.bankName} — ` : ""}{b.title}{b.last4 ? ` · ${b.last4}` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Format">
              <Select defaultValue="CSV">
                <option value="CSV">{account?.statementLayout ? "CSV · saved mapping" : "CSV · custom mapping"}</option>
                <option disabled>Excel (.xlsx) · coming later</option>
                <option disabled>MT940 · coming later</option>
              </Select>
            </Field>
            <Field label="Statement period"><Select disabled><option>Taken from the file</option></Select></Field>
          </FormGrid>
          <div
            className={cn("dropzone mt", over && "over")}
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void pick(e.dataTransfer.files[0]); }}
          >
            <UploadCloud />
            <b>Drop statement file here</b>
            <small>or click to browse · .csv · We&apos;ll auto-match against posted vouchers</small>
            <input ref={input} type="file" accept=".csv,.txt,text/csv" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          {error && <p className="text-danger small mt" role="alert">{error}</p>}
        </>
      )}

      {step === "map" && layout && (
        <>
          <FormGrid cols={3}>
            <Field label="Delimiter"><Select value={layout.delimiter} onChange={(e) => setLayout({ ...layout, delimiter: e.target.value as StatementLayout["delimiter"] })}>{DELIMS.map((d) => <option key={d.l} value={d.v}>{d.l}</option>)}</Select></Field>
            <Field label="Header rows"><Select value={layout.headerRows} onChange={(e) => setLayout({ ...layout, headerRows: Number(e.target.value) })}>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
            <Field label="Date format"><Select value={layout.dateFormat} onChange={(e) => setLayout({ ...layout, dateFormat: e.target.value as StatementLayout["dateFormat"] })}>{DATE_FORMATS.map((f) => <option key={f}>{f}</option>)}</Select></Field>
            {colSelect("Date", layout.columns.date, (v) => setCols({ date: v ?? 0 }))}
            {colSelect("Description", layout.columns.description, (v) => setCols({ description: v ?? 0 }))}
            {colSelect("Reference", layout.columns.reference, (v) => setCols({ reference: v }), true)}
            <Field label="Amounts">
              <div className="seg" style={{ display: "flex", flexDirection: "row", width: "100%" }}>
                <button type="button" style={{ flex: 1 }} className={cn(mode === "amount" && "active")} onClick={() => switchMode("amount")}>Signed amount</button>
                <button type="button" style={{ flex: 1 }} className={cn(mode === "split" && "active")} onClick={() => switchMode("split")}>Debit / credit</button>
              </div>
            </Field>
            {mode === "amount"
              ? colSelect("Amount (− = money out)", layout.columns.amount, (v) => setCols({ amount: v ?? 0 }))
              : <>{colSelect("Debit (money out)", layout.columns.debit, (v) => setCols({ debit: v ?? 0 }))}{colSelect("Credit (money in)", layout.columns.credit, (v) => setCols({ credit: v ?? 0 }))}</>}
            {colSelect("Balance", layout.columns.balance, (v) => setCols({ balance: v }), true)}
            {colSelect("Value date", layout.columns.valueDate, (v) => setCols({ valueDate: v }), true)}
          </FormGrid>
          <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="badge good">{parsed.lines.length} line{parsed.lines.length === 1 ? "" : "s"} ready</span>
            {parsed.errors.length > 0 && <span className="badge warn">{parsed.errors.length} row{parsed.errors.length === 1 ? "" : "s"} skipped</span>}
            <span className="muted small">In Rs {amt(totals.in)} · Out Rs {amt(totals.out)}</span>
          </div>
          {parsed.errors.length > 0 && (
            <ul className="muted small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {parsed.errors.slice(0, 5).map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}
              {parsed.errors.length > 5 && <li>… and {parsed.errors.length - 5} more</li>}
            </ul>
          )}
          <div className="table-wrap mt" style={{ maxHeight: 240, overflow: "auto", border: "1px solid var(--line)", borderRadius: 12 }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="num">Amount (Rs)</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {parsed.lines.slice(0, 50).map((l, i) => {
                  const a = Number(l.amount);
                  return (
                    <tr key={i}>
                      <td>{dateLabel(l.txnDate)}</td>
                      <td><b className="cp-desc">{l.description}</b></td>
                      <td className="muted">{l.reference ?? "—"}</td>
                      <td className={cn("num", a < 0 ? "cr" : "dr")}>{a < 0 ? `(${amt(-a)})` : amt(a)}</td>
                      <td className="num muted">{l.runningBalance === null || l.runningBalance === undefined ? "—" : amt(Number(l.runningBalance))}</td>
                    </tr>
                  );
                })}
                {!parsed.lines.length && <tr><td colSpan={5} className="muted">No lines read with this mapping yet — check the delimiter, header rows and date format.</td></tr>}
              </tbody>
            </table>
          </div>
          {error && <p className="text-danger small mt" role="alert">{error}</p>}
        </>
      )}

      {step === "done" && result && (
        <div className="empty-state" style={{ padding: "18px 8px" }}>
          <span className="icon-well lg"><CheckCircle2 /></span>
          <h4>{result.imported} line{result.imported === 1 ? "" : "s"} imported · {result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"} · {result.import.matchedCount} matched to vouchers</h4>
          <p>
            <FileDown style={{ width: 14, height: 14, verticalAlign: "-2px" }} /> {result.import.fileName} · {result.import.bankAccount.title} · {dateLabel(result.import.periodFrom)} → {dateLabel(result.import.periodTo)}.
            {" "}Lines not in the books yet are listed as uncategorised; run your bank rules or categorise them.
          </p>
        </div>
      )}
    </Modal>
  );
}
