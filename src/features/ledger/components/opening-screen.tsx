"use client";

import { ArrowDownLeft, ArrowUpRight, Calendar, CircleCheck, Download, History, Plus, Save, Scale, Search, Send, Upload, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GlOptions, OpeningBatch } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { HistoryTab } from "@/features/history/components/history-tab";
import { dateLabel, downloadCsv, Hl, Money } from "@/features/finance/components/finance-ui";
import { getOpening, postOpening, saveOpening, voucherOptions } from "../api";

type Account = GlOptions["accounts"][number];
type Cell = { debit: string; credit: string };
type Chip = "all" | "1" | "2" | "3" | "bal";
const TYPE: Record<number, [string, string]> = { 1: ["Asset", "info"], 2: ["Liability", "danger"], 3: ["Equity", "violet"], 4: ["Income", "good"], 5: ["Expense", "warn"] };
const num = (s: string | undefined) => {
  const n = Number(String(s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const fmt = (n: number) => (n ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const apiMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Parses "code,debit,credit" CSV text (header optional) into rows with per-row problems. */
function parseCsv(text: string, byCode: Map<string, Account>) {
  const rows: { line: number; code: string; account: Account | null; debit: number; credit: number; error: string | null }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const cells = raw.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!cells[0] || (i === 0 && /code/i.test(cells[0]))) return;
    const [code, d = "", c = ""] = cells;
    const debit = Number(d.replace(/[^\d.-]/g, "") || 0), credit = Number(c.replace(/[^\d.-]/g, "") || 0);
    const account = byCode.get(code!) ?? null;
    let error: string | null = null;
    if (!account) error = "Unknown or non-postable account code";
    else if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0) error = "Amounts must be positive numbers";
    else if (debit > 0 && credit > 0) error = "Debit or credit, not both";
    rows.push({ line: i + 1, code: code!, account, debit, credit, error });
  });
  return rows;
}

