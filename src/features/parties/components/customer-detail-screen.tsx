"use client";

import {
  AlertTriangle, ArrowLeft, BadgeDollarSign, CalendarDays, FileText, Gauge, Mail, MapPin, MoreHorizontal, Pencil, Plus, Receipt, Trash2, UserPlus, Wallet, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { partyInitials, type CustomerAddress, type CustomerContact, type CustomerDetail, type HistoryItem } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Menu } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { getHistory } from "@/features/history/api";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  addCustomerAddress, addCustomerContact, addCustomerNote, deleteCustomer, deleteCustomerAddress, deleteCustomerContact, deleteCustomerNote, getCustomer,
  setCustomerStatus, updateCustomerAddress, updateCustomerContact,
} from "../api";
import { CustomerForm } from "./customer-form";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Tab = "overview" | "invoices" | "receipts" | "statement" | "contacts" | "addresses" | "notes" | "history";
type Dialog =
  | { kind: "contact"; row: CustomerContact | null; f: Record<string, string | boolean> }
  | { kind: "address"; row: CustomerAddress | null; f: Record<string, string | boolean> }
  | { kind: "status"; status: string; holdReason: string };
const LOOKUPS = ["CustomerStatus", "CustomerPaymentTerms", "CustomerAtlStatus", "CustomerHoldReason", "DefaultWhtSection", "CustomerType", "AddressType", "Province"];
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
/** Date-only values (YYYY-MM-DD) are calendar dates: format them in UTC so no time zone shifts the day. */
const date = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(iso.length === 10 && { timeZone: "UTC" }) }) : "—");
const v = (x: string | null | undefined) => x || "—";

/**
 * Template app/customers/view (41-acc-trade.html): profile head, KPIs and tabs. Contacts, Addresses (added) and Notes
 * are live; Invoices, Receipts and Statement fill from Phase 23–24; History is the customer's row history.
 */
