"use client";

import "./sales-invoice-editor.css";
import { CircleCheck, Eye, FileText, GitBranch, Lock, Plus, Save, Send, ShieldCheck, ThumbsDown, ThumbsUp, Trash2, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  amountInWords, docTotals, lineAmounts, termDays,
  type ApprovalDetail, type ApprovalStep, type CustomerCredit, type PriceMap, type SalesDocOptions, type SalesInvoice, type SalesOrderList,
} from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Switch, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Screen } from "@/components/ui/screen";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, isoDay, Money } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  approveInvoice, createInvoice, customerCredit, deleteInvoice, getInvoice, getSalesOrder, invoiceAction, listSalesOrders, priceListPrices, rejectInvoice,
  salesDocOptions, updateInvoice,
} from "../api";
import { InvoiceStatusBadge, SalesInvoiceView, type InvoiceCan, type InvoiceCompany } from "./sales-invoice-view";

type Line = {
  key: string; id?: string; itemId: string; description: string; qty: string; bonus: number; rate: string; disc: string; taxCodeId: string; taxRate: string;
  salesOrderLineId: string; deliveryChallanLineId: string; batchId: string;
};
type Form = {
  customerId: string; docDate: string; paymentTerms: string; dueDate: string; dueTouched: boolean; branchId: string; warehouseId: string; salesOrderId: string;
  deliveryChallanId: string; customerPoNo: string; customerPoDate: string; salesRepUserId: string; priceListId: string; saleType: string; submitToFbr: boolean;
  customerNotes: string; termsConditions: string; remarks: string; billBookNo: string; bookerName: string; deliverymanName: string; salesmanName: string;
  supervisorName: string; deliverySlot: string;
};
type Routing = { workflow: { id: string; name: string }; steps: ApprovalStep[] } | null;
type Notice = { title: string; message: string } | null;

const NEW_ROUTE = "app/sales/invoices/new";
const VIEW_ROUTE = "app/sales/invoices/view";
/** Business-rule refusals shown as a banner over the document as well as a toast. */
const BLOCKERS: Record<string, string> = {
  CREDIT_LIMIT_EXCEEDED: "Over the credit limit",
  CUSTOMER_ON_HOLD: "Customer is on hold",
  INVOICE_APPROVAL_REQUIRED: "Approval required",
  STOCK_INSUFFICIENT: "Not enough stock",
  APPROVAL_NO_WORKFLOW: "No approval workflow",
};
const OPEN_SO = ["CONFIRMED", "PARTIALLY_DELIVERED", "TO_INVOICE"];

