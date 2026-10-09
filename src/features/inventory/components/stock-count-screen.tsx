"use client";

import {
  ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronRight, CircleAlert, CircleCheck, ClipboardCheck, ClipboardList, Crosshair, Download, Eye, EyeOff, FilePen, Info, Lock, Minus, Plus,
  Scale, ScanBarcode, ScanLine, Snowflake, Stamp, Store, Target, Trash2, Warehouse, X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { StockCount, StockCountList, StockOnHand, StockOpsOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { approveCount, cancelCount, createCount, deleteCount, enterCounts, freezeCount, getCount, listCounts, stockOnHand, stockOpsOptions } from "../stock-ops-api";

type Can = { create: boolean; count: boolean; approve: boolean; cancel: boolean };
type Row = StockCountList["items"][number];
const STATUS: Record<string, { label: string; tone: Tone; icon: ReactNode }> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: <FilePen /> }, COUNTING: { label: "Counting", tone: "info", icon: <ScanLine /> },
  VARIANCE_REVIEW: { label: "Variance review", tone: "warn", icon: <Scale /> }, APPROVED: { label: "Approved", tone: "good", icon: <BadgeCheck /> },
  CANCELLED: { label: "Cancelled", tone: "danger", icon: <X /> },
};
const OPEN = ["DRAFT", "COUNTING", "VARIANCE_REVIEW"];
const STEPS: [string, ReactNode][] = [["Scope", <Crosshair key="s" />], ["Freeze", <Snowflake key="f" />], ["Count", <ScanLine key="c" />], ["Variance", <Scale key="v" />], ["Approve", <Stamp key="a" />]];
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const rsSigned = (n: number) => (n ? `${n < 0 ? "−" : "+"}Rs ${fmt(Math.abs(n))}` : "—");
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const today = () => isoDay(new Date());
const stepOf = (status: string) => (status === "DRAFT" ? 1 : status === "COUNTING" ? 2 : 3);

