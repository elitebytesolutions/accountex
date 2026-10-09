"use client";

import { Boxes, CalendarRange, CircleCheck, Download, FileClock, History, Landmark, RefreshCw, Send, Trash2, TrendingDown, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AssetOptions, DepreciationRun, DepreciationRunList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { assetOptions, deleteRun, getRun, listRuns, postRun, previewRun, recomputeRun, reverseRun } from "../register-api";
import "./depreciation-screen.css";

type Can = { create: boolean; edit: boolean; delete: boolean; post: boolean; approve: boolean };
type RunRow = DepreciationRunList["items"][number];
type Period = AssetOptions["periods"][number];
type Line = DepreciationRun["lines"][number];

const RUN_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, POSTED: { label: "Posted", tone: "good" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const day = (iso: string) => iso.slice(8, 10);
const monthName = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
const periodLabel = (p: Pick<Period, "code" | "startDate" | "endDate">) => `${p.code} (${day(p.startDate)}–${dateLabel(p.endDate)})`;
function stamp(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const h = d.getHours();
  return `${dateLabel(iso)}, ${String(h % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** "FY 2026-27" from the periods of one fiscal year. */
function fyLabel(periods: Period[], fyId: string | undefined) {
  const ps = periods.filter((p) => p.fiscalYearId === fyId);
  if (!ps.length) return "";
  const start = ps.reduce((m, p) => (p.startDate < m ? p.startDate : m), ps[0]!.startDate);
  const end = ps.reduce((m, p) => (p.endDate > m ? p.endDate : m), ps[0]!.endDate);
  return start.slice(0, 4) === end.slice(0, 4) ? `FY ${start.slice(0, 4)}` : `FY ${start.slice(0, 4)}-${end.slice(2, 4)}`;
}

function RunStatus({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

/** Template app/assets/depreciation (42-acc-reports.html): parameters, KPIs, computed depreciation by category, journal preview, run history, post modal. */
export function DepreciationScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [options, setOptions] = useState<AssetOptions | null>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [periodId, setPeriodId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [postingDate, setPostingDate] = useState("");
  const [run, setRun] = useState<DepreciationRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<{ title: string; message: string } | null>(null);
  const [ask, setAsk] = useState<"post" | "reverse" | "delete" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadRun = async (id: string) => {
    setRunLoading(true);
    try {
      const r = await getRun(id);
      setRun(r);
      setPeriodId(r.period.id);
      setPostingDate(r.postingDate);
      setBranchId(r.branch?.id ?? "");
      setCategoryId(r.category?.id ?? "");
    } catch (e) {
      toast(errMsg(e, "Could not load the run"), { tone: "danger" });
    } finally {
      setRunLoading(false);
    }
  };

  const choosePeriod = (pid: string, o: AssetOptions | null = options, rs2: RunRow[] | null = runs) => {
    const p = o?.periods.find((x) => x.id === pid);
    setPeriodId(pid);
    setPostingDate(p?.endDate ?? "");
    setActionErr(null);
    const existing = rs2?.find((r) => r.period.id === pid && r.status !== "CANCELLED");
    if (existing) void loadRun(existing.id);
    else setRun(null);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([assetOptions(), listRuns({ pageSize: 500 })])
      .then(([o, l]) => {
        if (cancelled) return;
        setOptions(o);
        setRuns(l.items);
        setLoadErr(null);
        const lastPosted = l.items.filter((r) => r.status === "POSTED").sort((a, b) => (a.period.endDate < b.period.endDate ? 1 : -1))[0];
        const open = o.periods.filter((p) => p.status === "OPEN").sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
        const pick = open.find((p) => !lastPosted || p.startDate > lastPosted.period.endDate) ?? open[0];
        if (pick) choosePeriod(pick.id, o, l.items);
      })
      .catch((e: unknown) => !cancelled && setLoadErr(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load depreciation" }));
    return () => { cancelled = true; };
  // choosePeriod only reads the values passed in
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const reloadRuns = () => listRuns({ pageSize: 500 }).then((l) => setRuns(l.items)).catch(() => undefined);

  const periods = useMemo(() => {
    const ps = (options?.periods ?? []).filter((p) => p.status === "OPEN");
    if (run && !ps.some((p) => p.id === run.period.id)) {
      const full = options?.periods.find((p) => p.id === run.period.id);
      ps.push(full ?? { ...run.period, fiscalYearId: "" });
    }
    return ps.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  }, [options, run]);
  const period = options?.periods.find((p) => p.id === periodId) ?? (run && run.period.id === periodId ? { ...run.period, fiscalYearId: "" } : undefined);
  const posted = (runs ?? []).filter((r) => r.status === "POSTED");
  const fyPeriods = new Set((options?.periods ?? []).filter((p) => period && p.fiscalYearId === period.fiscalYearId).map((p) => p.id));
  const fyRuns = (runs ?? []).filter((r) => fyPeriods.has(r.period.id) && r.status !== "CANCELLED");
  const fy = fyLabel(options?.periods ?? [], period?.fiscalYearId);

  // KPIs
  const live = run && run.status !== "CANCELLED" ? run : null;
  const prevPosted = period ? posted.filter((r) => r.period.endDate < period.startDate).sort((a, b) => (a.period.endDate < b.period.endDate ? 1 : -1))[0] : undefined;
  const ytdRuns = period ? posted.filter((r) => fyPeriods.has(r.period.id) && r.period.startDate <= period.startDate && r.id !== live?.id) : [];
  const ytd = ytdRuns.reduce((s, r) => s + r.totalDepreciation, 0) + (live?.totalDepreciation ?? 0);
  const fyStart = (options?.periods ?? []).filter((p) => fyPeriods.has(p.id)).reduce<string | null>((m, p) => (!m || p.startDate < m ? p.startDate : m), null);
  const versus = !live || !prevPosted ? null
    : Math.abs(live.totalDepreciation - prevPosted.totalDepreciation) < 0.005 ? `Same as ${prevPosted.period.code}`
    : `${rs(Math.abs(live.totalDepreciation - prevPosted.totalDepreciation))} ${live.totalDepreciation > prevPosted.totalDepreciation ? "more" : "less"} than ${prevPosted.period.code}`;

  // statement grouped by category
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; lines: Line[] }>();
    for (const l of run?.lines ?? []) {
      const g = m.get(l.category.id) ?? { name: l.category.name, lines: [] };
      g.lines.push(l);
      m.set(l.category.id, g);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [run]);
  const sum = (ls: Line[], f: (l: Line) => number) => ls.reduce((s, l) => s + f(l), 0);
  const jp = run?.journalPreview ?? [];
  const dr = jp.reduce((s, l) => s + l.debit, 0);
  const cr = jp.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.abs(dr - cr) < 0.005;
  const periodOpen = run?.period.status === "OPEN";

  const fail = (e: unknown, title: string, fallback: string) => {
    if (e instanceof ApiError && ["PERIOD_NOT_OPEN", "DEPRECIATION_RUN_NOT_DRAFT", "CONCURRENCY_CONFLICT"].includes(e.code)) setActionErr({ title, message: e.message });
    else if (e instanceof ApiError && e.details && Object.keys(e.details).length && e.status === 400) setActionErr({ title, message: Object.values(e.details).map((v) => v[0]).join(" · ") });
    else toast(errMsg(e, fallback), { tone: "danger" });
  };

  const compute = async () => {
    if (!periodId) return;
    setBusy(true);
    setActionErr(null);
    try {
      if (run && run.status === "DRAFT") {
        const r = await recomputeRun(run.id, run.rowVersion);
        setRun(r);
        toast(`Depreciation recomputed for ${r.assetsCount} asset${r.assetsCount === 1 ? "" : "s"}`, { tone: "good" });
      } else {
        try {
          const r = await previewRun({ fiscalPeriodId: periodId, postingDate, branchId: branchId || null, categoryId: categoryId || null });
          setRun(r);
          toast(`${r.docNo} computed for ${r.assetsCount} asset${r.assetsCount === 1 ? "" : "s"}`, { tone: "good" });
        } catch (e) {
          const id = e instanceof ApiError && e.code === "DEPRECIATION_PERIOD_HAS_RUN" ? e.details?.runId?.[0] : undefined;
          if (!id) throw e;
          await loadRun(id);
          toast(e instanceof ApiError ? e.message : "This period already has a run", { tone: "info" });
        }
      }
      void reloadRuns();
    } catch (e) {
      fail(e, "Not computed", "Could not compute depreciation");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => run && downloadCsv(`depreciation-${run.period.code}.csv`, [
    ["Category", "Asset code", "Asset", "Branch", "Method", "Rate %", "Months", "Opening NBV", "Charge", "Closing NBV"],
    ...run.lines.map((l) => [l.category.name, l.asset.code, l.asset.name, l.branch.name, l.method, l.ratePct, l.months, l.openingNbv, l.charge, l.closingNbv]),
  ]);

  const canCompute = run?.status === "DRAFT" ? can.edit : can.create;
  const scopeLocked = !!run && run.status !== "CANCELLED";

  if (loadErr && !options) return <ErrorState message={loadErr.message} reference={loadErr.reference} onRetry={() => setAttempt((x) => x + 1)} />;
  return (
    <>
      <PageHead
        eyebrow="Fixed Assets / Depreciation"
        title="Run Depreciation"
        description="Compute the monthly charge for all active assets, review the journal and post it to the ledger."
        actions={
          <>
            <Button icon={<History />} onClick={() => setHistoryOpen(true)}>Run history</Button>
            {can.post && <Button variant="primary" icon={<Send />} disabled={!run || run.status !== "DRAFT" || !run.lines.length || busy} onClick={() => setAsk("post")}>Post depreciation</Button>}
          </>
        }
      />

      {!options ? <Skeleton style={{ height: 520 }} /> : (
        <>
          <div className="panel mb">
            <div className="form-grid c4">
              <Field label="Period">
                <select value={periodId} onChange={(e) => choosePeriod(e.target.value)} disabled={busy}>
                  {!periods.length && <option value="">No open period</option>}
                  {periods.map((p) => <option key={p.id} value={p.id}>{periodLabel(p)}{p.status !== "OPEN" ? ` · ${p.status.toLowerCase()}` : ""}</option>)}
                </select>
              </Field>
              <Field label="Branch">
                <select value={branchId} disabled={scopeLocked || busy} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">All branches</option>
                  {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <select value={categoryId} disabled={scopeLocked || busy} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">All categories</option>
                  {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Posting date">
                <input type="date" value={postingDate} min={period?.startDate} max={period?.endDate} disabled={scopeLocked || busy} onChange={(e) => setPostingDate(e.target.value)} />
              </Field>
            </div>
            <div className="row mt dep-params-foot">
              {canCompute && (!run || run.status === "DRAFT" || run.status === "CANCELLED") && (
                <Button size="sm" icon={<RefreshCw />} disabled={busy || runLoading || !periodId || !postingDate} onClick={compute}>
                  {busy ? "Computing…" : run?.status === "DRAFT" ? "Recompute" : "Compute"}
                </Button>
              )}
              {run?.status === "DRAFT" && can.delete && <Button size="sm" icon={<Trash2 />} disabled={busy} onClick={() => setAsk("delete")}>Delete draft</Button>}
              {run?.status === "POSTED" && can.post && <Button size="sm" icon={<Undo2 />} disabled={busy} onClick={() => setAsk("reverse")}>Reverse</Button>}
              <span className="small muted">
                {run && run.status !== "CANCELLED"
                  ? `Last computed ${stamp(run.computedAt)}${run.computedBy ? ` by ${run.computedBy.name}` : ""}`
                  : "Not computed yet"}
                {` · ${posted.length} posted run${posted.length === 1 ? "" : "s"}`}
                {scopeLocked && run?.status === "DRAFT" && " · delete the draft to change branch, category or date"}
              </span>
            </div>
          </div>

          {actionErr && <div className="mb"><Banner tone="danger" title={actionErr.title}>{actionErr.message}</Banner></div>}
          {!periods.length && !run && (
            <div className="mb"><Banner tone="warn" title="No open period">Open a fiscal period under Periods before running depreciation.</Banner></div>
          )}

          <div className="kpi-grid">
            <div className="kpi"><div className="kpi-top"><span>Assets in run</span><span className="icon-well"><Boxes /></span></div><strong>{live ? live.assetsCount.toLocaleString("en-US") : "—"}</strong><small>{live ? `${live.skippedCount} fully depreciated skipped` : "Compute to see the assets"}</small></div>
            <div className="kpi yellow"><div className="kpi-top"><span>Depreciation — {period ? monthName(period.startDate) : "period"}</span><span className="icon-well"><TrendingDown /></span></div><strong>{live ? rs(live.totalDepreciation) : "—"}</strong><small>{versus ?? (period ? period.code : " ")}</small></div>
            <div className="kpi teal"><div className="kpi-top"><span>YTD after posting</span><span className="icon-well"><CalendarRange /></span></div><strong>{period ? rs(ytd) : "—"}</strong><small>{fyStart && period ? `${monthName(fyStart)}–${monthName(period.startDate)} ${period.endDate.slice(0, 4)}` : " "}</small></div>
            <div className="kpi blue"><div className="kpi-top"><span>NBV after posting</span><span className="icon-well"><Landmark /></span></div><strong>{live ? rs(live.nbvAfter) : "—"}</strong><small>{live ? `From ${rs(live.nbvBefore)}` : " "}</small></div>
          </div>

          <div className="split mt">
            <div className="panel flush">
              <div className="panel-head">
                <div><h3>Computed depreciation — {run?.period.code ?? period?.code ?? ""}</h3><p>Grouped by category{run?.branch ? ` · ${run.branch.name}` : ""}{run?.category ? ` · ${run.category.name} only` : ""}</p></div>
                <div className="panel-actions"><Button variant="ghost" size="sm" icon={<Download />} disabled={!run?.lines.length} onClick={exportCsv}>Export</Button></div>
              </div>
              {runLoading ? <Skeleton style={{ height: 360 }} /> : !run || run.status === "CANCELLED" ? (
                <EmptyState icon={<TrendingDown />} title={run ? `${run.docNo} was cancelled` : "Not computed yet"}
                  description={periodId ? "Choose the scope and compute the period's charge to review it before posting." : "No open period to compute."}
                  action={periodId && canCompute ? <Button variant="primary" icon={<RefreshCw />} disabled={busy} onClick={compute}>Compute</Button> : undefined} />
              ) : !run.lines.length ? (
                <EmptyState icon={<Boxes />} title="No depreciable assets" description={`No asset in use needs a charge for ${run.period.code}${run.skippedCount ? ` (${run.skippedCount} fully depreciated skipped)` : ""}.`} />
              ) : (
                <div className="table-wrap"><table className="tbl stmt">
                  <thead><tr><th>Asset / Category</th><th>Method</th><th className="num">Opening NBV</th><th className="num">Charge</th><th className="num">Closing NBV</th></tr></thead>
                  <tbody>
                    {groups.map((g) => (
                      <GroupRows key={g.name} name={g.name} lines={g.lines} sum={sum} />
                    ))}
                    <tr className="total"><td colSpan={2}>Total depreciation — {run.period.code}</td><td className="num">{amt(sum(run.lines, (l) => l.openingNbv))}</td><td className="num">{amt(sum(run.lines, (l) => l.charge))}</td><td className="num">{amt(sum(run.lines, (l) => l.closingNbv))}</td></tr>
                  </tbody>
                </table></div>
              )}
            </div>

            <div className="stack">
              <div className="panel">
                <div className="panel-head">
                  <div><h3>Journal preview</h3><p>{run && run.status !== "CANCELLED" ? `${run.journal ? run.journal.docNo : "JV no. on posting"} · ${dateLabel(run.postingDate)}` : "Compute the run first"}</p></div>
                  {run && <Badge tone={run.status === "POSTED" ? "good" : run.status === "CANCELLED" ? "danger" : "warn"}>{RUN_STATUS[run.status]?.label ?? run.status}</Badge>}
                </div>
                {!jp.length || !run || run.status === "CANCELLED" ? <p className="small muted">No journal lines yet.</p> : (
                  <>
                    <div className="table-wrap"><table className="tbl">
                      <thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
                      <tbody>
                        {jp.map((l, i) => (
                          <tr key={`${l.account.id}-${i}`}>
                            <td>{l.account.code} {l.account.name}</td>
                            <td className={cn("num", l.debit ? "dr" : "zero")}>{l.debit ? amt(l.debit) : "—"}</td>
                            <td className={cn("num", l.credit ? "cr" : "zero")}>{l.credit ? amt(l.credit) : "—"}</td>
                          </tr>
                        ))}
                        <tr className="total"><td>Total</td><td className="num">{amt(dr)}</td><td className="num">{amt(cr)}</td></tr>
                      </tbody>
                    </table></div>
                    <div className="mt">
                      {run.status === "POSTED" ? (
                        <Banner tone="good" title="Posted to the ledger">
                          {run.journal ? <Link className="link" href={`/accounting/vouchers/${run.journal.id}`}>{run.journal.docNo}</Link> : "Journal"} · posted {dateLabel(run.postedAt)}{run.postedBy ? ` by ${run.postedBy.name}` : ""}.
                        </Banner>
                      ) : balanced && periodOpen ? (
                        <Banner tone="good" title="Journal is balanced">Debits equal credits. Period {run.period.code} is open.</Banner>
                      ) : !balanced ? (
                        <Banner tone="warn" title="Journal is not balanced">Debits {amt(dr)} and credits {amt(cr)} differ. Recompute the run.</Banner>
                      ) : (
                        <Banner tone="warn" title={`Period ${run.period.code} is ${run.period.status.toLowerCase()}`}>Open the period before posting.</Banner>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="panel">
                <div className="panel-head"><div><h3>Run history{fy ? ` — ${fy}` : ""}</h3></div></div>
                {!runs ? <Skeleton style={{ height: 120 }} /> : !fyRuns.length ? <p className="small muted">No runs in this fiscal year yet.</p> : (
                  <div className="list">
                    {fyRuns.slice(0, 6).map((r) => (
                      <button key={r.id} type="button" className={cn("list-item dep-hist-item", run?.id === r.id && "on")} onClick={() => loadRun(r.id)}>
                        <span className="icon-well">{r.status === "POSTED" ? <CircleCheck /> : <FileClock />}</span>
                        <div><b>{r.period.code} · {rs(r.totalDepreciation)}</b><small>{r.status === "POSTED" ? `${r.journal?.docNo ?? r.docNo} · posted ${dateLabel(r.postedAt)}${r.postedBy ? ` by ${r.postedBy.name}` : ""}` : `${r.docNo} · draft`}</small></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} wide title="Depreciation run history" subtitle="Every run, newest first. Click a run to load it.">
        {!runs ? <Skeleton style={{ height: 300 }} /> : !runs.length ? <EmptyState icon={<History />} title="No runs yet" description="Compute a period to create the first run." /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Run #</th><th>Period</th><th className="num">Total</th><th>Status</th><th>Journal</th><th>Posted</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="dep-click" onClick={() => { setHistoryOpen(false); void loadRun(r.id); }}>
                  <td><b>{r.docNo}</b><small>{r.assetsCount} assets</small></td>
                  <td>{r.period.code}<small>{dateLabel(r.postingDate)}</small></td>
                  <td className="num">{amt(r.totalDepreciation)}</td>
                  <td><RunStatus status={r.status} /></td>
                  <td>{r.journal ? <Link className="link" href={`/accounting/vouchers/${r.journal.id}`} onClick={(e) => e.stopPropagation()}>{r.journal.docNo}</Link> : "—"}</td>
                  <td>{r.postedAt ? <>{r.postedBy?.name ?? "—"}<small>{stamp(r.postedAt)}</small></> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Drawer>

      {run && ask === "post" && (
        <PostModal run={run} onClose={() => setAsk(null)} onPosted={(r) => {
          setAsk(null);
          setRun(r);
          setActionErr(null);
          toast(`${r.journal?.docNo ?? r.docNo} posted — ${rs(r.totalDepreciation)} depreciation`, { tone: "good" });
          void reloadRuns();
        }} />
      )}
      {run && ask === "reverse" && (
        <ReverseModal run={run} onClose={() => setAsk(null)} onDone={(r) => {
          setAsk(null);
          setRun(r);
          toast(`${r.docNo} reversed`, { tone: "good" });
          void reloadRuns();
        }} />
      )}
      <ConfirmDialog open={ask === "delete" && !!run} onClose={() => setAsk(null)} danger busy={busy} title={`Delete ${run?.docNo ?? "the draft"}?`} confirmLabel="Delete draft"
        onConfirm={async () => {
          if (!run) return;
          setBusy(true);
          try {
            await deleteRun(run.id, run.rowVersion);
            toast(`${run.docNo} deleted`, { tone: "good" });
            setAsk(null);
            setRun(null);
            void reloadRuns();
          } catch (e) {
            setAsk(null);
            fail(e, "Not deleted", "Could not delete the draft");
          } finally {
            setBusy(false);
          }
        }}>
        The computed lines are removed and the period can be computed again.
      </ConfirmDialog>
    </>
  );
}

function GroupRows({ name, lines, sum }: { name: string; lines: Line[]; sum: (ls: Line[], f: (l: Line) => number) => number }) {
  return (
    <>
      <tr className="sec"><td colSpan={5}>{name} · {lines.length} asset{lines.length === 1 ? "" : "s"}</td></tr>
      {lines.map((l) => (
        <tr key={l.id}>
          <td className="ind1">{l.asset.code} {l.asset.name}{l.months !== 1 && <small>{l.months} months</small>}</td>
          <td>{l.method} {l.ratePct}%</td>
          <td className="num">{amt(l.openingNbv)}</td>
          <td className="num">{amt(l.charge)}</td>
          <td className="num">{amt(l.closingNbv)}</td>
        </tr>
      ))}
      <tr className="sub"><td colSpan={2}>Subtotal {name}</td><td className="num">{amt(sum(lines, (l) => l.openingNbv))}</td><td className="num">{amt(sum(lines, (l) => l.charge))}</td><td className="num">{amt(sum(lines, (l) => l.closingNbv))}</td></tr>
    </>
  );
}

/** Template #rpt-post-dep. */
function PostModal({ run, onClose, onPosted }: { run: DepreciationRun; onClose: () => void; onPosted: (r: DepreciationRun) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debits = run.journalPreview.filter((l) => l.debit > 0);
  const credits = run.journalPreview.filter((l) => l.credit > 0);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { onPosted(await postRun(run.id, run.rowVersion)); } catch (e) { setErr(errMsg(e, "Could not post the run")); } finally { setBusy(false); }
  };
  const month = new Date(`${run.period.startDate}T00:00:00`).toLocaleString("en-US", { month: "long" });
  return (
    <Modal open onClose={onClose} title={`Post ${month} depreciation?`} subtitle={`This creates a journal voucher and updates NBV for ${run.assetsCount} asset${run.assetsCount === 1 ? "" : "s"}.`} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={go} disabled={busy}>{busy ? "Posting…" : "Post journal"}</button>
      </>
    }>
      <div className="dl">
        <div><span>Period</span><b>{run.period.code}</b></div>
        <div><span>Posting date</span><b>{dateLabel(run.postingDate)}</b></div>
        {debits.map((l, i) => <div key={`d${i}`}><span>Debit — {l.account.code} {l.account.name}</span><b>{rs(l.debit)}</b></div>)}
        {credits.length > 2 ? (
          <div><span>Credit — Accumulated Depreciation ({credits.length} accounts)</span><b>{rs(credits.reduce((s, l) => s + l.credit, 0))}</b></div>
        ) : credits.map((l, i) => <div key={`c${i}`}><span>Credit — {l.account.code} {l.account.name}</span><b>{rs(l.credit)}</b></div>)}
      </div>
      {err && <div className="mt"><Banner tone="danger" title="Not posted">{err}</Banner></div>}
    </Modal>
  );
}

function ReverseModal({ run, onClose, onDone }: { run: DepreciationRun; onClose: () => void; onDone: (r: DepreciationRun) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { onDone(await reverseRun(run.id, run.rowVersion, reason.trim())); } catch (e) { setErr(errMsg(e, "Could not reverse the run")); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Reverse ${run.docNo}`} subtitle={`The journal ${run.journal?.docNo ?? ""} is reversed and each asset's accumulated depreciation rolled back.`} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="btn danger" onClick={go} disabled={busy || reason.trim().length < 3}>{busy ? "Reversing…" : "Reverse run"}</button>
      </>
    }>
      <FormGrid cols={1}>
        <Field label="Reason" required error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this run reversed?" /></Field>
      </FormGrid>
    </Modal>
  );
}
