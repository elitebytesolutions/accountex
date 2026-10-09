"use client";

import {
  Calendar, ChevronRight, CircleCheck, Copy, Download, Eye, FileSpreadsheet, FileText, History, Info, Landmark, OctagonAlert, Plus, Search, Send, Settings2, Sheet, Table2,
  Trash2, TriangleAlert, Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  batchRowErrors, CHEQUE_POSTING_MODES, OLD_NO_RULES, parseCsv, parseStatementDate, type BankingOptions, type BatchLineInput, type ChequeBatch,
} from "@/shared";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { cancelChequeBatch, createChequeBatch, generateChequeBatch, getChequeBatch, listChequeBatches, updateChequeBatch, validateChequeBatch } from "../api";
import { num, Rs, rsText, todayIso } from "./cheque-voucher-ui";

type Can = { create: boolean; edit: boolean; post: boolean };
type Dir = "R" | "I";
type Cell = "partyCode" | "partyName" | "chequeNo" | "chequeDate" | "dueDate" | "amount" | "remarks" | "legacyNo";
type Row = Record<Cell, string> & { key: string; lineId: string | null; sel: boolean; cheque: { id: string; docNo: string } | null; serverErr: Record<string, string> | null };
type Setup = { t: Dir; date: string; bankId: string; mode: (typeof CHEQUE_POSTING_MODES)[number]; oldRule: (typeof OLD_NO_RULES)[number]; prefix: string };
type Summary = { tone: "good" | "danger" | "warn"; title: string; text: string; issues: string[] };

const MODE_LABEL: Record<string, string> = { DEPOSIT: "Deposit in Bank", HOLD_PDC: "Hold as PDC", CLEAR_ON_DEPOSIT: "Clear on deposit" };
const OLD_LABEL: Record<string, string> = { AUTO_IF_NEW: "Auto if new", KEEP_FROM_SHEET: "Keep from sheet", BLANK: "Blank" };
const STATUS_TONE: Record<string, string> = { DRAFT: "neutral", VALIDATED: "info", GENERATED: "good", PARTIAL: "warn", CANCELLED: "danger" };
const CELL_LABEL: Record<string, string> = { partyCode: "party code", partyName: "party name", chequeNo: "cheque no", chequeDate: "cheque date", dueDate: "due date", amount: "amount" };
const CSV_HEAD = ["PartyCode", "PartyName", "ChequeNo", "ChequeDate", "DueDate", "Amount", "Remarks", "OldNo"];
let seq = 0;
const blankRow = (x: Partial<Row> = {}): Row => ({
  lineId: null, sel: false, cheque: null, serverErr: null,
  partyCode: "", partyName: "", chequeNo: "", chequeDate: "", dueDate: "", amount: "", remarks: "", legacyNo: "", ...x,
  key: x.key ?? `r${++seq}`,
});
const isBlank = (r: Row) => !r.partyCode && !r.partyName && !r.chequeNo && !r.amount;
const toLine = (r: Row): BatchLineInput => ({
  partyCode: r.partyCode.trim().toUpperCase(), partyName: r.partyName.trim(), chequeNo: r.chequeNo.trim(), chequeDate: r.chequeDate, dueDate: r.dueDate || null,
  amount: num(r.amount), remarks: r.remarks.trim() || null, legacyNo: r.legacyNo.trim() || null,
});
/** A sheet date (YYYY-MM-DD or DD/MM/YYYY) → YYYY-MM-DD; anything else stays as typed so validation flags it. */
const sheetDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : (parseStatementDate(v, "DD/MM/YYYY") ?? v.trim()));