/** Finance › Accounts › Opening Balances (template app/accounting/opening): the opening trial balance of a fiscal year, posted as one OB voucher. */
export function OpeningScreen({ can }: { can: { edit: boolean; post: boolean } }) {
  const toast = useToast();
  const [opts, setOpts] = useState<GlOptions | null>(null);
  const [year, setYear] = useState("");
  const [batch, setBatch] = useState<OpeningBatch | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [branchId, setBranchId] = useState("");
  const [suspenseId, setSuspenseId] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [suspenseErr, setSuspenseErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    voucherOptions()
      .then((o) => {
        if (cancelled) return;
        setOpts(o);
        setYear((y) => y || (o.fiscalYears.find((f) => f.status === "OPEN") ?? o.fiscalYears[0])?.id || "");
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the chart of accounts" }));
    return () => { cancelled = true; };
  }, [attempt]);

  const load = useCallback((b: OpeningBatch) => {
    setBatch(b);
    setCells(Object.fromEntries(b.lines.map((l) => [l.account.id, { debit: fmt(l.debit), credit: fmt(l.credit) }])));
    setBranchId(b.branch.id);
    setSuspenseId(b.suspenseAccount?.id ?? "");
    setExtra([]);
    setDirty(false);
    setSuspenseErr("");
    setChip(b.lines.length ? "bal" : "all");
  }, []);

  useEffect(() => {
    if (!year) return;
    let cancelled = false;
    getOpening(year)
      .then((b) => { if (!cancelled) { load(b); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load opening balances" }));
    return () => { cancelled = true; };
  }, [year, attempt, load]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const byId = useMemo(() => new Map((opts?.accounts ?? []).map((a) => [a.id, a])), [opts]);
  const byCode = useMemo(() => new Map((opts?.accounts ?? []).map((a) => [a.code, a])), [opts]);
  const posted = batch?.status === "POSTED";
  const editable = can.edit && !posted;

  const totals = useMemo(() => {
    let dr = 0, cr = 0, nDr = 0, nCr = 0;
    for (const c of Object.values(cells)) {
      const d = num(c.debit), k = num(c.credit);
      dr += d; cr += k;
      if (d) nDr++;
      if (k) nCr++;
    }
    return { dr: Math.round(dr * 100) / 100, cr: Math.round(cr * 100) / 100, diff: Math.round((dr - cr) * 100) / 100, nDr, nCr };
  }, [cells]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const fy = opts?.fiscalYears.find((f) => f.id === year);
  const asAt = batch?.asAtDate ?? fy?.startDate ?? null;
  const hasValue = (id: string) => !!(num(cells[id]?.debit) || num(cells[id]?.credit));
  const all = opts?.accounts ?? [];
  // Balance-sheet accounts are always listed; income / expense accounts only once they carry a value or are added.
  const listed = all.filter((a) => a.accountClass <= 3 || hasValue(a.id) || extra.includes(a.id));
  const qq = q.trim().toLowerCase();
  const rows = listed.filter((a) => (chip === "all" || (chip === "bal" ? hasValue(a.id) : String(a.accountClass) === chip)) && (!qq || `${a.code} ${a.name}`.toLowerCase().includes(qq)));
  const hiddenZero = chip === "bal" ? listed.filter((a) => !hasValue(a.id)).length : 0;
  const addable = all.filter((a) => !listed.some((l) => l.id === a.id));
  const counts = { all: listed.length, 1: listed.filter((a) => a.accountClass === 1).length, 2: listed.filter((a) => a.accountClass === 2).length, 3: listed.filter((a) => a.accountClass === 3).length, bal: listed.filter((a) => hasValue(a.id)).length };

  const setCell = (id: string, side: keyof Cell, v: string) => {
    setCells((c) => {
      const cur = c[id] ?? { debit: "", credit: "" };
      // One side per account: typing a debit clears the credit and vice versa.
      const next = side === "debit" ? { debit: v, credit: v && num(v) ? "" : cur.credit } : { credit: v, debit: v && num(v) ? "" : cur.debit };
      return { ...c, [id]: next };
    });
    setDirty(true);
  };
  const blur = (id: string, side: keyof Cell) => setCells((c) => (c[id] ? { ...c, [id]: { ...c[id]!, [side]: fmt(num(c[id]![side])) } } : c));
  const clearRow = (id: string) => { setCells((c) => ({ ...c, [id]: { debit: "", credit: "" } })); setDirty(true); };

  const body = () => {
    const ids = new Map(batch?.lines.map((l) => [l.account.id, l.id]) ?? []);
    return {
      fiscalYearId: year, branchId, suspenseAccountId: suspenseId || null, remarks: batch?.remarks ?? null, rowVersion: batch?.rowVersion ?? null,
      lines: Object.entries(cells).filter(([id]) => hasValue(id)).map(([id, c]) => ({ ...(ids.get(id) && { id: ids.get(id) }), accountId: id, debit: num(c.debit), credit: num(c.credit), remarks: null })),
    };
  };
  const save = async (quiet = false) => {
    setBusy(true);
    try {
      const b = await saveOpening(body());
      load(b);
      if (!quiet) toast("Opening balances saved as draft", { tone: "good" });
      return b;
    } catch (e) {
      toast(apiMessage(e, "Could not save opening balances"), { tone: "danger" });
      if (e instanceof ApiError && e.details?.suspenseAccountId) setSuspenseErr(e.details.suspenseAccountId[0] ?? "");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const askPost = () => {
    if (totals.diff && !suspenseId) {
      setSuspenseErr("Choose a suspense account for the difference");
      toast(`Out of balance by Rs ${fmt(Math.abs(totals.diff))}. Choose a suspense account first.`, { tone: "warn" });
      return;
    }
    if (!totals.nDr && !totals.nCr) return toast("Enter at least one opening balance", { tone: "warn" });
    setConfirm(true);
  };
  const post = async () => {
    const b = dirty || !batch?.id ? await save(true) : batch;
    if (!b?.id || b.rowVersion === null) { setConfirm(false); return; }
    setBusy(true);
    try {
      const p = await postOpening(b.id, b.rowVersion);
      load(p);
      toast(`Opening balances posted as ${p.voucher?.docNo ?? "a voucher"}`, { tone: "good" });
    } catch (e) {
      toast(apiMessage(e, "Could not post opening balances"), { tone: "danger" });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  const suspense = byId.get(suspenseId);

  return (
    <>
      <PageHead
        eyebrow="Accounting / Opening Balances"
        title="Opening Balances"
        description={asAt ? <>Enter balances as at {dateLabel(asAt)} (start of {fy?.code ?? "the fiscal year"}). Debits must equal credits before posting.</> : "Enter the opening trial balance of a fiscal year."}
        actions={<>
          {opts && opts.fiscalYears.length > 1 && (
            <select aria-label="Fiscal year" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: "auto" }}>
              {opts.fiscalYears.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
            </select>
          )}
          {editable && <button className="btn secondary" type="button" onClick={() => setImportOpen(true)}><Upload />Import CSV</button>}
          <button className="btn secondary" type="button" disabled={!opts} onClick={() => downloadCsv(`opening-balances-${fy?.code ?? "template"}.csv`, [["code", "account", "debit", "credit"], ...listed.map((a) => [a.code, a.name, num(cells[a.id]?.debit) || "", num(cells[a.id]?.credit) || ""])])}><Download />Template</button>
          {batch?.id && <button className="btn secondary" type="button" onClick={() => setHistoryOpen(true)}><History />History</button>}
          {editable && <button className="btn primary" type="button" disabled={busy || !batch || !dirty} onClick={() => void save()}><Save />Save</button>}
        </>}
      />

      {!batch || !opts ? (
        <><Skeleton style={{ height: 70, marginBottom: 16 }} /><Skeleton style={{ height: 420 }} /></>
      ) : opts.fiscalYears.length === 0 ? (
        <EmptyState icon={<Calendar />} title="No fiscal year yet" description="Create the fiscal year in Fiscal Periods, then enter its opening balances." />
      ) : (
        <>
          {posted ? (
            <Banner tone="good" title={`Posted as ${batch.voucher?.docNo ?? "an opening voucher"}`}
              action={batch.voucher && <Link className="btn sm secondary" href={`/accounting/vouchers/${batch.voucher.id}`}>Open voucher</Link>}>
              Posted {dateLabel(batch.postedAt)}{batch.postedBy ? ` by ${batch.postedBy.name}` : ""}. Opening balances are locked; correct them with a journal voucher.
            </Banner>
          ) : totals.diff ? (
            <Banner tone="warn" title={`Out of balance by Rs ${fmt(Math.abs(totals.diff))}`}
              action={<button className="btn sm secondary" type="button" onClick={() => setChip(chip === "bal" ? "all" : "bal")}>{chip === "bal" ? "Show all" : "Show difference"}</button>}>
              Total debits Rs {fmt(totals.dr) || "0.00"} vs total credits Rs {fmt(totals.cr) || "0.00"}.{" "}
              {suspense ? `The difference will be parked in ${suspense.code} ${suspense.name} if you post now.` : "Choose a suspense account to park the difference, or balance the entries."}
            </Banner>
          ) : totals.dr ? (
            <Banner tone="good" title="Debits equal credits">Ready to post Rs {fmt(totals.dr)} as the opening voucher.</Banner>
          ) : (
            <Banner tone="info" title="No balances entered yet">Type each account&apos;s balance as at {dateLabel(asAt)}, or import them from a CSV file.</Banner>
          )}

          <div className="kpi-grid mb">
            <div className="kpi"><div className="kpi-top"><span>Total debits</span><span className="icon-well"><ArrowDownLeft /></span></div><strong><Money value={totals.dr} dec={0} /></strong><small>{totals.nDr} account{totals.nDr === 1 ? "" : "s"}</small></div>
            <div className="kpi yellow"><div className="kpi-top"><span>Total credits</span><span className="icon-well"><ArrowUpRight /></span></div><strong><Money value={totals.cr} dec={0} /></strong><small>{totals.nCr} account{totals.nCr === 1 ? "" : "s"}</small></div>
            <div className={cn("kpi", totals.diff && !posted ? "red" : "teal")}><div className="kpi-top"><span>Difference</span><span className="icon-well"><Scale /></span></div><strong><Money value={Math.abs(totals.diff)} dec={0} /></strong>
              <small className={cn(totals.diff !== 0 && !posted && "down")}>{posted && totals.diff && suspense ? `Parked in ${suspense.code}` : totals.diff > 0 ? "Debit heavy" : totals.diff < 0 ? "Credit heavy" : "Balanced"}</small></div>
            <div className="kpi blue"><div className="kpi-top"><span>As at</span><span className="icon-well"><Calendar /></span></div><strong>{dateLabel(asAt)}</strong><small>{fy?.code} · Status: {posted ? "Posted" : "Draft"}</small></div>
          </div>

          <div className="panel flush">
            <div className="panel-head"><div><h3>Opening trial balance</h3><p>As at {dateLabel(asAt)} · debits must equal credits</p></div>
              {(editable || suspense) && (
                <div className="panel-actions">
                  <select aria-label="Suspense account" aria-invalid={!!suspenseErr} title={suspenseErr || "Suspense account for any difference"} value={suspenseId} disabled={!editable}
                    onChange={(e) => { setSuspenseId(e.target.value); setSuspenseErr(""); setDirty(true); }} style={{ width: "auto", minWidth: 240, ...(suspenseErr ? { borderColor: "var(--danger)" } : {}) }}>
                    <option value="">Suspense account for the difference…</option>
                    {all.map((a) => <option key={a.id} value={a.id}>Suspense: {a.code} · {a.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="toolbar">
              <label className="search-field"><Search /><input placeholder="Find account…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <div className="chips">
                {([["all", "All", counts.all], ["1", "Assets", counts[1]], ["2", "Liabilities", counts[2]], ["3", "Equity", counts[3]], ["bal", "With balance", counts.bal]] as const).map(([k, l, n]) => (
                  <button key={k} type="button" className={cn(chip === k && "active")} title={`${n} accounts`} onClick={() => setChip(k)}>{l}</button>
                ))}
              </div>
              <span className="spacer" />
              <select aria-label="Branch" value={branchId} disabled={!editable} onChange={(e) => { setBranchId(e.target.value); setDirty(true); }} style={{ width: "auto", minWidth: 150 }}>
                {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {suspenseErr && <p className="hint text-danger" role="alert" style={{ margin: "0 16px 10px" }}>{suspenseErr}</p>}
            <div className="table-wrap"><table className="tbl lines">
              <thead><tr><th>Code</th><th>Account</th><th>Type</th><th className="num" style={{ width: 180 }}>Debit</th><th className="num" style={{ width: 180 }}>Credit</th><th /></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const [t, tone] = TYPE[a.accountClass] ?? ["Account", "neutral"];
                  const c = cells[a.id];
                  return (
                    <tr key={a.id}>
                      <td><b><Hl text={a.code} q={q} /></b></td>
                      <td><Hl text={a.name} q={q} /></td>
                      <td><span className={cn("badge", tone)}>{t}</span></td>
                      {editable ? <>
                        <td><input className="cell-input num" inputMode="decimal" aria-label={`${a.code} debit`} placeholder="0.00" value={c?.debit ?? ""} onChange={(e) => setCell(a.id, "debit", e.target.value)} onBlur={() => blur(a.id, "debit")} /></td>
                        <td><input className="cell-input num" inputMode="decimal" aria-label={`${a.code} credit`} placeholder="0.00" value={c?.credit ?? ""} onChange={(e) => setCell(a.id, "credit", e.target.value)} onBlur={() => blur(a.id, "credit")} /></td>
                        <td className="actions">{hasValue(a.id) && <button className="icon-btn-sm" type="button" aria-label={`Clear ${a.code}`} onClick={() => clearRow(a.id)}><X /></button>}</td>
                      </> : <>
                        <td className="num">{num(c?.debit) ? <Money value={num(c?.debit)} rs={false} /> : "—"}</td>
                        <td className="num">{num(c?.credit) ? <Money value={num(c?.credit)} rs={false} /> : "—"}</td>
                        <td />
                      </>}
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={6}><EmptyState icon={<Search />} title="No account matches" description="Try another search or filter." /></td></tr>}
                {(editable && addable.length > 0) || hiddenZero ? (
                  <tr><td colSpan={6}>
                    {editable && addable.length > 0 && (
                      <label className="btn ghost sm" style={{ position: "relative" }}>
                        <Plus />Add account
                        <select aria-label="Add account" value="" onChange={(e) => { if (e.target.value) { setExtra((x) => [...x, e.target.value]); setChip("all"); } }}
                          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", height: "100%" }}>
                          <option value="">Add account</option>
                          {addable.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                        </select>
                      </label>
                    )}{" "}
                    {hiddenZero > 0 && <span className="muted small">{hiddenZero} accounts with zero balance hidden</span>}
                  </td></tr>
                ) : null}
                <tr className="total"><td colSpan={3}>Totals</td><td className="num">{fmt(totals.dr) || "0.00"}</td><td className="num">{fmt(totals.cr) || "0.00"}</td><td /></tr>
                <tr className="total"><td colSpan={3}>Difference</td>
                  <td className={cn("num", totals.diff > 0 ? "neg" : "zero")}>{totals.diff > 0 ? fmt(totals.diff) : "—"}</td>
                  <td className={cn("num", totals.diff < 0 ? "neg" : "zero")}>{totals.diff < 0 ? fmt(-totals.diff) : "—"}</td><td /></tr>
              </tbody>
            </table></div>
          </div>
          {editable && (
            <div className="form-actions">
              <button className="btn secondary" type="button" disabled={!dirty || busy} onClick={() => { load(batch); toast("Changes discarded", { tone: "info" }); }}>Discard changes</button>
              <button className="btn secondary" type="button" disabled={busy || !dirty} onClick={() => void save()}>Save draft</button>
              {can.post && <button className="btn primary" type="button" disabled={busy} onClick={askPost}><Send />Post opening balances</button>}
            </div>
          )}
        </>
      )}

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void post()} busy={busy} title="Post opening balances?" confirmLabel="Post">
        Rs {fmt(totals.dr) || "0.00"} debits and Rs {fmt(totals.cr) || "0.00"} credits will be posted as one opening-balance voucher dated {dateLabel(asAt)}
        {totals.diff ? `, with the difference of Rs ${fmt(Math.abs(totals.diff))} parked in ${suspense?.code} ${suspense?.name}` : ""}. Posted balances can only be corrected with a journal voucher.
      </ConfirmDialog>

      {importOpen && opts && <ImportModal asAt={asAt} byCode={byCode} onClose={() => setImportOpen(false)} onImport={(rows, mode) => {
        setCells((c) => {
          const next = { ...c };
          for (const r of rows) {
            const cur = next[r.id];
            if (mode === "skip" && cur && (num(cur.debit) || num(cur.credit))) continue;
            const base = mode === "add" && cur ? num(cur.debit) - num(cur.credit) : 0;
            const net = Math.round((base + r.debit - r.credit) * 100) / 100;
            next[r.id] = { debit: net > 0 ? fmt(net) : "", credit: net < 0 ? fmt(-net) : "" };
          }
          return next;
        });
        setExtra((x) => [...x, ...rows.map((r) => r.id)]);
        setDirty(true);
        setChip("bal");
        toast(`${rows.length} rows imported`, { tone: "good" });
        setImportOpen(false);
      }} />}

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Opening balance history" subtitle={fy?.code}>
        {batch?.id && <HistoryTab schema="Accounting" table="OpeningBalances" id={batch.id} />}
      </Drawer>
    </>
  );
}

/** Template acc-import-opening: CSV (code, debit, credit) checked against the chart of accounts before it fills the grid. */
function ImportModal({ asAt, byCode, onClose, onImport }: {
  asAt: string | null;
  byCode: Map<string, Account>;
  onClose: () => void;
  onImport: (rows: { id: string; debit: number; credit: number }[], mode: "replace" | "add" | "skip") => void;
}) {
  const [rows, setRows] = useState<ReturnType<typeof parseCsv> | null>(null);
  const [file, setFile] = useState("");
  const [mode, setMode] = useState<"replace" | "add" | "skip">("replace");
  const read = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setFile(`${f.name} is larger than 5 MB`); setRows([]); return; }
    setFile(f.name);
    void f.text().then((t) => setRows(parseCsv(t, byCode).slice(0, 2000)));
  };
  const good = rows?.filter((r) => !r.error) ?? [];
  const bad = rows?.filter((r) => r.error) ?? [];
  return (
    <Modal open onClose={onClose} title="Import opening balances" subtitle="CSV with columns: code, debit, credit"
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={!good.length} onClick={() => onImport(good.map((r) => ({ id: r.account!.id, debit: r.debit, credit: r.credit })), mode)}>Import{good.length ? ` ${good.length} rows` : ""}</button></>}>
      <label className="dropzone mb" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); read(e.dataTransfer.files[0]); }}>
        <UploadCloud /><b>{file || "Drop CSV here or click to browse"}</b><small>Max 5 MB · UTF-8 · up to 2,000 rows</small>
        <input type="file" accept=".csv,text/csv" hidden onChange={(e) => read(e.target.files?.[0])} />
      </label>
      <FormGrid>
        <Field label="As at date"><input type="date" value={asAt ?? ""} readOnly /></Field>
        <Field label="On duplicate">
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="replace">Replace existing value</option><option value="add">Add to existing</option><option value="skip">Skip row</option>
          </select>
        </Field>
      </FormGrid>
      {rows && (
        <div className="mt">
          {rows.length ? (
            <Banner tone={bad.length ? "warn" : "good"} title={`${good.length} of ${rows.length} rows ready`}>
              {bad.length ? `${bad.length} rows will be skipped: ${bad.slice(0, 4).map((r) => `line ${r.line} (${r.code}: ${r.error})`).join("; ")}${bad.length > 4 ? "…" : ""}` : "Every account code matches a postable account."}
            </Banner>
          ) : <Banner tone="danger" title="No rows found">Use one row per account: code, debit, credit.</Banner>}
          {good.length > 0 && (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Code</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
              <tbody>{good.slice(0, 8).map((r) => (
                <tr key={r.line}><td><b>{r.code}</b></td><td>{r.account!.name}</td><td className="num">{r.debit ? fmt(r.debit) : "—"}</td><td className="num">{r.credit ? fmt(r.credit) : "—"}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          {good.length > 8 && <p className="muted small mt">…and {good.length - 8} more</p>}
        </div>
      )}
      {!rows && <p className="muted small mt"><CircleCheck style={{ width: 14, height: 14, verticalAlign: -2 }} /> Account codes are validated against the chart of accounts.</p>}
    </Modal>
  );
}
