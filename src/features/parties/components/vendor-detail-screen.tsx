"use client";

import { AlertTriangle, ArrowLeft, FileText, Landmark, MoreHorizontal, Pencil, Plus, Receipt, Send, ShoppingBag, Trash2, UserPlus, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { partyInitials, type VendorBankAccount, type VendorContact, type VendorDetail } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Menu } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  addVendorBank, addVendorContact, deleteVendor, deleteVendorBank, deleteVendorContact, getVendor, setVendorActive, updateVendorBank, updateVendorContact,
} from "../api";
import { VendorForm } from "./vendor-form";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Tab = "overview" | "bills" | "payments" | "statement" | "documents" | "contacts" | "banks" | "history";
type Dialog = { kind: "contact"; row: VendorContact | null; f: Record<string, string | boolean> } | { kind: "bank"; row: VendorBankAccount | null; f: Record<string, string | boolean> };
const LOOKUPS = ["VendorAtlStatus", "DefaultWhtSection", "PurchaseOrderPaymentTerms"];
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const v = (x: string | null | undefined) => x || "—";
const year = (d: string | null) => (d ? d.slice(0, 4) : null);
const groupIban = (iban: string | null) => (iban ? iban.replace(/(.{4})/g, "$1 ").trim() : null);

/**
 * Template app/vendors/view (41-acc-trade.html): profile head, KPIs, Overview (vendor details, primary contact).
 * Added: Contacts, Bank accounts and History tabs. Bills, Payments, Statement and Documents fill from Phase 21–22.
 */
