"use client";

import "./variance-screen.css";
import { ChartColumn, Download, Gauge, Pencil, Printer, Receipt, Scale, Target, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Budget, BudgetVariance } from "@/shared";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { downloadCsv, isoDay } from "@/features/finance/components/finance-ui";
import { budgetOptions, budgetVariance, listBudgets } from "../api";

type Period = { key: string; label: string; short: string; from: number; to: number };
type Seg = "rev" | "cost" | "res";
type Err = { message: string; reference?: string };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const errOf = (e: unknown, fallback: string): Err => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback });
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (v: number) => `Rs ${n0(v)}`;
const mil = (v: number) => `${(v / 1_000_000).toFixed(2)}M`;
/** Compact amount for KPI notes: "Rs 97.0M" from a million up. */
const rsShort = (v: number) => (Math.abs(v) >= 1_000_000 ? `Rs ${(v / 1_000_000).toFixed(1)}M` : rs(v));
const pct = (a: number, b: number) => (b ? (a / Math.abs(b)) * 100 : 0);

/** Fiscal month (1–12) of `iso` within a fiscal year starting `start`; clamps to 1..12. */
const fiscalMonthOf = (start: string, iso: string) => {
  const d = (Number(iso.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + (Number(iso.slice(5, 7)) - Number(start.slice(5, 7)));
  return Math.min(12, Math.max(1, d + 1));
};
/** Quarter / YTD / full-year / single-month presets for a fiscal year. */
function periodsFor(start: string, end: string): Period[] {
  const y0 = Number(start.slice(0, 4)), m0 = Number(start.slice(5, 7)) - 1;
  const lab = (n: number) => { const t = m0 + n - 1; return { m: MON[t % 12]!, y: y0 + Math.floor(t / 12) }; };
  const range = (a: number, b: number) => { const x = lab(a), z = lab(b); return x.y === z.y ? `${x.m}–${z.m} ${z.y}` : `${x.m} ${x.y}–${z.m} ${z.y}`; };
  const today = isoDay(new Date());
  const cur = today < start ? 0 : today > end ? 12 : fiscalMonthOf(start, today);
  const out: Period[] = [1, 2, 3, 4].map((q) => ({ key: `q${q}`, label: `Q${q} · ${range(q * 3 - 2, q * 3)}`, short: `Q${q} (${range(q * 3 - 2, q * 3)})`, from: q * 3 - 2, to: q * 3 }));
  if (cur > 0) out.push({ key: "ytd", label: `YTD · ${range(1, cur)}`, short: `YTD (${range(1, cur)})`, from: 1, to: cur });
  out.push({ key: "fy", label: "Full year", short: `full year (${range(1, 12)})`, from: 1, to: 12 });
  for (let n = 1; n <= 12; n++) { const x = lab(n); out.push({ key: `m${n}`, label: `${x.m} ${x.y}`, short: `${x.m} ${x.y}`, from: n, to: n }); }
  return out;
}
const defaultPeriod = (start: string, end: string) => {
  const today = isoDay(new Date());
  if (today < start || today > end) return "fy";
  return `q${Math.ceil(fiscalMonthOf(start, today) / 3)}`;
};

/** Template cellHTML: "—" for zero, red parentheses for adverse. */
function VarCell({ v, dec = 2 }: { v: number; dec?: number }) {
  if (!v) return <td className="num zero">—</td>;
  const f = dec ? n2(Math.abs(v)) : n0(Math.abs(v));
  return v < 0 ? <td className="num neg">({f})</td> : <td className="num">{f}</td>;
}
const PctCell = ({ v }: { v: number | null }) => (v === null ? <td className="num zero">—</td> : <td className={cn("num", v < 0 && "neg")}>{v.toFixed(1)}%</td>);

/** Budgeting › Budget vs Actual (template app/budgets/variance, 42-acc-reports.html). */
export function VarianceScreen() {
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [error, setError] = useState<Err | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [budgetId, setBudgetId] = useState("");
  const [periodKey, setPeriodKey] = useState("");
  const [dept, setDept] = useState<string | null>(null);
  const [seg, setSeg] = useState<Seg>("rev");
  const [data, setData] = useState<{ key: string; period: BudgetVariance; year: BudgetVariance } | null>(null);
  const [dataErr, setDataErr] = useState<Err | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([budgetOptions(), listBudgets({ pageSize: 200 })])
      .then(([o, l]) => {
        if (cancelled) return;
        setBudgets(l.items);
        setError(null);
        const today = isoDay(new Date());
        const fy = o.fiscalYears.find((y) => y.startDate <= today && y.endDate >= today);
        const inFy = l.items.filter((b) => !fy || b.fiscalYear.id === fy.id);
        const pick = inFy.find((b) => b.status === "APPROVED" && b.budgetType === "OPERATING") ?? inFy.find((b) => b.status === "APPROVED")
          ?? l.items.find((b) => b.status === "APPROVED") ?? inFy[0] ?? l.items[0];
        setBudgetId((id) => id || pick?.id || "");
      })
      .catch((e: unknown) => !cancelled && setError(errOf(e, "Could not load budgets")));
    return () => { cancelled = true; };
  }, [attempt]);

  const budget = budgets?.find((b) => b.id === budgetId);
  const periods = useMemo(() => (budget ? periodsFor(budget.fiscalYear.startDate, budget.fiscalYear.endDate) : []), [budget]);
  const period = periods.find((p) => p.key === periodKey) ?? periods.find((p) => budget && p.key === defaultPeriod(budget.fiscalYear.startDate, budget.fiscalYear.endDate));
  const reqKey = budget && period ? `${budget.id}:${period.from}-${period.to}:${attempt}` : "";

  useEffect(() => {
    if (!reqKey || !budget || !period) return;
    let cancelled = false;
    Promise.all([budgetVariance(budget.id, { from: period.from, to: period.to }), budgetVariance(budget.id, { from: 1, to: 12 })])
      .then(([p, y]) => { if (!cancelled) { setData({ key: reqKey, period: p, year: y }); setDataErr(null); } })
      .catch((e: unknown) => !cancelled && setDataErr(errOf(e, "Could not load budget vs actual")));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reqKey captures budget + period
  }, [reqKey]);

  const fyGroups = useMemo(() => {
    const m = new Map<string, Budget[]>();
    for (const b of budgets ?? []) m.set(b.fiscalYear.code, [...(m.get(b.fiscalYear.code) ?? []), b]);
    return [...m.entries()];
  }, [budgets]);

  const reload = () => setAttempt((n) => n + 1);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const v = data?.key === reqKey ? data.period : null;
  const year = data?.key === reqKey ? data.year : null;
  const t = v?.totals;
  const vNo = v?.version?.versionNo ?? budget?.currentVersion?.versionNo;
  const ccKey = (c: BudgetVariance["costCentres"][number]) => c.costCentre?.id ?? "_none";
  const ccName = (c: BudgetVariance["costCentres"][number]) => c.costCentre?.name ?? "Unassigned";
  const deptRow = v && dept ? v.costCentres.find((c) => ccKey(c) === dept) : undefined;
  const rev = v?.accounts.filter((a) => a.kind === "REVENUE") ?? [];
  const cost = v?.accounts.filter((a) => a.kind === "COST") ?? [];
  const over = cost.filter((a) => a.variance < 0).concat(rev.filter((a) => a.variance < 0));
  const worst = cost.filter((a) => a.variance < 0).sort((a, b) => (a.variancePct ?? -Infinity) - (b.variancePct ?? -Infinity))[0];

  const exportCsv = () => {
    if (!v || !t) return;
    const row = (a: BudgetVariance["accounts"][number]) => [`${a.account.code} ${a.account.name}`, a.budget, a.actual, a.variance, a.variancePct, a.utilisationPct];
    downloadCsv(`budget-vs-actual-${v.budget.code}-${period?.key ?? ""}.csv`, [
      ["Account", "Budget", "Actual", "Variance", "Variance %", "Utilisation %"],
      ["Revenue"], ...rev.map(row),
      ["Total revenue", t.budgetRevenue, t.actualRevenue, t.actualRevenue - t.budgetRevenue, null, null],
      ["Costs"], ...cost.map(row),
      ["Total costs", t.budgetCost, t.actualCost, t.budgetCost - t.actualCost, null, null],
      ["Operating result", t.budgetResult, t.actualResult, t.actualResult - t.budgetResult, null, null],
    ]);
  };

  /* chart */
  const series = (year?.months ?? []).map((m) => {
    const b = seg === "rev" ? m.budgetRevenue : seg === "cost" ? m.budgetCost : m.budgetRevenue - m.budgetCost;
    const a = seg === "rev" ? m.actualRevenue : seg === "cost" ? m.actualCost : m.actualRevenue - m.actualCost;
    return { ...m, b, a, short: m.label.split(" ")[0]! };
  });
  const max = Math.max(1, ...series.flatMap((s) => [s.b, s.a]));
  const h = (x: number) => `${Math.max(0, (x / max) * 100).toFixed(1)}%`;
  const inPeriod = (n: number) => !!period && n >= period.from && n <= period.to;
  const segTitle = seg === "rev" ? "Revenue" : seg === "cost" ? "Costs" : "Operating result";

  const revDiff = t ? t.actualRevenue - t.budgetRevenue : 0;
  const costDiff = t ? t.actualCost - t.budgetCost : 0;
  const resDiff = t ? t.actualResult - t.budgetResult : 0;

  return (
    <>
      <PageHead
        eyebrow="Budgeting / Variance"
        title="Budget vs Actual"
        description={budget ? `${budget.name}${vNo ? ` (v${vNo})` : ""} compared with posted actuals · ${period?.short ?? ""}` : "Budgets compared with posted actuals"}
        actions={
          <>
            <Button icon={<Printer />} onClick={() => window.print()}>Print</Button>
            <Button icon={<Download />} onClick={exportCsv} disabled={!v}>Export</Button>
            <ButtonLink variant="primary" href="/budgets" icon={<Pencil />}>Edit budget</ButtonLink>
          </>
        }
      />

      {budgets && !budgets.length ? (
        <div className="panel"><EmptyState icon={<ChartColumn />} title="No budgets yet" description="Create and approve a budget to compare it with posted actuals."
          action={<ButtonLink variant="primary" href="/budgets">Go to Budgets</ButtonLink>} /></div>
      ) : (
        <>
          <div className="toolbar">
            <select aria-label="Budget" value={budgetId} disabled={!budgets} onChange={(e) => { setBudgetId(e.target.value); setPeriodKey(""); setDept(null); }}>
              {!budgets && <option>Loading…</option>}
              {fyGroups.map(([fy, bs]) => (
                <optgroup key={fy} label={fy}>
                  {bs.map((b) => <option key={b.id} value={b.id}>{b.name} (v{b.currentVersion?.versionNo ?? 0}){b.status !== "APPROVED" ? " · draft" : ""}</option>)}
                </optgroup>
              ))}
            </select>
            <select aria-label="Period" value={period?.key ?? ""} disabled={!period} onChange={(e) => setPeriodKey(e.target.value)}>
              {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            {v && v.costCentres.length > 0 && (
              <div className="chips">
                <button type="button" className={cn(!dept && "active")} onClick={() => setDept(null)}>All departments</button>
                {v.costCentres.map((c) => <button key={ccKey(c)} type="button" className={cn(dept === ccKey(c) && "active")} onClick={() => setDept(ccKey(c))}>{ccName(c)}</button>)}
              </div>
            )}
          </div>

          {dataErr && <ErrorState message={dataErr.message} reference={dataErr.reference} onRetry={reload} />}

          {!deptRow ? (
            <div className="kpi-grid">
              <div className="kpi"><div className="kpi-top"><span>Revenue — actual</span><span className="icon-well"><TrendingUp /></span></div><strong>{t ? rs(t.actualRevenue) : "…"}</strong>
                {t && <small className={revDiff >= 0 ? "up" : "down"}>{revDiff >= 0 ? "▲" : "▼"} {Math.abs(pct(revDiff, t.budgetRevenue)).toFixed(1)}% {revDiff >= 0 ? "above" : "below"} budget ({rsShort(t.budgetRevenue)})</small>}</div>
              <div className={cn("kpi", t && costDiff > 0 ? "red" : "teal")}><div className="kpi-top"><span>Costs — actual</span><span className="icon-well"><Receipt /></span></div><strong>{t ? rs(t.actualCost) : "…"}</strong>
                {t && <small className={costDiff > 0 ? "down" : "up"}>{costDiff > 0 ? "▼" : "▲"} {Math.abs(pct(costDiff, t.budgetCost)).toFixed(1)}% {costDiff > 0 ? "over" : "under"} budget ({rsShort(t.budgetCost)})</small>}</div>
              <div className="kpi yellow"><div className="kpi-top"><span>Operating result</span><span className="icon-well"><Target /></span></div><strong>{t ? rs(t.actualResult) : "…"}</strong>
                {t && <small className={resDiff >= 0 ? "up" : "down"}>{resDiff >= 0 ? "▲" : "▼"} {rs(Math.abs(resDiff))} {resDiff >= 0 ? "above" : "below"} budget</small>}</div>
              <div className="kpi blue"><div className="kpi-top"><span>Lines over budget</span><span className="icon-well"><TriangleAlert /></span></div><strong>{t ? `${t.linesOver} of ${t.linesTotal}` : "…"}</strong>
                <small>{over.length ? over.slice(0, 3).map((a) => a.account.name).join(", ") + (over.length > 3 ? "…" : "") : t ? "All lines within budget" : ""}</small></div>
            </div>
          ) : (
            <DeptKpis name={ccName(deptRow)} actual={deptRow.actual} budget={deptRow.budget} period={period?.short ?? ""} vNo={vNo} />
          )}

          <div className="split mt">
            <div className="panel">
              <div className="panel-head">
                <div><h3>{segTitle} — budget vs actual</h3><p>Rs millions · {v?.budget.fiscalYear ?? budget?.fiscalYear.code ?? ""}</p></div>
                <div className="panel-actions"><div className="seg">
                  {(["rev", "cost", "res"] as Seg[]).map((s) => <button key={s} type="button" className={cn(seg === s && "active")} onClick={() => setSeg(s)}>{s === "rev" ? "Revenue" : s === "cost" ? "Costs" : "Result"}</button>)}
                </div></div>
              </div>
              {!year ? <Skeleton style={{ height: 200 }} /> : (
                <>
                  <div className="bars dual">
                    {series.map((s) => (
                      <div key={s.monthNo} className={cn("bar", !inPeriod(s.monthNo) && "bva-out")} style={{ opacity: dept ? 0.55 : undefined }} title={`${s.label}: budget ${mil(s.b)} / actual ${mil(s.a)}`}>
                        <i style={{ height: h(s.b) }} /><i className="b" style={{ height: h(s.a) }} /><span>{s.short}</span>
                      </div>
                    ))}
                  </div>
                  <div className="legend">
                    <span><i style={{ background: "var(--primary)" }} />Budget</span><span><i style={{ background: "var(--lime)" }} />Actual</span>
                    <span className="muted small">{series.filter((s) => inPeriod(s.monthNo) && (s.a || s.b)).slice(0, 3).map((s) => `${s.short} ${(s.b / 1e6).toFixed(1)} / ${(s.a / 1e6).toFixed(2)}`).join(" · ")}</span>
                  </div>
                </>
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><div><h3>By department</h3><p>{period?.short ?? ""} spend vs budget</p></div></div>
              {!v ? <Skeleton style={{ height: 200 }} /> : !v.costCentres.length ? (
                <EmptyState icon={<Wallet />} title="No department spend" description="Budget lines and postings tagged to cost centres appear here." />
              ) : (
                <div className="list">
                  {v.costCentres.map((c) => {
                    const k = ccKey(c), u = c.budget ? (c.actual / c.budget) * 100 : c.actual ? 100 : 0, d = pct(c.actual - c.budget, c.budget);
                    return (
                      <div key={k} className="list-item bva-dept" data-dept={k} style={{ opacity: dept && dept !== k ? 0.38 : undefined }} onClick={() => setDept(dept === k ? null : k)}>
                        <div style={{ flex: 1 }}>
                          <div className="row"><b>{ccName(c)}</b><span className="spacer" /><small>{mil(c.actual)} / {mil(c.budget)}</small></div>
                          <div className={cn("progress", c.actual > c.budget && "danger")}><i style={{ width: `${Math.min(100, u)}%` }} /></div>
                          {c.actual > c.budget ? <small className="neg">{c.budget ? `${d.toFixed(1)}% over` : "No budget"}</small> : <small className="muted">{Math.abs(d).toFixed(1)}% under</small>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="panel flush mt">
            <div className="panel-head"><div><h3>Variance by account — {period?.short ?? ""} {v?.budget.fiscalYear ?? ""}</h3><p>Favourable variance shown positive; adverse in red</p></div></div>
            {!v || !t ? <div style={{ padding: 20 }}><Skeleton style={{ height: 220 }} /></div> : !v.accounts.length ? (
              <EmptyState icon={<Scale />} title="Nothing to compare" description="This budget version has no lines and nothing was posted to its accounts in the period." />
            ) : (
              <div className="table-wrap"><table className="tbl stmt">
                <thead><tr><th>Account</th><th className="num">Budget</th><th className="num">Actual</th><th className="num">Variance</th><th className="num">Variance %</th><th>Utilisation</th></tr></thead>
                <tbody>
                  <tr className="sec"><td colSpan={6}>Revenue</td></tr>
                  {rev.map((a) => <AccRow key={a.account.id} a={a} />)}
                  <tr className="sub"><td>Total revenue</td><td className="num">{n2(t.budgetRevenue)}</td><td className="num">{n2(t.actualRevenue)}</td><VarCell v={revDiff} /><PctCell v={t.budgetRevenue ? pct(revDiff, t.budgetRevenue) : null} /><td /></tr>
                  <tr className="sec"><td colSpan={6}>Costs &amp; expenses</td></tr>
                  {cost.map((a) => <AccRow key={a.account.id} a={a} />)}
                  <tr className="sub"><td>Total costs</td><td className="num">{n2(t.budgetCost)}</td><td className="num">{n2(t.actualCost)}</td><VarCell v={-costDiff} /><PctCell v={t.budgetCost ? pct(-costDiff, t.budgetCost) : null} /><td /></tr>
                  <tr className="total"><td>Operating result (budgeted lines)</td><td className="num">{n2(t.budgetResult)}</td><td className="num">{n2(t.actualResult)}</td><VarCell v={resDiff} /><PctCell v={t.budgetResult ? pct(resDiff, t.budgetResult) : null} /><td /></tr>
                </tbody>
              </table></div>
            )}
          </div>

          {worst && (
            <div className="banner warn mt" role="status">
              <TriangleAlert />
              <div>
                <b>{worst.account.name} running {Math.abs(worst.variancePct ?? 0).toFixed(1)}% over budget</b>
                <p>Actual {rs(worst.actual)} against a budget of {rs(worst.budget)} for {period?.short ?? "the period"} — {rs(-worst.variance)} adverse. Review spend on {worst.account.code} {worst.account.name}.</p>
              </div>
              <ButtonLink size="sm" href="/accounting/ledger">Open ledger</ButtonLink>
            </div>
          )}
        </>
      )}
    </>
  );
}

function AccRow({ a }: { a: BudgetVariance["accounts"][number] }) {
  const u = a.utilisationPct;
  const adverse = a.variance < 0;
  const tone = a.kind === "COST" && adverse ? ((a.variancePct ?? -100) < -5 ? "danger" : "warn") : undefined;
  return (
    <tr>
      <td className="ind1">{a.account.code} {a.account.name}</td>
      <td className="num">{n2(a.budget)}</td>
      <td className="num">{n2(a.actual)}</td>
      <VarCell v={a.variance} />
      <PctCell v={a.variancePct} />
      <td>{u === null ? <span className="muted small">No budget</span> : <div className={cn("progress", tone)}><i style={{ width: `${Math.min(100, Math.max(0, u))}%` }} /></div>}</td>
    </tr>
  );
}

function DeptKpis({ name, actual, budget, period, vNo }: { name: string; actual: number; budget: number; period: string; vNo?: number }) {
  const v = budget - actual, u = budget ? (actual / budget) * 100 : 0;
  return (
    <div className="kpi-grid">
      <div className="kpi"><div className="kpi-top"><span>{name} — spend</span><span className="icon-well"><Wallet /></span></div><strong>{rs(actual)}</strong><small>Posted actuals · {period}</small></div>
      <div className="kpi blue"><div className="kpi-top"><span>Budget</span><span className="icon-well"><Target /></span></div><strong>{rs(budget)}</strong><small>{vNo ? `Budget v${vNo}` : "Budget"}</small></div>
      <div className="kpi yellow"><div className="kpi-top"><span>Variance</span><span className="icon-well"><Scale /></span></div><strong>{v < 0 ? "−" : "+"}{rs(Math.abs(v))}</strong>
        <small className={v < 0 ? "down" : "up"}>{budget ? `${v < 0 ? "▼" : "▲"} ${Math.abs((v / budget) * 100).toFixed(1)}% ${v < 0 ? "over" : "under"} budget` : "No budget"}</small></div>
      <div className="kpi teal"><div className="kpi-top"><span>Utilisation</span><span className="icon-well"><Gauge /></span></div><strong>{budget ? `${u.toFixed(1)}%` : "—"}</strong>
        <div className={cn("progress", actual > budget && "danger")}><i style={{ width: `${Math.min(100, u)}%` }} /></div></div>
    </div>
  );
}
