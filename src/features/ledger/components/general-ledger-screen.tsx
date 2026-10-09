"use client";

import { BookOpen, Building2, CalendarDays, List, Scale, Search, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { GlOptions, GlRow } from "@/shared";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { generalLedger, voucherOptions } from "../api";
import { DateIn, dmy, Fld, NumCell, num, periodPresets, ReportStudio, RsStat, Sel, sum, useReport, type Sheet } from "./report-studio";

type Filters = { period: string; from: string; to: string; branch: string; account: string; q: string };
type Group = { key: string; label: string; nature: string; opening: GlRow | null; entries: GlRow[]; closing: number };

/** "4,560,000 Dr": the running balance on the account's natural side, flipped when it goes the other way. */
const bal = (v: number, nature: string) => {
  const dr = nature === "CR" ? v < 0 : v >= 0;
  return `${num(Math.abs(v))} ${dr ? "Dr" : "Cr"}`;
};

/** Template app/reports/gl (Financial Report Studio, "gl" tab): postings per account with the opening and running balance. */
export function GeneralLedgerScreen() {
  const [opts, setOpts] = useState<GlOptions | null>(null);
  const [staged, setStaged] = useState<Filters | null>(null);
  const [applied, setApplied] = useState<Filters | null>(null);
  const [view, setView] = useState<"Detail" | "Summary">("Detail");
  const [show, setShow] = useState({ opening: true, group: true, desc: true });

  useEffect(() => {
    let off = false;
    const start = (fy: string | null) => {
      const p = periodPresets(fy)[0]!;
      const f = { period: p.key, from: p.from, to: p.to, branch: "", account: "", q: "" };
      setStaged(f);
      setApplied(f);
    };
    voucherOptions()
      .then((o) => {
        if (off) return;
        setOpts(o);
        const today = new Date().toISOString().slice(0, 10);
        start((o.fiscalYears.find((y) => y.startDate <= today && y.endDate >= today) ?? o.fiscalYears.at(-1))?.startDate ?? null);
      })
      .catch(() => !off && start(null));
    return () => {
      off = true;
    };
  }, []);

  const fyStart = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (opts?.fiscalYears.find((y) => y.startDate <= today && y.endDate >= today) ?? opts?.fiscalYears.at(-1))?.startDate ?? null;
  }, [opts]);
  const presets = useMemo(() => periodPresets(fyStart), [fyStart]);
  const key = applied ? JSON.stringify({ f: applied.from, t: applied.to, b: applied.branch, a: applied.account }) : null;
  const { data, error, loading, retry } = useReport(key, () => generalLedger({ from: applied!.from, to: applied!.to, branch: applied!.branch || undefined, account: applied!.account || undefined }));
  const set = (patch: Partial<Filters>) => setStaged((s) => (s ? { ...s, ...patch } : s));

  const groups = useMemo(() => {
    const q = applied?.q.trim().toLowerCase() ?? "";
    const m = new Map<string, Group>();
    for (const r of data?.rows ?? []) {
      let g = m.get(r.accountId);
      if (!g) m.set(r.accountId, (g = { key: r.accountId, label: `${r.accountCode} · ${r.accountName}`, nature: r.nature, opening: null, entries: [], closing: 0 }));
      if (r.rowKind === "OPENING") g.opening = r;
      else if (!q || [r.docNo, r.description, r.accountCode, r.accountName].some((x) => x?.toLowerCase().includes(q))) g.entries.push(r);
      g.closing = r.balance;
    }
    return [...m.values()].filter((g) => g.entries.length || (!q && g.opening && g.opening.balance !== 0));
  }, [data, applied]);
  const entries = groups.flatMap((g) => g.entries);
  const totDr = sum(entries.map((r) => r.debit)), totCr = sum(entries.map((r) => r.credit));
  const accountCount = new Set(opts?.accounts.map((a) => a.id)).size;

  const cols = ["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"];
  const entry = (r: GlRow, i: number) => (
    <tr key={`${r.accountId}-${r.voucherId}-${i}`} className="rst-row">
      <td className="nw">{dmy(r.postingDate)}</td>
      <td className="nw">{r.voucherId ? <Link href={`/accounting/vouchers/${r.voucherId}`}>{r.docNo}</Link> : (r.docNo ?? "—")}</td>
      <td>
        {r.description}
        {show.desc && r.voucherType && <small className="rst-d">{r.voucherType}</small>}
      </td>
      <NumCell v={r.debit} />
      <NumCell v={r.credit} />
      <td className="num">{bal(r.balance, r.nature)}</td>
    </tr>
  );
  const openingRow = (g: Group) =>
    g.opening && show.opening ? (
      <tr key={`o-${g.key}`} className="rst-row">
        <td className="nw">{dmy(g.opening.postingDate)}</td>
        <td className="nw">—</td>
        <td>Opening balance</td>
        <td className="num" />
        <td className="num" />
        <td className="num">{bal(g.opening.balance, g.nature)}</td>
      </tr>
    ) : null;
  const subRow = (label: ReactNode, g: Group, cls: string) => (
    <tr key={`t-${cls}-${g.key}`} className={cls}>
      <td colSpan={3}>{label}</td>
      <NumCell v={sum(g.entries.map((r) => r.debit))} />
      <NumCell v={sum(g.entries.map((r) => r.credit))} />
      <td className="num">{bal(g.closing, g.nature)}</td>
    </tr>
  );
  const count = (n: number) => <small className="rst-count">{n} {n === 1 ? "row" : "rows"}</small>;
  const table = (body: ReactNode, empty: boolean, total?: ReactNode) => (
    <table className="rst-table" data-plain>
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={c} className={i >= 3 ? "num" : ""}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {empty ? (
          <tr className="rst-empty">
            <td colSpan={cols.length}>No postings match the current filters.</td>
          </tr>
        ) : (
          body
        )}
        {!empty && total}
      </tbody>
    </table>
  );
  const grand = (
    <tr className="rst-total">
      <td colSpan={3}>Grand Total</td>
      <NumCell v={totDr} />
      <NumCell v={totCr} />
      <td className="num" />
    </tr>
  );
  const mainBody =
    view === "Summary"
      ? groups.map((g) => subRow(<>{g.label}{count(g.entries.length)}</>, g, "rst-gsum"))
      : groups.flatMap((g) => [
          ...(show.group
            ? [
                <tr key={`s-${g.key}`} className="rst-sec">
                  <td colSpan={cols.length}>
                    {g.label}
                    {count(g.entries.length)}
                  </td>
                </tr>,
              ]
            : []),
          openingRow(g),
          ...g.entries.map(entry),
          ...(show.group ? [subRow(`Closing — ${g.label}`, g, "rst-sub")] : []),
        ]);

  const accountName = (id: string) => {
    const a = opts?.accounts.find((x) => x.id === id);
    return a ? `${a.code} · ${a.name}` : "All accounts";
  };
  const sheet: Sheet | null =
    data && applied
      ? {
          name: "General Ledger",
          period: `${dmy(data.from)} – ${dmy(data.to)}${data.truncated ? " · first 5,000 lines" : ""}`,
          stats: [
            [BookOpen, "Accounts", String(groups.length)],
            [List, "Entries", num(entries.length)],
            [Scale, "Total Debits", <RsStat key="d" value={totDr} />],
          ],
          summary: [
            ["Total debits", <RsStat key="d" value={totDr} />],
            ["Total credits", <RsStat key="c" value={totCr} />],
            ["Accounts listed", accountCount ? `${groups.length} of ${accountCount}` : String(groups.length)],
          ],
          criteria: [
            ["Report", "General Ledger"],
            ["Period", `${presets.find((p) => p.key === applied.period)?.label ?? "Custom range"} · ${dmy(applied.to)}`],
            ["Branch", opts?.branches.find((b) => b.id === applied.branch)?.name ?? "All branches (consolidated)"],
            ["Account", accountName(applied.account)],
            ...(data.truncated ? ([["Note", "Only the first 5,000 lines are shown; narrow the period or pick an account"]] as [string, string][]) : []),
          ],
          table: table(mainBody, groups.length === 0, grand),
          annexes: groups.slice(0, 4).map((g) => ({
            group: g.label,
            lines: g.entries.length,
            table: table([openingRow(g), ...g.entries.map(entry)], false, subRow(`Total — ${g.label}`, g, "rst-total")),
          })),
          groupLabel: "Account",
        }
      : null;

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`general-ledger-${data.from}-${data.to}.csv`, [
      ["Account", "Date", "Voucher", "Narration", "Debit", "Credit", "Balance"],
      ...groups.flatMap((g) => [
        ...(g.opening ? [[g.label, g.opening.postingDate, "", "Opening balance", null, null, bal(g.opening.balance, g.nature)]] : []),
        ...g.entries.map((r) => [g.label, r.postingDate, r.docNo, r.description, r.debit, r.credit, bal(r.balance, r.nature)]),
      ]),
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
      <Fld icon={Wallet} label="Account">
        <Sel label="Account" value={staged.account} onChange={(v) => set({ account: v })}>
          <option value="">All accounts</option>
          {opts?.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </Sel>
      </Fld>
      <Fld icon={Search} label="Find in Report">
        <label className="rst-select rst-search">
          <Search />
          <input type="search" placeholder="Account, voucher or narration…" value={staged.q} aria-label="Find in report" onChange={(e) => set({ q: e.target.value })} />
        </label>
      </Fld>
    </>
  );

  return (
    <ReportStudio
      tab="gl"
      filters={filters}
      onApply={() => staged && staged.from && staged.to && setApplied(staged)}
      view={view}
      onView={setView}
      options={[
        { key: "opening", label: "Show opening balances", checked: show.opening, onChange: (v) => setShow((s) => ({ ...s, opening: v })) },
        { key: "group", label: "Group by account", checked: show.group, onChange: (v) => setShow((s) => ({ ...s, group: v })) },
        { key: "desc", label: "Show voucher types", checked: show.desc, onChange: (v) => setShow((s) => ({ ...s, desc: v })) },
      ]}
      sheet={sheet}
      loading={loading}
      error={error}
      onRetry={retry}
      onExcel={exportCsv}
    />
  );
}
