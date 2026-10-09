"use client";

import { Tag } from "lucide-react";
import { useState } from "react";
import { BANK_TXN_CATEGORIES, type BankingOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { Money } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";

/** Bank transaction statuses (template badges: Reconciled good, Uncategorised warn, Unpresented info). */
export const TXN_STATUS: Record<string, { tone: Tone; label: string }> = {
  UNCATEGORISED: { tone: "warn", label: "Uncategorised" },
  PENDING: { tone: "neutral", label: "Pending" },
  UNPRESENTED: { tone: "info", label: "Unpresented" },
  UNCLEARED: { tone: "neutral", label: "Uncleared" },
  CLEARED: { tone: "lime", label: "Cleared" },
  RECONCILED: { tone: "good", label: "Reconciled" },
};
export const TxnStatus = ({ status }: { status: string }) => {
  const s = TXN_STATUS[status] ?? { tone: "neutral" as Tone, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

export const CATEGORY_LABEL: Record<string, string> = {
  CUSTOMER_RECEIPT: "Customer receipt", VENDOR_PAYMENT: "Vendor payment", BANK_CHARGES: "Bank charges", PROFIT_ON_DEPOSIT: "Profit on deposit",
  MARKUP_EXPENSE: "Markup expense", CASH_DEPOSIT: "Cash deposit", CASH_WITHDRAWAL: "Cash withdrawal", TRANSFER: "Transfer", PAYROLL: "Payroll",
  TAX_PAYMENT: "Tax payment", LOAN: "Loan", OTHER: "Other",
};

/** The template's quick categories and the posting role (default account) behind each; null = choose the account. */
export const QUICK_CATEGORIES: { category: (typeof BANK_TXN_CATEGORIES)[number]; label: string; role: string | null }[] = [
  { category: "BANK_CHARGES", label: "Bank charges", role: "BANK_CHARGES" },
  { category: "PROFIT_ON_DEPOSIT", label: "Profit on deposit", role: "PROFIT_ON_DEPOSIT" },
  { category: "MARKUP_EXPENSE", label: "Markup expense", role: null },
  { category: "CUSTOMER_RECEIPT", label: "Customer receipt", role: "AR_CONTROL" },
  { category: "VENDOR_PAYMENT", label: "Vendor payment", role: "AP_CONTROL" },
];

export const bankLabel = (b: { title: string; last4: string | null } | null | undefined) => (b ? `${b.title}${b.last4 ? ` — ${b.last4}` : ""}` : "—");
export const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
export const fieldErrors = (e: unknown): Record<string, string> =>
  e instanceof ApiError && e.details ? Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)])) : {};

export type CategoriseTarget = { description: string; amount: number; category: string | null; accountId: string | null };
export type CategoriseBody = { accountId: string; category: string | null; costCentreId: string | null; narration: string | null };

/** Choose the other side of the entry for a statement line: a BPV (money out) or BRV (money in) is raised against it. */
export function CategoriseModal({ target, options, onClose, onSave }: {
  target: CategoriseTarget | null; options: BankingOptions | null; onClose: () => void; onSave: (body: CategoriseBody) => Promise<void>;
}) {
  const [d, setD] = useState<CategoriseBody>({ accountId: "", category: null, costCentreId: null, narration: null });
  const [prev, setPrev] = useState<CategoriseTarget | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (target !== prev) {
    setPrev(target);
    setErrs({});
    setMsg(null);
    setD({ accountId: target?.accountId ?? "", category: target?.category ?? null, costCentreId: null, narration: null });
  }
  const out = (target?.amount ?? 0) < 0;
  const save = async () => {
    if (!d.accountId) return setErrs({ accountId: "Choose the account" });
    setBusy(true);
    setErrs({});
    setMsg(null);
    try {
      await onSave(d);
    } catch (e) {
      setErrs(fieldErrors(e));
      setMsg(errMsg(e, "Could not categorise the line"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Categorise statement line"
      subtitle={out ? "Raises a bank payment voucher (BPV) for this withdrawal" : "Raises a bank receipt voucher (BRV) for this deposit"}
      foot={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" icon={<Tag />} onClick={save} disabled={busy}>{busy ? "Saving…" : "Categorise"}</Button></>}
    >
      {target && (
        <div className="cb-vv-amt" style={{ marginBottom: 14 }}>
          <small>{out ? "Withdrawal" : "Deposit"}</small>
          <b className={out ? "cr" : "dr"}><Money value={Math.abs(target.amount)} /></b>
          <span className="muted small" style={{ width: "100%" }}>{target.description}</span>
        </div>
      )}
      {msg && <p className="text-danger small" role="alert" style={{ margin: "0 0 10px" }}>{msg}</p>}
      <FormGrid>
        <Field label="Account" required error={errs.accountId} full>
          <Select value={d.accountId} onChange={(e) => setD({ ...d, accountId: e.target.value })}>
            <option value="">Choose…</option>
            {options?.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </Select>
        </Field>
        <Field label="Category" error={errs.category}>
          <Select value={d.category ?? ""} onChange={(e) => setD({ ...d, category: e.target.value || null })}>
            <option value="">(none)</option>
            {BANK_TXN_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Cost centre" error={errs.costCentreId}>
          <Select value={d.costCentreId ?? ""} onChange={(e) => setD({ ...d, costCentreId: e.target.value || null })}>
            <option value="">(none)</option>
            {options?.costCentres.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </Select>
        </Field>
        <Field label="Narration" error={errs.narration} hint="Defaults to the statement description" full>
          <Input value={d.narration ?? ""} maxLength={300} placeholder={target?.description} onChange={(e) => setD({ ...d, narration: e.target.value || null })} />
        </Field>
      </FormGrid>
      <p className="muted small" style={{ margin: "12px 0 0" }}>The voucher posts at once, or waits in the approval inbox when an approval workflow covers it.</p>
    </Modal>
  );
}
