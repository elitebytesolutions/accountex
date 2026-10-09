"use client";

import { ArrowRight, CircleCheck, Clock, CornerDownRight, FileDown, ListChecks, ListTodo, Pencil, Plus, RotateCcw, Tag, Trash2, Upload, WandSparkles, X, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RULE_OPERATORS, ruleMatches, type BankAccount, type BankingOptions, type BankRule, type CostCentre, type SampleLine, type StatementImport, type StatementLine } from "@/shared";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { IconWell, PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { listCostCentres } from "@/features/finance/api";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { applyBankRules, bankingOptions, categoriseLine, getStatementImport, ignoreLine, listStatementImports, restoreLine } from "@/features/banking/api";
import { CategoriseModal, type CategoriseBody } from "@/features/banking/components/bank-ui";
import { StatementImportModal } from "@/features/banking/components/statement-import-modal";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { createBankRule, deleteBankRule, listBankAccounts, listBankRules, setBankRuleEnabled, testBankRules, updateBankRule } from "../api";
import { AccountOptions, apiFieldErrors, apiMessage, usePostableAccounts } from "./treasury-ui";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Cond = { field: string; operator: string; value: string };
type Draft = { name: string; matchMode: "ALL" | "ANY"; conditions: Cond[]; accountId: string; costCentreId: string; bankAccountId: string; autoPost: boolean };
const LOOKUPS = ["BankRuleConditionField", "BankRuleConditionOperator"];
const FIELDS = ["DESC", "AMT", "REF", "TYPE"];
const PLACEHOLDER: Record<string, string> = { AMT: "e.g. 5000", TYPE: "in / out", DESC: "e.g. TCS", REF: "e.g. KE-ONLINE" };
const fmt = (n: number) => Math.abs(n).toLocaleString("en-US");

/** "01 Oct, K-ELECTRIC BILL, KE-ONLINE, -184320" per line → sample lines (date optional; amount last; negative = money out). */
function parseLines(text: string): SampleLine[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((p) => p.trim().replace(/^"|"$/g, ""));
    const amount = Number((parts.pop() ?? "0").replace(/[^0-9.-]/g, "")) || 0;
    const [a = "", b = "", c = ""] = parts;
    const hasDate = /^\d{1,2}[\s/-]\w+/.test(a) && parts.length >= 2;
    return hasDate ? { description: b, reference: c, amount } : { description: a, reference: b, amount };
  });
}

/**
 * Template app/bank/rules (4A-company-plus.html + 9A-company-plus.js §9): statement import, the imported lines with Apply rules,
 * rule cards and the rule builder. Raast / IBFT invoice matching needs sales invoices (Phase 24).
 */
