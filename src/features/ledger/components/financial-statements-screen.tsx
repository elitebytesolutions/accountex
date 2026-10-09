"use client";

import { Building2, CalendarDays, ChartColumn, CircleMinus, Coins, Columns2, Receipt, Search, TrendingUp, Wallet, Waves } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FinancialStatement, GlOptions, StatementRow } from "@/shared";
import { downloadCsv, isoDay } from "@/features/finance/components/finance-ui";
import { balanceSheet, cashFlow, profitAndLoss } from "@/features/finance/period-close-api";
import { voucherOptions } from "../api";
import { DateIn, dmy, Fld, NumCell, num, periodPresets, ReportStudio, RsStat, Sel, Toggle, useReport, type Sheet } from "./report-studio";

type Kind = "pnl" | "bs" | "cf";
type Filters = { period: string; from: string; to: string; asAt: string; branch: string; cmp: string; zero: boolean; q: string };
type Section = { label: string; rows: StatementRow[]; total: StatementRow | null };

const NAME: Record<Kind, string> = { pnl: "Income Statement", bs: "Statement of Financial Position", cf: "Statement of Cash Flows" };
const CMP: Record<Kind, [string, string][]> = {
  pnl: [["py", "Same period last year"], ["prev", "Previous period"], ["none", "None"]],
  bs: [["py", "Same date last year"], ["fy", "Previous year end"], ["none", "None"]],
  cf: [["none", "None"]],
};
const shiftYear = (d: string, n: number) => {
  const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return `${y + n}-${String(m).padStart(2, "0")}-${String(Math.min(dd, last)).padStart(2, "0")}`;
};
const addDays = (d: string, n: number) => isoDay(new Date(Date.parse(`${d}T00:00:00`) + n * 86_400_000));
const Rs = (v: number) => <RsStat value={v} />;

/** Splits the statement rows into sections (heading → lines → section total); grand totals stay in `grand`. */
function sectionsOf(rows: StatementRow[]) {
  const out: Section[] = [];
  const grand: StatementRow[] = [];
  let cur: Section | null = null;
  for (const r of rows) {
    if (r.kind === "s") out.push((cur = { label: r.label, rows: [], total: null }));
    else if (r.kind === "t" && cur) cur.total = r;
    else if (r.kind === "g" && (!cur || cur.rows.length || cur.total)) grand.push(r);
    else cur?.rows.push(r);
  }
  return { sections: out, grand };
}

/**
 * Template app/reports/pnl, app/reports/balance-sheet, app/reports/cash-flow (Financial Report Studio, 96-studio.js
 * finance studio, "pnl" / "bs" / "cf" tabs): the statements from the live ledger with a comparative period.
 */
