"use client";

import { Building2, CircleCheck, CircleMinus, Layers, CalendarDays, Scale, Search, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { GlOptions, TrialBalanceRow } from "@/shared";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { trialBalance, voucherOptions } from "../api";
import { DateIn, dmy, Fld, NumCell, num, periodPresets, ReportStudio, RsStat, Sel, sum, Toggle, useReport, type Sheet } from "./report-studio";

type Filters = { period: string; from: string; to: string; branch: string; level: number; zero: boolean; q: string };
const LEVELS = [
  [2, "Level 2 (groups)"],
  [3, "Level 3"],
  [4, "Level 4 (posting)"],
] as const;
const NUMS = ["movementDr", "movementCr", "closingDr", "closingCr"] as const;

/** Template app/reports/trial-balance (Financial Report Studio, "tb" tab): closing balances per account, grouped by account type. */
export function TrialBalanceScreen() {
  const [opts, setOpts] = useState<GlOptions | null>(null);
  const [staged, setStaged] = useState<Filters | null>(null);
  const [applied, setApplied] = useState<Filters | null>(null);
  const [view, setView] = useState<"Detail" | "Summary">("Detail");
  const [show, setShow] = useState({ value: true, group: true, desc: true });

  useEffect(() => {
    let off = false;
    voucherOptions()
      .then((o) => {
        if (off) return;
        setOpts(o);
        const today = new Date().toISOString().slice(0, 10);
        const fy = o.fiscalYears.find((y) => y.startDate <= today && y.endDate >= today) ?? o.fiscalYears.at(-1);
        const p = periodPresets(fy?.startDate ?? null)[0]!;
        const f = { period: p.key, from: p.from, to: p.to, branch: "", level: 4, zero: false, q: "" };
        setStaged(f);
        setApplied(f);
      })
      .catch(() => {
        const p = periodPresets(null)[0]!;
        const f = { period: p.key, from: p.from, to: p.to, branch: "", level: 4, zero: false, q: "" };
        setStaged(f);
        setApplied(f);
      });
    return () => {
      off = true;
    };
  }, []);

  const fyStart = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (opts?.fiscalYears.find((y) => y.startDate <= today && y.endDate >= today) ?? opts?.fiscalYears.at(-1))?.startDate ?? null;
  }, [opts]);
  const presets = useMemo(() => periodPresets(fyStart), [fyStart]);
  const key = applied ? JSON.stringify({ f: applied.from, t: applied.to, b: applied.branch, l: applied.level, z: applied.zero }) : null;
  const { data, error, loading, retry } = useReport(key, () => trialBalance({ from: applied!.from, to: applied!.to, branch: applied!.branch || undefined, level: applied!.level, zero: applied!.zero }));

  const set = (patch: Partial<Filters>) => setStaged((s) => (s ? { ...s, ...patch } : s));
  const branchName = (id: string) => opts?.branches.find((b) => b.id === id)?.name ?? "All branches (consolidated)";

  const rows = useMemo(() => {
    const q = applied?.q.trim().toLowerCase() ?? "";
    return (data?.rows ?? []).filter((r) => !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [data, applied]);
  const groups = useMemo(() => {
    const m = new Map<string, TrialBalanceRow[]>();
    for (const r of rows) m.set(r.className, [...(m.get(r.className) ?? []), r]);
    return [...m.entries()];
  }, [rows]);

  const cols = [...(show.desc ? ["Code"] : []), "Account", ...(show.value ? ["Movement Dr", "Movement Cr"] : []), "Closing Debit", "Closing Credit"];
  const nums = NUMS.filter((k) => show.value || k.startsWith("closing"));
  const lead = cols.length - nums.length;
  const totals = (rs: TrialBalanceRow[]) => Object.fromEntries(NUMS.map((k) => [k, sum(rs.map((r) => r[k]))])) as Record<(typeof NUMS)[number], number>;
  const all = totals(rows);
  const opening = { dr: sum(rows.map((r) => r.openingDr)), cr: sum(rows.map((r) => r.openingCr)) };
  const diff = Math.round((all.closingDr - all.closingCr) * 100) / 100;

  const line = (r: TrialBalanceRow) => (
    <tr key={r.accountId} className="rst-row">
      {show.desc && <td className="nw">{r.code}</td>}
      <td>{r.name}</td>
      {nums.map((k) => (
        <NumCell key={k} v={r[k]} />
      ))}
    </tr>
  );
  const sumLine = (label: string, rs: TrialBalanceRow[], cls: string, extra?: ReactNode) => {
    const t = totals(rs);
    return (
      <tr key={`${cls}-${label}`} className={cls}>
        <td colSpan={lead}>
          {label}
          {extra}
        </td>
        {nums.map((k) => (
          <NumCell key={k} v={t[k]} />
        ))}
      </tr>
    );
  };
  const count = (n: number) => <small className="rst-count">{n} {n === 1 ? "row" : "rows"}</small>;
  const table = (body: ReactNode, rs: TrialBalanceRow[], totalLabel = "Grand Total", noTotal = false) => (
    <table className="rst-table" data-plain>
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={c} className={i >= lead ? "num" : ""}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rs.length ? body : (
          <tr className="rst-empty">
            <td colSpan={cols.length}>No rows match the current filters.</td>
          </tr>
        )}
        {rs.length > 0 && !noTotal && sumLine(totalLabel, rs, "rst-total", totalLabel === "Grand Total" ? <span className={`rst-badge ${diff === 0 ? "ok" : "bad"}`}>{diff === 0 ? "Balanced" : `Out by ${num(Math.abs(diff), 2)}`}</span> : null)}
      </tbody>
    </table>
  );

  const mainBody =
    view === "Summary"
      ? groups.map(([g, rs]) => sumLine(g, rs, "rst-gsum", count(rs.length)))
      : show.group
        ? groups.flatMap(([g, rs]) => [
            <tr key={`s-${g}`} className="rst-sec">
              <td colSpan={cols.length}>
                {g}
                {count(rs.length)}
              </td>
            </tr>,
            ...rs.map(line),
            sumLine(`Subtotal — ${g}`, rs, "rst-sub"),
          ])
        : rows.map(line);

  const sheet: Sheet | null =
    data && applied
      ? {
          name: "Trial Balance",
          period: `${dmy(data.from)} – ${dmy(data.to)}`,
          stats: [
            [Scale, "Closing Debits", <RsStat key="d" value={all.closingDr} />],
            [Scale, "Closing Credits", <RsStat key="c" value={all.closingCr} />],
            [diff === 0 ? CircleCheck : TriangleAlert, "Difference", <><small>Rs</small> {num(Math.abs(diff), 2)}</>],
          ],
          summary: [
            ["Opening (Dr = Cr)", <RsStat key="o" value={opening.dr} />],
            ["Movement (Dr = Cr)", <RsStat key="m" value={all.movementDr} />],
            ["Closing (Dr = Cr)", <RsStat key="c" value={all.closingDr} />],
          ],
          criteria: [
            ["Report", "Trial Balance"],
            ["Period", `${presets.find((p) => p.key === applied.period)?.label ?? "Custom range"} · ${dmy(applied.to)}`],
            ["Branch", branchName(applied.branch)],
            ["Account Level", LEVELS.find((l) => l[0] === applied.level)?.[1] ?? ""],
            ["Zero balances", applied.zero ? "Shown" : "Hidden"],
          ],
          table: table(mainBody, rows),
          annexes: groups.slice(0, 4).map(([g, rs]) => ({ group: g, lines: rs.length, table: table(rs.map(line), rs, `Total — ${g}`) })),
          groupLabel: "Account type",
        }
      : null;

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`trial-balance-${data.from}-${data.to}.csv`, [
      ["Account type", "Code", "Account", "Opening Dr", "Opening Cr", "Movement Dr", "Movement Cr", "Closing Dr", "Closing Cr"],
      ...rows.map((r) => [r.className, r.code, r.name, r.openingDr, r.openingCr, r.movementDr, r.movementCr, r.closingDr, r.closingCr]),
      ["", "", "Total", opening.dr, opening.cr, all.movementDr, all.movementCr, all.closingDr, all.closingCr],
    ]);
  };

  const filters = staged && (
    <>
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
      <Fld icon={Layers} label="Account Level">
        <div className="rst-radios" role="radiogroup">
          {LEVELS.map(([l, label]) => (
            <label key={l} className={staged.level === l ? "on" : ""}>
              <input type="radio" name="tb-level" value={l} checked={staged.level === l} onChange={() => set({ level: l })} />
              <i />
              {label}
            </label>
          ))}
        </div>
      </Fld>
      <Fld icon={CircleMinus} label="Zero Balances">
        <Toggle text="Show zero balances" checked={staged.zero} onChange={(v) => set({ zero: v })} />
      </Fld>
      <Fld icon={Search} label="Find in Report">
        <label className="rst-select rst-search">
          <Search />
          <input type="search" placeholder="Account code or name…" value={staged.q} aria-label="Find in report" onChange={(e) => set({ q: e.target.value })} />
        </label>
      </Fld>
    </>
  );

  return (
    <ReportStudio
      tab="tb"
      filters={filters}
      onApply={() => staged && staged.from && staged.to && setApplied(staged)}
      view={view}
      onView={setView}
      options={[
        { key: "value", label: "Show movement columns", checked: show.value, onChange: (v) => setShow((s) => ({ ...s, value: v })) },
        {
          key: "zero", label: "Include zero balances", checked: applied?.zero ?? false,
          onChange: (v) => { set({ zero: v }); setApplied((a) => (a ? { ...a, zero: v } : a)); },
        },
        { key: "group", label: "Group by account type", checked: show.group, onChange: (v) => setShow((s) => ({ ...s, group: v })) },
        { key: "desc", label: "Show account codes", checked: show.desc, onChange: (v) => setShow((s) => ({ ...s, desc: v })) },
      ]}
      sheet={sheet}
      loading={loading}
      error={error}
      onRetry={retry}
      onExcel={exportCsv}
    />
  );
}