export function StockCountScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const [filter, setFilter] = useState<"all" | "open" | "APPROVED">("all");
  const [data, setData] = useState<StockCountList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<StockOpsOptions | null>(null);
  const [wizard, setWizard] = useState<{ id: string | null } | null>(null);
  const [viewId, setViewId] = useState<string | null>(() => params.get("count"));

  useEffect(() => { stockOpsOptions().then(setOptions).catch(() => undefined); }, []);
  useEffect(() => {
    let cancelled = false;
    listCounts({ page: 1, pageSize: 200 })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load stock counts" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const items = data?.items ?? [];
  const list = items.filter((s) => filter === "all" || (filter === "open" ? OPEN.includes(s.status) : s.status === filter));
  const openN = items.filter((s) => OPEN.includes(s.status)).length;
  const review = items.filter((s) => s.status === "VARIANCE_REVIEW").length;
  const counted = items.reduce((s, x) => s + x.countedCount, 0);
  const approved = items.filter((s) => s.status === "APPROVED");
  const net = approved.reduce((s, x) => s + x.netVarianceValue, 0);
  const lines = approved.reduce((s, x) => s + x.lineCount, 0);
  const exportCsv = () => downloadCsv(`stock-counts-${today()}.csv`, [
    ["Count #", "Name", "Date", "Warehouse", "Scope", "Lines", "Counted", "Status", "Net variance"],
    ...items.map((s) => [s.docNo, s.name, s.docDate, s.warehouse.name, s.scopeLabel ?? "", s.lineCount, s.countedCount, STATUS[s.status]?.label ?? s.status, s.netVarianceValue]),
  ]);

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <div className="so-root">
      <div className="so-cnt">
        <div className="so-head">
          <span className="so-head-ico"><ClipboardCheck /></span>
          <div className="so-head-t"><div className="so-crumb">Inventory <ChevronRight /> <b>Stock Count</b></div><h1>Stock Count</h1><p>Freeze a snapshot, count with a scanner, review variances and post the adjustment.</p></div>
          <div className="so-head-r">
            <span className="tagline so-tagline">Count it. Trust it.</span>
            <button className="btn secondary" type="button" onClick={exportCsv} disabled={!items.length}><Download />Export</button>
            {can.create && <button className="btn primary" type="button" onClick={() => setWizard({ id: null })}><Plus />New count</button>}
          </div>
        </div>

        {wizard && options ? (
          <CountWizard key={wizard.id ?? "new"} id={wizard.id} options={options} can={can}
            onClose={() => { setWizard(null); reload(); }}
            onApproved={(c) => { setWizard(null); reload(); toast(`${c.docNo} approved${c.voucher ? ` · ${c.voucher.docNo} posted` : ""}`, { tone: "good" }); }} />
        ) : (
          <div className="so-cnt-list">
            <div className="so-kpis c4">
              <div className="so-kpi"><span className="so-kpi-i blue"><ClipboardList /></span><div><small>Open sessions</small><b>{data ? openN : "—"}</b><em>{review} waiting for approval</em></div></div>
              <div className="so-kpi"><span className="so-kpi-i green"><ScanLine /></span><div><small>Lines counted</small><b>{data ? fmt(counted) : "—"}</b><em>across all sessions</em></div></div>
              <div className="so-kpi"><span className="so-kpi-i lime"><Target /></span><div><small>Approved counts</small><b>{data ? approved.length : "—"}</b><em>{fmt(lines)} lines reconciled</em></div></div>
              <div className="so-kpi"><span className="so-kpi-i red"><Scale /></span><div><small>Net variance</small><b>{data ? rsSigned(net).replace("—", "Rs 0") : "—"}</b><em>approved counts</em></div></div>
            </div>
            <div className="panel flush">
              <div className="so-ph pad"><span className="so-ph-ico"><ClipboardList /></span><div><h3>Count sessions</h3><p>Every count moves Draft → Counting → Variance review → Approved</p></div><span className="spacer" />
                <div className="seg">{([["all", "All"], ["open", "Open"], ["APPROVED", "Approved"]] as const).map(([k, l]) => <button key={k} type="button" className={cn(filter === k && "active")} onClick={() => setFilter(k)}>{l}</button>)}</div></div>
              {!data ? <Skeleton style={{ height: 300 }} /> : (
                <div className="table-wrap"><table className="tbl so-sess">
                  <thead><tr><th>Session</th><th>Location</th><th>Scope</th><th>Progress</th><th>Status</th><th className="num">Net variance</th><th>Owner</th><th /></tr></thead>
                  <tbody>
                    {list.map((s) => <SessionRow key={s.id} s={s} can={can} onGo={() => setWizard({ id: s.id })} onView={() => setViewId(s.id)} />)}
                    {!list.length && <tr><td colSpan={8}><div className="so-empty"><ClipboardCheck /><b>{items.length ? "No sessions in this view" : "No stock counts yet"}</b>{!items.length && can.create && <span>Start one with “New count”.</span>}</div></td></tr>}
                  </tbody>
                </table></div>
              )}
            </div>
            <div className="so-flow">
              {(["DRAFT", "COUNTING", "VARIANCE_REVIEW", "APPROVED"] as const).map((s, i) => (
                <div key={s} style={{ display: "contents" }}>
                  <div className={cn("so-flow-s", STATUS[s]!.tone)}><span>{STATUS[s]!.icon}</span><b>{STATUS[s]!.label}</b><small>{["Scope picked, nothing frozen", "Snapshot frozen, counting", "Counts in, explain the gaps", "Adjustment posted to GL"][i]}</small></div>
                  {i < 3 && <i><ChevronRight /></i>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <CountDrawer key={viewId ?? "none"} id={viewId} can={can} onClose={() => setViewId(null)} onChanged={reload} onContinue={(id) => { setViewId(null); setWizard({ id }); }} />
    </div>
  );
}

function SessionRow({ s, can, onGo, onView }: { s: Row; can: Can; onGo: () => void; onView: () => void }) {
  const p = s.lineCount ? Math.round((s.countedCount / s.lineCount) * 100) : 0;
  const st = STATUS[s.status] ?? { label: s.status, tone: "neutral" as Tone };
  const canGo = OPEN.includes(s.status) && (can.create || can.count || can.approve);
  return (
    <tr>
      <td><b>{s.name}</b><small>{s.docNo} · {dateLabel(s.docDate)}{s.isBlind ? " · blind" : ""}</small></td>
      <td>{s.warehouse.name}</td>
      <td>{s.scopeLabel ?? "All classes"}</td>
      <td><div className="so-prog"><div className={cn("progress", p < 100 && "warn")}><i style={{ width: `${p}%` }} /></div><small>{s.countedCount}/{s.lineCount} lines</small></div></td>
      <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
      <td className={cn("num", s.netVarianceValue < 0 ? "neg" : s.netVarianceValue > 0 ? "dr" : "zero")}>{rsSigned(s.netVarianceValue)}</td>
      <td><div className="cell-user"><span className="avatar sm">{initials(s.owner?.name ?? "?")}</span><div><b>{(s.owner?.name ?? "—").split(" ")[0]}</b></div></div></td>
      <td className="so-c">
        {canGo
          ? <button className="btn secondary sm" type="button" onClick={onGo}>{s.status === "DRAFT" ? "Start" : s.status === "COUNTING" ? "Continue" : "Review"}<ArrowRight /></button>
          : <button className="btn ghost sm" type="button" onClick={onView}><Eye />View</button>}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- wizard
type Counts = Record<string, { cnt: string; reason: string }>;
function CountWizard({ id: initialId, options: o, can, onClose, onApproved }: { id: string | null; options: StockOpsOptions; can: Can; onClose: () => void; onApproved: (c: StockCount) => void }) {
  const toast = useToast();
  const [count, setCount] = useState<StockCount | null>(null);
  const [step, setStep] = useState(initialId ? -1 : 0);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState(() => ({ name: "New cycle count", warehouseId: o.warehouses[0]?.id ?? "", classIds: [] as string[], abcA: false, blind: true, docDate: today() }));
  const [stock, setStock] = useState<StockOnHand | null>(null);
  const [counts, setCounts] = useState<Counts>({});
  const [find, setFind] = useState("");
  const [vf, setVf] = useState<"all" | "var" | "sh" | "ex">("all");
  const [comment, setComment] = useState("");

  const load = async (id: string) => {
    const c = await getCount(id);
    setCount(c);
    setCounts(Object.fromEntries(c.lines.map((l) => [l.id, { cnt: l.countedQty === null ? "" : String(l.countedQty), reason: l.reason ?? "" }])));
    return c;
  };
  useEffect(() => {
    if (!initialId) return;
    let cancelled = false;
    getCount(initialId)
      .then((c) => {
        if (cancelled) return;
        setCount(c);
        setCounts(Object.fromEntries(c.lines.map((l) => [l.id, { cnt: l.countedQty === null ? "" : String(l.countedQty), reason: l.reason ?? "" }])));
        setStep(stepOf(c.status));
      })
      .catch((e: unknown) => { if (!cancelled) { toast(errMsg(e, "Could not load the count"), { tone: "danger" }); onClose(); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);
  useEffect(() => {
    if (step !== 0 || !scope.warehouseId) return;
    let cancelled = false;
    stockOnHand(scope.warehouseId).then((s) => !cancelled && setStock(s)).catch(() => !cancelled && setStock([]));
    return () => { cancelled = true; };
  }, [step, scope.warehouseId]);

  const product = (id: string) => o.products.find((p) => p.id === id);
  const inScope = useMemo(() => (stock ?? []).filter((s) => {
    const p = product(s.itemId);
    return p && (!scope.classIds.length || (p.productClassId && scope.classIds.includes(p.productClassId))) && (!scope.abcA || p.abcClass === "A");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stock, scope.classIds, scope.abcA]);

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try { return await fn(); } catch (e) { toast(errMsg(e, "That didn’t work"), { tone: "danger" }); return undefined; } finally { setBusy(false); }
  };
  const pending = count ? count.lines.filter((l) => {
    const c = counts[l.id];
    return c && (c.cnt !== (l.countedQty === null ? "" : String(l.countedQty)) || c.reason !== (l.reason ?? ""));
  }) : [];
  const saveCounts = async () => {
    if (!count || !pending.length) return count;
    const c = await enterCounts(count.id, count.rowVersion, pending.map((l) => {
      const x = counts[l.id]!;
      return { id: l.id, countedQty: x.cnt === "" ? null : Math.max(0, Number(x.cnt)), reason: x.reason || null };
    }));
    setCount(c);
    return c;
  };

  const lines = count?.lines ?? [];
  const cntOf = (id: string) => { const c = counts[id]?.cnt; return c === undefined || c === "" ? null : Number(c); };
  const varOf = (l: StockCount["lines"][number]) => { const c = cntOf(l.id); return l.expectedQty === null || c === null ? 0 : c - l.expectedQty; };
  const countedN = lines.filter((l) => cntOf(l.id) !== null).length;
  const blindHidden = !!count && lines.some((l) => l.expectedQty === null);
  const shortage = lines.reduce((s, l) => s + (varOf(l) < 0 ? -varOf(l) * l.unitCost : 0), 0);
  const excess = lines.reduce((s, l) => s + (varOf(l) > 0 ? varOf(l) * l.unitCost : 0), 0);
  const needReason = lines.filter((l) => varOf(l) !== 0 && !counts[l.id]?.reason).length;

  const next = async () => {
    if (step === 0) {
      if (!scope.name.trim()) { toast("Name the count", { tone: "warn" }); return; }
      if (!inScope.length) { toast("Nothing in stock matches this scope", { tone: "warn" }); return; }
      const c = await run(() => createCount({ name: scope.name.trim(), docDate: scope.docDate, warehouseId: scope.warehouseId, scopeClassIds: scope.classIds, abcAOnly: scope.abcA, isBlind: scope.blind }));
      if (c) { setCount(c); setStep(1); }
      return;
    }
    if (step === 1) {
      if (!count || count.status === "DRAFT") { toast("Freeze the snapshot first", { tone: "warn" }); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!countedN) { toast("Count at least one line", { tone: "warn" }); return; }
      const c = await run(saveCounts);
      if (c !== undefined) setStep(3);
      return;
    }
    if (step === 3) {
      if (blindHidden) { toast("Variance review needs a user who can approve counts", { tone: "warn" }); return; }
      if (countedN < lines.length) { toast(`${lines.length - countedN} line${lines.length - countedN === 1 ? " is" : "s are"} not counted — set them to zero or go back`, { tone: "warn" }); return; }
      if (needReason) { toast(`Give a reason for ${needReason} variance${needReason === 1 ? "" : "s"}`, { tone: "warn" }); return; }
      const c = await run(saveCounts);
      if (c !== undefined) setStep(4);
      return;
    }
    if (!count) return;
    const c = await run(() => approveCount(count.id, count.rowVersion, comment.trim() || null));
    if (c) onApproved(c);
  };
  const freeze = async () => {
    if (!count) return;
    const c = await run(() => freezeCount(count.id, count.rowVersion));
    if (c) { await load(c.id); toast(`Snapshot frozen · ${c.lineCount} lines`, { tone: "good" }); }
  };
  const zeroUncounted = () => setCounts((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.cnt === "" ? { ...v, cnt: "0" } : v])));
  const setCnt = (id: string, p: Partial<{ cnt: string; reason: string }>) => setCounts((m) => ({ ...m, [id]: { cnt: m[id]?.cnt ?? "", reason: m[id]?.reason ?? "", ...p } }));
  const scan = () => {
    const t = find.trim().toLowerCase();
    if (!t) return;
    const l = lines.find((x) => { const p = product(x.item.id); return x.item.sku.toLowerCase() === t || p?.upc === t || x.item.name.toLowerCase().includes(t); });
    if (!l) { toast(`“${find}” is not in this count’s scope`, { tone: "warn" }); return; }
    setCnt(l.id, { cnt: String((cntOf(l.id) ?? 0) + 1) });
    setFind("");
  };

  const hint = step === 0 ? (inScope.length ? `${inScope.length} lines will be frozen` : "Pick a wider scope")
    : step === 1 ? (count?.status === "DRAFT" ? "Freeze first to continue" : "Ready to count")
      : step === 2 ? (countedN === lines.length ? "All lines counted" : `${lines.length - countedN} lines left`)
        : step === 3 ? (needReason ? `${needReason} variance${needReason === 1 ? "" : "s"} need a reason` : "All variances explained")
          : "Review the journal, then approve";
  const canNext = step === 0 ? can.create : step <= 2 ? can.count || can.create : step === 3 ? can.count || can.approve : can.approve;

  if (step === -1) return <div className="panel"><Skeleton style={{ height: 360 }} /></div>;
  return (
    <div className="so-cnt-wz">
      <div className="panel so-wz">
        <div className="so-wz-top">
          <div><small>{count ? count.docNo : "New count"} · {o.warehouses.find((w) => w.id === (count?.warehouse.id ?? scope.warehouseId))?.name ?? ""}</small>
            {step === 0 ? <h2><input className="so-wz-name" style={{ border: 0, background: "transparent", font: "inherit", color: "inherit", width: "100%" }} value={scope.name} onChange={(e) => setScope((s) => ({ ...s, name: e.target.value }))} aria-label="Count name" /></h2> : <h2 className="so-wz-name">{count?.name}</h2>}
          </div>
          <button className="btn ghost sm" type="button" onClick={async () => { if (pending.length) await run(saveCounts); onClose(); }}><X />Close</button>
        </div>
        <ol className="so-steps">
          {STEPS.map(([label, icon], i) => <li key={label} className={cn(i === step && "on", i < step && "done")}><span>{i < step ? <Check /> : icon}</span><b>{i + 1}. {label}</b></li>)}
          <i className="so-steps-bar" style={{ ["--p" as string]: step / 4 }} />
        </ol>
        <div className="so-wz-body">
          {step === 0 && (
            <div className="so-scope">
              <div className="so-scope-l">
                <h4>Where are you counting?</h4>
                <div className="so-loc-pick-grid">
                  {o.warehouses.map((w) => <button key={w.id} type="button" className={cn("so-lp", w.id === scope.warehouseId && "on")} onClick={() => setScope((s) => ({ ...s, warehouseId: w.id }))}><span>{w.type === "SHOP" ? <Store /> : <Warehouse />}</span><b>{w.name}</b><small>{w.code}</small></button>)}
                </div>
                <h4>Product classes <small>(none selected = all)</small></h4>
                <div className="so-cls-chips">
                  {o.classes.map((c) => <button key={c.id} type="button" className={cn("so-cchip", scope.classIds.includes(c.id) && "on")} onClick={() => setScope((s) => ({ ...s, classIds: s.classIds.includes(c.id) ? s.classIds.filter((x) => x !== c.id) : [...s.classIds, c.id] }))}>{c.name}<em>{o.products.filter((p) => p.productClassId === c.id).length}</em></button>)}
                </div>
                <div className="so-toggles">
                  <label className="so-tg"><span className="so-tg-i"><Target /></span><span><b>ABC · A-items only</b><small>Top items making up 80% of stock value</small></span><span className="switch"><input type="checkbox" checked={scope.abcA} onChange={(e) => setScope((s) => ({ ...s, abcA: e.target.checked }))} /><i /></span></label>
                  <label className="so-tg"><span className="so-tg-i"><EyeOff /></span><span><b>Blind count</b><small>Counters can’t see the expected quantity</small></span><span className="switch"><input type="checkbox" checked={scope.blind} onChange={(e) => setScope((s) => ({ ...s, blind: e.target.checked }))} /><i /></span></label>
                </div>
                <FormGrid cols={1}><Field label="Count date"><input type="date" value={scope.docDate} onChange={(e) => setScope((s) => ({ ...s, docDate: e.target.value }))} /></Field></FormGrid>
              </div>
              <div className="so-scope-r">
                <div className="so-scope-sum"><small>In scope</small><b>{stock === null ? "…" : fmt(inScope.length)}</b><span>lines</span>
                  <div className="so-sc-kv"><div><small>Expected units</small><b>{fmt(inScope.reduce((s, x) => s + x.qtyOnHand, 0))}</b></div><div><small>Value at cost</small><b>Rs {fmt(inScope.reduce((s, x) => s + x.qtyOnHand * x.unitCost, 0))}</b></div></div>
                  <div className="so-sc-list">
                    {inScope.slice(0, 6).map((s) => <span key={`${s.itemId}|${s.batchId ?? ""}`}>{product(s.itemId)?.name}{s.batchNo ? ` · ${s.batchNo}` : ""}</span>)}
                    {inScope.length > 6 && <span className="more">+{inScope.length - 6} more</span>}
                    {stock !== null && !inScope.length && <span className="more">Nothing in stock matches — widen the filters</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
          {step === 1 && count && (
            <div className={cn("so-freeze", count.status !== "DRAFT" && "frozen")}>
              <div className="so-fz-art"><span className="so-fz-ring" /><span className="so-fz-ico">{count.status !== "DRAFT" ? <Lock /> : <Snowflake />}</span></div>
              <div className="so-fz-main">
                <h3>{count.status !== "DRAFT" ? "Snapshot frozen" : "Freeze the book quantities"}</h3>
                <p>{count.status !== "DRAFT"
                  ? <>Book stock for {count.warehouse.name} was captured at <b>{count.frozenAt ? new Date(count.frozenAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</b>. Movements after this moment won’t change the expected quantities.</>
                  : <>We’ll capture expected quantities for everything in scope at {count.warehouse.name} ({count.scopeLabel ?? "all classes"}). Counting can start straight after.</>}</p>
                <div className="so-fz-bar"><i style={{ width: count.status !== "DRAFT" ? "100%" : "0%" }} /></div>
                <div className="so-fz-tick">{count.status !== "DRAFT" ? <><CircleCheck />{count.lineCount} lines frozen</> : <><Info />Nothing frozen yet</>}</div>
                {count.status === "DRAFT" && can.create && <button className="btn primary lg" type="button" disabled={busy} onClick={freeze}><Snowflake />{busy ? "Freezing…" : "Freeze snapshot"}</button>}
              </div>
            </div>
          )}
          {step === 2 && count && (
            <div className="so-cs">
              <div className="so-cs-top">
                <label className="so-scanbox"><ScanBarcode /><input placeholder="Scan a barcode or type SKU / name, then Enter" autoComplete="off" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scan(); } }} /></label>
                <button className="btn secondary" type="button" disabled={busy || !pending.length} onClick={async () => { const c = await run(saveCounts); if (c) toast("Counts saved", { tone: "good" }); }}><Check />Save counts{pending.length ? ` (${pending.length})` : ""}</button>
              </div>
              <div className="so-cs-prog"><div><b>{countedN}</b> of {lines.length} lines counted<span className="so-cs-pct">{lines.length ? Math.round((countedN / lines.length) * 100) : 0}%</span></div><div className="progress"><i style={{ width: `${lines.length ? (countedN / lines.length) * 100 : 0}%` }} /></div></div>
              <div className="table-wrap"><table className="tbl so-cs-tbl">
                <thead><tr><th>#</th><th>Product</th><th>Batch</th><th>Barcode</th><th className="num">Expected</th><th className="so-c">Counted</th><th>Status</th></tr></thead>
                <tbody>
                  {lines.map((l, i) => {
                    const c = cntOf(l.id);
                    const d = varOf(l);
                    return (
                      <tr key={l.id} className={cn(c !== null && "counted")}>
                        <td className="so-idx">{i + 1}</td>
                        <td><div className="so-prod"><div><b>{l.item.name}</b><small>{l.item.sku}</small></div></div></td>
                        <td>{l.batchNo ?? "—"}</td>
                        <td className="so-mono so-muted">{product(l.item.id)?.upc ?? "—"}</td>
                        <td className="num">{l.expectedQty === null ? <span className="so-mask">•••</span> : qty(l.expectedQty)}</td>
                        <td className="so-c"><div className="so-stepper">
                          <button type="button" aria-label="Minus" onClick={() => setCnt(l.id, { cnt: String(Math.max(0, (c ?? 0) - 1)) })}><Minus /></button>
                          <input type="number" min={0} value={counts[l.id]?.cnt ?? ""} placeholder="—" onChange={(e) => setCnt(l.id, { cnt: e.target.value })} />
                          <button type="button" aria-label="Plus" onClick={() => setCnt(l.id, { cnt: String((c ?? 0) + 1) })}><Plus /></button>
                        </div></td>
                        <td>{c === null ? <span className="so-st nc">Not counted</span> : l.expectedQty === null || d === 0 ? <span className="so-st ok"><Check />{l.expectedQty === null ? "Counted" : "Match"}</span> : <span className={cn("so-st", d < 0 ? "sh" : "ex")}>{d < 0 ? "Short" : "Excess"} {qty(Math.abs(d))}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
              <p className="so-cs-last so-muted">{count.isBlind ? <><EyeOff />Blind count: expected quantities are hidden from counters.</> : <><Info />Counts are saved when you continue or press Save counts.</>}</p>
            </div>
          )}
          {step === 3 && count && (
            <div className="so-vr">
              {blindHidden && <div className="banner warn"><CircleAlert /><div><b>Expected quantities are hidden</b><p>This is a blind count. A user who can approve counts reviews the variances.</p></div></div>}
              {countedN < lines.length && <div className="banner warn"><CircleAlert /><div><b>{lines.length - countedN} line{lines.length - countedN === 1 ? " is" : "s are"} not counted</b><p>Go back to the count sheet, or <button type="button" className="link" onClick={zeroUncounted}>set them to zero</button> if those items are not on the shelf.</p></div></div>}
              <div className="so-vr-top">
                <div className="chips">
                  {([["all", "All lines", lines.length], ["var", "Variances", lines.filter((l) => varOf(l)).length], ["sh", "Short", lines.filter((l) => varOf(l) < 0).length], ["ex", "Excess", lines.filter((l) => varOf(l) > 0).length]] as const).map(([k, l, n]) => <button key={k} type="button" className={cn(vf === k && "active")} onClick={() => setVf(k)}>{l} <i>{n}</i></button>)}
                </div>
                <span className="spacer" />
                <label className="so-vr-all">Apply reason to all variances <select value="" onChange={(e) => { const r = e.target.value; if (r) setCounts((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => { const l = lines.find((x) => x.id === k); return [k, l && varOf(l) && !v.reason ? { ...v, reason: r } : v]; }))); }}><option value="">Choose…</option>{o.countReasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select></label>
              </div>
              <div className="table-wrap"><table className="tbl so-vr-tbl">
                <thead><tr><th>Product</th><th className="num">Expected</th><th className="num">Counted</th><th className="num">Variance</th><th className="num">Variance value</th><th className="num">%</th><th>Reason</th></tr></thead>
                <tbody>
                  {lines.filter((l) => vf === "all" || (vf === "var" ? varOf(l) : vf === "sh" ? varOf(l) < 0 : varOf(l) > 0)).map((l) => {
                    const d = varOf(l);
                    const c = cntOf(l.id);
                    const pct = l.expectedQty ? (d / l.expectedQty) * 100 : d ? 100 : 0;
                    return (
                      <tr key={l.id} className={d < 0 ? "sh" : d > 0 ? "ex" : "ok"}>
                        <td><div className="so-prod"><div><b>{l.item.name}</b><small>{l.item.sku}{l.batchNo ? ` · ${l.batchNo}` : ""}{c === null ? " · not counted" : ""}</small></div></div></td>
                        <td className="num">{l.expectedQty === null ? "—" : qty(l.expectedQty)}</td>
                        <td className="num"><b>{c === null ? "—" : qty(c)}</b></td>
                        <td className="num"><span className="so-vq">{d === 0 ? "—" : `${d > 0 ? "+" : "−"}${qty(Math.abs(d))}`}</span></td>
                        <td className="num">{d === 0 ? <span className="zero">—</span> : `${d > 0 ? "+" : "−"}Rs ${fmt(Math.abs(d * l.unitCost))}`}</td>
                        <td className="num"><span className="so-vp">{d === 0 ? "0%" : `${d > 0 ? "+" : ""}${pct.toFixed(1)}%`}</span></td>
                        <td>{d === 0 ? <span className="so-st ok"><Check />No action</span> : (
                          <select className={cn("so-vr-r", !counts[l.id]?.reason && "need")} value={counts[l.id]?.reason ?? ""} onChange={(e) => setCnt(l.id, { reason: e.target.value })}>
                            <option value="">Select reason</option>
                            {o.countReasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                          </select>
                        )}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
              <div className="so-vr-cards">
                <div className="sh"><small>Shortage value</small><b>Rs {fmt(shortage)}</b></div>
                <div className="ex"><small>Excess value</small><b>Rs {fmt(excess)}</b></div>
                <div className="net"><small>Net adjustment</small><b>{rsSigned(excess - shortage).replace("—", "Rs 0")}</b></div>
                <div className="acc"><small>Line accuracy</small><b>{lines.length ? ((lines.filter((l) => !varOf(l) && cntOf(l.id) !== null).length / lines.length) * 100).toFixed(1) : "0.0"}%</b></div>
              </div>
            </div>
          )}
          {step === 4 && count && (
            <div className="so-ap">
              <div className="so-ap-paper">
                <div className="so-ap-h"><div><small>Adjustment journal · preview</small><h3>{count.docNo}</h3></div><Badge tone="warn" dot>Pending approval</Badge></div>
                <div className="so-ap-meta"><span>{dateLabel(count.docDate)}</span><span>{count.warehouse.name}</span><span>{count.lineCount} lines</span></div>
                <table className="tbl">
                  <thead><tr><th>Account</th><th>Narration</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
                  <tbody>
                    {shortage > 0 && <><tr><td><b>Inventory shrinkage</b></td><td>Count shortages · {count.docNo}</td><td className="num dr">{fmt(shortage, 2)}</td><td /></tr><tr><td><b>Stock in trade</b></td><td>Reduce book stock</td><td /><td className="num cr">{fmt(shortage, 2)}</td></tr></>}
                    {excess > 0 && <><tr><td><b>Stock in trade</b></td><td>Count surplus · {count.docNo}</td><td className="num dr">{fmt(excess, 2)}</td><td /></tr><tr><td><b>Inventory gains</b></td><td>Surplus recognised</td><td /><td className="num cr">{fmt(excess, 2)}</td></tr></>}
                    {!shortage && !excess && <tr><td colSpan={4} className="so-muted">No variances — nothing to post. Approving closes the session.</td></tr>}
                  </tbody>
                  <tfoot><tr className="total"><td colSpan={2}>Total</td><td className="num">{fmt(shortage + excess, 2)}</td><td className="num">{fmt(shortage + excess, 2)}</td></tr></tfoot>
                </table>
                <div className="so-ap-bal"><Scale />Debits equal credits · balanced</div>
              </div>
              <div className="so-ap-side">
                <div className="so-ap-kv"><div><small>Lines</small><b>{lines.length}</b></div><div><small>Variances</small><b>{lines.filter((l) => varOf(l)).length}</b></div><div><small>Shortage</small><b className="neg">Rs {fmt(shortage)}</b></div><div><small>Excess</small><b className="pos">Rs {fmt(excess)}</b></div></div>
                <h4>Approval</h4>
                <p className="so-muted">Counted by {count.owner?.name ?? "—"}. The person who prepared the count can’t approve it.</p>
                <label className="so-ap-note"><span>Comment</span><textarea rows={3} placeholder="Optional note for the audit trail" value={comment} onChange={(e) => setComment(e.target.value)} /></label>
                <p className="so-muted"><Info />On approval the stock ledger is corrected and the journal is posted to the GL.</p>
              </div>
            </div>
          )}
        </div>
        <div className="so-wz-foot">
          <button className="btn secondary" type="button" disabled={step <= (initialId || count ? 1 : 0) || busy} onClick={() => setStep((s) => Math.max(1, s - 1))}><ArrowLeft />Back</button>
          <span className="so-wz-hint">{hint}</span>
          <button className="btn primary" type="button" disabled={busy || !canNext} onClick={next}>{step === 4 ? <><Stamp />{busy ? "Posting…" : "Approve & post adjustment"}</> : <>{busy ? "Working…" : step === 0 ? "Create & continue" : "Continue"}<ArrowRight /></>}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- drawer (approved / cancelled / any)
function CountDrawer({ id, can, onClose, onChanged, onContinue }: { id: string | null; can: Can; onClose: () => void; onChanged: () => void; onContinue: (id: string) => void }) {
  const toast = useToast();
  const [c, setC] = useState<StockCount | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"details" | "history">("details");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [reason, setReason] = useState("");
  const [n2, setN2] = useState(0);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getCount(id).then((x) => !cancelled && setC(x)).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the count")));
    return () => { cancelled = true; };
  }, [id, n2]);
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast(label, { tone: "good" }); setN2((x) => x + 1); onChanged(); return true; } catch (e) { toast(errMsg(e, "That didn’t work"), { tone: "danger" }); return false; } finally { setBusy(false); }
  };
  const st = c ? STATUS[c.status] ?? { label: c.status, tone: "neutral" as Tone } : null;
  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={c ? c.name : "Stock count"} subtitle={c ? `${c.docNo} · ${c.warehouse.name}` : undefined} foot={c ? (
        <>
          {c.status === "DRAFT" && can.create && <Button disabled={busy} icon={<Trash2 />} onClick={() => setDel(true)}>Delete</Button>}
          {c.status !== "CANCELLED" && can.cancel && <Button disabled={busy} onClick={() => setCancelAsk(true)}>{c.status === "APPROVED" ? "Reverse" : "Cancel"}</Button>}
          {OPEN.includes(c.status) && <Button variant="primary" onClick={() => onContinue(c.id)}>Continue<ArrowRight /></Button>}
          {c.voucher && <Link className="btn primary" href={`/accounting/vouchers/${c.voucher.id}`}>Open journal</Link>}
        </>
      ) : undefined}>
        {err ? <ErrorState message={err} onRetry={() => { setErr(null); setN2((x) => x + 1); }} /> : !c || !st ? <Skeleton style={{ height: 380 }} /> : (
          <>
            <div className="so-dr-hero"><span>{st.icon}</span><div><b>{rsSigned(c.netVarianceValue).replace("—", "Rs 0")}</b><small>{c.lineCount} lines · {c.scopeLabel ?? "All classes"}</small></div><Badge tone={st.tone}>{st.label}</Badge></div>
            <Tabs<"details" | "history"> items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <>
                <div className="dl mt">
                  <div><span>Journal</span><b>{c.voucher ? <Link className="link" href={`/accounting/vouchers/${c.voucher.id}`}>{c.voucher.docNo}</Link> : "—"}</b></div>
                  <div><span>Counted by</span><b>{c.owner?.name ?? "—"}</b></div>
                  <div><span>Date</span><b>{dateLabel(c.docDate)}</b></div>
                  <div><span>Approved by</span><b>{c.approver?.name ?? "—"}{c.approvedAt ? ` · ${dateLabel(c.approvedAt.slice(0, 10))}` : ""}</b></div>
                  <div><span>Shortage / excess</span><b>Rs {fmt(c.shortageValue)} / Rs {fmt(c.excessValue)}</b></div>
                  {c.approvalComment && <div><span>Comment</span><b>{c.approvalComment}</b></div>}
                </div>
                <div className="table-wrap mt"><table className="tbl">
                  <thead><tr><th>Product</th><th className="num">Expected</th><th className="num">Counted</th><th className="num">Variance</th><th className="num">Value</th><th>Reason</th></tr></thead>
                  <tbody>
                    {c.lines.map((l) => (
                      <tr key={l.id}>
                        <td><b>{l.item.name}</b><small>{l.item.sku}{l.batchNo ? ` · ${l.batchNo}` : ""}</small></td>
                        <td className="num">{l.expectedQty === null ? "—" : qty(l.expectedQty)}</td>
                        <td className="num">{l.countedQty === null ? "—" : qty(l.countedQty)}</td>
                        <td className={cn("num", (l.varianceQty ?? 0) < 0 ? "neg" : (l.varianceQty ?? 0) > 0 && "dr")}>{l.varianceQty ? `${l.varianceQty > 0 ? "+" : "−"}${qty(Math.abs(l.varianceQty))}` : "—"}</td>
                        <td className="num">{l.varianceValue ? rsSigned(l.varianceValue) : "—"}</td>
                        <td>{l.reason ? l.reason.replace(/_/g, " ").toLowerCase() : "—"}</td>
                      </tr>
                    ))}
                    {!c.lines.length && <tr><td colSpan={6} className="muted">Not frozen yet — no lines.</td></tr>}
                  </tbody>
                </table></div>
              </>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Inventory" table="StockCounts" id={c.id} /></div>}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={del && !!c} onClose={() => setDel(false)} danger busy={busy} title={`Delete ${c?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => c && run(`${c.docNo} deleted`, async () => { await deleteCount(c.id, c.rowVersion); setDel(false); onClose(); })}>
        The count session is removed. Nothing was frozen or posted.
      </ConfirmDialog>
      <Modal open={cancelAsk && !!c} onClose={() => setCancelAsk(false)} title={`${c?.status === "APPROVED" ? "Reverse" : "Cancel"} ${c?.docNo ?? ""}`} subtitle={c?.status === "APPROVED" ? "The variance movements and journal are reversed." : "The count closes without posting."} foot={
        <><button type="button" className="btn secondary" onClick={() => setCancelAsk(false)} disabled={busy}>Back</button>
          <button type="button" className="btn danger" disabled={busy || reason.trim().length < 3} onClick={async () => { if (c && await run(`${c.docNo} ${c.status === "APPROVED" ? "reversed" : "cancelled"}`, () => cancelCount(c.id, c.rowVersion, reason.trim()))) { setCancelAsk(false); setReason(""); } }}>{busy ? "Working…" : "Confirm"}</button></>
      }>
        <FormGrid cols={1}><Field label="Reason" required><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></FormGrid>
      </Modal>
    </>
  );
}
