"use client";

import { Building2, CalendarDays, FileText, Receipt, Scale, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DayBookRow, GlOptions } from "@/shared";
import { downloadCsv, isoDay } from "@/features/finance/components/finance-ui";
import { dayBook, voucherOptions } from "../api";
import { DateIn, dmy, Fld, NumCell, num, ReportStudio, RsStat, Sel, sum, useReport, type Sheet } from "./report-studio";

type Filters = { preset: string; date: string; branch: string; q: string };
/** Voucher types grouped like the template (Cash, Bank, Journal…). */
const GROUP: Record<string, string> = { CPV: "Cash", CRV: "Cash", BPV: "Bank", BRV: "Bank", CON: "Contra", JV: "Journal", OB: "Opening balances", SYSTEM: "System" };
const ORDER = ["Cash", "Bank", "Contra", "Journal", "Opening balances", "System"];
const groupOf = (t: string) => GROUP[t] ?? t;
const time = (iso: string) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");
const presetsFor = () => {
  const d = new Date();
  const y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return [
    { key: "today", label: "Today", date: isoDay(d) },
    { key: "yesterday", label: "Yesterday", date: isoDay(y) },
    { key: "custom", label: "Custom date", date: "" },
  ];
};

/** Template app/reports/day-book (Financial Report Studio, "daybook" tab): every voucher posted on a day, by voucher type. */
export function DayBookScreen() {
  const [opts, setOpts] = useState<GlOptions | null>(null);
  const [presets] = useState(presetsFor);
  const [staged, setStaged] = useState<Filters>(() => ({ preset: "today", date: presets[0]!.date, branch: "", q: "" }));
  const [applied, setApplied] = useState<Filters>(staged);
  const [view, setView] = useState<"Detail" | "Summary">("Detail");
  const [show, setShow] = useState({ group: true, desc: true });

  useEffect(() => {
    let off = false;
    voucherOptions().then((o) => !off && setOpts(o)).catch(() => {});
    return () => {
      off = true;
    };
  }, []);

  const key = JSON.stringify({ d: applied.date, b: applied.branch });
  const { data, error, loading, retry } = useReport(key, () => dayBook({ date: applied.date, branch: applied.branch || undefined }));
  const set = (patch: Partial<Filters>) => setStaged((s) => ({ ...s, ...patch }));

  const rows = useMemo(() => {
    const q = applied.q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => !q || [r.docNo, r.narration, r.debitAccount, r.by].some((x) => x?.toLowerCase().includes(q)));
  }, [data, applied]);
  const groups = useMemo(() => {
    const m = new Map<string, DayBookRow[]>();
    for (const r of rows) m.set(groupOf(r.voucherType), [...(m.get(groupOf(r.voucherType)) ?? []), r]);
    return [...m.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  }, [rows]);
  const totDr = sum(rows.map((r) => r.debit)), totCr = sum(rows.map((r) => r.credit));
  const balanced = Math.round(totDr * 100) === Math.round(totCr * 100);

  const cols = ["Time", "Voucher", "Debit account", "Narration", ...(show.desc ? ["By"] : []), "Debit", "Credit"];
  const lead = cols.length - 2;
  const line = (r: DayBookRow) => (
    <tr key={r.voucherId} className="rst-row">
      <td className="nw">{time(r.postedAt)}</td>
      <td className="nw">
        <Link href={`/accounting/vouchers/${r.voucherId}`}>{r.docNo}</Link>
      </td>
      <td>{r.debitAccount}</td>
      <td>{r.narration}</td>
      {show.desc && <td>{r.by ?? "—"}</td>}
      <NumCell v={r.debit} />
      <NumCell v={r.credit} />
    </tr>
  );
  const sumLine = (label: ReactNode, rs: DayBookRow[], cls: string) => (
    <tr key={`${cls}-${String(label)}`} className={cls}>
      <td colSpan={lead}>{label}</td>
      <NumCell v={sum(rs.map((r) => r.debit))} />
      <NumCell v={sum(rs.map((r) => r.credit))} />
    </tr>
  );
  const count = (n: number) => <small className="rst-count">{n} {n === 1 ? "row" : "rows"}</small>;
  const table = (body: ReactNode, rs: DayBookRow[], total: ReactNode) => (
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
            <td colSpan={cols.length}>No vouchers were posted on this day.</td>
          </tr>
        )}
        {rs.length > 0 && total}
      </tbody>
    </table>
  );
  const mainBody =
    view === "Summary"
      ? groups.map(([g, rs]) => (
          <tr key={`g-${g}`} className="rst-gsum">
            <td colSpan={lead}>
              {g}
              {count(rs.length)}
            </td>
            <NumCell v={sum(rs.map((r) => r.debit))} />
            <NumCell v={sum(rs.map((r) => r.credit))} />
          </tr>
        ))
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

  const sheet: Sheet | null = data
    ? {
        name: "Day Book",
        period: new Date(`${data.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" }).replace(/,/g, ","),
        stats: [
          [FileText, "Vouchers Posted", num(rows.length)],
          [Scale, "Total Debits", <RsStat key="d" value={totDr} />],
          [Receipt, "Total Credits", <RsStat key="c" value={totCr} />],
        ],
        summary: [
          ["Total debits", <RsStat key="d" value={totDr} />],
          ["Total credits", <RsStat key="c" value={totCr} />],
          ["Status", balanced ? "Balanced" : "Out of balance"],
        ],
        criteria: [
          ["Report", "Day Book"],
          ["Date", dmy(data.date)],
          ["Branch", opts?.branches.find((b) => b.id === applied.branch)?.name ?? "All branches (consolidated)"],
          ["Grouped by", show.group ? "Voucher type" : "None"],
        ],
        table: table(mainBody, rows, sumLine("Grand Total", rows, "rst-total")),
        annexes: groups.slice(0, 4).map(([g, rs]) => ({ group: g, lines: rs.length, table: table(rs.map(line), rs, sumLine(`Total — ${g}`, rs, "rst-total")) })),
        groupLabel: "Voucher type",
      }
    : null;

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`day-book-${data.date}.csv`, [
      ["Voucher type", "Time", "Voucher", "Debit account", "Narration", "By", "Debit", "Credit"],
      ...rows.map((r) => [groupOf(r.voucherType), time(r.postedAt), r.docNo, r.debitAccount, r.narration, r.by, r.debit, r.credit]),
      ["", "", "", "", "Total", "", totDr, totCr],
    ]);
  };

  const filters = (
    <>
      <Fld icon={CalendarDays} label="Date">
        <Sel
          label="Date"
          value={staged.preset}
          onChange={(k) => {
            const p = presets.find((x) => x.key === k)!;
            set(k === "custom" ? { preset: k } : { preset: k, date: p.date });
          }}
        >
          {presets.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Sel>
        <DateIn label="Day" value={staged.date} onChange={(v) => set({ date: v, preset: "custom" })} />
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
      <Fld icon={Search} label="Find in Report">
        <label className="rst-select rst-search">
          <Search />
          <input type="search" placeholder="Voucher, account or narration…" value={staged.q} aria-label="Find in report" onChange={(e) => set({ q: e.target.value })} />
        </label>
      </Fld>
    </>
  );

  return (
    <ReportStudio
      tab="daybook"
      filters={filters}
      onApply={() => staged.date && setApplied(staged)}
      view={view}
      onView={setView}
      options={[
        { key: "group", label: "Group by voucher type", checked: show.group, onChange: (v) => setShow((s) => ({ ...s, group: v })) },
        { key: "desc", label: "Show who posted", checked: show.desc, onChange: (v) => setShow((s) => ({ ...s, desc: v })) },
      ]}
      sheet={sheet}
      loading={loading}
      error={error}
      onRetry={retry}
      onExcel={exportCsv}
    />
  );
}
