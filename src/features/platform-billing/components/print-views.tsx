"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { PlatformInvoiceDetail, ResellerPayout } from "@/shared";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { getInvoice, getPayout } from "../api";
import { fmtDate, money, monthLabel } from "./billing-ui";

/** The print toolbar (hidden when printing) around a template `.paper` document. */
function PrintFrame({ back, title, children }: { back: string; title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 920, margin: "24px auto", padding: "0 16px" }}>
      <div className="row print:hidden" style={{ marginBottom: 14, gap: 8 }}>
        <Link className="btn ghost sm" href={back}><ArrowLeft />Back</Link>
        <span className="spacer" />
        <span className="muted small">{title}</span>
        <button type="button" className="btn primary sm" onClick={() => window.print()}><Printer />Print / save as PDF</button>
      </div>
      {children}
    </main>
  );
}

function useDoc<T>(load: () => Promise<T>, fallback: string) {
  const [doc, setDoc] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    load().then((d) => !cancelled && setDoc(d)).catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? e.message : fallback));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { doc, error };
}

/**
 * Platform invoice print view (/admin/invoices/[id]/print): the invoice drawer's "PDF", as a template `.paper`
 * document (41-acc-trade.html sales-tax invoice layout) printed by the browser.
 */
export function InvoicePrint({ id }: { id: string }) {
  const lookups = useAdminLookups(["PlatformInvoiceStatus", "Province"]);
  const { doc: i, error } = useDoc<PlatformInvoiceDetail>(() => getInvoice(id), "Could not load the invoice");
  return (
    <PrintFrame back="/admin/invoices" title={i?.docNo ?? "Invoice"}>
      {error ? <ErrorState message={error} /> : !i ? <div className="paper"><Skeleton style={{ height: 420 }} /></div> : (
        <div className="paper">
          <div className="paper-head">
            <div>
              <div className="row"><span className="avatar lg">AX</span><div><h2 style={{ margin: 0 }}>Accountex</h2><small className="muted">Cloud accounting, payroll and distribution · billed as a service</small></div></div>
              <p className="small muted" style={{ marginTop: 8 }}>{i.taxAuthorityName ? `Sales tax on services charged under ${i.taxAuthorityName}` : "No provincial sales tax charged"}</p>
            </div>
            <div className="doc-title">
              <h2>{i.taxAmount > 0 ? "Sales tax invoice" : "Invoice"}</h2>
              <p className="small">{i.docNo ?? "DRAFT — not issued"}</p>
              <p className="small muted">{labelOf(lookups, "PlatformInvoiceStatus", i.status)}</p>
            </div>
          </div>
          <div className="paper-meta">
            <div className="dl">
              <div><span>Bill to</span><b>{i.tenant.legalName}</b></div>
              <div><span>Address</span><b>{[i.tenant.address, i.tenant.city, i.tenant.province ? labelOf(lookups, "Province", i.tenant.province) : null].filter(Boolean).join(", ") || "—"}</b></div>
              <div><span>NTN / STRN</span><b>{i.tenant.ntn ?? "—"} · {i.tenant.strn ?? "—"}</b></div>
              <div><span>Company code</span><b>{i.tenantCode.toUpperCase()}</b></div>
            </div>
            <div className="dl">
              <div><span>Invoice date</span><b>{fmtDate(i.issuedOn)}</b></div>
              <div><span>Due date</span><b>{fmtDate(i.dueOn)}</b></div>
              {i.periodStart && <div><span>Service period</span><b>{fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)}</b></div>}
              {i.couponCode && <div><span>Coupon</span><b>{i.couponCode}</b></div>}
            </div>
          </div>
          <table className="tbl">
            <thead><tr><th>#</th><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Value excl. tax</th></tr></thead>
            <tbody>
              {i.lines.map((l) => <tr key={l.id}><td>{l.lineNo}</td><td><b>{l.description}</b></td><td className="num">{l.quantity}</td><td className="num">{money(l.unitPrice)}</td><td className="num">{money(l.amount)}</td></tr>)}
              <tr className="total"><td colSpan={4}>Subtotal</td><td className="num">{money(i.grossAmount)}</td></tr>
            </tbody>
          </table>
          <div className="paper-totals">
            {i.discountAmount > 0 && <div><span>Discount{i.couponCode ? ` (${i.couponCode})` : ""}</span><b>− Rs {money(i.discountAmount)}</b></div>}
            <div><span>Value excluding sales tax</span><b>Rs {money(i.netAmount)}</b></div>
            <div><span>Sales tax @ {i.taxRate}%{i.taxAuthorityCode ? ` (${i.taxAuthorityCode})` : ""}</span><b>Rs {money(i.taxAmount)}</b></div>
            <div><span>Received to date</span><b>Rs {money(i.paidAmount)}</b></div>
            <div className="grand"><span>Balance due</span><b>Rs {money(i.balanceAmount)}</b></div>
          </div>
          <div className="paper-foot">
            <div><b className="small">Terms</b><p className="small muted">Payment due by {fmtDate(i.dueOn)}. Overdue accounts move to read-only and then suspended access under the dunning policy.</p></div>
            <div><b className="small">Pay by</b><p className="small muted">Bank transfer, Raast, JazzCash, Easypaisa or card, quoting {i.docNo ?? "the invoice number"}.</p></div>
          </div>
          <p className="small muted" style={{ textAlign: "center", marginTop: 12 }}>Computer-generated invoice; no signature required.</p>
        </div>
      )}
    </PrintFrame>
  );
}