export function CustomerDetailScreen({ id, meId, can }: { id: string; meId: string; can: Can }) {
  const router = useRouter();
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [activity, setActivity] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<unknown>; done: string; leave?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCustomer(id), getHistory("Sales", "Customers", id, 1, 4)])
      .then(([x, h]) => { if (!cancelled) { setC(x); setActivity(h.items); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the customer" }));
    return () => { cancelled = true; };
  }, [id, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const run = async (work: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(true);
    setErrs({});
    try {
      await work();
      toast(done, { tone: "good" });
      after?.();
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!c) return <div className="panel"><Skeleton style={{ height: 160 }} /></div>;

  const util = c.creditLimit ? Math.round((c.balance / c.creditLimit) * 100) : 0;
  const statusBadge = <span className={cn("badge dot", toneOf(lookups, "CustomerStatus", c.status))}>{labelOf(lookups, "CustomerStatus", c.status)}{c.holdReason ? ` · ${labelOf(lookups, "CustomerHoldReason", c.holdReason)}` : ""}</span>;
  const setF = (k: string, val: string | boolean) => setDialog((d) => (d && d.kind !== "status" ? { ...d, f: { ...d.f, [k]: val } } : d));
  const fs = (k: string) => (dialog && dialog.kind !== "status" ? String(dialog.f[k] ?? "") : "");
  const fb = (k: string) => (dialog && dialog.kind !== "status" ? Boolean(dialog.f[k]) : false);
  const openContact = (row: CustomerContact | null) => { setErrs({}); setDialog({ kind: "contact", row, f: { fullName: row?.fullName ?? "", designation: row?.designation ?? "", mobile: row?.mobile ?? "", phone: row?.phone ?? "", email: row?.email ?? "", isPrimary: row?.isPrimary ?? false, receivesInvoices: row?.receivesInvoices ?? false } }); };
  const openAddress = (row: CustomerAddress | null) => { setErrs({}); setDialog({ kind: "address", row, f: { addressType: row?.addressType ?? "SHIPPING", label: row?.label ?? "", addressLine: row?.addressLine ?? "", area: row?.area ?? "", city: row?.city ?? "", province: row?.province ?? "", contactName: row?.contactName ?? "", contactPhone: row?.contactPhone ?? "", isDefault: row?.isDefault ?? false } }); };
  const saveDialog = () => {
    if (!dialog) return;
    if (dialog.kind === "status") {
      void run(() => setCustomerStatus(c.id, { status: dialog.status, holdReason: dialog.status === "ON_HOLD" ? dialog.holdReason || null : null, rowVersion: c.rowVersion }), `${c.name} is now ${labelOf(lookups, "CustomerStatus", dialog.status).toLowerCase()}`, () => setDialog(null));
    } else if (dialog.kind === "contact") {
      void run(() => (dialog.row ? updateCustomerContact(dialog.row.id, { ...dialog.f, rowVersion: dialog.row.rowVersion }) : addCustomerContact(c.id, dialog.f)), `${String(dialog.f.fullName)} saved`, () => setDialog(null));
    } else {
      void run(() => (dialog.row ? updateCustomerAddress(dialog.row.id, { ...dialog.f, rowVersion: dialog.row.rowVersion }) : addCustomerAddress(c.id, dialog.f)), `${String(dialog.f.label)} saved`, () => setDialog(null));
    }
  };
  const later = (title: string, phase: string) => <EmptyState icon={<FileText />} title={title} description={`Appears here once ${phase}.`} />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Receivables / Customers / {c.code}</div>
          <h1>Customer Detail</h1>
          <p>Account overview, transactions and statement.</p>
        </div>
        <div className="head-actions">
          <Link className="btn ghost" href="/customers"><ArrowLeft />All customers</Link>
          <button type="button" className="btn secondary" disabled title="Statements arrive with sales invoices (Phase 23)"><Mail />Email statement</button>
          <button type="button" className="btn primary" disabled title="Sales invoices arrive in Phase 23"><Plus />New Invoice</button>
        </div>
      </div>

      <div className="panel mb">
        <div className="profile-head">
          <span className="avatar xl">{partyInitials(c.name)}</span>
          <div>
            <h2>{c.name}</h2>
            <p>{[c.code, c.group?.name, c.customerSince ? `Customer since ${date(c.customerSince)}` : null, [c.billingAddress, c.city].filter(Boolean).join(", ") || null].filter(Boolean).join(" · ")}</p>
            <div className="row">
              {c.status !== "ACTIVE" && statusBadge}
              <span className={cn("badge", toneOf(lookups, "CustomerAtlStatus", c.atlStatus))}>{labelOf(lookups, "CustomerAtlStatus", c.atlStatus)}</span>
              {c.isSalesTaxRegistered && <span className="badge info">STRN registered</span>}
              {c.salesRep && <span className="badge neutral">Sales rep: {c.salesRep.name}</span>}
            </div>
          </div>
          <div className="head-actions">
            {can.edit && <button type="button" className="btn secondary sm" onClick={() => setEditing((n) => n + 1)}><Pencil />Edit</button>}
            <button type="button" className="btn secondary sm" disabled title="Receipts arrive in Phase 24"><BadgeDollarSign />Receive payment</button>
            {(can.edit || can.remove) && <button type="button" className="btn ghost sm" aria-label="More actions" onClick={(e) => setMenu(e.currentTarget)}><MoreHorizontal /></button>}
          </div>
        </div>
      </div>

      <div className="kpi-grid mb">
        <div className="kpi blue"><div className="kpi-top"><span>Balance</span><span className="icon-well"><Wallet /></span></div><strong>{rs(c.balance)}</strong><small>0 open invoices</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Overdue</span><span className="icon-well"><AlertTriangle /></span></div><strong>{rs(c.overdue)}</strong><small>Nothing overdue</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Credit Limit Used</span><span className="icon-well"><Gauge /></span></div><strong>{util}%</strong>
          <div className={cn("progress", util > 100 ? "danger" : util >= 80 ? "warn" : "")} style={{ margin: "6px 0" }}><i style={{ width: `${Math.min(100, util)}%` }} /></div>
          <small>{rs(Math.max(0, c.creditLimit - c.balance))} of {rs(c.creditLimit)} available</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Avg Days to Pay</span><span className="icon-well"><CalendarDays /></span></div><strong>—</strong><small>Terms: {labelOf(lookups, "CustomerPaymentTerms", c.paymentTerms)} ({c.creditDays} days)</small></div>
      </div>

      <div className="panel">
        <Tabs<Tab> active={tab} onChange={setTab} items={[
          { key: "overview", label: "Overview" }, { key: "invoices", label: "Invoices" }, { key: "receipts", label: "Receipts" }, { key: "statement", label: "Statement" },
          { key: "contacts", label: "Contacts", count: c.contacts.length }, { key: "addresses", label: "Addresses", count: c.addresses.length },
          { key: "notes", label: "Notes", count: c.notes.length }, { key: "history", label: "History" },
        ]} />

        {tab === "overview" && (
          <div className="grid-3 mt">
            <div>
              <h4>Customer details</h4>
              <div className="dl">
                <div><span>Type</span><b>{labelOf(lookups, "CustomerType", c.customerType)}</b></div>
                <div><span>NTN</span><b>{v(c.ntn)}</b></div>
                {c.cnic && <div><span>CNIC</span><b>{c.cnic}</b></div>}
                <div><span>STRN</span><b>{v(c.strn)}</b></div>
                <div><span>Payment terms</span><b>{labelOf(lookups, "CustomerPaymentTerms", c.paymentTerms)}</b></div>
                <div><span>Credit limit</span><b>{rs(c.creditLimit)}</b></div>
                <div><span>Receivable a/c</span><b>{c.receivableAccount ? `${c.receivableAccount.code} ${c.receivableAccount.name}` : "Company default"}</b></div>
                <div><span>WHT deduction</span><b>{c.deductsWht ? `u/s ${labelOf(lookups, "DefaultWhtSection", c.whtSection).split(" — ")[0]}${c.whtRate !== null ? ` @ ${c.whtRate}%` : ""}` : "None"}</b></div>
                {c.applyFurtherTax && <div><span>Further tax</span><b>4%</b></div>}
              </div>
            </div>
            <div>
              <h4>Contact &amp; address</h4>
              <div className="dl">
                <div><span>Contact person</span><b>{v(c.contactPerson)}</b></div>
                <div><span>Mobile</span><b>{v(c.mobile)}</b></div>
                <div><span>Phone</span><b>{v(c.phone)}</b></div>
                <div><span>Email</span><b>{v(c.email)}</b></div>
                <div><span>Billing</span><b>{[c.billingAddress, c.area, c.city, c.province && labelOf(lookups, "Province", c.province)].filter(Boolean).join(", ") || "—"}</b></div>
                <div><span>Shipping</span><b>{c.shippingSameAsBilling ? "Same as billing" : v(c.shippingAddress)}</b></div>
                <div><span>Branch</span><b>{c.branch?.name ?? "All branches"}</b></div>
              </div>
            </div>
            <div>
              <h4>Recent activity</h4>
              <div className="timeline">
                {activity.map((h) => (
                  <div key={h.entryId} className="tl-item"><span className={cn("tl-dot", h.action === "INSERT" && "good")} /><div>
                    <b>{h.action === "INSERT" ? "Customer created" : h.action === "DELETE" ? "Customer deleted" : `Updated ${Object.keys(h.changes ?? {}).slice(0, 3).join(", ")}`}</b>
                    <small>{date(h.occurredAt)} · {h.actor.name ?? "system"}</small>
                  </div></div>
                ))}
                {!activity.length && <small className="muted">No activity yet</small>}
              </div>
            </div>
          </div>
        )}
        {tab === "invoices" && later("No invoices yet", "sales invoicing arrives (Phase 23)")}
        {tab === "receipts" && later("No receipts yet", "customer receipts arrive (Phase 24)")}
        {tab === "statement" && later("No statement yet", "invoices and receipts are recorded (Phase 23–24)")}

        {tab === "contacts" && (
          <>
            {can.edit && <div className="form-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}><button type="button" className="btn secondary sm" onClick={() => openContact(null)}><UserPlus />Add contact</button></div>}
            <div className="card-grid mt">
              {c.contacts.map((k) => (
                <div key={k.id} className="card">
                  <div className="cell-user"><span className="avatar">{partyInitials(k.fullName)}</span><div><b>{k.fullName}</b><small>{[k.designation, k.isPrimary ? "Primary" : null, k.receivesInvoices ? "Receives invoices" : null].filter(Boolean).join(" · ") || "Contact"}</small></div>
                    {can.edit && <span className="spacer" />}
                    {can.edit && <button type="button" className="icon-btn-sm" aria-label={`Edit ${k.fullName}`} onClick={() => openContact(k)}><Pencil /></button>}
                    {can.edit && <button type="button" className="icon-btn-sm" aria-label={`Remove ${k.fullName}`} onClick={() => setConfirm({ title: `Remove ${k.fullName}?`, body: "The contact is removed from this customer (its history stays).", run: () => deleteCustomerContact(k.id, k.rowVersion), done: `${k.fullName} removed` })}><Trash2 /></button>}
                  </div>
                  <div className="dl mt">
                    {k.mobile && <div><span>Mobile</span><b>{k.mobile}</b></div>}
                    {k.phone && <div><span>Phone</span><b>{k.phone}</b></div>}
                    {k.email && <div><span>Email</span><b>{k.email}</b></div>}
                  </div>
                </div>
              ))}
            </div>
            {!c.contacts.length && <EmptyState icon={<UserPlus />} title="No contacts yet" description="Add the people you deal with: procurement, accounts payable, store managers." />}
          </>
        )}

        {tab === "addresses" && (
          <>
            {can.edit && <div className="form-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}><button type="button" className="btn secondary sm" onClick={() => openAddress(null)}><MapPin />Add address</button></div>}
            {c.addresses.length > 0 && (
              <div className="table-wrap mt"><table className="tbl">
                <thead><tr><th>Label</th><th>Type</th><th>Address</th><th>Contact</th><th>Default</th><th /></tr></thead>
                <tbody>{c.addresses.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.label}</b></td>
                    <td>{labelOf(lookups, "AddressType", a.addressType)}</td>
                    <td>{[a.addressLine, a.area, a.city, a.province && labelOf(lookups, "Province", a.province)].filter(Boolean).join(", ")}</td>
                    <td>{[a.contactName, a.contactPhone].filter(Boolean).join(" · ") || <span className="muted">—</span>}</td>
                    <td>{a.isDefault ? <span className="badge good">Default</span> : <span className="muted">—</span>}</td>
                    <td className="actions">{can.edit && <>
                      <button type="button" className="icon-btn-sm" aria-label={`Edit ${a.label}`} onClick={() => openAddress(a)}><Pencil /></button>
                      <button type="button" className="icon-btn-sm" aria-label={`Remove ${a.label}`} onClick={() => setConfirm({ title: `Remove ${a.label}?`, body: "Only addresses no document uses can be removed.", run: () => deleteCustomerAddress(a.id, a.rowVersion), done: `${a.label} removed` })}><Trash2 /></button>
                    </>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            {!c.addresses.length && <EmptyState icon={<MapPin />} title="No delivery addresses" description="The billing address is on the customer. Add stores, warehouses or sites you deliver to." />}
          </>
        )}

        {tab === "notes" && (
          <>
            {can.edit && (
              <>
                <div className="form-grid mt"><label className="full"><span>Add a note</span><textarea rows={3} value={note} placeholder="Visible to finance and sales team…" onChange={(e) => setNote(e.target.value)} /></label></div>
                <div className="form-actions"><button type="button" className="btn primary sm" disabled={busy || !note.trim()} onClick={() => run(() => addCustomerNote(c.id, note.trim()), "Note added", () => setNote(""))}>Add note</button></div>
              </>
            )}
            <div className="mt">
              {c.notes.map((n) => (
                <div key={n.id} className="list-item">
                  <span className="avatar sm">{partyInitials(n.author?.name ?? "?")}</span>
                  <div style={{ flex: 1 }}><b>{n.author?.name ?? "Unknown"}</b><small style={{ whiteSpace: "pre-wrap" }}>{n.note} · {date(n.createdAt)}</small></div>
                  {can.edit && n.author?.id === meId && <button type="button" className="icon-btn-sm" aria-label="Delete note" onClick={() => setConfirm({ title: "Delete this note?", body: "Only you can delete your notes. The history keeps it.", run: () => deleteCustomerNote(n.id, n.rowVersion), done: "Note deleted" })}><X /></button>}
                </div>
              ))}
              {!c.notes.length && <EmptyState icon={<Receipt />} title="No notes yet" description="Keep promises, disputes and follow-ups here so finance and sales see the same story." />}
            </div>
          </>
        )}

        {tab === "history" && <HistoryTab schema="Sales" table="Customers" id={c.id} />}
      </div>

      {menu && (
        <Menu anchor={menu} onClose={() => setMenu(null)} items={[
          ...(can.edit ? [
            { label: c.status === "ON_HOLD" ? "Release hold" : "Put on hold", onClick: () => (c.status === "ON_HOLD" ? setDialog({ kind: "status", status: "ACTIVE", holdReason: "" }) : setDialog({ kind: "status", status: "ON_HOLD", holdReason: "MANUAL" })) },
            { label: c.status === "DISPUTED" ? "Clear dispute" : "Mark disputed", onClick: () => setDialog({ kind: "status", status: c.status === "DISPUTED" ? "ACTIVE" : "DISPUTED", holdReason: "" }) },
            { label: c.status === "INACTIVE" ? "Activate" : "Deactivate", onClick: () => setDialog({ kind: "status", status: c.status === "INACTIVE" ? "ACTIVE" : "INACTIVE", holdReason: "" }) },
          ] : []),
          ...(can.remove ? [{ sep: true as const }, { label: "Delete customer", danger: true, onClick: () => setConfirm({ title: `Delete ${c.name}?`, body: "Only customers no document uses can be deleted, and the code can't be used again. Otherwise deactivate.", run: () => deleteCustomer(c.id, c.rowVersion), done: `${c.name} deleted`, leave: true }) }] : []),
        ]} />
      )}

      {editing > 0 && <CustomerForm key={editing} open customer={c} onClose={() => setEditing(0)} onSaved={() => { setEditing(0); reload(); }} />}

      <Modal open={!!dialog} onClose={() => setDialog(null)}
        title={dialog?.kind === "status" ? "Change status" : dialog?.kind === "contact" ? (dialog.row ? dialog.row.fullName : "Add contact") : dialog?.kind === "address" ? (dialog.row ? dialog.row.label : "Add address") : ""}
        subtitle={dialog?.kind === "status" ? c.name : undefined}
        foot={<><button type="button" className="btn secondary" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={saveDialog}>{busy ? "Saving…" : "Save"}</button></>}>
        {dialog?.kind === "status" && (
          <FormGrid>
            <Field label="Status" error={errs.status}>
              <select value={dialog.status} onChange={(e) => setDialog({ ...dialog, status: e.target.value })}>{["ACTIVE", "ON_HOLD", "DISPUTED", "INACTIVE"].map((s) => <option key={s} value={s}>{labelOf(lookups, "CustomerStatus", s)}</option>)}</select>
            </Field>
            {dialog.status === "ON_HOLD" && (
              <Field label="Hold reason" required error={errs.holdReason}>
                <select value={dialog.holdReason} onChange={(e) => setDialog({ ...dialog, holdReason: e.target.value })}><option value="">(choose)</option>{["OVER_LIMIT", "OVERDUE", "BOUNCED_CHEQUE", "MANUAL"].map((r) => <option key={r} value={r}>{labelOf(lookups, "CustomerHoldReason", r)}</option>)}</select>
              </Field>
            )}
          </FormGrid>
        )}
        {dialog?.kind === "contact" && (
          <FormGrid>
            <Field label="Full name" required error={errs.fullName}><input value={fs("fullName")} autoFocus onChange={(e) => setF("fullName", e.target.value)} /></Field>
            <Field label="Designation" error={errs.designation}><input value={fs("designation")} placeholder="e.g. Head of Procurement" onChange={(e) => setF("designation", e.target.value)} /></Field>
            <Field label="Mobile" error={errs.mobile}><input value={fs("mobile")} placeholder="0300-0000000" onChange={(e) => setF("mobile", e.target.value)} /></Field>
            <Field label="Phone" error={errs.phone}><input value={fs("phone")} onChange={(e) => setF("phone", e.target.value)} /></Field>
            <Field label="Email" full error={errs.email}><input value={fs("email")} onChange={(e) => setF("email", e.target.value)} /></Field>
            <Check label="Primary contact" checked={fb("isPrimary")} onChange={(e) => setF("isPrimary", e.target.checked)} />
            <Check label="Receives invoices" checked={fb("receivesInvoices")} onChange={(e) => setF("receivesInvoices", e.target.checked)} />
          </FormGrid>
        )}
        {dialog?.kind === "address" && (
          <FormGrid>
            <Field label="Label" required error={errs.label}><input value={fs("label")} autoFocus placeholder="e.g. DHA store" onChange={(e) => setF("label", e.target.value)} /></Field>
            <Field label="Type" error={errs.addressType}><select value={fs("addressType")} onChange={(e) => setF("addressType", e.target.value)}>{["SHIPPING", "BILLING", "BOTH"].map((t) => <option key={t} value={t}>{labelOf(lookups, "AddressType", t)}</option>)}</select></Field>
            <Field label="Address" required full error={errs.addressLine}><input value={fs("addressLine")} onChange={(e) => setF("addressLine", e.target.value)} /></Field>
            <Field label="Area" error={errs.area}><input value={fs("area")} onChange={(e) => setF("area", e.target.value)} /></Field>
            <Field label="City" error={errs.city}><input value={fs("city")} onChange={(e) => setF("city", e.target.value)} /></Field>
            <Field label="Province" error={errs.province}><select value={fs("province")} onChange={(e) => setF("province", e.target.value)}><option value="">(choose)</option>{["PUNJAB", "SINDH", "ICT", "KPK", "BALOCHISTAN", "GB", "AJK"].map((p) => <option key={p} value={p}>{labelOf(lookups, "Province", p)}</option>)}</select></Field>
            <Field label="Contact name" error={errs.contactName}><input value={fs("contactName")} onChange={(e) => setF("contactName", e.target.value)} /></Field>
            <Field label="Contact phone" error={errs.contactPhone}><input value={fs("contactPhone")} onChange={(e) => setF("contactPhone", e.target.value)} /></Field>
            <Check label="Default for this type" checked={fb("isDefault")} onChange={(e) => setF("isDefault", e.target.checked)} />
          </FormGrid>
        )}
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ""} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!confirm) return;
        const x = confirm;
        setConfirm(null);
        await run(x.run, x.done, x.leave ? () => router.push("/customers") : undefined);
      }}>{confirm?.body}</ConfirmDialog>
    </>
  );
}
