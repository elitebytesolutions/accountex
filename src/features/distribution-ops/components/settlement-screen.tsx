"use client";

import { BookCheck, Check, CircleCheck, CircleDotDashed, CircleX, FilePlus2, FileCheck2, HandCoins, History, Minus, NotebookPen, Plus, Save, Scale, Trash2, Truck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DistributionOpsOptions, RouteSettlement, RouteSettlementList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead, Panel } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { distributionOpsOptions, getSettlement, listSettlements, postSettlement, saveSettlement } from "../api";
import "./settlement-screen.css";

type Can = { edit: boolean; post: boolean };
type State = "FULL" | "PARTIAL" | "NONE";
type Cheque = { chequeNo: string; bankId: string; bankName: string; chequeDate: string; amount: string };
type Ret = { invoiceLineId: string; qty: string; reason: string };
type Row = { lineId: string; invoiceId: string; state: State; why: string; cash: string; cheques: Cheque[]; returns: Ret[] };
type SLine = RouteSettlement["lines"][number];

const DEN = [5000, 1000, 500, 100, 50, 20, 10, 5, 1];
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const rs = (n: number) => `Rs ${fmt(n)}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (s: string) => { const x = Number(String(s).replace(/,/g, "")); return Number.isFinite(x) ? x : 0; };
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);
const DELIV: Record<State, { tone: string; icon: React.ReactNode; label: string }> = {
  FULL: { tone: "good", icon: <CircleCheck />, label: "Full" },
  PARTIAL: { tone: "warn", icon: <CircleDotDashed />, label: "Partial" },
  NONE: { tone: "danger", icon: <CircleX />, label: "Not delivered" },
};
const NEXT: Record<State, State> = { FULL: "PARTIAL", PARTIAL: "NONE", NONE: "FULL" };
const ST_TONE: Record<string, Tone> = { OPEN: "info", SETTLED: "good" };

function rowsOf(s: RouteSettlement): Row[] {
  return s.lines.map((l) => ({
    lineId: l.id, invoiceId: l.invoice.id, state: (l.deliveryState as State) ?? "FULL", why: l.nonDeliveryReason ?? "",
    cash: l.cashAmount ? String(l.cashAmount) : "",
    cheques: l.cheques.map((c) => ({ chequeNo: c.chequeNo, bankId: c.bankId ?? "", bankName: c.bankName, chequeDate: c.chequeDate, amount: String(c.amount) })),
    returns: l.returns.map((x) => ({ invoiceLineId: x.invoiceLineId, qty: String(x.returnQty), reason: x.reason })),
  }));
}
const retVal = (row: Row, line: SLine) => r2(row.returns.reduce((t, x) => t + num(x.qty) * (line.invoiceLines.find((y) => y.id === x.invoiceLineId)?.netRate ?? 0), 0));
const retPcs = (row: Row) => row.returns.reduce((t, x) => t + num(x.qty), 0);
const chqSum = (row: Row) => r2(row.cheques.reduce((t, c) => t + num(c.amount), 0));
const credit = (row: Row, line: SLine) => row.state === "NONE" ? 0 : r2(line.balanceAmount - num(row.cash) - chqSum(row) - retVal(row, line));

/**
 * Template app/wholesale/settlement (9I-distribution.js "Route Settlement"): run picker, run strip, KPIs, the per-shop grid
 * (delivery chip, returns, cash, cheque, credit, difference) and the cash count by denomination. Paperwork model: there is
 * no van stock reconciliation; returns go back through sales returns when the settlement is posted. Credit is what is
 * left on the customer's account (balance − cash − cheques − returns). `?id=` opens a settlement.
 */
export function SettlementScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [options, setOptions] = useState<DistributionOpsOptions | null>(null);
  const [list, setList] = useState<RouteSettlementList | null>(null);
  const [tab, setTab] = useState<"OPEN" | "SETTLED">("OPEN");
  const [loadErr, setLoadErr] = useState<{ message: string; reference?: string } | null>(null);
  const [n, setN] = useState(0);
  const [id, setId] = useState<string | null>(() => params.get("id"));

  useEffect(() => {
    let off = false;
    Promise.all([distributionOpsOptions(), listSettlements({ pageSize: 200 })])
      .then(([o, l]) => { if (off) return; setOptions(o); setList(l); setId((cur) => cur ?? l.items.find((x) => x.status === "OPEN")?.id ?? l.items[0]?.id ?? null); })
      .catch((e: unknown) => !off && setLoadErr(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load route settlements" }));
    return () => { off = true; };
  }, [n]);

  const open = (x: string) => { setId(x); router.replace(`/wholesale/settlement?id=${x}`, { scroll: false }); };
  if (loadErr && !list) return <ErrorState message={loadErr.message} reference={loadErr.reference} onRetry={() => setN((x) => x + 1)} />;
  if (!list || !options) return <><Skeleton style={{ height: 64, width: "48%" }} /><div className="mt"><Skeleton style={{ height: 420 }} /></div></>;

  const rows = list.items.filter((x) => x.status === tab);
  return (
    <>
      {id ? (
        <SettlementBoard key={`${id}-${n}`} id={id} can={can} options={options} runs={list.items} onPick={open}
          onChanged={() => setN((x) => x + 1)} toast={toast} />
      ) : (
        <>
          <PageHead eyebrow="Wholesale & Distribution / Distribution" title="Route Settlement"
            description="Close the van's day: what was delivered, what came back, what was collected, and whether the cash bag tallies." />
          <EmptyState icon={<Truck />} title="No run to settle" description="A settlement opens when a load sheet is dispatched."
            action={<ButtonLink href="/wholesale/load-sheet" icon={<Truck />}>Load sheets</ButtonLink>} />
        </>
      )}

      <Panel flush className="mt" title="Settlements" description="Every dispatched run gets one; posting records the receipts and returns.">
        <div style={{ padding: "0 20px" }}>
          <Tabs items={[{ key: "OPEN", label: "Open", count: list.counts.OPEN ?? 0 }, { key: "SETTLED", label: "Settled", count: list.counts.SETTLED ?? 0 }]} active={tab} onChange={setTab} />
        </div>
        {rows.length === 0 ? (
          <EmptyState title={tab === "OPEN" ? "Nothing waiting to be settled" : "No settled runs yet"} />
        ) : (
          <div className="table-wrap"><table className="tbl ds-tbl">
            <thead><tr><th>Settlement</th><th>Run</th><th>Route</th><th>Van</th><th>Salesman</th><th className="num">Invoices</th><th className="num">Cash</th><th className="num">Credit</th><th>Status</th></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id} className={cn(s.id === id && "selected")} style={{ cursor: "pointer" }} onClick={() => open(s.id)}>
                <td><b className="link">{s.docNo}</b><small>{dateLabel(s.docDate)}</small></td><td>{s.loadSheet.docNo}</td>
                <td><span className="ds-rt">{s.loadSheet.route.code}</span> {s.loadSheet.route.name}</td><td>{s.loadSheet.vehicle}</td><td>{s.salesman?.name ?? "—"}</td>
                <td className="num">{fmt(s.invoiceTotal)}</td><td className="num">{fmt(s.cashCounted)}</td><td className="num">{fmt(s.creditTotal)}</td>
                <td><Badge tone={ST_TONE[s.status] ?? "neutral"} dot>{s.status === "OPEN" ? "Open" : "Settled"}</Badge></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}

function SettlementBoard({ id, can, options, runs, onPick, onChanged, toast }: {
  id: string; can: Can; options: DistributionOpsOptions; runs: RouteSettlementList["items"]; onPick: (id: string) => void; onChanged: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [s, setS] = useState<RouteSettlement | null>(null);
  const [err, setErr] = useState<{ message: string; reference?: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [cashAcc, setCashAcc] = useState("");
  const [docDate, setDocDate] = useState(today());
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"save" | "post" | null>(null);
  const [retFor, setRetFor] = useState<number | null>(null);
  const [chqFor, setChqFor] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = (x0: RouteSettlement) => {
    // a settled run is shown against what each invoice owed at dispatch (its balance today is after the receipts)
    const x = x0.status === "SETTLED" ? { ...x0, lines: x0.lines.map((l) => ({ ...l, balanceAmount: l.invoiceAmount })) } : x0;
    setS(x); setRows(rowsOf(x)); setCashAcc(x.cashAccount?.id ?? options.cashAccounts[0]?.id ?? ""); setDocDate(x.docDate);
    setCounts(Object.fromEntries(x.denominations.map((d) => [d.denomination, d.noteCount]))); setDirty(false); setFieldErr({});
  };
  useEffect(() => {
    let off = false;
    getSettlement(id).then((x) => !off && load(x))
      .catch((e: unknown) => !off && setErr(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the settlement" }));
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const t = useMemo(() => {
    if (!s) return null;
    const by = (f: (r: Row, l: SLine) => number) => r2(rows.reduce((a, r, i) => a + f(r, s.lines[i]!), 0));
    const cash = by((r) => num(r.cash));
    const counted = r2(DEN.reduce((a, d) => a + (counts[d] ?? 0) * d, 0));
    return {
      inv: by((_, l) => l.balanceAmount), cash, chq: by((r) => chqSum(r)), ret: by((r, l) => retVal(r, l)), retPcs: rows.reduce((a, r) => a + retPcs(r), 0),
      cred: by((r, l) => Math.max(0, credit(r, l))), over: by((r, l) => Math.max(0, -credit(r, l))), bad: rows.filter((r, i) => credit(r, s.lines[i]!) < -0.005).length,
      shops: rows.filter((r, i) => credit(r, s.lines[i]!) > 0.005).length, counted, sx: r2(counted - cash),
    };
  }, [s, rows, counts]);

  if (err && !s) return <ErrorState message={err.message} reference={err.reference} />;
  if (!s || !t) return <><Skeleton style={{ height: 64, width: "48%" }} /><div className="mt"><Skeleton style={{ height: 420 }} /></div></>;

  const locked = s.status !== "OPEN" || !can.edit;
  const settled = s.status === "SETTLED";
  const setRow = (i: number, patch: Partial<Row>) => { setRows((rs0) => rs0.map((r, k) => (k === i ? { ...r, ...patch } : r))); setDirty(true); };
  const runOpts = [...runs].sort((a, b) => (a.status === b.status ? b.docDate.localeCompare(a.docDate) : a.status === "OPEN" ? -1 : 1));

  const body = () => ({
    rowVersion: s.rowVersion, docDate, cashAccountId: cashAcc, salesmanEmployeeId: s.salesman?.id ?? null, remarks: s.remarks,
    denominations: DEN.filter((d) => (counts[d] ?? 0) > 0).map((d) => ({ denomination: d, noteCount: counts[d] })),
    lines: rows.map((r) => ({
      invoiceId: r.invoiceId, deliveryState: r.state, nonDeliveryReason: r.state === "FULL" ? null : r.why || null, cashAmount: r.state === "NONE" ? 0 : num(r.cash),
      cheques: r.state === "NONE" ? [] : r.cheques.filter((c) => num(c.amount) > 0).map((c) => ({ chequeNo: c.chequeNo.replace(/\D/g, ""), bankId: c.bankId || null, bankName: c.bankName || options.banks.find((b) => b.id === c.bankId)?.name || "", chequeDate: c.chequeDate, amount: num(c.amount) })),
      returns: r.state === "NONE" ? [] : r.returns.filter((x) => num(x.qty) > 0).map((x) => ({ invoiceLineId: x.invoiceLineId, qty: num(x.qty), reason: x.reason })),
    })),
  });
  const fail = (e: unknown, fallback: string) => {
    if (e instanceof ApiError) {
      setFieldErr(Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
      toast(e.message, { tone: "danger" });
    } else toast(fallback, { tone: "danger" });
  };
  const save = async (quiet = false) => {
    if (!cashAcc) { toast("Choose the cash account the cash goes into", { tone: "danger" }); return null; }
    setBusy("save");
    try { const x = await saveSettlement(s.id, body()); load(x); if (!quiet) toast(`${x.docNo} saved`, { tone: "good" }); onChanged(); return x; }
    catch (e) { fail(e, "Could not save the settlement"); return null; }
    finally { setBusy(null); }
  };
  const post = async () => {
    setConfirm(false);
    const saved = dirty || !s.cashAccount ? await save(true) : s;
    if (!saved) return;
    setBusy("post");
    try { const x = await postSettlement(saved.id, saved.rowVersion); load(x); toast(`${x.docNo} settled and posted`, { tone: "good" }); onChanged(); }
    catch (e) { fail(e, "Could not post the settlement"); }
    finally { setBusy(null); }
  };
  const lineErr = (i: number) => Object.entries(fieldErr).filter(([k]) => k.startsWith(`lines.${i}.`)).map(([, v]) => v)[0];

  return (
    <div className={cn(settled && "ds-settled")}>
      <PageHead eyebrow="Wholesale & Distribution / Distribution" title="Route Settlement"
        description="Close the van's day: what was delivered, what came back, what was collected, and whether the cash bag tallies."
        actions={<>
          <label className="ds-runpick"><Truck /><select value={s.id} onChange={(e) => onPick(e.target.value)} aria-label="Run">
            {runOpts.map((r) => <option key={r.id} value={r.id}>{r.loadSheet.docNo} · {r.loadSheet.route.code} · {r.loadSheet.vehicle}{r.status === "SETTLED" ? " · settled" : ""}</option>)}
          </select></label>
          <Button icon={<History />} onClick={() => setHistory(true)}>History</Button>
          {!locked && <Button icon={<Save />} disabled={!!busy} onClick={() => void save()}>{busy === "save" ? "Saving…" : "Save"}</Button>}
          {can.post && !settled && <Button variant="primary" icon={<BookCheck />} disabled={!!busy || t.bad > 0} onClick={() => setConfirm(true)}>{busy === "post" ? "Posting…" : "Post settlement"}</Button>}
          {settled && <Button variant="primary" icon={<CircleCheck />} disabled>Settled</Button>}
        </>} />

      <div className="ds-runstrip">
        <div className="ds-rs-main"><span className="ds-rs-ic"><Truck /></span><div>
          <small>{s.loadSheet.docNo} · <Badge tone={ST_TONE[s.status] ?? "neutral"} dot>{settled ? "Settled" : "Open"}</Badge></small>
          <b>{s.loadSheet.route.code} · {s.loadSheet.route.name}</b></div></div>
        <div><small>Van</small><b>{s.loadSheet.vehicle}</b></div>
        <div><small>Salesman</small><b>{s.salesman?.name ?? "—"}</b></div>
        <div><small>Settlement</small><b>{s.docNo}</b></div>
        <div><small>Date</small>{locked ? <b>{dateLabel(s.docDate)}</b> : <input type="date" className="cell-input" value={docDate} onChange={(e) => { setDocDate(e.target.value); setDirty(true); }} style={{ height: 30 }} />}</div>
        <div><small>Shops</small><b>{new Set(s.lines.map((l) => l.customer.id)).size}</b></div>
        <div><small>Load value</small><b>{rs(t.inv)}</b></div>
      </div>

      {settled && (
        <div className="mb"><Banner tone="good" title={`Posted ${dateLabel(s.postedAt)}${s.postedBy ? ` by ${s.postedBy.name}` : ""}`}>
          Receipts and returns were recorded per shop below.{s.journal ? <> Cash {s.cashShortAmount > 0 ? `short ${rs(s.cashShortAmount)}` : s.cashOverAmount > 0 ? `over ${rs(s.cashOverAmount)}` : "difference"} booked in <Link className="link" href={`/accounting/vouchers/${s.journal.id}`}>{s.journal.docNo}</Link>.</> : " The cash bag tallied, so no short / over journal was needed."}
        </Banner></div>
      )}

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Collected</span><span className="icon-well"><HandCoins /></span></div><strong>{rs(t.cash + t.chq)}</strong><small>{fmt(t.cash)} cash · {fmt(t.chq)} cheque</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Returns</span><span className="icon-well"><Undo2 /></span></div><strong>{rs(t.ret)}</strong><small>{t.retPcs} pcs back to the warehouse</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Credit on account</span><span className="icon-well"><NotebookPen /></span></div><strong>{rs(t.cred)}</strong><small>{t.shops} shop{t.shops === 1 ? "" : "s"} on account</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Unexplained</span><span className="icon-well"><Scale /></span></div><strong>{rs(t.over)}</strong><small className={t.bad ? "down" : "up"}>{t.bad ? `${t.bad} row${t.bad > 1 ? "s" : ""} collect more than owed` : "all rows tally"}</small></div>
      </div>

      <Panel flush title="Shop settlement" description="Tap the delivery chip to cycle Full / Partial / Not delivered. What isn't collected or returned stays on the shop's account."
        actions={!locked ? <Button size="sm" variant="ghost" onClick={() => { setRows((rs0) => rs0.map((r, i) => (r.state === "NONE" ? r : { ...r, cash: String(Math.max(0, r2(s.lines[i]!.balanceAmount - chqSum(r) - retVal(r, s.lines[i]!)))) }))); setDirty(true); }}>Fill cash = net</Button> : undefined}>
        {s.lines.length === 0 ? <EmptyState title="No invoices on this run" /> : (
          <div className="table-wrap"><table className="tbl ds-tbl ds-stgrid" data-plain>
            <thead><tr><th>Shop · invoice</th><th className="num">Invoice</th><th>Delivered</th><th>Returns</th><th className="num">Cash</th><th className="num">Cheque</th><th className="num">Credit</th><th className="num">Difference</th></tr></thead>
            <tbody>{rows.map((row, i) => {
              const l = s.lines[i]!;
              const rv = retVal(row, l), rp = retPcs(row), cr = credit(row, l), cq = chqSum(row);
              const d = DELIV[row.state], dis = locked || row.state === "NONE";
              const e = lineErr(i);
              return (
                <tr key={row.lineId} className={`ds-st-${row.state.toLowerCase()}`} style={{ ["--i" as string]: i }}>
                  <td><div className="ds-shopcell"><span className="avatar sm">{initials(l.customer.name)}</span><div><b>{l.customer.name}</b><small>{l.invoice.docNo}</small>
                    {(l.receipt || l.salesReturn) && <span className="ds-st-links">
                      {l.receipt && <Link className="link" href={`/receivables/receipts?id=${l.receipt.id}`}>{l.receipt.docNo}</Link>}
                      {l.salesReturn && <Link className="link" href={`/sales/returns?id=${l.salesReturn.id}`}>{l.salesReturn.docNo}</Link>}</span>}
                    {e && <small style={{ color: "var(--danger)", whiteSpace: "normal" }}>{e}</small>}</div></div></td>
                  <td className="num"><b>{fmt(l.balanceAmount)}</b>{rv > 0 && <small>net {fmt(l.balanceAmount - rv)}</small>}</td>
                  <td><button type="button" className={cn("ds-deliv", d.tone)} disabled={locked} title="Cycle delivery status" onClick={() => setRow(i, { state: NEXT[row.state] })}>{d.icon}{d.label}</button>
                    {row.state !== "FULL" && <span className="ds-st-why">{locked ? <small>{row.why || "—"}</small> : <input className="cell-input" placeholder={row.state === "NONE" ? "Why not delivered?" : "What was short?"} value={row.why} onChange={(ev) => setRow(i, { why: ev.target.value })} />}</span>}</td>
                  <td><button type="button" className={cn("ds-retbtn", rp > 0 && "has")} disabled={row.state === "NONE" || (locked && rp === 0)} onClick={() => setRetFor(i)}><Undo2 />{rp ? `${rp} pcs · ${fmt(rv)}` : "None"}</button></td>
                  <td className="num"><input className="cell-input ds-amt" inputMode="decimal" value={row.state === "NONE" ? "" : row.cash} placeholder="0" disabled={dis} onChange={(ev) => setRow(i, { cash: ev.target.value })} /></td>
                  <td className="num"><div className="ds-chq"><span style={{ minWidth: 70, textAlign: "right", fontWeight: 600 }}>{cq ? fmt(cq) : "—"}</span>
                    <button type="button" className="icon-btn-sm" title="Cheque details" disabled={row.state === "NONE" || (locked && !row.cheques.length)} onClick={() => setChqFor(i)}>{row.cheques.length ? <FileCheck2 /> : <FilePlus2 />}</button></div>
                    {row.cheques.length > 0 && <small>{row.cheques.map((c) => `#${c.chequeNo}`).join(", ")}</small>}</td>
                  <td className="num"><b style={cr < 0 ? { color: "var(--danger)" } : undefined}>{row.state === "NONE" ? "—" : fmt(Math.max(cr, 0))}</b>{row.state === "NONE" && <small>next run</small>}</td>
                  <td className="num">{row.state === "NONE" ? <span className="ds-diffchip ok"><Check />Released</span>
                    : cr < -0.005 ? <span className="ds-diffchip excess">Excess {fmt(-cr)}</span>
                    : cr > 0.005 ? <span className="ds-diffchip ok" style={{ color: "var(--blue)" }}>On account</span>
                    : <span className="ds-diffchip ok"><Check />Tallied</span>}</td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr><td>Total · {rows.length} invoices</td><td className="num">{fmt(t.inv)}</td><td></td><td>{t.retPcs ? `${t.retPcs} pcs · ${fmt(t.ret)}` : "—"}</td>
              <td className="num">{fmt(t.cash)}</td><td className="num">{fmt(t.chq)}</td><td className="num">{fmt(t.cred)}</td><td className={cn("num", t.over ? "neg" : "zero")}>{t.over ? `−${fmt(t.over)}` : "0"}</td></tr></tfoot>
          </table></div>
        )}
      </Panel>

      <div className="ds-st-bottom solo mt">
        <Panel className="ds-cash" title="Cash count" description="Count the salesman's bag by denomination."
          actions={<>
            {locked ? <Badge tone="neutral">{s.cashAccount?.name ?? "No cash account"}</Badge> : (
              <Select value={cashAcc} onChange={(e) => { setCashAcc(e.target.value); setDirty(true); }} aria-label="Cash account" style={{ width: 220, height: 34 }}>
                <option value="">Cash account…</option>
                {options.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </Select>)}
            <Badge tone={Math.abs(t.sx) < 1 ? "good" : t.sx < 0 ? "danger" : "warn"} dot>{Math.abs(t.sx) < 1 ? "Cash tallied" : `${t.sx < 0 ? "Short" : "Excess"} Rs ${fmt(Math.abs(t.sx))}`}</Badge>
          </>}>
          {fieldErr.cashAccountId && <small style={{ color: "var(--danger)" }}>{fieldErr.cashAccountId}</small>}
          <div className="ds-dens">{DEN.map((d, i) => (
            <div key={d} className="ds-den" style={{ ["--i" as string]: i }}><span className={`ds-note n${d}`}>{fmt(d)}</span>
              <div className="ds-step">
                <button type="button" aria-label={`One less Rs ${d} note`} disabled={locked} onClick={() => { setCounts((c) => ({ ...c, [d]: Math.max(0, (c[d] ?? 0) - 1) })); setDirty(true); }}><Minus /></button>
                <input inputMode="numeric" aria-label={`Rs ${d} notes`} disabled={locked} value={counts[d] ?? 0} onChange={(e) => { setCounts((c) => ({ ...c, [d]: Math.max(0, Math.floor(num(e.target.value))) })); setDirty(true); }} />
                <button type="button" aria-label={`One more Rs ${d} note`} disabled={locked} onClick={() => { setCounts((c) => ({ ...c, [d]: (c[d] ?? 0) + 1 })); setDirty(true); }}><Plus /></button>
              </div>
              <b className="ds-den-sub">{fmt((counts[d] ?? 0) * d)}</b></div>))}</div>
          <div className="ds-cashsum">
            <div><small>Expected cash</small><b>{rs(t.cash)}</b></div>
            <div><small>Counted</small><b>{rs(t.counted)}</b></div>
            <div className={cn("ds-cs-diff", Math.abs(t.sx) < 1 ? "ok" : t.sx < 0 ? "short" : "excess")}><small>{Math.abs(t.sx) < 1 ? "Tallied" : t.sx < 0 ? "Short" : "Excess"}</small><b>{rs(Math.abs(t.sx))}</b></div>
          </div>
          <div className={cn("ds-diverge", Math.abs(t.sx) < 1 ? "ok" : t.sx < 0 ? "short" : "excess")}><span className="l">Short</span>
            <div className="ds-dv-track"><i className="mid" /><b style={(() => { const mag = Math.min(50, (Math.abs(t.sx) / Math.max(1000, t.cash * 0.01)) * 50); return { left: t.sx < 0 ? `${50 - mag}%` : "50%", width: `${Math.abs(t.sx) < 1 ? 0 : Math.max(2, mag)}%` }; })()} /></div>
            <span className="r">Excess</span></div>
          {t.sx < -0.5 && !settled && <p className="muted small mt">A short is charged to {s.salesman?.name ?? "the salesman"} (salesman receivable) when the settlement is posted.</p>}
        </Panel>
      </div>

      {retFor !== null && <ReturnsModal line={s.lines[retFor]!} row={rows[retFor]!} reasons={options.lookups.returnReasons} locked={locked}
        onClose={() => setRetFor(null)} onSave={(returns) => { setRow(retFor, { returns, state: returns.length && rows[retFor]!.state === "FULL" ? "PARTIAL" : rows[retFor]!.state }); setRetFor(null); }} />}
      {chqFor !== null && <ChequesModal line={s.lines[chqFor]!} row={rows[chqFor]!} banks={options.banks} locked={locked} docDate={docDate}
        onClose={() => setChqFor(null)} onSave={(cheques) => { setRow(chqFor, { cheques }); setChqFor(null); }} />}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void post()} title={`Post ${s.docNo}?`} confirmLabel="Post now" busy={busy === "post"}>
        <p>Returns become sales returns (restocked into the run&apos;s warehouse, credit note applied), cash and each cheque become customer receipts against their invoices,
          and any cash short or over is booked. Not-delivered invoices leave the run for a later one. This can&apos;t be edited afterwards.</p>
        <FormGrid>
          <Field label="Cash expected"><b>{rs(t.cash)}</b></Field><Field label="Counted"><b>{rs(t.counted)}</b></Field>
          <Field label="Cheques"><b>{rs(t.chq)}</b></Field><Field label="Returns"><b>{rs(t.ret)}</b></Field>
        </FormGrid>
      </ConfirmDialog>
      <Drawer open={history} onClose={() => setHistory(false)} wide title={`${s.docNo} history`} subtitle={`${s.loadSheet.docNo} · ${s.loadSheet.route.name}`}>
        <HistoryTab schema="Distribution" table="RouteSettlements" id={s.id} />
      </Drawer>
    </div>
  );
}