/** Bulk Sheet Entry of the Cheque Voucher (template cqMount / cqBValidate / cqGenerate): one cheque per row. */
export function BulkSheet({ opts, can }: { opts: BankingOptions; can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const banks = opts.bankAccounts.filter((b) => b.status === "ACTIVE");
  const [s, setS] = useState<Setup>({ t: "R", date: todayIso(), bankId: banks[0]?.id ?? "", mode: "DEPOSIT", oldRule: "AUTO_IF_NEW", prefix: "R-Chq # -" });
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow(), blankRow()]);
  const [batch, setBatch] = useState<ChequeBatch | null>(null);
  const [dirty, setDirty] = useState(true);
  const [showErr, setShowErr] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<"" | "validate" | "generate" | "cancel">("");
  const [progress, setProgress] = useState<{ pct: number; title: string; n: string } | null>(null);
  const [sheetStep, setSheetStep] = useState(false);
  const [imported, setImported] = useState<{ name: string; rows: Row[] } | null>(null);
  const [preview, setPreview] = useState(false);
  const [recent, setRecent] = useState<Omit<ChequeBatch, "lines">[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const R = s.t === "R";
  const parties = useMemo(() => new Map((R ? opts.customers : opts.vendors).map((p) => [p.code.toUpperCase(), { id: p.id, name: p.name }])), [R, opts]);
  const locked = !!batch && !["DRAFT", "VALIDATED"].includes(batch.status);
  const pending = rows.filter((r) => !r.cheque);
  const clientErr = useMemo(() => batchRowErrors(rows.map(toLine), parties), [rows, parties]);
  const total = rows.reduce((a, r) => a + num(r.amount), 0);
  const selected = rows.filter((r) => r.sel).length;

  useEffect(() => {
    listChequeBatches().then(setRecent, () => {});
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const edit = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, serverErr: null } : r)));
    setDirty(true);
  };
  const setCode = (key: string, raw: string) => {
    const code = raw.trim().toUpperCase();
    const p = parties.get(code);
    edit(key, { partyCode: code, ...(p && { partyName: p.name }) });
  };
  const cellBad = (i: number, k: Cell) => {
    const r = rows[i]!;
    if (r.cheque) return false;
    return !!(r.serverErr?.[k] ?? (showErr ? clientErr[i]?.[k] : undefined));
  };

  /** Client rules first (template cqBValidate); fills the banner. */
  const checkClient = () => {
    const issues: string[] = [];
    const badRows = new Set<number>();
    rows.forEach((r, i) => {
      if (r.cheque) return;
      for (const k of Object.keys(clientErr[i] ?? {})) {
        issues.push(`Row ${i + 1}: ${CELL_LABEL[k] ?? k}`);
        badRows.add(i);
      }
    });
    setShowErr(true);
    const pend = rows.filter((r) => !r.cheque);
    const tot = pend.reduce((a, r) => a + num(r.amount), 0);
    setSummary(issues.length
      ? { tone: "danger", title: `${issues.length} issue${issues.length > 1 ? "s" : ""} in ${badRows.size} row${badRows.size > 1 ? "s" : ""} — fix the highlighted cells`, text: "", issues }
      : { tone: "good", title: `All ${pend.length} rows are valid`, text: `Total ${rsText(tot)} · ready to generate ${pend.length} voucher${pend.length === 1 ? "" : "s"}.`, issues: [] });
    return !issues.length;
  };

  const body = () => {
    const bank = banks.find((b) => b.id === s.bankId);
    return {
      direction: R ? "RECEIVED" : "ISSUED", docDate: s.date, branchId: bank?.branchId ?? opts.branches[0]?.id, bankAccountId: s.bankId, postingMode: s.mode,
      oldNoRule: s.oldRule, remarksPrefix: s.prefix.trim() || null, source: imported ? "SHEET" : "SCREEN",
      lines: rows.filter((r) => !r.cheque).map((r) => ({ ...(r.lineId && { id: r.lineId }), ...toLine(r) })),
    };
  };

  /** Rows ↔ server lines by position (generated rows stay as they are). */
  const absorb = (b: ChequeBatch) => {
    setBatch(b);
    setRows((rs) => {
      const lines = [...b.lines];
      return rs.map((r) => {
        const l = lines.find((x) => x.chequeNo === r.chequeNo && x.partyCode === r.partyCode.toUpperCase()) ?? null;
        if (!l) return r;
        lines.splice(lines.indexOf(l), 1);
        return { ...r, lineId: l.id, cheque: l.cheque, serverErr: l.validationStatus === "INVALID" ? (l.validationErrors ?? { chequeNo: "Invalid" }) : null };
      });
    });
  };

  /** Saves the sheet as a draft batch (create / update) and runs the server checks. */
  const validate = async (): Promise<ChequeBatch | null> => {
    if (!s.bankId) { toast("Choose the bank account", { tone: "danger" }); return null; }
    if (!pending.length) { toast(rows.length ? "All rows have already been generated" : "Add at least one row first", { tone: "info" }); return null; }
    if (!checkClient()) { toast("Fix the highlighted cells first", { tone: "danger" }); return null; }
    setBusy("validate");
    try {
      let b = batch;
      if (!b || dirty) b = b ? await updateChequeBatch(b.id, { ...body(), rowVersion: b.rowVersion }) : await createChequeBatch(body());
      const res = await validateChequeBatch(b.id, b.rowVersion);
      absorb(res.batch);
      setDirty(false);
      const issues = res.batch.lines.filter((l) => l.validationStatus === "INVALID").flatMap((l) => Object.entries(l.validationErrors ?? {}).map(([k, m]) => `Row ${l.lineNo}: ${CELL_LABEL[k] ?? k} — ${m}`));
      setSummary(res.invalid
        ? { tone: "danger", title: `${res.invalid} row${res.invalid > 1 ? "s" : ""} failed the checks · ${res.valid} valid`, text: `${res.batch.docNo} saved. Fix the rows below, or generate the valid ones and redo the rest in a new batch.`, issues }
        : { tone: "good", title: `All ${res.valid} rows are valid`, text: `${res.batch.docNo} saved · total ${rsText(res.batch.totalAmount)} · ready to generate.`, issues: [] });
      listChequeBatches().then(setRecent, () => {});
      return res.batch;
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        // lines.N.field from the save
        setRows((rs) => {
          const out = rs.map((r) => ({ ...r }));
          const live = out.filter((r) => !r.cheque);
          for (const [k, v] of Object.entries(e.details!)) {
            const m = k.match(/^lines\.(\d+)\.(\w+)$/);
            if (m && live[Number(m[1])]) live[Number(m[1])]!.serverErr = { ...(live[Number(m[1])]!.serverErr ?? {}), [m[2]!]: v[0]! };
          }
          return out;
        });
      }
      toast(e instanceof ApiError ? e.message : "Could not validate the sheet", { tone: "danger" });
      return null;
    } finally {
      setBusy("");
    }
  };

  const generate = async () => {
    let b = batch;
    if (!b || dirty || b.status === "DRAFT") b = await validate();
    if (!b) return;
    if (!b.lines.some((l) => l.validationStatus === "VALID")) { toast("No valid rows to generate", { tone: "danger" }); return; }
    const n = b.lines.filter((l) => l.validationStatus === "VALID").length;
    setBusy("generate");
    setProgress({ pct: 4, title: "Generating vouchers…", n: `0 / ${n}` });
    timer.current = setInterval(() => setProgress((p) => (p && p.pct < 90 ? { ...p, pct: p.pct + (90 - p.pct) * 0.12 } : p)), 220);
    try {
      const res = await generateChequeBatch(b.id, b.rowVersion);
      absorb(res.batch);
      const nos = res.batch.lines.filter((l) => l.cheque).map((l) => l.cheque!.docNo);
      setProgress({ pct: 100, title: `Done — ${res.generated} voucher${res.generated === 1 ? "" : "s"} created`, n: `${res.generated} / ${n}` });
      setSheetStep(true);
      setSummary(res.batch.status === "PARTIAL"
        ? { tone: "warn", title: `${res.generated} generated · ${res.batch.lines.filter((l) => !l.cheque).length} not generated`, text: `${res.batch.docNo} is closed as partial. The rows still highlighted were not created — put them in a new batch once fixed.`, issues: [] }
        : { tone: "good", title: `${res.generated} cheque vouchers generated`, text: `${res.batch.docNo} · ${nos[0] ?? ""}${nos.length > 1 ? ` → ${nos[nos.length - 1]}` : ""}`, issues: [] });
      toast(`${res.generated} cheque vouchers generated${nos.length ? ` · ${nos[0]}${nos.length > 1 ? ` → ${nos[nos.length - 1]}` : ""}` : ""}`, {
        tone: res.failed ? "warn" : "good", action: { label: "Cheque register", onClick: () => router.push("/bank/cheque-register") },
      });
      listChequeBatches().then(setRecent, () => {});
      setTimeout(() => setProgress(null), 1600);
    } catch (e) {
      setProgress(null);
      toast(e instanceof ApiError ? e.message : "Could not generate the vouchers", { tone: "danger" });
    } finally {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setBusy("");
    }
  };

  const reset = () => {
    setRows([blankRow(), blankRow(), blankRow()]);
    setBatch(null); setDirty(true); setShowErr(false); setSummary(null); setImported(null); setSheetStep(false);
  };
  const cancel = async () => {
    if (batch && ["DRAFT", "VALIDATED"].includes(batch.status) && !batch.lines.some((l) => l.cheque)) {
      setBusy("cancel");
      try {
        const b = await cancelChequeBatch(batch.id, batch.rowVersion, "Cancelled from the bulk sheet");
        toast(`${b.docNo} cancelled`, { tone: "info" });
        listChequeBatches().then(setRecent, () => {});
      } catch (e) {
        toast(e instanceof ApiError ? e.message : "Could not cancel the batch", { tone: "danger" });
        setBusy("");
        return;
      }
      setBusy("");
    } else toast("Bulk sheet reset");
    reset();
  };

  const open = async (id: string) => {
    try {
      const b = await getChequeBatch(id);
      setS({ t: b.direction === "ISSUED" ? "I" : "R", date: b.docDate, bankId: b.bankAccount.id, mode: b.postingMode as Setup["mode"], oldRule: b.oldNoRule as Setup["oldRule"], prefix: b.remarksPrefix ?? "" });
      setRows(b.lines.map((l) => blankRow({
        lineId: l.id, cheque: l.cheque, partyCode: l.partyCode, partyName: l.partyName, chequeNo: l.chequeNo, chequeDate: l.chequeDate, dueDate: l.dueDate ?? "",
        amount: String(l.amount), remarks: l.remarks ?? "", legacyNo: l.legacyNo ?? "", serverErr: l.validationStatus === "INVALID" ? l.validationErrors : null,
      })));
      setBatch(b); setDirty(false); setShowErr(true); setImported(null);
      setSummary({ tone: b.status === "PARTIAL" ? "warn" : b.status === "CANCELLED" ? "danger" : "good", title: `${b.docNo} · ${b.status.toLowerCase()}`, text: `${b.rowCount} rows · total ${rsText(b.totalAmount)}`, issues: [] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not open the batch", { tone: "danger" });
    }
  };

  const downloadTemplate = () => {
    const sample = [...(R ? opts.customers : opts.vendors)].slice(0, 2);
    const lines = [CSV_HEAD.join(","), ...sample.map((p, i) => [p.code, `"${p.name.replace(/"/g, '""')}"`, String(458921 + i * 401), s.date, "", String(100000 + i * 50000), "Against invoice", ""].join(","))];
    const blob = new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cheque-voucher-template.csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setSheetStep(true);
    toast("Template downloaded · cheque-voucher-template.csv", { tone: "good" });
  };

  const upload = async (file: File) => {
    if (!/\.csv$/i.test(file.name)) { toast("Excel (.xlsx / .xls) upload comes later — save the sheet as CSV and upload that", { tone: "warn" }); return; }
    const data = parseCsv(await file.text());
    if (!data.length) { toast("The file is empty", { tone: "danger" }); return; }
    const head = data[0]!.map((h) => h.replace(/^﻿/, "").replace(/[^a-z]/gi, "").toLowerCase());
    const hasHead = head.some((h) => h.includes("party") || h.includes("cheque"));
    const at = (name: string, fallback: number) => (hasHead ? head.indexOf(name.toLowerCase()) : fallback);
    const ix = Object.fromEntries(CSV_HEAD.map((h, i) => [h, at(h, i)]));
    const sheetRows = (hasHead ? data.slice(1) : data).slice(0, 1000);
    if ((hasHead ? data.length - 1 : data.length) > 1000) toast("Only the first 1,000 rows were read", { tone: "warn" });
    const cell = (r: string[], h: string) => (ix[h]! >= 0 ? (r[ix[h]!] ?? "").trim() : "");
    const add = sheetRows.map((r) => {
      const code = cell(r, "PartyCode").toUpperCase();
      return blankRow({
        partyCode: code, partyName: cell(r, "PartyName") || parties.get(code)?.name || "", chequeNo: cell(r, "ChequeNo"), chequeDate: sheetDate(cell(r, "ChequeDate")),
        dueDate: cell(r, "DueDate") ? sheetDate(cell(r, "DueDate")) : "", amount: cell(r, "Amount").replace(/,/g, ""), remarks: cell(r, "Remarks"), legacyNo: cell(r, "OldNo"),
      });
    });
    setRows((rs) => [...rs.filter((r) => !isBlank(r) || r.cheque), ...add]);
    setImported({ name: file.name, rows: add });
    setDirty(true); setSheetStep(true); setShowErr(true);
    toast(`${add.length} rows imported from ${file.name}`, { tone: "good" });
  };

  const addRow = () => { setRows((rs) => [...rs, blankRow({ chequeDate: s.date })]); setDirty(true); };
  const dupRow = (r: Row) => {
    setRows((rs) => {
      const at = rs.indexOf(r);
      const c = blankRow({ ...r, key: undefined, lineId: null, cheque: null, sel: false, serverErr: null, chequeNo: r.chequeNo ? String(Number(r.chequeNo) + 1) : "" });
      return [...rs.slice(0, at + 1), c, ...rs.slice(at + 1)];
    });
    setDirty(true);
  };
  const dupSelected = () => {
    const sel = rows.filter((r) => r.sel);
    if (!sel.length) { toast("Select rows to duplicate", { tone: "info" }); return; }
    setRows((rs) => [...rs.map((r) => ({ ...r, sel: false })), ...sel.map((r) => blankRow({ ...r, key: undefined, lineId: null, cheque: null, sel: false, serverErr: null, chequeNo: r.chequeNo ? String(Number(r.chequeNo) + 100) : "" }))]);
    setDirty(true);
    toast(`${sel.length} row${sel.length > 1 ? "s" : ""} duplicated`, { tone: "good" });
  };
  const delRows = (keys: string[]) => {
    const prev = rows;
    setRows((rs) => rs.filter((r) => !keys.includes(r.key) || !!r.cheque));
    setDirty(true);
    toast(`${keys.length} row${keys.length > 1 ? "s" : ""} deleted`, { action: { label: "Undo", onClick: () => setRows(prev) } });
  };

  const typeCard = (t: Dir, title: string, sub: string) => (
    <button type="button" className={cn(s.t === t && "on")} disabled={locked || !!batch} onClick={() => {
      if (t === s.t) return;
      setS((x) => ({ ...x, t, prefix: `${t}-Chq # -` }));
      setDirty(true);
    }}>
      <i className="pd-radio" /><span><b>{title}</b><small>{sub}</small></span>
    </button>
  );

  return (
    <>
      <div className="pd-bstrip">
        <div className={cn("pd-bstep on", (batch || sheetStep) && "done")}><b>1</b><span><strong>Voucher Fields</strong><small>Set common fields for all vouchers</small></span></div>
        <i className="pd-bstrip-ar"><ChevronRight /></i>
        <div className={cn("pd-bstep", sheetStep && "on")}><b>2</b><span><strong>Sheet Population <em>(optional)</em></strong><small>Use a sheet to populate rows</small></span></div>
        <div className="banner good pd-bstrip-info"><Info /><div><p>Enter rows below or populate them from the CSV template — each row creates one cheque voucher.</p></div></div>
      </div>

      <div className="panel pd-card">
        <div className="pd-sec-h nob"><span className="icon-tile"><Settings2 /></span><span className="pd-sec-t"><b>Bulk Voucher Setup</b><small>Applied to every row unless overridden in the row itself.</small></span></div>
        <div className="pd-bsetup">
          <div className="pd-f"><span>Voucher Type <em>*</em></span>
            <div className="pd-minicards">
              {typeCard("R", "Receive Cheque", "From customers")}
              {typeCard("I", "Issue Cheque", "To vendors")}
            </div>
          </div>
          <label className="pd-f"><span>Voucher Date <em>*</em></span><div className="pd-inp-ic"><Calendar /><input type="date" value={s.date} disabled={locked} onChange={(e) => { setS((x) => ({ ...x, date: e.target.value })); setDirty(true); }} /></div></label>
          <label className="pd-f"><span>Bank Account <em>*</em></span>
            <div className="pd-inp-ic"><Landmark />
              <select value={s.bankId} disabled={locked} onChange={(e) => { setS((x) => ({ ...x, bankId: e.target.value })); setDirty(true); }}>
                <option value="">Select bank account</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.bankName ? `${b.bankName} · ` : ""}{b.title}{b.last4 ? ` ·${b.last4}` : ""}</option>)}
              </select>
            </div>
          </label>
          <label className="pd-f" title={R ? "Due cheques go straight to the bank; post-dated ones are held as PDC" : "Issued cheques wait to be presented, then clear"}><span>Posting Mode</span>
            <select value={s.mode} disabled={locked || !R} onChange={(e) => { setS((x) => ({ ...x, mode: e.target.value as Setup["mode"] })); setDirty(true); }}>
              {CHEQUE_POSTING_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          </label>
          <label className="pd-f"><span>Old No. Rule</span>
            <select value={s.oldRule} disabled={locked} onChange={(e) => { setS((x) => ({ ...x, oldRule: e.target.value as Setup["oldRule"] })); setDirty(true); }}>
              {OLD_NO_RULES.map((m) => <option key={m} value={m}>{OLD_LABEL[m]}</option>)}
            </select>
            <small className="pd-hint">How old voucher numbers are assigned</small>
          </label>
          <label className="pd-f"><span>Default Remarks Prefix</span>
            <input value={s.prefix} maxLength={60} disabled={locked} onChange={(e) => { setS((x) => ({ ...x, prefix: e.target.value })); setDirty(true); }} />
            <small className="pd-hint">Prefixed to every row&apos;s remarks</small>
          </label>
        </div>
      </div>

      <div className="panel pd-card flushx">
        <div className="pd-sec-h">
          <span className="icon-tile"><Table2 /></span>
          <span className="pd-sec-t"><b>Bulk Entry Rows</b><small>Each row will create one voucher.{batch ? ` · ${batch.docNo} (${batch.status.toLowerCase()})` : ""}</small></span>
          <div className="pd-sec-act">
            <span className="pd-rows-pill">Total Rows: <b>{rows.length}</b></span>
            {!locked && <button type="button" className="btn secondary sm" onClick={addRow}><Plus />Add Row</button>}
            {!locked && <button type="button" className="btn secondary sm" onClick={dupSelected}><Copy />Duplicate Selected</button>}
            {!locked && <button type="button" className="btn danger sm" onClick={() => (selected ? delRows(rows.filter((r) => r.sel).map((r) => r.key)) : toast("Select rows to delete", { tone: "info" }))}><Trash2 />Delete Selected</button>}
          </div>
        </div>
        {summary && (
          <div className={cn("banner pd-vban", summary.tone)}>
            {summary.tone === "good" ? <CircleCheck /> : summary.tone === "warn" ? <TriangleAlert /> : <OctagonAlert />}
            <div>
              <b>{summary.title}</b>
              {summary.text && <p>{summary.text}</p>}
              {!!summary.issues.length && <p className="pd-issues">{summary.issues.slice(0, 8).map((x) => <span key={x}>{x}</span>)}{summary.issues.length > 8 && <span>+{summary.issues.length - 8} more</span>}</p>}
            </div>
          </div>
        )}
        <div className="table-wrap pd-gridwrap pd-cq-bwrap">
          <table className="tbl lines pd-lines pd-cq-bt" data-plain>
            <thead>
              <tr>
                <th className="pd-ck">
                  <input type="checkbox" aria-label="Select all" checked={!!rows.length && selected === rows.length} ref={(el) => { if (el) el.indeterminate = selected > 0 && selected < rows.length; }}
                    onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, sel: e.target.checked })))} />
                </th>
                <th>#</th><th>Party Code <em>*</em></th><th>Party Name <em>*</em></th><th>Cheque No. <em>*</em></th><th>Cheque Date <em>*</em></th><th>Due Date</th>
                <th className="num">Amount <em>*</em></th><th>Remarks</th><th>Old No.</th><th className="pd-act-h">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr className="pd-empty"><td colSpan={11}><div><span className="icon-well"><Sheet /></span><b>No rows</b><small>Add rows or upload a populated sheet.</small></div></td></tr>
              )}
              {rows.map((r, i) => {
                const ro = locked || !!r.cheque;
                const inp = (k: Cell, extra: { type?: string; ph?: string; cls?: string } = {}) => (
                  <input value={r[k]} type={extra.type} placeholder={extra.ph} disabled={ro} className={cn(extra.cls, cellBad(i, k) && "pd-bad")}
                    title={r.serverErr?.[k] ?? (showErr ? clientErr[i]?.[k] : undefined)} onChange={(e) => edit(r.key, { [k]: e.target.value } as Partial<Row>)} />
                );
                return (
                  <tr key={r.key} className={cn(r.sel && "selected", r.cheque && "pd-gen-done")}>
                    <td className="pd-ck"><input type="checkbox" aria-label="Select row" checked={r.sel} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, sel: e.target.checked } : x)))} /></td>
                    <td className="pd-idx">{i + 1}</td>
                    <td className="pd-code2">
                      <div className="pd-cellic">
                        <input value={r.partyCode} placeholder="Code" disabled={ro} className={cn(cellBad(i, "partyCode") && "pd-bad")} list={`cq-parties-${s.t}`}
                          title={r.serverErr?.partyCode ?? (showErr ? clientErr[i]?.partyCode : undefined)}
                          onChange={(e) => edit(r.key, { partyCode: e.target.value.toUpperCase() })} onBlur={(e) => setCode(r.key, e.target.value)} />
                        <Search />
                      </div>
                    </td>
                    <td className="pd-name">{inp("partyName", { ph: "Party name" })}</td>
                    <td className="pd-sm">{inp("chequeNo", { ph: "000000" })}</td>
                    <td className="pd-date">{inp("chequeDate", { type: "date" })}</td>
                    <td className="pd-date">{inp("dueDate", { type: "date" })}</td>
                    <td className="pd-sm2">{inp("amount", { type: "number", ph: "0.00", cls: "num" })}</td>
                    <td className="pd-rem">{inp("remarks", { ph: "Remarks" })}</td>
                    <td className="pd-sm">{r.cheque ? <span className="badge good">{r.cheque.docNo}</span> : inp("legacyNo", { ph: "—" })}</td>
                    <td className="pd-act">
                      {!ro && <button type="button" className="pd-icb" aria-label="Duplicate row" onClick={() => dupRow(r)}><Copy /></button>}
                      {!ro && <button type="button" className="pd-icb danger" aria-label="Delete row" onClick={() => delRows([r.key])}><Trash2 /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id={`cq-parties-${s.t}`}>{[...parties.entries()].map(([code, p]) => <option key={code} value={code}>{p.name}</option>)}</datalist>
          <div className={cn("pd-genbar", progress && "on")}>
            <div><b>{progress?.title}</b><span>{progress?.n}</span></div>
            <div className="progress lg"><i style={{ width: `${progress?.pct ?? 0}%` }} /></div>
          </div>
        </div>
      </div>

      <div className="panel pd-card pd-sheet">
        <div className="pd-sheet-l">
          <div className="pd-sec-h nob"><span className="icon-tile"><FileSpreadsheet /></span><span className="pd-sec-t"><b>Sheet Population <small className="muted">(optional)</small></b><small>Populate rows faster from a sheet — or keep typing on screen.</small></span></div>
          <div className="row">
            <button type="button" className="btn primary" onClick={downloadTemplate}><Download />Download CSV Template</button>
            <button type="button" className="btn secondary" disabled={locked} onClick={() => fileRef.current?.click()}><Upload /><span>Upload Populated Sheet</span></button>
            <button type="button" className="btn ghost" disabled={!imported} onClick={() => setPreview(true)}><Eye />Preview Import</button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
          </div>
        </div>
        <div className="pd-how">
          <b><Info />How it works</b>
          <ol><li>Download the CSV template</li><li>Fill in your data and upload the file</li><li>Preview the import, then validate and generate</li></ol>
        </div>
        <div className="pd-fmt"><FileText /><span>Supported now: .csv (Excel: save as CSV)<br />Maximum 1,000 records per file</span></div>
      </div>

      {!!recent.length && (
        <div className="panel pd-card flushx">
          <div className="pd-sec-h"><span className="icon-tile"><History /></span><span className="pd-sec-t"><b>Recent batches</b><small>Reopen a saved sheet to finish, generate or review it.</small></span></div>
          <div className="table-wrap">
            <table className="tbl pd-cq-recent" data-plain>
              <thead><tr><th>Batch</th><th>Date</th><th>Type</th><th>Bank</th><th className="num">Rows</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
              <tbody>
                {recent.slice(0, 8).map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.docNo}</b></td><td>{b.docDate}</td><td>{b.direction === "ISSUED" ? "Issue" : "Receive"}</td>
                    <td>{b.bankAccount.title}{b.bankAccount.last4 ? ` ·${b.bankAccount.last4}` : ""}</td>
                    <td className="num">{b.rowCount}</td><td className="num"><Rs value={b.totalAmount} /></td>
                    <td><span className={cn("badge", STATUS_TONE[b.status] ?? "neutral")}>{b.status.charAt(0) + b.status.slice(1).toLowerCase()}</span></td>
                    <td className="num"><button type="button" className="btn secondary sm" onClick={() => void open(b.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="pd-cq-bfoot">
        <span className="muted small">{rows.length} rows · total <b><Rs value={total} /></b></span>
        <span className="spacer" />
        <button type="button" className="btn secondary" disabled={!!busy} onClick={() => void cancel()}>Cancel</button>
        {can.create && !locked && (
          <button type="button" className={cn("btn secondary", busy === "validate" && "pd-busy")} disabled={!!busy} onClick={() => void validate()}><CircleCheck />Validate Rows</button>
        )}
        {can.post && batch?.status !== "GENERATED" && batch?.status !== "CANCELLED" && (
          <button type="button" className={cn("btn primary", busy === "generate" && "pd-busy")} disabled={!!busy || !can.create} onClick={() => void generate()}><Send /><span>Generate Vouchers</span></button>
        )}
      </div>

      <Drawer open={preview} onClose={() => setPreview(false)} title="Last import preview" subtitle={imported ? `${imported.name} · ${imported.rows.length} rows` : undefined}>
        <table className="tbl" data-plain>
          <thead><tr><th>Party</th><th>Cheque</th><th>Date</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {imported?.rows.map((r) => (
              <tr key={r.key}><td>{r.partyCode}<br /><small className="muted">{r.partyName}</small></td><td>{r.chequeNo}</td><td>{r.chequeDate}</td><td className="num"><Rs value={num(r.amount)} /></td></tr>
            ))}
          </tbody>
        </table>
      </Drawer>
    </>
  );
}
