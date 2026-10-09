"use client";

import "./report-studio.css";
import {
  BookOpen, Calendar, ChevronDown, ChevronLeft, ChevronRight, Columns2, Download, FileCheck, FileOutput, House, Landmark, Maximize, Minimize, Minus, Plus,
  Printer, Scale, Settings2, SlidersHorizontal, Square, TrendingUp, Wallet, Waves, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SessionUser } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ErrorState } from "@/components/ui/states";
import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { isoDay } from "@/features/finance/components/finance-ui";

/* ------------------------------------------------------------------ formatting (template N / Rs / fmtDate) */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const num = (v: number, dec = 0) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
/** "01 Sep 2026" */
export const dmy = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]} ${MON[Number(m[2]) - 1]} ${m[1]}` : (iso ?? "");
};
/** Template statValue(): "Rs" small, then the figure. */
export function RsStat({ value }: { value: number }) {
  return (
    <>
      {value < 0 && "("}
      <small>Rs</small> {num(Math.abs(value))}
      {value < 0 && ")"}
    </>
  );
}
/** Template cellHTML() for numbers: "—" for zero, brackets for negatives. */
export function NumCell({ v, dec = 0, className }: { v: number | null | undefined; dec?: number; className?: string }) {
  if (v === null || v === undefined) return <td className={cn("num", className)} />;
  if (v === 0) return <td className={cn("num zero", className)}>—</td>;
  if (v < 0) return <td className={cn("num neg", className)}>({num(-v, dec)})</td>;
  return <td className={cn("num", className)}>{num(v, dec)}</td>;
}
export const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

/* ------------------------------------------------------------------ periods */
export type Period = { key: string; label: string; from: string; to: string };
/** Period presets relative to today and the fiscal year that contains it. */
export function periodPresets(fyStart: string | null): Period[] {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const d = (yy: number, mm: number, dd: number) => isoDay(new Date(yy, mm, dd));
  const fy = fyStart ? new Date(`${fyStart}T00:00:00`) : new Date(m >= 6 ? y : y - 1, 6, 1);
  const fyM = fy.getMonth(), fyY = fy.getFullYear();
  const months = (y - fyY) * 12 + (m - fyM);
  const qStart = new Date(fyY, fyM + Math.floor(months / 3) * 3, 1);
  const qN = Math.floor(months / 3) + 1;
  const fyLabel = `FY ${fyY}-${String((fyY + 1) % 100).padStart(2, "0")}`;
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
  return [
    { key: "q", label: `Q${qN} ${fyLabel} (${MON[qStart.getMonth()]}–${MON[qEnd.getMonth()]})`, from: isoDay(qStart), to: isoDay(qEnd) },
    { key: "m", label: `${new Date(y, m, 1).toLocaleString("en-US", { month: "long" })} ${y}`, from: d(y, m, 1), to: d(y, m + 1, 0) },
    { key: "lm", label: `${new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" })} ${new Date(y, m - 1, 1).getFullYear()}`, from: d(y, m - 1, 1), to: d(y, m, 0) },
    { key: "ytd", label: "Year to date", from: isoDay(fy), to: isoDay(now) },
    { key: "custom", label: "Custom range", from: "", to: "" },
  ];
}

/* ------------------------------------------------------------------ data */
/** The signed-in company's name for the sheet header. */
export function useCompanyName() {
  const [name, setName] = useState("");
  useEffect(() => {
    let off = false;
    apiRequest<SessionUser>("/auth/me").then((u) => !off && setName(u.tenantName)).catch(() => {});
    return () => {
      off = true;
    };
  }, []);
  return name;
}

/** Loads `load()` whenever `key` changes; `loading` is true until the data for the current key arrives. */
export function useReport<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data: T | null; error: { message: string; reference?: string } | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    if (!key) return;
    let off = false;
    loadRef.current()
      .then((data) => !off && setState({ key, data, error: null }))
      .catch((e: unknown) => !off && setState({ key, data: null, error: e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the report" } }));
    return () => {
      off = true;
    };
  }, [key, nonce]);
  const current = state && state.key === key ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !!key && !current, retry: () => setNonce((n) => n + 1) };
}

