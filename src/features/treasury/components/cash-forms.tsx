"use client";

import { History, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Account, CashAccount, CashCategory, ExpenseCategory, LookupsResponse } from "@/shared";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { lookupOptions } from "@/features/settings/use-lookups";
import {
  createCashAccount, createCashCategory, createExpenseCategory, deleteCash, setCashActive, updateCashAccount, updateCashCategory, updateExpenseCategory,
  type BranchOption,
  type CashResource,
} from "../api";
import { AccountOptions, apiFieldErrors, apiMessage } from "./treasury-ui";

type Can = { create: boolean; edit: boolean; remove: boolean };
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/,/g, "")));
const opts = (lookups: LookupsResponse, type: string, current: string | null) => lookupOptions(lookups, type, current).map((o) => <option key={o.code} value={o.code}>{o.label}</option>);

/**
 * Drawer shell shared by the three Cash Setup forms (no template: the template's drawer, form grid and buttons).
 * Footer: delete / activate-deactivate / history on edit, then save.
 */
function SetupDrawer({ open, onClose, title, subtitle, resource, row, can, busy, onSave, onDone, children }: {
  open: boolean; onClose: () => void; title: string; subtitle: string; resource: CashResource; row: { id: string; isActive: boolean; rowVersion: number; name: string } | null;
  can: Can; busy: boolean; onSave: () => void; onDone: () => void; children: ReactNode;
}) {
  const toast = useToast();
  const [history, setHistory] = useState(false);
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast(label, { tone: "good" });
      onDone();
    } catch (e) {
      toast(apiMessage(e, "Could not update"), { tone: "danger" });
    }
  };
  const table = resource === "accounts" ? "CashAccounts" : resource === "categories" ? "CashCategories" : "ExpenseCategories";
  return (
    <Drawer open={open} onClose={() => { setHistory(false); onClose(); }} title={title} subtitle={subtitle} foot={
      <>
        {row && (
          <span className="row" style={{ marginRight: "auto", gap: 6 }}>
            <button type="button" className="btn ghost" onClick={() => setHistory((h) => !h)}><History />{history ? "Form" : "History"}</button>
            {can.edit && <button type="button" className="btn ghost" onClick={() => run(`${row.name} ${row.isActive ? "deactivated" : "activated"}`, () => setCashActive(resource, row.id, !row.isActive, row.rowVersion))}>{row.isActive ? "Deactivate" : "Activate"}</button>}
            {can.remove && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => run(`${row.name} deleted`, () => deleteCash(resource, row.id, row.rowVersion))}><Trash2 />Delete</button>}
          </span>
        )}
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        {(row ? can.edit : can.create) && !history && <button type="button" className="btn primary" onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save"}</button>}
      </>
    }>
      {row && history ? <HistoryTab schema="BankCash" table={table} id={row.id} /> : children}
    </Drawer>
  );
}

