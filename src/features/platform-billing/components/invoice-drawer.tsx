"use client";

import { Ban, Check, Download, FileCheck2, History, Pencil, Send, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LookupsResponse, PlatformInvoiceDetail, PlatformPayment } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { getInvoice, issueInvoice } from "../api";
import { fmtDate, fmtDateTime, InvoiceStatus, LookupBadge, methodLabel, money } from "./billing-ui";
import { InvoiceFormModal, PaymentModal, RefundModal, VoidModal } from "./invoice-modals";

const PAYABLE = ["OPEN", "PARTIALLY_PAID"];

/**
 * Template admin/invoices row drawer: details, timeline and the PDF / Remind / Mark paid footer. Template-style
 * additions: the lines, payments (with refunds), draft actions (edit, issue), void and the row history.
 */
export function InvoiceDrawer({ id, lookups, onClose, onChanged }: { id: string | null; lookups: LookupsResponse; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [inv, setInv] = useState<PlatformInvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"details" | "history">("details");
  const [attempt, setAttempt] = useState(0);
  const [lastId, setLastId] = useState(id);
  const [modal, setModal] = useState<"edit" | "pay" | "void" | null>(null);
  const [refund, setRefund] = useState<PlatformPayment | null>(null);
  const [busy, setBusy] = useState(false);
  if (id && id !== lastId) { setLastId(id); setInv(null); setError(null); setView("details"); }
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getInvoice(id).then((d) => !cancelled && setInv(d)).catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load the invoice"));
    return () => { cancelled = true; };
  }, [id, attempt]);
  const changed = (d?: PlatformInvoiceDetail) => { if (d) setInv(d); setModal(null); setRefund(null); setAttempt((n) => n + 1); onChanged(); };

  const issue = async () => {
    if (!inv) return;
    setBusy(true);
    try {
      const d = await issueInvoice(inv.id, inv.rowVersion);
      toast(`Issued as ${d.docNo}`, { tone: "good" });
      changed(d);
    } catch (e) {
      toast(adminErrorMessage(e, "Could not issue the invoice"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const i = inv;
  const draft = i?.status === "DRAFT";
  return (
    <>
      <Drawer open={!!id} onClose={onClose} title={i ? (i.docNo ?? "Draft invoice") : "Invoice"} subtitle={i ? `${i.tenantName} · ${i.description}` : ""}
        foot={i ? (draft ? <>
          <button type="button" className="btn ghost" onClick={() => setModal("void")}><Ban />Void</button>
          <button type="button" className="btn secondary" onClick={() => setModal("edit")}><Pencil />Edit</button>
          <button type="button" className="btn primary" disabled={busy} onClick={issue}><FileCheck2 />{busy ? "Issuing…" : "Issue"}</button>
        </> : <>
          <Link className="btn secondary" href={`/admin/invoices/${i.id}/print`} target="_blank"><Download />PDF</Link>
          <button type="button" className="btn secondary" disabled title="Reminder emails arrive with email delivery (Phase 29)"><Send />Remind</button>
          {i.status !== "VOID" && i.paidAmount === 0 && <button type="button" className="btn ghost" onClick={() => setModal("void")}><Ban />Void</button>}
          {PAYABLE.includes(i.status) && <button type="button" className="btn primary" onClick={() => setModal("pay")}><Check />Mark paid</button>}
        </>) : undefined}>
        {error ? <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} /> : !i ? <Skeleton style={{ height: 260 }} /> : (
          <>
            <div className="seg">
              <button type="button" className={view === "details" ? "active" : undefined} onClick={() => setView("details")}>Details</button>
              <button type="button" className={view === "history" ? "active" : undefined} onClick={() => setView("history")}><History />History</button>
            </div>
            {view === "history" ? <div className="ap-mt"><AdminHistoryTab table="PlatformInvoices" id={i.id} reloadKey={attempt} /></div> : (
              <>
                <div className="dl ap-mt">
                  <div><span>Tenant</span><b><Link className="link" href={`/admin/tenants/${i.tenantId}`}>{i.tenantName}</Link> · {i.tenantCode.toUpperCase()}</b></div>
                  <div><span>Description</span><b>{i.description}</b></div>
                  <div><span>Kind</span><b>{labelOf(lookups, "InvoiceKind", i.invoiceKind)}{i.periodStart ? ` · ${fmtDate(i.periodStart)} – ${fmtDate(i.periodEnd)}` : ""}</b></div>
                  <div><span>Issued</span><b>{fmtDate(i.issuedOn)}</b></div>
                  <div><span>Due</span><b>{fmtDate(i.dueOn)}{i.overdue ? ` · ${i.daysOverdue} d overdue` : ""}</b></div>
                  <div><span>Subtotal</span><b>{money(i.grossAmount)}</b></div>
                  {i.discountAmount > 0 && <div><span>Discount{i.couponCode ? ` (${i.couponCode})` : ""}</span><b>− {money(i.discountAmount)}</b></div>}
                  <div><span>Tax{i.taxRate ? ` ${i.taxRate}%` : ""}{i.taxAuthorityCode ? ` · ${i.taxAuthorityCode}` : ""}</span><b>{money(i.taxAmount)}</b></div>
                  <div><span>Total (Rs)</span><b>{money(i.totalAmount)}</b></div>
                  <div><span>Paid · balance</span><b>{money(i.paidAmount)} · {money(i.balanceAmount)}</b></div>
                  <div><span>Status</span><b><InvoiceStatus inv={i} lookups={lookups} />{i.dunningStage && <> <LookupBadge lookups={lookups} type="DunningCaseStage" code={i.dunningStage} /></>}</b></div>
                  {i.voidReason && <div><span>Void reason</span><b>{i.voidReason}</b></div>}
                </div>

                <h4 className="mt">Lines</h4>
                <div className="table-wrap"><table className="tbl" data-plain>
                  <thead><tr><th>#</th><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {i.lines.map((l) => <tr key={l.id}><td>{l.lineNo}</td><td><b>{l.description}</b><small>{labelOf(lookups, "LineKind", l.lineKind)}</small></td><td className="num">{l.quantity}</td><td className="num">{money(l.unitPrice)}</td><td className="num">{money(l.amount)}</td></tr>)}
                  </tbody>
                </table></div>

                {i.payments.length > 0 && (
                  <>
                    <h4 className="mt">Payments</h4>
                    <div className="list">
                      {i.payments.map((p) => (
                        <div key={p.id} className="list-item">
                          <div><b>Rs {money(p.amount)} · {methodLabel(p.paymentMethod)}</b>
                            <small>{p.paidAt ? fmtDateTime(p.paidAt) : fmtDateTime(p.attemptedAt)}{p.paymentRef ? ` · ${p.paymentRef}` : ""}{p.recordedBy ? ` · ${p.recordedBy}` : ""}{p.failureMessage ? ` · ${p.failureMessage}` : ""}{p.refundedAmount ? ` · refunded Rs ${money(p.refundedAmount)}` : ""}</small></div>
                          <span className="spacer" />
                          <LookupBadge lookups={lookups} type="PlatformPaymentStatus" code={p.status} />
                          {["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status) && <button type="button" className="icon-btn-sm" aria-label="Refund" title="Refund" onClick={() => setRefund(p)}><Undo2 /></button>}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <h4 className="mt">Timeline</h4>
                <div className="timeline">
                  <div className="tl-item"><span className="tl-dot" /><div><b>{draft ? "Draft created" : "Issued"}</b><small>{draft ? fmtDateTime(i.createdAt) : `${fmtDate(i.issuedOn)} · ${i.docNo}`}</small></div></div>
                  <div className="tl-item"><span className={cn("tl-dot", i.overdue && "danger")} /><div><b>Due</b><small>{fmtDate(i.dueOn)}</small></div></div>
                  {[...i.payments].reverse().filter((p) => p.status !== "FAILED").map((p) => (
                    <div key={p.id} className="tl-item"><span className="tl-dot good" /><div><b>Payment Rs {money(p.amount)}</b><small>{fmtDateTime(p.paidAt ?? p.attemptedAt)} · {methodLabel(p.paymentMethod)}</small></div></div>
                  ))}
                  {i.voidedAt && <div className="tl-item"><span className="tl-dot danger" /><div><b>Voided</b><small>{fmtDateTime(i.voidedAt)}</small></div></div>}
                </div>
              </>
            )}
          </>
        )}
      </Drawer>
      <InvoiceFormModal open={modal === "edit"} invoice={inv} lookups={lookups} onClose={() => setModal(null)} onSaved={(d) => changed(d)} />
      <PaymentModal invoice={modal === "pay" ? inv : null} onClose={() => setModal(null)} onDone={(d) => changed(d)} />
      <VoidModal invoice={modal === "void" ? inv : null} onClose={() => setModal(null)} onDone={(d) => changed(d)} />
      <RefundModal payment={refund} onClose={() => setRefund(null)} onDone={() => changed()} />
    </>
  );
}
