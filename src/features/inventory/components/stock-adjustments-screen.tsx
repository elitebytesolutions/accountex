"use client";

import { CalendarClock, ClipboardCheck, Download, Eye, Hourglass, Pencil, Plus, Search, SearchCheck, SlidersHorizontal, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ApprovalDetail, ApprovalStep, StockAdjustment, StockAdjustmentList, StockOnHand, StockOpsOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  adjustmentAction, approveAdjustment, cancelAdjustment, createAdjustment, deleteAdjustment, getAdjustment, listAdjustments, rejectAdjustment, stockOnHand, stockOpsOptions, updateAdjustment,
} from "../stock-ops-api";

type Can = { create: boolean; edit: boolean; post: boolean };
type Routing = { workflow: { id: string; name: string }; steps: ApprovalStep[] } | null;
type Tab = "details" | "approval" | "history";
const PAGE = 10;
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, PENDING_APPROVAL: { label: "Pending approval", tone: "warn" }, POSTED: { label: "Posted", tone: "good" },
  REJECTED: { label: "Rejected", tone: "danger" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const CHIPS = [["", "All"], ["DRAFT", "Draft"], ["PENDING_APPROVAL", "Pending"], ["POSTED", "Posted"], ["CANCELLED", "Cancelled"]] as const;
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const signed = (n: number) => (n === 0 ? "0.00" : `${n < 0 ? "−" : "+"}${amt(Math.abs(n))}`);
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const today = () => isoDay(new Date());

function AdjStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function StockAdjustmentsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StockAdjustmentList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<StockOpsOptions | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => params.get("adj"));
  const [editor, setEditor] = useState<{ adj: StockAdjustment | null } | null>(null);

  useEffect(() => { stockOpsOptions().then(setOptions).catch(() => undefined); }, []);
  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let cancelled = false;
    listAdjustments({ status, search, warehouse, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load adjustments" }));
    return () => { cancelled = true; };
  }, [status, search, warehouse, page, attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const k = data?.kpis;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const totalAll = data ? Object.values(data.counts).reduce((s, n) => s + n, 0) : 0;
  const filtered = !!(status || search || warehouse);
  const byReason = useMemo(() => {
    const m = new Map<string, { label: string; n: number; v: number }>();
    for (const a of data?.items ?? []) {
      if (a.status !== "POSTED") continue;
      const x = m.get(a.reason.label) ?? { label: a.reason.label, n: 0, v: 0 };
      x.n += 1; x.v += a.netValue; m.set(a.reason.label, x);
    }
    return [...m.values()].sort((a, b) => a.v - b.v);
  }, [data]);
  const exportCsv = () => downloadCsv(`stock-adjustments-${today()}.csv`, [
    ["Adjustment #", "Date", "Warehouse", "Reason", "Lines", "Value", "Status"],
    ...(data?.items ?? []).map((a) => [a.docNo, a.docDate, a.warehouse.name, a.reason.label, a.lineCount, a.netValue, STATUS[a.status]?.label ?? a.status]),
  ]);
  const openEdit = async (id: string) => {
    try { setEditor({ adj: await getAdjustment(id) }); } catch (e) { toast(errMsg(e, "Could not load the adjustment"), { tone: "danger" }); }
  };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Inventory / Adjustments"
        title="Stock Adjustments"
        description="Record count variances, damages, write-offs and internal consumption. Posts to inventory and the adjustment expense account."
        actions={
          <>
            <ButtonLink icon={<ClipboardCheck />} href="/inventory/count">Start stock count</ButtonLink>
            <Button icon={<Download />} onClick={exportCsv} disabled={!data?.items.length}>Export</Button>
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ adj: null })}>New adjustment</Button>}
          </>
        }
      />

      <div className="kpi-grid c3 mb">
        <div className="kpi red"><div className="kpi-top"><span>Write-downs (this month)</span><span className="icon-well"><TrendingDown /></span></div><strong>{k ? rs(k.writeOffThisMonth) : "—"}</strong><small>Posted stock decreases</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Pending Approval</span><span className="icon-well"><Hourglass /></span></div><strong>{k?.pending ?? "—"}</strong><small>Waiting in the approval workflow</small></div>
        <div className="kpi"><div className="kpi-top"><span>Gains (this month)</span><span className="icon-well"><TrendingUp /></span></div><strong>{k ? rs(k.gainThisMonth) : "—"}</strong><small>Found in count / stock increases</small></div>
      </div>

      <div className="split">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Adjustment register</h3><p>{data ? `${totalAll} adjustment${totalAll === 1 ? "" : "s"}` : "Loading…"}</p></div></div>
          <div className="toolbar">
            <label className="search-field"><Search /><input placeholder="Search ADJ #, remarks…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
            <select value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setPage(1); }} aria-label="Warehouse">
              <option value="">All warehouses</option>
              {options?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="chips">
              {CHIPS.map(([s, l]) => <button key={l} type="button" className={cn(status === s && "active")} onClick={() => { setStatus(s); setPage(1); }}>{l} <i>{data ? (s ? data.counts[s] ?? 0 : totalAll) : 0}</i></button>)}
            </div>
          </div>
          {!data ? <Skeleton style={{ height: 360 }} /> : !data.items.length ? (
            <EmptyState icon={<SlidersHorizontal />} title={filtered ? "No adjustments match" : "No stock adjustments yet"} description={filtered ? "Try another status, warehouse or search." : "Record a count variance, damage or write-off."}
              action={!filtered && can.create ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ adj: null })}>New adjustment</Button> : undefined} />
          ) : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Adjustment #</th><th>Date</th><th>Warehouse</th><th>Reason</th><th className="num">Lines</th><th className="num">Value (Rs)</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td><a className="link" href={`/inventory/adjustments?adj=${a.id}`} onClick={(e) => { e.preventDefault(); setOpenId(a.id); }}><Hl text={a.docNo} q={search} /></a><small>{a.preparedBy?.name ?? "—"}</small></td>
                    <td>{dateLabel(a.docDate)}</td>
                    <td>{a.warehouse.name}</td>
                    <td>{a.reason.label}</td>
                    <td className="num">{a.lineCount}</td>
                    <td className={cn("num", a.netValue < 0 ? "neg" : a.netValue > 0 && "dr")}>{signed(a.netValue)}</td>
                    <td><AdjStatus status={a.status} /></td>
                    <td className="actions">
                      {a.status === "DRAFT" && (can.create || can.edit)
                        ? <button type="button" className="icon-btn-sm" aria-label={`Edit ${a.docNo}`} onClick={() => openEdit(a.id)}><Pencil /></button>
                        : <button type="button" className="icon-btn-sm" aria-label={`Open ${a.docNo}`} onClick={() => setOpenId(a.id)}><Eye /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {data && data.total > 0 && (
            <div className="table-foot">
              <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + data.items.length} of {data.total}</span>
              <div className="pager">
                <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹</button>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((x) => <button key={x} type="button" className={cn(x === page && "active")} onClick={() => setPage(x)}>{x}</button>)}
                <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>By reason</h3><p>Posted adjustments on this page</p></div>{can.create && <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setEditor({ adj: null })}>New</Button>}</div>
          {byReason.length ? (
            <div className="list">
              {byReason.map((r) => (
                <div key={r.label} className="list-item">
                  <span className={cn("icon-well", r.v < 0 ? "red" : "")}>{r.v < 0 ? <TrendingDown /> : <SearchCheck />}</span>
                  <div><b>{r.label}</b><small>{r.n} adjustment{r.n === 1 ? "" : "s"}</small></div>
                  <span className="spacer" />
                  <b className={r.v < 0 ? "neg" : "dr"}>{r.v < 0 ? "−" : "+"}{Math.round(Math.abs(r.v)).toLocaleString("en-US")}</b>
                </div>
              ))}
            </div>
          ) : <p className="muted small">Nothing posted yet.</p>}
          <div className="banner info mt"><CalendarClock /><div><b>Counting a whole shelf?</b><p>A <Link className="link" href="/inventory/count">stock count</Link> freezes book quantities and posts its variance in one step.</p></div></div>
        </div>
      </div>

      <AdjDrawer key={openId ?? "none"} id={openId} can={can} onClose={() => setOpenId(null)} onEdit={(a) => { setOpenId(null); setEditor({ adj: a }); }} onChanged={reload} />
      {editor && options && (
        <AdjEditor adj={editor.adj} options={options} can={can} onClose={() => setEditor(null)} onSaved={(a, msg) => { setEditor(null); toast(msg, { tone: "good" }); setOpenId(a.id); reload(); }} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- editor
type Line = { key: number; itemId: string; batchId: string; counted: string };
let seq = 0;
function AdjEditor({ adj, options: o, can, onClose, onSaved }: { adj: StockAdjustment | null; options: StockOpsOptions; can: Can; onClose: () => void; onSaved: (a: StockAdjustment, msg: string) => void }) {
  const reasons = o.reasons.filter((r) => r.direction !== "IN");
  const [h, setH] = useState(() => ({
    docDate: adj?.docDate ?? today(), warehouseId: adj?.warehouse.id ?? o.warehouses[0]?.id ?? "", reasonId: adj?.reason.id ?? reasons[0]?.id ?? "",
    offsetAccountId: adj?.offsetAccount?.id ?? "", remarks: adj?.remarks ?? "",
  }));
  const [lines, setLines] = useState<Line[]>(() => adj?.lines.length
    ? adj.lines.map((l) => ({ key: ++seq, itemId: l.item.id, batchId: "", counted: String(l.qtyCounted) }))
    : [{ key: ++seq, itemId: "", batchId: "", counted: "" }]);
  const [stock, setStock] = useState<StockOnHand | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!h.warehouseId) return;
    let cancelled = false;
    stockOnHand(h.warehouseId).then((s) => !cancelled && setStock(s)).catch(() => !cancelled && setStock([]));
    return () => { cancelled = true; };
  }, [h.warehouseId]);

  const product = (id: string) => o.products.find((p) => p.id === id);
  const onHandOf = (l: Line) => (stock ?? []).filter((s) => s.itemId === l.itemId && (!l.batchId || s.batchId === l.batchId)).reduce((s, x) => s + x.qtyOnHand, 0);
  const rows = lines.map((l) => {
    const oh = l.itemId ? onHandOf(l) : 0;
    const c = l.counted === "" ? null : Number(l.counted);
    const change = c === null || Number.isNaN(c) ? 0 : c - oh;
    return { l, oh, c, change, value: change * (product(l.itemId)?.avgCost ?? 0) };
  });
  const net = rows.reduce((s, r) => s + r.value, 0);
  const fe = (k: string) => err?.details?.[k]?.[0];
  const set = (p: Partial<typeof h>) => setH((x) => ({ ...x, ...p }));
  const setLine = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const save = async (mode: "draft" | "post") => {
    setBusy(true);
    setErr(null);
    const body = {
      ...h, offsetAccountId: h.offsetAccountId || null, remarks: h.remarks || null,
      lines: rows.filter((r) => r.l.itemId && r.c !== null).map((r) => ({ itemId: r.l.itemId, batchId: r.l.batchId || null, qtyCounted: r.c })),
      ...(adj && { rowVersion: adj.rowVersion }),
    };
    try {
      let a = adj ? await updateAdjustment(adj.id, body) : await createAdjustment(body);
      let msg = `${a.docNo} saved as draft`;
      if (mode === "post") {
        if (a.routing) { a = await adjustmentAction(a.id, "submit", a.rowVersion); msg = `${a.docNo} submitted for approval`; }
        else { a = await adjustmentAction(a.id, "post", a.rowVersion); msg = `${a.docNo} posted`; }
      }
      onSaved(a, msg);
    } catch (e) {
      setErr(e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "Could not save the adjustment"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={adj ? `Edit ${adj.docNo}` : "New stock adjustment"} subtitle="Counted quantities post the difference at weighted average cost" foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn secondary" onClick={() => save("draft")} disabled={busy}>Save draft</button>
        {can.post && <button type="button" className="btn primary" onClick={() => save("post")} disabled={busy}>{busy ? "Working…" : "Save & post"}</button>}
      </>
    }>
      {err && !err.details && <div className="mb"><Banner tone="danger" title="Not saved">{err.message}</Banner></div>}
      <div className="form-grid c4">
        <Field label="Date" required error={fe("docDate")}><input type="date" value={h.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
        <Field label="Warehouse" required error={fe("warehouseId")}>
          <select value={h.warehouseId} onChange={(e) => { set({ warehouseId: e.target.value }); setLines((ls) => ls.map((l) => ({ ...l, batchId: "" }))); }}>
            {o.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="Reason" required error={fe("reasonId")}>
          <select value={h.reasonId} onChange={(e) => set({ reasonId: e.target.value })}>
            {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Offset account" error={fe("offsetAccountId")}>
          <select value={h.offsetAccountId} onChange={(e) => set({ offsetAccountId: e.target.value })}>
            <option value="">Reason / default account</option>
            {o.accounts.filter((a) => a.accountClass >= 4).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="table-wrap mt"><table className="tbl lines">
        <thead><tr><th>Item</th><th>Batch</th><th className="num">On hand</th><th className="num">Counted</th><th className="num">Change</th><th className="num">Value (Rs)</th><th /></tr></thead>
        <tbody>
          {rows.map(({ l, oh, change, value }, i) => {
            const batches = (stock ?? []).filter((s) => s.itemId === l.itemId && s.batchId);
            return (
              <tr key={l.key}>
                <td>
                  <select className={cn("cell-input", fe(`lines.${i}.itemId`) && "invalid")} value={l.itemId} onChange={(e) => setLine(l.key, { itemId: e.target.value, batchId: "" })}>
                    <option value="">Select product…</option>
                    {o.products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                  </select>
                </td>
                <td>
                  <select className="cell-input" value={l.batchId} onChange={(e) => setLine(l.key, { batchId: e.target.value })} disabled={!batches.length}>
                    <option value="">{batches.length ? "All batches" : "—"}</option>
                    {batches.map((b) => <option key={b.batchId!} value={b.batchId!}>{b.batchNo}{b.expiryDate ? ` · exp ${dateLabel(b.expiryDate)}` : ""}</option>)}
                  </select>
                </td>
                <td className="num">{l.itemId ? qty(oh) : "—"}</td>
                <td className="num"><input className="cell-input num" style={{ width: 90 }} inputMode="decimal" value={l.counted} placeholder="0" onChange={(e) => setLine(l.key, { counted: e.target.value })} /></td>
                <td className={cn("num", change < 0 ? "neg" : change > 0 && "dr")}>{l.itemId && l.counted !== "" ? (change > 0 ? "+" : change < 0 ? "−" : "") + qty(Math.abs(change)) : "—"}</td>
                <td className={cn("num", value < 0 ? "neg" : value > 0 && "dr")}>{l.itemId && l.counted !== "" ? signed(value) : "—"}</td>
                <td className="actions">{lines.length > 1 && <button type="button" className="icon-btn-sm" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><X /></button>}</td>
              </tr>
            );
          })}
          <tr className="total"><td colSpan={5}>Net adjustment · {rows.filter((r) => r.l.itemId).length} line{rows.filter((r) => r.l.itemId).length === 1 ? "" : "s"}</td><td className={cn("num", net < 0 ? "neg" : net > 0 && "dr")}>{signed(net)}</td><td /></tr>
        </tbody>
      </table></div>
      {fe("lines") && <p className="field-error">{fe("lines")}</p>}
      <div className="row mt"><Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setLines((ls) => [...ls, { key: ++seq, itemId: "", batchId: "", counted: "" }])}>Add line</Button></div>
      <FormGrid cols={1}>
        <Field label="Remarks" error={fe("remarks")}><textarea rows={2} value={h.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Who counted, which shelf…" /></Field>
      </FormGrid>
    </Modal>
  );
}

// ---------------------------------------------------------------- drawer
type Ask = { kind: "cancel" | "reject"; adj: StockAdjustment } | null;
function AdjDrawer({ id, can, onClose, onEdit, onChanged }: { id: string | null; can: Can; onClose: () => void; onEdit: (a: StockAdjustment) => void; onChanged: () => void }) {
  const toast = useToast();
  const [adj, setAdj] = useState<StockAdjustment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [del, setDel] = useState(false);
  const [n2, setN2] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getAdjustment(id).then((x) => !cancelled && setAdj(x)).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the adjustment")));
    return () => { cancelled = true; };
  }, [id, n2]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast(label, { tone: "good" }); setN2((x) => x + 1); onChanged(); } catch (e) { toast(errMsg(e, "That didn’t work"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const ap = (adj?.approval ?? null) as ApprovalDetail | null;
  const routing = (adj?.routing ?? null) as Routing;
  const steps: ApprovalStep[] = ap?.steps ?? routing?.steps ?? [];
  const pending = adj?.status === "PENDING_APPROVAL";

  const actions = adj ? (
    <>
      {adj.status === "DRAFT" && (can.create || can.edit) && <Button disabled={busy} icon={<Pencil />} onClick={() => onEdit(adj)}>Edit</Button>}
      {adj.status === "DRAFT" && !adj.submittedAt && can.create && <Button disabled={busy} icon={<Trash2 />} onClick={() => setDel(true)}>Delete</Button>}
      {["DRAFT", "PENDING_APPROVAL", "POSTED"].includes(adj.status) && can.post && <Button disabled={busy} onClick={() => setAsk({ kind: "cancel", adj })}>{adj.status === "POSTED" ? "Reverse" : "Cancel"}</Button>}
      {pending && adj.canAct && <Button disabled={busy} onClick={() => setAsk({ kind: "reject", adj })}>Reject</Button>}
      {pending && adj.canAct && <Button variant="primary" disabled={busy} onClick={() => run(`${adj.docNo} approved and posted`, () => approveAdjustment(adj.id))}>Approve</Button>}
      {adj.status === "DRAFT" && routing && can.create && <Button variant="primary" disabled={busy} onClick={() => run(`${adj.docNo} submitted for approval`, () => adjustmentAction(adj.id, "submit", adj.rowVersion))}>Submit for approval</Button>}
      {adj.status === "DRAFT" && !routing && can.post && <Button variant="primary" disabled={busy} onClick={() => run(`${adj.docNo} posted`, () => adjustmentAction(adj.id, "post", adj.rowVersion))}>Post</Button>}
    </>
  ) : undefined;

  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={adj ? adj.docNo : "Stock adjustment"} subtitle={adj ? `${adj.warehouse.name} · ${dateLabel(adj.docDate)}` : undefined} foot={actions}>
        {err ? <ErrorState message={err} onRetry={() => { setErr(null); setN2((x) => x + 1); }} /> : !adj ? <Skeleton style={{ height: 400 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><AdjStatus status={adj.status} />{adj.rejectionReason && adj.status === "DRAFT" && <small className="muted">Returned: {adj.rejectionReason}</small>}</div>
            <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "approval", label: "Approval" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <>
                <div className="dl mt">
                  <div><span>Reason</span><b>{adj.reason.label}</b></div>
                  <div><span>Warehouse</span><b>{adj.warehouse.name}</b></div>
                  <div><span>Offset account</span><b>{adj.offsetAccount ? `${adj.offsetAccount.code} ${adj.offsetAccount.name}` : "Reason / default"}</b></div>
                  <div><span>Prepared by</span><b>{adj.preparedBy?.name ?? "—"}</b></div>
                  {adj.approvedBy && <div><span>Approved</span><b>{adj.approvedBy.name}{adj.approvedAt ? ` · ${dateLabel(adj.approvedAt.slice(0, 10))}` : ""}</b></div>}
                  {adj.voucher && <div><span>Journal</span><b><Link className="link" href={`/accounting/vouchers/${adj.voucher.id}`}>{adj.voucher.docNo}</Link></b></div>}
                  {adj.source && <div><span>Source</span><b>{adj.source.type === "SC" ? <Link className="link" href="/inventory/count">Stock count</Link> : adj.source.type}</b></div>}
                  {adj.remarks && <div><span>Remarks</span><b>{adj.remarks}</b></div>}
                </div>
                <div className="table-wrap mt"><table className="tbl">
                  <thead><tr><th>Item</th><th className="num">On hand</th><th className="num">Counted</th><th className="num">Change</th><th className="num">Unit cost</th><th className="num">Value</th></tr></thead>
                  <tbody>
                    {adj.lines.map((l) => (
                      <tr key={l.id}>
                        <td><b>{l.item.name}</b><small>{l.item.sku}{l.batchNo ? ` · ${l.batchNo}` : ""}</small></td>
                        <td className="num">{qty(l.qtyOnHand)}</td>
                        <td className="num">{qty(l.qtyCounted)}</td>
                        <td className={cn("num", l.qtyChange < 0 ? "neg" : l.qtyChange > 0 && "dr")}>{l.qtyChange > 0 ? "+" : l.qtyChange < 0 ? "−" : ""}{qty(Math.abs(l.qtyChange))}</td>
                        <td className="num">{amt(l.unitCost)}</td>
                        <td className={cn("num", l.value < 0 ? "neg" : l.value > 0 && "dr")}>{signed(l.value)}</td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={5}>Net adjustment</td><td className={cn("num", adj.netValue < 0 ? "neg" : adj.netValue > 0 && "dr")}>{signed(adj.netValue)}</td></tr>
                  </tbody>
                </table></div>
              </>
            )}
            {tab === "approval" && (
              <div className="mt">
                <p className="muted">{ap ? `${ap.workflow.name} · ${ap.status.toLowerCase()}` : routing ? `${routing.workflow.name} · submit to start` : "No approval workflow applies — a user with stock posting rights posts it directly."}</p>
                <div className="timeline">
                  <div className="tl-item"><span className="tl-dot good" /><div><b>Prepared — {adj.preparedBy?.name ?? "—"}</b><small>{dateLabel(adj.createdAt.slice(0, 10))}</small></div></div>
                  {adj.submittedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Submitted for approval</b><small>{dateLabel(adj.submittedAt.slice(0, 10))}</small></div></div>}
                  {steps.map((s) => (
                    <div className="tl-item" key={s.stepNo}>
                      <span className={`tl-dot${s.state === "done" ? " good" : s.state === "current" ? " warn" : ""}`} />
                      <div><b>{s.name} — {s.approvers.length ? s.approvers.map((a) => a.name).join(", ") : "No approver"}</b>
                        <small>{s.state === "done" ? `Approved by ${s.actedBy.map((a) => a.name).join(", ")}` : s.state === "current" ? (pending ? (adj.canAct ? "Awaiting your approval" : "Awaiting approval") : "First step") : s.state === "skipped" ? "Not required" : "Waiting"}</small></div>
                    </div>
                  ))}
                  {adj.postedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Posted</b><small>{dateLabel(adj.postedAt.slice(0, 10))}</small></div></div>}
                  {adj.status === "CANCELLED" && <div className="tl-item"><span className="tl-dot danger" /><div><b>Cancelled</b></div></div>}
                </div>
                {ap?.actions.filter((a) => a.reason || a.comment).map((a) => (
                  <div key={a.id} className="list-item"><div><b>{a.actor?.name ?? "—"} · {a.action.toLowerCase()}</b><small>{a.reason ?? a.comment}</small></div></div>
                ))}
              </div>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Inventory" table="StockAdjustments" id={adj.id} /></div>}
          </>
        )}
      </Drawer>
      <ReasonModal key={ask ? `${ask.kind}-${ask.adj.id}` : "none"} ask={ask} onClose={() => setAsk(null)} onDone={(label) => { setAsk(null); toast(label, { tone: "good" }); setN2((x) => x + 1); onChanged(); }} />
      <ConfirmDialog open={del && !!adj} onClose={() => setDel(false)} danger busy={busy} title={`Delete ${adj?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => adj && run(`${adj.docNo} deleted`, async () => { await deleteAdjustment(adj.id, adj.rowVersion); setDel(false); onClose(); })}>
        The draft and its lines are removed.
      </ConfirmDialog>
    </>
  );
}

function ReasonModal({ ask, onClose, onDone }: { ask: Ask; onClose: () => void; onDone: (label: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cancel = ask?.kind === "cancel";
  const run = async () => {
    if (!ask) return;
    setBusy(true);
    setErr(null);
    try {
      if (cancel) { const a = await cancelAdjustment(ask.adj.id, ask.adj.rowVersion, reason.trim()); onDone(`${a.docNo} ${ask.adj.status === "POSTED" ? "reversed" : "cancelled"}`); }
      else { const a = await rejectAdjustment(ask.adj.id, reason.trim()); onDone(`${a.docNo} returned to the preparer`); }
    } catch (e) { setErr(errMsg(e, "That didn’t work")); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!ask} onClose={onClose} title={`${cancel ? (ask?.adj.status === "POSTED" ? "Reverse" : "Cancel") : "Reject"} ${ask?.adj.docNo ?? ""}`}
      subtitle={cancel ? (ask?.adj.status === "POSTED" ? "The stock movements and journal are reversed." : "The adjustment won’t post.") : "The adjustment returns to its preparer as a draft."} foot={
        <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn danger" onClick={run} disabled={busy || reason.trim().length < 3}>{busy ? "Working…" : cancel ? "Confirm" : "Reject"}</button></>
      }>
      <FormGrid cols={1}>
        <Field label="Reason" required error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}
