"use client";

import { Building2, ChevronRight, CircleCheck, Ellipsis, FileText, Package, PackageCheck, Pencil, Plus, Printer, ReceiptText, Search, Trash2, TriangleAlert, Truck, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { DeliverableOrder, DeliveryChallan, DeliveryChallanList, SalesDocOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  cancelChallan, createChallan, deleteChallan, deliverableOrders, deliverChallan, dispatchChallan, getChallan, getSalesOrder, invoiceFromChallan, listChallans,
  salesDocOptions, updateChallan,
} from "../api";
import "./challans-screen.css";

type Can = { create: boolean; edit: boolean; delete: boolean; post: boolean };
type Row = DeliveryChallanList["items"][number];
type Err = { message: string; reference?: string };
/** A line of the New / Edit challan drawer. */
type Line = { soLineId: string; name: string; sku: string; ordered: number; delivered: number; pending: number; on: boolean; qty: string; batchId: string | null };
type FormState = { n: number; open: boolean; soId: string | null; editing: DeliveryChallan | null };

const PAGE = 15;
const OTHER = "__other__";
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const num = (v: string) => { const n = Number(v.replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };

/** Statuses: the four flow steps (template DC_ST) plus Cancelled. */
const FLOW = [
  { status: "PACKED", label: "Packed", tone: "info" as Tone, icon: <Package />, sub: "Picked & sealed" },
  { status: "DISPATCHED", label: "Dispatched", tone: "warn" as Tone, icon: <Truck />, sub: "Left the warehouse" },
  { status: "DELIVERED", label: "Delivered", tone: "good" as Tone, icon: <PackageCheck />, sub: "POD signed" },
  { status: "INVOICED", label: "Invoiced", tone: "violet" as Tone, icon: <ReceiptText />, sub: "Billed to customer" },
];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  ...Object.fromEntries(FLOW.map((f) => [f.status, { label: f.label, tone: f.tone }])), CANCELLED: { label: "Cancelled", tone: "danger" },
};
const ERROR_LABEL: Record<string, string> = { OVER_DELIVERY: "Over-delivery", CHALLAN_ORDER_NOT_OPEN: "Sales order not open", CHALLAN_NOT_EDITABLE: "Not editable" };
const errText = (e: unknown, fallback: string) => {
  if (!(e instanceof ApiError)) return fallback;
  const label = ERROR_LABEL[e.code];
  return label ? `${label}: ${e.message}` : e.message;
};

/** Template 4-dot progress stepper (dcStep). */
function Step({ status }: { status: string }) {
  const st = FLOW.findIndex((f) => f.status === status);
  return (
    <div className={cn("sd-step", st < 0 && "off")} style={{ ["--p" as string]: Math.max(0, st) / 3 }} aria-label={STATUS[status]?.label ?? status}>
      {FLOW.map((f, k) => <i key={f.status} className={cn(st >= 0 && k <= st && "on")} title={f.label} />)}
      <b />
    </div>
  );
}

/** Template app/sales/challans (43-sales-docs.html, 93-sales-docs.js): KPIs, status flow, challan register, New challan drawer. */
export function ChallansScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [options, setOptions] = useState<SalesDocOptions | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DeliveryChallanList | null>(null);
  const [error, setError] = useState<Err | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<FormState>(() => ({ n: 0, open: !!params.get("new") && can.create, soId: params.get("new"), editing: null }));
  const [detailId, setDetailId] = useState<string | null>(() => params.get("dc"));
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dispatchFor, setDispatchFor] = useState<Row | null>(null);
  const [deliverFor, setDeliverFor] = useState<Row | null>(null);
  const [cancelFor, setCancelFor] = useState<Row | null>(null);
  const [deleteFor, setDeleteFor] = useState<Row | null>(null);
  const reload = () => setAttempt((n) => n + 1);

  useEffect(() => {
    salesDocOptions().then(setOptions).catch(() => setOptions(null));
  }, []);
  // ?so=<orderId>: show that order's challans (search by its number)
  useEffect(() => {
    const so = params.get("so");
    if (!so) return;
    getSalesOrder(so).then((o) => { setQ(o.docNo); setSearch(o.docNo); }).catch(() => undefined);
  }, [params]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listChallans({ status, search, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load delivery challans" }));
    return () => { cancelled = true; };
  }, [status, search, page, attempt]);

  const openNew = () => setForm((f) => ({ n: f.n + 1, open: true, soId: null, editing: null }));
  const openEdit = async (id: string) => {
    try {
      const dc = await getChallan(id);
      if (dc.status !== "PACKED") { toast(`${dc.docNo} has left the warehouse and can no longer be edited`, { tone: "warn" }); reload(); return; }
      setDetailId(null);
      setForm((f) => ({ n: f.n + 1, open: true, soId: dc.salesOrder.id, editing: dc }));
    } catch (e) {
      toast(errText(e, "Could not load the challan"), { tone: "danger" });
    }
  };

  /** Runs a row action, shows the outcome and refreshes. */
  const run = async (r: { id: string }, fn: () => Promise<unknown>, msg: string) => {
    setBusy(r.id);
    try { await fn(); toast(msg, { tone: "good" }); reload(); return true; } catch (e) { toast(errText(e, "Something went wrong"), { tone: "danger" }); reload(); return false; } finally { setBusy(null); }
  };
  const convert = async (r: Row) => {
    setBusy(r.id);
    try {
      const inv = await invoiceFromChallan(r.id);
      toast(`${r.docNo} converted · draft invoice ${inv.docNo} ready for ${r.customer.name}`, { tone: "good" });
      router.push(`/sales/invoices/${inv.id}`);
    } catch (e) {
      toast(errText(e, "Could not convert the challan"), { tone: "danger" });
      setBusy(null);
    }
  };

  const rowMenu = (r: Row, anchor: HTMLElement) => setMenu({
    anchor,
    items: [
      { label: "View details", icon: <FileText />, onClick: () => setDetailId(r.id) },
      { label: `Open ${r.salesOrder.docNo}`, onClick: () => router.push(`/sales/orders?so=${r.salesOrder.id}`) },
      ...(r.journal ? [{ label: `Journal ${r.journal.docNo}`, onClick: () => router.push(`/accounting/vouchers/${r.journal!.id}`) }] : []),
      ...(r.status === "PACKED" && (can.edit || can.delete) ? [{ sep: true as const }] : []),
      ...(r.status === "PACKED" && can.edit ? [{ label: "Edit", icon: <Pencil />, onClick: () => void openEdit(r.id) }] : []),
      ...(r.status === "PACKED" && can.delete ? [{ label: "Delete", icon: <Trash2 />, danger: true, onClick: () => setDeleteFor(r) }] : []),
      ...((r.status === "DISPATCHED" || r.status === "DELIVERED") && can.post ? [{ sep: true as const }, { label: "Cancel challan", icon: <X />, danger: true, onClick: () => setCancelFor(r) }] : []),
    ],
  });

  /** The row's next-step action (template dcAction). */
  const action = (r: Row) => {
    const b = busy === r.id;
    if (r.status === "PACKED" && can.post) return <Button size="sm" icon={<Truck />} disabled={b} onClick={() => setDispatchFor(r)}>{b ? "Updating…" : "Mark dispatched"}</Button>;
    if (r.status === "DISPATCHED" && can.edit) return <Button size="sm" icon={<PackageCheck />} disabled={b} onClick={() => setDeliverFor(r)}>{b ? "Updating…" : "Mark delivered"}</Button>;
    if (r.status === "DELIVERED" && can.create) return <Button size="sm" variant="primary" icon={<ReceiptText />} disabled={b} onClick={() => void convert(r)}>{b ? "Converting…" : "Convert to invoice"}</Button>;
    if (r.status === "INVOICED" && r.invoice) return <Link className="btn ghost sm" href={`/sales/invoices/${r.invoice.id}`}><FileText />View invoice</Link>;
    if (r.status === "CANCELLED") return <span className="dc-cancelled">Cancelled</span>;
    return null;
  };

  const k = data?.kpis;
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const all = data ? Object.values(data.counts).reduce((s, n) => s + n, 0) : 0;
  const pick = (s: string) => { setStatus((cur) => (cur === s ? "" : s)); setPage(1); };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow={<><Truck />Sales / Fulfilment</>}
        title="Delivery Challans"
        description="Dispatch goods against sales orders, track them to the customer's door and convert delivered challans into invoices."
        actions={
          <>
            <span className="tagline">on the road, on time</span>
            <Button icon={<Printer />} disabled title="Run sheet printing arrives with document printing">Print run sheet</Button>
            {can.create && <Button variant="primary" icon={<Plus />} onClick={openNew}>New Challan</Button>}
          </>
        }
      />

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Packed · awaiting dispatch</span><span className="icon-well"><Package /></span></div><strong>{k?.packed ?? "—"}</strong><small>Picked & sealed, ready to load</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>On the road</span><span className="icon-well"><Truck /></span></div><strong>{k?.onRoad ?? "—"}</strong><small>Left the warehouse, not yet delivered</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Delivered · to invoice</span><span className="icon-well"><PackageCheck /></span></div><strong>{k?.deliveredToInvoice ?? "—"}</strong><small>{k ? `${rs(k.unbilledAmount)} unbilled` : " "}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Invoiced this week</span><span className="icon-well"><ReceiptText /></span></div><strong>{k?.invoicedWeek ?? "—"}</strong><small>{k ? `${rs(k.invoicedWeekAmount)} billed` : " "}</small></div>
      </div>

      <div className="sd-flow" role="group" aria-label="Filter by status">
        <button type="button" className={cn("sd-flow-all", !status && "active")} onClick={() => { setStatus(""); setPage(1); }}><b>All</b><em>{all}</em></button>
        {FLOW.map((f, i) => (
          <Fragment key={f.status}>
            {i ? <span className="sd-flow-arrow"><ChevronRight /></span> : <span className="sd-flow-sep" />}
            <button type="button" className={cn(`sd-flow-${f.tone}`, status === f.status && "active")} aria-pressed={status === f.status} onClick={() => pick(f.status)}>
              <span className="sd-flow-ic">{f.icon}</span><div><b>{f.label}</b><small>{f.sub}</small></div><em>{data?.counts[f.status] ?? 0}</em>
            </button>
          </Fragment>
        ))}
      </div>

      <div className="panel flush">
        <div className="panel-head">
          <div><h3>Challans</h3><p>Click a status in the flow above to filter. Actions advance the challan one step.</p></div>
          <div className="panel-actions">
            <label className="search-field"><Search /><input placeholder="Search challan, SO, customer, vehicle…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          </div>
        </div>
        {!data ? <Skeleton style={{ height: 320 }} /> : !items.length ? (
          <EmptyState icon={<Truck />} title={status || search ? "No challans match" : "No delivery challans yet"}
            description={status || search ? "Try another status or search." : "Create a challan against a confirmed sales order to dispatch goods."}
            action={can.create && !status && !search ? <Button variant="primary" icon={<Plus />} onClick={openNew}>New Challan</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Challan #</th><th>Sales Order</th><th>Customer</th><th className="num">Qty</th><th>Vehicle · Driver</th><th>Progress</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setDetailId(r.id); }}>
                  <td><b className="sd-mono"><Hl text={r.docNo} q={search} /></b><small>{dateLabel(r.docDate)}</small></td>
                  <td><Link className="link" href={`/sales/orders?so=${r.salesOrder.id}`}><Hl text={r.salesOrder.docNo} q={search} /></Link></td>
                  <td><b><Hl text={r.customer.name} q={search} /></b>{r.customer.city && <small>{r.customer.city}</small>}</td>
                  <td className="num">{fmt(r.totalQty)}</td>
                  <td><div className="sd-veh"><span className="sd-plate"><Hl text={r.vehicleNo} q={search} /></span><small>{r.driverName ? <Hl text={r.driverName} q={search} /> : "—"}</small></div></td>
                  <td><Step status={r.status} /></td>
                  <td><Badge tone={STATUS[r.status]?.tone} dot>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                  <td className="actions"><div className="sd-dc-acts">
                    {action(r)}
                    <button type="button" className="icon-btn-sm" aria-label={`More actions for ${r.docNo}`} onClick={(e) => rowMenu(r, e.currentTarget)}><Ellipsis /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {data && data.total > 0 && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + items.length} of {data.total} challan{data.total === 1 ? "" : "s"}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => <button key={p} type="button" className={cn(p === page && "active")} onClick={() => setPage(p)}>{p}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      <Menu anchor={menu?.anchor ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />

      <ChallanForm key={form.n} open={form.open} soId={form.soId} editing={form.editing} options={options}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(dc, edited) => {
          setForm((f) => ({ ...f, open: false }));
          if (!edited) { setStatus(""); setPage(1); }
          toast(edited ? `${dc.docNo} updated` : `${dc.docNo} created · ${fmt(dc.totalQty)} units packed for ${dc.customer.name}`, { tone: "good" });
          reload();
        }} />

      <ChallanDetail id={detailId} attempt={attempt} can={can} busy={busy} onClose={() => setDetailId(null)}
        onDispatch={setDispatchFor} onDeliver={setDeliverFor} onConvert={(r) => void convert(r)} onCancel={setCancelFor} onDelete={setDeleteFor} onEdit={(id) => void openEdit(id)} />

      <ConfirmDialog open={!!dispatchFor} busy={busy === dispatchFor?.id} title={`Mark ${dispatchFor?.docNo ?? ""} dispatched?`} confirmLabel="Mark dispatched" onClose={() => setDispatchFor(null)}
        onConfirm={() => { const r = dispatchFor!; setDispatchFor(null); void run(r, () => dispatchChallan(r.id, r.rowVersion), `${r.docNo} dispatched · ${r.vehicleNo} is on the way${r.driverName ? ` with ${r.driverName}` : ""}`); }}>
        Stock leaves {dispatchFor?.warehouse.name ?? "the warehouse"} at cost and the cost of goods sold is posted to the ledger.
      </ConfirmDialog>
      <DeliverModal key={`dl-${deliverFor?.id ?? "none"}`} row={deliverFor} busy={busy === deliverFor?.id} onClose={() => setDeliverFor(null)}
        onConfirm={(by) => { const r = deliverFor!; setDeliverFor(null); void run(r, () => deliverChallan(r.id, r.rowVersion, by || undefined), `${r.docNo} delivered · proof of delivery captured`); }} />
      <CancelModal key={`cx-${cancelFor?.id ?? "none"}`} row={cancelFor} busy={busy === cancelFor?.id} onClose={() => setCancelFor(null)}
        onConfirm={(reason) => { const r = cancelFor!; setCancelFor(null); void run(r, () => cancelChallan(r.id, r.rowVersion, reason), `${r.docNo} cancelled · stock returned to ${r.warehouse.name}`); }} />
      <ConfirmDialog open={!!deleteFor} danger busy={busy === deleteFor?.id} title={`Delete ${deleteFor?.docNo ?? "challan"}?`} confirmLabel="Delete challan" onClose={() => setDeleteFor(null)}
        onConfirm={() => { const r = deleteFor!; setDeleteFor(null); void run(r, () => deleteChallan(r.id, r.rowVersion), `${r.docNo} deleted`); }}>
        The goods were only packed; nothing has left the warehouse. The challan is removed.
      </ConfirmDialog>
    </>
  );
}

/** Mark delivered: optional "Received by" (proof of delivery). */
function DeliverModal({ row, busy, onClose, onConfirm }: { row: Row | null; busy: boolean; onClose: () => void; onConfirm: (receivedBy: string) => void }) {
  const [by, setBy] = useState("");
  return (
    <Modal open={!!row} onClose={onClose} title="Mark delivered" subtitle={row ? `${row.docNo} · ${row.customer.name}` : undefined} foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => onConfirm(by.trim())}><PackageCheck />Mark delivered</button></>
    }>
      <FormGrid cols={1}>
        <Field label="Received by" hint="Name of the person who signed the proof of delivery (optional)">
          <input value={by} maxLength={100} onChange={(e) => setBy(e.target.value)} placeholder="e.g. Store manager" />
        </Field>
      </FormGrid>
    </Modal>
  );
}