export function VendorDetailScreen({ id, can }: { id: string; can: Can }) {
  const router = useRouter();
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [vd, setVd] = useState<VendorDetail | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<unknown>; done: string; leave?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVendor(id)
      .then((x) => { if (!cancelled) { setVd(x); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the vendor" }));
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
  if (!vd) return <div className="panel"><Skeleton style={{ height: 160 }} /></div>;

  const pc = vd.primaryContact;
  const setF = (k: string, val: string | boolean) => setDialog((d) => (d ? { ...d, f: { ...d.f, [k]: val } } : d));
  const fs = (k: string) => String(dialog?.f[k] ?? "");
  const fb = (k: string) => Boolean(dialog?.f[k]);
  const openContact = (row: VendorContact | null) => { setErrs({}); setDialog({ kind: "contact", row, f: { fullName: row?.fullName ?? "", designation: row?.designation ?? "", phone: row?.phone ?? "", mobile: row?.mobile ?? "", email: row?.email ?? "", isPrimary: row?.isPrimary ?? false } }); };
  const openBank = (row: VendorBankAccount | null) => { setErrs({}); setDialog({ kind: "bank", row, f: { bankName: row?.bankName ?? "", branchName: row?.branchName ?? "", accountTitle: row?.accountTitle ?? vd.legalName ?? vd.name, accountNo: row?.accountNo ?? "", iban: row?.iban ?? "", swiftCode: row?.swiftCode ?? "", currencyCode: row?.currencyCode ?? vd.currencyCode, isPrimary: row?.isPrimary ?? false, isActive: row?.isActive ?? true } }); };
  const saveDialog = () => {
    if (!dialog) return;
    if (dialog.kind === "contact") {
      void run(() => (dialog.row ? updateVendorContact(dialog.row.id, { ...dialog.f, rowVersion: dialog.row.rowVersion }) : addVendorContact(vd.id, dialog.f)), `${String(dialog.f.fullName)} saved`, () => setDialog(null));
    } else {
      void run(() => (dialog.row ? updateVendorBank(dialog.row.id, { ...dialog.f, rowVersion: dialog.row.rowVersion }) : addVendorBank(vd.id, dialog.f)), `${String(dialog.f.bankName)} account saved`, () => setDialog(null));
    }
  };
  const later = (title: string, phase: string) => <EmptyState icon={<FileText />} title={title} description={`Appears here once ${phase}.`} />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Payables / Vendors / {vd.code}</div>
          <h1>Vendor Detail</h1>
          <p>Bills, payments, statement and compliance documents.</p>
        </div>
        <div className="head-actions">
          <Link className="btn ghost" href="/vendors"><ArrowLeft />All vendors</Link>
          <button type="button" className="btn secondary" disabled title="Vendor bills arrive in Phase 21"><Receipt />New Bill</button>
          <button type="button" className="btn primary" disabled title="Vendor payments arrive in Phase 22"><Send />Pay vendor</button>
        </div>
      </div>

      <div className="panel mb">
        <div className="profile-head">
          <span className="avatar xl">{partyInitials(vd.name)}</span>
          <div>
            <h2>{vd.legalName ?? vd.name}</h2>
            <p>{[vd.code, vd.category?.name, [vd.address, vd.city].filter(Boolean).join(", ") || null, year(vd.vendorSince) ? `Vendor since ${year(vd.vendorSince)}` : null].filter(Boolean).join(" · ")}</p>
            <div className="row">
              {vd.status !== "ACTIVE" && <span className="badge neutral dot">Inactive</span>}
              <span className={cn("badge dot", toneOf(lookups, "VendorAtlStatus", vd.atlStatus))}>{labelOf(lookups, "VendorAtlStatus", vd.atlStatus)}</span>
              {vd.strn && <span className="badge info">STRN registered</span>}
              <span className="badge neutral">WHT {labelOf(lookups, "DefaultWhtSection", vd.defaultWhtSection).split(" — ")[0]}</span>
            </div>
          </div>
          <div className="head-actions">
            {can.edit && <button type="button" className="btn secondary sm" onClick={() => setEditing((n) => n + 1)}><Pencil />Edit</button>}
            {(can.edit || can.remove) && <button type="button" className="btn ghost sm" aria-label="More actions" onClick={(e) => setMenu(e.currentTarget)}><MoreHorizontal /></button>}
          </div>
        </div>
      </div>

      <div className="kpi-grid mb">
        <div className="kpi blue"><div className="kpi-top"><span>Payable Balance</span><span className="icon-well"><Wallet /></span></div><strong>{rs(vd.payable)}</strong><small>0 open bills</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Overdue</span><span className="icon-well"><AlertTriangle /></span></div><strong>{rs(vd.overdue)}</strong><small>Nothing overdue</small></div>
        <div className="kpi"><div className="kpi-top"><span>Purchases YTD</span><span className="icon-well"><ShoppingBag /></span></div><strong>{rs(0)}</strong><small>From vendor bills (Phase 21)</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>WHT Deducted YTD</span><span className="icon-well"><FileText /></span></div><strong>{rs(0)}</strong><small>From vendor payments (Phase 22)</small></div>
      </div>

      <div className="panel">
        <Tabs<Tab> active={tab} onChange={setTab} items={[
          { key: "overview", label: "Overview" }, { key: "bills", label: "Bills" }, { key: "payments", label: "Payments" }, { key: "statement", label: "Statement" },
          { key: "documents", label: "Documents" }, { key: "contacts", label: "Contacts", count: vd.contacts.length }, { key: "banks", label: "Bank accounts", count: vd.bankAccounts.length },
          { key: "history", label: "History" },
        ]} />

        {tab === "overview" && (
          <div className="grid-3 mt">
            <div>
              <h4>Vendor details</h4>
              <div className="dl">
                <div><span>NTN</span><b>{v(vd.ntn)}</b></div>
                {vd.cnic && <div><span>CNIC</span><b>{vd.cnic}</b></div>}
                <div><span>STRN</span><b>{v(vd.strn)}</b></div>
                <div><span>Payment terms</span><b>{labelOf(lookups, "PurchaseOrderPaymentTerms", vd.paymentTerms)}{vd.creditDays ? ` (${vd.creditDays} days)` : ""}</b></div>
                <div><span>Payable a/c</span><b>{vd.payableAccount ? `${vd.payableAccount.code} ${vd.payableAccount.name}` : "Company default"}</b></div>
                <div><span>Expense / inventory a/c</span><b>{vd.defaultAccount ? `${vd.defaultAccount.code} ${vd.defaultAccount.name}` : "—"}</b></div>
                <div><span>Bank</span><b>{vd.bankName ? `${vd.bankName}${vd.iban ? ` · ${groupIban(vd.iban)}` : ""}` : "—"}</b></div>
                <div><span>Currency</span><b>{vd.currencyCode}</b></div>
              </div>
            </div>
            <div>
              <h4>Primary contact</h4>
              {pc ? (
                <div className="dl">
                  <div><span>Name</span><b>{pc.fullName}</b></div>
                  <div><span>Role</span><b>{v(pc.designation)}</b></div>
                  <div><span>Phone</span><b>{[pc.phone, pc.mobile].filter(Boolean).join(" · ") || "—"}</b></div>
                  <div><span>Email</span><b>{v(pc.email)}</b></div>
                </div>
              ) : <p className="muted small">No contact yet{can.edit ? " — add one on the Contacts tab." : "."}</p>}
            </div>
            <div>
              <h4>Performance</h4>
              <div className="dl">
                <div><span>On-time delivery</span><b>—</b></div>
                <div><span>Price variance incidents</span><b>—</b></div>
                <div><span>Avg days we pay</span><b>—</b></div>
              </div>
              <p className="muted small">Measured from GRNs, bills and payments (Phases 20–22).</p>
            </div>
          </div>
        )}
        {tab === "bills" && later("No bills yet", "vendor bills arrive (Phase 21)")}
        {tab === "payments" && later("No payments yet", "vendor payments arrive (Phase 22)")}
        {tab === "statement" && later("No statement yet", "bills and payments are recorded (Phase 21–22)")}
        {tab === "documents" && later("No documents yet", "attachments and WHT certificates arrive with payments (Phase 22)")}

        {tab === "contacts" && (
          <>
            {can.edit && <div className="form-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}><button type="button" className="btn secondary sm" onClick={() => openContact(null)}><UserPlus />Add contact</button></div>}
            <div className="card-grid mt">
              {vd.contacts.map((k) => (
                <div key={k.id} className="card">
                  <div className="cell-user"><span className="avatar">{partyInitials(k.fullName)}</span><div><b>{k.fullName}</b><small>{[k.designation, k.isPrimary ? "Primary" : null].filter(Boolean).join(" · ") || "Contact"}</small></div>
                    {can.edit && <span className="spacer" />}
                    {can.edit && <button type="button" className="icon-btn-sm" aria-label={`Edit ${k.fullName}`} onClick={() => openContact(k)}><Pencil /></button>}
                    {can.edit && <button type="button" className="icon-btn-sm" aria-label={`Remove ${k.fullName}`} onClick={() => setConfirm({ title: `Remove ${k.fullName}?`, body: "The contact is removed from this vendor (its history stays).", run: () => deleteVendorContact(k.id, k.rowVersion), done: `${k.fullName} removed` })}><Trash2 /></button>}
                  </div>
                  <div className="dl mt">
                    {k.phone && <div><span>Phone</span><b>{k.phone}</b></div>}
                    {k.mobile && <div><span>Mobile</span><b>{k.mobile}</b></div>}
                    {k.email && <div><span>Email</span><b>{k.email}</b></div>}
                  </div>
                </div>
              ))}
            </div>
            {!vd.contacts.length && <EmptyState icon={<UserPlus />} title="No contacts yet" description="Add your account manager and the vendor's accounts receivable contact." />}
          </>
        )}

        {tab === "banks" && (
          <>
            {can.edit && <div className="form-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}><button type="button" className="btn secondary sm" onClick={() => openBank(null)}><Plus />Add bank account</button></div>}
            {vd.bankAccounts.length > 0 && (
              <div className="table-wrap mt"><table className="tbl">
                <thead><tr><th>Bank</th><th>Account title</th><th>Account no. / IBAN</th><th>Currency</th><th>Primary</th><th>Active</th><th /></tr></thead>
                <tbody>{vd.bankAccounts.map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.bankName}</b><small>{b.branchName ?? ""}</small></td>
                    <td>{v(b.accountTitle)}</td>
                    <td>{b.accountNo ?? ""}<small>{groupIban(b.iban) ?? ""}{b.swiftCode ? ` · ${b.swiftCode}` : ""}</small></td>
                    <td>{b.currencyCode}</td>
                    <td>{b.isPrimary ? <span className="badge good">Primary</span> : <span className="muted">—</span>}</td>
                    <td>{b.isActive ? "Yes" : <span className="muted">No</span>}</td>
                    <td className="actions">{can.edit && <>
                      <button type="button" className="icon-btn-sm" aria-label={`Edit ${b.bankName}`} onClick={() => openBank(b)}><Pencil /></button>
                      <button type="button" className="icon-btn-sm" aria-label={`Remove ${b.bankName}`} onClick={() => setConfirm({ title: `Remove the ${b.bankName} account?`, body: "Only accounts no payment uses can be removed; otherwise deactivate it.", run: () => deleteVendorBank(b.id, b.rowVersion), done: "Bank account removed" })}><Trash2 /></button>
                    </>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            {!vd.bankAccounts.length && <EmptyState icon={<Landmark />} title="No bank accounts" description="Add where payments go; the primary account is printed on payment advices." />}
          </>
        )}

        {tab === "history" && <HistoryTab schema="Purchases" table="Vendors" id={vd.id} />}
      </div>

      {menu && (
        <Menu anchor={menu} onClose={() => setMenu(null)} items={[
          ...(can.edit ? [{ label: vd.status === "ACTIVE" ? "Deactivate" : "Activate", onClick: () => void run(() => setVendorActive(vd.id, vd.status !== "ACTIVE", vd.rowVersion), `${vd.name} ${vd.status === "ACTIVE" ? "deactivated" : "activated"}`) }] : []),
          ...(can.remove ? [{ sep: true as const }, { label: "Delete vendor", danger: true, onClick: () => setConfirm({ title: `Delete ${vd.name}?`, body: "Only vendors no document uses can be deleted, and the code can't be used again. Otherwise deactivate.", run: () => deleteVendor(vd.id, vd.rowVersion), done: `${vd.name} deleted`, leave: true }) }] : []),
        ]} />
      )}

      {editing > 0 && <VendorForm key={editing} open vendor={vd} onClose={() => setEditing(0)} onSaved={() => { setEditing(0); reload(); }} />}

      <Modal open={!!dialog} onClose={() => setDialog(null)} title={dialog?.kind === "contact" ? (dialog.row ? dialog.row.fullName : "Add contact") : dialog?.row ? `${dialog.row.bankName} account` : "Add bank account"}
        foot={<><button type="button" className="btn secondary" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={saveDialog}>{busy ? "Saving…" : "Save"}</button></>}>
        {dialog?.kind === "contact" && (
          <FormGrid>
            <Field label="Full name" required error={errs.fullName}><input value={fs("fullName")} autoFocus onChange={(e) => setF("fullName", e.target.value)} /></Field>
            <Field label="Designation" error={errs.designation}><input value={fs("designation")} placeholder="e.g. Key Account Manager" onChange={(e) => setF("designation", e.target.value)} /></Field>
            <Field label="Phone" error={errs.phone}><input value={fs("phone")} onChange={(e) => setF("phone", e.target.value)} /></Field>
            <Field label="Mobile" error={errs.mobile}><input value={fs("mobile")} onChange={(e) => setF("mobile", e.target.value)} /></Field>
            <Field label="Email" full error={errs.email}><input value={fs("email")} onChange={(e) => setF("email", e.target.value)} /></Field>
            <Check label="Primary contact" checked={fb("isPrimary")} onChange={(e) => setF("isPrimary", e.target.checked)} />
          </FormGrid>
        )}
        {dialog?.kind === "bank" && (
          <FormGrid>
            <Field label="Bank" required error={errs.bankName}><input value={fs("bankName")} autoFocus placeholder="e.g. HBL" onChange={(e) => setF("bankName", e.target.value)} /></Field>
            <Field label="Branch" error={errs.branchName}><input value={fs("branchName")} onChange={(e) => setF("branchName", e.target.value)} /></Field>
            <Field label="Account title" error={errs.accountTitle}><input value={fs("accountTitle")} onChange={(e) => setF("accountTitle", e.target.value)} /></Field>
            <Field label="Account no." error={errs.accountNo}><input value={fs("accountNo")} onChange={(e) => setF("accountNo", e.target.value)} /></Field>
            <Field label="IBAN" error={errs.iban}><input value={fs("iban")} placeholder="PK36 SCBL 0000 0011 2345 6702" onChange={(e) => setF("iban", e.target.value)} /></Field>
            <Field label="SWIFT" error={errs.swiftCode} hint="Foreign accounts"><input value={fs("swiftCode")} onChange={(e) => setF("swiftCode", e.target.value.toUpperCase())} /></Field>
            <Field label="Currency" error={errs.currencyCode}><input value={fs("currencyCode")} maxLength={3} onChange={(e) => setF("currencyCode", e.target.value.toUpperCase())} /></Field>
            <Check label="Primary account" checked={fb("isPrimary")} onChange={(e) => setF("isPrimary", e.target.checked)} />
            <Check label="Active" checked={fb("isActive")} onChange={(e) => setF("isActive", e.target.checked)} />
          </FormGrid>
        )}
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ""} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!confirm) return;
        const x = confirm;
        setConfirm(null);
        await run(x.run, x.done, x.leave ? () => router.push("/vendors") : undefined);
      }}>{confirm?.body}</ConfirmDialog>
    </>
  );
}
