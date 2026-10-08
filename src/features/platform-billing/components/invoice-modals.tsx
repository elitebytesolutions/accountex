"use client";

import { Ban, BadgeDollarSign, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { INVOICE_KINDS, INVOICE_LINE_KINDS, INVOICE_TERMS_DAYS, invoiceTotals, PLATFORM_PAYMENT_METHODS, type LookupsResponse, type PlatformInvoiceDetail, type PlatformPayment, type TenantListItem } from "@/shared";
import { Field, FormGrid } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { labelOf } from "@/features/settings/use-lookups";
import { listTenants } from "@/features/platform-tenants/api";
import { createInvoice, recordPayment, refundPayment, updateInvoice, voidInvoice } from "../api";
import { addDays, methodLabel, money, todayPk } from "./billing-ui";

type Line = { lineKind: string; description: string; quantity: string; unitPrice: string };
type Form = {
  tenantId: string; invoiceKind: string; description: string; issuedOn: string; dueOn: string; periodStart: string; periodEnd: string;
  discountAmount: string; taxRate: string; lines: Line[];
};
const blank = (tenantId = ""): Form => {
  const t = todayPk();
  return { tenantId, invoiceKind: "MANUAL", description: "", issuedOn: t, dueOn: addDays(t, INVOICE_TERMS_DAYS), periodStart: "", periodEnd: "", discountAmount: "0", taxRate: "", lines: [{ lineKind: "MANUAL", description: "", quantity: "1", unitPrice: "" }] };
};
const fromInvoice = (i: PlatformInvoiceDetail): Form => ({
  tenantId: i.tenantId, invoiceKind: i.invoiceKind, description: i.description, issuedOn: i.issuedOn, dueOn: i.dueOn, periodStart: i.periodStart ?? "",
  periodEnd: i.periodEnd ?? "", discountAmount: String(i.discountAmount), taxRate: String(i.taxRate),
  lines: i.lines.map((l) => ({ lineKind: l.lineKind, description: l.description, quantity: String(l.quantity), unitPrice: String(l.unitPrice) })),
});

/**
 * "Manual invoice" (template admin/invoices head action; the template has no form, so this is a template-style modal).
 * Creates a DRAFT, or edits one. Blank tax rate = the company's provincial sales-tax rate (Tax Master).
 */
export function InvoiceFormModal({ open, invoice, tenantId, lookups, onClose, onSaved }: {
  open: boolean; invoice: PlatformInvoiceDetail | null; tenantId?: string; lookups: LookupsResponse; onClose: () => void; onSaved: (i: PlatformInvoiceDetail) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(blank());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [shown, setShown] = useState(false);
  if (open !== shown) {
    setShown(open);
    if (open) { setForm(invoice ? fromInvoice(invoice) : blank(tenantId)); setErrs({}); }
  }
  useEffect(() => {
    if (!open || invoice || tenantId) return;
    let cancelled = false;
    listTenants({ pageSize: 100 }).then((r) => !cancelled && setTenants(r.items.filter((t) => t.status !== "PROVISIONING"))).catch(() => undefined);
    return () => { cancelled = true; };
  }, [open, invoice, tenantId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (i: number, patch: Partial<Line>) => set("lines", form.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const nums = form.lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 }));
  const t = invoiceTotals(nums, Number(form.discountAmount) || 0, form.taxRate === "" ? 0 : Number(form.taxRate) || 0);

  const save = async () => {
    setBusy(true);
    setErrs({});
    const body = {
      invoiceKind: form.invoiceKind, description: form.description, issuedOn: form.issuedOn, dueOn: form.dueOn, periodStart: form.periodStart || null,
      periodEnd: form.periodEnd || null, discountAmount: form.discountAmount || 0, taxRate: form.taxRate === "" ? null : form.taxRate,
      lines: form.lines.map((l) => ({ lineKind: l.lineKind, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
    };
    try {
      const saved = invoice ? await updateInvoice(invoice.id, { ...body, rowVersion: invoice.rowVersion }) : await createInvoice({ ...body, tenantId: form.tenantId });
      toast(invoice ? "Draft saved" : `Draft invoice created for ${saved.tenantName}`, { tone: "good" });
      onSaved(saved);
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the invoice"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} xl title={invoice ? "Edit draft invoice" : "Manual invoice"}
      subtitle={invoice ? `${invoice.tenantName} · a draft until issued` : "Starts as a draft; issuing assigns the FS-INV number"}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy || (!invoice && !form.tenantId && !tenantId)} onClick={save}><Save />{busy ? "Saving…" : invoice ? "Save draft" : "Create draft"}</button></>}>
      <FormGrid cols={3}>
        {!invoice && !tenantId && (
          <Field label="Company" required error={errs.tenantId}>
            <select value={form.tenantId} onChange={(e) => set("tenantId", e.target.value)}>
              <option value="">Choose…</option>
              {tenants.map((c) => <option key={c.id} value={c.id}>{c.displayName} · {c.code.toUpperCase()}</option>)}
            </select>
          </Field>
        )}
        <Field label="Kind" error={errs.invoiceKind}>
          <select value={form.invoiceKind} onChange={(e) => set("invoiceKind", e.target.value)}>
            {INVOICE_KINDS.map((k) => <option key={k} value={k}>{labelOf(lookups, "InvoiceKind", k)}</option>)}
          </select>
        </Field>
        <Field label="Description" required error={errs.description}><input value={form.description} maxLength={200} placeholder="e.g. Data migration service" onChange={(e) => set("description", e.target.value)} /></Field>
        <Field label="Issued" required error={errs.issuedOn}><input type="date" value={form.issuedOn} onChange={(e) => set("issuedOn", e.target.value)} /></Field>
        <Field label="Due" required error={errs.dueOn}><input type="date" value={form.dueOn} min={form.issuedOn} onChange={(e) => set("dueOn", e.target.value)} /></Field>
        <Field label="Period from" error={errs.periodStart}><input type="date" value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} /></Field>
        <Field label="Period to" error={errs.periodEnd}><input type="date" value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} /></Field>
        <Field label="Discount (Rs)" error={errs.discountAmount}><input type="number" min={0} step="0.01" value={form.discountAmount} onChange={(e) => set("discountAmount", e.target.value)} /></Field>
        <Field label="Sales tax (%)" error={errs.taxRate} hint="Blank = the company's provincial rate"><input type="number" min={0} max={100} step="0.01" value={form.taxRate} placeholder="Auto" onChange={(e) => set("taxRate", e.target.value)} /></Field>
      </FormGrid>
      <div className="table-wrap ap-mt">
        <table className="tbl">
          <thead><tr><th style={{ width: 170 }}>Line</th><th>Description</th><th className="num" style={{ width: 90 }}>Qty</th><th className="num" style={{ width: 140 }}>Unit price</th><th className="num" style={{ width: 130 }}>Amount</th><th /></tr></thead>
          <tbody>
            {form.lines.map((l, i) => (
              <tr key={i}>
                <td><select value={l.lineKind} aria-label="Line kind" onChange={(e) => setLine(i, { lineKind: e.target.value })}>
                  {INVOICE_LINE_KINDS.map((k) => <option key={k} value={k}>{labelOf(lookups, "LineKind", k)}</option>)}</select></td>
                <td><input value={l.description} maxLength={200} aria-label="Description" onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                <td><input className="num" type="number" min={0} step="0.001" value={l.quantity} aria-label="Quantity" onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                <td><input className="num" type="number" step="0.01" value={l.unitPrice} aria-label="Unit price" onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                <td className="num">{money((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}</td>
                <td className="actions"><button type="button" className="icon-btn-sm" aria-label="Remove line" disabled={form.lines.length === 1} onClick={() => set("lines", form.lines.filter((_, k) => k !== i))}><Trash2 /></button></td>
              </tr>
            ))}
            <tr className="total"><td colSpan={4}>Subtotal · discount · tax{form.taxRate === "" ? " (auto)" : ""} · total</td><td className="num" colSpan={2}>{money(t.gross)} · {money(t.discount)} · {form.taxRate === "" ? "auto" : money(t.tax)} · {form.taxRate === "" ? "—" : money(t.total)}</td></tr>
          </tbody>
        </table>
      </div>
      {(errs.lines || Object.keys(errs).some((k) => k.startsWith("lines."))) && <p className="hint text-danger" role="alert">{errs.lines ?? Object.entries(errs).find(([k]) => k.startsWith("lines."))?.[1]}</p>}
      <button type="button" className="btn secondary sm ap-mt" disabled={form.lines.length >= 50} onClick={() => set("lines", [...form.lines, { lineKind: "MANUAL", description: "", quantity: "1", unitPrice: "" }])}><Plus />Line</button>
    </Modal>
  );
}

/** "Record payment" / "Mark paid" (template drawer footer). The database allocates it to the invoice. */
export function PaymentModal({ invoice, onClose, onDone }: { invoice: PlatformInvoiceDetail | null; onClose: () => void; onDone: (i: PlatformInvoiceDetail) => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [ref, setRef] = useState("");
  const [paidOn, setPaidOn] = useState(todayPk());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if ((invoice?.id ?? null) !== shownFor) {
    setShownFor(invoice?.id ?? null);
    if (invoice) { setAmount(String(invoice.balanceAmount)); setMethod("BANK_TRANSFER"); setRef(""); setPaidOn(todayPk()); setErrs({}); }
  }
  const save = async () => {
    if (!invoice) return;
    setBusy(true);
    try {
      const r = await recordPayment(invoice.id, { amount, paymentMethod: method, paymentRef: ref || null, paidOn });
      toast(r.status === "PAID" ? `${r.docNo} marked as paid` : `Payment of Rs ${Number(amount).toLocaleString("en-PK")} recorded`, { tone: "good" });
      onDone(r);
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not record the payment"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!invoice} onClose={onClose} title="Record payment" subtitle={invoice ? `${invoice.docNo ?? "Draft"} · ${invoice.tenantName} · balance Rs ${money(invoice.balanceAmount)}` : ""}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}><BadgeDollarSign />{busy ? "Saving…" : "Record payment"}</button></>}>
      <FormGrid>
        <Field label="Amount (Rs)" required error={errs.amount}><input className="num" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Method" error={errs.paymentMethod}><select value={method} onChange={(e) => setMethod(e.target.value)}>{PLATFORM_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}</select></Field>
        <Field label="Reference" error={errs.paymentRef} hint="IBFT / Raast / cheque reference"><input value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label="Received on" error={errs.paidOn}><input type="date" value={paidOn} max={todayPk()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

/** Refund of a recorded payment (template-style addition in the invoice drawer). */
export function RefundModal({ payment, onClose, onDone }: { payment: PlatformPayment | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if ((payment?.id ?? null) !== shownFor) {
    setShownFor(payment?.id ?? null);
    if (payment) { setAmount(String(Math.round((payment.amount - payment.refundedAmount) * 100) / 100)); setReason(""); setErrs({}); }
  }
  const save = async () => {
    if (!payment) return;
    setBusy(true);
    try {
      await refundPayment(payment.id, { rowVersion: payment.rowVersion, amount, reason });
      toast(`Refund of Rs ${Number(amount).toLocaleString("en-PK")} recorded`, { tone: "warn" });
      onDone();
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not record the refund"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!payment} onClose={onClose} title="Refund payment" subtitle={payment ? `${methodLabel(payment.paymentMethod)} · Rs ${money(payment.amount)}${payment.paymentRef ? ` · ${payment.paymentRef}` : ""}` : ""}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn danger" disabled={busy} onClick={save}><Undo2 />{busy ? "Saving…" : "Refund"}</button></>}>
      <FormGrid cols={1}>
        <Field label="Amount (Rs)" required error={errs.amount}><input className="num" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reason" required error={errs.reason} hint="Saved as a note on the company"><textarea rows={2} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

/** Void (issued invoices are corrected by a void and a new invoice). */
export function VoidModal({ invoice, onClose, onDone }: { invoice: PlatformInvoiceDetail | null; onClose: () => void; onDone: (i: PlatformInvoiceDetail) => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if ((invoice?.id ?? null) !== shownFor) { setShownFor(invoice?.id ?? null); setReason(""); setErr(undefined); }
  const save = async () => {
    if (!invoice) return;
    setBusy(true);
    try {
      const r = await voidInvoice(invoice.id, invoice.rowVersion, reason);
      toast(`${r.docNo ?? "Draft"} voided`, { tone: "warn" });
      onDone(r);
    } catch (e) {
      setErr(adminFieldErrors(e).reason);
      toast(adminErrorMessage(e, "Could not void the invoice"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!invoice} onClose={onClose} title={`Void ${invoice?.docNo ?? "draft invoice"}?`} subtitle="A void can't be undone. Issue a new invoice to correct it."
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn danger solid" disabled={busy} onClick={save}><Ban />{busy ? "Voiding…" : "Void invoice"}</button></>}>
      <FormGrid cols={1}>
        <Field label="Reason" required error={err}><textarea rows={2} value={reason} maxLength={300} placeholder="e.g. Raised against the wrong company" onChange={(e) => setReason(e.target.value)} /></Field>
      </FormGrid>
      {invoice?.dunningCaseId && invoice.dunningStage && !["RECOVERED", "CANCELLED", "WRITTEN_OFF"].includes(invoice.dunningStage) && (
        <p className="small muted">Its dunning case is cancelled and the company&apos;s access re-checked.</p>
      )}
    </Modal>
  );
}
