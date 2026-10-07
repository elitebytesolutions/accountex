"use client";

import { CornerDownRight, ListChecks, Pencil, Plus, Split, Trash2, WandSparkles, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RULE_OPERATORS, ruleMatches, type BankAccount, type BankRule, type CostCentre, type SampleLine } from "@/shared";
import { Button } from "@/components/ui/button";
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

/** Template app/bank/rules (4A-company-plus.html + 9A-company-plus.js §9): rule cards and the rule builder; statement import is Phase 17. */
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
        description="Let rules categorise the routine statement lines. Statement import and Raast / IBFT matching arrive with Banking (Phase 17)."
        actions={can.create && <Button variant="primary" icon={<Plus />} onClick={() => setEdit("new")}>New rule</Button>}
      />
      <div className="kpi-grid">
        <div className="kpi violet"><div className="kpi-top"><span>Active rules</span><span className="icon-well"><ListChecks /></span></div><strong>{active.length}</strong><small>{all.length - active.length} disabled</small></div>
        <div className="kpi"><div className="kpi-top"><span>Rule hits</span><span className="icon-well"><WandSparkles /></span></div><strong>{all.reduce((s, r) => s + r.hitCount, 0)}</strong><small>Counted once statements are imported</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>With a cost centre</span><span className="icon-well"><Split /></span></div><strong>{all.filter((r) => r.costCentre).length}</strong><small>Split to departments automatically</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Auto-post</span><span className="icon-well"><Zap /></span></div><strong>{all.filter((r) => r.autoPost).length}</strong><small>Post without review when matched</small></div>
      </div>

      <div className="split cp-br-split">
        <div className="stack">
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
