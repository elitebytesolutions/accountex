"use client";

import { Plus } from "lucide-react";
import type { Account, Bank, BankAccount, LookupsResponse } from "@/shared";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { lookupOptions } from "@/features/settings/use-lookups";
import type { BranchOption, CurrencyOption } from "../api";
import { AccountOptions } from "./treasury-ui";

export type BankAccountForm = {
  bankId: string;
  branchId: string;
  accountType: string;
  accountTitle: string;
  accountNo: string;
  iban: string;
  bankBranch: string;
  currencyCode: string;
  creditLimit: string;
  markupTerms: string;
  purpose: string;
  statementImportEnabled: boolean;
  statementFormat: string;
  useForPayroll: boolean;
  glMode: "create" | "link";
  glAccountId: string;
};

export const blankBankAccount = (branchId: string): BankAccountForm => ({
  bankId: "", branchId, accountType: "CURRENT", accountTitle: "", accountNo: "", iban: "", bankBranch: "", currencyCode: "PKR", creditLimit: "",
  markupTerms: "", purpose: "GENERAL", statementImportEnabled: true, statementFormat: "", useForPayroll: false, glMode: "create", glAccountId: "",
});

export const toBankAccountForm = (a: BankAccount): BankAccountForm => ({
  bankId: a.bank.id, branchId: a.branch.id, accountType: a.accountType, accountTitle: a.accountTitle, accountNo: a.accountNo, iban: a.iban ?? "",
  bankBranch: a.bankBranch ?? "", currencyCode: a.currencyCode, creditLimit: a.creditLimit?.toString() ?? "", markupTerms: a.markupTerms ?? "",
  purpose: a.purpose, statementImportEnabled: a.statementImportEnabled, statementFormat: a.statementFormat ?? "", useForPayroll: a.useForPayroll,
  glMode: "link", glAccountId: a.account.id,
});

/** Request body fields shared by create and update. */
export const bankAccountBody = (f: BankAccountForm) => ({
  branchId: f.branchId, accountType: f.accountType, accountTitle: f.accountTitle, accountNo: f.accountNo, iban: f.iban || null, bankBranch: f.bankBranch || null,
  currencyCode: f.currencyCode, creditLimit: f.creditLimit.trim() ? Number(f.creditLimit.replace(/,/g, "")) : null, markupTerms: f.markupTerms || null,
  purpose: f.purpose, statementImportEnabled: f.statementImportEnabled, statementFormat: f.statementFormat || null, useForPayroll: f.useForPayroll,
});