/** Cancel a dispatched / delivered challan: a reason is required. */
function CancelModal({ row, busy, onClose, onConfirm }: { row: Row | null; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={!!row} onClose={onClose} title="Cancel delivery challan" subtitle="The stock issue and its cost journal are reversed." foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Keep it</button>
        <button type="button" className="btn danger" disabled={busy || reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>Cancel challan</button></>
    }>
      <FormGrid cols={1}><Field label="Reason" required hint="At least 3 characters"><textarea rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer refused the goods at the door" /></Field></FormGrid>
    </Modal>
  );
}

/** Template dcNewDrawer: pick a sales order, vehicle and driver, tick the lines and quantities to deliver now. Also edits a packed challan. */
function ChallanForm({ open, soId: initialSo, editing, options, onClose, onSaved }: {
  open: boolean; soId: string | null; editing: DeliveryChallan | null; options: SalesDocOptions | null; onClose: () => void; onSaved: (dc: DeliveryChallan, edited: boolean) => void;
}) {
  const toast = useToast();
  const [orders, setOrders] = useState<DeliverableOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [soId, setSoId] = useState(initialSo ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [docDate, setDocDate] = useState(editing?.docDate ?? isoDay(new Date()));
  const [warehouseId, setWarehouseId] = useState(editing?.warehouse.id ?? "");
  const [vehicle, setVehicle] = useState(editing ? (options?.vans.find((v) => v.regNo === editing.vehicleNo)?.id ?? OTHER) : "");
  const [vehicleNo, setVehicleNo] = useState(editing?.vehicleNo ?? "");
  const [driver, setDriver] = useState(editing?.driverName ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /** Lines of an order: an edited challan's own lines first (their limit is ordered − previously delivered), then the order's other pending lines. */
  const linesFor = (o: DeliverableOrder | undefined): Line[] => {
    const own: Line[] = (editing?.lines ?? []).map((l) => ({
      soLineId: l.salesOrderLineId, name: l.item.name, sku: l.item.sku, ordered: l.orderedQty, delivered: l.previouslyDeliveredQty,
      pending: Math.max(0, l.orderedQty - l.previouslyDeliveredQty), on: true, qty: String(l.baseQty), batchId: l.batchId,
    }));
    const rest: Line[] = (o?.lines ?? []).filter((l) => !own.some((x) => x.soLineId === l.id)).map((l) => ({
      soLineId: l.id, name: l.item.name, sku: l.item.sku, ordered: l.ordered, delivered: l.delivered, pending: l.pending, on: !editing && l.pending > 0, qty: editing ? "0" : String(l.pending), batchId: null,
    }));
    return [...own, ...rest];
  };
  const choose = (id: string, list: DeliverableOrder[] | null = orders) => {
    const o = list?.find((x) => x.id === id);
    setSoId(id);
    setLines(linesFor(o));
    if (!editing) setWarehouseId(o?.warehouse?.id ?? "");
    setErrors({});
  };

  useEffect(() => {
    if (!open || orders) return;
    deliverableOrders().then((l) => {
      setOrders(l);
      const want = initialSo ?? editing?.salesOrder.id ?? "";
      const first = want || l[0]?.id || "";
      if (want && !editing && !l.some((o) => o.id === want)) toast("That sales order has nothing left to deliver, or is not confirmed yet", { tone: "warn" });
      choose(want && (editing || l.some((o) => o.id === want)) ? want : first, l);
    }).catch((e: unknown) => setLoadError(e instanceof ApiError ? e.message : "Could not load the open sales orders"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once per drawer open
  }, [open]);

  const order = orders?.find((o) => o.id === soId);
  const customer = order?.customer ?? editing?.customer ?? null;
  const sum = useMemo(() => {
    let n = 0, units = 0, bad = 0;
    for (const l of lines) {
      const v = num(l.qty);
      if (l.on && v > l.pending + 0.0005) bad++;
      if (l.on && v > 0) { n++; units += v; }
    }
    return { n, units, bad };
  }, [lines]);
  const setLine = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.soLineId === id ? { ...l, ...patch } : l)));
  const whId = warehouseId || order?.warehouse?.id || options?.warehouses[0]?.id || "";

  const save = async () => {
    const fe: Record<string, string> = {};
    if (!soId) fe.salesOrderId = "Choose a sales order";
    if (!vehicleNo.trim()) fe.vehicleNo = "Enter the vehicle no.";
    if (Object.keys(fe).length) { setErrors(fe); toast(fe.salesOrderId ?? "Enter the vehicle number", { tone: "warn" }); return; }
    if (sum.bad || !sum.n) { toast(sum.bad ? "Deliver quantity exceeds pending" : "Select at least one line", { tone: "warn" }); return; }
    const sent = lines.filter((l) => l.on && num(l.qty) > 0);
    const body = {
      salesOrderId: soId, docDate, warehouseId: whId || null, vehicleId: vehicle && vehicle !== OTHER ? vehicle : null, vehicleNo: vehicleNo.trim(),
      driverName: driver.trim() || null, lines: sent.map((l) => ({ salesOrderLineId: l.soLineId, qty: num(l.qty), batchId: l.batchId })),
    };
    setSaving(true);
    setErrors({});
    try {
      const dc = editing ? await updateChallan(editing.id, { ...body, rowVersion: editing.rowVersion }) : await createChallan(body);
      onSaved(dc, !!editing);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      const out: Record<string, string> = {};
      for (const [key, v] of Object.entries(err?.details ?? {})) {
        const m = /^lines\.(\d+)\.(\w+)$/.exec(key);
        const line = m ? sent[Number(m[1])] : null;
        out[line ? `line.${line.soLineId}` : key] = v[0] ?? "";
      }
      setErrors(out);
      toast(errText(e, "Could not save the challan"), { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const vans = options?.vans ?? [];
  return (
    <Drawer open={open} onClose={onClose} wide title={editing ? `Edit ${editing.docNo}` : "New delivery challan"}
      subtitle={editing ? "Packed, not yet dispatched · change vehicle, driver or quantities" : "Created from a sales order"}
      foot={<>
        <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <Button variant="primary" icon={<Truck />} disabled={saving || !orders} onClick={() => void save()}>{saving ? (editing ? "Saving…" : "Creating…") : editing ? "Save challan" : "Create challan"}</Button>
      </>}>
      {loadError ? <ErrorState message={loadError} /> : !orders ? <Skeleton style={{ height: 320 }} /> : !orders.length && !editing ? (
        <EmptyState icon={<Truck />} title="Nothing waiting to be delivered" description="Confirmed sales orders with quantities still to deliver show up here." />
      ) : (
        <div className="sd-dcn">
          <FormGrid>
            <Field label="Sales order" required full error={errors.salesOrderId}>
              <select value={soId} disabled={!!editing} onChange={(e) => choose(e.target.value)}>
                {!soId && <option value="">Choose a sales order…</option>}
                {orders.map((o) => <option key={o.id} value={o.id}>{o.docNo} · {o.customer.name}</option>)}
                {editing && !order && <option value={editing.salesOrder.id}>{editing.salesOrder.docNo} · {editing.customer.name}</option>}
              </select>
            </Field>
            <Field label="Challan date" required error={errors.docDate}><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></Field>
            <Field label="From warehouse" error={errors.warehouseId}>
              <select value={whId} onChange={(e) => setWarehouseId(e.target.value)}>
                {!whId && <option value="">Choose…</option>}
                {options?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Vehicle no" required error={errors.vehicleNo ?? errors.vehicleId}>
              {vans.length ? (
                <>
                  <select value={vehicle} onChange={(e) => {
                    const v = e.target.value;
                    setVehicle(v);
                    const van = vans.find((x) => x.id === v);
                    setVehicleNo(van ? van.regNo : "");
                  }}>
                    <option value="">Choose a vehicle…</option>
                    {vans.map((v) => <option key={v.id} value={v.id}>{v.regNo}{v.model ? ` · ${v.model}` : ""}</option>)}
                    <option value={OTHER}>Other vehicle…</option>
                  </select>
                  {vehicle === OTHER && <input style={{ marginTop: 8 }} value={vehicleNo} maxLength={30} placeholder="e.g. LES-4471" aria-label="Vehicle no" onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} />}
                </>
              ) : <input value={vehicleNo} maxLength={30} placeholder="e.g. LES-4471" onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} />}
            </Field>
            <Field label="Driver" error={errors.driverName}>
              <input value={driver} maxLength={100} list="dc-drivers" placeholder="Driver's name" onChange={(e) => setDriver(e.target.value)} />
              <datalist id="dc-drivers">{options?.users.map((u) => <option key={u.id} value={u.name} />)}</datalist>
            </Field>
          </FormGrid>

          {customer && (
            <div className="sd-dcn-cust">
              <span className="icon-well"><Building2 /></span>
              <div><b>{customer.name}</b><small>{[customer.address, customer.city, customer.phone].filter(Boolean).join(" · ") || customer.code}</small></div>
              <Badge tone="info">{lines.length} line{lines.length === 1 ? "" : "s"}</Badge>
            </div>
          )}
          <div className="sd-dcn-h"><b>Lines to deliver</b><small>Uncheck a line to leave it for a later challan</small></div>
          {errors.lines && <small className="dc-err" style={{ textAlign: "left", marginBottom: 6 }}>{errors.lines}</small>}
          <div className="table-wrap sd-dcn-wrap"><table className="tbl lines" data-plain="">
            <thead><tr><th /><th>Item</th><th className="num">Ordered</th><th className="num">Delivered</th><th className="num">Pending</th><th className="num">Deliver now</th></tr></thead>
            <tbody>
              {!lines.length ? (
                <tr><td colSpan={6}><EmptyState icon={<Package />} title="No lines to deliver" description="Every product line of this order is fully delivered." /></td></tr>
              ) : lines.map((l) => {
                const v = num(l.qty), over = l.on && v > l.pending + 0.0005, err = errors[`line.${l.soLineId}`];
                return (
                  <tr key={l.soLineId} className={cn(!l.on && "sd-off")}>
                    <td><input type="checkbox" aria-label={`Deliver ${l.name}`} checked={l.on} disabled={l.pending <= 0} onChange={(e) => setLine(l.soLineId, { on: e.target.checked, ...(e.target.checked && num(l.qty) <= 0 && { qty: String(l.pending) }) })} /></td>
                    <td><b>{l.name}</b><small>{l.sku}</small></td>
                    <td className="num">{fmt(l.ordered)}</td>
                    <td className="num">{fmt(l.delivered)}</td>
                    <td className="num"><b>{fmt(l.pending)}</b></td>
                    <td>
                      <input className={cn("cell-input num", (over || !!err) && "sd-bad")} inputMode="decimal" value={l.qty} disabled={l.pending <= 0 || !l.on} aria-label={`Deliver now · ${l.name}`}
                        onChange={(e) => setLine(l.soLineId, { qty: e.target.value })} />
                      {err && <span className="dc-err">{err}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <div className="sd-dcn-sum">
            <span><b>{sum.n}</b> lines</span><span><b>{fmt(sum.units)}</b> units</span>
            {sum.bad ? <span className="sd-warn-t"><TriangleAlert />More than pending on {sum.bad} line(s)</span> : <span className="sd-ok-t"><CircleCheck />Ready to dispatch</span>}
          </div>
        </div>
      )}
    </Drawer>
  );
}

/** Challan details: lines with cost, journal, linked invoice, history; footer runs the next step. */
function ChallanDetail({ id, attempt, can, busy, onClose, onDispatch, onDeliver, onConvert, onCancel, onDelete, onEdit }: {
  id: string | null; attempt: number; can: Can; busy: string | null; onClose: () => void; onDispatch: (r: Row) => void; onDeliver: (r: Row) => void; onConvert: (r: Row) => void;
  onCancel: (r: Row) => void; onDelete: (r: Row) => void; onEdit: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState<DeliveryChallan | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [tab, setTab] = useState<"lines" | "history">("lines");
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getChallan(id).then((x) => !cancelled && setLoaded(x)).catch((e: unknown) => !cancelled && setFailed({ id, message: e instanceof ApiError ? e.message : "Could not load the challan" }));
    return () => { cancelled = true; };
  }, [id, attempt]);
  const d = loaded && loaded.id === id ? loaded : null;
  const err = !d && failed?.id === id ? failed.message : null;
  const b = !!d && busy === d.id;
  const close = (fn: (r: Row) => void) => () => { if (d) { onClose(); fn(d); } };
  return (
    <Drawer open={!!id} onClose={onClose} wide title={d ? `${d.docNo} · ${d.customer.name}` : "Delivery challan"}
      subtitle={d ? `${dateLabel(d.docDate)} · ${d.warehouse.name} · ${d.salesOrder.docNo}` : undefined}
      foot={d && (
        <>
          {d.status === "PACKED" && can.delete && <Button variant="ghost" icon={<Trash2 />} disabled={b} onClick={close(onDelete)}>Delete</Button>}
          {(d.status === "DISPATCHED" || d.status === "DELIVERED") && can.post && <Button variant="ghost" icon={<X />} disabled={b} onClick={close(onCancel)}>Cancel challan</Button>}
          <span className="spacer" />
          {d.status === "PACKED" && can.edit && <Button icon={<Pencil />} disabled={b} onClick={() => onEdit(d.id)}>Edit</Button>}
          {d.status === "PACKED" && can.post && <Button variant="primary" icon={<Truck />} disabled={b} onClick={close(onDispatch)}>Mark dispatched</Button>}
          {d.status === "DISPATCHED" && can.edit && <Button variant="primary" icon={<PackageCheck />} disabled={b} onClick={close(onDeliver)}>Mark delivered</Button>}
          {d.status === "DELIVERED" && can.create && <Button variant="primary" icon={<ReceiptText />} disabled={b} onClick={() => onConvert(d)}>{b ? "Converting…" : "Convert to invoice"}</Button>}
          {d.invoice && <Link className="btn secondary" href={`/sales/invoices/${d.invoice.id}`}><FileText />View invoice</Link>}
        </>
      )}>
      {err ? <ErrorState message={err} /> : !d ? <Skeleton style={{ height: 300 }} /> : (
        <>
          <div className="row mb" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Badge tone={STATUS[d.status]?.tone} dot>{STATUS[d.status]?.label ?? d.status}</Badge>
            <Step status={d.status} />
            <div className="sd-veh" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><span className="sd-plate">{d.vehicleNo}</span><small>{d.driverName ?? ""}</small></div>
          </div>
          <Tabs items={[{ key: "lines", label: "Lines" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
          <div className="mt" />
          {tab === "history" ? <HistoryTab schema="Sales" table="DeliveryChallans" id={d.id} /> : (
            <>
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Previously</th><th className="num">This challan</th><th className="num">Unit cost</th><th className="num">Cost</th></tr></thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id}>
                      <td><b>{l.item.name}</b><small>{l.item.sku}</small></td>
                      <td className="num">{fmt(l.orderedQty)}</td>
                      <td className="num">{fmt(l.previouslyDeliveredQty)}</td>
                      <td className="num"><b>{fmt(l.baseQty)}</b></td>
                      <td className="num">{l.unitCost === null ? <span className="muted">—</span> : l.unitCost.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                      <td className="num">{l.unitCost === null ? <span className="muted">at dispatch</span> : rs(l.costAmount)}</td>
                    </tr>
                  ))}
                  <tr className="total"><td colSpan={3}>Total</td><td className="num">{fmt(d.totalQty)}</td><td /><td className="num">{d.costAmount ? rs(d.costAmount) : "—"}</td></tr>
                </tbody>
              </table></div>
              <div className="dl mt">
                <div><span>Sales order</span><b><Link href={`/sales/orders?so=${d.salesOrder.id}`}>{d.salesOrder.docNo}</Link></b></div>
                <div><span>Deliver to</span><b>{[d.customer.address, d.customer.city].filter(Boolean).join(", ") || "—"}{d.customer.phone ? ` · ${d.customer.phone}` : ""}</b></div>
                <div><span>Dispatched</span><b>{d.dispatchedAt ? dateLabel(d.dispatchedAt) : "—"}</b></div>
                <div><span>Delivered</span><b>{d.deliveredAt ? `${dateLabel(d.deliveredAt)}${d.receivedBy ? ` · received by ${d.receivedBy}` : ""}` : "—"}</b></div>
                <div><span>Invoice</span><b>{d.invoice ? <Link href={`/sales/invoices/${d.invoice.id}`}>{d.invoice.docNo}</Link> : "—"}</b></div>
                <div><span>Cost journal</span><b>{d.journal ? <Link href={`/accounting/vouchers/${d.journal.id}`}>{d.journal.docNo}</Link> : "—"}</b></div>
                {d.remarks && <div><span>Remarks</span><b>{d.remarks}</b></div>}
                {d.cancelledAt && <div><span>Cancelled</span><b>{dateLabel(d.cancelledAt)}</b></div>}
                <div><span>Created by</span><b>{d.createdBy?.name ?? "—"}</b></div>
              </div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
