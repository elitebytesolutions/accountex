"use client";

import "./sales-invoice-view.css";
import { ArrowLeft, Ban, BadgeDollarSign, Download, FileMinus2, Printer, QrCode, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { amountInWords, type SalesDocOptions, type SalesInvoice } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { Banner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, Money } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { getCompanySettings } from "@/features/settings/api";
import { ApiError } from "@/lib/api/errors";
import { voidInvoice } from "../api";

export type InvoiceCan = { create: boolean; edit: boolean; delete: boolean; post: boolean };
/** What the printed invoice shows about the seller: the workspace name, plus the company profile when the user may read it. */
export type InvoiceCompany = { name: string; canView: boolean };
type Profile = { name: string; address: string | null; ntn: string | null; strn: string | null; phone: string | null; email: string | null };

const STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  POSTED: { label: "Posted", tone: "info" },
  PARTIALLY_PAID: { label: "Partially Paid", tone: "warn" },
  PAID: { label: "Paid", tone: "good" },
  VOID: { label: "Void", tone: "danger" },
};

/** Status badge for a sales invoice; open invoices past their due date show Overdue. */
export function InvoiceStatusBadge({ inv, dot = true }: { inv: Pick<SalesInvoice, "status" | "overdue" | "awaitingApproval">; dot?: boolean }) {
  if (inv.status === "DRAFT" && inv.awaitingApproval) return <span className={cn("badge warn", dot && "dot")}>Awaiting approval</span>;
  if (inv.overdue && (inv.status === "POSTED" || inv.status === "PARTIALLY_PAID")) return <span className={cn("badge danger", dot && "dot")}>Overdue</span>;
  const s = STATUS[inv.status] ?? { label: inv.status, tone: "neutral" };
  return <span className={cn("badge", s.tone, dot && "dot")}>{s.label}</span>;
}

const qtyFmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
const dec = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000);
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "AX";
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/**
 * Template app/sales/invoices/view (41-acc-trade.html): the printed sales tax invoice ("paper") with payment status,
 * activity and details beside it. Print and PDF use the browser's print dialog; print CSS shows only the paper.
 * Render it inside <Screen route="app/sales/invoices/view" className="siv">.
 */
