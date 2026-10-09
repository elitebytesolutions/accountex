"use client";

import "./reports-centre-screen.css";
import {
  ArrowRight, Banknote, BookOpen, Boxes, Building2, Calendar, CalendarClock, ChartColumn, CircleAlert, Columns2, Download, FileCheck,
  FileText, FolderOpen, Hourglass, Landmark, Layers, Loader, Package, Percent, Play, Receipt, RefreshCw, Scale, Search, Star, Target, Users,
  Wallet, Waves, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReportRun } from "@/shared";
import { REPORT_SOURCES, type SavedReportSummary } from "@/shared/reports/saved-report";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { listSavedReports } from "../api";
import { listReportRuns, reportRunDownloadUrl, runSavedReport } from "../runs-api";

type Cat = "all" | "fin" | "trade" | "inv" | "people";
type Tile = "green" | "blue" | "violet" | "lime" | "orange" | "red";
/** A report card; `href: null` = not built yet (shown disabled, "Coming soon"). */
type Card = { title: string; desc: string; cat: Cat; icon: LucideIcon; tone: Tile; pill: string; pillIcon: LucideIcon; href: string | null; featured?: boolean };
type Err = { message: string; reference?: string };
type Load<T> = { status: "loading" } | { status: "error"; error: Err } | { status: "ready"; data: T };

const CATS: { key: Cat; label: string }[] = [
  { key: "all", label: "All" },
  { key: "fin", label: "Financial" },
  { key: "trade", label: "Sales & Purchases" },
  { key: "inv", label: "Inventory" },
  { key: "people", label: "People" },
];

/** Template cards, linked only to screens that exist; the rest stay visible but disabled until their phase ships. */
const CARDS: Card[] = [
  { title: "Profit & Loss", desc: "Revenue, expenses and profit for a period", cat: "fin", icon: ChartColumn, tone: "green", pill: "Financial Studio", pillIcon: Landmark, href: null },
  { title: "Balance Sheet", desc: "Assets, liabilities and equity position", cat: "fin", icon: Columns2, tone: "blue", pill: "Financial Studio", pillIcon: Landmark, href: null },
  { title: "Trial Balance", desc: "All ledger balances with debit and credit", cat: "fin", icon: Scale, tone: "violet", pill: "Financial Studio", pillIcon: Landmark, href: "/reports/trial-balance", featured: true },
  { title: "Cash Flow", desc: "Cash inflows and outflows, indirect method", cat: "fin", icon: Waves, tone: "lime", pill: "Financial Studio", pillIcon: Landmark, href: null },
  { title: "General Ledger", desc: "Transactions with running balances", cat: "fin", icon: BookOpen, tone: "orange", pill: "Financial Studio", pillIcon: Landmark, href: "/reports/gl" },
  { title: "Day Book", desc: "Every voucher posted on a single day", cat: "fin", icon: Calendar, tone: "red", pill: "Financial Studio", pillIcon: Landmark, href: "/reports/day-book" },
  { title: "Account Ledger", desc: "Detailed activity for a single account", cat: "fin", icon: Wallet, tone: "blue", pill: "Accounts", pillIcon: BookOpen, href: "/accounting/ledger" },
  { title: "Budget vs Actual", desc: "Budgeted against posted amounts by period", cat: "fin", icon: Target, tone: "green", pill: "Budgets", pillIcon: Landmark, href: "/budgets/variance" },
  { title: "Asset Register", desc: "Fixed assets, cost and depreciation", cat: "fin", icon: Building2, tone: "violet", pill: "Fixed assets", pillIcon: Package, href: "/assets" },
  { title: "Report Studio", desc: "Build, save and share your own reports", cat: "fin", icon: Layers, tone: "lime", pill: "Custom reports", pillIcon: Layers, href: "/reports/studio" },
  { title: "Inventory Studio", desc: "Stock, valuation, movement and counts", cat: "inv", icon: Boxes, tone: "green", pill: "Inventory", pillIcon: Package, href: null },
  { title: "AR Ageing", desc: "What customers owe, by age bucket", cat: "trade", icon: Hourglass, tone: "violet", pill: "Sales & Receivables", pillIcon: Users, href: "/receivables/ageing" },
  { title: "AP Ageing", desc: "What you owe suppliers, by age bucket", cat: "trade", icon: Receipt, tone: "orange", pill: "Purchases & Payables", pillIcon: Building2, href: "/payables/ageing" },
  { title: "Payroll Studio", desc: "Register, bank advice, EOBI, PESSI and tax", cat: "people", icon: Banknote, tone: "lime", pill: "Payroll", pillIcon: Percent, href: null },
  { title: "HR Studio", desc: "Headcount, attendance, leave and turnover", cat: "people", icon: Users, tone: "red", pill: "HR", pillIcon: CalendarClock, href: null },
];

