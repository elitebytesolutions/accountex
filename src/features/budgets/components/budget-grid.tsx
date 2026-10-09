"use client";

import { CircleCheck, FilePlus2, Info, Percent, Save, Send, Trash2, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { BudgetDetail, BudgetOptions } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Banner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { approveBudgetVersion, saveBudgetLines, submitBudgetVersion } from "../api";

type Can = { create: boolean; edit: boolean; approve: boolean; delete: boolean };
type Acct = BudgetOptions["accounts"][number];
type Row = { key: string; accountId: string; costCentreId: string; months: string[] };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Parses a cell ("12,500" → 12500); blank is 0, garbage is NaN. */
export const parseAmount = (s: string) => {
  const t = s.replace(/,/g, "").trim();
  return t === "" ? 0 : Number(t);
};
export const fmtAmount = (n: number, dec = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, 2) }) : "—");
export const STATUS: Record<string, [string, "neutral" | "warn" | "good" | "info"]> = {
  DRAFT: ["Draft", "neutral"], IN_REVIEW: ["In review", "warn"], APPROVED: ["Approved", "good"], SUPERSEDED: ["Superseded", "info"],
};
/** Month labels from the fiscal year's first month ("Jul" … "Jun"). */
export const fiscalMonths = (startDate: string) => {
  const m0 = Number(startDate.slice(5, 7)) - 1;
  return Array.from({ length: 12 }, (_, i) => MON[(m0 + i) % 12]!);
};
let seq = 0;
const newKey = () => `r${++seq}`;

