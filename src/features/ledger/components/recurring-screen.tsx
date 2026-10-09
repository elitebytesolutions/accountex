"use client";

import { CalendarClock, Coins, History, MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Search, Trash2, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ONE_SIDED, recurringErrors, type GlOptions, type RecurringInput, type RecurringRun, type RecurringTemplate } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { HistoryTab } from "@/features/history/components/history-tab";
import { dateLabel, Hl, isoDay, Money } from "@/features/finance/components/finance-ui";
import {
  createRecurring, deleteRecurring, listRecurring, recurringAction, recurringRuns, runDueRecurring, runRecurring, updateRecurring, voucherOptions,
} from "../api";

type Can = { create: boolean; edit: boolean; remove: boolean; post: boolean };
type Line = { id?: string; accountId: string; particulars: string; debit: string; credit: string };
type Form = {
  name: string; description: string; voucherType: "JV" | "BPV" | "CPV"; frequency: string; runDay: string; runOnLastDay: boolean; runWeekday: string; runMonth: string;
  startDate: string; endMode: string; endAfterCount: string; endOnDate: string; branchId: string; narration: string; cashBankAccountId: string; partyName: string;
  autoPost: boolean; notifyOnFailure: boolean; lines: Line[];
};
const TYPE_TONE: Record<string, string> = { JV: "violet", BPV: "warn", CPV: "info" };
const TYPE_LABEL: Record<string, string> = { JV: "Journal (JV)", BPV: "Bank Payment (BPV)", CPV: "Cash Payment (CPV)" };
const STATUS: Record<string, [string, string]> = { ACTIVE: ["Active", "good"], PAUSED: ["Paused", "neutral"], FAILED: ["Failed", "danger"] };
const FREQ: Record<string, string> = { NONE: "Manual only", WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAGE = 10;
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const num = (s: string) => { const n = Number(String(s).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intOrNull = (s: string) => (s === "" ? null : Number(s));
const apiMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const apiFields = (e: unknown): Record<string, string> => (e instanceof ApiError && e.details ? Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])) : {});

/** "Monthly · 1st", "Monthly · last day", "Weekly · Mon", "Yearly · 30 Jun". */
export function scheduleLabel(t: Pick<RecurringTemplate, "frequency" | "runDay" | "runOnLastDay" | "runWeekday" | "runMonth">) {
  const day = t.runOnLastDay ? "last day" : t.runDay ? ord(t.runDay) : "";
  if (t.frequency === "NONE") return FREQ.NONE;
  if (t.frequency === "WEEKLY") return `Weekly · ${WEEKDAYS[(t.runWeekday ?? 1) - 1]}`;
  if (t.frequency === "YEARLY") return `Yearly · ${t.runOnLastDay ? "last day" : t.runDay ?? ""} ${MONTHS[(t.runMonth ?? 1) - 1]}`;
  return `${FREQ[t.frequency] ?? t.frequency} · ${day}`;
}

