"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Coins, CreditCard, FileText, Landmark, Package, Plus, ReceiptText, Sparkles, TrendingDown, TrendingUp, Wallet, Zap } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { WorkspaceDashboard } from "@/shared";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { getDashboard } from "../api";
import { fmtDate, longDate, rsShort } from "./work-ui";

const grp = (n: number) => Math.round(n).toLocaleString("en-US");
const Money = ({ n }: { n: number }) => <>Rs {grp(n)}<span className="dec">.00</span></>;
const LOGOS = ["l-forest", "l-orange", "l-blue", "l-violet", "l-red", "l-lime"];
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const METHOD: Record<string, { label: string; icon: ReactNode }> = {
  CASH: { label: "Cash", icon: <Coins /> }, CHEQUE: { label: "Cheque", icon: <FileText /> }, CARD: { label: "Card", icon: <CreditCard /> },
  IBFT: { label: "Bank Transfer", icon: <Landmark /> }, BANK: { label: "Bank Transfer", icon: <Landmark /> }, ONLINE: { label: "Online", icon: <Landmark /> },
};
const STATUS_CLS: Record<string, string> = { POSTED: "done", CLEARED: "done", ALLOCATED: "done", PARTLY_ALLOCATED: "wait", UNALLOCATED: "wait", PRESENTED: "wait", PENDING_APPROVAL: "wait", BOUNCED: "fail", VOID: "fail" };
const STATUS_LABEL: Record<string, string> = { POSTED: "Completed", CLEARED: "Cleared", ALLOCATED: "Completed", PARTLY_ALLOCATED: "Part allocated", UNALLOCATED: "On account", PRESENTED: "Presented", PENDING_APPROVAL: "Pending", BOUNCED: "Bounced", VOID: "Void" };
const APPROVAL_TILE = ["green", "blue", "orange", "violet", "lime"];

/** Template heat strip (92-dash.js renderHeat): one column per day, height = intensity 1–6. */
function Heat({ vals }: { vals: number[] }) {
  const max = Math.max(1, ...vals);
  return (
    <div className="fd-heat" aria-label="Daily revenue intensity">
      {vals.map((n, ci) => {
        const r = n / max;
        const base = r > 0.85 ? 4 : r > 0.65 ? 3 : r > 0.45 ? 2 : 1;
        return (
          <span key={ci} className="hc">
            {Array.from({ length: n }, (_, j) => {
              let lv = base;
              if (j === n - 1) lv = Math.max(0, base - 2);
              else if (j === n - 2) lv = Math.max(1, base - 1);
              else if (j === 0 && base === 4) lv = 3;
              return <i key={j} className={`l${lv}`} />;
            })}
          </span>
        );
      })}
    </div>
  );
}

/** Template tick gauge (renderGauge). */
function Gauge({ pct, ticks = 30 }: { pct: number; ticks?: number }) {
  const on = Math.round((ticks * Math.min(100, Math.max(0, pct))) / 100);
  return (
    <div className="fd-gauge">
      <div className="fd-gauge-scale"><span>0</span><span>50</span><span>100</span></div>
      <div className="fd-ticks" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        {Array.from({ length: ticks }, (_, i) => <i key={i} className={i < on ? "on" : undefined} style={{ ["--i" as string]: i } as CSSProperties} />)}
      </div>
    </div>
  );
}

