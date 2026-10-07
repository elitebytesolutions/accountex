"use client";

import { useEffect, useState } from "react";
import { termsDays, VENDOR_TERMS, type VendorDetail } from "@/shared";
import { Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createVendor, updateVendor, vendorOptions, type VendorOptions } from "../api";

const LOOKUPS = ["DefaultWhtSection", "PurchaseOrderPaymentTerms", "VendorAtlStatus"];
const text = (x: string | number | null | undefined) => (x === null || x === undefined ? "" : String(x));

/**
 * Template `trd-new-vendor` (41-acc-trade.html): New / Edit Vendor. On create the contact person and bank / IBAN become
 * the primary contact and primary bank account; afterwards they're managed on the vendor page.
 */
export function VendorForm({ open, vendor, onClose, onSaved }: { open: boolean; vendor: VendorDetail | null; onClose: () => void; onSaved: (v: VendorDetail) => void }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [opts, setOpts] = useState<VendorOptions>({ categories: [], currencies: [], defaultAccounts: [], payableAccounts: [] });
  const [f, setF] = useState<Record<string, string>>(() => ({
    code: vendor?.code ?? "", name: vendor?.name ?? "", legalName: text(vendor?.legalName), categoryId: vendor?.category?.id ?? "", ntn: text(vendor?.ntn),
    cnic: text(vendor?.cnic), strn: text(vendor?.strn), atlStatus: vendor?.atlStatus ?? "UNVERIFIED", defaultWhtSection: vendor?.defaultWhtSection ?? "153_1_A",
    defaultAccountId: vendor?.defaultAccount?.id ?? "", payableAccountId: vendor?.payableAccount?.id ?? "", paymentTerms: vendor?.paymentTerms ?? "NET_30",
    creditDays: vendor ? String(vendor.creditDays) : "30", currencyCode: vendor?.currencyCode ?? "PKR", phone: text(vendor?.phone), email: text(vendor?.email),
    address: text(vendor?.address), city: text(vendor?.city), vendorSince: text(vendor?.vendorSince), remarks: text(vendor?.remarks),
    contactPerson: "", bankName: "", iban: "",
  }));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    vendorOptions().then((o) => !cancelled && setOpts(o)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [open]);

  const set = (k: string, val: string) => {
    setF((x) => {
      const next = { ...x, [k]: val };
      if (k === "paymentTerms") { const d = termsDays(val); if (d !== null) next.creditDays = String(d); }
      return next;
    });
    setErrs((e) => ({ ...e, [k]: "" }));
  };
  const input = (k: string, placeholder?: string, type?: string) => <input value={f[k] ?? ""} placeholder={placeholder} type={type} onChange={(e) => set(k, e.target.value)} />;
  const F = (k: string, label: string, child: React.ReactNode, o?: { required?: boolean; full?: boolean; hint?: string }) => (
    <Field label={label} required={o?.required} full={o?.full} hint={o?.hint} error={errs[k]}>{child}</Field>
  );
  const accountSelect = (k: string, rows: { id: string; code: string; name: string }[], current: { id: string; code: string; name: string } | null | undefined, blank: string) => (
    <select value={f[k]} onChange={(e) => set(k, e.target.value)}>
      <option value="">{blank}</option>
      {rows.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
      {current && !rows.some((a) => a.id === current.id) && <option value={current.id}>{current.code} {current.name}</option>}
    </select>
  );

  const save = async () => {
    setBusy(true);
    setErrs({});
    const { contactPerson, bankName, iban, ...rest } = f;
    try {
      const v = vendor ? await updateVendor(vendor.id, { ...rest, rowVersion: vendor.rowVersion }) : await createVendor({ ...rest, contactPerson, bankName, iban });
      toast(`${v.code} · ${v.name} ${vendor ? "saved" : "created"}`, { tone: "good" });
      onSaved(v);
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the vendor"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} xl title={vendor ? `Edit ${vendor.name}` : "New Vendor"} subtitle={vendor?.code ?? "Code assigned on save"} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save vendor"}</button>
      </>
    }>
      <div className="form-section"><h4>Identity &amp; tax</h4><p>ATL status is set by hand until the FBR integration (Phase 28)</p></div>
      <div className="form-grid c3">
        {F("name", "Vendor name", input("name", "Trading name"), { required: true })}
        {F("legalName", "Legal name", input("legalName", "As registered with FBR"))}
        {F("categoryId", "Category", <select value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}><option value="">(none)</option>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}{vendor?.category && !opts.categories.some((c) => c.id === vendor.category!.id) && <option value={vendor.category.id}>{vendor.category.name} (inactive)</option>}</select>)}
        {F("ntn", "NTN", input("ntn", "1234567-8"))}
        {F("cnic", "CNIC (individuals)", input("cnic", "35202-1234567-1"))}
        {F("strn", "STRN", input("strn", "Optional"))}
        {F("atlStatus", "ATL status", <select value={f.atlStatus} onChange={(e) => set("atlStatus", e.target.value)}>{["ACTIVE", "NOT_ON_ATL", "UNVERIFIED"].map((s) => <option key={s} value={s}>{labelOf(lookups, "VendorAtlStatus", s)}</option>)}</select>)}
        {F("defaultWhtSection", "Default WHT section", <select value={f.defaultWhtSection} onChange={(e) => set("defaultWhtSection", e.target.value)}>{["153_1_A", "153_1_B", "153_1_C", "EXEMPT"].map((s) => <option key={s} value={s}>{labelOf(lookups, "DefaultWhtSection", s)}</option>)}</select>)}
        {F("defaultAccountId", "Expense / inventory a/c", accountSelect("defaultAccountId", opts.defaultAccounts, vendor?.defaultAccount, "(choose on each bill)"))}
        {F("payableAccountId", "Payable account", accountSelect("payableAccountId", opts.payableAccounts, vendor?.payableAccount, "(company default)"))}
        {F("code", "Vendor code", input("code", "Next free VEN-0000"), { hint: vendor ? undefined : "Leave blank for the next free code" })}
        {F("vendorSince", "Vendor since", input("vendorSince", undefined, "date"))}
      </div>
      <div className="form-section"><h4>Contact &amp; payment</h4></div>
      <div className="form-grid c3">
        {!vendor && F("contactPerson", "Contact person", input("contactPerson"), { hint: "Becomes the primary contact" })}
        {F("phone", "Phone", input("phone", "042-…"))}
        {F("email", "Email", input("email", "accounts@vendor.pk"))}
        {F("address", "Address", input("address"), { full: !!vendor })}
        {F("city", "City", input("city", "e.g. Karachi"))}
        {F("paymentTerms", "Payment terms", <select value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)}>{VENDOR_TERMS.map((t) => <option key={t} value={t}>{labelOf(lookups, "PurchaseOrderPaymentTerms", t)}</option>)}</select>)}
        {F("creditDays", "Credit days", <input value={f.creditDays} inputMode="numeric" disabled={termsDays(f.paymentTerms ?? "") === 0} onChange={(e) => set("creditDays", e.target.value)} />)}
        {F("currencyCode", "Currency", <select value={f.currencyCode} onChange={(e) => set("currencyCode", e.target.value)}>{(opts.currencies.length ? opts.currencies : [{ code: "PKR", name: "Pakistani Rupee" }]).map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}</select>)}
        {!vendor && F("bankName", "Bank", input("bankName", "Bank name"), { hint: "Becomes the primary bank account" })}
        {!vendor && F("iban", "IBAN", input("iban", "PK00 XXXX 0000 0000 0000 0000"))}
        {F("remarks", "Remarks", input("remarks"), { full: true })}
      </div>
    </Modal>
  );
}