function ReturnsModal({ line, row, reasons, locked, onClose, onSave }: {
  line: SLine; row: Row; reasons: { code: string; label: string }[]; locked: boolean; onClose: () => void; onSave: (r: Ret[]) => void;
}) {
  const [rets, setRets] = useState<Ret[]>(() => line.invoiceLines.map((il) => row.returns.find((x) => x.invoiceLineId === il.id) ?? { invoiceLineId: il.id, qty: "", reason: reasons[0]?.code ?? "" }));
  const total = r2(rets.reduce((a, x) => a + num(x.qty) * (line.invoiceLines.find((y) => y.id === x.invoiceLineId)?.netRate ?? 0), 0));
  const bad = rets.some((x) => num(x.qty) > (line.invoiceLines.find((y) => y.id === x.invoiceLineId)?.qty ?? 0));
  return (
    <Modal open onClose={onClose} wide title={`Returns · ${line.customer.name}`} subtitle={`${line.invoice.docNo} · goods back to the warehouse as a sales return`}
      foot={<><Button onClick={onClose}>{locked ? "Close" : "Cancel"}</Button>{!locked && <Button variant="primary" disabled={bad} onClick={() => onSave(rets.filter((x) => num(x.qty) > 0))}>Apply returns</Button>}</>}>
      {line.invoiceLines.length === 0 ? <EmptyState title="This invoice has no product lines" /> : (
        <div className="ds-retlist">{line.invoiceLines.map((il, k) => {
          const x = rets[k]!;
          const over = num(x.qty) > il.qty;
          return (
            <div key={il.id} className="ds-retline">
              <div className="ds-rl-name"><b>{il.item.name}</b><small>{il.item.sku} · supplied {fmt(il.qty)} @ {fmt(il.netRate)}</small>{over && <small style={{ color: "var(--danger)" }}> · at most {il.qty}</small>}</div>
              <div className="ds-step sm">
                <button type="button" aria-label="Less" disabled={locked} onClick={() => setRets((r) => r.map((y, j) => (j === k ? { ...y, qty: String(Math.max(0, num(y.qty) - 1)) } : y)))}><Minus /></button>
                <input inputMode="decimal" aria-label={`Return ${il.item.sku}`} disabled={locked} value={x.qty} placeholder="0" onChange={(e) => setRets((r) => r.map((y, j) => (j === k ? { ...y, qty: e.target.value } : y)))} />
                <button type="button" aria-label="More" disabled={locked} onClick={() => setRets((r) => r.map((y, j) => (j === k ? { ...y, qty: String(Math.min(il.qty, num(y.qty) + 1)) } : y)))}><Plus /></button>
              </div>
              <select className="cell-input" disabled={locked} value={x.reason} onChange={(e) => setRets((r) => r.map((y, j) => (j === k ? { ...y, reason: e.target.value } : y)))} aria-label="Reason">
                {reasons.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </div>
          );
        })}</div>
      )}
      <div className="ds-retsum"><span>Return value (incl. tax)</span><b>{rs(total)}</b></div>
    </Modal>
  );
}

function ChequesModal({ line, row, banks, locked, docDate, onClose, onSave }: {
  line: SLine; row: Row; banks: { id: string; code: string; name: string }[]; locked: boolean; docDate: string; onClose: () => void; onSave: (c: Cheque[]) => void;
}) {
  const blank = (): Cheque => ({ chequeNo: "", bankId: "", bankName: "", chequeDate: docDate, amount: "" });
  const [list, setList] = useState<Cheque[]>(() => (row.cheques.length ? row.cheques : [blank()]));
  const set = (k: number, p: Partial<Cheque>) => setList((l) => l.map((c, j) => (j === k ? { ...c, ...p } : c)));
  const valid = list.every((c) => !num(c.amount) || (/^\d{4,10}$/.test(c.chequeNo.replace(/\D/g, "")) && (c.bankId || c.bankName.trim())));
  return (
    <Modal open onClose={onClose} wide title={`Cheques · ${line.customer.name}`} subtitle={`${line.invoice.docNo} · each cheque becomes a receipt; it goes to Cheques in hand and is cleared in the cheque register`}
      foot={<><Button onClick={onClose}>{locked ? "Close" : "Cancel"}</Button>{!locked && <Button variant="primary" disabled={!valid} onClick={() => onSave(list.filter((c) => num(c.amount) > 0))}>Save cheques</Button>}</>}>
      {list.map((c, k) => (
        <div key={k} className="ds-chqrow">
          <Input placeholder="Cheque no." inputMode="numeric" disabled={locked} value={c.chequeNo} onChange={(e) => set(k, { chequeNo: e.target.value })} aria-label="Cheque number" />
          {banks.length ? (
            <Select disabled={locked} value={c.bankId} onChange={(e) => set(k, { bankId: e.target.value, bankName: banks.find((b) => b.id === e.target.value)?.name ?? "" })} aria-label="Bank">
              <option value="">Drawn on bank…</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          ) : <Input placeholder="Bank" disabled={locked} value={c.bankName} onChange={(e) => set(k, { bankName: e.target.value })} aria-label="Bank" />}
          <Input type="date" disabled={locked} value={c.chequeDate} onChange={(e) => set(k, { chequeDate: e.target.value })} aria-label="Cheque date" />
          <Input placeholder="Amount" inputMode="decimal" disabled={locked} value={c.amount} onChange={(e) => set(k, { amount: e.target.value })} aria-label="Amount" style={{ textAlign: "right" }} />
          {!locked ? <button type="button" className="icon-btn-sm" aria-label="Remove cheque" onClick={() => setList((l) => (l.length > 1 ? l.filter((_, j) => j !== k) : [blank()]))}><Trash2 /></button> : <span />}
        </div>
      ))}
      {!locked && <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setList((l) => [...l, blank()])}>Add cheque</Button>}
      {!valid && <p className="small mt" style={{ color: "var(--danger)" }}>Each cheque needs a 4–10 digit number and the bank.</p>}
    </Modal>
  );
}