const errOf = (e: unknown, fallback: string): Err => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback });
const sourceLabel = (s: string | null) => (s ? ((REPORT_SOURCES as Record<string, { label: string }>)[s]?.label ?? s) : "—");

export function ReportsCentreScreen({ userId, timeZone }: { userId: string; userName: string; timeZone: string }) {
  const toast = useToast();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Cat>("all");
  const [savedRaw, setSaved] = useState<(Load<SavedReportSummary[]> & { n: number }) | null>(null);
  const [runsRaw, setRuns] = useState<(Load<{ items: ReportRun[]; total: number }> & { n: number }) | null>(null);
  const [quiet, setQuiet] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const when = useMemo(() => {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    return (iso: string) => f.format(new Date(iso)).replace(" am", " AM").replace(" pm", " PM");
  }, [timeZone]);

  /* Each list reloads when its nonce changes; "loading" = no result for the current nonce yet. */
  const [savedN, setSavedN] = useState(0);
  const [runsN, setRunsN] = useState(0);
  useEffect(() => {
    let live = true;
    listSavedReports().then((data) => live && setSaved({ n: savedN, status: "ready", data }), (e) => live && setSaved({ n: savedN, status: "error", error: errOf(e, "Could not load saved reports") }));
    return () => { live = false; };
  }, [savedN]);
  useEffect(() => {
    let live = true;
    listReportRuns({ pageSize: 10 }).then((data) => live && setRuns({ n: runsN, status: "ready", data }), (e) => live && setRuns({ n: runsN, status: "error", error: errOf(e, "Could not load recent runs") }));
    return () => { live = false; };
  }, [runsN]);
  const saved: Load<SavedReportSummary[]> = savedRaw && savedRaw.n === savedN ? savedRaw : { status: "loading" };
  /* After a run the list refreshes quietly: the previous rows stay until the new ones arrive. */
  const runs: Load<{ items: ReportRun[]; total: number }> = runsRaw && (runsRaw.n === runsN || (quiet && runsRaw.status === "ready")) ? runsRaw : { status: "loading" };
  const loadSaved = () => setSavedN((n) => n + 1);
  const loadRuns = (q = false) => { setQuiet(q); setRunsN((n) => n + 1); };

  /* Ctrl/Cmd+K focuses the hub search (template enterHub). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const needle = q.trim().toLowerCase();
  const matches = (c: Card) => !needle || `${c.title} ${c.desc} ${c.pill}`.toLowerCase().includes(needle);
  const shown = CARDS.filter((c) => (cat === "all" || c.cat === cat) && matches(c));
  const count = (k: Cat) => CARDS.filter((c) => k === "all" || c.cat === k).length;

  async function run(r: SavedReportSummary) {
    setRunning(r.id);
    try {
      const out = await runSavedReport(r.id);
      if (out.status === "FAILED") toast(out.errorMessage ?? `${r.name} could not be generated`, { tone: "danger", ms: 6000 });
      else
        toast(`${out.title} is ready${out.rowCount !== null ? ` · ${out.rowCount.toLocaleString("en-US")} rows` : ""}`, {
          tone: "good", ms: 8000, action: { label: "Download", onClick: () => window.open(reportRunDownloadUrl(out.id), "_blank") },
        });
      loadRuns(true);
    } catch (e) {
      toast(errOf(e, "Could not run the report").message, { tone: "danger" });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="rpc-page rpc-in">
      <div className="rpc-hero">
        <div>
          <span className="rpc-eyebrow">Reports / Reports Centre</span>
          <h1>Reports Centre</h1>
          <p>Generate, view and share accurate reports from your live books, with powerful filters, flexible formats and professional templates.</p>
        </div>
        <div className="rpc-hero-actions">
          <label className="rpc-search">
            <Search />
            <input
              ref={searchRef}
              type="search"
              value={q}
              placeholder="Search reports, studios or templates…"
              aria-label="Search reports"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { const c = shown.find((x) => x.href); if (c?.href) router.push(c.href); }
                if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); }
              }}
            />
            <kbd>Ctrl K</kbd>
          </label>
          <ButtonLink variant="primary" href="/reports/trial-balance" icon={<FileCheck />}>Generate Report</ButtonLink>
          <ButtonLink variant="secondary" href="/reports/studio" icon={<Layers />}>Template Library</ButtonLink>
        </div>
        <div className="rpc-tagline" aria-hidden="true">
          <span>Turning numbers<br />into smarter decisions</span>
          <svg viewBox="0 0 46 34"><path d="M3 30 C 14 28, 30 22, 40 6" /><path d="M33 7 L 41 5 L 42 13" /></svg>
        </div>
      </div>

      {/* Deviation: the template's Revenue / Assets / Liabilities / Net profit / Books balanced KPIs need the financial
          statements (a later phase), so this strip shows only figures the reporting module really has. */}
      <div className="rpc-kpis rpc-kpis-live">
        <div className="rpc-kpi">
          <span className="icon-tile"><Layers /></span>
          <div><small>Saved reports</small><b>{saved.status === "ready" ? saved.data.length : "—"}</b><em><span>{saved.status === "ready" ? `${saved.data.filter((r) => r.owner.id === userId).length} yours` : "In Report Studio"}</span></em></div>
        </div>
        <div className="rpc-kpi">
          <span className="icon-tile blue"><FileText /></span>
          <div><small>Report runs</small><b>{runs.status === "ready" ? runs.data.total.toLocaleString("en-US") : "—"}</b><em><span>CSV files generated</span></em></div>
        </div>
        <div className="rpc-kpi">
          <span className="icon-tile violet"><CalendarClock /></span>
          <div>
            <small>Last run</small>
            <b className="rpc-kpi-txt">{runs.status === "ready" && runs.data.items[0] ? runs.data.items[0].title : "—"}</b>
            <em><span>{runs.status === "ready" && runs.data.items[0] ? when(runs.data.items[0].startedAt) : "Nothing run yet"}</span></em>
          </div>
        </div>
        <div className="rpc-kpi status">
          <span className="icon-tile"><ChartColumn /></span>
          <div><small>Financial statements</small><b><i />Coming soon</b><em>Profit &amp; Loss, Balance Sheet and Cash Flow arrive in a later phase.</em></div>
        </div>
      </div>

      <div className="rpc-section-head">
        <h2>Choose a report</h2>
        <div className="rpc-chips" role="group" aria-label="Report category">
          {CATS.map((c) => (
            <button key={c.key} type="button" className={cn(cat === c.key && "active")} onClick={() => setCat(c.key)}>
              {c.label} <i>{count(c.key)}</i>
            </button>
          ))}
        </div>
      </div>
      <div className="rpc-cards">
        {shown.map((c) => {
          const body = (
            <>
              <span className={cn("icon-tile", c.tone !== "green" && c.tone)}><c.icon /></span>
              <b>{c.title}</b>
              <p>{c.desc}</p>
              <span className="pill"><c.pillIcon />{c.href ? c.pill : "Coming soon"}</span>
              {c.href && <span className="rpc-go"><ArrowRight /></span>}
            </>
          );
          return c.href ? (
            <Link key={c.title} className={cn("rpc-card", c.featured && "featured")} href={c.href}>{body}</Link>
          ) : (
            <div key={c.title} className="rpc-card soon" aria-disabled="true" title="Coming in a later phase">{body}</div>
          );
        })}
        {shown.length === 0 && <div className="rpc-noresult">No reports match your search. Try “ledger”, “ageing” or “budget”.</div>}
      </div>

      <div className="rpc-work">
        <div className="panel">
          <div className="panel-head">
            <div><h3>Recent runs</h3><p>Your latest generated reports</p></div>
            <div className="panel-actions"><Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={() => loadRuns()}>Refresh</Button></div>
          </div>
          {runs.status === "loading" && <div className="rpc-skel">{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 44 }} />)}</div>}
          {runs.status === "error" && <ErrorState message={runs.error.message} reference={runs.error.reference} onRetry={() => loadRuns()} />}
          {runs.status === "ready" && runs.data.items.length === 0 && (
            <EmptyState icon={<FileText />} title="No runs yet" description="Run a saved report and its CSV file shows up here." />
          )}
          {runs.status === "ready" && runs.data.items.map((r) => (
            <div key={r.id} className="rpc-recent rpc-run">
              <span>{r.status === "FAILED" ? <CircleAlert /> : r.status === "RUNNING" ? <Loader /> : <FileText />}</span>
              <div>
                <b title={r.title}>{r.title}</b>
                <small>{when(r.startedAt)}{r.runBy ? ` · ${r.runBy.name}` : ""}{r.status === "COMPLETED" && r.rowCount !== null ? ` · ${r.rowCount.toLocaleString("en-US")} rows` : ""}</small>
                {r.status === "FAILED" && r.errorMessage && <small className="rpc-run-err">{r.errorMessage}</small>}
              </div>
              <div className="rpc-run-r">
                <Badge tone="info">{r.format}</Badge>
                {r.status === "COMPLETED" ? (
                  <a className="icon-btn-sm" href={reportRunDownloadUrl(r.id)} aria-label={`Download ${r.title}`} title="Download"><Download /></a>
                ) : (
                  <Badge tone={r.status === "FAILED" ? "danger" : "info"} dot>{r.status === "FAILED" ? "Failed" : r.status === "RUNNING" ? "Running" : r.status}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="stack">
          <div className="panel flush">
            <div className="panel-head rpc-flush-head">
              <div><h3>Saved reports</h3><p>Reports you own or that are shared with you</p></div>
              <div className="panel-actions"><ButtonLink variant="secondary" size="sm" href="/reports/studio" icon={<Layers />}>Report Studio</ButtonLink></div>
            </div>
            {saved.status === "loading" && <div className="rpc-skel pad">{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 38 }} />)}</div>}
            {saved.status === "error" && <div className="rpc-pad"><ErrorState message={saved.error.message} reference={saved.error.reference} onRetry={loadSaved} /></div>}
            {saved.status === "ready" && saved.data.length === 0 && (
              <EmptyState icon={<Layers />} title="No saved reports" description="Build a report in Report Studio and save it to run it from here."
                action={<ButtonLink variant="primary" size="sm" href="/reports/studio" icon={<Layers />}>Open Report Studio</ButtonLink>} />
            )}
            {saved.status === "ready" && saved.data.length > 0 && (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Report</th><th>Source</th><th>Owner</th><th>Updated</th><th /></tr></thead>
                  <tbody>
                    {saved.data.map((r) => (
                      <tr key={r.id}>
                        <td><b>{r.isFavourite && <Star className="rpc-fav" aria-label="Favourite" />}{r.name}</b><small>{r.folder}</small></td>
                        <td>{sourceLabel(r.sourceEntity)}</td>
                        <td>{r.owner.id === userId ? "You" : r.owner.name}</td>
                        <td>{when(r.updatedAt)}</td>
                        <td className="actions">
                          <div className="rpc-row-acts">
                            <Button size="sm" variant="secondary" icon={<Play />} disabled={running !== null} onClick={() => run(r)}>{running === r.id ? "Running…" : "Run"}</Button>
                            <ButtonLink size="sm" variant="ghost" href="/reports/studio" icon={<FolderOpen />}>Open in Studio</ButtonLink>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel flush">
            <div className="panel-head rpc-flush-head"><div><h3>Scheduled reports</h3><p>Delivered automatically by email</p></div></div>
            <EmptyState icon={<CalendarClock />} title="No delivery yet" description="Schedules are set in Report Studio; delivery by email arrives later." />
          </div>
        </div>
      </div>
    </div>
  );
}
