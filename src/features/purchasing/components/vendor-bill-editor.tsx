"use client";

import "./vendor-bill-editor.css";
import { Ban, CircleCheck, Download, FileMinus, FileText, GitBranch, Lock, Plus, Save, Send, ThumbsDown, ThumbsUp, Trash2, Undo2, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  baseQtyOf, docTotals, dueDateFor, lineAmounts, threeWayMatch,
  type ApprovalDetail, type ApprovalStep, type GrnList, type PurchaseOptions, type PurchaseOrderList, type VendorBill,
} from "@/shared";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  approveBill, billAction, createBill, deleteBill, getBill, getGrn, getOrder, listGrns, listOrders, purchaseOptions, rejectBill, updateBill, voidBill,
} from "../api";
import { BillStatus, MatchBadge } from "./vendor-bills-screen";

type Can = { create: boolean; edit: boolean; approve: boolean; post: boolean };
type Line = {
  key: string; id?: string; itemId: string; description: string; accountId: string; purchaseOrderLineId: string; grnLineId: string;
  qtyCtn: string; qtyLoose: string; bonusQty: string; rate: string; discountPct: string; taxCodeId: string; taxRate: string;
  whtSection: string; whtRate: string; costCentreId: string; batchNo: string; expiryDate: string; poRate: number | null; receivedQty: number | null;
};
type Form = {
  vendorId: string; branchId: string; warehouseId: string; purchaseOrderId: string; grnId: string; vendorInvoiceNo: string; docDate: string; dueDate: string; dueTouched: boolean;
  payableAccountId: string; costCentreId: string; projectId: string; advanceTaxAmount: string; isDisputed: boolean; disputeNote: string; remarks: string;
};
type Routing = { workflow: { id: string; name: string }; steps: ApprovalStep[] } | null;

let seq = 0;
const key = () => `b${++seq}`;
const n = (s: string) => { const v = Number(String(s).replace(/,/g, "")); return Number.isFinite(v) && v > 0 ? v : 0; };
const str = (v: number | null | undefined) => (v ? String(v) : "");
const amt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const blank = (whtSection = ""): Line => ({
  key: key(), itemId: "", description: "", accountId: "", purchaseOrderLineId: "", grnLineId: "", qtyCtn: "", qtyLoose: "1", bonusQty: "", rate: "", discountPct: "",
  taxCodeId: "", taxRate: "", whtSection, whtRate: "", costCentreId: "", batchNo: "", expiryDate: "", poRate: null, receivedQty: null,
});
const EDITABLE = ["DRAFT"];
const POSTED = ["POSTED", "PARTIALLY_PAID", "PAID"];

function fromBill(b: VendorBill): { form: Form; lines: Line[] } {
  return {
    form: {
      vendorId: b.vendor.id, branchId: b.branch.id, warehouseId: b.warehouse?.id ?? "", purchaseOrderId: b.purchaseOrder?.id ?? "", grnId: b.grn?.id ?? "",
      vendorInvoiceNo: b.vendorInvoiceNo, docDate: b.docDate, dueDate: b.dueDate, dueTouched: true, payableAccountId: b.payableAccount?.id ?? "",
      costCentreId: b.costCentre?.id ?? "", projectId: b.project?.id ?? "", advanceTaxAmount: str(b.advanceTaxAmount), isDisputed: b.isDisputed,
      disputeNote: b.disputeNote ?? "", remarks: b.remarks ?? "",
    },
    lines: b.lines.map((l) => ({
      key: key(), id: l.id, itemId: l.item?.id ?? "", description: l.description ?? "", accountId: l.account?.id ?? "", purchaseOrderLineId: l.purchaseOrderLineId ?? "",
      grnLineId: l.grnLineId ?? "", qtyCtn: str(l.qtyCtn), qtyLoose: str(l.qtyLoose), bonusQty: str(l.bonusQty), rate: String(l.rate), discountPct: str(l.discountPct),
      taxCodeId: l.taxCode?.id ?? "", taxRate: str(l.taxRate), whtSection: l.whtSection ?? "", whtRate: str(l.whtRate), costCentreId: l.costCentre?.id ?? "",
      batchNo: l.batchNo ?? "", expiryDate: l.expiryDate ?? "", poRate: l.poRate, receivedQty: l.receivedQty,
    })),
  };
}

/**
 * Template app/purchases/bills/new (41-acc-trade.html): vendor & reference, lines with tax and WHT, totals, posting
 * preview, approval route. New bills and drafts are editable; submitted / posted bills open read-only with their actions.
 */