export function FinancialStatementScreen({ kind }: { kind: Kind }) {
  const [opts, setOpts] = useState<GlOptions | null>(null);
  const [staged, setStaged] = useState<Filters | null>(null);
  const [applied, setApplied] = useState<Filters | null>(null);
  const [view, setView] = useState<"Detail" | "Summary">("Detail");
  const [show, setShow] = useState({ value: kind !== "cf", group: true, desc: true });

  useEffect(() => {
    let off = false;
    const init = (fyStart: string | null) => {
      const p = periodPresets(fyStart).find((x) => x.key === (kind === "pnl" ? "q" : "ytd"))!;
      const f = { period: p.key, from: p.from, to: p.to, asAt: isoDay(new Date()), branch: "", cmp: kind === "cf" ? "none" : "py", zero: false, q: "" };
      setStaged(f);
      setApplied(f);
    };
    voucherOptions()
      .then((o) => {
        if (off) return;
        setOpts(o);
        const today = isoDay(new Date());
        init((o.fiscalYears.find((y) => y.startDate <= today && y.endDate >= today) ?? o.fiscalYears.at(-1))?.startDate ?? null);
      })
      .catch(() => !off && init(null));
    return () => {
      off = true;
    };
  }, [kind]);

  const fy = useMemo(() => {
    const today = isoDay(new Date());
    return opts?.fiscalYears.find((y) => y.startDate <= today && y.endDate >= today) ?? opts?.fiscalYears.at(-1) ?? null;
  }, [opts]);
  const presets = useMemo(() => periodPresets(fy?.startDate ?? null), [fy]);

  /** Comparative range / date for the API from the comparison choice. */
  const cmpArgs = (f: Filters) => {
    if (kind === "pnl") {
      if (f.cmp === "prev") {
        const days = Math.round((Date.parse(`${f.to}T00:00:00`) - Date.parse(`${f.from}T00:00:00`)) / 86_400_000);
        return { cmpFrom: addDays(f.from, -(days + 1)), cmpTo: addDays(f.from, -1) };
      }
      return {};
    }
    if (kind === "bs") {
      if (f.cmp === "fy") {
        const prior = opts?.fiscalYears.filter((y) => y.endDate < f.asAt).at(-1);
        return { cmpAsAt: prior?.endDate ?? shiftYear(f.asAt, -1) };
      }
      return f.cmp === "py" ? { cmpAsAt: shiftYear(f.asAt, -1) } : {};
    }
    return {};
  };
  const key = applied ? JSON.stringify({ kind, f: applied.from, t: applied.to, a: applied.asAt, b: applied.branch, c: applied.cmp }) : null;
  const { data, error, loading, retry } = useReport<FinancialStatement>(key, () => {
    const f = applied!;
    const branch = f.branch || undefined;
    if (kind === "pnl") return profitAndLoss({ from: f.from, to: f.to, branch, ...cmpArgs(f) });
    if (kind === "bs") return balanceSheet({ asAt: f.asAt, branch, ...cmpArgs(f) });
    return cashFlow({ from: f.from, to: f.to, branch });
  });

  const set = (patch: Partial<Filters>) => setStaged((s) => (s ? { ...s, ...patch } : s));
  const branchName = (id: string) => opts?.branches.find((b) => b.id === id)?.name ?? "All branches (consolidated)";
  const comparative = kind !== "cf" && applied?.cmp !== "none" && show.value;

  // rows after search / zero-balance filtering
  const { sections, grand } = useMemo(() => {
    const q = applied?.q.trim().toLowerCase() ?? "";
    const keep = (r: StatementRow) =>
      (applied?.zero || kind === "cf" || r.amount !== 0 || (r.comparative ?? 0) !== 0) && (!q || r.label.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q));
    const s = sectionsOf(data?.rows ?? []);
    return { sections: s.sections.map((x) => ({ ...x, rows: x.rows.filter(keep) })), grand: s.grand };
  }, [data, applied, kind]);

  const cols =
    kind === "pnl"
      ? ["Particulars", ...(show.desc ? ["Code"] : []), "Current", "% Rev", ...(comparative ? ["Prior", "Variance"] : [])]
      : kind === "bs"
        ? ["Particulars", ...(show.desc ? ["Code"] : []), dmy(applied?.asAt ?? null) || "As at", ...(comparative ? ["Prior", "Change"] : [])]
        : ["Particulars", "Amount (Rs)"];
  const lead = kind === "cf" ? 1 : show.desc ? 2 : 1;

  const cells = (r: StatementRow) => (
    <>
      <NumCell v={r.amount} />
      {kind === "pnl" && <td className="num">{r.pct === null || r.pct === undefined ? "" : `${num(r.pct, 1)}%`}</td>}
      {comparative && (
        <>
          <NumCell v={r.comparative ?? 0} />
          <NumCell v={r.change ?? (r.comparative === null || r.comparative === undefined ? 0 : r.amount - r.comparative)} />
        </>
      )}
    </>
  );
  const line = (r: StatementRow, i: number) => (
    <tr key={`${r.accountId ?? r.label}-${i}`} className={r.kind === "g" ? "rst-total" : "rst-row"}>
      <td>{r.label}</td>
      {lead > 1 && <td className="nw">{r.code ?? ""}</td>}
      {cells(r)}
    </tr>
  );
  const totalLine = (r: StatementRow, cls: string, extra?: ReactNode) => (
    <tr key={`${cls}-${r.label}`} className={cls}>
      <td colSpan={lead}>
        {r.label}
        {extra}
      </td>
      {cells(r)}
    </tr>
  );
  const diff = data?.difference ?? 0;
  const balanced = kind === "bs" ? <span className={`rst-badge ${Math.abs(diff) < 0.01 ? "ok" : "bad"}`}>{Math.abs(diff) < 0.01 ? "Balanced" : `Out by ${num(Math.abs(diff), 2)}`}</span> : null;
  const count = (n: number) => <small className="rst-count">{n} {n === 1 ? "line" : "lines"}</small>;

  const sectionBody = (s: Section, i: number) => {
    if (view === "Summary" || !show.group) {
      return s.total ? [totalLine(s.total, "rst-gsum", count(s.rows.length))] : s.rows.map(line);
    }
    return [
      <tr key={`s-${i}`} className="rst-sec">
        <td colSpan={cols.length}>
          {s.label}
          {count(s.rows.length)}
        </td>
      </tr>,
      ...s.rows.map(line),
      ...(s.total ? [totalLine(s.total, "rst-sub")] : []),
    ];
  };
  const table = (body: ReactNode, empty: boolean, foot?: ReactNode) => (
    <table className="rst-table is-stmt" data-plain>
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={`${c}-${i}`} className={i >= lead ? "num" : ""}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {empty ? (
          <tr className="rst-empty">
            <td colSpan={cols.length}>No rows match the current filters.</td>
          </tr>
        ) : (
          body
        )}
        {!empty && foot}
      </tbody>
    </table>
  );
  const mainBody = sections.flatMap(sectionBody);
  const grandRows = grand.map((g, i) => totalLine(g, "rst-total", i === grand.length - 1 ? balanced : null));

  // headline figures for the stats strip and summary
  const secTotal = (re: RegExp) => sections.find((s) => re.test(s.label))?.total?.amount ?? 0;
  const t = data?.totals ?? {};
  const revenue = secTotal(/revenue|sales/i);
  const cos = secTotal(/cost of/i);
  const net = t.netProfit ?? 0;
  const equity = secTotal(/equity/i);
  const sheet: Sheet | null =
    data && applied
      ? {
          name: NAME[kind],
          period: kind === "bs" ? `As at ${dmy(applied.asAt)}` : kind === "cf" ? `Indirect method · ${dmy(applied.from)} – ${dmy(applied.to)}` : `${dmy(applied.from)} – ${dmy(applied.to)}`,
          stats:
            kind === "pnl"
              ? [[ChartColumn, "Net Revenue", Rs(revenue)], [TrendingUp, "Gross Profit", Rs(revenue - cos)], [Coins, "Net Profit", Rs(net)]]
              : kind === "bs"
                ? [[Building2, "Total Assets", Rs(t.assets ?? 0)], [Wallet, "Total Equity", Rs(equity)], [Receipt, "Total Liabilities", Rs((t.equityAndLiabilities ?? 0) - equity)]]
                : [[Wallet, "Opening Cash & Bank", Rs(t.opening ?? 0)], [Waves, "Net Increase", Rs(t.netChange ?? 0)], [Coins, "Closing Cash & Bank", Rs(t.closing ?? 0)]],
          summary:
            kind === "pnl"
              ? [
                  ["Gross margin", revenue ? `${num(((revenue - cos) / revenue) * 100, 1)}%` : "—"],
                  ["Net margin", revenue ? `${num((net / revenue) * 100, 1)}%` : "—"],
                  ["Net profit", Rs(net)],
                ]
              : kind === "bs"
                ? [
                    ["Total assets", Rs(t.assets ?? 0)],
                    ["Equity + liabilities", Rs(t.equityAndLiabilities ?? 0)],
                    ["Difference", Math.abs(diff) < 0.01 ? <span key="b" className="rst-badge ok">Balanced</span> : <span key="b" className="rst-badge bad">{`Out by ${num(Math.abs(diff), 2)}`}</span>],
                  ]
                : [
                    ["Operating activities", Rs(t.operating ?? 0)],
                    ["Investing activities", Rs(t.investing ?? 0)],
                    ["Financing activities", Rs(t.financing ?? 0)],
                  ],
          criteria: [
            ["Report", NAME[kind]],
            [kind === "bs" ? "As at" : "Period", kind === "bs" ? dmy(applied.asAt) : `${presets.find((p) => p.key === applied.period)?.label ?? "Custom range"} · ${dmy(applied.from)} – ${dmy(applied.to)}`],
            ["Branch", branchName(applied.branch)],
            ["Comparison", data.comparativePeriod && applied.cmp !== "none" ? data.comparativePeriod : "None"],
            ["Zero balances", applied.zero ? "Shown" : "Hidden"],
          ],
          table: table(mainBody, !sections.some((s) => s.rows.length) && !grand.length, grandRows),
          annexes: sections.filter((s) => s.rows.length).slice(0, 4).map((s) => ({
            group: s.label, lines: s.rows.length, table: table([...s.rows.map(line), ...(s.total ? [totalLine(s.total, "rst-total")] : [])], !s.rows.length),
          })),
          groupLabel: kind === "cf" ? "Activity" : "Section",
        }
      : null;

  const exportCsv = () => {
    if (!data) return;
    const head = kind === "cf" ? ["Section", "Particulars", "Amount"] : ["Section", "Particulars", "Code", "Current", ...(kind === "pnl" ? ["% Rev"] : []), "Prior", "Change"];
    const rows: (string | number | null)[][] = [];
    let sec = "";
    for (const r of data.rows) {
      if (r.kind === "s") { sec = r.label; continue; }
      rows.push(kind === "cf" ? [sec, r.label, r.amount] : [sec, r.label, r.code ?? "", r.amount, ...(kind === "pnl" ? [r.pct ?? ""] : []), r.comparative ?? "", r.change ?? ""]);
    }
    downloadCsv(`${kind === "pnl" ? "profit-and-loss" : kind === "bs" ? "balance-sheet" : "cash-flow"}-${kind === "bs" ? applied?.asAt : `${applied?.from}-${applied?.to}`}.csv`, [head, ...rows]);
  };

  const filters = staged && (
    <>
      {kind === "bs" ? (
        <Fld icon={CalendarDays} label="As at">
          <DateIn label="As at" value={staged.asAt} onChange={(v) => set({ asAt: v })} />
        </Fld>
      ) : (
        <Fld icon={CalendarDays} label="Period">
          <Sel
            label="Period"
            value={staged.period}
            onChange={(k) => {
              const p = presets.find((x) => x.key === k)!;
              set(k === "custom" ? { period: k } : { period: k, from: p.from, to: p.to });
            }}
          >
            {presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Sel>
          <DateIn label="From" value={staged.from} onChange={(v) => set({ from: v, period: "custom" })} />
          <DateIn label="To" value={staged.to} onChange={(v) => set({ to: v, period: "custom" })} />
        </Fld>
      )}
      <Fld icon={Building2} label="Branch">
        <Sel label="Branch" value={staged.branch} onChange={(v) => set({ branch: v })}>
          <option value="">All branches (consolidated)</option>
          {opts?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Sel>
      </Fld>
      {kind !== "cf" && (
        <Fld icon={Columns2} label="Comparison">
          <Sel label="Comparison" value={staged.cmp} onChange={(v) => set({ cmp: v })}>
            {CMP[kind].map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Sel>
        </Fld>
      )}
      {kind !== "cf" && (
        <Fld icon={CircleMinus} label="Zero Balances">
          <Toggle text="Show zero balances" checked={staged.zero} onChange={(v) => set({ zero: v })} />
        </Fld>
      )}
      <Fld icon={Search} label="Find in Report">
        <label className="rst-select rst-search">
          <Search />
          <input type="search" placeholder="Account or line…" value={staged.q} aria-label="Find in report" onChange={(e) => set({ q: e.target.value })} />
        </label>
      </Fld>
    </>
  );

  const valid = (f: Filters) => (kind === "bs" ? !!f.asAt : !!f.from && !!f.to && f.from <= f.to);
  return (
    <ReportStudio
      tab={kind}
      filters={filters}
      onApply={() => staged && valid(staged) && setApplied(staged)}
      view={view}
      onView={setView}
      options={[
        ...(kind !== "cf" ? [{ key: "value", label: "Show comparative columns", checked: show.value, onChange: (v: boolean) => setShow((s) => ({ ...s, value: v })) }] : []),
        ...(kind !== "cf"
          ? [{ key: "zero", label: "Include zero balances", checked: applied?.zero ?? false, onChange: (v: boolean) => { set({ zero: v }); setApplied((a) => (a ? { ...a, zero: v } : a)); } }]
          : []),
        { key: "group", label: "Group by section", checked: show.group, onChange: (v) => setShow((s) => ({ ...s, group: v })) },
        ...(kind !== "cf" ? [{ key: "desc", label: "Show account codes", checked: show.desc, onChange: (v: boolean) => setShow((s) => ({ ...s, desc: v })) }] : []),
      ]}
      sheet={sheet}
      loading={loading}
      error={error}
      onRetry={retry}
      onExcel={exportCsv}
    />
  );
}