/** Template acc-new-bank fields (40-acc-core.html), plus branch, purpose, currency and the GL link choice. */
export function BankAccountFields({ form, set, errs, banks, branches, currencies, accounts, lookups, existing, readOnly, onAddBank }: {
  form: BankAccountForm;
  set: <K extends keyof BankAccountForm>(k: K, v: BankAccountForm[K]) => void;
  errs: Record<string, string>;
  banks: Bank[];
  branches: BranchOption[];
  currencies: CurrencyOption[];
  accounts: Account[];
  lookups: LookupsResponse;
  existing: BankAccount | null;
  readOnly?: boolean;
  onAddBank?: () => void;
}) {
  const sel = (k: "accountType" | "purpose" | "statementFormat", type: string, empty?: string) => (
    <select value={form[k]} disabled={readOnly} onChange={(e) => set(k, e.target.value)}>
      {empty !== undefined && <option value="">{empty}</option>}
      {lookupOptions(lookups, type, form[k] || null).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
    </select>
  );
  const freeAssets = accounts.filter((a) => a.accountClass === 1);
  return (
    <FormGrid>
      <Field label="Bank" required error={errs.bankId} hint={!existing && onAddBank ? <button type="button" className="link" onClick={onAddBank} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--primary)", fontWeight: 600 }}><Plus style={{ width: 12, height: 12, verticalAlign: -1 }} /> Add a bank that isn’t listed</button> : undefined}>
        <select value={form.bankId} disabled={!!existing || readOnly} onChange={(e) => set("bankId", e.target.value)}>
          <option value="">Choose…</option>
          {banks.filter((b) => b.isActive || b.id === form.bankId).map((b) => <option key={b.id} value={b.id}>{b.name}{b.isIslamic ? " · Islamic" : ""}</option>)}
        </select>
      </Field>
      <Field label="Account type" error={errs.accountType}>{sel("accountType", "AccountType")}</Field>
      <Field label="Account title" required error={errs.accountTitle}><input value={form.accountTitle} disabled={readOnly} placeholder="e.g. Al-Noor Enterprises (Pvt) Ltd" onChange={(e) => set("accountTitle", e.target.value)} /></Field>
      <Field label="Account number" required error={errs.accountNo}><input value={form.accountNo} disabled={readOnly} placeholder="0000-0000000-0" onChange={(e) => set("accountNo", e.target.value)} /></Field>
      <Field label="IBAN" error={errs.iban}><input value={form.iban} disabled={readOnly} placeholder="PK00XXXX0000000000000000" onChange={(e) => set("iban", e.target.value.toUpperCase())} /></Field>
      <Field label="Bank branch" error={errs.bankBranch}><input value={form.bankBranch} disabled={readOnly} placeholder="e.g. Mall Road, Lahore" onChange={(e) => set("bankBranch", e.target.value)} /></Field>
      <Field label="Our branch" required error={errs.branchId}>
        <select value={form.branchId} disabled={readOnly} onChange={(e) => set("branchId", e.target.value)}>
          <option value="">Choose…</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field label="Purpose" error={errs.purpose}>{sel("purpose", "BankAccountPurpose")}</Field>
      <Field label="Currency" error={errs.currencyCode}>
        <select value={form.currencyCode} disabled={!!existing || readOnly} onChange={(e) => set("currencyCode", e.target.value)}>
          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
      </Field>
      {form.accountType === "RUNNING_FINANCE" && (
        <>
          <Field label="Running-finance limit (Rs)" required error={errs.creditLimit}><input inputMode="decimal" value={form.creditLimit} disabled={readOnly} onChange={(e) => set("creditLimit", e.target.value)} /></Field>
          <Field label="Markup terms" error={errs.markupTerms}><input value={form.markupTerms} disabled={readOnly} placeholder="e.g. 3M KIBOR + 1.5%" onChange={(e) => set("markupTerms", e.target.value)} /></Field>
        </>
      )}
      {existing ? (
        <Field label="GL code" hint="The GL account is fixed once the bank account exists"><input value={`${existing.account.code} ${existing.account.name}`} readOnly /></Field>
      ) : (
        <Field label="GL account" error={errs.gl} hint={form.glMode === "create" ? "A new postable account is created under 1110 Cash & bank" : "Only unused asset accounts can be linked"}>
          <select value={form.glMode === "create" ? "" : form.glAccountId} onChange={(e) => (e.target.value ? (set("glMode", "link"), set("glAccountId", e.target.value)) : set("glMode", "create"))}>
            <option value="">Create a new GL account</option>
            <AccountOptions accounts={freeAssets} empty={null} />
          </select>
        </Field>
      )}
      <Field label="Opening balance" hint="Opening balances are posted with the opening entry (Phase 16)"><input value="0.00" disabled /></Field>
      <Field label="Statement format" error={errs.statementFormat}>{sel("statementFormat", "StatementFormat", "Not set")}</Field>
      <Check label="Enable statement import (CSV / MT940)" checked={form.statementImportEnabled} disabled={readOnly} onChange={(e) => set("statementImportEnabled", e.target.checked)} />
      <Check label="Use for payroll disbursement" checked={form.useForPayroll} disabled={readOnly} onChange={(e) => set("useForPayroll", e.target.checked)} />
    </FormGrid>
  );
}
