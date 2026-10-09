"use client";

import { ClipboardList, Download, Eye, PackageCheck, PackageOpen, Pencil, Plus, Receipt, Search, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { baseQtyOf, docTotals, lineAmounts, type ApprovalDetail, type ApprovalStep, type PurchaseOptions, type PurchaseOrder, type PurchaseOrderList } from "@/shared";
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
import { approveOrder, cancelOrder, createOrder, deleteOrder, getOrder, listOrders, orderAction, purchaseOptions, rejectOrder, updateOrder } from "../api";

type Can = { create: boolean; edit: boolean; approve: boolean; receive: boolean; bill: boolean };
type Row = PurchaseOrderList["items"][number];
type Routing = { workflow: { id: string; name: string }; steps: ApprovalStep[] } | null;
const PAGE = 10;
const sum = (c: Record<string, number>, ...k: string[]) => k.reduce((s, x) => s + (c[x] ?? 0), 0);
const CHIPS = [
  { label: "All", status: "", count: (c: Record<string, number>) => Object.values(c).reduce((s, n) => s + n, 0) },
  { label: "Draft", status: "DRAFT", count: (c: Record<string, number>) => sum(c, "DRAFT") },
  { label: "Pending Approval", status: "PENDING", count: (c: Record<string, number>) => sum(c, "PENDING_L1", "PENDING_L2") },
  { label: "Approved", status: "OPEN", count: (c: Record<string, number>) => sum(c, "APPROVED", "PARTIALLY_RECEIVED") },
  { label: "Received", status: "RECEIVED", count: (c: Record<string, number>) => sum(c, "RECEIVED") },
  { label: "Billed", status: "BILLED", count: (c: Record<string, number>) => sum(c, "BILLED") },
  { label: "Cancelled", status: "CANCELLED", count: (c: Record<string, number>) => sum(c, "CANCELLED") },
];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, PENDING_L1: { label: "Pending · L1", tone: "warn" }, PENDING_L2: { label: "Pending · L2", tone: "warn" },
  APPROVED: { label: "Approved", tone: "good" }, PARTIALLY_RECEIVED: { label: "Part received", tone: "good" }, RECEIVED: { label: "Received", tone: "good" },
  BILLED: { label: "Billed", tone: "info" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const PENDING = ["PENDING_L1", "PENDING_L2"];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function PoStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

function ReceivedCell({ po }: { po: Row }) {
  const note = po.status === "DRAFT" ? "Not sent" : PENDING.includes(po.status) ? "—" : po.status === "CANCELLED" ? "Cancelled"
    : po.status === "BILLED" ? "Fully billed" : po.receivedPct === 0 ? "Nothing received yet" : `${po.receivedPct}% received${po.billedPct ? ` · ${po.billedPct}% billed` : ""}`;
  return (
    <>
      <div className={cn("progress", po.receivedPct > 0 && po.receivedPct < 100 && po.status !== "PARTIALLY_RECEIVED" && "warn")}><i style={{ width: `${po.receivedPct}%` }} /></div>
      <small className="muted">{note}</small>
    </>
  );
}

/** Template app/purchases/orders (41-acc-trade.html): KPIs, status chips, orders table with receipt progress, New PO modal, detail drawer. */
export function PurchaseOrdersScreen({ can, userId }: { can: Can; userId: string }) {
  const toast = useToast();
  const params = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PurchaseOrderList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<PurchaseOptions | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => params.get("po"));
  const [editor, setEditor] = useState<{ po: PurchaseOrder | null } | null>(null);

  useEffect(() => {
    purchaseOptions().then(setOptions).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listOrders({ status, search, vendor, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load purchase orders" }));
    return () => { cancelled = true; };
  }, [status, search, vendor, page, attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const k = data?.kpis;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const total = data ? CHIPS[0]!.count(data.counts) : 0;
  const filtered = !!(status || search || vendor);
  const exportCsv = () => downloadCsv(`purchase-orders-${isoDay(new Date())}.csv`, [
    ["PO #", "Vendor", "Order date", "Expected", "Deliver to", "Received %", "Amount", "Status"],
    ...(data?.items ?? []).map((p) => [p.docNo, p.vendor.name, p.docDate, p.expectedDate ?? "", p.warehouse?.name ?? p.branch.name, p.receivedPct, p.totalAmount, STATUS[p.status]?.label ?? p.status]),
  ]);
  const openEdit = async (id: string) => {
    try { setEditor({ po: await getOrder(id) }); } catch (e) { toast(errMsg(e, "Could not load the order"), { tone: "danger" }); }
  };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Purchases / Orders"
        title="Purchase Orders"
        description="Orders issued to vendors with approval workflow, goods receipt progress and billing status."
        actions={
          <>
            <Button icon={<Download />} onClick={exportCsv} disabled={!data?.items.length}>Export</Button>
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ po: null })}>New Purchase Order</Button>}
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi blue"><div className="kpi-top"><span>Open POs</span><span className="icon-well"><ClipboardList /></span></div><strong>{k ? rs(k.openAmount) : "—"}</strong><small>{k ? `${k.open} order${k.open === 1 ? "" : "s"} not fully received` : " "}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Pending Approval</span><span className="icon-well"><ShieldCheck /></span></div><strong>{k?.pending ?? "—"}</strong><small>{k ? rs(k.pendingAmount) : " "}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Awaiting Receipt</span><span className="icon-well"><PackageOpen /></span></div><strong>{k?.awaitingReceipt ?? "—"}</strong><small>Approved, nothing received yet</small></div>
        <div className="kpi"><div className="kpi-top"><span>Ordered this month</span><span className="icon-well"><ShoppingBag /></span></div><strong>{k ? rs(k.thisMonthAmount) : "—"}</strong><small>Excluding cancelled orders</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Purchase orders</h3><p>{data ? `${total} order${total === 1 ? "" : "s"}` : "Loading…"}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search PO #, vendor…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <select value={vendor} onChange={(e) => { setVendor(e.target.value); setPage(1); }} aria-label="Vendor">
            <option value="">All vendors</option>
            {options?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div className="chips">
            {CHIPS.map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); }}>{c.label} <i>{data ? c.count(data.counts) : 0}</i></button>)}
          </div>
        </div>
        {!data ? <Skeleton style={{ height: 380 }} /> : !data.items.length ? (
          <EmptyState icon={<ClipboardList />} title={filtered ? "No orders match" : "No purchase orders yet"} description={filtered ? "Try another status, vendor or search." : "Raise a purchase order to start buying from a vendor."}
            action={!filtered && can.create ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ po: null })}>New Purchase Order</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>PO #</th><th>Vendor</th><th>Order Date</th><th>Expected</th><th>Deliver to</th><th style={{ width: 160 }}>Received</th><th className="num">Amount (Rs)</th><th>Approval</th><th /></tr></thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td><a className="link" href={`/purchases/orders?po=${p.id}`} onClick={(e) => { e.preventDefault(); setOpenId(p.id); }}><Hl text={p.docNo} q={search} /></a><small>{p.createdBy?.name ?? "—"}</small></td>
                  <td><div className="cell-user"><span className="avatar sm">{initials(p.vendor.name)}</span><div><b><Hl text={p.vendor.name} q={search} /></b><small>{p.vendor.code}</small></div></div></td>
                  <td>{dateLabel(p.docDate)}</td>
                  <td>{p.expectedDate ? dateLabel(p.expectedDate) : "—"}</td>
                  <td>{p.warehouse?.name ?? p.branch.name}</td>
                  <td><ReceivedCell po={p} /></td>
                  <td className="num">{amt(p.totalAmount)}</td>
                  <td><PoStatus status={p.status} /></td>
                  <td className="actions">
                    {p.status === "DRAFT" && (can.create || can.edit) ? (
                      <button type="button" className="icon-btn-sm" aria-label={`Edit ${p.docNo}`} onClick={() => openEdit(p.id)}><Pencil /></button>
                    ) : PENDING.includes(p.status) ? (
                      <Button size="sm" variant="primary" onClick={() => setOpenId(p.id)}>Review</Button>
                    ) : ["APPROVED", "PARTIALLY_RECEIVED"].includes(p.status) && can.receive ? (
                      <ButtonLink size="sm" variant="ghost" icon={<PackageCheck />} href={`/purchases/grn?po=${p.id}`}>Receive</ButtonLink>
                    ) : p.status === "RECEIVED" && can.bill ? (
                      <ButtonLink size="sm" icon={<Receipt />} href={`/purchases/bills/new?po=${p.id}`}>Bill</ButtonLink>
                    ) : (
                      <button type="button" className="icon-btn-sm" aria-label={`Open ${p.docNo}`} onClick={() => setOpenId(p.id)}><Eye /></button>
                    )}
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

      <PoDrawer key={openId ?? "none"} id={openId} can={can} userId={userId} onClose={() => setOpenId(null)} onEdit={(po) => { setOpenId(null); setEditor({ po }); }} onChanged={reload} />
      {editor && options && (
        <PoEditor po={editor.po} options={options} onClose={() => setEditor(null)} onSaved={(po, msg) => { setEditor(null); toast(msg, { tone: "good" }); setOpenId(po.id); reload(); }} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- editor
type Line = { key: string; id: string | null; kind: "item" | "service"; itemId: string; description: string; accountId: string; qtyCtn: string; qtyLoose: string; bonusQty: string; rate: string; discountPct: string; taxCodeId: string; taxRate: string };
type Head = { vendorId: string; branchId: string; warehouseId: string; docDate: string; expectedDate: string; paymentTerms: string; creditDays: string; departmentId: string; costCentreId: string; projectId: string; remarks: string };
let seq = 0;
const blankLine = (): Line => ({ key: `n${++seq}`, id: null, kind: "item", itemId: "", description: "", accountId: "", qtyCtn: "", qtyLoose: "", bonusQty: "", rate: "", discountPct: "", taxCodeId: "", taxRate: "" });
const n = (s: string) => (s.trim() === "" ? 0 : Number(s));

function PoEditor({ po, options: o, onClose, onSaved }: { po: PurchaseOrder | null; options: PurchaseOptions; onClose: () => void; onSaved: (po: PurchaseOrder, msg: string) => void }) {
  const [h, setH] = useState<Head>(() => ({
    vendorId: po?.vendor.id ?? "", branchId: po?.branch.id ?? o.branches[0]?.id ?? "", warehouseId: po?.warehouse?.id ?? o.warehouses[0]?.id ?? "",
    docDate: po?.docDate ?? isoDay(new Date()), expectedDate: po?.expectedDate ?? "", paymentTerms: po?.paymentTerms ?? "NET_30", creditDays: String(po?.creditDays ?? 30),
    departmentId: po?.department?.id ?? "", costCentreId: po?.costCentre?.id ?? "", projectId: po?.project?.id ?? "", remarks: po?.remarks ?? "",
  }));
  const [lines, setLines] = useState<Line[]>(() => po?.lines.length ? po.lines.map((l) => ({
    key: l.id, id: l.id, kind: l.item ? "item" : "service", itemId: l.item?.id ?? "", description: l.description ?? "", accountId: l.account?.id ?? "",
    qtyCtn: l.qtyCtn ? String(l.qtyCtn) : "", qtyLoose: l.qtyLoose ? String(l.qtyLoose) : "", bonusQty: l.bonusQty ? String(l.bonusQty) : "", rate: String(l.rate),
    discountPct: l.discountPct ? String(l.discountPct) : "", taxCodeId: l.taxCode?.id ?? "", taxRate: l.taxRate ? String(l.taxRate) : "",
  })) : [blankLine()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  const product = (id: string) => o.products.find((p) => p.id === id);
  const salesTax = o.taxCodes.filter((t) => t.taxType === "SALES_TAX");
  const set = (patch: Partial<Head>) => setH((x) => ({ ...x, ...patch }));
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const calc = useMemo(() => lines.map((l) => {
    const p = l.kind === "item" ? product(l.itemId) : undefined;
    const baseQty = baseQtyOf(n(l.qtyCtn), n(l.qtyLoose), p?.ctn ?? 1);
    return { baseQty, a: lineAmounts({ baseQty, rate: n(l.rate), discountPct: n(l.discountPct), taxRate: n(l.taxRate) }) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lines, o.products]);
  const t = docTotals(calc.map((c) => c.a));
  const fe = (k: string) => err?.fields[k];

  const pickVendor = (id: string) => {
    const v = o.vendors.find((x) => x.id === id);
    set({ vendorId: id, ...(v && { paymentTerms: v.paymentTerms, creditDays: String(v.creditDays) }) });
  };
  const pickWarehouse = (id: string) => {
    const w = o.warehouses.find((x) => x.id === id);
    set({ warehouseId: id, ...(w?.branchId && { branchId: w.branchId }) });
  };
  const pickItem = (i: number, id: string) => {
    const p = product(id);
    const tc = p?.taxCodeId ? o.taxCodes.find((x) => x.id === p.taxCodeId) : null;
    setLine(i, { itemId: id, rate: p ? String(p.cost) : "", taxCodeId: tc?.id ?? "", taxRate: p ? String(tc?.rate ?? p.gstRate) : "" });
  };
  const pickTax = (i: number, id: string) => setLine(i, { taxCodeId: id, taxRate: id ? String(o.taxCodes.find((x) => x.id === id)?.rate ?? 0) : "0" });

  const save = async (submit: boolean) => {
    setBusy(true);
    setErr(null);
    const body = {
      ...h, creditDays: n(h.creditDays), warehouseId: h.warehouseId || null, expectedDate: h.expectedDate || null, departmentId: h.departmentId || null,
      costCentreId: h.costCentreId || null, projectId: h.projectId || null, remarks: h.remarks || null,
      lines: lines.map((l) => ({
        id: l.id, itemId: l.kind === "item" ? l.itemId || null : null, description: l.kind === "service" ? l.description || null : null, accountId: l.kind === "service" ? l.accountId || null : null,
        qtyCtn: n(l.qtyCtn), qtyLoose: n(l.qtyLoose), bonusQty: n(l.bonusQty), rate: n(l.rate), discountPct: n(l.discountPct), taxCodeId: l.taxCodeId || null, taxRate: n(l.taxRate),
      })),
      ...(po && { rowVersion: po.rowVersion }),
    };
    try {
      let saved = po ? await updateOrder(po.id, body) : await createOrder(body);
      let msg = `${saved.docNo} saved as draft`;
      if (submit) {
        if (saved.routing) {
          saved = await orderAction(saved.id, "submit", saved.rowVersion);
          msg = `${saved.docNo} submitted for approval`;
        } else msg = `${saved.docNo} saved — no approval workflow applies, approve it directly`;
      }
      onSaved(saved, msg);
    } catch (e) {
      if (e instanceof ApiError) setErr({ message: e.message, fields: Object.fromEntries(Object.entries(e.details ?? {}).map(([key, v]) => [key, v[0] ?? ""])) });
      else setErr({ message: "Could not save the purchase order", fields: {} });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} xl title={po ? `Edit ${po.docNo}` : "New Purchase Order"} subtitle={po ? `${po.vendor.name} · draft` : "Numbered on save · routed for approval when a workflow applies"} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn secondary" onClick={() => save(false)} disabled={busy}>Save draft</button>
        <button type="button" className="btn primary" onClick={() => save(true)} disabled={busy}>{busy ? "Saving…" : "Submit for approval"}</button>
      </>
    }>
      {err && <Banner tone="danger" title="Not saved">{err.message}</Banner>}
      <FormGrid cols={3}>
        <Field label="Vendor" required error={fe("vendorId")}>
          <select value={h.vendorId} onChange={(e) => pickVendor(e.target.value)}><option value="">Choose…</option>{o.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        </Field>
        <Field label="Order date" required error={fe("docDate")}><input type="date" value={h.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
        <Field label="Expected delivery" error={fe("expectedDate")}><input type="date" value={h.expectedDate} onChange={(e) => set({ expectedDate: e.target.value })} /></Field>
        <Field label="Deliver to" error={fe("warehouseId")}>
          <select value={h.warehouseId} onChange={(e) => pickWarehouse(e.target.value)}><option value="">No warehouse (services)</option>{o.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </Field>
        <Field label="Branch" required error={fe("branchId")}>
          <select value={h.branchId} onChange={(e) => set({ branchId: e.target.value })}>{o.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </Field>
        <Field label="Payment terms" error={fe("paymentTerms")}>
          <select value={h.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })}>{o.paymentTerms.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select>
        </Field>
        <Field label="Department" error={fe("departmentId")}>
          <select value={h.departmentId} onChange={(e) => set({ departmentId: e.target.value })}><option value="">—</option>{o.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </Field>
        <Field label="Cost centre" error={fe("costCentreId")}>
          <select value={h.costCentreId} onChange={(e) => set({ costCentreId: e.target.value })}><option value="">—</option>{o.costCentres.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>
        </Field>
        <Field label="Project" error={fe("projectId")}>
          <select value={h.projectId} onChange={(e) => set({ projectId: e.target.value })}><option value="">—</option>{o.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select>
        </Field>
      </FormGrid>

      <div className="table-wrap mt"><table className="tbl lines">
        <thead><tr><th style={{ minWidth: 220 }}>Item</th><th className="num">Ctn</th><th className="num">Loose</th><th className="num">Bonus</th><th className="num">Rate</th><th className="num">Disc %</th><th>Tax</th><th className="num">Amount</th><th /></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const p = l.kind === "item" ? product(l.itemId) : undefined;
            const bad = (f: string) => (fe(`lines.${i}.${f}`) ? { borderColor: "var(--danger)" } : undefined);
            return (
              <tr key={l.key}>
                <td>
                  {l.kind === "item" ? (
                    <select className="cell-input" style={bad("itemId")} title={fe(`lines.${i}.itemId`)} value={l.itemId} onChange={(e) => (e.target.value === "__service" ? setLine(i, { kind: "service", itemId: "" }) : pickItem(i, e.target.value))}>
                      <option value="">Choose product…</option>
                      {o.products.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}
                      <option value="__service">Service / non-stock line…</option>
                    </select>
                  ) : (
                    <div className="stack" style={{ gap: 4 }}>
                      <input className="cell-input" style={bad("itemId")} placeholder="Describe the service" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                      <select className="cell-input" style={bad("accountId")} value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}>
                        <option value="">Expense account…</option>{o.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                      </select>
                    </div>
                  )}
                  {p && <small className="muted">{p.ctn > 1 ? `${p.ctn} per carton · ` : ""}{qty(calc[i]!.baseQty)} {p.unit ?? "units"}</small>}
                </td>
                <td><input className="cell-input num" inputMode="decimal" style={{ width: 60 }} disabled={l.kind === "service" || (p?.ctn ?? 1) <= 1} value={l.qtyCtn} onChange={(e) => setLine(i, { qtyCtn: e.target.value })} /></td>
                <td><input className="cell-input num" inputMode="decimal" style={{ width: 70, ...bad("qtyLoose") }} title={fe(`lines.${i}.qtyLoose`)} value={l.qtyLoose} onChange={(e) => setLine(i, { qtyLoose: e.target.value })} /></td>
                <td><input className="cell-input num" inputMode="decimal" style={{ width: 60 }} disabled={l.kind === "service"} value={l.bonusQty} onChange={(e) => setLine(i, { bonusQty: e.target.value })} /></td>
                <td><input className="cell-input num" inputMode="decimal" style={{ width: 90, ...bad("rate") }} title={fe(`lines.${i}.rate`)} value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} /></td>
                <td><input className="cell-input num" inputMode="decimal" style={{ width: 60 }} value={l.discountPct} onChange={(e) => setLine(i, { discountPct: e.target.value })} /></td>
                <td>
                  <select className="cell-input" value={l.taxCodeId} onChange={(e) => pickTax(i, e.target.value)}>
                    <option value="">No tax</option>{salesTax.map((x) => <option key={x.id} value={x.id}>{x.code}{x.rate !== null ? ` · ${x.rate}%` : ""}</option>)}
                  </select>
                </td>
                <td className="num">{calc[i]!.a.totalAmount ? amt(calc[i]!.a.totalAmount) : "—"}</td>
                <td><button type="button" className="icon-btn-sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 /></button></td>
              </tr>
            );
          })}
          <tr><td colSpan={9}><button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus />Add line</button>{fe("lines") && <small style={{ color: "var(--danger)", marginLeft: 8 }}>{fe("lines")}</small>}</td></tr>
        </tbody>
      </table></div>
      <div className="dl mt">
        <div><span>Subtotal</span><b>{rs(t.grossAmount)}</b></div>
        {t.discountAmount > 0 && <div><span>Discount</span><b>− {rs(t.discountAmount)}</b></div>}
        <div><span>Sales tax</span><b>{rs(t.taxAmount)}</b></div>
        <div><span>PO total</span><b>Rs {amt(t.totalAmount)}</b></div>
      </div>
      <FormGrid cols={1}>
        <Field label="Remarks / vendor instructions" error={fe("remarks")}><textarea rows={2} value={h.remarks} onChange={(e) => set({ remarks: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}

// ---------------------------------------------------------------- detail drawer
type Tab = "details" | "approval" | "history";
type Ask = { kind: "cancel" | "reject"; po: PurchaseOrder } | null;

function PoDrawer({ id, can, userId, onClose, onEdit, onChanged }: { id: string | null; can: Can; userId: string; onClose: () => void; onEdit: (po: PurchaseOrder) => void; onChanged: () => void }) {
  const toast = useToast();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [del, setDel] = useState(false);
  const [n2, setN2] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getOrder(id).then((x) => !cancelled && setPo(x)).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the order")));
    return () => { cancelled = true; };
  }, [id, n2]);

  const run = async (label: string, fn: () => Promise<PurchaseOrder | void>) => {
    setBusy(true);
    try {
      await fn();
      toast(label, { tone: "good" });
      setN2((x) => x + 1);
      onChanged();
    } catch (e) {
      toast(errMsg(e, "That didn’t work"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const ap = (po?.approval ?? null) as ApprovalDetail | null;
  const routing = (po?.routing ?? null) as Routing;
  const steps: ApprovalStep[] = ap?.steps ?? routing?.steps ?? [];
  const pending = !!po && PENDING.includes(po.status);
  const mine = po?.createdBy?.id === userId;
  const open = !!po && po.lines.some((l) => l.openQty > 0);

  const actions = po ? (
    <>
      {po.status === "DRAFT" && (can.create || can.edit) && <Button disabled={busy} icon={<Pencil />} onClick={() => onEdit(po)}>Edit</Button>}
      {po.status === "DRAFT" && !po.submittedAt && can.create && <Button disabled={busy} icon={<Trash2 />} onClick={() => setDel(true)}>Delete</Button>}
      {["DRAFT", "PENDING_L1", "PENDING_L2", "APPROVED"].includes(po.status) && can.edit && <Button disabled={busy} onClick={() => setAsk({ kind: "cancel", po })}>Cancel PO</Button>}
      {pending && mine && <Button disabled={busy} onClick={() => run(`${po.docNo} recalled to draft`, () => orderAction(po.id, "recall", po.rowVersion))}>Recall</Button>}
      {pending && po.canAct && <Button disabled={busy} onClick={() => setAsk({ kind: "reject", po })}>Reject</Button>}
      {pending && po.canAct && <Button variant="primary" disabled={busy} onClick={() => run(`${po.docNo} approved`, () => approveOrder(po.id))}>Approve</Button>}
      {po.status === "DRAFT" && routing && can.create && <Button variant="primary" disabled={busy} onClick={() => run(`${po.docNo} submitted to ${routing.workflow.name}`, () => orderAction(po.id, "submit", po.rowVersion))}>Submit for approval</Button>}
      {po.status === "DRAFT" && !routing && can.approve && <Button variant="primary" disabled={busy} onClick={() => run(`${po.docNo} approved`, () => approveOrder(po.id))}>Approve</Button>}
      {["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status) && open && can.receive && <ButtonLink variant="primary" icon={<PackageCheck />} href={`/purchases/grn?po=${po.id}`}>Receive goods</ButtonLink>}
      {["PARTIALLY_RECEIVED", "RECEIVED"].includes(po.status) && can.bill && <ButtonLink icon={<Receipt />} href={`/purchases/bills/new?po=${po.id}`}>Bill</ButtonLink>}
    </>
  ) : undefined;

  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={po ? po.docNo : "Purchase order"} subtitle={po ? `${po.vendor.name} · ${dateLabel(po.docDate)}` : undefined} foot={actions}>
        {err ? <ErrorState message={err} onRetry={() => { setErr(null); setN2((x) => x + 1); }} /> : !po ? <Skeleton style={{ height: 420 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><PoStatus status={po.status} />{po.cancelReason && <small className="muted">{po.cancelReason}</small>}</div>
            <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "approval", label: "Approval" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <>
                <div className="dl mt">
                  <div><span>Vendor</span><b>{po.vendor.code} · {po.vendor.name}</b></div>
                  <div><span>Deliver to</span><b>{po.warehouse?.name ?? "—"} · {po.branch.name}</b></div>
                  <div><span>Expected</span><b>{po.expectedDate ? dateLabel(po.expectedDate) : "—"}</b></div>
                  <div><span>Payment terms</span><b>{po.paymentTerms.replace("_", " ")} · {po.creditDays} days</b></div>
                  {po.department && <div><span>Department</span><b>{po.department.name}</b></div>}
                  {po.costCentre && <div><span>Cost centre</span><b>{po.costCentre.name}</b></div>}
                  {po.project && <div><span>Project</span><b>{po.project.name}</b></div>}
                  <div><span>Buyer</span><b>{po.buyer?.name ?? "—"}</b></div>
                  {po.approvedBy && <div><span>Approved</span><b>{po.approvedBy.name}{po.approvedAt ? ` · ${dateLabel(po.approvedAt.slice(0, 10))}` : ""}</b></div>}
                  {po.remarks && <div><span>Remarks</span><b>{po.remarks}</b></div>}
                </div>
                <div className="table-wrap mt"><table className="tbl">
                  <thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Billed</th><th className="num">Open</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {po.lines.map((l) => (
                      <tr key={l.id}>
                        <td><b>{l.item ? l.item.name : l.description}</b><small>{l.item ? l.item.sku : l.account ? `${l.account.code} ${l.account.name}` : ""}{l.discountPct ? ` · ${l.discountPct}% off` : ""}{l.taxCode ? ` · ${l.taxCode.code}` : ""}</small></td>
                        <td className="num">{qty(l.baseQty)}{l.bonusQty ? <small>+{qty(l.bonusQty)} bonus</small> : null}</td>
                        <td className="num">{l.item ? qty(l.receivedQty) : "—"}</td>
                        <td className="num">{qty(l.billedQty)}</td>
                        <td className="num">{l.item ? qty(l.openQty) : "—"}</td>
                        <td className="num">{amt(l.rate)}</td>
                        <td className="num">{amt(l.totalAmount)}</td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={6}>Net {amt(po.netAmount)} · tax {amt(po.taxAmount)}</td><td className="num">{amt(po.totalAmount)}</td></tr>
                  </tbody>
                </table></div>
                <div className="mt">
                  <small className="muted" style={{ display: "block", marginBottom: 6 }}>Goods receipts</small>
                  {po.grns.length ? (
                    <div className="list">{po.grns.map((g) => <div key={g.id} className="list-item"><div><b><Link className="link" href={`/purchases/grn?grn=${g.id}`}>{g.docNo}</Link></b><small>{dateLabel(g.docDate)}</small></div><Badge tone={g.status === "POSTED" ? "good" : g.status === "CANCELLED" ? "danger" : "neutral"}>{g.status.toLowerCase()}</Badge></div>)}</div>
                  ) : <small className="muted">Nothing received against this order yet.</small>}
                </div>
              </>
            )}
            {tab === "approval" && (
              <div className="mt">
                <p className="muted">{ap ? `${ap.workflow.name} · ${ap.status.toLowerCase()}` : routing ? `${routing.workflow.name} · submit to start` : "No approval workflow applies — a user with PO approval approves it directly."}</p>
                <div className="timeline">
                  <div className="tl-item"><span className="tl-dot good" /><div><b>Prepared — {po.createdBy?.name ?? "—"}</b><small>{dateLabel(po.createdAt.slice(0, 10))}</small></div></div>
                  {po.submittedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Submitted for approval</b><small>{dateLabel(po.submittedAt.slice(0, 10))}</small></div></div>}
                  {steps.map((s) => (
                    <div className="tl-item" key={s.stepNo}>
                      <span className={`tl-dot${s.state === "done" ? " good" : s.state === "current" ? " warn" : ""}`} />
                      <div>
                        <b>{s.name} — {s.approvers.length ? s.approvers.map((a) => a.name).join(", ") : "No approver"}</b>
                        <small>{s.state === "done" ? `Approved by ${s.actedBy.map((a) => a.name).join(", ")}` : s.state === "current" ? (pending ? (po.canAct ? "Awaiting your approval" : "Awaiting approval") : "First step") : s.state === "skipped" ? "Not required" : "Waiting"}</small>
                      </div>
                    </div>
                  ))}
                  {po.approvedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Approved — {po.approvedBy?.name ?? "—"}</b><small>{dateLabel(po.approvedAt.slice(0, 10))}</small></div></div>}
                  {po.status === "CANCELLED" && <div className="tl-item"><span className="tl-dot danger" /><div><b>Cancelled</b><small>{po.cancelReason ?? ""}</small></div></div>}
                </div>
                {ap?.actions.filter((a) => a.reason || a.comment).map((a) => (
                  <div key={a.id} className="list-item"><div><b>{a.actor?.name ?? "—"} · {a.action.toLowerCase()}</b><small>{a.reason ?? a.comment}</small></div></div>
                ))}
              </div>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Purchases" table="PurchaseOrders" id={po.id} /></div>}
          </>
        )}
      </Drawer>
      <ReasonModal key={ask ? `${ask.kind}-${ask.po.id}` : "none"} ask={ask} onClose={() => setAsk(null)} onDone={(label) => { setAsk(null); toast(label, { tone: "good" }); setN2((x) => x + 1); onChanged(); }} />
      <ConfirmDialog open={del && !!po} onClose={() => setDel(false)} danger busy={busy} title={`Delete ${po?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => po && run(`${po.docNo} deleted`, async () => { await deleteOrder(po.id, po.rowVersion); setDel(false); onClose(); })}>
        The draft and its lines are removed. Its number is not reused.
      </ConfirmDialog>
    </>
  );
}

function ReasonModal({ ask, onClose, onDone }: { ask: Ask; onClose: () => void; onDone: (label: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (!ask) return;
    setBusy(true);
    setErr(null);
    try {
      if (ask.kind === "cancel") { const p = await cancelOrder(ask.po.id, ask.po.rowVersion, reason.trim()); onDone(`${p.docNo} cancelled`); }
      else { const p = await rejectOrder(ask.po.id, reason.trim()); onDone(`${p.docNo} rejected · back to the preparer`); }
    } catch (e) {
      setErr(errMsg(e, "That didn’t work"));
    } finally {
      setBusy(false);
    }
  };
  const cancel = ask?.kind === "cancel";
  return (
    <Modal open={!!ask} onClose={onClose} title={cancel ? `Cancel ${ask?.po.docNo ?? ""}` : `Reject ${ask?.po.docNo ?? ""}`} subtitle={cancel ? "Only orders nothing was received against can be cancelled." : "The order returns to its preparer as a draft."} foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button><button type="button" className="btn danger" onClick={run} disabled={busy || reason.trim().length < 3}>{busy ? "Working…" : cancel ? "Cancel order" : "Reject"}</button></>
    }>
      <FormGrid cols={1}>
        <Field label="Reason" required error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={cancel ? "Why is this order cancelled?" : "What should change?"} /></Field>
      </FormGrid>
    </Modal>
  );
}