export function VendorBillEditor({ id, prefill, can }: { id: string | null; prefill: { po: string | null; grn: string | null }; can: Can }) {
  const router = useRouter();
  const toast = useToast();
  const [opts, setOpts] = useState<PurchaseOptions | null>(null);
  const [bill, setBill] = useState<VendorBill | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [orders, setOrders] = useState<PurchaseOrderList["items"]>([]);
  const [grns, setGrns] = useState<GrnList["items"]>([]);
  const [ask, setAsk] = useState<null | "void" | "reject">(null);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState<"lines" | "history">("lines");

  // ---------------------------------------------------------------- loading
  const loadFromGrn = useCallback(async (grnId: string, o: PurchaseOptions, base: Form | null) => {
    const g = await getGrn(grnId);
    const po = g.purchaseOrder ? await getOrder(g.purchaseOrder.id) : null;
    const vendor = o.vendors.find((v) => v.id === g.vendor.id);
    const next = g.lines.filter((l) => l.acceptedQty - l.billedQty > 0).map((l): Line => {
      const pl = po?.lines.find((x) => x.id === l.purchaseOrderLineId) ?? null;
      const open = Math.round((l.acceptedQty - l.billedQty) * 1000) / 1000;
      const bonus = pl && pl.bonusQty > 0 ? Math.round((open * pl.bonusQty * 1000) / (pl.baseQty + pl.bonusQty)) / 1000 : 0;
      return {
        ...blank(vendor?.whtSection ?? ""), itemId: l.item.id, purchaseOrderLineId: l.purchaseOrderLineId ?? "", grnLineId: l.id, qtyLoose: String(open - bonus), bonusQty: str(bonus),
        rate: String(pl?.rate ?? l.unitCost), discountPct: str(pl?.discountPct), taxCodeId: pl?.taxCode?.id ?? "", taxRate: str(pl?.taxRate), costCentreId: pl?.costCentre?.id ?? "",
        poRate: pl?.rate ?? null, receivedQty: open,
      };
    });
    if (!next.length) throw new ApiError(409, "NOTHING_TO_BILL", `Everything on ${g.docNo} is already billed.`);
    setForm((f) => {
      const cur = f ?? base!;
      return { ...cur, vendorId: g.vendor.id, branchId: g.branch.id, warehouseId: g.warehouse.id, grnId: g.id, purchaseOrderId: g.purchaseOrder?.id ?? "",
        costCentreId: cur.costCentreId || po?.costCentre?.id || "", projectId: cur.projectId || po?.project?.id || "",
        dueDate: cur.dueTouched ? cur.dueDate : dueDateFor(cur.docDate, vendor?.creditDays ?? 30) };
    });
    setLines(next);
    return g.docNo;
  }, []);

  const loadFromPo = useCallback(async (poId: string, o: PurchaseOptions, base: Form | null) => {
    const po = await getOrder(poId);
    const vendor = o.vendors.find((v) => v.id === po.vendor.id);
    const next = po.lines.filter((l) => l.baseQty + l.bonusQty - l.billedQty > 0).map((l): Line => {
      const fresh = l.billedQty === 0;
      return {
        ...blank(vendor?.whtSection ?? ""), itemId: l.item?.id ?? "", description: l.item ? "" : l.description ?? "", accountId: l.account?.id ?? "", purchaseOrderLineId: l.id,
        qtyCtn: fresh ? str(l.qtyCtn) : "", qtyLoose: fresh ? str(l.qtyLoose) : String(Math.max(0, l.baseQty - l.billedQty)), bonusQty: fresh ? str(l.bonusQty) : "",
        rate: String(l.rate), discountPct: str(l.discountPct), taxCodeId: l.taxCode?.id ?? "", taxRate: str(l.taxRate), costCentreId: l.costCentre?.id ?? "", poRate: l.rate,
      };
    });
    if (!next.length) throw new ApiError(409, "NOTHING_TO_BILL", `Everything on ${po.docNo} is already billed.`);
    setForm((f) => {
      const cur = f ?? base!;
      return { ...cur, vendorId: po.vendor.id, branchId: po.branch.id, warehouseId: po.warehouse?.id ?? cur.warehouseId, purchaseOrderId: po.id, grnId: "",
        costCentreId: po.costCentre?.id ?? cur.costCentreId, projectId: po.project?.id ?? cur.projectId,
        dueDate: cur.dueTouched ? cur.dueDate : dueDateFor(cur.docDate, po.creditDays ?? vendor?.creditDays ?? 30) };
    });
    setLines(next);
    return po.docNo;
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [o, b] = await Promise.all([purchaseOptions(), id ? getBill(id) : Promise.resolve(null)]);
      setOpts(o);
      setBill(b);
      if (b) {
        const x = fromBill(b);
        setForm(x.form);
        setLines(x.lines);
        return;
      }
      const d = isoDay(new Date());
      const base: Form = {
        vendorId: "", branchId: o.branches[0]?.id ?? "", warehouseId: o.warehouses[0]?.id ?? "", purchaseOrderId: "", grnId: "", vendorInvoiceNo: "", docDate: d, dueDate: d, dueTouched: false,
        payableAccountId: "", costCentreId: "", projectId: "", advanceTaxAmount: "", isDisputed: false, disputeNote: "", remarks: "",
      };
      setForm(base);
      setLines([blank()]);
      if (prefill.grn) await loadFromGrn(prefill.grn, o, base);
      else if (prefill.po) await loadFromPo(prefill.po, o, base);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e : new ApiError(0, "NETWORK", "Couldn't reach the server"));
    }
  }, [id, prefill.grn, prefill.po, loadFromGrn, loadFromPo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the data once
    void load();
  }, [load]);

  // the vendor's POs and posted GRNs for the reference pickers
  const vendorId = form?.vendorId ?? "";
  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    Promise.all([listOrders({ vendor: vendorId, pageSize: 100 }), listGrns({ vendor: vendorId, status: "POSTED", pageSize: 100 })])
      .then(([p, g]) => {
        if (cancelled) return;
        setOrders(p.items.filter((x) => ["APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "BILLED"].includes(x.status)));
        setGrns(g.items);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [vendorId]);

  // ---------------------------------------------------------------- derived
  const products = useMemo(() => new Map(opts?.products.map((p) => [p.id, p]) ?? []), [opts]);
  const salesTax = useMemo(() => opts?.taxCodes.filter((t) => t.taxType === "SALES_TAX") ?? [], [opts]);
  const whtRateFor = useCallback((section: string) => {
    const t = opts?.taxCodes.find((x) => x.taxType === "WITHHOLDING" && norm(x.whtSection) === norm(section));
    return t?.rate ?? null;
  }, [opts]);
  const editable = bill ? EDITABLE.includes(bill.status) && can.edit : can.create;
  const calc = useMemo(() => lines.map((l) => {
    const p = products.get(l.itemId);
    const baseQty = baseQtyOf(n(l.qtyCtn), n(l.qtyLoose), p?.ctn ?? 1);
    return { l, p, baseQty, a: lineAmounts({ baseQty, rate: n(l.rate), discountPct: n(l.discountPct), taxRate: n(l.taxRate), whtRate: n(l.whtRate) }) };
  }), [lines, products]);
  const totals = useMemo(() => docTotals(calc.map((c) => c.a), n(form?.advanceTaxAmount ?? "")), [calc, form?.advanceTaxAmount]);
  const match = useMemo(() => threeWayMatch(calc.map((c) => ({ qty: c.baseQty + n(c.l.bonusQty), rate: n(c.l.rate), poRate: c.l.poRate, receivedQty: c.l.receivedQty })), !!form?.purchaseOrderId), [calc, form?.purchaseOrderId]);

  if (loadError) {
    if (loadError.status === 403) return <EmptyState icon={<Lock />} title="You can't open vendor bills" description="If this bill is waiting for your approval, act on it from the Approvals inbox." action={<Link className="btn primary" href="/approvals">Open Approvals</Link>} />;
    if (loadError.status === 404) return <EmptyState icon={<FileText />} title="Bill not found" description="It may have been deleted." action={<Link className="btn secondary" href="/purchases/bills">Back to bills</Link>} />;
    return <ErrorState message={loadError.message} reference={loadError.correlationId} onRetry={() => void load()} />;
  }
  if (!opts || !form) return <EditorSkeleton />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  };
  const setLine = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const lineErr = (i: number, f: string) => errors[`lines.${i}.${f}`] || "";
  const vendor = opts.vendors.find((v) => v.id === form.vendorId);
  const ro = !editable;

  const pickVendor = (vid: string) => {
    const v = opts.vendors.find((x) => x.id === vid);
    setForm((f) => (f ? { ...f, vendorId: vid, purchaseOrderId: "", grnId: "", dueDate: f.dueTouched ? f.dueDate : dueDateFor(f.docDate, v?.creditDays ?? 30) } : f));
    setLines((ls) => ls.map((l) => ({ ...l, whtSection: l.whtSection || v?.whtSection || "", whtRate: l.whtRate || str(whtRateFor(v?.whtSection ?? "")), purchaseOrderLineId: "", grnLineId: "", poRate: null, receivedQty: null })));
    setErrors((e) => ({ ...e, vendorId: "" }));
  };
  const pickProduct = (k: string, pid: string) => {
    const p = products.get(pid);
    const tax = p?.taxCodeId ? salesTax.find((t) => t.id === p.taxCodeId) : null;
    setLine(k, pid
      ? { itemId: pid, description: "", accountId: "", rate: str(p?.cost), taxCodeId: tax?.id ?? "", taxRate: str(tax?.rate ?? p?.gstRate) }
      : { itemId: "", description: "", purchaseOrderLineId: "", grnLineId: "", poRate: null, receivedQty: null });
  };
  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    try {
      const msg = await fn();
      toast(msg, { tone: "good" });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.details) setErrors(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])));
        toast(e.message, { tone: "danger" });
      } else toast("Something went wrong — try again", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };
  const reload = async (bid: string) => {
    const b = await getBill(bid);
    setBill(b);
    const x = fromBill(b);
    setForm(x.form);
    setLines(x.lines);
    return b;
  };

  const payload = () => ({
    channel: bill?.channel ?? "STANDARD", docDate: form.docDate, dueDate: form.dueDate || null, vendorId: form.vendorId, branchId: form.branchId, warehouseId: form.warehouseId || null,
    purchaseOrderId: form.purchaseOrderId || null, grnId: form.grnId || null, vendorInvoiceNo: form.vendorInvoiceNo.trim(), payableAccountId: form.payableAccountId || null,
    costCentreId: form.costCentreId || null, projectId: form.projectId || null, advanceTaxAmount: n(form.advanceTaxAmount), payMode: bill?.payMode ?? "CREDIT",
    cashAccountId: bill?.cashAccount?.id ?? null, bankAccountId: bill?.bankAccount?.id ?? null, chequeNo: bill?.chequeNo ?? null, paidNowAmount: bill?.paidNowAmount ?? 0,
    isDisputed: form.isDisputed, disputeNote: form.isDisputed ? form.disputeNote.trim() || null : null, remarks: form.remarks.trim() || null,
    lines: lines.filter((l) => l.itemId || l.description.trim() || n(l.rate)).map((l) => ({
      ...(l.id && { id: l.id }), itemId: l.itemId || null, description: l.description.trim() || null, accountId: l.itemId ? null : l.accountId || null,
      purchaseOrderLineId: l.purchaseOrderLineId || null, grnLineId: l.grnLineId || null, qtyCtn: n(l.qtyCtn), qtyLoose: n(l.qtyLoose), bonusQty: n(l.bonusQty), breakageQty: 0,
      rate: n(l.rate), discountPct: n(l.discountPct), taxCodeId: l.taxCodeId || null, taxRate: n(l.taxRate), whtSection: n(l.whtRate) ? l.whtSection || null : l.whtSection || null,
      whtRate: n(l.whtRate), costCentreId: l.costCentreId || null, batchNo: l.batchNo.trim() || null, expiryDate: l.expiryDate || null,
    })),
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.vendorId) e.vendorId = "Choose the vendor";
    if (!form.vendorInvoiceNo.trim()) e.vendorInvoiceNo = "Enter the vendor's invoice no.";
    if (!form.branchId) e.branchId = "Choose the branch";
    if (form.isDisputed && !form.disputeNote.trim()) e.disputeNote = "Say what is disputed";
    const body = payload();
    if (!body.lines.length) e.lines = "Add at least one line";
    body.lines.forEach((l, i) => {
      if (!l.itemId && !l.accountId) e[`lines.${i}.accountId`] = "Choose the expense account";
      if (!l.itemId && !l.description) e[`lines.${i}.description`] = "Describe the line";
      if (l.qtyCtn + l.qtyLoose + l.bonusQty <= 0) e[`lines.${i}.qtyLoose`] = "Enter a quantity";
      if (l.whtRate > 0 && !l.whtSection) e[`lines.${i}.whtSection`] = "Choose the WHT section";
    });
    setErrors(e);
    if (Object.keys(e).length) toast(Object.values(e)[0]!, { tone: "danger" });
    return !Object.keys(e).length;
  };

  const save = async (then: "draft" | "submit" | "post") => {
    if (!validate()) return;
    await run(then, async () => {
      let b = bill ? await updateBill(bill.id, { ...payload(), rowVersion: bill.rowVersion }) : await createBill(payload());
      setBill(b);
      if (!id) router.replace(`/purchases/bills/${b.id}`);
      if (then === "submit") {
        if (!b.routing) { await reload(b.id); return `${b.docNo} saved — no approval workflow applies; post it directly`; }
        b = await billAction(b.id, "submit", b.rowVersion);
      } else if (then === "post") {
        if (b.routing) { await reload(b.id); return `${b.docNo} saved — it needs approval before posting`; }
        b = await billAction(b.id, "post", b.rowVersion);
      }
      await reload(b.id);
      return then === "draft" ? `${b.docNo} saved as draft` : then === "submit" ? `${b.docNo} submitted for approval` : `${b.docNo} posted · Rs ${amt(b.netPayableAmount)} payable`;
    });
  };
  const act = (label: string, fn: (b: VendorBill) => Promise<VendorBill>, msg: (b: VendorBill) => string) =>
    run(label, async () => { const b = await fn(bill!); await reload(b.id); return msg(b); });
  const remove = () => run("delete", async () => { await deleteBill(bill!.id, bill!.rowVersion); router.push("/purchases/bills"); return `${bill!.docNo} deleted`; });
  const confirmAsk = async () => {
    const r = reason.trim();
    if (r.length < 3) { setErrors((e) => ({ ...e, reason: "Give a reason" })); return; }
    const which = ask;
    setAsk(null);
    setReason("");
    if (which === "void") await act("void", (b) => voidBill(b.id, b.rowVersion, r), (b) => `${b.docNo} voided${POSTED.includes(bill!.status) ? " · journal reversed" : ""}`);
    else await act("reject", (b) => rejectBill(b.id, r), (b) => `${b.docNo} returned to the preparer`);
  };

  // ---------------------------------------------------------------- render bits
  const status = bill?.status ?? "DRAFT";
  const routing = (bill?.routing ?? null) as Routing;
  const approval = (bill?.approval ?? null) as ApprovalDetail | null;
  const pendingAp = approval?.status === "PENDING";
  const steps: ApprovalStep[] = approval?.steps ?? routing?.steps ?? [];
  const goods = calc.filter((c) => c.l.itemId).reduce((s, c) => s + c.a.netAmount, 0);
  const services = calc.filter((c) => !c.l.itemId).reduce((s, c) => s + c.a.netAmount, 0);
  const whtBySection = new Map<string, number>();
  for (const c of calc) if (c.a.whtAmount) whtBySection.set(c.l.whtSection || "—", (whtBySection.get(c.l.whtSection || "—") ?? 0) + c.a.whtAmount);
  const accountName = (aid: string) => { const a = opts.accounts.find((x) => x.id === aid); return a ? `${a.code} ${a.name}` : "Expense account"; };
  const warehouse = opts.warehouses.find((w) => w.id === form.warehouseId);
  const preview: { account: string; dr: number; cr: number }[] = [];
  const addDr = (account: string, v: number) => { if (!v) return; const x = preview.find((p) => p.account === account && p.dr); if (x) x.dr += v; else preview.push({ account, dr: v, cr: 0 }); };
  for (const c of calc) {
    if (!c.l.itemId) addDr(c.l.accountId ? accountName(c.l.accountId) : "Expense account", c.a.netAmount);
    else if (c.l.grnLineId || form.grnId) addDr("Goods received not invoiced (GRNI)", c.a.netAmount);
    else addDr(`Stock — ${warehouse?.name ?? "warehouse"}`, c.a.netAmount);
  }
  addDr("Input sales tax", totals.taxAmount);
  addDr("Advance tax u/s 236G", totals.advanceTaxAmount);
  if (totals.netPayableAmount) preview.push({ account: form.payableAccountId ? accountName(form.payableAccountId) : "Trade creditors", dr: 0, cr: totals.netPayableAmount });
  if (totals.whtAmount) preview.push({ account: "WHT payable u/s 153", dr: 0, cr: totals.whtAmount });
  const shownMatch = bill && ro ? { status: bill.matchStatus, pct: bill.matchVariancePct } : { status: match.matchStatus, pct: match.matchVariancePct };
  const title = bill ? `${bill.channel === "COUNTER" ? "Purchase Voucher" : "Vendor Bill"} ${bill.docNo}` : "New Vendor Bill";

  const actions = (
    <>
      <Link className="btn ghost" href="/purchases/bills"><X />{ro ? "Close" : "Cancel"}</Link>
      {editable && <Button icon={<Save />} disabled={!!busy} onClick={() => void save("draft")}>{busy === "draft" ? "Saving…" : "Save draft"}</Button>}
      {editable && bill && !bill.submittedAt && can.create && <Button variant="ghost" icon={<Trash2 />} disabled={!!busy} onClick={() => void remove()}>Delete</Button>}
      {editable && (routing || !can.post) && <Button variant="primary" icon={<Send />} disabled={!!busy} onClick={() => void save("submit")}>{busy === "submit" ? "Submitting…" : "Submit for approval"}</Button>}
      {editable && !routing && can.approve && bill && <Button icon={<ThumbsUp />} disabled={!!busy} onClick={() => void act("approve", (b) => approveBill(b.id), (b) => `${b.docNo} approved`)}>Approve</Button>}
      {editable && !routing && can.post && <Button variant="primary" icon={<CircleCheck />} disabled={!!busy} onClick={() => void save("post")}>{busy === "post" ? "Posting…" : "Save & post"}</Button>}
      {status === "AWAITING_APPROVAL" && bill?.canAct && <Button icon={<ThumbsDown />} disabled={!!busy} onClick={() => setAsk("reject")}>Reject</Button>}
      {status === "AWAITING_APPROVAL" && bill?.canAct && <Button variant="primary" icon={<ThumbsUp />} disabled={!!busy} onClick={() => void act("approve", (b) => approveBill(b.id), (b) => b.status === "POSTED" ? `${b.docNo} approved and posted` : `${b.docNo} approved`)}>Approve</Button>}
      {status === "AWAITING_APPROVAL" && !bill?.canAct && can.create && <Button icon={<Undo2 />} disabled={!!busy} onClick={() => void act("recall", (b) => billAction(b.id, "recall", b.rowVersion), (b) => `${b.docNo} recalled to draft`)}>Recall</Button>}
      {status === "APPROVED" && can.post && <Button variant="primary" icon={<CircleCheck />} disabled={!!busy} onClick={() => void act("post", (b) => billAction(b.id, "post", b.rowVersion), (b) => `${b.docNo} posted`)}>Post</Button>}
      {bill && ["POSTED", "PARTIALLY_PAID"].includes(status) && <ButtonLink icon={<Wallet />} href={`/payables/payments?bills=${bill.id}`}>Pay</ButtonLink>}
      {bill && POSTED.includes(status) && <ButtonLink icon={<FileMinus />} href={`/purchases/debit-notes?bill=${bill.id}`}>Debit note</ButtonLink>}
      {bill && status !== "VOID" && !EDITABLE.includes(status) && can.post && status !== "AWAITING_APPROVAL" && <Button variant="ghost" icon={<Ban />} disabled={!!busy} onClick={() => setAsk("void")}>Void</Button>}
    </>
  );

  return (
    <div className="vb-ed">
      <PageHead
        eyebrow={`Purchases / Bills / ${bill ? bill.docNo : "New"}`}
        title={title}
        description={bill ? `${bill.vendor.name} · invoice ${bill.vendorInvoiceNo}` : "Record supplier invoice, claim input tax and deduct WHT at source."}
        actions={actions}
      />

      {bill && !EDITABLE.includes(bill.status) && (
        <Banner tone={bill.status === "VOID" ? "danger" : bill.status === "AWAITING_APPROVAL" ? "warn" : "info"} title={`${bill.docNo} is ${(bill.status === "VOID" ? "void" : bill.status.toLowerCase().replace(/_/g, " "))}`}
          action={bill.voucher ? <Link className="btn sm secondary" href={`/accounting/vouchers/${bill.voucher.id}`}>Journal {bill.voucher.docNo}</Link> : undefined}>
          {bill.status === "VOID" ? `Voided${bill.voidReason ? `: ${bill.voidReason}` : ""}. The journal was reversed.` : POSTED.includes(bill.status) ? "Posted bills can't be changed; void the bill to reverse it." : bill.status === "AWAITING_APPROVAL" ? "Waiting for approval — recall it to change it." : "Approved — post it to the ledger."}
        </Banner>
      )}
      {bill && EDITABLE.includes(bill.status) && !can.edit && <Banner tone="info" title="Read only">You can view this draft but not change it.</Banner>}

      <div className="stack vb-main">
          <div className="panel">
            <div className="panel-head"><div><h3>Vendor &amp; reference</h3><p>Pull lines from a purchase order or goods receipt to auto-match</p></div><BillStatusOrNew bill={bill} /></div>
            <FormGrid cols={3}>
              <Field label="Vendor" required error={errors.vendorId}>
                <select value={form.vendorId} disabled={ro} onChange={(e) => pickVendor(e.target.value)}>
                  <option value="">Choose the vendor…</option>
                  {opts.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </Field>
              <Field label="Purchase order" error={errors.purchaseOrderId}>
                <select value={form.purchaseOrderId} disabled={ro || !form.vendorId} onChange={(e) => set("purchaseOrderId", e.target.value)}>
                  <option value="">— none —</option>
                  {bill?.purchaseOrder && !orders.some((o) => o.id === bill.purchaseOrder!.id) && <option value={bill.purchaseOrder.id}>{bill.purchaseOrder.docNo}</option>}
                  {orders.map((o) => <option key={o.id} value={o.id}>{o.docNo} · Rs {Math.round(o.totalAmount).toLocaleString("en-US")}</option>)}
                </select>
              </Field>
              <Field label="GRN" error={errors.grnId}>
                <select value={form.grnId} disabled={ro || !form.vendorId} onChange={(e) => set("grnId", e.target.value)}>
                  <option value="">— none —</option>
                  {bill?.grn && !grns.some((g) => g.id === bill.grn!.id) && <option value={bill.grn.id}>{bill.grn.docNo}</option>}
                  {grns.filter((g) => !form.purchaseOrderId || g.purchaseOrder?.id === form.purchaseOrderId).map((g) => <option key={g.id} value={g.id}>{g.docNo} · {dateLabel(g.docDate)}{g.billStatus === "BILLED" ? " · billed" : ""}</option>)}
                </select>
              </Field>
              <Field label="Vendor invoice #" required error={errors.vendorInvoiceNo}>
                <input value={form.vendorInvoiceNo} readOnly={ro} maxLength={60} placeholder="e.g. SPL/INV/88341" onChange={(e) => set("vendorInvoiceNo", e.target.value)} />
              </Field>
              <Field label="Bill date" required error={errors.docDate}>
                <input type="date" value={form.docDate} readOnly={ro} onChange={(e) => { const d = e.target.value; setForm((f) => (f ? { ...f, docDate: d, dueDate: f.dueTouched ? f.dueDate : dueDateFor(d, vendor?.creditDays ?? 30) } : f)); }} />
              </Field>
              <Field label="Due date" error={errors.dueDate} hint={vendor ? `${vendor.creditDays} days credit` : undefined}>
                <input type="date" value={form.dueDate} readOnly={ro} onChange={(e) => setForm((f) => (f ? { ...f, dueDate: e.target.value, dueTouched: true } : f))} />
              </Field>
              <Field label="Branch" required error={errors.branchId}>
                <select value={form.branchId} disabled={ro} onChange={(e) => set("branchId", e.target.value)}>{opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              </Field>
              <Field label="Receiving warehouse" error={errors.warehouseId} hint="For stock billed without a GRN">
                <select value={form.warehouseId} disabled={ro} onChange={(e) => set("warehouseId", e.target.value)}>
                  <option value="">—</option>
                  {opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
              <Field label="Payable account" error={errors.payableAccountId}>
                <select value={form.payableAccountId} disabled={ro} onChange={(e) => set("payableAccountId", e.target.value)}>
                  <option value="">Vendor default (trade creditors)</option>
                  {opts.accounts.filter((a) => a.accountClass === 2).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </Field>
              <Field label="Cost centre" error={errors.costCentreId}>
                <select value={form.costCentreId} disabled={ro} onChange={(e) => set("costCentreId", e.target.value)}>
                  <option value="">—</option>
                  {opts.costCentres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Project" error={errors.projectId}>
                <select value={form.projectId} disabled={ro} onChange={(e) => set("projectId", e.target.value)}>
                  <option value="">—</option>
                  {opts.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </select>
              </Field>
              <Field label="Currency"><select disabled value="PKR"><option>PKR</option></select></Field>
            </FormGrid>
            {vendor && (
              <div className={cn("banner mt", vendor.atlStatus === "ACTIVE" ? "good" : "warn")}>
                <CircleCheck />
                <div>
                  <b>{vendor.atlStatus === "ACTIVE" ? "Vendor is on FBR Active Taxpayers List" : vendor.atlStatus === "NOT_ON_ATL" ? "Vendor is not on the Active Taxpayers List" : "Vendor's ATL status is not verified"}</b>
                  <p>{vendor.ntn ? `NTN ${vendor.ntn} · ` : ""}Default WHT section {opts.whtSections.find((w) => w.code === vendor.whtSection)?.label ?? vendor.whtSection} · {vendor.paymentTerms.replace(/_/g, " ").toLowerCase()} · {vendor.creditDays} days</p>
                </div>
              </div>
            )}
          </div>

          <div className="panel flush">
            <div className="panel-head">
              <div><h3>Lines</h3><p>{errors.lines || (form.purchaseOrderId ? "3-way match against the PO and GRN" : "Product lines go to stock; service lines to their expense account")}</p></div>
              <div className="panel-actions">
                <MatchBadge status={shownMatch.status} pct={shownMatch.pct} />
                {!ro && <Button size="sm" variant="ghost" icon={<Download />} disabled={!form.purchaseOrderId || !!busy}
                  onClick={() => void run("po", async () => `Lines loaded from ${await loadFromPo(form.purchaseOrderId, opts, null)}`)}>Load from PO</Button>}
                {!ro && <Button size="sm" variant="ghost" icon={<Download />} disabled={!form.grnId || !!busy}
                  onClick={() => void run("grn", async () => `Lines loaded from ${await loadFromGrn(form.grnId, opts, null)}`)}>Load from GRN</Button>}
              </div>
            </div>
            <div className="vb-tabs">
              <button type="button" className={cn(tab === "lines" && "on")} onClick={() => setTab("lines")}>Lines <i>{lines.length}</i></button>
              {bill && <button type="button" className={cn(tab === "history" && "on")} onClick={() => setTab("history")}>History</button>}
            </div>
            {tab === "history" && bill ? <div className="vb-hist"><HistoryTab schema="Purchases" table="VendorBills" id={bill.id} /></div> : (
              <>
                <div className="table-wrap"><table className="tbl lines vb-lines">
                  <thead><tr>
                    <th style={{ width: 220 }}>Item / description</th><th style={{ width: 180 }}>Account</th><th className="num" style={{ width: 60 }}>Ctn</th><th className="num" style={{ width: 70 }}>Qty</th>
                    <th className="num" style={{ width: 60 }}>Bonus</th><th className="num" style={{ width: 95 }}>Rate</th><th className="num" style={{ width: 60 }}>Disc %</th><th style={{ width: 110 }}>Tax</th>
                    <th style={{ width: 150 }}>WHT section</th><th className="num" style={{ width: 110 }}>Amount</th><th style={{ width: 70 }} />
                  </tr></thead>
                  <tbody>
                    {calc.map(({ l, p, baseQty, a }, i) => {
                      const poOk = l.poRate !== null && Math.abs(n(l.rate) - l.poRate) < 0.0001;
                      const qtyOk = l.receivedQty === null || Math.abs(baseQty + n(l.bonusQty) - l.receivedQty) < 0.0001;
                      const direct = !!p && !l.grnLineId && !form.grnId;
                      return (
                        <tr key={l.key}>
                          <td>
                            <select value={l.itemId} disabled={ro} className={cn(lineErr(i, "itemId") && "vb-bad")} title={lineErr(i, "itemId") || undefined} onChange={(e) => pickProduct(l.key, e.target.value)}>
                              <option value="">Service / expense line</option>
                              {opts.products.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}
                            </select>
                            {!l.itemId && <input className={cn("vb-desc", lineErr(i, "description") && "vb-bad")} value={l.description} readOnly={ro} maxLength={300} placeholder="Describe the service…" title={lineErr(i, "description") || undefined} onChange={(e) => setLine(l.key, { description: e.target.value })} />}
                            {p && <small className="vb-sub">{p.ctn > 1 ? `${p.ctn} per carton · ` : ""}{baseQty + n(l.bonusQty)} {p.unit ?? "units"}{p.trackExpiry ? " · expiry tracked" : ""}</small>}
                            {direct && p?.trackExpiry && (
                              <div className="vb-batch">
                                <input value={l.batchNo} readOnly={ro} maxLength={60} placeholder="Batch no." className={cn(lineErr(i, "batchNo") && "vb-bad")} onChange={(e) => setLine(l.key, { batchNo: e.target.value })} />
                                <input type="date" value={l.expiryDate} readOnly={ro} aria-label="Expiry date" onChange={(e) => setLine(l.key, { expiryDate: e.target.value })} />
                              </div>
                            )}
                          </td>
                          <td>
                            {l.itemId ? <span className="vb-acc">{l.grnLineId || form.grnId ? "GRN clearing (GRNI)" : `Stock — ${warehouse?.name ?? "choose warehouse"}`}</span> : (
                              <select value={l.accountId} disabled={ro} className={cn(lineErr(i, "accountId") && "vb-bad")} title={lineErr(i, "accountId") || undefined} onChange={(e) => setLine(l.key, { accountId: e.target.value })}>
                                <option value="">Select account…</option>
                                {opts.accounts.map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
                              </select>
                            )}
                          </td>
                          <td><input className="num" inputMode="decimal" value={l.qtyCtn} readOnly={ro || !p || p.ctn <= 1} placeholder="—" onChange={(e) => setLine(l.key, { qtyCtn: e.target.value })} /></td>
                          <td><input className={cn("num", lineErr(i, "qtyLoose") && "vb-bad")} inputMode="decimal" value={l.qtyLoose} readOnly={ro} title={lineErr(i, "qtyLoose") || undefined} onChange={(e) => setLine(l.key, { qtyLoose: e.target.value })} /></td>
                          <td><input className="num" inputMode="decimal" value={l.bonusQty} readOnly={ro || !p} placeholder="0" onChange={(e) => setLine(l.key, { bonusQty: e.target.value })} /></td>
                          <td><input className={cn("num", lineErr(i, "rate") && "vb-bad")} inputMode="decimal" value={l.rate} readOnly={ro} placeholder="0.00" onChange={(e) => setLine(l.key, { rate: e.target.value })} /></td>
                          <td><input className="num" inputMode="decimal" value={l.discountPct} readOnly={ro} placeholder="0" onChange={(e) => setLine(l.key, { discountPct: e.target.value })} /></td>
                          <td>
                            <select value={l.taxCodeId} disabled={ro} onChange={(e) => { const t = salesTax.find((x) => x.id === e.target.value); setLine(l.key, { taxCodeId: e.target.value, taxRate: str(t?.rate) }); }}>
                              <option value="">No tax</option>
                              {salesTax.map((t) => <option key={t.id} value={t.id}>{t.code}{t.rate !== null ? ` ${t.rate}%` : ""}</option>)}
                            </select>
                          </td>
                          <td>
                            <div className="vb-wht">
                              <select value={l.whtSection} disabled={ro} className={cn(lineErr(i, "whtSection") && "vb-bad")} onChange={(e) => setLine(l.key, { whtSection: e.target.value, whtRate: e.target.value === "EXEMPT" ? "" : l.whtRate || str(whtRateFor(e.target.value)) })}>
                                <option value="">—</option>
                                {opts.whtSections.map((w) => <option key={w.code} value={w.code}>{w.label}</option>)}
                              </select>
                              <input className="num" inputMode="decimal" value={l.whtRate} readOnly={ro || l.whtSection === "EXEMPT"} placeholder="%" aria-label="WHT rate %" onChange={(e) => setLine(l.key, { whtRate: e.target.value })} />
                            </div>
                          </td>
                          <td className="num">{a.netAmount ? amt(a.netAmount) : <span className="zero">—</span>}{a.taxAmount > 0 && <small>+ tax {amt(a.taxAmount)}</small>}</td>
                          <td className="actions">
                            {l.poRate !== null && <span className={cn("badge", poOk && qtyOk ? "good" : poOk ? "warn" : "danger")} title={poOk ? (qtyOk ? "Rate and quantity match" : `Received ${l.receivedQty}`) : `PO rate ${l.poRate}`}>PO {poOk && qtyOk ? "✓" : "≠"}</span>}
                            {!ro && <button type="button" className="icon-btn-sm" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank(vendor?.whtSection)]))}><Trash2 /></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
                <div className="row vb-under">
                  {!ro && <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setLines((ls) => [...ls, { ...blank(vendor?.whtSection ?? ""), whtRate: str(whtRateFor(vendor?.whtSection ?? "")) }])}>Add line</Button>}
                  <span className="spacer" />
                  <span className="small muted">{[opts.costCentres.find((c) => c.id === form.costCentreId) && `Cost centre: ${opts.costCentres.find((c) => c.id === form.costCentreId)!.name}`, opts.projects.find((p) => p.id === form.projectId) && `Project: ${opts.projects.find((p) => p.id === form.projectId)!.name}`].filter(Boolean).join(" · ")}</span>
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Attachments &amp; notes</h3></div></div>
            <div className="grid-2">
              <div className="list">
                <div className="list-item vb-off" title="Attachments arrive with document storage"><span className="icon-well"><FileText /></span><div><b>Vendor invoice scan</b><small>Attachments arrive with document storage</small></div></div>
                {bill?.grn && <div className="list-item"><span className="icon-well"><FileText /></span><div><b>{bill.grn.docNo}</b><small>Goods receipt</small></div></div>}
              </div>
              <div className="form-grid">
                <label className="full"><span>Internal memo</span><Textarea rows={3} maxLength={500} readOnly={ro} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></label>
                <label className="full switch">
                  <input type="checkbox" checked={form.isDisputed} disabled={ro} onChange={(e) => set("isDisputed", e.target.checked)} /><i /><span>Disputed with the vendor</span>
                </label>
                {form.isDisputed && <Field label="What is disputed" required full error={errors.disputeNote}><input value={form.disputeNote} readOnly={ro} maxLength={500} onChange={(e) => set("disputeNote", e.target.value)} /></Field>}
              </div>
            </div>
          </div>
      </div>

      <div className="vb-sum">
          <div className="panel">
            <div className="panel-head"><div><h3>Totals</h3><p>PKR</p></div></div>
            <div className="dl">
              <div><span>Goods value</span><b>{rsDec(goods)}</b></div>
              <div><span>Services value</span><b>{rsDec(services)}</b></div>
              {totals.discountAmount > 0 && <div><span>Discount</span><b className="neg">− {rsDec(totals.discountAmount)}</b></div>}
              <div><span>Input sales tax</span><b>{rsDec(totals.taxAmount)}</b></div>
              <div><span>Advance tax u/s 236G</span>{ro ? <b>{rsDec(totals.advanceTaxAmount)}</b> : <input className="vb-adv num" inputMode="decimal" value={form.advanceTaxAmount} placeholder="0.00" aria-label="Advance tax u/s 236G" onChange={(e) => set("advanceTaxAmount", e.target.value)} />}</div>
              <div><span><strong>Bill total</strong></span><b className="dl-hero">{rsDec(totals.totalAmount)}</b></div>
              {[...whtBySection].map(([s, v]) => <div key={s}><span>WHT u/s {opts.whtSections.find((w) => w.code === s)?.label ?? s}</span><b className="neg">− {rsDec(v)}</b></div>)}
              <div><span><strong>Net payable to vendor</strong></span><b>{rsDec(totals.netPayableAmount)}</b></div>
              {bill && bill.paidNowAmount > 0 && <div><span>Paid now ({bill.payMode.toLowerCase()})</span><b>{rsDec(bill.paidNowAmount)}</b></div>}
              {bill && POSTED.includes(bill.status) && <div><span>Balance</span><b>{rsDec(bill.balanceAmount)}</b></div>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Posting preview</h3><p>{bill?.voucher ? <Link className="link" href={`/accounting/vouchers/${bill.voucher.id}`}>Posted as {bill.voucher.docNo}</Link> : "Journal this bill will post"}</p></div></div>
            {!preview.length ? <p className="muted small">Add lines to see the journal.</p> : (
              <div className="table-wrap vb-prev"><table className="tbl">
                <thead><tr><th>Account</th><th className="num">Dr</th><th className="num">Cr</th></tr></thead>
                <tbody>
                  {preview.map((p, i) => <tr key={i}><td>{p.account}</td><td className={cn("num", p.dr ? "dr" : "zero")}>{p.dr ? Math.round(p.dr).toLocaleString("en-US") : "—"}</td><td className={cn("num", p.cr ? "cr" : "zero")}>{p.cr ? Math.round(p.cr).toLocaleString("en-US") : "—"}</td></tr>)}
                  <tr className="total"><td>Total</td><td className="num">{Math.round(preview.reduce((s, p) => s + p.dr, 0)).toLocaleString("en-US")}</td><td className="num">{Math.round(preview.reduce((s, p) => s + p.cr, 0)).toLocaleString("en-US")}</td></tr>
                </tbody>
              </table></div>
            )}
            {form.purchaseOrderId && <p className="muted small mt">Price differences against the GRN cost revalue stock (units already sold go to cost of sales).</p>}
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Approval route</h3><p>{approval ? `${approval.workflow.name} · ${approval.status.toLowerCase()}` : routing ? `${routing.workflow.name} · submit to start` : bill ? "No workflow applies" : "Checked when saved"}</p></div>{routing && !approval && <GitBranch />}</div>
            <div className="timeline">
              <div className="tl-item"><span className="tl-dot good" /><div><b>Prepared — {bill?.createdBy?.name ?? "You"}</b><small>{bill ? dateLabel(bill.createdAt.slice(0, 10)) : "Not saved yet"}</small></div></div>
              {steps.map((s) => (
                <div className="tl-item" key={s.stepNo}>
                  <span className={cn("tl-dot", s.state === "done" && "good", s.state === "current" && "warn")} />
                  <div>
                    <b>{s.name} — {s.approvers.length ? s.approvers.map((a) => a.name).join(", ") : "No approver"}</b>
                    <small>{s.state === "done" ? `Approved by ${s.actedBy.map((a) => a.name).join(", ")}` : s.state === "current" ? (pendingAp ? (bill?.canAct ? "Awaiting your approval" : "Awaiting approval") : "First step") : s.state === "skipped" ? "Not required" : s.appliesAboveAmount !== null ? `Bills above Rs ${s.appliesAboveAmount.toLocaleString("en-US")}` : "Waiting"}</small>
                  </div>
                </div>
              ))}
              {!routing && !approval && bill?.status === "DRAFT" && <div className="tl-item"><span className="tl-dot" /><div><b>Post directly</b><small>No approval workflow matches this bill</small></div></div>}
              {bill?.approvedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Approved{bill.approvedBy ? ` — ${bill.approvedBy.name}` : ""}</b><small>{dateLabel(bill.approvedAt.slice(0, 10))}</small></div></div>}
              {bill?.postedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Posted</b><small>{dateLabel(bill.postedAt.slice(0, 10))}</small></div></div>}
              {bill?.voidedAt && <div className="tl-item"><span className="tl-dot danger" /><div><b>Voided</b><small>{bill.voidReason ?? dateLabel(bill.voidedAt.slice(0, 10))}</small></div></div>}
            </div>
          </div>
      </div>

      <Modal open={!!ask} onClose={() => { setAsk(null); setReason(""); }} title={ask === "void" ? `Void ${bill?.docNo ?? ""}?` : `Reject ${bill?.docNo ?? ""}?`}
        subtitle={ask === "void" ? (POSTED.includes(status) ? "The journal, stock and any issued cheque are reversed." : "The bill is cancelled.") : "It goes back to the preparer as a draft."}
        foot={<><Button onClick={() => { setAsk(null); setReason(""); }}>Cancel</Button><Button variant="primary" icon={ask === "void" ? <Ban /> : <ThumbsDown />} onClick={() => void confirmAsk()}>{ask === "void" ? "Void bill" : "Reject"}</Button></>}>
        <FormGrid cols={1}>
          <Field label="Reason" required full error={errors.reason}><Textarea rows={3} maxLength={300} value={reason} onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: "" })); }} /></Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

const rsDec = (v: number) => {
  const [w, d] = amt(Math.abs(v)).split(".");
  return <>{v < 0 ? "−" : ""}Rs {w}<span className="dec">.{d}</span></>;
};

function BillStatusOrNew({ bill }: { bill: VendorBill | null }) {
  return bill ? <BillStatus b={bill} /> : <span className="badge neutral">New</span>;
}

function EditorSkeleton() {
  return (
    <div aria-busy>
      <Skeleton style={{ height: 70, marginBottom: 16 }} />
      <div className="stack"><Skeleton style={{ height: 260 }} /><Skeleton style={{ height: 300 }} /></div><div className="vb-sum"><Skeleton style={{ height: 280 }} /><Skeleton style={{ height: 280 }} /><Skeleton style={{ height: 280 }} /></div>
    </div>
  );
}