/** Template app/budgets "Budget editor" panel: account × month grid of one budget version. */
export function BudgetGrid({ detail, opts, can, onSaved, onVersion, onNewVersion, onDirty, busyOuter }: {
  detail: BudgetDetail;
  opts: BudgetOptions;
  can: Can;
  onSaved: (d: BudgetDetail) => void;
  onVersion: (versionId: string) => void;
  onNewVersion: () => void;
  onDirty: (dirty: boolean) => void;
  busyOuter: boolean;
}) {
  const toast = useToast();
  const version = detail.version;
  const editable = !!version && version.status === "DRAFT" && can.edit;
  const months = fiscalMonths(detail.fiscalYear.startDate);
  const [rows, setRows] = useState<Row[]>(() => (version?.lines ?? []).map((l) => ({
    key: newKey(), accountId: l.account.id, costCentreId: l.costCentre?.id ?? "", months: l.months.map((m) => fmtAmount(m)),
  })));
  const [dirty, setDirtyState] = useState(false);
  const [view, setView] = useState<"m" | "q">("m");
  const [focus, setFocus] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const setDirty = (d: boolean) => { setDirtyState(d); onDirty(d); };

  /** Account lookup: active postable accounts plus anything already on the version. */
  const accounts = useMemo(() => {
    const m = new Map<string, Acct>(opts.accounts.map((a) => [a.id, a]));
    for (const l of version?.lines ?? []) if (!m.has(l.account.id)) m.set(l.account.id, l.account);
    return m;
  }, [opts.accounts, version]);
  const ccName = (id: string) => opts.costCentres.find((c) => c.id === id)?.name ?? version?.lines.find((l) => l.costCentre?.id === id)?.costCentre?.name ?? "";
  const pickable = useMemo(() => {
    const rank = (c: number) => (c === 4 ? 0 : c === 5 ? 1 : c === 6 ? 2 : 3);
    return [...opts.accounts].sort((a, b) => rank(a.accountClass) - rank(b.accountClass) || a.code.localeCompare(b.code));
  }, [opts.accounts]);

  const vals = (r: Row) => r.months.map(parseAmount);
  const total = (r: Row) => r2(vals(r).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0));
  const isRev = (r: Row) => accounts.get(r.accountId)?.accountClass === 4;
  const revenue = rows.filter(isRev), costs = rows.filter((r) => !isRev(r));
  const colSum = (rs: Row[], i: number) => r2(rs.reduce((s, r) => s + (Number.isFinite(parseAmount(r.months[i]!)) ? parseAmount(r.months[i]!) : 0), 0));
  const result = Array.from({ length: 12 }, (_, i) => r2(colSum(revenue, i) - colSum(costs, i)));

  const edit = (key: string, fn: (r: Row) => Row) => { setRows((rs) => rs.map((r) => (r.key === key ? fn(r) : r))); setDirty(true); };
  const setCell = (key: string, i: number, v: string) => edit(key, (r) => ({ ...r, months: r.months.map((m, j) => (j === i ? v : m)) }));
  const tidy = (key: string, i: number) => setRows((rs) => rs.map((r) => {
    if (r.key !== key) return r;
    const n = parseAmount(r.months[i]!);
    return Number.isFinite(n) ? { ...r, months: r.months.map((m, j) => (j === i ? fmtAmount(n) : m)) } : r;
  }));

  const spread = () => {
    const r = rows.find((x) => x.key === focus);
    if (!r) return toast("Click a row first, then spread its FY total", { tone: "info" });
    const t = total(r), each = r2(t / 12);
    edit(r.key, (x) => ({ ...x, months: Array.from({ length: 12 }, (_, i) => fmtAmount(i < 11 ? each : r2(t - each * 11))) }));
    toast(`${accounts.get(r.accountId)?.name ?? "Line"}: ${fmtAmount(t)} spread evenly across 12 months`, { tone: "good" });
  };
  const uplift = () => {
    const raw = window.prompt("Uplift % to apply to every cell (use a negative number to reduce)", "5");
    if (raw === null) return;
    const p = Number(raw.replace("%", "").trim());
    if (!Number.isFinite(p) || p < -100 || p > 1000) return toast("Enter a percentage between -100 and 1000", { tone: "danger" });
    setRows((rs) => rs.map((r) => ({ ...r, months: r.months.map((m) => { const n = parseAmount(m); return Number.isFinite(n) ? fmtAmount(r2(n * (1 + p / 100))) : m; }) })));
    setDirty(true);
    toast(`${p}% uplift applied to all lines`, { tone: "good" });
  };
  const addRow = (accountId: string) => {
    if (!accountId) return;
    const k = newKey();
    setRows((rs) => [...rs, { key: k, accountId, costCentreId: "", months: Array(12).fill("") }]);
    setFocus(k);
    setDirty(true);
  };
  const removeRow = (key: string) => { setRows((rs) => rs.filter((r) => r.key !== key)); setDirty(true); };

  const save = async () => {
    if (!version) return;
    const local: Record<string, string> = {};
    rows.forEach((r) => r.months.forEach((m, i) => { if (!Number.isFinite(parseAmount(m))) local[`${r.key}.${i}`] = "Enter a number"; }));
    if (Object.keys(local).length) { setErrors(local); return toast("Some cells are not numbers — fix the highlighted cells", { tone: "danger" }); }
    setBusy(true);
    setErrors({});
    try {
      const d = await saveBudgetLines(version.id, version.rowVersion, rows.map((r) => ({ accountId: r.accountId, costCentreId: r.costCentreId || null, months: vals(r) })));
      toast(`Saved v${version.versionNo} (draft)`, { tone: "good" });
      setDirty(false);
      onSaved(d);
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        const next: Record<string, string> = {};
        for (const [k, msgs] of Object.entries(e.details)) {
          const m = /^lines\.(\d+)\.(\w+)/.exec(k);
          const row = m ? rows[Number(m[1])] : undefined;
          if (row) next[`${row.key}.${m![2]}`] = msgs[0] ?? "Invalid";
        }
        setErrors(next);
      }
      toast(e instanceof ApiError ? e.message : "Could not save the budget", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const act = async (label: string, fn: () => Promise<BudgetDetail>) => {
    setBusy(true);
    try {
      const d = await fn();
      toast(label, { tone: "good" });
      onSaved(d);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.code === "APPROVAL_SELF" ? "You prepared this version — someone else has to approve it." : e.message) : "Could not update the budget";
      toast(msg, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const quarters = (r: Row) => [0, 1, 2, 3].map((q) => r2(vals(r).slice(q * 3, q * 3 + 3).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)));
  const cols = view === "m" ? months : ["Q1", "Q2", "Q3", "Q4"];
  const span = cols.length + 2 + (editable ? 1 : 0);
  const openVersion = detail.versions.some((v) => v.status === "DRAFT" || v.status === "IN_REVIEW");
  const disabled = busy || busyOuter;

  const line = (r: Row) => {
    const a = accounts.get(r.accountId);
    const err = errors[`${r.key}.accountId`] ?? errors[`${r.key}.costCentreId`];
    return (
      <tr key={r.key} className={cn(focus === r.key && "bud-focus")} onFocus={() => setFocus(r.key)} onClick={() => setFocus(r.key)}>
        <td className="bud-acc">
          <div>{a ? `${a.code} ${a.name}` : "Unknown account"}</div>
          {editable ? (
            <select className="bud-cc" value={r.costCentreId} aria-label="Cost centre" onChange={(e) => edit(r.key, (x) => ({ ...x, costCentreId: e.target.value }))}>
              <option value="">No cost centre</option>
              {opts.costCentres.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          ) : r.costCentreId ? <small className="muted">{ccName(r.costCentreId)}</small> : null}
          {err && <small className="text-danger" role="alert">{err}</small>}
        </td>
        {view === "m"
          ? r.months.map((m, i) => (
            <td key={i}>
              <input className={cn("cell-input num", errors[`${r.key}.${i}`] && "bud-bad")} value={m} readOnly={!editable} inputMode="decimal" aria-label={`${a?.name ?? "Line"} ${months[i]}`}
                aria-invalid={!!errors[`${r.key}.${i}`]} onChange={(e) => setCell(r.key, i, e.target.value)} onBlur={() => tidy(r.key, i)} />
            </td>
          ))
          : quarters(r).map((q, i) => <td key={i} className="num">{fmtAmount(q)}</td>)}
        <td className="num"><b>{fmtAmount(total(r))}</b></td>
        {editable && <td className="actions"><button type="button" className="icon-btn-sm" aria-label="Remove line" onClick={(e) => { e.stopPropagation(); removeRow(r.key); }}><Trash2 /></button></td>}
      </tr>
    );
  };

  const history = detail.versions.map((v) => {
    if (v.status === "APPROVED" || v.status === "SUPERSEDED") return v.approvedBy ? `v${v.versionNo} approved by ${v.approvedBy.name} on ${dateLabel(v.approvedAt)}` : `v${v.versionNo} approved ${dateLabel(v.approvedAt)}`;
    return `v${v.versionNo} ${v.status === "IN_REVIEW" ? "in review" : "draft"} (created ${dateLabel(v.createdAt)}${v.createdBy ? ` by ${v.createdBy.name}` : ""})`;
  });

  return (
    <div className="panel mt">
      <div className="panel-head">
        <div>
          <h3>Budget editor — {detail.name}{version ? ` (v${version.versionNo})` : ""}</h3>
          <p>Amounts in Rs · {editable ? "edit cells and save" : version?.status === "DRAFT" ? "read only — you can't edit budgets" : "read only — create a new version to change it"}</p>
        </div>
        <div className="panel-actions">
          <div className="seg"><button type="button" className={cn(view === "m" && "active")} onClick={() => setView("m")}>Monthly</button><button type="button" className={cn(view === "q" && "active")} onClick={() => setView("q")}>Quarterly</button></div>
          {editable && view === "m" && <Button variant="ghost" size="sm" icon={<WandSparkles />} onClick={spread}>Spread evenly</Button>}
          {editable && view === "m" && <Button variant="ghost" size="sm" icon={<Percent />} onClick={uplift} disabled={!rows.length}>Apply % uplift</Button>}
          {detail.versions.length > 1 && (
            <select aria-label="Version" value={version?.id ?? ""} onChange={(e) => {
              if (dirty && !window.confirm("Discard unsaved changes?")) return;
              onVersion(e.target.value);
            }}>
              {detail.versions.map((v) => <option key={v.id} value={v.id}>v{v.versionNo} · {STATUS[v.status]?.[0] ?? v.status}</option>)}
            </select>
          )}
          {version && detail.versions.length <= 1 && <Badge tone={STATUS[version.status]?.[1] ?? "neutral"} dot>{STATUS[version.status]?.[0] ?? version.status}</Badge>}
          {editable && <Button variant="primary" size="sm" icon={<Save />} onClick={save} disabled={disabled || !dirty}>{busy ? "Saving…" : `Save v${version!.versionNo}`}</Button>}
          {editable && <Button size="sm" icon={<Send />} disabled={disabled || dirty || !rows.length} title={dirty ? "Save your changes first" : undefined}
            onClick={() => act(`v${version!.versionNo} submitted for review`, () => submitBudgetVersion(version!.id))}>Submit for review</Button>}
          {version?.status === "IN_REVIEW" && can.approve && <Button variant="primary" size="sm" icon={<CircleCheck />} disabled={disabled}
            onClick={() => act(`v${version.versionNo} approved`, () => approveBudgetVersion(version.id))}>Approve</Button>}
          {version?.status === "APPROVED" && can.create && !openVersion && <Button size="sm" icon={<FilePlus2 />} disabled={disabled} onClick={onNewVersion}>New version</Button>}
        </div>
      </div>
      {!version ? (
        <Banner tone="info" title="This budget has no version yet" />
      ) : (
        <div className="table-wrap"><table className="tbl lines bud-grid">
          <thead><tr><th>Account</th>{cols.map((c) => <th key={c} className="num">{c}</th>)}<th className="num">FY Total</th>{editable && <th />}</tr></thead>
          <tbody>
            <tr className="sec"><td colSpan={span}><b>Revenue</b></td></tr>
            {revenue.map(line)}
            {!revenue.length && <tr><td colSpan={span} className="muted small">No revenue lines</td></tr>}
            <tr className="sec"><td colSpan={span}><b>Costs &amp; expenses</b></td></tr>
            {costs.map(line)}
            {!costs.length && <tr><td colSpan={span} className="muted small">No cost lines</td></tr>}
            {editable && (
              <tr className="bud-add">
                <td colSpan={span}>
                  <select value="" aria-label="Add account" onChange={(e) => addRow(e.target.value)}>
                    <option value="">+ Add account…</option>
                    {pickable.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </td>
              </tr>
            )}
            <tr className="total">
              <td>Operating result</td>
              {(view === "m" ? result : [0, 1, 2, 3].map((q) => r2(result.slice(q * 3, q * 3 + 3).reduce((s, v) => s + v, 0)))).map((v, i) => <td key={i} className={cn("num", v < 0 && "neg")}>{fmtAmount(v)}</td>)}
              <td className="num">{fmtAmount(r2(result.reduce((s, v) => s + v, 0)))}</td>
              {editable && <td />}
            </tr>
          </tbody>
        </table></div>
      )}
      <div className="row mt small muted"><Info /><span>{dirty ? "Unsaved changes. " : ""}Version history: {history.join(", ")}.{detail.requiresCeoApproval ? " Requires CEO approval before activation." : ""}</span></div>
    </div>
  );
}