/* ------------------------------------------------------------------ filter fields */
export function Fld({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="rst-fld">
      <div className="rst-fld-head">
        <Icon />
        <b>{label}</b>
      </div>
      {children}
    </div>
  );
}
export function Sel({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="rst-select">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <ChevronDown />
    </label>
  );
}
export function DateIn({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="rst-select rst-date">
      <input type="date" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
export function Toggle({ text, checked, onChange }: { text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="rst-switch-row">
      <input type="checkbox" className="rst-sw-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="rst-switch" aria-hidden />
      <span>{text}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ the studio shell */
type TabKey = "tb" | "pnl" | "bs" | "cf" | "gl" | "daybook";
const TABS: { key: TabKey | "ledger"; label: string; icon: LucideIcon; href: string }[] = [
  { key: "tb", label: "Trial Balance", icon: Scale, href: "/reports/trial-balance" },
  { key: "pnl", label: "Profit & Loss", icon: TrendingUp, href: "/reports/pnl" },
  { key: "bs", label: "Balance Sheet", icon: Columns2, href: "/reports/balance-sheet" },
  { key: "cf", label: "Cash Flow", icon: Waves, href: "/reports/cash-flow" },
  { key: "gl", label: "General Ledger", icon: BookOpen, href: "/reports/gl" },
  { key: "daybook", label: "Day Book", icon: Calendar, href: "/reports/day-book" },
  { key: "ledger", label: "Account Ledger", icon: Wallet, href: "/accounting/ledger" },
];

export type Sheet = {
  /** Report title on the sheet, e.g. "Trial Balance". */
  name: string;
  period: string;
  stats: [LucideIcon, string, ReactNode][];
  summary: [string, ReactNode][];
  criteria: [string, string][];
  /** Page 1 table. */
  table: ReactNode;
  /** One annexure page per group (at most four), as in the template. */
  annexes: { group: string; lines: number; table: ReactNode }[];
  groupLabel: string;
};
export type StudioOption = { key: string; label: string; checked: boolean; onChange: (v: boolean) => void };

/** Template Financial Report Studio (45-studios.html shell, 96-studio.js): hero, report tabs, filters, paged preview, options. */
export function ReportStudio({
  tab, filters, onApply, view, onView, options, sheet, loading, error, onRetry, onExcel,
}: {
  tab: TabKey;
  filters: ReactNode;
  onApply: () => void;
  view: "Detail" | "Summary";
  onView: (v: "Detail" | "Summary") => void;
  options: StudioOption[];
  sheet: Sheet | null;
  loading: boolean;
  error: { message: string; reference?: string } | null;
  onRetry: () => void;
  onExcel: () => void;
}) {
  const router = useRouter();
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

  // Measure the stage and the unscaled sheets (ResizeObserver callbacks; the zoom is derived from these).
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

  const sheetEl = (pg: number) => {
    if (!sheet) return null;
    const annex = pg > 1 ? sheet.annexes[pg - 2] : null;
    return (
      <article key={pg} className="rst-sheet" data-page={pg}>
        <header className="rst-sheet-head">
          <div className="rst-co">
            <span className="rst-cube big">
              <Landmark />
            </span>
            <div>
              <b>{company || " "}</b>
              <small>Financial statements</small>
            </div>
          </div>
          <div className="rst-sheet-title">
            <b>{sheet.name}</b>
            <span>{sheet.name}</span>
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
              <Landmark />
            </span>
            Finance
          </span>
          <span className="rst-crumb">
            <House />
            <span>Reports</span>
            <ChevronRight />
            <b>Financial Statements</b>
          </span>
        </div>
        <div className="rst-hero-row">
          <div>
            <h1>Financial Report Studio</h1>
            <p>Statements, ledgers and ratios from your live books, ready to review, print and share.</p>
          </div>
          <em className="rst-tagline">Numbers that tell the story</em>
        </div>
      </div>

      <div className="rst-tabs" role="tablist" aria-label="Report type">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} role="tab" aria-selected={t.key === tab} className={cn("rst-tab", t.key === tab && "active")}>
            <t.icon />
            <span>{t.label}</span>
          </Link>
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
                  {sheet ? pages.map(sheetEl) : <PlaceholderSheet />}
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
              <Sel label="Report type" value={tab} onChange={(k) => router.push(TABS.find((t) => t.key === k)!.href)}>
                {TABS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
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
        </aside>
      </div>
    </div>
  );
}

/** An empty sheet while the first load runs (the skeleton shows over it). */
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