/** Template money flow (renderFlow, overlay mode): income and expense bars per month with a tooltip on the hot column. */
function Flow({ data, quarterly }: { data: WorkspaceDashboard["flow"]; quarterly: boolean }) {
  const d = quarterly
    ? [0, 1, 2, 3].map((q) => ({ label: `Q${q + 1}`, income: data.slice(q * 3, q * 3 + 3).reduce((s, x) => s + x.income, 0), expense: data.slice(q * 3, q * 3 + 3).reduce((s, x) => s + x.expense, 0) }))
    : data;
  const [hot, setHot] = useState(d.length - 1);
  const tops = d.map((x) => Math.max(x.income, x.expense));
  const scale = Math.max(1, ...tops) * 1.12;
  return (
    <div className="fd-flow fd-m-over">
      <div className={quarterly ? "fd-plot q" : "fd-plot"} onMouseLeave={() => setHot(d.length - 1)}>
        {d.map((x, i) => {
          const ha = (x.income / scale) * 100;
          const hb = (x.expense / scale) * 100;
          const t = Math.min(100, (tops[i]! / scale) * 100 + 9 + ((i * 37) % 7) * 2.6);
          return (
            <div key={x.label + i} className={i === hot ? "fd-col hot" : "fd-col"} tabIndex={0} onMouseEnter={() => setHot(i)} onFocus={() => setHot(i)}
              aria-label={`${x.label}: income Rs ${grp(x.income)}, expense Rs ${grp(x.expense)}`}>
              <div className="fd-bararea">
                <div className="fd-track" style={{ ["--t" as string]: `${t.toFixed(1)}%` } as CSSProperties} />
                <i className="fd-seg a" style={{ ["--h" as string]: `${ha.toFixed(2)}%`, ["--i" as string]: i } as CSSProperties} />
                <i className="fd-seg b" style={{ ["--h" as string]: `${hb.toFixed(2)}%`, ["--o" as string]: "0%", ["--i" as string]: i } as CSSProperties} />
                {i === hot && (
                  <div className={`fd-tipx${ha > 70 ? (i > d.length / 2 ? " side left" : " side") : ""}`} style={{ left: "50%", top: `${100 - ha}%` }}>
                    <span className="k"><i />Income · {x.label}</span>
                    <b><Money n={x.income} /></b>
                    <small><i />Expense Rs {grp(x.expense)}</small>
                  </div>
                )}
              </div>
              <span className="m">{x.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Template app/dashboard (48-dash-stock.html): the workspace overview, from posted data. */
export function DashboardScreen({ firstName }: { firstName: string }) {
  const [d, setD] = useState<WorkspaceDashboard | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [quarterly, setQuarterly] = useState(false);
  const [tx, setTx] = useState<"all" | "IN" | "OUT">("all");
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    getDashboard().then((x) => { if (!cancelled) { setD(x); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the dashboard" }));
    return () => { cancelled = true; };
  }, [attempt]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const revChange = d && d.revenue.prevTotal ? ((d.revenue.total - d.revenue.prevTotal) / d.revenue.prevTotal) * 100 : null;
  const splitColors = ["var(--fd-forest)", "var(--fd-lime)", "var(--fd-mint)"];
  const txs = (d?.transactions ?? []).filter((t) => tx === "all" || t.direction === tx);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{d ? `${longDate(d.asOf)}${d.fiscalLabel ? ` · ${d.fiscalLabel}` : ""}` : " "}</div>
          <h1>{greet}, {firstName}</h1>
          <p>Keep track, assess and enhance your financial performance</p>
        </div>
        <div className="head-actions">
          <Link className="btn secondary" href="/today"><CalendarDays />Today&apos;s Work</Link>
          <Link className="btn primary" href="/sales/invoices/new"><Plus />New Invoice</Link>
        </div>
      </div>

      {!d ? <Skeleton style={{ height: 620 }} /> : (
        <>
          <div className="fd-grid fd-r1">
            <article className="fd-card">
              <div className="fd-head"><h3>Cash &amp; Bank Balance</h3><span className="spacer" /><span className="fd-date">As of {fmtDate(d.asOf)}</span></div>
              <div className="fd-body fd-bottom">
                <span className="fd-label">Total balance · {d.cash.banks} bank{d.cash.banks === 1 ? "" : "s"}, {d.cash.cashBooks} cash book{d.cash.cashBooks === 1 ? "" : "s"}</span>
                <b className="num-big fd-big"><Money n={d.cash.total} /></b>
                <div className="fd-pills">
                  <span className="pill"><Wallet />Earned last month <b className={d.cash.earnedLastMonth >= 0 ? "up" : "down"}>{d.cash.earnedLastMonth >= 0 ? "+" : "−"}Rs {grp(Math.abs(d.cash.earnedLastMonth))}.00</b></span>
                  <span className="pill"><Zap />Collections MTD <b className="up">+Rs {grp(d.cash.collectionsMtd)}</b></span>
                </div>
              </div>
            </article>

            <article className="fd-card">
              <div className="fd-head"><h3>Revenue</h3><span className="spacer" /><span className="fd-date">{d.revenue.month}</span></div>
              <div className="fd-body">
                <div className="fd-row-top"><div><span className="fd-label">Total revenue</span></div><Heat vals={d.revenue.heat} /></div>
                <b className="num-big fd-big"><Money n={d.revenue.total} /></b>
                <div className="fd-pills">
                  <span className="pill">{revChange !== null && revChange < 0 ? <TrendingDown /> : <TrendingUp />}vs last month <b className={revChange !== null && revChange < 0 ? "down" : "up"}>{revChange === null ? "—" : `${revChange >= 0 ? "+" : "−"}${Math.abs(revChange).toFixed(1)}%`}</b></span>
                  <span className="pill"><Zap />Change <b className={d.revenue.earnedVsPrev >= 0 ? "up" : "down"}>{d.revenue.earnedVsPrev >= 0 ? "+" : "−"}Rs {grp(Math.abs(d.revenue.earnedVsPrev))}</b></span>
                </div>
                {d.revenue.split.length > 0 && (
                  <div className="fd-split">
                    {d.revenue.split.map((s, i) => <div key={s.label} style={{ ["--c" as string]: splitColors[i] } as CSSProperties}><span>{s.label}</span><b>{rsShort(s.amount)}</b></div>)}
                  </div>
                )}
              </div>
            </article>

            <article className="fd-card">
              <div className="fd-body">
                <b className="num-big fd-big"><Money n={d.expenses.total} /></b>
                <span className="fd-label">Total expenses · {d.expenses.month}</span>
                <div className="fd-pills">
                  {d.expenses.vsPlanPct !== null
                    ? <span className="pill"><ReceiptText />Plan <b className={d.expenses.vsPlanPct >= 0 ? "up" : "down"}>{Math.abs(d.expenses.vsPlanPct)}% {d.expenses.vsPlanPct >= 0 ? "below" : "above"} plan</b></span>
                    : <span className="pill"><ReceiptText />No budget for this month</span>}
                  {d.expenses.budget !== null && <span className="pill"><Zap />Budget <b>Rs {grp(d.expenses.budget)}</b></span>}
                </div>
                <Gauge pct={d.expenses.gaugePct} />
                <div className="fd-gauge-foot"><span>{d.expenses.month}</span><span className="spacer" /><span>{d.expenses.budget !== null ? `${d.expenses.gaugePct}% of budget` : `${d.expenses.gaugePct}% of revenue`} <Zap className="fd-zap" /></span></div>
              </div>
            </article>
          </div>

          <div className="fd-grid fd-r2">
            <article className="fd-card">
              <div className="fd-head">
                <h3>Money Flow</h3><span className="spacer" />
                <div className="fd-legend"><span><i className="fd-k-a" />Income</span><span><i className="fd-k-b" />Expense</span><span><i className="fd-k-s" />Space</span></div>
                <label className="fd-sel"><select aria-label="Grouping" value={quarterly ? "q" : "m"} onChange={(e) => setQuarterly(e.target.value === "q")}><option value="m">Monthly</option><option value="q">Quarterly</option></select></label>
              </div>
              <Flow data={d.flow} quarterly={quarterly} />
            </article>

            <article className="fd-card">
              <div className="fd-head"><h3>Budget Remaining</h3><span className="spacer" /><Link className="fd-link" href="/budgets">Budget setting <ArrowRight /></Link></div>
              {d.budget.remainingPct === null ? (
                <EmptyState icon={<Sparkles />} title="No budget for this year" description="Approve a budget to track how much of it is left." />
              ) : (
                <>
                  <div className="fd-remain">
                    <div>
                      <b className="fd-pct">{d.budget.remainingPct}<span className="dec">%</span></b>
                      <span className="pill"><Sparkles />{d.budget.name}</span>
                    </div>
                    <p className="fd-note"><b>{d.budget.remainingPct >= 50 ? "You're in good shape — " : d.budget.remainingPct >= 20 ? "Watch spending — " : "Nearly spent — "}</b>{d.budget.remainingPct}% of this year&apos;s budget is still available.</p>
                  </div>
                  <div className="fd-tiles">
                    {d.budget.lines.map((l, i) => (
                      <div key={l.label} className="fd-tcol" style={{ ["--h" as string]: `${Math.max(12, Math.min(100, l.usedPct))}%`, ["--i" as string]: i } as CSSProperties}>
                        <div className="fd-space"><i /></div>
                        <div className={`fd-tile ${["t-forest", "t-lime", "t-mint"][i]}`}>
                          <b>{l.usedPct}<small>%</small></b><span>{l.label}</span>
                          {i === 0 && <><div className="fd-tile-foot"><small>{rsShort(l.used)}</small><small>{rsShort(l.budget)}</small></div><div className="fd-tile-bar"><i style={{ width: `${Math.min(100, l.usedPct)}%` }} /></div></>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </article>
          </div>

          <div className="fd-grid fd-r3">
            <article className="fd-card fd-flush">
              <div className="fd-head fd-pad">
                <h3>Transaction History</h3><span className="spacer" />
                <label className="fd-sel"><select aria-label="Type" value={tx} onChange={(e) => setTx(e.target.value as typeof tx)}><option value="all">All transactions</option><option value="IN">Receipts</option><option value="OUT">Payments</option></select></label>
              </div>
              {!txs.length ? <EmptyState icon={<Landmark />} title="No receipts or payments yet" /> : (
                <div className="table-wrap"><table className="tbl fd-tbl">
                  <thead><tr><th>Name</th><th>Date</th><th>Method</th><th className="num">Amount</th><th>Status</th><th className="right">Action</th></tr></thead>
                  <tbody>
                    {txs.map((t, i) => (
                      <tr key={t.id}>
                        <td><div className="fd-party"><span className={`fd-logo ${LOGOS[i % LOGOS.length]}`}>{initials(t.party)}</span><div><b>{t.party}</b><small>{t.ref}</small></div></div></td>
                        <td>{fmtDate(t.date)}</td>
                        <td><span className="fd-method">{(METHOD[t.method] ?? METHOD.BANK!).icon}{METHOD[t.method]?.label ?? t.method}</span></td>
                        <td className={t.direction === "IN" ? "num fd-up" : "num"}>{t.direction === "IN" ? "+" : "−"}Rs {grp(t.amount)}</td>
                        <td><span className={`fd-status ${STATUS_CLS[t.status] ?? "wait"}`}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                        <td className="right"><Link className="btn ghost sm" href={t.href}>View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </article>

            <div className="fd-col-stack">
              <article className="fd-card">
                <div className="fd-head"><h3>Pending approvals</h3><span className="fd-count">{d.approvals.count}</span><span className="spacer" /><Link className="fd-link" href="/today">View all <ArrowRight /></Link></div>
                {!d.approvals.items.length ? <p className="small muted">Nothing is waiting for you.</p> : (
                  <div className="fd-list">
                    {d.approvals.items.map((a, i) => (
                      <Link key={a.id} href={a.href}>
                        <span className={`icon-tile ${APPROVAL_TILE[i % APPROVAL_TILE.length]}`}>{i % 2 ? <Package /> : <ReceiptText />}</span>
                        <div><b>{a.docLabel}</b><small>{[a.title, a.requestedBy].filter(Boolean).join(" · ")}</small></div>
                        <em>{a.amount !== null ? rsShort(a.amount) : ""}</em>
                      </Link>
                    ))}
                  </div>
                )}
              </article>
              {d.payroll ? (
                <Link className="fd-card fd-night" href={d.payroll.href}>
                  <div className="fd-head"><h3>Payroll · {d.payroll.period}</h3><span className="spacer" /><span className="fd-chip-night">{d.payroll.runNo}</span></div>
                  <span className="fd-label">Net pay · {d.payroll.employees} employee{d.payroll.employees === 1 ? "" : "s"}</span>
                  <b className="num-big fd-big sm"><Money n={d.payroll.netPay} /></b>
                  <div className="fd-steps">{Array.from({ length: Math.max(1, d.payroll.stepsTotal || 6) }, (_, i) => <i key={i} className={i < d.payroll!.stepsDone ? "on" : undefined} />)}</div>
                  <div className="fd-night-foot"><span>{d.payroll.stepsDone} of {d.payroll.stepsTotal || 6} steps{d.payroll.dueDate ? ` · pay ${fmtDate(d.payroll.dueDate)}` : ""}</span><span className="spacer" /><b>Open run <ArrowRight /></b></div>
                </Link>
              ) : (
                <Link className="fd-card fd-night" href="/hr/payroll">
                  <div className="fd-head"><h3>Payroll</h3></div>
                  <span className="fd-label">No payroll run yet</span>
                  <div className="fd-night-foot"><span>Prepare the first run</span><span className="spacer" /><b>Payroll <ArrowRight /></b></div>
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
