"use client";

import "@/features/ledger/components/report-studio.css";
import "@/features/purchasing/components/payables-studio.css";
import {
  ArrowDownUp, Bookmark, Building2, CalendarDays, ChevronLeft, ChevronRight, Coins, Columns2, Download, FileCheck, FileOutput, FileText, HandCoins,
  Hourglass, House, Maximize, Minimize, Minus, Package, Percent, Plus, Printer, Receipt, Search, Settings2, SlidersHorizontal, Square, Star, Users, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ArAgeing, ArAgeingRow, CustomerStatement, ReceivablesOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ErrorState } from "@/components/ui/states";
import { downloadCsv, isoDay } from "@/features/finance/components/finance-ui";
import {
  DateIn, dmy, Fld, NumCell, num, periodPresets, RsStat, Sel, sum, useCompanyName, useReport, type Sheet, type StudioOption,
} from "@/features/ledger/components/report-studio";
import { ApiError } from "@/lib/api/errors";
import { arAgeing, customerStatement, receivablesOptions } from "../completion-api";

/* ------------------------------------------------------------------ studio config (template 96-studio.js `receivables`) */
type TabKey = "ageing" | "register" | "statement" | "bycust" | "byitem" | "gst";
const TABS: { key: TabKey; label: string; icon: LucideIcon; ready: boolean }[] = [
  { key: "ageing", label: "AR Ageing", icon: Hourglass, ready: true },
  { key: "register", label: "Sales Register", icon: Receipt, ready: false },
  { key: "statement", label: "Customer Statement", icon: FileText, ready: true },
  { key: "bycust", label: "Sales by Customer", icon: Users, ready: false },
  { key: "byitem", label: "Sales by Item", icon: Package, ready: false },
  { key: "gst", label: "GST Output", icon: Percent, ready: false },
];
const LATER = "Comes with the reports phase";
const BUCKETS = [
  ["current", "Current"],
  ["d1to30", "1–30"],
  ["d31to60", "31–60"],
  ["d61to90", "61–90"],
  ["d90plus", "90+"],
] as const;
type BucketKey = (typeof BUCKETS)[number][0];
const SORTS = [
  ["customer", "Customer"],
  ["total", "Total receivable"],
  ["oldest", "Days overdue"],
  ["overdue", "90+ days"],
] as const;
type SortKey = (typeof SORTS)[number][0];

type AgeingFilters = { asOf: string; customer: string; branch: string; basis: "DUE" | "DOC"; q: string; sort: SortKey; dir: "asc" | "desc" };
type StmtFilters = { customer: string; period: string; from: string; to: string; q: string };
type Preset = { name: string; sub: string; star?: boolean; ready: boolean; apply?: () => void };
type Line = CustomerStatement["lines"][number];

const apiErr = (e: unknown) => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the report" });

/**
 * Template app/receivables/ageing (45-studios.html shell, 96-studio.js `receivables` studio): Sales & Receivables Studio with
 * AR Ageing (open invoice balances in due-date / invoice-date buckets per customer, Sales.getReceivablesAgeingAsOf) and the
 * Customer Statement (invoices, receipts and credit notes with a running balance). The other tabs come with the reports phase.
 */
