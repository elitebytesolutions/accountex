"use client";

import { Ban, CircleCheck, ClipboardList, Download, Eye, FilePen, Filter, Lock, MoreHorizontal, Pause, Pencil, Plus, ReceiptText, Search, ShieldCheck, TriangleAlert, Trash2, Truck, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { docTotals, type ApprovalDetail, type ApprovalStep, type CustomerCredit, type SalesDocOptions, type SalesOrder, type SalesOrderList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  approveSalesOrder, cancelSalesOrder, closeSalesOrder, createSalesOrder, customerCredit, deleteSalesOrder, getSalesOrder, listSalesOrders, rejectSalesOrder,
  salesDocOptions, salesOrderAction, updateSalesOrder,
} from "../api";
import {
  amt, daysBetween, DocTotalsBlock, editLines, effectiveList, errMsg, fieldErrors, fmtQty, initials, LinesTable, linesCalc, linesPayload, ReasonModal, rs, SalesLinesGrid,
  type EditLine,
} from "./quotations-screen";

type Can = { create: boolean; edit: boolean; delete: boolean; approve: boolean; overrideCredit: boolean; challan: boolean };
type Row = SalesOrderList["items"][number];
type Routing = { workflow: { id: string; name: string }; steps: ApprovalStep[] } | null;
const PAGE = 10;
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, PENDING_APPROVAL: { label: "Pending Approval", tone: "warn" }, CONFIRMED: { label: "Confirmed", tone: "info" },
  PARTIALLY_DELIVERED: { label: "Partially Delivered", tone: "warn" }, TO_INVOICE: { label: "To Invoice", tone: "violet" }, INVOICED: { label: "Invoiced", tone: "good" },
  ON_HOLD: { label: "On Hold", tone: "danger" }, CLOSED: { label: "Closed", tone: "neutral" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const CHIPS = [
  { label: "All", status: "" }, { label: "Confirmed", status: "CONFIRMED" }, { label: "Partially Delivered", status: "PARTIALLY_DELIVERED" },
  { label: "To Invoice", status: "TO_INVOICE" }, { label: "Invoiced", status: "INVOICED" }, { label: "Cancelled", status: "CANCELLED" },
];
const MORE_STATUSES = ["DRAFT", "PENDING_APPROVAL", "ON_HOLD", "CLOSED"];
const chipCount = (c: Record<string, number>, s: string) => (s ? c[s] ?? 0 : Object.values(c).reduce((t, n) => t + n, 0));
const DELIVERABLE = ["CONFIRMED", "PARTIALLY_DELIVERED"];
const CREDIT_CODES = ["CREDIT_LIMIT_EXCEEDED", "CUSTOMER_ON_HOLD"];

function SoStatus({ so }: { so: Row }) {
  const s = so.late ? { label: "Late", tone: "danger" as Tone } : STATUS[so.status] ?? { label: so.status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

function FulfilmentCell({ so, today }: { so: Row; today: string }) {
  const lateBy = so.late && so.expectedDeliveryDate ? daysBetween(so.expectedDeliveryDate, today) : 0;
  const note = so.late ? `${lateBy} day${lateBy === 1 ? "" : "s"} late`
    : so.status === "DRAFT" ? "Not confirmed" : so.status === "PENDING_APPROVAL" ? "Awaiting approval" : so.status === "CANCELLED" ? "Cancelled"
    : so.status === "ON_HOLD" ? "Blocked — credit hold" : so.status === "INVOICED" ? "Fully invoiced" : so.status === "TO_INVOICE" ? "Delivered, not invoiced"
    : so.status === "CLOSED" ? `Closed · ${so.deliveredPct}% delivered` : so.deliveredPct === 0 ? "Nothing delivered yet" : `${so.deliveredPct}% delivered`;
  return (
    <>
      <div className={cn("progress", so.late ? "danger" : so.status === "ON_HOLD" && "warn")}><i style={{ width: `${so.deliveredPct}%` }} /></div>
      {so.late ? <small style={{ color: "var(--danger)" }}>{note}</small> : <small className="muted">{note}</small>}
    </>
  );
}

type Ask = { kind: "reject" | "cancel" | "close"; so: Row } | null;

/** Template app/sales/orders (41-acc-trade.html): KPIs, status chips, orders table with fulfilment progress; New Order modal and detail drawer modelled on purchase orders. */
export function SalesOrdersScreen({ can, userId }: { can: Can; userId: string }) {
  const toast = useToast();
  const params = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SalesOrderList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<SalesDocOptions | null>(null);
  const [optErr, setOptErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => params.get("so"));
  const [editor, setEditor] = useState<{ so: SalesOrder | null } | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [rev, setRev] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const today = isoDay(new Date());

  useEffect(() => {
    salesDocOptions().then(setOptions).catch((e: unknown) => setOptErr(errMsg(e, "Could not load customers and products")));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listSalesOrders({ status, search, warehouse, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); setSelected(new Set()); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load sales orders" }));
    return () => { cancelled = true; };
  }, [status, search, warehouse, page, attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const k = data?.kpis;
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const all = data ? chipCount(data.counts, "") : 0;
  const filtered = !!(status || search || warehouse);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exportCsv = () => {
    const rows = selected.size ? items.filter((x) => selected.has(x.id)) : items;
    downloadCsv(`sales-orders-${today}.csv`, [
      ["Order #", "Customer PO", "Quotation", "Customer", "Sales rep", "Order date", "Delivery date", "Warehouse", "Delivered %", "Invoiced %", "Amount", "Status"],
      ...rows.map((x) => [x.docNo, x.customerPoRef ?? "", x.quotation?.docNo ?? "", x.customer.name, x.salesRep?.name ?? "", x.docDate, x.expectedDeliveryDate ?? "", x.warehouse?.name ?? "",
        x.deliveredPct, x.invoicedPct, x.netAmount, STATUS[x.status]?.label ?? x.status]),
    ]);
  };
  const openEdit = async (id: string) => {
    try { setEditor({ so: await getSalesOrder(id) }); } catch (e) { toast(errMsg(e, "Could not load the order"), { tone: "danger" }); }
  };
  const rowMenu = (x: Row): MenuItem[] => [
    { label: "Open", icon: <Eye />, onClick: () => setOpenId(x.id) },
    ...(x.status === "DRAFT" && can.delete ? [{ label: "Delete draft", icon: <Trash2 />, danger: true, onClick: () => setDel(x) }] : []),
    ...([...DELIVERABLE, "ON_HOLD"].includes(x.status) && can.edit ? [
      { label: "Close order", icon: <Lock />, onClick: () => setAsk({ kind: "close", so: x }) },
      { label: "Cancel order", icon: <Ban />, danger: true, onClick: () => setAsk({ kind: "cancel", so: x }) },
    ] : []),
  ];
  const filterMenu = (anchor: HTMLElement) => setMenu({
    anchor, items: [
      ...MORE_STATUSES.map((s) => ({ label: `${STATUS[s]!.label}${data ? ` (${data.counts[s] ?? 0})` : ""}`, icon: s === "ON_HOLD" ? <Pause /> : s === "CLOSED" ? <Lock /> : s === "PENDING_APPROVAL" ? <ShieldCheck /> : <FilePen />, onClick: () => { setStatus(s); setPage(1); } })),
      { sep: true },
      { label: "Clear filters", icon: <X />, onClick: () => { setStatus(""); setWarehouse(""); setQ(""); setPage(1); } },
    ],
  });
  const extraFilter = MORE_STATUSES.includes(status);

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Sales / Orders"
        title="Sales Orders"
        description="Confirmed customer orders, fulfilment status and invoicing progress."
        actions={
          <>
            <Button icon={<Download />} onClick={exportCsv} disabled={!items.length}>{selected.size ? `Export (${selected.size})` : "Export"}</Button>
            <ButtonLink icon={<FilePen />} href="/sales/quotations">From Quotation</ButtonLink>
            {can.create && <Button variant="primary" icon={<Plus />} disabled={!options} onClick={() => setEditor({ so: null })}>New Order</Button>}
          </>
        }
      />
      {optErr && <Banner tone="warn" title="Some lists didn’t load">{optErr} — creating and editing orders is unavailable until you reload.</Banner>}

      <div className="kpi-grid c5 mb">
        <div className="kpi blue"><div className="kpi-top"><span>Open Orders</span><span className="icon-well"><ClipboardList /></span></div><strong>{k?.open ?? "—"}</strong><small>{k ? `${rs(k.openAmount)} value` : " "}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>To Deliver</span><span className="icon-well"><Truck /></span></div><strong>{k?.toDeliver ?? "—"}</strong><small>{k ? `${k.dueThisWeek} due this week` : " "}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>To Invoice</span><span className="icon-well"><ReceiptText /></span></div><strong>{k ? rs(k.toInvoiceAmount) : "—"}</strong><small>Delivered, not billed</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Late Deliveries</span><span className="icon-well"><TriangleAlert /></span></div><strong>{k?.late ?? "—"}</strong><small className={cn(!!k?.late && "down")}>Past promised date</small></div>
        <div className="kpi"><div className="kpi-top"><span>On-time Fulfilment</span><span className="icon-well"><CircleCheck /></span></div><strong>{k ? (k.onTimePct === null ? "—" : `${k.onTimePct}%`) : "—"}</strong><small>Delivered by the promised date</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>All sales orders</h3><p>{data ? `${all} order${all === 1 ? "" : "s"}` : "Loading…"}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search SO #, customer, PO ref…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <select value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setPage(1); }} aria-label="Warehouse">
            <option value="">All warehouses</option>
            {options?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="chips">
            {CHIPS.map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); }}>{c.label} <i>{data ? chipCount(data.counts, c.status) : 0}</i></button>)}
          </div>
          <span className="spacer" />
          <Button size="sm" icon={<Filter />} className={cn(extraFilter && "active")} onClick={(e) => filterMenu(e.currentTarget)}>{extraFilter ? `Filters · ${STATUS[status]!.label}` : "Filters"}</Button>
        </div>
        {!data ? <Skeleton style={{ height: 420 }} /> : !items.length ? (
          <EmptyState icon={<ClipboardList />} title={filtered ? "No orders match" : "No sales orders yet"} description={filtered ? "Try another status, warehouse or search." : "Create an order directly or convert an accepted quotation."}
            action={!filtered && can.create && options ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ so: null })}>New Order</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all" checked={items.every((x) => selected.has(x.id))} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((x) => x.id)) : new Set())} /></th>
              <th>Order #</th><th>Customer</th><th>Order Date</th><th>Delivery Date</th><th>Warehouse</th><th style={{ width: 170 }}>Fulfilment</th><th className="num">Amount (Rs)</th><th>Status</th><th />
            </tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td><input type="checkbox" aria-label={`Select ${x.docNo}`} checked={selected.has(x.id)} onChange={() => toggle(x.id)} /></td>
                  <td><a className="link" href={`/sales/orders?so=${x.id}`} onClick={(e) => { e.preventDefault(); setOpenId(x.id); }}><Hl text={x.docNo} q={search} /></a>
                    <small>{x.customerPoRef ? <>PO: <Hl text={x.customerPoRef} q={search} /></> : x.quotation ? `From ${x.quotation.docNo}` : "—"}</small></td>
                  <td><div className="cell-user"><span className="avatar sm">{initials(x.customer.name)}</span><div><b><Hl text={x.customer.name} q={search} /></b><small>{x.salesRep?.name ?? "—"}</small></div></div></td>
                  <td>{dateLabel(x.docDate)}</td>
                  <td>{x.expectedDeliveryDate ? dateLabel(x.expectedDeliveryDate) : "—"}</td>
                  <td>{x.warehouse?.name ?? "—"}</td>
                  <td><FulfilmentCell so={x} today={today} /></td>
                  <td className="num">{amt(x.netAmount)}</td>
                  <td><SoStatus so={x} /></td>
                  <td className="actions">
                    {x.status === "DRAFT" ? (
                      <>
                        {can.edit && <button type="button" className="icon-btn-sm" aria-label={`Edit ${x.docNo}`} disabled={!options} onClick={() => openEdit(x.id)}><Pencil /></button>}
                        <button type="button" className="icon-btn-sm" aria-label={`More actions for ${x.docNo}`} onClick={(e) => setMenu({ anchor: e.currentTarget, items: rowMenu(x) })}><MoreHorizontal /></button>
                      </>
                    ) : x.status === "PENDING_APPROVAL" ? (
                      <Button size="sm" variant="primary" onClick={() => setOpenId(x.id)}>Review</Button>
                    ) : DELIVERABLE.includes(x.status) ? (
                      <>
                        {can.challan && <Link className="icon-btn-sm" aria-label={`Create challan for ${x.docNo}`} title="Create delivery challan" href={`/sales/challans?new=${x.id}`}><Truck /></Link>}
                        <button type="button" className="icon-btn-sm" aria-label={`More actions for ${x.docNo}`} onClick={(e) => setMenu({ anchor: e.currentTarget, items: rowMenu(x) })}><MoreHorizontal /></button>
                      </>
                    ) : x.status === "TO_INVOICE" && can.challan ? (
                      <ButtonLink size="sm" icon={<ReceiptText />} href={`/sales/challans?so=${x.id}`}>Invoice</ButtonLink>
                    ) : x.status === "INVOICED" ? (
                      <Button size="sm" variant="ghost" icon={<Eye />} onClick={() => setOpenId(x.id)}>Invoice</Button>
                    ) : x.status === "ON_HOLD" ? (
                      <Button size="sm" variant="ghost" icon={<ShieldCheck />} onClick={() => setOpenId(x.id)}>Review</Button>
                    ) : (
                      <button type="button" className="icon-btn-sm" aria-label={`Open ${x.docNo}`} onClick={() => setOpenId(x.id)}><Eye /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {data && data.total > 0 && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + items.length} of {data.total}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => Math.min(Math.max(1, page - 2), Math.max(1, pages - 4)) + i).map((x) => <button key={x} type="button" className={cn(x === page && "active")} onClick={() => setPage(x)}>{x}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}
      <SoDrawer key={`${openId ?? "none"}-${rev}`} id={openId} can={can} userId={userId} options={options} onClose={() => setOpenId(null)} onEdit={(so) => { setOpenId(null); setEditor({ so }); }}
        onAsk={setAsk} onDelete={setDel} onChanged={reload} />
      {editor && options && (
        <SoEditor so={editor.so} options={options} canApprove={can.approve} onClose={() => setEditor(null)}
          onSaved={(so, msg, tone) => { setEditor(null); toast(msg, { tone: tone ?? "good" }); setOpenId(so.id); reload(); }} />
      )}
      <ReasonModal key={ask ? `${ask.kind}-${ask.so.id}` : "none"} open={!!ask}
        title={ask ? `${ask.kind === "reject" ? "Reject" : ask.kind === "close" ? "Close" : "Cancel"} ${ask.so.docNo}` : ""}
        subtitle={ask?.kind === "reject" ? "The order returns to its preparer as a draft." : ask?.kind === "close" ? "Closes the order short: undelivered quantities are released and no more challans can be made." : "Only an order nothing was delivered against can be cancelled. Reserved stock is released."}
        label={ask?.kind === "reject" ? "What should change?" : ask?.kind === "close" ? "Why is this order closed short? (optional)" : "Why is this order cancelled?"}
        confirm={ask?.kind === "reject" ? "Reject" : ask?.kind === "close" ? "Close order" : "Cancel order"} optional={ask?.kind === "close"}
        onClose={() => setAsk(null)}
        run={async (reason) => {
          if (!ask) return;
          const r = ask.kind === "reject" ? await rejectSalesOrder(ask.so.id, reason)
            : ask.kind === "close" ? await closeSalesOrder(ask.so.id, ask.so.rowVersion, reason || undefined) : await cancelSalesOrder(ask.so.id, ask.so.rowVersion, reason);
          const kind = ask.kind;
          setAsk(null);
          toast(kind === "reject" ? `${r.docNo} rejected · back to the preparer` : `${r.docNo} ${kind === "close" ? "closed" : "cancelled"}`, { tone: "good" });
          setRev((n) => n + 1);
          reload();
        }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger busy={busy} title={`Delete ${del?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={async () => {
          if (!del) return;
          setBusy(true);
          try { await deleteSalesOrder(del.id, del.rowVersion); toast(`${del.docNo} deleted`, { tone: "good" }); setDel(null); setOpenId(null); reload(); }
          catch (e) { toast(errMsg(e, "Could not delete the order"), { tone: "danger" }); }
          finally { setBusy(false); }
        }}>
        The draft and its lines are removed. Its number is not reused.
      </ConfirmDialog>
    </>
  );
}

// ---------------------------------------------------------------- editor
type Head = {
  customerId: string; docDate: string; warehouseId: string; expectedDeliveryDate: string; customerPoRef: string; customerPoDate: string; salesRepUserId: string; priceListId: string;
  paymentTerms: string; reserveStock: boolean; remarks: string;
};

function CreditBanner({ credit, total }: { credit: CustomerCredit; total: number }) {
  const after = credit.available - total;
  const tone = credit.status === "ON_HOLD" || credit.holdReason ? "danger" : after < 0 ? "warn" : "info";
  const title = tone === "danger" ? "Customer is on credit hold" : after < 0 ? "This order goes over the credit limit" : "Credit available";
  return (
    <div className="mb">
      <Banner tone={tone} title={title}>
        Limit {rs(credit.effectiveLimit)} · balance {rs(credit.balance)}{credit.overdueAmount > 0 ? ` (overdue ${rs(credit.overdueAmount)})` : ""} · open orders {rs(credit.openOrdersAmount)} · available {rs(credit.available)}
        {credit.holdReason ? ` — ${credit.holdReason}` : ""}{tone !== "info" ? (credit.blockOverLimit ? ". Confirmation is blocked unless a credit override is approved." : ". Confirmation will warn.") : ""}
      </Banner>
    </div>
  );
}

function SoEditor({ so, options: o, canApprove, onClose, onSaved }: {
  so: SalesOrder | null; options: SalesDocOptions; canApprove: boolean; onClose: () => void; onSaved: (so: SalesOrder, msg: string, tone?: "good" | "warn") => void;
}) {
  const [h, setH] = useState<Head>(() => ({
    customerId: so?.customer.id ?? "", docDate: so?.docDate ?? isoDay(new Date()), warehouseId: so?.warehouse?.id ?? o.warehouses[0]?.id ?? "",
    expectedDeliveryDate: so?.expectedDeliveryDate ?? "", customerPoRef: so?.customerPoRef ?? "", customerPoDate: so?.customerPoDate ?? "", salesRepUserId: so?.salesRep?.id ?? "",
    priceListId: so?.priceList?.id ?? "", paymentTerms: so?.paymentTerms ?? o.paymentTerms[0]?.code ?? "", reserveStock: so?.reserveStock ?? true, remarks: so?.remarks ?? "",
  }));
  const [lines, setLines] = useState<EditLine[]>(() => editLines(so?.lines));
  const [credit, setCredit] = useState<CustomerCredit | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const set = (patch: Partial<Head>) => setH((x) => ({ ...x, ...patch }));
  const fe = (k: string) => err?.fields[k];
  const listId = effectiveList(o, h.priceListId, h.customerId);
  const cust = o.customers.find((c) => c.id === h.customerId);
  const custList = cust?.priceListId ? o.priceLists.find((p) => p.id === cust.priceListId) : o.priceLists.find((p) => p.isDefault);
  const total = docTotals(linesCalc(lines)).totalAmount;

  useEffect(() => {
    if (!h.customerId) return;
    let cancelled = false;
    customerCredit(h.customerId).then((c) => !cancelled && setCredit(c)).catch(() => !cancelled && setCredit(null));
    return () => { cancelled = true; };
  }, [h.customerId]);

  const pickCustomer = (id: string) => {
    const c = o.customers.find((x) => x.id === id);
    if (!id) setCredit(null);
    const wh = c?.branchId ? o.warehouses.find((w) => w.branchId === c.branchId)?.id : undefined;
    set({
      customerId: id, ...(c && { paymentTerms: c.paymentTerms }), ...(c?.salesRepUserId && !h.salesRepUserId && { salesRepUserId: c.salesRepUserId }),
      ...(wh && !so && { warehouseId: wh }),
    });
  };

  const save = async (confirm: boolean) => {
    setBusy(true);
    setErr(null);
    const body = {
      customerId: h.customerId, docDate: h.docDate, warehouseId: h.warehouseId, expectedDeliveryDate: h.expectedDeliveryDate || null, customerPoRef: h.customerPoRef || null,
      customerPoDate: h.customerPoDate || null, salesRepUserId: h.salesRepUserId || null, priceListId: h.priceListId || null, paymentTerms: h.paymentTerms,
      reserveStock: h.reserveStock, remarks: h.remarks || null, lines: linesPayload(lines), ...(so && { rowVersion: so.rowVersion }),
    };
    let saved: SalesOrder;
    try {
      saved = so ? await updateSalesOrder(so.id, body) : await createSalesOrder(body);
    } catch (e) {
      setErr(fieldErrors(e, "Could not save the sales order"));
      setBusy(false);
      return;
    }
    if (!confirm) { setBusy(false); onSaved(saved, `${saved.docNo} saved as draft`); return; }
    try {
      if (saved.routing) {
        saved = await salesOrderAction(saved.id, "submit", saved.rowVersion);
        onSaved(saved, `${saved.docNo} submitted for approval`);
      } else if (canApprove) {
        saved = await approveSalesOrder(saved.id);
        onSaved(saved, `${saved.docNo} confirmed`);
      } else onSaved(saved, `${saved.docNo} saved — no approval workflow applies; a user with order approval confirms it`, "warn");
    } catch (e) {
      onSaved(saved, `${saved.docNo} saved as draft — not confirmed: ${errMsg(e, "confirmation failed")}`, "warn");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} xl title={so ? `Edit ${so.docNo}` : "New Sales Order"} subtitle={so ? `${so.customer.name} · draft` : "Auto-numbered on save · routed for approval when a workflow applies"} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn secondary" onClick={() => save(false)} disabled={busy}>Save draft</button>
        <button type="button" className="btn primary" onClick={() => save(true)} disabled={busy}>{busy ? "Saving…" : canApprove ? "Save & confirm" : "Save & submit"}</button>
      </>
    }>
      {err && <div className="mb"><Banner tone="danger" title="Not saved">{err.message}</Banner></div>}
      {credit && h.customerId && <CreditBanner credit={credit} total={total} />}
      <FormGrid cols={3}>
        <Field label="Customer" required error={fe("customerId")}>
          <select value={h.customerId} onChange={(e) => pickCustomer(e.target.value)}><option value="">Choose…</option>{o.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label="Order date" required error={fe("docDate")}><input type="date" value={h.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
        <Field label="Ship from warehouse" required error={fe("warehouseId")}>
          <select value={h.warehouseId} onChange={(e) => set({ warehouseId: e.target.value })}><option value="">Choose…</option>{o.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </Field>
        <Field label="Expected delivery" error={fe("expectedDeliveryDate")}><input type="date" value={h.expectedDeliveryDate} onChange={(e) => set({ expectedDeliveryDate: e.target.value })} /></Field>
        <Field label="Customer PO reference" error={fe("customerPoRef")}><input value={h.customerPoRef} maxLength={60} onChange={(e) => set({ customerPoRef: e.target.value })} /></Field>
        <Field label="Customer PO date" error={fe("customerPoDate")}><input type="date" value={h.customerPoDate} onChange={(e) => set({ customerPoDate: e.target.value })} /></Field>
        <Field label="Sales rep" error={fe("salesRepUserId")}>
          <select value={h.salesRepUserId} onChange={(e) => set({ salesRepUserId: e.target.value })}><option value="">Me</option>{o.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </Field>
        <Field label="Price list" error={fe("priceListId")}>
          <select value={h.priceListId} onChange={(e) => set({ priceListId: e.target.value })}>
            <option value="">{custList ? `Customer default · ${custList.name}` : "Product prices"}</option>
            {o.priceLists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Payment terms" required error={fe("paymentTerms")}>
          <select value={h.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })}><option value="">Choose…</option>{o.paymentTerms.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select>
        </Field>
        <Check label="Reserve stock on confirmation" checked={h.reserveStock} onChange={(e) => set({ reserveStock: e.target.checked })} />
      </FormGrid>
      <SalesLinesGrid o={o} lines={lines} setLines={setLines} listId={listId} fe={fe} bonus discount />
      <DocTotalsBlock lines={lines} label="Order total" />
      <FormGrid cols={1}>
        <Field label="Remarks / delivery instructions" error={fe("remarks")}><textarea rows={2} value={h.remarks} onChange={(e) => set({ remarks: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}

// ---------------------------------------------------------------- detail drawer
type Tab = "details" | "approval" | "history";

function SoDrawer({ id, can, userId, options, onClose, onEdit, onAsk, onDelete, onChanged }: {
  id: string | null; can: Can; userId: string; options: SalesDocOptions | null; onClose: () => void; onEdit: (so: SalesOrder) => void; onAsk: (a: Ask) => void;
  onDelete: (so: Row) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [creditBlock, setCreditBlock] = useState<string | null>(null);
  const [n2, setN2] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getSalesOrder(id).then((x) => !cancelled && setSo(x)).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the order")));
    return () => { cancelled = true; };
  }, [id, n2]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast(label, { tone: "good" }); setN2((x) => x + 1); onChanged(); } catch (e) { toast(errMsg(e, "That didn’t work"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const confirm = async (override: boolean) => {
    if (!so) return;
    setBusy(true);
    try {
      await approveSalesOrder(so.id, { overrideCredit: override });
      setCreditBlock(null);
      toast(`${so.docNo} confirmed${override ? " with a credit override" : ""}`, { tone: "good" });
      setN2((x) => x + 1);
      onChanged();
    } catch (e) {
      if (!override && e instanceof ApiError && CREDIT_CODES.includes(e.code) && can.overrideCredit) setCreditBlock(e.message);
      else { setCreditBlock(null); toast(errMsg(e, "Could not confirm the order"), { tone: "danger" }); }
    } finally {
      setBusy(false);
    }
  };

  const ap = (so?.approval ?? null) as ApprovalDetail | null;
  const routing = (so?.routing ?? null) as Routing;
  const steps: ApprovalStep[] = ap?.steps ?? routing?.steps ?? [];
  const pending = so?.status === "PENDING_APPROVAL";
  const mine = so?.createdBy?.id === userId;
  const s = so ? STATUS[so.status] ?? { label: so.status, tone: "neutral" as Tone } : null;
  const terms = (code: string | null) => options?.paymentTerms.find((p) => p.code === code)?.label ?? code?.replace(/_/g, " ") ?? "—";

  const actions = so ? (
    <>
      {so.status === "DRAFT" && can.edit && <Button disabled={busy || !options} icon={<Pencil />} onClick={() => onEdit(so)}>Edit</Button>}
      {so.status === "DRAFT" && can.delete && <Button disabled={busy} icon={<Trash2 />} onClick={() => onDelete(so)}>Delete</Button>}
      {[...DELIVERABLE, "ON_HOLD"].includes(so.status) && can.edit && <Button disabled={busy} onClick={() => onAsk({ kind: "cancel", so })}>Cancel order</Button>}
      {[...DELIVERABLE, "ON_HOLD"].includes(so.status) && can.edit && <Button disabled={busy} icon={<Lock />} onClick={() => onAsk({ kind: "close", so })}>Close</Button>}
      {pending && (mine || can.create) && <Button disabled={busy} onClick={() => run(`${so.docNo} recalled to draft`, () => salesOrderAction(so.id, "recall", so.rowVersion))}>Recall</Button>}
      {pending && so.canAct && <Button disabled={busy} onClick={() => onAsk({ kind: "reject", so })}>Reject</Button>}
      {pending && so.canAct && <Button variant="primary" disabled={busy} onClick={() => run(`${so.docNo} approved`, () => approveSalesOrder(so.id))}>Approve</Button>}
      {so.status === "DRAFT" && routing && can.create && <Button variant="primary" disabled={busy} onClick={() => run(`${so.docNo} submitted to ${routing.workflow.name}`, () => salesOrderAction(so.id, "submit", so.rowVersion))}>Submit for approval</Button>}
      {so.status === "DRAFT" && !routing && can.approve && <Button variant="primary" disabled={busy} icon={<CircleCheck />} onClick={() => confirm(false)}>Confirm</Button>}
      {DELIVERABLE.includes(so.status) && can.challan && <ButtonLink variant="primary" icon={<Truck />} href={`/sales/challans?new=${so.id}`}>Create challan</ButtonLink>}
      {so.status === "TO_INVOICE" && can.challan && <ButtonLink variant="primary" icon={<ReceiptText />} href={`/sales/challans?so=${so.id}`}>Invoice</ButtonLink>}
    </>
  ) : undefined;

  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={so ? so.docNo : "Sales order"} subtitle={so ? `${so.customer.name} · ${dateLabel(so.docDate)}` : undefined} foot={actions}>
        {err ? <ErrorState message={err} onRetry={() => { setErr(null); setN2((x) => x + 1); }} /> : !so ? <Skeleton style={{ height: 420 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}>
              <Badge tone={s!.tone} dot>{s!.label}</Badge>
              {so.late && <Badge tone="danger">Late</Badge>}
              {(so.cancelReason || so.holdReason) && <small className="muted">{so.cancelReason ?? so.holdReason}</small>}
            </div>
            {so.status === "DRAFT" && !routing && !can.approve && <div className="mb"><Banner tone="info" title="Waiting for confirmation">No approval workflow applies — a user with order approval rights confirms this order.</Banner></div>}
            <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "approval", label: "Approval" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <>
                <div className="dl mt">
                  <div><span>Customer</span><b>{so.customer.code} · {so.customer.name}{so.customer.city ? `, ${so.customer.city}` : ""}</b></div>
                  <div><span>Ship from</span><b>{so.warehouse?.name ?? "—"}{so.branch ? ` · ${so.branch.name}` : ""}</b></div>
                  <div><span>Expected delivery</span><b>{so.expectedDeliveryDate ? dateLabel(so.expectedDeliveryDate) : "—"}</b></div>
                  {(so.customerPoRef || so.customerPoDate) && <div><span>Customer PO</span><b>{so.customerPoRef ?? "—"}{so.customerPoDate ? ` · ${dateLabel(so.customerPoDate)}` : ""}</b></div>}
                  {so.quotation && <div><span>Quotation</span><b><Link className="link" href={`/sales/quotations?qt=${so.quotation.id}`}>{so.quotation.docNo}</Link></b></div>}
                  <div><span>Sales rep</span><b>{so.salesRep?.name ?? "—"}</b></div>
                  {so.priceList && <div><span>Price list</span><b>{so.priceList.name}</b></div>}
                  <div><span>Payment terms</span><b>{terms(so.paymentTerms)}</b></div>
                  <div><span>Stock</span><b>{so.reserveStock ? "Reserved on confirmation" : "Not reserved"}</b></div>
                  <div><span>Fulfilment</span><b>{so.deliveredPct}% delivered · {so.invoicedPct}% invoiced</b></div>
                  {so.confirmedAt && <div><span>Confirmed</span><b>{dateLabel(so.confirmedAt)}</b></div>}
                  {so.remarks && <div><span>Remarks</span><b>{so.remarks}</b></div>}
                </div>
                <LinesTable lines={so.lines} net={so.netAmount} tax={so.taxAmount}
                  extra={{ head: ["Delivered", "Invoiced"], cells: (l) => [l.item ? fmtQty(l.deliveredQty ?? 0) : "—", fmtQty(l.invoicedQty ?? 0)] }} />
                <div className="mt">
                  <small className="muted" style={{ display: "block", marginBottom: 6 }}>Delivery challans</small>
                  {so.challans.length ? (
                    <div className="list">{so.challans.map((c) => <div key={c.id} className="list-item"><div><b><Link className="link" href={`/sales/challans?dc=${c.id}`}>{c.docNo}</Link></b><small>{dateLabel(c.docDate)}</small></div><Badge tone={c.status === "CANCELLED" ? "danger" : c.status === "DELIVERED" ? "good" : "info"}>{c.status.toLowerCase().replace(/_/g, " ")}</Badge></div>)}</div>
                  ) : <small className="muted">Nothing delivered against this order yet.</small>}
                </div>
                <div className="mt">
                  <small className="muted" style={{ display: "block", marginBottom: 6 }}>Invoices</small>
                  {so.invoices.length ? (
                    <div className="list">{so.invoices.map((v) => <div key={v.id} className="list-item"><div><b><Link className="link" href={`/sales/invoices/${v.id}`}>{v.docNo}</Link></b><small>{dateLabel(v.docDate)}</small></div><Badge tone={v.status === "VOID" ? "danger" : v.status === "PAID" ? "good" : v.status === "DRAFT" ? "neutral" : "info"}>{v.status.toLowerCase().replace(/_/g, " ")}</Badge></div>)}</div>
                  ) : <small className="muted">Not invoiced yet.</small>}
                </div>
              </>
            )}
            {tab === "approval" && (
              <div className="mt">
                <p className="muted">{ap ? `${ap.workflow.name} · ${ap.status.toLowerCase()}` : routing ? `${routing.workflow.name} · submit to start` : "No approval workflow applies — a user with order approval confirms it directly."}</p>
                <div className="timeline">
                  <div className="tl-item"><span className="tl-dot good" /><div><b>Prepared — {so.createdBy?.name ?? "—"}</b><small>{dateLabel(so.createdAt)}</small></div></div>
                  {ap && <div className="tl-item"><span className="tl-dot good" /><div><b>Submitted for approval</b><small>{dateLabel(ap.requestedAt)}</small></div></div>}
                  {steps.map((st) => (
                    <div className="tl-item" key={st.stepNo}>
                      <span className={`tl-dot${st.state === "done" ? " good" : st.state === "current" ? " warn" : ""}`} />
                      <div>
                        <b>{st.name} — {st.approvers.length ? st.approvers.map((a) => a.name).join(", ") : "No approver"}</b>
                        <small>{st.state === "done" ? `Approved by ${st.actedBy.map((a) => a.name).join(", ")}` : st.state === "current" ? (pending ? (so.canAct ? "Awaiting your approval" : "Awaiting approval") : "First step") : st.state === "skipped" ? "Not required" : "Waiting"}</small>
                      </div>
                    </div>
                  ))}
                  {so.confirmedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Confirmed</b><small>{dateLabel(so.confirmedAt)}</small></div></div>}
                  {so.status === "CANCELLED" && <div className="tl-item"><span className="tl-dot danger" /><div><b>Cancelled</b><small>{so.cancelReason ?? ""}</small></div></div>}
                </div>
                {ap?.actions.filter((a) => a.reason || a.comment).map((a) => (
                  <div key={a.id} className="list-item"><div><b>{a.actor?.name ?? "—"} · {a.action.toLowerCase()}</b><small>{a.reason ?? a.comment}</small></div></div>
                ))}
              </div>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Sales" table="SalesOrders" id={so.id} /></div>}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={!!creditBlock && !!so} onClose={() => setCreditBlock(null)} busy={busy} title="Credit check failed" confirmLabel="Confirm anyway (credit override)" onConfirm={() => confirm(true)}>
        {creditBlock} You hold the credit override right: confirming records an override against {so?.customer.name ?? "this customer"}.
      </ConfirmDialog>
    </>
  );
}