export function SalesInvoiceView({ inv, opts, company, can, onChange, onBack }: {
  inv: SalesInvoice; opts: SalesDocOptions | null; company: InvoiceCompany; can: InvoiceCan; onChange: (inv: SalesInvoice) => void;
  /** Draft preview: Back returns to the editor instead of the invoice list. */
  onBack?: () => void;
}) {
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!company.canView) return;
    let off = false;
    getCompanySettings()
      .then((c) => {
        if (off || !c.saved) return;
        setProfile({
          name: c.legalName || company.name, address: [c.registeredAddress, c.city].filter(Boolean).join(", ") || null, ntn: c.ntn || null, strn: c.strn ?? null,
          phone: c.phone ?? null, email: c.email ?? null,
        });
      })
      .catch(() => undefined);
    return () => { off = true; };
  }, [company.canView, company.name]);

  const seller: Profile = profile ?? { name: company.name, address: inv.branch.name, ntn: null, strn: null, phone: null, email: null };
  const terms = opts?.paymentTerms.find((t) => t.code === inv.paymentTerms)?.label ?? inv.paymentTerms.replace(/_/g, " ").toLowerCase();
  const open = inv.status === "POSTED" || inv.status === "PARTIALLY_PAID";
  const paidPct = inv.netAmount > 0 ? Math.min(100, Math.round((inv.paidAmount / inv.netAmount) * 100)) : 0;
  const dueIn = daysBetween(todayIso(), inv.dueDate);
  const fbrNo = inv.fbrInvoiceNo ?? (inv.fbrStatus === "PENDING" ? "Queued for FBR" : inv.submitToFbr ? "—" : "Not reported to FBR");
  const taxRates = [...new Set(inv.lines.filter((l) => l.taxAmount > 0).map((l) => l.taxRate))];
  const gstHead = taxRates.length === 1 ? `GST ${taxRates[0]}%` : "GST";
  const totalQty = inv.lines.reduce((s, l) => s + l.baseQty + l.bonusQty, 0);

  // activity, newest first (template order)
  const activity: { at: string; title: string; sub: string; tone?: string }[] = [];
  activity.push({ at: inv.createdAt, title: `Created${inv.channel === "COUNTER" ? " · counter sales voucher" : ""}`, sub: `${dateLabel(inv.createdAt)}${inv.createdBy ? ` · by ${inv.createdBy.name}` : ""}` });
  if (inv.postedAt) activity.push({ at: inv.postedAt, title: `Posted${inv.journal ? ` · ${inv.journal.docNo}` : ""}`, sub: `${dateLabel(inv.postedAt)}${inv.postedBy ? ` · by ${inv.postedBy.name}` : ""}`, tone: "good" });
  if (inv.postedAt && inv.submitToFbr) {
    const at = inv.postedAt;
    if (inv.fbrInvoiceNo) activity.push({ at, title: "FBR invoice number received", sub: inv.fbrInvoiceNo, tone: "good" });
    else if (inv.fbrError) activity.push({ at, title: "FBR reporting failed", sub: inv.fbrError, tone: "danger" });
    else if (inv.fbrStatus === "PENDING") activity.push({ at, title: "Queued for FBR", sub: "Reported when the FBR integration runs", tone: "warn" });
  }
  if (inv.voidedAt) activity.push({ at: inv.voidedAt, title: "Voided", sub: `${dateLabel(inv.voidedAt)}${inv.voidReason ? ` · ${inv.voidReason}` : ""}`, tone: "danger" });
  activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const confirmVoid = async () => {
    const r = reason.trim();
    if (r.length < 3) { setReasonErr("Give a reason"); return; }
    setBusy(true);
    try {
      const x = await voidInvoice(inv.id, inv.rowVersion, r);
      setAsking(false);
      setReason("");
      onChange(x);
      toast(`${x.docNo} voided · journal and stock reversed`, { tone: "good" });
    } catch (e) {
      if (e instanceof ApiError && e.details?.reason) setReasonErr(e.details.reason[0] ?? "");
      toast(e instanceof ApiError ? e.message : "Something went wrong — try again", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Sales / Invoices / {inv.docNo}{onBack ? " / Preview" : ""}</div>
          <h1>{inv.docNo} <InvoiceStatusBadge inv={inv} /></h1>
          <p>{inv.customer.name} · issued {dateLabel(inv.docDate)} · due {dateLabel(inv.dueDate)} · {inv.branch.name}</p>
        </div>
        <div className="head-actions">
          {onBack ? <Button variant="ghost" icon={<ArrowLeft />} onClick={onBack}>Back to editor</Button> : <Link className="btn ghost" href="/sales/invoices"><ArrowLeft />Back</Link>}
          <Button icon={<Printer />} onClick={() => window.print()}>Print</Button>
          <Button icon={<Download />} title="Choose “Save as PDF” in the print dialog" onClick={() => window.print()}>PDF</Button>
          <Button icon={<Send />} disabled title="Emailing invoices arrives in a later phase">Send</Button>
          {can.post && inv.status === "POSTED" && <Button variant="ghost" icon={<Ban />} disabled={busy} onClick={() => { setReasonErr(""); setAsking(true); }}>Void</Button>}
          {open && <Link className="btn secondary" href={`/sales/credit-notes?invoice=${inv.id}`}><FileMinus2 />Credit note</Link>}
          {open && <Link className="btn primary" href={`/receivables/receipts?invoice=${inv.id}`}><BadgeDollarSign />Record Payment</Link>}
        </div>
      </div>

      {inv.status === "VOID" && (
        <Banner tone="danger" title={`${inv.docNo} is void`}>
          {`Voided ${dateLabel(inv.voidedAt)}${inv.voidReason ? `: ${inv.voidReason}` : ""}. The journal and stock issue were reversed.`}
        </Banner>
      )}
      {inv.fbrError && inv.status !== "VOID" && <Banner tone="warn" title="FBR reporting failed">{inv.fbrError}</Banner>}

      <div className="split">
        <div className="paper siv-paper">
          {inv.status === "VOID" && <div className="siv-void" aria-hidden>VOID</div>}
          <div className="paper-head">
            <div>
              <div className="row">
                <span className="avatar lg">{initials(seller.name)}</span>
                <div>
                  <h2 style={{ margin: 0 }}>{seller.name}</h2>
                  <small className="muted">{[seller.address, seller.phone, seller.email].filter(Boolean).join(" · ")}</small>
                </div>
              </div>
              {(seller.ntn || seller.strn) && <p className="small muted" style={{ marginTop: 8 }}>{[seller.ntn && `NTN ${seller.ntn}`, seller.strn && `STRN ${seller.strn}`].filter(Boolean).join(" · ")}</p>}
            </div>
            <div className="right">
              <h2 style={{ margin: 0, letterSpacing: ".04em" }}>SALES TAX INVOICE</h2>
              <p className="small">{inv.docNo}</p>
              <div className="small muted siv-qr"><QrCode />FBR QR</div>
            </div>
          </div>
          <div className="paper-meta">
            <div className="dl">
              <div><span>Bill to</span><b>{inv.buyer.name ?? inv.customer.name}</b></div>
              <div><span>Address</span><b>{[inv.buyer.address, inv.buyer.city].filter(Boolean).join(", ") || "—"}</b></div>
              <div><span>NTN / STRN</span><b>{[inv.buyer.ntn ?? (inv.buyer.cnic ? `CNIC ${inv.buyer.cnic}` : null), inv.buyer.strn].filter(Boolean).join(" · ") || "Unregistered"}</b></div>
            </div>
            <div className="dl">
              <div><span>Invoice date</span><b>{dateLabel(inv.docDate)}</b></div>
              <div><span>Due date</span><b>{dateLabel(inv.dueDate)} ({terms})</b></div>
              <div><span>Customer PO / SO</span><b>{[inv.customerPoNo, inv.salesOrder?.docNo].filter(Boolean).join(" · ") || "—"}</b></div>
              <div><span>FBR invoice #</span><b>{fbrNo}</b></div>
            </div>
          </div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>Description</th><th>HS Code</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Value excl. tax</th><th className="num">{gstHead}</th><th className="num">Total</th></tr></thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.lineNo}</td>
                  <td><b>{l.item?.name ?? l.description ?? "Line"}</b><small>{[l.item?.sku, l.item && l.description && l.description !== l.item.name ? l.description : null, l.discountPct ? `less ${l.discountPct}% discount` : null].filter(Boolean).join(" · ")}</small></td>
                  <td>{l.hsCode ?? "—"}</td>
                  <td className="num">{qtyFmt(l.baseQty)}{l.bonusQty > 0 && <small>+ {qtyFmt(l.bonusQty)} bonus</small>}</td>
                  <td className="num">{dec(l.rate)}</td>
                  <td className="num">{dec(l.taxableAmount)}</td>
                  <td className="num">{dec(l.taxAmount)}</td>
                  <td className="num">{dec(l.totalAmount)}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={5}>Total</td><td className="num">{dec(inv.taxableAmount)}</td><td className="num">{dec(inv.taxAmount)}</td><td className="num">{dec(inv.netAmount)}</td></tr>
            </tbody>
          </table></div>
          <div className="paper-totals">
            <div className="dl">
              {inv.discountAmount > 0 && <div><span>Gross value</span><b><Money value={inv.grossAmount} /></b></div>}
              {inv.discountAmount > 0 && <div><span>Discount</span><b>− <Money value={inv.discountAmount} /></b></div>}
              <div><span>Value excluding sales tax</span><b><Money value={inv.taxableAmount} /></b></div>
              <div><span>Sales tax{taxRates.length === 1 ? ` @ ${taxRates[0]}%` : ""}</span><b><Money value={inv.taxAmount} /></b></div>
              <div><span>Further tax</span><b><Money value={inv.furtherTaxAmount} /></b></div>
              <div><span><strong>Total invoice value</strong></span><b><Money value={inv.netAmount} /></b></div>
              {inv.status !== "VOID" && <div><span>Received to date</span><b><Money value={inv.paidAmount} /></b></div>}
              {inv.status !== "VOID" && <div><span><strong>Balance due</strong></span><b><Money value={inv.balanceAmount} /></b></div>}
            </div>
          </div>
          <p className="small"><b>Amount in words:</b> {amountInWords(inv.netAmount)}.</p>
          <div className="paper-foot">
            <div className="grid-3">
              <div><b className="small">Notes</b><p className="small muted siv-pre">{inv.customerNotes || "Thank you for your business."}</p></div>
              <div><b className="small">Terms</b><p className="small muted siv-pre">{inv.termsConditions || `Payment ${terms}. Due ${dateLabel(inv.dueDate)}.`}</p></div>
              <div className="right">
                <div className="siv-sign" />
                <b className="small">{inv.postedBy?.name ?? inv.createdBy?.name ?? "Authorised signatory"}</b>
                <p className="small muted">Authorised signatory</p>
              </div>
            </div>
            <p className="small muted siv-note">Computer-generated invoice{inv.submitToFbr ? ", reported to FBR on posting. Scan the QR code to verify." : "."}</p>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Payment status</h3><p>{inv.status === "VOID" ? "Void — nothing due" : `${paidPct}% settled`}</p></div><InvoiceStatusBadge inv={inv} dot={false} /></div>
            <div className={cn("progress", inv.overdue && open && "danger")}><i style={{ width: `${paidPct}%` }} /></div>
            <div className="dl mt">
              <div><span>Invoice total</span><b><Money value={inv.netAmount} dec={0} /></b></div>
              <div><span>Received</span><b className="dr"><Money value={inv.paidAmount} dec={0} /></b></div>
              <div><span>Balance due</span><b><Money value={inv.status === "VOID" ? 0 : inv.balanceAmount} dec={0} /></b></div>
              {open && <div><span>{dueIn >= 0 ? "Due in" : "Overdue by"}</span><b className={cn(dueIn < 0 && "neg")}>{Math.abs(dueIn)} day{Math.abs(dueIn) === 1 ? "" : "s"}</b></div>}
            </div>
            {open && <Link className="btn primary mt siv-wide" href={`/receivables/receipts?invoice=${inv.id}`}><BadgeDollarSign />Record payment</Link>}
            {open && <Link className="btn secondary mt siv-wide" href={`/sales/credit-notes?invoice=${inv.id}`}><FileMinus2 />Credit note</Link>}
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Activity</h3><p>Posting &amp; FBR events</p></div></div>
            <div className="timeline">
              {activity.map((a, i) => (
                <div className="tl-item" key={i}><span className={cn("tl-dot", a.tone)} /><div><b>{a.title}</b><small>{a.sub}</small></div></div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Details</h3></div></div>
            <div className="dl">
              <div><span>Customer</span><b><Link className="link" href={`/customers/${inv.customer.id}`}>{inv.customer.name}</Link></b></div>
              <div><span>Sales rep</span><b>{inv.salesRep?.name ?? "—"}</b></div>
              <div><span>Branch / Warehouse</span><b>{inv.branch.name}{inv.warehouse && inv.warehouse.name !== inv.branch.name ? ` · ${inv.warehouse.name}` : ""}</b></div>
              {inv.salesOrder && <div><span>Sales order</span><b><Link className="link" href={`/sales/orders?so=${inv.salesOrder.id}`}>{inv.salesOrder.docNo}</Link></b></div>}
              {inv.deliveryChallan && <div><span>Delivery challan</span><b><Link className="link" href={`/sales/challans?dc=${inv.deliveryChallan.id}`}>{inv.deliveryChallan.docNo}</Link></b></div>}
              {inv.priceList && <div><span>Price list</span><b>{inv.priceList.name}</b></div>}
              {inv.channel === "COUNTER" && inv.salesmanName && <div><span>Salesman</span><b>{inv.salesmanName}</b></div>}
              <div><span>GL voucher</span><b>{inv.journal ? <Link className="link" href={`/accounting/vouchers/${inv.journal.id}`}>{inv.journal.docNo}</Link> : "—"}</b></div>
              <div><span>Units</span><b>{qtyFmt(totalQty)} on {inv.lines.length} line{inv.lines.length === 1 ? "" : "s"}</b></div>
            </div>
          </div>

          <div className="panel siv-hist">
            <div className="panel-head"><div><h3>History</h3><p>Who changed this invoice</p></div></div>
            <HistoryTab schema="Sales" table="SalesInvoices" id={inv.id} />
          </div>
        </div>
      </div>

      <Modal open={asking} onClose={() => { if (!busy) { setAsking(false); setReason(""); } }} title={`Void ${inv.docNo}?`}
        subtitle="The journal and stock issue are reversed; order and challan quantities go back to be invoiced again."
        foot={<><Button disabled={busy} onClick={() => { setAsking(false); setReason(""); }}>Cancel</Button><Button variant="primary" icon={<Ban />} disabled={busy} onClick={() => void confirmVoid()}>{busy ? "Voiding…" : "Void invoice"}</Button></>}>
        <FormGrid cols={1}>
          <Field label="Reason" required full error={reasonErr}>
            <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(""); }} />
          </Field>
        </FormGrid>
      </Modal>
    </>
  );
}