let seq = 0;
const key = () => `s${++seq}`;
const n = (s: string) => { const v = Number(String(s).replace(/,/g, "")); return Number.isFinite(v) && v > 0 ? v : 0; };
const str = (v: number | null | undefined) => (v ? String(v) : "");
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const qtyFmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
const whole = (v: number) => Math.round(v).toLocaleString("en-US");
const blank = (): Line => ({ key: key(), itemId: "", description: "", qty: "", bonus: 0, rate: "", disc: "", taxCodeId: "", taxRate: "", salesOrderLineId: "", deliveryChallanLineId: "", batchId: "" });
const nonBlank = (l: Line) => !!(l.itemId || l.description.trim() || n(l.rate) || n(l.qty));
/** docDate + days, as YYYY-MM-DD. */
function plusDays(iso: string, days: number) {
  if (!iso) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fromInvoice(i: SalesInvoice): { form: Form; lines: Line[] } {
  return {
    form: {
      customerId: i.customer.id, docDate: i.docDate, paymentTerms: i.paymentTerms, dueDate: i.dueDate, dueTouched: true, branchId: i.branch.id, warehouseId: i.warehouse?.id ?? "",
      salesOrderId: i.salesOrder?.id ?? "", deliveryChallanId: i.deliveryChallan?.id ?? "", customerPoNo: i.customerPoNo ?? "", customerPoDate: i.customerPoDate ?? "",
      salesRepUserId: i.salesRep?.id ?? "", priceListId: i.priceList?.id ?? "", saleType: i.saleType, submitToFbr: i.submitToFbr, customerNotes: i.customerNotes ?? "",
      termsConditions: i.termsConditions ?? "", remarks: i.remarks ?? "", billBookNo: i.billBookNo ?? "", bookerName: i.bookerName ?? "", deliverymanName: i.deliverymanName ?? "",
      salesmanName: i.salesmanName ?? "", supervisorName: i.supervisorName ?? "", deliverySlot: i.deliverySlot ?? "",
    },
    lines: i.lines.map((l) => ({
      key: key(), id: l.id, itemId: l.item?.id ?? "", description: l.item && l.description === l.item.name ? "" : l.description ?? "", qty: str(l.baseQty), bonus: l.bonusQty,
      rate: String(l.rate), disc: str(l.discountPct), taxCodeId: l.taxCode?.id ?? "", taxRate: str(l.taxRate), salesOrderLineId: l.salesOrderLineId ?? "",
      deliveryChallanLineId: l.deliveryChallanLineId ?? "", batchId: l.batchId ?? "",
    })),
  };
}

function blankForm(o: SalesDocOptions): Form {
  const d = isoDay(new Date());
  const terms = o.paymentTerms.find((t) => t.code === "NET_30")?.code ?? o.paymentTerms[0]?.code ?? "";
  const branchId = o.branches[0]?.id ?? "";
  return {
    customerId: "", docDate: d, paymentTerms: terms, dueDate: plusDays(d, termDays(terms)), dueTouched: false, branchId,
    warehouseId: (o.warehouses.find((w) => w.branchId === branchId) ?? o.warehouses[0])?.id ?? "", salesOrderId: "", deliveryChallanId: "", customerPoNo: "", customerPoDate: "",
    salesRepUserId: "", priceListId: "", saleType: o.saleTypes[0]?.code ?? "REGULAR", submitToFbr: o.fbr.active, customerNotes: "", termsConditions: "", remarks: "",
    billBookNo: "", bookerName: "", deliverymanName: "", salesmanName: "", supervisorName: "", deliverySlot: "",
  };
}

/**
 * /sales/invoices/new and /sales/invoices/[id]: new and draft invoices open the editor (template app/sales/invoices/new);
 * posted, paid and void invoices open the printed view (template app/sales/invoices/view).
 */
export function SalesInvoiceEditor({ id, salesOrderId, can, company }: { id: string | null; salesOrderId: string | null; can: InvoiceCan; company: InvoiceCompany }) {
  const [opts, setOpts] = useState<SalesDocOptions | null>(null);
  const [inv, setInv] = useState<SalesInvoice | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [o, i] = await Promise.all([salesDocOptions(), id ? getInvoice(id) : Promise.resolve(null)]);
      setOpts(o);
      setInv(i);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e : new ApiError(0, "NETWORK", "Couldn't reach the server"));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the data once
    void load();
  }, [load]);

  const change = useCallback((x: SalesInvoice) => { setInv(x); setPreview(false); }, []);
  const showView = !!inv && (inv.status !== "DRAFT" || preview);
  const route = inv ? (showView ? VIEW_ROUTE : NEW_ROUTE) : id ? VIEW_ROUTE : NEW_ROUTE;

  if (loadError) {
    return (
      <Screen route={route}>
        {loadError.status === 403 ? (
          <EmptyState icon={<Lock />} title="You can't open sales invoices" description="If this invoice is waiting for your approval, act on it from the Approvals inbox." action={<Link className="btn primary" href="/approvals">Open Approvals</Link>} />
        ) : loadError.status === 404 ? (
          <EmptyState icon={<FileText />} title="Invoice not found" description="It may have been deleted." action={<Link className="btn secondary" href="/sales/invoices">Back to invoices</Link>} />
        ) : (
          <ErrorState message={loadError.message} reference={loadError.correlationId} onRetry={() => void load()} />
        )}
      </Screen>
    );
  }
  if (!opts || (id && !inv)) return <Screen route={route}><EditorSkeleton /></Screen>;

  const noticeBanner = notice && (
    <Banner tone="danger" title={notice.title} action={<button type="button" className="icon-btn-sm" aria-label="Dismiss" onClick={() => setNotice(null)}><X /></button>}>{notice.message}</Banner>
  );

  if (showView && inv) {
    return (
      <Screen route={VIEW_ROUTE} className="siv">
        {noticeBanner}
        <SalesInvoiceView inv={inv} opts={opts} company={company} can={can} onChange={change} onBack={inv.status === "DRAFT" ? () => setPreview(false) : undefined} />
      </Screen>
    );
  }
  return (
    <Screen route={NEW_ROUTE} className="sie">
      <InvoiceForm
        key={inv ? `${inv.id}:${inv.rowVersion}:${inv.awaitingApproval}` : "new"}
        opts={opts} inv={inv} salesOrderId={id ? null : salesOrderId} can={can} notice={noticeBanner} setNotice={setNotice} onChange={change} onPreview={() => setPreview(true)}
      />
    </Screen>
  );
}

