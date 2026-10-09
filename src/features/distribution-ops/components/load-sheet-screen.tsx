"use client";

import { Banknote, CircleCheck, Handshake, History, Inbox, ListChecks, ListX, Package, Plus, Printer, QrCode, ReceiptText, RotateCcw, Save, Send, ShieldCheck, Trash2, Truck, UserRound, BadgeCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DistributionOpsOptions, LoadCandidate, LoadSheet, LoadSheetList } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  cancelLoadSheet, createLoadSheet, deleteLoadSheet, distributionOpsOptions, getLoadSheet, listLoadSheets, loadCandidates, loadSheetAction, setDelivery, updateLoadSheet,
} from "../api";
import { CapacityPanel, DsEmpty, LoadList, RunsPanel, StatusPill, compact, dayOf, fmt, money, nice, niceShort } from "./load-sheet-panels";

type Can = { create: boolean; edit: boolean; approve: boolean; post: boolean; delivery: boolean };
type Form = { routeId: string; vehicleId: string; driverEmployeeId: string; salesmanEmployeeId: string; docDate: string; departureTime: string };
type Row = LoadCandidate & { onRun?: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const CODE_MSG: Record<string, string> = {
  INVOICE_ON_LOAD_SHEET: "One of these invoices is already on another live run.",
  LOAD_SHEET_EMPTY: "Add invoices to the run before dispatching it.",
  LOAD_SHEET_NOT_EDITABLE: "This run can no longer be changed.",
  LOAD_SHEET_INVOICE_NOT_POSTED: "An invoice on this run is no longer posted; remove it first.",
};
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? CODE_MSG[e.code] ?? e.message : fallback);
const DELIV = [{ k: "FULL", label: "Delivered" }, { k: "PARTIAL", label: "Partial" }, { k: "NONE", label: "Not delivered" }] as const;

/**
 * Wholesale › Load Sheets (template app/wholesale/load-sheet, engine 9I-distribution.js "1. LOAD SHEETS"). Paperwork
 * only: invoices already issued stock when posted, so the run is the pick list, gate pass and delivery tracker.
 */
