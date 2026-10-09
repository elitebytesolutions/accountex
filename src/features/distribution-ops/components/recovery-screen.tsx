"use client";

import { AlarmClock, CalendarClock, CircleCheck, FilePlus2, History, Printer, Save, Search, SearchX, SendToBack, Store, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DistributionOpsOptions, RecoverySheet, RecoverySheetList } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { distributionOpsOptions, generateRecovery, getRecovery, listRecovery, postRecovery, saveRecoveryLines } from "../api";

type Can = { create: boolean; edit: boolean; post: boolean };
type Line = RecoverySheet["lines"][number];
type Edit = { amt: string; mode: string; ref: string; bank: string; ptp: string; rem: string };
type Filter = "all" | "60" | "90" | "open";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const rs = (n: number) => `Rs ${fmt(n)}`;
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : fmt(n));
const num = (s: string) => { const x = Number(String(s).replace(/[^\d.]/g, "")); return Number.isFinite(x) ? x : 0; };
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const MODE_LABEL: Record<string, string> = { CASH: "Cash", CHEQUE: "Cheque", ONLINE: "Online", JAZZCASH: "JazzCash" };

/** Server keeps the reference inside remarks as "ref X · note". */
function splitRemarks(r: string | null) {
  const m = /^ref (\S+)(?: · (.*))?$/.exec(r ?? "");
  return m ? { ref: m[1]!, rem: m[2] ?? "" } : { ref: "", rem: r ?? "" };
}
const editOf = (l: Line): Edit => {
  const { ref, rem } = splitRemarks(l.remarks);
  return { amt: l.collectedAmount ? String(l.collectedAmount) : "", mode: l.mode ?? "CASH", ref, bank: l.depositBankAccountId ?? "", ptp: l.promiseToPayDate ?? "", rem };
};

function AgeChips({ v }: { v: number[] }) {
  return (
    <div className="ds-age">
      {v.map((x, k) => <span key={k} className={cn(`b${k}`, !x && "nil")} title={`${["0–30", "31–60", "61–90", "90+"][k]} days`}>{x ? compact(x) : "—"}</span>)}
    </div>
  );
}

function StatusBadge({ l, e }: { l: Line; e: Edit }) {
  if (l.status === "POSTED") return <Badge tone="good"><CircleCheck />{l.receipt?.docNo ?? "Posted"}</Badge>;
  if (num(e.amt) > 0) return <Badge tone="info" dot>Ready</Badge>;
  if (e.ptp) return <Badge tone="warn" dot>Promised</Badge>;
  return <Badge tone="neutral">Pending</Badge>;
}

/**
 * Recovery Sheet (template app/wholesale/recovery): the salesman's collection round for a route — outstanding
 * per shop with ageing, last payment and target; what was collected and how, or a promise-to-pay date. Saving keeps
 * the entries; posting records one customer receipt per collected shop (oldest invoices first).
 */
