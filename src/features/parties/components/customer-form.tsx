"use client";

import { useEffect, useState } from "react";
import { termsDays, type CustomerDetail } from "@/shared";
import { Check, Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createCustomer, customerOptions, updateCustomer, type CustomerOptions } from "../api";

const LOOKUPS = ["CustomerType", "CustomerAtlStatus", "CustomerPaymentTerms", "Province", "DefaultWhtSection", "CustomerChannel"];
const TYPES = ["COMPANY", "INDIVIDUAL", "GOVERNMENT", "AOP"];
const TERMS = ["NET_30", "NET_15", "NET_45", "NET_60", "DUE_ON_RECEIPT", "ADVANCE_50", "ADVANCE", "COD"];
const PROVINCES = ["PUNJAB", "SINDH", "ICT", "KPK", "BALOCHISTAN", "GB", "AJK"];
const CITIES = ["Lahore", "Karachi", "Islamabad", "Faisalabad", "Rawalpindi", "Multan", "Peshawar", "Sialkot", "Gujranwala", "Quetta"];
const WHT = ["153_1_A", "153_1_B", "153_1_C", "EXEMPT"];

type Form = Record<string, string | boolean>;
const text = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function initial(c: CustomerDetail | null): Form {
  return {
    code: c?.code ?? "", name: c?.name ?? "", displayName: text(c?.displayName), customerType: c?.customerType ?? "COMPANY", customerGroupId: c?.group?.id ?? "", priceListId: c?.priceList?.id ?? "",
    salesRepUserId: c?.salesRep?.id ?? "", branchId: c?.branch?.id ?? "", customerSince: text(c?.customerSince), customerChannel: c?.customerChannel ?? "STANDARD",
    ntn: text(c?.ntn), cnic: text(c?.cnic), strn: text(c?.strn), atlStatus: c?.atlStatus ?? "ACTIVE",
    isSalesTaxRegistered: c?.isSalesTaxRegistered ?? true, applyFurtherTax: c?.applyFurtherTax ?? false, deductsWht: c?.deductsWht ?? true,
    whtSection: text(c?.whtSection ?? (c ? null : "153_1_A")), whtRate: text(c?.whtRate), isGstExempt: c?.isGstExempt ?? false,
    contactPerson: text(c?.contactPerson), mobile: text(c?.mobile), phone: text(c?.phone), email: text(c?.email), billingAddress: text(c?.billingAddress),
    area: text(c?.area), city: text(c?.city), province: text(c?.province), shippingSameAsBilling: c?.shippingSameAsBilling ?? true, shippingAddress: text(c?.shippingAddress),
    creditLimit: c ? String(c.creditLimit) : "1000000", paymentTerms: c?.paymentTerms ?? "NET_30", creditDays: c ? String(c.creditDays) : "30",
    receivableAccountId: c?.receivableAccount?.id ?? "", blockOverLimit: c?.blockOverLimit ?? true, autoReminders: c?.autoReminders ?? true,
    guarantorName: text(c?.guarantorName), guarantorFatherName: text(c?.guarantorFatherName), guarantorCnic: text(c?.guarantorCnic),
    guarantorPhone: text(c?.guarantorPhone), guarantorAddress: text(c?.guarantorAddress),
  };
}

