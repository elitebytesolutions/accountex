"use client";

import { ArrowRight, FilePlus2, Receipt } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { LookupsResponse } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { generateInvoices, getTenantDunning, listInvoices } from "../api";
import { BILLING_LOOKUPS, fmtDate, InvoiceStatus, money, useLoad } from "./billing-ui";
import { InvoiceDrawer } from "./invoice-drawer";

/**
 * Tenant 360 › Billing › Invoices (template 9B-admin-plus.js 545–549): the company's platform invoices with a link to
 * all invoices; a row opens the invoice drawer. Template-style addition: "Generate invoice" for the current period
 * (with an optional coupon code).
 */
export function TenantInvoicesPanel({ tenantId, tenantCode, lookups, hasSubscription, onChanged }: {
  tenantId: string; tenantCode: string; lookups: LookupsResponse; hasSubscription: boolean; onChanged?: () => void;
}) {
  const { data, error, reload } = useLoad(() => listInvoices({ tenantId, pageSize: 50 }), "Could not load the invoices", [tenantId]);
  const billing = useAdminLookups(BILLING_LOOKUPS);
  const lk = { ...lookups, ...billing };
  const [open, setOpen] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const changed = () => { reload(); onChanged?.(); };
  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Invoices</h3><p>Platform invoices for {tenantCode.toUpperCase()}</p></div>
        <div className="panel-actions">
          {hasSubscription && <button type="button" className="btn secondary sm" onClick={() => setGenerating(true)}><FilePlus2 />Generate</button>}
          <Link className="btn ghost sm" href="/admin/invoices">All invoices<ArrowRight /></Link>
        </div>
      </div>
      {error ? <div style={{ padding: 16 }}><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div> : !data ? <div style={{ padding: 16 }}><Skeleton style={{ height: 120 }} /></div> : data.items.length === 0 ? (
        <EmptyState icon={<Receipt />} title="No platform invoices yet" description="The daily billing run invoices the subscription's period; one-off charges are Manual invoices." />
      ) : (
        <div className="table-wrap"><table className="tbl" data-plain>
          <thead><tr><th>Invoice</th><th>Period</th><th>Issued</th><th className="num">Amount (Rs)</th><th className="num">Sales tax</th><th>Status</th></tr></thead>
          <tbody>{data.items.map((i) => (
            <tr key={i.id} style={{ cursor: "pointer" }} onClick={() => setOpen(i.id)}>
              <td><b className="tnum">{i.docNo ?? "Draft"}</b></td>
              <td>{i.periodStart ? `${fmtDate(i.periodStart)} – ${fmtDate(i.periodEnd)}` : i.description}</td>
              <td>{fmtDate(i.issuedOn)}</td>
              <td className="num">{money(i.netAmount)}</td>
              <td className="num">{money(i.taxAmount)}{i.taxRate ? <small>{i.taxAuthorityCode ?? "PST"} {i.taxRate}%</small> : null}</td>
              <td><InvoiceStatus inv={i} lookups={lk} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <InvoiceDrawer id={open} lookups={lk} onClose={() => setOpen(null)} onChanged={changed} />
      <GenerateModal open={generating} tenantId={tenantId} onClose={() => setGenerating(false)} onDone={(id) => { setGenerating(false); changed(); if (id) setOpen(id); }} />
    </div>
  );
}

function GenerateModal({ open, tenantId, onClose, onDone }: { open: boolean; tenantId: string; onClose: () => void; onDone: (invoiceId: string | null) => void }) {
  const toast = useToast();
  const [coupon, setCoupon] = useState("");
  const [period, setPeriod] = useState("");
  const [issue, setIssue] = useState(true);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErrs({});
    try {
      const r = await generateInvoices(period || undefined, { tenantId, couponCode: coupon || null, issue });
      const inv = r.invoices[0] ?? null;
      toast(r.generated ? `${inv?.docNo ?? "Draft"} generated · Rs ${money(inv?.totalAmount ?? 0)}` : `This period is already invoiced (${inv?.docNo ?? "draft"})`, { tone: r.generated ? "good" : "info" });
      onDone(inv?.id ?? null);
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not generate the invoice"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Generate subscription invoice" subtitle="Plan, active add-ons, coupon discount and provincial sales tax"
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}><FilePlus2 />{busy ? "Generating…" : "Generate"}</button></>}>
      <FormGrid>
        <Field label="Period starting" hint="Blank = the current period" error={errs.period}><input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
        <Field label="Coupon code" hint="Redeemed once per company" error={errs.couponCode}><input value={coupon} maxLength={24} placeholder="e.g. FINSOFT-STARTUP50" onChange={(e) => setCoupon(e.target.value.toUpperCase())} /></Field>
      </FormGrid>
      <div className="ap-switches"><Switch label="Issue it now (assigns the FS-INV number)" checked={issue} onChange={(e) => setIssue(e.target.checked)} /></div>
    </Modal>
  );
}

const STEPS: [string, string[]][] = [["Paid", ["ACTIVE", "TRIAL"]], ["Grace", ["PAST_DUE"]], ["Read-only", ["READ_ONLY"]], ["Suspended", ["SUSPENDED"]]];

/** Tenant 360 › Billing › Dunning state (template 9B-admin-plus.js 553–555): policy, the stage track and the open case. */
export function TenantDunningPanel({ tenantId, reloadKey }: { tenantId: string; reloadKey?: unknown }) {
  const { data, error, reload } = useLoad(() => getTenantDunning(tenantId), "Could not load the dunning state", [tenantId, reloadKey]);
  const c = data?.case;
  const open = c && !c.closedAt ? c : null;
  const p = data?.policy;
  return (
    <div className="panel">
      <div className="panel-head"><div><h3>Dunning state</h3><p>{p ? `Policy: ${p.graceDays} d grace → ${p.readOnlyDays} d read-only → suspend` : data ? "No active dunning policy" : "Loading…"}</p></div>
        {open && <div className="panel-actions"><Link className="btn ghost sm" href="/admin/dunning">Collections<ArrowRight /></Link></div>}</div>
      {error ? <ErrorState message={error.message} reference={error.reference} onRetry={reload} /> : !data ? <Skeleton style={{ height: 90 }} /> : (
        <>
          <div className="ap-dstate">
            {STEPS.map(([label, statuses]) => <div key={label} className={cn(statuses.includes(data.tenantStatus) && "on")}><i /><span>{label}</span></div>)}
          </div>
          <div className="dl ap-mt">
            <div><span>Balance due</span><b>{open ? `Rs ${money(open.balance)}` : "Rs 0"}</b></div>
            <div><span>Due</span><b>{open ? `${fmtDate(open.dueOn)} · ${open.daysOverdue} d overdue` : "—"}</b></div>
            <div><span>Failed attempts</span><b>{open ? open.attempts.filter((a) => a.status === "FAILED").length : 0}</b></div>
            {open && open.stage === "PROMISE" && <div><span>Promise to pay</span><b>{fmtDate(open.promiseDate)}{open.promiseAmount ? ` · Rs ${money(open.promiseAmount)}` : ""}</b></div>}
            {c && c.closedAt && <div><span>Last case</span><b>{c.docNo} · {c.stage.toLowerCase().replace("_", " ")} {fmtDate(c.closedAt)}</b></div>}
          </div>
        </>
      )}
    </div>
  );
}
