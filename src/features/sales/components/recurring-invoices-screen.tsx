"use client";

import { CalendarClock, Clock, MoreHorizontal, Pause, Pencil, Play, Plus, ReceiptText, Repeat, Timer, Trash2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ReceivablesOptions, RecurringInvoice, RecurringInvoiceList } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { deleteRecurring, getRecurring, listRecurring, receivablesOptions, recurringAction } from "@/features/receivables/completion-api";
import { dstr, endLabel, freqLabel, parseIso, RecurringEditor, RecurringView, rs, statusBadge, type RecurringCan } from "./recurring-invoice-drawer";

type Row = RecurringInvoiceList["items"][number];
type Filter = "ALL" | "ACTIVE" | "PAUSED" | "ENDED";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const inDays = (d: string) => Math.round((parseIso(d).getTime() - new Date(new Date().toDateString()).getTime()) / 864e5);

/**
 * Template app/sales/recurring (4A-company-plus.html + 9A-company-plus.js §4): recurring invoice profiles with KPIs, the
 * profiles table (Run now, pause / resume), coming-up runs and the New profile drawer. Real data: the profiles raise
 * STANDARD sales invoices, posted or kept as drafts, through an hourly job (Run now raises the next one today).
 * Email / WhatsApp delivery and the auto-send switch are not built (no sending yet): the template's auto-send column
 * shows whether invoices are posted or kept as drafts.
 */