export function LoadSheetScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [opts, setOpts] = useState<DistributionOpsOptions | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ routeId: "", vehicleId: "", driverEmployeeId: "", salesmanEmployeeId: "", docDate: today(), departureTime: "08:00" });
  const [cands, setCands] = useState<Row[]>([]);
  const [candsLoading, setCandsLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<LoadSheet | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [list, setList] = useState<LoadSheetList | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [tab, setTab] = useState("LOADING");
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  const locked = !!sheet && sheet.status !== "LOADING";
  const route = opts?.routes.find((r) => r.id === form.routeId) ?? null;
  const van = opts?.vans.find((v) => v.id === form.vehicleId) ?? null;
  const emp = (id: string | null | undefined) => opts?.employees.find((e) => e.id === id)?.name ?? "—";

  // ---------------------------------------------------------------- loading
  const loadList = useCallback(async (t: string) => {
    setListLoading(true);
    try { setList(await listLoadSheets({ status: t, pageSize: 50 })); } catch (e) { toast(errMsg(e, "Could not load the runs"), { tone: "danger" }); } finally { setListLoading(false); }
  }, [toast]);

  const applyRoute = useCallback((o: DistributionOpsOptions, routeId: string, date: string, keep?: Partial<Form>) => {
    const r = o.routes.find((x) => x.id === routeId);
    const v = o.vans.find((x) => x.id === (keep?.vehicleId ?? r?.vehicleId)) ?? o.vans[0];
    setForm((f) => ({
      ...f, routeId, docDate: date, vehicleId: keep?.vehicleId ?? v?.id ?? "",
      driverEmployeeId: keep?.driverEmployeeId ?? r?.driverEmployeeId ?? v?.driverEmployeeId ?? "", salesmanEmployeeId: keep?.salesmanEmployeeId ?? r?.salesmanEmployeeId ?? "",
      departureTime: keep?.departureTime ?? f.departureTime,
    }));
  }, []);

  const loadCands = useCallback(async (routeId: string, date: string, onRun: LoadSheet | null) => {
    if (!routeId) { setCands([]); return; }
    setCandsLoading(true);
    try {
      const c = await loadCandidates(routeId, date);
      const mine: Row[] = (onRun?.invoices ?? []).filter((i) => !i.released).map((i) => ({
        id: i.invoice.id, docNo: i.invoice.docNo, docDate: onRun!.docDate, customer: i.customer, netAmount: i.amount, balanceAmount: i.amount, lineCount: i.lineCount, ctnEquiv: i.ctnEquiv, stopSeq: i.stopSeq, onRun: true,
      }));
      const rows = [...mine, ...c.filter((x) => !mine.some((m) => m.id === x.id))].sort((a, b) => (a.stopSeq ?? 999) - (b.stopSeq ?? 999) || a.docNo.localeCompare(b.docNo));
      setCands(rows);
      setSel(onRun ? new Set(mine.map((m) => m.id)) : new Set(c.map((x) => x.id)));
    } catch (e) { toast(errMsg(e, "Could not load the route's invoices"), { tone: "danger" }); } finally { setCandsLoading(false); }
  }, [toast]);

  const openRun = useCallback(async (id: string, o?: DistributionOpsOptions | null) => {
    try {
      const s = await getLoadSheet(id);
      setSheet(s);
      setPicked(new Set(s.lines.filter((l) => l.isPicked).map((l) => l.id)));
      setForm({ routeId: s.route.id, vehicleId: s.vehicle.id, driverEmployeeId: s.driver?.id ?? "", salesmanEmployeeId: s.salesman?.id ?? "", docDate: s.docDate, departureTime: s.departureTime });
      if (s.status === "LOADING") await loadCands(s.route.id, s.docDate, s);
      else {
        setCands(s.invoices.map((i) => ({ id: i.invoice.id, docNo: i.invoice.docNo, docDate: s.docDate, customer: i.customer, netAmount: i.amount, balanceAmount: i.amount, lineCount: i.lineCount, ctnEquiv: i.ctnEquiv, stopSeq: i.stopSeq, onRun: true })));
        setSel(new Set(s.invoices.map((i) => i.invoice.id)));
      }
      void o;
    } catch (e) { toast(errMsg(e, "Could not open the run"), { tone: "danger" }); }
  }, [loadCands, toast]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const o = await distributionOpsOptions();
        if (!live) return;
        setOpts(o);
        const id = params.get("id");
        if (id) { await openRun(id, o); return; }
        const r = params.get("route") ?? o.routes[0]?.id ?? "";
        const d = params.get("date") ?? today();
        if (r) { applyRoute(o, r, d); await loadCands(r, d, null); }
      } catch (e) { if (live) setLoadErr(errMsg(e, "Could not load routes and vans")); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let live = true;
    listLoadSheets({ status: tab, pageSize: 50 })
      .then((l) => { if (live) setList(l); })
      .catch((e) => { if (live) toast(errMsg(e, "Could not load the runs"), { tone: "danger" }); })
      .finally(() => { if (live) setListLoading(false); });
    return () => { live = false; };
  }, [tab, toast]);
  const changeTab = (t: string) => { if (t === tab) return; setListLoading(true); setTab(t); };

  // ---------------------------------------------------------------- builder
  const chosen = cands.filter((c) => sel.has(c.id));
  const ctnEq = chosen.reduce((a, c) => a + c.ctnEquiv, 0);
  const value = chosen.reduce((a, c) => a + c.netAmount, 0);
  const shops = new Set(chosen.map((c) => c.customer.id)).size;

  const setField = (k: keyof Form, v: string) => {
    if (locked) return;
    if (k === "routeId" && opts) { applyRoute(opts, v, form.docDate); void loadCands(v, form.docDate, sheet); return; }
    if (k === "docDate") { setForm((f) => ({ ...f, docDate: v })); void loadCands(form.routeId, v, sheet); return; }
    if (k === "vehicleId" && opts) { const nv = opts.vans.find((x) => x.id === v); setForm((f) => ({ ...f, vehicleId: v, driverEmployeeId: f.driverEmployeeId || nv?.driverEmployeeId || "" })); return; }
    setForm((f) => ({ ...f, [k]: v }));
  };
  const toggle = (id: string, on: boolean) => { if (locked) return; setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; }); };

  const newRun = () => {
    setSheet(null); setPicked(new Set());
    router.replace("/wholesale/load-sheet");
    if (opts && form.routeId) { applyRoute(opts, form.routeId, today()); void loadCands(form.routeId, today(), null); }
  };

  const save = async () => {
    if (!form.routeId || !form.vehicleId || !form.driverEmployeeId) { toast("Choose the route, van and driver", { tone: "warn" }); return; }
    if (!sel.size) { toast("Tick at least one invoice", { tone: "warn" }); return; }
    setBusy("save");
    const body = { ...form, salesmanEmployeeId: form.salesmanEmployeeId || null, invoiceIds: [...sel] };
    try {
      const s = sheet ? await updateLoadSheet(sheet.id, { ...body, rowVersion: sheet.rowVersion }) : await createLoadSheet(body);
      setSheet(s);
      router.replace(`/wholesale/load-sheet?id=${s.id}`);
      toast(`${s.docNo} saved · ${s.invoiceCount} invoices, ${s.skuCount} SKUs`, { tone: "good" });
      void loadList(tab);
    } catch (e) { toast(errMsg(e, "Could not save the run"), { tone: "danger" }); } finally { setBusy(null); }
  };

  const act = async (action: "approve" | "dispatch") => {
    if (!sheet) return;
    setBusy(action);
    try {
      const s = await loadSheetAction(sheet.id, action, sheet.rowVersion);
      setSheet(s);
      toast(action === "approve" ? `${s.docNo} approved · ready to load` : `${s.vehicle.regNo} dispatched · gate pass ${s.gatePassNo ?? ""}`, { tone: "good" });
      if (action === "dispatch") setGateOpen(true);
      if (s.status !== tab) changeTab(s.status);
      else void loadList(tab);
    } catch (e) { toast(errMsg(e, `Could not ${action} the run`), { tone: "danger" }); } finally { setBusy(null); }
  };

  const doCancel = async () => {
    if (!sheet || reason.trim().length < 3) { toast("Give a reason", { tone: "warn" }); return; }
    setBusy("cancel");
    try {
      const s = await cancelLoadSheet(sheet.id, sheet.rowVersion, reason.trim());
      setSheet(s); setCancelOpen(false); setReason("");
      toast(`${s.docNo} cancelled · its invoices are free for another run`, { tone: "info" });
      void loadList(tab);
    } catch (e) { toast(errMsg(e, "Could not cancel the run"), { tone: "danger" }); } finally { setBusy(null); }
  };

  const doDelete = async () => {
    if (!sheet) return;
    setBusy("delete");
    try {
      await deleteLoadSheet(sheet.id, sheet.rowVersion);
      toast(`${sheet.docNo} deleted`, { tone: "info" });
      setDelOpen(false); newRun(); void loadList(tab);
    } catch (e) { toast(errMsg(e, "Could not delete the run"), { tone: "danger" }); } finally { setBusy(null); }
  };

  const deliver = async (invoiceId: string, state: "FULL" | "PARTIAL" | "NONE") => {
    if (!sheet) return;
    setBusy(`d-${invoiceId}`);
    try {
      const s = await setDelivery(sheet.id, invoiceId, state, state === "FULL" ? null : state === "NONE" ? "Not delivered" : "Partly delivered");
      setSheet(s);
    } catch (e) { toast(errMsg(e, "Could not update the delivery"), { tone: "danger" }); } finally { setBusy(null); }
  };

  const kpis = useMemo(() => {
    const t = (list?.items ?? []).filter((r) => r.docDate === today());
    return { runs: t.length, inv: t.reduce((a, r) => a + r.invoiceCount, 0), ctn: t.reduce((a, r) => a + r.totalCtnEquiv, 0), val: t.reduce((a, r) => a + r.totalValue, 0), vans: new Set(t.map((r) => r.vehicle.id)).size };
  }, [list]);

  if (loadErr) return <ErrorState message={loadErr} onRetry={() => location.reload()} />;

  // ---------------------------------------------------------------- render
  const capActions = (
    <>
      <button type="button" className="btn secondary" onClick={() => window.print()} disabled={!sheet}><Printer />Print load sheet</button>
      <button type="button" className="btn secondary" onClick={() => setGateOpen(true)} disabled={!sheet?.gatePassNo}><QrCode />Gate pass</button>
      {!sheet || sheet.status === "LOADING" ? (
        can.create || can.edit ? <button type="button" className="btn primary lg block" onClick={() => void save()} disabled={busy === "save"}><Save />{busy === "save" ? "Saving…" : sheet ? "Save run" : "Save run (draft)"}</button> : null
      ) : null}
      {sheet?.status === "LOADING" && can.approve && <button type="button" className="btn secondary block" onClick={() => void act("approve")} disabled={!!busy}><ShieldCheck />Approve load sheet</button>}
      {sheet && (sheet.status === "SCHEDULED" || (sheet.status === "LOADING" && !can.approve)) && can.post && (
        <button type="button" className="btn primary lg block" onClick={() => void act("dispatch")} disabled={!!busy}><Send />{busy === "dispatch" ? "Dispatching…" : "Dispatch van"}</button>
      )}
      {sheet && ["DISPATCHED", "SETTLED"].includes(sheet.status) && (
        <button type="button" className="btn primary lg block" disabled><CircleCheck />Dispatched {sheet.dispatchedAt ? niceShort(sheet.dispatchedAt) : ""}</button>
      )}
    </>
  );

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Wholesale &amp; Distribution / Distribution</div><h1>Load Sheets</h1>
          <p>Consolidate the day&apos;s invoices into a van-ready pick list, watch the van fill up, print the gate pass and send it on its beat.</p></div>
        <div className="head-actions"><span className="tagline">Load right, ride light</span>
          <Link className="btn secondary" href="/wholesale/settlement"><Handshake />Route settlement</Link>
          {can.create && <button type="button" className="btn primary" onClick={newRun}><Plus />New run</button>}</div>
      </div>

      <div className="kpi-grid ds-ls-print-hide">
        <div className="kpi"><div className="kpi-top"><span>Today&apos;s runs</span><span className="icon-well"><Truck /></span></div><strong>{kpis.runs}</strong><small>{STATUS_SUB(list)}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Invoices loaded</span><span className="icon-well"><ReceiptText /></span></div><strong>{kpis.inv}</strong><small>across {kpis.vans} van{kpis.vans === 1 ? "" : "s"}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Cartons loaded</span><span className="icon-well"><Package /></span></div><strong>{fmt(Math.round(kpis.ctn))}</strong><small>equivalent cartons</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Load value</span><span className="icon-well"><Banknote /></span></div><strong>Rs {compact(kpis.val)}</strong><small>runs dated today ({tabLabel(tab)})</small></div>
      </div>

      <div className="ds-ls-top">
        <div className={cn("panel ds-builder", locked && "ds-locked")}>
          <div className="panel-head"><div><h3 className="row" style={{ gap: 10 }}>Run builder <span className="ds-runno">{sheet?.docNo ?? "New run"}</span><StatusPill status={sheet?.status ?? "LOADING"} /></h3>
            <p>Pick a route and vehicle, then tick the invoices going on this run.</p></div>
            <div className="panel-actions ds-ls-print-hide">
              {sheet && <button type="button" className="btn ghost sm" onClick={() => setHistOpen(true)}><History />History</button>}
              {sheet?.status === "LOADING" && can.create && <button type="button" className="btn ghost sm" onClick={() => setDelOpen(true)}><Trash2 />Delete</button>}
              {sheet && ["LOADING", "SCHEDULED", "DISPATCHED"].includes(sheet.status) && can.post && sheet.settlement?.status !== "SETTLED" && (
                <button type="button" className="btn ghost sm" onClick={() => setCancelOpen(true)}><XCircle />Cancel run</button>
              )}
              {!sheet && <button type="button" className="btn ghost sm" onClick={newRun} disabled={locked}><RotateCcw />Reset</button>}
            </div></div>
          {!opts ? <Skeleton style={{ height: 160 }} /> : !opts.routes.length ? (
            <DsEmpty icon={<Inbox />} title="No routes yet">Set up routes, vans and shops in <Link className="link" href="/wholesale/routes">Routes &amp; Salesmen</Link> first.</DsEmpty>
          ) : (
            <>
              <div className="form-grid ds-runform">
                <label><span>Route</span><select value={form.routeId} disabled={locked} onChange={(e) => setField("routeId", e.target.value)}>{opts.routes.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}</select></label>
                <label><span>Vehicle (van no)</span><select value={form.vehicleId} disabled={locked} onChange={(e) => setField("vehicleId", e.target.value)}><option value="">Choose…</option>{opts.vans.map((v) => <option key={v.id} value={v.id}>{v.regNo} · {fmt(v.capacityCtn)} ctn</option>)}</select></label>
                <label><span>Driver</span><select value={form.driverEmployeeId} disabled={locked} onChange={(e) => setField("driverEmployeeId", e.target.value)}><option value="">Choose…</option>{pickEmployees(opts, "isDeliveryman", form.driverEmployeeId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
                <label><span>Date</span><input type="date" value={form.docDate} disabled={locked} onChange={(e) => setField("docDate", e.target.value || today())} /></label>
                <label><span>Departure</span><input type="time" value={form.departureTime} disabled={locked} onChange={(e) => setField("departureTime", e.target.value)} /></label>
                <label><span>Salesman</span><select value={form.salesmanEmployeeId} disabled={locked} onChange={(e) => setField("salesmanEmployeeId", e.target.value)}><option value="">—</option>{pickEmployees(opts, "isSalesman", form.salesmanEmployeeId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
              </div>
              <div className="ds-routemeta">
                <span className="pill"><UserRound />Booker <b>{emp(route?.bookerEmployeeId)}</b></span>
                <span className="pill"><BadgeCheck />Salesman <b>{emp(form.salesmanEmployeeId || route?.salesmanEmployeeId)}</b></span>
                <span className="pill">{dayOf(form.docDate)} · {nice(form.docDate)}</span>
                {sheet?.gatePassNo && <Badge tone="info" dot>Gate pass {sheet.gatePassNo}</Badge>}
              </div>
              <div className="ds-picker-head">
                <div><b>{locked ? "Invoices on this run" : "Open invoices"}</b> <span className="muted small">· {sel.size} of {cands.length} selected{route ? ` · ${route.code}` : ""}</span></div>
                {!locked && <div className="row"><button type="button" className="btn ghost sm" onClick={() => setSel(new Set(cands.map((c) => c.id)))}><ListChecks />Select all</button><button type="button" className="btn ghost sm" onClick={() => setSel(new Set())}><ListX />Clear</button></div>}
              </div>
              <div className="table-wrap ds-picker"><table className="tbl ds-tbl" data-plain>
                <thead><tr><th style={{ width: 36 }} /><th>Invoice</th><th>Shop</th><th className="num">Lines</th><th className="num">CTN</th><th className="num">Amount</th>{sheet?.status === "DISPATCHED" && <th>Delivery</th>}</tr></thead>
                <tbody>
                  {candsLoading ? <tr><td colSpan={7}><Skeleton style={{ height: 120 }} /></td></tr>
                    : !cands.length ? <tr><td colSpan={7}><DsEmpty icon={<Inbox />} title="No open invoices">No posted invoice on this route in the 14 days up to this date is waiting for a run.</DsEmpty></td></tr>
                      : cands.map((c, i) => {
                        const on = sel.has(c.id);
                        const st = sheet?.invoices.find((x) => x.invoice.id === c.id)?.deliveryState ?? null;
                        return (
                          <tr key={c.id} className={cn("ds-pick", on && "on")} style={{ ["--i" as string]: i }} onClick={(e) => { if (!locked && !(e.target as HTMLElement).closest("input,button")) toggle(c.id, !on); }}>
                            <td><input type="checkbox" checked={on} disabled={locked} onChange={(e) => toggle(c.id, e.target.checked)} aria-label={`Load ${c.docNo}`} /></td>
                            <td><b>{c.docNo}</b><small>{niceShort(c.docDate)} · {c.lineCount} SKUs</small></td>
                            <td><b>{c.customer.name}</b><small>{c.stopSeq ? `Stop ${c.stopSeq}` : c.customer.code}</small></td>
                            <td className="num">{c.lineCount}</td><td className="num">{c.ctnEquiv.toFixed(1)}</td><td className="num"><b>{money(c.netAmount)}</b></td>
                            {sheet?.status === "DISPATCHED" && (
                              <td><div className="ds-deliv">{DELIV.map((d) => (
                                <button key={d.k} type="button" className={cn("btn sm ghost", st === d.k && "on")} disabled={!can.delivery || busy === `d-${c.id}`} onClick={() => void deliver(c.id, d.k)}>{d.label}</button>
                              ))}</div></td>
                            )}
                          </tr>
                        );
                      })}
                </tbody></table></div>
              {sheet?.status === "DISPATCHED" && sheet.settlement && (
                <div className="ds-gatebar" style={{ marginTop: 12 }}><Handshake /><span>Mark each invoice&apos;s delivery, then settle the run&apos;s cash, cheques and returns.</span>
                  <Link className="btn secondary sm" href={`/wholesale/settlement?id=${sheet.settlement.id}`}>Open settlement {sheet.settlement.docNo}</Link></div>
              )}
            </>
          )}
        </div>

        <CapacityPanel plate={van?.regNo.split("-")[0] ?? "VAN"} vanLabel={van ? `${van.regNo} · ${fmt(van.capacityCtn)} ctn` : "Choose a van"} capCtn={van?.capacityCtn ?? 0}
          ctnEq={ctnEq} invoices={chosen.length} shops={shops} skus={sheet && !locked ? sheet.skuCount : sheet ? sheet.skuCount : null} value={value} actions={capActions} />
      </div>

      <LoadList sheet={sheet} picked={picked} onPick={(id, on) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; })} onPickAll={() => setPicked(new Set(sheet?.lines.map((l) => l.id)))} />

      <RunsPanel tab={tab} onTab={changeTab} list={list} loading={listLoading} currentId={sheet?.id ?? null} onOpen={(id) => { router.replace(`/wholesale/load-sheet?id=${id}`); void openRun(id); }} />

      <Modal open={gateOpen && !!sheet} onClose={() => setGateOpen(false)} title={`Gate pass ${sheet?.gatePassNo ?? ""}`} subtitle={`${sheet?.docNo ?? ""} · ${sheet?.vehicle.regNo ?? ""}`}
        foot={<><button type="button" className="btn ghost" onClick={() => setGateOpen(false)}>Close</button><button type="button" className="btn primary" onClick={() => window.print()}><Printer />Print</button></>}>
        {sheet && (
          <div className="ds-paper">
            <div className="ds-gate-meta form-grid">
              <div><small className="muted">Route</small><b style={{ display: "block" }}>{sheet.route.code} · {sheet.route.name}</b></div>
              <div><small className="muted">Van · driver</small><b style={{ display: "block" }}>{sheet.vehicle.regNo} · {sheet.driver?.name ?? "—"}</b></div>
              <div><small className="muted">Date · departs</small><b style={{ display: "block" }}>{nice(sheet.docDate)} · {sheet.departureTime}</b></div>
              <div><small className="muted">Load</small><b style={{ display: "block" }}>{sheet.invoiceCount} invoices · {fmt(Math.round(sheet.totalCtnEquiv))} ctn · {money(sheet.totalValue)}</b></div>
            </div>
            <div className="ds-paper-invs"><small>Invoices</small><div>{sheet.invoices.map((i) => <span key={i.id}>{i.invoice.docNo} · {i.customer.name}</span>)}</div></div>
            <div className="ds-signs"><div><span /><small>Store keeper</small></div><div><span /><small>Driver</small></div><div><span /><small>Security</small></div></div>
          </div>
        )}
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${sheet?.docNo ?? "run"}`} subtitle="Its invoices become free for another run. No stock moves (load sheets are paperwork)."
        foot={<><button type="button" className="btn ghost" onClick={() => setCancelOpen(false)}>Keep run</button><button type="button" className="btn danger" disabled={busy === "cancel"} onClick={() => void doCancel()}>Cancel run</button></>}>
        <label className="field"><span>Reason</span><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this run cancelled?" /></label>
      </Modal>

      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={() => void doDelete()} title={`Delete ${sheet?.docNo ?? "draft"}?`} confirmLabel="Delete" danger busy={busy === "delete"}>
        The draft run and its pick list are removed. Its invoices stay posted and can go on another run.
      </ConfirmDialog>

      <Drawer open={histOpen && !!sheet} onClose={() => setHistOpen(false)} title={`History · ${sheet?.docNo ?? ""}`} subtitle="Every change to this run, with who made it">
        {sheet && <HistoryTab schema="Distribution" table="LoadSheets" id={sheet.id} />}
      </Drawer>
    </>
  );
}

/** Employees flagged for the role (plus the current choice); everyone when nobody is flagged. */
function pickEmployees(o: DistributionOpsOptions, flag: "isDeliveryman" | "isSalesman", current: string) {
  const flagged = o.employees.filter((e) => e[flag] || e.id === current);
  return o.employees.some((e) => e[flag]) ? flagged : o.employees;
}

function tabLabel(t: string) {
  return t.charAt(0) + t.slice(1).toLowerCase();
}

function STATUS_SUB(list: LoadSheetList | null) {
  const c = list?.counts ?? {};
  const parts = [c.DISPATCHED && `${c.DISPATCHED} on the road`, c.LOADING && `${c.LOADING} loading`, c.SCHEDULED && `${c.SCHEDULED} scheduled`].filter(Boolean);
  return parts.join(" · ") || "No runs yet";
}