export function ArReportsScreen() {
  const today = isoDay(new Date());
  // deep link: ?customer=<id>&tab=statement opens a customer's statement
  const params = useSearchParams();
  const linkCustomer = params.get("customer") ?? "";
  const linkTab: TabKey = params.get("tab") === "statement" ? "statement" : "ageing";
  const [opts, setOpts] = useState<ReceivablesOptions | null>(null);
  const [optsError, setOptsError] = useState<{ message: string; reference?: string } | null>(null);
  const [tab, setTab] = useState<TabKey>(linkTab);
  const [view, setView] = useState<"Detail" | "Summary">("Detail");
  const [show, setShow] = useState({ value: true, group: true, desc: true });
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const presets = useMemo(() => periodPresets(null), []);
  const ytd = presets.find((p) => p.key === "ytd") ?? presets.find((p) => p.key === "m")!;
  const [ag, setAg] = useState<AgeingFilters>({ asOf: today, customer: "", branch: "", basis: "DUE", q: "", sort: "customer", dir: "asc" });
  const [agApplied, setAgApplied] = useState<AgeingFilters>(ag);
  const [st, setSt] = useState<StmtFilters>({ customer: linkCustomer, period: ytd.key, from: ytd.from, to: ytd.to, q: "" });
  const [stApplied, setStApplied] = useState<StmtFilters>(st);

  useEffect(() => {
    let off = false;
    receivablesOptions()
      .then((o) => !off && setOpts(o))
      .catch((e: unknown) => !off && setOptsError(apiErr(e)));
    return () => {
      off = true;
    };
  }, []);

  const agKey = tab === "ageing" ? JSON.stringify({ a: agApplied.asOf, b: agApplied.basis }) : null;
  const ageing = useReport<ArAgeing>(agKey, () => arAgeing({ asOf: agApplied.asOf, basis: agApplied.basis }));
  const stKey = tab === "statement" && stApplied.customer && stApplied.from && stApplied.to ? JSON.stringify(stApplied) : null;
  const stmt = useReport<CustomerStatement>(stKey, () => customerStatement({ customer: stApplied.customer, from: stApplied.from, to: stApplied.to }));

  const customerName = (id: string) => opts?.customers.find((v) => v.id === id)?.name ?? "All customers";
  const branchName = (id: string) => opts?.branches.find((b) => b.id === id)?.name ?? "All branches";
  const terms = (t: string) => opts?.paymentTerms.find((p) => p.code === t)?.label ?? t.replace(/_/g, " ");
  const openStatement = (customerId: string) => {
    const f = { ...st, customer: customerId };
    setSt(f);
    setStApplied(f);
    setTab("statement");
    setActivePreset(null);
  };

  /* ---------------------------------------------------------------- AR Ageing sheet */
  const agRows = useMemo(() => {
    const q = agApplied.q.trim().toLowerCase();
    const rows = (ageing.data?.rows ?? []).filter(
      (r) =>
        (!agApplied.customer || r.customer.id === agApplied.customer) &&
        (!agApplied.branch || r.branch?.id === agApplied.branch) &&
        (!q || r.customer.name.toLowerCase().includes(q) || r.customer.code.toLowerCase().includes(q)),
    );
    const k = agApplied.sort;
    const val = (r: ArAgeingRow) => (k === "total" ? r.total : k === "oldest" ? (r.maxDaysOverdue ?? 0) : k === "overdue" ? r.d90plus : 0);
    const sorted = [...rows].sort((a, b) => (k === "customer" ? a.customer.name.localeCompare(b.customer.name) : val(a) - val(b)));
    return agApplied.dir === "desc" ? sorted.reverse() : sorted;
  }, [ageing.data, agApplied]);
  const agGroups = useMemo(() => {
    const m = new Map<string, ArAgeingRow[]>();
    for (const r of agRows) {
      const g = r.branch?.name || "No branch";
      m.set(g, [...(m.get(g) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [agRows]);

  const buckets: readonly (readonly [BucketKey, string])[] = show.value ? BUCKETS : [];
  const agCols = ["Customer", ...(show.desc ? ["Terms"] : []), ...buckets.map(([, l]) => l), "Total (Rs)", "Invoices", "Days"];
  const agLead = show.desc ? 2 : 1;
  const bucketTotals = (rs: ArAgeingRow[]) => Object.fromEntries(BUCKETS.map(([b]) => [b, sum(rs.map((r) => r[b]))])) as Record<BucketKey, number>;
  const days = (n: number | null) => (n && n > 0 ? `${n}d` : "—");
  const agLine = (r: ArAgeingRow) => (
    <tr key={r.customer.id} className="rst-row">
      <td>
        <a
          href={`/receivables/ageing?customer=${r.customer.id}&tab=statement`}
          className="pst-doc"
          onClick={(e) => {
            e.preventDefault();
            openStatement(r.customer.id);
          }}
        >
          {r.customer.name}
        </a>
        <small className="pst-sub">{r.customer.code}</small>
      </td>
      {show.desc && <td className="nw">{terms(r.paymentTerms)}</td>}
      {buckets.map(([b]) => (
        <NumCell key={b} v={r[b]} />
      ))}
      <NumCell v={r.total} className="pst-strong" />
      <td className="num">{r.openInvoices || "—"}</td>
      <td className="num">{days(r.maxDaysOverdue)}</td>
    </tr>
  );
  const agSum = (label: string, rs: ArAgeingRow[], cls: string, extra?: ReactNode) => {
    const t = bucketTotals(rs);
    return (
      <tr key={`${cls}-${label}`} className={cls}>
        <td colSpan={agLead}>
          {label}
          {extra}
        </td>
        {buckets.map(([b]) => (
          <NumCell key={b} v={t[b]} />
        ))}
        <NumCell v={sum(rs.map((r) => r.total))} />
        <td className="num">{rs.reduce((s, r) => s + r.openInvoices, 0) || "—"}</td>
        <td className="num">{days(rs.length ? Math.max(...rs.map((r) => r.maxDaysOverdue ?? 0)) : null)}</td>
      </tr>
    );
  };
  const count = (n: number, unit = "customer") => (
    <small className="rst-count">
      {n} {n === 1 ? unit : `${unit}s`}
    </small>
  );
  const agTable = (body: ReactNode, rs: ArAgeingRow[], totalLabel = "Total receivable") => (
    <table className="rst-table pst-tight" data-plain>
      <thead>
        <tr>
          {agCols.map((c, i) => (
            <th key={c} className={i >= agLead ? "num" : ""}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rs.length ? (
          body
        ) : (
          <tr className="rst-empty">
            <td colSpan={agCols.length}>No customer owes anything for the current filters.</td>
          </tr>
        )}
        {rs.length > 0 && agSum(totalLabel, rs, "rst-total")}
      </tbody>
    </table>
  );
  const agBody =
    view === "Summary"
      ? agGroups.map(([g, rs]) => agSum(g, rs, "rst-gsum", count(rs.length)))
      : show.group
        ? agGroups.flatMap(([g, rs]) => [
            <tr key={`s-${g}`} className="rst-sec">
              <td colSpan={agCols.length}>
                {g}
                {count(rs.length)}
              </td>
            </tr>,
            ...rs.map(agLine),
            agSum(`Subtotal — ${g}`, rs, "rst-sub"),
          ])
        : agRows.map(agLine);
  const agAll = bucketTotals(agRows);
  const agTotal = sum(agRows.map((r) => r.total));
  const pct = (v: number) => (agTotal ? `${Math.round((v / agTotal) * 1000) / 10}%` : "0%");
  const ageingSheet: Sheet | null = ageing.data
    ? {
        name: "Receivables Ageing",
        period: `As at ${dmy(ageing.data.asOf)}`,
        stats: [
          [Users, "Customers", num(agRows.filter((r) => r.total).length)],
          [HandCoins, "Total Receivable", <RsStat key="t" value={agTotal} />],
          [Hourglass, "Overdue 90+", <RsStat key="o" value={agAll.d90plus} />],
        ],
        summary: [
          ...BUCKETS.map(([b, l]): [string, ReactNode] => [`${l} (${pct(agAll[b])})`, <RsStat key={b} value={agAll[b]} />]),
          ["Overdue", <RsStat key="od" value={agAll.d1to30 + agAll.d31to60 + agAll.d61to90 + agAll.d90plus} />],
        ],
        criteria: [
          ["Report", "AR Ageing"],
          ["As on", dmy(agApplied.asOf)],
          ["Ageing basis", agApplied.basis === "DUE" ? "By due date" : "By invoice date"],
          ["Customer", customerName(agApplied.customer)],
          ["Branch", branchName(agApplied.branch)],
        ],
        table: agTable(agBody, agRows),
        annexes: show.group ? agGroups.slice(0, 4).map(([g, rs]) => ({ group: g, lines: rs.length, table: agTable(rs.map(agLine), rs, `Total — ${g}`) })) : [],
        groupLabel: "Branch",
      }
    : null;

  /* ---------------------------------------------------------------- Customer Statement sheet */
  const stRows = useMemo(() => {
    const q = stApplied.q.trim().toLowerCase();
    return (stmt.data?.lines ?? []).filter((r) => !q || r.docNo.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [stmt.data, stApplied.q]);
  const stCols = ["Date", "Document", "Particulars", "Debit", "Credit", "Balance"];
  const stLead = stCols.length - 3;
  const stTable = (rows: Line[], s: CustomerStatement) => (
    <table className="rst-table is-stmt pst-tight" data-plain>
      <thead>
        <tr>
          {stCols.map((c, i) => (
            <th key={c} className={i >= stLead ? "num" : ""}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr className="rst-sec">
          <td colSpan={stLead}>Opening balance · {dmy(s.from)}</td>
          <td className="num" />
          <td className="num" />
          <NumCell v={s.opening} />
        </tr>
        {rows.length ? (
          rows.map((r, i) => (
            <tr key={`${r.docNo}-${i}`} className="rst-row">
              <td className="nw">{dmy(r.date)}</td>
              <td className="nw">
                {r.link ? (
                  <Link href={r.link} className="pst-doc">
                    {r.docNo}
                  </Link>
                ) : (
                  r.docNo
                )}
                {show.desc && <small className="pst-sub">{r.docType}</small>}
              </td>
              <td>{r.description}</td>
              <NumCell v={r.debit} />
              <NumCell v={r.credit} />
              <NumCell v={r.balance} />
            </tr>
          ))
        ) : (
          <tr className="rst-empty">
            <td colSpan={stCols.length}>No transactions in this period.</td>
          </tr>
        )}
        <tr className="rst-total">
          <td colSpan={stLead}>Closing balance · {dmy(s.to)}</td>
          <NumCell v={sum(rows.map((r) => r.debit))} />
          <NumCell v={sum(rows.map((r) => r.credit))} />
          <NumCell v={s.closing} />
        </tr>
      </tbody>
    </table>
  );
  const invoiced = sum(stRows.map((r) => r.debit));
  const received = sum(stRows.filter((r) => r.docType === "Receipt").map((r) => r.credit));
  const credited = sum(stRows.filter((r) => r.docType !== "Receipt").map((r) => r.credit));
  const stmtSheet: Sheet | null = stmt.data
    ? {
        name: "Customer Statement",
        period: `${stmt.data.customer.name}${stmt.data.customer.city ? ` · ${stmt.data.customer.city}` : ""} · ${dmy(stmt.data.from)} – ${dmy(stmt.data.to)}`,
        stats: [
          [Wallet, "Opening Balance", <RsStat key="o" value={stmt.data.opening} />],
          [Receipt, "Invoiced", <RsStat key="b" value={invoiced} />],
          [Coins, "Closing Balance", <RsStat key="c" value={stmt.data.closing} />],
        ],
        summary:
          view === "Summary" || !show.value
            ? [
                ["Invoiced", <RsStat key="b" value={invoiced} />],
                ["Received", <RsStat key="p" value={received} />],
                ["Amount due", <RsStat key="c" value={stmt.data.closing} />],
              ]
            : [
                ["Invoiced", <RsStat key="b" value={invoiced} />],
                ["Received", <RsStat key="p" value={received} />],
                ["Credit notes", <RsStat key="d" value={credited} />],
                ["Amount due", <RsStat key="c" value={stmt.data.closing} />],
              ],
        criteria: [
          ["Report", "Customer Statement"],
          ["Customer", `${stmt.data.customer.code} · ${stmt.data.customer.name}`],
          ["Terms", terms(stmt.data.customer.paymentTerms)],
          ["Period", `${dmy(stmt.data.from)} – ${dmy(stmt.data.to)}`],
        ],
        table: view === "Summary" ? stTable([], stmt.data) : stTable(stRows, stmt.data),
        annexes: [],
        groupLabel: "Period",
      }
    : null;

  /* ---------------------------------------------------------------- exports */
  const exportCsv = () => {
    if (tab === "ageing" && ageing.data) {
      downloadCsv(`ar-ageing-${ageing.data.asOf}.csv`, [
        ["Customer code", "Customer", "Branch", "Terms", ...BUCKETS.map(([, l]) => l), "Total", "Invoices", "Days overdue"],
        ...agRows.map((r) => [r.customer.code, r.customer.name, r.branch?.name ?? "", r.paymentTerms, ...BUCKETS.map(([b]) => r[b]), r.total, r.openInvoices, r.maxDaysOverdue ?? ""]),
        ["", "Total", "", "", ...BUCKETS.map(([b]) => agAll[b]), agTotal, "", ""],
      ]);
    }
    if (tab === "statement" && stmt.data) {
      const s = stmt.data;
      downloadCsv(`customer-statement-${s.customer.code}-${s.from}-${s.to}.csv`, [
        ["Date", "Type", "Document", "Particulars", "Debit", "Credit", "Balance"],
        [s.from, "", "", "Opening balance", "", "", s.opening],
        ...stRows.map((r) => [r.date, r.docType, r.docNo, r.description, r.debit, r.credit, r.balance]),
        [s.to, "", "", "Closing balance", "", "", s.closing],
      ]);
    }
  };

  /* ---------------------------------------------------------------- filters */
  const customerOptions = opts?.customers.map((v) => (
    <option key={v.id} value={v.id}>
      {v.name}
    </option>
  ));
  const ageingFilters = (
    <>
      <Fld icon={CalendarDays} label="As On">
        <Sel label="As on" value="asOf" onChange={() => {}}>
          <option value="asOf">As on date</option>
        </Sel>
        <DateIn label="As on date" value={ag.asOf} onChange={(v) => setAg({ ...ag, asOf: v })} />
      </Fld>
      <Fld icon={Users} label="Customer">
        <Sel label="Customer" value={ag.customer} onChange={(v) => setAg({ ...ag, customer: v })}>
          <option value="">All customers</option>
          {customerOptions}
        </Sel>
      </Fld>
      <Fld icon={Building2} label="Branch">
        <Sel label="Branch" value={ag.branch} onChange={(v) => setAg({ ...ag, branch: v })}>
          <option value="">All branches</option>
          {opts?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Sel>
      </Fld>
      <Fld icon={Hourglass} label="Ageing Basis">
        <div className="rst-radios" role="radiogroup">
          {(
            [
              ["DUE", "By due date"],
              ["DOC", "By invoice date"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className={ag.basis === k ? "on" : ""}>
              <input type="radio" name="ar-basis" value={k} checked={ag.basis === k} onChange={() => setAg({ ...ag, basis: k })} />
              <i />
              {label}
            </label>
          ))}
        </div>
      </Fld>
      <Fld icon={Search} label="Find in Report">
        <label className="rst-select rst-search">
          <Search />
          <input type="search" placeholder="Customer, invoice or note…" value={ag.q} aria-label="Find in report" onChange={(e) => setAg({ ...ag, q: e.target.value })} />
        </label>
      </Fld>
      <Fld icon={ArrowDownUp} label="Sort By">
        <div className="rst-sort">
          <Sel label="Sort by" value={ag.sort} onChange={(v) => setAg({ ...ag, sort: v as SortKey })}>
            {SORTS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Sel>
          <Sel label="Direction" value={ag.dir} onChange={(v) => setAg({ ...ag, dir: v as "asc" | "desc" })}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </Sel>
        </div>
      </Fld>
    </>
  );
  const statementFilters = (
    <>
      <Fld icon={Users} label="Customer">
        <Sel label="Customer" value={st.customer} onChange={(v) => setSt({ ...st, customer: v })}>
          <option value="">Choose a customer…</option>
          {customerOptions}
        </Sel>
      </Fld>
      <Fld icon={CalendarDays} label="Period">
        <Sel
          label="Period"
          value={st.period}
          onChange={(k) => {
            const p = presets.find((x) => x.key === k)!;
            setSt(k === "custom" ? { ...st, period: k } : { ...st, period: k, from: p.from, to: p.to });
          }}
        >
          {presets.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Sel>
        <DateIn label="From" value={st.from} onChange={(v) => setSt({ ...st, from: v, period: "custom" })} />
        <DateIn label="To" value={st.to} onChange={(v) => setSt({ ...st, to: v, period: "custom" })} />
      </Fld>
      <Fld icon={Search} label="Find in Report">
        <label className="rst-select rst-search">
          <Search />
          <input type="search" placeholder="Document or note…" value={st.q} aria-label="Find in report" onChange={(e) => setSt({ ...st, q: e.target.value })} />
        </label>
      </Fld>
    </>
  );

  const presetList: Preset[] = [
    {
      name: "Month-end ageing", sub: "AR Ageing · All branches", star: true, ready: true,
      apply: () => {
        const f: AgeingFilters = { ...ag, asOf: today, branch: "", basis: "DUE", sort: "customer", dir: "asc" };
        setTab("ageing");
        setView("Detail");
        setShow((s) => ({ ...s, value: true, group: true }));
        setAg(f);
        setAgApplied(f);
      },
    },
    {
      name: "Most overdue", sub: "AR Ageing · 90+ days first", ready: true,
      apply: () => {
        const f: AgeingFilters = { ...ag, basis: "DUE", sort: "overdue", dir: "desc" };
        setTab("ageing");
        setShow((s) => ({ ...s, group: false }));
        setAg(f);
        setAgApplied(f);
      },
    },
    { name: "GST output · this month", sub: "GST Output · Detail", ready: false },
    { name: "Top customers", sub: "Sales by Customer · Summary", ready: false },
  ];

  const isAgeing = tab === "ageing";
  const needCustomer = tab === "statement" && !stApplied.customer;
  const sheet = isAgeing ? ageingSheet : stmtSheet;
  const report = isAgeing ? ageing : stmt;
  const options = ([
    { key: "value", label: isAgeing ? "Show ageing columns" : "Show full summary", checked: show.value, onChange: (v) => setShow((s) => ({ ...s, value: v })) },
    { key: "group", label: "Group by branch", checked: show.group, onChange: (v) => setShow((s) => ({ ...s, group: v })) },
    { key: "desc", label: isAgeing ? "Show terms" : "Show document types", checked: show.desc, onChange: (v) => setShow((s) => ({ ...s, desc: v })) },
  ] as StudioOption[]).filter((o) => isAgeing || o.key !== "group");

  if (optsError) return <ErrorState message={optsError.message} reference={optsError.reference} onRetry={() => window.location.reload()} />;

  return (
    <ReceivablesStudio
      tab={tab}
      onTab={(k) => {
        setTab(k);
        setActivePreset(null);
      }}
      filters={isAgeing ? ageingFilters : statementFilters}
      onApply={() => {
        setActivePreset(null);
        if (isAgeing) {
          if (ag.asOf) setAgApplied(ag);
        } else if (st.from && st.to) setStApplied(st);
      }}
      view={view}
      onView={setView}
      options={options}
      presets={presetList}
      activePreset={activePreset}
      onPreset={(p) => {
        p.apply?.();
        setActivePreset(p.name);
      }}
      sheet={sheet}
      loading={report.loading}
      error={report.error}
      onRetry={report.retry}
      onExcel={exportCsv}
      emptyNote={needCustomer ? "Choose a customer in Filters, then Apply Filters to see their statement." : null}
    />
  );
}

/* ------------------------------------------------------------------ the studio shell (template 96-studio.js shellHTML, `receivables` config) */
function ReceivablesStudio({
  tab, onTab, filters, onApply, view, onView, options, presets, activePreset, onPreset, sheet, loading, error, onRetry, onExcel, emptyNote,
}: {
  tab: TabKey;
  onTab: (k: TabKey) => void;
  filters: ReactNode;
  onApply: () => void;
  view: "Detail" | "Summary";
  onView: (v: "Detail" | "Summary") => void;
  options: StudioOption[];
  presets: Preset[];
  activePreset: string | null;
  onPreset: (p: Preset) => void;
  sheet: Sheet | null;
  loading: boolean;
  error: { message: string; reference?: string } | null;
  onRetry: () => void;
  onExcel: () => void;
  emptyNote: string | null;
}) {
  const company = useCompanyName();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [fmt, setFmt] = useState<"PDF" | "Excel" | "Print">("PDF");
  const [pageSel, setPage] = useState(1);
  const [two, setTwo] = useState(false);
  const [zoomManual, setZoomManual] = useState<number | null>(null);
  const [fs, setFs] = useState(false);
  const [box, setBox] = useState({ inner: 0, natW: 0, natH: 0 });
  const viewerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomerRef = useRef<HTMLDivElement>(null);
  const [stamp] = useState(() => {
    const d = new Date();
    return `${dmy(isoDay(d))} ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
  });

  useEffect(() => {
    const stage = stageRef.current, zoomer = zoomerRef.current;
    if (!stage || !zoomer) return;
    const measure = () => {
      const cs = getComputedStyle(stage);
      const inner = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setBox((b) => (b.inner === inner && b.natW === zoomer.offsetWidth && b.natH === zoomer.offsetHeight ? b : { inner, natW: zoomer.offsetWidth, natH: zoomer.offsetHeight }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(zoomer);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const on = () => setFs(document.fullscreenElement === viewerRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const total = sheet ? Math.max(1, Math.min(5, 1 + sheet.annexes.length)) : 1;
  const page = Math.min(pageSel, total);
  const pages = two && total > 1 ? (page < total ? [page, page + 1] : [page - 1, page]) : [page];
  const W = Math.round(Math.max(560, Math.min(820, box.inner || 640)));
  const minZoom = two ? 30 : 50;
  const fitZoom = box.natW ? Math.max(minZoom, Math.min(100, Math.floor((box.inner / box.natW) * 100))) : 100;
  const zoom = zoomManual ?? fitZoom;
  const s = zoom / 100;

  const print = () => {
    const html = document.documentElement, v = viewerRef.current;
    html.classList.add("rst-print-mode");
    v?.classList.add("rst-printing");
    const done = () => {
      html.classList.remove("rst-print-mode");
      v?.classList.remove("rst-printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  const generate = () => (fmt === "Excel" ? onExcel() : print());
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void viewerRef.current?.requestFullscreen?.();
  };
  const tabLabel = TABS.find((t) => t.key === tab)!.label;

  const sheetEl = (pg: number) => {
    if (!sheet) return null;
    const annex = pg > 1 ? sheet.annexes[pg - 2] : null;
    return (
      <article key={pg} className="rst-sheet" data-page={pg}>
        <header className="rst-sheet-head">
          <div className="rst-co">
            <span className="rst-cube big">
              <HandCoins />
            </span>
            <div>
              <b>{company || " "}</b>
              <small>Sales &amp; receivables</small>
            </div>
          </div>
          <div className="rst-sheet-title">
            <b>{sheet.name}</b>
            <span>{tabLabel}</span>
            <small>{sheet.period}</small>
            <small>Generated On: {stamp}</small>
            <small>
              Page {pg} of {total}
            </small>
          </div>
        </header>
        {pg === 1 ? (
          <>
            <div className="rst-stats">
              {sheet.stats.map(([Icon, label, value]) => (
                <div key={label}>
                  <span>
                    <Icon />
                  </span>
                  <div>
                    <small>{label}</small>
                    <b>{value}</b>
                  </div>
                </div>
              ))}
            </div>
            <div className="rst-table-wrap">{sheet.table}</div>
            <div className="rst-sheet-foot-grid">
              <div>
                <h4>Summary</h4>
                <table className="rst-kv" data-plain>
                  <tbody>
                    {sheet.summary.map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h4>Report Criteria</h4>
                <table className="rst-kv plain" data-plain>
                  <tbody>
                    {sheet.criteria.map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rst-annex">
              <span>Annexure {pg - 1}</span>
              <b>
                {sheet.groupLabel}: {annex?.group ?? "—"}
              </b>
              <small>
                {annex?.lines ?? 0} {annex?.lines === 1 ? "line" : "lines"} · continued from page 1
              </small>
            </div>
            <div className="rst-table-wrap">{annex?.table}</div>
            <div className="rst-annex-note">
              <FileCheck />
              Figures agree to the {sheet.name} on page 1.
            </div>
          </>
        )}
        <footer className="rst-sheet-footer">
          <span>{company}</span>
          <span>{sheet.name}</span>
          <span>
            Page {pg} of {total}
          </span>
        </footer>
        <div className="rst-skel" aria-hidden>
          <i className="w40" />
          <i className="w70" />
          <i className="band" />
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} className="row" />
          ))}
          <i className="w55" />
        </div>
      </article>
    );
  };

  return (
    <div className={cn("rst-page rst-in", !filtersOpen && "no-filters")}>
      <div className="rst-hero">
        <div className="rst-hero-top">
          <span className="rst-module">
            <span className="rst-cube">
              <HandCoins />
            </span>
            Receivables
          </span>
          <span className="rst-crumb">
            <House />
            <span>Reports</span>
            <ChevronRight />
            <b>AR Ageing &amp; Reports</b>
          </span>
        </div>
        <div className="rst-hero-row">
          <div>
            <h1>Sales &amp; Receivables Studio</h1>
            <p>Ageing, registers and statements for every customer.</p>
          </div>
          <em className="rst-tagline">Every rupee, accounted for</em>
        </div>
      </div>

      <div className="rst-tabs" role="tablist" aria-label="Report type">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab}
            aria-disabled={!t.ready}
            title={t.ready ? undefined : LATER}
            className={cn("rst-tab", t.key === tab && "active", !t.ready && "pst-off")}
            onClick={() => t.ready && onTab(t.key)}
          >
            <t.icon />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="rst-grid">
        <div className="rst-fcol">
          <aside className="rst-panel rst-filters" aria-label="Filters">
            <div className="rst-panel-head">
              <SlidersHorizontal />
              <b>Filters</b>
              <button type="button" className="rst-x" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
                <X />
              </button>
            </div>
            <div className="rst-fields">{filters}</div>
            <button type="button" className="rst-primary rst-apply" onClick={onApply}>
              <span className="rst-fill" />
              <SlidersHorizontal />
              <span>Apply Filters</span>
            </button>
          </aside>
        </div>

        <section ref={viewerRef} className="rst-panel rst-viewer" aria-label="Report preview">
          <div className="rst-toolbar">
            <button type="button" className="rst-tool rst-show-filters" title="Show filters" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal />
              <span>Filters</span>
            </button>
            <button type="button" className="rst-tool" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>
              <ChevronLeft />
            </button>
            <span className="rst-pageno" aria-live="polite">
              {page} / {total}
            </span>
            <button type="button" className="rst-tool" aria-label="Next page" disabled={page >= total} onClick={() => setPage(Math.min(total, page + 1))}>
              <ChevronRight />
            </button>
            <span className="rst-zoom">
              <button type="button" aria-label="Zoom out" disabled={zoom <= minZoom} onClick={() => setZoomManual(Math.max(minZoom, zoom - 10))}>
                <Minus />
              </button>
              <b className="rst-zoomval">{zoom}%</b>
              <button type="button" aria-label="Zoom in" disabled={zoom >= 200} onClick={() => setZoomManual(Math.min(200, zoom + 10))}>
                <Plus />
              </button>
            </span>
            <button type="button" className="rst-tool wide" title="Fit width" onClick={() => setZoomManual(null)}>
              <Square />
              <span>Fit Width</span>
            </button>
            <button type="button" className={cn("rst-tool wide", two && "on")} title="Two pages" aria-pressed={two} onClick={() => setTwo(!two)}>
              <Columns2 />
              <span>Two Pages</span>
            </button>
            <span className="rst-tool-gap" />
            <button type="button" className="rst-tool tall" onClick={onExcel} disabled={!sheet}>
              <Download />
              <small>Download</small>
            </button>
            <button type="button" className="rst-tool tall" onClick={print} disabled={!sheet}>
              <Printer />
              <small>Print</small>
            </button>
            <button type="button" className="rst-tool tall" onClick={fullscreen}>
              <span className="rst-fs-ico">{fs ? <Minimize /> : <Maximize />}</span>
              <small>Fullscreen</small>
            </button>
          </div>
          <div className="rst-canvas">
            <div className="rst-thumbs" role="listbox" aria-label="Pages">
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" role="option" className={cn(pages.includes(n) && "on")} aria-selected={pages.includes(n)} aria-label={`Page ${n}`} onClick={() => setPage(n)}>
                  <span className="rst-thumb">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <small>{n}</small>
                </button>
              ))}
            </div>
            <div ref={stageRef} className={cn("rst-stage", loading && "is-loading")}>
              {error ? (
                <div style={{ maxWidth: 520, margin: "40px auto" }}>
                  <ErrorState message={error.message} reference={error.reference} onRetry={onRetry} />
                </div>
              ) : null}
              <div className="rst-zoom-box" style={{ width: Math.round(box.natW * s), height: Math.round(box.natH * s), display: error ? "none" : undefined }}>
                <div ref={zoomerRef} className={cn("rst-zoomer", pages.length > 1 && "two")} style={{ ["--rst-w" as string]: `${W}px`, transform: `scale(${s})` }}>
                  {sheet ? pages.map(sheetEl) : emptyNote ? <NoteSheet text={emptyNote} /> : <PlaceholderSheet />}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="rst-side">
          <div className="rst-panel rst-options">
            <div className="rst-panel-head">
              <Settings2 />
              <b>Report Options</b>
            </div>
            <div className="rst-fld">
              <div className="rst-fld-head plain">
                <b>Report Type</b>
              </div>
              <Sel label="Report type" value={tab} onChange={(k) => onTab(k as TabKey)}>
                {TABS.map((t) => (
                  <option key={t.key} value={t.key} disabled={!t.ready}>
                    {t.label}
                    {t.ready ? "" : " — later"}
                  </option>
                ))}
              </Sel>
            </div>
            <div className="rst-fld">
              <div className="rst-fld-head plain">
                <b>View Mode</b>
              </div>
              <div className="rst-seg" role="group">
                {(["Detail", "Summary"] as const).map((v) => (
                  <button key={v} type="button" className={cn(view === v && "on")} aria-pressed={view === v} onClick={() => onView(v)}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="rst-checks">
              {options.map((o) => (
                <label key={o.key}>
                  <input type="checkbox" checked={o.checked} onChange={(e) => o.onChange(e.target.checked)} />
                  <span>{o.label}</span>
                  <span className="rst-switch" aria-hidden />
                </label>
              ))}
            </div>
            <div className="rst-panel-head sub">
              <FileOutput />
              <b>Output Format</b>
            </div>
            <div className="rst-seg three" role="group">
              {(["PDF", "Excel", "Print"] as const).map((f) => (
                <button key={f} type="button" className={cn(fmt === f && "on")} aria-pressed={fmt === f} onClick={() => setFmt(f)}>
                  {f}
                </button>
              ))}
            </div>
            <button type="button" className="rst-primary rst-generate" onClick={generate} disabled={!sheet}>
              <span className="rst-fill" />
              <FileCheck />
              <span className="rst-gen-label">Generate Report</span>
            </button>
          </div>
          <div className="rst-panel rst-presets">
            <div className="rst-panel-head">
              <Bookmark />
              <b>Saved Presets</b>
              <button type="button" className="rst-link" disabled title="Saved presets come with the reports phase">
                Manage
              </button>
            </div>
            <div className="rst-preset-list">
              {presets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={cn("rst-preset", activePreset === p.name && "on", !p.ready && "pst-off")}
                  disabled={!p.ready}
                  title={p.ready ? undefined : LATER}
                  onClick={() => onPreset(p)}
                >
                  {p.star ? (
                    <Star className="rst-star" />
                  ) : (
                    <span className="rst-box">
                      <FileCheck />
                    </span>
                  )}
                  <div>
                    <b>{p.name}</b>
                    <small>{p.sub}</small>
                  </div>
                  <ChevronRight className="rst-chev" />
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PlaceholderSheet() {
  return (
    <article className="rst-sheet">
      <div className="rst-skel" aria-hidden style={{ opacity: 1 }}>
        <i className="w40" />
        <i className="w70" />
        <i className="band" />
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} className="row" />
        ))}
        <i className="w55" />
      </div>
    </article>
  );
}

function NoteSheet({ text }: { text: string }) {
  return (
    <article className="rst-sheet pst-note">
      <div>
        <FileText />
        <b>Customer Statement</b>
        <p>{text}</p>
      </div>
    </article>
  );
}