export function BankRulesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const accounts = usePostableAccounts();
  const [rules, setRules] = useState<BankRule[] | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [centres, setCentres] = useState<CostCentre[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<BankRule | "new" | null>(null);
  const [removing, setRemoving] = useState<BankRule | null>(null);
  const [sample, setSample] = useState("");
  const [results, setResults] = useState<{ line: SampleLine; rule: string | null }[] | null>(null);
  const [options, setOptions] = useState<BankingOptions | null>(null);
  const [bankId, setBankId] = useState("");
  const [imports, setImports] = useState<StatementImport[] | null>(null);
  const [current, setCurrent] = useState<string>("");
  const [stmt, setStmt] = useState<StatementImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lineBusy, setLineBusy] = useState<string | null>(null);
  const [categorising, setCategorising] = useState<StatementLine | null>(null);
  const [stmtAttempt, setStmtAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listBankRules()
      .then((r) => { if (!cancelled) { setRules(r); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load bank rules" }));
    listBankAccounts().then((b) => !cancelled && setBanks(b.filter((x) => x.status === "ACTIVE"))).catch(() => undefined);
    listCostCentres().then((c) => !cancelled && setCentres(c.filter((x) => x.status === "ACTIVE"))).catch(() => undefined);
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    bankingOptions().then(setOptions).catch(() => undefined);
  }, []);
  useEffect(() => {
    let cancelled = false;
    listStatementImports(bankId || undefined)
      .then((l) => { if (!cancelled) { setImports(l); setCurrent((c) => (c && l.some((x) => x.id === c) ? c : l[0]?.id ?? "")); } })
      .catch(() => !cancelled && setImports([]));
    return () => { cancelled = true; };
  }, [bankId, stmtAttempt]);
  useEffect(() => {
    let cancelled = false;
    if (!current) { Promise.resolve().then(() => !cancelled && setStmt(null)); return () => { cancelled = true; }; }
    getStatementImport(current).then((i) => !cancelled && setStmt(i)).catch(() => !cancelled && setStmt(null));
    return () => { cancelled = true; };
  }, [current, stmtAttempt]);
  const reloadStmt = () => setStmtAttempt((n) => n + 1);

  const toggle = async (r: BankRule) => {
    try {
      await setBankRuleEnabled(r.id, !r.isEnabled, r.rowVersion);
      toast(`Rule ${r.code} ${r.isEnabled ? "disabled" : "enabled"}`, { tone: r.isEnabled ? "warn" : "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update the rule"), { tone: "danger" });
    }
  };
  const runTest = async () => {
    const lines = parseLines(sample);
    if (!lines.length) return toast("Paste at least one line: description, reference, amount", { tone: "warn" });
    try {
      const r = await testBankRules(lines);
      setResults(r.lines.map((l) => ({ line: lines[l.index]!, rule: l.ruleCode ? `${l.ruleCode} · ${l.ruleName}` : null })));
      toast(`${r.matched} of ${lines.length} lines match your rules`, { tone: "info" });
    } catch (e) {
      toast(apiMessage(e, "Could not test"), { tone: "danger" });
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const all = rules ?? [];
  const active = all.filter((r) => r.isEnabled);
  const lines = stmt?.lines ?? [];
  const open = (l: StatementLine) => l.status === "UNMATCHED" && !l.voucher;
  const unmatched = lines.filter(open).length;
  const byRule = lines.filter((l) => l.status === "CATEGORISED" && l.bankRule).length;
  const autoPct = lines.length ? Math.round((byRule / lines.length) * 100) : 0;
  const rulesFor = active.filter((r) => !r.bankAccount || r.bankAccount.id === stmt?.bankAccount.id);
  const ruleOf = (l: StatementLine) => rulesFor.find((r) => ruleMatches(r, { description: l.description, reference: l.reference ?? "", amount: l.amount }));
  const applicable = lines.filter((l) => open(l) && l.bankTransactionId && ruleOf(l)).length;
  const raast = lines.filter((l) => l.amount > 0 && (l.channel === "RAAST" || l.channel === "IBFT" || /RAAST|IBFT/i.test(l.description)));

  const apply = async () => {
    if (!stmt) return;
    setApplying(true);
    try {
      const r = await applyBankRules(stmt.id);
      setStmt(r.import);
      const extra = [r.suggested ? `${r.suggested} suggested` : "", r.failed ? `${r.failed} failed` : ""].filter(Boolean).join(" · ");
      toast(`${r.categorised} lines categorised by rules · ${r.left} left for review${extra ? ` · ${extra}` : ""}`, { tone: r.failed ? "warn" : "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not apply the rules"), { tone: "danger" });
    } finally {
      setApplying(false);
    }
  };
  const lineAct = async (l: StatementLine, act: "ignore" | "restore") => {
    setLineBusy(l.id);
    try {
      await (act === "ignore" ? ignoreLine(l.id, l.rowVersion) : restoreLine(l.id, l.rowVersion));
      toast(act === "ignore" ? "Line ignored" : "Line restored for review", { tone: "info" });
      reloadStmt();
    } catch (e) {
      toast(apiMessage(e, "Could not update the line"), { tone: "danger" });
    } finally {
      setLineBusy(null);
    }
  };
  const doCategorise = async (l: StatementLine, body: CategoriseBody) => {
    const r = await categoriseLine(l.id, { ...body, rowVersion: l.rowVersion });
    toast(r.voucher?.status === "PENDING_APPROVAL" ? `${r.voucher.docNo} raised · waiting for approval` : `Categorised${r.voucher ? ` · ${r.voucher.docNo} posted` : ""}`, { tone: r.voucher?.status === "PENDING_APPROVAL" ? "warn" : "good" });
    setCategorising(null);
    reloadStmt();
  };
  const accept = async (l: StatementLine) => {
    if (!l.categoryAccount) return;
    setLineBusy(l.id);
    try {
      await doCategorise(l, { accountId: l.categoryAccount.id, category: null, costCentreId: l.costCentre?.id ?? null, narration: null });
    } catch (e) {
      toast(apiMessage(e, "Could not categorise"), { tone: "danger" });
    } finally {
      setLineBusy(null);
    }
  };
  const condTxt = (c: Cond) => (
    <>
      {labelOf(lookups, "BankRuleConditionField", c.field)} {labelOf(lookups, "BankRuleConditionOperator", c.operator)} <b>{c.field === "AMT" ? `Rs ${fmt(Number(c.value))}` : `“${c.value}”`}</b>
    </>
  );

  return (
    <>
      <PageHead
        eyebrow={<><WandSparkles />Bank / Rules &amp; Import</>}
        title="Bank Rules & Import"
        description="Import bank statements and let rules categorise the routine lines."
        actions={
          <>
            <ButtonLink icon={<ArrowRight />} href="/bank/reconciliation">Reconciliation</ButtonLink>
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => setEdit("new")}>New rule</Button>}
          </>
        }
      />
      <div className="kpi-grid">
        <div className="kpi yellow"><div className="kpi-top"><span>Unmatched lines</span><span className="icon-well"><ListTodo /></span></div><strong>{unmatched}</strong><small>Waiting for a category or match</small></div>
        <div className="kpi"><div className="kpi-top"><span>Auto-categorised</span><span className="icon-well"><WandSparkles /></span></div><strong>{autoPct}%</strong><small>{stmt ? `Of ${lines.length} lines in ${stmt.fileName}` : "Import a statement to measure"}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Active rules</span><span className="icon-well"><ListChecks /></span></div><strong>{active.length}</strong><small>{all.reduce((s2, r) => s2 + r.hitCount, 0)} hits · {all.filter((r) => r.autoPost).length} auto-post</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Raast / IBFT credits</span><span className="icon-well"><Zap /></span></div><strong>Rs {raast.reduce((s2, l) => s2 + l.amount, 0).toLocaleString("en-US")}</strong><small>{raast.length} receipt{raast.length === 1 ? "" : "s"} in this statement</small></div>
      </div>

      <div className="split cp-br-split">
        <div className="stack">
          <div className="panel cp-br-imp">
            <div className="panel-head">
              <div><h3>Import statement</h3><p>CSV from your bank&apos;s internet banking · Excel and MT940 come later</p></div>
              <select value={bankId} onChange={(e) => setBankId(e.target.value)} aria-label="Bank account">
                <option value="">All bank accounts</option>
                {options?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName ? `${b.bankName} ` : ""}{b.last4 ?? b.title}</option>)}
              </select>
            </div>
            <div
              className="cp-drop sm"
              role="button"
              tabIndex={0}
              onClick={() => can.create && setImporting(true)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && can.create && setImporting(true)}
            >
              <div className="cp-drop-idle">
                <span className="cp-drop-ic"><FileDown /></span>
                <div><b>Drop a statement file</b><small>or <u>browse</u> · .csv · columns mapped once per account</small></div>
                <span className="spacer" />
                {can.create && <Button size="sm" icon={<Upload />} onClick={(e) => { e.stopPropagation(); setImporting(true); }}>Import CSV</Button>}
              </div>
              <div className="cp-br-prog">
                {stmt && (
                  <>
                    <span className="badge good"><CircleCheck />{stmt.fileName}</span>
                    <small>{stmt.lineCount} lines · {stmt.bankAccount.title}{stmt.bankAccount.last4 ? ` ${stmt.bankAccount.last4}` : ""} · {dateLabel(stmt.periodFrom)} → {dateLabel(stmt.periodTo)}{stmt.duplicateCount ? ` · ${stmt.duplicateCount} duplicates skipped` : ""}</small>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="panel flush">
            <div className="panel-head">
              <div><h3>Statement lines <span className="badge neutral">{unmatched} unmatched</span></h3><p>Rules run top to bottom; first match wins</p></div>
              {can.edit && <div className="panel-actions"><Button variant="primary" size="sm" icon={<WandSparkles />} disabled={!applicable || applying} onClick={apply}>{applying ? "Applying…" : "Apply rules"} <span className="cp-btn-n">{applicable}</span></Button></div>}
            </div>
            {imports && imports.length > 1 && (
              <div className="toolbar">
                <select value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Statement">
                  {imports.map((i) => <option key={i.id} value={i.id}>{i.fileName} · {i.bankAccount.title} · imported {dateLabel(i.importedAt)}</option>)}
                </select>
                <span className="muted small">{imports.length} statements imported</span>
              </div>
            )}
            <div className="table-wrap">
              <table className="tbl cp-br-lt" data-plain>
                <thead><tr><th>Date</th><th>Description</th><th className="num">Amount (Rs)</th><th>Category / match</th></tr></thead>
                <tbody>
                  {imports === null && <tr><td colSpan={4}><Skeleton style={{ height: 120 }} /></td></tr>}
                  {imports !== null && !stmt && (
                    <tr className="cp-empty"><td colSpan={4}><EmptyState icon={<FileDown />} title="No statement lines yet" description="Import a CSV statement above to see unmatched lines here." /></td></tr>
                  )}
                  {lines.map((l) => {
                    const hit = open(l) ? ruleOf(l) : undefined;
                    const busy = lineBusy === l.id;
                    return (
                      <tr key={l.id} className={cn((l.status === "CATEGORISED" || l.status === "MATCHED") && "cp-done-row")} style={l.status === "IGNORED" ? { opacity: 0.55 } : undefined}>
                        <td>{dateLabel(l.txnDate).slice(0, 6)}</td>
                        <td><b className="cp-desc">{l.description}</b><small>{l.reference ?? l.channel ?? ""}</small></td>
                        <td className={cn("num", l.amount < 0 ? "cr" : "dr")}>{l.amount < 0 ? `(${fmt(l.amount)})` : fmt(l.amount)}</td>
                        <td className="cp-cat">
                          {l.status === "MATCHED" ? (
                            <span className="cp-catd rx"><CircleCheck /><span><b>{l.voucher ? `Matched to ${l.voucher.docNo}` : "Matched to a posted voucher"}</b><small>Already in the books</small></span></span>
                          ) : l.status === "CATEGORISED" || l.voucher ? (
                            <span className="cp-catd">{l.voucher?.status === "PENDING_APPROVAL" ? <Clock /> : <CircleCheck />}<span>
                              <b>{l.categoryAccount ? `${l.categoryAccount.name} ${l.categoryAccount.code}` : "Categorised"}</b>
                              <small>{l.bankRule ? `Rule ${l.bankRule.code} · ${l.bankRule.name}` : "Categorised by hand"}{l.voucher && <> · <Link className="link" href={`/accounting/vouchers/${l.voucher.id}`}>{l.voucher.docNo}</Link>{l.voucher.status === "PENDING_APPROVAL" ? " (awaiting approval)" : ""}</>}</small>
                            </span></span>
                          ) : l.status === "IGNORED" ? (
                            <span className="row" style={{ gap: 6 }}><span className="badge neutral">Ignored</span>{can.edit && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => lineAct(l, "restore")}><RotateCcw />Restore</button>}</span>
                          ) : (
                            <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                              {l.categoryAccount && l.bankRule ? (
                                <span className="badge info" title={`Suggested by rule ${l.bankRule.code}`}><WandSparkles />{l.categoryAccount.name}</span>
                              ) : hit ? (
                                <span className="badge info" title={`Rule ${hit.code} would categorise this`}><WandSparkles />{hit.code} · {hit.account.name}</span>
                              ) : (
                                <span className="badge neutral">Unmatched</span>
                              )}
                              {can.create && l.categoryAccount && l.bankRule && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => accept(l)}>Accept</button>}
                              {can.create && l.bankTransactionId && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setCategorising(l)}><Tag />Categorise</button>}
                              {can.edit && <button type="button" className="icon-btn-sm" title="Ignore this line" aria-label="Ignore" disabled={busy} onClick={() => lineAct(l, "ignore")}><X /></button>}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Test your rules</h3><p>Paste statement lines — one per line: description, reference, amount (negative = money out)</p></div></div>
            <textarea rows={5} value={sample} onChange={(e) => setSample(e.target.value)} placeholder={"K-ELECTRIC BILL PAYMENT A/C 0400012345678, KE-ONLINE, -184320\nSERVICE CHARGES SEP 2026 INCL FED, SYS-CHG, -2840\nIBFT IN FROM SHIFA INTL, IBFT-0110-88231, 1003000"} style={{ width: "100%" }} />
            <div className="form-actions"><Button variant="primary" icon={<WandSparkles />} disabled={!all.length} onClick={runTest}>Run rules</Button></div>
          </div>
          <div className="panel flush">
            <div className="panel-head"><div><h3>Sample lines {results && <span className="badge neutral">{results.filter((r) => !r.rule).length} unmatched</span>}</h3><p>Rules run top to bottom; first match wins</p></div></div>
            <div className="table-wrap">
              <table className="tbl cp-br-lt">
                <thead><tr><th>Line</th><th>Description</th><th className="num">Amount (Rs)</th><th>Category / match</th></tr></thead>
                <tbody>
                  {!results && <tr><td colSpan={4}><EmptyState title="No lines tested yet" description="Paste a few lines from a bank statement above to see which rule would catch each one." /></td></tr>}
                  {results?.map((r, i) => (
                    <tr key={i} className={cn(r.rule && "cp-done-row")}>
                      <td className="muted">{i + 1}</td>
                      <td><b className="cp-desc">{r.line.description}</b><small>{r.line.reference}</small></td>
                      <td className={cn("num", r.line.amount < 0 ? "cr" : "dr")}>{r.line.amount < 0 ? `(${fmt(r.line.amount)})` : fmt(r.line.amount)}</td>
                      <td>{r.rule ? <span className="cp-catd"><WandSparkles /><span><b>{r.rule}</b><small>{all.find((x) => r.rule!.startsWith(x.code))?.account.name}</small></span></span> : <span className="badge neutral">Unmatched</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="panel cp-br-rx">
            <div className="panel-head"><div><h3>Raast &amp; IBFT matching</h3><p>Credits matched to open invoices by reference and amount</p></div><Button size="sm" disabled title="Arrives with customer receipts">Match ≥ 90%</Button></div>
            {raast.length ? raast.slice(0, 6).map((l, i) => (
              <div key={l.id} className="cp-rx" style={{ ["--i" as string]: i }}>
                <div className="cp-rx-l"><span className={cn("cp-rx-tag", /RAAST/i.test(l.description) || l.channel === "RAAST" ? "raast" : "ibft")}>{/RAAST/i.test(l.description) || l.channel === "RAAST" ? "RAAST" : "IBFT"}</span><div><b>Rs {l.amount.toLocaleString("en-US")}</b><small>{l.reference ?? l.description}</small></div></div>
                <span className="cp-rx-arrow"><ArrowRight /></span>
                <div className="cp-rx-r"><span className="muted small">Invoice matching arrives with customer receipts</span></div>
                <Button size="sm" disabled>Match</Button>
              </div>
            )) : <p className="muted small cp-pad">{stmt ? "No Raast or IBFT credits in this statement." : "Import a statement to find Raast and IBFT credits."} Matching them to open invoices arrives with customer receipts (Phase 24).</p>}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Rules</h3><p>{all.length} rules · checked in priority order</p></div>{can.create && <button type="button" className="btn ghost sm" onClick={() => setEdit("new")}><Plus />New</button>}</div>
            <div className="cp-brs">
              {!rules && <Skeleton style={{ height: 120 }} />}
              {rules && !all.length && <EmptyState icon={<WandSparkles />} title="No rules yet" description="A rule says: IF the line looks like this, THEN categorise it to that account." />}
              {all.map((r, i) => (
                <div key={r.id} className={cn("cp-br", !r.isEnabled && "off")} style={{ ["--i" as string]: i }}>
                  <div className="cp-br-h">
                    <IconWell><WandSparkles /></IconWell>
                    <div><b>{r.name}</b><small>{r.code} · {r.hitCount} hits{r.bankAccount ? ` · ${r.bankAccount.name}` : " · all bank accounts"}</small></div>
                    <span className="spacer" />
                    <label className="switch" title="Active"><input type="checkbox" checked={r.isEnabled} disabled={!can.edit} onChange={() => toggle(r)} aria-label={`${r.name} active`} /><i /></label>
                    <button type="button" className="icon-btn-sm" title="Edit rule" aria-label={`Edit ${r.name}`} onClick={() => setEdit(r)}><Pencil /></button>
                  </div>
                  <div className="cp-br-flow"><span className="cp-br-if">IF</span><span>{r.conditions.map((c, j) => <span key={j}>{j > 0 && <em> {r.matchMode === "ANY" ? "or" : "and"} </em>}{condTxt(c)}</span>)}</span></div>
                  <div className="cp-br-flow"><span className="cp-br-then">THEN</span><span>Categorise to <b>{r.account.name} {r.account.code}</b>{r.costCentre && <> · cost centre <b>{r.costCentre.name}</b></>}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <StatementImportModal
        open={importing}
        options={options}
        bankAccountId={bankId || null}
        onClose={() => setImporting(false)}
        onImported={(r) => {
          toast(`${r.imported} statement lines imported · ${r.import.matchedCount} matched to vouchers${r.duplicates ? ` · ${r.duplicates} duplicates skipped` : ""}`, { tone: "good" });
          setCurrent(r.import.id);
          reloadStmt();
        }}
      />
      <CategoriseModal
        target={categorising ? { description: categorising.description, amount: categorising.amount, category: null, accountId: categorising.categoryAccount?.id ?? null } : null}
        options={options}
        onClose={() => setCategorising(null)}
        onSave={(body) => doCategorise(categorising!, body)}
      />
      <RuleBuilder edit={edit} accounts={accounts} banks={banks} centres={centres} lookups={lookups} can={can} sample={parseLines(sample)}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} onDelete={(r) => setRemoving(r)} />
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete “${removing?.name ?? ""}”?`} confirmLabel="Delete rule" danger onConfirm={async () => {
        if (!removing) return;
        try {
          await deleteBankRule(removing.id, removing.rowVersion);
          toast("Rule deleted", { tone: "good" });
          setEdit(null);
          reload();
        } catch (e) {
          toast(apiMessage(e, "Could not delete"), { tone: "danger" });
        } finally {
          setRemoving(null);
        }
      }}>
        Lines already categorised keep their account. A rule that has categorised lines is disabled instead.
      </ConfirmDialog>
    </>
  );
}

function RuleBuilder({ edit, accounts, banks, centres, lookups, can, sample, onClose, onSaved, onDelete }: {
  edit: BankRule | "new" | null; accounts: ReturnType<typeof usePostableAccounts>; banks: BankAccount[]; centres: CostCentre[]; lookups: ReturnType<typeof useLookups>;
  can: Can; sample: SampleLine[]; onClose: () => void; onSaved: () => void; onDelete: (r: BankRule) => void;
}) {
  const toast = useToast();
  const row = edit && edit !== "new" ? edit : null;
  const [d, setD] = useState<Draft | null>(null);
  const [prev, setPrev] = useState(edit);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  if (edit !== prev) {
    setPrev(edit);
    setErrs({});
    setHistory(false);
    setD(edit ? {
      name: row?.name ?? "", matchMode: (row?.matchMode as "ALL" | "ANY") ?? "ALL",
      conditions: row?.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })) ?? [{ field: "DESC", operator: "CONTAINS", value: "" }],
      accountId: row?.account.id ?? "", costCentreId: row?.costCentre?.id ?? "", bankAccountId: row?.bankAccount?.id ?? "", autoPost: row?.autoPost ?? true,
    } : null);
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => (x ? { ...x, [k]: v } : x));
  const setCond = (i: number, c: Partial<Cond>) => setD((x) => (x ? { ...x, conditions: x.conditions.map((y, j) => (j === i ? { ...y, ...c } : y)) } : x));
  const matches = useMemo(() => {
    const valid = d?.conditions.filter((c) => c.value.trim()) ?? [];
    return d && valid.length ? sample.filter((l) => ruleMatches({ matchMode: d.matchMode, conditions: valid }, l)) : [];
  }, [d, sample]);

  const save = async () => {
    if (!d) return;
    setBusy(true);
    setErrs({});
    const body = { name: d.name, matchMode: d.matchMode, conditions: d.conditions.filter((c) => c.value.trim()), accountId: d.accountId, costCentreId: d.costCentreId || null, bankAccountId: d.bankAccountId || null, autoPost: d.autoPost, isEnabled: row?.isEnabled ?? true };
    try {
      const r = row ? await updateBankRule(row.id, { ...body, rowVersion: row.rowVersion }) : await createBankRule(body);
      toast(`Rule “${r.name}” saved`, { tone: "good" });
      onSaved();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the rule"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={!!edit} onClose={onClose} wide className="cp-rb" title={row ? "Edit bank rule" : "New bank rule"} subtitle="Conditions on the statement line, then what to do with it" foot={
      <>
        {row && (
          <span className="row" style={{ marginRight: "auto", gap: 6 }}>
            {can.remove && <button type="button" className="btn danger" onClick={() => onDelete(row)}><Trash2 />Delete</button>}
            <button type="button" className="btn ghost" onClick={() => setHistory((h) => !h)}>{history ? "Rule" : "History"}</button>
          </span>
        )}
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        {(row ? can.edit : can.create) && !history && <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save rule"}</button>}
      </>
    }>
      {row && history ? <HistoryTab schema="BankCash" table="BankRules" id={row.id} /> : d && (
        <>
          <FormGrid cols={1}>
            <Field label="Rule name" required error={errs.name}><input value={d.name} autoFocus placeholder="e.g. TCS courier charges" onChange={(e) => set("name", e.target.value)} /></Field>
          </FormGrid>
          <div className="cp-rb-sec">
            <div className="row">
              <h4>Conditions</h4><span className="spacer" />
              <div className="seg">
                <button type="button" className={cn(d.matchMode === "ALL" && "active")} onClick={() => set("matchMode", "ALL")}>Match all</button>
                <button type="button" className={cn(d.matchMode === "ANY" && "active")} onClick={() => set("matchMode", "ANY")}>Match any</button>
              </div>
            </div>
            <div>
              {d.conditions.map((c, i) => (
                <div key={i} className="cp-cond">
                  <span className="cp-cond-w">{i ? (d.matchMode === "ANY" ? "OR" : "AND") : "IF"}</span>
                  <select value={c.field} onChange={(e) => setCond(i, { field: e.target.value, operator: RULE_OPERATORS[e.target.value]![0]! })} aria-label="Field">
                    {FIELDS.map((f) => <option key={f} value={f}>{labelOf(lookups, "BankRuleConditionField", f)}</option>)}
                  </select>
                  <select value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value })} aria-label="Operator">
                    {RULE_OPERATORS[c.field]!.map((o) => <option key={o} value={o}>{labelOf(lookups, "BankRuleConditionOperator", o)}</option>)}
                  </select>
                  <input value={c.value} placeholder={PLACEHOLDER[c.field]} onChange={(e) => setCond(i, { value: e.target.value })} aria-label="Value" />
                  <button type="button" className="icon-btn-sm" title="Remove" disabled={d.conditions.length === 1} onClick={() => set("conditions", d.conditions.filter((_, j) => j !== i))}><X /></button>
                </div>
              ))}
            </div>
            {errs.conditions && <small className="hint text-danger" role="alert">{errs.conditions}</small>}
            <button type="button" className="btn ghost sm" onClick={() => set("conditions", [...d.conditions, { field: "DESC", operator: "CONTAINS", value: "" }])}><Plus />Add condition</button>
          </div>
          <div className="cp-rb-sec">
            <h4>Then</h4>
            <FormGrid>
              <Field label="Categorise to account" required error={errs.accountId}>
                <select value={d.accountId} onChange={(e) => set("accountId", e.target.value)}><AccountOptions accounts={accounts} current={row?.account} /></select>
              </Field>
              <Field label="Cost centre" error={errs.costCentreId}>
                <select value={d.costCentreId} onChange={(e) => set("costCentreId", e.target.value)}>
                  <option value="">(none)</option>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </select>
              </Field>
              <Field label="Bank account" error={errs.bankAccountId} hint="Leave on all to apply to every statement">
                <select value={d.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}>
                  <option value="">All bank accounts</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.bank.shortName ?? b.bank.name} •••• {b.accountLast4}</option>)}
                </select>
              </Field>
              <Check label="Auto-post when matched (no review)" full checked={d.autoPost} onChange={(e) => set("autoPost", e.target.checked)} />
            </FormGrid>
          </div>
          <div className="cp-rb-live">
            <div className={cn("cp-rb-ctr", matches.length > 0 && "hit")}>
              <b>{matches.length}</b>
              <span>{sample.length ? <>Would match <b>{matches.length}</b> of the {sample.length} sample line{sample.length === 1 ? "" : "s"}</> : "Paste sample lines on the page to preview matches"}</span>
            </div>
            {matches.slice(0, 5).map((l, i) => (
              <div key={i} className="cp-rb-m"><CornerDownRight /><span>{l.description}</span><b className={l.amount < 0 ? "cr" : "dr"}>{fmt(l.amount)}</b></div>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}