function useSave(onDone: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const save = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setErrs({});
    try {
      await fn();
      toast(label, { tone: "good" });
      onDone();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return { busy, errs, save, setErrs };
}

// ---------------------------------------------------------------- Cash account
type AccountForm = { name: string; shortName: string; kind: string; branchId: string; custodianUserId: string; imprestAmount: string; varianceTolerance: string; approvalThreshold: string; glAccountId: string };

export function CashAccountDrawer({ edit, onClose, onDone, branches, users, accounts, lookups, can }: {
  edit: CashAccount | "new" | null; onClose: () => void; onDone: () => void; branches: BranchOption[]; users: { id: string; name: string }[]; accounts: Account[]; lookups: LookupsResponse; can: Can;
}) {
  const row = edit && edit !== "new" ? edit : null;
  const [form, setForm] = useState<AccountForm | null>(null);
  const [prev, setPrev] = useState(edit);
  const { busy, errs, save, setErrs } = useSave(onDone);
  if (edit !== prev) {
    setPrev(edit);
    setErrs({});
    setForm(edit ? {
      name: row?.name ?? "", shortName: row?.shortName ?? "", kind: row?.kind ?? "DRAWER", branchId: row?.branch.id ?? branches[0]?.id ?? "", custodianUserId: row?.custodian?.id ?? "",
      imprestAmount: row?.imprestAmount?.toString() ?? "", varianceTolerance: String(row?.varianceTolerance ?? 1000), approvalThreshold: String(row?.approvalThreshold ?? 50000), glAccountId: "",
    } : null);
  }
  const set = <K extends keyof AccountForm>(k: K, v: AccountForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const submit = () => {
    if (!form) return;
    const body = {
      name: form.name, shortName: form.shortName || null, kind: form.kind, branchId: form.branchId, custodianUserId: form.custodianUserId || null,
      imprestAmount: num(form.imprestAmount), varianceTolerance: num(form.varianceTolerance) ?? 0, approvalThreshold: num(form.approvalThreshold) ?? 0,
    };
    save(row ? `${form.name} saved` : `${form.name} added`, () =>
      row ? updateCashAccount(row.id, { ...body, rowVersion: row.rowVersion }) : createCashAccount({ ...body, gl: form.glAccountId ? { mode: "link", accountId: form.glAccountId } : { mode: "create" } }));
  };
  const petty = form?.kind === "PETTY" || form?.kind === "IMPREST";
  return (
    <SetupDrawer open={!!edit} onClose={onClose} onDone={onDone} title={row ? row.name : "New cash account"} subtitle={row ? `${row.code} · ${row.account.name}` : "A drawer, counter or petty cash fund with its own GL account"}
      resource="accounts" row={row} can={can} busy={busy} onSave={submit}>
      {form && (
        <FormGrid>
          <Field label="Name" required full error={errs.name}><input value={form.name} autoFocus placeholder="e.g. Cash counter — Karachi" onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Short name" error={errs.shortName}><input value={form.shortName} placeholder="e.g. Karachi counter" onChange={(e) => set("shortName", e.target.value)} /></Field>
          <Field label="Kind" error={errs.kind}><select value={form.kind} onChange={(e) => set("kind", e.target.value)}>{opts(lookups, "CashAccountKind", form.kind)}</select></Field>
          <Field label="Branch" required error={errs.branchId}>
            <select value={form.branchId} onChange={(e) => set("branchId", e.target.value)}><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </Field>
          <Field label="Custodian" error={errs.custodianUserId} hint="Who counts and closes this cash">
            <select value={form.custodianUserId} onChange={(e) => set("custodianUserId", e.target.value)}>
              <option value="">No custodian</option>
              {[...(row?.custodian && !users.some((u) => u.id === row.custodian!.id) ? [row.custodian] : []), ...users].map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {petty && <Field label="Imprest amount (Rs)" required error={errs.imprestAmount}><input inputMode="decimal" value={form.imprestAmount} placeholder="e.g. 50,000" onChange={(e) => set("imprestAmount", e.target.value)} /></Field>}
          <Field label="Day-close variance tolerance (Rs)" error={errs.varianceTolerance}><input inputMode="decimal" value={form.varianceTolerance} onChange={(e) => set("varianceTolerance", e.target.value)} /></Field>
          <Field label="Payments above need approval (Rs)" error={errs.approvalThreshold}><input inputMode="decimal" value={form.approvalThreshold} onChange={(e) => set("approvalThreshold", e.target.value)} /></Field>
          {row ? (
            <Field label="GL account" hint="Fixed once the cash account exists; the code follows it"><input value={`${row.account.code} ${row.account.name}`} readOnly /></Field>
          ) : (
            <Field label="GL account" error={errs.gl} hint={form.glAccountId ? "Only unused asset accounts can be linked" : "A new postable account is created under 1110 Cash & bank"}>
              <select value={form.glAccountId} onChange={(e) => set("glAccountId", e.target.value)}>
                <option value="">Create a new GL account</option>
                <AccountOptions accounts={accounts} classes={[1]} empty={null} />
              </select>
            </Field>
          )}
          <Field label="Opening balance" hint="Opening balances are posted with the opening entry (Phase 16)"><input value="0.00" disabled /></Field>
        </FormGrid>
      )}
    </SetupDrawer>
  );
}

// ---------------------------------------------------------------- Cash category
type CategoryForm = { code: string; name: string; direction: string; voucherType: string; defaultAccountId: string; partyKind: string; sortOrder: string };

export function CashCategoryDrawer({ edit, onClose, onDone, accounts, lookups, can }: {
  edit: CashCategory | "new" | null; onClose: () => void; onDone: () => void; accounts: Account[]; lookups: LookupsResponse; can: Can;
}) {
  const row = edit && edit !== "new" ? edit : null;
  const [form, setForm] = useState<CategoryForm | null>(null);
  const [prev, setPrev] = useState(edit);
  const { busy, errs, save, setErrs } = useSave(onDone);
  if (edit !== prev) {
    setPrev(edit);
    setErrs({});
    setForm(edit ? {
      code: row?.code ?? "", name: row?.name ?? "", direction: row?.direction ?? "OUT", voucherType: row?.voucherType ?? "CPV",
      defaultAccountId: row?.defaultAccount?.id ?? "", partyKind: row?.partyKind ?? "NONE", sortOrder: String(row?.sortOrder ?? 0),
    } : null);
  }
  const set = <K extends keyof CategoryForm>(k: K, v: CategoryForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const submit = () => {
    if (!form) return;
    const body = { ...form, defaultAccountId: form.defaultAccountId || null, sortOrder: Number(form.sortOrder) || 0 };
    save(row ? `${form.name} saved` : `${form.name} added`, () => (row ? updateCashCategory(row.id, { ...body, rowVersion: row.rowVersion }) : createCashCategory(body)));
  };
  return (
    <SetupDrawer open={!!edit} onClose={onClose} onDone={onDone} title={row ? row.name : "New cash category"} subtitle="What a cash book entry is for, and where it posts by default"
      resource="categories" row={row} can={{ ...can, remove: can.remove && !row?.isSystem }} busy={busy} onSave={submit}>
      {form && (
        <FormGrid>
          <Field label="Name" required error={errs.name}><input value={form.name} autoFocus placeholder="e.g. Customer receipt" onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Code" required error={errs.code}><input value={form.code} disabled={row?.isSystem} placeholder="e.g. CUSTOMER_RECEIPT" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
          <Field label="Direction" error={errs.direction}><select value={form.direction} onChange={(e) => set("direction", e.target.value)}>{opts(lookups, "CashCategoryDirection", form.direction)}</select></Field>
          <Field label="Voucher type" error={errs.voucherType}><select value={form.voucherType} onChange={(e) => set("voucherType", e.target.value)}>{opts(lookups, "CashCategoryVoucherType", form.voucherType)}</select></Field>
          <Field label="Default account" error={errs.defaultAccountId} hint="Pre-filled on the entry; can be changed">
            <select value={form.defaultAccountId} onChange={(e) => set("defaultAccountId", e.target.value)}><AccountOptions accounts={accounts} current={row?.defaultAccount} empty="None" /></select>
          </Field>
          <Field label="Party" error={errs.partyKind}><select value={form.partyKind} onChange={(e) => set("partyKind", e.target.value)}>{opts(lookups, "PartyKind", form.partyKind)}</select></Field>
          <Field label="Sort order" error={errs.sortOrder}><input inputMode="numeric" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
        </FormGrid>
      )}
    </SetupDrawer>
  );
}

// ---------------------------------------------------------------- Expense category
type ExpenseForm = { code: string; name: string; appliesTo: string; accountId: string; limitAmount: string; limitPeriod: string; requiresPreApproval: boolean; receiptRequired: boolean; submitWithinDays: string; sortOrder: string };

export function ExpenseCategoryDrawer({ edit, onClose, onDone, accounts, lookups, can }: {
  edit: ExpenseCategory | "new" | null; onClose: () => void; onDone: () => void; accounts: Account[]; lookups: LookupsResponse; can: Can;
}) {
  const row = edit && edit !== "new" ? edit : null;
  const [form, setForm] = useState<ExpenseForm | null>(null);
  const [prev, setPrev] = useState(edit);
  const { busy, errs, save, setErrs } = useSave(onDone);
  if (edit !== prev) {
    setPrev(edit);
    setErrs({});
    setForm(edit ? {
      code: row?.code ?? "", name: row?.name ?? "", appliesTo: row?.appliesTo ?? "BOTH", accountId: row?.account.id ?? "", limitAmount: row?.limitAmount?.toString() ?? "",
      limitPeriod: row?.limitPeriod ?? "", requiresPreApproval: row?.requiresPreApproval ?? false, receiptRequired: row?.receiptRequired ?? true,
      submitWithinDays: row?.submitWithinDays?.toString() ?? "", sortOrder: String(row?.sortOrder ?? 0),
    } : null);
  }
  const set = <K extends keyof ExpenseForm>(k: K, v: ExpenseForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const submit = () => {
    if (!form) return;
    const body = {
      code: form.code, name: form.name, appliesTo: form.appliesTo, accountId: form.accountId, limitAmount: num(form.limitAmount), limitPeriod: form.limitPeriod || null,
      requiresPreApproval: form.requiresPreApproval, receiptRequired: form.receiptRequired, submitWithinDays: num(form.submitWithinDays), sortOrder: Number(form.sortOrder) || 0,
    };
    save(row ? `${form.name} saved` : `${form.name} added`, () => (row ? updateExpenseCategory(row.id, { ...body, rowVersion: row.rowVersion }) : createExpenseCategory(body)));
  };
  return (
    <SetupDrawer open={!!edit} onClose={onClose} onDone={onDone} title={row ? row.name : "New expense category"} subtitle="Used on expense claims and petty cash vouchers"
      resource="expense-categories" row={row} can={can} busy={busy} onSave={submit}>
      {form && (
        <FormGrid>
          <Field label="Name" required error={errs.name}><input value={form.name} autoFocus placeholder="e.g. Travel & conveyance" onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Code" required error={errs.code}><input value={form.code} placeholder="e.g. TRAVEL" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
          <Field label="Used on" error={errs.appliesTo}><select value={form.appliesTo} onChange={(e) => set("appliesTo", e.target.value)}>{opts(lookups, "ExpenseCategoryAppliesTo", form.appliesTo)}</select></Field>
          <Field label="Expense account" required error={errs.accountId}>
            <select value={form.accountId} onChange={(e) => set("accountId", e.target.value)}><AccountOptions accounts={accounts} classes={[5]} current={row?.account} /></select>
          </Field>
          <Field label="Limit (Rs)" error={errs.limitAmount}><input inputMode="decimal" value={form.limitAmount} placeholder="No limit" onChange={(e) => set("limitAmount", e.target.value)} /></Field>
          <Field label="Limit per" error={errs.limitPeriod}>
            <select value={form.limitPeriod} onChange={(e) => set("limitPeriod", e.target.value)}><option value="">—</option>{opts(lookups, "LimitPeriod", form.limitPeriod || null)}</select>
          </Field>
          <Field label="Submit within (days)" error={errs.submitWithinDays}><input inputMode="numeric" value={form.submitWithinDays} placeholder="Any time" onChange={(e) => set("submitWithinDays", e.target.value)} /></Field>
          <Field label="Sort order" error={errs.sortOrder}><input inputMode="numeric" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
          <Check label="Receipt required" checked={form.receiptRequired} onChange={(e) => set("receiptRequired", e.target.checked)} />
          <Check label="Needs pre-approval" checked={form.requiresPreApproval} onChange={(e) => set("requiresPreApproval", e.target.checked)} />
        </FormGrid>
      )}
    </SetupDrawer>
  );
}