/** Reseller commission statement print view (/admin/payouts/[id]/print): the statement drawer's "Email PDF". */
export function PayoutStatementPrint({ id }: { id: string }) {
  const { doc: p, error } = useDoc<ResellerPayout>(() => getPayout(id), "Could not load the statement");
  return (
    <PrintFrame back="/admin/partners" title={p ? `${p.partnerName} · ${monthLabel(p.periodMonth.slice(0, 7))}` : "Statement"}>
      {error ? <ErrorState message={error} /> : !p ? <div className="paper"><Skeleton style={{ height: 380 }} /></div> : (
        <div className="paper">
          <div className="paper-head">
            <div><div className="row"><span className="avatar lg">AX</span><div><h2 style={{ margin: 0 }}>Accountex</h2><small className="muted">Partner commission statement</small></div></div></div>
            <div className="doc-title"><h2>Commission statement</h2><p className="small">{monthLabel(p.periodMonth.slice(0, 7))}</p><p className="small muted">{p.status === "PAID" ? `Paid ${fmtDate(p.paidOn)}` : p.status === "DUE" ? "Due" : "Cancelled"}</p></div>
          </div>
          <div className="paper-meta">
            <div className="dl">
              <div><span>Partner</span><b>{p.partnerName}</b></div>
              <div><span>City · tier</span><b>{p.partnerCity ?? "—"} · {p.partnerTier.charAt(0) + p.partnerTier.slice(1).toLowerCase()} at {p.commissionPct}%</b></div>
              <div><span>NTN</span><b>{p.ntn ?? "—"}{p.isActiveTaxpayer ? " · active taxpayer" : ""}</b></div>
            </div>
            <div className="dl">
              <div><span>Pay to</span><b>{p.ibanMasked ?? "—"}</b></div>
              <div><span>Method</span><b>{p.payoutMethod === "CHEQUE" ? "Cheque" : `IBFT${p.bankName ? ` via ${p.bankName}` : ""}`}</b></div>
              {p.paymentRef && <div><span>Reference</span><b>{p.paymentRef}{p.whtCertificateNo ? ` · WHT cert ${p.whtCertificateNo}` : ""}</b></div>}
            </div>
          </div>
          <table className="tbl">
            <thead><tr><th>Tenant</th><th>Plan</th><th className="num">MRR (Rs)</th><th className="num">Rate</th><th className="num">Commission</th></tr></thead>
            <tbody>
              {p.statementLines.map((l) => <tr key={l.tenantId}><td><b>{l.tenantName}</b></td><td>{l.planName ?? "—"}</td><td className="num">{money(l.mrr)}</td><td className="num">{l.commissionPct}%</td><td className="num">{money(l.commission)}</td></tr>)}
              <tr className="total"><td colSpan={4}>Total commission</td><td className="num">{money(p.grossAmount)}</td></tr>
            </tbody>
          </table>
          <div className="paper-totals">
            <div><span>Gross commission</span><b>Rs {money(p.grossAmount)}</b></div>
            <div><span>WHT {p.whtRate}% u/s {p.whtSection}</span><b>− Rs {money(p.whtAmount)}</b></div>
            <div className="grand"><span>Net payable</span><b>Rs {money(p.netAmount)}</b></div>
          </div>
          <p className="small muted" style={{ textAlign: "center", marginTop: 12 }}>Withholding tax deducted under section 233 of the Income Tax Ordinance, 2001.</p>
        </div>
      )}
    </PrintFrame>
  );
}