/** Finance › Voucher Management › Recurring Templates (template app/accounting/recurring). */
export function RecurringScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<RecurringTemplate[] | null>(null);
  const [opts, setOpts] = useState<GlOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("all");
  const [page, setPage] = useState(1);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: RecurringTemplate } | null>(null);
  const [edit, setEdit] = useState<{ row: RecurringTemplate | null } | null>(null);
  const [runsOf, setRunsOf] = useState<RecurringTemplate | null>(null);
  const [del, setDel] = useState<RecurringTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRecurring(), voucherOptions()])
      .then(([r, o]) => { if (!cancelled) { setRows(r); setOpts(o); setLoadedAt(Date.now()); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load recurring templates" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  const stats = useMemo(() => {
    const all = rows ?? [];
    const today = isoDay(new Date(loadedAt)), week = isoDay(new Date(loadedAt + 7 * 86_400_000));
    const due = all.filter((t) => t.status === "ACTIVE" && t.nextRunDate && t.nextRunDate <= week);
    const failed = all.filter((t) => t.status === "FAILED");
    return {
      active: all.filter((t) => t.status === "ACTIVE").length, paused: all.filter((t) => t.status === "PAUSED").length,
      due: due.length, dueValue: due.reduce((s, t) => s + t.amount, 0), overdue: due.filter((t) => t.nextRunDate! < today).length,
      monthly: all.filter((t) => t.status !== "PAUSED" && t.frequency === "MONTHLY").reduce((s, t) => s + t.amount, 0),
      failed: failed.length, failedNote: failed[0]?.lastError ?? null,
      next: all.filter((t) => t.status === "ACTIVE" && t.nextRunDate).map((t) => t.nextRunDate!).sort()[0] ?? null,
    };
  }, [rows, loadedAt]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const all = rows ?? [];
  const count = (k: string) => (k === "all" ? all.length : k === "PAUSED" || k === "FAILED" ? all.filter((t) => t.status === k).length : all.filter((t) => t.frequency === k).length);
  const chips = (["all", "MONTHLY", "WEEKLY", "QUARTERLY", "YEARLY", "PAUSED", "FAILED"] as const).filter((k) => ["all", "MONTHLY", "QUARTERLY", "YEARLY", "PAUSED"].includes(k) || count(k) > 0);
  const qq = q.trim().toLowerCase();
  const shown = all.filter((t) => (chip === "all" || t.status === chip || t.frequency === chip) && (!qq || `${t.name} ${t.narration} ${t.description ?? ""}`.toLowerCase().includes(qq)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages);
  const paged = shown.slice((cur - 1) * PAGE, cur * PAGE);

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await work(); toast(done, { tone: "good" }); reload(); } catch (e) { toast(apiMessage(e, "Something went wrong"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const runNow = async (t: RecurringTemplate) => {
    setBusy(true);
    try {
      const r = await runRecurring(t.id);
      if (r.voucherId) {
        const id = r.voucherId;
        toast(`${r.run?.voucher?.docNo ?? "Voucher"} ${t.autoPost ? "posted" : "created as a draft"}`, { tone: "good", action: { label: "Open", onClick: () => router.push(`/accounting/vouchers/${id}`) } });
      } else {
        toast(r.run?.status === "SKIPPED" ? `Skipped: ${r.run.errorMessage ?? "template is paused"}` : `Run failed: ${r.run?.errorMessage ?? "see run history"}`, { tone: r.run?.status === "SKIPPED" ? "info" : "danger" });
      }
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not run the template"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const toggleAuto = (t: RecurringTemplate) => act(() => updateRecurring(t.id, { ...bodyOf(formOf(t, opts)), autoPost: !t.autoPost, rowVersion: t.rowVersion }), `Auto-post ${t.autoPost ? "off" : "on"} for ${t.name}`);
  const items = (t: RecurringTemplate): MenuItem[] => [
    ...(can.edit ? [{ label: "Edit", icon: <Pencil />, onClick: () => setEdit({ row: t }) }] : []),
    ...(can.post ? [{ label: "Run now", icon: <Play />, disabled: busy, onClick: () => void runNow(t) }] : []),
    ...(can.edit ? [t.status === "PAUSED"
      ? { label: "Resume", icon: <Play />, disabled: t.frequency === "NONE", onClick: () => void act(() => recurringAction(t.id, "resume", t.rowVersion), `${t.name} resumed`) }
      : { label: "Pause", icon: <Pause />, onClick: () => void act(() => recurringAction(t.id, "pause", t.rowVersion), `${t.name} paused`) }] : []),
    { label: "Run history", icon: <History />, onClick: () => setRunsOf(t) },
    ...(can.remove ? [{ sep: true as const }, { label: "Delete", icon: <Trash2 />, danger: true, onClick: () => setDel(t) }] : []),
  ];
  const legs = (t: RecurringTemplate) => {
    const dr = t.lines.find((l) => l.debit > 0)?.account.code;
    const cr = t.cashBankAccount?.code ?? t.lines.find((l) => l.credit > 0)?.account.code;
    return t.description ?? [dr && `Dr ${dr}`, cr && `Cr ${cr}`].filter(Boolean).join(" · ");
  };

  return (
    <>
      <PageHead eyebrow="Accounting / Vouchers / Recurring" title="Recurring Templates" description="Vouchers generated automatically on a schedule — rent, accruals, depreciation and loan instalments."
        actions={<>
          {can.post && <button className="btn secondary" type="button" disabled={busy || !rows} onClick={() => void act(async () => {
            const r = await runDueRecurring();
            toast(r.runs || r.reversed ? `${r.runs} voucher${r.runs === 1 ? "" : "s"} generated${r.failed ? `, ${r.failed} failed` : ""}${r.reversed ? ` · ${r.reversed} auto-reversal${r.reversed === 1 ? "" : "s"}` : ""}` : "Nothing is due", { tone: r.failed ? "warn" : "info" });
          }, "Due templates processed")}><Play />Run due now</button>}
          {can.create && <button className="btn primary" type="button" disabled={!opts} onClick={() => setEdit({ row: null })}><Plus />New Template</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Active templates</span><span className="icon-well"><Repeat /></span></div><strong>{rows ? stats.active : "—"}</strong><small>{stats.paused} paused</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Due this week</span><span className="icon-well"><CalendarClock /></span></div><strong>{rows ? stats.due : "—"}</strong>
          <small className={cn(stats.overdue > 0 && "down")}><Money value={stats.dueValue} dec={0} />{stats.overdue > 0 && ` · ${stats.overdue} overdue`}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Monthly value</span><span className="icon-well"><Coins /></span></div><strong><Money value={stats.monthly} dec={0} /></strong><small>Monthly templates</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Failed runs</span><span className="icon-well"><TriangleAlert /></span></div><strong>{rows ? stats.failed : "—"}</strong>
          <small className={cn(stats.failed > 0 && "down")} title={stats.failedNote ?? undefined}>{stats.failed ? (stats.failedNote ?? "Needs attention").slice(0, 40) : "All runs succeeded"}</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Recurring templates</h3><p>{all.length} templates · {stats.active} active{stats.next ? ` · next run ${dateLabel(stats.next)}` : ""}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search templates…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <div className="chips">
            {chips.map((k) => (
              <button key={k} type="button" className={cn(chip === k && "active")} onClick={() => { setChip(k); setPage(1); }}>
                {k === "all" ? "All" : k === "PAUSED" ? "Paused" : k === "FAILED" ? "Failed" : FREQ[k]} <i>{count(k)}</i>
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Template</th><th>Type</th><th>Frequency</th><th>Next run</th><th>Last run</th><th className="num">Amount</th><th>Auto-post</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!rows ? <tr><td colSpan={9}><Skeleton style={{ height: 220 }} /></td></tr> : paged.length ? paged.map((t) => {
              const [st, tone] = STATUS[t.status] ?? [t.status, "neutral"];
              return (
                <tr key={t.id}>
                  <td><b><Hl text={t.name} q={q} /></b><small>{legs(t)}</small></td>
                  <td><span className={cn("badge", TYPE_TONE[t.voucherType] ?? "neutral")}>{t.voucherType}</span></td>
                  <td>{scheduleLabel(t)}</td>
                  <td>{t.status === "PAUSED" ? "—" : dateLabel(t.nextRunDate)}</td>
                  <td>{dateLabel(t.lastRunDate)}</td>
                  <td className="num"><Money value={t.amount} rs={false} /></td>
                  <td><Switch aria-label={`Auto-post ${t.name}`} checked={t.autoPost} disabled={!can.edit || busy} onChange={() => void toggleAuto(t)} /></td>
                  <td><span className={cn("badge dot", tone)} title={t.lastError ?? undefined}>{st}</span></td>
                  <td className="actions"><button className="icon-btn-sm" type="button" aria-label={`Actions for ${t.name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, row: t })}><MoreHorizontal /></button></td>
                </tr>
              );
            }) : <tr><td colSpan={9}><EmptyState icon={<Repeat />} title={qq || chip !== "all" ? "No template matches" : "No recurring templates yet"}
              description={qq || chip !== "all" ? "Try another search or filter." : "Set up rent, accruals or loan instalments once and let them post on schedule."}
              action={!qq && chip === "all" && can.create ? <button className="btn primary" type="button" onClick={() => setEdit({ row: null })}><Plus />New Template</button> : undefined} /></td></tr>}
          </tbody>
        </table></div>
        {rows && shown.length > 0 && (
          <div className="table-foot"><span>Showing {paged.length} of {shown.length} templates</span>
            <div className="pager">
              <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="Previous page">‹</button>
              {Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={cn(cur === i + 1 && "active")} onClick={() => setPage(i + 1)}>{i + 1}</button>)}
              <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label="Next page">›</button>
            </div>
          </div>
        )}
      </div>

      {menu && <Menu anchor={menu.anchor} items={items(menu.row)} onClose={closeMenu} />}
      {edit && opts && <TemplateModal row={edit.row} opts={opts} canEdit={edit.row ? can.edit : can.create} onClose={() => setEdit(null)} onSaved={(t, created) => { toast(created ? `${t.name} created` : `${t.name} saved`, { tone: "good" }); setEdit(null); reload(); }} />}
      {runsOf && <RunsModal template={runsOf} onClose={() => setRunsOf(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger busy={busy} title={`Delete ${del?.name ?? "template"}?`} confirmLabel="Delete"
        onConfirm={() => del && void act(() => deleteRecurring(del.id, del.rowVersion), `${del.name} deleted`).then(() => setDel(null))}>
        Templates that have already run keep their history and can only be paused.
      </ConfirmDialog>
    </>
  );
}

function formOf(t: RecurringTemplate | null, opts: GlOptions | null): Form {
  return {
    name: t?.name ?? "", description: t?.description ?? "", voucherType: (t?.voucherType as Form["voucherType"]) ?? "JV", frequency: t?.frequency ?? "MONTHLY",
    runDay: t ? (t.runDay?.toString() ?? "") : "1", runOnLastDay: t?.runOnLastDay ?? false, runWeekday: t?.runWeekday?.toString() ?? "1", runMonth: t?.runMonth?.toString() ?? "6",
    startDate: t?.startDate ?? isoDay(new Date()), endMode: t?.endMode ?? "NEVER", endAfterCount: t?.endAfterCount?.toString() ?? "12", endOnDate: t?.endOnDate ?? "",
    branchId: t?.branch.id ?? opts?.branches[0]?.id ?? "", narration: t?.narration ?? "", cashBankAccountId: t?.cashBankAccount?.id ?? "", partyName: t?.partyName ?? "",
    autoPost: t?.autoPost ?? true, notifyOnFailure: t?.notifyOnFailure ?? true,
    lines: t ? t.lines.map((l) => ({ id: l.id, accountId: l.account.id, particulars: l.narration ?? "", debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "" }))
      : [{ accountId: "", particulars: "", debit: "", credit: "" }, { accountId: "", particulars: "", debit: "", credit: "" }],
  };
}

/** The API body (RecurringInput) from the form. */
function bodyOf(f: Form): RecurringInput {
  const oneSided = !!ONE_SIDED[f.voucherType];
  return {
    name: f.name.trim(), description: f.description.trim() || null, voucherType: f.voucherType, frequency: f.frequency as RecurringInput["frequency"],
    runDay: f.runOnLastDay || f.frequency === "WEEKLY" || f.frequency === "NONE" ? null : intOrNull(f.runDay), runOnLastDay: f.frequency === "WEEKLY" || f.frequency === "NONE" ? false : f.runOnLastDay,
    runWeekday: f.frequency === "WEEKLY" ? intOrNull(f.runWeekday) : null, runMonth: f.frequency === "YEARLY" ? intOrNull(f.runMonth) : null,
    startDate: f.startDate || null, endMode: f.endMode as RecurringInput["endMode"], endAfterCount: f.endMode === "AFTER_N" ? intOrNull(f.endAfterCount) : null,
    endOnDate: f.endMode === "ON_DATE" ? f.endOnDate || null : null, branchId: f.branchId, narration: f.narration.trim(),
    cashBankAccountId: oneSided ? f.cashBankAccountId || null : null, partyName: f.partyName.trim() || null, autoPost: f.autoPost, notifyOnFailure: f.notifyOnFailure,
    lines: f.lines.map((l) => ({ ...(l.id && { id: l.id }), accountId: l.accountId, particulars: l.particulars.trim() || null, debit: num(l.debit), credit: oneSided ? 0 : num(l.credit), costCentreId: null })),
  };
}

/** Template acc-new-recurring: schedule + voucher lines; edit adds the template's History. */
function TemplateModal({ row, opts, canEdit, onClose, onSaved }: {
  row: RecurringTemplate | null;
  opts: GlOptions;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (t: RecurringTemplate, created: boolean) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(() => formOf(row, opts));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"details" | "history">("details");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const setLine = (i: number, patch: Partial<Line>) => {
    setF((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
    setErrs((e) => ({ ...e, lines: "", [`lines.${i}.accountId`]: "", [`lines.${i}.debit`]: "", [`lines.${i}.credit`]: "" }));
  };
  const oneSided = !!ONE_SIDED[f.voucherType];
  const cashBank = f.voucherType === "CPV" ? opts.cashAccounts : f.voucherType === "BPV" ? opts.bankAccounts : [];
  const dr = f.lines.reduce((s, l) => s + num(l.debit), 0);
  const cr = oneSided ? dr : f.lines.reduce((s, l) => s + num(l.credit), 0);
  const ro = !canEdit;

  const save = async () => {
    const body = bodyOf(f);
    const e = recurringErrors(body);
    if (!body.name) e.name = "Name the template";
    if (!body.narration) e.narration = "Narration is required";
    body.lines.forEach((l, i) => { if (!l.accountId) e[`lines.${i}.accountId`] = "Choose the account"; });
    if (Object.keys(e).length) {
      setErrs(e);
      setTab("details");
      toast(Object.values(e)[0]!, { tone: "danger" });
      return;
    }
    setBusy(true);
    try {
      const t = row ? await updateRecurring(row.id, { ...body, rowVersion: row.rowVersion }) : await createRecurring(body);
      onSaved(t, !row);
    } catch (err) {
      setErrs(apiFields(err));
      toast(apiMessage(err, "Could not save the template"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const lineErr = (i: number) => errs[`lines.${i}.accountId`] || errs[`lines.${i}.debit`] || errs[`lines.${i}.credit`];

  return (
    <Modal open onClose={onClose} wide title={row ? row.name : "New recurring template"} subtitle={row ? `${scheduleLabel(row)} · ${STATUS[row.status]?.[0] ?? row.status}` : "Define voucher lines and a schedule"}
      foot={<><button className="btn secondary" type="button" onClick={onClose}>{ro ? "Close" : "Cancel"}</button>
        {!ro && tab === "details" && <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : row ? "Save changes" : "Create template"}</button>}</>}>
      {row && <Tabs items={[{ key: "details", label: "Details" }, { key: "history", label: "History", icon: <History /> }]} active={tab} onChange={setTab} />}
      {tab === "history" && row ? <HistoryTab schema="Accounting" table="RecurringVoucherTemplates" id={row.id} /> : (
        <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {row?.status === "FAILED" && <Banner tone="danger" title="The last run failed">{row.lastError ?? "See the run history."} Saving the template makes it active again.</Banner>}
          <FormGrid cols={3}>
            <Field label="Template name" required full error={errs.name}><input value={f.name} placeholder="e.g. Generator maintenance — Lahore HQ" onChange={(e) => set("name", e.target.value)} aria-invalid={!!errs.name} /></Field>
            <Field label="Voucher type">
              <select value={f.voucherType} onChange={(e) => { set("voucherType", e.target.value as Form["voucherType"]); set("cashBankAccountId", ""); }}>
                {(["JV", "BPV", "CPV"] as const).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field label="Frequency">
              <select value={f.frequency} onChange={(e) => set("frequency", e.target.value)}>
                {["MONTHLY", "WEEKLY", "QUARTERLY", "YEARLY", "NONE"].map((k) => <option key={k} value={k}>{FREQ[k]}</option>)}
              </select>
            </Field>
            {f.frequency === "WEEKLY" ? (
              <Field label="Day of week" error={errs.runWeekday}>
                <select value={f.runWeekday} onChange={(e) => set("runWeekday", e.target.value)}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
              </Field>
            ) : f.frequency !== "NONE" ? (
              <Field label={f.frequency === "YEARLY" ? "Day and month" : "Day of period"} error={errs.runDay}>
                <div style={{ display: "flex", gap: 8 }}>
                  <select aria-invalid={!!errs.runDay} value={f.runOnLastDay ? "last" : f.runDay} onChange={(e) => { if (e.target.value === "last") { set("runOnLastDay", true); set("runDay", ""); } else { set("runOnLastDay", false); set("runDay", e.target.value); } }}>
                    <option value="">Choose…</option>
                    {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{ord(i + 1)}</option>)}
                    <option value="last">Last day</option>
                  </select>
                  {f.frequency === "YEARLY" && <select aria-label="Month" value={f.runMonth} onChange={(e) => set("runMonth", e.target.value)}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>}
                </div>
              </Field>
            ) : <Field label="Schedule" hint="Run it from the ⋯ menu when needed"><input value="Manual only" readOnly /></Field>}
            <Field label="Start date" required={f.frequency !== "NONE"} error={errs.startDate}><input type="date" value={f.startDate} aria-invalid={!!errs.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
            <Field label="End after" error={errs.endAfterCount || errs.endOnDate}>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={f.endMode} onChange={(e) => set("endMode", e.target.value)}>
                  <option value="NEVER">Never</option><option value="AFTER_N">Occurrences…</option><option value="ON_DATE">On date…</option>
                </select>
                {f.endMode === "AFTER_N" && <input type="number" min={1} max={1000} aria-label="Occurrences" value={f.endAfterCount} onChange={(e) => set("endAfterCount", e.target.value)} style={{ width: 90 }} />}
                {f.endMode === "ON_DATE" && <input type="date" aria-label="End date" value={f.endOnDate} onChange={(e) => set("endOnDate", e.target.value)} />}
              </div>
            </Field>
            <Field label="Branch" error={errs.branchId}>
              <select value={f.branchId} onChange={(e) => set("branchId", e.target.value)}>{opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </Field>
            {oneSided && <>
              <Field label={f.voucherType === "CPV" ? "Cash account" : "Bank account"} required error={errs.cashBankAccountId}>
                <select aria-invalid={!!errs.cashBankAccountId} value={f.cashBankAccountId} onChange={(e) => set("cashBankAccountId", e.target.value)}>
                  <option value="">Choose…</option>
                  {cashBank.map((a) => <option key={a.accountId} value={a.accountId}>{a.code} · {a.name}</option>)}
                </select>
              </Field>
              <Field label="Paid to"><input value={f.partyName} placeholder="Payee" onChange={(e) => set("partyName", e.target.value)} /></Field>
            </>}
            <Field label="Narration" required full error={errs.narration}><input value={f.narration} aria-invalid={!!errs.narration} placeholder="Shown on every generated voucher" onChange={(e) => set("narration", e.target.value)} /></Field>
          </FormGrid>

          {errs.lines && <Banner tone="danger" title="Check the lines">{errs.lines}</Banner>}
          <div className="table-wrap mt"><table className="tbl lines">
            <thead><tr><th>Account</th><th>Narration</th><th className="num">Debit</th><th className="num">Credit</th><th /></tr></thead>
            <tbody>
              {f.lines.map((l, i) => (
                <tr key={i} title={lineErr(i) || undefined}>
                  <td><select className="cell-input" aria-label={`Line ${i + 1} account`} aria-invalid={!!errs[`lines.${i}.accountId`]} value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}
                    style={errs[`lines.${i}.accountId`] ? { borderColor: "var(--danger)" } : undefined}>
                    <option value="">Choose account…</option>
                    {opts.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select></td>
                  <td><input className="cell-input" aria-label={`Line ${i + 1} narration`} value={l.particulars} onChange={(e) => setLine(i, { particulars: e.target.value })} /></td>
                  <td><input className="cell-input num" inputMode="decimal" aria-label={`Line ${i + 1} debit`} placeholder="0.00" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, ...(e.target.value ? { credit: "" } : {}) })}
                    style={errs[`lines.${i}.debit`] ? { borderColor: "var(--danger)" } : undefined} /></td>
                  <td><input className="cell-input num" inputMode="decimal" aria-label={`Line ${i + 1} credit`} placeholder="0.00" disabled={oneSided} value={oneSided ? "" : l.credit} onChange={(e) => setLine(i, { credit: e.target.value, ...(e.target.value ? { debit: "" } : {}) })}
                    style={errs[`lines.${i}.credit`] ? { borderColor: "var(--danger)" } : undefined} /></td>
                  <td className="actions">{f.lines.length > 1 && <button className="icon-btn-sm" type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setF((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}><X /></button>}</td>
                </tr>
              ))}
              {oneSided && (
                <tr className="muted"><td>{cashBank.find((a) => a.accountId === f.cashBankAccountId)?.name ?? (f.voucherType === "CPV" ? "Cash account" : "Bank account")} <span className="badge neutral">auto</span></td>
                  <td>{f.partyName || f.narration || "—"}</td><td className="num">—</td><td className="num">{fmt(dr)}</td><td /></tr>
              )}
              <tr><td colSpan={5}><button className="btn ghost sm" type="button" onClick={() => setF((x) => ({ ...x, lines: [...x.lines, { accountId: "", particulars: "", debit: "", credit: "" }] }))}><Plus />Add line</button></td></tr>
              <tr className="total"><td colSpan={2}>Totals{Math.round(dr * 100) !== Math.round(cr * 100) && <span className="badge danger" style={{ marginLeft: 8 }}>Unbalanced</span>}</td>
                <td className="num">{fmt(dr)}</td><td className="num">{fmt(cr)}</td><td /></tr>
            </tbody>
          </table></div>
          <div className="stack mt">
            <Switch label="Auto-post generated vouchers" checked={f.autoPost} onChange={(e) => set("autoPost", e.target.checked)} />
            <Switch label="Notify me when a run fails" checked={f.notifyOnFailure} onChange={(e) => set("notifyOnFailure", e.target.checked)} />
          </div>
        </fieldset>
      )}
    </Modal>
  );
}

/** Every run of a template: date, trigger, result and the voucher it made. */
function RunsModal({ template, onClose }: { template: RecurringTemplate; onClose: () => void }) {
  const [runs, setRuns] = useState<RecurringRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    recurringRuns(template.id).then((r) => !cancelled && setRuns(r)).catch((e: unknown) => !cancelled && setError(apiMessage(e, "Could not load the runs")));
    return () => { cancelled = true; };
  }, [template.id]);
  const tone: Record<string, string> = { SUCCESS: "good", FAILED: "danger", SKIPPED: "neutral" };
  return (
    <Modal open onClose={onClose} wide title="Run history" subtitle={`${template.name} · ${template.occurrencesDone} successful runs`} foot={<button className="btn secondary" type="button" onClick={onClose}>Close</button>}>
      {error ? <ErrorState message={error} /> : !runs ? <Skeleton style={{ height: 160 }} /> : runs.length ? (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Scheduled</th><th>Ran at</th><th>Trigger</th><th>Status</th><th>Voucher</th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id}>
              <td>{dateLabel(r.scheduledDate)}</td>
              <td>{new Date(r.runAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
              <td>{r.triggerType === "SCHEDULE" ? "Schedule" : "Manual"}</td>
              <td><span className={cn("badge dot", tone[r.status] ?? "neutral")}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>{r.errorMessage && <small className="muted" style={{ display: "block" }}>{r.errorMessage}</small>}</td>
              <td>{r.voucher ? <Link href={`/accounting/vouchers/${r.voucher.id}`}><b>{r.voucher.docNo}</b></Link> : "—"}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <EmptyState icon={<History />} title="No runs yet" description="Runs appear here once the schedule fires or someone runs the template." />}
    </Modal>
  );
}