export function RecurringInvoicesScreen({ can }: { can: RecurringCan }) {
  const toast = useToast();
  const [data, setData] = useState<RecurringInvoiceList | null>(null);
  const [options, setOptions] = useState<ReceivablesOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [edit, setEdit] = useState<RecurringInvoice | "new" | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: Row } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRecurring({ page: 1, pageSize: 200, status: filter === "ALL" ? undefined : filter })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the recurring invoices" }));
    return () => { cancelled = true; };
  }, [attempt, filter]);
  useEffect(() => {
    let cancelled = false;
    receivablesOptions().then((o) => !cancelled && setOptions(o)).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const rows = data?.items ?? [];
  const counts = data?.counts ?? {};
  const coming = rows.filter((p) => p.status === "ACTIVE" && p.nextRunDate).sort((a, b) => a.nextRunDate!.localeCompare(b.nextRunDate!)).slice(0, 5);

  const act = async (row: Row, a: "run-now" | "pause" | "resume") => {
    setBusy(row.id);
    try {
      const x = await recurringAction(row.id, a, row.rowVersion);
      if (a === "run-now") toast(`${x.lastInvoice?.docNo ?? "Invoice"} raised for ${x.customer.name} · ${rs(x.amount)}${x.saveAsDraft ? " · saved as draft" : " · posted"}`, { tone: "good" });
      else toast(`${x.docNo} ${a === "pause" ? "paused" : "resumed"}`, { tone: "info" });
      reload();
    } catch (e) { toast(apiMessage(e, "Could not do that"), { tone: "danger" }); } finally { setBusy(null); }
  };
  const openEdit = async (row: Row) => {
    try { setEdit(await getRecurring(row.id)); } catch (e) { toast(apiMessage(e, "Could not load the profile"), { tone: "danger" }); }
  };
  const remove = async (row: Row) => {
    setBusy(row.id);
    try { await deleteRecurring(row.id, row.rowVersion); toast(`${row.docNo} deleted`, { tone: "good" }); reload(); } catch (e) { toast(apiMessage(e, "Could not delete"), { tone: "danger" }); } finally { setBusy(null); }
  };
  const menuItems = (row: Row): MenuItem[] => [
    { label: "Open profile", icon: <ReceiptText />, onClick: () => setView(row.id) },
    ...(can.edit && row.status !== "ENDED" ? [{ label: "Edit profile", icon: <Pencil />, onClick: () => void openEdit(row) }] : []),
    ...(can.edit && row.status === "ACTIVE" ? [{ label: "Pause profile", icon: <Pause />, onClick: () => void act(row, "pause") }] : []),
    ...(can.edit && row.status === "PAUSED" ? [{ label: "Resume profile", icon: <Play />, onClick: () => void act(row, "resume") }] : []),
    ...(can.delete && row.runsCount === 0 ? [{ sep: true } as const, { label: "Delete", icon: <Trash2 />, danger: true, onClick: () => void remove(row) }] : []),
  ];

  return (
    <>
      <PageHead
        eyebrow={<><Repeat />Sales / Recurring Invoices</>}
        title="Recurring Invoices"
        description="Retainers, AMCs, rentals and standing orders that raise themselves on schedule."
        actions={<>
          <span className="tagline">set it &amp; forget it</span>
          <Link className="btn secondary" href="/sales/invoices"><ReceiptText />Generated invoices</Link>
          {can.create && <button className="btn primary" type="button" disabled={!options} onClick={() => setEdit("new")}><Plus />New profile</button>}
        </>}
      />
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Active profiles</span><span className="icon-well"><Repeat /></span></div><strong>{counts.ACTIVE ?? 0}</strong><small>{counts.PAUSED ?? 0} paused · {counts.ENDED ?? 0} ended</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Monthly recurring revenue</span><span className="icon-well"><TrendingUp /></span></div><strong>{rs(data?.kpis.monthlyValue ?? 0)}</strong><small>Normalised to a month, excl. paused</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Next 7 days</span><span className="icon-well"><CalendarClock /></span></div><strong>{data?.kpis.dueThisWeek ?? 0}</strong><small>Profiles due to run</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Posted automatically</span><span className="icon-well"><Timer /></span></div>
          <strong>{rows.length ? Math.round((rows.filter((r) => !r.saveAsDraft).length / rows.length) * 100) : 0}%</strong><small>The rest wait as drafts for review</small></div>
      </div>
      <div className="split cp-ri-split">
        <div className="panel flush">
          <div className="panel-head">
            <div><h3>Recurring profiles</h3><p>An hourly job raises invoices on the run date and posts them to receivables.</p></div>
            <div className="panel-actions">
              <div className="seg">
                {(["ALL", "ACTIVE", "PAUSED", "ENDED"] as Filter[]).map((k) => (
                  <button key={k} type="button" className={cn(filter === k && "active")} onClick={() => setFilter(k)}>{k === "ALL" ? "All" : k[0] + k.slice(1).toLowerCase()}</button>
                ))}
              </div>
            </div>
          </div>
          {!data ? <div style={{ padding: 16 }}><Skeleton style={{ height: 220 }} /></div> : rows.length ? (
            <div className="table-wrap">
              <table className="tbl cp-ri-tbl" data-plain="">
                <thead><tr><th>Customer &amp; profile</th><th>Frequency</th><th>Next run</th><th className="num">Amount (Rs)</th><th>Posting</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((p) => {
                    const n = p.nextRunDate ? inDays(p.nextRunDate) : null;
                    return (
                      <tr key={p.id} className={cn(p.status !== "ACTIVE" && "cp-dim", busy === p.id && "cp-running")} style={{ cursor: "pointer" }} onClick={() => setView(p.id)}>
                        <td><div className="cell-user"><span className="avatar sm">{initials(p.customer.name)}</span><div><b>{p.customer.name}</b><small>{p.docNo} · {p.name}</small></div></div></td>
                        <td><span className="cp-freq"><Repeat />{freqLabel(p.frequency, p.everyDays)}</span><small>{p.runsCount} runs · ends {endLabel(p)}</small></td>
                        <td>{p.nextRunDate ? <><b className="cp-next">{dstr(parseIso(p.nextRunDate))}</b>
                          <small className={cn(n !== null && n <= 2 && p.status === "ACTIVE" && "cp-soon")}>{p.status === "PAUSED" ? "On hold" : n! <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`}</small></> : <span className="muted">—</span>}</td>
                        <td className="num"><b>{p.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><small>incl. tax</small></td>
                        <td><span className="pill">{p.saveAsDraft ? "Draft" : "Auto-post"}</span></td>
                        <td>{statusBadge(p.status)}</td>
                        <td className="actions" onClick={(e) => e.stopPropagation()}>
                          <div className="row cp-nowrap">
                            {can.post && <button type="button" className="btn secondary sm" disabled={p.status !== "ACTIVE" || busy === p.id} onClick={() => void act(p, "run-now")}>
                              {busy === p.id ? <><span className="cp-spin" />Generating…</> : <><Play />Run now</>}</button>}
                            <button type="button" className="icon-btn-sm" title="More" onClick={(e) => setMenu({ anchor: e.currentTarget, row: p })}><MoreHorizontal /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div style={{ padding: 16 }}><EmptyState icon={<Repeat />} title="No recurring profiles" description="Create a profile to raise the same invoice on a schedule."
            action={can.create && options ? <button className="btn primary" type="button" onClick={() => setEdit("new")}><Plus />New profile</button> : undefined} /></div>}
        </div>
        <div className="stack">
          <div className="panel cp-ri-up">
            <div className="panel-head"><div><h3>Coming up</h3><p>Next scheduled runs</p></div><span className="pill"><Clock />Hourly job</span></div>
            <div>
              {coming.length ? coming.map((p, i) => {
                const d = parseIso(p.nextRunDate!);
                return (
                  <div key={p.id} className="cp-up" style={{ ["--i" as string]: i }}>
                    <span className="cp-cal"><small>{MON[d.getMonth()]}</small><b>{d.getDate()}</b></span>
                    <div><b>{p.customer.name}</b><small>{freqLabel(p.frequency, p.everyDays)} · {p.saveAsDraft ? "draft for review" : "posted"}</small></div>
                    <span className="spacer" /><b className="cp-up-amt">{rs(p.amount)}</b>
                  </div>
                );
              }) : <p className="muted small">Nothing scheduled.</p>}
            </div>
          </div>
          <div className="panel cp-ri-tip"><span className="icon-tile lime"><Timer /></span><div><b>Runs by itself</b><p>Every hour the scheduler raises each profile whose run date has come, then moves it to the next date. Use Run now to raise one immediately.</p></div></div>
        </div>
      </div>
      {menu && <Menu anchor={menu.anchor} items={menuItems(menu.row)} onClose={() => setMenu(null)} />}
      {edit && options && (
        <RecurringEditor profile={edit === "new" ? null : edit} options={options} onClose={() => setEdit(null)}
          onSaved={(p) => { setEdit(null); reload(); setView(p.id); }} />
      )}
      {view && !edit && <RecurringView key={`${view}-${attempt}`} id={view} can={can} onClose={() => setView(null)} onEdit={(p) => setEdit(p)} onChanged={reload} />}
    </>
  );
}