/** Template `trd-new-customer` (41-acc-trade.html): New / Edit Customer in the template's xl modal. Price list (Phase 9) and opening balance (Phase 16) come later. */
export function CustomerForm({ open, customer, onClose, onSaved }: { open: boolean; customer: CustomerDetail | null; onClose: () => void; onSaved: (c: CustomerDetail) => void }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [opts, setOpts] = useState<CustomerOptions>({ groups: [], branches: [], salesReps: [], accounts: [], priceLists: [] });
  const [form, setForm] = useState<Form>(() => initial(customer));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    customerOptions().then((o) => !cancelled && setOpts(o)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [open]);

  const set = (k: string, v: string | boolean) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "paymentTerms") { const d = termsDays(String(v)); if (d !== null) next.creditDays = String(d); }
      return next;
    });
    setErrs((e) => ({ ...e, [k]: "" }));
  };
  const s = (k: string) => String(form[k] ?? "");
  const b = (k: string) => Boolean(form[k]);
  const input = (k: string, placeholder?: string, extra?: { type?: string; inputMode?: "decimal" | "numeric" }) => (
    <input value={s(k)} placeholder={placeholder} type={extra?.type} inputMode={extra?.inputMode} onChange={(e) => set(k, e.target.value)} />
  );
  const select = (k: string, values: string[], type: string | null, blank?: string) => (
    <select value={s(k)} onChange={(e) => set(k, e.target.value)}>
      {blank !== undefined && <option value="">{blank}</option>}
      {values.map((v) => <option key={v} value={v}>{type ? labelOf(lookups, type, v) : v}</option>)}
    </select>
  );
  const ref = (k: string, rows: { id: string; name: string; code?: string }[], blank: string, current?: { id: string; name: string } | null) => (
    <select value={s(k)} onChange={(e) => set(k, e.target.value)}>
      <option value="">{blank}</option>
      {rows.map((r) => <option key={r.id} value={r.id}>{r.code ? `${r.code} ${r.name}` : r.name}</option>)}
      {current && !rows.some((r) => r.id === current.id) && <option value={current.id}>{current.name} (inactive)</option>}
    </select>
  );

  const save = async () => {
    setBusy(true);
    setErrs({});
    const body: Record<string, unknown> = { ...form };
    if (form.customerType !== "INDIVIDUAL" && !customer?.guarantorName) for (const k of ["guarantorName", "guarantorFatherName", "guarantorCnic", "guarantorPhone", "guarantorAddress"]) body[k] = null;
    if (!form.deductsWht) { body.whtSection = null; body.whtRate = null; }
    try {
      const c = customer ? await updateCustomer(customer.id, { ...body, rowVersion: customer.rowVersion }) : await createCustomer(body);
      toast(`${c.code} · ${c.name} ${customer ? "saved" : "created"}`, { tone: "good" });
      onSaved(c);
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the customer"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const F = (k: string, label: string, child: React.ReactNode, o?: { required?: boolean; full?: boolean; hint?: string }) => (
    <Field label={label} required={o?.required} full={o?.full} hint={o?.hint} error={errs[k]}>{child}</Field>
  );

  return (
    <Modal open={open} onClose={onClose} xl title={customer ? `Edit ${customer.name}` : "New Customer"} subtitle={`${customer?.code ?? "Code assigned on save"} · fields marked * are required`} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : customer ? "Save customer" : "Create customer"}</button>
      </>
    }>
      <div className="form-section"><h4>Basic information</h4><p>Legal identity as per FBR registration</p></div>
      <div className="form-grid c3">
        {F("name", "Customer name", input("name", "e.g. Nestlé Pakistan Ltd"), { required: true })}
        {F("displayName", "Display / short name", input("displayName", "Nestlé"))}
        {F("customerType", "Customer type", select("customerType", TYPES, "CustomerType"))}
        {F("customerGroupId", "Customer group", ref("customerGroupId", opts.groups, "(none)", customer?.group))}
        {F("salesRepUserId", "Sales rep", ref("salesRepUserId", opts.salesReps, "(none)", customer?.salesRep))}
        {F("branchId", "Branch", ref("branchId", opts.branches, "(all branches)", customer?.branch))}
        {F("code", "Customer code", input("code", "Next free CUST-0000"), { hint: customer ? undefined : "Leave blank for the next free code" })}
        {F("customerSince", "Customer since", input("customerSince", undefined, { type: "date" }))}
        {F("customerChannel", "Channel", select("customerChannel", ["STANDARD", "WHOLESALE"], "CustomerChannel"))}
      </div>

      <div className="form-section"><h4>Tax registration</h4><p>Determines further tax and WHT treatment</p></div>
      <div className="form-grid c3">
        {F("ntn", "NTN", input("ntn", "1234567-8"))}
        {F("cnic", "CNIC (individuals)", input("cnic", "35202-1234567-1"))}
        {F("strn", "STRN", input("strn", "03-04-1234-567-89"))}
        {F("atlStatus", "ATL status", select("atlStatus", ["ACTIVE", "NOT_ON_ATL"], "CustomerAtlStatus"))}
        {b("deductsWht") && F("whtSection", "WHT section", select("whtSection", WHT, "DefaultWhtSection", "(choose)"))}
        {b("deductsWht") && F("whtRate", "WHT rate (%)", input("whtRate", "e.g. 4", { inputMode: "decimal" }))}
        <Check label="Sales-tax registered" checked={b("isSalesTaxRegistered")} onChange={(e) => set("isSalesTaxRegistered", e.target.checked)} />
        <Check label="Apply further tax 4%" checked={b("applyFurtherTax")} onChange={(e) => set("applyFurtherTax", e.target.checked)} />
        <Check label="Customer deducts WHT u/s 153" checked={b("deductsWht")} onChange={(e) => set("deductsWht", e.target.checked)} />
        <Check label="GST exempt / zero-rated" checked={b("isGstExempt")} onChange={(e) => set("isGstExempt", e.target.checked)} />
      </div>

      <div className="form-section"><h4>Contact &amp; address</h4></div>
      <div className="form-grid c3">
        {F("contactPerson", "Contact person", input("contactPerson", "Full name"))}
        {F("mobile", "Mobile", input("mobile", "0300-0000000"))}
        {F("email", "Accounts email", input("email", "accounts@company.pk"))}
        {F("billingAddress", "Billing address", input("billingAddress", "Street, area"), { full: true })}
        {F("area", "Area", input("area", "e.g. Gulberg III"))}
        {F("city", "City", <><input value={s("city")} list="cust-cities" placeholder="e.g. Lahore" onChange={(e) => set("city", e.target.value)} /><datalist id="cust-cities">{CITIES.map((c) => <option key={c}>{c}</option>)}</datalist></>)}
        {F("province", "Province", select("province", PROVINCES, "Province", "(choose)"))}
        {F("phone", "Phone", input("phone", "042-35761190"))}
        <Check full label="Shipping same as billing" checked={b("shippingSameAsBilling")} onChange={(e) => set("shippingSameAsBilling", e.target.checked)} />
        {!b("shippingSameAsBilling") && F("shippingAddress", "Shipping address", input("shippingAddress", "Delivery address"), { full: true })}
      </div>

      <div className="form-section"><h4>Credit &amp; accounting</h4></div>
      <div className="form-grid c3">
        {F("creditLimit", "Credit limit (Rs)", input("creditLimit", "0", { inputMode: "decimal" }))}
        {F("paymentTerms", "Payment terms", select("paymentTerms", TERMS, "CustomerPaymentTerms"))}
        {F("creditDays", "Credit days", input("creditDays", "30", { inputMode: "numeric" }))}
        {F("priceListId", "Price list", ref("priceListId", opts.priceLists, "(group's or company default)", customer?.priceList))}
        {F("receivableAccountId", "Receivable account", ref("receivableAccountId", opts.accounts, "(company default)", customer?.receivableAccount ? { id: customer.receivableAccount.id, name: `${customer.receivableAccount.code} ${customer.receivableAccount.name}` } : null))}
        <Check label="Block sales when over limit" checked={b("blockOverLimit")} onChange={(e) => set("blockOverLimit", e.target.checked)} />
        <Check label="Send automatic reminders" checked={b("autoReminders")} onChange={(e) => set("autoReminders", e.target.checked)} />
      </div>

      {(form.customerType === "INDIVIDUAL" || !!customer?.guarantorName) && (
        <>
          <div className="form-section"><h4>Guarantor</h4><p>For credit to individuals</p></div>
          <div className="form-grid c3">
            {F("guarantorName", "Guarantor name", input("guarantorName"))}
            {F("guarantorFatherName", "Father's name", input("guarantorFatherName"))}
            {F("guarantorCnic", "Guarantor CNIC", input("guarantorCnic", "35202-1234567-1"))}
            {F("guarantorPhone", "Guarantor phone", input("guarantorPhone", "0300-0000000"))}
            {F("guarantorAddress", "Guarantor address", input("guarantorAddress"), { full: true })}
          </div>
        </>
      )}
    </Modal>
  );
}