function InvoiceForm({ opts, inv, salesOrderId, can, notice, setNotice, onChange, onPreview }: {
  opts: SalesDocOptions; inv: SalesInvoice | null; salesOrderId: string | null; can: InvoiceCan; notice: ReactNode;
  setNotice: (n: Notice) => void; onChange: (inv: SalesInvoice) => void; onPreview: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const init = useMemo(() => (inv ? fromInvoice(inv) : { form: blankForm(opts), lines: [blank()] }), [inv, opts]);
  const [form, setForm] = useState<Form>(init.form);
  const [lines, setLines] = useState<Line[]>(init.lines);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, PriceMap>>({});
  const [credit, setCredit] = useState<CustomerCredit | null>(null);
  const [orders, setOrders] = useState<SalesOrderList["items"]>([]);
  const [tab, setTab] = useState<"lines" | "history">("lines");
  const [ask, setAsk] = useState<null | "reject" | "delete">(null);
  const [reason, setReason] = useState("");
  const prefilled = useRef(false);

  const awaiting = !!inv?.awaitingApproval;
  const editable = !awaiting && (inv ? can.edit : can.create);
  const ro = !editable;
  const products = useMemo(() => new Map(opts.products.map((p) => [p.id, p])), [opts]);
  const customer = opts.customers.find((c) => c.id === form.customerId);
  const defaultList = opts.priceLists.find((p) => p.isDefault)?.id ?? "";
  const listId = form.priceListId || customer?.priceListId || defaultList;
  const listName = opts.priceLists.find((p) => p.id === listId)?.name;
  const fromChallan = !!form.deliveryChallanId;

  // ---------------------------------------------------------------- side loads
  useEffect(() => {
    if (!listId || prices[listId] || ro) return;
    let off = false;
    priceListPrices(listId).then((m) => { if (!off) setPrices((x) => ({ ...x, [listId]: m })); }).catch(() => undefined);
    return () => { off = true; };
  }, [listId, prices, ro]);

  const customerId = form.customerId;
  useEffect(() => {
    if (!customerId) return;
    let off = false;
    customerCredit(customerId).then((c) => { if (!off) setCredit(c); }).catch(() => { if (!off) setCredit(null); });
    return () => { off = true; };
  }, [customerId]);

  useEffect(() => {
    if (!customerId || ro || fromChallan) return;
    let off = false;
    listSalesOrders({ customer: customerId, pageSize: 100 })
      .then((r) => { if (!off) setOrders(r.items.filter((o) => OPEN_SO.includes(o.status) && o.invoicedPct < 100)); })
      .catch(() => undefined);
    return () => { off = true; };
  }, [customerId, ro, fromChallan]);

  const loadFromSo = useCallback(async (soId: string) => {
    const so = await getSalesOrder(soId);
    const next = so.lines.map((l): Line | null => {
      const invoiced = l.invoicedQty ?? 0;
      const remaining = r3(l.baseQty + l.bonusQty - invoiced);
      if (remaining <= 0) return null;
      const fresh = invoiced === 0;
      return {
        ...blank(), itemId: l.item?.id ?? "", description: l.item ? "" : l.description ?? "", qty: String(fresh ? l.baseQty : remaining), bonus: fresh ? l.bonusQty : 0,
        rate: String(l.rate), disc: str(l.discountPct), taxCodeId: l.taxCode?.id ?? "", taxRate: str(l.taxRate), salesOrderLineId: l.id,
      };
    }).filter((l): l is Line => !!l);
    if (!next.length) throw new ApiError(409, "NOTHING_TO_INVOICE", `Everything on ${so.docNo} is already invoiced.`);
    setForm((f) => {
      const terms = so.paymentTerms && opts.paymentTerms.some((t) => t.code === so.paymentTerms) ? so.paymentTerms : f.paymentTerms;
      return {
        ...f, customerId: so.customer.id, branchId: so.branch?.id ?? f.branchId, warehouseId: so.warehouse?.id ?? f.warehouseId, salesOrderId: so.id,
        customerPoNo: so.customerPoRef ?? f.customerPoNo, customerPoDate: so.customerPoDate ?? f.customerPoDate, salesRepUserId: so.salesRep?.id ?? f.salesRepUserId,
        priceListId: so.priceList?.id ?? f.priceListId, paymentTerms: terms, dueDate: f.dueTouched ? f.dueDate : plusDays(f.docDate, termDays(terms)),
      };
    });
    setLines(next);
    return so.docNo;
  }, [opts]);

  // ?so=<id>: prefill a new invoice from the order
  useEffect(() => {
    if (!salesOrderId || prefilled.current) return;
    prefilled.current = true;
    setBusy("so");
    loadFromSo(salesOrderId)
      .then((no) => toast(`Lines loaded from ${no}`, { tone: "good" }))
      .catch((e: unknown) => toast(e instanceof ApiError ? e.message : "Couldn't load the sales order", { tone: "danger" }))
      .finally(() => setBusy(null));
  }, [salesOrderId, loadFromSo, toast]);

  // ---------------------------------------------------------------- derived
  const calc = useMemo(() => lines.map((l) => {
    const baseQty = n(l.qty);
    return { l, p: products.get(l.itemId), baseQty, a: lineAmounts({ baseQty, rate: n(l.rate), discountPct: n(l.disc), taxRate: n(l.taxRate) }) };
  }), [lines, products]);
  const totals = useMemo(() => docTotals(calc.map((c) => c.a)), [calc]);
  const units = calc.reduce((s, c) => s + c.baseQty + c.l.bonus, 0);
  const counted = calc.filter((c) => nonBlank(c.l)).length;

  // ---------------------------------------------------------------- edits
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  };
  const setLine = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const lineErr = (i: number, f: string) => errors[`lines.${i}.${f}`] || "";

  const pickCustomer = (cid: string) => {
    const c = opts.customers.find((x) => x.id === cid);
    setCredit(null);
    setOrders([]);
    setForm((f) => {
      const terms = c && opts.paymentTerms.some((t) => t.code === c.paymentTerms) ? c.paymentTerms : f.paymentTerms;
      const branchId = c?.branchId && opts.branches.some((b) => b.id === c.branchId) ? c.branchId : f.branchId;
      return {
        ...f, customerId: cid, paymentTerms: terms, dueDate: f.dueTouched ? f.dueDate : plusDays(f.docDate, termDays(terms)), salesOrderId: "",
        salesRepUserId: c?.salesRepUserId ?? f.salesRepUserId, priceListId: c?.priceListId ?? "", branchId,
        warehouseId: branchId !== f.branchId ? (opts.warehouses.find((w) => w.branchId === branchId)?.id ?? f.warehouseId) : f.warehouseId,
      };
    });
    setLines((ls) => ls.map((l) => ({ ...l, salesOrderLineId: "" })));
    setErrors((e) => ({ ...e, customerId: "" }));
  };
  const pickOrder = (soId: string) => {
    if (!soId) {
      set("salesOrderId", "");
      setLines((ls) => ls.map((l) => ({ ...l, salesOrderLineId: "" })));
      return;
    }
    void run("so", async () => `Lines loaded from ${await loadFromSo(soId)}`);
  };
  const taxFor = (taxCodeId: string | null | undefined, fallback?: number) => {
    const t = taxCodeId ? opts.taxCodes.find((x) => x.id === taxCodeId) : fallback ? opts.taxCodes.find((x) => x.rate === fallback) : null;
    return { taxCodeId: t?.id ?? "", taxRate: str(t?.rate ?? fallback) };
  };
  const pickProduct = (k: string, pid: string) => {
    const p = products.get(pid);
    if (!p) { setLine(k, { itemId: "", salesOrderLineId: "" }); return; }
    const price = prices[listId]?.[p.id] ?? p.price;
    setLine(k, { itemId: p.id, description: "", rate: String(price), qty: lines.find((l) => l.key === k)?.qty || "1", salesOrderLineId: "", ...taxFor(p.taxCodeId, p.gstRate) });
  };

  const run = async (label: string, fn: () => Promise<string>, onFail?: () => void) => {
    setBusy(label);
    try {
      const msg = await fn();
      setNotice(null);
      toast(msg, { tone: "good" });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.details) setErrors(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])));
        if (BLOCKERS[e.code]) setNotice({ title: BLOCKERS[e.code]!, message: e.message });
        toast(e.message, { tone: "danger" });
      } else toast("Something went wrong — try again", { tone: "danger" });
      onFail?.();
    } finally {
      setBusy(null);
    }
  };

  const payload = (keep: Line[]) => ({
    channel: inv?.channel ?? "STANDARD", customerId: form.customerId, docDate: form.docDate, branchId: form.branchId, warehouseId: form.warehouseId || null,
    salesOrderId: form.salesOrderId || null, deliveryChallanId: form.deliveryChallanId || null, customerPoNo: form.customerPoNo.trim() || null,
    customerPoDate: form.customerPoDate || null, salesRepUserId: form.salesRepUserId || null, priceListId: form.priceListId || null, paymentTerms: form.paymentTerms,
    dueDate: form.dueDate || null, saleType: form.saleType || "REGULAR", submitToFbr: opts.fbr.active ? form.submitToFbr : false,
    customerNotes: form.customerNotes.trim() || null, termsConditions: form.termsConditions.trim() || null, remarks: form.remarks.trim() || null,
    billBookNo: form.billBookNo || null, bookerName: form.bookerName || null, deliverymanName: form.deliverymanName || null, salesmanName: form.salesmanName || null,
    supervisorName: form.supervisorName || null, deliverySlot: form.deliverySlot || null,
    lines: keep.map((l) => ({
      ...(l.id && { id: l.id }), itemId: l.itemId || null, description: l.description.trim() || null, qtyCtn: 0, qtyLoose: n(l.qty), bonusQty: l.bonus, rate: n(l.rate),
      discountPct: n(l.disc), taxCodeId: l.taxCodeId || null, taxRate: n(l.taxRate), salesOrderLineId: l.salesOrderLineId || null,
      deliveryChallanLineId: l.deliveryChallanLineId || null, batchId: l.batchId || null,
    })),
  });

  const validate = (keep: Line[]) => {
    const e: Record<string, string> = {};
    if (!form.customerId) e.customerId = "Choose a customer";
    if (!form.docDate) e.docDate = "Enter the invoice date";
    if (!form.branchId) e.branchId = "Choose the branch";
    if (!form.paymentTerms) e.paymentTerms = "Choose payment terms";
    if (form.dueDate && form.docDate && form.dueDate < form.docDate) e.dueDate = "Due date can’t be before the invoice date";
    if (!form.warehouseId && keep.some((l) => l.itemId && !l.deliveryChallanLineId)) e.warehouseId = "Choose the warehouse the goods leave from";
    if (!keep.length) e.lines = "Add at least one line";
    keep.forEach((l, i) => {
      if (!l.itemId && !l.description.trim()) e[`lines.${i}.itemId`] = "Choose a product or enter a description";
      if (n(l.qty) <= 0) e[`lines.${i}.qtyLoose`] = "Enter a quantity";
      if (n(l.disc) > 100) e[`lines.${i}.discountPct`] = "At most 100";
    });
    setErrors(e);
    if (Object.keys(e).length) toast(Object.values(e)[0]!, { tone: "danger" });
    return !Object.keys(e).length;
  };

  const done = (x: SalesInvoice) => {
    if (!inv) router.replace(`/sales/invoices/${x.id}`);
    onChange(x);
  };
  const save = async (then: "draft" | "submit" | "post") => {
    const keep = lines.filter(nonBlank);
    if (keep.length !== lines.length) setLines(keep.length ? keep : [blank()]);
    if (!validate(keep)) return;
    let saved: SalesInvoice | null = null;
    await run(then, async () => {
      const body = payload(keep);
      let x = inv ? await updateInvoice(inv.id, { ...body, rowVersion: inv.rowVersion }) : await createInvoice(body);
      saved = x;
      if (then === "submit") {
        if (!x.routing) { done(x); return `${x.docNo} saved — no approval workflow applies; post it directly`; }
        x = await invoiceAction(x.id, "submit", x.rowVersion);
      } else if (then === "post") {
        if (x.routing) { done(x); return `${x.docNo} saved — it needs approval before posting`; }
        x = await invoiceAction(x.id, "post", x.rowVersion);
      }
      done(x);
      return then === "draft" ? `${x.docNo} saved as draft` : then === "submit" ? `${x.docNo} submitted for approval` : `${x.docNo} posted · Rs ${whole(x.netAmount)} receivable`;
    }, () => { if (saved) done(saved); });
  };
  const act = (label: string, fn: (i: SalesInvoice) => Promise<SalesInvoice>, msg: (i: SalesInvoice) => string) =>
    run(label, async () => { const x = await fn(inv!); onChange(x); return msg(x); });
  const remove = () => run("delete", async () => { await deleteInvoice(inv!.id, inv!.rowVersion); router.push("/sales/invoices"); return `${inv!.docNo} deleted`; });
  const confirmReject = async () => {
    const r = reason.trim();
    if (r.length < 3) { setErrors((e) => ({ ...e, reason: "Give a reason" })); return; }
    setAsk(null);
    setReason("");
    await act("reject", (i) => rejectInvoice(i.id, r), (i) => `${i.docNo} returned to the preparer`);
  };

  // ---------------------------------------------------------------- render bits
  const routing = (inv?.routing ?? null) as Routing;
  const approval = (inv?.approval ?? null) as ApprovalDetail | null;
  const steps: ApprovalStep[] = approval?.steps ?? routing?.steps ?? [];
  const showRoute = !!(routing || approval);
  const limit = credit ? credit.effectiveLimit || credit.creditLimit : 0;
  const after = credit ? credit.available - totals.totalAmount : 0;
  const usedPct = credit && limit > 0 ? Math.round(((credit.exposure + totals.totalAmount) / limit) * 100) : 0;
  const onHold = credit?.status === "ON_HOLD" || !!credit?.holdReason;
  const warehouse = opts.warehouses.find((w) => w.id === form.warehouseId);
  const fbrOn = opts.fbr.active && form.submitToFbr;
  const bill = inv && inv.customer.id === form.customerId ? inv.buyer : customer ? { name: customer.name, address: customer.address, ntn: customer.ntn, strn: customer.strn, cnic: customer.cnic, city: customer.city, phone: customer.phone, email: customer.email } : null;
  const so = inv?.salesOrder && inv.salesOrder.id === form.salesOrderId ? inv.salesOrder : orders.find((o) => o.id === form.salesOrderId);
  const title = inv ? `Sales Invoice ${inv.docNo}` : "New Sales Invoice";
  const docRef = inv ? inv.docNo : "Number assigned on save";

  const actions = (
    <>
      <Link className="btn ghost" href="/sales/invoices"><X />{editable ? "Discard" : "Close"}</Link>
      {inv && <Button icon={<Eye />} title="Preview the saved invoice as printed" disabled={!!busy} onClick={onPreview}>Preview</Button>}
      {editable && inv && can.delete && <Button variant="ghost" icon={<Trash2 />} disabled={!!busy} onClick={() => setAsk("delete")}>Delete</Button>}
      {editable && <Button icon={<Save />} disabled={!!busy} onClick={() => void save("draft")}>{busy === "draft" ? "Saving…" : "Save draft"}</Button>}
      {editable && (routing || !can.post) && <Button variant="primary" icon={<Send />} disabled={!!busy} onClick={() => void save("submit")}>{busy === "submit" ? "Submitting…" : "Submit for approval"}</Button>}
      {editable && !routing && can.post && <Button variant="primary" icon={<CircleCheck />} disabled={!!busy} onClick={() => void save("post")}>{busy === "post" ? "Posting…" : "Save & post"}</Button>}
      {awaiting && inv?.canAct && <Button icon={<ThumbsDown />} disabled={!!busy} onClick={() => setAsk("reject")}>Reject</Button>}
      {awaiting && inv?.canAct && <Button variant="primary" icon={<ThumbsUp />} disabled={!!busy} onClick={() => void act("approve", (i) => approveInvoice(i.id), (i) => (i.status === "POSTED" ? `${i.docNo} approved and posted` : `${i.docNo} approved`))}>{busy === "approve" ? "Approving…" : "Approve"}</Button>}
      {awaiting && !inv?.canAct && can.create && <Button icon={<Undo2 />} disabled={!!busy} onClick={() => void act("recall", (i) => invoiceAction(i.id, "recall", i.rowVersion), (i) => `${i.docNo} recalled to draft`)}>Recall</Button>}
    </>
  );

  return (
    <>
      <PageHead
        eyebrow={`Sales / Invoices / ${inv ? inv.docNo : "New"}`}
        title={title}
        description={`${docRef} · ${fbrOn ? "will be submitted to FBR on posting" : opts.fbr.active ? "not reported to FBR" : "FBR reporting is not set up"}`}
        actions={actions}
      />

      {notice}
      {awaiting && <Banner tone="warn" title={`${inv!.docNo} is waiting for approval`}>{inv!.canAct ? "Approve to release it for posting, or reject it back to the preparer." : "It can’t be changed while it waits — recall it to edit."}</Banner>}
      {inv && !awaiting && !can.edit && <Banner tone="info" title="Read only">You can view this draft but not change it.</Banner>}
      {fromChallan && <Banner tone="info" title={`Billing delivery challan ${inv?.deliveryChallan?.docNo ?? ""}`}>Products and quantities come from the challan and can’t be changed here; rates, discounts and tax can.</Banner>}

      <div className="split">
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Customer &amp; terms</h3><p>Billing party, dates and branch</p></div>{inv ? <InvoiceStatusBadge inv={inv} /> : <span className="badge neutral">New</span>}</div>
            <FormGrid cols={3}>
              <Field label="Customer" required error={errors.customerId}>
                <select value={form.customerId} disabled={ro || fromChallan} onChange={(e) => pickCustomer(e.target.value)} aria-invalid={!!errors.customerId}>
                  <option value="">Choose the customer…</option>
                  {inv && !opts.customers.some((c) => c.id === inv.customer.id) && <option value={inv.customer.id}>{inv.customer.name}</option>}
                  {opts.customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === "ON_HOLD" ? " (on hold)" : ""}</option>)}
                </select>
              </Field>
              <Field label="Invoice date" required error={errors.docDate}>
                <input type="date" value={form.docDate} readOnly={ro} onChange={(e) => { const d = e.target.value; setForm((f) => ({ ...f, docDate: d, dueDate: f.dueTouched ? f.dueDate : plusDays(d, termDays(f.paymentTerms)) })); }} />
              </Field>
              <Field label="Payment terms" error={errors.paymentTerms}>
                <select value={form.paymentTerms} disabled={ro} onChange={(e) => { const t = e.target.value; setForm((f) => ({ ...f, paymentTerms: t, dueTouched: false, dueDate: plusDays(f.docDate, termDays(t)) })); }}>
                  {opts.paymentTerms.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Due date" error={errors.dueDate} hint={`${termDays(form.paymentTerms)} days credit`}>
                <input type="date" value={form.dueDate} readOnly={ro} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value, dueTouched: true }))} />
              </Field>
              <Field label="Branch" error={errors.branchId}>
                <select value={form.branchId} disabled={ro} onChange={(e) => { const b = e.target.value; setForm((f) => ({ ...f, branchId: b, warehouseId: opts.warehouses.find((w) => w.id === f.warehouseId)?.branchId === b ? f.warehouseId : (opts.warehouses.find((w) => w.branchId === b)?.id ?? f.warehouseId) })); }}>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Warehouse" error={errors.warehouseId}>
                <select value={form.warehouseId} disabled={ro || fromChallan} onChange={(e) => set("warehouseId", e.target.value)} aria-invalid={!!errors.warehouseId}>
                  <option value="">—</option>
                  {opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
              <Field label="Sales order" error={errors.salesOrderId}>
                <select value={form.salesOrderId} disabled={ro || fromChallan || !form.customerId || busy === "so"} onChange={(e) => pickOrder(e.target.value)}>
                  <option value="">— none —</option>
                  {so && !orders.some((o) => o.id === so.id) && <option value={so.id}>{so.docNo}</option>}
                  {orders.map((o) => <option key={o.id} value={o.id}>{o.docNo} · Rs {whole(o.netAmount)}{o.invoicedPct > 0 ? ` · ${Math.round(o.invoicedPct)}% invoiced` : ""}</option>)}
                </select>
              </Field>
              <Field label="Customer PO #" error={errors.customerPoNo}>
                <input value={form.customerPoNo} readOnly={ro} maxLength={60} placeholder="e.g. SIH/IT/0912" onChange={(e) => set("customerPoNo", e.target.value)} />
              </Field>
              <Field label="Sales rep" error={errors.salesRepUserId}>
                <select value={form.salesRepUserId} disabled={ro} onChange={(e) => set("salesRepUserId", e.target.value)}>
                  <option value="">—</option>
                  {inv?.salesRep && !opts.users.some((u) => u.id === inv.salesRep!.id) && <option value={inv.salesRep.id}>{inv.salesRep.name}</option>}
                  {opts.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            </FormGrid>
            {customer && credit && (
              <div className={cn("banner mt", onHold ? "danger" : limit > 0 && after < 0 ? "warn" : "info")}>
                <ShieldCheck />
                <div>
                  {onHold ? (
                    <><b>{customer.name} is on credit hold</b><p>{credit.holdReason ?? "Posting is blocked until the hold is released."} · Outstanding Rs {whole(credit.balance)}</p></>
                  ) : limit > 0 ? (
                    <>
                      <b>Credit limit Rs {whole(limit)} · Outstanding Rs {whole(credit.balance)} · Available Rs {whole(credit.available)}</b>
                      <p>
                        After this invoice: Rs {whole(after)} available ({usedPct}% utilised).{" "}
                        {credit.overdueAmount > 0 ? `Rs ${whole(credit.overdueAmount)} overdue.` : "No overdue invoices."}
                        {credit.openOrdersAmount > 0 ? ` Open orders Rs ${whole(credit.openOrdersAmount)}.` : ""}
                        {after < 0 && credit.blockOverLimit ? " Posting will be blocked over the limit." : ""}
                        {customer.isGstExempt ? " Customer is GST exempt." : ""}
                      </p>
                    </>
                  ) : (
                    <><b>No credit limit set · Outstanding Rs {whole(credit.balance)}</b><p>{credit.overdueAmount > 0 ? `Rs ${whole(credit.overdueAmount)} overdue.` : "No overdue invoices."}{customer.isGstExempt ? " Customer is GST exempt." : ""}</p></>
                  )}
                </div>
                <Link className="btn sm secondary" href={`/customers/${customer.id}`}>View customer</Link>
              </div>
            )}
            {bill && (
              <div className="grid-2 mt">
                <div className="dl">
                  <div><span>Bill to</span><b>{bill.name ?? customer?.name ?? "—"}</b></div>
                  <div><span>Address</span><b>{[bill.address, bill.city].filter(Boolean).join(", ") || "—"}</b></div>
                  <div><span>NTN / STRN</span><b>{[bill.ntn ?? (bill.cnic ? `CNIC ${bill.cnic}` : null), bill.strn].filter(Boolean).join(" · ") || "Unregistered"}</b></div>
                </div>
                <div className="dl">
                  <div><span>Ship to</span><b>{warehouse ? `From ${warehouse.name}` : "—"}{bill.city ? ` → ${bill.city}` : ""}</b></div>
                  <div><span>Contact</span><b>{bill.phone ?? "—"}</b></div>
                  <div><span>Email</span><b>{bill.email ?? "—"}</b></div>
                </div>
              </div>
            )}
          </div>

          <div className="panel flush">
            <div className="panel-head">
              <div><h3>Line items</h3><p>{errors.lines || (listName ? `Prices from ${listName} price list` : "Prices from the product master")}</p></div>
            </div>
            <div className="sie-tabs">
              <button type="button" className={cn(tab === "lines" && "on")} onClick={() => setTab("lines")}>Lines <i>{counted}</i></button>
              {inv && <button type="button" className={cn(tab === "history" && "on")} onClick={() => setTab("history")}>History</button>}
            </div>
            {tab === "history" && inv ? <div className="sie-hist"><HistoryTab schema="Sales" table="SalesInvoices" id={inv.id} /></div> : (
              <>
                <div className="table-wrap"><table className="tbl lines sie-lines">
                  <thead><tr>
                    <th style={{ width: 34 }}>#</th><th style={{ width: 230 }}>Item</th><th style={{ width: 200 }}>Description</th><th className="num" style={{ width: 90 }}>Qty</th>
                    <th className="num" style={{ width: 120 }}>Rate</th><th className="num" style={{ width: 76 }}>Disc %</th><th style={{ width: 130 }}>Tax code</th><th className="num" style={{ width: 120 }}>Amount</th><th style={{ width: 44 }} />
                  </tr></thead>
                  <tbody>
                    {calc.map(({ l, p, a }, i) => {
                      const lockedQty = ro || !!l.deliveryChallanLineId;
                      return (
                        <tr key={l.key}>
                          <td className="muted">{i + 1}</td>
                          <td>
                            <select className={cn("cell-input", lineErr(i, "itemId") && "sie-bad")} value={l.itemId} disabled={lockedQty} title={lineErr(i, "itemId") || undefined} onChange={(e) => pickProduct(l.key, e.target.value)}>
                              <option value="">Service / description line</option>
                              {opts.products.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}
                            </select>
                            {(l.salesOrderLineId || l.deliveryChallanLineId) && <small className="sie-sub">{l.deliveryChallanLineId ? "From challan" : `From ${so?.docNo ?? "sales order"}`}</small>}
                          </td>
                          <td><input className={cn("cell-input", lineErr(i, "description") && "sie-bad")} value={l.description} readOnly={ro} maxLength={300} placeholder={p ? p.name : "Description"} onChange={(e) => setLine(l.key, { description: e.target.value })} /></td>
                          <td>
                            <input className={cn("cell-input num", lineErr(i, "qtyLoose") && "sie-bad")} inputMode="decimal" value={l.qty} readOnly={lockedQty} placeholder="0" title={lineErr(i, "qtyLoose") || undefined} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                            {l.bonus > 0 && <small className="sie-sub num">+ {qtyFmt(l.bonus)} bonus</small>}
                          </td>
                          <td><input className={cn("cell-input num", lineErr(i, "rate") && "sie-bad")} inputMode="decimal" value={l.rate} readOnly={ro} placeholder="0.00" title={lineErr(i, "rate") || undefined} onChange={(e) => setLine(l.key, { rate: e.target.value })} /></td>
                          <td><input className={cn("cell-input num", lineErr(i, "discountPct") && "sie-bad")} inputMode="decimal" value={l.disc} readOnly={ro} placeholder="0" onChange={(e) => setLine(l.key, { disc: e.target.value })} /></td>
                          <td>
                            <select className={cn("cell-input", lineErr(i, "taxCodeId") && "sie-bad")} value={l.taxCodeId} disabled={ro} onChange={(e) => setLine(l.key, taxFor(e.target.value))}>
                              <option value="">No tax</option>
                              {opts.taxCodes.map((t) => <option key={t.id} value={t.id}>{t.code}{t.rate !== null ? ` ${t.rate}%` : ""}</option>)}
                            </select>
                          </td>
                          <td className={cn("num", !a.netAmount && "zero")}>{a.netAmount ? a.netAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}{a.taxAmount > 0 && <small className="sie-sub">+ tax {a.taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>}</td>
                          <td className="actions">
                            {!ro && !l.deliveryChallanLineId && <button type="button" className="icon-btn-sm" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))}><Trash2 /></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
                <div className="row sie-under">
                  {!ro && !fromChallan && <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setLines((ls) => [...ls, blank()])}>Add line</Button>}
                  <span className="spacer" />
                  <span className="small muted">{counted} line{counted === 1 ? "" : "s"} · {qtyFmt(units)} units{warehouse ? ` · issued from ${warehouse.name}` : ""}</span>
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Notes &amp; terms</h3><p>Printed on the invoice</p></div></div>
            <div className="form-grid">
              <Field label="Customer notes" error={errors.customerNotes}><Textarea rows={3} maxLength={2000} readOnly={ro} value={form.customerNotes} placeholder="Thank you for your business." onChange={(e) => set("customerNotes", e.target.value)} /></Field>
              <Field label="Terms & conditions" error={errors.termsConditions}><Textarea rows={3} maxLength={2000} readOnly={ro} value={form.termsConditions} placeholder="Payment within 30 days…" onChange={(e) => set("termsConditions", e.target.value)} /></Field>
              <Field label="Internal remarks" full hint="Not printed" error={errors.remarks}><input value={form.remarks} readOnly={ro} maxLength={1000} onChange={(e) => set("remarks", e.target.value)} /></Field>
            </div>
          </div>

          {showRoute && (
            <div className="panel">
              <div className="panel-head"><div><h3>Approval route</h3><p>{approval ? `${approval.workflow.name} · ${approval.status.toLowerCase()}` : routing ? `${routing.workflow.name} · submit to start` : ""}</p></div><GitBranch /></div>
              <div className="timeline">
                <div className="tl-item"><span className="tl-dot good" /><div><b>Prepared — {inv?.createdBy?.name ?? "You"}</b><small>{inv ? dateLabel(inv.createdAt) : "Not saved yet"}</small></div></div>
                {steps.map((s) => (
                  <div className="tl-item" key={s.stepNo}>
                    <span className={cn("tl-dot", s.state === "done" && "good", s.state === "current" && "warn")} />
                    <div>
                      <b>{s.name} — {s.approvers.length ? s.approvers.map((x) => x.name).join(", ") : "No approver"}</b>
                      <small>{s.state === "done" ? `Approved by ${s.actedBy.map((x) => x.name).join(", ")}` : s.state === "current" ? (awaiting ? (inv?.canAct ? "Awaiting your approval" : "Awaiting approval") : "First step") : s.state === "skipped" ? "Not required" : s.appliesAboveAmount !== null ? `Invoices above Rs ${whole(s.appliesAboveAmount)}` : "Waiting"}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Totals</h3><p>PKR</p></div></div>
            <div className="dl">
              <div><span>Subtotal (gross)</span><b><Money value={totals.grossAmount} /></b></div>
              <div><span>Discount</span><b className={cn(totals.discountAmount > 0 && "neg")}>{totals.discountAmount > 0 ? "− " : ""}<Money value={totals.discountAmount} /></b></div>
              <div><span>Taxable value</span><b><Money value={totals.netAmount} /></b></div>
              <div><span>GST</span><b><Money value={totals.taxAmount} /></b></div>
              <div><span>Further tax (unregistered only)</span><b className="muted"><Money value={0} /></b></div>
              <div><span><strong>Invoice total</strong></span><b className="dl-hero"><Money value={totals.totalAmount} /></b></div>
            </div>
            <p className="small muted mt">{amountInWords(totals.totalAmount)}</p>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Posting preview</h3><p>Journal on posting</p></div></div>
            {!totals.totalAmount ? <p className="muted small">Add lines to see the journal.</p> : (
              <div className="table-wrap sie-prev"><table className="tbl">
                <thead><tr><th>Account</th><th className="num">Dr</th><th className="num">Cr</th></tr></thead>
                <tbody>
                  <tr><td>Trade debtors{customer ? ` — ${customer.name}` : ""}</td><td className="num dr">{whole(totals.totalAmount)}</td><td className="num zero">—</td></tr>
                  <tr><td>Sales revenue</td><td className="num zero">—</td><td className="num cr">{whole(totals.netAmount)}</td></tr>
                  {totals.taxAmount > 0 && <tr><td>Output GST payable</td><td className="num zero">—</td><td className="num cr">{whole(totals.taxAmount)}</td></tr>}
                  <tr className="total"><td>Total</td><td className="num">{whole(totals.totalAmount)}</td><td className="num">{whole(totals.netAmount + totals.taxAmount)}</td></tr>
                </tbody>
              </table></div>
            )}
            <p className="muted small mt">Cost of goods sold and the stock issue post at average cost{warehouse ? ` from ${warehouse.name}` : ""}.</p>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Delivery</h3><p>On Save &amp; post</p></div></div>
            <div className="stack">
              <Switch checked={false} disabled label={`Email PDF to ${bill?.email ?? "the customer"}`} title="Emailing invoices arrives in a later phase" readOnly />
              <Switch checked={opts.fbr.active && form.submitToFbr} disabled={ro || !opts.fbr.active} label={`Submit to ${opts.fbr.authority ?? "FBR"} on posting`} onChange={(e) => set("submitToFbr", e.target.checked)} />
              <Switch checked={false} disabled label="Send WhatsApp payment link" readOnly />
              <Switch checked={false} disabled label="Auto-reminder 3 days before due" readOnly />
              <p className="small muted">{opts.fbr.active ? "" : "FBR / PRA reporting isn’t set up yet, so invoices aren’t reported. "}Email, WhatsApp and reminders arrive in later phases.</p>
            </div>
          </div>
        </div>
      </div>

      <Modal open={ask === "reject"} onClose={() => { setAsk(null); setReason(""); }} title={`Reject ${inv?.docNo ?? ""}?`} subtitle="It goes back to the preparer as a draft."
        foot={<><Button onClick={() => { setAsk(null); setReason(""); }}>Cancel</Button><Button variant="primary" icon={<ThumbsDown />} onClick={() => void confirmReject()}>Reject</Button></>}>
        <FormGrid cols={1}>
          <Field label="Reason" required full error={errors.reason}><Textarea rows={3} maxLength={500} value={reason} onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: "" })); }} /></Field>
        </FormGrid>
      </Modal>
      <ConfirmDialog open={ask === "delete"} onClose={() => setAsk(null)} onConfirm={() => { setAsk(null); void remove(); }} title={`Delete ${inv?.docNo ?? "draft"}?`} confirmLabel="Delete draft" danger busy={busy === "delete"}>
        The draft and its lines are removed. This can’t be undone.
      </ConfirmDialog>
    </>
  );
}

function EditorSkeleton() {
  return (
    <div aria-busy>
      <Skeleton style={{ height: 70, marginBottom: 16 }} />
      <div className="stack"><Skeleton style={{ height: 300 }} /><Skeleton style={{ height: 280 }} /></div>
      <div className="sie-skel"><Skeleton style={{ height: 260 }} /><Skeleton style={{ height: 260 }} /><Skeleton style={{ height: 260 }} /></div>
    </div>
  );
}