export function RecoveryScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [opts, setOpts] = useState<DistributionOpsOptions | null>(null);
  const [route, setRoute] = useState("");
  const [date, setDate] = useState(isoDay(new Date()));
  const [salesman, setSalesman] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [list, setList] = useState<RecoverySheetList | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(params.get("id"));
  const [sheet, setSheet] = useState<RecoverySheet | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [postOpen, setPostOpen] = useState(false);
  const [cashId, setCashId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    distributionOpsOptions().then((o) => {
      setOpts(o);
      setCashId(o.cashAccounts[0]?.id ?? "");
    }).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the options."));
  }, []);

  const loadList = useCallback(() => {
    listRecovery({ route: route || undefined, pageSize: 50 }).then(setList).catch(() => setList({ items: [], total: 0, counts: {} }));
  }, [route]);
  useEffect(() => { loadList(); }, [loadList]);

  const openSheet = useCallback((s: RecoverySheet) => {
    setSheet(s);
    setEdits(Object.fromEntries(s.lines.map((l) => [l.id, editOf(l)])));
    setDirty(false);
    setFieldErr({});
  }, []);

  useEffect(() => {
    if (!sheetId) return;
    let off = false;
    getRecovery(sheetId).then((s) => {
      if (off) return;
      openSheet(s);
      if (s.route) setRoute((r) => r || s.route!.id);
    }).catch((e) => !off && setError(e instanceof ApiError ? e.message : "Could not load the sheet."));
    return () => { off = true; };
  }, [sheetId, openSheet]);

  const select = (id: string | null) => {
    setSheetId(id);
    if (!id) setSheet(null);
    router.replace(id ? `/wholesale/recovery?id=${id}` : "/wholesale/recovery", { scroll: false });
  };

  const onRoute = (id: string) => {
    setRoute(id);
    const r = opts?.routes.find((x) => x.id === id);
    if (r?.salesmanEmployeeId) setSalesman(r.salesmanEmployeeId);
    select(null);
  };

  const generate = async () => {
    if (!route) { toast("Choose the route first", { tone: "warn" }); return; }
    setBusy(true);
    try {
      const s = await generateRecovery({ routeId: route, docDate: date, salesmanEmployeeId: salesman || null });
      toast(`${s.docNo} generated · ${s.shopCount} shops`, { tone: "good" });
      loadList();
      select(s.id);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not generate the sheet", { tone: "danger" });
    } finally { setBusy(false); }
  };

  const setEdit = (id: string, patch: Partial<Edit>) => {
    setEdits((m) => ({ ...m, [id]: { ...m[id]!, ...patch } }));
    setDirty(true);
  };

  const payload = (s: RecoverySheet) => ({
    rowVersion: s.rowVersion,
    lines: s.lines.filter((l) => l.status !== "POSTED").map((l) => {
      const e = edits[l.id]!;
      return { id: l.id, collectedAmount: num(e.amt), mode: e.mode, reference: e.ref || null, depositBankAccountId: e.mode === "ONLINE" || e.mode === "JAZZCASH" ? e.bank || null : null, promiseToPayDate: e.ptp || null, remarks: e.rem || null };
    }),
  });

  const fieldsOf = (e: unknown) => (e instanceof ApiError ? Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]) => [k, v[0] ?? ""])) : {});

  const save = async () => {
    if (!sheet) return null;
    setBusy(true);
    try {
      const s = await saveRecoveryLines(sheet.id, payload(sheet));
      openSheet(s);
      toast("Collections saved", { tone: "good" });
      return s;
    } catch (e) {
      setFieldErr(fieldsOf(e));
      toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
      return null;
    } finally { setBusy(false); }
  };

  const post = async () => {
    if (!sheet) return;
    const s = dirty ? await save() : sheet;
    if (!s) return;
    setBusy(true);
    try {
      const r = await postRecovery(s.id, s.rowVersion, cashId);
      openSheet(r);
      setPostOpen(false);
      loadList();
      toast(`${r.lines.filter((l) => l.status === "POSTED").length} receipts posted · ${rs(r.postedTotal)}`, { tone: "good" });
    } catch (e) {
      setFieldErr(fieldsOf(e));
      toast(e instanceof ApiError ? e.message : "Could not post", { tone: "danger" });
    } finally { setBusy(false); }
  };

  const rows = useMemo(() => {
    if (!sheet) return [];
    const qq = q.trim().toLowerCase();
    return sheet.lines.filter((l) => {
      const e = edits[l.id];
      if (qq && !`${l.customer.name} ${l.customer.code}`.toLowerCase().includes(qq)) return false;
      if (filter === "60") return l.age6190 + l.age90Plus > 0;
      if (filter === "90") return l.age90Plus > 0;
      if (filter === "open") return l.status !== "POSTED" && !(num(e?.amt ?? "") > 0);
      return true;
    });
  }, [sheet, edits, q, filter]);

  const stats = useMemo(() => {
    const ls = sheet?.lines ?? [];
    const posted = ls.filter((l) => l.status === "POSTED").reduce((t, l) => t + l.collectedAmount, 0);
    const pend = ls.filter((l) => l.status !== "POSTED").reduce((t, l) => t + num(edits[l.id]?.amt ?? ""), 0);
    const target = Math.max(1, sheet?.targetAmount ?? 0);
    const ptps = ls.filter((l) => l.status !== "POSTED" && edits[l.id]?.ptp).map((l) => edits[l.id]!.ptp).sort();
    return {
      posted, pend, target, out: ls.reduce((t, l) => t + l.outstandingAmount, 0), b90: ls.reduce((t, l) => t + l.age90Plus, 0), b90n: ls.filter((l) => l.age90Plus > 0).length,
      hit: ls.filter((l) => l.status === "POSTED" || num(edits[l.id]?.amt ?? "") > 0).length, ptp: ptps.length, nextPtp: ptps[0] ?? null,
      ready: ls.filter((l) => l.status !== "POSTED" && num(edits[l.id]?.amt ?? "") > 0).length,
    };
  }, [sheet, edits]);

  if (error && !opts) return <ErrorState message={error} onRetry={() => location.reload()} />;

  const editable = !!sheet && sheet.status === "OPEN" && can.edit;
  const p1 = Math.min(100, (stats.posted / stats.target) * 100);
  const p2 = Math.min(100 - p1, (stats.pend / stats.target) * 100);
  const pct = Math.round(((stats.posted + stats.pend) / stats.target) * 100);
  const salesmen = opts?.employees.filter((e) => e.isSalesman || e.isBooker) ?? [];
  const sheets = list?.items ?? [];
  const totalsAge = [0, 1, 2, 3].map((k) => rows.reduce((t, l) => t + [l.age030, l.age3160, l.age6190, l.age90Plus][k]!, 0));

  return (
    <>
      <PageHead
        eyebrow="Wholesale & Distribution / Distribution"
        title="Recovery Sheet"
        description="The salesman's collection round: who owes what and for how long, what came in today, and who promised to pay when."
        actions={<>
          <span className="tagline">Every rupee home</span>
          {sheet && <Button variant="secondary" icon={<History />} onClick={() => setHistoryOpen(true)}>History</Button>}
          <Button variant="secondary" icon={<Printer />} onClick={() => window.print()} disabled={!sheet}>Print sheet</Button>
          {editable && dirty && <Button variant="secondary" icon={<Save />} onClick={() => void save()} disabled={busy}>Save</Button>}
          {sheet?.status === "OPEN" && can.post && (
            <Button variant="primary" icon={<SendToBack />} onClick={() => setPostOpen(true)} disabled={busy || stats.ready === 0}>
              Post receipts in bulk <span className={cn("ds-count", stats.ready > 0 && "on")}>{stats.ready}</span>
            </Button>
          )}
        </>}
      />

      <div className="panel ds-rc-filters ds-rc-print-hide">
        <label><span>Salesman</span>
          <select value={salesman} onChange={(e) => setSalesman(e.target.value)}>
            <option value="">Route salesman</option>
            {salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        <label><span>Route</span>
          <select value={route} onChange={(e) => onRoute(e.target.value)}>
            <option value="">All routes</option>
            {opts?.routes.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
          </select></label>
        <label><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value || isoDay(new Date()))} /></label>
        <label className="ds-rc-search"><span>Search</span>
          <div className="ds-search"><Search /><input value={q} placeholder="Shop or code" onChange={(e) => setQ(e.target.value)} /></div></label>
        <div className="chips">
          {([["all", "All"], ["60", "61+ days"], ["90", "90+ days"], ["open", "Not collected"]] as [Filter, string][]).map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? "active" : undefined} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="ds-rc-sheets ds-rc-print-hide">
        {sheets.map((s) => (
          <button key={s.id} type="button" className={cn(s.id === sheetId && "on")} onClick={() => select(s.id)}>
            {s.docNo} · {dateLabel(s.docDate)} {s.route ? `· ${s.route.code}` : ""}
            <Badge tone={s.status === "POSTED" ? "good" : "info"} dot>{s.status === "POSTED" ? "Posted" : "Open"}</Badge>
          </button>
        ))}
        {can.create && <Button variant="secondary" size="sm" icon={<FilePlus2 />} onClick={() => void generate()} disabled={busy || !route}>Generate for {dateLabel(date)}</Button>}
      </div>

      {!sheet ? (
        <div className="panel">
          {sheetId ? <Skeleton style={{ height: 260 }} /> : (
            <EmptyState icon={<Wallet />} title={sheets.length ? "Open a recovery sheet" : "No recovery sheets yet"}
              description={route ? (can.create ? "Generate a sheet for this route and date: every shop that owes money, with its ageing and target." : "Sheets your team generates appear here.") : "Choose a route to see its sheets or generate one."}
              action={can.create && route ? <Button variant="primary" icon={<FilePlus2 />} onClick={() => void generate()} disabled={busy}>Generate sheet</Button> : undefined} />
          )}
        </div>
      ) : (
        <>
          {sheet.status === "POSTED" && <Banner tone="good" title={`${sheet.docNo} is posted`}>{rs(sheet.postedTotal)} recorded as customer receipts.</Banner>}
          <div className="ds-rc-top">
            <div className="panel ds-ring-card">
              <div className={cn("ds-ring", stats.posted + stats.pend >= stats.target && "hit")}>
                <svg viewBox="0 0 120 120"><circle className="trk" cx="60" cy="60" r="50" />
                  <circle className="a1" cx="60" cy="60" r="50" pathLength={100} style={{ strokeDasharray: `${p1} 100` }} />
                  <circle className="a2" cx="60" cy="60" r="50" pathLength={100} style={{ strokeDasharray: `${p2} 100`, strokeDashoffset: -p1 }} /></svg>
                <div className="ds-ring-c"><b>{pct}%</b><small>of target</small></div>
              </div>
              <div className="ds-ring-leg">
                <div><i className="t" /><span>Target</span><b>{rs(sheet.targetAmount)}</b></div>
                <div><i className="a1" /><span>Posted</span><b>{rs(stats.posted)}</b></div>
                <div><i className="a2" /><span>Entered, not posted</span><b>{rs(stats.pend)}</b></div>
                <div><i className="r" /><span>Still to collect</span><b>{rs(Math.max(0, sheet.targetAmount - stats.posted - stats.pend))}</b></div>
              </div>
            </div>
            <div className="kpi-grid c2 ds-rc-kpis">
              <div className="kpi"><div className="kpi-top"><span>Outstanding</span><span className="icon-well"><Wallet /></span></div><strong>{rs(stats.out)}</strong><small>{sheet.lines.length} shops on the sheet</small></div>
              <div className="kpi red"><div className="kpi-top"><span>90+ days</span><span className="icon-well"><AlarmClock /></span></div><strong>{rs(stats.b90)}</strong><small>{stats.b90n} shops need a visit</small></div>
              <div className="kpi teal"><div className="kpi-top"><span>Shops collected</span><span className="icon-well"><Store /></span></div><strong>{stats.hit}</strong><small>of {sheet.lines.length} on the sheet</small></div>
              <div className="kpi yellow"><div className="kpi-top"><span>Promises to pay</span><span className="icon-well"><CalendarClock /></span></div><strong>{stats.ptp}</strong><small>{stats.nextPtp ? `next ${dateLabel(stats.nextPtp)}` : "none recorded"}</small></div>
            </div>
          </div>

          <div className="panel flush">
            <div className="panel-head"><div><h3>Collection sheet</h3>
              <p>{sheet.docNo} · {sheet.salesman?.name ?? "No salesman"} · {sheet.route ? `${sheet.route.code} · ${sheet.route.name}` : "All routes"} · {dateLabel(sheet.docDate)}</p></div>
              <div className="panel-actions ds-agelegend"><span className="b0">0–30</span><span className="b1">31–60</span><span className="b2">61–90</span><span className="b3">90+</span></div></div>
            {fieldErr.lines && <div style={{ padding: "0 20px 12px" }}><Banner tone="danger" title={fieldErr.lines} /></div>}
            <div className="table-wrap"><table className="tbl ds-tbl ds-rctbl">
              <thead><tr><th>Shop</th><th className="num">Outstanding</th><th>Ageing</th><th>Last payment</th><th className="num">Collected</th><th>Mode</th><th>Reference</th><th>Remarks</th><th>Promise to pay</th><th>Status</th></tr></thead>
              <tbody>
                {rows.length ? rows.map((l, i) => {
                  const e = edits[l.id]!;
                  const posted = l.status === "POSTED";
                  const dis = posted || !editable;
                  const over = num(e.amt) > l.outstandingAmount && !posted;
                  const idx = sheet.lines.filter((x) => x.status !== "POSTED").findIndex((x) => x.id === l.id);
                  const err = (k: string) => fieldErr[`lines.${idx}.${k}`];
                  return (
                    <tr key={l.id} className={cn("ds-rowin", posted && "ds-posted")} style={{ ["--i" as string]: i }}>
                      <td><div className="ds-shopcell"><span className="avatar sm">{initials(l.customer.name)}</span><div><b>{l.customer.name}</b><small>{l.customer.code} · limit {compact(l.creditLimit)} · target {compact(l.targetAmount)}</small></div></div></td>
                      <td className="num"><b>{fmt(l.outstandingAmount)}</b></td>
                      <td><AgeChips v={[l.age030, l.age3160, l.age6190, l.age90Plus]} /></td>
                      <td>{l.lastPaymentDate ? <>{dateLabel(l.lastPaymentDate)}<small>{rs(l.lastPaymentAmount)}</small></> : <span className="muted">—</span>}</td>
                      <td className="num"><input className={cn("cell-input ds-amt", (over || err("collectedAmount")) && "bad")} inputMode="numeric" value={e.amt} placeholder="0" disabled={dis}
                        title={over ? "More than the outstanding balance" : err("collectedAmount")} aria-label={`Collected from ${l.customer.name}`} onChange={(ev) => setEdit(l.id, { amt: ev.target.value.replace(/[^\d.]/g, "") })} /></td>
                      <td><select className="cell-input ds-mode" value={e.mode} disabled={dis} onChange={(ev) => setEdit(l.id, { mode: ev.target.value })}>
                        {(opts?.lookups.recoveryModes.length ? opts.lookups.recoveryModes : Object.keys(MODE_LABEL).map((c) => ({ code: c, label: MODE_LABEL[c]! }))).map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
                      </select>
                        {(e.mode === "ONLINE" || e.mode === "JAZZCASH") && !posted && (
                          <select className={cn("cell-input ds-bank", err("depositBankAccountId") && "bad")} value={e.bank} disabled={dis} title={err("depositBankAccountId")} aria-label="Deposit bank" onChange={(ev) => setEdit(l.id, { bank: ev.target.value })}>
                            <option value="">{e.mode === "JAZZCASH" ? "Wallet clearing" : "Bank…"}</option>
                            {opts?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                          </select>
                        )}</td>
                      <td><input className={cn("cell-input ds-ref", err("reference") && "bad")} value={e.ref} disabled={dis} title={err("reference")}
                        placeholder={e.mode === "CHEQUE" ? "Cheque no" : e.mode === "CASH" ? "—" : "Txn ID"} onChange={(ev) => setEdit(l.id, { ref: ev.target.value.replace(/\s+/g, "") })} /></td>
                      <td><input className="cell-input ds-rem" value={e.rem} disabled={dis} placeholder="Note" onChange={(ev) => setEdit(l.id, { rem: ev.target.value })} /></td>
                      <td><input className="cell-input ds-ptp" type="date" value={e.ptp} disabled={dis} aria-label="Promise to pay" onChange={(ev) => setEdit(l.id, { ptp: ev.target.value })} /></td>
                      <td><StatusBadge l={l} e={e} />{posted && l.receipt && <small><Link className="link" href={`/receivables/receipts?id=${l.receipt.id}`}>View receipt</Link></small>}</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={10}><div className="ds-empty"><SearchX /><b>No shops match</b><small>Try another filter or search.</small></div></td></tr>
                )}
              </tbody>
              <tfoot><tr><td>Total · {rows.length} shops</td><td className="num">{fmt(rows.reduce((t, l) => t + l.outstandingAmount, 0))}</td><td><AgeChips v={totalsAge} /></td><td />
                <td className="num">{fmt(rows.reduce((t, l) => t + (l.status === "POSTED" ? l.collectedAmount : num(edits[l.id]?.amt ?? "")), 0))}</td><td colSpan={5} /></tr></tfoot>
            </table></div>
          </div>
        </>
      )}

      <Modal open={postOpen} onClose={() => setPostOpen(false)} title="Post receipts" subtitle={`${stats.ready} shops · ${rs(stats.pend)}`}
        foot={<><Button variant="secondary" onClick={() => setPostOpen(false)}>Cancel</Button><Button variant="primary" icon={<SendToBack />} onClick={() => void post()} disabled={busy || !cashId}>Post {stats.ready} receipts</Button></>}>
        <p className="muted" style={{ marginTop: 0 }}>Each collected shop gets a customer receipt allocated to its oldest invoices. Cheques go to Cheques in hand and are cleared in the cheque register.</p>
        <Field label="Cash account for cash collections" required error={fieldErr.cashAccountId}>
          <select value={cashId} onChange={(e) => setCashId(e.target.value)}>
            {opts?.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </Field>
        {dirty && <Banner tone="info" title="Unsaved entries are saved first." />}
      </Modal>

      {sheet && (
        <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title={`History · ${sheet.docNo}`} wide>
          <HistoryTab schema="Distribution" table="RecoverySheets" id={sheet.id} />
        </Drawer>
      )}
    </>
  );
}
